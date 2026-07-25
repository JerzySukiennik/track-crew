// Track Crew — rail placement, auto-connect shapes, the rail spline and the green placeable-tile query.

import { pushEvent } from "./state.js";
import { isRailable, tileKey } from "./world.js";

const CORNER = 0.36;
const DIRS = [{ dx: 1, dz: 0, n: "e" }, { dx: -1, dz: 0, n: "w" }, { dx: 0, dz: 1, n: "s" }, { dx: 0, dz: -1, n: "n" }];
const OPPOSITE = { e: "w", w: "e", n: "s", s: "n" };
const SHAPES = { ew: "ew", we: "ew", ns: "ns", sn: "ns", ne: "ne", en: "ne", nw: "nw", wn: "nw", se: "se", es: "se", sw: "sw", ws: "sw" };

function dirName(a, b) {
  if (b.x > a.x) return "e";
  if (b.x < a.x) return "w";
  if (b.z > a.z) return "s";
  return "n";
}

function dirVec(name) {
  for (const d of DIRS) if (d.n === name) return d;
  return DIRS[0];
}

function shapeOf(back, fwd) {
  if (back === fwd) return back === "e" || back === "w" ? "ew" : "ns";
  return SHAPES[back + fwd] || "ew";
}

function applyShapes(list) {
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const prev = i > 0 ? list[i - 1] : null;
    const next = i < list.length - 1 ? list[i + 1] : null;
    const inDir = prev ? dirName(prev, t) : (next ? dirName(t, next) : "e");
    const outDir = next ? dirName(t, next) : inDir;
    t.shape = shapeOf(OPPOSITE[inDir], outDir);
    t.inDir = inDir;
    t.outDir = outDir;
  }
}

function rebuildPoints(game) {
  const r = game.rails;
  const chain = r.chain;
  const pts = [];
  for (let i = 0; i < chain.length; i++) {
    const t = chain[i];
    const cx = t.x + 0.5;
    const cz = t.z + 0.5;
    const inD = dirVec(t.inDir);
    const outD = dirVec(t.outDir);
    t.pointIndex = pts.length;
    if (t.inDir === t.outDir) {
      pts.push({ x: cx, z: cz });
    } else {
      pts.push({ x: cx - inD.dx * CORNER, z: cz - inD.dz * CORNER });
      pts.push({ x: cx + outD.dx * CORNER, z: cz + outD.dz * CORNER });
    }
  }
  const cum = new Array(pts.length);
  let total = 0;
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    cum[i] = total;
  }
  r.points = pts;
  r.cum = cum;
  r.totalLen = pts.length ? total : 0;
  for (let i = 0; i < chain.length; i++) {
    const t = chain[i];
    t.s = cum[t.pointIndex] == null ? 0 : cum[t.pointIndex];
  }
  r.lastTile = chain.length ? chain[chain.length - 1] : null;
}

export function refreshRails(game) {
  const r = game.rails;
  applyShapes(r.chain);
  applyShapes(r.pending);
  rebuildPoints(game);
}

function register(game, t) {
  const r = game.rails;
  const key = tileKey(t.x, t.z);
  r.set.add(key);
  r.tiles.push(t);
  return key;
}

export function addChainRun(game, tiles) {
  const r = game.rails;
  for (const t of tiles) {
    const key = tileKey(t.x, t.z);
    if (r.set.has(key)) continue;
    const tile = { x: t.x, z: t.z, shape: "ew", hidden: false, pending: false, s: 0 };
    register(game, tile);
    r.chain.push(tile);
  }
  refreshRails(game);
  absorbPending(game);
  return r.chain.length;
}

export function addPendingRun(game, tiles) {
  const r = game.rails;
  for (const t of tiles) {
    const key = tileKey(t.x, t.z);
    if (r.set.has(key)) continue;
    const tile = { x: t.x, z: t.z, shape: "ew", hidden: false, pending: true, s: 0 };
    register(game, tile);
    r.pending.push(tile);
    r.pendingSet.add(key);
  }
  refreshRails(game);
  return r.pending.length;
}

function absorbPending(game) {
  const r = game.rails;
  if (!r.pending.length || !r.lastTile) return 0;
  const last = r.lastTile;
  let hit = -1;
  for (let i = 0; i < r.pending.length; i++) {
    const t = r.pending[i];
    if (Math.abs(t.x - last.x) + Math.abs(t.z - last.z) === 1) { hit = i; break; }
  }
  if (hit < 0) return 0;
  const dropped = r.pending.slice(0, hit);
  const taken = r.pending.slice(hit);
  for (const t of dropped) {
    const key = tileKey(t.x, t.z);
    r.set.delete(key);
    r.pendingSet.delete(key);
    const idx = r.tiles.indexOf(t);
    if (idx >= 0) r.tiles.splice(idx, 1);
  }
  for (const t of taken) {
    t.pending = false;
    r.pendingSet.delete(tileKey(t.x, t.z));
    r.chain.push(t);
  }
  r.pending = [];
  refreshRails(game);
  pushEvent(game, { type: "railJoined", count: taken.length, x: last.x, z: last.z });
  return taken.length;
}

