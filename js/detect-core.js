// On-phone tile detector — pure helpers (no DOM, testable in Node):
// class-name mapping, YOLO output decoding, NMS, and grouping 14 tiles into 4 sets + 1 pair.
import { blankHand, simulate, THIRTEEN, suitOf, numOf, isHonour } from './handcalc.js';

/* ---------- class names -> our tile codes ---------- */
// Our codes: m1-9 万, p1-9 筒, s1-9 索, w1-4 E S W N, d1 red 中, d2 green 發, d3 white 白,
// bonus: F1-F4 flowers, S1-S4 seasons, A:cat|mouse|rooster|centipede
const RIICHI_Z = { 1: 'w1', 2: 'w2', 3: 'w3', 4: 'w4', 5: 'd3', 6: 'd2', 7: 'd1' }; // 1z..7z = E S W N 白 發 中
const WORDS = { east: 'w1', south: 'w2', west: 'w3', north: 'w4', red: 'd1', zhong: 'd1', chun: 'd1', green: 'd2', fa: 'd2', hatsu: 'd2', white: 'd3', bai: 'd3', haku: 'd3',
  cat: 'A:cat', mouse: 'A:mouse', rat: 'A:mouse', rooster: 'A:rooster', cock: 'A:rooster', chicken: 'A:rooster', centipede: 'A:centipede',
  plum: 'F1', orchid: 'F2', chrysanthemum: 'F3', spring: 'S1', summer: 'S2', autumn: 'S3', fall: 'S3', winter: 'S4' };
const SUIT_WORD = { m: 'm', man: 'm', wan: 'm', character: 'm', characters: 'm', crack: 'm', p: 'p', pin: 'p', dot: 'p', dots: 'p', circle: 'p', circles: 'p', tong: 'p',
  s: 's', sou: 's', so: 's', bamboo: 's', bam: 's', bamboos: 's', stick: 's', tiao: 's', suo: 's' };

/** Map one model class name to our tile code (or null). `map` = optional explicit overrides. */
export function mapClass(name, map = {}) {
  if (map[name]) return map[name];
  const n = String(name).toLowerCase().trim().replace(/[\s_-]+/g, '');
  let m;
  if ((m = n.match(/^([0-9])([mps])r?$/))) return `${m[2]}${m[1] === '0' ? 5 : m[1]}`;        // 1m, 0p (red five)
  if ((m = n.match(/^([mps])([0-9])r?$/))) return `${m[1]}${m[2] === '0' ? 5 : m[2]}`;        // m1
  if ((m = n.match(/^([1-7])z$/)) || (m = n.match(/^z([1-7])$/))) return RIICHI_Z[m[1]];       // 1z / z1
  if ((m = n.match(/^f([1-8])$/))) return Number(m[1]) <= 4 ? `F${m[1]}` : `S${Number(m[1]) - 4}`; // f1-f4 flowers, f5-f8 seasons
  if ((m = n.match(/^(flower|season)s?([1-4])$/))) return `${m[1] === 'flower' ? 'F' : 'S'}${m[2]}`;
  if ((m = n.match(/^([a-z]+?)([1-9])$/)) && SUIT_WORD[m[1]]) return `${SUIT_WORD[m[1]]}${m[2]}`; // bamboo3, dot5
  if ((m = n.match(/^([1-9])([a-z]+)$/)) && SUIT_WORD[m[2]]) return `${SUIT_WORD[m[2]]}${m[1]}`; // 3bamboo
  const bare = n.replace(/(dragon|wind|tile)s?$/, '').replace(/^(dragon|wind)s?/, '');
  for (const [w, code] of Object.entries(WORDS)) if (bare === w || (w.length >= 4 && bare.startsWith(w))) return code;
  if (/^(we|ws|ww|wn)$/.test(n)) return { we: 'w1', ws: 'w2', ww: 'w3', wn: 'w4' }[n];
  if (/^(dr|dg|dw)$/.test(n)) return { dr: 'd1', dg: 'd2', dw: 'd3' }[n];
  return null;
}

/* ---------- YOLO output decoding ---------- */
const iou = (a, b) => {
  const x1 = Math.max(a.x1, b.x1); const y1 = Math.max(a.y1, b.y1); const x2 = Math.min(a.x2, b.x2); const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter || 1);
};
export function nms(boxes, thr = 0.5) {
  const out = [];
  for (const b of [...boxes].sort((x, y) => y.score - x.score)) if (!out.some((o) => iou(o, b) > thr)) out.push(b); // class-agnostic: one tile = one box
  return out;
}

/**
 * Decode a YOLO ONNX output.
 * - YOLOv8/11 style: dims [1, 4 + nc, N] (cx, cy, w, h, class scores…)
 * - end-to-end style (YOLOv10/26): dims [1, N, 6] (x1, y1, x2, y2, score, class)
 * lb = letterbox { scale, padX, padY } to map back to the original photo.
 */
