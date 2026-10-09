// Winning-hand simulator engine (pure, no DOM): tiles -> scoring patterns + where each Tai comes from.
// Tile codes: m1..m9 characters 万 · p1..p9 dots 筒 · s1..s9 bamboo 索 · w1..w4 East/South/West/North · d1..d3 red 中 / green 發 / white 白
import { emptySelection, evaluateHand, selectionToList, byId } from './hand.js';
import { taiValue } from './rules.js';

export const SUITS = {
  m: { name: 'Characters', zh: '万', short: '万' },
  p: { name: 'Dots', zh: '筒', short: '筒' },
  s: { name: 'Bamboo', zh: '索', short: '索' },
  w: { name: 'Winds', zh: '风', short: '风' },
  d: { name: 'Dragons', zh: '箭', short: '箭' },
};
export const WIND_TILES = ['w1', 'w2', 'w3', 'w4'];
export const DRAGON_TILES = ['d1', 'd2', 'd3'];
export const TILE_NAMES = { w1: 'East 東', w2: 'South 南', w3: 'West 西', w4: 'North 北', d1: 'Red 中', d2: 'Green 發', d3: 'White 白' };
export const THIRTEEN = ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'w1', 'w2', 'w3', 'w4', 'd1', 'd2', 'd3'];
export const FLOWERS = [
  { n: 1, kind: 'flower', ch: '梅', name: 'Plum' }, { n: 2, kind: 'flower', ch: '兰', name: 'Orchid' },
  { n: 3, kind: 'flower', ch: '菊', name: 'Chrysanthemum' }, { n: 4, kind: 'flower', ch: '竹', name: 'Bamboo' },
  { n: 1, kind: 'season', ch: '春', name: 'Spring' }, { n: 2, kind: 'season', ch: '夏', name: 'Summer' },
  { n: 3, kind: 'season', ch: '秋', name: 'Autumn' }, { n: 4, kind: 'season', ch: '冬', name: 'Winter' },
];
export const ANIMALS = [
  { id: 'cat', emoji: '🐱', name: 'Cat' }, { id: 'mouse', emoji: '🐭', name: 'Mouse' },
  { id: 'rooster', emoji: '🐓', name: 'Rooster' }, { id: 'centipede', emoji: '🐛', name: 'Centipede' },
];

export const suitOf = (t) => t?.[0];
export const numOf = (t) => Number(t?.slice(1));
export const isHonour = (t) => t?.[0] === 'w' || t?.[0] === 'd';
export const isTerminal = (t) => !isHonour(t) && (numOf(t) === 1 || numOf(t) === 9);
export const tileName = (t) => TILE_NAMES[t] || `${numOf(t)} ${SUITS[suitOf(t)]?.zh || ''}`;

/** Tiles of one set: { type: 'chow' | 'pong' | 'kong', tile } — chow tile = lowest of the run. */
export function setTiles(set) {
  if (!set?.tile) return [];
  if (set.type === 'chow') { const s = suitOf(set.tile); const n = numOf(set.tile); return [0, 1, 2].map((i) => `${s}${n + i}`); }
  return Array(set.type === 'kong' ? 4 : 3).fill(set.tile);
}

export const blankHand = () => ({
  kind: 'normal',                 // 'normal' | 'sevenPairs' | 'thirteen' | 'limit'
  sets: [null, null, null, null], // { type, tile, open }
  pair: null,
  called: null,                   // true = called chow/pong/kong on a discard · false = all from the wall · null = not answered (no Concealed bonus)
  pairs: [null, null, null, null, null, null, null], // seven pairs
  thirteenDouble: null,           // which of the 13 is doubled
  limit: null,                    // manual premium hand id
  flowers: [], seasons: [], animals: [],
  kongWin: false, lastTile: false, robKong: false,
});

