// Display-side unified net API: room claim, RTC peers, RTDB relay merge and per-peer send/receive state.

import { MSG, PROTO, newerSeq } from "../shared/protocol.js";
import { createPeer } from "./rtc.js";
import { createRelayHost } from "./relay.js";
import {
  claimRoom, watchPeerSignals, sendAnswer, pushIce, clearPeerSignals, setTaken, clearTaken
} from "./signaling.js";

export async function createHost({ roomCode, handlers } = {}) {
  const h = handlers || {};
  const onPeerJoin = h.onPeerJoin || (() => {});
  const onPeerLeave = h.onPeerLeave || (() => {});
  const onEvent = h.onEvent || (() => {});
  const onInput = h.onInput || (() => {});

  const room = await claimRoom(roomCode);
  const code = room.code;
  const peers = new Map();
  let closed = false;

  function state(cid) {
    let st = peers.get(cid);
    if (!st) {
      st = { cid, mode: null, peer: null, lastQ: null, lastCtx: -1, joined: false };
      peers.set(cid, st);
    }
    return st;
  }

  function announce(st) {
    if (st.joined || closed) return;
    st.joined = true;
    onPeerJoin(st.cid);
  }

  function drop(cid, reason) {
    const st = peers.get(cid);
    if (!st) return;
    peers.delete(cid);
    if (st.peer) st.peer.close();
    clearTaken(code, cid);
    if (relay && relay.has(cid)) relay.drop(cid);
    if (st.joined) onPeerLeave(cid, reason || "closed");
  }

  function routeEvent(cid, msg) {
    if (!msg || closed) return;
    const st = state(cid);
    const type = msg.type;
    if (type === MSG.JOIN) {
      if (msg.proto !== PROTO) {
        sendEvent(cid, { type: MSG.REJECT, reason: "version" });
        setTimeout(() => drop(cid, "version"), 250);
        return;
      }
      if (typeof msg.colorIdx === "number") setTaken(code, cid, msg.colorIdx);
      announce(st);
    }
    if (type === MSG.LEAVE) {
      onEvent(cid, msg);
      drop(cid, "left");
      return;
    }
    onEvent(cid, msg);
  }

  function routeInput(cid, msg) {
    if (!msg || closed) return;
    const st = state(cid);
    const q = typeof msg.q === "number" ? msg.q : null;
    if (q != null) {
      if (!newerSeq(q, st.lastQ)) return;
      st.lastQ = q;
    }
    onInput(cid, { x: Number(msg.x) || 0, y: Number(msg.y) || 0, q: q == null ? 0 : q });
  }

  const relay = await createRelayHost(code, {
    onPeer: (cid) => {
      const st = state(cid);
      if (st.peer && st.peer.isOpen()) return;
      st.mode = "relay";
      announce(st);
    },
    onLeave: (cid) => {
      const st = peers.get(cid);
      if (!st || st.mode !== "relay") return;
      drop(cid, "relay-gone");
    },
    onEvent: routeEvent,
    onInput: routeInput
  });

  const stopSignals = await watchPeerSignals(code, {
    onOffer: async (cid, offer) => {
      if (closed) return;
      const st = state(cid);
      if (st.peer) st.peer.close();
      const peer = createPeer({
        initiator: false,
        onIce: (c) => pushIce(code, cid, "d", c),
        onOpen: () => {
          st.mode = "rtc";
          announce(st);
          clearPeerSignals(code, cid);
        },
        onEvent: (m) => routeEvent(cid, m),
        onInput: (m) => routeInput(cid, m),
        onClose: () => {
          if (peers.get(cid) !== st) return;
          if (relay.has(cid)) { st.mode = "relay"; st.peer = null; return; }
          drop(cid, "rtc-closed");
        }
      });
      st.peer = peer;
      try {
        const answer = await peer.acceptOffer(offer);
        await sendAnswer(code, cid, answer);
      } catch (e) {
        peer.close();
        st.peer = null;
      }
    },
    onIce: (cid, cand) => {
      const st = peers.get(cid);
      if (st && st.peer) st.peer.addIce(cand);
    }
  });

  function sendEvent(cid, msg) {
    const st = peers.get(cid);
    if (!st || closed) return false;
    if (st.peer && st.peer.isOpen() && st.peer.sendEvent(msg)) return true;
    return relay.sendEvent(cid, msg);
  }

  function sendPad(cid, pad) {
    const st = peers.get(cid);
    if (!st || closed || !pad) return false;
    const msg = { type: MSG.PAD, hold: pad.hold || null, ctx: pad.ctx || 0, near: pad.near || "" };
    const ctxChanged = msg.ctx !== st.lastCtx;
    st.lastCtx = msg.ctx;
    if (st.peer && st.peer.isOpen()) {
      st.peer.sendInput(msg);
      if (ctxChanged) st.peer.sendEvent(msg);
      return true;
    }
    return relay.sendPad(cid, msg);
  }

  function broadcastEvent(msg) {
    let n = 0;
    peers.forEach((st) => { if (sendEvent(st.cid, msg)) n++; });
    return n;
  }

  return {
    roomCode: code,
    sendEvent,
    sendPad,
    broadcastEvent,
    peerMode(cid) {
      const st = peers.get(cid);
      return st ? st.mode : null;
    },
    peers() { return Array.from(peers.keys()); },
    kick(cid, reason) {
      sendEvent(cid, { type: MSG.KICK, reason: reason || "kicked" });
      setTimeout(() => drop(cid, "kicked"), 250);
    },
    async close() {
      if (closed) return;
      closed = true;
      if (stopSignals) stopSignals();
      relay.close();
      peers.forEach((st) => { if (st.peer) st.peer.close(); });
      peers.clear();
      await room.release();
    }
  };
}
