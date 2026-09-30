// Data backup & restore: export / import JSON (merge), reset rankings, sample data (demo mode).
import { prefs, saveRules } from './prefs.js';
import { winDeltas, instantDeltas } from './scoring.js';
import { tableSettings } from './rules.js';
import { app, getAll, invalidate, invalidateRoster } from './data.js';
import { esc, toast, copyText, download, fileStamp, confirmBox, sheet, closeSheet } from './ui.js';

const APP_ID = 'mahjong-sg-tracker';

async function exportData() {
  const d = await getAll(true);
  return { app: APP_ID, version: 2, exportedAt: new Date().toISOString(), players: d.players, rooms: d.rooms, eventsByRoom: d.eventsByRoom, houseRules: prefs.rules };
}

function validate(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a JSON object');
  // v1 single-table export → convert
  if (obj.table && Array.isArray(obj.events)) return { players: [], rooms: [obj.table], eventsByRoom: { [obj.table.code]: obj.events } };
  if (!Array.isArray(obj.rooms)) throw new Error('No games found in this file');
  for (const r of obj.rooms) {
    if (!r.code || !Array.isArray(r.players) || r.players.length !== 4) throw new Error('A game in the file is malformed');
    for (const ev of obj.eventsByRoom?.[r.code] || []) {
      if (!Array.isArray(ev.deltas) || ev.deltas.length !== 4 || ev.deltas.reduce((a, b) => a + b, 0) !== 0) throw new Error(`Game ${r.code} has an entry that is not zero-sum`);
    }
  }
  return { players: obj.players || [], rooms: obj.rooms, eventsByRoom: obj.eventsByRoom || {} };
}

async function doImport(text) {
  let data;
  try { data = validate(JSON.parse(text)); } catch (err) { return toast('Import failed: ' + err.message); }
  const nEv = Object.values(data.eventsByRoom).reduce((s, l) => s + l.length, 0);
  if (!await confirmBox({ title: 'Merge this backup?', text: `${data.players.length} players, ${data.rooms.length} games, ${nEv} entries. Games that already exist here are skipped; nothing is deleted.`, ok: 'Merge (combine)' })) return;
  try { const n = await app.store.importAll(data); invalidateRoster(); invalidate(); toast(`Imported ${n} records`); }
  catch (err) { console.error(err); toast('Import failed: ' + (err.code || err.message)); }
}

export async function renderBackup($app) {
  $app.innerHTML = '<p class="muted center pad">Loading…</p>';
  let d; try { d = await getAll(true); } catch (err) { $app.innerHTML = `<div class="card muted">${esc(err.message)}</div>`; return; }
  const rounds = Object.values(d.eventsByRoom).flat().filter((e) => !e.voided && (e.type === 'win' || e.type === 'draw')).length;
  const payouts = Object.values(d.eventsByRoom).flat().filter((e) => !e.voided && (e.type === 'instant' || e.type === 'kong')).length;
  const cloud = app.store.mode === 'cloud';
  $app.innerHTML = `
    <div class="pagehead"><h1>💾 Backup & data sharing</h1><p class="muted">Export for safekeeping, share with friends, or merge results</p></div>
    <section class="card"><div class="row-between"><h2>${cloud ? '☁️ Cloud database' : '📱 This device (demo mode)'}</h2><span class="tag">${cloud ? 'Shared live' : 'Offline'}</span></div>
      <p class="small muted">${cloud ? 'All games, rounds and stats are stored in your free Firebase database and shared with everyone who has the link.' : 'Demo mode stores everything in this browser only. Export regularly or set up Firebase to share.'}</p>
      <div class="bigres four"><div><small>Players</small><b>${d.players.length}</b></div><div><small>Games</small><b>${d.rooms.length}</b></div><div><small>Rounds</small><b>${rounds}</b></div><div><small>Payouts</small><b>${payouts}</b></div></div></section>
    <section class="card"><h2>Export & import</h2>
      <div class="sharegrid">
        <button class="btn" data-a="dl">⬇ Download .json file</button><button class="btn" data-a="copy">📋 Copy JSON text</button>
        <label class="btn filebtn">⬆ Upload backup file<input type="file" accept="application/json,.json" data-file hidden /></label><button class="btn" data-a="paste">📥 Paste JSON</button>
      </div>
      <details class="small"><summary>Playing on separate phones and combining scores</summary><ol class="steps">
        <li>Each phone records its own games (e.g. in demo mode).</li><li>When done, tap <b>Download</b> or <b>Copy JSON</b>.</li>
        <li>Send the file or text to a friend (WhatsApp / chat).</li><li>They open this page → <b>Upload</b> or <b>Paste JSON</b> → <b>Merge</b>.</li></ol></details></section>
    <section class="card"><h2>Leaderboard reset</h2>
      <p class="small muted">Start a new season: rankings count only games created after the reset. Nothing is deleted — you can undo it.</p>
      <button class="btn danger block" data-a="reset">Reset all rankings to 0</button>
      ${prefs.rules.leaderboardResetAt ? `<p class="small">Last reset: ${new Date(prefs.rules.leaderboardResetAt).toLocaleString()} <button class="btn sm" data-a="unreset">Undo reset</button></p>` : ''}</section>
    ${cloud ? '' : `<section class="card"><h2>Sample data</h2><p class="small muted">Load 5 sample players and 2 sample games to try every screen.</p><button class="btn block" data-a="sample">🎲 Load sample tournament</button></section>`}`;

  $app.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'dl') return download(`mahjong-backup-${fileStamp()}.json`, JSON.stringify(await exportData(), null, 2), 'application/json');
    if (a === 'copy') return copyText(JSON.stringify(await exportData()), 'Backup JSON copied');
    if (a === 'paste') return sheet({
      title: '📥 Paste backup JSON', body: '<textarea class="jsonbox" rows="10" placeholder="Paste the JSON text here"></textarea>',
      footer: '<button class="btn primary block" data-go>Check & merge</button>',
      onMount(api) { api.el.addEventListener('click', async (ev) => { if (!ev.target.closest('[data-go]')) return; const t = api.el.querySelector('textarea').value; closeSheet(); await doImport(t); renderBackup($app); }); },
    });
    if (a === 'reset') {
      if (!await confirmBox({ title: 'Reset all rankings?', text: 'Leaderboard, home champions and career stats will only count games from now on. Games themselves are kept.', ok: 'Reset rankings', danger: true })) return;
      await saveRules(app.store, { ...prefs.rules, leaderboardResetAt: Date.now() }); invalidate(); toast('Rankings reset'); return renderBackup($app);
    }
    if (a === 'unreset') { await saveRules(app.store, { ...prefs.rules, leaderboardResetAt: 0 }); toast('Reset undone'); return renderBackup($app); }
    if (a === 'sample') { await loadSample(); toast('Sample tournament loaded'); return renderBackup($app); }
  };
  $app.onchange = async (e) => {
    const inp = e.target.closest('[data-file]'); if (!inp || !inp.files[0]) return;
    const text = await inp.files[0].text(); await doImport(text); renderBackup($app);
  };
}

