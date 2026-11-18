// Run: node tests/continue.test.mjs
import assert from 'node:assert/strict';
import { loadContinuation, roomsWith, STALE_MS, carryOver } from '../js/continue.js';
import { winDeltas, startOf } from '../js/scoring.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const H = 3600e3; const now = 1_000_000 * H;
const win = (winner, at) => ({ type: 'win', winner, voided: false, createdAt: at });
const four = ['Ann', 'Bo', 'Cy', 'Di']; const ids = ['p1', 'p2', 'p3', 'p4'];
const room = (code, over = {}) => ({ code, players: four, playerIds: ids, status: 'completed', createdAt: now - 48 * H, settings: {}, ...over });
const storeOf = (rooms, events) => ({ getRoom: async (c) => rooms.find((r) => r.code === c) || null, watchEvents: (c, cb) => { cb(events[c] || []); return () => {}; } });
// what the New game page does once the 4th player is chosen
const offer = async (rooms, events, sel) => loadContinuation(storeOf(rooms, events), { rooms: roomsWith(rooms, sel), now });
const SEL = { ids, names: four };

await t('a finished game is offered, with where the wind table stopped', async () => {
  const c = await offer([room('A')], { A: [win(1, now - 47 * H), win(2, now - 46 * H), win(2, now - 45 * H)] }, SEL);
  assert.equal(c.state, 'closed');
  assert.deepEqual(c.resume, { dealer: 2, round: 0, streak: 1 }); // Bo won, Cy won, Cy won again
});
await t('a game that was played but never finished is still offered (unfinished)', async () => {
  const c = await offer([room('A', { status: 'active' })], { A: [win(0, now - 20 * H)] }, SEL);
  assert.equal(c.state, 'unfinished');
  assert.ok(c.idleMs > STALE_MS);
});
await t('a game in progress right now is reported as open, not offered for continuing', async () => {
  const c = await offer([room('A', { status: 'active' })], { A: [win(0, now - 1 * H)] }, SEL);
  assert.equal(c.state, 'open');
});
await t('an abandoned or empty room made after the real game does not hide it', async () => {
  const rooms = [room('A', { createdAt: now - 72 * H }), room('B', { status: 'cancelled', createdAt: now - 24 * H }), room('C', { status: 'lobby', createdAt: now - 1 * H })];
  const c = await offer(rooms, { A: [win(0, now - 71 * H)], B: [], C: [] }, SEL);
  assert.equal(c.room.code, 'A');
  assert.equal(c.state, 'closed');
});
await t('after continuing, the new open game is reported (not silence)', async () => {
  const rooms = [room('A', { createdAt: now - 72 * H }), room('B', { status: 'active', createdAt: now - 2 * H })];
  const c = await offer(rooms, { A: [win(0, now - 71 * H)], B: [win(2, now - 1 * H)] }, SEL);
  assert.equal(c.room.code, 'B'); assert.equal(c.state, 'open');
});
await t('a renamed player still finds the earlier game (by directory id)', async () => {
  const c = await offer([room('A')], { A: [win(0, now - 40 * H)] }, { ids, names: ['Annie', 'Bo', 'Cy', 'Di'] });
  assert.equal(c.room.code, 'A');
});
await t('a different player means no earlier game for this table', async () => {
  assert.equal(await offer([room('A')], { A: [win(0, now - 40 * H)] }, { ids: ['p1', 'p2', 'p3', 'p5'], names: ['Ann', 'Bo', 'Cy', 'Ed'] }), null);
});
await t('a game with only voided rounds does not count as played', async () => {
  assert.equal(await offer([room('A')], { A: [{ ...win(0, now - 40 * H), voided: true }] }, SEL), null);
});
await t('from this phone\'s history or one given code: newest played game wins', async () => {
  const rooms = [room('A', { createdAt: now - 72 * H }), room('B', { createdAt: now - 24 * H }), room('C', { createdAt: now - 1 * H, status: 'lobby' })];
  const store = storeOf(rooms, { A: [win(0, now - 71 * H)], B: [win(1, now - 23 * H)], C: [] });
  assert.equal((await loadContinuation(store, { codes: ['A', 'B', 'C'], now })).room.code, 'B');
  assert.equal((await loadContinuation(store, { code: 'A', now })).room.code, 'A');
  assert.equal(await loadContinuation(store, { codes: [], now }), null);
});
await t('a failing read does not break the page', async () => {
  const bad = { getRoom: async () => { throw new Error('offline'); }, watchEvents: () => () => {} };
  assert.equal(await loadContinuation(bad, { codes: ['A'], now }), null);
  const denied = { getRoom: async () => room('A'), watchEvents: (c, cb, onErr) => { onErr(new Error('denied')); return () => {}; } };
  assert.equal(await loadContinuation(denied, { code: 'A', now }), null);
});
const wd = (winner, shooter, tai, at) => ({ type: 'win', winner, shooter, tai, voided: false, createdAt: at, deltas: winDeltas({ winner, shooter, tai }) });
await t('points carry over: final points of the earlier game, per player, whatever the new seats', async () => {
  const r = room('A'); const evs = [wd(0, 1, 3, 1)];                  // Ann +32, Bo -16, Cy -8, Di -8
  assert.deepEqual(carryOver(r, evs, { ids, names: four }), [32, -16, -8, -8]);
  assert.deepEqual(carryOver(r, evs, { ids: ['p3', 'p1', 'p4', 'p2'], names: ['Cy', 'Ann', 'Di', 'Bo'] }), [-8, 32, -8, -16]);   // other seats: points follow the person
  assert.deepEqual(carryOver(r, evs, { ids, names: ['Annie', 'Bo', 'Cy', 'Di'] }), [32, -16, -8, -8]);                            // renamed player
  assert.equal(carryOver(r, evs, { ids: ['p1', 'p2', 'p3', 'p5'], names: ['Ann', 'Bo', 'Cy', 'Ed'] }), null);                    // not the same four
});
await t('a game that started with carried points carries them on (chain of continued tables)', async () => {
  const second = room('B', { startScores: [32, -16, -8, -8] }); const evs = [wd(1, 0, 2, 1)];
  const pts = carryOver(second, evs, { ids, names: four });
  assert.equal(pts.reduce((s, x) => s + x, 0), 0);                    // still zero-sum overall
  assert.equal(pts[0], 32 + evs[0].deltas[0]);
  assert.equal(startOf(second, 1), -16); assert.equal(startOf(room('C', { startingScore: 100 }), 2), 100); assert.equal(startOf(room('D'), 0), 0);
});
console.log(`\n${n} tests passed`);
