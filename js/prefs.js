// Shared app preferences: house rules (synced) + display options (this device).
import { mergeRules } from './rules.js';

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

export async function loadRules(store) {
  try {
    const saved = await store.getHouseRules();
    if (saved) { prefs.rules = mergeRules(saved); write(RULES_CACHE, prefs.rules); }
  } catch (err) { console.warn('House rules: using cached copy', err); }
  return prefs.rules;
}

export async function saveRules(store, rules) {
  prefs.rules = mergeRules(rules);
  write(RULES_CACHE, prefs.rules);
  if (store) await store.saveHouseRules(prefs.rules);
  return prefs.rules;
}
