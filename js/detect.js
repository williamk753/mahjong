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
import { esc, toast } from './ui.js';

const ORT_VER = '1.20.1';
const ORT_DIR = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
const LOG_KEY = 'mjsg-detect-log';
const st = { session: null, meta: null, source: '', conf: 0.35, busy: false, last: null };

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
      return { ...b, raw, code: mapClass(raw, st.meta.map) };
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
    g.strokeStyle = b.code ? '#16a34a' : '#dc2626'; g.strokeRect(x, y, w, h);
    const label = `${b.code ? b.code.startsWith('A:') ? b.code.slice(2) : /^[FS]\d$/.test(b.code) ? (b.code[0] === 'F' ? 'Flower ' : 'Season ') + b.code[1] : tileName(b.code) : b.raw} ${Math.round(b.score * 100)}%`;
    g.fillStyle = b.code ? '#16a34a' : '#dc2626'; const tw = g.measureText(label).width + 6;
    g.fillRect(x, Math.max(0, y - 18), tw, 18); g.fillStyle = '#fff'; g.fillText(label, x + 3, Math.max(13, y - 5));
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
          <p class="small">Found <b>${r.boxes.length}</b> boxes in <b>${r.ms} ms</b>${r.boxes.some((b) => !b.code) ? ` · <span class="neg">${r.boxes.filter((b) => !b.code).length} unknown</span>` : ''}</p>
          <div class="handline">${tileRow(r.best.tiles)}</div>${bonusHtml(r.best.bonus) ? `<div class="handline bonus">${bonusHtml(r.best.bonus)}</div>` : ''}
          ${r.best.problem ? `<div class="perr">${esc(r.best.problem)}</div>` : `<p>✅ Makes a winning hand · best of ${r.best.options} grouping${r.best.options > 1 ? 's' : ''}: <b>${r.best.tai} Tai</b></p>`}
          <div class="row-gap-h wrap">${r.best.hand ? '<button class="btn primary" data-opensim>🧪 Open in simulator</button>' : ''}<button class="btn" data-fixsim>✏️ Fix in simulator</button>
            ${scanAvailable() ? `<button class="btn" data-gemini ${r.gem === 'busy' ? 'disabled' : ''}>🔁 Compare with Gemini</button>` : ''}</div>
          ${r.gem && r.gem !== 'busy' ? `<div class="scanres small"><b>Gemini:</b> ${r.gem.error ? `<span class="neg">${esc(r.gem.error)}</span>` : `${esc(patternText(r.gem.patterns || [], false) || 'no patterns')} · ${r.gem.ms} ms${r.gem.tiles?.length ? `<br>Tiles: ${esc(r.gem.tiles.join(', '))}` : ''}`}</div>` : ''}
          ${r.judged == null ? `<p class="q">Were the tiles read correctly?</p><div class="qopts two"><button data-judge="1">👍 Yes, all correct</button><button data-judge="0">👎 No, something wrong</button></div>` : `<p class="small muted">Saved to the test log ${r.judged ? '👍' : '👎'}</p>`}` : ''}
      </section>
      ${log()}`;
    if (r) drawBoxes(document.getElementById('detCanvas'), r.img, r.boxes);
  };
  draw();

  const ctx = () => ({ seatWind: 0, roundWind: 0, selfDraw: true });
  const setResult = (res) => {
    const best = bestHand(res.boxes.map((b) => b.code), prefs.rules, ctx());
    st.last = { ...res, best, judged: null, logAt: Date.now() };
    const l = readLog(); l.unshift({ at: st.last.logAt, n: res.boxes.length, ms: res.ms, tai: best.hand ? best.tai : null, ok: null }); writeLog(l);
  };
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
    if (b.dataset.loadsite !== undefined) return busy(async () => {
      const [m, j] = await Promise.all([fetch('models/tiles.onnx'), fetch('models/tiles.json')]);
      if (!m.ok) throw new Error('models/tiles.onnx is not on the website yet — train it with tools/train_tile_detector.ipynb, or pick the file from your phone.');
      await loadModel(new Uint8Array(await m.arrayBuffer()), parseMeta(j.ok ? await j.json() : {}), 'models/tiles.onnx');
    });
    if (b.dataset.opensim !== undefined || b.dataset.fixsim !== undefined) {
      const r = st.last; const hand = r.best.hand || { kind: 'normal', ...r.best.bonus };
      return openSim({ mode: 'calc', initialHand: hand, seatWind: 0, roundWind: 0 });
    }
    if (b.dataset.gemini !== undefined) {
      const r = st.last; r.gem = 'busy'; draw(); const t0 = performance.now();
      try { const g = await scanHand(r.file, { seatWind: 'East', seatNo: 1 }); r.gem = { patterns: selectionToList(g.selection), tiles: g.tiles, ms: Math.round(performance.now() - t0) }; }
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
