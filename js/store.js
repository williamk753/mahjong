// Storage adapters: Firebase Firestore (shared, realtime) or localStorage (demo, this device only).
// Data model
//   players/{id}                 { name, handle, createdAt }
//   rooms/{code}                 game: { name, players[4], playerIds[4], handles[4], settings, status, location, notes,
//                                        scorekeeper, startingScore, createdAt, finishedAt }
//   rooms/{code}/events/{id}     { type, deltas[4], voided, createdAt, ... }
//   settings/house               shared house rules
import { firebaseConfig } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/12.19.0';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(len = 6) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
export const newId = (prefix = '') => prefix + randomCode(12).toLowerCase();

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'REPLACE_ME';

const ROOM_EDITABLE = ['settings', 'status', 'finishedAt', 'location', 'notes', 'scorekeeper', 'hostUid', 'hostName', 'lastChange', 'startedAt', 'hasPin'];

/* ---------------- Firebase ---------------- */
async function createFirebaseStore() {
  const [{ initializeApp }, fs, auth] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-firestore.js`),
    import(`${FB}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  // App Check: only when a reCAPTCHA v3 site key is set in js/config.js (needed if App Check is enforced for AI Logic).
  if (firebaseConfig.appCheckSiteKey) {
    try {
      const ac = await import(`${FB}/firebase-app-check.js`);
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(firebaseConfig.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (err) { console.warn('App Check not started', err); }
  }
  const db = fs.getFirestore(app);
  const a = auth.getAuth(app);
  await auth.signInAnonymously(a);
  const uid = () => a.currentUser?.uid || null;

  const roomRef = (code) => fs.doc(db, 'rooms', code);
  const eventsCol = (code) => fs.collection(db, 'rooms', code, 'events');

  return {
    mode: 'cloud',
    uid,
    /* ---- members (who is in the room, which seat) ---- */
    async joinRoom(code, m) { await fs.setDoc(fs.doc(db, 'rooms', code, 'members', uid()), { ...m, uid: uid(), at: Date.now() }, { merge: true }); },
    watchMembers(code, cb) { return fs.onSnapshot(fs.collection(db, 'rooms', code, 'members'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))); },
    /* ---- player requests (win claims, payouts) ---- */
    async addRequest(code, r) { const ref = await fs.addDoc(fs.collection(db, 'rooms', code, 'requests'), { ...r, byUid: uid(), status: 'pending', createdAt: Date.now() }); return ref.id; },
    watchRequests(code, cb) { return fs.onSnapshot(fs.query(fs.collection(db, 'rooms', code, 'requests'), fs.orderBy('createdAt', 'asc')), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))); },
    async updateRequest(code, id, patch) { await fs.updateDoc(fs.doc(db, 'rooms', code, 'requests', id), { ...patch, decidedAt: Date.now() }); },
    /* ---- host PIN: stored where nobody can read it; Firestore rules compare it on claim ---- */
    async setHostPin(code, pin) { await fs.setDoc(fs.doc(db, 'rooms', code, 'secret', 'pin'), { pin: String(pin) }); },
    async claimHost(code, pin, name) {
      await fs.setDoc(fs.doc(db, 'rooms', code, 'claims', uid()), { pin: String(pin), at: Date.now() });
      await fs.updateDoc(roomRef(code), { hostUid: uid(), hostName: name || 'Host' });
    },
    /* ---- extra rule sets ---- */
    watchRuleSets(cb) { return fs.onSnapshot(fs.collection(db, 'ruleSets'), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))); },
    async saveRuleSet(id, data) {
      if (!id) { const ref = await fs.addDoc(fs.collection(db, 'ruleSets'), { ...data, createdAt: Date.now(), updatedAt: Date.now(), by: uid() }); return ref.id; }
      await fs.setDoc(fs.doc(db, 'ruleSets', id), { ...data, lastChange: data.lastChange ? { ...data.lastChange, byUid: uid() } : null, updatedAt: Date.now(), by: uid() }, { merge: true }); return id;
    },
    async deleteRuleSet(id) { await fs.deleteDoc(fs.doc(db, 'ruleSets', id)); },
    watchHouseRules(cb) { return fs.onSnapshot(fs.doc(db, 'settings', 'house'), (s) => s.exists() && cb(s.data())); },
    // Gemini via Firebase AI Logic (Gemini Developer API backend). Loaded only when first used.
    async generate(modelName, parts, generationConfig = {}) {
      const m = await import(`${FB}/firebase-ai.js`);
      const ai = m.getAI(app, { backend: new m.GoogleAIBackend() });
      const model = m.getGenerativeModel(ai, { model: modelName, generationConfig });
      const res = await model.generateContent(parts);
      return res.response.text();
    },
    async createRoom(data) {
      for (let i = 0; i < 5; i++) {
        const code = randomCode();
        const snap = await fs.getDoc(roomRef(code));
        if (snap.exists()) continue;
        await fs.setDoc(roomRef(code), { status: 'active', ...data, createdAt: Date.now(), createdBy: uid(), hostUid: uid() });
        return code;
      }
      throw new Error('Could not allocate a game code, try again');
    },
    async getRoom(code) {
      const snap = await fs.getDoc(roomRef(code));
      return snap.exists() ? { code, ...snap.data() } : null;
    },
    watchRoom(code, cb, onErr) {
      return fs.onSnapshot(roomRef(code), (s) => s.exists() && cb({ code, ...s.data() }), onErr);
    },
    watchEvents(code, cb, onErr) {
      const q = fs.query(eventsCol(code), fs.orderBy('createdAt', 'asc'));
      return fs.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), onErr);
    },
    async addEvent(code, ev) {
      const ref = await fs.addDoc(eventsCol(code), { ...ev, voided: false, createdAt: ev.createdAt || Date.now(), by: uid() });
      return ref.id;
    },
    async setVoided(code, id, voided, extra = {}) {
      await fs.updateDoc(fs.doc(db, 'rooms', code, 'events', id), { voided, voidedAt: Date.now(), ...extra });
    },
    async updateRoom(code, patch) {
      const p = Object.fromEntries(Object.entries(patch).filter(([k]) => ROOM_EDITABLE.includes(k)));
      await fs.updateDoc(roomRef(code), p);
    },
    async updateRoomSettings(code, settings) { await fs.updateDoc(roomRef(code), { settings }); },
    async listPlayers() {
      const s = await fs.getDocs(fs.collection(db, 'players'));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async savePlayer(p) {
      const id = p.id || newId('p_');
      const { id: _, ...data } = p;
      await fs.setDoc(fs.doc(db, 'players', id), { createdAt: Date.now(), ...data, updatedAt: Date.now() }, { merge: true });
      return id;
    },
    async loadAll() {
      const [rs, es, ps] = await Promise.all([
        fs.getDocs(fs.collection(db, 'rooms')),
        fs.getDocs(fs.collectionGroup(db, 'events')),
        fs.getDocs(fs.collection(db, 'players')),
      ]);
      const rooms = rs.docs.map((d) => ({ code: d.id, ...d.data() }));
      const eventsByRoom = {};
      es.docs.forEach((d) => {
        const code = d.ref.parent.parent?.id;
        if (!code) return;
        (eventsByRoom[code] ||= []).push({ id: d.id, ...d.data() });
      });
      Object.values(eventsByRoom).forEach((l) => l.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)));
      const players = ps.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { rooms, eventsByRoom, players };
    },
    async importAll(data) {
      // Merge import: writes players, rooms and events with their original ids (existing ids are skipped).
      let n = 0;
      for (const p of data.players || []) { const { id, ...rest } = p; await fs.setDoc(fs.doc(db, 'players', id), rest, { merge: true }); n++; }
      for (const r of data.rooms || []) {
        const { code, ...rest } = r;
        const snap = await fs.getDoc(roomRef(code));
        if (snap.exists()) continue;
        await fs.setDoc(roomRef(code), { ...rest, hostUid: uid() }); n++;
        let batch = fs.writeBatch(db); let k = 0;
        for (const ev of (data.eventsByRoom?.[code] || [])) {
          const { id, ...e } = ev;
          batch.set(fs.doc(db, 'rooms', code, 'events', id || newId('e_')), { ...e, voided: !!e.voided });
          if (++k % 400 === 0) { await batch.commit(); batch = fs.writeBatch(db); }
          n++;
        }
        await batch.commit();
      }
      return n;
    },
    async getHouseRules() {
      const snap = await fs.getDoc(fs.doc(db, 'settings', 'house'));
      return snap.exists() ? snap.data() : null;
    },
    async saveHouseRules(rules) {
      await fs.setDoc(fs.doc(db, 'settings', 'house'), { ...rules, updatedAt: Date.now(), by: uid(), lastChange: rules.lastChange ? { ...rules.lastChange, byUid: uid() } : null });
    },
  };
}

