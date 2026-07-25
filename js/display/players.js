// Track Crew — player movement, carry slot, context resolution, auto tools, leash and thrown dynamite.

import { CAM_YAW } from "../config.js";
import { PHASE, CTX } from "../shared/protocol.js";
import { TOOLS } from "../data/tools.js";
import { WAGONS } from "../data/wagons.js";
import { COLOR_OPTIONS } from "../data/avatars.js";
import { pushEvent } from "./state.js";
import {
  TILE, groundAt, isWalkable, isGroundCode, itemAt, removeItem, dropItem,
  buildBank, hitProp, nearestProp, nearestWater, nearestItem, explodeAt
} from "./world.js";
import { slideMove } from "./collision.js";
import { isGreen, tryPlaceRail } from "./rails.js";
import {
  wagonAtTile, depositTo, takeRails, takeStash, coolTank, wagonStats, crafterStash, WAGON_LEN
} from "./train.js";
import { shopContext, applyShop, detachToHands, parseCrate } from "./lobby.js";

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STICK_SPEED = 8;
const TOOL_ITEMS = { tool_axe: 1, tool_pick: 1, tool_bucket: 1 };

function nextPid(game) {
  for (let i = 1; i <= game.tune.MAX_PLAYERS + 4; i++) {
    const pid = "p" + i;
    if (!game.players.has(pid)) return pid;
  }
  return "p" + (game.players.size + 1);
}

function freeColor(game, want) {
  const taken = new Set();
  game.players.forEach((p) => taken.add(p.colorIdx));
  const w = ((want | 0) % COLOR_OPTIONS.length + COLOR_OPTIONS.length) % COLOR_OPTIONS.length;
  if (!taken.has(w)) return w;
  for (let i = 0; i < COLOR_OPTIONS.length; i++) if (!taken.has(i)) return i;
  return w;
}

export function spawnPoint(game) {
  const t = game.train;
  const base = t.wagons[0] || { x: 0, z: 0, dirX: 1, dirZ: 0 };
  for (let r = 1; r <= 6; r++) {
    for (const d of DIRS4) {
      const x = Math.floor(base.x + d[0] * r);
      const z = Math.floor(base.z + d[1] * r);
      if (isWalkable(game.world, x, z) && !game.train.tileSet.has(x + "," + z)) return { x: x + 0.5, z: z + 0.5 };
    }
  }
  return { x: base.x, z: base.z + 2 };
}

export function addPlayer(game, { cid, name, hat, colorIdx, skinIdx }) {
  let found = null;
  game.players.forEach((p) => { if (p.cid === cid) found = p; });
  if (found) {
    found.name = String(name || found.name).slice(0, game.tune.NAME_MAX);
    found.hat = hat | 0;
    found.skinIdx = skinIdx | 0;
    markBack(game, found.pid);
    return found.pid;
  }
  if (game.players.size >= game.tune.MAX_PLAYERS) return null;
  const pid = nextPid(game);
  const sp = spawnPoint(game);
  const p = {
    pid, cid,
    name: String(name || "CREW").slice(0, game.tune.NAME_MAX),
    hat: hat | 0, colorIdx: freeColor(game, colorIdx), skinIdx: skinIdx | 0,
    x: sp.x, z: sp.z, vx: 0, vz: 0, faceX: 1, faceZ: 0,
    stick: { x: 0, y: 0 }, carry: null, bucketFull: false,
    autoT: 0, leashT: 0, walkT: 0, conn: "rtc", lostAt: 0, joinedAt: game.time
  };
  game.players.set(pid, p);
  pushEvent(game, { type: "playerJoin", pid, name: p.name });
  return pid;
}

export function removePlayer(game, pid) {
  const p = game.players.get(pid);
  if (!p) return false;
  if (p.carry) {
    const it = dropItem(game, p.carry.k, p.carry.n, p.x, p.z);
    if (it && p.carry.k === "tool_bucket") it.full = p.bucketFull;
  }
  game.players.delete(pid);
  pushEvent(game, { type: "playerLeave", pid });
  return true;
}

export function markLost(game, pid) {
  const p = game.players.get(pid);
  if (!p) return false;
  p.conn = "lost";
  p.lostAt = game.time;
  p.stick.x = 0;
  p.stick.y = 0;
  return true;
}

export function markBack(game, pid, mode) {
  const p = game.players.get(pid);
  if (!p) return false;
  p.conn = mode === "relay" ? "relay" : "rtc";
  p.lostAt = 0;
  return true;
}

