// Start a new game: pick 4 seats from the player directory, table settings, launch.
import { prefs, zh, myName, setMyName } from './prefs.js';
import { ruleSets, ruleSet, settingsFor, DEFAULT_ID } from './rulesets.js';
import { app, getAll, getRoster, invalidateRoster, setCurrentGame, invalidate, recent } from './data.js';
import { esc, toast, sheet, closeSheet, fmtDate, WIND_EN, WIND_ZH } from './ui.js';
import { loadContinuation, resumeText, seatsFor, sameFour, playsIn, roomsWith, resumeForSeats, idleText } from './continue.js';
import { gameNumber } from './recap-core.js';

export async function renderNewGame($app, fromCode = '') {
  $app.innerHTML = '<p class="muted center pad">Loading players…</p>';
  let roster = [];
  try { roster = await getRoster(true); } catch (err) { console.error(err); }
  const f = { seats: [null, null, null, null], start: 0, keeper: myName(), location: '', notes: '', name: '', pin: '', lobby: true, rs: DEFAULT_ID, resume: true };
  // Continuing a closed game (#/new/CODE): same players in the same seats, same place, and the wind table carries on.
  let from = null; let tip = null; let tipHidden = false;
  if (fromCode) {
    try { from = await loadContinuation(app.store, { code: fromCode }); } catch (err) { console.error(err); }
    if (from && from.state === 'open') { toast('That game is still in progress'); location.hash = `#/t/${from.room.code}`; return; }
    if (from) {
      const r = from.room;
      Object.assign(f, { seats: seatsFor(r, roster), start: Number(r.startingScore) || 0, location: r.location || '', name: r.name || '', rs: r.settings?.ruleSetId || DEFAULT_ID });
    } else toast('That game cannot be continued');
  }
  if (!ruleSets().some((x) => x.id === f.rs)) f.rs = DEFAULT_ID;
  let hr = ruleSet(f.rs).rules;

  const seatNames = () => f.seats.map((id) => roster.find((p) => p.id === id)?.name || '');
  const keyOf = (names) => (names.every(Boolean) ? names.map((n) => n.toLowerCase()).sort().join('|') : '');
  // The wind table only carries over to exactly the same four players (the dealer moves with their seat).
  const sel = () => ({ ids: f.seats, names: seatNames() });   // who is seated now: directory ids (a renamed player is still the same) and names
  const resumeNow = () => (from && f.resume ? resumeForSeats(from.resume, from.room, sel()) : null);

  // Recommendation: the latest game these exact four players actually played (finished, left unfinished, or still in progress).
  let rooms = null; let match = null; let matchKey = '';
  const refreshMatch = async () => {
    if (from) return;
    const s = sel(); const key = keyOf(s.names);
    if (!key || key === matchKey) return;
    matchKey = key; match = null;
    try {
      rooms ??= app.store.listRooms ? await app.store.listRooms() : (await getAll()).rooms;
      match = await loadContinuation(app.store, { rooms: roomsWith(rooms, s) });
    } catch (err) { console.error(err); }
    if (key === keyOf(seatNames()) && location.hash.startsWith('#/new')) draw();
  };

  const contBox = () => {
    const names = seatNames();
    if (from) {
      const r = from.room; const same = sameFour(r, sel());
      const missing = seatsFor(r, roster).map((id, i) => (id ? null : r.players[i])).filter(Boolean);
      return `<section class="card contcard"><div class="row-between"><h2>↩ Continuing ${esc(gameNumber(r))}</h2><a class="small" href="#/new">Start fresh instead</a></div>
        <p class="small">Same 4 players: <b>${r.players.map(esc).join(' · ')}</b>${r.location ? ` · ${esc(r.location)}` : ''}</p>
        ${from.state === 'unfinished' ? `<p class="small muted">That game was never finished (quiet for ${idleText(from.idleMs)}). It stays open; this starts a new game from where it stopped.</p>` : ''}
        ${missing.length ? `<p class="small neg">${missing.map(esc).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in your player list — add them with ＋ Add player to continue with the same four.</p>`
          : !same ? '<p class="small neg">⚠ The players are not the same four any more.</p>' : ''}
        ${from.resume ? (same ? `<label class="check"><input type="checkbox" data-resume ${f.resume ? 'checked' : ''}/> Continue the wind table: <b>${esc(resumeText(resumeForSeats(from.resume, r, sel()), names))}</b></label>`
            : '<p class="small muted">The wind table only continues with the same 4 players, so it will start again at East.</p>')
          : '<p class="small muted">That game did not track the dealer, so the table starts again at East.</p>'}</section>`;
    }
    const four = names.every(Boolean);
    let shown = null;
    if (four) shown = matchKey === keyOf(names) ? match : (tip && sameFour(tip.room, sel()) ? tip : null);
    else if (tip && f.seats.every((id, i) => !id || playsIn(tip.room, id, names[i]))) shown = tip;
    if (!shown || tipHidden) return '';
    const r = shown.room;
    const who = `<p class="small"><b>${esc(gameNumber(r))}</b> · ${fmtDate(r.createdAt)} · ${r.players.map(esc).join(' · ')}</p>`;
    if (shown.state === 'open') {   // still being played: keep scoring it rather than starting another
      return `<section class="card contcard"><h2>🟢 ${four ? 'These 4 have a game in progress' : 'Your last game is still in progress'}</h2>${who}
        <p class="small muted">Open it to keep scoring. Start a new game only if you really want a separate one.</p>
        <div class="row-gap"><a class="btn primary" href="#/t/${esc(r.code)}">▶ Open this game</a><button type="button" class="btn" data-hidetip>No, start a new one</button></div></section>`;
    }
    return `<section class="card contcard"><h2>💡 ${four ? 'These 4 played together before' : 'Continue your last table?'}</h2>${who}
      <p class="small muted">${shown.resume ? `It stopped in the <b>${esc(resumeText(shown.resume, r.players))}</b>${shown.state === 'unfinished' ? ` — it was never finished (quiet for ${idleText(shown.idleMs)})` : ''}. Continue it so the wind table carries on.`
        : `Same players and seats, ready to go.${shown.state === 'unfinished' ? ` It was never finished (quiet for ${idleText(shown.idleMs)}).` : ''}`}</p>
      <div class="row-gap"><a class="btn primary" href="#/new/${esc(r.code)}">↩ Continue this table</a><button type="button" class="btn" data-hidetip>No, start fresh</button></div></section>`;
  };

  const draw = () => {
    const assigned = (id, seat) => f.seats.some((s, i) => s === id && i !== seat);
    const ready = f.seats.filter(Boolean).length;
    hr = ruleSet(f.rs).rules;
    $app.innerHTML = `
      <div class="pagehead"><h1>Start new mahjong game</h1><p class="muted">Pick 4 players and table settings</p></div>
      ${contBox()}
      <section class="card">
        <div class="row-between"><h2>Seat assignments</h2><span class="small ${ready === 4 ? 'pos' : 'muted'}">${ready}/4 players</span></div>
        <button type="button" class="btn sm" data-add>＋ Add player</button>
        ${roster.length < 4 ? `<p class="small muted">Your player list has ${roster.length} player${roster.length === 1 ? '' : 's'}. Add ${4 - roster.length} more to start.</p>` : ''}
        <div class="seatsel">${[0, 1, 2, 3].map((i) => `
          <label class="seatrow ${f.seats[i] ? 'ready' : ''}"><span class="wind-badge big">${WIND_ZH[i]}</span>
            <span class="seatlbl"><b>${WIND_EN[i].toUpperCase()}</b><small>${i === 0 ? `East — dealer ${zh('庄家')}` : `${WIND_EN[i]} seat`}</small></span>
            <select data-seat="${i}"><option value="">— choose player —</option>${roster.map((p) => `<option value="${esc(p.id)}" ${f.seats[i] === p.id ? 'selected' : ''} ${assigned(p.id, i) ? 'disabled' : ''}>${esc(p.name)}${p.handle ? ` (${esc(p.handle)})` : ''}${assigned(p.id, i) ? ' — assigned' : ''}</option>`).join('')}</select>
            <span class="small ${f.seats[i] ? 'pos' : 'muted'}">${f.seats[i] ? 'Ready' : ''}</span></label>`).join('')}</div>
        <button type="button" class="btn sm" data-shuffle ${ready === 4 ? '' : 'disabled'}>🎲 Shuffle seats</button>
      </section>
      <section class="card">
        <h2>Table settings</h2>
        <div class="grid2">
          <label class="field"><span>Game name</span><input type="text" data-f="name" maxlength="60" value="${esc(f.name)}" placeholder="Friday night mahjong" /></label>
          <label class="field"><span>Starting score <small class="muted">(usually 0 or 200 / 500 chips)</small></span><input type="number" data-f="start" step="1" value="${f.start}" /></label>
          <label class="field"><span>Host name <small class="muted">(the one phone that records scores)</small></span><input type="text" data-f="keeper" maxlength="30" value="${esc(f.keeper)}" placeholder="Your name" /></label>
          <label class="field"><span>Location</span><input type="text" data-f="location" maxlength="60" value="${esc(f.location)}" placeholder="e.g. Club house, Wendy's place" /></label>
        </div>
        <div class="grid2">
          <label class="field"><span>Host PIN <small class="muted">(optional, 4–8 digits)</small></span><input type="password" inputmode="numeric" data-f="pin" maxlength="8" value="${esc(f.pin)}" placeholder="lets you take control from another phone" /></label>
          <label class="check"><input type="checkbox" data-lobby ${f.lobby ? 'checked' : ''}/> Open a join screen first (QR code — players join on their own phones, like Kahoot)</label>
        </div>
        <label class="field"><span>Session notes (optional)</span><input type="text" data-f="notes" maxlength="120" value="${esc(f.notes)}" placeholder="e.g. friendly tournament, weekend tea session" /></label>
        <label class="field"><span>📏 Rule set</span><select data-rs>${ruleSets().map((x) => `<option value="${esc(x.id)}" ${f.rs === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="rulesum small"><span>min <b>${hr.minTai}</b> Tai · cap <b>${hr.taiCap >= 13 ? 'none' : hr.taiCap}</b> · kongs <b>${hr.exposedKong}/${hr.concealedKong}</b> · pay-all <b>${hr.baoMultiplier}×</b>${hr.autoDealer ? ' · auto dealer' : ''}</span> <a href="#/settings">⚙️ Edit / new set</a></div>
      </section>
      <button class="btn primary block big" data-launch ${ready === 4 ? '' : 'disabled'}>🀄 Launch game table</button>
      <p class="center small muted">Joining a friend's game? Open <a href="#/game">Game</a> and enter their code.</p>`;
  };
  draw();
  // Not continuing anything yet: look for a closed game in this phone's history and recommend it (does not block the form).
  if (!fromCode) {
    loadContinuation(app.store, { codes: recent().map((x) => x.code) }).then((t) => { if (t && location.hash.startsWith('#/new')) { tip = t; draw(); } }).catch(() => {});
  }

  const addPlayer = () => sheet({
    title: '＋ Add player', body: playerForm(), footer: '<button class="btn primary block" data-save>Save player</button>',
    onMount(api) {
      api.el.querySelector('[name=pname]').focus();
      api.el.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-save]')) return;
        const name = api.el.querySelector('[name=pname]').value.trim(); const handle = api.el.querySelector('[name=phandle]').value.trim();
        if (!name) return toast('Enter a name');
        if (roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('That name already exists');
        const id = await app.store.savePlayer({ name, handle });
        invalidateRoster(); roster = await getRoster(true);
        const free = f.seats.indexOf(null); if (free >= 0) f.seats[free] = id;
        closeSheet(); draw(); refreshMatch(); toast(`${name} added`);
      });
    },
  });

  $app.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add !== undefined) return addPlayer();
    if (b.dataset.shuffle !== undefined) { f.seats = [...f.seats].sort(() => Math.random() - 0.5); return draw(); }
    if (b.dataset.hidetip !== undefined) { tipHidden = true; return draw(); }
    if (b.dataset.launch !== undefined) {
      const ps = f.seats.map((id) => roster.find((p) => p.id === id));
      if (ps.some((p) => !p)) return toast('Choose 4 players');
      const pin = String(f.pin || '').trim();
      if (pin && !/^\d{4,8}$/.test(pin)) return toast('Host PIN must be 4 to 8 digits');
      b.disabled = true; b.textContent = 'Launching…';
      try {
        const code = await app.store.createRoom({
          name: f.name.trim() || `Mahjong ${new Date().toLocaleDateString()}`,
          players: ps.map((p) => p.name), playerIds: ps.map((p) => p.id), handles: ps.map((p) => p.handle || ''),
          startingScore: Math.trunc(Number(f.start) || 0), scorekeeper: f.keeper.trim(), location: f.location.trim(), notes: f.notes.trim(),
          settings: { ...settingsFor(f.rs), ...(resumeNow() ? { resume: resumeNow() } : {}) },
          status: f.lobby ? 'lobby' : 'active', hostName: f.keeper.trim() || 'Host', hasPin: !!pin,
          ...(from && sameFour(from.room, sel()) ? { continuesFrom: from.room.code } : {}),
        });
        if (f.keeper.trim()) setMyName(f.keeper.trim());
        if (pin) { try { await app.store.setHostPin(code, pin); } catch (err) { console.error(err); toast('PIN not saved: ' + (err.code || err.message)); } }
        setCurrentGame(code); invalidate();
        location.hash = `#/t/${code}`;
      } catch (err) { console.error(err); toast('Could not start: ' + (err.code || err.message)); draw(); }
    }
  };
  $app.onchange = (e) => {
    const t = e.target;
    if (t.dataset.lobby !== undefined) { f.lobby = t.checked; return; }
    if (t.dataset.resume !== undefined) { f.resume = t.checked; return; }
    if (t.dataset.rs !== undefined) { f.rs = t.value; return draw(); }
    if (t.dataset.seat !== undefined) { f.seats[t.dataset.seat] = t.value || null; draw(); return refreshMatch(); }
  };
  $app.oninput = (e) => { const k = e.target.dataset.f; if (k) f[k] = e.target.value; };
}

export function playerForm(p = {}) {
  return `<label class="field"><span>Name *</span><input type="text" name="pname" maxlength="30" value="${esc(p.name || '')}" placeholder="e.g. Wendy W." /></label>
    <label class="field"><span>Table handle / nickname</span><input type="text" name="phandle" maxlength="30" value="${esc(p.handle || '')}" placeholder="e.g. Dragon Master" /></label>`;
}
