// House rules / customisation page.
import { TAI_CATALOG, CATEGORIES, HOUSE_DEFAULTS, SCORE_LABELS, CAP_OPTIONS, NO_CAP, AI_MODELS, mergeRules, taiValue } from './rules.js';
import { prefs, zh, saveRules, setShowZh } from './prefs.js';
import { ruleSets, ruleSet, saveRuleSet, onRuleSets, DEFAULT_ID, GAME_KEYS } from './rulesets.js';
import { confirmBox, toast } from './ui.js';
import { basePoints } from './scoring.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ui = { q: '', cat: 'all', set: DEFAULT_ID };
let draft = null; // editing copy of a non-default rule set: { id, name, rules }
const isDefault = () => ui.set === DEFAULT_ID;
const cur = () => (isDefault() ? prefs.rules : draft.rules);
function loadDraft() {
  if (isDefault()) { draft = null; return; }
  const s = ruleSets().find((x) => x.id === ui.set);
  if (!s) { ui.set = DEFAULT_ID; draft = null; return; }
  draft = { id: s.id, name: s.name, rules: JSON.parse(JSON.stringify(s.rules)) };
}
let saveTimer = null;

const row = (title, desc, control) => `
  <div class="setrow"><div><b>${title}</b>${desc ? `<div class="muted small">${desc}</div>` : ''}</div><div class="ctl">${control}</div></div>`;
