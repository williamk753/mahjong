// Start a new game: pick 4 seats from the player directory, table settings, launch.
import { prefs, zh } from './prefs.js';
import { tableSettings } from './rules.js';
import { app, getRoster, invalidateRoster, setCurrentGame, invalidate } from './data.js';
import { esc, toast, sheet, closeSheet, WIND_EN, WIND_ZH } from './ui.js';

export async function renderNewGame($app) {
  $app.innerHTML = '<p class="muted center pad">Loading players…</p>';
  let roster = [];
  try { roster = await getRoster(true); } catch (err) { console.error(err); }
  const f = { seats: [null, null, null, null], start: 0, keeper: '', location: '', notes: '', name: '' };
  const hr = prefs.rules;

  const draw = () => {
    const assigned = (id, seat) => f.seats.some((s, i) => s === id && i !== seat);
    const ready = f.seats.filter(Boolean).length;
    $app.innerHTML = `
      <div class="pagehead"><h1>Start new mahjong game</h1><p class="muted">Pick 4 players and table settings</p></div>
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
          <label class="field"><span>Scorekeeper</span><input type="text" data-f="keeper" maxlength="30" value="${esc(f.keeper)}" placeholder="Who is entering scores" /></label>
          <label class="field"><span>Location</span><input type="text" data-f="location" maxlength="60" value="${esc(f.location)}" placeholder="e.g. Club house, Wendy's place" /></label>
        </div>
        <label class="field"><span>Session notes (optional)</span><input type="text" data-f="notes" maxlength="120" value="${esc(f.notes)}" placeholder="e.g. friendly tournament, weekend tea session" /></label>
        <div class="rulesum small"><span>House rules: min <b>${hr.minTai}</b> Tai · cap <b>${hr.taiCap >= 13 ? 'none' : hr.taiCap}</b> · kongs <b>${hr.exposedKong}/${hr.concealedKong}</b> · pay-all <b>${hr.baoMultiplier}×</b>${hr.autoDealer ? ' · auto dealer' : ''}</span> <a href="#/settings">⚙️ Change</a></div>
      </section>
      <button class="btn primary block big" data-launch ${ready === 4 ? '' : 'disabled'}>🀄 Launch game table</button>
      <p class="center small muted">Joining a friend's game? Open <a href="#/game">Game</a> and enter their code.</p>`;
  };
  draw();

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
        closeSheet(); draw(); toast(`${name} added`);
      });
    },
  });

  $app.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add !== undefined) return addPlayer();
    if (b.dataset.shuffle !== undefined) { f.seats = [...f.seats].sort(() => Math.random() - 0.5); return draw(); }
    if (b.dataset.launch !== undefined) {
      const ps = f.seats.map((id) => roster.find((p) => p.id === id));
      if (ps.some((p) => !p)) return toast('Choose 4 players');
      b.disabled = true; b.textContent = 'Launching…';
      try {
        const code = await app.store.createRoom({
          name: f.name.trim() || `Mahjong ${new Date().toLocaleDateString()}`,
          players: ps.map((p) => p.name), playerIds: ps.map((p) => p.id), handles: ps.map((p) => p.handle || ''),
          startingScore: Math.trunc(Number(f.start) || 0), scorekeeper: f.keeper.trim(), location: f.location.trim(), notes: f.notes.trim(),
          settings: tableSettings(prefs.rules), status: 'active',
        });
        setCurrentGame(code); invalidate();
        location.hash = `#/t/${code}`;
      } catch (err) { console.error(err); toast('Could not start: ' + (err.code || err.message)); draw(); }
    }
  };
  $app.onchange = (e) => {
    const t = e.target;
    if (t.dataset.seat !== undefined) { f.seats[t.dataset.seat] = t.value || null; return draw(); }
  };
  $app.oninput = (e) => { const k = e.target.dataset.f; if (k) f[k] = e.target.value; };
}

export function playerForm(p = {}) {
  return `<label class="field"><span>Name *</span><input type="text" name="pname" maxlength="30" value="${esc(p.name || '')}" placeholder="e.g. Wendy W." /></label>
    <label class="field"><span>Table handle / nickname</span><input type="text" name="phandle" maxlength="30" value="${esc(p.handle || '')}" placeholder="e.g. Dragon Master" /></label>`;
}
