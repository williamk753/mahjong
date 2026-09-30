// App shell: boot, router, header & bottom navigation.
import { createStore, isDemo } from './store.js';
import { prefs, loadRules, applyDisplay } from './prefs.js';
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

const $app = document.getElementById('app');

const NAV_OF = { '': 'home', new: 'game', game: 'game', t: 'game', score: 'score', ranking: 'ranking', leaderboard: 'ranking',
  more: 'more', players: 'more', guide: 'more', tiles: 'more', tests: 'more', settings: 'more', backup: 'more' };
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

async function route() {
  stopGame(); closeSheet();
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
      default: location.replace('#/');
    }
  } catch (err) {
    console.error(err);
    if (/permission|auth/i.test(String(err?.code || err?.message))) return showDbError(err);
    $app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p><a class="btn" href="#/">Home</a></div>`;
  }
}

(async function boot() {
  applyDisplay();
  header();
  window.addEventListener('hashchange', route);
  route();
  try { app.store = await createStore(); await loadRules(app.store); }
  catch (err) { console.error(err); app.storeError = err; }
  header();
  const page = location.hash.replace(/^#\/?/, '').split('/')[0] || '';
  if (NEEDS_STORE.has(page) || page === 'settings') route();
})();
