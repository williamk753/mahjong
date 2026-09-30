// Live game table: seats, dealer, record win / instant payout / draw / manual adjust, audit log, undo, finish.
import { audit, basePoints, winDeltas, instantDeltas, manualDeltas, INSTANT_KINDS, BAO_REASONS, DEFAULT_SETTINGS, MAX_TAI } from './scoring.js';
import { dealerState, tableSettings, WIND_NAMES } from './rules.js';
import { prefs, zh, unit } from './prefs.js';
import { listToSelection } from './hand.js';
import { patternText, gameNumber } from './recap-core.js';
import { createPicker } from './picker.js';
import { app, remember, setCurrentGame, invalidate } from './data.js';
import { esc, cls, sign, toast, sheet, closeSheet, confirmBox, copyText, WIND_EN, WIND_ZH, FLOWER, avatar } from './ui.js';

const v = { room: null, events: [], unsubs: [], showHelp: false };
const ADJUST_REASONS = [
  ['falseHu', 'Penalty: False Hu (炸胡)'], ['foul', 'Penalty: Foul play / illegal meld'], ['reset', 'Reset all scores to starting points (积分归零)'],
  ['tableFee', 'Table fee settlement (水钱)'], ['chipCount', 'Chip count correction'], ['other', 'Other (write below)'],
];

const S = () => ({ ...DEFAULT_SETTINGS, ...(v.room?.settings || {}) });
const cap = () => S().taiCap || MAX_TAI;
const u = () => esc(unit());
const pname = (i) => esc(v.room.players[i]);
const start = () => Number(v.room.startingScore) || 0;
const readOnly = () => v.room.status && v.room.status !== 'active';
const roundNo = () => v.events.filter((e) => !e.voided && (e.type === 'win' || e.type === 'draw')).length + 1;

export function stopGame() { v.unsubs.forEach((f) => f && f()); v.unsubs = []; closeSheet(); }

export async function openGame($app, code) {
  stopGame();
  $app.innerHTML = `<p class="muted center pad">Opening game ${esc(code)}…</p>`;
  let room = null;
  try { room = await app.store.getRoom(code); } catch (err) { console.error(err); }
  if (!room) {
    $app.innerHTML = `<div class="card center"><p>Game <span class="code">${esc(code)}</span> not found.</p><a class="btn" href="#/game">Back</a></div>`;
    return;
  }
  v.room = room; v.events = [];
  remember(room); if ((room.status || 'active') === 'active') setCurrentGame(code);
  const draw = () => render($app);
  draw();
  v.unsubs.push(app.store.watchEvents(code, (evs) => { v.events = evs; invalidate(); draw(); }, (err) => toast('Live sync error: ' + err.message)));
  v.unsubs.push(app.store.watchRoom(code, (r) => { v.room = { ...v.room, ...r }; draw(); }));
  $app.onclick = (e) => onClick(e, $app);
}

function describe(ev) {
  const p = (i) => `<b>${pname(i)}</b>`;
  switch (ev.type) {
    case 'win': {
      const how = ev.baoBy != null ? `pay-all by ${p(ev.baoBy)}${ev.baoReason && BAO_REASONS[ev.baoReason] ? ` · ${esc(BAO_REASONS[ev.baoReason].label.toLowerCase())}` : ''}`
        : ev.selfDraw ? `self-draw ${zh('自摸')}` : `off ${p(ev.shooter)}'s discard`;
      const pat = ev.patterns?.length ? `<div class="small muted">${esc(patternText(ev.patterns, false))}</div>` : '';
      return `🀄 ${p(ev.winner)} won · ${ev.tai} Tai${ev.tai > (ev.cap || cap()) ? ` → ${ev.cap || cap()}` : ''} (base ${basePoints(ev.tai, ev.cap || MAX_TAI)}) · ${how}${pat}${ev.remarks ? `<div class="small muted">“${esc(ev.remarks)}”</div>` : ''}`;
    }
    case 'instant': { const k = INSTANT_KINDS[ev.kind] || { label: ev.kind, icon: '⚡' }; return `${k.icon} ${p(ev.player)} · ${esc(k.label)} ${zh(k.zh)}${ev.notes ? `<div class="small muted">${esc(ev.notes)}</div>` : ''}`; }
    case 'kong': return `🀫 ${p(ev.player)} · ${esc(ev.kind)} kong (old entry)`;
    case 'bonus': return `🐓 ${p(ev.player)} · bonus ${ev.units} (old entry)`;
    case 'adjust': return `⚖️ Manual adjustment${ev.reason ? ` · ${esc(ev.reasonText || ev.reason)}` : ''}${ev.note ? `<div class="small muted">${esc(ev.note)}</div>` : ''}`;
    case 'draw': return `🔁 Draw round — dead wall ${zh('流局')}`;
    default: return esc(ev.type);
  }
}

