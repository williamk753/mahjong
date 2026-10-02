// 🧪 Winning-hand simulator: 1 win details → 2 special hands → 3 tile builder → 4 result with Tai breakdown.
import { blankHand, simulate, setTiles, packHand, handProblems, THIRTEEN, FLOWERS, ANIMALS, WIND_TILES, DRAGON_TILES, SUITS } from './handcalc.js';
import { tile, tiles, bonusTile } from './tileui.js';
import { byId } from './hand.js';
import { winDeltas, BAO_REASONS, MAX_TAI } from './scoring.js';
import { zh, unit } from './prefs.js';
import { ruleSets, ruleSet, DEFAULT_ID } from './rulesets.js';
import { esc, sign, sheet, WIND_EN, WIND_ZH } from './ui.js';

const MANUAL_LIMITS = ['heavenly', 'earthly', 'human', 'eightFlowers', 'sevenFlowers'];
const AUTO_LIMITS = ['bigDragons', 'bigWinds', 'allTerminals', 'nineGates'];
const SET_TYPES = { chow: ['Run', '1-2-3 in a row', 'chow 吃'], pong: ['Pong', '3 the same', 'pong 碰'], kong: ['Kong', '4 the same', 'kong 杠'] };

/**
 * opts: { mode: 'host' | 'player' | 'calc', players[4], seatWindOf(i), roundWind, presetWinner,
 *         rules (object or fn), ruleSetName, onSubmit(result) -> Promise<boolean>, onAdvanced? }
 * In 'calc' mode the player picks the rule set inside the simulator.
 */
export function openSim(opts) {
  return sheet({
    title: opts.mode === 'player' ? `🙋 I won! ${zh('和了')}` : `🧪 Winning hand ${zh('算台')}`,
    sub: 'Build your hand — the app finds the winning pattern and counts the Tai', wide: true, body: '',
    onMount(api) { createSim(api, opts); },
  });
}

/** Inline version (Score tab). */
export function mountSim(el, opts) {
  el.innerHTML = '<div class="simbody"></div><div class="simfoot"></div>';
  const body = el.querySelector('.simbody'); const foot = el.querySelector('.simfoot');
  const api = { el, body, setBody: (h) => { body.innerHTML = h; }, setFoot: (h) => { foot.innerHTML = h; } };
  createSim(api, { ...opts, inline: true });
}

