// Controller entry: rotate gate, join then pad lifecycle, reconnection by cid and the ?debug echo host.

import { MSG, PROTO, PHASE, CTX } from "../shared/protocol.js";
import { TUNE } from "../config.js";
import { connectClient } from "../net/netclient.js";
import { initRotateGate } from "./rotate.js";
import { runJoin } from "./join.js";
import {
  initPad, setPad, setPhasePad, buzz, setLink, setNotice, setIdentity, ensureIcons, loadAvatarData
} from "./pad.js";

const num = (k, d) => (TUNE && typeof TUNE[k] === "number" ? TUNE[k] : d);

let started = false;
let wakeLock = null;

function getCid() {
  let cid = "";
  try { cid = localStorage.getItem("trackcrew.cid") || ""; } catch (e) { cid = ""; }
  if (!cid) {
    cid = "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem("trackcrew.cid", cid); } catch (e) {}
  }
  return cid;
}

function padRootEl() {
  let el = document.getElementById("pad-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "pad-root";
    document.body.appendChild(el);
  }
  el.classList.add("pad-root");
  return el;
}

function showFatal(root, title, sub) {
  root.innerHTML = '<div class="pad-fatal"><div class="pad-fatal-card"><div class="t"></div><div class="s"></div></div></div>';
  root.querySelector(".t").textContent = title;
  root.querySelector(".s").textContent = sub || "";
}

async function keepAwake() {
  try {
    if (navigator.wakeLock && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) {
    wakeLock = null;
  }
}

export async function start() {
  if (started) return;
  started = true;

  ensureIcons();
  document.body.classList.add("tc-pad");
  const root = padRootEl();
  initRotateGate();
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

  const params = new URLSearchParams(location.search);
  const debug = params.get("debug");
  const cid = getCid();
  let room = String(params.get("room") || "").toUpperCase();
  let dbg = null;

  if (debug) {
    dbg = await startDebugHost(debug === "relay");
    room = dbg.roomCode;
    const u = new URL(location.href);
    u.searchParams.set("room", room);
    history.replaceState(null, "", u.toString());
  }

  if (room.length !== 4) {
    showFatal(root, "NO ROOM CODE", "Scan the QR code on the TV to open your pad.");
    return;
  }

  const data = await loadAvatarData();
  const profilePromise = runJoin(root);

  let net = null;
  let profile = null;
  let retryTimer = 0;
  let padLive = false;
  const pending = { mode: null, phase: null, pad: null, notice: null };

  function sendJoin() {
    if (!net || !profile) return;
    net.sendEvent({
      type: MSG.JOIN, proto: PROTO, cid,
      name: profile.name, hat: profile.hat, colorIdx: profile.colorIdx, skinIdx: profile.skinIdx
    });
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = 0; connectOnce(); }, 1500);
  }

  function applyPhase(phase) {
    pending.phase = phase;
    if (padLive) setPhasePad(phase);
  }

  function applyNotice(title, sub) {
    pending.notice = title ? [title, sub] : null;
    if (padLive) setNotice(title, sub);
  }

  function flushPending() {
    if (pending.mode) setLink(pending.mode);
    if (pending.phase) setPhasePad(pending.phase);
    if (pending.pad) setPad(pending.pad);
    if (pending.notice) setNotice(pending.notice[0], pending.notice[1]);
    else setNotice(null);
  }

  const handlers = {
    onOpen(mode) {
      pending.mode = mode;
      applyNotice(null);
      if (padLive) setLink(mode);
      if (dbg) dbg.setMode(mode);
    },
    onEvent(msg) {
      if (!msg) return;
      if (msg.type === MSG.WELCOME) {
        if (profile && typeof msg.colorIdx === "number") profile.colorIdx = msg.colorIdx;
        if (profile && padLive) setIdentity(data.colors[profile.colorIdx], profile.hat);
        applyPhase(msg.phase || PHASE.LOBBY);
        applyNotice(null);
        return;
      }
      if (msg.type === MSG.PHASE) { applyPhase(msg.phase); return; }
      if (msg.type === MSG.BUZZ) { buzz(msg.kind); return; }
      if (msg.type === MSG.REJECT) { applyNotice("CANNOT JOIN", String(msg.reason || "").toUpperCase()); return; }
      if (msg.type === MSG.KICK) { applyNotice("DISCONNECTED", String(msg.reason || "").toUpperCase()); }
    },
    onPad(pad) {
      pending.pad = pad;
      if (padLive) setPad(pad);
      if (dbg) dbg.countPad();
    },
    onClose() {
      pending.mode = null;
      if (padLive) setLink(null);
      applyNotice("RECONNECTING", "Keep this page open.");
      net = null;
      scheduleRetry();
    }
  };

  async function connectOnce() {
    try {
      net = await connectClient({ roomCode: room, cid, handlers });
      sendJoin();
    } catch (e) {
      net = null;
      applyNotice("NO GAME FOUND", "Room " + room + " is not running.");
      scheduleRetry();
    }
  }

  connectOnce();
  profile = await profilePromise;

  initPad(root, {
    onInput: (v) => { if (net) net.sendInput(v); if (dbg) dbg.countInput(v); },
    onButton: () => { if (net) net.sendEvent({ type: MSG.BTN }); }
  });
  padLive = true;
  setIdentity(data.colors[profile.colorIdx], profile.hat);
  setPad({ hold: null, ctx: CTX.NONE, near: "" });
  if (!pending.phase) pending.phase = PHASE.LOBBY;
  if (!net && !pending.mode) pending.notice = ["CONNECTING", "Linking to the TV."];
  flushPending();
  sendJoin();
  keepAwake();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(); });
  window.addEventListener("pagehide", () => { if (net) net.close(); });
}