function render($app) {
  if (!v.room) return;
  const r = v.room; const s = S();
  const a = audit(v.events);
  const ds = dealerState(v.events, s);
  const seatWind = (i) => (ds.enabled ? (i - ds.dealer + 4) % 4 : i);
  const wins = [0, 0, 0, 0]; const lastTai = [null, null, null, null];
  v.events.forEach((e) => { if (!e.voided && e.type === 'win') { wins[e.winner]++; lastTai[e.winner] = e.tai; } });
  const rounds = v.events.filter((e) => !e.voided && (e.type === 'win' || e.type === 'draw')).length;
  const payouts = v.events.filter((e) => !e.voided && (e.type === 'instant' || e.type === 'kong')).length;
  const ro = readOnly();
  $app.innerHTML = `
    <section class="gamehead">
      <div class="gh-top"><div><div class="gid">${esc(gameNumber(r))}</div>
        <div class="gh-dealer">${ds.enabled ? `🀀 Dealer ${zh('庄')}: <b>${pname(ds.dealer)}</b>${ds.streak ? ` <span class="lian">${zh('连')}+${ds.streak}</span>` : ''}` : esc(r.name || '')}</div>
        <div class="small muted">${r.location ? `${esc(r.location)} · ` : ''}Round #${rounds + 1}${ds.enabled ? ` · ${WIND_NAMES[ds.round]} round ${zh(WIND_ZH[ds.round] + '风')}` : ''}${ds.streak ? ` (${zh('连庄')} ×${ds.streak})` : ''}</div></div>
        <div class="gh-side"><span class="status ${esc(r.status || 'active')}">${esc(r.status || 'active')}</span>
          <div class="balance ${a.balanced ? 'ok' : 'bad'}">${a.balanced ? '✓ Balanced' : '✗ Unbalanced'} (${a.total})</div></div></div>
      <div class="gh-share"><span class="small muted">Code</span> <span class="code">${esc(r.code)}</span><button class="btn sm" data-act="share">🔗 Share link</button>
        ${r.notes ? `<span class="small muted">📝 ${esc(r.notes)}</span>` : ''}</div>
    </section>
    ${ro ? `<div class="banner">${r.status === 'completed' ? '🏁 This game is finished.' : '⛔ This game was ended.'} <a href="#/t/${esc(r.code)}/recap">View recap →</a></div>` : ''}
    <div class="seats">${[0, 1, 2, 3].map((i) => { const w = seatWind(i); const dealer = ds.enabled && ds.dealer === i; return `
      <div class="seat ${dealer ? 'dealer' : ''}">
        <div class="seat-top"><span class="wind-badge">${WIND_ZH[w]}</span><span class="seat-wind">${WIND_EN[w].toUpperCase()}</span>${dealer ? `<span class="dtag">${zh('庄')}${ds.streak ? '+' + ds.streak : ''} Dealer</span>` : ''}</div>
        <div class="seat-name">${avatar(r.players[i], 'sm')}<span><b>${pname(i)}</b>${r.handles?.[i] ? `<small>“${esc(r.handles[i])}”</small>` : ''}</span></div>
        <div class="small muted">🌸 #${w + 1} ${FLOWER[w]}</div>
        <div class="seat-score"><div><small>Score</small><b>${start() + a.balances[i]}</b></div><div><small>diff</small><b class="${cls(a.balances[i])}">${sign(a.balances[i])}</b></div>
          <div><small>wins</small><b>${wins[i]}W</b></div><div><small>last</small><b>${lastTai[i] != null ? lastTai[i] + ' Tai' : '–'}</b></div></div>
      </div>`; }).join('')}</div>

    ${ro ? '' : `
    <button class="bigwin" data-act="win">🀄 Record Win <span>Hu / 和牌 · self-draw, discard, pay-all</span></button>
    <div class="actgrid">
      <button data-act="instant"><span>⚡</span><b>Instant payout</b><small>Kongs & flowers</small></button>
      <button data-act="draw"><span>🔁</span><b>Draw round</b><small>Dead wall (0 pts)</small></button>
      <button data-act="adjust"><span>⚖️</span><b>Manual adjust</b><small>${zh('调分')} zero-sum</small></button>
      <button data-act="help"><span>💡</span><b>How scores update</b><small>4 ways</small></button>
    </div>`}
    ${v.showHelp ? `<section class="card help"><h3>4 ways to update scores</h3><ol class="steps small">
      <li><b>Record Win:</b> pick the winner, method (self-draw, discard, pay-all) and patterns. Points = 2<sup>Tai</sup> (capped at ${cap()}) and are moved automatically.</li>
      <li><b>Instant payout:</b> exposed/concealed kongs and flower sets are paid right away.</li>
      <li><b>Manual adjust:</b> move points between players for penalties (false Hu 炸胡) or corrections — must add up to 0.</li>
      <li><b>Correct a past round:</b> <i>Undo last</i> reverts the latest action; the <i>Audit log</i> lets you void, restore or edit any round.</li></ol></section>` : ''}

    <section class="card">
      <div class="row-between"><h2>Audit & history</h2><span class="small muted">${rounds} rounds · ${payouts} payouts</span></div>
      <div class="actgrid small4">
        <button data-act="log"><span>📜</span><b>Audit log</b><small>${v.events.length} entries</small></button>
        ${ro ? '' : `<button data-act="undo"><span>↩️</span><b>Undo last</b><small>void latest</small></button>
        <button data-act="reset"><span>0️⃣</span><b>Reset points</b><small>back to ${start()}</small></button>
        <button data-act="finish" class="good"><span>🏁</span><b>Finish game</b><small>recap & share</small></button>`}
      </div>
      ${ro ? `<a class="btn block" href="#/t/${esc(r.code)}/recap">🏆 View recap</a>` : `<button class="btn block danger" data-act="quit">End / quit without finishing</button>`}
      ${recentList()}
    </section>
    ${ro ? '' : rulesNote()}`;
}

