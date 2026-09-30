// Pure end-of-game recap: standings, wins by method, what each player won with, all rounds, highest hand.
import { audit, basePoints, MAX_TAI, INSTANT_KINDS } from './scoring.js';
import { byId } from './hand.js';

const WIND = ['East', 'South', 'West', 'North'];
const WZH = ['東', '南', '西', '北'];

export function patternText(list = [], zh = true) {
  return list.map(({ id, n }) => { const x = byId[id]; if (!x) return id; return `${x.name}${zh ? ` (${x.zh})` : ''}${n > 1 ? ` ×${n}` : ''}`; }).join(' + ');
}

export function methodText(ev, names) {
  if (ev.baoBy != null) return `Pay-all by ${names[ev.baoBy]}`;
  if (ev.selfDraw) return 'Self-draw';
  return `Discard from ${names[ev.shooter]}`;
}

export function buildRecap(room, events, rules = {}) {
  const names = room.players;
  const start = Number(room.startingScore) || 0;
  const a = audit(events);
  const players = names.map((name, seat) => ({
    seat, name, handle: room.handles?.[seat] || '', wind: WIND[seat], windZh: WZH[seat],
    net: a.balances[seat], points: start + a.balances[seat],
    wins: 0, selfDraws: 0, discardWins: 0, payAll: 0, shots: 0, kongs: 0, winsDetail: [],
  }));
  const rounds = []; let n = 0; let highest = null;
  for (const ev of events) {
    if (ev.voided) continue;
    if (ev.type === 'win') {
      n++;
      const p = players[ev.winner];
      p.wins++;
      if (ev.baoBy != null) p.payAll++; else if (ev.selfDraw) p.selfDraws++; else p.discardWins++;
      if (!ev.selfDraw && ev.shooter != null) players[ev.shooter].shots++;
      const cap = ev.cap || rules.taiCap || MAX_TAI;
      const detail = { round: n, tai: ev.tai, effective: Math.min(ev.tai, cap), base: basePoints(ev.tai, cap), points: ev.deltas[ev.winner],
        method: methodText(ev, names), patterns: ev.patterns ? patternText(ev.patterns) : '', selfDraw: !!ev.selfDraw, remarks: ev.remarks || '' };
      p.winsDetail.push(detail);
      rounds.push({ n, type: 'win', text: `${names[ev.winner]} (${ev.baoBy != null ? 'Pay-all' : ev.selfDraw ? 'Self-draw' : `from ${names[ev.shooter]}`})`, tai: ev.tai, patterns: detail.patterns });
      if (!highest || ev.tai > highest.tai) highest = { seat: ev.winner, name: names[ev.winner], ...detail };
    } else if (ev.type === 'draw') {
      n++; rounds.push({ n, type: 'draw', text: 'Draw', tai: null, patterns: '' });
    } else if (ev.type === 'instant' || ev.type === 'kong') {
      if (ev.type === 'kong' || INSTANT_KINDS[ev.kind]?.kong) players[ev.player].kongs++;
    }
  }
  const standings = [...players].sort((x, y) => y.points - x.points || y.wins - x.wins || x.seat - y.seat);
  let rank = 0; standings.forEach((p, i) => { if (i === 0 || standings[i - 1].points !== p.points) rank = i + 1; p.rank = rank; });
  const end = room.finishedAt || Date.now();
  return {
    code: room.code, name: room.name, location: room.location || '', status: room.status || 'active',
    startedAt: room.createdAt, finishedAt: room.finishedAt || null, durationMs: Math.max(0, end - (room.createdAt || end)),
    rounds, roundCount: n, players, standings, winner: standings[0], highest, balanced: a.balanced, total: a.total,
    payouts: events.filter((e) => !e.voided && (e.type === 'instant' || e.type === 'kong')).length,
  };
}

export function fmtDuration(ms) {
  const m = Math.round(ms / 60000); const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

export function gameNumber(room) {
  const d = new Date(room.createdAt || Date.now());
  const p = (x) => String(x).padStart(2, '0');
  return `MJ-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${room.code}`;
}

const MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];

/** format: 'whatsapp' (*bold*), 'teams' (**markdown**), 'plain' */
export function recapText(r, format = 'plain', unit = 'pts') {
  const B = format === 'whatsapp' ? (s) => `*${s}*` : format === 'teams' ? (s) => `**${s}**` : (s) => s;
  const nl = '\n';
  const sign = (x) => `${x > 0 ? '+' : ''}${x}`;
  const L = [];
  L.push(`🀄 ${B('Mahjong Recap')} — ${gameNumber({ code: r.code, createdAt: r.startedAt })}`);
  if (r.name) L.push(`${r.name}${r.location ? ` · ${r.location}` : ''}`);
  L.push(`Rounds: ${r.roundCount} · Duration: ${fmtDuration(r.durationMs)}`);
  L.push('');
  L.push(B('Final standings'));
  r.standings.forEach((p, i) => {
    L.push(`${MEDAL[Math.min(p.rank - 1, 3)] || MEDAL[i]} ${p.name}${p.handle ? ` "${p.handle}"` : ''} — ${p.points} ${unit} (${sign(p.net)}) · ${p.wins}× win (${p.selfDraws} self-draw, ${p.discardWins} discard${p.payAll ? `, ${p.payAll} pay-all` : ''})`);
  });
  L.push('');
  L.push(B('What they won with'));
  r.standings.forEach((p) => {
    if (!p.winsDetail.length) return;
    L.push(`${p.name}:`);
    p.winsDetail.forEach((w) => L.push(`  • R${w.round} ${w.tai} Tai ${sign(w.points)} — ${w.patterns || 'Tai entered directly'} (${w.method})`));
  });
  if (r.highest) { L.push(''); L.push(`${B('Highest hand')}: ${r.highest.name} — ${r.highest.tai} Tai${r.highest.patterns ? ` (${r.highest.patterns})` : ''}`); }
  L.push(''); L.push(r.balanced ? '✓ Zero-sum balanced' : `✗ Not balanced (Σ ${r.total})`);
  return L.join(nl);
}

export function recapCsv(r) {
  const q = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [['Rank', 'Seat', 'Player', 'Handle', 'Points', 'Net', 'Wins', 'Self-draw', 'Discard', 'Pay-all', 'Shot', 'Kongs']];
  r.standings.forEach((p) => rows.push([p.rank, p.wind, p.name, p.handle, p.points, p.net, p.wins, p.selfDraws, p.discardWins, p.payAll, p.shots, p.kongs]));
  rows.push([]); rows.push(['Round', 'Result', 'Tai', 'Patterns']);
  r.rounds.forEach((x) => rows.push([x.n, x.text, x.tai ?? '', x.patterns]));
  return '﻿' + rows.map((row) => row.map(q).join(',')).join('\r\n');
}
