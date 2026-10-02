// 📷 On-phone tile detector (BETA, testing only). Runs a YOLO ONNX model in the browser — free, no Google, offline after loading.
// Model files: models/tiles.onnx + models/tiles.json ({ "names": [...], "imgsz": 640, "map": { "<class>": "<code>" } })
import { mapClass, decodeYolo, letterbox, bestHand } from './detect-core.js';
import { tileName } from './handcalc.js';
import { selectionToList } from './hand.js';
import { tiles as tileRow, bonusTile } from './tileui.js';
import { openSim } from './sim.js';
import { prefs } from './prefs.js';
import { scanAvailable, scanHand } from './scan.js';
import { patternText } from './recap-core.js';
import { esc, toast, sheet, closeSheet, download } from './ui.js';
import { tile } from './tileui.js';

/* ---------- training photos (IndexedDB, this phone only) ---------- */
const DB = 'mjsg-train'; const STORE = 'photos';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function trainTx(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, mode); const out = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(out?.result ?? out); tx.onerror = () => rej(tx.error); }); }
const trainAll = () => trainTx('readonly', (s) => s.getAll());
const trainAdd = (x) => trainTx('readwrite', (s) => s.put(x));
const trainClear = () => trainTx('readwrite', (s) => s.clear());
let trainCount = null;
async function refreshTrainCount() { try { trainCount = (await trainAll()).length; } catch { trainCount = 0; } }

/** Reading order: rows top→bottom, then left→right. */
function readingOrder(boxes) {
  const h = boxes.length ? boxes.reduce((s, b) => s + (b.y2 - b.y1), 0) / boxes.length : 1;
  return [...boxes].sort((a, b) => { const dy = (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2; return Math.abs(dy) > h * 0.5 ? dy : a.x1 - b.x1; });
}
const PICK_GROUPS = [['万', ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']], ['筒', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']], ['索', ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']],
  ['Winds & dragons', ['w1', 'w2', 'w3', 'w4', 'd1', 'd2', 'd3']], ['Flowers & seasons', ['F1', 'F2', 'F3', 'F4', 'S1', 'S2', 'S3', 'S4']]];
const codeFace = (c) => (/^[FS]\d$/.test(c) ? bonusTile((c[0] === 'F' ? ['梅', '兰', '菊', '竹'] : ['春', '夏', '秋', '冬'])[c[1] - 1], c[1]) : c.startsWith('A:') ? `<span class="emo">🐾</span>` : tile(c));

const ORT_VER = '1.20.1';
const ORT_DIR = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
const LOG_KEY = 'mjsg-detect-log';
const st = { session: null, meta: null, source: '', conf: 0.25, busy: false, last: null };

const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; } };
const writeLog = (l) => { try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, 100))); } catch {} };

let ortP = null;
function loadOrt() {
  if (window.ort) return Promise.resolve(window.ort);
  ortP ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = ORT_DIR + 'ort.min.js';
    s.onload = () => { window.ort.env.wasm.wasmPaths = ORT_DIR; res(window.ort); };
    s.onerror = () => { ortP = null; rej(new Error('Could not download the AI runtime (onnxruntime-web). Check the internet connection.')); };
    document.head.appendChild(s);
  });
  return ortP;
}

function parseMeta(json) {
  let names = json?.names || [];
  if (!Array.isArray(names)) names = Object.keys(names).sort((a, b) => a - b).map((k) => json.names[k]);
  return { names, imgsz: Number(json?.imgsz) || 640, map: json?.map || {} };
}

async function loadModel(bytes, meta, source) {
  const ort = await loadOrt();
  st.session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  st.meta = meta; st.source = source;
}

async function runDetector(file) {
  const ort = await loadOrt();
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that photo')); i.src = url; });
    const size = st.meta.imgsz; const lb = letterbox(img.naturalWidth, img.naturalHeight, size);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(114,114,114)'; g.fillRect(0, 0, size, size);
    g.drawImage(img, lb.padX, lb.padY, lb.w, lb.h);
    const px = g.getImageData(0, 0, size, size).data; const area = size * size;
    const input = new Float32Array(3 * area);
    for (let i = 0; i < area; i++) { input[i] = px[i * 4] / 255; input[area + i] = px[i * 4 + 1] / 255; input[2 * area + i] = px[i * 4 + 2] / 255; }
    const t0 = performance.now();
    const out = await st.session.run({ [st.session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]) });
    const ms = Math.round(performance.now() - t0);
    const o = out[st.session.outputNames[0]];
    const boxes = decodeYolo(o.data, o.dims, { conf: st.conf, lb }).map((b) => {
      const raw = st.meta.names[b.cls] ?? `class ${b.cls}`;
      let code = mapClass(raw, st.meta.map);
      // Flowers/seasons were trained on few photos: an unsure flower is more often a number tile → use the 2nd guess.
      const altCode = b.alt >= 0 ? mapClass(st.meta.names[b.alt] ?? '', st.meta.map) : null;
      if (code && /^[FS]\d$/.test(code) && b.score < 0.6 && altCode && !/^[FS]\d$/.test(altCode) && b.altScore > 0.1) return { ...b, raw, code: altCode, swapped: code };
      return { ...b, raw, code };
    }).sort((a, b) => a.x1 - b.x1);
    return { img, boxes, ms };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