const toggle = (key, on) => `<label class="switch"><input type="checkbox" data-rule="${key}" ${on ? 'checked' : ''}/><span></span></label>`;
const sel = (key, opts, val) => `<select data-rule="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const stepper = (attr, id, val, min = 0) => `
  <div class="step"><button type="button" ${attr}="${id}" data-d="-1" ${val <= min ? 'disabled' : ''} aria-label="less">−</button><span>${val}</span><button type="button" ${attr}="${id}" data-d="1" aria-label="more">+</button></div>`;

function taiList() {
  const r = cur();
  const q = ui.q.trim().toLowerCase();
  const items = TAI_CATALOG.filter((x) => (ui.cat === 'all' || x.cat === ui.cat)
    && (!q || `${x.name} ${x.zh} ${x.desc} ${CATEGORIES[x.cat]}`.toLowerCase().includes(q)));
  if (!items.length) return '<p class="muted center">No pattern matches your search.</p>';
  return items.map((x) => {
    const v = taiValue(r, x.id);
    const changed = v !== x.def;
    const eff = Math.min(v, r.taiCap);
    const off = x.cat === 'special' && !r.winCircumstance;
    return `
      <div class="taiitem ${changed ? 'changed' : ''} ${off ? 'off' : ''}">
        <div class="tinfo"><div><b>${esc(x.name)}</b> ${zh(x.zh)}</div>
          <div class="muted small">Default: ${x.def} Tai${x.input === 'limit' ? ' · <span class="ltag">LIMIT</span>' : ''}${eff < v ? ` · effective ${eff} Tai (cap)` : ''}${changed ? ' · <span class="chg">changed</span>' : ''}${off ? ' · disabled by Win-circumstance setting' : ''}</div>
          <div class="small tdesc">${esc(x.desc)}</div></div>
        <div class="ctl">${stepper('data-tai', x.id, v)}</div>
      </div>`;
  }).join('');
}

function page(store) {
  const r = cur();
  const sets = ruleSets();
  return `
    <div class="tablehead"><div><h1>⚙️ Rule sets</h1>
      <span class="muted small">${store?.mode === 'cloud' ? 'Shared with all players · pick one when you create a game' : 'Demo mode · saved on this device'}</span></div>
      <span id="saveState" class="badge2"></span></div>
    <div class="chips2 rsets">${sets.map((x) => `<button type="button" data-set="${esc(x.id)}" class="${ui.set === x.id ? 'on' : ''}">${x.builtIn ? '⭐ ' : ''}${esc(x.name)}</button>`).join('')}
      <button type="button" data-newset class="add">＋ New rule set</button></div>
    ${isDefault() ? `<p class="small muted">⭐ <b>Default</b> is used when nobody picks another set. It also holds the app-wide options at the bottom.</p>`
      : `<section class="card"><label class="field"><span>Rule set name</span><input type="text" id="setName" maxlength="30" value="${esc(draft.name)}" /></label>
        <div class="row-between"><span class="small muted">Games already started keep the rules they were created with.</span><button type="button" class="btn sm danger" id="delSet">Delete set</button></div></section>`}

    <section class="card">
      <h2>🛡️ Win threshold & Tai cap</h2>
      ${row('Minimum Tai to win', 'Hands below this cannot be recorded as a win.',
        sel('minTai', Array.from({ length: Math.min(5, r.taiCap) + 1 }, (_, t) => [t, `${t} Tai${t === HOUSE_DEFAULTS.minTai ? ' (default)' : ''}`]), r.minTai))}
      ${row('Tai cap (max effective Tai)', 'Base points = 2<sup>Tai</sup>, stops growing at the cap.',
        sel('taiCap', CAP_OPTIONS.map((c) => [c, c === NO_CAP ? 'No cap (unlimited)' : `${c} Tai (base ${basePoints(c, c)} pts${c === HOUSE_DEFAULTS.taiCap ? ' · standard' : ''})`]), CAP_OPTIONS.includes(r.taiCap) ? r.taiCap : HOUSE_DEFAULTS.taiCap))}
      ${row('Win-circumstance Tai (+1)', `Kong replacement ${zh('杠上开花')}, last tile ${zh('海底捞月')}, robbing the kong ${zh('抢杠')}.`, toggle('winCircumstance', r.winCircumstance))}
      ${row('Seat wind = prevailing wind', 'When your seat wind is also the round wind, a pung of it counts…',
        sel('doubleWind', [['1x', 'Once (+1 Tai, default)'], ['2x', 'Twice (+2 Tai)']], r.doubleWind))}
      ${isDefault() ? row('Score label', 'Text shown next to scores.',
        sel('scoreLabel', Object.entries(SCORE_LABELS), r.scoreLabel)) : ''}
    </section>

    <section class="card">
      <h2>🀄 Dealer rotation</h2>
      ${row(`Auto dealer <span class="tag">Smart</span>`, `Dealer wins → stays ${zh('连庄')}. Another player wins → dealer moves to the next seat. Shows dealer, seat winds and round on the table.`, toggle('autoDealer', r.autoDealer))}
      ${row('Draw hand (wall runs out)', 'Does the dealer move when nobody wins?',
        sel('drawRule', [['stay', 'Dealer stays (连庄, default)'], ['rotate', 'Dealer moves on']], r.drawRule))}
    </section>

    <section class="card">
      <h2>⚡ Instant payouts ${zh('即付')}</h2>
      <p class="muted small">Paid the moment they happen. Each of the 3 opponents pays this amount to the receiver.</p>
      ${row(`Exposed kong ${zh('明杠 / 碰杠')}`, `Receiver gets ${r.exposedKong * 3}`, stepper('data-num', 'exposedKong', r.exposedKong))}
      ${row(`Concealed kong ${zh('暗杠')}`, `Receiver gets ${r.concealedKong * 3}`, stepper('data-num', 'concealedKong', r.concealedKong))}
      ${row(`Complete flower / season set ${zh('一堂花')}`, `All 4 flowers or all 4 seasons · receiver gets ${r.flowerSet * 3}`, stepper('data-num', 'flowerSet', r.flowerSet))}
      ${row(`Matched flower + season pair ${zh('正花正季')}`, `Your seat's flower and season · receiver gets ${r.flowerPair * 3} (×2 if held from the deal)`, stepper('data-num', 'flowerPair', r.flowerPair))}
      ${row(`Animal pair ${zh('猫鼠 / 鸡蜈蚣')}`, `Cat + mouse or rooster + centipede · receiver gets ${r.animalPair * 3} (×2 if held from the deal)`, stepper('data-num', 'animalPair', r.animalPair))}
      ${row(`All four animals ${zh('四动物')}`, `Receiver gets ${r.animalSet * 3}`, stepper('data-num', 'animalSet', r.animalSet))}
    </section>

    <section class="card">
      <h2>⚠️ Pay-all ${zh('包赔')}</h2>
      ${row('Responsible player pays', `When a player feeds a dangerous tile (3rd dragon, 4th wind, 8th flower, a tile reaching the cap, an exposed full colour, a fresh tile in the final wall), they pay <b>${r.baoMultiplier} × base</b> alone and the other two pay 0.`,
        stepper('data-num', 'baoMultiplier', r.baoMultiplier, 1) + '<div class="muted small center">× base</div>')}
      ${row('Final-wall threshold', `Fresh-tile pay-all window: applies when ${r.finalWallStacks} stacks or fewer remain in the wall ${zh('过水 / 底牌')}.`,
        stepper('data-num', 'finalWallStacks', r.finalWallStacks) + '<div class="muted small center">stacks</div>')}
    </section>

    <section class="card">
      <h2>🎛️ Tai per pattern (house rule Tai)</h2>
      <p class="muted small">Change how many Tai each pattern or set is worth. Used by the guide and Tai calculator.</p>
      <input type="search" id="taiSearch" placeholder="Search pattern (e.g. Pong, Seven Pairs, Dragon, Flower)…" value="${esc(ui.q)}" />
      <div class="chips2">${[['all', 'All'], ...Object.entries(CATEGORIES)].map(([k, l]) => `<button type="button" data-cat="${k}" class="${ui.cat === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="taiList">${taiList()}</div>
    </section>

    ${isDefault() ? `<section class="card">
      <h2>📷 AI hand scan (Gemini)</h2>
      ${row('Photo scan in Record win & Score', 'Take a photo of the winning hand; Google Gemini reads the tiles and fills in the patterns for you to check. Needs cloud mode and Firebase AI Logic switched on.', toggle('aiScan', r.aiScan))}
      ${row('Gemini model', 'Change only if a model stops working or is too slow.',
        sel('aiModel', [...Object.entries(AI_MODELS), ...(AI_MODELS[r.aiModel] ? [] : [[r.aiModel, r.aiModel]])], r.aiModel))}
      <p class="small">🧪 Testing a free alternative that runs on the phone: <a href="#/detector">📷 Tile detector (beta)</a></p>
    </section>

    <section class="card">
      <h2>Display</h2>
      ${row('Show Chinese characters', `Show ${zh('平胡, 对对胡, 清一色')} etc. next to English names. (This device only)`,
        `<label class="switch"><input type="checkbox" id="showZh" ${prefs.showZh ? 'checked' : ''}/><span></span></label>`)}
    </section>` : ''}

    <p class="small muted center">New tables use these rules. To update a game already in play: open it → <b>Table rules</b> → <b>Apply current house rules</b>.</p>
    <button type="button" class="btn block" id="resetAll">↺ Reset all rules to defaults</button>`;
}

export function renderSettings($app, store) {
  const status = (t, cls = '') => { const el = $app.querySelector('#saveState'); if (el) { el.textContent = t; el.className = 'badge2 ' + cls; } };
  const commit = (rerender = 'page') => {
    if (isDefault()) prefs.rules = mergeRules(prefs.rules); else draft.rules = mergeRules(draft.rules);
    if (rerender === 'page') draw(); else if (rerender === 'list') $app.querySelector('#taiList').innerHTML = taiList();
    status('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        if (isDefault()) await saveRules(store, prefs.rules);
        else await saveRuleSet(store, draft.id, draft.name, draft.rules);
        status('Saved ✓', 'ok');
      }
      catch (err) { console.error(err); status('Not saved: ' + (err.code || err.message), 'bad'); }
    }, 400);
  };
  const draw = () => { const y = window.scrollY; $app.innerHTML = page(store); window.scrollTo(0, y); };
  loadDraft(); draw();
  const off = onRuleSets(() => { if (!location.hash.startsWith('#/settings')) return off(); if (!draft) draw(); });

  $app.onchange = (e) => {
    if (!location.hash.startsWith('#/settings')) return;
    const t = e.target;
    if (t.id === 'showZh') return setShowZh(t.checked);
    const k = t.dataset.rule; if (!k) return;
    cur()[k] = t.type === 'checkbox' ? t.checked : (['minTai', 'taiCap'].includes(k) ? Number(t.value) : t.value);
    commit('page');
  };
  $app.oninput = (e) => {
    if (e.target.id === 'setName' && draft) { draft.name = e.target.value; return commit('none'); }
    if (e.target.id !== 'taiSearch') return;
    ui.q = e.target.value; $app.querySelector('#taiList').innerHTML = taiList();
  };
  $app.onclick = (e) => {
    if (!location.hash.startsWith('#/settings')) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.set) { clearTimeout(saveTimer); ui.set = b.dataset.set; loadDraft(); return draw(); }
    if (b.dataset.newset !== undefined) {
      (async () => {
        try {
          const n = ruleSets().length; const base = JSON.parse(JSON.stringify(cur()));
          const id = await saveRuleSet(store, null, `My rules ${n}`, base);
          ui.set = id; draft = { id, name: `My rules ${n}`, rules: mergeRules(base) }; draw();
          toast('New rule set created — copied from the one you were viewing'); $app.querySelector('#setName')?.select();
        } catch (err) { toast('Could not create: ' + (err.code || err.message)); }
      })(); return;
    }
    if (b.id === 'delSet') {
      (async () => {
        if (!await confirmBox({ title: `Delete “${esc(draft.name)}”?`, text: 'Games that already use it keep their rules. New games can no longer pick it.', ok: 'Delete', danger: true })) return;
        await store.deleteRuleSet(draft.id); ui.set = DEFAULT_ID; loadDraft(); draw(); toast('Rule set deleted');
      })(); return;
    }
    if (b.dataset.cat) { ui.cat = b.dataset.cat; $app.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); $app.querySelector('#taiList').innerHTML = taiList(); return; }
    if (b.dataset.tai) {
      const id = b.dataset.tai; const v = Math.max(0, Math.min(13, taiValue(cur(), id) + Number(b.dataset.d)));
      cur().tai = { ...cur().tai, [id]: v }; return commit('list');
    }
    if (b.dataset.num) {
      const k = b.dataset.num; cur()[k] = Math.max(k === 'baoMultiplier' ? 1 : 0, (cur()[k] || 0) + Number(b.dataset.d)); return commit('page');
    }
    if (b.id === 'resetAll') {
      if (!confirm('Reset all house rules to the Singapore defaults?')) return;
      if (isDefault()) prefs.rules = mergeRules({ ...prefs.rules, ...Object.fromEntries(GAME_KEYS.map((k) => [k, HOUSE_DEFAULTS[k]])), tai: {} });
      else draft.rules = mergeRules({ ...draft.rules, ...Object.fromEntries(GAME_KEYS.map((k) => [k, HOUSE_DEFAULTS[k]])), tai: {} });
      ui.q = ''; ui.cat = 'all'; commit('page');
    }
  };
}
