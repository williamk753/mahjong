// Continue a table: work out where the wind table stopped (dealer, round wind, dealer streak) so a new game can pick it up.
// Pure helpers + one loader; no DOM.
import { dealerState, WIND_NAMES } from './rules.js';

export const CLOSED = ['completed', 'cancelled'];
export const STALE_MS = 8 * 3600e3; // an open game with no activity for this long was left unfinished
const played = (events = []) => events.filter((e) => !e.voided && (e.type === 'win' || e.type === 'draw')).length;

/** Where the wind table stopped: { dealer, round, streak }. null when the game did not track a dealer or no round was played. */
export function tableResume(room, events = []) {
  if (!played(events)) return null;
  const ds = dealerState(events, room.settings || {});
  return ds.enabled ? { dealer: ds.dealer, round: ds.round, streak: ds.streak } : null;
}

const norm = (s) => String(s || '').trim().toLowerCase();
/** Are these exactly the same four players (names, any seat order)? */
export const samePlayers = (a = [], b = []) => a.length === 4 && b.length === 4 && a.every(Boolean) && b.every(Boolean) && a.map(norm).sort().join('|') === b.map(norm).sort().join('|');

const idKey = (ids = []) => (ids.length === 4 && ids.every(Boolean) ? [...ids].sort().join('|') : '');
/**
 * Did this game have exactly these four players (any seat order)? sel = { ids: directory ids, names }.
 * Directory ids win (a renamed player is still the same player); names cover older games and re-created players.
 */
export function sameFour(room, sel) {
  const a = idKey(room.playerIds); const b = idKey(sel.ids);
  return (a && a === b) || samePlayers(room.players, sel.names);
}

/** Did this person play in that game? (by directory id, else by name) */
export const playsIn = (room, id, name) => !!(id && room.playerIds?.includes(id)) || (room.players || []).some((p) => norm(p) === norm(name));

/** Games these four played together, newest first. */
export function roomsWith(rooms, sel) {
  return rooms.filter((r) => sameFour(r, sel)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * The wind table only carries over to the same four players. The dealer is a person, so if they sit in another seat this time
 * the dealer moves with them. sel = { ids, names } of the new seats. Returns the resume for the new seats, or null when the four are not the same.
 */
export function resumeForSeats(resume, room, sel) {
  if (!resume || !sameFour(room, sel)) return null;
  const prevId = room.playerIds?.[resume.dealer];
  let dealer = prevId ? sel.ids.indexOf(prevId) : -1;
  if (dealer < 0) dealer = sel.names.findIndex((n) => norm(n) === norm(room.players[resume.dealer]));
  return dealer < 0 ? null : { ...resume, dealer };
}

/** "South round · dealer Cara (连+1)" */
export function resumeText(resume, players) {
  return `${WIND_NAMES[resume.round]} round · dealer ${players[resume.dealer]}${resume.streak ? ` (连+${resume.streak})` : ''}`;
}

/** "3 hours" / "5 days" */
export function idleText(ms) {
  const h = Math.max(1, Math.round(ms / 3600e3));
  return h >= 48 ? `${Math.round(h / 24)} days` : `${h} hour${h === 1 ? '' : 's'}`;
}

/** Same four players in the same seats: roster ids for each seat (null if someone is no longer in the player list). */
export function seatsFor(room, roster) {
  return room.players.map((name, i) => {
    const id = room.playerIds?.[i];
    return (id && roster.some((p) => p.id === id) ? id : roster.find((p) => p.name === name)?.id) || null;
  });
}

/**
 * The game to offer. Looks at `rooms` (candidates), or the single room `code`, or the games opened on this phone (`codes`);
 * newest first, skipping games where nothing was played (an abandoned lobby must not hide the real last game).
 * state: 'closed' (finished or ended) · 'unfinished' (still open but quiet for STALE_MS: the host never pressed Finish) · 'open' (in progress now).
 * Reads a handful of documents, not the whole database. Returns { room, events, resume, state, idleMs } or null.
 */
export async function loadContinuation(store, { code = '', codes = [], rooms = null, now = Date.now() } = {}) {
  let list = rooms;
  if (!list) {
    const wanted = code ? [code] : codes.slice(0, 5);
    list = (await Promise.all(wanted.map((c) => store.getRoom(c).catch(() => null)))).filter(Boolean);
  }
  for (const room of [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5)) {
    const events = await new Promise((res) => {
      const un = store.watchEvents(room.code, (evs) => { res(evs); setTimeout(() => un && un(), 0); }, () => res([]));
    });
    if (!played(events)) continue;
    const last = Math.max(room.createdAt || 0, ...events.map((e) => e.createdAt || 0));
    const idleMs = Math.max(0, now - last);
    const state = CLOSED.includes(room.status) ? 'closed' : idleMs > STALE_MS ? 'unfinished' : 'open';
    return { room, events, resume: tableResume(room, events), state, idleMs };
  }
  return null;
}
