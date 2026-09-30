// End-of-game recap: winner, standings, what each player won with, all rounds, highest hand, sharing.
import { buildRecap, recapText, recapCsv, gameNumber, fmtDuration } from './recap-core.js';
import { prefs, unit, zh } from './prefs.js';
import { app } from './data.js';
import { esc, sign, pct, copyText, download, fileStamp, toast, avatar, WIND_ZH, MEDALS, fmtDate } from './ui.js';

let tab = 'standings';

export async function renderRecap($app, code) {
  $app.innerHTML = '<p class="muted center pad">Building recap…</p>';
  const room = await app.store.getRoom(code);
  if (!room) { $app.innerHTML = '<div class="card center">Game not found. <a href="#/">Home</a></div>'; return; }
  let events = [];
  await new Promise((res) => { const un = app.store.watchEvents(code, (evs) => { events = evs; res(); setTimeout(() => un && un(), 0); }); });
  const r = buildRecap(room, events, { ...prefs.rules, ...(room.settings || {}) });
  const u = esc(unit());
  const draw = () => {
    const w = r.winner;
    $app.innerHTML = `
      <section class="recaphead">
        <div class="small">Game recap · ${esc(gameNumber(room))}</div>
        <div class="crown">🏆</div>
        <div class="small">Champion ${zh('雀王')}</div>
        <h1>${esc(w.name)}</h1>
        <div>${w.handle ? `“${esc(w.handle)}” · ` : ''}Final: <b>${w.points} ${u}</b></div>
        <div class="recapstats"><div><small>Rounds</small><b>${r.roundCount}</b></div><div><small>Duration</small><b>${fmtDuration(r.durationMs)}</b></div><div><small>Status</small><b>${esc(r.status)}</b></div></div>
        <div class="small">${esc(room.name || '')}${room.location ? ` · ${esc(room.location)}` : ''} · ${fmtDate(room.createdAt, true)}</div>
      </section>
      <div class="tabs pill">${[['standings', 'Standings & points'], ['won', 'What they won with'], ['rounds', 'All rounds']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <section class="card">${tab === 'standings' ? standings(r, u) : tab === 'won' ? won(r, u) : rounds(r)}</section>
      ${r.highest ? `<section class="card highest"><div class="small muted">Highest hand</div><div class="hh"><span class="big">${r.highest.tai} TAI</span>
        <div><b>${esc(r.highest.name)}</b> · ${esc(r.highest.method)}<div class="small">${esc(r.highest.patterns || 'Tai entered directly')}</div>
        <div class="small muted">Base point ${r.highest.base} · effective ${r.highest.effective} Tai</div></div></div></section>` : ''}
      <section class="card">
        <h2>Send & share the recap</h2>
        <p class="small muted">Includes final points, how many times each player won, and what they won with.</p>
        <div class="sharegrid">
          <button class="btn wa" data-s="wa">💬 Send via WhatsApp</button>
          <button class="btn" data-s="teams">📋 Copy Teams format</button>
          <button class="btn" data-s="text">📄 Copy recap text</button>
          <button class="btn" data-s="csv">⬇ Export CSV</button>
        </div>
      </section>
      <div class="row-gap"><a class="btn primary block" href="#/new">＋ Start a new game</a>${room.status === 'active' ? `<a class="btn block" href="#/t/${esc(code)}">Back to the table</a>` : ''}</div>
      ${r.balanced ? '<p class="small pos center">✓ Zero-sum balanced</p>' : `<p class="small neg center">✗ Not balanced (Σ ${r.total})</p>`}`;
  };
  draw();
  $app.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
    const s = b.dataset.s;
    if (s === 'wa') { window.open('https://wa.me/?text=' + encodeURIComponent(recapText(r, 'whatsapp', unit())), '_blank', 'noopener'); return; }
    if (s === 'teams') return copyText(recapText(r, 'teams', unit()), 'Teams recap copied');
    if (s === 'text') return copyText(recapText(r, 'plain', unit()), 'Recap copied');
    if (s === 'csv') return download(`mahjong-recap-${code}-${fileStamp()}.csv`, recapCsv(r), 'text/csv;charset=utf-8');
    if (b.dataset.row) { const el = $app.querySelector(`#det-${b.dataset.row}`); if (el) el.hidden = !el.hidden; }
  };
  void toast;
}

function standings(r, u) {
  return `<h3>Final standings & wins</h3><p class="small muted">Tap a row for details.</p>
    <ol class="standings">${r.standings.map((p) => `
      <li><button class="strow" data-row="${p.seat}"><span class="medal">${MEDALS[p.rank - 1] || p.rank}</span><span class="wind-badge">${WIND_ZH[p.seat]}</span>
        <span class="stname"><b>${esc(p.name)}</b>${p.handle ? ` <small>(${esc(p.handle)})</small>` : ''}<small>${p.wins}× win (${p.selfDraws} self-draw, ${p.discardWins} discard${p.payAll ? `, ${p.payAll} pay-all` : ''})</small></span>
        <span class="stpts"><b>${p.points} ${u}</b><small class="${p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}">${sign(p.net)} net</small></span></button>
        <div id="det-${p.seat}" class="stdet small" hidden>Shot (discarded a winning tile): ${p.shots} · Kongs: ${p.kongs} · Win rate: ${pct(r.roundCount ? p.wins / r.roundCount : 0)}</div></li>`).join('')}</ol>`;
}

function won(r, u) {
  return `<h3>Win details</h3><p class="small muted">Every win and the patterns it used, per player.</p>
    ${r.standings.map((p) => `<div class="wonblock"><div class="row-between"><span><span class="medal">${MEDALS[p.rank - 1] || p.rank}</span> ${avatar(p.name, 'sm')} <b>${esc(p.name)}</b>${p.handle ? ` <small class="muted">(${esc(p.handle)})</small>` : ''}</span>
      <span class="small">${p.wins}× win · ${pct(r.roundCount ? p.wins / r.roundCount : 0)}</span></div>
      <div class="small muted">${p.selfDraws}× self-draw · ${p.discardWins}× discard${p.payAll ? ` · ${p.payAll}× pay-all` : ''}</div>
      ${p.winsDetail.length ? p.winsDetail.map((w) => `<div class="windet"><div class="row-between"><b>Round ${w.round}</b><span>${w.tai} Tai · <b class="pos">${sign(w.points)} ${u}</b></span></div>
        <div>${esc(w.patterns || 'Tai entered directly')}</div><div class="small muted">${esc(w.method)} · base ${w.base}${w.remarks ? ` · “${esc(w.remarks)}”` : ''}</div></div>`).join('') : '<div class="small muted">No wins this game.</div>'}</div>`).join('')}`;
}

function rounds(r) {
  if (!r.rounds.length) return '<p class="muted">No rounds recorded.</p>';
  return `<h3>All rounds</h3><ul class="roundlist">${r.rounds.map((x) => `<li><span class="rn">R${x.n}</span><span><b>${esc(x.text)}</b>${x.patterns ? `<div class="small muted">${esc(x.patterns)}</div>` : ''}</span><span>${x.tai != null ? `${x.tai} Tai` : '—'}</span></li>`).join('')}</ul>`;
}