/** Every tile in the hand (no bonus tiles). */
export function allTiles(h) {
  if (h.kind === 'sevenPairs') return h.pairs.filter(Boolean).flatMap((t) => [t, t]);
  if (h.kind === 'thirteen') return h.thirteenDouble ? [...THIRTEEN, h.thirteenDouble] : [...THIRTEEN];
  if (h.kind === 'limit') return [];
  return [...h.sets.flatMap((s) => setTiles(s)), ...(h.pair ? [h.pair, h.pair] : [])];
}

/** Problems with the hand as built (empty = complete & legal). */
export function handProblems(h) {
  const out = [];
  if (h.kind === 'normal') {
    const empty = h.sets.filter((s) => !s).length + (h.pair ? 0 : 1);
    if (empty) out.push(`${empty} group${empty > 1 ? 's' : ''} still empty`);
    for (const s of h.sets) if (s?.type === 'chow' && (isHonour(s.tile) || numOf(s.tile) > 7)) out.push('A run must be 3 number tiles in a row');
  } else if (h.kind === 'sevenPairs') {
    const empty = h.pairs.filter((p) => !p).length; if (empty) out.push(`${empty} pair${empty > 1 ? 's' : ''} still empty`);
  } else if (h.kind === 'thirteen') { if (!h.thirteenDouble) out.push('Pick which tile is the pair'); }
  else if (h.kind === 'limit' && !h.limit) out.push('Pick the special hand');
  const count = {};
  for (const t of allTiles(h)) count[t] = (count[t] || 0) + 1;
  for (const [t, n] of Object.entries(count)) if (n > 4) out.push(`${tileName(t)} is used ${n} times — there are only 4`);
  return out;
}

const isOutside = (t) => isTerminal(t) || isHonour(t);
/** Does this set touch a 1, a 9 or an honour? Runs: only 1-2-3 and 7-8-9 do. */
const setOutside = (s) => (s.type === 'chow' ? numOf(s.tile) === 1 || numOf(s.tile) === 7 : isOutside(s.tile));

/**
 * Detect scoring patterns.
 * ctx: { seatWind 0-3, roundWind 0-3, selfDraw }
 * Returns { selection, sources: { [patternId]: { text, groups: [[tiles]] } }, name, notes[], problems[] }
 */