function makeMockRtdb(opts) {
  const cfg = opts || {};
  const rootData = {};
  const valueSubs = [];
  const childSubs = [];
  let seq = 0;
  const parts = (p) => String(p).split("/").filter(Boolean);
  const clone = (v) => (v === null || typeof v !== "object" ? v : JSON.parse(JSON.stringify(v)));
  const defer = (fn) => setTimeout(fn, cfg.latency || 0);

  function getIn(path) {
    let n = rootData;
    for (const k of parts(path)) {
      if (n == null || typeof n !== "object") return null;
      n = n[k];
      if (n === undefined) return null;
    }
    return n === undefined ? null : n;
  }
  function setIn(path, val) {
    const ks = parts(path);
    if (!ks.length) return;
    let n = rootData;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof n[ks[i]] !== "object" || n[ks[i]] === null) n[ks[i]] = {};
      n = n[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (val === null || val === undefined) delete n[last];
    else n[last] = clone(val);
  }
  function keysOf(path) {
    const n = getIn(path);
    return n && typeof n === "object" ? Object.keys(n) : [];
  }
  function notify() {
    valueSubs.slice().forEach((s) => {
      const v = getIn(s.path);
      const j = JSON.stringify(v);
      if (j === s.last) return;
      s.last = j;
      defer(() => s.cb(clone(v), parts(s.path).pop() || null));
    });
    childSubs.slice().forEach((s) => {
      const now = keysOf(s.path);
      const set = new Set(now);
      if (s.type === "added") {
        now.forEach((k) => {
          if (s.known.has(k)) return;
          s.known.add(k);
          const v = clone(getIn(s.path + "/" + k));
          defer(() => s.cb(v, k));
        });
        Array.from(s.known).forEach((k) => { if (!set.has(k)) s.known.delete(k); });
      } else {
        Array.from(s.known).forEach((k) => {
          if (set.has(k)) return;
          s.known.delete(k);
          defer(() => s.cb(null, k));
        });
        now.forEach((k) => s.known.add(k));
      }
    });
  }
  const blocked = (path) => !!(cfg.blockOffer && /\/sig\/[^/]+\/offer$/.test(path));

  return {
    ref: (path) => ({ path }),
    get: async (r) => clone(getIn(r.path)),
    set: async (r, v) => { if (blocked(r.path)) return; setIn(r.path, v); notify(); },
    remove: async (r) => { setIn(r.path, null); notify(); },
    push: async (r, v) => {
      const k = "m" + String(seq++).padStart(6, "0");
      setIn(r.path + "/" + k, v);
      notify();
      return { path: r.path + "/" + k };
    },
    onValue: (r, cb) => {
      const s = { path: r.path, cb, last: undefined };
      valueSubs.push(s);
      defer(() => {
        const v = getIn(s.path);
        s.last = JSON.stringify(v);
        cb(clone(v), parts(s.path).pop() || null);
      });
      return () => { const i = valueSubs.indexOf(s); if (i >= 0) valueSubs.splice(i, 1); };
    },
    onChildAdded: (r, cb) => {
      const s = { path: r.path, cb, type: "added", known: new Set() };
      childSubs.push(s);
      defer(notify);
      return () => { const i = childSubs.indexOf(s); if (i >= 0) childSubs.splice(i, 1); };
    },
    onChildRemoved: (r, cb) => {
      const s = { path: r.path, cb, type: "removed", known: new Set(keysOf(r.path)) };
      childSubs.push(s);
      return () => { const i = childSubs.indexOf(s); if (i >= 0) childSubs.splice(i, 1); };
    },
    runTransaction: async (r, fn) => {
      const cur = clone(getIn(r.path));
      const next = fn(cur);
      if (next === undefined) return { committed: false, value: cur };
      setIn(r.path, next);
      notify();
      return { committed: true, value: clone(next) };
    },
    onDisconnectRemove: async () => {},
    cancelDisconnect: async () => {},
    serverTimestamp: () => Date.now()
  };
}

