// Phone-side unified net API: RTC attempt, 6 s fallback to the RTDB relay, quiet slow-link state.

import { MSG, SEQ_MOD } from "../shared/protocol.js";
import { TUNE } from "../config.js";
import { createPeer } from "./rtc.js";
import { createRelayClient } from "./relay.js";
import {
  roomExists, sendOffer, watchAnswer, watchIce, pushIce, clearPeerSignals, armPeerCleanup
} from "./signaling.js";

const num = (k, d) => (TUNE && typeof TUNE[k] === "number" ? TUNE[k] : d);

export async function connectClient({ roomCode, cid, handlers } = {}) {
  const code = String(roomCode || "").toUpperCase();
  const h = handlers || {};
  const onOpen = h.onOpen || (() => {});
  const onEvent = h.onEvent || (() => {});
  const onPad = h.onPad || (() => {});
  const onClose = h.onClose || (() => {});

  if (!(await roomExists(code))) throw new Error("room-not-found");
  await armPeerCleanup(code, cid);

  let mode = "connecting";
  let closed = false;
  let peer = null;
  let relayed = null;
  let fallbackTimer = 0;
  let seq = 0;
  const outbox = [];
  const stops = [];

  function stopSignaling() {
    while (stops.length) {
      const f = stops.pop();
      try { if (f) f(); } catch (e) {}
    }
  }

  function flushOutbox() {
    while (outbox.length) {
      const msg = outbox.shift();
      rawEvent(msg);
    }
  }

  function rawEvent(msg) {
    if (mode === "rtc" && peer && peer.isOpen()) return peer.sendEvent(msg);
    if (mode === "relay" && relayed) return relayed.sendEvent(msg);
    return false;
  }

  function goOpen(next) {
    if (closed) return;
    mode = next;
    flushOutbox();
    onOpen(next);
  }

  function routeIncoming(msg) {
    if (!msg || closed) return;
    if (msg.type === MSG.PAD) onPad({ hold: msg.hold || null, ctx: msg.ctx || 0, near: msg.near || "" });
    else onEvent(msg);
  }

  async function toRelay(reason) {
    if (closed || mode === "relay") return;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = 0; }
    stopSignaling();
    if (peer) { peer.close(); peer = null; }
    clearPeerSignals(code, cid);
    try {
      relayed = await createRelayClient(code, cid, {
        onPad: routeIncoming,
        onEvent: routeIncoming
      });
      goOpen("relay");
    } catch (e) {
      mode = "dead";
      onClose(reason || "relay-failed");
    }
  }

  peer = createPeer({
    initiator: true,
    onIce: (c) => pushIce(code, cid, "c", c),
    onOpen: () => {
      if (closed || mode === "relay") return;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = 0; }
      stopSignaling();
      clearPeerSignals(code, cid);
      goOpen("rtc");
    },
    onEvent: routeIncoming,
    onInput: routeIncoming,
    onClose: () => {
      if (closed) return;
      if (mode === "rtc") { toRelay("rtc-lost"); return; }
      if (mode === "connecting") toRelay("rtc-failed");
    }
  });

  const offer = await peer.makeOffer();
  stops.push(await watchAnswer(code, cid, (ans) => { if (peer) peer.acceptAnswer(ans); }));
  stops.push(await watchIce(code, cid, "d", (c) => { if (peer) peer.addIce(c); }));
  await sendOffer(code, cid, offer);
  fallbackTimer = setTimeout(() => toRelay("timeout"), num("RTC_FALLBACK_S", 6) * 1000);

  return {
    sendEvent(msg) {
      if (closed || !msg) return false;
      if (mode === "connecting") { outbox.push(msg); return true; }
      return rawEvent(msg);
    },
    sendInput(v) {
      if (closed || !v) return false;
      const msg = { type: MSG.INPUT, x: v.x, y: v.y, q: seq };
      seq = (seq + 1) % SEQ_MOD;
      if (mode === "rtc" && peer) return peer.sendInput(msg);
      if (mode === "relay" && relayed) return relayed.sendInput({ x: msg.x, y: msg.y, q: msg.q });
      return false;
    },
    mode() { return mode; },
    close() {
      if (closed) return;
      rawEvent({ type: MSG.LEAVE });
      closed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      stopSignaling();
      if (peer) peer.close();
      if (relayed) relayed.close();
      clearPeerSignals(code, cid);
    }
  };
}
