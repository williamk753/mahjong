// Step-by-step "I won!" helper. Simple questions about the tiles — no scoring knowledge needed.
import { answersToSelection, blankAnswers, FLOWER_TILES, ANIMALS } from './wizard-core.js';
import { evaluateHand, selectionToList, LIMITS } from './hand.js';
import { winDeltas, BAO_REASONS, MAX_TAI } from './scoring.js';
import { zh, unit } from './prefs.js';
import { esc, sign, sheet, WIND_EN, WIND_ZH } from './ui.js';

const T = (cp) => String.fromCodePoint(cp);
const TILE = { c1: T(0x1F007), c2: T(0x1F008), c3: T(0x1F009), d5: T(0x1F01D), b1: T(0x1F010), b9: T(0x1F018), c9: T(0x1F00F),
  red: T(0x1F004), green: T(0x1F005), white: T(0x1F006), wind: [T(0x1F000), T(0x1F001), T(0x1F002), T(0x1F003)] };
const tiles = (...t) => `<span class="tl">${t.join('')}</span>`;

/**
 * opts: {
 *   mode: 'host' | 'player' | 'calc',
 *   players: [4 names] (room modes), seatWindOf(i) -> 0..3, roundWind 0..3, presetWinner (player mode),
 *   rules: merged house + table rules, onSubmit(result) -> Promise<boolean>
 * }
 */
