// Track Crew — merged per-segment ground slab with vertex colours, sunken water and disposal on prune.

import * as THREE from "three";
import { PALETTE } from "../../config.js";
import { sync as sceneSync } from "./scene.js";

const ROWS = 24;
const WATER_Y = -0.17;
const SKIRT = 0.75;

const GROUND_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const WATER_MAT = new THREE.MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.92
});

const built = new Map();
const dirty = new Set();
const _c = new THREE.Color();
let root = null;
let allDirty = true;
let lastList = null;

export function init(scene) {
  root = new THREE.Group();
  root.name = "terrain";
  scene.add(root);
  built.clear();
  dirty.clear();
  allDirty = true;
  lastList = null;
  segSrc = null;
  segLen = -1;
  segAlive = -1;
}

let segSrc = null;
let segLen = -1;
let segAlive = -1;
let segCache = [];

export function segList(game) {
  const w = game && game.world;
  if (!w) return [];
  const raw = w.segments || w.chunks || [];
  let alive = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] && !raw[i].pruned) alive++;
  if (raw === segSrc && raw.length === segLen && alive === segAlive) return segCache;
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!s || s.pruned) continue;
    const len = num(s.len, s.length, s.w, s.map && s.map[0] ? s.map[0].length : 0) | 0;
    if (len <= 0) continue;
    const x0 = num(s.x0, s.originX, s.ox, s.x, 0) | 0;
    const z0 = num(s.z0, s.rowOffset, s.zOff, s.oz, s.z, 0) | 0;
    const rows = num(s.rows, s.h, s.map ? s.map.length : 0, ROWS) | 0;
    out.push({
      key: (s.id || "seg") + "@" + x0,
      id: s.id || "seg",
      biome: s.biome || (game.biome || "meadows"),
      x0,
      z0,
      len,
      rows: rows || ROWS,
      src: s
    });
  }
  segSrc = raw;
  segLen = raw.length;
  segAlive = alive;
  segCache = out;
  return out;
}

function num() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (typeof v === "number" && isFinite(v)) return v;
  }
  return 0;
}

const GROUND_CHAR = {
  "~": "water",
  w: "water",
  b: "bank",
  B: "bank",
  "#": "bank",
  s: "sand",
  ",": "sand"
};

function normalizeGround(v, biome) {
  if (v == null) return null;
  if (typeof v === "object") {
    const g = v.ground != null ? v.ground : v.g;
    return normalizeGround(g, biome);
  }
  if (typeof v === "number") {
    if (v === 0) return "void";
    if (v === 1) return "grass";
    if (v === 2) return "sand";
    if (v === 3) return "water";
    if (v === 4) return "bank";
    return biome === "desert" ? "sand" : "grass";
  }
  if (typeof v !== "string") return null;
  if (v === "grass" || v === "sand" || v === "water" || v === "bank" || v === "void") return v;
  const mapped = GROUND_CHAR[v];
  if (mapped) return mapped;
  return biome === "desert" ? "sand" : "grass";
}

export function groundAt(world, x, z, biome) {
  if (!world) return null;
  const g = world.grid;
  if (!g) return null;

  if (typeof g === "function") return normalizeGround(g(x, z), biome);

  const ox = num(world.originX, world.ox, 0) | 0;
  const oz = num(world.originZ, world.oz, 0) | 0;

  if (typeof g.get === "function") {
    const v = g.get(x + "," + z);
    return v === undefined ? null : normalizeGround(v, biome);
  }
  if (Array.isArray(g) && Array.isArray(g[0])) {
    const row = g[z - oz];
    if (!row) return null;
    return normalizeGround(row[x - ox], biome);
  }
  if (Array.isArray(g) && typeof g[0] === "string" && g[0].length > 1) {
    const row = g[z - oz];
    if (!row) return null;
    return normalizeGround(row[x - ox], biome);
  }
  const w = num(world.w, world.width, 0) | 0;
  if (w > 0 && (Array.isArray(g) || ArrayBuffer.isView(g))) {
    const i = (z - oz) * w + (x - ox);
    if (i < 0 || i >= g.length) return null;
    return normalizeGround(g[i], biome);
  }
  return null;
}

function segGround(seg, world, x, z) {
  const live = groundAt(world, x, z, seg.biome);
  if (live) return live;
  const map = seg.src.map;
  if (map) {
    const row = map[z - seg.z0];
    if (typeof row === "string") {
      const ch = row[x - seg.x0];
      if (ch === "~") return "water";
      if (ch != null) return seg.biome === "desert" ? "sand" : "grass";
    }
  }
  return seg.biome === "desert" ? "sand" : "grass";
}

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

const _mixA = new THREE.Color();
const _mixB = new THREE.Color();

function tileColor(kind, biome, x, z) {
  const b = PALETTE.biome[biome] || PALETTE.biome.meadows;
  if (kind === "water") return PALETTE.water;
  if (kind === "bank") return PALETTE.bank;
  const r = hash2(x, z);
  if (r > 0.94) return _mixA.setHex(b.ground).lerp(_mixB.setHex(b.accent), 0.55).getHex();
  if (((x + z) & 1) === 0) return b.ground;
  return _mixA.setHex(b.groundAlt).lerp(_mixB.setHex(b.ground), 0.6).getHex();
}

function Builder() {
  return { pos: [], nor: [], col: [], idx: [], n: 0 };
}

function quad(B, p, n, hex) {
  _c.setHex(hex).convertSRGBToLinear();
  for (let i = 0; i < 4; i++) {
    B.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    B.nor.push(n[0], n[1], n[2]);
    B.col.push(_c.r, _c.g, _c.b);
  }
  const s = B.n;
  B.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  B.n += 4;
}

