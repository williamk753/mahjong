// Shared UI helpers: escaping, toasts, bottom-sheet modals, confirm dialogs, clipboard, downloads.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const sign = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}`;
export const pct = (x) => `${Math.round(x * 100)}%`;
export const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const WIND_EN = ['East', 'South', 'West', 'North'];
export const WIND_ZH = ['東', '南', '西', '北'];
export const FLOWER = ['梅 Plum', '兰 Orchid', '菊 Chrysanthemum', '竹 Bamboo'];
export const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

export function avatar(name, size = '') {
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avatar ${size}" style="--h:${h}">${esc(initials(name))}</span>`;
}

export function fmtDate(ts, withTime = false) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2400);
}

/* ---------- bottom-sheet modal ---------- */
let openSheet = null;
export function sheet({ title, sub = '', body, footer = '', onMount, onClose, wide = false }) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><div><h2>${title}</h2>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="sheet-body"></div>
      <div class="sheet-foot"></div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const api = {
    el: wrap,
    body: wrap.querySelector('.sheet-body'),
    foot: wrap.querySelector('.sheet-foot'),
    setBody(html) { api.body.innerHTML = html; },
    setFoot(html) { api.foot.innerHTML = html; api.foot.hidden = !html; },
    close: () => closeSheet(),
    onClose,
  };
  api.setBody(body || ''); api.setFoot(footer);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeSheet(); });
  openSheet = api;
  onMount?.(api);
  return api;
}
export function closeSheet() {
  if (!openSheet) return;
  const s = openSheet; openSheet = null;
  s.el.remove(); document.body.classList.remove('no-scroll');
  s.onClose?.();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheet) closeSheet(); });

/** Promise-based confirm dialog (no browser alerts). */
export function confirmBox({ title, text = '', ok = 'Confirm', danger = false, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true"><h3>${title}</h3>${text ? `<p class="muted">${text}</p>` : ''}
      <div class="dialog-actions"><button class="btn" data-a="0">${cancel}</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-a="1">${ok}</button></div></div>`;
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) done(b.dataset.a === '1'); else if (e.target === wrap) done(false); });
    wrap.querySelector('[data-a="1"]').focus();
  });
}

export async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); toast(ok ? label : 'Copy failed — select and copy manually'); return ok;
  }
}

export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Downloaded ' + name);
}

export const fileStamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
