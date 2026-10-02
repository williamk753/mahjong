// Rule sets: "Default" = the shared house rules (settings/house); extra sets live in ruleSets/{id}.
// A game copies the chosen set into room.settings when it is created.
import { mergeRules, tableSettings } from './rules.js';
import { prefs, rulesDiff, myName } from './prefs.js';

export const DEFAULT_ID = 'default';
/** Keys that belong to a rule set (the rest — AI scan, score label, ranking reset — are app-wide). */
export const GAME_KEYS = ['minTai', 'taiCap', 'winCircumstance', 'doubleWind', 'exposedKong', 'concealedKong', 'flowerSet', 'flowerPair',
  'baoMultiplier', 'finalWallStacks', 'autoDealer', 'drawRule', 'tai'];

const pick = (r) => Object.fromEntries(GAME_KEYS.map((k) => [k, r[k]]));
let sets = []; // [{ id, name, rules, lastChange }]
const listeners = new Set();
const lastSaved = {};

export const onRuleSets = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setRuleSets(list) {
  sets = list.map((s) => ({ ...s, rules: pick(mergeRules({ ...s.rules })) })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  for (const s of sets) lastSaved[s.id] = JSON.parse(JSON.stringify(s.rules));
  listeners.forEach((f) => f(sets));
}

/** All sets, Default first. Each: { id, name, rules (full merged rules) } */
export function ruleSets() {
  return [{ id: DEFAULT_ID, name: 'Default', rules: prefs.rules, builtIn: true }, ...sets.map((s) => ({ ...s, rules: mergeRules({ ...prefs.rules, ...s.rules }) }))];
}
export const ruleSet = (id) => ruleSets().find((s) => s.id === id) || ruleSets()[0];

/** Settings snapshot for a new game. */
export function settingsFor(id) {
  const s = ruleSet(id);
  return { ...tableSettings(s.rules), ruleSetId: s.id, ruleSetName: s.name };
}

export async function saveRuleSet(store, id, name, rules) {
  const clean = pick(mergeRules(rules));
  const before = lastSaved[id];
  const changes = before ? rulesDiff(mergeRules(before), mergeRules(clean)) : [];
  const data = { name: String(name || 'My rules').slice(0, 30), rules: clean };
  if (before && changes.length) data.lastChange = { at: Date.now(), byName: myName() || 'Someone', summary: changes.slice(0, 6).join(' · ') };
  const newId = await store.saveRuleSet(id, data);
  lastSaved[newId] = JSON.parse(JSON.stringify(clean));
  return newId;
}
