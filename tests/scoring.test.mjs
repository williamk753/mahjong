// Run: node tests/scoring.test.mjs
import assert from 'node:assert/strict';
import {
  basePoints, winDeltas, kongDeltas, instantDeltas, bonusDeltas, adjustDeltas, audit, settlement, sum, formatMoney,
} from '../js/scoring.js';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

t('base points 2^Tai capped at 5', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 10].map((t) => basePoints(t)), [1, 2, 4, 8, 16, 32, 32, 32]);
});

t('discard win: shooter 2x, others 1x', () => {
  // winner 0, shooter 2, 3 tai -> base 8
  assert.deepEqual(winDeltas({ winner: 0, shooter: 2, tai: 3 }), [32, -8, -16, -8]);
});

t('self-draw: all pay 2x', () => {
  assert.deepEqual(winDeltas({ winner: 1, selfDraw: true, tai: 2 }), [-8, 24, -8, -8]);
});

t('win above cap uses 5 tai', () => {
  assert.deepEqual(winDeltas({ winner: 3, selfDraw: true, tai: 9 }), [-64, -64, -64, 192]);
});

t('configurable cap', () => {
  assert.equal(basePoints(7, 8), 128);
  assert.equal(basePoints(9, 3), 8);
  assert.deepEqual(winDeltas({ winner: 0, shooter: 1, tai: 6, cap: 6 }), [256, -128, -64, -64]);
});

t('shooter cannot be winner', () => {
  assert.throws(() => winDeltas({ winner: 1, shooter: 1, tai: 1 }));
});

t('kongs', () => {
  assert.deepEqual(kongDeltas({ player: 0, kind: 'concealed' }), [6, -2, -2, -2]);
  assert.deepEqual(kongDeltas({ player: 1, kind: 'exposed', from: 3 }), [-1, 3, -1, -1]);
  assert.deepEqual(kongDeltas({ player: 1, kind: 'exposed', from: 3 }, { exposedKongDiscarderPaysAll: true }), [0, 3, 0, -3]);
  assert.deepEqual(kongDeltas({ player: 2, kind: 'added' }), [-1, -1, 3, -1]);
});

t('instant payouts (friend-site defaults)', () => {
  assert.deepEqual(instantDeltas({ player: 0, kind: 'exposedKong' }), [6, -2, -2, -2]);
  assert.deepEqual(instantDeltas({ player: 1, kind: 'concealedKong' }), [-4, 12, -4, -4]);
  assert.deepEqual(instantDeltas({ player: 2, kind: 'flowerSet' }), [-4, -4, 12, -4]);
  assert.deepEqual(instantDeltas({ player: 3, kind: 'flowerPair' }, { flowerPair: 3 }), [-3, -3, -3, 9]);
  assert.throws(() => instantDeltas({ player: 0, kind: 'bite' }));
});

t('pay-all (bao): responsible player pays 6x base alone', () => {
  assert.deepEqual(winDeltas({ winner: 0, shooter: 2, tai: 5, baoBy: 2 }), [192, 0, -192, 0]);
  assert.deepEqual(winDeltas({ winner: 1, selfDraw: true, tai: 3, baoBy: 3 }), [0, 48, 0, -48]);
  assert.throws(() => winDeltas({ winner: 1, selfDraw: true, tai: 3, baoBy: 1 }));
});

t('bonus + adjust', () => {
  assert.deepEqual(bonusDeltas({ player: 0, units: 1 }), [3, -1, -1, -1]);
  assert.deepEqual(bonusDeltas({ player: 0, units: 2, from: 1 }), [2, -2, 0, 0]);
  assert.deepEqual(adjustDeltas({ from: 3, to: 2, units: 5 }), [0, 0, 5, -5]);
});

t('every generated event is zero-sum (fuzz)', () => {
  for (let k = 0; k < 2000; k++) {
    const w = k % 4, s = (w + 1 + (k % 3)) % 4;
    assert.equal(sum(winDeltas({ winner: w, shooter: s, tai: k % 7 })), 0);
    assert.equal(sum(winDeltas({ winner: w, selfDraw: true, tai: k % 7 })), 0);
  }
});

t('audit detects tampered events and ignores voided', () => {
  const evs = [
    { id: 'a', type: 'win', deltas: winDeltas({ winner: 0, shooter: 1, tai: 1 }) },
    { id: 'b', type: 'kong', deltas: kongDeltas({ player: 2, kind: 'concealed' }) },
    { id: 'c', type: 'win', deltas: [100, 0, 0, 0], voided: true },
  ];
  const r = audit(evs);
  assert.equal(r.balanced, true);
  assert.equal(r.total, 0);
  assert.equal(r.hands, 1);
  assert.equal(r.voided, 1);
  const bad = audit([...evs, { id: 'd', type: 'win', deltas: [5, 0, 0, 0] }]);
  assert.equal(bad.balanced, false);
  assert.equal(bad.problems[0].id, 'd');
});

t('settlement clears balances', () => {
  const bal = [37, -12, 5, -30];
  const tx = settlement(bal);
  const after = [...bal];
  for (const x of tx) { after[x.from] += x.units; after[x.to] -= x.units; }
  assert.deepEqual(after, [0, 0, 0, 0]);
  assert.ok(tx.length <= 3);
});

t('money formatting', () => {
  assert.equal(formatMoney(32, 0.1), '+$3.20');
  assert.equal(formatMoney(-3, 0.2), '-$0.60');
  assert.equal(formatMoney(0, 0.1), '$0.00');
});

console.log(`\n${passed} tests passed`);
