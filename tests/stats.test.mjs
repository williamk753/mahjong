// Run: node tests/stats.test.mjs
import assert from 'node:assert/strict';
import { winDeltas, kongDeltas } from '../js/scoring.js';
import { computeLeaderboard, rankPlayers } from '../js/stats.js';

const ev = (o) => ({ voided: false, createdAt: 1, ...o });
const win = (winner, shooter, tai, selfDraw = false) =>
  ev({ type: 'win', winner, shooter: selfDraw ? null : shooter, selfDraw, tai, deltas: winDeltas({ winner, shooter, selfDraw, tai }) });

const rooms = [
  { code: 'AAA', players: ['William', 'Mei', 'Hock', 'Lan'], createdAt: 1 },
  { code: 'BBB', players: ['mei', 'william ', 'Ah Kow', 'Lan'], createdAt: 2 },
  { code: 'CCC', players: ['A', 'B', 'C', 'D'], createdAt: 3 }, // empty -> skipped
];
const events = {
  AAA: [win(0, 1, 3), win(2, null, 5, true), ev({ type: 'kong', player: 3, kind: 'concealed', deltas: kongDeltas({ player: 3, kind: 'concealed' }) }),
        { ...win(1, 0, 5), voided: true }, ev({ type: 'draw', deltas: [0, 0, 0, 0] })],
  BBB: [win(1, 0, 2), win(1, 2, 1)],
  CCC: [],
};

const lb = computeLeaderboard(rooms, events);
const by = Object.fromEntries(lb.map((p) => [p.key.replace(/^name:/, ''), p]));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('names merged case-insensitively, empty tables skipped', () => {
  assert.equal(lb.length, 5);
  assert.equal(by.william.tables, 2);
  assert.equal(by.mei.tables, 2);
  assert.ok(!by.a);
});
t('points sum across tables and stay zero-sum', () => {
  // AAA: William +32 -64 -2 = -34 ; BBB: william wins 2tai (+16 from mei 8.. ) compute via deltas
  const total = lb.reduce((s, p) => s + p.points, 0);
  assert.equal(total, 0);
  assert.equal(by.william.points, 32 - 64 - 2 + 16 + 8);
});
t('wins, self-draws, shots, kongs, limit hands, voided ignored', () => {
  assert.equal(by.william.wins, 3);
  assert.equal(by.hock.selfDraws, 1);
  assert.equal(by.hock.limitHands, 1);
  assert.equal(by.mei.shots, 2);        // shot in AAA (to William) + BBB (seat0 = mei)
  assert.equal(by.lan.kongs, 1);
  assert.equal(by.mei.wins, 0);          // voided win not counted
});
t('hands and rates', () => {
  assert.equal(by.william.hands, 3 + 2); // AAA: 2 wins + 1 draw (voided excluded); BBB: 2
  assert.equal(by.william.winRate, 3 / 5);
});
t('ranking with ties', () => {
  const r = rankPlayers(lb, 'points');
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].points >= r[i].points);
  const tie = rankPlayers([{ name: 'x', points: 5 }, { name: 'y', points: 5 }, { name: 'z', points: 1 }], 'points');
  assert.deepEqual(tie.map((p) => p.rank), [1, 1, 3]);
});
console.log(`\n${n} tests passed`);
