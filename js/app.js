// App shell: boot, router, header & bottom navigation.
import { createStore, isDemo } from './store.js';
import { prefs, loadRules, applyDisplay, applyRemoteRules } from './prefs.js';
import { notify, openNotifications, updateBell } from './notify.js';
import { setRuleSets } from './rulesets.js';
import { app } from './data.js';
import { esc, closeSheet } from './ui.js';
import { renderHome, renderGameTab } from './home.js';
import { renderNewGame } from './newgame.js';
import { openGame, stopGame } from './game.js';
import { renderRecap } from './recap.js';
import { renderCalc } from './calc.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderPlayers, renderProfile } from './players.js';
import { renderGuide } from './guide.js';
import { renderTiles } from './tiles.js';
import { renderSettings } from './settings.js';
import { renderMore, renderTests } from './more.js';
import { renderBackup } from './backup.js';
import { renderDetector } from './detect.js';

const $app = document.getElementById('app');

const NAV_OF = { '': 'home', new: 'game', game: 'game', t: 'game', score: 'score', ranking: 'ranking', leaderboard: 'ranking',
  more: 'more', players: 'more', guide: 'more', tiles: 'more', tests: 'more', settings: 'more', backup: 'more', detector: 'more' };
const NEEDS_STORE = new Set(['', 'new', 'game', 't', 'ranking', 'leaderboard', 'players', 'backup']);

function header() {
  const r = prefs.rules;
  document.getElementById('capBadge').textContent = `TAI ${r.taiCap >= 13 ? '∞' : r.taiCap}`;
  const b = document.getElementById('modeBadge');
  b.textContent = app.storeError ? 'Offline' : isDemo ? 'Demo · this phone' : app.store ? 'Cloud sync' : 'Connecting…';
  b.className = 'badge ' + (app.storeError ? 'bad' : isDemo ? 'demo' : 'ok');
}

function showDbError(err) {
  const msg = String(err?.code || err?.message || err);
  const hint = /admin-restricted|operation-not-allowed/.test(msg)
    ? 'Anonymous sign-in is not enabled. Firebase console → Authentication → Sign-in method → Anonymous → Enable.'
    : /permission/i.test(msg) ? 'Firestore rules are missing or out of date. Publish firestore.rules in the Firebase console.'
    : 'Check js/config.js, that the Firestore database exists, and that Anonymous sign-in is enabled.';
  $app.innerHTML = `<div class="card"><h2>Can't connect to the database</h2><p class="muted">${esc(err?.message || msg)}</p><p class="small">${hint}</p>
    <p class="small">The <a href="#/score">Score calculator</a>, <a href="#/guide">Rules & Tai</a> and <a href="#/tests">Test suite</a> still work offline.</p></div>`;
}

/* ---------- 🔒 lock screen ---------- */
function showLock(msg = '') {
  document.body.classList.add('locked');
  $app.innerHTML = `<section class="lockcard">
      <div class="locktile">🀄</div><h1>Mahjong Score</h1><p class="muted">Enter the group password to open the app.</p>
      <form id="lockForm" autocomplete="off"><input type="password" name="pw" inputmode="numeric" placeholder="Password" maxlength="40" required autofocus />
        <button class="btn primary block big" type="submit">🔓 Open</button></form>
      <p class="small neg" id="lockMsg">${esc(msg)}</p>
      <p class="small muted">Asked once on each phone. Ask the group admin for the password.</p></section>`;
  document.getElementById('lockForm').onsubmit = async (e) => {
    e.preventDefault();
    const pw = new FormData(e.target).get('pw'); const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Checking…';
    try {
      await app.store.unlock(pw);
      app.unlocked = true; document.body.classList.remove('locked');
      await loadRules(app.store); watchRules(); header(); route();
    } catch (err) {
      console.error(err);
      showLock(err.code === 'wrong-password' ? '❌ Wrong password — try again.' : `Could not check the password: ${err.message}`);
    }
  };
}

async function route() {
  stopGame(); closeSheet();
  if (app.store && !app.unlocked) return showLock();
  if (!app.store && !app.storeError) { $app.innerHTML = '<p class="muted center pad">Connecting…</p>'; return; }
  $app.onclick = null; $app.onchange = null; $app.oninput = null;
  window.scrollTo(0, 0);
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const page = parts[0] || '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (NAV_OF[page] || 'home')));
  header();
  if (NEEDS_STORE.has(page) && !app.store) {
    if (app.storeError) return showDbError(app.storeError);
    $app.innerHTML = '<p class="muted center pad">Connecting…</p>';
    return;
  }
  try {
    switch (page) {
      case '': return await renderHome($app);
      case 'new': return await renderNewGame($app);
      case 'game': return await renderGameTab($app);
      case 't': {
        const code = (parts[1] || '').toUpperCase();
        return parts[2] === 'recap' ? await renderRecap($app, code) : await openGame($app, code);
      }
      case 'score': return renderCalc($app);
      case 'ranking': case 'leaderboard': return await renderLeaderboard($app);
      case 'players': return parts[1] ? await renderProfile($app, parts[1]) : await renderPlayers($app);
      case 'guide': return renderGuide($app);
      case 'tiles': return renderTiles($app);
      case 'tests': return renderTests($app);
      case 'settings': return renderSettings($app, app.store);
      case 'more': return renderMore($app);
      case 'backup': return await renderBackup($app);
      case 'detector': return renderDetector($app);
      default: location.replace('#/');
    }
  } catch (err) {
    console.error(err);
    if (/permission|auth/i.test(String(err?.code || err?.message))) return showDbError(err);
    $app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p><a class="btn" href="#/">Home</a></div>`;
  }
}

// Tell every phone when someone changes the shared house rules.
function watchRules() {
  let seen = prefs.rules.lastChange?.at || 0;
  app.store.watchHouseRules?.((data) => {
    const lc = data.lastChange;
    const changed = lc && lc.at > seen;
    if (changed) seen = lc.at;
    if (!changed) return;
    applyRemoteRules(data); header();
    if (lc.byUid && lc.byUid === app.store.uid?.()) return; // my own change
    notify({ icon: '⚙️', title: `${lc.byName || 'Someone'} changed the house rules`, body: lc.summary || '', link: '#/settings', key: `rules-${lc.at}` });
    if (location.hash.startsWith('#/settings')) route();
  });
  const seenSets = {}; let first = true;
  app.store.watchRuleSets?.((list) => {
    for (const x of list) {
      const at = x.lastChange?.at || 0;
      if (!first && at > (seenSets[x.id] || 0) && x.lastChange.byUid !== app.store.uid?.()) {
        notify({ icon: '⚙️', title: `${x.lastChange.byName || 'Someone'} changed the “${x.name}” rules`, body: x.lastChange.summary || '', link: '#/settings', key: `rs-${x.id}-${at}` });
      }
      seenSets[x.id] = Math.max(seenSets[x.id] || 0, at);
    }
    first = false;
    setRuleSets(list);
  });
}

(async function boot() {
  applyDisplay();
  header();
  window.addEventListener('hashchange', route);
  route();
  updateBell();
  document.getElementById('bell')?.addEventListener('click', openNotifications);
  try {
    app.store = await createStore();
    app.unlocked = await app.store.hasAccess();
    if (app.unlocked) { await loadRules(app.store); watchRules(); }
  } catch (err) { console.error(err); app.storeError = err; }
  header();
  route();
})();
