// Hand evaluation: turns a pattern selection into Tai, effective Tai and base points.
// Rule (Singapore / SEA "single primary hand"): at most ONE base hand OR ONE fixed/limit hand.
// Suits (half / full colour) stack with a base hand (incl. Seven Pairs) but not with a limit hand.
// Additive bonuses (flowers, animals, dragons, winds, concealed, kong…) combo with anything.
import { TAI_CATALOG, taiValue } from './rules.js';
import { basePoints, clampTai, MAX_TAI } from './scoring.js';

export const byId = Object.fromEntries(TAI_CATALOG.map((x) => [x.id, x]));
export const BASE_HANDS = TAI_CATALOG.filter((x) => x.input === 'pattern');
export const SUITS = TAI_CATALOG.filter((x) => x.input === 'colour');
export const LIMITS = TAI_CATALOG.filter((x) => x.input === 'limit');
export const BONUSES = TAI_CATALOG.filter((x) => x.input === 'flag' || x.input === 'count');

export const emptySelection = () => ({ base: null, suit: null, limit: null, flags: {}, counts: {} });

/** Selection -> array of { id, n } for storage. */
export function selectionToList(sel) {
  const out = [];
  if (sel.base) out.push({ id: sel.base, n: 1 });
  if (sel.suit) out.push({ id: sel.suit, n: 1 });
  if (sel.limit) out.push({ id: sel.limit, n: 1 });
  for (const [id, on] of Object.entries(sel.flags || {})) if (on) out.push({ id, n: 1 });
  for (const [id, n] of Object.entries(sel.counts || {})) if (n > 0) out.push({ id, n });
  return out;
}

/** Stored list -> selection. */
export function listToSelection(list = []) {
  const sel = emptySelection();
  for (const { id, n } of list) {
    const x = byId[id]; if (!x) continue;
    if (x.input === 'pattern' || x.input === 'variant') sel.base = x.id === 'sevenPairsSelf' ? 'sevenPairs' : x.id;
    else if (x.input === 'colour') sel.suit = id;
    else if (x.input === 'limit') sel.limit = id;
    else if (x.input === 'count') sel.counts[id] = n;
    else sel.flags[id] = true;
  }
  return sel;
}

/**
 * Evaluate a hand.
 * opts.selfDraw  → Seven Pairs uses its self-draw value
 * opts.sameWind  → seat wind == prevailing wind; a single wind pong counts 1x or 2x (rules.doubleWind)
 */
export function evaluateHand(sel, rules, opts = {}) {
  const cap = rules.taiCap || MAX_TAI;
  const items = []; const errors = [];
  const push = (id, n = 1, overrideTai) => {
    const x = byId[id]; if (!x) return;
    const each = overrideTai ?? taiValue(rules, id);
    items.push({ id, name: x.name, zh: x.zh, n, tai: each * n, cat: x.cat, input: x.input });
  };
  if (sel.base && sel.limit) errors.push('Choose one base hand OR one limit hand, not both.');
  if (sel.suit && sel.limit) errors.push('Suit bonuses only stack with a base hand, not with a limit hand.');
  if (sel.limit) push(sel.limit);
  if (sel.base) push(sel.base === 'sevenPairs' && opts.selfDraw ? 'sevenPairsSelf' : sel.base, 1);
  if (sel.suit) push(sel.suit);
  for (const x of BONUSES) {
    if (x.cat === 'special' && !rules.winCircumstance) continue;
    if (x.input === 'flag' && sel.flags?.[x.id]) {
      if (x.id === 'roundWind' && opts.sameWind && sel.flags.seatWind) {
        if (rules.doubleWind !== '2x') continue; // same tile counted once
      }
      push(x.id);
    }
    if (x.input === 'count' && (sel.counts?.[x.id] || 0) > 0) push(x.id, Math.min(x.max || 99, sel.counts[x.id]));
  }
  if (sel.base === 'pingHu' && (sel.flags?.flower || sel.flags?.season || sel.counts?.animal || sel.counts?.animalPair || sel.counts?.flowerSet)) {
    errors.push('Ping Hu must have zero flowers/animals — choose All Chow instead.');
  }
  const actual = items.reduce((s, i) => s + i.tai, 0);
  const effective = clampTai(actual, cap);
  const base = basePoints(actual, cap);
  const belowMin = actual < (rules.minTai ?? 1);
  if (belowMin) errors.push(actual === 0 ? 'Chicken hand (0 Tai) is not a valid win.' : `Below the minimum of ${rules.minTai} Tai — not a valid win.`);
  return { items, actual, effective, cap, base, errors, valid: errors.length === 0 && items.length > 0 };
}

/** Short text like "All Pong (对对胡) + Dragon Pong ×2" */
export function describeItems(items, withZh = true) {
  return items.map((i) => `${i.name}${withZh && i.zh ? ` (${i.zh})` : ''}${i.n > 1 ? ` ×${i.n}` : ''}`).join(' + ');
}
