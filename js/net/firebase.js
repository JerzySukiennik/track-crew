// Firebase init and a narrow RTDB access layer for signaling and the relay fallback.

const APP_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
const DB_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD9YTlqNG6pc9GCpUAgRT_VS1Ybb6WHKCg",
  authDomain: "track-crew.firebaseapp.com",
  databaseURL: "https://track-crew-default-rtdb.firebaseio.com",
  projectId: "track-crew",
  storageBucket: "track-crew.firebasestorage.app",
  messagingSenderId: "1098735345684",
  appId: "1:1098735345684:web:d86548ddc3063f93360701"
};

export function isConfigured() {
  return !String(FIREBASE_CONFIG.databaseURL || "").includes("PASTE_");
}

let backend = null;
let pending = null;

export function __useBackend(api) {
  backend = api;
  pending = null;
}

export async function fb() {
  if (backend) return backend;
  if (!pending) pending = boot();
  backend = await pending;
  return backend;
}

async function boot() {
  const [{ initializeApp, getApps }, D] = await Promise.all([import(APP_URL), import(DB_URL)]);
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  const db = D.getDatabase(app);
  return {
    ref: (path) => D.ref(db, path),
    get: async (r) => (await D.get(r)).val(),
    set: (r, v) => D.set(r, v),
    remove: (r) => D.remove(r),
    push: (r, v) => D.push(r, v),
    onValue: (r, cb) => D.onValue(r, (s) => cb(s.val(), s.key)),
    onChildAdded: (r, cb) => D.onChildAdded(r, (s) => cb(s.val(), s.key)),
    onChildRemoved: (r, cb) => D.onChildRemoved(r, (s) => cb(s.val(), s.key)),
    runTransaction: async (r, fn) => {
      const res = await D.runTransaction(r, fn);
      return { committed: !!res.committed, value: res.snapshot ? res.snapshot.val() : null };
    },
    onDisconnectRemove: (r) => D.onDisconnect(r).remove(),
    cancelDisconnect: (r) => D.onDisconnect(r).cancel(),
    serverTimestamp: () => D.serverTimestamp()
  };
}
