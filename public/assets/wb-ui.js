/* ===== Prof. Baldemar — UI, modo espectador y temas ===== */
function initUI() {
  buildToolbar();
  buildProps();
  buildFonts();
  buildSidebar();
  wireTopRight();
  wireZoom();
  wireImageInput();
  wireShare();
  wireContextMenu();
  setActiveTool('select');
  setBg(WB.bg);
  setTheme(WB.theme);
  setFont(WB.font);
  updateZoomLabel();
  refreshBrand();
  lucide.createIcons();
  maybeEnterViewerFromUrl();
}

/* If URL has #aula=ID&vista=vivo, switch to that board and enter read-only viewer */
async function maybeEnterViewerFromUrl() {
  const hash = location.hash || '';
  if (!hash.includes('vista=vivo')) return;
  // apply shared theme so spectator sees the same look
  const tm = hash.match(/tema=([^&]+)/);
  if (tm && tm[1]) setTheme(tm[1]);
  const m = hash.match(/aula=([^&]+)/);
  if (m) {
    const id = m[1];
    // try local first
    let b = WS && WS.boards && WS.boards.find(x => x._dirId === id || x.id === id);
    if (!b) {
      // fetch from Directus directly
      const row = await fetchOneBoard(id);
      if (row) {
        b = { id: row.id, _dirId: row.id, wsId: (row.cam && row.cam._ws) || row.workspace || 'remote', name: (row.cam && row.cam._name) || row.name || 'Pizarra',
              shapes: row.shapes || [], cam: row.cam || { x: W/2, y: H/2, z: 1 },
              bg: (row.cam && row.cam._bg) || row.bg || 'dots' };
        if (!WS) WS = freshWorkspace();
        WS.boards.push(b);
      }
    }
    if (b) { WS.currentBoardId = b.id; WS.currentWsId = b.wsId; applyBoard(b); refreshBrand(); }
  }
  setTimeout(enterViewer, 300);
}

/* ---------- sidebar ---------- */
function buildSidebar() {
  document.getElementById('brand').addEventListener('click', toggleSidebar);
  document.getElementById('closeSb').addEventListener('click', e => { e.stopPropagation(); closeSidebar(); });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#sidebar') && !e.target.closest('#brand')) closeSidebar();
  });
  refreshSidebar();
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const open = !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  document.getElementById('brand').classList.toggle('open', open);
  if (open) refreshSidebar();
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('brand').classList.remove('open');
}
function refreshSidebar() {
  const body = document.getElementById('sbBody'); if (!body) return;
  body.innerHTML = '';
  WS.workspaces.forEach(ws => {
    const wsEl = document.createElement('div'); wsEl.className = 'ws';
    const head = document.createElement('div'); head.className = 'ws-head';
    const nm = document.createElement('input'); nm.className = 'nm'; nm.value = ws.name; nm.spellcheck = false;
    nm.addEventListener('change', () => {
      ws.name = nm.value.trim() || ws.name;
      // persist the workspace name on every board of this workspace
      WS.boards.filter(b => b.wsId === ws.id).forEach(b => pushBoard(b));
      try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {}
      refreshBrand();
    });
    head.appendChild(nm);
    const addBtn = document.createElement('button'); addBtn.className = 'ic'; addBtn.title = 'Nueva pizarra';
    addBtn.innerHTML = '<i data-lucide="plus"></i>'; addBtn.onclick = () => newBoard(ws.id);
    head.appendChild(addBtn);
    if (WS.workspaces.length > 1) {
      const delBtn = document.createElement('button'); delBtn.className = 'ic'; delBtn.title = 'Borrar espacio';
      delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      delBtn.onclick = () => { if (confirm(`¿Borrar el espacio "${ws.name}" y sus pizarras?`)) deleteWorkspace(ws.id); };
      head.appendChild(delBtn);
    }
    wsEl.appendChild(head);

    const boards = document.createElement('div'); boards.className = 'boards';
    const wsBoards = WS.boards.filter(b => b.wsId === ws.id);
    wsBoards.forEach(b => boards.appendChild(boardRow(b)));
    const add = document.createElement('button'); add.className = 'add-bd';
    add.innerHTML = '<i data-lucide="plus"></i> Nueva pizarra';
    add.onclick = () => newBoard(ws.id);
    boards.appendChild(add);
    wsEl.appendChild(boards); body.appendChild(wsEl);
  });
  const addWs = document.createElement('button'); addWs.className = 'add-ws';
  addWs.innerHTML = '<i data-lucide="folder-plus"></i> Nuevo espacio';
  addWs.onclick = newWorkspace;
  body.appendChild(addWs);

  // exportar imagen
  const expPng = document.createElement('button'); expPng.className = 'add-ws';
  expPng.innerHTML = '<i data-lucide="image-down"></i> Exportar PNG';
  expPng.onclick = () => exportImage('png');
  body.appendChild(expPng);
  const expJpg = document.createElement('button'); expJpg.className = 'add-ws';
  expJpg.innerHTML = '<i data-lucide="image-down"></i> Exportar JPG';
  expJpg.onclick = () => exportImage('jpg');
  body.appendChild(expJpg);

  // cerrar sesión
  const out = document.createElement('button'); out.className = 'add-ws logout-btn';
  out.innerHTML = '<i data-lucide="log-out"></i> Cerrar sesión';
  out.onclick = () => { if (confirm('¿Cerrar sesión?')) logout(); };
  body.appendChild(out);

  if (window.lucide) lucide.createIcons({ nodes: body.querySelectorAll('i') });
}

