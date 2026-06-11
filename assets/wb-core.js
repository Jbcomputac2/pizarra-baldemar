/* ===== Prof. Baldemar — Núcleo de la pizarra ===== */
const WB = {
  shapes: [],
  cam: { x: 0, y: 0, z: 1 },
  tool: 'select',
  color: '#1d2128',
  fillEnabled: false,
  fillStyle: 'solid',        // none | solid | hatch | cross | dots
  align: 'center',           // left | center | right
  size: 'm',                 // s | m | l | xl
  bg: 'dots',                // dots | grid | lines | blank
  theme: 'default',
  font: 'Times New Roman',
  sel: [],
  marquee: null,
  imageCache: {},
  laser: [],
  clipboard: [],
  _raf: null,
};

const SIZES = { s: 2, m: 4, l: 7, xl: 14 };
const PALETTE = ['#1d2128','#e0383e','#f08c00','#2f9e44','#2A6FDB','#7048e8','#e64980','#ffffff'];
const STICKY_COLORS = [
  '#ffd43b', '#a9e34b', '#74c0fc', '#ffa8a8', '#eebefa', '#ffffff',
  '#ffe5b4', '#c1f0c1', '#fcd5ce', '#d6ccff'
];
const _patterns = {};

let cv, ctx, DPR = 1, W = 0, H = 0;

/* fallback measuring context so text helpers never crash if called pre-init */
let _measCtx = null;
function measCtx() {
  if (ctx) return ctx;
  if (!_measCtx) { try { _measCtx = document.createElement('canvas').getContext('2d'); } catch (e) {} }
  return _measCtx;
}

function initCore() {
  cv = document.getElementById('board');
  ctx = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  load();
  loop();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
}

/* ---- coordinate transforms (CSS px space) ---- */
function toWorld(sx, sy) { return { x: (sx - WB.cam.x) / WB.cam.z, y: (sy - WB.cam.y) / WB.cam.z }; }
function toScreen(wx, wy) { return { x: wx * WB.cam.z + WB.cam.x, y: wy * WB.cam.z + WB.cam.y }; }

/* ---- render loop ---- */
function loop() {
  render();
  WB._raf = requestAnimationFrame(loop);
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, WB.cam, WB.bg, W, H);
  ctx.setTransform(WB.cam.z * DPR, 0, 0, WB.cam.z * DPR, WB.cam.x * DPR, WB.cam.y * DPR);
  for (const s of WB.shapes) drawShape(ctx, s);
  if (WB.draft) drawShape(ctx, WB.draft);
  drawLaser(ctx);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  WB.sel.forEach(s => drawSelectionUI(ctx, s, WB.sel.length > 1));
  if (WB.marquee) drawMarquee(ctx, WB.marquee);
}

function drawMarquee(ctx, m) {
  const p1 = toScreen(m.x, m.y), p2 = toScreen(m.x + m.w, m.y + m.h);
  const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
  ctx.fillStyle = 'rgba(42,111,219,.10)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2A6FDB'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
}

/* ---- backgrounds (screen space) ---- */
function drawBackground(ctx, cam, type, w, h) {
  if (type === 'blank') return;
  const step = 32 * cam.z;
  if (step < 6) return;
  const ox = ((cam.x % step) + step) % step;
  const oy = ((cam.y % step) + step) % step;
  if (type === 'dots') {
    ctx.fillStyle = WB.theme === 'pro' ? '#ffffff14' : '#c7cbd4';
    const r = Math.min(1.6, 1 + cam.z * 0.15);
    for (let x = ox; x < w; x += step)
      for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
  } else if (type === 'grid') {
    ctx.strokeStyle = WB.theme === 'pro' ? '#ffffff10' : '#e2e5ec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < w; x += step) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, h); }
    for (let y = oy; y < h; y += step) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(w, Math.round(y) + .5); }
    ctx.stroke();
  } else if (type === 'lines') {
    ctx.strokeStyle = WB.theme === 'pro' ? '#ffffff10' : '#e2e5ec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = oy; y < h; y += step) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(w, Math.round(y) + .5); }
    ctx.stroke();
  }
}

