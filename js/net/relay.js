// RTDB fallback channel: latest-value input and pad writes plus push queues for reliable events.

import { fb } from "./firebase.js";
import { TUNE } from "../config.js";

const num = (k, d) => (TUNE && typeof TUNE[k] === "number" ? TUNE[k] : d);

function safe(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === "function") r.catch(() => {});
    return r;
  } catch (e) {
    return null;
  }
}

function makeThrottle(hz, write) {
  const period = 1000 / hz;
  let last = 0;
  let queued = null;
  let timer = 0;
  const flush = () => {
    timer = 0;
    if (queued == null) return;
    const v = queued;
    queued = null;
    last = Date.now();
    write(v);
  };
  return {
    push(v) {
      queued = v;
      const wait = period - (Date.now() - last);
      if (wait <= 0) { flush(); return; }
      if (!timer) timer = setTimeout(flush, wait);
    },
    stop() { if (timer) clearTimeout(timer); timer = 0; queued = null; }
  };
}

export async function createRelayHost(code, { onPeer, onLeave, onEvent, onInput }) {
  const api = await fb();
  const peers = new Map();
  const root = api.ref(`rooms/${code}/relay`);

  function attach(cid) {
    if (!cid || peers.has(cid)) return;
    const st = { subs: [], out: null };
    peers.set(cid, st);
    st.out = makeThrottle(num("RELAY_PAD_HZ", 3), (pad) => {
      safe(() => api.set(api.ref(`rooms/${code}/relay/${cid}/out`), pad));
    });
    st.subs.push(api.onValue(api.ref(`rooms/${code}/relay/${cid}/in`), (v) => {
      if (v && onInput) onInput(cid, v);
    }));
    st.subs.push(api.onChildAdded(api.ref(`rooms/${code}/relay/${cid}/ec`), (m, key) => {
      safe(() => api.remove(api.ref(`rooms/${code}/relay/${cid}/ec/${key}`)));
      if (m && onEvent) onEvent(cid, m);
    }));
    if (onPeer) onPeer(cid);
  }

  function detach(cid) {
    const st = peers.get(cid);
    if (!st) return;
    peers.delete(cid);
    st.out.stop();
    st.subs.forEach((f) => safe(() => f && f()));
  }

  const stopAdd = api.onChildAdded(root, (val, cid) => attach(cid));
  const stopRem = api.onChildRemoved(root, (val, cid) => {
    if (!peers.has(cid)) return;
    detach(cid);
    if (onLeave) onLeave(cid);
  });

  return {
    has(cid) { return peers.has(cid); },
    sendPad(cid, pad) {
      const st = peers.get(cid);
      if (!st) return false;
      st.out.push(pad);
      return true;
    },
    sendEvent(cid, msg) {
      if (!peers.has(cid)) return false;
      safe(() => api.push(api.ref(`rooms/${code}/relay/${cid}/ed`), msg));
      return true;
    },
    drop(cid) {
      detach(cid);
      safe(() => api.remove(api.ref(`rooms/${code}/relay/${cid}`)));
    },
    close() {
      safe(() => stopAdd && stopAdd());
      safe(() => stopRem && stopRem());
      Array.from(peers.keys()).forEach(detach);
    }
  };
}

export async function createRelayClient(code, cid, { onPad, onEvent }) {
  const api = await fb();
  const mine = api.ref(`rooms/${code}/relay/${cid}`);
  safe(() => api.onDisconnectRemove(mine));
  await api.set(api.ref(`rooms/${code}/relay/${cid}/mode`), true);

  const subs = [];
  subs.push(api.onValue(api.ref(`rooms/${code}/relay/${cid}/out`), (v) => {
    if (v && onPad) onPad(v);
  }));
  subs.push(api.onChildAdded(api.ref(`rooms/${code}/relay/${cid}/ed`), (m, key) => {
    safe(() => api.remove(api.ref(`rooms/${code}/relay/${cid}/ed/${key}`)));
    if (m && onEvent) onEvent(m);
  }));

  const inThrottle = makeThrottle(num("RELAY_IN_HZ", 10), (v) => {
    safe(() => api.set(api.ref(`rooms/${code}/relay/${cid}/in`), v));
  });

  return {
    sendInput(v) { inThrottle.push(v); return true; },
    sendEvent(msg) { safe(() => api.push(api.ref(`rooms/${code}/relay/${cid}/ec`), msg)); return true; },
    close() {
      inThrottle.stop();
      subs.forEach((f) => safe(() => f && f()));
      safe(() => api.cancelDisconnect(mine));
      safe(() => api.remove(mine));
    }
  };
}
