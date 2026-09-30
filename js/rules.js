// House rules: thresholds, dealer rules, kong payouts and per-pattern Tai values.
import { MAX_TAI, DEFAULT_SETTINGS } from './scoring.js';

export const CATEGORIES = {
  base: 'Base hands',
  sets: 'Sets & winds',
  bonus: 'Bonus & flowers',
  special: 'Special wins',
  limit: 'Fixed & limit hands',
};

// input: pattern (pick one) | colour (pick one) | count (0..max) | flag (yes/no) | limit (always = cap)
export const TAI_CATALOG = [
  { id: 'chicken', cat: 'base', input: 'pattern', name: 'Chicken Hand', zh: '鸡糊', def: 0, desc: 'No scoring pattern of any kind. Not a valid win when minimum Tai is 1 or more.' },
  { id: 'allChow', cat: 'base', input: 'pattern', name: 'All Chow', zh: '吃吃胡 (顺子胡)', def: 1, desc: 'Every set is a chow. The pair may be any tile except dragons or scoring winds. Flowers allowed.' },
  { id: 'pingHu', cat: 'base', input: 'pattern', name: 'Ping Hu (Zero Flowers)', zh: '平胡 (无花)', def: 4, desc: 'Pure Ping Hu: 4 chows + neutral pair + two-sided wait, with zero flowers/animals. With flowers it scores as All Chow + flowers.' },
  { id: 'allPong', cat: 'base', input: 'pattern', name: 'All Pong', zh: '对对胡 (碰碰胡)', def: 2, desc: 'Every set is a pong or kong, plus one pair.' },
  { id: 'sevenPairs', cat: 'base', input: 'pattern', name: 'Seven Pairs', zh: '七对子', def: 2, desc: 'Seven pairs, won off a discard. Stacks with half / full colour.' },
  { id: 'sevenPairsSelf', cat: 'base', input: 'variant', name: 'Seven Pairs — self-draw', zh: '七对子 自摸', def: 7, desc: 'Seven pairs won by self-draw (effective Tai is still limited by the cap).' },
  { id: 'halfColour', cat: 'base', input: 'colour', name: 'Half Color (Hun Yi Se)', zh: '混一色', def: 2, desc: 'One numbered suit together with honour tiles (winds and/or dragons).' },
  { id: 'fullColour', cat: 'base', input: 'colour', name: 'Full Color (Qing Yi Se)', zh: '清一色', def: 4, desc: 'One numbered suit only. No honours.' },
  { id: 'halfTerminals', cat: 'base', input: 'pattern', name: 'Half Terminals', zh: '混么九', def: 4, desc: 'Only terminal number tiles (1 and 9) and honour tiles.' },
  { id: 'concealed', cat: 'sets', input: 'flag', name: 'Concealed Hand', zh: '门清', def: 1, desc: 'Won with no exposed melds (no claimed chow, pong or exposed kong).' },
  { id: 'kong', cat: 'sets', input: 'count', max: 4, name: 'Kong / Gang (4 of a kind)', zh: '杠牌 (明杠/暗杠)', def: 1, desc: 'Each exposed or concealed kong in the winning hand.' },

  { id: 'dragonPung', cat: 'sets', input: 'count', max: 3, name: 'Dragon Pong / Kong', zh: '红中 / 发财 / 白板 刻', def: 1, desc: 'Each pong or kong of red 中, green 發 or white 白 dragons.' },
  { id: 'seatWind', cat: 'sets', input: 'flag', name: 'Seat Wind Pong / Kong', zh: '门风刻 (本命风)', def: 1, desc: 'Pong or kong of your own seat wind.' },
  { id: 'roundWind', cat: 'sets', input: 'flag', name: 'Prevailing Wind Pong / Kong', zh: '圈风刻 (场风)', def: 1, desc: 'Pong or kong of the round (prevailing) wind.' },
  { id: 'smallDragons', cat: 'sets', input: 'flag', name: 'Small Three Dragons', zh: '小三元', def: 1, desc: 'Two dragon pongs + a dragon pair. Added on top of the dragon pongs.' },

  { id: 'flower', cat: 'bonus', input: 'flag', name: 'Matched Seat Flower', zh: '正花 (本命花)', def: 1, desc: 'Your seat’s flower: 1 East 梅, 2 South 兰, 3 West 菊, 4 North 竹.' },
  { id: 'season', cat: 'bonus', input: 'flag', name: 'Matched Seat Season', zh: '正季 (本命季)', def: 1, desc: 'Your seat’s season: 1 East 春, 2 South 夏, 3 West 秋, 4 North 冬.' },
  { id: 'flowerSet', cat: 'bonus', input: 'count', max: 2, name: 'Complete 4-Flower or 4-Season Set', zh: '一堂花 (一台四花)', def: 1, desc: 'All four flowers or all four seasons (extra Tai).' },
  { id: 'animal', cat: 'bonus', input: 'count', max: 4, name: 'Animal Bonus Tile', zh: '动物花牌', def: 1, desc: 'Each animal: cat, mouse, cockerel, centipede.' },
  { id: 'animalPair', cat: 'bonus', input: 'count', max: 2, name: 'Matched Animal Pair', zh: '一对动物 (猫鼠 / 鸡蜈蚣)', def: 2, desc: 'Cat + mouse, or cockerel + centipede.' },

  { id: 'kongWin', cat: 'special', input: 'flag', name: 'Win on Kong Replacement', zh: '杠上开花', def: 1, desc: 'Winning with the replacement tile drawn after a kong.' },
  { id: 'lastTile', cat: 'special', input: 'flag', name: 'Win on the Last Tile', zh: '海底捞月', def: 1, desc: 'Winning on the very last tile of the wall.' },
  { id: 'robKong', cat: 'special', input: 'flag', name: 'Robbing the Kong', zh: '抢杠', def: 1, desc: 'Winning with the tile another player adds to a pong to make a kong.' },

  ...[
    ['bigDragons', 'Big Three Dragons', '大三元', 7, 'Pong or kong of all three dragons (red, green, white).'],
    ['thirteen', 'Thirteen Wonders', '十三幺', 8, 'One of every terminal (1 & 9 of each suit) and every honour, plus any matching pair.'],
    ['allTerminals', 'All Terminals', '清么九', 9, 'Only 1 and 9 number tiles — no middle tiles, no honours.'],
    ['sevenFlowers', 'Seven Flowers', '七星伴月', 10, 'Seven of the eight bonus tiles, won by self-draw only.'],
    ['eightFlowers', 'Eight Flowers', '八仙过海', 12, 'All eight bonus tiles — wins immediately, no sets needed.'],
    ['bigWinds', 'Big Four Winds', '大四喜', 12, 'Pong or kong of all four winds plus a pair.'],
    ['nineGates', 'Nine Gates', '九莲宝灯', 10, 'Concealed 1112345678999 of one suit, waiting on any tile of that suit.'],
    ['heavenly', 'Heavenly Hand', '天胡', 5, 'Dealer wins on the initial 14-tile deal.'],
    ['earthly', 'Earthly Hand', '地胡', 5, 'Non-dealer wins on the dealer’s very first discard.'],
    ['human', 'Human Hand', '人胡', 5, 'Non-dealer self-draws on their very first draw before any meld is claimed.'],
  ].map(([id, name, zh, def, desc]) => ({ id, cat: 'limit', input: 'limit', name, zh, desc, def })),
];

