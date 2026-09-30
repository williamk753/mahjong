// App-wide state: the store, a short-lived cache of all data, and the recent-games list on this device.
export const app = { store: null, storeError: null };

let cache = null; // { rooms, eventsByRoom, players, loadedAt }
export async function getAll(force = false) {
  if (!app.store) throw app.storeError || new Error('Not connected');
  if (!force && cache && Date.now() - cache.loadedAt < 30_000) return cache;
  const d = await app.store.loadAll();
  cache = { ...d, loadedAt: Date.now() };
  return cache;
}
export const invalidate = () => { cache = null; };

let rosterCache = null;
export async function getRoster(force = false) {
  if (!force && rosterCache) return rosterCache;
  rosterCache = (await app.store.listPlayers()).sort((a, b) => a.name.localeCompare(b.name));
  return rosterCache;
}
export const invalidateRoster = () => { rosterCache = null; invalidate(); };

const RECENT_KEY = 'mjsg-recent';
export function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
export function remember(room) {
  try {
    const list = recent().filter((r) => r.code !== room.code);
    list.unshift({ code: room.code, name: room.name, players: room.players, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}
const CURRENT_KEY = 'mjsg-current-game';
export const currentGame = () => { try { return localStorage.getItem(CURRENT_KEY) || ''; } catch { return ''; } };
export const setCurrentGame = (code) => { try { code ? localStorage.setItem(CURRENT_KEY, code) : localStorage.removeItem(CURRENT_KEY); } catch {} };