function boardRow(b) {
  const row = document.createElement('div'); row.className = 'bd' + (b.id === WS.currentBoardId ? ' active' : '');
  row.innerHTML = `<div class="dot"></div>`;
  const col = document.createElement('div'); col.className = 'col';
  const nm = document.createElement('input'); nm.className = 'bd-nm'; nm.value = b.name; nm.spellcheck = false;
  nm.addEventListener('change', () => { b.name = nm.value.trim() || b.name; pushBoard(b); try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {} refreshBrand(); });
  nm.addEventListener('pointerdown', e => e.stopPropagation());
  col.appendChild(nm);
  const meta = document.createElement('div'); meta.className = 'bd-meta';
  meta.innerHTML = `<span>Creada ${fmtDate(b.createdAt)}</span><span class="sep"></span><span>${b.shapes ? b.shapes.length : 0} elementos</span>`;
  col.appendChild(meta);
  row.appendChild(col);
  if (WS.boards.length > 1) {
    const del = document.createElement('button'); del.className = 'menu'; del.title = 'Borrar pizarra';
    del.innerHTML = '<i data-lucide="trash-2"></i>';
    del.onclick = e => { e.stopPropagation(); if (confirm(`¿Borrar la pizarra "${b.name}"?`)) deleteBoard(b.id); };
    row.appendChild(del);
  }
  row.addEventListener('click', e => { if (e.target === nm) return; switchBoard(b.id); });
  return row;
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function newBoard(wsId) {
  const now = Date.now();
  const b = { id: uid(), wsId, name: 'Pizarra ' + (WS.boards.filter(x => x.wsId === wsId).length + 1),
    createdAt: now, updatedAt: now, shapes: [], cam: { x: W/2, y: H/2, z: 1 }, bg: WB.bg };
  WS.boards.push(b); WS.currentBoardId = b.id;
  applyBoard(b); refreshSidebar(); refreshBrand();
  pushBoard(b);                       // create in Directus right away
  try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {}
}
function newWorkspace() {
  const wsId = uid();
  WS.workspaces.push({ id: wsId, name: 'Nuevo espacio' });
  newBoard(wsId);
}
function switchBoard(id) {
  if (id === WS.currentBoardId) return closeSidebar();
  // save current first
  const cur = currentBoard(); if (cur) { cur.shapes = WB.shapes; cur.cam = WB.cam; cur.bg = WB.bg; cur.updatedAt = Date.now(); }
  WS.currentBoardId = id;
  const b = currentBoard();
  WS.currentWsId = b.wsId;
  applyBoard(b);
  refreshSidebar(); refreshBrand(); save(); closeSidebar();
}
function deleteBoard(id) {
  if (WS.boards.length <= 1) return;
  const b = WS.boards.find(x => x.id === id);
  if (b && (b._dirId || b.id)) deleteBoardFromDirectus(b._dirId || b.id);
  WS.boards = WS.boards.filter(b => b.id !== id);
  if (WS.currentBoardId === id) { WS.currentBoardId = WS.boards[0].id; applyBoard(currentBoard()); }
  refreshSidebar(); refreshBrand();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {}
}
function deleteWorkspace(id) {
  const wsBoards = WS.boards.filter(b => b.wsId === id);
  wsBoards.forEach(b => { if (b._dirId || b.id) deleteBoardFromDirectus(b._dirId || b.id); });
  WS.workspaces = WS.workspaces.filter(w => w.id !== id);
  WS.boards = WS.boards.filter(b => b.wsId !== id);
  if (!WS.boards.length) { newBoard(uid()); return; }
  if (wsBoards.some(b => b.id === WS.currentBoardId)) { WS.currentBoardId = WS.boards[0].id; applyBoard(currentBoard()); }
  refreshSidebar(); refreshBrand();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(WS)); } catch (e) {}
}
function refreshBrand() {
  const b = currentBoard(); if (!b) return;
  const ws = WS.workspaces.find(w => w.id === b.wsId);
  const n = document.getElementById('brandName'); if (n) n.textContent = b.name;
  const s = document.getElementById('brandSub'); if (s) s.textContent = ws ? ws.name : 'Prof. Baldemar';
}

