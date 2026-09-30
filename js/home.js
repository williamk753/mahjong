// Home dashboard and the Game tab (resume / join / start).
import { computeLeaderboard, rankPlayers, PERIODS, roomsInPeriod } from './stats.js';
import { audit } from './scoring.js';
import { prefs, unit, zh } from './prefs.js';
import { gameNumber } from './recap-core.js';
import { app, getAll, currentGame, setCurrentGame } from './data.js';
import { esc, sign, pct, avatar, fmtDate } from './ui.js';

function gameCard(r, evs) {
  const a = audit(evs || []);
  const top = r.players[a.balances.indexOf(Math.max(...a.balances))];
  const st = r.status || 'active';
  return `<a class="gamecard" href="#/t/${esc(r.code)}${st === 'active' ? '' : '/recap'}">
    <div class="row-between"><b>${esc(gameNumber(r))}</b><span class="status ${esc(st)}">${st === 'cancelled' ? 'ended' : esc(st)}</span></div>
    <div class="small muted">${fmtDate(r.createdAt)}${r.location ? ` · ${esc(r.location)}` : ''}${r.name ? ` · ${esc(r.name)}` : ''}</div>
    <div class="small">${r.players.map(esc).join(' · ')}</div>
    ${a.active ? `<div class="small">${st === 'active' ? 'Leading' : 'Winner'}: <b>${esc(top)}</b> (${sign(Math.max(...a.balances))} ${esc(unit())})</div>` : '<div class="small muted">No rounds yet</div>'}
  </a>`;
}

export async function renderHome($app) {
  const hr = prefs.rules;
  $app.innerHTML = `
    <section class="hero">
      <div class="hero-tile">胡</div>
      <div class="small hero-tag">SINGAPORE / SEA RULES · capped at ${hr.taiCap >= 13 ? 'no' : hr.taiCap} Tai</div>
      <h1>Mahjong Score Tracker</h1>
      <p>Exponential base points 2<sup>Tai</sup>, instant kong payouts and a zero-sum balance audit — shared live with every player.</p>
      <div class="hero-btns"><a class="btn gold" href="#/new">🀄 Start new game</a><a class="btn ghost" href="#/score">🧮 Score calc</a></div>
    </section>
    <div id="homeStats"><p class="muted center pad">Loading…</p></div>`;
  let d;
  try { d = await getAll(); } catch (err) { document.getElementById('homeStats').innerHTML = `<div class="card muted">${esc(err.message)}</div>`; return; }
  const all = rankPlayers(computeLeaderboard(roomsInPeriod(d.rooms, d.eventsByRoom, 0, hr.leaderboardResetAt), d.eventsByRoom, d.players), 'points').filter((p) => p.games > 0);
  const month = rankPlayers(computeLeaderboard(roomsInPeriod(d.rooms, d.eventsByRoom, PERIODS.month.since(), hr.leaderboardResetAt), d.eventsByRoom, d.players), 'points').filter((p) => p.games > 0);
  const rooms = [...d.rooms].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const active = rooms.filter((r) => (r.status || 'active') === 'active');
  const u = esc(unit());
  const champ = (p, label, sub, cls) => p ? `<a class="champ ${cls}" href="#/players/${esc(p.id || '')}"><div class="small">${label}</div>${avatar(p.name)}<b>${esc(p.name)}</b>${p.handle ? `<small>“${esc(p.handle)}”</small>` : ''}<div class="champpts">${sign(p.points)} ${u}</div><small>${sub(p)}</small></a>`
    : `<div class="champ ${cls} empty"><div class="small">${label}</div><small>No games yet</small></div>`;
  document.getElementById('homeStats').innerHTML = `
    ${active.length ? `<section class="card live"><div class="row-between"><h2>🟢 Games in progress</h2><span class="small muted">${active.length}</span></div>${active.slice(0, 3).map((r) => gameCard(r, d.eventsByRoom[r.code])).join('')}</section>` : ''}
    <div class="champs">
      ${champ(all[0], `ALL-TIME #1 ${zh('雀王')}`, (p) => `${p.wins} wins · ${p.games} games`, 'gold')}
      ${champ(month[0], 'MONTHLY MVP', (p) => `${p.wins} wins · ${pct(p.winRate)} win rate`, 'jade')}
    </div>
    <div class="shortcuts">
      <a href="#/ranking"><span>🏆</span><b>Leaderboard</b><small>Stats & win rates</small></a>
      <a href="#/guide"><span>📖</span><b>Rules & Tai</b><small>Catalogue & pay-all</small></a>
      <a href="#/players"><span>👥</span><b>Players</b><small>Roster & career</small></a>
      <a href="#/tests"><span>🧪</span><b>Test suite</b><small>Verify the maths</small></a>
    </div>
    <section class="card"><div class="row-between"><h2>Recent games</h2><span class="small muted">${rooms.length} total</span></div>
      ${rooms.length ? rooms.slice(0, 8).map((r) => gameCard(r, d.eventsByRoom[r.code])).join('') : '<p class="muted">No games yet — start one!</p>'}</section>`;
}

export async function renderGameTab($app) {
  const cur = currentGame();
  if (cur) {
    try { const r = await app.store.getRoom(cur); if (r && (r.status || 'active') === 'active') { location.replace(`#/t/${cur}`); return; } } catch {}
    setCurrentGame('');
  }
  $app.innerHTML = '<p class="muted center pad">Loading…</p>';
  let d = null; try { d = await getAll(true); } catch {}
  const rooms = d ? [...d.rooms].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) : [];
  const active = rooms.filter((r) => (r.status || 'active') === 'active');
  const last = rooms.find((r) => r.status === 'completed');
  $app.innerHTML = `
    <section class="card center emptytable"><div class="bigtile">🀄</div><h2>No game open on this phone</h2>
      <p class="muted">Start a new game, join a friend's game with its code, or continue one in progress.</p>
      <a class="btn primary block big" href="#/new">Start new game</a>
      <form id="joinForm" class="joinrow"><input type="text" name="code" placeholder="Game code e.g. K7PX2M" maxlength="10" required /><button class="btn">Join</button></form></section>
    ${active.length ? `<section class="card"><h2>Games in progress</h2>${active.map((r) => gameCard(r, d.eventsByRoom[r.code])).join('')}</section>` : ''}
    ${last ? `<section class="card"><h2>Last finished game</h2>${gameCard(last, d.eventsByRoom[last.code])}<a class="btn block" href="#/t/${esc(last.code)}/recap">View results summary</a></section>` : ''}`;
  document.getElementById('joinForm').onsubmit = (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim().toUpperCase().replace(/^MJ-\d{8}-/, '');
    if (code) location.hash = `#/t/${code}`;
  };
}