/* ---------------- Local demo ---------------- */
function createLocalStore() {
  const KEY = 'mjsg-demo-db';
  const blank = () => ({ rooms: {}, players: {} });
  const load = () => { try { return { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return blank(); } };
  const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
  const watch = (fn) => { listeners.add(fn); fn(); return () => listeners.delete(fn); };

  return {
    mode: 'demo',
    // Demo: one identity per browser tab, so two tabs can play host + player on one computer.
    uid: () => { try { let id = sessionStorage.getItem('mjsg-demo-uid'); if (!id) { id = newId('u_'); sessionStorage.setItem('mjsg-demo-uid', id); } return id; } catch { return 'u_local'; } },
    async joinRoom(code, m) { const db = load(); const r = db.rooms[code]; r.members = { ...(r.members || {}), [this.uid()]: { ...(r.members?.[this.uid()] || {}), ...m, uid: this.uid(), at: Date.now() } }; save(db); notify(); },
    watchMembers(code, cb) { return watch(() => cb(Object.entries(load().rooms[code]?.members || {}).map(([id, m]) => ({ id, ...m })))); },
    async addRequest(code, r) { const db = load(); const id = newId('r_'); const rm = db.rooms[code]; rm.requests = [...(rm.requests || []), { ...r, id, byUid: this.uid(), status: 'pending', createdAt: Date.now() }]; save(db); notify(); return id; },
    watchRequests(code, cb) { return watch(() => cb([...(load().rooms[code]?.requests || [])])); },
    async updateRequest(code, id, patch) { const db = load(); const q = (db.rooms[code].requests || []).find((x) => x.id === id); if (q) Object.assign(q, patch, { decidedAt: Date.now() }); save(db); notify(); },
    async setHostPin(code, pin) { const db = load(); db.rooms[code].secretPin = String(pin); save(db); },
    async claimHost(code, pin, name) {
      const db = load(); const r = db.rooms[code];
      if (r.secretPin == null || String(pin) !== r.secretPin) { const e = new Error('Wrong PIN'); e.code = 'permission-denied'; throw e; }
      r.room.hostUid = this.uid(); r.room.hostName = name || 'Host'; save(db); notify();
    },
    watchRuleSets(cb) {
      const get = () => { try { return Object.entries(JSON.parse(localStorage.getItem('mjsg-demo-rulesets')) || {}).map(([id, x]) => ({ id, ...x })); } catch { return []; } };
      window.addEventListener('storage', (e) => { if (e.key === 'mjsg-demo-rulesets') cb(get()); });
      this._rsCb = () => cb(get()); cb(get()); return () => {};
    },
    async saveRuleSet(id, data) {
      let all = {}; try { all = JSON.parse(localStorage.getItem('mjsg-demo-rulesets')) || {}; } catch {}
      const key = id || newId('rs_');
      all[key] = { createdAt: Date.now(), ...(all[key] || {}), ...data, lastChange: data.lastChange ? { ...data.lastChange, byUid: this.uid() } : (all[key]?.lastChange || null), updatedAt: Date.now() };
      localStorage.setItem('mjsg-demo-rulesets', JSON.stringify(all)); this._rsCb?.(); return key;
    },
    async deleteRuleSet(id) { let all = {}; try { all = JSON.parse(localStorage.getItem('mjsg-demo-rulesets')) || {}; } catch {} delete all[id]; localStorage.setItem('mjsg-demo-rulesets', JSON.stringify(all)); this._rsCb?.(); },
    watchHouseRules(cb) { const h = () => { try { const x = JSON.parse(localStorage.getItem('mjsg-demo-house')); if (x) cb(x); } catch {} }; window.addEventListener('storage', (e) => { if (e.key === 'mjsg-demo-house') h(); }); return () => {}; },
    async createRoom(data) {
      const db = load();
      let code; do { code = randomCode(); } while (db.rooms[code]);
      db.rooms[code] = { room: { status: 'active', ...data, createdAt: Date.now(), hostUid: this.uid() }, events: [] };
      save(db); notify();
      return code;
    },
    async getRoom(code) {
      const r = load().rooms[code];
      return r ? { code, ...r.room } : null;
    },
    watchRoom(code, cb) { return watch(() => { const r = load().rooms[code]; if (r) cb({ code, ...r.room }); }); },
    watchEvents(code, cb) { return watch(() => cb([...(load().rooms[code]?.events || [])])); },
    async addEvent(code, ev) {
      const db = load(); const id = newId('e_');
      db.rooms[code].events.push({ ...ev, id, voided: false, createdAt: ev.createdAt || Date.now() });
      db.rooms[code].events.sort((x, y) => x.createdAt - y.createdAt);
      save(db); notify();
      return id;
    },
    async setVoided(code, id, voided, extra = {}) {
      const db = load();
      const e = db.rooms[code].events.find((x) => x.id === id);
      if (e) Object.assign(e, { voided, voidedAt: Date.now(), ...extra });
      save(db); notify();
    },
    async updateRoom(code, patch) {
      const db = load();
      for (const [k, v] of Object.entries(patch)) if (ROOM_EDITABLE.includes(k)) db.rooms[code].room[k] = v;
      save(db); notify();
    },
    async updateRoomSettings(code, settings) { return this.updateRoom(code, { settings }); },
    async listPlayers() { return Object.entries(load().players).map(([id, p]) => ({ id, ...p })); },
    async savePlayer(p) {
      const db = load(); const id = p.id || newId('p_');
      const { id: _, ...data } = p;
      db.players[id] = { createdAt: Date.now(), ...(db.players[id] || {}), ...data, updatedAt: Date.now() };
      save(db); notify();
      return id;
    },
    async loadAll() {
      const db = load();
      const rooms = Object.entries(db.rooms).map(([code, r]) => ({ code, ...r.room }));
      const eventsByRoom = Object.fromEntries(Object.entries(db.rooms).map(([code, r]) => [code, r.events]));
      const players = Object.entries(db.players).map(([id, p]) => ({ id, ...p }));
      return { rooms, eventsByRoom, players };
    },
    async importAll(data, { replace = false } = {}) {
      const db = replace ? blank() : load(); let n = 0;
      for (const p of data.players || []) { const { id, ...rest } = p; db.players[id] = { ...(db.players[id] || {}), ...rest }; n++; }
      for (const r of data.rooms || []) {
        const { code, ...rest } = r;
        if (db.rooms[code]) continue;
        db.rooms[code] = { room: rest, events: (data.eventsByRoom?.[code] || []).map((e) => ({ ...e, id: e.id || newId('e_') })) };
        n += 1 + db.rooms[code].events.length;
      }
      save(db); notify();
      return n;
    },
    async getHouseRules() {
      try { return JSON.parse(localStorage.getItem('mjsg-demo-house')); } catch { return null; }
    },
    async saveHouseRules(rules) {
      try { localStorage.setItem('mjsg-demo-house', JSON.stringify({ ...rules, lastChange: rules.lastChange ? { ...rules.lastChange, byUid: this.uid() } : null })); } catch {}
    },
  };
}

export async function createStore() {
  return isDemo ? createLocalStore() : createFirebaseStore();
}