function drawBoxes(canvas, img, boxes) {
  const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  const g = canvas.getContext('2d'); g.drawImage(img, 0, 0, canvas.width, canvas.height);
  g.lineWidth = 2; g.font = 'bold 14px system-ui';
  for (const b of boxes) {
    const x = b.x1 * scale; const y = b.y1 * scale; const w = (b.x2 - b.x1) * scale; const h = (b.y2 - b.y1) * scale;
    const col = !b.code ? '#dc2626' : b.score < 0.5 || b.swapped ? '#d97706' : '#16a34a'; // red unknown · orange unsure · green sure
    g.strokeStyle = col; g.setLineDash(col === '#d97706' ? [6, 4] : []); g.strokeRect(x, y, w, h); g.setLineDash([]);
    const label = `${b.code ? b.code.startsWith('A:') ? b.code.slice(2) : /^[FS]\d$/.test(b.code) ? (b.code[0] === 'F' ? 'Flower ' : 'Season ') + b.code[1] : tileName(b.code) : b.raw} ${Math.round(b.score * 100)}%`;
    g.fillStyle = col; const tw = g.measureText(label).width + 6;
    g.fillRect(x + 1, y + 1, tw, 18); g.fillStyle = '#fff'; g.fillText(label + (b.swapped ? ' ?' : ''), x + 4, y + 15); // label inside the box
  }
}

const bonusHtml = (bn) => [...bn.flowers.map((n) => bonusTile(['梅', '兰', '菊', '竹'][n - 1], n)), ...bn.seasons.map((n) => bonusTile(['春', '夏', '秋', '冬'][n - 1], n)),
  ...bn.animals.map((a) => `<span class="emo">${{ cat: '🐱', mouse: '🐭', rooster: '🐓', centipede: '🐛' }[a] || '❓'}</span>`)].join('');