export const HOUSE_DEFAULTS = {
  minTai: 1,
  taiCap: MAX_TAI,
  winCircumstance: false,       // +1 Tai special wins (off by default)
  doubleWind: '1x',             // seat wind = prevailing wind: count once (1x) or twice (2x)
  scoreLabel: 'pts',
  finalWallStacks: 12,
  leaderboardResetAt: 0,         // rankings ignore games created before this time          // pay-all fresh-tile window (stacks left in the wall)
  autoDealer: true,             // track dealer: dealer wins -> stays (连庄), else rotates
  drawRule: 'stay',             // on a draw: 'stay' (连庄) or 'rotate'
  exposedKong: DEFAULT_SETTINGS.exposedKong,       // instant: each opponent pays
  concealedKong: DEFAULT_SETTINGS.concealedKong,
  flowerSet: DEFAULT_SETTINGS.flowerSet,
  flowerPair: DEFAULT_SETTINGS.flowerPair,
  baoMultiplier: DEFAULT_SETTINGS.baoMultiplier,   // pay-all: responsible pays N x base
  tai: {},                      // overrides: { [catalogId]: number }
};

export const SCORE_LABELS = { pts: 'PTS (Points)', chips: 'Chips (筹码)', poin: 'Poin' };
export const CAP_OPTIONS = [3, 4, 5, 6, 7, 8, 10, 13]; // 13 = no cap
export const NO_CAP = 13;

