/* ===== Prof. Baldemar — Herramientas e interacción ===== */
let act = null;          // current interaction
let spaceDown = false;

function initTools() {
  cv.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; updateCursor(); } });
  cv.addEventListener('contextmenu', onContext);
}

function curSize() { return SIZES[WB.size]; }

function onDown(e) {
  if (e.button === 2) return;             // context handled separately
  closeMenus();
  const p = { x: e.clientX, y: e.clientY };
  const w = toWorld(p.x, p.y);
  const panning = e.button === 1 || spaceDown || WB.tool === 'hand';

  if (panning) { act = { mode: 'pan', sx: p.x, sy: p.y, cx: WB.cam.x, cy: WB.cam.y }; updateCursor('grabbing'); return; }

  switch (WB.tool) {
    case 'select': return startSelect(p, w, e);
    case 'draw': act = { mode: 'create', shape: { id: uid(), type: 'draw', points: [w], color: WB.color, size: curSize() } }; WB.draft = act.shape; break;
    case 'highlight': act = { mode: 'create', shape: { id: uid(), type: 'highlight', points: [w], color: WB.color === '#1d2128' ? '#ffd43b' : WB.color, size: curSize() } }; WB.draft = act.shape; break;
    case 'eraser': act = { mode: 'erase' }; eraseAt(w); break;
    case 'line': case 'arrow':
      act = { mode: 'create', shape: { id: uid(), type: WB.tool, x1: w.x, y1: w.y, x2: w.x, y2: w.y, color: WB.color, size: curSize() } }; WB.draft = act.shape; break;
    case 'rect': case 'ellipse': case 'diamond': case 'triangle':
      act = { mode: 'create', shape: { id: uid(), type: WB.tool, x: w.x, y: w.y, w: 0, h: 0, color: WB.color, size: curSize(), fill: WB.fillEnabled }, ox: w.x, oy: w.y }; WB.draft = act.shape; break;
    case 'laser': act = { mode: 'laser' }; addLaser(w); break;
    case 'text': placeText(w); break;
    case 'sticky': placeSticky(w); break;
    case 'image': document.getElementById('imgInput').click(); WB._pendingImgAt = w; break;
  }
}

function onMove(e) {
  const p = { x: e.clientX, y: e.clientY };
  // live cursor broadcast (for presenter / Directus realtime)
  WB._cursor = toWorld(p.x, p.y);
  if (!act) return;
  const w = toWorld(p.x, p.y);
  switch (act.mode) {
    case 'pan': WB.cam.x = act.cx + (p.x - act.sx); WB.cam.y = act.cy + (p.y - act.sy); break;
    case 'create': {
      const s = act.shape;
      if (s.type === 'draw' || s.type === 'highlight') s.points.push(w);
      else if (s.type === 'line' || s.type === 'arrow') {
        s.x2 = w.x; s.y2 = w.y;
        if (e.shiftKey) { const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1); const d = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); const sn = Math.round(a / (Math.PI / 4)) * (Math.PI / 4); s.x2 = s.x1 + Math.cos(sn) * d; s.y2 = s.y1 + Math.sin(sn) * d; }
      } else {
        let nw = w.x - act.ox, nh = w.y - act.oy;
        if (e.shiftKey) { const m = Math.max(Math.abs(nw), Math.abs(nh)); nw = Math.sign(nw || 1) * m; nh = Math.sign(nh || 1) * m; }
        s.x = Math.min(act.ox, act.ox + nw); s.y = Math.min(act.oy, act.oy + nh); s.w = Math.abs(nw); s.h = Math.abs(nh);
      }
      break;
    }
    case 'erase': eraseAt(w); break;
    case 'laser': addLaser(w); break;
    case 'marquee': act.rect.w = w.x - act.rect.x; act.rect.h = w.y - act.rect.y; WB.marquee = act.rect; break;
    case 'move': WB.sel.forEach(s => translateShape(s, w.x - act.lx, w.y - act.ly)); act.lx = w.x; act.ly = w.y; act.moved = true; break;
    case 'resize': doResize(act, w, e.shiftKey); act.moved = true; break;
    case 'endpoint': { const s = selOne(); if (act.end === 1) { s.x1 = w.x; s.y1 = w.y; } else { s.x2 = w.x; s.y2 = w.y; } break; }
  }
}