export function renderDetector($app) {
  const log = () => {
    const l = readLog(); const judged = l.filter((x) => x.ok != null); const good = judged.filter((x) => x.ok).length;
    const avg = l.length ? Math.round(l.reduce((s, x) => s + x.ms, 0) / l.length) : 0;
    return `<section class="card"><div class="row-between"><h2>📊 Test log</h2>${l.length ? '<button class="btn sm" data-clearlog>Clear</button>' : ''}</div>
      ${judged.length ? `<p><b class="${good / judged.length >= 0.9 ? 'pos' : 'neg'}">${good} / ${judged.length} correct (${Math.round((good / judged.length) * 100)}%)</b> · avg ${avg} ms on this phone</p>` : '<p class="small muted">Mark each test 👍 or 👎 to measure accuracy.</p>'}
      ${l.slice(0, 10).map((x) => `<div class="small logrow"><span>${x.ok == null ? '•' : x.ok ? '👍' : '👎'}</span> ${new Date(x.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · ${x.n} tiles · ${x.ms} ms${x.tai != null ? ` · ${x.tai} Tai` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</div>`).join('')}</section>`;
  };
  const draw = () => {
    const r = st.last;
    $app.innerHTML = `
      <div class="pagehead"><h1>📷 Tile detector <span class="tag">BETA</span></h1><p class="muted">Testing a free AI model that runs <b>on this phone</b> — no Google, no quota, works offline once loaded. Gemini stays the normal scan until testing is done.</p></div>
      <section class="card"><h2>1 · Model</h2>
        <p class="small">${st.session ? `✅ Loaded <b>${esc(st.source)}</b> · ${st.meta.names.length} tile classes · ${st.meta.imgsz}px` : '❌ No model loaded yet.'}</p>
        ${st.session && st.meta.names.some((n) => !mapClass(n, st.meta.map)) ? `<p class="small neg">Unknown class names (ignored): ${st.meta.names.filter((n) => !mapClass(n, st.meta.map)).map(esc).join(', ')}</p>` : ''}
        <div class="row-gap-h"><button class="btn" data-loadsite>⬇ Load from website</button>
          <label class="btn">📂 Model file from phone<input type="file" accept=".onnx,.json" multiple hidden data-modelfile /></label></div>
        <p class="small muted">Website model = <code>models/tiles.onnx</code> + <code>models/tiles.json</code> in the GitHub repo. Or pick both files from your phone.</p>
        <label class="field"><span>Confidence ${Math.round(st.conf * 100)}% <small class="muted">(lower = finds more tiles, more mistakes)</small></span><input type="range" min="10" max="90" step="5" value="${Math.round(st.conf * 100)}" data-conf /></label>
      </section>
      <section class="card"><h2>2 · Test a photo</h2>
        <label class="btn primary block big ${st.session && !st.busy ? '' : 'disabled'}">${st.busy ? '⏳ Detecting…' : '📷 Take / choose a photo of the hand'}<input type="file" accept="image/*" capture="environment" hidden data-photo /></label>
        <p class="small muted">Tips: lay the 14 tiles in one row, face up, good light, phone straight above.</p>
        ${r ? `<canvas class="detcanvas" id="detCanvas"></canvas>
          <p class="small muted">🟩 sure · 🟧 unsure (check it) · 🟥 unknown name</p><p class="small">Found <b>${r.boxes.length}</b> boxes in <b>${r.ms} ms</b>${r.boxes.some((b) => !b.code) ? ` · <span class="neg">${r.boxes.filter((b) => !b.code).length} unknown</span>` : ''}</p>
          <p class="q">Tiles found — <span class="small muted">tap a wrong one to fix it</span></p>
          <div class="fixrow">${readingOrder(r.boxes).map((b) => `<button data-fix="${r.boxes.indexOf(b)}" class="${b.fixed ? 'fixed' : b.score < 0.5 || b.swapped ? 'unsure' : ''}">${b.code ? codeFace(b.code) : '<span class="mj empty"></span>'}<small>${b.fixed ? '✏️' : Math.round(b.score * 100) + '%'}</small></button>`).join('')}</div>
          ${r.boxes.some((b) => b.fixed) ? `<p class="small">✏️ ${r.boxes.filter((b) => b.fixed).length} fixed by you</p>` : ''}
          <p class="small muted">Best grouping:</p><div class="handline">${tileRow(r.best.tiles)}</div>${bonusHtml(r.best.bonus) ? `<div class="handline bonus">${bonusHtml(r.best.bonus)}</div>` : ''}
          ${r.best.problem ? `<div class="perr">${esc(r.best.problem)}</div>` : `<p>✅ Makes a winning hand · best of ${r.best.options} grouping${r.best.options > 1 ? 's' : ''}: <b>${r.best.tai} Tai</b></p>`}
          <div class="row-gap-h wrap">${r.best.hand ? '<button class="btn primary" data-opensim>🧪 Open in simulator</button>' : ''}<button class="btn" data-fixsim>✏️ Fix in simulator</button>
            ${scanAvailable() ? `<button class="btn" data-gemini ${r.gem === 'busy' ? 'disabled' : ''}>🔁 Compare with Gemini</button>` : ''}</div>
          ${r.gem && r.gem !== 'busy' ? `<div class="scanres small"><b>Gemini</b> (${r.gem.ms ?? '–'} ms): ${r.gem.error ? `<span class="neg">${esc(r.gem.error)}</span>` : `
            ${r.gem.best ? `<div class="handline">${tileRow(r.gem.best.tiles)}</div>${bonusHtml(r.gem.best.bonus) ? `<div class="handline bonus">${bonusHtml(r.gem.best.bonus)}</div>` : ''}` : ''}
            ${r.gem.unknown?.length ? `<span class="neg">Not understood: ${esc(r.gem.unknown.join(', '))}</span><br>` : ''}
            ${r.gem.best?.hand ? `✅ ${r.gem.best.tiles.length} tiles · our engine: <b>${r.gem.best.tai} Tai</b>` : `<span class="neg">${esc(r.gem.best?.problem || '')}</span>`}
            <br><span class="muted">Gemini's own pattern guess: ${esc(patternText(r.gem.patterns || [], false) || 'none')}</span>
            ${r.gem.best?.hand ? '<br><button class="btn sm primary" data-gemsim>🧪 Use Gemini’s tiles in the simulator</button>' : ''}`}</div>` : ''}
          <div class="trainbox"><b>🎓 Teach the model your tiles</b>
            <p class="small muted">After fixing every wrong tile, save the photo. Only save when <b>every</b> tile has a box. Later, export the photos and add them to the Colab training.</p>
            <div class="row-gap-h wrap"><button class="btn" data-savetrain ${r.saved ? 'disabled' : ''}>${r.saved ? '✅ Saved' : '💾 Save as training photo'}</button></div></div>
          ${r.judged == null ? `<p class="q">Were the tiles read correctly?</p><div class="qopts two"><button data-judge="1">👍 Yes, all correct</button><button data-judge="0">👎 No, something wrong</button></div>` : `<p class="small muted">Saved to the test log ${r.judged ? '👍' : '👎'}</p>`}` : ''}
      </section>
      <section class="card"><h2>🎓 Training photos</h2>
        <p class="small">${trainCount == null ? 'Counting…' : `<b>${trainCount}</b> photo${trainCount === 1 ? '' : 's'} saved on this phone.`} About 30–50 photos of your own tiles makes a big difference.</p>
        <div class="row-gap-h wrap"><button class="btn primary" data-exporttrain ${trainCount ? '' : 'disabled'}>⬇ Export for training (.zip)</button>${trainCount ? '<button class="btn sm danger" data-cleartrain>Delete all</button>' : ''}</div>
        <p class="small muted">Then in Colab, run the “Add my own photos” cell and upload the zip before training.</p></section>
      ${log()}`;
    if (r) drawBoxes(document.getElementById('detCanvas'), r.img, r.boxes);
  };
  draw();
  if (trainCount == null) refreshTrainCount().then(draw);

  const ctx = () => ({ seatWind: 0, roundWind: 0, selfDraw: true });
  const setResult = (res) => {
    const best = bestHand(res.boxes.map((b) => b.code), prefs.rules, ctx());
    st.last = { ...res, best, judged: null, logAt: Date.now() };
    const l = readLog(); l.unshift({ at: st.last.logAt, n: res.boxes.length, ms: res.ms, tai: best.hand ? best.tai : null, ok: null }); writeLog(l);
  };
  const recompute = () => { const r = st.last; r.best = bestHand(r.boxes.map((b) => b.code), prefs.rules, ctx());
    const l = readLog(); const x = l.find((y) => y.at === r.logAt); if (x) { x.tai = r.best.hand ? r.best.tai : null; const f = r.boxes.filter((b) => b.fixed).length; x.note = f ? `${f} fixed` : ''; if (f && x.ok == null) { x.ok = false; r.judged = false; } } writeLog(l); };
  const fixSheet = (i) => {
    const b = st.last.boxes[i];
    sheet({ title: 'Which tile is it?', sub: `The model said: ${esc(b.raw)} (${Math.round(b.score * 100)}%)`,
      body: `${PICK_GROUPS.map(([n, list]) => `<p class="small muted">${n}</p><div class="choices">${list.map((c) => `<button data-pickfix="${c}" class="${b.code === c ? 'on' : ''}">${codeFace(c)}</button>`).join('')}</div>`).join('')}
        <button class="btn block danger" data-pickfix="">🗑 Not a tile (remove this box)</button>`,
      onMount(api) { api.el.addEventListener('click', (e) => { const t = e.target.closest('[data-pickfix]'); if (!t) return;
        if (t.dataset.pickfix === '') st.last.boxes.splice(i, 1); else Object.assign(st.last.boxes[i], { code: t.dataset.pickfix, fixed: true, swapped: false });
        st.last.saved = false; recompute(); closeSheet(); draw(); }); } });
  };
  const nameIndex = (code) => st.meta.names.findIndex((n) => mapClass(n, st.meta.map) === code);
  async function exportTraining() {
    const all = await trainAll(); if (!all.length) return;
    if (!window.JSZip) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the zip tool — check the internet connection.')); document.head.appendChild(s); });
    const zip = new window.JSZip();
    for (const p of all) {
      zip.file(`images/${p.id}.jpg`, p.blob);
      zip.file(`labels/${p.id}.txt`, p.boxes.map((b) => `${b.cls} ${(((b.x1 + b.x2) / 2) / p.w).toFixed(6)} ${(((b.y1 + b.y2) / 2) / p.h).toFixed(6)} ${((b.x2 - b.x1) / p.w).toFixed(6)} ${((b.y2 - b.y1) / p.h).toFixed(6)}`).join('\n'));
    }
    zip.file('names.json', JSON.stringify(st.meta?.names || all[0].names || []));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `my_tiles_${all.length}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Exported ${all.length} photos`);
  }
  const busy = async (fn) => { st.busy = true; draw(); try { await fn(); } catch (err) { console.error(err); toast(err.message || String(err)); } finally { st.busy = false; draw(); } };

  $app.onchange = async (e) => {
    const t = e.target;
    if (t.matches('[data-conf]')) { st.conf = Number(t.value) / 100; if (st.last?.file) busy(async () => setResult({ ...(await runDetector(st.last.file)), file: st.last.file })); else draw(); return; }
    if (t.matches('[data-modelfile]')) {
      const files = [...t.files]; const onnx = files.find((f) => /\.onnx$/i.test(f.name)); const json = files.find((f) => /\.json$/i.test(f.name));
      if (!onnx) return toast('Pick the .onnx model file (and its .json at the same time)');
      return busy(async () => { const meta = parseMeta(json ? JSON.parse(await json.text()) : {}); await loadModel(new Uint8Array(await onnx.arrayBuffer()), meta, onnx.name); if (!json) toast('No .json picked — tile names unknown'); });
    }
    if (t.matches('[data-photo]') && t.files[0]) { const file = t.files[0]; return busy(async () => setResult({ ...(await runDetector(file)), file })); }
  };
  $app.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fix !== undefined) return fixSheet(Number(b.dataset.fix));
    if (b.dataset.savetrain !== undefined) {
      const r = st.last; const bad = r.boxes.filter((x) => !x.code || nameIndex(x.code) < 0);
      if (bad.length) return toast('Some boxes have no valid tile — fix or remove them first');
      return busy(async () => {
        await trainAdd({ id: `p${r.logAt}`, blob: r.file, w: r.img.naturalWidth, h: r.img.naturalHeight, names: st.meta.names,
          boxes: r.boxes.map((x) => ({ x1: Math.max(0, x.x1), y1: Math.max(0, x.y1), x2: Math.min(r.img.naturalWidth, x.x2), y2: Math.min(r.img.naturalHeight, x.y2), cls: nameIndex(x.code) })) });
        r.saved = true; await refreshTrainCount(); toast('Saved as a training photo');
      });
    }
    if (b.dataset.exporttrain !== undefined) return busy(exportTraining);
    if (b.dataset.cleartrain !== undefined) { if (!confirm('Delete all saved training photos on this phone?')) return; await trainClear(); await refreshTrainCount(); return draw(); }
    if (b.dataset.loadsite !== undefined) return busy(async () => {
      const [m, j] = await Promise.all([fetch('models/tiles.onnx'), fetch('models/tiles.json')]);
      if (!m.ok) throw new Error('models/tiles.onnx is not on the website yet — train it with tools/train_tile_detector.ipynb, or pick the file from your phone.');
      await loadModel(new Uint8Array(await m.arrayBuffer()), parseMeta(j.ok ? await j.json() : {}), 'models/tiles.onnx');
    });
    if (b.dataset.opensim !== undefined || b.dataset.fixsim !== undefined) {
      const r = st.last; const hand = r.best.hand || { kind: 'normal', ...r.best.bonus };
      return openSim({ mode: 'calc', initialHand: hand, seatWind: 0, roundWind: 0 });
    }
    if (b.dataset.gemsim !== undefined) return openSim({ mode: 'calc', initialHand: st.last.gem.best.hand, seatWind: 0, roundWind: 0 });
    if (b.dataset.gemini !== undefined) {
      const r = st.last; r.gem = 'busy'; draw(); const t0 = performance.now();
      try { const g = await scanHand(r.file, { seatWind: 'East', seatNo: 1 }); r.gem = { patterns: selectionToList(g.selection), tiles: g.tiles, ms: Math.round(performance.now() - t0) };
        // Let OUR engine score Gemini's tile list (Gemini reads tiles well but is less reliable at picking patterns).
        const codes = (g.tiles || []).map((t) => mapClass(t)); r.gem.unknown = (g.tiles || []).filter((t, i) => !codes[i]);
        r.gem.best = bestHand(codes.filter(Boolean), prefs.rules, ctx()); }
      catch (err) { r.gem = { error: err.message }; }
      return draw();
    }
    if (b.dataset.judge !== undefined) {
      const ok = b.dataset.judge === '1'; st.last.judged = ok;
      const l = readLog(); const x = l.find((y) => y.at === st.last.logAt); if (x) x.ok = ok; writeLog(l); return draw();
    }
    if (b.dataset.clearlog !== undefined) { writeLog([]); return draw(); }
  };
}
