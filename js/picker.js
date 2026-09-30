// Scoring-pattern picker used by "Record win" and the Score calculator.
// Modes: quick (3 steps) · limit · catalog (everything) · tai (enter Tai directly).
import { TAI_CATALOG, CATEGORIES, taiValue } from './rules.js';
import { evaluateHand, emptySelection, selectionToList, byId, BASE_HANDS, SUITS, LIMITS } from './hand.js';
import { basePoints } from './scoring.js';
import { zh } from './prefs.js';
import { esc } from './ui.js';

const ICON = {
  allChow: '🀁', pingHu: '⭐', allPong: '🀄', sevenPairs: '🀆', halfTerminals: '🀇', chicken: '🐔',
  halfColour: '🀜', fullColour: '🀝', flower: '🌸', season: '🌺', flowerSet: '💐', animal: '🐱', animalPair: '🐱🐭',
  dragonPung: '🀄', seatWind: '🀀', roundWind: '🀁', concealed: '🀫', kong: '🀡', smallDragons: '🐉',
  kongWin: '🌼', lastTile: '🌊', robKong: '🫳',
};
const QUICK_BONUS = ['flower', 'season', 'animal', 'animalPair', 'dragonPung', 'seatWind', 'roundWind', 'concealed', 'kong', 'flowerSet', 'smallDragons', 'kongWin', 'lastTile', 'robKong'];

