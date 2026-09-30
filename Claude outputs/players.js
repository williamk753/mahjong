// Player directory: roster with handles, career stats, profile with recent games.
import { computeLeaderboard, playerKey } from './stats.js';
import { audit } from './scoring.js';
import { prefs, unit } from './prefs.js';
import { gameNumber } from './recap-core.js';
import { app, getAll, invalidateRoster } from './data.js';
import { playerForm } from './newgame.js';
import { esc, sign, pct, avatar, sheet, closeSheet, toast, fmtDate } from './ui.js';

async function load(force) {
  const d = await getAll(force);
  const stats = computeLeaderboard(d.rooms.filter((r) => (r.createdAt || 0) >= (prefs.rules.leaderboardResetAt || 0)), d.eventsByRoom, d.players);
  return { d, stats };
}

function editSheet(p, onDone) {
  sheet({
    title: p.id ? '✏️ Edit player' : '＋ Add player', body: playerForm(p), footer: '<button class="btn primary block" data-save>Save</button>',
    onMount(api) {
      api.el.querySelector('[name=pname]').focus();
      api.el.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-save]')) return;
        const name = api.el.querySelector('[name=pname]').value.trim(); const handle = api.el.querySelector('[name=phandle]').value.trim();
        if (!name) return toast('Enter a name');
        const { d } = await load(true);
        if (d.players.some((x) => x.id !== p.id && playerKey(x.name) === playerKey(name))) return toast('That name already exists');
        await app.store.savePlayer({ ...(p.id ? { id: p.id } : {}), name, handle });
        invalidateRoster(); closeSheet(); toast('Saved'); onDone();
      });
    },
  });
}

export async function renderPlayers($app) {
  $app.innerHTML = '<p class="muted center pad">Loading players…</p>';
  let x; try { x = await load(true); } catch (err) { $app.innerHTML = `<div class="card muted">${esc(err.message)}</div>`; return; }
  const u = esc(unit());
  const list = x.stats.filter((p) => p.id).sort((a, b) => b.points - a.points);
  const unlinked = x.stats.filter((p) => !p.id);
  $app.innerHTML = `
    <div class="pagehead row-between"><div><h1>👥 Player directory</h1><p class="muted">Manage the roster and view career statistics</p></div><button class="btn primary" data-add>＋ Add</button></div>
    ${list.length ? list.map((p) => `<a class="pcardrow card" href="#/players/${esc(p.id)}">
      <div class="row-between"><span class="pname">${avatar(p.name)}<span><b>${esc(p.name)}</b>${p.handle ? `<small>“${esc(p.handle)}”</small>` : ''}</span></span>
        <span class="lbpts"><b class="${p.points > 0 ? 'pos' : p.points < 0 ? 'neg' : ''}">${sign(p.points)}</b><small>career ${u}</small></span></div>
      <div class="stats compact"><span class="stat"><small>Games</small><b>${p.games}</b></span><span class="stat"><small>Wins (win%)</small><b>${p.wins} (${pct(p.winRate)})</b></span>
        <span class="stat"><small>Self-draws</small><b>${p.selfDraws}</b></span><span class="stat"><small>Max Tai</small><b>${p.maxTai ? p.maxTai + ' Tai' : '–'}</b></span></div></a>`).join('')
      : '<div class="card center muted">No players yet. Add your group to start games faster.</div>'}
    ${unlinked.length ? `<section class="card"><h2>Players from older games</h2><p class="small muted">These names were typed directly into games. Add them to the directory to track them by profile.</p>
      ${unlinked.map((p) => `<div class="row-between unl"><span>${avatar(p.name, 'sm')} <b>${esc(p.name)}</b> <small class="muted">${p.games} games · ${sign(p.points)}</small></span><button class="btn sm" data-link="${esc(p.name)}">＋ Add</button></div>`).join('')}</section>` : ''}`;
  $app.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add !== undefined) return editSheet({}, () => renderPlayers($app));
    if (b.dataset.link) return editSheet({ name: b.dataset.link }, () => renderPlayers($app));
  };
}

export async function renderProfile($app, id) {
  $app.innerHTML = '<p class="muted center pad">Loading…</p>';
  const { d, stats } = await load(false);
  const pl = d.players.find((p) => p.id === id);
  const p = stats.find((s) => s.id === id);
  if (!pl || !p) { $app.innerHTML = '<div class="card center">Player not found. <a href="#/players">Back</a></div>'; return; }
  const u = esc(unit());
  const games = d.rooms.filter((r) => r.status !== 'cancelled' && (r.playerIds?.includes(id) || r.players.some((n) => playerKey(n) === playerKey(pl.name))))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const rows = games.slice(0, 15).map((r) => {
    const seat = r.playerIds?.indexOf(id) >= 0 ? r.playerIds.indexOf(id) : r.players.findIndex((n) => playerKey(n) === playerKey(pl.name));
    const a = audit(d.eventsByRoom[r.code] || []); const bal = a.balances[seat];
    const rank = 1 + a.balances.filter((x) => x > bal).length;
    return `<a class="gamecard" href="#/t/${esc(r.code)}${(r.status || 'active') === 'active' ? '' : '/recap'}"><div class="row-between"><b>${esc(gameNumber(r))}</b><b class="${bal > 0 ? 'pos' : bal < 0 ? 'neg' : ''}">${sign(bal)}</b></div>
      <div class="small muted">${fmtDate(r.createdAt)} · #${rank} of 4 · ${esc(r.status || 'active')}</div></a>`;
  }).join('');
  $app.innerHTML = `
    <a class="small" href="#/players">← Players</a>
    <section class="card profile"><div class="row-between"><span class="pname">${avatar(pl.name, 'lg')}<span><h1>${esc(pl.name)}</h1>${pl.handle ? `<div class="muted">“${esc(pl.handle)}”</div>` : ''}</span></span><button class="btn sm" data-edit>✏️ Edit</button></div>
      <div class="bigres"><div><small>Career</small><b class="${p.points > 0 ? 'pos' : p.points < 0 ? 'neg' : ''}">${sign(p.points)} ${u}</b></div><div><small>Games</small><b>${p.games}</b></div><div><small>Win rate</small><b>${pct(p.winRate)}</b></div></div>
      <div class="stats">
        <span class="stat"><small>Wins</small><b>${p.wins}</b></span><span class="stat"><small>Self-draws</small><b>${p.selfDraws}</b></span><span class="stat"><small>Discard wins</small><b>${p.discardWins}</b></span>
        <span class="stat"><small>Pay-all wins</small><b>${p.payAllWins}</b></span><span class="stat"><small>Max Tai</small><b>${p.maxTai || '–'}</b></span><span class="stat"><small>Avg Tai</small><b>${p.wins ? p.avgTai.toFixed(1) : '–'}</b></span>
        <span class="stat"><small>Shot</small><b>${p.shots} (${pct(p.shotRate)})</b></span><span class="stat"><small>Kongs</small><b>${p.kongs}</b></span><span class="stat"><small>#1 finishes</small><b>${p.tableWins}</b></span>
        <span class="stat"><small>Avg / game</small><b>${sign(p.avgPerTable)}</b></span><span class="stat"><small>Best game</small><b>${p.bestTable != null ? sign(p.bestTable) : '–'}</b></span><span class="stat"><small>Best hand</small><b>${p.bestWin ? '+' + p.bestWin : '–'}</b></span>
      </div></section>
    <section class="card"><h2>Recent games</h2>${rows || '<p class="muted">No games yet.</p>'}</section>`;
  $app.onclick = (e) => { if (e.target.closest('[data-edit]')) editSheet(pl, () => renderProfile($app, id)); };
}