/* ---------- font picker ---------- */
const FONTS = [
  { name: 'Montserrat', tag: 'Publicidad · geométrica' },
  { name: 'Poppins', tag: 'Moderna · redondeada' },
  { name: 'Oswald', tag: 'Condensada · titulares' },
  { name: 'Bebas Neue', tag: 'Póster · alto impacto' },
  { name: 'Times New Roman', tag: 'Clásica · con serifa' },
];
function buildFonts() {
  const pop = document.getElementById('fontPop');
  FONTS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'fp' + (f.name === WB.font ? ' active' : ''); b.dataset.font = f.name;
    b.innerHTML = `<span class="nm" style="font-family:'${f.name}',sans-serif">${f.name}</span><span class="tag">${f.tag}</span>`;
    b.onclick = () => { setFont(f.name); closeFontPop(); };
    pop.appendChild(b);
  });
  document.getElementById('fontBtn').onclick = e => { e.stopPropagation(); pop.classList.toggle('open'); };
  window.addEventListener('pointerdown', e => { if (!e.target.closest('#fontPop') && !e.target.closest('#fontBtn')) closeFontPop(); });
}
function closeFontPop() { document.getElementById('fontPop').classList.remove('open'); }
function setFont(name) {
  const sel = WB.sel && WB.sel.length === 1 ? WB.sel[0] : null;
  if (sel && (sel.type === 'text')) {
    sel.font = name; commit();
  } else if (sel && ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow', 'sticky'].includes(sel.type) && sel.text) {
    sel.textFont = name; commit();        // inner text of a figure
  } else {
    WB.font = name; save();
  }
  document.getElementById('fontCur').textContent = name;
  const aa = document.querySelector('.font-btn .aa'); if (aa) aa.style.fontFamily = `'${name}',sans-serif`;
  document.querySelectorAll('#fontPop .fp').forEach(b => b.classList.toggle('active', b.dataset.font === name));
}

/* ---------- toolbar ---------- */
const TOOLS = [
  { t: 'select', icon: 'mouse-pointer-2', name: 'Seleccionar', k: 'V' },
  { t: 'hand', icon: 'hand', name: 'Mover pizarra', k: 'M' },
  { t: 'draw', icon: 'pencil', name: 'Lápiz', k: 'D' },
  { t: 'highlight', icon: 'highlighter', name: 'Resaltador', k: 'H' },
  { t: 'eraser', icon: 'eraser', name: 'Goma', k: 'E' },
  { sep: true },
  { t: 'shapes', icon: 'shapes', name: 'Formas', k: '', caret: true },
  { t: 'text', icon: 'type', name: 'Texto', k: 'T' },
  { t: 'sticky', icon: 'sticky-note', name: 'Nota', k: 'N' },
  { t: 'image', icon: 'image', name: 'Imagen', k: 'I' },
  { t: 'laser', icon: 'pointer', name: 'Láser', k: 'X' },
  { sep: true },
  { t: 'undo', icon: 'undo-2', name: 'Deshacer', k: '⌘Z' },
  { t: 'redo', icon: 'redo-2', name: 'Rehacer', k: '⌘⇧Z' },
];
const SHAPE_TOOLS = [
  { t: 'rect', icon: 'square', name: 'Rectángulo' },
  { t: 'ellipse', icon: 'circle', name: 'Elipse' },
  { t: 'diamond', icon: 'diamond', name: 'Diamante' },
  { t: 'triangle', icon: 'triangle', name: 'Triángulo' },
  { t: 'line', icon: 'minus', name: 'Línea' },
  { t: 'arrow', icon: 'move-up-right', name: 'Flecha' },
];

function buildToolbar() {
  const bar = document.getElementById('toolbar');
  TOOLS.forEach(d => {
    if (d.sep) { const s = document.createElement('div'); s.className = 'tool-sep'; bar.appendChild(s); return; }
    const b = document.createElement('button');
    b.className = 'tool'; b.dataset.tool = d.t;
    b.innerHTML = `<i data-lucide="${d.icon}"></i>${d.caret ? '<span class="caret"></span>' : ''}<span class="tip">${d.name}${d.k ? `<span class="k">${d.k}</span>` : ''}</span>`;
    b.addEventListener('click', () => onToolClick(d.t));
    bar.appendChild(b);
  });
  const pop = document.getElementById('shapesPopover');
  SHAPE_TOOLS.forEach(d => {
    const b = document.createElement('button');
    b.className = 'tool'; b.dataset.tool = d.t;
    b.innerHTML = `<i data-lucide="${d.icon}"></i><span class="tip">${d.name}</span>`;
    b.addEventListener('click', () => { setActiveTool(d.t); closePopover(); WB._lastShape = d.t; refreshShapesBtn(); });
    pop.appendChild(b);
  });
}

function onToolClick(t) {
  if (t === 'undo') return doUndo();
  if (t === 'redo') return doRedo();
  if (t === 'shapes') { togglePopover(); return; }
  setActiveTool(t);
}

function setActiveTool(t) {
  WB.tool = t; WB.sel = [];
  document.querySelectorAll('#toolbar .tool').forEach(b => b.classList.remove('active'));
  const shapeSet = ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];
  let activeKey = shapeSet.includes(t) ? 'shapes' : t;
  const btn = document.querySelector(`#toolbar .tool[data-tool="${activeKey}"]`);
  if (btn) btn.classList.add('active');
  if (t !== 'shapes') closePopover();
  updateProps(); updateCursor();
}