function recentList() {
  const list = [...v.events].reverse().slice(0, 6);
  if (!list.length) return '<p class="small muted">Nothing recorded yet.</p>';
  return `<h3>Latest</h3><ul class="hist">${list.map((ev) => histItem(ev, false)).join('')}</ul>`;
}

function histItem(ev, actions = true) {
  const n = v.events.indexOf(ev) + 1;
  return `<li class="${ev.voided ? 'void' : ''}">
    <div><div class="desc">${describe(ev)}</div>
      <div class="meta">#${n} · ${new Date(ev.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}${ev.voided ? ` · ${ev.voidReason === 'edited' ? 'edited (replaced)' : 'voided'}` : ''}${ev.replaces ? ' · corrected' : ''}</div></div>
    ${actions && !readOnly() ? `<div class="hbtns">${ev.type === 'win' && !ev.voided ? `<button class="btn sm" data-edit="${esc(ev.id)}">Edit</button>` : ''}
      ${ev.voidReason === 'edited' ? '' : `<button class="btn sm ${ev.voided ? '' : 'danger'}" data-void="${esc(ev.id)}" data-state="${ev.voided ? 1 : 0}">${ev.voided ? 'Restore' : 'Void'}</button>`}</div>` : ''}
    <div class="chips">${ev.deltas.map((x, i) => (x ? `<span class="chip">${pname(i)} <span class="${cls(x)}">${sign(x)}</span></span>` : '')).join('')}</div>
  </li>`;
}

