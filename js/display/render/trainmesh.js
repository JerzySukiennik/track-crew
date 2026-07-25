// Track Crew — locomotive and wagons on the rail spline, water tank heat colour, holder stacks and hook tools.

import * as THREE from "three";
import { PALETTE, TUNE } from "../../config.js";
import { voxBox, voxMerge, voxMaterial, voxMix } from "../../shared/avatar3d.js";

const PITCH = 3.05;
const NOSE = 1.6;
const HOOK_CAP = 8;
const HOOK_Y = 1.35;
const COLD = new THREE.Color(0x1E86D8);
const HOT = new THREE.Color(0xFF3020);

const path = { x: [], z: [], cum: [], len: 0, count: -1, src: null };
const slots = new Map();
const geoCache = new Map();
const hookKits = new Map();

let root = null;
let tankMat = null;
let pulse = 0;

function buildPath(game) {
  const r = game && game.rails;
  const raw = r && r.points;
  if (!raw || !raw.length) {
    if (path.count !== 0) {
      path.count = 0;
      path.x.length = 0;
      path.z.length = 0;
      path.cum.length = 0;
      path.len = 0;
    }
    return;
  }
  if (raw === path.src && raw.length === path.count) return;
  path.src = raw;
  path.count = raw.length;
  path.x.length = 0;
  path.z.length = 0;
  path.cum.length = 0;

  const first = raw[0];
  if (typeof first === "number") {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      path.x.push(raw[i]);
      path.z.push(raw[i + 1]);
    }
  } else if (Array.isArray(first)) {
    for (const p of raw) {
      path.x.push(p[0]);
      path.z.push(p[1]);
    }
  } else {
    for (const p of raw) {
      path.x.push(p.x);
      path.z.push(typeof p.z === "number" ? p.z : p.y);
    }
  }

  let acc = 0;
  path.cum.push(0);
  for (let i = 1; i < path.x.length; i++) {
    acc += Math.hypot(path.x[i] - path.x[i - 1], path.z[i] - path.z[i - 1]);
    path.cum.push(acc);
  }
  path.len = acc;
}

const pose = { x: 0, z: 0, dirX: 1, dirZ: 0 };

export function trainPose(game, back) {
  if (!game) return null;
  const train = game.train;
  if (!back && train && typeof train.x === "number" && typeof train.dirX === "number") {
    pose.x = train.x;
    pose.z = train.z;
    pose.dirX = train.dirX;
    pose.dirZ = train.dirZ;
    return pose;
  }
  buildPath(game);
  const s = (train && typeof train.s === "number" ? train.s : 0) - (back || 0);

  if (path.x.length < 2) {
    const fx = train && typeof train.x === "number" ? train.x : 0.5;
    const fz = train && typeof train.z === "number" ? train.z : 12.5;
    pose.x = fx - (back || 0);
    pose.z = fz;
    pose.dirX = 1;
    pose.dirZ = 0;
    return pose;
  }

  const last = path.x.length - 1;
  if (s <= 0) {
    const dx = path.x[1] - path.x[0];
    const dz = path.z[1] - path.z[0];
    const l = Math.hypot(dx, dz) || 1;
    pose.dirX = dx / l;
    pose.dirZ = dz / l;
    pose.x = path.x[0] + pose.dirX * s;
    pose.z = path.z[0] + pose.dirZ * s;
    return pose;
  }
  if (s >= path.len) {
    const dx = path.x[last] - path.x[last - 1];
    const dz = path.z[last] - path.z[last - 1];
    const l = Math.hypot(dx, dz) || 1;
    pose.dirX = dx / l;
    pose.dirZ = dz / l;
    pose.x = path.x[last] + pose.dirX * (s - path.len);
    pose.z = path.z[last] + pose.dirZ * (s - path.len);
    return pose;
  }

  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = path.cum[lo + 1] - path.cum[lo] || 1;
  const t = (s - path.cum[lo]) / seg;
  const dx = path.x[lo + 1] - path.x[lo];
  const dz = path.z[lo + 1] - path.z[lo];
  const l = Math.hypot(dx, dz) || 1;
  pose.x = path.x[lo] + dx * t;
  pose.z = path.z[lo] + dz * t;
  pose.dirX = dx / l;
  pose.dirZ = dz / l;
  return pose;
}

