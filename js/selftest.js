// Business-rule verification suite. Runs in the browser (Tests page) and in Node (tests/selftest.test.mjs).
import { basePoints, winDeltas, instantDeltas, manualDeltas, audit } from './scoring.js';
import { mergeRules, dealerState, HOUSE_DEFAULTS } from './rules.js';
import { evaluateHand, emptySelection, selectionToList, listToSelection } from './hand.js';
import { computeLeaderboard } from './stats.js';
import { buildRecap, recapText } from './recap-core.js';
import { parseScan, buildScanPrompt } from './scan-core.js';

const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || 'Expected'}: got ${A}, want ${B}`);
};
const ok = (c, msg) => { if (!c) throw new Error(msg || 'Assertion failed'); };
const R = () => mergeRules({});
const sel = (o) => ({ ...emptySelection(), ...o, flags: { ...(o.flags || {}) }, counts: { ...(o.counts || {}) } });
const sum = (d) => d.reduce((a, b) => a + b, 0);
const win = (winner, extra = {}) => ({ type: 'win', winner, voided: false, createdAt: 1, ...extra });

export const TESTS = [
  ['Invalid chicken hand', 'A 0-Tai hand must be rejected as a win.', () => {
    const h = evaluateHand(sel({ base: 'chicken' }), R());
    eq(h.actual, 0); ok(!h.valid, 'chicken hand should be invalid');
  }],
  ['1-Tai self-draw', '1 Tai self-draw → base 2, opponents pay 4 each, winner +12.', () => {
    eq(winDeltas({ winner: 0, selfDraw: true, tai: 1 }), [12, -4, -4, -4]);
  }],
  ['2-Tai discard win', '2 Tai discard → base 4, discarder pays 8, others 4, winner +16.', () => {
    eq(winDeltas({ winner: 0, shooter: 1, tai: 2 }), [16, -8, -4, -4]);
  }],
  ['4-Tai pay-all', '4 Tai pay-all → base 16, responsible pays 96 (6×16), others 0.', () => {
    eq(winDeltas({ winner: 2, shooter: 3, tai: 4, baoBy: 3 }), [0, 0, 96, -96]);
  }],
  ['7-Tai self-draw capped at 5', 'Effective 5 Tai, base 32, opponents pay 64 each, winner +192.', () => {
    eq(basePoints(7), 32); eq(winDeltas({ winner: 1, selfDraw: true, tai: 7 }), [-64, 192, -64, -64]);
  }],
  ['Seven Pairs by discard', 'Seven Pairs off a discard = 2 Tai, winner +16.', () => {
    const h = evaluateHand(sel({ base: 'sevenPairs' }), R(), { selfDraw: false });
    eq(h.actual, 2); eq(winDeltas({ winner: 0, shooter: 1, tai: h.actual }), [16, -8, -4, -4]);
  }],
  ['Seven Pairs by self-draw', 'Seven Pairs self-drawn = 7 Tai (effective 5), opponents pay 64 each.', () => {
    const h = evaluateHand(sel({ base: 'sevenPairs' }), R(), { selfDraw: true });
    eq([h.actual, h.effective, h.base], [7, 5, 32]);
    eq(winDeltas({ winner: 0, selfDraw: true, tai: h.actual }), [192, -64, -64, -64]);
  }],
  ['Exposed kong instant payout', 'Opponents pay 2 each, receiver +6, sum 0.', () => {
    const d = instantDeltas({ player: 0, kind: 'exposedKong' }, R()); eq(d, [6, -2, -2, -2]); eq(sum(d), 0);
  }],
  ['Concealed kong instant payout', 'Opponents pay 4 each, receiver +12, sum 0.', () => {
    const d = instantDeltas({ player: 3, kind: 'concealedKong' }, R()); eq(d, [-4, -4, -4, 12]); eq(sum(d), 0);
  }],
  ['Undo / void transaction', 'A voided round stays in history but no longer counts.', () => {
    const evs = [{ id: 'a', type: 'win', deltas: [16, -8, -4, -4] }, { id: 'b', type: 'win', deltas: [-4, 12, -4, -4], voided: true }];
    const a = audit(evs); eq(a.balances, [16, -8, -4, -4]); eq(a.voided, 1); ok(a.balanced);
  }],
  ['Single base hand rule', 'Only one base hand can be selected (the picker replaces it).', () => {
    const s = sel({ base: 'allChow' }); s.base = 'allPong';
    eq(selectionToList(s).filter((x) => ['allChow', 'allPong'].includes(x.id)).length, 1);
  }],
  ['Base vs limit hand exclusivity', 'A base hand cannot be combined with a limit hand.', () => {
    const h = evaluateHand(sel({ base: 'allPong', limit: 'bigDragons' }), R()); ok(!h.valid, 'should be rejected');
    const h2 = evaluateHand(sel({ limit: 'bigDragons', flags: { flower: true } }), R()); ok(h2.valid, 'limit + bonus ok'); eq(h2.actual, 8);
  }],
  ['Matched flower + season', 'Own flower and own season give +1 each and stack with a base hand.', () => {
    eq(evaluateHand(sel({ base: 'allChow', flags: { flower: true, season: true } }), R()).actual, 3);
  }],
  ['Backup JSON round-trip', 'Selections survive JSON serialisation for export/import.', () => {
    const s = sel({ base: 'allPong', suit: 'halfColour', flags: { concealed: true }, counts: { dragonPung: 2 } });
    const back = listToSelection(JSON.parse(JSON.stringify(selectionToList(s))));
    eq(evaluateHand(back, R()).actual, evaluateHand(s, R()).actual);
  }],
  ['Custom house rules', 'All Pong = 3 Tai, min Tai 2 rejects 1-Tai wins, cap is flexible.', () => {
    const r = mergeRules({ minTai: 2, taiCap: 6, tai: { allPong: 3 } });
    eq(evaluateHand(sel({ base: 'allPong' }), r).actual, 3);
    ok(!evaluateHand(sel({ base: 'allChow' }), r).valid, '1 Tai should be rejected');
    eq(basePoints(7, r.taiCap), 64);
  }],
  ['Auto dealer rotation & draw rule', 'Dealer stays on a dealer win, moves otherwise, draw follows the house rule.', () => {
    eq(dealerState([win(0), win(0)]).dealer, 0);
    eq(dealerState([win(2)]).dealer, 1);
    eq(dealerState([{ type: 'draw' }], { drawRule: 'stay' }).dealer, 0);
    eq(dealerState([{ type: 'draw' }], { drawRule: 'rotate' }).dealer, 1);
  }],
  ['Nine Gates & override', 'Nine Gates = 10 Tai (effective 5, base 32); override to 13 with no cap → base 8192.', () => {
    const h = evaluateHand(sel({ limit: 'nineGates' }), R()); eq([h.actual, h.effective, h.base], [10, 5, 32]);
    const r = mergeRules({ taiCap: 13, tai: { nineGates: 13 } });
    eq(evaluateHand(sel({ limit: 'nineGates' }), r).base, 8192);
  }],
  ['Ping Hu vs All Chow & suits', 'Ping Hu = 4 with no flowers; All Chow + flower = 2; colours stack.', () => {
    eq(evaluateHand(sel({ base: 'pingHu' }), R()).actual, 4);
    ok(!evaluateHand(sel({ base: 'pingHu', flags: { flower: true } }), R()).valid, 'Ping Hu with flower rejected');
    eq(evaluateHand(sel({ base: 'allChow', flags: { flower: true } }), R()).actual, 2);
    eq(evaluateHand(sel({ base: 'allChow', suit: 'fullColour' }), R()).actual, 5);
    eq(evaluateHand(sel({ base: 'sevenPairs', suit: 'halfColour' }), R()).actual, 4);
  }],
  ['Double wind house rule', 'Seat = prevailing wind pong counts once by default, twice when set to 2x.', () => {
    const s = sel({ base: 'allPong', flags: { seatWind: true, roundWind: true } });
    eq(evaluateHand(s, R(), { sameWind: true }).actual, 3);
    eq(evaluateHand(s, mergeRules({ doubleWind: '2x' }), { sameWind: true }).actual, 4);
  }],
  ['Manual adjust is zero-sum', 'Adjustments must add up to 0.', () => {
    eq(manualDeltas([10, -5, -5, 0]), [10, -5, -5, 0]);
    let threw = false; try { manualDeltas([10, 0, 0, 0]); } catch { threw = true; } ok(threw, 'non-zero sum rejected');
  }],
  ['Finish-game recap', 'Recap counts wins by method and lists what each player won with.', () => {
    const room = { code: 'T', players: ['A', 'B', 'C', 'D'], createdAt: 0, finishedAt: 3600e3, settings: {} };
    const evs = [
      { ...win(0, { selfDraw: true, tai: 3, patterns: [{ id: 'allPong', n: 1 }, { id: 'flower', n: 1 }] }), deltas: [48, -16, -16, -16] },
      { ...win(1, { shooter: 2, tai: 2, patterns: [{ id: 'allChow', n: 1 }, { id: 'season', n: 1 }] }), deltas: [-4, 16, -8, -4] },
      { ...win(1, { shooter: 3, baoBy: 3, tai: 4, patterns: [{ id: 'fullColour', n: 1 }] }), deltas: [0, 96, 0, -96] },
    ];
    const r = buildRecap(room, evs, R());
    eq(r.standings[0].seat, 1); eq(r.players[1].wins, 2); eq(r.players[1].payAll, 1); eq(r.players[0].selfDraws, 1);
    ok(/All Pong/.test(recapText(r, 'whatsapp')), 'recap mentions patterns');
    eq(r.highest.tai, 4);
  }],
  ['Leaderboard is zero-sum', 'All players’ points across games add up to 0.', () => {
    const rooms = [{ code: 'X', players: ['A', 'B', 'C', 'D'], createdAt: 1 }];
    const lb = computeLeaderboard(rooms, { X: [{ type: 'win', winner: 0, shooter: 1, tai: 2, deltas: [16, -8, -4, -4] }] });
    eq(lb.reduce((s, p) => s + p.points, 0), 0);
  }],
  ['AI scan answer parsing', 'Gemini JSON is validated: unknown ids dropped, limit hand clears base/suit, result scores correctly.', () => {
    const r = parseScan('```json\n{"tiles":["East","East","East"],"base":"allPong","suit":"halfColour","limit":null,"flags":{"seatWind":true,"bogus":true},"counts":{"dragonPung":2},"confidence":0.8,"notes":"ok"}\n```');
    eq(evaluateHand(r.selection, R()).actual, 2 + 2 + 1 + 2); eq(r.warnings.length, 1); eq(r.confidence, 0.8);
    const l = parseScan('{"base":"allPong","suit":"fullColour","limit":"nineGates","flags":{},"counts":{}}');
    eq([l.selection.base, l.selection.suit, l.selection.limit], [null, null, 'nineGates']);
    ok(/allPong/.test(buildScanPrompt(R(), { seatWind: 'East', seatNo: 1 })), 'prompt lists pattern ids');
    let threw = false; try { parseScan('sorry, I cannot see'); } catch { threw = true; } ok(threw, 'non-JSON rejected');
  }],
  ['House rule defaults', 'Defaults match the Singapore / SEA reference.', () => {
    eq([HOUSE_DEFAULTS.minTai, HOUSE_DEFAULTS.taiCap, HOUSE_DEFAULTS.baoMultiplier], [1, 5, 6]);
  }],
];

export function runAll() {
  return TESTS.map(([name, desc, fn], i) => {
    try { fn(); return { n: i + 1, name, desc, pass: true }; }
    catch (err) { return { n: i + 1, name, desc, pass: false, error: err.message }; }
  });
}
