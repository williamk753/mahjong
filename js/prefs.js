// Shared app preferences: house rules (synced) + display options (this device).
import { mergeRules, TAI_CATALOG, taiValue } from './rules.js';

const RULES_CACHE = 'mjsg-house-rules';
const DISPLAY_KEY = 'mjsg-display';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const prefs = {
  rules: mergeRules(read(RULES_CACHE) || {}),
  showZh: (read(DISPLAY_KEY) || {}).showZh ?? true,
};

/** Wrap Chinese text so it can be hidden by the "Show Chinese" toggle. */
export const zh = (s) => (s ? `<span class="zh">${s}</span>` : '');
export const unit = () => prefs.rules.scoreLabel || 'pts';

export function applyDisplay() {
  document.documentElement.classList.toggle('no-zh', !prefs.showZh);
}
export function setShowZh(v) {
  prefs.showZh = !!v; write(DISPLAY_KEY, { showZh: prefs.showZh }); applyDisplay();
}

/* ---- who am I (name shown in notifications) ---- */
const ME_KEY = 'mjsg-my-name';
export const myName = () => { try { return localStorage.getItem(ME_KEY) || ''; } catch { return ''; } };
export const setMyName = (n) => { try { if (n) localStorage.setItem(ME_KEY, n); } catch {} };

/* ---- house rules ---- */
let lastSaved = JSON.parse(JSON.stringify(prefs.rules));
const LABELS = { minTai: 'Minimum Tai', taiCap: 'Tai cap', exposedKong: 'Exposed kong payout', concealedKong: 'Concealed kong payout', flowerSet: 'Flower set payout',
  flowerPair: 'Flower pair payout', baoMultiplier: 'Pay-all multiplier', autoDealer: 'Auto dealer', drawRule: 'Draw round dealer', doubleWind: 'Seat = round wind',
  winCircumstance: 'Win-circumstance Tai', scoreLabel: 'Score label', finalWallStacks: 'Final-wall stacks', aiScan: 'AI hand scan', aiModel: 'AI model' };
const show = (k, v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : k === 'taiCap' && v >= 13 ? 'no cap' : String(v));

/** Plain-language list of what changed between two rule sets, e.g. "Tai cap 5 → 6". */
export function rulesDiff(a, b) {
  const out = [];
  for (const k of Object.keys(LABELS)) if (String(a[k]) !== String(b[k])) out.push(`${LABELS[k]} ${show(k, a[k])} → ${show(k, b[k])}`);
  for (const x of TAI_CATALOG) { const o = taiValue(a, x.id); const n = taiValue(b, x.id); if (o !== n) out.push(`${x.name} ${o} → ${n} Tai`); }
  if ((a.leaderboardResetAt || 0) !== (b.leaderboardResetAt || 0)) out.push(b.leaderboardResetAt ? 'Rankings were reset' : 'Rankings reset was undone');
  return out;
}

/** Called when the shared house rules change on another phone. */
export function applyRemoteRules(data) {
  prefs.rules = mergeRules(data); lastSaved = JSON.parse(JSON.stringify(prefs.rules)); write(RULES_CACHE, prefs.rules);
}

export async function loadRules(store) {
  try {
    const saved = await store.getHouseRules();
    if (saved) { prefs.rules = mergeRules(saved); write(RULES_CACHE, prefs.rules); lastSaved = JSON.parse(JSON.stringify(prefs.rules)); }
  } catch (err) { console.warn('House rules: using cached copy', err); }
  return prefs.rules;
}

export async function saveRules(store, rules) {
  const next = mergeRules(rules);
  const changes = rulesDiff(lastSaved, next);
  if (changes.length) next.lastChange = { at: Date.now(), byName: myName() || 'Someone', summary: changes.slice(0, 6).join(' · ') };
  prefs.rules = next;
  write(RULES_CACHE, prefs.rules);
  if (store) await store.saveHouseRules(prefs.rules);
  lastSaved = JSON.parse(JSON.stringify(prefs.rules));
  return prefs.rules;
}