/* ---- shape drawing (world space) ---- */
function drawShape(ctx, s) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (s.type) {
    case 'draw': strokePath(ctx, s.points, s.color, s.size); break;
    case 'highlight': {
      ctx.save(); ctx.globalAlpha = 0.32; ctx.globalCompositeOperation = 'multiply';
      strokePath(ctx, s.points, s.color, s.size * 4); ctx.restore(); break;
    }
    case 'line': case 'arrow': {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      if (s.type === 'arrow') drawArrowHead(ctx, s.x1, s.y1, s.x2, s.y2, s.color, s.size);
      if (s.text) drawLineText(ctx, s);
      break;
    }
    case 'rect': {
      shapePath(ctx, s); fillShape(ctx, s); ctx.strokeStyle = s.color; ctx.lineWidth = s.size; shapePath(ctx, s); ctx.stroke();
      if (s.text) drawShapeText(ctx, s); break;
    }
    case 'ellipse': {
      shapePath(ctx, s); fillShape(ctx, s); ctx.strokeStyle = s.color; ctx.lineWidth = s.size; shapePath(ctx, s); ctx.stroke();
      if (s.text) drawShapeText(ctx, s); break;
    }
    case 'diamond': case 'triangle': {
      shapePath(ctx, s); fillShape(ctx, s); ctx.strokeStyle = s.color; ctx.lineWidth = s.size; shapePath(ctx, s); ctx.stroke();
      if (s.text) drawShapeText(ctx, s); break;
    }
    case 'text': {
      ctx.fillStyle = s.color; ctx.textBaseline = 'top';
      const lines = layoutText(ctx, s);
      const align = s.align || 'left';
      ctx.textAlign = align;
      ctx.font = fontStrFor(s, s.fs);
      const boxW = textBoxW(ctx, s, lines);
      const xA = align === 'center' ? s.x + boxW / 2 : align === 'right' ? s.x + boxW : s.x;
      lines.forEach((ln, i) => {
        const yy = s.y + i * s.fs * 1.3;
        ctx.fillText(ln, xA, yy);
        if (s.underline && ln) {
          const lw = ctx.measureText(ln).width;
          const ux = align === 'center' ? xA - lw / 2 : align === 'right' ? xA - lw : xA;
          const uy = Math.round(yy + s.fs * 1.06) + 0.5;
          ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(1, s.fs * 0.06);
          ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux + lw, uy); ctx.stroke();
        }
      });
      break;
    }
    case 'sticky': {
      ctx.save(); ctx.shadowColor = 'rgba(20,28,48,.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
      ctx.fillStyle = s.color; roundRect(ctx, s.x, s.y, s.w, s.h, 5); ctx.fill(); ctx.restore();
      // patrón opcional (cuadrícula / rayado / puntos) sobre la nota
      const fp = s.fillStyle;
      if (fp && fp !== 'solid' && fp !== 'none') {
        ctx.save(); roundRect(ctx, s.x, s.y, s.w, s.h, 5); ctx.clip();
        const b = { x: s.x, y: s.y, w: s.w, h: s.h }; const pc = 'rgba(40,40,37,0.5)';
        if (fp === 'hatch') drawHatch(ctx, b, pc, 45);
        else if (fp === 'cross') { drawHatch(ctx, b, pc, 45); drawHatch(ctx, b, pc, -45); }
        else if (fp === 'dots') drawDots(ctx, b, pc);
        ctx.restore();
      }
      drawCenteredText(ctx, s.text, s.x + s.w / 2, s.y + s.h / 2, s.w - 24, s.fs, s.textColor || '#2a2a25', s.align || 'center',
        { font: s.font, bold: s.bold, italic: s.italic, underline: s.underline });
      break;
    }
    case 'image': {
      const img = WB.imageCache[s.src];
      if (img && img.complete) { ctx.drawImage(img, s.x, s.y, s.w, s.h); }
      else {
        if (!img) { const im = new Image(); im.src = s.src; WB.imageCache[s.src] = im; }
        ctx.fillStyle = '#eef0f4'; roundRect(ctx, s.x, s.y, s.w, s.h, 4); ctx.fill();
      }
      break;
    }
  }
}