export function applyInput(game, pid, { x, y }) {
  const p = game.players.get(pid);
  if (!p || p.conn === "lost") return false;
  const c = Math.cos(CAM_YAW);
  const s = Math.sin(CAM_YAW);
  let ix = Number(x) || 0;
  let iy = Number(y) || 0;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  p.stick.x = ix * c + iy * s;
  p.stick.y = ix * s - iy * c;
  return true;
}

export function faceDir(p) {
  if (Math.abs(p.faceX) >= Math.abs(p.faceZ)) return { dx: p.faceX >= 0 ? 1 : -1, dz: 0 };
  return { dx: 0, dz: p.faceZ >= 0 ? 1 : -1 };
}

export function targetTile(p) {
  const d = faceDir(p);
  return { x: Math.floor(p.x) + d.dx, z: Math.floor(p.z) + d.dz };
}

function nearestHook(game, p) {
  const t = game.train;
  let best = null;
  let bestD = game.tune.ACT_RANGE + 0.4;
  for (const h of t.hookTools) {
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (d <= bestD) { bestD = d; best = h; }
  }
  return best;
}

function canBank(game, x, z) {
  if (groundAt(game.world, x, z) !== TILE.WATER) return false;
  for (const d of DIRS4) if (isGroundCode(groundAt(game.world, x + d[0], z + d[1]))) return true;
  return false;
}

function propLabel(p) {
  if (!p) return "";
  if (p.kind === "tree") return p.gold ? "GOLDEN TREE" : "TREE";
  if (p.kind === "ore") return p.gold ? "GOLDEN ORE" : "IRON ORE";
  return "ROCK";
}

function itemLabel(k) {
  const crate = parseCrate(k);
  if (crate) return (WAGONS[crate.type] ? WAGONS[crate.type].name : crate.type).toUpperCase();
  if (k === "wood") return "WOOD";
  if (k === "iron") return "IRON";
  if (k === "rail") return "RAILS";
  if (k === "stick") return "DYNAMITE";
  if (k === "tool_axe") return "AXE";
  if (k === "tool_pick") return "PICKAXE";
  if (k === "tool_bucket") return "BUCKET";
  return String(k || "").toUpperCase();
}

function resolveContext(game, p) {
  const T = game.tune;
  const target = targetTile(p);
  const c = p.carry;

  if (c && c.k === "stick") return { ctx: CTX.THROW, near: "DYNAMITE", ref: null, target };
  if (c && c.k === "rail" && isGreen(game, target.x, target.z)) {
    return { ctx: CTX.PLACE_RAIL, near: "TRACK END", ref: null, target };
  }
  if (c && c.k === "wood" && canBank(game, target.x, target.z)) {
    return { ctx: CTX.BUILD_BANK, near: "WATER", ref: null, target };
  }

  const shop = shopContext(game, p, target);
  if (shop) return { ctx: shop.ctx, near: shop.near, ref: shop.ref, target };

  const wi = wagonAtTile(game, target.x, target.z);
  if (wi >= 0) {
    const w = game.train.wagons[wi];
    const name = (WAGONS[w.type] ? WAGONS[w.type].name : w.type).toUpperCase();
    if (w.type === "crafter" && c && (c.k === "wood" || c.k === "iron")) {
      return { ctx: CTX.LOAD, near: name, ref: wi, target };
    }
    if (w.type === "crafter" && !c) {
      const stash = crafterStash(game, wi);
      if (stash) return { ctx: CTX.TAKE_STASH, near: name + " " + stash.k.toUpperCase() + " " + stash.n, ref: wi, target };
    }
    if (w.type === "holder" && w.inv.rails > 0 && (!c || c.k === "rail")) {
      return { ctx: CTX.TAKE_RAILS, near: name + " " + w.inv.rails, ref: wi, target };
    }
    if (w.type === "vault") {
      if (c) return { ctx: CTX.LOAD, near: name, ref: wi, target };
      if (w.inv.stack.length) return { ctx: CTX.TAKE_STASH, near: name, ref: wi, target };
    }
    if (w.type === "dynamite" && !c && w.inv.sticks > 0) {
      return { ctx: CTX.PICKUP, near: "DYNAMITE", ref: { kind: "stick", wi }, target };
    }
    if (game.phase === PHASE.SHOP && !c && wi >= 2) {
      return { ctx: CTX.PICKUP, near: name, ref: { kind: "wagon", wi }, target };
    }
  }

  let it = itemAt(game.world, target.x, target.z);
  if (!it) it = nearestItem(game, p.x, p.z, T.ACT_RANGE);
  const hook = nearestHook(game, p);
  if (it || hook) {
    const ref = it ? { kind: "item", it } : { kind: "hook", h: hook };
    const label = it ? itemLabel(it.k) + (it.n > 1 ? " " + it.n : "") : itemLabel(hook.k);
    const merge = it && c && it.k === c.k && !TOOL_ITEMS[it.k];
    return { ctx: c && !merge ? CTX.SWAP : CTX.PICKUP, near: label, ref, target };
  }

  if (c) {
    const prop = nearestProp(game, p.x, p.z, T.ACT_RANGE, null);
    return { ctx: CTX.DROP, near: propLabel(prop), ref: null, target };
  }
  const prop = nearestProp(game, p.x, p.z, T.ACT_RANGE, null);
  return { ctx: CTX.NONE, near: propLabel(prop), ref: null, target };
}

