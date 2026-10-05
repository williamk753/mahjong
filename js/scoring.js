// Singapore / Sear Mahjong scoring engine (pure functions, no DOM, no network).
// All amounts are integer "units" (chips). Money = units x table unit value.

export const PLAYERS = 4;
export const MAX_TAI = 5;

export const DEFAULT_SETTINGS = {
  minTai: 1,                 // minimum Tai to win
  taiCap: MAX_TAI,           // Tai cap (base = 2^min(Tai, cap))
  // Instant payouts: points EACH opponent pays the receiver
  exposedKong: 2,            // 明杠 / 碰杠
  concealedKong: 4,          // 暗杠
  flowerSet: 4,              // 一堂花: all 4 flowers or all 4 seasons
  flowerPair: 2,             // 正花正季: own-seat flower + season
  animalPair: 2,             // 猫鼠 / 鸡蜈蚣: matching animal pair
  animalSet: 4,              // all four animals
  baoMultiplier: 6,          // 包赔: responsible player pays N x base alone
};

export const INSTANT_KINDS = {
  exposedKong: { label: 'Exposed kong', zh: '明杠 / 碰杠', icon: '🀫', kong: true },
  concealedKong: { label: 'Concealed kong', zh: '暗杠', icon: '🀫', kong: true },
  flowerSet: { label: 'Complete flower / season set', zh: '一堂花', icon: '🌸' },
  flowerPair: { label: 'Matched flower + season pair', zh: '正花正季', icon: '🌼', fromDeal: true },
  animalPair: { label: 'Animal pair (cat + mouse or rooster + centipede)', zh: '猫鼠 / 鸡蜈蚣', icon: '🐱', fromDeal: true },
  animalSet: { label: 'All four animals', zh: '四动物', icon: '🐓' },
};

export const BAO_REASONS = {
  eighthFlower: { label: 'Fed the 8th bonus tile', zh: '打出第八张花' },
  thirdDragon: { label: 'Discarded the 3rd dragon', zh: '包大三元' },
  fourthWind: { label: 'Discarded the 4th wind', zh: '包大四喜' },
  toCap: { label: 'Fed a tile that reaches the Tai cap', zh: '包台 (喂饱满台)' },
  fullColour: { label: 'Completed an exposed full colour', zh: '包清一色' },
  finalWall: { label: 'Fresh tile in the final wall', zh: '过水 / 底牌鲜牌点炮' },
  other: { label: 'Other house rule', zh: '' },
};

/** Base points = 2^Tai, Tai clamped to [0, cap] (default cap 5). */
export function basePoints(tai, cap = MAX_TAI) {
  const t = clampTai(tai, cap);
  return 2 ** t;
}

export function clampTai(tai, cap = MAX_TAI) {
  const n = Math.floor(Number(tai) || 0);
  return Math.max(0, Math.min(cap, n));
}

function zeros() {
  return Array(PLAYERS).fill(0);
}

function assertSeat(i, name) {
  if (!Number.isInteger(i) || i < 0 || i >= PLAYERS) throw new Error(`Invalid ${name}`);
}

/**
 * Win payout.
 * - Discard win: shooter pays 2 x base, the other two pay 1 x base each.
 * - Self-draw: all three pay 2 x base.
 */
export function winDeltas({ winner, shooter = null, selfDraw = false, tai, cap = MAX_TAI, baoBy = null, baoMultiplier = DEFAULT_SETTINGS.baoMultiplier }) {
  assertSeat(winner, 'winner');
  const base = basePoints(tai, cap);
  const d = zeros();
  if (baoBy !== null && baoBy !== undefined) {
    // Pay-all (包赔): the responsible player pays for everyone, the other two pay nothing.
    assertSeat(baoBy, 'responsible player');
    if (baoBy === winner) throw new Error('The responsible player cannot be the winner');
    const amt = Math.max(1, Math.floor(baoMultiplier)) * base;
    d[baoBy] -= amt; d[winner] += amt;
    return d;
  }
  if (selfDraw) {
    for (let i = 0; i < PLAYERS; i++) if (i !== winner) { d[i] -= 2 * base; d[winner] += 2 * base; }
  } else {
    assertSeat(shooter, 'shooter');
    if (shooter === winner) throw new Error('Shooter cannot be the winner');
    for (let i = 0; i < PLAYERS; i++) {
      if (i === winner) continue;
      const pay = i === shooter ? 2 * base : base;
      d[i] -= pay; d[winner] += pay;
    }
  }
  return d;
}

/** Instant payout: every opponent pays settings[kind] to the receiver (×2 when held from the deal, for kinds that allow it). */
export function instantDeltas({ player, kind, fromDeal = false }, settings = DEFAULT_SETTINGS) {
  assertSeat(player, 'player');
  if (!INSTANT_KINDS[kind]) throw new Error('Unknown payout type');
  const amt = Math.floor(Number({ ...DEFAULT_SETTINGS, ...settings }[kind])) * (fromDeal && INSTANT_KINDS[kind].fromDeal ? 2 : 1);
  if (!(amt >= 0)) throw new Error('Invalid payout amount');
  const d = zeros();
  for (let i = 0; i < PLAYERS; i++) if (i !== player) { d[i] -= amt; d[player] += amt; }
  return d;
}

