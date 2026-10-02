// Live game table: seats, dealer, record win / instant payout / draw / manual adjust, audit log, undo, finish.
import { audit, basePoints, winDeltas, instantDeltas, manualDeltas, INSTANT_KINDS, BAO_REASONS, DEFAULT_SETTINGS, MAX_TAI } from './scoring.js';
import { dealerState, tableSettings, WIND_NAMES, mergeRules } from './rules.js';
import { prefs, zh, unit, myName, setMyName, rulesDiff } from './prefs.js';
import { openSim } from './sim.js';
import { tiles as tileRow } from './tileui.js';
import { setTiles, THIRTEEN } from './handcalc.js';
import { ruleSet } from './rulesets.js';
import { notify } from './notify.js';
import { listToSelection } from './hand.js';
import { patternText, gameNumber } from './recap-core.js';
import { createPicker } from './picker.js';
import { app, remember, setCurrentGame, invalidate } from './data.js';
import { esc, cls, sign, toast, sheet, closeSheet, confirmBox, copyText, WIND_EN, WIND_ZH, FLOWER, avatar } from './ui.js';

const v = { room: null, events: [], members: [], requests: [], unsubs: [], showHelp: false, qr: null, reqLoaded: false, memLoaded: false };
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
const myUid = () => app.store.uid?.() || '';
/** Only the host (the phone that created the game, or whoever it was handed to) can change scores. Old games without a host stay open. */
const isHost = () => !v.room.hostUid || v.room.hostUid === myUid();
const canEdit = () => !readOnly() && isHost();
const me = () => v.members.find((m) => m.uid === myUid() || m.id === myUid());
const mySeat = () => { const m = me(); return m && Number.isInteger(m.seat) && m.seat >= 0 ? m.seat : null; };
const joinUrl = () => location.href.split('#')[0] + '#/t/' + v.room.code;
const wizardRules = () => mergeRules({ ...prefs.rules, ...S(), tai: S().tai || prefs.rules.tai });
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
  v.room = room; v.events = []; v.members = []; v.requests = []; v.qr = null; v.reqLoaded = false; v.memLoaded = false;
  remember(room); if (['active', 'lobby'].includes(room.status || 'active')) setCurrentGame(code);
  const draw = () => render($app);
  draw();
  v.unsubs.push(app.store.watchEvents(code, (evs) => { v.events = evs; invalidate(); draw(); }, (err) => toast('Live sync error: ' + err.message)));
  v.unsubs.push(app.store.watchRoom(code, (r) => { const old = v.room; v.room = { ...v.room, ...r }; roomChanged(old, v.room); draw(); }));
  if (app.store.watchMembers) v.unsubs.push(app.store.watchMembers(code, (list) => {
    v.members = list;
    if (!v.memLoaded) { v.memLoaded = true; if (!me()) app.store.joinRoom(code, { name: myName() || 'Guest', seat: null }).catch((e) => console.warn(e)); }
    draw();
  }));
  if (app.store.watchRequests) v.unsubs.push(app.store.watchRequests(code, (list) => { const old = v.requests; v.requests = list; requestsChanged(old, list); v.reqLoaded = true; draw(); }));
  $app.onclick = (e) => onClick(e, $app);
}