/* path for each shape (already begun) */
function shapePath(ctx, s) {
  if (s.type === 'rect') return roundRect(ctx, s.x, s.y, s.w, s.h, 6);
  if (s.type === 'ellipse') { ctx.beginPath(); return ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, 6.2832); }
  if (s.type === 'diamond') {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.beginPath(); ctx.moveTo(cx, s.y); ctx.lineTo(s.x + s.w, cy); ctx.lineTo(cx, s.y + s.h); ctx.lineTo(s.x, cy); ctx.closePath();
    return;
  }
  if (s.type === 'triangle') {
    ctx.beginPath(); ctx.moveTo(s.x + s.w / 2, s.y); ctx.lineTo(s.x + s.w, s.y + s.h); ctx.lineTo(s.x, s.y + s.h); ctx.closePath();
    return;
  }
}

function fillShape(ctx, s) {
  if (!s.fill) return;
  const style = s.fillStyle || 'solid';
  if (style === 'none') return;
  if (style === 'solid') { ctx.fillStyle = tint(s.color); ctx.fill(); return; }
  ctx.save(); shapePath(ctx, s); ctx.clip();
  const b = { x: s.x, y: s.y, w: s.w, h: s.h };
  if (style === 'hatch') drawHatch(ctx, b, s.color, 45);
  else if (style === 'cross') { drawHatch(ctx, b, s.color, 45); drawHatch(ctx, b, s.color, -45); }
  else if (style === 'dots') drawDots(ctx, b, s.color);
  ctx.restore();
}
function drawHatch(ctx, b, color, deg) {
  ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
  const step = 8, d = Math.max(b.w, b.h) * 2;
  ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(deg * Math.PI / 180);
  ctx.beginPath();
  for (let i = -d; i < d; i += step) { ctx.moveTo(i, -d); ctx.lineTo(i, d); }
  ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
}
function drawDots(ctx, b, color) {
  ctx.fillStyle = color; ctx.globalAlpha = 0.45;
  const step = 9;
  for (let y = b.y + 4; y < b.y + b.h; y += step)
    for (let x = b.x + 4; x < b.x + b.w; x += step) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 6.2832); ctx.fill(); }
  ctx.globalAlpha = 1;
}

/* draw text centered inside a shape */
function drawShapeText(ctx, s) {
  if (!s.text || s._editing) return;
  const padding = 12;
  const fs = s.textFs || 24;
  drawCenteredText(ctx, s.text, s.x + s.w / 2, s.y + s.h / 2, Math.max(20, s.w - padding * 2), fs, s.textColor || '#1d2128', s.align || 'center', { font: s.textFont, bold: s.textBold, italic: s.textItalic });
}

/* draw text along a line/arrow at midpoint */
function drawLineText(ctx, s) {
  if (s._editing) return;
  const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const fs = s.textFs || 18;
  ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle);
  ctx.font = innerFontStr(fs, { font: s.textFont, bold: true });
  const tw = ctx.measureText(s.text).width;
  ctx.fillStyle = WB.theme === 'pro' ? '#1b1f29' : '#ffffff';
  ctx.fillRect(-tw / 2 - 5, -fs / 2 - 2, tw + 10, fs + 4);
  ctx.fillStyle = s.textColor || '#1d2128'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s.text, 0, 0);
  ctx.restore();
}

/* font string for shape inner text honoring its own font/bold/italic */
function innerFontStr(fs, o) {
  o = o || {};
  const fam = o.font || WB.font;
  const weight = o.bold ? 800 : 600;
  const style = o.italic ? 'italic ' : '';
  return `${style}${weight} ${fs}px '${fam}', 'Poppins', system-ui, sans-serif`;
}

