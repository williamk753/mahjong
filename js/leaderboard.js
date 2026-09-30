// Ranking page: player statistics & ranking across games.
import { computeLeaderboard, rankPlayers, SORTS, PERIODS, roomsInPeriod } from './stats.js';
import { prefs, unit } from './prefs.js';
import { app, getAll, recent, invalidate } from './data.js';
import { saveRules } from './prefs.js';
import { esc, sign, pct, avatar, confirmBox, toast } from './ui.js';

const PREF_KEY = 'mjsg-lb-prefs';
let ui = { period: 'all', sort: 'points', scope: 'all' };
try { ui = { ...ui, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; if (!PERIODS[ui.period]) ui.period = 'all'; if (!SORTS[ui.sort]) ui.sort = 'points'; } catch {}
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(ui)); } catch {} };
const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

const stat = (label, value, title = '') => `<span class="stat" title="${esc(title)}"><small>${label}</small><b>${value}</b></span>`;

function headline(p) {
  switch (ui.sort) {
    case 'avgPerTable': return sign(p.avgPerTable);
    case 'wins': return `${p.wins}W`;
    case 'winRate': return pct(p.winRate);
    case 'maxTai': return p.maxTai ? `${p.maxTai} Tai` : '–';
    case 'selfDraws': return p.selfDraws;
    case 'payAllWins': return p.payAllWins;
    case 'games': return p.games;
    case 'tableWins': return `${p.tableWins}×`;
    case 'safest': return pct(p.shotRate);
    default: return sign(p.points);
  }
}

export async function renderLeaderboard($app, force = false) {
  $app.innerHTML = '<p class="muted center pad">Loading leaderboard…</p>';
  let d;
  try { d = await getAll(force); } catch (err) {
    $app.innerHTML = `<div class="card"><h2>Couldn't load the leaderboard</h2><p class="muted">${esc(err.message)}</p><p class="small">If this says "permissions", publish the latest <code>firestore.rules</code>.</p></div>`; return;
  }
  const draw = () => {
    const mine = new Set(recent().map((r) => r.code));
    let rooms = roomsInPeriod(d.rooms, d.eventsByRoom, PERIODS[ui.period].since(), prefs.rules.leaderboardResetAt || 0);
    if (ui.scope === 'mine') rooms = rooms.filter((r) => mine.has(r.code));
    const list = rankPlayers(computeLeaderboard(rooms, d.eventsByRoom, ui.period === 'all' && ui.scope === 'all' ? d.players : []), ui.sort);
    const games = rooms.filter((r) => r.status !== 'cancelled' && (d.eventsByRoom[r.code] || []).some((e) => !e.voided)).length;
    const total = list.reduce((s, p) => s + p.points, 0);
    const u = esc(unit());
    $app.innerHTML = `
      <div class="pagehead row-between"><div><h1>🏆 Mahjong leaderboard</h1><p class="muted">${games} game${games === 1 ? '' : 's'} recorded · ${d.players.length} players</p></div><span class="row-gap-h"><button class="btn sm danger" data-lbreset>Reset</button><button class="btn sm" data-refresh aria-label="Refresh">↻</button></span></div>
      <div class="chips2">${Object.entries(PERIODS).map(([k, p]) => `<button data-period="${k}" class="${ui.period === k ? 'on' : ''}">${p.label}</button>`).join('')}</div>
      <div class="chips2"><span class="small muted">Rank by:</span>${Object.entries(SORTS).map(([k, s]) => `<button data-sort="${k}" class="${ui.sort === k ? 'on' : ''}">${s.label}</button>`).join('')}</div>
      <label class="check small"><input type="checkbox" data-scope ${ui.scope === 'mine' ? 'checked' : ''}/> Only games opened on this phone</label>
      ${list.length === 0 ? '<div class="card center muted">No games in this period yet.</div>' : `
      <ol class="lb card">${list.map((p) => `
        <li><a class="lbrow" href="${p.id ? `#/players/${esc(p.id)}` : '#/players'}">
          <span class="rank">${MEDAL[p.rank] || p.rank}</span>${avatar(p.name)}
          <span class="lbname"><b>${esc(p.name)}</b><small>${p.handle ? `“${esc(p.handle)}” · ` : ''}${p.games} game${p.games === 1 ? '' : 's'} played</small></span>
          <span class="lbpts"><b class="${ui.sort === 'points' ? (p.points > 0 ? 'pos' : p.points < 0 ? 'neg' : '') : ''}">${headline(p)}</b><small>${ui.sort === 'points' ? `avg ${sign(p.avgPerTable)} / game` : `${sign(p.points)} ${u}`}</small></span></a>
          <div class="stats">
            ${stat('Win rate', pct(p.winRate))}${stat('Wins', `${p.wins}W`)}${stat('Self-draw', p.selfDraws)}${stat('Max Tai', p.maxTai ? `${p.maxTai} Tai` : '–')}
            ${stat('Pay-all wins', p.payAllWins)}${stat('Shot', `${p.shots} (${pct(p.shotRate)})`, 'Times discarded the winning tile')}${stat('Kongs', p.kongs)}${stat('#1 finish', p.tableWins)}
          </div></li>`).join('')}</ol>
      <p class="small ${total === 0 ? 'pos' : 'neg'}">${total === 0 ? '✓ Zero-sum check: all players’ points add up to 0.' : `✗ Points add up to ${total}.`}</p>`}
      ${prefs.rules.leaderboardResetAt ? `<p class="small muted">Rankings were reset on ${new Date(prefs.rules.leaderboardResetAt).toLocaleString()} — older games are not counted. <button class="btn sm" data-lbundo>Undo reset</button></p>` : ''}`;
  };
  draw();
  $app.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.period) { ui.period = b.dataset.period; savePrefs(); return draw(); }
    if (b.dataset.sort) { ui.sort = b.dataset.sort; savePrefs(); return draw(); }
    if (b.dataset.refresh !== undefined) return renderLeaderboard($app, true);
    if (b.dataset.lbreset !== undefined) {
      if (!await confirmBox({ title: 'Reset all rankings to 0?', text: 'The leaderboard, home champions and career stats will only count games from now on. No games are deleted and you can undo this.', ok: 'Reset rankings', danger: true })) return;
      await saveRules(app.store, { ...prefs.rules, leaderboardResetAt: Date.now() }); invalidate(); toast('Rankings reset'); return renderLeaderboard($app, true);
    }
    if (b.dataset.lbundo !== undefined) { await saveRules(app.store, { ...prefs.rules, leaderboardResetAt: 0 }); invalidate(); toast('Reset undone'); return renderLeaderboard($app, true); }
  };
  $app.onchange = (e) => { if (e.target.matches('[data-scope]')) { ui.scope = e.target.checked ? 'mine' : 'all'; savePrefs(); draw(); } };
}