function rulesNote() {
  const cur = tableSettings(prefs.rules); const s = S();
  const differ = Object.keys(cur).some((k) => String(cur[k]) !== String(s[k] ?? ''));
  return `<details class="card rulesbox"><summary>Table rules · min ${s.minTai} · cap ${cap() >= 13 ? 'none' : cap()} · kong ${s.exposedKong}/${s.concealedKong} · pay-all ${s.baoMultiplier}×</summary>
    <p class="small muted">Rules are saved with the game when it starts.${differ ? ' Your ⚙️ house rules have changed since.' : ' ✓ Same as the current house rules.'}</p>
    ${differ ? '<button class="btn sm" data-act="applyRules">Apply current house rules to this game</button> <span class="small muted">Only affects new entries.</span>' : ''}</details>`;
}

/* ---------- actions ---------- */
async function onClick(e, $app) {
  const b = e.target.closest('button'); if (!b || !v.room) return;
  const act = b.dataset.act;
  if (act === 'win') return winSheet();
  if (act === 'instant') return instantSheet();
  if (act === 'adjust') return adjustSheet();
  if (act === 'help') { v.showHelp = !v.showHelp; return render($app); }
  if (act === 'log') return logSheet();
  if (act === 'share') {
    const url = location.href.split('#')[0] + '#/t/' + v.room.code;
    if (navigator.share) { try { await navigator.share({ title: 'Mahjong game', text: `Join our mahjong game ${v.room.code}`, url }); return; } catch {} }
    return copyText(url, 'Game link copied');
  }
  if (act === 'draw') {
    const ds = dealerState(v.events, S());
    if (!await confirmBox({ title: 'Record a draw round?', text: `Dead wall ${'(流局)'} — nobody wins, 0 points.${ds.enabled ? ` Dealer ${S().drawRule === 'rotate' ? 'moves to the next seat' : 'stays (连庄)'}.` : ''}`, ok: 'Record draw' })) return;
    return save({ type: 'draw', deltas: [0, 0, 0, 0] }, 'Draw recorded');
  }
  if (act === 'undo') {
    const last = [...v.events].reverse().find((x) => !x.voided);
    if (!last) return toast('Nothing to undo');
    if (!await confirmBox({ title: 'Undo last transaction?', text: `This voids <b>#${v.events.indexOf(last) + 1}</b> and reverses its points. It stays in the audit log and can be restored.`, ok: 'Confirm undo' })) return;
    await app.store.setVoided(v.room.code, last.id, true, { voidReason: 'undo' }); return toast('Undone');
  }
  if (act === 'reset') {
    const a = audit(v.events);
    if (a.balances.every((x) => x === 0)) return toast('Scores are already at the starting points');
    if (!await confirmBox({ title: 'Reset all points?', text: `Everyone goes back to ${start()} with a zero-sum adjustment. History is kept.`, ok: 'Reset points', danger: true })) return;
    return save({ type: 'adjust', deltas: a.balances.map((x) => -x), reason: 'reset', reasonText: 'Reset all scores to starting points' }, 'Points reset');
  }
  if (act === 'finish') {
    if (!await confirmBox({ title: 'Finish this game?', text: 'The game is closed and a recap with standings and share options is created.', ok: '🏁 Finish game' })) return;
    await app.store.updateRoom(v.room.code, { status: 'completed', finishedAt: Date.now() });
    setCurrentGame(''); invalidate();
    location.hash = `#/t/${v.room.code}/recap`; return;
  }
  if (act === 'quit') {
    if (!await confirmBox({ title: 'End this game?', text: 'The game stops and is marked as ended (cancelled). It will not count on the leaderboard.', ok: 'End game', danger: true, cancel: 'Keep playing' })) return;
    await app.store.updateRoom(v.room.code, { status: 'cancelled', finishedAt: Date.now() });
    setCurrentGame(''); invalidate(); toast('Game ended'); location.hash = '#/'; return;
  }
  if (act === 'applyRules') {
    const next = tableSettings(prefs.rules);
    await app.store.updateRoomSettings(v.room.code, next); v.room.settings = next; toast('Game now uses your house rules'); return render($app);
  }
}

async function save(ev, msg) {
  try { await app.store.addEvent(v.room.code, ev); toast(msg); closeSheet(); return true; }
  catch (err) { console.error(err); toast('Save failed: ' + (err.code || err.message)); return false; }
}