export function analyseHand(h, ctx = {}, rules = {}) {
  const sel = emptySelection();
  const src = {}; const notes = [];
  const why = (id, text, groups = []) => { src[id] = { text, groups }; };
  const problems = handProblems(h);
  const seatW = `w${(ctx.seatWind ?? 0) + 1}`; const roundW = `w${(ctx.roundWind ?? 0) + 1}`;
  const bonusCount = h.flowers.length + h.seasons.length;
  const hasBonus = bonusCount > 0 || h.animals.length > 0;

  if (h.kind === 'limit') { sel.limit = h.limit; why(h.limit, 'You picked this special hand.'); }
  else if (h.kind === 'thirteen') { sel.limit = 'thirteen'; why('thirteen', 'One of every 1, 9, wind and dragon plus a pair.', [[...THIRTEEN, h.thirteenDouble].filter(Boolean)]); }
  else if (h.kind === 'sevenPairs') {
    sel.base = 'sevenPairs'; why('sevenPairs', ctx.selfDraw ? 'Seven pairs, self-drawn.' : 'Seven pairs.', h.pairs.filter(Boolean).map((t) => [t, t]));
    why('sevenPairsSelf', 'Seven pairs, self-drawn.', h.pairs.filter(Boolean).map((t) => [t, t]));
  }

  const tiles = allTiles(h);
  const sets = h.kind === 'normal' ? h.sets.filter(Boolean) : [];
  const groups = sets.map(setTiles);
  const pongs = sets.filter((s) => s.type !== 'chow');

  if (h.kind === 'normal' && !problems.length) {
    const dragonSets = pongs.filter((s) => s.tile[0] === 'd');
    const windSets = pongs.filter((s) => s.tile[0] === 'w');
    const terminalsOnly = tiles.every((t) => isTerminal(t));
    const counts = {}; tiles.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    const suit = suitOf(tiles[0]);
    const nine = tiles.length === 14 && tiles.every((t) => suitOf(t) === suit && !isHonour(t)) && h.called === false
      && counts[`${suit}1`] >= 3 && counts[`${suit}9`] >= 3 && [2, 3, 4, 5, 6, 7, 8].every((n) => counts[`${suit}${n}`] >= 1);

    const kongSets = sets.filter((s) => s.type === 'kong');
    const GREEN = ['s2', 's3', 's4', 's6', 's8', 'd2'];
    // Every limit hand the tiles qualify for — the one worth the most Tai (under these rules) wins.
    const cands = [
      dragonSets.length === 3 && ['bigDragons', 'Three sets of dragons.', dragonSets.map(setTiles)],
      windSets.length === 4 && ['bigWinds', 'Sets of all four winds.', windSets.map(setTiles)],
      terminalsOnly && ['allTerminals', 'Only 1s and 9s, no honours.', [tiles]],
      nine && ['nineGates', '1-1-1-2-3-4-5-6-7-8-9-9-9 of one suit, all concealed.', [tiles]],
      tiles.every(isHonour) && ['allHonours', 'Only winds and dragons.', [tiles]],
      kongSets.length === 4 && ['allKongs', 'Four kongs.', kongSets.map(setTiles)],
      pongs.length === 4 && h.called === false && ctx.selfDraw && ['fourConcealed', 'Four pongs/kongs all from the wall, self-drawn.', pongs.map(setTiles)],
      tiles.every((t) => GREEN.includes(t)) && ['pureGreen', 'Only green tiles (bamboo 2-3-4-6-8 and 發).', [tiles]],
    ].filter(Boolean);
    if (cands.length) {
      const [id, text, g] = cands.reduce((a, b) => (taiValue(rules, b[0]) > taiValue(rules, a[0]) ? b : a));
      sel.limit = id; why(id, text, g);
      if (cands.length > 1) notes.push(`Also qualifies for ${cands.filter((c) => c[0] !== id).map((c) => byId[c[0]]?.name || c[0]).join(', ')} — only the highest limit hand counts.`);
    }
  }
  if (!sel.limit && bonusCount === 8) { sel.limit = 'eightFlowers'; sel.base = null; why('eightFlowers', 'All 8 flower & season tiles.'); }
  else if (!sel.limit && bonusCount === 7 && ctx.selfDraw) { sel.limit = 'sevenFlowers'; sel.base = null; why('sevenFlowers', '7 of the 8 flower & season tiles, self-drawn.'); }
  if (sel.limit) sel.base = null;

  // Base hand + colour (normal hands only, no limit hand). Every base hand the tiles qualify for is a candidate;
  // the one worth the most Tai (under these rules) counts — ties keep the first listed.
  if (h.kind === 'normal' && !problems.length && !sel.limit) {
    const chows = sets.filter((s) => s.type === 'chow');
    const cands = [];
    if (chows.length === 4) {
      const pairScores = h.pair[0] === 'd' || h.pair === seatW || h.pair === roundW;
      if (pairScores) notes.push(`Your pair (${tileName(h.pair)}) is a dragon or your wind, so the runs don't count as All Chow.`);
      else if (hasBonus) { cands.push(['allChow', 'All four groups are runs (1-2-3).', groups]); notes.push('Not Ping Hu because you have flowers/animals.'); }
      else cands.push(['pingHu', 'Four runs, a plain pair and no flowers/animals.', [...groups, [h.pair, h.pair]]]);
    } else if (pongs.length === 4) cands.push(['allPong', 'All four groups are 3 (or 4) of a kind.', pongs.map(setTiles)]);
    if (tiles.every((t) => isTerminal(t) || isHonour(t)) && tiles.some(isHonour)) cands.push(['halfTerminals', 'Only 1s, 9s, winds and dragons.', [tiles]]);
    if (sets.every(setOutside) && isOutside(h.pair)) {
      if (tiles.some(isHonour)) cands.push(['mixedOrphans', 'Every group and the pair has a 1, a 9 or an honour tile.', [...groups, [h.pair, h.pair]]]);
      else cands.push(['pureOrphans', 'Every group and the pair has a 1 or a 9, no honours.', [...groups, [h.pair, h.pair]]]);
    }
    if (cands.length) {
      const [id, text, g] = cands.reduce((a, b) => (taiValue(rules, b[0]) > taiValue(rules, a[0]) ? b : a));
      sel.base = id; why(id, text, g);
      if (cands.length > 1) notes.push(`Also qualifies for ${cands.filter((c) => c[0] !== id).map((c) => byId[c[0]]?.name || c[0]).join(', ')} — only the highest base hand counts.`);
    }
  }
  if ((h.kind === 'normal' || h.kind === 'sevenPairs') && !problems.length && !sel.limit) {
    const suits = new Set(tiles.filter((t) => !isHonour(t)).map(suitOf));
    const honours = tiles.some(isHonour);
    if (suits.size === 1 && !honours) { sel.suit = 'fullColour'; why('fullColour', `Every tile is ${SUITS[[...suits][0]].name} ${SUITS[[...suits][0]].zh}.`, [tiles]); }
    else if (suits.size === 1 && honours) { sel.suit = 'halfColour'; why('halfColour', `One suit (${SUITS[[...suits][0]].name}) plus winds/dragons.`, [tiles]); }
  }

  // Sets & winds (normal hands)
  if (h.kind === 'normal' && !problems.length && sel.limit !== 'bigDragons') {
    const dragonSets = pongs.filter((s) => s.tile[0] === 'd');
    if (dragonSets.length) { sel.counts.dragonPung = dragonSets.length; why('dragonPung', `${dragonSets.length} set${dragonSets.length > 1 ? 's' : ''} of dragons.`, dragonSets.map(setTiles)); }
    if (dragonSets.length === 2 && h.pair[0] === 'd') { sel.flags.smallDragons = true; why('smallDragons', 'Two dragon sets and a dragon pair.', [...dragonSets.map(setTiles), [h.pair, h.pair]]); }
  }
  if (h.kind === 'normal' && !problems.length && sel.limit !== 'bigWinds') {
    const seat = pongs.find((s) => s.tile === seatW); const round = pongs.find((s) => s.tile === roundW);
    const windSets = pongs.filter((s) => s.tile[0] === 'w');
    if (windSets.length === 3 && h.pair[0] === 'w') { sel.flags.smallWinds = true; why('smallWinds', 'Three wind sets and the fourth wind as your pair.', [...windSets.map(setTiles), [h.pair, h.pair]]); }
    if (seat) { sel.flags.seatWind = true; why('seatWind', `${tileName(seatW)} is your seat wind.`, [setTiles(seat)]); }
    if (round) { sel.flags.roundWind = true; why('roundWind', `${tileName(roundW)} is this round's wind.`, [setTiles(round)]); }
  }
  if (h.kind === 'normal' && !problems.length) {
    const straight = ['m', 'p', 's'].map((su) => [1, 4, 7].map((n) => sets.find((x) => x.type === 'chow' && x.tile === `${su}${n}`))).find((run) => run.every(Boolean));
    if (straight) { sel.flags.pureStraight = true; why('pureStraight', 'Runs 1-2-3, 4-5-6 and 7-8-9 of the same suit.', straight.map(setTiles)); }
    const kongs = sets.filter((s) => s.type === 'kong');
    if (kongs.length) { sel.counts.kong = kongs.length; why('kong', `${kongs.length} kong${kongs.length > 1 ? 's' : ''} (4 of a kind).`, kongs.map(setTiles)); }
    if (h.called === false) { sel.flags.concealed = true; why('concealed', 'You never called chow/pong/kong on a discard (all groups from the wall).'); }
    else if (h.called == null) notes.push('Concealed Hand not counted — answer “Did you call chow / pong / kong?” in step 3 if all your groups came from the wall.');
  }

  // Bonus tiles
  const seatNo = (ctx.seatWind ?? 0) + 1;
  if (!['eightFlowers', 'sevenFlowers'].includes(sel.limit)) {
    if (h.flowers.includes(seatNo)) { sel.flags.flower = true; why('flower', `Flower #${seatNo} matches your seat.`); }
    if (h.seasons.includes(seatNo)) { sel.flags.season = true; why('season', `Season #${seatNo} matches your seat.`); }
    const setsN = (h.flowers.length === 4 ? 1 : 0) + (h.seasons.length === 4 ? 1 : 0);
    if (setsN) { sel.counts.flowerSet = setsN; why('flowerSet', setsN === 2 ? 'All 4 flowers and all 4 seasons.' : 'A full set of 4 flowers or 4 seasons.'); }
    const other = [...h.flowers, ...h.seasons].filter((n) => n !== seatNo).length;
    if (other && !setsN) notes.push(`${other} flower/season tile${other > 1 ? 's' : ''} not matching your seat #${seatNo} — worth 0 Tai.`);
  }
  if (h.animals.length) {
    sel.counts.animal = h.animals.length; why('animal', `${h.animals.length} animal tile${h.animals.length > 1 ? 's' : ''}.`);
    const pairs = (h.animals.includes('cat') && h.animals.includes('mouse') ? 1 : 0) + (h.animals.includes('rooster') && h.animals.includes('centipede') ? 1 : 0);
    if (pairs) { sel.counts.animalPair = pairs; why('animalPair', pairs === 2 ? 'Both animal pairs.' : 'A matching animal pair.'); }
  }
  for (const [k, t] of [['kongWin', 'Won on the replacement tile after a kong.'], ['lastTile', 'Won on the last tile of the wall.'], ['robKong', 'Won by robbing a kong.']]) if (h[k]) { sel.flags[k] = true; why(k, t); }

  return { selection: sel, sources: src, notes, problems };
}