const int = (v, d, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

/** Validate/merge saved rules over defaults. */
export function mergeRules(saved = {}) {
  const r = { ...HOUSE_DEFAULTS, ...(saved || {}) };
  r.minTai = int(r.minTai, 1, 0, 5);
  r.taiCap = int(r.taiCap, MAX_TAI, 1, 13);
  if (r.minTai > r.taiCap) r.minTai = r.taiCap;
  for (const k of ['exposedKong', 'concealedKong', 'flowerSet', 'flowerPair']) r[k] = int(r[k], HOUSE_DEFAULTS[k], 0, 99);
  r.baoMultiplier = int(r.baoMultiplier, HOUSE_DEFAULTS.baoMultiplier, 1, 12);
  r.finalWallStacks = int(r.finalWallStacks, HOUSE_DEFAULTS.finalWallStacks, 0, 40);
  r.leaderboardResetAt = Math.max(0, Math.floor(Number(r.leaderboardResetAt) || 0));
  delete r.addedKong; delete r.exposedKongDiscarderPaysAll;
  r.winCircumstance = !!r.winCircumstance;
  r.autoDealer = !!r.autoDealer;
  if (!['1x', '2x'].includes(r.doubleWind)) r.doubleWind = '1x';
  if (!['stay', 'rotate'].includes(r.drawRule)) r.drawRule = 'stay';
  r.scoreLabel = SCORE_LABELS[r.scoreLabel] ? r.scoreLabel : 'pts';
  const tai = {};
  for (const [k, v] of Object.entries(r.tai || {})) {
    const item = TAI_CATALOG.find((x) => x.id === k);
    if (item) { const n = int(v, item.def, 0, 13); if (n !== item.def) tai[k] = n; }
  }
  r.tai = tai;
  return r;
}

/** Actual Tai value for a catalog item (effective Tai = min(value, cap)). */
export function taiValue(rules, id) {
  const item = TAI_CATALOG.find((x) => x.id === id);
  if (!item) return 0;
  return rules.tai?.[id] ?? item.def;
}

/** Settings snapshot stored on a table when it is created / updated. */
export function tableSettings(rules) {
  const { minTai, taiCap, exposedKong, concealedKong, flowerSet, flowerPair, baoMultiplier, autoDealer, drawRule, scoreLabel } = rules;
  return { minTai, taiCap, exposedKong, concealedKong, flowerSet, flowerPair, baoMultiplier, autoDealer, drawRule, scoreLabel };
}

export const WIND_NAMES = ['East', 'South', 'West', 'North'];
export const WIND_ZH = ['東', '南', '西', '北'];

/**
 * Dealer / round tracking derived from the event log.
 * Dealer starts at seat 0 (East), round wind East.
 */
export function dealerState(events, settings = {}) {
  const auto = settings.autoDealer ?? HOUSE_DEFAULTS.autoDealer;
  const drawRule = settings.drawRule ?? HOUSE_DEFAULTS.drawRule;
  let dealer = 0, round = 0, hand = 1, streak = 0;
  if (!auto) return { enabled: false, dealer, round, hand, streak };
  const rotate = () => { dealer = (dealer + 1) % 4; streak = 0; if (dealer === 0) round = (round + 1) % 4; };
  for (const ev of events) {
    if (ev.voided) continue;
    if (ev.type === 'win') { hand++; if (ev.winner === dealer) streak++; else rotate(); }
    else if (ev.type === 'draw') { hand++; if (drawRule === 'rotate') rotate(); else streak++; }
  }
  return { enabled: true, dealer, round, hand, streak };
}