function seatPicker(name, value, { exclude = [], note = () => '' } = {}) {
  const ds = dealerState(v.events, S());
  return `<div class="seatpick">${[0, 1, 2, 3].map((i) => { const w = ds.enabled ? (i - ds.dealer + 4) % 4 : i; return `
    <button type="button" data-${name}="${i}" class="${value === i ? 'on' : ''}" ${exclude.includes(i) ? 'disabled' : ''}>
      <span class="wind-badge">${WIND_ZH[w]}</span><span><b>${pname(i)}</b>${ds.enabled && ds.dealer === i ? ` <span class="dtag">${zh('庄')}</span>` : ''}<small>${WIND_EN[w]} · 🌸#${w + 1}${note(i)}</small></span></button>`; }).join('')}</div>`;
}

function preview(deltas) {
  const total = deltas.reduce((a, b) => a + b, 0);
  return `<div class="settle"><div class="row-between"><b class="small">Player settlements</b><span class="small ${total === 0 ? 'pos' : 'neg'}">Net sum: ${total}</span></div>
    ${deltas.map((x, i) => `<div class="row-between"><span>${pname(i)}</span><b class="${cls(x)}">${sign(x)}</b></div>`).join('')}</div>`;
}

/* ---------- Record win ---------- */
function winSheet(editEv = null) {
  const s = S();
  const f = editEv
    ? { winner: editEv.winner, method: editEv.baoBy != null ? 'bao' : editEv.selfDraw ? 'self' : 'discard', shooter: editEv.shooter ?? null, baoBy: editEv.baoBy ?? null, baoSelf: !!editEv.selfDraw, reason: editEv.baoReason || 'thirdDragon', remarks: editEv.remarks || '' }
    : { winner: null, method: 'self', shooter: null, baoBy: null, baoSelf: false, reason: 'thirdDragon', remarks: '' };
  let picker = null;
  const ds = dealerState(v.events.filter((e) => !editEv || e.createdAt < editEv.createdAt), s);
  const ctx = () => {
    if (f.winner == null) return { selfDraw: f.method === 'self' };
    const w = ds.enabled ? (f.winner - ds.dealer + 4) % 4 : f.winner;
    return { selfDraw: f.method === 'self' || (f.method === 'bao' && f.baoSelf), seatNo: w + 1, seatWind: WIND_EN[w], roundWind: WIND_NAMES[ds.round], sameWind: ds.enabled && w === ds.round };
  };
  const build = () => {
    if (f.winner == null) return { error: 'Select the winner' };
    const res = picker?.result();
    if (!res) return { error: 'Select the scoring patterns' };
    if (!res.valid) return { error: res.errors[0] || 'Select the scoring patterns', res };
    const ev = { type: 'win', winner: f.winner, tai: res.actual, cap: cap(), patterns: res.patterns, remarks: f.remarks.trim() || null };
    if (f.method === 'self') Object.assign(ev, { selfDraw: true, shooter: null });
    else if (f.method === 'discard') { if (f.shooter == null) return { error: 'Select who discarded the winning tile', res }; Object.assign(ev, { selfDraw: false, shooter: f.shooter }); }
    else {
      if (f.baoBy == null) return { error: 'Select the responsible player', res };
      Object.assign(ev, { selfDraw: f.baoSelf, shooter: f.baoSelf ? null : f.baoBy, baoBy: f.baoBy, baoReason: f.reason, baoMultiplier: s.baoMultiplier });
    }
    try { ev.deltas = winDeltas(ev); } catch (err) { return { error: err.message, res }; }
    return { ev, res };
  };
  const top = () => `
    <div class="mstep"><div class="mstep-h"><span class="num">1</span> Select winner ${zh('胡牌玩家')}</div>${seatPicker('w', f.winner)}</div>
    <div class="mstep"><div class="mstep-h"><span class="num">2</span> Winning method ${zh('获胜方式')}</div>
      <div class="methods">
        <button type="button" data-m="self" class="${f.method === 'self' ? 'on' : ''}"><b>Self-draw ${zh('自摸')}</b><small>All 3 opponents pay 2×</small></button>
        <button type="button" data-m="discard" class="${f.method === 'discard' ? 'on' : ''}"><b>Discard win ${zh('点炮')}</b><small>Discarder 2×, others 1×</small></button>
        <button type="button" data-m="bao" class="${f.method === 'bao' ? 'on' : ''}"><b>Pay-all ${zh('包赔')}</b><small>Responsible pays ${s.baoMultiplier}×</small></button>
      </div></div>
    ${f.method === 'discard' ? `<div class="mstep"><div class="mstep-h"><span class="num">3</span> Who discarded the winning tile? ${zh('放炮')}</div>${seatPicker('sh', f.shooter, { exclude: f.winner == null ? [] : [f.winner] })}</div>` : ''}
    ${f.method === 'bao' ? `<div class="mstep"><div class="mstep-h"><span class="num">3</span> Responsible player ${zh('包赔者')}</div>${seatPicker('bb', f.baoBy, { exclude: f.winner == null ? [] : [f.winner] })}
      <label class="field"><span>Pay-all trigger ${zh('包赔条款')}</span><select data-reason>${Object.entries(BAO_REASONS).map(([k, x]) => `<option value="${k}" ${f.reason === k ? 'selected' : ''}>${esc(x.label)} ${x.zh}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-baoself ${f.baoSelf ? 'checked' : ''}/> The winner self-drew (e.g. 8th flower / Seven Flowers)</label>
      ${f.reason === 'finalWall' ? `<p class="small muted">Final-wall window: ${prefs.rules.finalWallStacks} stacks or fewer left.</p>` : ''}</div>` : ''}
    <div class="mstep"><div class="mstep-h"><span class="num">${f.method === 'self' ? 3 : 4}</span> Scoring patterns ${zh('台数番种')} <a href="#/guide" class="small" data-close>Tile guide</a></div><div id="pickerBox"></div></div>
    <label class="field"><span>Round remarks (optional)</span><input type="text" data-remarks maxlength="120" value="${esc(f.remarks)}" placeholder="e.g. robbed the kong" /></label>
    <div id="winPreview"></div>`;

  const footer = () => {
    const r = build();
    const amt = r.ev ? r.ev.deltas[f.winner] : 0;
    document.getElementById('winPreview').innerHTML = r.ev ? preview(r.ev.deltas) : '';
    return `<div class="err">${r.error ? esc(r.error) : ''}</div><button class="btn primary block big" data-confirm ${r.ev ? '' : 'disabled'}>✓ ${editEv ? 'Save correction' : 'Confirm win'}${r.ev ? `: ${sign(amt)} ${u()} (${r.ev.tai} Tai)` : ''}</button>`;
  };

  const sh = sheet({
    title: `${editEv ? '✏️ Edit' : '🀄 Record'} winning round ${zh('和牌')}`, sub: editEv ? `Correcting #${v.events.indexOf(editEv) + 1}` : `Round #${roundNo()}`, wide: true, body: '',
    onMount(api) {
      const footerSafe = () => (api.body.querySelector('#winPreview') ? footer() : '');
      const mkPicker = () => createPicker(api.body.querySelector('#pickerBox'), {
        rules: () => ({ ...prefs.rules, ...s, tai: prefs.rules.tai }), context: ctx, onChange: () => api.setFoot(footerSafe()),
      });
      // Re-render the top steps but keep the pattern selection.
      const rebuild = () => { const state = captureState(picker); api.setBody(top()); picker = mkPicker(); restoreState(picker, state); api.setFoot(footerSafe()); };
      api.setBody(top()); picker = mkPicker();
      if (editEv) { if (editEv.patterns?.length) picker.setSelection(listToSelection(editEv.patterns)); else picker.setDirectTai(editEv.tai); }
      api.setFoot(footerSafe());
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b || !api.el.contains(b)) return;
        const d = b.dataset;
        if (d.w !== undefined) { f.winner = Number(d.w); if (f.shooter === f.winner) f.shooter = null; if (f.baoBy === f.winner) f.baoBy = null; return rebuild(); }
        if (d.m) { f.method = d.m; return rebuild(); }
        if (d.sh !== undefined) { f.shooter = Number(d.sh); return rebuild(); }
        if (d.bb !== undefined) { f.baoBy = Number(d.bb); return rebuild(); }
        if (d.confirm !== undefined) {
          const r = build(); if (!r.ev) return;
          b.disabled = true;
          if (editEv) {
            const ok = await save({ ...r.ev, replaces: editEv.id, createdAt: editEv.createdAt + 1 }, 'Round corrected');
            if (ok) await app.store.setVoided(v.room.code, editEv.id, true, { voidReason: 'edited' });
          } else await save(r.ev, `Win recorded: ${sign(r.ev.deltas[f.winner])} ${unit()}`);
        }
      });
      api.el.addEventListener('change', (e) => {
        if (e.target.matches('[data-reason]')) { f.reason = e.target.value; rebuild(); }
        if (e.target.matches('[data-baoself]')) { f.baoSelf = e.target.checked; picker.refresh(); }
      });
      api.el.addEventListener('input', (e) => { if (e.target.matches('[data-remarks]')) { f.remarks = e.target.value; api.setFoot(footerSafe()); } });
    },
  });
  return sh;
}