/* centered, wrapped text helper */
function drawCenteredText(ctx, text, cx, cy, maxW, fs, color, align, fontOpts) {
  if (!text) return;
  ctx.fillStyle = color; ctx.font = innerFontStr(fs, fontOpts);
  ctx.textBaseline = 'middle'; ctx.textAlign = align;
  const paras = String(text).split('\n');
  const lines = [];
  for (const para of paras) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(' '); let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = wd; }
      else line = test;
    }
    lines.push(line);
  }
  const lh = fs * 1.3, total = lines.length * lh;
  const y0 = cy - total / 2 + lh / 2;
  const xA = align === 'left' ? cx - maxW / 2 : align === 'right' ? cx + maxW / 2 : cx;
  lines.forEach((ln, i) => ctx.fillText(ln, xA, y0 + i * lh));
  // subrayado
  if (fontOpts && fontOpts.underline) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, fs * 0.06);
    lines.forEach((ln, i) => {
      if (!ln) return;
      const w = ctx.measureText(ln).width;
      const lx = align === 'left' ? xA : align === 'right' ? xA - w : xA - w / 2;
      const ly = y0 + i * lh + fs * 0.42;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + w, ly); ctx.stroke();
    });
  }
}

function strokePath(ctx, pts, color, width) {
  if (!pts.length) return;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath();
  if (pts.length < 3) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke(); return; }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}

function drawArrowHead(ctx, x1, y1, x2, y2, color, size) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = 8 + size * 2.4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang - 0.42), y2 - len * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - len * Math.cos(ang + 0.42), y2 - len * Math.sin(ang + 0.42));
  ctx.closePath(); ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/\s+/); let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function fontStr(fs, weight) { return `${weight || 600} ${fs}px '${WB.font}', 'Poppins', system-ui, sans-serif`; }

/* font string honoring a text shape's own font + bold/italic */
function fontStrFor(s, fs) {
  const fam = s.font || WB.font;
  const weight = s.bold ? 800 : 600;
  const style = s.italic ? 'italic ' : '';
  return `${style}${weight} ${fs}px '${fam}', 'Poppins', system-ui, sans-serif`;
}

/* paragraphs with list prefixes applied (display only) */
function effectiveParas(s) {
  const paras = String(s.text).split('\n');
  if (!s.list || s.list === 'none') return paras;
  let n = 0;
  return paras.map(p => {
    if (p.trim() === '') return p;
    n++;
    return (s.list === 'number' ? n + '.  ' : '•  ') + p;
  });
}

/* lines to render for a text shape: auto-width (s.w falsy) splits on \n only;
   fixed-width (s.w set) wraps each paragraph within s.w */
/* width of a text shape's box: fixed when s.w set & not auto; else hugs content */
function textBoxW(ctx, s, lines) {
  ctx = ctx || measCtx();
  lines = lines || layoutText(ctx, s);
  if (s.w && !s.auto) return s.w;
  ctx.font = fontStrFor(s, s.fs);
  return Math.max(...lines.map(l => ctx.measureText(l || ' ').width), 10);
}

/* lines to render for a text shape: auto (hug) splits on \n only;
   fixed-width wraps each paragraph within s.w */
function layoutText(ctx, s) {
  ctx = ctx || measCtx();
  ctx.font = fontStrFor(s, s.fs);
  const paras = effectiveParas(s);
  if (!s.w || s.auto) return paras;
  const out = [];
  for (const para of paras) {
    if (para === '') { out.push(''); continue; }
    const words = para.split(' '); let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > s.w && line) { out.push(line); line = wd; }
      else line = test;
    }
    out.push(line);
  }
  return out;
}

function tint(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

/* ---- selection UI (screen space) ---- */
function drawSelectionUI(ctx, s, multi) {
  const b = getBounds(s); if (!b) return;
  const p1 = toScreen(b.x, b.y), p2 = toScreen(b.x + b.w, b.y + b.h);
  const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
  ctx.strokeStyle = '#2A6FDB'; ctx.lineWidth = multi ? 1 : 1.5; ctx.setLineDash([]);
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  if (multi) return;
  if (s.type === 'line' || s.type === 'arrow') {
    [[s.x1, s.y1], [s.x2, s.y2]].forEach(([wx, wy]) => { const p = toScreen(wx, wy); handle(ctx, p.x, p.y); });
  } else if (s.type !== 'draw' && s.type !== 'highlight') {
    // corners
    [[x - 4, y - 4], [x + w + 4, y - 4], [x - 4, y + h + 4], [x + w + 4, y + h + 4]].forEach(([hx, hy]) => handle(ctx, hx, hy));
    // mid edges (smaller)
    const cx = x + w / 2, cy = y + h / 2;
    if (s.type === 'text') {
      [[x - 4, cy], [x + w + 4, cy]].forEach(([hx, hy]) => handle(ctx, hx, hy, true));
    } else {
      [[cx, y - 4], [cx, y + h + 4], [x - 4, cy], [x + w + 4, cy]].forEach(([hx, hy]) => handle(ctx, hx, hy, true));
    }
  }
}
function handle(ctx, x, y, small) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2A6FDB'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, small ? 3.5 : 5, 0, 6.2832); ctx.fill(); ctx.stroke();
}