export function openWizard(opts) {
  const r = opts.rules;
  const calc = opts.mode === 'calc';
  const ans = blankAnswers();
  const m = { winner: opts.presetWinner ?? (calc ? 0 : null), method: null, shooter: null, baoBy: null, baoReason: 'thirdDragon', baoSelf: false, roundWind: opts.roundWind ?? 0 };
  const name = (i) => (calc ? `${WIND_EN[i]} seat` : esc(opts.players[i]));
  const seatWindIdx = () => (calc ? m.winner : opts.seatWindOf(m.winner));
  const ctx = () => {
    const w = seatWindIdx();
    return { seatNo: w + 1, sameWind: w === m.roundWind, selfDraw: m.method === 'self' || (m.method === 'bao' && m.baoSelf) };
  };
  const result = () => {
    const { selection, reasons } = answersToSelection(ans, ctx());
    const ev = evaluateHand(selection, r, ctx());
    const cap = r.taiCap || MAX_TAI;
    let deltas = null;
    if (ev.valid && m.winner != null && m.method) {
      try {
        const base = { winner: m.winner, tai: ev.actual, cap };
        deltas = m.method === 'self' ? winDeltas({ ...base, selfDraw: true })
          : m.method === 'discard' ? winDeltas({ ...base, shooter: calc ? (m.winner + 1) % 4 : m.shooter })
          : winDeltas({ ...base, selfDraw: m.baoSelf, shooter: calc ? (m.winner + 1) % 4 : m.baoBy, baoBy: calc ? (m.winner + 1) % 4 : m.baoBy, baoMultiplier: r.baoMultiplier });
      } catch { deltas = null; }
    }
    return { selection, reasons, ev, deltas, patterns: selectionToList(selection).map((x) => (x.id === 'sevenPairs' && ctx().selfDraw ? { id: 'sevenPairsSelf', n: 1 } : x)) };
  };

  // ----- steps -----
  const yesNo = (key, yes = 'Yes', no = 'No', cur = ans[key]) => `<div class="qopts two">
    <button data-a="${key}" data-v="true" class="${cur === true ? 'on' : ''}">✅ ${yes}</button><button data-a="${key}" data-v="false" class="${cur === false ? 'on' : ''}">❌ ${no}</button></div>`;
  const opt = (key, val, big, small = '', cur) => `<button data-a="${key}" data-v="${esc(String(val))}" class="qcard ${String(cur) === String(val) ? 'on' : ''}"><span class="qbig">${big}</span>${small ? `<small>${small}</small>` : ''}</button>`;
  const seatButtons = (key, cur, exclude = []) => `<div class="qopts">${[0, 1, 2, 3].map((i) => `<button data-m="${key}" data-v="${i}" class="qcard ${cur === i ? 'on' : ''}" ${exclude.includes(i) ? 'disabled' : ''}><span class="qbig">${calc ? WIND_ZH[i] : name(i)}</span><small>${calc ? `${WIND_EN[i]} seat` : `${WIND_EN[opts.seatWindOf(i)]} ${WIND_ZH[opts.seatWindOf(i)]}`}</small></button>`).join('')}</div>`;

  const STEPS = [
    { id: 'who', show: () => opts.presetWinner == null, title: calc ? 'Which seat are you sitting in?' : 'Who won this round?', help: calc ? 'Your seat decides which flower and wind tiles count for you.' : 'Tap the player who said “Hu” (和).',
      html: () => seatButtons('winner', m.winner) + (calc ? `<p class="small muted">Round wind</p><div class="qopts">${[0, 1, 2, 3].map((i) => `<button data-m="roundWind" data-v="${i}" class="qcard ${m.roundWind === i ? 'on' : ''}"><span class="qbig">${WIND_ZH[i]}</span><small>${WIND_EN[i]} round</small></button>`).join('')}</div>` : ''),
      ok: () => m.winner != null },
    { id: 'how', title: 'How did you get the winning tile?', help: 'The last tile that completed your hand.',
      html: () => `<div class="qopts col">
        <button data-m="method" data-v="self" class="qcard ${m.method === 'self' ? 'on' : ''}"><span class="qbig">🤚 I drew it from the wall myself</span><small>Self-draw ${zh('自摸')} — all 3 others pay double</small></button>
        <button data-m="method" data-v="discard" class="qcard ${m.method === 'discard' ? 'on' : ''}"><span class="qbig">🫴 Someone threw it away and I took it</span><small>Discard win ${zh('点炮')} — that person pays double</small></button>
        <button data-m="method" data-v="bao" class="qcard ${m.method === 'bao' ? 'on' : ''}"><span class="qbig">⚠️ Someone fed a dangerous tile</span><small>Pay-all ${zh('包赔')} — e.g. 3rd dragon, 4th wind. That person pays for everyone</small></button></div>`,
      ok: () => !!m.method },
    { id: 'shooter', show: () => !calc && m.method === 'discard', title: 'Who threw away the winning tile?', help: 'This player pays double.',
      html: () => seatButtons('shooter', m.shooter, [m.winner]), ok: () => m.shooter != null },
    { id: 'bao', show: () => !calc && m.method === 'bao', title: 'Who has to pay for everyone?', help: 'Pick the player who fed the tile, then what happened.',
      html: () => `${seatButtons('baoBy', m.baoBy, [m.winner])}<div class="qopts col">${Object.entries(BAO_REASONS).map(([k, x]) => `<button data-m="baoReason" data-v="${k}" class="qcard sm ${m.baoReason === k ? 'on' : ''}"><span>${esc(x.label)}</span> <small>${x.zh}</small></button>`).join('')}</div>
        <label class="check"><input type="checkbox" data-baoself ${m.baoSelf ? 'checked' : ''}/> I actually drew the winning tile myself</label>`,
      ok: () => m.baoBy != null },
    { id: 'shape', title: 'What do your tile groups look like?', help: 'A winning hand is usually 4 groups of 3 tiles + 1 pair. Look at the groups.',
      html: () => `<div class="qopts col">
        ${opt('shape', 'chow', `${tiles(TILE.c1, TILE.c2, TILE.c3)} All runs`, 'Every group is 3 in a row, like 1-2-3', ans.shape)}
        ${opt('shape', 'pong', `${tiles(TILE.d5, TILE.d5, TILE.d5)} All triplets`, 'Every group is 3 (or 4) of the same tile', ans.shape)}
        ${opt('shape', 'mixed', `${tiles(TILE.c1, TILE.c2, TILE.c3)} + ${tiles(TILE.d5, TILE.d5, TILE.d5)} A mix`, 'Some runs and some triplets — or not sure', ans.shape)}
        ${opt('shape', 'pairs', `${tiles(TILE.b1, TILE.b1)} ×7 Seven pairs`, 'No groups at all, just 7 pairs', ans.shape)}
        ${opt('shape', 'terminals', `${tiles(TILE.c1, TILE.b9, TILE.wind[0])} Only 1s, 9s & honours`, 'No tiles from 2 to 8 at all', ans.shape)}
        ${opt('shape', 'special', '🌟 A rare special hand', 'Thirteen Wonders, Big Four Winds, Nine Gates…', ans.shape)}</div>`,
      ok: () => !!ans.shape },
    { id: 'chow', show: () => ans.shape === 'chow', title: 'Two quick questions about your runs', help: '',
      html: () => `<p><b>1.</b> What is your <b>pair</b> (the 2 matching tiles)?</p>
        <div class="qopts two">${opt('pairOk', true, `${tiles(TILE.d5, TILE.d5)} Number tiles`, 'e.g. 5-5 dots', ans.pairOk)}${opt('pairOk', false, `${tiles(TILE.red, TILE.red)} Dragon / my wind`, '中 發 白 or your seat / round wind', ans.pairOk)}</div>
        <p><b>2.</b> Just before winning, could <b>2 different tiles</b> have completed your hand?</p>
        <p class="small muted">Example: you held ${tiles(TILE.c2, TILE.c3)} and 1 or 4 would both win.</p>
        ${yesNo('twoSided', 'Yes, 2 different tiles', 'No / only 1 tile / not sure')}`,
      ok: () => ans.pairOk != null && ans.twoSided != null },
    { id: 'special', show: () => ans.shape === 'special', title: 'Which special hand?', help: 'These are worth the maximum.',
      html: () => `<div class="qopts col">${LIMITS.map((x) => opt('limit', x.id, `${esc(x.name)} ${zh(x.zh)}`, esc(x.desc), ans.limit)).join('')}</div>`,
      ok: () => !!ans.limit },
    { id: 'suit', show: () => ans.shape !== 'special', title: 'Look at the number tiles — how many kinds?', help: `Kinds: characters 万 ${tiles(TILE.c1)}, dots 筒 ${tiles(TILE.d5)}, bamboo 索 ${tiles(TILE.b1)}. Winds & dragons are “honours”.`,
      html: () => `<div class="qopts col">
        ${opt('suit', 'mixed', '🎨 Two or three kinds', 'Most hands', ans.suit)}
        ${opt('suit', 'half', `${tiles(TILE.b1, TILE.b9, TILE.red)} One kind + winds/dragons`, 'Half Color 混一色', ans.suit)}
        ${opt('suit', 'full', `${tiles(TILE.b1, TILE.b9)} Only ONE kind, nothing else`, 'Full Color 清一色', ans.suit)}</div>`,
      ok: () => !!ans.suit },
    { id: 'dragons', show: () => ans.shape !== 'special', title: `How many groups of 3 dragons? ${tiles(TILE.red, TILE.green, TILE.white)}`, help: 'Red 中, green 發 or white 白 — count groups of 3 (or 4) of the same dragon.',
      html: () => `<div class="qopts four">${[0, 1, 2, 3].map((n) => opt('dragons', n, String(n), n === 0 ? 'none' : n === 3 ? 'all three!' : '', ans.dragons)).join('')}</div>
        ${ans.dragons === 2 ? `<p>Is your <b>pair</b> the third dragon?</p>${yesNo('dragonPair')}` : ''}`,
      ok: () => true },
    { id: 'winds', title: 'Wind tiles', help: '',
      html: () => { const w = seatWindIdx(); const same = w === m.roundWind; return `
        <p>Do you have <b>3 (or 4) of ${tiles(TILE.wind[w])} ${WIND_EN[w]}</b>? That is your seat wind${same ? ' and also the round wind' : ''}.</p>${yesNo('seatWind')}
        ${same ? '' : `<p>Do you have <b>3 (or 4) of ${tiles(TILE.wind[m.roundWind])} ${WIND_EN[m.roundWind]}</b>? That is this round's wind.</p>${yesNo('roundWind')}`}`; },
      ok: () => true },
    { id: 'bonus', title: 'Tap the flower, season & animal tiles you have', help: '',
      html: () => { const w = seatWindIdx(); return `<p class="small">You sit <b>${WIND_EN[w]}</b> → your number is <b>#${w + 1}</b>. Only #${w + 1} counts on its own; a full set of 4 always counts.</p>
        <div class="bonusgrid">${FLOWER_TILES.map((f) => { const on = (f.kind === 'flower' ? ans.flowers : ans.seasons).includes(f.n); return `
          <button data-tile="${f.kind}" data-n="${f.n}" class="btile ${on ? 'on' : ''} ${f.n === w + 1 ? 'mine' : ''}"><span class="tl">${f.glyph}</span><small>#${f.n} ${f.name}</small></button>`; }).join('')}
          ${ANIMALS.map((a) => `<button data-animal="${a.id}" class="btile ${ans.animals.includes(a.id) ? 'on' : ''}"><span class="emo">${a.emoji}</span><small>${a.name}</small></button>`).join('')}</div>
        <p class="small muted">None? Just tap Next.</p>`; },
      ok: () => true },
    { id: 'concealed', title: 'Did ALL your groups come from the wall?', help: 'Answer “No” if you called chow / pong / kong on someone’s thrown-away tile before winning (the winning tile itself does not count).',
      html: () => yesNo('concealed', 'Yes — I never took a thrown-away tile', 'No — I called chow / pong / kong'),
      ok: () => ans.concealed != null },
    { id: 'kongs', title: 'How many kongs (4 of the same tile)?', help: '',
      html: () => `<div class="qopts five">${[0, 1, 2, 3, 4].map((n) => opt('kongs', n, String(n), '', ans.kongs)).join('')}</div>`, ok: () => true },
    { id: 'specialWins', show: () => !!r.winCircumstance, title: 'Anything special about the winning tile?', help: 'Tick if it applies — otherwise just Next.',
      html: () => `${[['kongWin', 'It was the replacement tile after my kong'], ['lastTile', 'It was the very last tile of the wall'], ['robKong', 'I took a tile someone added to make a kong']].map(([k, l]) => `<label class="check big"><input type="checkbox" data-flagq="${k}" ${ans[k] ? 'checked' : ''}/> ${l}</label>`).join('')}`, ok: () => true },
    { id: 'summary', title: 'Here is your score', help: '', html: () => summaryHtml(), ok: () => result().ev.valid },
  ];

  function summaryHtml() {
    const res = result(); const ev = res.ev; const u = esc(unit());
    const reasonFor = (id) => res.reasons.find((x) => x.id === id || (id === 'sevenPairsSelf' && x.id === 'sevenPairs'))?.text || '';
    return `
      <div class="sumbig ${ev.valid ? '' : 'bad'}"><div><small>Tai</small><b>${ev.actual}${ev.actual > ev.cap ? `<span class="small"> → ${ev.cap}</span>` : ''}</b></div><div><small>Base points</small><b>${ev.base}</b></div>
        ${res.deltas ? `<div><small>${calc ? 'Winner gets' : `${name(m.winner)} gets`}</small><b class="pos">${sign(res.deltas[m.winner])}<span class="small"> ${u}</span></b></div>` : ''}</div>
      ${ev.items.length ? `<ul class="whylist">${ev.items.map((i) => `<li><b>${esc(i.name)}${i.n > 1 ? ` ×${i.n}` : ''}</b> <span class="pos">+${i.tai}</span><div class="small muted">${esc(reasonFor(i.id))}</div></li>`).join('')}</ul>` : '<p class="muted">No scoring patterns found.</p>'}
      ${res.reasons.filter((x) => x.id === 'mixed').map((x) => `<p class="small muted">ℹ️ ${esc(x.text)}</p>`).join('')}
      ${ev.errors.length ? `<div class="perr">${ev.errors.map(esc).join('<br>')}<br><span class="small">Go back and check your answers — or the hand is not a valid win.</span></div>` : ''}
      ${res.deltas ? `<div class="settle">${res.deltas.map((x, i) => `<div class="row-between"><span>${calc ? (i === m.winner ? 'Winner' : i === (m.winner + 1) % 4 && m.method !== 'self' ? (m.method === 'bao' ? 'Responsible' : 'Discarder') : 'Other') : name(i)}</span><b class="${x > 0 ? 'pos' : x < 0 ? 'neg' : ''}">${sign(x)}</b></div>`).join('')}</div>` : ''}`;
  }

  // ----- navigation -----
  const visible = () => STEPS.filter((s) => !s.show || s.show());
  let idx = 0;
  const render = (api) => {
    const steps = visible(); idx = Math.min(idx, steps.length - 1);
    const st = steps[idx];
    api.setBody(`<div class="wprog"><span style="width:${Math.round(((idx + 1) / steps.length) * 100)}%"></span></div>
      <div class="wstep"><h3 class="wq">${st.title}</h3>${st.help ? `<p class="small muted">${st.help}</p>` : ''}${st.html()}</div>`);
    const last = st.id === 'summary';
    const submitLabel = opts.mode === 'player' ? '📨 Send to the host' : opts.mode === 'host' ? '✓ Record this win' : '✓ Done';
    api.setFoot(`<div class="wnav"><button class="btn" data-nav="back" ${idx === 0 ? 'disabled' : ''}>← Back</button>
      ${idx === 0 && opts.onAdvanced ? '<button class="btn" data-nav="adv">Advanced</button>' : ''}
      ${last ? `<button class="btn primary big" data-nav="submit" ${st.ok() && (calc || result().deltas) ? '' : 'disabled'}>${submitLabel}</button>`
        : `<button class="btn primary big" data-nav="next" ${st.ok() ? '' : 'disabled'}>Next →</button>`}</div>`);
    api.body.scrollTop = 0;
  };

  sheet({
    title: opts.mode === 'player' ? `🙋 I won! ${zh('和了')}` : `🧭 Count the winning hand ${zh('算台')}`,
    sub: 'Answer a few simple questions — the app does the counting', wide: true, body: '',
    onMount(api) {
      render(api);
      const autoNext = () => { const st = visible()[idx]; if (st.ok() && ['who', 'how', 'shape', 'suit', 'special'].includes(st.id)) { idx++; } render(api); };
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b || !api.el.contains(b)) return;
        const d = b.dataset;
        if (d.nav === 'back') { idx = Math.max(0, idx - 1); return render(api); }
        if (d.nav === 'next') { idx++; return render(api); }
        if (d.nav === 'adv') return opts.onAdvanced();
        if (d.nav === 'submit') {
          const res = result(); b.disabled = true;
          const ok = await opts.onSubmit({ ...m, ...res, tai: res.ev.actual });
          if (ok === false) b.disabled = false;
          return;
        }
        if (d.m) { m[d.m] = ['winner', 'shooter', 'baoBy', 'roundWind'].includes(d.m) ? Number(d.v) : d.v; if (d.m === 'winner') { if (m.shooter === m.winner) m.shooter = null; if (m.baoBy === m.winner) m.baoBy = null; } return autoNext(); }
        if (d.a) {
          const raw = d.v; const val = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) ? Number(raw) : raw;
          ans[d.a] = val;
          if (d.a === 'dragons' && val !== 2) ans.dragonPair = false;
          return autoNext();
        }
        if (d.tile) { const list = d.tile === 'flower' ? ans.flowers : ans.seasons; const n = Number(d.n); const i = list.indexOf(n); if (i >= 0) list.splice(i, 1); else list.push(n); return render(api); }
        if (d.animal) { const i = ans.animals.indexOf(d.animal); if (i >= 0) ans.animals.splice(i, 1); else ans.animals.push(d.animal); return render(api); }
      });
      api.el.addEventListener('change', (e) => {
        if (e.target.matches('[data-baoself]')) { m.baoSelf = e.target.checked; render(api); }
        if (e.target.dataset.flagq) { ans[e.target.dataset.flagq] = e.target.checked; render(api); }
      });
    },
  });
}
