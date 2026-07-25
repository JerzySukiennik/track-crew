// RTDB signaling: room claim with disconnect cleanup, offer/answer/ICE exchange and the lobby colour registry.

import { fb } from "./firebase.js";
import { PROTO, ROOM_ALPHABET, ROOM_CODE_LEN } from "../shared/protocol.js";

export function makeRoomCode() {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LEN; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

function safe(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === "function") r.catch(() => {});
    return r;
  } catch (e) {
    return null;
  }
}

export async function claimRoom(preferred) {
  const api = await fb();
  const tries = [];
  const want = String(preferred || "").toUpperCase();
  if (want.length === ROOM_CODE_LEN) tries.push(want);
  while (tries.length < 14) tries.push(makeRoomCode());
  for (const code of tries) {
    const metaRef = api.ref(`rooms/${code}/meta`);
    let res = null;
    try {
      res = await api.runTransaction(metaRef, (cur) => {
        if (cur) return undefined;
        return { createdAt: api.serverTimestamp(), v: PROTO };
      });
    } catch (e) {
      res = null;
    }
    if (res && res.committed) {
      const roomRef = api.ref(`rooms/${code}`);
      safe(() => api.onDisconnectRemove(roomRef));
      const bye = () => safe(() => api.remove(roomRef));
      window.addEventListener("pagehide", bye);
      window.addEventListener("beforeunload", bye);
      return {
        code,
        async release() {
          window.removeEventListener("pagehide", bye);
          window.removeEventListener("beforeunload", bye);
          safe(() => api.cancelDisconnect(roomRef));
          safe(() => api.remove(roomRef));
        }
      };
    }
  }
  throw new Error("room-claim-failed");
}

export async function roomExists(code) {
  const api = await fb();
  const meta = await api.get(api.ref(`rooms/${code}/meta`));
  return !!meta;
}

export async function watchPeerSignals(code, { onOffer, onIce }) {
  const api = await fb();
  const stops = [];
  const seen = new Set();
  const lastOffer = new Map();
  const stopRoot = api.onChildAdded(api.ref(`rooms/${code}/sig`), (val, cid) => {
    if (!cid || seen.has(cid)) return;
    seen.add(cid);
    const stopOffer = api.onValue(api.ref(`rooms/${code}/sig/${cid}/offer`), (v) => {
      if (!v || !v.sdp) return;
      if (lastOffer.get(cid) === v.sdp) return;
      lastOffer.set(cid, v.sdp);
      if (onOffer) onOffer(cid, v);
    });
    const stopIce = api.onChildAdded(api.ref(`rooms/${code}/sig/${cid}/ice/c`), (c) => {
      if (c && onIce) onIce(cid, c);
    });
    stops.push(stopOffer, stopIce);
  });
  stops.push(stopRoot);
  return () => stops.forEach((f) => safe(() => f && f()));
}

export async function sendAnswer(code, cid, answer) {
  const api = await fb();
  await api.set(api.ref(`rooms/${code}/sig/${cid}/answer`), { type: answer.type, sdp: answer.sdp });
}

export async function sendOffer(code, cid, offer) {
  const api = await fb();
  await api.set(api.ref(`rooms/${code}/sig/${cid}/offer`), { type: offer.type, sdp: offer.sdp });
}

export async function pushIce(code, cid, side, cand) {
  const api = await fb();
  safe(() => api.push(api.ref(`rooms/${code}/sig/${cid}/ice/${side}`), cand));
}

export async function watchAnswer(code, cid, cb) {
  const api = await fb();
  return api.onValue(api.ref(`rooms/${code}/sig/${cid}/answer`), (v) => {
    if (v && v.sdp) cb(v);
  });
}

export async function watchIce(code, cid, side, cb) {
  const api = await fb();
  return api.onChildAdded(api.ref(`rooms/${code}/sig/${cid}/ice/${side}`), (c) => {
    if (c) cb(c);
  });
}

export async function clearPeerSignals(code, cid) {
  const api = await fb();
  safe(() => api.remove(api.ref(`rooms/${code}/sig/${cid}`)));
}

export async function armPeerCleanup(code, cid) {
  const api = await fb();
  safe(() => api.onDisconnectRemove(api.ref(`rooms/${code}/sig/${cid}`)));
  safe(() => api.onDisconnectRemove(api.ref(`rooms/${code}/taken/${cid}`)));
}

export async function setTaken(code, cid, colorIdx) {
  const api = await fb();
  safe(() => api.set(api.ref(`rooms/${code}/taken/${cid}`), colorIdx));
}

export async function clearTaken(code, cid) {
  const api = await fb();
  safe(() => api.remove(api.ref(`rooms/${code}/taken/${cid}`)));
}

export async function watchTaken(code, cb) {
  const api = await fb();
  return api.onValue(api.ref(`rooms/${code}/taken`), (v) => cb(v || {}));
}
