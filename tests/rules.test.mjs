// Run: node tests/rules.test.mjs
import assert from 'node:assert/strict';
import { mergeRules, taiValue, dealerState, tableSettings, HOUSE_DEFAULTS } from '../js/rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const win = (winner) => ({ type: 'win', winner, voided: false });

t('defaults and validation', () => {
  const r = mergeRules({ minTai: 9, taiCap: 3, doubleWind: 'x', tai: { allPong: 3, pingHu: 4, bogus: 5, bigDragons: 2 } });
  assert.equal(r.taiCap, 3);
  assert.equal(r.minTai, 3);            // clamped to cap
  assert.equal(r.doubleWind, '2x');
  assert.deepEqual(r.tai, { allPong: 3, bigDragons: 2 }); // default-equal and unknown entries dropped
  assert.equal(taiValue(r, 'allPong'), 3);
  assert.equal(taiValue(r, 'fullColour'), 4);
  assert.equal(taiValue(r, 'bigDragons'), 2);
});
t('house defaults (Mahjong Scoring ver1.2)', () => {
  const r = mergeRules({});
  assert.deepEqual([r.minTai, r.taiCap, r.winCircumstance, r.doubleWind, r.scoreLabel, r.autoDealer, r.drawRule, r.finalWallStacks],
    [1, 5, true, '2x', 'pts', true, 'stay', 12]);
  assert.deepEqual([r.exposedKong, r.concealedKong, r.flowerSet, r.flowerPair, r.baoMultiplier], [2, 4, 4, 2, 6]);
  const tv = (id) => taiValue(r, id);
  assert.deepEqual(['chicken', 'allChow', 'allPong', 'halfColour', 'halfTerminals', 'pingHu', 'fullColour', 'smallDragons', 'sevenPairs', 'sevenPairsSelf', 'mixedOrphans', 'pureOrphans'].map(tv), [0, 1, 2, 2, 4, 4, 4, 1, 2, 4, 2, 4]);
  assert.deepEqual(['dragonPung', 'seatWind', 'roundWind', 'flower', 'season', 'flowerSet', 'concealed', 'animal', 'animalPair', 'kong', 'pureStraight', 'kongWin', 'lastTile', 'robKong'].map(tv), [1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1]);
  assert.deepEqual(['bigDragons', 'thirteen', 'allTerminals', 'sevenFlowers', 'eightFlowers', 'bigWinds', 'nineGates', 'heavenly', 'earthly', 'human'].map(tv), [7, 8, 9, 10, 12, 12, 10, 5, 5, 5]);
});
t('table snapshot has scoring fields', () => {
  const s = tableSettings(mergeRules({}));
  assert.equal(s.taiCap, HOUSE_DEFAULTS.taiCap);
  assert.deepEqual(s.tai, {}); // rule-set Tai values travel with the game
  assert.equal(tableSettings(mergeRules({ tai: { allPong: 3 } })).tai.allPong, 3);
});
t('dealer: stays on dealer win, rotates otherwise, round advances', () => {
  let d = dealerState([win(0), win(0)]);
  assert.deepEqual([d.dealer, d.streak, d.hand, d.round], [0, 2, 3, 0]);
  d = dealerState([win(2), win(3), win(2), win(0)]);
  // dealer 0 -> 1 -> 2 -> 2 stays (winner 2) -> 3
  assert.deepEqual([d.dealer, d.round], [3, 0]);
  d = dealerState([win(1), win(2), win(3), win(0)]);
  assert.deepEqual([d.dealer, d.round], [0, 1]); // back to East seat, South round
});
t('draw rule + voided + disabled', () => {
  const draw = { type: 'draw', voided: false };
  assert.equal(dealerState([draw], { drawRule: 'stay' }).dealer, 0);
  assert.equal(dealerState([draw], { drawRule: 'rotate' }).dealer, 1);
  assert.equal(dealerState([{ ...win(1), voided: true }]).dealer, 0);
  assert.equal(dealerState([win(1)], { autoDealer: false }).enabled, false);
});
console.log(`\n${n} tests passed`);