async function startDebugHost(forceRelay) {
  const fbMod = await import("../net/firebase.js");
  fbMod.__useBackend(makeMockRtdb({ latency: 8, blockOffer: !!forceRelay }));
  const { createHost } = await import("../net/nethost.js");

  const hud = document.createElement("div");
  hud.className = "pad-debug";
  document.body.appendChild(hud);

  const stat = { inCount: 0, inRate: 0, padCount: 0, padRate: 0, btn: 0, mode: "-", last: { x: 0, y: 0 }, peer: "-", hostPad: 0, hostPadRate: 0 };
  const cycle = [CTX.PICKUP, CTX.PLACE_RAIL, CTX.LOAD, CTX.DROP, CTX.THROW];
  const holds = [null, { k: "wood", n: 7 }, { k: "rail", n: 3 }, { k: "tool_axe", n: 1 }];
  let holdIdx = 0;

  const host = await createHost({
    handlers: {
      onPeerJoin(cid) { stat.peer = cid; },
      onPeerLeave() { stat.peer = "-"; },
      onEvent(cid, msg) {
        if (msg.type === MSG.JOIN) {
          host.sendEvent(cid, { type: MSG.WELCOME, pid: "p1", colorIdx: msg.colorIdx, phase: PHASE.RUN, round: 1 });
          if (!host.__cast) {
            host.__cast = setInterval(() => {
              const ctx = cycle[Math.floor(Date.now() / 2500) % cycle.length];
              host.sendPad(cid, { hold: holds[holdIdx % holds.length], ctx, near: "LOG PILE" });
              stat.hostPad++;
            }, 1000 / num("PAD_HZ", 10));
          }
        }
        if (msg.type === MSG.BTN) {
          stat.btn++;
          holdIdx++;
          if (stat.btn % 4 === 0) host.sendEvent(cid, { type: MSG.BUZZ, kind: "derailWarn" });
        }
      },
      onInput(cid, v) { stat.inCount++; stat.last = v; }
    }
  });

  setInterval(() => {
    stat.inRate = stat.inCount;
    stat.padRate = stat.padCount;
    stat.hostPadRate = stat.hostPad;
    stat.inCount = 0;
    stat.padCount = 0;
    stat.hostPad = 0;
    hud.textContent =
      "MODE " + stat.mode + " · IN " + stat.inRate + "/s · PAD sent " + stat.hostPadRate +
      "/s recv " + stat.padRate + "/s · BTN " + stat.btn +
      " · x" + stat.last.x.toFixed(2) + " y" + stat.last.y.toFixed(2) + " · PEER " + stat.peer;
    window.__tcDebug = JSON.parse(JSON.stringify(stat));
  }, 1000);

  return {
    roomCode: host.roomCode,
    setMode(m) { stat.mode = m; },
    countInput(v) { stat.last = v; },
    countPad() { stat.padCount++; }
  };
}

start();