export function createPicker(root, { rules, context = () => ({}), onChange = () => {}, allowTaiMode = true } = {}) {
  const st = { mode: 'quick', sel: emptySelection(), chowKind: 'allChow', directTai: null };

  const ctx = () => ({ selfDraw: false, sameWind: false, seatNo: null, seatWind: '', roundWind: '', ...context() });
  const evaluate = () => {
    const r = rules();
    if (st.mode === 'tai') {
      const t = st.directTai;
      const valid = t != null && t >= r.minTai;
      return { items: [], actual: t ?? 0, effective: Math.min(t ?? 0, r.taiCap), cap: r.taiCap, base: basePoints(t ?? 0, r.taiCap),
        errors: t == null ? ['Pick the Tai'] : valid ? [] : [`Below the minimum of ${r.minTai} Tai — not a valid win.`], valid };
    }
    return evaluateHand(st.sel, r, ctx());
  };

  const setBase = (id) => { st.sel.base = st.sel.base === id ? null : id; if (st.sel.base) st.sel.limit = null; };
  const setLimit = (id) => { st.sel.limit = st.sel.limit === id ? null : id; if (st.sel.limit) { st.sel.base = null; st.sel.suit = null; } };
  const tai = (id) => taiValue(rules(), id);
  const skip = (x) => x.cat === 'special' && !rules().winCircumstance;

  function bonusLabel(x) {
    const c = ctx();
    if (x.id === 'flower' && c.seatNo) return `Seat flower #${c.seatNo}`;
    if (x.id === 'season' && c.seatNo) return `Seat season #${c.seatNo}`;
    if (x.id === 'seatWind' && c.seatWind) return `Seat wind pong (${c.seatWind})`;
    if (x.id === 'roundWind' && c.roundWind) return `Round wind pong (${c.roundWind})`;
    return x.name;
  }

  function bonusTile(id) {
    const x = byId[id]; if (!x || skip(x)) return '';
    const s = st.sel;
    if (x.input === 'count') {
      const n = s.counts[id] || 0;
      return `<div class="ptile ${n ? 'on' : ''}"><div class="pt-main"><span class="pt-ic">${ICON[id] || '•'}</span><span><b>${esc(bonusLabel(x))}</b> ${zh(x.zh)}<small>+${tai(id)} Tai each</small></span></div>
        <div class="step sm"><button type="button" data-cnt="${id}" data-d="-1" ${n ? '' : 'disabled'} aria-label="less">−</button><span>${n}</span><button type="button" data-cnt="${id}" data-d="1" ${n >= (x.max || 9) ? 'disabled' : ''} aria-label="more">+</button></div></div>`;
    }
    const on = !!s.flags[id];
    const sameNote = id === 'roundWind' && ctx().sameWind ? `<small>same as seat wind · counts ${rules().doubleWind === '2x' ? 'twice' : 'once'}</small>` : '';
    return `<button type="button" class="ptile ${on ? 'on' : ''}" data-flag="${id}"><div class="pt-main"><span class="pt-ic">${ICON[id] || '•'}</span><span><b>${esc(bonusLabel(x))}</b> ${zh(x.zh)}<small>+${tai(id)} Tai</small>${sameNote}</span></div><span class="pt-check">${on ? '✓' : ''}</span></button>`;
  }

  function card(id, onAttr, on, extra = '') {
    const x = byId[id];
    const v = id === 'sevenPairs' && ctx().selfDraw ? tai('sevenPairsSelf') : tai(id);
    return `<button type="button" class="pcard ${on ? 'on' : ''}" ${onAttr}><span class="pt-ic">${ICON[id] || '•'}</span><span class="pc-txt"><b>${esc(x.name)}</b> ${zh(x.zh)}<small>${esc(extra || x.desc)}</small></span><span class="pc-tai">${v} Tai</span></button>`;
  }

  function quick() {
    const s = st.sel;
    const isChow = s.base === 'allChow' || s.base === 'pingHu';
    const shape = isChow ? 'chow' : s.base === 'allPong' ? 'allPong' : s.base === 'sevenPairs' ? 'sevenPairs' : s.base === 'halfTerminals' ? 'halfTerminals' : s.base ? 'other' : 'mixed';
    return `
      <div class="pstep"><div class="pstep-h"><span class="num">1</span> Hand shape <small class="muted">pick one</small></div>
        <div class="pgrid">
          ${card('allChow', 'data-shape="chow"', shape === 'chow', 'All 4 sets are chows (1-2-3)')}
          ${card('allPong', 'data-shape="allPong"', shape === 'allPong', 'All 4 sets are pongs / kongs')}
          ${card('sevenPairs', 'data-shape="sevenPairs"', shape === 'sevenPairs', ctx().selfDraw ? 'Self-draw value' : `7 pairs · ${tai('sevenPairsSelf')} Tai if self-drawn`)}
          ${card('halfTerminals', 'data-shape="halfTerminals"', shape === 'halfTerminals', 'Only 1s, 9s and honours')}
          <button type="button" class="pcard ${shape === 'mixed' && !s.limit ? 'on' : ''}" data-shape="mixed"><span class="pt-ic">🀙</span><span class="pc-txt"><b>Mixed</b><small>Chows & pongs mixed — scores from bonuses</small></span><span class="pc-tai">0 Tai</span></button>
        </div>
        ${isChow ? `<div class="subq"><div class="small muted">Which kind of All Chow?</div><div class="pgrid two">
          ${card('pingHu', 'data-chow="pingHu"', s.base === 'pingHu', 'Pure: zero flowers / animals')}
          ${card('allChow', 'data-chow="allChow"', s.base === 'allChow', 'Has flowers — add them in step 3')}</div></div>` : ''}
      </div>
      <div class="pstep"><div class="pstep-h"><span class="num">2</span> Suits</div>
        <div class="pgrid three">
          <button type="button" class="pcard ${!s.suit ? 'on' : ''}" data-suit=""><span class="pt-ic">🀙</span><span class="pc-txt"><b>Mixed suits</b><small>Characters, dots, bamboo</small></span><span class="pc-tai">+0</span></button>
          ${SUITS.map((x) => card(x.id, `data-suit="${x.id}"`, s.suit === x.id, x.id === 'halfColour' ? 'One suit + honours' : 'One suit only')).join('')}
        </div>
      </div>
      <div class="pstep"><div class="pstep-h"><span class="num">3</span> Bonus tiles on the table <small class="muted">pick any</small></div>
        <div class="ptiles">${QUICK_BONUS.map(bonusTile).join('')}</div>
      </div>`;
  }

  function limitMode() {
    return `<p class="small muted">Fixed & limit hands. Their actual Tai is shown; the effective Tai is capped at ${rules().taiCap}. Bonuses can still be added below.</p>
      <div class="pgrid">${LIMITS.map((x) => card(x.id, `data-limit="${x.id}"`, st.sel.limit === x.id)).join('')}</div>
      <details class="more"><summary>Add bonuses</summary><div class="ptiles">${QUICK_BONUS.map(bonusTile).join('')}</div></details>`;
  }

  function catalog() {
    const groups = Object.entries(CATEGORIES).map(([cat, label]) => {
      const items = TAI_CATALOG.filter((x) => x.cat === cat && x.input !== 'variant' && !skip(x));
      if (!items.length) return '';
      return `<div class="pstep"><div class="pstep-h">${label}${cat === 'base' ? ' <small class="muted">one base hand · suits stack</small>' : cat === 'limit' ? ' <small class="muted">one limit hand · no base hand</small>' : ''}</div>
        <div class="${cat === 'base' || cat === 'limit' ? 'pgrid' : 'ptiles'}">${items.map((x) => {
          if (x.input === 'pattern') return card(x.id, `data-base="${x.id}"`, st.sel.base === x.id);
          if (x.input === 'colour') return card(x.id, `data-suit="${x.id}"`, st.sel.suit === x.id);
          if (x.input === 'limit') return card(x.id, `data-limit="${x.id}"`, st.sel.limit === x.id);
          return bonusTile(x.id);
        }).join('')}</div></div>`;
    });
    return `<input type="search" class="psearch" placeholder="Filter patterns…" data-psearch />${groups.join('')}`;
  }

  function taiMode() {
    const r = rules();
    const max = Math.max(r.taiCap, 5);
    return `<p class="small muted">No pattern breakdown — just enter the total Tai.</p>
      <div class="seg taiseg">${Array.from({ length: max + 1 }, (_, t) => t).filter((t) => t >= r.minTai).map((t) => `
        <button type="button" data-dtai="${t}" class="${st.directTai === t ? 'on' : ''}">${t}${t === r.taiCap ? ` ${zh('满')}` : ''}<span class="sub">${basePoints(t, r.taiCap)}</span></button>`).join('')}</div>`;
  }

  function summary(ev) {
    const r = rules();
    const chips = st.mode === 'tai' ? '' : ev.items.map((i) => `<span class="combo">${esc(i.name)}${i.n > 1 ? ` ×${i.n}` : ''} <b>+${i.tai}</b> <button type="button" data-rm="${i.id}" aria-label="Remove ${esc(i.name)}">✕</button></span>`).join('');
    return `
      ${st.mode !== 'tai' ? `<div class="combos"><div class="small muted">${st.sel.base ? `Base hand: <b>${esc(byId[st.sel.base].name)}</b> · ` : ''}${st.sel.limit ? `Limit hand: <b>${esc(byId[st.sel.limit].name)}</b> · ` : ''}${ev.items.length} pattern${ev.items.length === 1 ? '' : 's'}</div>
        <div class="combo-list">${chips || '<span class="muted small">Nothing selected yet</span>'}</div>
        ${ev.items.length ? '<button type="button" class="btn sm" data-clear>Clear all</button>' : ''}</div>` : ''}
      <div class="breakdown">
        <div><small>Actual Tai</small><b>${ev.actual}</b></div>
        <div><small>Effective Tai</small><b>${ev.effective}<span class="muted">/${r.taiCap}</span></b></div>
        <div><small>Base point</small><b>${ev.base}<span class="muted small"> (2^${ev.effective})</span></b></div>
      </div>
      ${ev.errors.length ? `<div class="perr">${ev.errors.map(esc).join('<br>')}</div>` : ''}`;
  }

  function render() {
    const ev = evaluate();
    const q = root.querySelector('[data-psearch]')?.value || '';
    root.innerHTML = `
      <div class="pmodes">
        ${[['quick', '⚡ Quick', '3 steps'], ['limit', '🏮 Limit', 'special'], ['catalog', '📚 Catalog', 'all'], ...(allowTaiMode ? [['tai', '🔢 Tai only', 'direct']] : [])]
          .map(([k, l, s]) => `<button type="button" data-mode="${k}" class="${st.mode === k ? 'on' : ''}">${l}<small>${s}</small></button>`).join('')}
      </div>
      <div class="pbody">${st.mode === 'quick' ? quick() : st.mode === 'limit' ? limitMode() : st.mode === 'catalog' ? catalog() : taiMode()}</div>
      <div class="psummary">${summary(ev)}</div>`;
    if (q) { const s = root.querySelector('[data-psearch]'); if (s) { s.value = q; filter(q); } }
    onChange(ev);
  }

  function filter(q) {
    const t = q.trim().toLowerCase();
    root.querySelectorAll('.pbody .pcard, .pbody .ptile').forEach((el) => { el.hidden = t && !el.textContent.toLowerCase().includes(t); });
  }

  root.addEventListener('input', (e) => { if (e.target.matches('[data-psearch]')) filter(e.target.value); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    const s = st.sel; const d = b.dataset;
    if (d.mode) { st.mode = d.mode; return render(); }
    if (d.shape) {
      if (d.shape === 'mixed') { s.base = null; s.limit = null; }
      else if (d.shape === 'chow') { s.base = s.base === 'pingHu' || s.base === 'allChow' ? s.base : st.chowKind; s.limit = null; }
      else setBase(d.shape);
      return render();
    }
    if (d.chow) { st.chowKind = d.chow; s.base = d.chow; if (d.chow === 'pingHu') { s.flags.flower = false; s.flags.season = false; s.counts.animal = 0; s.counts.animalPair = 0; s.counts.flowerSet = 0; } return render(); }
    if (d.base) { setBase(d.base); return render(); }
    if (d.suit !== undefined) { s.suit = d.suit || null; if (s.suit) s.limit = null; return render(); }
    if (d.limit) { setLimit(d.limit); return render(); }
    if (d.flag) { s.flags[d.flag] = !s.flags[d.flag]; return render(); }
    if (d.cnt) { const x = byId[d.cnt]; s.counts[d.cnt] = Math.max(0, Math.min(x.max || 9, (s.counts[d.cnt] || 0) + Number(d.d))); return render(); }
    if (d.dtai) { st.directTai = Number(d.dtai); return render(); }
    if (d.rm) {
      const id = d.rm === 'sevenPairsSelf' ? 'sevenPairs' : d.rm;
      if (s.base === id) s.base = null; else if (s.suit === id) s.suit = null; else if (s.limit === id) s.limit = null;
      else if (s.flags[id]) s.flags[id] = false; else if (s.counts[id]) s.counts[id] = 0;
      return render();
    }
    if (d.clear !== undefined) { st.sel = emptySelection(); return render(); }
  });

  render();
  return {
    evaluate,
    refresh: render,
    reset() { st.sel = emptySelection(); st.directTai = null; st.mode = 'quick'; render(); },
    result() {
      const ev = evaluate();
      return { ...ev, tai: ev.actual, patterns: st.mode === 'tai' ? null : selectionToList(st.sel).map((x) => (x.id === 'sevenPairs' && ctx().selfDraw ? { id: 'sevenPairsSelf', n: 1 } : x)) };
    },
    setSelection(sel) { st.sel = { ...emptySelection(), ...sel }; st.mode = 'quick'; render(); },
    setDirectTai(t) { st.mode = 'tai'; st.directTai = t; render(); },
  };
}
