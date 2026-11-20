// Camada de dados: Firebase Realtime Database (sincroniza ao vivo) ou localStorage (modo local).
import { firebaseConfig } from './firebase-config.js';

const FB = '10.14.1';

export async function createStore(room) {
  if (firebaseConfig && firebaseConfig.databaseURL) {
    try {
      return await firebaseStore(room);
    } catch (e) {
      console.error('Firebase falhou, usando modo local:', e);
    }
  }
  return localStore(room);
}

async function firebaseStore(room) {
  const [{ initializeApp }, db] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB}/firebase-database.js`),
  ]);
  const { getDatabase, ref, onValue, set, update, remove, child, increment } = db;
  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);
  const base = ref(database, `rooms/${room}/hunts`);
  return {
    mode: 'online',
    subscribe(cb, onError) {
      return onValue(base, (snap) => cb(Object.values(snap.val() || {})), (err) => onError && onError(err));
    },
    onStatus(cb) {
      return onValue(ref(database, '.info/connected'), (s) => cb(!!s.val()));
    },
    save: (h) => set(child(base, h.id), h),
    patch: (id, fields) => update(child(base, id), fields),
    bump: (id, delta) => update(child(base, id), { count: increment(delta) }),
    remove: (id) => remove(child(base, id)),
  };
}

function localStore(room) {
  const key = `shiny-hunt:${room}`;
  const listeners = new Set();
  const read = () => {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  };
  const write = (obj) => {
    localStorage.setItem(key, JSON.stringify(obj));
    emit();
  };
  const emit = () => { const list = Object.values(read()); listeners.forEach((cb) => cb(list)); };
  window.addEventListener('storage', (e) => { if (e.key === key) emit(); });
  return {
    mode: 'local',
    subscribe(cb) {
      listeners.add(cb);
      queueMicrotask(() => cb(Object.values(read())));
      return () => listeners.delete(cb);
    },
    onStatus(cb) { queueMicrotask(() => cb(true)); return () => {}; },
    async save(h) { const o = read(); o[h.id] = h; write(o); },
    async patch(id, fields) { const o = read(); if (o[id]) { Object.assign(o[id], fields); write(o); } },
    async bump(id, delta) { const o = read(); if (o[id]) { o[id].count = Math.max(0, (o[id].count || 0) + delta); write(o); } },
    async remove(id) { const o = read(); delete o[id]; write(o); },
  };
}