function top(B, x, z, y, hex) {
  quad(B, [x, y, z + 1, x + 1, y, z + 1, x + 1, y, z, x, y, z], [0, 1, 0], hex);
}

function wall(B, x, z, side, yTop, yBot, hex) {
  if (side === 0) quad(B, [x, yTop, z, x + 1, yTop, z, x + 1, yBot, z, x, yBot, z], [0, 0, -1], hex);
  else if (side === 1) quad(B, [x + 1, yTop, z + 1, x, yTop, z + 1, x, yBot, z + 1, x + 1, yBot, z + 1], [0, 0, 1], hex);
  else if (side === 2) quad(B, [x, yTop, z + 1, x, yTop, z, x, yBot, z, x, yBot, z + 1], [-1, 0, 0], hex);
  else quad(B, [x + 1, yTop, z, x + 1, yTop, z + 1, x + 1, yBot, z + 1, x + 1, yBot, z], [1, 0, 0], hex);
}

function finish(B) {
  if (B.n === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(B.nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(B.col, 3));
  g.setIndex(B.idx);
  g.computeBoundingSphere();
  return g;
}

function buildSegment(seg, world) {
  const land = Builder();
  const water = Builder();
  const b = PALETTE.biome[seg.biome] || PALETTE.biome.meadows;
  const skirtHex = new THREE.Color(b.ground).multiplyScalar(0.55).getHex();
  const x1 = seg.x0 + seg.len;
  const z1 = seg.z0 + seg.rows;

  const kinds = new Array(seg.len * seg.rows);
  for (let z = seg.z0; z < z1; z++) {
    for (let x = seg.x0; x < x1; x++) {
      kinds[(z - seg.z0) * seg.len + (x - seg.x0)] = segGround(seg, world, x, z);
    }
  }
  const kindAt = (x, z) => {
    if (x < seg.x0 || x >= x1 || z < seg.z0 || z >= z1) {
      return groundAt(world, x, z, seg.biome) || "grass";
    }
    return kinds[(z - seg.z0) * seg.len + (x - seg.x0)];
  };

  for (let z = seg.z0; z < z1; z++) {
    for (let x = seg.x0; x < x1; x++) {
      const k = kindAt(x, z);
      if (k === "void") continue;
      const hex = tileColor(k, seg.biome, x, z);
      if (k === "water") {
        top(water, x, z, WATER_Y, hex);
        const deep = PALETTE.waterDeep;
        if (kindAt(x, z - 1) !== "water") wall(land, x, z, 0, 0, WATER_Y, deep);
        if (kindAt(x, z + 1) !== "water") wall(land, x, z, 1, 0, WATER_Y, deep);
        if (kindAt(x - 1, z) !== "water") wall(land, x, z, 2, 0, WATER_Y, deep);
        if (kindAt(x + 1, z) !== "water") wall(land, x, z, 3, 0, WATER_Y, deep);
      } else {
        top(land, x, z, k === "bank" ? 0.01 : 0, hex);
      }
      if (z === seg.z0) wall(land, x, z, 0, k === "water" ? WATER_Y : 0, -SKIRT, skirtHex);
      if (z === z1 - 1) wall(land, x, z, 1, k === "water" ? WATER_Y : 0, -SKIRT, skirtHex);
    }
  }

  const group = new THREE.Group();
  const gl = finish(land);
  if (gl) {
    const m = new THREE.Mesh(gl, GROUND_MAT);
    m.receiveShadow = true;
    m.castShadow = false;
    group.add(m);
  }
  const gw = finish(water);
  if (gw) {
    const m = new THREE.Mesh(gw, WATER_MAT);
    m.receiveShadow = true;
    m.castShadow = false;
    group.add(m);
  }
  return group;
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
  if (group.parent) group.parent.remove(group);
}

function markDirtyAt(game, x, z) {
  const segs = segList(game);
  for (const s of segs) {
    if (x >= s.x0 && x < s.x0 + s.len && z >= s.z0 && z < s.z0 + s.rows) {
      dirty.add(s.key);
      return;
    }
  }
}

const REBUILD_EVENTS = {
  bankBuilt: 1,
  buildBank: 1,
  tileChanged: 1,
  worldChanged: 1,
  explosion: 1,
  dynamite: 1
};

export function sync(game, dt, events) {
  if (!game) return;
  sceneSync(game, dt);
  if (!root || !game.world) return;

  const list = events || [];
  for (let i = 0; i < list.length; i++) {
    const ev = list[i];
    const t = ev && (ev.type || ev.t || ev.kind);
    if (!t) continue;
    if (t === "roundBuilt" || t === "worldReset" || t === "newRound") allDirty = true;
    else if (REBUILD_EVENTS[t]) {
      if (typeof ev.x === "number" && typeof ev.z === "number") markDirtyAt(game, ev.x, ev.z);
      else allDirty = true;
    }
  }

  const segs = segList(game);
  if (segs === lastList && dirty.size === 0 && !allDirty) return;
  lastList = segs;

  const live = new Set();
  for (const s of segs) {
    live.add(s.key);
    const have = built.get(s.key);
    if (!have || allDirty || dirty.has(s.key)) {
      if (have) disposeGroup(have);
      const g = buildSegment(s, game.world);
      root.add(g);
      built.set(s.key, g);
    }
  }
  dirty.clear();
  allDirty = false;

  if (built.size !== live.size) {
    for (const [key, group] of built) {
      if (!live.has(key)) {
        disposeGroup(group);
        built.delete(key);
      }
    }
  }
}

export function dispose() {
  for (const [, group] of built) disposeGroup(group);
  built.clear();
}