// Preserve picker state across re-renders of the win sheet.
function captureState(p) { return p ? p.result() : null; }
function restoreState(p, res) {
  if (!res) return;
  if (res.patterns) p.setSelection(listToSelection(res.patterns));
  else if (res.actual != null && res.errors[0] !== 'Pick the Tai') p.setDirectTai(res.actual);
}

/* ---------- Instant payout ---------- */
function instantSheet() {
  const s = S(); const f = { player: null, kind: 'exposedKong', notes: '' };
  const body = () => `
    <div class="mstep"><div class="mstep-h">Select receiver ${zh('收取筹码者')}</div>${seatPicker('p', f.player)}</div>
    <div class="mstep"><div class="mstep-h">Payout category ${zh('项目类别')}</div>
      <div class="ilist">${Object.entries(INSTANT_KINDS).map(([k, x]) => { const n = s[k] ?? DEFAULT_SETTINGS[k]; return `
        <button type="button" data-k="${k}" class="${f.kind === k ? 'on' : ''}"><span>${x.icon} <b>${esc(x.label)}</b> ${zh(x.zh)}<br><small>Each of the 3 opponents pays ${n}. Receiver gains ${n * 3}.</small></span><small class="amt">+${n * 3}</small></button>`; }).join('')}</div></div>
    ${f.player != null ? preview(instantDeltas({ player: f.player, kind: f.kind }, s)) : ''}
    <label class="field"><span>Notes (optional)</span><input type="text" data-notes maxlength="100" value="${esc(f.notes)}" /></label>`;
  const foot = () => { const n = s[f.kind] ?? DEFAULT_SETTINGS[f.kind]; return `<button class="btn primary block big" data-ok ${f.player == null ? 'disabled' : ''}>✓ Confirm payout (+${n * 3} ${u()})</button>`; };
  sheet({
    title: `⚡ Immediate payout ${zh('即时 / 杠花')}`, sub: 'Independent transaction · paid right away', body: body(), footer: foot(),
    onMount(api) {
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.p !== undefined) f.player = Number(b.dataset.p);
        else if (b.dataset.k) f.kind = b.dataset.k;
        else if (b.dataset.ok !== undefined) { const ev = { type: 'instant', player: f.player, kind: f.kind, notes: f.notes.trim() || null, deltas: instantDeltas({ player: f.player, kind: f.kind }, s) }; return save(ev, 'Payout recorded'); }
        else return;
        api.setBody(body()); api.setFoot(foot());
      });
      api.el.addEventListener('input', (e) => { if (e.target.matches('[data-notes]')) f.notes = e.target.value; });
    },
  });
}

