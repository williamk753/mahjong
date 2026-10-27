// Run: node tests/continue.test.mjs
import assert from 'node:assert/strict';
import { loadContinuation, roomsWith, STALE_MS } from '../js/continue.js';

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
console.log(`\n${n} tests passed`);