/** Full simulation: patterns + Tai + plain-language names. */
export function simulate(h, rules, ctx = {}) {
  const a = analyseHand(h, ctx, rules);
  const ev = evaluateHand(a.selection, rules, { selfDraw: !!ctx.selfDraw, sameWind: (ctx.seatWind ?? 0) === (ctx.roundWind ?? 0) });
  const items = ev.items.map((i) => ({ ...i, src: a.sources[i.id] || null }));
  const headline = items.filter((i) => ['pattern', 'variant', 'limit', 'colour'].includes(i.input)).map((i) => i.name);
  const patterns = selectionToList(a.selection).map((x) => (x.id === 'sevenPairs' && ctx.selfDraw ? { id: 'sevenPairsSelf', n: 1 } : x));
  const errors = a.problems.length ? a.problems : ev.errors;
  return { ...ev, items, errors, valid: !a.problems.length && ev.valid, headline, notes: a.notes, patterns, selection: a.selection };
}

/** Compact copy for storing with a request / event (no nested arrays — Firestore safe). */
export function packHand(h) {
  const o = { kind: h.kind };
  if (h.kind === 'normal') { o.sets = h.sets.map((s) => ({ type: s.type, tile: s.tile, open: !!s.open })); o.pair = h.pair; o.called = h.called ?? null; }
  if (h.kind === 'sevenPairs') o.pairs = [...h.pairs];
  if (h.kind === 'thirteen') o.thirteenDouble = h.thirteenDouble;
  if (h.kind === 'limit') o.limit = h.limit;
  o.flowers = [...h.flowers]; o.seasons = [...h.seasons]; o.animals = [...h.animals];
  return o;
}