function onUp() {
  if (!act) return;
  if (act.mode === 'create') {
    const s = act.shape; WB.draft = null;
    const b = getBounds(s);
    const tiny = (s.type === 'draw' || s.type === 'highlight') ? s.points.length < 2 : (b.w < 3 && b.h < 3);
    if (!tiny) { WB.shapes.push(s); commit(); if (WB.tool === 'select') WB.sel = [s]; }
  } else if (act.mode === 'erase') { commit(); }
  else if (act.mode === 'marquee') {
    WB.sel = shapesInMarquee(act.rect); WB.marquee = null; updateProps();
  }
  else if ((act.mode === 'move' || act.mode === 'resize' || act.mode === 'endpoint') && act.moved !== false) { commit(); }
  if (act.mode === 'pan') updateCursor();
  act = null;
}

/* ---- select / move / resize ---- */
function startSelect(p, w, e) {
  // grab a handle on a single-selected shape?
  const one = selOne();
  if (one) {
    const hres = hitHandle(one, p);
    if (hres) {
      if (hres.type === 'endpoint') act = { mode: 'endpoint', end: hres.end, moved: true };
      else act = { mode: 'resize', corner: hres.corner, b0: { ...getBounds(one) }, fs0: one.fs, moved: true };
      return;
    }
  }
  const hit = hitTest(w.x, w.y);
  if (hit) {
    if (e && e.shiftKey) {                        // toggle in/out of selection
      if (WB.sel.includes(hit)) WB.sel = WB.sel.filter(s => s !== hit);
      else WB.sel = [...WB.sel, hit];
    } else if (!WB.sel.includes(hit)) {
      WB.sel = [hit];
    }
    if (WB.sel.length) {
      // Alt+drag = duplicate-and-drag
      if (e && e.altKey) {
        const copies = WB.sel.map(s => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); WB.shapes.push(c); return c; });
        WB.sel = copies;
      }
      act = { mode: 'move', lx: w.x, ly: w.y, moved: false };
    }
    updateProps();
  } else {
    if (!(e && e.shiftKey)) WB.sel = [];
    act = { mode: 'marquee', rect: { x: w.x, y: w.y, w: 0, h: 0 } };
    updateProps();
  }
}

function hitHandle(s, p) {
  const tol = 9;
  if (s.type === 'line' || s.type === 'arrow') {
    const a = toScreen(s.x1, s.y1), b = toScreen(s.x2, s.y2);
    if (Math.hypot(p.x - a.x, p.y - a.y) < tol) return { type: 'endpoint', end: 1 };
    if (Math.hypot(p.x - b.x, p.y - b.y) < tol) return { type: 'endpoint', end: 2 };
    return null;
  }
  if (s.type === 'draw' || s.type === 'highlight') return null;
  const bd = getBounds(s); const p1 = toScreen(bd.x, bd.y), p2 = toScreen(bd.x + bd.w, bd.y + bd.h);
  const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
  const handles = {
    nw: [p1.x - 4, p1.y - 4], ne: [p2.x + 4, p1.y - 4], sw: [p1.x - 4, p2.y + 4], se: [p2.x + 4, p2.y + 4],
    n: [cx, p1.y - 4], s: [cx, p2.y + 4], w: [p1.x - 4, cy], e: [p2.x + 4, cy]
  };
  for (const k in handles) if (Math.hypot(p.x - handles[k][0], p.y - handles[k][1]) < tol) return { type: 'corner', corner: k };
  return null;
}

function doResize(act, w, shift) {
  const s = selOne(); if (!s) return; const b = act.b0;
  const isCorner = act.corner.length === 2;
  if (s.type === 'text') {
    // corners → scale font size; middle east/west → adjust wrap width
    if (isCorner) {
      const sx = w.x - (b.x + (act.corner.includes('w') ? b.w : 0));
      const sy = w.y - (b.y + (act.corner.includes('n') ? b.h : 0));
      const dirX = act.corner.includes('w') ? -1 : 1, dirY = act.corner.includes('n') ? -1 : 1;
      const ratio = Math.max(0.2, Math.max(sx * dirX / Math.max(b.w, 30), sy * dirY / Math.max(b.h, 30)));
      s.fs = Math.max(8, Math.round((act.fs0 || s.fs) * ratio));
    } else if (act.corner === 'e' || act.corner === 'w') {
      const left = b.x, right = b.x + b.w;
      const nw = act.corner === 'w' ? right - w.x : w.x - left;
      s.w = Math.max(60, nw); s.auto = false;        // fixed width → text wraps
      if (act.corner === 'w') s.x = Math.min(w.x, right - 60);
    }
    return;
  }
  let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
  if (act.corner.includes('n')) y1 = w.y; if (act.corner.includes('s')) y2 = w.y;
  if (act.corner.includes('w')) x1 = w.x; if (act.corner.includes('e')) x2 = w.x;
  s.x = Math.min(x1, x2); s.y = Math.min(y1, y2); s.w = Math.max(2, Math.abs(x2 - x1)); s.h = Math.max(2, Math.abs(y2 - y1));
}