function createSim(api, opts) {
  const calc = opts.mode === 'calc';
  const m = { winner: opts.presetWinner ?? (calc ? (opts.seatWind ?? 0) : null), method: null, shooter: null, baoBy: null, baoReason: 'thirdDragon', baoSelf: false, roundWind: opts.roundWind ?? 0 };
  let h = opts.initialHand ? { ...blankHand(), ...JSON.parse(JSON.stringify(opts.initialHand)) } : blankHand();
  const b = { slot: 0, type: 'pong', suit: 'm' }; // builder cursor
  let showLimits = false; let rsId = DEFAULT_ID; let step = opts.initialHand ? 2 : 0;
  if (opts.initialHand && !m.method) m.method = 'self';
  const STEPS = ['win', 'type', 'build', 'result'];
  const fixed = !calc || !!opts.rules;
  const R = () => (!fixed ? ruleSet(rsId).rules : typeof opts.rules === 'function' ? opts.rules() : opts.rules);
  const pname = (i) => (calc ? `${WIND_EN[i]} seat` : esc(opts.players[i]));
  const seatWind = () => (calc ? m.winner : opts.seatWindOf(m.winner));
  const ctx = () => ({ seatWind: seatWind(), roundWind: m.roundWind, selfDraw: m.method === 'self' || (m.method === 'bao' && m.baoSelf) });
  const sim = () => simulate(h, R(), ctx());
  const deltasOf = (res) => {
    if (!res.valid || m.winner == null || !m.method) return null;
    const cap = R().taiCap || MAX_TAI; const other = calc ? (m.winner + 1) % 4 : null;
    const base = { winner: m.winner, tai: res.actual, cap };
    try {
      if (m.method === 'self') return winDeltas({ ...base, selfDraw: true });
      if (m.method === 'discard') return winDeltas({ ...base, shooter: calc ? other : m.shooter });
      const by = calc ? other : m.baoBy;
      return winDeltas({ ...base, selfDraw: m.baoSelf, shooter: by, baoBy: by, baoMultiplier: R().baoMultiplier });
    } catch { return null; }
  };

  /* ---------- step 1: win details ---------- */
  const seatBtns = (key, cur, exclude = []) => `<div class="qopts">${[0, 1, 2, 3].map((i) => `<button data-m="${key}" data-v="${i}" class="qcard ${cur === i ? 'on' : ''}" ${exclude.includes(i) ? 'disabled' : ''}>
    <span class="qbig">${calc ? WIND_ZH[i] : pname(i)}</span><small>${calc ? WIND_EN[i] : `${WIND_EN[opts.seatWindOf(i)]} ${WIND_ZH[opts.seatWindOf(i)]}`}</small></button>`).join('')}</div>`;
  const windChips = (key, cur) => `<div class="qopts four">${[0, 1, 2, 3].map((i) => `<button data-m="${key}" data-v="${i}" class="${cur === i ? 'on' : ''}"><span class="qbig">${WIND_ZH[i]}</span><small>${WIND_EN[i]}</small></button>`).join('')}</div>`;
  function winStep() {
    return `
      ${opts.presetWinner == null && !calc ? `<p class="q">Who won?</p>${seatBtns('winner', m.winner)}` : ''}
      ${calc ? `<p class="q">Your seat wind</p>${windChips('winner', m.winner)}<p class="q">Round wind</p>${windChips('roundWind', m.roundWind)}` : ''}
      <p class="q">How did you get the winning tile?</p>
      <div class="qopts col">
        <button data-m="method" data-v="self" class="qcard ${m.method === 'self' ? 'on' : ''}"><span class="qbig">🤚 I drew it myself</span><small>Self-draw ${zh('自摸')} — everyone pays double</small></button>
        <button data-m="method" data-v="discard" class="qcard ${m.method === 'discard' ? 'on' : ''}"><span class="qbig">🫴 Someone threw it away</span><small>Discard ${zh('点炮')} — the thrower pays double</small></button>
        <button data-m="method" data-v="bao" class="qcard ${m.method === 'bao' ? 'on' : ''}"><span class="qbig">⚠️ Someone must pay for all</span><small>Pay-all ${zh('包赔')} — e.g. fed the 3rd dragon</small></button>
      </div>
      ${!calc && m.method === 'discard' ? `<p class="q">Who threw it?</p>${seatBtns('shooter', m.shooter, [m.winner])}` : ''}
      ${!calc && m.method === 'bao' ? `<p class="q">Who pays for everyone?</p>${seatBtns('baoBy', m.baoBy, [m.winner])}
        <label class="field"><span>Why</span><select data-baoreason>${Object.entries(BAO_REASONS).map(([k, x]) => `<option value="${k}" ${m.baoReason === k ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-baoself ${m.baoSelf ? 'checked' : ''}/> I actually drew the winning tile myself</label>` : ''}`;
  }
  const winOk = () => m.winner != null && m.method && (calc || m.method === 'self' || (m.method === 'discard' ? m.shooter != null : m.baoBy != null));

  /* ---------- step 2: special hands ---------- */
  function typeStep() {
    const card = (kind, title, sub, demo) => `<button data-kind="${kind}" class="qcard ${h.kind === kind && kind !== 'limit' ? 'on' : ''}"><span class="qbig">${title}</span>${demo ? `<span class="demo">${demo}</span>` : ''}<small>${sub}</small></button>`;
    return `<div class="qopts col">
      ${card('normal', '✅ Normal hand', '4 groups of 3 + 1 pair — almost every win', `${tiles(['s1', 's2', 's3'], { small: true })} ${tiles(['p5', 'p5', 'p5'], { small: true })} ${tiles(['m7', 'm8', 'm9'], { small: true })} ${tiles(['w1', 'w1', 'w1'], { small: true })} ${tiles(['d3', 'd3'], { small: true })}`)}
      ${card('sevenPairs', '👯 Seven pairs', 'Irregular: 7 pairs, no groups', tiles(['m2', 'm2', 'p4', 'p4', 's6', 's6', '…'].filter((x) => x !== '…'), { small: true }) + ' …')}
      ${card('thirteen', '🌟 Thirteen wonders', 'Irregular: every 1, 9, wind & dragon + a pair', tiles(['m1', 'm9', 'p1', 'p9', 's1', 's9', 'w1'], { small: true }) + ' …')}
      <button data-showlimits class="qcard ${h.kind === 'limit' ? 'on' : ''}"><span class="qbig">👑 Premium hand ${showLimits ? '▴' : '▾'}</span><small>Heavenly, Earthly, Eight flowers…</small></button>
      ${showLimits ? `<div class="ilist">${MANUAL_LIMITS.map((id) => `<button data-limit="${id}" class="${h.limit === id ? 'on' : ''}"><span><b>${esc(byId[id].name)}</b> ${zh(byId[id].zh)}<br><small>${esc(byId[id].desc)}</small></span></button>`).join('')}</div>` : ''}
    </div>
    <p class="small muted">ℹ️ ${AUTO_LIMITS.map((id) => byId[id].name).join(', ')} are found automatically from your tiles — choose Normal hand.</p>`;
  }

  /* ---------- step 3: tile builder ---------- */
  const isWin = (slot, i) => h.winTile && h.winTile.slot === slot && h.winTile.i === i;
  const complete = () => !handProblems(h).length;
  function slotRow(slot, label, list, extra = '') {
    const active = b.slot === slot;
    return `<div class="slot ${active ? 'on' : ''} ${list.length ? 'filled' : ''}" data-slot="${slot}">
      <span class="slab">${label}</span>
      <span class="stiles">${list.length ? list.map((t, i) => tile(t, { attrs: `data-wt="${slot}:${i}"`, star: isWin(slot, i) })).join('') : '<span class="ph">tap to fill</span>'}</span>${extra}</div>`;
  }
  function choices(kind) {
    // kind: 'chow' | 'pong' | 'kong' | 'pair'
    const suit = b.suit;
    if (kind === 'chow') {
      if (suit === 'w' || suit === 'd') return '<p class="small muted">Runs only use number tiles — pick 万, 筒 or 索.</p>';
      return `<div class="choices runs">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-pick="${suit}${n}">${tiles(setTiles({ type: 'chow', tile: `${suit}${n}` }), { small: true })}</button>`).join('')}</div>`;
    }
    const list = suit === 'w' ? WIND_TILES : suit === 'd' ? DRAGON_TILES : [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${suit}${n}`);
    return `<div class="choices">${list.map((t) => `<button data-pick="${t}">${tile(t)}</button>`).join('')}</div>`;
  }
  const suitTabs = (noHonours) => `<div class="seg suits">${Object.entries(SUITS).map(([k, s]) => `<button data-suit="${k}" class="${b.suit === k ? 'on' : ''}" ${noHonours && (k === 'w' || k === 'd') ? 'disabled' : ''}><b>${s.zh}</b><small>${s.name}</small></button>`).join('')}</div>`;

  function buildStep() {
    let html = '';
    if (h.kind === 'normal') {
      const cur = b.slot === 'pair' ? null : h.sets[b.slot];
      html += `<div class="slots">${h.sets.map((s, i) => slotRow(i, `Group ${i + 1}`, setTiles(s))).join('')}
        ${slotRow('pair', 'Pair', h.pair ? [h.pair, h.pair] : [])}</div>`;
      const kind = b.slot === 'pair' ? 'pair' : b.type;
      html += `<div class="picker2"><div class="small muted">${b.slot === 'pair' ? 'Pick the tile of your <b>pair</b> (2 the same)' : `Fill <b>Group ${b.slot + 1}</b>${cur ? ' (tap again to change)' : ''}`}</div>
        ${b.slot === 'pair' ? '' : `<div class="seg types">${Object.entries(SET_TYPES).map(([k, [n, d, z]]) => `<button data-type="${k}" class="${b.type === k ? 'on' : ''}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>`}
        ${suitTabs(kind === 'chow')}${choices(kind)}</div>`;
      if (complete()) html += `<p class="hint">⭐ Tap the tile you <b>won with</b> (your last tile) — needed to check Ping Hu.</p>
        <p class="q">Did you call chow / pong / kong on someone's discard before winning?</p>
        <div class="qopts two"><button data-called="true" class="${h.called === true ? 'on' : ''}">🔓 Yes, I called<small>Most hands</small></button>
          <button data-called="false" class="${h.called === false ? 'on' : ''}">🔒 No, all from the wall<small>+ Concealed Hand</small></button></div>`;
    } else if (h.kind === 'sevenPairs') {
      html += `<div class="slots">${h.pairs.map((t, i) => slotRow(i, `Pair ${i + 1}`, t ? [t, t] : [])).join('')}</div>
        <div class="picker2"><div class="small muted">Pick the tile for <b>Pair ${b.slot + 1}</b></div>${suitTabs(false)}${choices('pair')}</div>`;
    } else if (h.kind === 'thirteen') {
      html += `<p class="q">Which tile do you have <b>two</b> of?</p><div class="choices">${THIRTEEN.map((t) => `<button data-double="${t}" class="${h.thirteenDouble === t ? 'on' : ''}">${tile(t)}</button>`).join('')}</div>
        ${h.thirteenDouble ? `<div class="handline">${tiles([...THIRTEEN, h.thirteenDouble].sort())}</div>` : ''}`;
    } else {
      html += `<div class="banner">👑 ${esc(byId[h.limit]?.name || '')} — worth the maximum. Add bonus tiles below if any.</div>`;
    }
    const r = R(); const n = h.flowers.length + h.seasons.length + h.animals.length;
    html += `<details class="extras" ${n || h.kongWin || h.lastTile || h.robKong ? 'open' : ''}><summary>🌸 Flowers, seasons & animals ${n ? `<b>(${n})</b>` : '<span class="muted">— none</span>'}</summary>
      <p class="small">Your seat number is <b>#${seatWind() + 1}</b> (${WIND_EN[seatWind()]}). Only #${seatWind() + 1} counts alone; a full set of 4 always counts.</p>
      <div class="bonusgrid">${FLOWERS.map((f) => { const on = (f.kind === 'flower' ? h.flowers : h.seasons).includes(f.n); return `
        <button data-bonus="${f.kind}" data-n="${f.n}" class="btile ${on ? 'on' : ''} ${f.n === seatWind() + 1 ? 'mine' : ''}">${bonusTile(f.ch, f.n)}<small>${f.name}</small></button>`; }).join('')}
        ${ANIMALS.map((a) => `<button data-animal="${a.id}" class="btile ${h.animals.includes(a.id) ? 'on' : ''}"><span class="emo">${a.emoji}</span><small>${a.name}</small></button>`).join('')}</div>
      ${r.winCircumstance ? [['kongWin', 'Won with the replacement tile after a kong'], ['lastTile', 'Won on the very last tile of the wall'], ['robKong', 'Robbed someone’s kong']].map(([k, l]) => `<label class="check"><input type="checkbox" data-flag="${k}" ${h[k] ? 'checked' : ''}/> ${l}</label>`).join('') : ''}
    </details>`;
    const p = handProblems(h);
    if (p.some((x) => /used/.test(x))) html += `<div class="perr">${p.filter((x) => /used/.test(x)).map(esc).join('<br>')}</div>`;
    return html;
  }

  /* ---------- step 4: result ---------- */
  function handView() {
    if (h.kind === 'normal') return `<div class="handline">${h.sets.map((s, i) => `<span class="grp">${setTiles(s).map((t, j) => tile(t, { star: isWin(i, j) })).join('')}</span>`).join('')}<span class="grp">${tile(h.pair, { star: isWin('pair', 0) })}${tile(h.pair, { star: isWin('pair', 1) })}</span></div>`;
    if (h.kind === 'sevenPairs') return `<div class="handline">${h.pairs.map((t) => `<span class="grp">${tile(t)}${tile(t)}</span>`).join('')}</div>`;
    if (h.kind === 'thirteen') return `<div class="handline">${tiles([...THIRTEEN, h.thirteenDouble].sort())}</div>`;
    return '';
  }
  function resultStep() {
    const res = sim(); const d = deltasOf(res); const r = R(); const u = esc(unit());
    const bonus = [...FLOWERS.filter((f) => (f.kind === 'flower' ? h.flowers : h.seasons).includes(f.n)).map((f) => bonusTile(f.ch, f.n)), ...ANIMALS.filter((a) => h.animals.includes(a.id)).map((a) => `<span class="emo">${a.emoji}</span>`)];
    const label = (i) => (calc ? (i === m.winner ? 'You (winner)' : m.method === 'self' ? 'Each other player' : i === (m.winner + 1) % 4 ? (m.method === 'bao' ? 'Pays for all' : 'Thrower') : 'Other player') : pname(i));
    const rows = d ? (calc && m.method === 'self' ? [m.winner, (m.winner + 1) % 4] : calc ? [m.winner, (m.winner + 1) % 4, (m.winner + 2) % 4] : [0, 1, 2, 3]) : [];
    return `
      ${!fixed ? `<div class="chips2 rsets"><span class="small muted">Rules:</span>${ruleSets().map((s) => `<button data-rs="${esc(s.id)}" class="${rsId === s.id ? 'on' : ''}">${esc(s.name)}</button>`).join('')}</div>` : `<p class="small muted">Rules: <b>${esc(opts.ruleSetName || 'this game')}</b> · min ${r.minTai} · cap ${r.taiCap >= 13 ? 'none' : r.taiCap}</p>`}
      <div class="winhead ${res.valid ? '' : 'bad'}"><small>${res.valid ? 'Winning hand' : 'Not a valid win'}</small>
        <b>${res.headline.length ? res.headline.map(esc).join(' + ') : res.valid ? 'Bonus Tai only' : esc(res.errors[0] || 'No pattern')}</b></div>
      ${handView()}${bonus.length ? `<div class="handline bonus">${bonus.join('')}</div>` : ''}
      <h3>Where the Tai comes from</h3>
      ${res.items.length ? `<ul class="taiwhy">${res.items.map((i) => `<li><div class="row-between"><b>${esc(i.name)}${i.n > 1 ? ` ×${i.n}` : ''} ${zh(i.zh)}</b><span class="tplus">+${i.tai}</span></div>
        ${i.src?.groups?.length && i.src.groups.length <= 4 && i.input !== 'colour' && !['halfTerminals', 'allTerminals', 'nineGates'].includes(i.id) ? `<div class="srcgroups">${i.src.groups.map((g) => tiles(g, { small: true })).join('')}</div>` : ''}
        <div class="small muted">${esc(i.src?.text || '')}</div></li>`).join('')}</ul>` : '<p class="muted">No scoring patterns.</p>'}
      ${res.notes.map((n) => `<p class="small note">ℹ️ ${esc(n)}</p>`).join('')}
      ${res.valid ? '' : `<div class="perr">${res.errors.map(esc).join('<br>')}</div>`}
      <div class="sumbig ${res.valid ? '' : 'bad'}"><div><small>Total Tai</small><b>${res.actual}${res.actual > res.cap ? `<span class="small"> → ${res.cap}</span>` : ''}</b></div>
        <div><small>Base = 2<sup>${Math.min(res.actual, res.cap)}</sup></small><b>${res.base}</b></div>
        <div><small>${calc ? 'You get' : `${pname(m.winner)} gets`}</small><b class="pos">${d ? sign(d[m.winner]) : '–'}<span class="small"> ${u}</span></b></div></div>
      ${d ? `<div class="settle">${rows.map((i) => `<div class="row-between"><span>${label(i)}</span><b class="${d[i] > 0 ? 'pos' : d[i] < 0 ? 'neg' : ''}">${sign(d[i])}</b></div>`).join('')}</div>` : ''}`;
  }

  /* ---------- navigation ---------- */
  const TITLES = { win: '1 · Win details', type: '2 · What kind of hand?', build: h.kind === 'normal' ? '3 · Build your hand: 4 groups + 1 pair' : '3 · Your tiles', result: '4 · Result' };
  function render() {
    const id = STEPS[step];
    const bodyHtml = id === 'win' ? winStep() : id === 'type' ? typeStep() : id === 'build' ? buildStep() : resultStep();
    api.setBody(`<div class="wprog">${STEPS.map((s, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
      <h3 class="wq">${id === 'build' && h.kind === 'normal' ? TITLES.build : { win: TITLES.win, type: TITLES.type, build: '3 · Your tiles', result: TITLES.result }[id]}</h3>${bodyHtml}`);
    const res = id === 'build' || id === 'result' ? sim() : null;
    const ok = id === 'win' ? winOk() : id === 'type' ? !!(h.kind !== 'limit' || h.limit) : id === 'build' ? !handProblems(h).length : true;
    const submitLabel = opts.mode === 'player' ? '📨 Send to the host' : opts.mode === 'host' ? '✓ Record this win' : '↺ New hand';
    const canSubmit = calc || (res?.valid && deltasOf(res));
    api.setFoot(`<div class="wnav"><button class="btn" data-nav="back" ${step === 0 ? 'disabled' : ''}>← Back</button>
      ${step === 0 && opts.onAdvanced ? '<button class="btn" data-nav="adv">Advanced</button>' : ''}
      ${id === 'result' ? `<button class="btn primary big" data-nav="submit" ${canSubmit ? '' : 'disabled'}>${submitLabel}</button>`
        : `<button class="btn primary big" data-nav="next" ${ok ? '' : 'disabled'}>${id === 'build' && ok ? `See result · ${res.actual} Tai →` : 'Next →'}</button>`}</div>`);
    if (!opts.inline) api.body.scrollTop = id === 'build' ? api.body.scrollTop : 0;
  }
  const keepScroll = () => { const y = api.body.scrollTop; render(); api.body.scrollTop = y; };
  const nextEmpty = () => {
    if (h.kind === 'sevenPairs') { const i = h.pairs.indexOf(null); b.slot = i < 0 ? b.slot : i; return; }
    const i = h.sets.indexOf(null); b.slot = i >= 0 ? i : h.pair ? b.slot : 'pair';
  };
  const go = (n) => { step = Math.max(0, Math.min(STEPS.length - 1, n)); render(); if (opts.inline) api.el.scrollIntoView?.({ block: 'start' }); };

  render();
  api.el.addEventListener('click', async (e) => {
    let t = e.target.closest('button, [data-slot], [data-wt]'); if (!t || !api.el.contains(t)) return;
    if (t.dataset.wt !== undefined && !(complete() && h.kind === 'normal')) t = t.closest('[data-slot]') || t;
    const d = { ...t.dataset };
    if (d.nav === 'back') return go(step - 1);
    if (d.nav === 'next') return go(step + 1);
    if (d.nav === 'adv') return opts.onAdvanced();
    if (d.nav === 'submit') {
      if (calc) { h = blankHand(); m.method = null; b.slot = 0; return go(0); }
      const res = sim(); t.disabled = true;
      const ok = await opts.onSubmit({ ...m, tai: res.actual, patterns: res.patterns, hand: packHand(h), deltas: deltasOf(res) });
      if (ok === false) t.disabled = false; return;
    }
    if (d.rs) { rsId = d.rs; return keepScroll(); }
    // step 1
    if (d.m) {
      m[d.m] = d.m === 'method' ? d.v : Number(d.v);
      if (d.m === 'winner') { if (m.shooter === m.winner) m.shooter = null; if (m.baoBy === m.winner) m.baoBy = null; }
      if (winOk() && (d.m === 'shooter' || (d.m === 'method' && (calc || d.v === 'self')))) return go(1);
      return keepScroll();
    }
    // step 2
    if (d.kind) { h.kind = d.kind; h.limit = null; h.winTile = null; b.slot = 0; b.suit = 'm'; return go(2); }
    if (d.showlimits !== undefined) { showLimits = !showLimits; return keepScroll(); }
    if (d.limit) { h.kind = 'limit'; h.limit = d.limit; return go(2); }
    // step 3
    if (d.wt !== undefined && complete() && h.kind === 'normal') {
      const [slot, i] = d.wt.split(':'); const s = slot === 'pair' ? 'pair' : Number(slot);
      h.winTile = isWin(s, Number(i)) ? null : { slot: s, i: Number(i) }; return keepScroll();
    }
    if (d.called !== undefined) { h.called = d.called === 'true'; return keepScroll(); }
    if (d.slot !== undefined) { b.slot = d.slot === 'pair' ? 'pair' : Number(d.slot); const s = h.sets[b.slot]; if (s) { b.type = s.type; b.suit = s.tile[0]; } return keepScroll(); }
    if (d.type) { b.type = d.type; if (d.type === 'chow' && (b.suit === 'w' || b.suit === 'd')) b.suit = 'm'; return keepScroll(); }
    if (d.suit) { b.suit = d.suit; return keepScroll(); }
    if (d.pick) {
      if (h.kind === 'sevenPairs') { h.pairs[b.slot] = d.pick; nextEmpty(); return keepScroll(); }
      if (b.slot === 'pair') h.pair = d.pick;
      else h.sets[b.slot] = { type: b.type, tile: d.pick, open: h.sets[b.slot]?.open || false };
      if (h.winTile && (h.winTile.slot === b.slot)) h.winTile = null;
      nextEmpty(); return keepScroll();
    }
    if (d.double) { h.thirteenDouble = d.double; return keepScroll(); }
    if (d.bonus) { const list = d.bonus === 'flower' ? h.flowers : h.seasons; const n = Number(d.n); const i = list.indexOf(n); if (i >= 0) list.splice(i, 1); else list.push(n); return keepScroll(); }
    if (d.animal) { const i = h.animals.indexOf(d.animal); if (i >= 0) h.animals.splice(i, 1); else h.animals.push(d.animal); return keepScroll(); }
  });
  api.el.addEventListener('change', (e) => {
    if (e.target.matches('[data-baoself]')) { m.baoSelf = e.target.checked; keepScroll(); }
    if (e.target.matches('[data-baoreason]')) m.baoReason = e.target.value;
    if (e.target.dataset.flag) { h[e.target.dataset.flag] = e.target.checked; keepScroll(); }
  });
}