/* ---------- Manual adjust ---------- */
function adjustSheet() {
  const a = audit(v.events);
  const f = { d: [0, 0, 0, 0], reason: '', note: '' };
  const total = () => f.d.reduce((x, y) => x + y, 0);
  const body = () => `
    <div class="balance ${total() === 0 ? 'ok' : 'bad'} blockbal">${total() === 0 ? '✓ Balanced (net sum = 0)' : `✗ Net sum = ${sign(total())} — must be 0`}</div>
    <div class="row-between"><span class="small muted">Quick tools</span><button type="button" class="btn sm" data-resetall>Reset all to starting score (${start()})</button></div>
    ${[0, 1, 2, 3].map((i) => `<div class="adjrow">
      <div class="row-between"><span>${avatar(v.room.players[i], 'sm')} <b>${pname(i)}</b><br><small class="muted">Current ${start() + a.balances[i]} → ${start() + a.balances[i] + f.d[i]}</small></span>
        <input type="number" class="adjval" data-i="${i}" value="${f.d[i]}" step="1" aria-label="Adjustment for ${pname(i)}" /></div>
      <div class="adjbtns">${[-10, -5, -2, 2, 5, 10].map((n) => `<button type="button" data-i="${i}" data-n="${n}" class="${n < 0 ? 'neg' : 'pos'}">${sign(n)}</button>`).join('')}</div></div>`).join('')}
    <label class="field"><span>Reason / remarks *</span><select data-reason><option value="">— choose —</option>${ADJUST_REASONS.map(([k, l]) => `<option value="${k}" ${f.reason === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field"><span>Note ${f.reason === 'other' ? '*' : '(optional)'}</span><input type="text" data-note maxlength="120" value="${esc(f.note)}" /></label>`;
  const valid = () => total() === 0 && f.d.some((x) => x) && f.reason && (f.reason !== 'other' || f.note.trim());
  const foot = () => `<button class="btn primary block big" data-ok ${valid() ? '' : 'disabled'}>✓ Apply score adjustment</button>`;
  sheet({
    title: `⚖️ Manual score adjustment ${zh('手动调分')}`, sub: 'Direct point correction · zero-sum enforced', body: body(), footer: foot(),
    onMount(api) {
      const redraw = () => { api.setBody(body()); api.setFoot(foot()); };
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.n) { f.d[b.dataset.i] += Number(b.dataset.n); return redraw(); }
        if (b.dataset.resetall !== undefined) { f.d = a.balances.map((x) => -x); if (!f.reason) f.reason = 'reset'; return redraw(); }
        if (b.dataset.ok !== undefined && valid()) {
          const reasonText = ADJUST_REASONS.find(([k]) => k === f.reason)?.[1];
          await save({ type: 'adjust', deltas: manualDeltas(f.d), reason: f.reason, reasonText, note: f.note.trim() || null }, 'Adjustment applied');
        }
      });
      api.el.addEventListener('change', (e) => {
        if (e.target.matches('.adjval')) { f.d[e.target.dataset.i] = Math.trunc(Number(e.target.value) || 0); redraw(); }
        if (e.target.matches('[data-reason]')) { f.reason = e.target.value; redraw(); }
      });
      api.el.addEventListener('input', (e) => { if (e.target.matches('[data-note]')) { f.note = e.target.value; api.setFoot(foot()); } });
    },
  });
}

/* ---------- Audit log ---------- */
function logSheet() {
  const body = () => (v.events.length ? `<p class="small muted">Void reverses an entry but keeps it here. Edit replaces a win with corrected details.</p><ul class="hist">${[...v.events].reverse().map((ev) => histItem(ev)).join('')}</ul>` : '<p class="muted">No entries yet.</p>');
  sheet({
    title: '📜 Audit log', sub: `${v.events.length} entries · append-only`, body: body(), wide: true,
    onMount(api) {
      const unsub = app.store.watchEvents(v.room.code, () => api.el.isConnected && api.setBody(body()));
      api.onClose = () => unsub && unsub();
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.void) {
          const toVoid = b.dataset.state !== '1';
          if (toVoid && !await confirmBox({ title: 'Void this entry?', text: 'Its points are reversed. It stays in the log and can be restored.', ok: 'Void', danger: true })) return;
          await app.store.setVoided(v.room.code, b.dataset.void, toVoid, { voidReason: toVoid ? 'manual' : null });
          api.setBody(body());
        }
        if (b.dataset.edit) { const ev = v.events.find((x) => x.id === b.dataset.edit); closeSheet(); winSheet(ev); }
      });
    },
  });
}
