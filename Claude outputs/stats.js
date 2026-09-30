// Cross-game player statistics for the leaderboard / player directory (pure functions).
import { MAX_TAI, audit, INSTANT_KINDS } from './scoring.js';

export const playerKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

function blank(key, name, handle = '', id = null) {
  return {
    key, id, name, handle,
    tables: 0, tableWins: 0, hands: 0, points: 0,
    wins: 0, selfDraws: 0, discardWins: 0, payAllWins: 0, shots: 0, kongs: 0, limitHands: 0,
    taiSum: 0, maxTai: 0, bestWin: 0, bestTable: null, worstTable: null, lastPlayed: 0,
  };
}

/**
 * rooms: [{ code, players:[4 names], playerIds?:[4], handles?:[4], createdAt, status, settings }]
 * eventsByRoom: { [code]: [event] }
 * roster: [{ id, name, handle }]  (players with no games are included with zeros)
 */
export function computeLeaderboard(rooms, eventsByRoom, roster = []) {
  const map = new Map();
  const byName = new Map(roster.map((p) => [playerKey(p.name), p]));
  const keyFor = (room, seat) => {
    const id = room.playerIds?.[seat];
    if (id) return 'id:' + id;
    const r = byName.get(playerKey(room.players[seat]));
    return r ? 'id:' + r.id : 'name:' + playerKey(room.players[seat]);
  };
  const get = (room, seat) => {
    const k = keyFor(room, seat);
    if (!map.has(k)) {
      const r = k.startsWith('id:') ? roster.find((p) => 'id:' + p.id === k) : null;
      map.set(k, blank(k, r?.name || String(room.players[seat]).trim(), r?.handle || room.handles?.[seat] || '', r?.id || null));
    }
    return map.get(k);
  };
  roster.forEach((p) => { const k = 'id:' + p.id; if (!map.has(k)) map.set(k, blank(k, p.name, p.handle || '', p.id)); });

  for (const room of rooms) {
    if (room.status === 'cancelled') continue;
    const evs = eventsByRoom[room.code] || [];
    const a = audit(evs);
    if (a.active === 0) continue; // skip empty games
    const top = Math.max(...a.balances);
    const played = Math.max(room.createdAt || 0, ...evs.map((e) => e.createdAt || 0));
    room.players.forEach((name, seat) => {
      const p = get(room, seat);
      if (played >= p.lastPlayed) { p.lastPlayed = played; if (!p.id) p.name = String(name).trim(); }
      p.tables++;
      p.hands += a.hands;
      p.points += a.balances[seat];
      if (a.balances[seat] === top && top > 0) p.tableWins++;
      if (p.bestTable === null || a.balances[seat] > p.bestTable) p.bestTable = a.balances[seat];
      if (p.worstTable === null || a.balances[seat] < p.worstTable) p.worstTable = a.balances[seat];
    });
    for (const ev of evs) {
      if (ev.voided) continue;
      if (ev.type === 'win') {
        const w = get(room, ev.winner);
        const cap = ev.cap || room.settings?.taiCap || MAX_TAI;
        const tai = Number(ev.tai) || 0;
        w.wins++; w.taiSum += Math.min(cap, tai); w.maxTai = Math.max(w.maxTai, tai);
        if (tai >= cap) w.limitHands++;
        if (ev.baoBy != null) w.payAllWins++;
        else if (ev.selfDraw) w.selfDraws++;
        else w.discardWins++;
        if (!ev.selfDraw && ev.shooter != null) get(room, ev.shooter).shots++;
        w.bestWin = Math.max(w.bestWin, ev.deltas?.[ev.winner] ?? 0);
      } else if (ev.type === 'kong' || (ev.type === 'instant' && INSTANT_KINDS[ev.kind]?.kong)) {
        get(room, ev.player).kongs++;
      }
    }
  }
  return [...map.values()].map((p) => ({
    ...p,
    games: p.tables,
    winRate: p.hands ? p.wins / p.hands : 0,
    shotRate: p.hands ? p.shots / p.hands : 0,
    avgTai: p.wins ? p.taiSum / p.wins : 0,
    avgPerTable: p.tables ? p.points / p.tables : 0,
  }));
}

export const SORTS = {
  points: { label: 'Total points', fn: (a, b) => b.points - a.points },
  avgPerTable: { label: 'Avg points / game', fn: (a, b) => b.avgPerTable - a.avgPerTable },
  wins: { label: 'Total wins', fn: (a, b) => b.wins - a.wins || b.points - a.points },
  winRate: { label: 'Win rate %', fn: (a, b) => b.winRate - a.winRate || b.wins - a.wins },
  maxTai: { label: 'Highest Tai', fn: (a, b) => b.maxTai - a.maxTai || b.points - a.points },
  selfDraws: { label: 'Self-draws', fn: (a, b) => b.selfDraws - a.selfDraws || b.wins - a.wins },
  payAllWins: { label: 'Pay-all wins', fn: (a, b) => b.payAllWins - a.payAllWins || b.wins - a.wins },
  games: { label: 'Games played', fn: (a, b) => b.games - a.games || b.points - a.points },
  tableWins: { label: 'Games won (#1 finish)', fn: (a, b) => b.tableWins - a.tableWins || b.points - a.points },
  safest: { label: 'Safest (lowest shoot rate)', fn: (a, b) => a.shotRate - b.shotRate || b.hands - a.hands },
};

/** Sort and assign ranks (ties share a rank). */
export function rankPlayers(list, sortKey = 'points') {
  const s = SORTS[sortKey] || SORTS.points;
  const sorted = [...list].sort((a, b) => s.fn(a, b) || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || s.fn(sorted[i - 1], p) !== 0) rank = i + 1;
    return { ...p, rank };
  });
}

export const PERIODS = {
  today: { label: 'Today', since: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); } },
  week: { label: 'This week', since: () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); } },
  month: { label: 'This month', since: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); } },
  year: { label: 'This year', since: () => new Date(new Date().getFullYear(), 0, 1).getTime() },
  all: { label: 'All-time', since: () => 0 },
};

/** Filter games to those active since a timestamp, ignoring games from before a leaderboard reset. */
export function roomsInPeriod(rooms, eventsByRoom, since, resetAt = 0) {
  return rooms.filter((r) => {
    const evs = eventsByRoom[r.code] || [];
    const last = Math.max(r.createdAt || 0, ...evs.map((e) => e.createdAt || 0));
    return last >= (since || 0) && (r.createdAt || 0) >= (resetAt || 0);
  });
}
