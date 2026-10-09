// Scoring guide page with an interactive Tai calculator (uses the current house rules).
import { basePoints, clampTai } from './scoring.js';
import { TAI_CATALOG, CATEGORIES, taiValue } from './rules.js';
import { prefs, zh, unit } from './prefs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byCat = (c) => TAI_CATALOG.filter((x) => x.cat === c);
const nm = (x) => `${esc(x.name)} ${zh(x.zh)}`;

let calc = {};
const resetCalc = () => { calc = { pattern: 'none', colour: 'none', limit: '', doubleSame: false, self: false }; TAI_CATALOG.forEach((x) => { if (x.input === 'count') calc[x.id] = 0; if (x.input === 'flag') calc[x.id] = false; }); };
resetCalc();

function calcTai() {
  const r = prefs.rules;
  if (calc.limit) { const x = TAI_CATALOG.find((i) => i.id === calc.limit); const v = taiValue(r, x.id); return { raw: v, parts: [`${x.name} (limit) ${v}`] }; }
  const parts = []; let raw = 0;
  const add = (x, n = 1) => { const v = taiValue(r, x.id) * n; if (v) { raw += v; parts.push(`${x.name}${n > 1 ? ` ×${n}` : ''} ${v}`); } };
  if (calc.pattern !== 'none') add(TAI_CATALOG.find((x) => x.id === (calc.pattern === 'sevenPairs' && calc.self ? 'sevenPairsSelf' : calc.pattern)));
  if (calc.colour !== 'none') add(TAI_CATALOG.find((x) => x.id === calc.colour));
  for (const x of TAI_CATALOG) {
    if (x.cat === 'special' && !r.winCircumstance) continue;
    if (x.input === 'count' && calc[x.id]) add(x, calc[x.id]);
    if (x.input === 'flag' && calc[x.id]) {
      if (x.id === 'roundWind' && calc.seatWind && calc.doubleSame && r.doubleWind === '1x') continue; // same tile counted once
      add(x);
    }
  }
  return { raw, parts };
}

function calcResult() {
  const r = prefs.rules;
  const { raw, parts } = calcTai();
  const tai = clampTai(raw, r.taiCap); const b = basePoints(tai, r.taiCap);
  const low = raw < r.minTai;
  return `
    <div class="calcres ${low ? 'low' : ''}">
      <div class="big">${raw} Tai${raw > r.taiCap ? ` → capped at <b>${r.taiCap}</b>` : ''}${tai >= r.taiCap ? ` ${zh('满')}` : ''}</div>
      <div class="muted small">${parts.length ? esc(parts.join(' + ')) : 'Tick what your hand has'}${low ? ` · <b class="neg">below the ${r.minTai} Tai minimum — not a valid win</b>` : ''}</div>
      <div class="grid2" style="margin-top:10px">
        <div class="res"><small>Win off a discard</small><b class="pos">+${4 * b}</b><span class="small muted">Shooter −${2 * b} · others −${b} each</span></div>
        <div class="res"><small>Self-draw ${zh('自摸')}</small><b class="pos">+${6 * b}</b><span class="small muted">Everyone −${2 * b}</span></div>
      </div>
    </div>`;
}