const LEGACY_KONG = { concealedKong: 2, exposedKong: 1, addedKong: 1, exposedKongDiscarderPaysAll: false };

/**
 * Legacy instant Kong payout (kept for old tables' history).
 * kind: 'concealed' | 'exposed' | 'added'
 */
export function kongDeltas({ player, kind, from = null }, settings = LEGACY_KONG) {
  assertSeat(player, 'player');
  const s = { ...LEGACY_KONG, ...settings };
  const d = zeros();
  const eachPays = (amt) => {
    for (let i = 0; i < PLAYERS; i++) if (i !== player) { d[i] -= amt; d[player] += amt; }
  };
  if (kind === 'concealed') eachPays(s.concealedKong);
  else if (kind === 'added') eachPays(s.addedKong);
  else if (kind === 'exposed') {
    if (s.exposedKongDiscarderPaysAll) {
      assertSeat(from, 'discarder');
      if (from === player) throw new Error('Discarder cannot be the kong player');
      const amt = s.exposedKong * (PLAYERS - 1);
      d[from] -= amt; d[player] += amt;
    } else eachPays(s.exposedKong);
  } else throw new Error('Unknown kong type');
  return d;
}

/** Instant bonus (e.g. animal/flower bite): from one player, or from everyone if from === null. */
export function bonusDeltas({ player, units, from = null }) {
  assertSeat(player, 'player');
  const u = Math.floor(Number(units));
  if (!(u > 0)) throw new Error('Units must be a positive whole number');
  const d = zeros();
  if (from === null || from === undefined || from === '') {
    for (let i = 0; i < PLAYERS; i++) if (i !== player) { d[i] -= u; d[player] += u; }
  } else {
    assertSeat(from, 'payer');
    if (from === player) throw new Error('Payer cannot be the receiver');
    d[from] -= u; d[player] += u;
  }
  return d;
}

/** Manual multi-player adjustment: any integer deltas that sum to zero. */
export function manualDeltas(deltas) {
  if (!Array.isArray(deltas) || deltas.length !== PLAYERS) throw new Error('Need 4 values');
  const d = deltas.map((x) => Math.trunc(Number(x) || 0));
  if (d.every((x) => x === 0)) throw new Error('Nothing to adjust');
  const s = d.reduce((a, b) => a + b, 0);
  if (s !== 0) throw new Error(`Adjustments must add up to 0 (now ${s > 0 ? '+' : ''}${s})`);
  return d;
}

/** Manual zero-sum correction: payer -> receiver. */
export function adjustDeltas({ from, to, units }) {
  assertSeat(from, 'payer'); assertSeat(to, 'receiver');
  if (from === to) throw new Error('Payer and receiver must differ');
  const u = Math.floor(Number(units));
  if (!(u > 0)) throw new Error('Units must be a positive whole number');
  const d = zeros();
  d[from] -= u; d[to] += u;
  return d;
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/**
 * Zero-sum audit over all events.
 * Returns balances (units), per-event problems, and overall status.
 */
export function audit(events) {
  const balances = zeros();
  const problems = [];
  let active = 0, voided = 0, hands = 0;
  for (const ev of events) {
    if (ev.voided) { voided++; continue; }
    const d = ev.deltas;
    if (!Array.isArray(d) || d.length !== PLAYERS || !d.every(Number.isInteger)) {
      problems.push({ id: ev.id, reason: 'Malformed deltas' });
      continue;
    }
    const s = sum(d);
    if (s !== 0) { problems.push({ id: ev.id, reason: `Event sums to ${s}, not 0` }); continue; }
    active++;
    if (ev.type === 'win' || ev.type === 'draw') hands++;
    for (let i = 0; i < PLAYERS; i++) balances[i] += d[i];
  }
  const total = sum(balances);
  return { balances, total, balanced: total === 0 && problems.length === 0, problems, active, voided, hands };
}

/** Minimal-ish list of transfers to settle balances (greedy). */
export function settlement(balances) {
  const cred = [], debt = [];
  balances.forEach((b, i) => { if (b > 0) cred.push([i, b]); else if (b < 0) debt.push([i, -b]); });
  cred.sort((a, b) => b[1] - a[1]); debt.sort((a, b) => b[1] - a[1]);
  const out = [];
  let ci = 0, di = 0;
  while (ci < cred.length && di < debt.length) {
    const amt = Math.min(cred[ci][1], debt[di][1]);
    out.push({ from: debt[di][0], to: cred[ci][0], units: amt });
    cred[ci][1] -= amt; debt[di][1] -= amt;
    if (cred[ci][1] === 0) ci++;
    if (debt[di][1] === 0) di++;
  }
  return out;
}

export function formatMoney(units, unitValue, currency = '$') {
  const cents = Math.round(units * unitValue * 100);
  const sign = cents < 0 ? '-' : cents > 0 ? '+' : '';
  return `${sign}${currency}${(Math.abs(cents) / 100).toFixed(2)}`;
}