function chassis(hex) {
  const parts = [
    voxBox(2.62, 0.34, 1.54, hex, 0, 0.52, 0),
    voxBox(2.72, 0.16, 1.2, PALETTE.ink, 0, 0.3, 0)
  ];
  const wheel = (x, z) => voxBox(0.44, 0.44, 0.2, PALETTE.ink, x, 0.24, z);
  parts.push(wheel(-0.82, -0.72), wheel(0.82, -0.72), wheel(-0.82, 0.72), wheel(0.82, 0.72));
  parts.push(
    voxBox(0.24, 0.24, 0.24, PALETTE.rockDark, 1.42, 0.55, 0),
    voxBox(0.24, 0.24, 0.24, PALETTE.rockDark, -1.42, 0.55, 0)
  );
  return parts;
}

function pips(level) {
  const out = [];
  for (let i = 0; i < (level || 0); i++) {
    out.push(voxBox(0.17, 0.17, 0.17, PALETTE.yellow, -1.0 + i * 0.26, 2.0, 0.62));
  }
  return out;
}

function bodyGeo(type, level) {
  const key = type + ":" + level;
  if (geoCache.has(key)) return geoCache.get(key);
  const p = chassis(type === "loco" ? PALETTE.ink : PALETTE.rockDark);

  if (type === "loco") {
    p.push(
      voxBox(1.9, 1.1, 1.34, PALETTE.loco, -0.25, 1.24, 0),
      voxBox(0.28, 1.22, 1.44, voxMix(PALETTE.loco, 0x000000, 0.25), -1.2, 1.24, 0),
      voxBox(1.14, 1.4, 1.42, PALETTE.cream, 0.98, 1.4, 0),
      voxBox(1.26, 0.24, 1.54, PALETTE.yellow, 0.98, 2.16, 0),
      voxBox(0.62, 0.62, 0.06, PALETTE.cyan, 0.98, 1.6, 0.72),
      voxBox(0.62, 0.62, 0.06, PALETTE.cyan, 0.98, 1.6, -0.72),
      voxBox(0.46, 0.66, 0.46, PALETTE.ink, -1.02, 2.1, 0),
      voxBox(0.58, 0.16, 0.58, PALETTE.ink, -1.02, 2.44, 0),
      voxBox(0.42, 0.3, 0.42, PALETTE.yellow, -0.1, 1.92, 0),
      voxBox(0.3, 0.3, 0.3, PALETTE.cream, -1.34, 1.5, 0)
    );
  } else if (type === "tank") {
    p.push(
      voxBox(0.24, 0.9, 0.24, PALETTE.ink, 1.1, 1.2, 0.66),
      voxBox(0.5, 0.14, 0.14, PALETTE.ink, 0.92, 1.6, 0.66),
      voxBox(2.3, 0.2, 1.4, PALETTE.cream, 0, 1.86, 0)
    );
  } else if (type === "crafter") {
    p.push(
      voxBox(2.3, 0.2, 1.42, voxMix(PALETTE.wagon, 0x000000, 0.12), 0, 0.78, 0),
      voxBox(0.2, 1.0, 1.42, PALETTE.wagon, -1.05, 1.2, 0),
      voxBox(0.2, 1.0, 1.42, PALETTE.wagon, 1.05, 1.2, 0),
      voxBox(2.3, 1.0, 0.2, PALETTE.wagon, 0, 1.2, -0.61),
      voxBox(2.3, 1.0, 0.2, PALETTE.wagon, 0, 1.2, 0.61),
      voxBox(0.22, 0.5, 0.22, PALETTE.ink, 0.75, 2.3, 0)
    );
  } else if (type === "holder") {
    p.push(
      voxBox(2.3, 0.2, 1.42, PALETTE.wagon, 0, 0.78, 0),
      voxBox(0.18, 0.9, 0.18, PALETTE.ink, -1.06, 1.2, -0.62),
      voxBox(0.18, 0.9, 0.18, PALETTE.ink, 1.06, 1.2, -0.62),
      voxBox(0.18, 0.9, 0.18, PALETTE.ink, -1.06, 1.2, 0.62),
      voxBox(0.18, 0.9, 0.18, PALETTE.ink, 1.06, 1.2, 0.62),
      voxBox(2.4, 0.14, 0.14, PALETTE.ink, 0, 1.6, -0.62),
      voxBox(2.4, 0.14, 0.14, PALETTE.ink, 0, 1.6, 0.62)
    );
  } else if (type === "ghost") {
    p.push(
      voxBox(2.2, 0.16, 1.3, PALETTE.cream, 0, 0.78, 0),
      voxBox(0.16, 1.3, 0.16, PALETTE.cream, -1.02, 1.4, -0.58),
      voxBox(0.16, 1.3, 0.16, PALETTE.cream, 1.02, 1.4, -0.58),
      voxBox(0.16, 1.3, 0.16, PALETTE.cream, -1.02, 1.4, 0.58),
      voxBox(0.16, 1.3, 0.16, PALETTE.cream, 1.02, 1.4, 0.58),
      voxBox(2.3, 0.18, 1.4, PALETTE.cyan, 0, 2.02, 0)
    );
  } else if (type === "dynamite") {
    p.push(
      voxBox(2.1, 1.0, 1.36, PALETTE.coral, 0, 1.2, 0),
      voxBox(2.2, 0.18, 1.44, PALETTE.ink, 0, 1.72, 0),
      voxBox(0.9, 0.5, 0.9, PALETTE.yellow, 0, 2.02, 0),
      voxBox(0.16, 0.34, 0.16, PALETTE.ink, 0, 2.4, 0)
    );
  } else if (type === "workshop") {
    p.push(
      voxBox(2.2, 1.3, 1.4, PALETTE.wagon, 0, 1.35, 0),
      voxBox(2.44, 0.26, 1.6, PALETTE.coral, 0, 2.12, 0),
      voxBox(1.5, 0.7, 0.08, PALETTE.ink, 0, 1.5, 0.72),
      voxBox(0.5, 0.12, 0.16, PALETTE.iron, -0.4, 1.75, 0.78),
      voxBox(0.12, 0.5, 0.16, PALETTE.iron, 0.35, 1.6, 0.78)
    );
  } else if (type === "vault") {
    p.push(
      voxBox(2.1, 0.9, 1.36, voxMix(PALETTE.wood, 0x000000, 0.1), 0, 1.15, 0),
      voxBox(2.16, 0.34, 1.42, PALETTE.yellow, 0, 1.72, 0),
      voxBox(0.16, 1.3, 1.44, PALETTE.ink, -0.6, 1.3, 0),
      voxBox(0.16, 1.3, 1.44, PALETTE.ink, 0.6, 1.3, 0),
      voxBox(0.4, 0.4, 0.18, PALETTE.yellow, 0, 1.2, 0.72)
    );
  } else {
    p.push(voxBox(2.2, 1.1, 1.4, PALETTE.wagon, 0, 1.25, 0));
  }

  p.push(...pips(level));
  const g = voxMerge(p);
  geoCache.set(key, g);
  return g;
}

