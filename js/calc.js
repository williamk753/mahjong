// Score tab: standalone Tai & payout calculator using the same pattern picker as "Record win".
import { createPicker } from './picker.js';
import { prefs, zh, unit } from './prefs.js';
import { winDeltas } from './scoring.js';
import { esc, sign, closeSheet } from './ui.js';
import { openWizard } from './wizard.js';

const st = { method: 'self' };

export function renderCalc($app) {
  $app.innerHTML = `
    <div class="pagehead"><h1>🧮 Score calculator</h1><p class="muted">Work out Tai and points for any hand — nothing is saved.</p></div>
    <button class="bigwin" data-help>🧭 Help me count my hand <span>Don't know the patterns? Answer easy questions about your tiles</span></button>
    <h3>Or pick the patterns yourself</h3>
    <section class="card">
      <div class="methods">
        <button type="button" data-m="self" class="${st.method === 'self' ? 'on' : ''}"><b>Self-draw ${zh('自摸')}</b><small>All 3 pay 2×</small></button>
        <button type="button" data-m="discard" class="${st.method === 'discard' ? 'on' : ''}"><b>Discard win ${zh('点炮')}</b><small>Discarder 2×, others 1×</small></button>
        <button type="button" data-m="bao" class="${st.method === 'bao' ? 'on' : ''}"><b>Pay-all ${zh('包赔')}</b><small>Responsible ${prefs.rules.baoMultiplier}×</small></button>
      </div>
      <div id="calcPicker"></div>
    </section>
    <section class="card" id="calcOut"></section>`;
  const out = () => document.getElementById('calcOut');
  const show = (ev) => {
    const el = out(); if (!el) return;
    const u = esc(unit());
    if (!ev.valid) { el.innerHTML = `<h2>Payout</h2><p class="muted">${ev.errors.map(esc).join('<br>') || 'Select patterns'}</p>`; return; }
    const b = ev.base;
    const d = st.method === 'self' ? winDeltas({ winner: 0, selfDraw: true, tai: ev.actual, cap: ev.cap })
      : st.method === 'discard' ? winDeltas({ winner: 0, shooter: 1, tai: ev.actual, cap: ev.cap })
      : winDeltas({ winner: 0, shooter: 1, baoBy: 1, tai: ev.actual, cap: ev.cap, baoMultiplier: prefs.rules.baoMultiplier });
    const labels = st.method === 'self' ? ['Winner', 'Opponent', 'Opponent', 'Opponent'] : st.method === 'discard' ? ['Winner', 'Discarder', 'Other', 'Other'] : ['Winner', 'Responsible', 'Other', 'Other'];
    el.innerHTML = `<h2>Payout</h2>
      <div class="bigres"><div><small>Tai</small><b>${ev.actual}${ev.actual > ev.cap ? ` → ${ev.cap}` : ''}</b></div><div><small>Base</small><b>${b}</b></div><div><small>Winner gets</small><b class="pos">${sign(d[0])} ${u}</b></div></div>
      <div class="settle">${d.map((x, i) => `<div class="row-between"><span>${labels[i]}</span><b class="${x > 0 ? 'pos' : x < 0 ? 'neg' : ''}">${sign(x)}</b></div>`).join('')}</div>`;
  };
  const picker = createPicker(document.getElementById('calcPicker'), {
    rules: () => prefs.rules, context: () => ({ selfDraw: st.method === 'self' }), onChange: show, allowTaiMode: true,
  });
  show(picker.evaluate());
  $app.onclick = (e) => {
    if (e.target.closest('[data-help]')) return openWizard({ mode: 'calc', rules: prefs.rules, onSubmit: () => { closeSheet(); return true; } });
    const b = e.target.closest('[data-m]'); if (!b) return;
    st.method = b.dataset.m;
    $app.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
    picker.refresh();
  };
}