function calculator() {
  const r = prefs.rules;
  const counts = TAI_CATALOG.filter((x) => x.input === 'count');
  const flags = TAI_CATALOG.filter((x) => x.input === 'flag' && !(x.cat === 'special' && !r.winCircumstance));
  const v = (x) => taiValue(r, x.id);
  return `
    <div id="calc">
      <label class="field"><span>Limit hand (overrides everything)</span>
        <select data-calc="limit"><option value="">— none —</option>${byCat('limit').map((x) => `<option value="${x.id}" ${calc.limit === x.id ? 'selected' : ''}>${esc(x.name)} ${x.zh} · ${v(x)} Tai</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-flag="self" ${calc.self ? 'checked' : ''}/> Won by self-draw ${zh('自摸')} <span class="muted small">(changes Seven Pairs to ${v({ id: 'sevenPairsSelf' })} Tai; payout doubles)</span></label>
      <div class="${calc.limit ? 'dim' : ''}">
      <div class="lbl">Hand pattern</div>
      <div class="radios">
        <label class="check"><input type="radio" name="pattern" value="none" ${calc.pattern === 'none' ? 'checked' : ''}/> None</label>
        ${TAI_CATALOG.filter((x) => x.input === 'pattern').map((x) => `<label class="check"><input type="radio" name="pattern" value="${x.id}" ${calc.pattern === x.id ? 'checked' : ''}/> ${nm(x)} <span class="muted">· ${v(x)}</span></label>`).join('')}
      </div>
      <div class="lbl">Suits</div>
      <div class="radios">
        <label class="check"><input type="radio" name="colour" value="none" ${calc.colour === 'none' ? 'checked' : ''}/> Mixed suits</label>
        ${TAI_CATALOG.filter((x) => x.input === 'colour').map((x) => `<label class="check"><input type="radio" name="colour" value="${x.id}" ${calc.colour === x.id ? 'checked' : ''}/> ${nm(x)} <span class="muted">· ${v(x)}</span></label>`).join('')}
      </div>
      <div class="lbl">Counts</div>
      ${counts.map((x) => `
        <div class="stepper"><div><b>${nm(x)}</b><div class="muted small">${v(x)} Tai each</div></div>
          <div class="step"><button type="button" data-step="${x.id}" data-d="-1" aria-label="less">−</button><span>${calc[x.id]}</span><button type="button" data-step="${x.id}" data-d="1" aria-label="more">+</button></div></div>`).join('')}
      <div class="lbl">Extras</div>
      ${flags.map((x) => `<label class="check"><input type="checkbox" data-flag="${x.id}" ${calc[x.id] ? 'checked' : ''}/> ${nm(x)} <span class="muted">· +${v(x)}</span></label>`).join('')}
      ${calc.seatWind && calc.roundWind ? `<label class="check"><input type="checkbox" data-flag="doubleSame" ${calc.doubleSame ? 'checked' : ''}/> Same tile (seat wind = prevailing wind) <span class="muted">· counts ${r.doubleWind === '2x' ? 'twice' : 'once'}</span></label>` : ''}
      </div>
      <div id="calcOut">${calcResult()}</div>
      <button type="button" class="btn sm" id="calcReset">Reset</button>
    </div>`;
}

function taiTable(cat) {
  const r = prefs.rules;
  return `<table class="simple"><tr><th>${CATEGORIES[cat]}</th><th>Tai</th></tr>
    ${byCat(cat).map((x) => `<tr><td>${nm(x)}<div class="muted small">${esc(x.desc)}</div></td><td>${x.input === 'count' ? `${taiValue(r, x.id)} each` : taiValue(r, x.id)}${taiValue(r, x.id) > r.taiCap ? ` <span class="muted small">→ ${r.taiCap}</span>` : ''}${taiValue(r, x.id) !== x.def ? ' <span class="chg">house</span>' : ''}</td></tr>`).join('')}
  </table>`;
}

export function renderGuide($app) {
  const r = prefs.rules;
  const rows = Array.from({ length: r.taiCap + 1 }, (_, t) => t);
  const u = esc(unit());
  $app.innerHTML = `
    <div class="tablehead"><div><h1>📖 Scoring guide</h1><span class="muted small">Singapore rules · your house rules · points only</span></div>
      <a class="btn sm" href="#/settings">⚙️ Edit rules</a></div>
    <nav class="toc card">
      <a href="#g-points">1. Tai → points</a><a href="#g-pay">2. Who pays</a><a href="#g-instant">3. Instant & pay-all</a>
      <a href="#g-tai">4. Counting Tai</a><a href="#g-calc">5. Tai calculator</a><a href="#g-dealer">6. Dealer</a><a href="#g-app">7. Using the app</a>
    </nav>

    <section class="card rulecard">
      <h2>Claiming priority ${zh('鸣牌顺位')}</h2>
      <div class="prio"><span>Hu ${zh('和')}</span>›<span>Kong / Pong ${zh('杠 / 碰')}</span>›<span>Chow ${zh('吃')}</span></div>
      <p class="small muted">When several players want the same discard, a winning claim beats a kong or pong, which beats a chow.</p>
    </section>
    <section class="card rulecard">
      <h2>Single primary hand rule ${zh('单一番种')}</h2>
      <ul class="steps small">
        <li>Pick <b>one base hand</b> (All Chow, Ping Hu, All Pong, Seven Pairs, Half Terminals, Mixed / Pure Orphans…) <b>or one fixed / limit hand</b> — never both, and never two base hands.</li>
        <li>Half / Full Color stack with a base hand (including Seven Pairs), not with a limit hand.</li>
        <li><b>Additive bonuses</b> — flowers, seasons, animals, dragons, seat / round wind, pure straight, concealed hand, kong — combo with anything.</li>
      </ul>
      <a class="btn sm" href="#/tiles">🀄 Open the tile picture guide</a>
    </section>

    <section class="card" id="g-points">
      <h2>1. Tai → base points</h2>
      <p>Every winning hand is worth <b>base = 2<sup>Tai</sup></b> ${u}. Tai is <b>capped at ${r.taiCap}</b> ${zh('满')} — anything above still scores ${basePoints(r.taiCap, r.taiCap)}. You need at least <b>${r.minTai} Tai</b> to win.</p>
      <table class="simple">
        <tr><th>Tai</th><th>Base</th><th>Discard win<br><small>winner gets</small></th><th>Self-draw<br><small>winner gets</small></th></tr>
        ${rows.map((t) => { const b = basePoints(t, r.taiCap); return `<tr class="${t < r.minTai ? 'dimrow' : ''}"><td>${t}${t === r.taiCap ? ` ${zh('满')}` : ''}</td><td>${b}</td><td class="pos">+${4 * b}</td><td class="pos">+${6 * b}</td></tr>`; }).join('')}
      </table>
    </section>

    <section class="card" id="g-pay">
      <h2>2. Who pays</h2>
      <div class="grid2">
        <div class="res"><small>Win off a discard ${zh('出铳')}</small>
          <span>The <b>shooter</b> (who discarded the winning tile) pays <b>2 × base</b>. The other two pay <b>1 × base</b> each.</span></div>
        <div class="res"><small>Self-draw ${zh('自摸')}</small>
          <span>All three opponents pay <b>2 × base</b> each.</span></div>
      </div>
      <h3>Example — 3 Tai (base 8)</h3>
      <table class="simple">
        <tr><th></th><th>Winner</th><th>Shooter</th><th>Other</th><th>Other</th></tr>
        <tr><td>Discard</td><td class="pos">+32</td><td class="neg">−16</td><td class="neg">−8</td><td class="neg">−8</td></tr>
        <tr><td>Self-draw</td><td class="pos">+48</td><td class="neg">−16</td><td class="neg">−16</td><td class="neg">−16</td></tr>
      </table>
      <p class="small muted">Every row adds up to 0: points only move between players, never appear or vanish.</p>
    </section>

    <section class="card" id="g-instant">
      <h2>3. Instant payouts ${zh('即付')} & pay-all ${zh('包赔')}</h2>
      <p>Instant payouts are scored <b>the moment they happen</b>, even if nobody wins the hand. Record them in the <b>Instant payout</b> tab. Each of the 3 opponents pays:</p>
      <table class="simple">
        <tr><th>Event</th><th>Each pays</th><th>Receiver</th></tr>
        <tr><td>Exposed kong ${zh('明杠 / 碰杠')}</td><td>${r.exposedKong}</td><td class="pos">+${r.exposedKong * 3}</td></tr>
        <tr><td>Concealed kong ${zh('暗杠')}</td><td>${r.concealedKong}</td><td class="pos">+${r.concealedKong * 3}</td></tr>
        <tr><td>Complete flower or season set ${zh('一堂花')}</td><td>${r.flowerSet}</td><td class="pos">+${r.flowerSet * 3}</td></tr>
        <tr><td>Matched flower + season pair ${zh('正花正季')}</td><td>${r.flowerPair}</td><td class="pos">+${r.flowerPair * 3}</td></tr>
        <tr><td>Animal pair ${zh('猫鼠 / 鸡蜈蚣')}</td><td>${r.animalPair}</td><td class="pos">+${r.animalPair * 3}</td></tr>
        <tr><td>All four animals ${zh('四动物')}</td><td>${r.animalSet}</td><td class="pos">+${r.animalSet * 3}</td></tr>
        <tr><td colspan="3" class="small muted">Flower pair and animal pair pay double if the player held them from the deal (first 13 tiles).</td></tr>
      </table>
      <h3>Pay-all ${zh('包赔')}</h3>
      <p>If a player feeds a dangerous tile, that player pays <b>${r.baoMultiplier} × base</b> to the winner alone and the other two pay nothing. Tick <b>Pay-all</b> in the Win tab.</p>
      <ul class="steps small">
        <li>Feeding the 8th bonus tile when 7 are already exposed ${zh('打出第八张花')}</li>
        <li>Discarding the 3rd dragon when the winner has 2 dragon pongs exposed ${zh('包大三元')}</li>
        <li>Discarding the 4th wind when the winner has 3 wind pongs exposed ${zh('包大四喜')}</li>
        <li>Feeding a tile that clearly takes a hand to the Tai cap ${zh('包台')}</li>
        <li>Completing a full colour after 3 sets of that suit are exposed ${zh('包清一色')}</li>
        <li>A fresh (never-discarded) tile near the end of the wall that lets someone win ${zh('过水')}</li>
      </ul>
      <p class="small muted">Example: 5 Tai (base ${basePoints(Math.min(5, r.taiCap), r.taiCap)}) pay-all → responsible player −${r.baoMultiplier * basePoints(Math.min(5, r.taiCap), r.taiCap)}, others 0.</p>
    </section>

    <section class="card" id="g-tai">
      <h2>4. Counting Tai</h2>
      <p class="small muted">Values below are your current house rules (<span class="chg">house</span> = changed from the Singapore default). Edit them in ⚙️ Rules.</p>
      ${taiTable('base')}<br>${taiTable('sets')}<br>${taiTable('bonus')}<br>
      ${r.winCircumstance ? taiTable('special') : '<p class="small muted">Special-win Tai (杠上开花, 海底捞月, 抢杠) are switched off in your house rules.</p>'}<br>
      ${taiTable('limit')}
      <p class="small muted">Self-draw gives no extra Tai — the payout doubles instead. ${r.doubleWind === '2x' ? 'A pung of a wind that is both your seat and the prevailing wind counts twice.' : 'A pung of a wind that is both your seat and the prevailing wind counts once.'}</p>
    </section>

    <section class="card" id="g-calc">
      <h2>5. Tai calculator</h2>
      <p class="small muted">Tick what's in the winning hand to get its Tai and ${u}.</p>
      ${calculator()}
    </section>

    <section class="card" id="g-dealer">
      <h2>6. Dealer ${zh('庄家')}</h2>
      ${r.autoDealer ? `<p>The app tracks the dealer automatically. The first player (East) starts as dealer.</p>
      <ul class="steps"><li><b>Dealer wins</b> → stays dealer ${zh('连庄')}.</li><li><b>Someone else wins</b> → the next seat becomes dealer.</li>
      <li><b>Draw hand</b> → ${r.drawRule === 'stay' ? 'dealer stays' : 'dealer moves on'}.</li>
      <li>When the dealer has gone all the way round, the prevailing wind moves on (East → South → West → North).</li></ul>`
      : '<p class="muted">Auto dealer is off in your house rules.</p>'}
      <p class="small muted">Dealer and winds only help with counting wind Tai — they don't change the payout.</p>
    </section>

    <section class="card" id="g-app">
      <h2>7. Using the app</h2>
      <ol class="steps">
        <li><b>Create a table</b> with the 4 players (East → North) and share the link or code.</li>
        <li>When someone <b>kongs</b> or completes a <b>flower set / pair</b>, record it right away in the <b>Instant payout</b> tab.</li>
        <li>When a hand is won: <b>Win</b> → winner → <b>Self-draw</b> or pick the <b>shooter</b> → <b>Tai</b> → (tick <b>Pay-all</b> if it applies) → Record. Use <b>Draw hand</b> when nobody wins.</li>
        <li>Made a mistake? Tap <b>Void</b> in History (it can be restored). Nothing is ever deleted.</li>
        <li>The green bar is the <b>zero-sum audit</b>: all players' ${u} must add up to 0.</li>
        <li><b>Standings</b> ranks this table; <b>🏆 Leaderboard</b> ranks players across all tables. Use the same spelling for names every time.</li>
      </ol>
    </section>

    <p class="small muted center">Default values: <a href="https://sgmahjong.com/scoring.html" target="_blank" rel="noopener">sgmahjong.com</a> · <a href="https://www.singaporemahjong.com/rules/" target="_blank" rel="noopener">singaporemahjong.com</a></p>`;

  const refresh = () => { const out = $app.querySelector('#calcOut'); if (out) out.innerHTML = calcResult(); };
  const rerenderCalc = () => { const box = $app.querySelector('#calc'); if (box) box.outerHTML = calculator(); };
  $app.onclick = (e) => {
    if (!location.hash.startsWith('#/guide')) return;
    const a = e.target.closest('.toc a');
    if (a) { e.preventDefault(); $app.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); return; }
    const st = e.target.closest('[data-step]');
    if (st) {
      const x = TAI_CATALOG.find((i) => i.id === st.dataset.step);
      calc[x.id] = Math.max(0, Math.min(x.max, calc[x.id] + Number(st.dataset.d)));
      rerenderCalc(); return;
    }
    if (e.target.closest('#calcReset')) { resetCalc(); rerenderCalc(); }
  };
  $app.onchange = (e) => {
    if (!location.hash.startsWith('#/guide')) return;
    const t = e.target;
    if (t.name === 'pattern' || t.name === 'colour') { calc[t.name] = t.value; return refresh(); }
    if (t.dataset.calc === 'limit') { calc.limit = t.value; return rerenderCalc(); }
    if (t.dataset.flag) {
      calc[t.dataset.flag] = t.checked;
      if (t.dataset.flag === 'seatWind' || t.dataset.flag === 'roundWind') { if (!(calc.seatWind && calc.roundWind)) calc.doubleSame = false; return rerenderCalc(); }
      return refresh();
    }
  };
}