/* ---- bounds + hit testing ---- */
function getBounds(s) {
  switch (s.type) {
    case 'draw': case 'highlight': {
      let xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case 'line': case 'arrow':
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case 'text': {
      const mc = ctx || measCtx();
      const lines = layoutText(mc, s);
      const w = textBoxW(mc, s, lines);
      return { x: s.x, y: s.y, w, h: lines.length * s.fs * 1.3 };
    }
    default: return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
}

function hitTest(wx, wy) {
  for (let i = WB.shapes.length - 1; i >= 0; i--) {
    const s = WB.shapes[i];
    if (s.type === 'draw' || s.type === 'highlight') { if (nearPolyline(s.points, wx, wy, 8 + s.size)) return s; }
    else if (s.type === 'line' || s.type === 'arrow') { if (distToSeg(wx, wy, s.x1, s.y1, s.x2, s.y2) < 8 + s.size) return s; }
    else { const b = getBounds(s); const pad = 6; if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) return s; }
  }
  return null;
}
function selOne() { return WB.sel.length === 1 ? WB.sel[0] : null; }
function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
function shapesInMarquee(m) {
  const r = { x: Math.min(m.x, m.x + m.w), y: Math.min(m.y, m.y + m.h), w: Math.abs(m.w), h: Math.abs(m.h) };
  return WB.shapes.filter(s => rectsOverlap(getBounds(s), r));
}
function nearPolyline(pts, x, y, tol) {
  for (let i = 0; i < pts.length - 1; i++) if (distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < tol) return true;
  return false;
}
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy; return Math.hypot(px - cx, py - cy);
}

/* ---- translate / mutate ---- */
function translateShape(s, dx, dy) {
  if (s.type === 'draw' || s.type === 'highlight') s.points.forEach(p => { p.x += dx; p.y += dy; });
  else if (s.type === 'line' || s.type === 'arrow') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else { s.x += dx; s.y += dy; }
}

/* ---- history ---- */
const history = { undo: [], redo: [] };
let lastState = '[]';                     // snapshot of the last committed state
function snapshot() { return JSON.stringify(WB.shapes); }
function commit() {
  history.undo.push(lastState); if (history.undo.length > 80) history.undo.shift();
  history.redo.length = 0;
  lastState = snapshot(); save();
}
function doUndo() {
  if (!history.undo.length) return;
  history.redo.push(lastState);
  const prev = history.undo.pop();
  WB.shapes = JSON.parse(prev); lastState = prev; WB.sel = []; save();
}
function doRedo() {
  if (!history.redo.length) return;
  history.undo.push(lastState);
  const next = history.redo.pop();
  WB.shapes = JSON.parse(next); lastState = next; WB.sel = []; save();
}

/* ---- persistence: workspaces + boards in localStorage ---- */
const STORE_KEY = 'profbaldemar.ws.v2';
const LEGACY_KEY = 'profbaldemar.board.v1';
let saveTimer = null;
let WS = null;                 // { workspaces:[], boards:[], currentBoardId, currentWsId }

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ===== Directus (servidor) ===== */
const DIRECTUS_URL = 'https://directus.jbs.red';

/* ---- Auth (solo el profesor puede editar) ---- */
let AUTH = { token: null, refresh: null, email: null };
let IS_SPECTATOR = false;   // true cuando se abre con #vista=vivo