function eraseAt(w) {
  const hit = hitTest(w.x, w.y);
  if (hit) { WB.shapes = WB.shapes.filter(s => s !== hit); WB.sel = WB.sel.filter(s => s !== hit); }
}

/* ---- laser (temporal, no persiste) ---- */
function addLaser(w) { WB.laser.push({ x: w.x, y: w.y, t: performance.now() }); }
function drawLaser(ctx) {
  if (!WB.laser.length) return;
  const now = performance.now(); const life = 750;
  WB.laser = WB.laser.filter(p => now - p.t < life);
  if (WB.laser.length < 2) return;
  for (let i = 1; i < WB.laser.length; i++) {
    const a = WB.laser[i - 1], b = WB.laser[i];
    const alpha = 1 - (now - b.t) / life;
    ctx.strokeStyle = `rgba(224,56,62,${Math.max(0, alpha)})`;
    ctx.lineWidth = (3 + 5 * alpha) / WB.cam.z; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  const head = WB.laser[WB.laser.length - 1];
  ctx.fillStyle = 'rgba(224,56,62,.9)'; ctx.beginPath(); ctx.arc(head.x, head.y, 5 / WB.cam.z, 0, 6.2832); ctx.fill();
  ctx.shadowColor = 'rgba(224,56,62,.6)'; ctx.shadowBlur = 14 / WB.cam.z;
  ctx.beginPath(); ctx.arc(head.x, head.y, 5 / WB.cam.z, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
}

/* ---- text + sticky editors ---- */
function placeText(w, existing) {
  const ta = document.createElement('textarea');
  ta.className = 'editor';
  const fs = existing ? existing.fs : 28;
  const fixed = !!(existing && existing.w && !existing.auto);
  const align = (existing && existing.align) || WB.align;
  const x = existing ? existing.x : w.x, y = existing ? existing.y : w.y;   // top-left, world
  const anchor = toScreen(x, y);
  const fontPx = fs * WB.cam.z;
  Object.assign(ta.style, {
    left: anchor.x + 'px', top: anchor.y + 'px',
    fontSize: fontPx + 'px', lineHeight: '1.3',
    color: existing ? existing.color : WB.color, fontWeight: 600,
    fontFamily: `'${WB.font}', 'Poppins', sans-serif`,
    whiteSpace: fixed ? 'pre-wrap' : 'pre',
    textAlign: align,
    padding: '0', border: 'none', boxSizing: 'content-box',
    background: 'transparent', resize: 'none', overflow: 'hidden'
  });
  ta.value = existing ? existing.text : '';
  const grow = () => {
    ta.style.height = 'auto';
    if (fixed) { ta.style.width = existing.w * WB.cam.z + 'px'; }
    else {
      const widest = Math.max(...(ta.value || ' ').split('\n').map(l => measureLine(l, fs)));
      ta.style.width = Math.max(24, widest * WB.cam.z + 4) + 'px';
    }
    const lines = ta.value.split('\n').length;
    ta.style.height = Math.max(fontPx * 1.3 * lines, fontPx * 1.3) + 'px';
  };
  ta.addEventListener('input', grow);
  if (existing) WB.shapes = WB.shapes.filter(s => s !== existing);
  document.body.appendChild(ta); grow();
  const finish = () => {
    const v = ta.value.replace(/\s+$/, '');
    if (v) {
      const widest = Math.max(...ta.value.split('\n').map(l => measureLine(l, fs)), 10);
      WB.shapes.push({ id: existing ? existing.id : uid(), type: 'text', x, y, text: ta.value,
        color: existing ? existing.color : WB.color, fs, align,
        w: fixed ? existing.w : widest, auto: !fixed });
    }
    commit(); ta.remove(); if (WB.tool !== 'select') setActiveTool('select');
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.value = existing ? existing.text : ''; ta.blur(); } e.stopPropagation(); });
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.addEventListener('blur', finish); }, 0);
}