function hookGeo(kind) {
  if (kind === "tool_axe") {
    return voxMerge([
      voxBox(0.08, 0.5, 0.08, PALETTE.sleeper, 0, -0.25, 0),
      voxBox(0.26, 0.18, 0.1, PALETTE.iron, 0.1, -0.02, 0)
    ]);
  }
  if (kind === "tool_pick") {
    return voxMerge([
      voxBox(0.08, 0.5, 0.08, PALETTE.sleeper, 0, -0.25, 0),
      voxBox(0.5, 0.09, 0.09, PALETTE.iron, 0, -0.02, 0)
    ]);
  }
  return voxMerge([
    voxBox(0.3, 0.28, 0.3, PALETTE.cyan, 0, -0.18, 0),
    voxBox(0.34, 0.06, 0.34, PALETTE.ink, 0, -0.03, 0)
  ]);
}

function makeSlot(type, level) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo(type, level), voxMaterial());
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const rec = { group, type, level, body, extra: null, fillW: null, fillI: null, stack: null, warn: null, cog: null };

  if (type === "tank") {
    tankMat = tankMat || new THREE.MeshLambertMaterial({ color: PALETTE.tank });
    const tank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.24, 1.36), tankMat);
    tank.position.set(-0.1, 1.3, 0);
    tank.castShadow = true;
    group.add(tank);
    const band = new THREE.Mesh(voxMerge([
      voxBox(0.2, 1.32, 1.44, PALETTE.ink, -0.75, 1.3, 0),
      voxBox(0.2, 1.32, 1.44, PALETTE.ink, 0.55, 1.3, 0)
    ]), voxMaterial());
    band.castShadow = false;
    group.add(band);
    rec.extra = tank;
  }

  if (type === "crafter") {
    const w = new THREE.Mesh(voxMerge([voxBox(0.85, 1, 1.1, PALETTE.wood, 0, 0.5, 0)]), voxMaterial());
    w.position.set(-0.5, 0.88, 0);
    w.scale.y = 0.001;
    group.add(w);
    const iw = new THREE.Mesh(voxMerge([voxBox(0.85, 1, 1.1, PALETTE.iron, 0, 0.5, 0)]), voxMaterial());
    iw.position.set(0.42, 0.88, 0);
    iw.scale.y = 0.001;
    group.add(iw);
    rec.fillW = w;
    rec.fillI = iw;

    const cog = new THREE.Mesh(voxMerge([
      voxBox(0.5, 0.5, 0.5, PALETTE.yellow, 0, 0, 0),
      voxBox(0.7, 0.18, 0.52, PALETTE.ink, 0, 0, 0),
      voxBox(0.18, 0.7, 0.52, PALETTE.ink, 0, 0, 0)
    ]), voxMaterial());
    cog.position.set(0.75, 1.95, 0);
    cog.castShadow = true;
    group.add(cog);
    rec.cog = cog;

    const warn = new THREE.Mesh(voxMerge([voxBox(0.3, 0.3, 0.3, PALETTE.coral, 0, 0, 0)]), voxMaterial());
    warn.position.set(-0.9, 2.05, 0);
    warn.visible = false;
    group.add(warn);
    rec.warn = warn;
  }

  if (type === "holder") {
    const unit = voxMerge([
      voxBox(1.7, 0.09, 0.1, PALETTE.rail, 0, 0, -0.3),
      voxBox(1.7, 0.09, 0.1, PALETTE.rail, 0, 0, 0.3),
      voxBox(0.3, 0.08, 0.8, PALETTE.sleeper, 0, -0.07, 0)
    ]);
    const stack = new THREE.InstancedMesh(unit, voxMaterial(), 30);
    stack.castShadow = true;
    stack.frustumCulled = false;
    stack.count = 0;
    stack.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(stack);
    rec.stack = stack;
  }

  return rec;
}