function loadAuth() {
  try { const t = localStorage.getItem('pb.auth'); if (t) AUTH = JSON.parse(t); } catch (e) {}
}
function isLoggedIn() { return !!(AUTH && AUTH.token); }

async function doLogin(email, password) {
  try {
    const r = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const j = await r.json();
    if (j && j.data && j.data.access_token) {
      AUTH = { token: j.data.access_token, refresh: j.data.refresh_token, email };
      localStorage.setItem('pb.auth', JSON.stringify(AUTH));
      return { ok: true };
    }
    let msg = 'Correo o contraseña incorrectos';
    if (j && j.errors && j.errors[0]) msg = j.errors[0].message;
    return { ok: false, msg };
  } catch (e) { return { ok: false, msg: 'No hay conexión con el servidor' }; }
}
async function refreshToken() {
  if (!AUTH || !AUTH.refresh) return false;
  try {
    const r = await fetch(`${DIRECTUS_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: AUTH.refresh })
    });
    const j = await r.json();
    if (j && j.data && j.data.access_token) {
      AUTH.token = j.data.access_token; AUTH.refresh = j.data.refresh_token;
      localStorage.setItem('pb.auth', JSON.stringify(AUTH));
      return true;
    }
  } catch (e) {}
  return false;
}
function logout() { AUTH = { token: null }; localStorage.removeItem('pb.auth'); location.reload(); }

/* fetch con token; reintenta una vez si expiró */
async function authedFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {});
  if (AUTH && AUTH.token) opts.headers['Authorization'] = 'Bearer ' + AUTH.token;
  let r = await fetch(url, opts);
  if (r.status === 401 && AUTH && AUTH.refresh) {
    if (await refreshToken()) {
      opts.headers['Authorization'] = 'Bearer ' + AUTH.token;
      r = await fetch(url, opts);
    }
  }
  return r;
}

async function pushBoard(b) {
  // Only use JSON columns (shapes, cam) — the string columns (name/workspace)
  // have a broken length constraint in this Directus instance, so we fold
  // name/workspace/bg into cam to sidestep them entirely.
  const wsName = (WS.workspaces.find(w => w.id === b.wsId) || {}).name || 'Mi taller';
  const payload = {
    shapes: b.shapes || [],
    cam: Object.assign({}, b.cam || { x: 0, y: 0, z: 1 }, {
      _bg: b.bg || 'dots',
      _name: b.name || 'Sin título',
      _ws: b.wsId || '',
      _wsName: wsName,
    }),
  };
  try {
    let res;
    if (b._dirId) {
      res = await authedFetch(`${DIRECTUS_URL}/items/boards/${b._dirId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await authedFetch(`${DIRECTUS_URL}/items/boards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (res && res.ok) {
      const j = await res.json().catch(() => null);
      if (j && j.data && j.data.id && !b._dirId) b._dirId = j.data.id;
      syncToast('Guardado en tu servidor ✓', 'ok');
    } else if (res) {
      const txt = await res.text().catch(() => '');
      let msg = txt;
      try { const e = JSON.parse(txt); if (e.errors && e.errors[0]) msg = e.errors[0].message; } catch (x) {}
      syncToast('No se pudo guardar (' + res.status + '): ' + msg, 'err');
    }
  } catch (e) {
    syncToast('Sin conexión con el servidor — guardado solo en este equipo', 'err');
  }
}

let _toastT = null;
function syncToast(msg, kind) {
  const el = document.getElementById('syncToast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show ' + (kind || 'ok');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { el.className = (kind || 'ok'); }, kind === 'err' ? 9000 : 1800);
}

async function fetchAllBoards() {
  try {
    const r = await fetch(`${DIRECTUS_URL}/items/boards?limit=-1&fields=id,name,workspace,shapes,cam,date_created,date_updated`);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.data) || null;
  } catch (e) { return null; }
}

async function fetchOneBoard(dirId) {
  try {
    const r = await fetch(`${DIRECTUS_URL}/items/boards/${dirId}?fields=id,name,workspace,shapes,cam`);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.data) || null;
  } catch (e) { return null; }
}

/* Delete a board from Directus */
async function deleteBoardFromDirectus(dirId) {
  if (!dirId) return;
  try { await authedFetch(`${DIRECTUS_URL}/items/boards/${dirId}`, { method: 'DELETE' }); }
  catch (e) {}
}

function buildWSFromDirectus(rows) {
  const workspaces = []; const wsSeen = {}; const boards = [];
  rows.forEach(d => {
    const wsId = (d.cam && d.cam._ws) || d.workspace || 'mi-taller';
    if (!wsSeen[wsId]) {
      wsSeen[wsId] = true;
      const nm = (d.cam && d.cam._wsName) || 'Mi taller';
      workspaces.push({ id: wsId, name: nm });
    }
    boards.push({
      id: d.id, _dirId: d.id, wsId, name: (d.cam && d.cam._name) || d.name || 'Sin título',
      shapes: d.shapes || [], cam: d.cam || { x: W/2, y: H/2, z: 1 },
      bg: (d.cam && d.cam._bg) || d.bg || 'dots',
      createdAt: d.date_created ? new Date(d.date_created).getTime() : Date.now(),
      updatedAt: d.date_updated ? new Date(d.date_updated).getTime() : Date.now(),
    });
  });
  if (!workspaces.length) { workspaces.push({ id: 'mi-taller', name: 'Mi taller' }); }
  if (!boards.length) { boards.push({ id: uid(), wsId: workspaces[0].id, name: 'Mi primera pizarra', shapes: [], cam: { x: W/2, y: H/2, z: 1 }, bg: 'dots', createdAt: Date.now(), updatedAt: Date.now() }); }
  return { workspaces, boards, currentWsId: workspaces[0].id, currentBoardId: boards[0].id, font: 'Times New Roman', theme: 'default' };
}

function loadAll() {
  let prevDirId = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      WS = JSON.parse(raw);
      const cb = WS.boards && WS.boards.find(b => b.id === WS.currentBoardId);
      prevDirId = cb && (cb._dirId || cb.id);
    }
  } catch (e) {}
  if (!WS) WS = freshWorkspace();
  if (WS.font) WB.font = WS.font; if (WS.theme) WB.theme = WS.theme;
  applyBoard(currentBoard());

  // Always sync from Directus so every device shows the same boards
  fetchAllBoards().then(rows => {
    if (rows && rows.length) {
      WS = buildWSFromDirectus(rows);
      // keep the board the user was on, if it still exists
      if (prevDirId) {
        const match = WS.boards.find(b => (b._dirId || b.id) === prevDirId);
        if (match) { WS.currentBoardId = match.id; WS.currentWsId = match.wsId; }
      }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {}
      applyBoard(currentBoard());
      if (typeof refreshSidebar === 'function') refreshSidebar();
      if (typeof refreshBrand === 'function') refreshBrand();
    }
  });
}
function freshWorkspace() {
  const wsId = uid(), bId = uid(), now = Date.now();
  const ws = {
    workspaces: [{ id: wsId, name: 'Mi taller' }],
    boards: [{ id: bId, wsId, name: 'Mi primera pizarra', createdAt: now, updatedAt: now, shapes: [], cam: { x: W/2, y: H/2, z: 1 }, bg: 'dots' }],
    currentWsId: wsId, currentBoardId: bId, font: 'Times New Roman', theme: 'default',
  };
  WB.shapes = []; seedDemo(ws.boards[0]);
  return ws;
}
function currentBoard() { return WS.boards.find(b => b.id === WS.currentBoardId) || WS.boards[0]; }

function applyBoard(b) {
  WB.shapes = b.shapes || [];
  WB.cam = b.cam || { x: W / 2, y: H / 2, z: 1 };
  WB.bg = b.bg || 'dots';
  WB.sel = []; lastState = snapshot();
  history.undo = []; history.redo = [];
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const b = currentBoard();
    b.shapes = WB.shapes; b.cam = WB.cam; b.bg = WB.bg; b.updatedAt = Date.now();
    WS.font = WB.font; WS.theme = WB.theme;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {}
    pushBoard(b);
    if (typeof refreshSidebar === 'function') refreshSidebar();
  }, 500);
}

function load() { loadAll(); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