export function contextFor(game, pid) {
  const p = game.players.get(pid);
  if (!p) return { ctx: CTX.NONE, near: "" };
  const r = resolveContext(game, p);
  return { ctx: r.ctx, near: r.near || "" };
}

function dropCarry(game, p, x, z) {
  if (!p.carry) return null;
  const tx = isWalkable(game.world, x, z) ? x : Math.floor(p.x);
  const tz = isWalkable(game.world, x, z) ? z : Math.floor(p.z);
  const it = dropItem(game, p.carry.k, p.carry.n, tx, tz);
  if (it && p.carry.k === "tool_bucket") { it.full = p.bucketFull; p.bucketFull = false; }
  p.carry = null;
  return it;
}

function takeItem(game, p, it) {
  removeItem(game, it);
  if (p.carry && p.carry.k === it.k) p.carry.n += it.n;
  else p.carry = { k: it.k, n: it.n };
  if (it.k === "tool_bucket") p.bucketFull = !!it.full;
  return true;
}

export function onButton(game, pid) {
  const p = game.players.get(pid);
  if (!p || p.conn === "lost") return false;
  const r = resolveContext(game, p);
  const t = r.target;

  switch (r.ctx) {
    case CTX.THROW: {
      throwStick(game, p);
      return true;
    }
    case CTX.PLACE_RAIL:
      return tryPlaceRail(game, t.x, t.z, pid);
    case CTX.BUILD_BANK: {
      if (!buildBank(game, t.x, t.z)) return false;
      p.carry.n -= 1;
      if (p.carry.n <= 0) p.carry = null;
      return true;
    }
    case CTX.LOAD:
      return depositTo(game, pid, r.ref);
    case CTX.TAKE_RAILS:
      return takeRails(game, pid, r.ref);
    case CTX.TAKE_STASH:
      return takeStash(game, pid, r.ref);
    case CTX.BUY:
    case CTX.SCRAP:
    case CTX.REROLL:
    case CTX.INSERT_WAGON:
      return applyShop(game, p, r.ctx, r.ref);
    case CTX.PICKUP:
    case CTX.SWAP: {
      const ref = r.ref;
      if (!ref) return false;
      if (ref.kind === "wagon") return detachToHands(game, p, ref.wi);
      if (r.ctx === CTX.SWAP) dropCarry(game, p, t.x, t.z);
      if (ref.kind === "stick") {
        const w = game.train.wagons[ref.wi];
        if (!w || w.inv.sticks <= 0) return false;
        w.inv.sticks -= 1;
        p.carry = { k: "stick", n: 1 };
        pushEvent(game, { type: "pickup", pid, k: "stick" });
        return true;
      }
      if (ref.kind === "hook") {
        const idx = game.train.hookTools.indexOf(ref.h);
        if (idx < 0) return false;
        game.train.hookTools.splice(idx, 1);
        p.carry = { k: ref.h.k, n: 1 };
        p.bucketFull = false;
        pushEvent(game, { type: "pickup", pid, k: ref.h.k });
        return true;
      }
      if (ref.kind === "item") {
        takeItem(game, p, ref.it);
        pushEvent(game, { type: "pickup", pid, k: p.carry.k });
        return true;
      }
      return false;
    }
    case CTX.DROP: {
      if (!p.carry) return false;
      const k = p.carry.k;
      dropCarry(game, p, t.x, t.z);
      pushEvent(game, { type: "drop", pid, k });
      return true;
    }
    default:
      pushEvent(game, { type: "error", pid, reason: "nothing" });
      return false;
  }
}