function describe(ev) {
  const p = (i) => `<b>${pname(i)}</b>`;
  switch (ev.type) {
    case 'win': {
      const how = ev.baoBy != null ? `pay-all by ${p(ev.baoBy)}${ev.baoReason && BAO_REASONS[ev.baoReason] ? ` · ${esc(BAO_REASONS[ev.baoReason].label.toLowerCase())}` : ''}`
        : ev.selfDraw ? `self-draw ${zh('自摸')}` : `off ${p(ev.shooter)}'s discard`;
      const pat = (ev.hand ? handMini(ev.hand) : '') + (ev.patterns?.length ? `<div class="small muted">${esc(patternText(ev.patterns, false))}</div>` : '');
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
  if (v.room.status === 'lobby') return renderLobby($app);
  const r = v.room; const s = S();
  const a = audit(v.events);
  const ds = dealerState(v.events, s);
  const seatWind = (i) => (ds.enabled ? (i - ds.dealer + 4) % 4 : i);
  const wins = [0, 0, 0, 0]; const lastTai = [null, null, null, null];
  v.events.forEach((e) => { if (!e.voided && e.type === 'win') { wins[e.winner]++; lastTai[e.winner] = e.tai; } });
  const rounds = v.events.filter((e) => !e.voided && (e.type === 'win' || e.type === 'draw')).length;
  const payouts = v.events.filter((e) => !e.voided && (e.type === 'instant' || e.type === 'kong')).length;
  const ro = readOnly();
  const host = isHost(); const ctl = !ro && host;
  $app.innerHTML = `
    <section class="gamehead">
      <div class="gh-top"><div><div class="gid">${esc(gameNumber(r))}</div>
        <div class="gh-dealer">${ds.enabled ? `🀀 Dealer ${zh('庄')}: <b>${pname(ds.dealer)}</b>${ds.streak ? ` <span class="lian">${zh('连')}+${ds.streak}</span>` : ''}` : esc(r.name || '')}</div>
        <div class="small muted">${r.location ? `${esc(r.location)} · ` : ''}Round #${rounds + 1}${ds.enabled ? ` · ${WIND_NAMES[ds.round]} round ${zh(WIND_ZH[ds.round] + '风')}` : ''}${ds.streak ? ` (${zh('连庄')} ×${ds.streak})` : ''}</div></div>
        <div class="gh-side"><span class="status ${esc(r.status || 'active')}">${esc(r.status || 'active')}</span>
          <div class="balance ${a.balanced ? 'ok' : 'bad'}">${a.balanced ? '✓ Balanced' : '✗ Unbalanced'} (${a.total})</div></div></div>
      <div class="gh-share"><span class="small muted">Code</span> <span class="code">${esc(r.code)}</span><button class="btn sm" data-act="share">🔗 Share</button><button class="btn sm" data-act="qr">📱 QR</button>
        ${r.notes ? `<span class="small muted">📝 ${esc(r.notes)}</span>` : ''}</div>
    </section>
    ${ro ? '' : hostBar()}
    ${ctl ? pendingCard() : ''}
    ${!ro && !host ? playerPanel() : ''}
    ${ro ? `<div class="banner">${r.status === 'completed' ? '🏁 This game is finished.' : '⛔ This game was ended.'} <a href="#/t/${esc(r.code)}/recap">View recap →</a></div>` : ''}
    <div class="seats">${[0, 1, 2, 3].map((i) => { const w = seatWind(i); const dealer = ds.enabled && ds.dealer === i; return `
      <div class="seat ${dealer ? 'dealer' : ''}">
        <div class="seat-top"><span class="wind-badge">${WIND_ZH[w]}</span><span class="seat-wind">${WIND_EN[w].toUpperCase()}</span>${dealer ? `<span class="dtag">${zh('庄')}${ds.streak ? '+' + ds.streak : ''} Dealer</span>` : ''}</div>
        <div class="seat-name">${avatar(r.players[i], 'sm')}<span><b>${pname(i)}</b>${r.handles?.[i] ? `<small>“${esc(r.handles[i])}”</small>` : ''}</span></div>
        <div class="small muted">🌸 #${w + 1} ${FLOWER[w]}</div>
        <div class="seat-score"><div><small>Score</small><b>${start() + a.balances[i]}</b></div><div><small>diff</small><b class="${cls(a.balances[i])}">${sign(a.balances[i])}</b></div>
          <div><small>wins</small><b>${wins[i]}W</b></div><div><small>last</small><b>${lastTai[i] != null ? lastTai[i] + ' Tai' : '–'}</b></div></div>
      </div>`; }).join('')}</div>

    ${!ctl ? '' : `
    <button class="bigwin" data-act="win">🀄 Record Win <span>Build the hand — the app finds the pattern & counts the Tai</span></button>
    <div class="row-between"><button type="button" class="linkbtn" data-act="sim">🧪 Just simulate (not saved)</button><button type="button" class="linkbtn" data-act="winAdvanced">Advanced picker</button></div>
    <div class="actgrid">
      <button data-act="instant"><span>⚡</span><b>Instant payout</b><small>Kongs & flowers</small></button>
      <button data-act="draw"><span>🔁</span><b>Draw round</b><small>Dead wall (0 pts)</small></button>
      <button data-act="adjust"><span>⚖️</span><b>Manual adjust</b><small>${zh('调分')} zero-sum</small></button>
      <button data-act="reset" class="warn"><span>🔄</span><b>Reset scores</b><small>everyone back to ${start()}</small></button>
    </div>
    <button type="button" class="linkbtn" data-act="help">💡 How do scores update?</button>`}
    ${v.showHelp ? `<section class="card help"><h3>4 ways to update scores</h3><ol class="steps small">
      <li><b>Record Win:</b> pick the winner, method (self-draw, discard, pay-all) and patterns. Points = 2<sup>Tai</sup> (capped at ${cap()}) and are moved automatically.</li>
      <li><b>Instant payout:</b> exposed/concealed kongs and flower sets are paid right away.</li>
      <li><b>Manual adjust:</b> move points between players for penalties (false Hu 炸胡) or corrections — must add up to 0.</li>
      <li><b>Correct a past round:</b> <i>Undo last</i> reverts the latest action; the <i>Audit log</i> lets you void, restore or edit any round.</li></ol></section>` : ''}

    <section class="card">
      <div class="row-between"><h2>Audit & history</h2><span class="small muted">${rounds} rounds · ${payouts} payouts</span></div>
      <div class="actgrid three">
        <button data-act="log"><span>📜</span><b>Audit log</b><small>${v.events.length} entries</small></button>
        ${!ctl ? '' : `<button data-act="undo"><span>↩️</span><b>Undo last</b><small>void latest</small></button>
        <button data-act="finish" class="good"><span>🏁</span><b>Finish game</b><small>recap & share</small></button>`}
      </div>
      ${ro ? `<a class="btn block" href="#/t/${esc(r.code)}/recap">🏆 View recap</a>` : ctl ? `<button class="btn block danger" data-act="quit">End / quit without finishing</button>` : ''}
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
    ${actions && canEdit() ? `<div class="hbtns">${ev.type === 'win' && !ev.voided ? `<button class="btn sm" data-edit="${esc(ev.id)}">Edit</button>` : ''}
      ${ev.voidReason === 'edited' ? '' : `<button class="btn sm ${ev.voided ? '' : 'danger'}" data-void="${esc(ev.id)}" data-state="${ev.voided ? 1 : 0}">${ev.voided ? 'Restore' : 'Void'}</button>`}</div>` : ''}
    <div class="chips">${ev.deltas.map((x, i) => (x ? `<span class="chip">${pname(i)} <span class="${cls(x)}">${sign(x)}</span></span>` : '')).join('')}</div>
  </li>`;
}

function rulesNote() {
  const s = S(); const set = ruleSet(s.ruleSetId || 'default');
  const cur = tableSettings(set.rules);
  const differ = Object.keys(cur).some((k) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(s[k] ?? (k === 'tai' ? cur[k] : null)));
  return `<details class="card rulesbox"><summary>📏 ${esc(s.ruleSetName || 'Default')} rules · min ${s.minTai} · cap ${cap() >= 13 ? 'none' : cap()} · kong ${s.exposedKong}/${s.concealedKong} · pay-all ${s.baoMultiplier}×</summary>
    <p class="small muted">Rules are saved with the game when it starts.${differ ? ` The “${esc(set.name)}” rule set has changed since.` : ` ✓ Same as the current “${esc(set.name)}” rule set.`}</p>
    ${differ && canEdit() ? '<button class="btn sm" data-act="applyRules">Apply the updated rules to this game</button> <span class="small muted">Only affects new entries.</span>' : ''}</details>`;
}

/* ---------- actions ---------- */
async function onClick(e, $app) {
  const b = e.target.closest('button'); if (!b || !v.room) return;
  const act = b.dataset.act;
  if (b.dataset.seatme !== undefined) return pickSeat(Number(b.dataset.seatme));
  if (b.dataset.approve) return approve(v.requests.find((q) => q.id === b.dataset.approve));
  if (b.dataset.reject) return reject(v.requests.find((q) => q.id === b.dataset.reject));
  if (b.dataset.cancelreq) { await app.store.updateRequest(v.room.code, b.dataset.cancelreq, { status: 'cancelled' }); return toast('Request cancelled'); }
  if (act === 'qr') return qrSheet();
  if (act === 'hosttools') return hostTools();
  if (act === 'takeover') return takeOver();
  if (act === 'iwon') return playerWin();
  if (act === 'sim') return simulateOnly();
  if (act === 'iclaim') return playerInstant();
  if (act === 'start') {
    const seated = v.members.filter((m) => Number.isInteger(m.seat) && m.seat >= 0).length;
    if (seated < 4 && !await confirmBox({ title: 'Start the game now?', text: `${seated} of 4 players have joined on their phones. Players can still join after the start with the code.`, ok: '▶ Start' })) return;
    await app.store.updateRoom(v.room.code, { status: 'active', startedAt: Date.now() }); return toast('Game started — good luck!');
  }
  if (act === 'lobby') { await app.store.updateRoom(v.room.code, { status: 'lobby' }); return; }
  // Everything below changes scores — host only (Firestore rules enforce this too).
  if (['win', 'winAdvanced', 'instant', 'adjust', 'draw', 'undo', 'reset', 'finish', 'quit', 'applyRules'].includes(act) && !isHost()) return toast('Only the host can do that');
  if (act === 'win') return hostWin();
  if (act === 'winAdvanced') return winSheet();
  if (act === 'instant') return instantSheet();
  if (act === 'adjust') return adjustSheet();
  if (act === 'help') { v.showHelp = !v.showHelp; return render($app); }
  if (act === 'log') return logSheet();
  if (act === 'share') {
    const url = joinUrl();
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
    if (!await confirmBox({ title: '🔄 Reset all scores?', text: `Every player goes back to <b>${start()}</b>. This is saved as one zero-sum adjustment, so the history is kept — you can undo it with <b>Undo last</b>.`, ok: 'Reset scores', danger: true })) return;
    return save({ type: 'adjust', deltas: a.balances.map((x) => -x), reason: 'reset', reasonText: 'Reset all scores to starting points' }, 'Scores reset — tap Undo last to revert');
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
    const set = ruleSet(S().ruleSetId || 'default'); const next = { ...tableSettings(set.rules), ruleSetId: set.id, ruleSetName: set.name };
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
        rules: wizardRules, context: ctx, onChange: () => api.setFoot(footerSafe()),
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

/* ================= Host control · lobby · player requests ================= */
/** Small picture of a stored winning hand. */
function handMini(hd) {
  if (!hd) return '';
  const g = hd.kind === 'normal' && hd.sets ? [...hd.sets.map(setTiles), [hd.pair, hd.pair]] : hd.kind === 'sevenPairs' ? (hd.pairs || []).map((t) => [t, t]) : hd.kind === 'thirteen' ? [[...THIRTEEN, hd.thirteenDouble]] : [];
  return g.length ? `<div class="handmini">${g.map((x) => tileRow(x, { small: true })).join('')}</div>` : '';
}
const simulateOnly = () => {
  const seat = mySeat();
  openSim({ mode: 'calc', rules: wizardRules(), ruleSetName: S().ruleSetName || 'Default', seatWind: seat != null ? seatWindOf(seat) : 0, roundWind: ROUND().round || 0 });
};

const seatOwner = (i) => v.members.find((m) => m.seat === i);
const ROUND = () => dealerState(v.events, S());
const seatWindOf = (i) => { const ds = ROUND(); return ds.enabled ? (i - ds.dealer + 4) % 4 : i; };
const nameOfUid = (uid) => v.members.find((m) => (m.uid || m.id) === uid)?.name || (uid === v.room.hostUid ? v.room.hostName : '') || 'Someone';

function roomChanged(old, n) {
  if (!old || !n) return;
  const code = n.code;
  if (old.hostUid !== n.hostUid && n.hostUid) {
    if (n.hostUid === myUid()) notify({ icon: '👑', title: 'You are now the host', body: `You control game ${code}.`, key: `${code}-host-${n.hostUid}-${Date.now()}`, link: `#/t/${code}` });
    else notify({ icon: '👑', title: `${n.hostName || 'Someone'} is now the host`, body: `Game ${code}`, key: `${code}-host-${n.hostUid}-${Date.now()}`, link: `#/t/${code}` });
  }
  if (JSON.stringify(old.settings || {}) !== JSON.stringify(n.settings || {}) && n.hostUid !== myUid()) {
    const d = rulesDiff({ ...DEFAULT_SETTINGS, ...(old.settings || {}) }, { ...DEFAULT_SETTINGS, ...(n.settings || {}) });
    notify({ icon: '⚙️', title: 'The host changed this game’s rules', body: d.join(' · ') || 'Table rules updated', link: `#/t/${code}` });
  }
  if (old.status !== n.status) {
    if (n.status === 'active' && old.status === 'lobby') notify({ icon: '▶️', title: 'The game has started', body: `Game ${code}`, key: `${code}-started` });
    if (n.status === 'completed') { setCurrentGame(''); notify({ icon: '🏁', title: 'Game finished', body: 'Tap to see the recap.', link: `#/t/${code}/recap`, key: `${code}-done` }); }
    if (n.status === 'cancelled') { setCurrentGame(''); notify({ icon: '⛔', title: 'The host ended the game', body: `Game ${code}`, key: `${code}-ended` }); }
  }
}

function requestText(q) {
  if (q.type === 'instant') { const k = INSTANT_KINDS[q.kind] || { label: q.kind, icon: '⚡' }; return `${k.icon} ${esc(v.room.players[q.player] ?? q.byName)} · ${esc(k.label)}`; }
  const how = q.method === 'self' ? 'self-draw' : q.method === 'discard' ? `off ${esc(v.room.players[q.shooter] ?? '?')}'s discard` : `pay-all by ${esc(v.room.players[q.baoBy] ?? '?')}`;
  return `🀄 <b>${esc(v.room.players[q.winner] ?? q.byName)}</b> won · <b>${q.tai} Tai</b> · ${how}${handMini(q.hand)}${q.patterns?.length ? `<div class="small muted">${esc(patternText(q.patterns, false))}</div>` : ''}`;
}

function requestsChanged(old, list) {
  if (!v.reqLoaded) return; // first snapshot = history, no alerts
  const before = Object.fromEntries(old.map((q) => [q.id, q.status]));
  const code = v.room.code;
  for (const q of list) {
    if (!before[q.id] && q.status === 'pending' && isHost() && q.byUid !== myUid()) {
      notify({ icon: '🙋', title: `${q.byName || 'A player'} sent a ${q.type === 'win' ? 'win' : 'payout'} request`, body: q.type === 'win' ? `${q.tai} Tai — approve or reject on the game page` : 'Approve or reject on the game page', key: `req-${q.id}`, link: `#/t/${code}` });
    }
    if (before[q.id] === 'pending' && q.status !== 'pending' && q.byUid === myUid()) {
      if (q.status === 'approved') notify({ icon: '✅', title: 'The host approved your request', body: q.type === 'win' ? `Your ${q.tai} Tai win is on the scoreboard` : 'Payout recorded', key: `req-${q.id}-ok` });
      if (q.status === 'rejected') notify({ icon: '❌', title: 'The host rejected your request', body: q.reason || 'Check with the host', key: `req-${q.id}-no` });
    }
  }
}

function hostBar() {
  if (isHost()) {
    return `<div class="hostbar"><span>👑 <b>You are the host</b> — only you can record scores${v.room.hasPin ? '' : ' · <span class="neg">no PIN set</span>'}</span><button class="btn sm" data-act="hosttools">Host tools</button></div>`;
  }
  return `<div class="hostbar guest"><span>👀 <b>${esc(v.room.hostName || 'The host')}</b> controls this game. You can watch and send requests.</span><button class="btn sm" data-act="takeover">🔑 Take over</button></div>`;
}

function pendingCard() {
  const pend = v.requests.filter((q) => q.status === 'pending');
  if (!pend.length) return '';
  return `<section class="card reqcard"><h2>🙋 Requests waiting for you (${pend.length})</h2>
    ${pend.map((q) => { let prev = ''; try { prev = preview(q.type === 'win' ? winEventFrom(q).deltas : instantDeltas({ player: q.player, kind: q.kind }, S())); } catch (e) { prev = `<p class="small neg">${esc(e.message)}</p>`; }
      const low = q.type === 'win' && q.tai < (S().minTai ?? 1);
      return `<div class="reqitem"><div class="small muted">From ${esc(q.byName || 'a player')} · ${new Date(q.createdAt).toLocaleTimeString([], { timeStyle: 'short' })}</div>
        <div>${requestText(q)}</div>${low ? `<p class="small neg">Below the minimum of ${S().minTai} Tai.</p>` : ''}${prev}
        <div class="reqbtns"><button class="btn danger" data-reject="${esc(q.id)}">✕ Reject</button><button class="btn primary" data-approve="${esc(q.id)}" ${low ? 'disabled' : ''}>✓ Approve</button></div></div>`; }).join('')}</section>`;
}

function seatChooser(title) {
  return `<section class="card"><h2>${title}</h2><p class="small muted">So the app knows which seat is yours. Your name is used in notifications.</p>
    <div class="seatpick">${[0, 1, 2, 3].map((i) => { const o = seatOwner(i); const mine = mySeat() === i; const taken = o && !mine; return `
      <button type="button" data-seatme="${i}" class="${mine ? 'on' : ''}" ${taken ? 'disabled' : ''}><span class="wind-badge">${WIND_ZH[seatWindOf(i)]}</span><span><b>${pname(i)}</b><small>${mine ? '✓ This is you' : taken ? 'taken by another phone' : 'tap if this is you'}</small></span></button>`; }).join('')}</div>
    <button type="button" class="linkbtn" data-seatme="-1">I'm just watching</button></section>`;
}

function playerPanel() {
  const seat = mySeat();
  const mine = v.requests.filter((q) => q.byUid === myUid()).slice(-4).reverse();
  const st = { pending: '⏳ waiting for host', approved: '✅ approved', rejected: '❌ rejected', cancelled: 'cancelled' };
  if (seat == null && me()?.seat !== -1) return seatChooser('Which player are you?');
  return `${seat != null ? `<button class="bigwin" data-act="iwon">🙋 I won! <span>Build your hand — the app counts the Tai and sends it to the host</span></button>
    <button type="button" class="btn block simbtn" data-act="sim">🧪 Simulate my hand — check the points (not saved)</button>
    <div class="actgrid two"><button data-act="iclaim"><span>⚡</span><b>Kong / flowers</b><small>ask for an instant payout</small></button>
      <button data-seatme="-2"><span>💺</span><b>You are ${pname(seat)}</b><small>tap to change seat</small></button></div>` : `<div class="banner small">👀 Watching only. <button class="btn sm" data-seatme="-2">Pick my seat</button></div>`}
    ${mine.length ? `<section class="card"><h2>My requests</h2><ul class="hist">${mine.map((q) => `<li><div><div class="desc">${requestText(q)}</div><div class="meta">${st[q.status] || esc(q.status)}</div></div>
      ${q.status === 'pending' ? `<div class="hbtns"><button class="btn sm" data-cancelreq="${esc(q.id)}">Cancel</button></div>` : ''}</li>`).join('')}</ul></section>` : ''}`;
}

async function pickSeat(i) {
  if (i === -2) { await app.store.joinRoom(v.room.code, { seat: null }); return; }
  if (i >= 0 && seatOwner(i) && seatOwner(i).uid !== myUid()) return toast('Another phone already picked that seat');
  const name = i >= 0 ? v.room.players[i] : (myName() || 'Guest');
  if (i >= 0) setMyName(name);
  await app.store.joinRoom(v.room.code, { seat: i, name });
  if (isHost() && i >= 0) await app.store.updateRoom(v.room.code, { hostName: name }).catch(() => {});
  toast(i >= 0 ? `You are ${name}` : 'Watching only');
}

/* ----- Kahoot-style lobby ----- */
function renderLobby($app) {
  const r = v.room; const host = isHost();
  const seated = [0, 1, 2, 3].filter((i) => seatOwner(i)).length;
  const watchers = v.members.filter((m) => !(Number.isInteger(m.seat) && m.seat >= 0));
  $app.innerHTML = `
    <section class="lobby">
      <div class="small">${host ? 'Tell everyone to join with this code' : 'You joined'}</div>
      <div class="lobbycode">${esc(r.code)}</div>
      ${host ? `<div class="qrbox" id="qrBox">${v.qr ? `<img src="${v.qr}" alt="QR code to join" />` : '<span class="small muted">Loading QR…</span>'}</div>
        <div class="small">Scan with the phone camera, or open the link and enter the code</div>
        <div class="hero-btns"><button class="btn gold sm" data-act="share">🔗 Share link</button></div>` : `<h2>Waiting for ${esc(r.hostName || 'the host')} to start…</h2><div class="dots"><span></span><span></span><span></span></div>`}
    </section>
    <section class="card"><div class="row-between"><h2>Players (${seated}/4 joined)</h2><span class="small muted">${esc(r.name || '')}</span></div>
      <ul class="lobbylist">${[0, 1, 2, 3].map((i) => { const o = seatOwner(i); return `<li class="${o ? 'in' : ''}">${avatar(r.players[i], 'sm')}<b>${pname(i)}</b>
        <span class="small ${o ? 'pos' : 'muted'}">${o ? `✓ joined${(o.uid || o.id) === r.hostUid ? ' · 👑 host' : ''}${(o.uid || o.id) === myUid() ? ' · you' : ''}` : 'waiting…'}</span></li>`; }).join('')}</ul>
      ${watchers.length ? `<p class="small muted">Watching: ${watchers.map((m) => esc(m.name || 'Guest')).join(', ')}</p>` : ''}</section>
    ${mySeat() == null ? seatChooser(host ? 'Are you playing too? Pick your seat' : 'Which player are you?') : `<p class="center small">You are <b>${pname(mySeat())}</b> · <button class="linkbtn" data-seatme="-2">change</button></p>`}
    ${host ? `<button class="btn primary block big" data-act="start">▶ Start game</button>
      <button class="btn block" data-act="hosttools">👑 Host tools (PIN, hand over)</button>` : `<p class="center small muted">Only the host can start the game and record scores. You can send “I won” requests once it starts.</p>`}`;
  if (host && !v.qr) loadQr(joinUrl()).then((src) => { if (!src) { const b = document.getElementById('qrBox'); if (b) b.innerHTML = `<span class="small muted">${esc(joinUrl())}</span>`; return; } v.qr = src; const b = document.getElementById('qrBox'); if (b) b.innerHTML = `<img src="${src}" alt="QR code to join" />`; });
}

let qrLib = null;
async function loadQr(text) {
  try {
    qrLib ||= new Promise((res, rej) => { if (window.QRCode) return res(); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    await qrLib;
    const box = document.createElement('div');
    new window.QRCode(box, { text, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
    const c = box.querySelector('canvas'); return c ? c.toDataURL() : box.querySelector('img')?.src || null;
  } catch (e) { console.warn('QR', e); qrLib = null; return null; }
}

function qrSheet() {
  sheet({ title: '📱 Join this game', sub: `Code ${esc(v.room.code)}`, body: `<div class="center"><div class="lobbycode dark">${esc(v.room.code)}</div><div class="qrbox" id="qrSheet">${v.qr ? `<img src="${v.qr}" alt="QR" />` : 'Loading…'}</div><p class="small muted">${esc(joinUrl())}</p></div>`,
    footer: '<button class="btn primary block" data-copy>Copy link</button>',
    onMount(api) {
      if (!v.qr) loadQr(joinUrl()).then((src) => { v.qr = src; const b = api.el.querySelector('#qrSheet'); if (b) b.innerHTML = src ? `<img src="${src}" alt="QR" />` : ''; });
      api.el.addEventListener('click', (e) => { if (e.target.closest('[data-copy]')) copyText(joinUrl(), 'Link copied'); });
    } });
}

/* ----- host tools / take over ----- */
function hostTools() {
  const others = v.members.filter((m) => (m.uid || m.id) !== myUid());
  sheet({
    title: '👑 Host tools', sub: 'Only one phone controls the game',
    body: `<div class="mstep"><div class="mstep-h">Host PIN ${v.room.hasPin ? '<span class="pos small">✓ set</span>' : '<span class="neg small">not set</span>'}</div>
        <p class="small muted">If this phone dies or you hand over, someone can take control on another phone with this PIN. Nobody can read it.</p>
        <div class="joinrow"><input type="password" inputmode="numeric" maxlength="8" placeholder="4–8 digits" data-pin /><button class="btn" data-setpin>Save PIN</button></div></div>
      <div class="mstep"><div class="mstep-h">Hand over control</div>
        ${others.length ? `<div class="ilist">${others.map((m) => `<button data-give="${esc(m.uid || m.id)}" data-name="${esc(m.name || 'Guest')}"><span>📲 <b>${esc(m.name || 'Guest')}</b>${Number.isInteger(m.seat) && m.seat >= 0 ? ` <small>(${pname(m.seat)}'s phone)</small>` : ''}</span><small class="amt">Give</small></button>`).join('')}</div>`
          : '<p class="small muted">No other phones have opened this game yet. Share the code first.</p>'}</div>
      ${v.room.status === 'active' && !v.events.length ? '<button class="btn block" data-act2="lobby">⬅ Back to the lobby (QR screen)</button>' : ''}`,
    onMount(api) {
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.setpin !== undefined) {
          const pin = api.el.querySelector('[data-pin]').value.trim();
          if (!/^\d{4,8}$/.test(pin)) return toast('Use 4 to 8 digits');
          try { await app.store.setHostPin(v.room.code, pin); await app.store.updateRoom(v.room.code, { hasPin: true }); toast('Host PIN saved'); closeSheet(); }
          catch (err) { toast('Could not save: ' + (err.code || err.message)); }
        }
        if (b.dataset.give) {
          if (!await confirmBox({ title: `Give control to ${esc(b.dataset.name)}?`, text: 'You will no longer be able to record scores on this phone (unless you use the PIN to take it back).', ok: 'Hand over' })) return;
          await app.store.updateRoom(v.room.code, { hostUid: b.dataset.give, hostName: b.dataset.name }); closeSheet(); toast(`${b.dataset.name} is now the host`);
        }
        if (b.dataset.act2 === 'lobby') { await app.store.updateRoom(v.room.code, { status: 'lobby' }); closeSheet(); }
      });
    },
  });
}

function takeOver() {
  sheet({
    title: '🔑 Take over as host', sub: 'Needs the host PIN',
    body: `<p class="small muted">Ask the host for the game PIN. If the host still has their phone, they can also hand over control from <b>Host tools</b>.</p>
      ${v.room.hasPin ? '' : '<p class="small neg">The host has not set a PIN for this game — ask them to hand over control instead.</p>'}
      <label class="field"><span>Host PIN</span><input type="password" inputmode="numeric" maxlength="8" data-pin /></label>`,
    footer: '<button class="btn primary block big" data-claim>Take control</button>',
    onMount(api) {
      api.el.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-claim]')) return;
        const pin = api.el.querySelector('[data-pin]').value.trim(); if (!pin) return toast('Enter the PIN');
        try { await app.store.claimHost(v.room.code, pin, mySeat() != null ? v.room.players[mySeat()] : (myName() || 'Host')); closeSheet(); toast('You are now the host 👑'); }
        catch (err) { console.warn(err); toast(/permission|Wrong PIN/i.test(String(err.code || err.message)) ? 'Wrong PIN' : 'Could not take over: ' + (err.code || err.message)); }
      });
    },
  });
}

/* ----- wins via the guided helper ----- */
function winEventFrom(m) {
  const s = S();
  const ev = { type: 'win', winner: m.winner, tai: m.tai, cap: cap(), patterns: m.patterns || [], remarks: m.remarks || null };
  if (m.hand) ev.hand = m.hand;
  if (m.method === 'self') Object.assign(ev, { selfDraw: true, shooter: null });
  else if (m.method === 'discard') { if (m.shooter == null) throw new Error('Missing discarder'); Object.assign(ev, { selfDraw: false, shooter: m.shooter }); }
  else { if (m.baoBy == null) throw new Error('Missing responsible player'); Object.assign(ev, { selfDraw: !!m.baoSelf, shooter: m.baoSelf ? null : m.baoBy, baoBy: m.baoBy, baoReason: m.baoReason || 'thirdDragon', baoMultiplier: s.baoMultiplier }); }
  ev.deltas = winDeltas(ev);
  return ev;
}

const wizardBase = () => ({ players: v.room.players, seatWindOf, roundWind: ROUND().round || 0, rules: wizardRules(), ruleSetName: S().ruleSetName || 'Default' });

function hostWin() {
  openSim({
    ...wizardBase(), mode: 'host', onAdvanced: () => winSheet(),
    async onSubmit(res) { try { const ev = winEventFrom(res); return await save(ev, `Win recorded: ${sign(ev.deltas[ev.winner])} ${unit()}`); } catch (err) { toast(err.message); return false; } },
  });
}

function playerWin() {
  const seat = mySeat(); if (seat == null) return toast('Pick your seat first');
  if (v.requests.some((q) => q.byUid === myUid() && q.status === 'pending' && q.type === 'win')) return toast('You already have a win waiting for the host');
  openSim({
    ...wizardBase(), mode: 'player', presetWinner: seat,
    async onSubmit(res) {
      try {
        winEventFrom(res); // validates
        await app.store.addRequest(v.room.code, { type: 'win', byName: v.room.players[seat], winner: seat, method: res.method, shooter: res.shooter ?? null, baoBy: res.baoBy ?? null,
          baoReason: res.method === 'bao' ? res.baoReason : null, baoSelf: !!res.baoSelf, tai: res.tai, patterns: res.patterns, hand: res.hand || null });
        closeSheet(); toast('📨 Sent! The host will approve it.'); return true;
      } catch (err) { console.error(err); toast('Could not send: ' + (err.code || err.message)); return false; }
    },
  });
}

function playerInstant() {
  const seat = mySeat(); if (seat == null) return toast('Pick your seat first');
  const s = S();
  sheet({
    title: '⚡ Ask for an instant payout', sub: 'Paid right away when the host approves',
    body: `<div class="ilist">${Object.entries(INSTANT_KINDS).map(([k, x]) => { const n = s[k] ?? DEFAULT_SETTINGS[k]; return `
      <button type="button" data-k="${k}"><span>${x.icon} <b>${esc(x.label)}</b> ${zh(x.zh)}<br><small>Each of the 3 others pays you ${n}.</small></span><small class="amt">+${n * 3}</small></button>`; }).join('')}</div>`,
    onMount(api) {
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        b.disabled = true;
        try { await app.store.addRequest(v.room.code, { type: 'instant', byName: v.room.players[seat], player: seat, kind: b.dataset.k }); closeSheet(); toast('📨 Sent to the host'); }
        catch (err) { b.disabled = false; toast('Could not send: ' + (err.code || err.message)); }
      });
    },
  });
}

async function approve(q) {
  if (!q || q.status !== 'pending') return;
  try {
    const ev = q.type === 'win' ? winEventFrom(q) : { type: 'instant', player: q.player, kind: q.kind, notes: null, deltas: instantDeltas({ player: q.player, kind: q.kind }, S()) };
    ev.requestId = q.id; ev.requestedBy = q.byName || null;
    const id = await app.store.addEvent(v.room.code, ev);
    await app.store.updateRequest(v.room.code, q.id, { status: 'approved', eventId: id || null });
    toast('Approved ✓');
  } catch (err) { console.error(err); toast('Approve failed: ' + (err.code || err.message)); }
}

async function reject(q) {
  if (!q) return;
  if (!await confirmBox({ title: 'Reject this request?', text: `${esc(q.byName || 'The player')} will be told it was rejected. Nothing is added to the scores.`, ok: 'Reject', danger: true })) return;
  await app.store.updateRequest(v.room.code, q.id, { status: 'rejected' }); toast('Rejected');
}