export function greenTiles(game) {
  const r = game.rails;
  const out = [];
  const last = r.lastTile;
  if (!last) return out;
  const prev = r.chain.length > 1 ? r.chain[r.chain.length - 2] : null;
  for (const d of DIRS) {
    const x = last.x + d.dx;
    const z = last.z + d.dz;
    if (prev && prev.x === x && prev.z === z) continue;
    if (x < last.x) continue;
    const key = tileKey(x, z);
    if (r.set.has(key) && !r.pendingSet.has(key)) continue;
    if (r.pendingSet.has(key)) { out.push({ x, z, join: true }); continue; }
    if (!isRailable(game.world, x, z)) continue;
    out.push({ x, z, join: false });
  }
  return out;
}

export function isGreen(game, x, z) {
  const list = greenTiles(game);
  for (const t of list) if (t.x === x && t.z === z) return true;
  return false;
}

export function railAt(game, x, z) {
  return game.rails.set.has(tileKey(x, z));
}

export function tryPlaceRail(game, x, z, pid) {
  const r = game.rails;
  const p = pid != null ? game.players.get(pid) : null;
  if (p && (!p.carry || p.carry.k !== "rail" || p.carry.n <= 0)) return false;
  if (!isGreen(game, x, z)) return false;
  const key = tileKey(x, z);
  if (r.pendingSet.has(key)) {
    absorbPending(game);
  } else {
    const tile = { x, z, shape: "ew", hidden: false, pending: false, s: 0 };
    register(game, tile);
    r.chain.push(tile);
    refreshRails(game);
    if (p) {
      p.carry.n -= 1;
      if (p.carry.n <= 0) p.carry = null;
    }
    absorbPending(game);
  }
  pushEvent(game, { type: "railPlaced", x, z, pid: p ? p.pid : null });
  return true;
}

export function splineLength(game) {
  return game.rails.totalLen;
}

export function splinePoint(game, s) {
  const r = game.rails;
  const pts = r.points;
  if (!pts.length) return { x: 0, z: 0, dirX: 1, dirZ: 0 };
  if (pts.length === 1) return { x: pts[0].x, z: pts[0].z, dirX: 1, dirZ: 0 };
  const cum = r.cum;
  if (s <= 0) {
    const a = pts[0];
    const b = pts[1];
    const len = Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    return { x: a.x + dx * s, z: a.z + dz * s, dirX: dx, dirZ: dz };
  }
  if (s >= r.totalLen) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const len = Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const over = s - r.totalLen;
    return { x: b.x + dx * over, z: b.z + dz * over, dirX: dx, dirZ: dz };
  }
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = Math.max(1e-6, cum[hi] - cum[lo]);
  const t = (s - cum[lo]) / seg;
  const dx = (b.x - a.x) / seg;
  const dz = (b.z - a.z) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dirX: dx, dirZ: dz };
}

export function sAtTile(game, x, z) {
  const r = game.rails;
  for (let i = r.chain.length - 1; i >= 0; i--) {
    const t = r.chain[i];
    if (t.x === x && t.z === z) return t.s;
  }
  return null;
}

export function chainTileAtX(game, x) {
  const r = game.rails;
  for (let i = r.chain.length - 1; i >= 0; i--) {
    if (r.chain[i].x <= x) return r.chain[i];
  }
  return null;
}

export function sAtX(game, x) {
  const t = chainTileAtX(game, x);
  return t ? t.s : null;
}

export function dropPending(game) {
  const r = game.rails;
  if (!r.pending.length) return 0;
  const n = r.pending.length;
  for (const t of r.pending) {
    const key = tileKey(t.x, t.z);
    r.set.delete(key);
    r.pendingSet.delete(key);
    const idx = r.tiles.indexOf(t);
    if (idx >= 0) r.tiles.splice(idx, 1);
  }
  r.pending = [];
  refreshRails(game);
  return n;
}

export function resetRails(game) {
  const r = game.rails;
  r.tiles = [];
  r.set = new Set();
  r.chain = [];
  r.pending = [];
  r.pendingSet = new Set();
  r.points = [];
  r.cum = [];
  r.totalLen = 0;
  r.lastTile = null;
}