function measureLine(line, fs) {
  ctx.save(); ctx.font = fontStr(fs);
  const w = ctx.measureText(line || ' ').width; ctx.restore(); return w;
}

function placeSticky(w, existing) {
  const sw = existing ? existing.w : 190, sh = existing ? existing.h : 190;
  const color = existing ? existing.color : (WB._stickyColor || '#ffd43b');
  const x = existing ? existing.x : w.x, y = existing ? existing.y : w.y;
  const sc = toScreen(x, y);
  const ta = document.createElement('textarea');
  ta.className = 'editor sticky-editor';
  Object.assign(ta.style, {
    left: sc.x + 'px', top: sc.y + 'px',
    width: sw * WB.cam.z + 'px', height: sh * WB.cam.z + 'px',
    fontSize: 18 * WB.cam.z + 'px', background: color, color: '#2a2a25', fontWeight: 600,
    fontFamily: `'${WB.font}', 'Poppins', sans-serif`,
    display: 'flex', textAlign: (existing && existing.align) || 'center',
    padding: '14px', boxSizing: 'border-box'
  });
  ta.value = existing ? existing.text : '';
  if (existing) WB.shapes = WB.shapes.filter(s => s !== existing);
  document.body.appendChild(ta);
  const finish = () => {
    WB.shapes.push({ id: existing ? existing.id : uid(), type: 'sticky', x, y, w: sw, h: sh, text: ta.value, color, fs: 18, align: (existing && existing.align) || 'center' });
    commit(); ta.remove(); if (WB.tool !== 'select') setActiveTool('select');
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur(); e.stopPropagation(); });
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.addEventListener('blur', finish); }, 0);
}

/* Edit text inside a shape (rect/ellipse/diamond/triangle/line/arrow) */
function placeShapeText(shape) {
  const ta = document.createElement('textarea');
  ta.className = 'editor';
  const isLine = shape.type === 'line' || shape.type === 'arrow';
  const fs = shape.textFs || (isLine ? 18 : 28);
  let cxw, cyw, ww, hh;
  if (isLine) { cxw = (shape.x1 + shape.x2) / 2; cyw = (shape.y1 + shape.y2) / 2; ww = 160; hh = fs * 1.4; }
  else { cxw = shape.x + shape.w / 2; cyw = shape.y + shape.h / 2; ww = shape.w - 24; hh = shape.h - 24; }
  const sc = toScreen(cxw - ww / 2, cyw - hh / 2);
  Object.assign(ta.style, {
    left: sc.x + 'px', top: sc.y + 'px',
    width: ww * WB.cam.z + 'px', height: hh * WB.cam.z + 'px',
    fontSize: fs * WB.cam.z + 'px', lineHeight: '1.3',
    color: shape.textColor || '#1d2128', fontWeight: 600,
    fontFamily: `'${WB.font}', 'Poppins', sans-serif`,
    textAlign: shape.align || 'center', padding: '0',
    background: 'transparent', border: 'none', resize: 'none', overflow: 'hidden',
    display: 'flex', alignItems: 'center'
  });
  ta.value = shape.text || '';
  document.body.appendChild(ta);
  const finish = () => {
    shape.text = ta.value.trim();
    if (!shape.textFs) shape.textFs = fs;
    if (!shape.textColor) shape.textColor = '#1d2128';
    commit(); ta.remove();
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.value = shape.text || ''; ta.blur(); } e.stopPropagation(); });
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.addEventListener('blur', finish); }, 0);
}

/* ---- image placement ---- */
function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 360; let iw = img.width, ih = img.height; const sc = Math.min(max / iw, max / ih, 1);
      iw *= sc; ih *= sc;
      const at = WB._pendingImgAt || toWorld(W / 2, H / 2);
      WB.imageCache[reader.result] = img;
      WB.shapes.push({ id: uid(), type: 'image', x: at.x, y: at.y, w: iw, h: ih, src: reader.result });
      commit(); setActiveTool('select');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---- wheel: pan + zoom ---- */
