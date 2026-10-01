// In-app notifications: 🔔 bell with unread badge, toast, list sheet, and phone alerts while the app is open.
import { esc, toast, sheet } from './ui.js';

const KEY = 'mjsg-notifications';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 40))); } catch {} };

export function notifications() { return read(); }
export function unreadCount() { return read().filter((n) => !n.read).length; }

export function updateBell() {
  const b = document.getElementById('bellBadge'); if (!b) return;
  const n = unreadCount(); b.textContent = n > 9 ? '9+' : String(n); b.hidden = n === 0;
}

/** notify({ title, body, icon, link, key }) — key de-duplicates (same key is only shown once). */
export function notify({ title, body = '', icon = '🔔', link = '', key = '' }) {
  const list = read();
  if (key && list.some((n) => n.key === key)) return;
  list.unshift({ id: Date.now() + Math.random(), key, title, body, icon, link, at: Date.now(), read: false });
  write(list); updateBell();
  toast(`${icon} ${title}${body ? ' — ' + body : ''}`);
  try { navigator.vibrate?.(80); } catch {}
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, tag: key || undefined }));
      else new Notification(title, { body, tag: key || undefined, icon: 'icon.svg' });
    } catch {}
  }
}

const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };

export function openNotifications() {
  const body = () => {
    const list = read();
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return `${perm === 'default' ? '<div class="banner small">📳 Get a phone alert when the app is in the background. <button class="btn sm" data-perm>Turn on alerts</button></div>' : ''}
      ${perm === 'denied' ? '<p class="small muted">Phone alerts are blocked in your browser settings — you will still see them here.</p>' : ''}
      ${list.length ? `<ul class="nlist">${list.map((n) => `<li class="${n.read ? '' : 'unread'}"><span class="nicon">${n.icon}</span>
        <div><b>${esc(n.title)}</b>${n.body ? `<div class="small">${esc(n.body)}</div>` : ''}<div class="small muted">${ago(n.at)}${n.link ? ` · <a href="${esc(n.link)}" data-close>Open</a>` : ''}</div></div></li>`).join('')}</ul>`
        : '<p class="muted center pad">No notifications yet.<br><small>You will see rule changes, win requests, approvals and host changes here.</small></p>'}`;
  };
  sheet({
    title: '🔔 Notifications', sub: 'Rule changes, requests and game updates', body: body(),
    footer: '<button class="btn block" data-clear>Clear all</button>',
    onMount(api) {
      const list = read().map((n) => ({ ...n, read: true })); write(list); updateBell();
      api.el.addEventListener('click', async (e) => {
        if (e.target.closest('[data-clear]')) { write([]); updateBell(); api.setBody(body()); }
        if (e.target.closest('[data-perm]')) { try { await Notification.requestPermission(); } catch {} api.setBody(body()); }
      });
    },
  });
}