export function throwStick(game, p) {
  const T = game.tune;
  const d = faceDir(p);
  const dyn = game.train.wagons.find((w) => w.type === "dynamite");
  const radius = dyn ? (wagonStats("dynamite", dyn.level).radius || 2.5) : 2.5;
  game.sticks.push({
    x: p.x, z: p.z, dirX: d.dx, dirZ: d.dz,
    left: (TOOLS.stick.throwTiles || T.DYNAMITE_THROW), fuse: TOOLS.stick.fuseS || T.DYNAMITE_FUSE_S,
    radius, state: "fly"
  });
  p.carry = null;
  pushEvent(game, { type: "throw", pid: p.pid, x: p.x, z: p.z });
  return true;
}

function tickSticks(game, dt) {
  const list = game.sticks;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s.state === "fly") {
      const step = Math.min(s.left, STICK_SPEED * dt);
      s.x += s.dirX * step;
      s.z += s.dirZ * step;
      s.left -= step;
      if (s.left <= 0) s.state = "fuse";
      continue;
    }
    s.fuse -= dt;
    if (s.fuse <= 0) {
      explodeAt(game, s.x, s.z, s.radius);
      list.splice(i, 1);
    }
  }
}

function autoTick(game, p, dt) {
  const T = game.tune;
  const k = p.carry && p.carry.k;
  if (k === "tool_axe" || k === "tool_pick") {
    const kind = k === "tool_axe" ? "tree" : "ore";
    const tool = k === "tool_axe" ? TOOLS.axe : TOOLS.pick;
    const prop = nearestProp(game, p.x, p.z, T.ACT_RANGE, kind);
    if (!prop) { p.autoT = 0; return; }
    p.autoT += dt;
    if (p.autoT >= tool.hitS) {
      p.autoT = 0;
      hitProp(game, prop.x, prop.z);
    }
    return;
  }
  if (k === "tool_bucket") {
    if (!p.bucketFull) {
      const wt = nearestWater(game, p.x, p.z, T.ACT_RANGE);
      if (!wt) { p.autoT = 0; return; }
      p.autoT += dt;
      if (p.autoT >= TOOLS.bucket.scoopS) {
        p.autoT = 0;
        p.bucketFull = true;
        pushEvent(game, { type: "scoop", pid: p.pid, x: wt.x, z: wt.z });
      }
      return;
    }
    p.autoT = 0;
    const tank = game.train.wagons.find((w) => w.type === "tank");
    if (!tank || game.train.heat <= T.COOL_MIN_HEAT) return;
    if (Math.hypot(p.x - tank.x, p.z - tank.z) > T.ACT_RANGE + WAGON_LEN / 2) return;
    p.bucketFull = false;
    coolTank(game, TOOLS.bucket.cool);
    pushEvent(game, { type: "pour", pid: p.pid, x: tank.x, z: tank.z });
    return;
  }
  p.autoT = 0;
}

function leashTick(game, p, dt) {
  const T = game.tune;
  if (game.phase !== PHASE.RUN) { p.leashT = 0; return; }
  const t = game.train;
  const d = Math.hypot(p.x - t.x, p.z - t.z);
  if (d <= T.LEASH_M) { p.leashT = 0; return; }
  p.leashT += dt;
  if (p.leashT < T.LEASH_WARN_S) return;
  const sp = spawnPoint(game);
  p.x = sp.x;
  p.z = sp.z;
  p.leashT = 0;
  pushEvent(game, { type: "teleport", pid: p.pid, x: p.x, z: p.z });
}

export function tickPlayers(game, dt) {
  const T = game.tune;
  const gone = [];
  game.players.forEach((p) => {
    if (p.conn === "lost") {
      if (game.time - p.lostAt >= T.DISCONNECT_GRACE_S) gone.push(p.pid);
      return;
    }
    const mag = Math.hypot(p.stick.x, p.stick.y);
    const dx = p.stick.x * T.PLAYER_SPEED * dt;
    const dz = p.stick.y * T.PLAYER_SPEED * dt;
    const before = { x: p.x, z: p.z };
    if (mag > 0.001) {
      const res = slideMove(game, p.x, p.z, dx, dz, T.PLAYER_R);
      p.x = res.x;
      p.z = res.z;
      p.faceX = p.stick.x / mag;
      p.faceZ = p.stick.y / mag;
    }
    p.vx = (p.x - before.x) / dt;
    p.vz = (p.z - before.z) / dt;
    p.walkT += Math.hypot(p.vx, p.vz) * dt;
    autoTick(game, p, dt);
    leashTick(game, p, dt);
  });
  for (const pid of gone) removePlayer(game, pid);
  tickSticks(game, dt);
}