function refreshShapesBtn() {
  const last = WB._lastShape || 'square';
  const map = { rect: 'square', ellipse: 'circle', diamond: 'diamond', triangle: 'triangle', line: 'minus', arrow: 'move-up-right' };
  const i = document.querySelector('#toolbar .tool[data-tool="shapes"] i');
  if (i) { i.setAttribute('data-lucide', map[WB._lastShape] || 'shapes'); lucide.createIcons({ nodes: [i.parentNode] }); }
}

function togglePopover() { document.getElementById('shapesPopover').classList.toggle('open'); }
function closePopover() { document.getElementById('shapesPopover').classList.remove('open'); }

/* ---------- properties panel ---------- */
function buildProps() { updateProps(); }
function updateProps() {
  const el = document.getElementById('props');
  const single = WB.tool === 'select' ? selOne() : null;
  const multi = (WB.tool === 'select' && WB.sel.length > 1) ? WB.sel : null;
  const tool = single ? single.type : WB.tool;
  const hasType = (arr, types) => arr.some(s => types.includes(s.type));
  const colorTypes = ['draw', 'highlight', 'line', 'arrow', 'rect', 'ellipse', 'diamond', 'triangle', 'text', 'sticky'];
  const sizeTypes = ['draw', 'highlight', 'line', 'arrow', 'rect', 'ellipse', 'diamond', 'triangle'];
  const shapeTypes = ['rect', 'ellipse', 'diamond', 'triangle'];
  const alignTypes = ['text', 'sticky', 'rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];

  const showColor = multi ? hasType(multi, colorTypes) : colorTypes.includes(tool);
  const showSize = multi ? hasType(multi, sizeTypes) : sizeTypes.includes(tool);
  const showFill = multi ? hasType(multi, shapeTypes) : shapeTypes.includes(tool);
  const showAlign = multi ? hasType(multi, alignTypes) : alignTypes.includes(tool);
  const isSticky = !multi && tool === 'sticky';

  const any = showColor || showSize || showFill || showAlign;
  el.classList.toggle('open', any);
  if (!any) return;
  el.innerHTML = '';
  const sep = () => { if (el.children.length) { const d = document.createElement('div'); d.className = 'divider'; el.appendChild(d); } };

  // palette
  if (showColor) {
    const pal = isSticky ? STICKY_COLORS : PALETTE;
    const curColor = single ? single.color : (isSticky ? (WB._stickyColor || '#ffd43b') : WB.color);
    const grp = document.createElement('div'); grp.className = 'grp';
    grp.innerHTML = `<div class="lbl">${isSticky ? 'Nota' : 'Color'}</div>`;
    const sws = document.createElement('div'); sws.className = 'swatches';
    pal.forEach(c => {
      const s = document.createElement('button'); s.className = 'sw' + (c === curColor ? ' active' : '');
      s.style.background = c; if (c === '#ffffff') s.style.boxShadow = 'inset 0 0 0 1px #d6d9e0';
      s.onclick = () => {
        if (multi) { multi.forEach(sh => { if (colorTypes.includes(sh.type)) sh.color = c; }); commit(); }
        else if (single) { single.color = c; commit(); }
        else if (isSticky) WB._stickyColor = c; else WB.color = c;
        updateProps();
      };
      sws.appendChild(s);
    });
    grp.appendChild(sws); el.appendChild(grp);
  }

  // size
  if (showSize) {
    sep();
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<div class="lbl">Grosor</div>`;
    const wrap = document.createElement('div'); wrap.className = 'sizes';
    const cur = (single || multi) ? null : WB.size;
    ['s', 'm', 'l', 'xl'].forEach(k => {
      const dd = document.createElement('button'); dd.className = 'size-dot' + (k === cur ? ' active' : '');
      const px = 6 + ['s', 'm', 'l', 'xl'].indexOf(k) * 4; dd.style.width = px + 'px'; dd.style.height = px + 'px';
      dd.onclick = () => {
        if (multi) { multi.forEach(sh => { if (sizeTypes.includes(sh.type)) sh.size = SIZES[k]; }); commit(); }
        else if (single) { single.size = SIZES[k]; commit(); } else WB.size = k;
        updateProps();
      };
      wrap.appendChild(dd);
    });
    g.appendChild(wrap); el.appendChild(g);
  }

  // fill style (none/solid/hatch/cross/dots)
  if (showFill) {
    sep();
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<div class="lbl">Relleno</div>`;
    const fs = document.createElement('div'); fs.className = 'fillstyle';
    const styles = [
      { k: 'none', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>' },
      { k: 'solid', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor"/></svg>' },
      { k: 'hatch', svg: '<svg viewBox="0 0 24 24"><defs><pattern id="hp" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" stroke-width="1.4"/></pattern></defs><rect x="4" y="4" width="16" height="16" rx="3" fill="url(#hp)" stroke="currentColor" stroke-width="1.4"/></svg>' },
      { k: 'cross', svg: '<svg viewBox="0 0 24 24"><defs><pattern id="cp" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0 0L4 4M0 4L4 0" stroke="currentColor" stroke-width="1"/></pattern></defs><rect x="4" y="4" width="16" height="16" rx="3" fill="url(#cp)" stroke="currentColor" stroke-width="1.4"/></svg>' },
      { k: 'dots', svg: '<svg viewBox="0 0 24 24"><defs><pattern id="dp" patternUnits="userSpaceOnUse" width="4" height="4"><circle cx="2" cy="2" r="1" fill="currentColor"/></pattern></defs><rect x="4" y="4" width="16" height="16" rx="3" fill="url(#dp)" stroke="currentColor" stroke-width="1.4"/></svg>' },
    ];
    const curStyle = single ? (single.fill === false ? 'none' : (single.fillStyle || 'solid')) : (multi ? null : (WB.fillEnabled ? WB.fillStyle : 'none'));
    styles.forEach(s => {
      const b = document.createElement('button'); b.className = 'fill-sw' + (curStyle === s.k ? ' active' : ''); b.innerHTML = s.svg;
      b.title = s.k;
      b.onclick = () => {
        const apply = sh => { if (s.k === 'none') { sh.fill = false; } else { sh.fill = true; sh.fillStyle = s.k; } };
        if (multi) { multi.forEach(sh => { if (shapeTypes.includes(sh.type)) apply(sh); }); commit(); }
        else if (single) { apply(single); commit(); }
        else { if (s.k === 'none') { WB.fillEnabled = false; } else { WB.fillEnabled = true; WB.fillStyle = s.k; } }
        updateProps();
      };
      fs.appendChild(b);
    });
    g.appendChild(fs); el.appendChild(g);
  }

  // text alignment
  if (showAlign) {
    sep();
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<div class="lbl">Alinear</div>`;
    const wrap = document.createElement('div'); wrap.className = 'aligns';
    const cur = single ? (single.align || 'center') : (multi ? null : WB.align);
    const icons = { left: 'align-left', center: 'align-center', right: 'align-right' };
    ['left', 'center', 'right'].forEach(a => {
      const b = document.createElement('button'); b.className = 'align-btn' + (cur === a ? ' active' : '');
      b.innerHTML = `<i data-lucide="${icons[a]}"></i>`;
      b.onclick = () => {
        if (multi) { multi.forEach(sh => { if (alignTypes.includes(sh.type)) sh.align = a; }); commit(); }
        else if (single) { single.align = a; commit(); } else WB.align = a;
        updateProps();
      };
      wrap.appendChild(b);
    });
    g.appendChild(wrap); el.appendChild(g);
  }

  // tamaño de letra para texto y notas (small/medium/large/xlarge)
  if (single && (single.type === 'text' || single.type === 'sticky')) {
    sep();
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<div class="lbl">Tamaño</div>`;
    const wrap = document.createElement('div'); wrap.className = 'sizes';
    const TFS = single.type === 'sticky' ? [14, 18, 24, 32] : [12, 20, 28, 42, 60];
    const curFs = single.fs || (single.type === 'sticky' ? 18 : 28);
    TFS.forEach((v, i) => {
      const dd = document.createElement('button'); dd.className = 'size-dot' + (curFs === v ? ' active' : '');
      const px = 6 + i * 3.4; dd.style.width = px + 'px'; dd.style.height = px + 'px';
      dd.title = v + ' px';
      dd.onclick = () => { single.fs = v; commit(); updateProps(); };
      wrap.appendChild(dd);
    });
    g.appendChild(wrap); el.appendChild(g);
  }

  // formato de texto: negrita / cursiva / subrayado + listas (solo texto)
  if (single && single.type === 'text') {
    sep();
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<div class="lbl">Formato</div>`;
    const row = document.createElement('div'); row.className = 'fmt-row';
    const mk = (key, label, styleCss) => {
      const b = document.createElement('button');
      b.className = 'fmt-btn' + (single[key] ? ' active' : '');
      b.innerHTML = `<span style="${styleCss}">${label}</span>`;
      b.onclick = () => { single[key] = !single[key]; commit(); updateProps(); };
      return b;
    };
    row.appendChild(mk('bold', 'B', 'font-weight:800'));
    row.appendChild(mk('italic', 'I', 'font-style:italic;font-weight:600'));
    row.appendChild(mk('underline', 'U', 'text-decoration:underline;font-weight:600'));
    g.appendChild(row);
    // lists
    const row2 = document.createElement('div'); row2.className = 'fmt-row'; row2.style.marginTop = '6px';
    const mkList = (val, icon) => {
      const b = document.createElement('button');
      b.className = 'fmt-btn' + ((single.list || 'none') === val ? ' active' : '');
      b.innerHTML = `<i data-lucide="${icon}"></i>`;
      b.onclick = () => { single.list = (single.list === val ? 'none' : val); commit(); updateProps(); };
      return b;
    };
    row2.appendChild(mkList('bullet', 'list'));
    row2.appendChild(mkList('number', 'list-ordered'));
    g.appendChild(row2);
    el.appendChild(g);
  }

  // letra (inner text of a shape): own size + color
  const innerTextTypes = ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];
  if (single && innerTextTypes.includes(single.type) && single.text) {
    sep();
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<div class="lbl">Letra</div>`;
    // text size dots
    const wrap = document.createElement('div'); wrap.className = 'sizes';
    const TFS = [18, 28, 42, 60];
    const curFs = single.textFs || 28;
    TFS.forEach((v, i) => {
      const dd = document.createElement('button'); dd.className = 'size-dot' + (curFs === v ? ' active' : '');
      const px = 6 + i * 4; dd.style.width = px + 'px'; dd.style.height = px + 'px';
      dd.onclick = () => { single.textFs = v; commit(); updateProps(); };
      wrap.appendChild(dd);
    });
    g.appendChild(wrap);
    // text color
    const sws = document.createElement('div'); sws.className = 'swatches'; sws.style.marginTop = '8px';
    const curTC = single.textColor || '#1d2128';
    PALETTE.forEach(c => {
      const s = document.createElement('button'); s.className = 'sw' + (c === curTC ? ' active' : '');
      s.style.background = c; if (c === '#ffffff') s.style.boxShadow = 'inset 0 0 0 1px #d6d9e0';
      s.onclick = () => { single.textColor = c; commit(); updateProps(); };
      sws.appendChild(s);
    });
    g.appendChild(sws);
    // negrita / cursiva para la letra interna
    const frow = document.createElement('div'); frow.className = 'fmt-row'; frow.style.marginTop = '8px';
    const mkf = (key, label, css) => {
      const b = document.createElement('button');
      b.className = 'fmt-btn' + (single[key] ? ' active' : '');
      b.innerHTML = `<span style="${css}">${label}</span>`;
      b.onclick = () => { single[key] = !single[key]; commit(); updateProps(); };
      return b;
    };
    frow.appendChild(mkf('textBold', 'B', 'font-weight:800'));
    frow.appendChild(mkf('textItalic', 'I', 'font-style:italic;font-weight:600'));
    g.appendChild(frow);
    el.appendChild(g);
  }

  if (window.lucide) lucide.createIcons({ nodes: el.querySelectorAll('i') });
}

/* ---------- top-right: backgrounds, theme, present ---------- */
function wireTopRight() {
  document.querySelectorAll('#bgSeg button').forEach(b => b.addEventListener('click', () => setBg(b.dataset.bg)));
  document.querySelectorAll('#themeSeg button').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  document.getElementById('presentBtn').addEventListener('click', openShare);
}
function setBg(bg) {
  WB.bg = bg; save();
  document.querySelectorAll('#bgSeg button').forEach(b => b.classList.toggle('active', b.dataset.bg === bg));
}
function setTheme(theme) {
  WB.theme = theme;
  document.body.className = theme === 'default' ? '' : 'theme-' + theme;
  document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

/* ---------- zoom ---------- */
function wireZoom() {
  document.getElementById('zoomIn').onclick = () => zoomAt(W / 2, H / 2, 1.2);
  document.getElementById('zoomOut').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.2);
  document.getElementById('zoomPct').onclick = () => { WB.cam.z = 1; updateZoomLabel(); save(); };
  document.getElementById('zoomFit').onclick = fitContent;
}
function updateZoomLabel() { const el = document.getElementById('zoomPct'); if (el) el.textContent = Math.round(WB.cam.z * 100) + '%'; }
function fitContent() {
  if (!WB.shapes.length) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  WB.shapes.forEach(s => { const b = getBounds(s); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
  const pad = 80; const z = Math.min((W - pad * 2) / (x2 - x1), (H - pad * 2) / (y2 - y1), 2);
  WB.cam.z = z; WB.cam.x = W / 2 - (x1 + x2) / 2 * z; WB.cam.y = H / 2 - (y1 + y2) / 2 * z;
  updateZoomLabel(); save();
}

/* ---------- cursor ---------- */
function updateCursor(force) {
  if (force) { cv.className = 'cursor-' + (force === 'grabbing' ? 'grabbing' : force); return; }
  let c = 'default';
  if (spaceDown || WB.tool === 'hand') c = 'grab';
  else if (['draw', 'highlight', 'line', 'arrow', 'rect', 'ellipse', 'diamond', 'triangle', 'eraser', 'laser'].includes(WB.tool)) c = 'draw';
  else if (WB.tool === 'text' || WB.tool === 'sticky') c = 'text';
  cv.className = 'cursor-' + c;
}

/* ---------- image ---------- */
function wireImageInput() {
  document.getElementById('imgInput').addEventListener('change', e => { if (e.target.files[0]) handleImageFile(e.target.files[0]); e.target.value = ''; });
}

/* ---------- context menu ---------- */
function wireContextMenu() {
  document.querySelectorAll('#ctxMenu button').forEach(b => b.addEventListener('click', () => { ctxAction(b.dataset.act); closeMenus(); }));
  window.addEventListener('pointerdown', e => { if (!e.target.closest('#ctxMenu')) closeMenus(); }, true);
}
function openContextMenu(x, y) {
  const m = document.getElementById('ctxMenu'); m.classList.add('open');
  m.style.left = Math.min(x, W - 200) + 'px'; m.style.top = Math.min(y, H - 220) + 'px';
}
function closeMenus() { document.getElementById('ctxMenu').classList.remove('open'); }
function ctxAction(a) {
  const s = selOne(); const many = WB.sel;
  if (!many.length) return;
  if (a === 'delete') { WB.shapes = WB.shapes.filter(x => !many.includes(x)); WB.sel = []; commit(); }
  else if (a === 'duplicate') { duplicateSelection(); }
  else if (a === 'front') { WB.shapes = WB.shapes.filter(x => !many.includes(x)).concat(many); commit(); }
  else if (a === 'back') { WB.shapes = many.concat(WB.shapes.filter(x => !many.includes(x))); commit(); }
  else if (a === 'edit' && s) {
    if (s.type === 'text') placeText({ x: s.x, y: s.y }, s);
    else if (s.type === 'sticky') placeSticky({ x: s.x, y: s.y }, s);
  }
}

/* ---------- double click to edit text/sticky ---------- */
function wireDblClick() {
  cv.addEventListener('dblclick', e => {
    const w = toWorld(e.clientX, e.clientY); const hit = hitTest(w.x, w.y);
    if (!hit) { WB.sel = []; setActiveTool('text'); placeText(w); return; }
    WB.sel = [hit];
    if (hit.type === 'text') placeText({ x: hit.x, y: hit.y }, hit);
    else if (hit.type === 'sticky') placeSticky({ x: hit.x, y: hit.y }, hit);
    else if (['rect','ellipse','diamond','triangle','line','arrow'].includes(hit.type)) placeShapeText(hit);
  });
}

/* ---------- share modal ---------- */
function wireShare() {
  document.getElementById('shareClose').onclick = closeShare;
  document.getElementById('shareCancel').onclick = closeShare;
  document.getElementById('shareModal').addEventListener('click', e => { if (e.target.id === 'shareModal') closeShare(); });
  document.getElementById('copyLink').onclick = () => {
    const inp = document.getElementById('shareUrl'); inp.select();
    navigator.clipboard && navigator.clipboard.writeText(inp.value);
    const b = document.getElementById('copyLink'); b.textContent = '¡Copiado!'; setTimeout(() => b.textContent = 'Copiar', 1400);
  };
  document.getElementById('startPresent').onclick = () => { closeShare(); enterViewer(); };
}
/* ---------- export PNG / JPG ---------- */
function exportImage(format) {
  if (!WB.shapes.length) { alert('La pizarra está vacía.'); return; }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  WB.shapes.forEach(s => { const b = getBounds(s); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
  const pad = 48;
  x1 -= pad; y1 -= pad; x2 += pad; y2 += pad;
  const cw = x2 - x1, ch = y2 - y1;
  const scale = Math.min(3, Math.max(1, 2400 / Math.max(cw, ch)));
  const oc = document.createElement('canvas');
  oc.width = Math.round(cw * scale); oc.height = Math.round(ch * scale);
  const octx = oc.getContext('2d');
  if (format === 'jpg' || WB.theme === 'pro') {
    octx.fillStyle = WB.theme === 'pro' ? '#1b1f29' : '#ffffff';
    octx.fillRect(0, 0, oc.width, oc.height);
  }
  octx.setTransform(scale, 0, 0, scale, -x1 * scale, -y1 * scale);
  const prev = ctx; ctx = octx;                 // drawShape measures with module ctx
  try { WB.shapes.forEach(s => drawShape(octx, s)); } finally { ctx = prev; }
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const data = oc.toDataURL(mime, 0.92);
  const a = document.createElement('a');
  const bn = (currentBoard().name || 'pizarra').replace(/[^\w\-]+/g, '_');
  a.download = `${bn}.${format}`; a.href = data; a.click();
  closeSidebar();
}

function openShare() {
  const board = currentBoard();
  // Save first so the board has a Directus id, then build link
  pushBoard(board).then(() => {
    const id = board._dirId || board.id;
    document.getElementById('shareUrl').value = `${location.origin}/#aula=${id}&vista=vivo&tema=${WB.theme || 'default'}`;
    document.getElementById('shareModal').classList.add('on');
  });
}
function closeShare() { document.getElementById('shareModal').classList.remove('on'); }

/* ---------- VIEWER (solo lectura, EN VIVO) ---------- */
const viewer = { cam: { x: 0, y: 0, z: 1 }, on: false, vcv: null, vctx: null, live: null, anim: null, drag: null };

function enterViewer() {
  viewer.on = true;
  document.getElementById('viewer').classList.add('on');
  viewer.cam = { ...WB.cam };
  viewer.vcv = document.getElementById('viewerCanvas');
  viewer.vctx = viewer.vcv.getContext('2d');
  sizeViewer();
  window.addEventListener('resize', sizeViewer);
  bindViewerNav();
  // hide the fake presenter cursor
  const pc = document.getElementById('pcursor'); if (pc) pc.style.display = 'none';
  // El espectador (abrió con enlace) NO puede salir al editor; solo el profesor que previsualiza.
  const exitBtn = document.getElementById('exitViewer');
  if (exitBtn) exitBtn.style.display = (typeof IS_SPECTATOR !== 'undefined' && IS_SPECTATOR) ? 'none' : '';
  startLivePolling();   // re-read board from server so viewers see real drawings
  viewerLoop();
}
function exitViewer() {
  viewer.on = false; document.getElementById('viewer').classList.remove('on');
  cancelAnimationFrame(viewer.anim); clearTimeout(viewer._demoT); clearInterval(viewer._poll);
}

/* Poll Directus every 2.5s and update the board the viewer sees */
function startLivePolling() {
  const board = currentBoard();
  const id = board && (board._dirId || board.id);
  if (!id) return;
  viewer._poll = setInterval(async () => {
    if (!viewer.on) return;
    const row = await fetchOneBoard(id);
    if (row && row.shapes) { WB.shapes = row.shapes; }
  }, 2500);
}
function sizeViewer() {
  if (!viewer.vcv) return;
  viewer.vcv.width = Math.floor(W * DPR); viewer.vcv.height = Math.floor(H * DPR);
  viewer.vcv.style.width = W + 'px'; viewer.vcv.style.height = H + 'px';
}
function bindViewerNav() {
  const c = viewer.vcv;
  c.onpointerdown = e => { viewer.drag = { sx: e.clientX, sy: e.clientY, cx: viewer.cam.x, cy: viewer.cam.y }; c.classList.add('grabbing'); };
  window.addEventListener('pointermove', e => { if (viewer.drag) { viewer.cam.x = viewer.drag.cx + (e.clientX - viewer.drag.sx); viewer.cam.y = viewer.drag.cy + (e.clientY - viewer.drag.sy); } });
  window.addEventListener('pointerup', () => { viewer.drag = null; c && c.classList.remove('grabbing'); });
  c.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.01); const nz = Math.max(0.1, Math.min(8, viewer.cam.z * f));
      const wx = (e.clientX - viewer.cam.x) / viewer.cam.z, wy = (e.clientY - viewer.cam.y) / viewer.cam.z;
      viewer.cam.z = nz; viewer.cam.x = e.clientX - wx * nz; viewer.cam.y = e.clientY - wy * nz;
    } else { viewer.cam.x -= e.deltaX; viewer.cam.y -= e.deltaY; }
  }, { passive: false });
  document.getElementById('exitViewer').onclick = exitViewer;
}
function viewerLoop() {
  if (!viewer.on) return;
  const c = viewer.cam, vctx = viewer.vctx;
  vctx.setTransform(DPR, 0, 0, DPR, 0, 0); vctx.clearRect(0, 0, W, H);
  drawBackground(vctx, c, WB.bg, W, H);
  vctx.setTransform(c.z * DPR, 0, 0, c.z * DPR, c.x * DPR, c.y * DPR);
  for (const s of WB.shapes) drawShape(vctx, s);
  if (viewer.live) drawShape(vctx, viewer.live);
  viewer.anim = requestAnimationFrame(viewerLoop);
}

/* Simulated presenter: moves cursor + draws live, looping, to demo the EN VIVO experience */
function startPresenterDemo() {
  const path = buildPresenterPath();
  let i = 0;
  const pc = document.getElementById('pcursor');
  function step() {
    if (!viewer.on) return;
    if (i >= path.length) { viewer.live = null; i = 0; viewer._demoT = setTimeout(step, 1200); return; }
    const node = path[i++];
    const sc = wToViewer(node.x, node.y);
    pc.style.transform = `translate(${sc.x}px, ${sc.y}px)`;
    if (node.draw) { if (!viewer.live) viewer.live = { type: 'draw', points: [], color: '#e0383e', size: 4 }; viewer.live.points.push({ x: node.x, y: node.y }); }
    else viewer.live = viewer.live && node.lift ? null : viewer.live;
    viewer._demoT = setTimeout(step, node.draw ? 26 : 360);
  }
  step();
}
function wToViewer(wx, wy) { return { x: wx * viewer.cam.z + viewer.cam.x, y: wy * viewer.cam.z + viewer.cam.y }; }
function buildPresenterPath() {
  const p = [];
  p.push({ x: 120, y: -60 }); p.push({ x: 320, y: -60 });
  // underline the 'Resultado' area
  const ux = 130, uy = 150;
  for (let t = 0; t <= 1; t += 0.04) p.push({ x: ux + t * 150, y: uy + Math.sin(t * 3) * 4, draw: true });
  p.push({ x: ux + 150, y: uy, lift: true });
  p.push({ x: 360, y: 70 });
  // circle around the sticky
  const cxx = 415, cyy = 75, rr = 120;
  for (let t = 0; t <= 1; t += 0.035) { const a = -1.6 + t * 6.4; p.push({ x: cxx + Math.cos(a) * rr, y: cyy + Math.sin(a) * rr * 0.85, draw: true }); }
  p.push({ x: cxx + rr, y: cyy, lift: true });
  p.push({ x: 200, y: 260 }); p.push({ x: -100, y: 100 });
  return p;
}