async function loadSample() {
  const s = app.store;
  const people = [['Ah Hock', 'Kong King'], ['Mei Ling', 'Wind Queen'], ['Siew Lan', 'Lucky Pong'], ['Kenji', 'Tile Wizard'], ['Priya', 'Dragon Master']];
  const ids = [];
  for (const [name, handle] of people) ids.push(await s.savePlayer({ name, handle }));
  invalidateRoster();
  const settings = tableSettings(prefs.rules);
  const mk = async (seats, daysAgo, rounds, status) => {
    const code = await s.createRoom({ name: 'Sample game', players: seats.map((i) => people[i][0]), playerIds: seats.map((i) => ids[i]), handles: seats.map((i) => people[i][1]),
      startingScore: 0, scorekeeper: people[seats[0]][0], location: 'Sample club', notes: 'Sample data', settings, status: 'active' });
    for (const r of rounds) await s.addEvent(code, r);
    if (status !== 'active') await s.updateRoom(code, { status, finishedAt: Date.now() - daysAgo * 864e5 + 3 * 3600e3 });
    return code;
  };
  const W = (o) => ({ type: 'win', cap: settings.taiCap, ...o, deltas: winDeltas({ ...o, cap: settings.taiCap }) });
  await mk([4, 3, 2, 1], 6, [
    W({ winner: 0, selfDraw: true, tai: 3, patterns: [{ id: 'allPong', n: 1 }, { id: 'flower', n: 1 }] }),
    W({ winner: 1, shooter: 3, tai: 2, patterns: [{ id: 'allChow', n: 1 }, { id: 'season', n: 1 }] }),
    { type: 'instant', player: 2, kind: 'concealedKong', deltas: instantDeltas({ player: 2, kind: 'concealedKong' }, settings) },
    W({ winner: 2, shooter: 3, tai: 2, patterns: [{ id: 'halfColour', n: 1 }] }),
    W({ winner: 0, selfDraw: true, tai: 7, patterns: [{ id: 'bigDragons', n: 1 }] }),
    W({ winner: 1, shooter: 3, baoBy: 3, baoReason: 'fullColour', tai: 4, patterns: [{ id: 'fullColour', n: 1 }] }),
    { type: 'draw', deltas: [0, 0, 0, 0] },
  ], 'completed');
  await mk([0, 1, 2, 3], 1, [
    W({ winner: 3, shooter: 0, tai: 4, patterns: [{ id: 'pingHu', n: 1 }] }),
    { type: 'instant', player: 0, kind: 'exposedKong', deltas: instantDeltas({ player: 0, kind: 'exposedKong' }, settings) },
    W({ winner: 0, shooter: 1, tai: 2, patterns: [{ id: 'sevenPairs', n: 1 }] }),
  ], 'active');
  invalidate();
}
