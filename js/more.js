// "More" menu, in-app test suite page.
import { runAll } from './selftest.js';
import { app } from './data.js';
import { esc, toast } from './ui.js';

/** 👑 Super admin login / logout (the password is checked by the database rules, never in this code). */
function adminCard() {
  if (app.store?.mode !== 'cloud') return '';
  return app.admin
    ? `<section class="card"><h2>👑 Super admin</h2><p class="small">You are logged in as super admin on this phone. You can edit every game, round, winner and score, even in finished games: open a game → <b>Audit log</b> → <b>Edit</b>, or <b>View recap</b>.</p>
        <button type="button" class="btn" data-adminout>Log out of admin</button></section>`
    : `<section class="card"><h2>👑 Super admin</h2><p class="small muted">Enter the admin password to edit any game, round, winner and score.</p>
        <form id="adminForm" class="joinrow" autocomplete="off"><input type="password" name="pw" inputmode="numeric" maxlength="40" placeholder="Admin password" required /><button class="btn">Log in</button></form>
        <p class="small neg" id="adminMsg"></p></section>`;
}

export function renderMore($app) {
  const item = (href, ic, title, sub, tint) => `<a class="menuitem" href="${href}"><span class="mi-ic ${tint}">${ic}</span><span><b>${title}</b><small>${sub}</small></span><span class="chev">›</span></a>`;
  $app.innerHTML = `
    <div class="pagehead"><h1>More options & settings</h1><p class="muted">Configuration, test suite and scoring guidelines</p></div>
    <h3 class="sect">Game reference & roster</h3>
    <div class="menu card">
      ${item('#/players', '👥', 'Player directory', 'Manage roster, table handles and career stats', 'blue')}
      ${item('#/guide', '📖', 'Scoring rules & Tai reference', 'Base hands, bonuses, limit hands, pay-all triggers', 'green')}
      ${item('#/tiles', '🀄', 'Tile picture guide', 'Winds, dragons, suits, flowers & seasons', 'red')}
    </div>
    <h3 class="sect">Verification & configuration</h3>
    <div class="menu card">
      ${item('#/detector', '📷', 'Tile detector (beta)', 'Test the free on-phone AI that reads tiles from a photo', 'green')}
      ${item('#/tests', '🧪', 'Calculation test suite', 'Run the automated business-rule checks', 'purple')}
      ${item('#/settings', '⚙️', 'House rules & app settings', 'Min / max Tai, final-wall threshold, point units', 'grey')}
      ${item('#/backup', '💾', 'Data backup & restore', 'Export / import JSON, reset rankings', 'amber')}
    </div>
    ${adminCard()}
    <section class="aboutcard"><div class="row-between"><b>Mahjong Score Tracker <span class="ver">v2.0</span></b><span class="small">${app.store?.mode === 'cloud' ? '☁️ Cloud sync' : '📱 Demo (this device)'}</span></div>
      <p class="small">Built for live mahjong tables on phones: exponential 2<sup>Tai</sup> scoring, instant payouts, pay-all, dealer tracking and a zero-sum audit. Everyone with the link sees the same game live.</p></section>`;
  const changed = () => { window.dispatchEvent(new Event('mjsg-admin')); renderMore($app); };
  const form = $app.querySelector('#adminForm');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true;
    try { await app.store.becomeAdmin(new FormData(form).get('pw')); app.admin = true; toast('👑 Logged in as super admin'); changed(); }
    catch (err) { btn.disabled = false; $app.querySelector('#adminMsg').textContent = err.code === 'wrong-password' ? '❌ Wrong password.' : `Could not log in: ${err.message}`; }
  };
  const out = $app.querySelector('[data-adminout]');
  if (out) out.onclick = async () => { try { await app.store.dropAdmin(); app.admin = false; toast('Logged out of admin'); changed(); } catch (err) { toast('Could not log out: ' + (err.code || err.message)); } };
}

export function renderTests($app) {
  const draw = () => {
    const t0 = performance.now(); const res = runAll(); const ms = Math.round(performance.now() - t0);
    const passed = res.filter((r) => r.pass).length;
    $app.innerHTML = `
      <div class="pagehead row-between"><div><h1>🧪 Calculation test suite</h1><p class="muted">Automated checks of the core scoring rules</p></div><button class="btn" data-rerun>↻ Re-run</button></div>
      <section class="card testsum ${passed === res.length ? 'ok' : 'bad'}"><b>${passed} / ${res.length} tests passed</b><span class="small">${Math.round((passed / res.length) * 100)}% verified · ${ms} ms</span>
        <p class="small">Checks chicken-hand rejection, the 2<sup>Tai</sup> formula, capping, discard / self-draw / pay-all settlements, Seven Pairs, instant payouts, undo, hand exclusivity, house rules, dealer rotation, recap and zero-sum.</p></section>
      ${res.map((r) => `<div class="testrow card"><div class="row-between"><b>Test ${r.n}: ${esc(r.name)}</b><span class="tbadge ${r.pass ? 'ok' : 'bad'}">${r.pass ? 'PASSED' : 'FAILED'}</span></div>
        <div class="small muted">${esc(r.desc)}</div>${r.pass ? '' : `<div class="small neg">${esc(r.error)}</div>`}</div>`).join('')}`;
  };
  draw();
  $app.onclick = (e) => { if (e.target.closest('[data-rerun]')) draw(); };
}