export function decodeYolo(data, dims, { conf = 0.35, iouThr = 0.5, lb = { scale: 1, padX: 0, padY: 0 } } = {}) {
  const back = (x, y) => [(x - lb.padX) / lb.scale, (y - lb.padY) / lb.scale];
  let boxes = [];
  if (dims.length === 3 && dims[2] === 6) {
    const n = dims[1];
    for (let i = 0; i < n; i++) {
      const o = i * 6; const score = data[o + 4]; if (score < conf) continue;
      const [x1, y1] = back(data[o], data[o + 1]); const [x2, y2] = back(data[o + 2], data[o + 3]);
      boxes.push({ x1, y1, x2, y2, score, cls: Math.round(data[o + 5]) });
    }
    return nms(boxes, iouThr);
  }
  const [, ch, n] = dims; const nc = ch - 4;
  for (let i = 0; i < n; i++) {
    let best = -1; let score = 0;
    for (let c = 0; c < nc; c++) { const s = data[(4 + c) * n + i]; if (s > score) { score = s; best = c; } }
    if (score < conf) continue;
    const cx = data[i]; const cy = data[n + i]; const w = data[2 * n + i]; const h = data[3 * n + i];
    const [x1, y1] = back(cx - w / 2, cy - h / 2); const [x2, y2] = back(cx + w / 2, cy + h / 2);
    boxes.push({ x1, y1, x2, y2, score, cls: best });
  }
  return nms(boxes, iouThr);
}

/** Letterbox numbers for resizing a W×H photo into a size×size square. */
export function letterbox(w, h, size = 640) {
  const scale = Math.min(size / w, size / h);
  return { scale, padX: Math.round((size - w * scale) / 2), padY: Math.round((size - h * scale) / 2), w: Math.round(w * scale), h: Math.round(h * scale) };
}

/* ---------- tiles -> hand ---------- */
const order = (t) => ({ m: 0, p: 1, s: 2, w: 3, d: 4 }[suitOf(t)] * 10 + numOf(t));
export const sortTiles = (list) => [...list].sort((a, b) => order(a) - order(b));

/** Split detected codes into hand tiles and bonus tiles. */
export function splitDetections(codes) {
  const tiles = []; const flowers = []; const seasons = []; const animals = [];
  for (const c of codes) {
    if (!c) continue;
    if (c[0] === 'F') { const n = Number(c[1]); if (!flowers.includes(n)) flowers.push(n); }
    else if (c[0] === 'S' && c.length === 2 && c[1] >= '1' && c[1] <= '4' && c === c.toUpperCase()) { const n = Number(c[1]); if (!seasons.includes(n)) seasons.push(n); }
    else if (c.startsWith('A:')) { const a = c.slice(2); if (!animals.includes(a)) animals.push(a); }
    else tiles.push(c);
  }
  return { tiles: sortTiles(tiles), flowers, seasons, animals };
}

/** Every way to split the tiles into sets (chow / pong / kong) + exactly one pair. */
export function partitions(tiles, limit = 200) {
  const kongs = tiles.length - 14; if (kongs < 0 || kongs > 4) return [];
  const count = {}; for (const t of tiles) count[t] = (count[t] || 0) + 1;
  const keys = sortTiles(Object.keys(count));
  const out = [];
  const rec = (sets, pair, kLeft) => {
    if (out.length >= limit) return;
    const t = keys.find((k) => count[k] > 0);
    if (!t) { if (pair && kLeft === 0 && sets.length === 4) out.push({ sets: sets.map((s) => ({ ...s })), pair }); return; }
    if (count[t] >= 4 && kLeft > 0) { count[t] -= 4; rec([...sets, { type: 'kong', tile: t }], pair, kLeft - 1); count[t] += 4; }
    if (count[t] >= 3) { count[t] -= 3; rec([...sets, { type: 'pong', tile: t }], pair, kLeft); count[t] += 3; }
    if (!isHonour(t) && numOf(t) <= 7) {
      const t2 = `${suitOf(t)}${numOf(t) + 1}`; const t3 = `${suitOf(t)}${numOf(t) + 2}`;
      if (count[t2] > 0 && count[t3] > 0) { count[t]--; count[t2]--; count[t3]--; rec([...sets, { type: 'chow', tile: t }], pair, kLeft); count[t]++; count[t2]++; count[t3]++; }
    }
    if (!pair && count[t] >= 2) { count[t] -= 2; rec(sets, t, kLeft); count[t] += 2; }
  };
  rec([], null, kongs);
  return out;
}

/**
 * Best hand from detected codes: tries seven pairs, thirteen wonders and every 4-sets+pair split,
 * keeps the one worth the most Tai under `rules`. Returns { hand, tai, options, problem }.
 */
export function bestHand(codes, rules, ctx = {}) {
  const { tiles, flowers, seasons, animals } = splitDetections(codes);
  const base = { ...blankHand(), flowers, seasons, animals };
  const cands = [];
  for (const p of partitions(tiles)) cands.push({ ...base, kind: 'normal', sets: p.sets.map((s) => ({ ...s, open: false })), pair: p.pair });
  if (tiles.length === 14) {
    const count = {}; tiles.forEach((t) => { count[t] = (count[t] || 0) + 1; });
    const vals = Object.values(count);
    if (vals.length === 7 && vals.every((v) => v === 2)) cands.push({ ...base, kind: 'sevenPairs', pairs: Object.keys(count) });
    if (THIRTEEN.every((t) => count[t]) && Object.keys(count).length === 13) cands.push({ ...base, kind: 'thirteen', thirteenDouble: Object.keys(count).find((t) => count[t] === 2) });
  }
  if (!cands.length) {
    const problem = tiles.length < 14 ? `Only ${tiles.length} tiles found — 14 are needed (more with kongs).` : tiles.length > 18 ? `${tiles.length} tiles found — too many.` : 'These tiles do not make 4 groups + 1 pair. Check for a misread tile.';
    return { hand: null, tai: 0, options: 0, problem, tiles, bonus: { flowers, seasons, animals } };
  }
  let best = null;
  for (const h of cands) { const r = simulate(h, rules, ctx); if (!best || r.actual > best.tai) best = { hand: h, tai: r.actual }; }
  return { ...best, options: cands.length, problem: null, tiles, bonus: { flowers, seasons, animals } };
}
