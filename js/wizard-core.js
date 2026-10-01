// Guided win helper — turns plain-language answers into scoring patterns.
// Players never need to know Tai names: they answer questions about what their tiles look like.
import { emptySelection } from './hand.js';

export const FLOWER_TILES = [
  { n: 1, kind: 'flower', glyph: '\u{1F022}', name: 'Plum 梅' },
  { n: 2, kind: 'flower', glyph: '\u{1F023}', name: 'Orchid 兰' },
  { n: 3, kind: 'flower', glyph: '\u{1F025}', name: 'Chrysanthemum 菊' },
  { n: 4, kind: 'flower', glyph: '\u{1F024}', name: 'Bamboo 竹' },
  { n: 1, kind: 'season', glyph: '\u{1F026}', name: 'Spring 春' },
  { n: 2, kind: 'season', glyph: '\u{1F027}', name: 'Summer 夏' },
  { n: 3, kind: 'season', glyph: '\u{1F028}', name: 'Autumn 秋' },
  { n: 4, kind: 'season', glyph: '\u{1F029}', name: 'Winter 冬' },
];
export const ANIMALS = [
  { id: 'cat', emoji: '🐱', name: 'Cat 猫' }, { id: 'mouse', emoji: '🐭', name: 'Mouse 鼠' },
  { id: 'rooster', emoji: '🐓', name: 'Rooster 鸡' }, { id: 'centipede', emoji: '🐛', name: 'Centipede 蜈蚣' },
];

export const blankAnswers = () => ({
  shape: null,            // 'chow' | 'pong' | 'mixed' | 'pairs' | 'terminals' | 'special'
  pairOk: null,           // chow only: pair is a normal number tile (not dragon / scoring wind)
  twoSided: null,         // chow only: waited on 2 different tiles
  limit: null,            // shape 'special': limit hand id
  suit: null,             // 'mixed' | 'half' | 'full'
  dragons: 0,             // number of dragon pongs / kongs (0-3)
  dragonPair: false,      // pair is a dragon (used for Small Three Dragons)
  seatWind: false, roundWind: false,
  flowers: [], seasons: [], animals: [],
  concealed: null,        // true = no claimed discards before winning
  kongs: 0,
  kongWin: false, lastTile: false, robKong: false,
});

/**
 * ctx: { seatNo (1-4), sameWind (seat wind == round wind), selfDraw }
 * Returns { selection, reasons: [{ id, text }] } — reasons explain each pattern in plain words.
 */