function slotKey(i, w) {
  return i + ":" + (w.type || "wagon") + ":" + (w.level || 0);
}

const dummy = new THREE.Object3D();

export function init(scene) {
  root = new THREE.Group();
  root.name = "train";
  scene.add(root);
  slots.clear();
  hookKits.clear();
  for (const k of ["tool_axe", "tool_pick", "tool_bucket"]) {
    const m = new THREE.InstancedMesh(hookGeo(k), voxMaterial(), HOOK_CAP);
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m);
    hookKits.set(k, { mesh: m, n: 0 });
  }
}

function invNum(inv, keys) {
  if (!inv) return 0;
  for (const k of keys) {
    const v = inv[k];
    if (typeof v === "number") return v;
  }
  return 0;
}

function syncHooks(game) {
  const t = game.train;
  const hooks = t.hookTools || [];
  for (const kit of hookKits.values()) kit.n = 0;
  const hostDir = new Map();
  for (const w of t.wagons || []) {
    if (!hostDir.has(w.type)) hostDir.set(w.type, w);
  }
  for (const h of hooks) {
    const k = typeof h === "string" ? h : (h && (h.k || h.kind));
    const kit = hookKits.get(k);
    if (!kit || kit.n >= HOOK_CAP) continue;
    const host = hostDir.get(h.host === "workshop" ? "workshop" : "tank") || hostDir.get("loco");
    const dirX = host && typeof host.dirX === "number" ? host.dirX : (t.dirX || 1);
    const dirZ = host && typeof host.dirZ === "number" ? host.dirZ : (t.dirZ || 0);
    const x = typeof h.x === "number" ? h.x : (host ? host.x : t.x);
    const z = typeof h.z === "number" ? h.z : (host ? host.z : t.z);
    dummy.position.set(x, HOOK_Y, z);
    dummy.rotation.set(0, Math.atan2(-dirZ, dirX), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    kit.mesh.setMatrixAt(kit.n++, dummy.matrix);
  }
  for (const kit of hookKits.values()) {
    kit.mesh.count = kit.n;
    kit.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function sync(game, dt) {
  if (!root || !game || !game.train) return;
  pulse += dt || 0.016;
  const train = game.train;
  const wagons = train.wagons || [];

  const live = new Set();
  for (let i = 0; i < wagons.length; i++) {
    const w = wagons[i];
    if (!w) continue;
    const key = slotKey(i, w);
    live.add(key);
    let rec = slots.get(key);
    if (!rec) {
      rec = makeSlot(w.type || "wagon", w.level || 0);
      root.add(rec.group);
      slots.set(key, rec);
    }

    const p = typeof w.x === "number" && typeof w.dirX === "number"
      ? w
      : trainPose(game, NOSE + i * PITCH);
    rec.group.position.set(p.x, 0, p.z);
    rec.group.rotation.y = Math.atan2(-p.dirZ, p.dirX);

    if (rec.type === "tank" && rec.extra) {
      const heat = Math.min(Math.max(train.heat || 0, 0), 1);
      const col = COLD.clone().lerp(HOT, heat);
      rec.extra.material.color.copy(col);
      rec.extra.material.emissive.setRGB(heat * heat * 0.5, heat * heat * 0.03, 0);
      if (heat > 0.75) {
        const f = 0.6 + 0.4 * Math.sin(pulse * 9);
        rec.extra.material.emissive.multiplyScalar(f);
      }
    }

    if (rec.type === "crafter") {
      const cap = 10 + (rec.level || 0) * 10;
      const wood = invNum(w.inv, ["wood"]);
      const iron = invNum(w.inv, ["iron"]);
      rec.fillW.scale.y = Math.max(0.001, Math.min(1, wood / cap));
      rec.fillI.scale.y = Math.max(0.001, Math.min(1, iron / cap));
      const cycle = Math.max(0.1, TUNE.CRAFT_CYCLE_S);
      const prog = Math.min(1, Math.max(0, invNum(w.inv, ["t"]) / cycle));
      if (rec.cog) {
        rec.cog.rotation.z = -prog * Math.PI * 0.5;
        const pop = prog > 0.92 ? 1.18 : 1;
        rec.cog.scale.set(pop, pop, pop);
      }
      const idle = w.blink != null
        ? !!w.blink
        : !((wagons[i - 1] && wagons[i - 1].type === "holder") || (wagons[i + 1] && wagons[i + 1].type === "holder"));
      rec.warn.visible = idle && Math.sin(pulse * 6) > 0;
    }

    if (rec.type === "holder" && rec.stack) {
      const n = Math.min(invNum(w.inv, ["rails", "rail"]), 30);
      for (let r = 0; r < n; r++) {
        const layer = Math.floor(r / 3);
        const col = r % 3;
        dummy.position.set(-0.6 + col * 0.6, 0.94 + layer * 0.13, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        rec.stack.setMatrixAt(r, dummy.matrix);
      }
      rec.stack.count = n;
      rec.stack.instanceMatrix.needsUpdate = true;
    }
  }

  for (const [key, rec] of slots) {
    if (!live.has(key)) {
      root.remove(rec.group);
      slots.delete(key);
    }
  }

  syncHooks(game);
}

export function locoPose(game) {
  return trainPose(game, 0);
}

export function dispose() {
  for (const [, g] of geoCache) g.dispose();
  geoCache.clear();
  for (const kit of hookKits.values()) kit.mesh.geometry.dispose();
  hookKits.clear();
  slots.clear();
}