function onWheel(e) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = Math.exp(-e.deltaY * 0.01);
    zoomAt(e.clientX, e.clientY, factor);
  } else {
    WB.cam.x -= e.deltaX; WB.cam.y -= e.deltaY;
  }
}
function zoomAt(sx, sy, factor) {
  const nz = Math.max(0.1, Math.min(8, WB.cam.z * factor));
  const wx = (sx - WB.cam.x) / WB.cam.z, wy = (sy - WB.cam.y) / WB.cam.z;
  WB.cam.z = nz; WB.cam.x = sx - wx * nz; WB.cam.y = sy - wy * nz;
  updateZoomLabel(); save();
}

/* ---- keyboard ---- */
function onKey(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { spaceDown = true; updateCursor(); e.preventDefault(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); WB.sel = [...WB.shapes]; updateProps(); return; }
  if (mod && e.key.toLowerCase() === 'd' && WB.sel.length) { e.preventDefault(); duplicateSelection(); return; }
  if (mod && e.key.toLowerCase() === 'c' && WB.sel.length) { WB.clipboard = WB.sel.map(s => JSON.parse(JSON.stringify(s))); return; }
  if (mod && e.key.toLowerCase() === 'x' && WB.sel.length) { WB.clipboard = WB.sel.map(s => JSON.parse(JSON.stringify(s))); WB.shapes = WB.shapes.filter(x => !WB.sel.includes(x)); WB.sel = []; commit(); return; }
  if (mod && e.key.toLowerCase() === 'v' && WB.clipboard.length) {
    const copies = WB.clipboard.map(s => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); translateShape(c, 24, 24); WB.shapes.push(c); return c; });
    WB.sel = copies; commit(); return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (WB.sel.length) { WB.shapes = WB.shapes.filter(s => !WB.sel.includes(s)); WB.sel = []; commit(); } return; }
  if (e.key === 'Escape') { WB.sel = []; closePopover(); setActiveTool('select'); return; }
  const map = { v: 'select', d: 'draw', p: 'draw', b: 'draw', h: 'highlight', e: 'eraser', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', t: 'text', n: 'sticky', x: 'laser', s: 'sticky', m: 'hand' };
  const k = e.key.toLowerCase();
  if (map[k] && !mod) setActiveTool(map[k]);
}
function duplicateSelection() {
  const copies = WB.sel.map(s => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); translateShape(c, 24, 24); WB.shapes.push(c); return c; });
  WB.sel = copies; commit();
}

/* ---- context menu ---- */
function onContext(e) {
  e.preventDefault();
  const w = toWorld(e.clientX, e.clientY);
  const hit = hitTest(w.x, w.y);
  if (hit) { if (!WB.sel.includes(hit)) WB.sel = [hit]; updateProps(); openContextMenu(e.clientX, e.clientY); }
}

/* ---- demo seed ---- */
function seedDemo(board) {
  WB.shapes = [
    { id: uid(), type: 'text', x: -250, y: -150, text: 'Pizarra del\nProf. Baldemar', color: '#1d2128', fs: 46, align: 'left' },
    { id: uid(), type: 'rect', x: -270, y: 30, w: 200, h: 110, color: '#2A6FDB', size: 4, fill: true, fillStyle: 'solid', text: 'Concepto A', align: 'center' },
    { id: uid(), type: 'arrow', x1: -60, y1: 85, x2: 90, y2: 85, color: '#1d2128', size: 4 },
    { id: uid(), type: 'ellipse', x: 100, y: 30, w: 180, h: 110, color: '#2f9e44', size: 4, fill: true, fillStyle: 'hatch', text: 'Resultado', align: 'center' },
    { id: uid(), type: 'sticky', x: 330, y: -10, w: 170, h: 170, text: 'Doble clic para editar', color: '#ffd43b', fs: 18, align: 'center' },
    { id: uid(), type: 'draw', points: spark(-250, 230), color: '#e0383e', size: 4 },
  ];
  WB.cam = { x: W / 2 - 60, y: H / 2 - 40, z: 1 };
  if (board) { board.shapes = WB.shapes; board.cam = WB.cam; }
}
function spark(x, y) {
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push({ x: x + t * 520, y: y + Math.sin(t * 9) * 26 * (1 - t) }); } return pts;
}