export function answersToSelection(ans, ctx = {}) {
  const sel = emptySelection();
  const reasons = [];
  const why = (id, text) => reasons.push({ id, text });
  const bonusCount = ans.flowers.length + ans.seasons.length;
  const hasBonus = bonusCount > 0 || ans.animals.length > 0;

  // 1. Limit hands first (they replace the base hand and suit).
  if (ans.shape === 'special' && ans.limit) { sel.limit = ans.limit; why(ans.limit, 'You picked this special hand.'); }
  else if (ans.dragons >= 3) { sel.limit = 'bigDragons'; why('bigDragons', 'Three sets of dragons = Big Three Dragons.'); }
  else if (bonusCount === 8) { sel.limit = 'eightFlowers'; why('eightFlowers', 'All 8 flower & season tiles = Eight Flowers.'); }
  else if (bonusCount === 7 && ctx.selfDraw) { sel.limit = 'sevenFlowers'; why('sevenFlowers', '7 of the 8 flower & season tiles and a self-draw = Seven Flowers.'); }

  // 2. Base hand + suit (only without a limit hand).
  if (!sel.limit) {
    if (ans.shape === 'chow') {
      if (ans.pairOk === false) {
        why('mixed', 'Your pair is a dragon or your wind, so it does not count as All Chow.');
      } else if (!hasBonus && ans.pairOk && ans.twoSided) {
        sel.base = 'pingHu'; why('pingHu', 'All runs, a normal pair, waiting on 2 tiles and no flowers/animals = Ping Hu.');
      } else {
        sel.base = 'allChow';
        why('allChow', hasBonus ? 'All runs (1-2-3). You have flowers/animals, so it is All Chow, not Ping Hu.' : 'All runs (1-2-3) = All Chow.');
      }
    } else if (ans.shape === 'pong') { sel.base = 'allPong'; why('allPong', 'All sets are three (or four) of the same tile = All Pong.'); }
    else if (ans.shape === 'pairs') { sel.base = 'sevenPairs'; why('sevenPairs', ctx.selfDraw ? 'Seven pairs, self-drawn.' : 'Seven pairs.'); }
    else if (ans.shape === 'terminals') { sel.base = 'halfTerminals'; why('halfTerminals', 'Only 1s, 9s and honour tiles = Half Terminals.'); }
    if (ans.suit === 'full') { sel.suit = 'fullColour'; why('fullColour', 'Every tile is from ONE suit = Full Color.'); }
    else if (ans.suit === 'half') { sel.suit = 'halfColour'; why('halfColour', 'One suit plus winds/dragons = Half Color.'); }
  }

  // 3. Additive bonuses.
  const dragonPongs = Math.min(2, ans.dragons);
  if (sel.limit !== 'bigDragons' && dragonPongs > 0) {
    sel.counts.dragonPung = dragonPongs; why('dragonPung', `${dragonPongs} set${dragonPongs > 1 ? 's' : ''} of dragons.`);
    if (dragonPongs === 2 && ans.dragonPair) { sel.flags.smallDragons = true; why('smallDragons', 'Two dragon sets + a dragon pair = Small Three Dragons.'); }
  }
  if (ans.seatWind) { sel.flags.seatWind = true; why('seatWind', 'Three of your own seat wind.'); }
  if (ans.roundWind && !(ctx.sameWind && ans.seatWind)) { sel.flags.roundWind = true; why('roundWind', 'Three of the round wind.'); }
  if (ctx.sameWind && ans.seatWind) { sel.flags.roundWind = true; why('roundWind', 'Your seat wind is also the round wind.'); }

  if (!['eightFlowers', 'sevenFlowers'].includes(sel.limit)) {
    const seat = Number(ctx.seatNo) || 0;
    if (seat && ans.flowers.includes(seat)) { sel.flags.flower = true; why('flower', `Your seat flower (#${seat}).`); }
    if (seat && ans.seasons.includes(seat)) { sel.flags.season = true; why('season', `Your seat season (#${seat}).`); }
    const sets = (ans.flowers.length === 4 ? 1 : 0) + (ans.seasons.length === 4 ? 1 : 0);
    if (sets) { sel.counts.flowerSet = sets; why('flowerSet', sets === 2 ? 'All 4 flowers and all 4 seasons.' : 'A complete set of 4 flowers or 4 seasons.'); }
  }
  if (ans.animals.length) {
    sel.counts.animal = ans.animals.length; why('animal', `${ans.animals.length} animal tile${ans.animals.length > 1 ? 's' : ''}.`);
    const pairs = (ans.animals.includes('cat') && ans.animals.includes('mouse') ? 1 : 0) + (ans.animals.includes('rooster') && ans.animals.includes('centipede') ? 1 : 0);
    if (pairs) { sel.counts.animalPair = pairs; why('animalPair', pairs === 2 ? 'Both animal pairs (cat+mouse, rooster+centipede).' : 'A matching animal pair.'); }
  }
  if (ans.concealed) { sel.flags.concealed = true; why('concealed', 'You did not take any discards before winning (concealed hand).'); }
  if (ans.kongs > 0) { sel.counts.kong = Math.min(4, ans.kongs); why('kong', `${ans.kongs} kong${ans.kongs > 1 ? 's' : ''} (four of a kind).`); }
  if (ans.kongWin) { sel.flags.kongWin = true; why('kongWin', 'Won with the replacement tile after a kong.'); }
  if (ans.lastTile) { sel.flags.lastTile = true; why('lastTile', 'Won on the very last tile.'); }
  if (ans.robKong) { sel.flags.robKong = true; why('robKong', 'Won by robbing a kong.'); }
  return { selection: sel, reasons };
}
