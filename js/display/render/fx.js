// Track Crew — voxel debris, dust, steam, teleport rings, station beacon, thrown dynamite and the leash edge arrows.

import * as THREE from "three";
import { PALETTE, TUNE } from "../../config.js";
import { COLOR_OPTIONS } from "../../data/avatars.js";
import { voxBox, voxMerge, voxMaterial } from "../../shared/avatar3d.js";
import { activeCamera } from "../camera.js";
import { trainPose } from "./trainmesh.js";

const MAX = 260;
const RINGS = 6;
const LEASH = 5;
const STICKS = 8;
const ARROW_EDGE_X = 0.86;
const ARROW_EDGE_Y = 0.8;
const ARROW_DEPTH = 12;
const ARROW_SCREEN = 0.115;

const P = {
  x: new Float32Array(MAX),
  y: new Float32Array(MAX),
  z: new Float32Array(MAX),
  vx: new Float32Array(MAX),
  vy: new Float32Array(MAX),
  vz: new Float32Array(MAX),
  life: new Float32Array(MAX),
  max: new Float32Array(MAX),
  size: new Float32Array(MAX),
  spin: new Float32Array(MAX),
  grav: new Float32Array(MAX),
  r: new Float32Array(MAX),
  g: new Float32Array(MAX),
  b: new Float32Array(MAX)
};

let head = 0;
let live = 0;

const dummy = new THREE.Object3D();
const col = new THREE.Color();
const ndc = new THREE.Vector3();
const ray = new THREE.Vector3();

let root = null;
let mesh = null;
let rings = [];
let ringI = 0;
let beacon = null;
let beaconRing = null;
let leash = [];
let stickMesh = null;
let sparkMesh = null;
let blastRing = null;
let smokeT = 0;
let sparkT = 0;
let pulse = 0;

function spawn(x, y, z, vx, vy, vz, size, life, hex, grav) {
  const i = head;
  head = (head + 1) % MAX;
  if (live < MAX) live++;
  P.x[i] = x; P.y[i] = y; P.z[i] = z;
  P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
  P.size[i] = size;
  P.life[i] = life;
  P.max[i] = life;
  P.spin[i] = (Math.random() - 0.5) * 9;
  P.grav[i] = grav == null ? 15 : grav;
  col.setHex(hex).convertSRGBToLinear();
  P.r[i] = col.r; P.g[i] = col.g; P.b[i] = col.b;
}

function burst(x, y, z, n, spread, up, size, life, hex, grav) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    spawn(
      x + (Math.random() - 0.5) * 0.4,
      y + Math.random() * 0.4,
      z + (Math.random() - 0.5) * 0.4,
      Math.cos(a) * r,
      up * (0.4 + Math.random()),
      Math.sin(a) * r,
      size * (0.6 + Math.random() * 0.8),
      life * (0.7 + Math.random() * 0.6),
      hex,
      grav
    );
  }
}

function ringAt(x, z, hex, scale, life) {
  const r = rings[ringI];
  ringI = (ringI + 1) % RINGS;
  r.visible = true;
  r.position.set(x, 0.08, z);
  r.material.color.setHex(hex);
  r.material.opacity = 0.85;
  r.scale.set(0.3, 0.3, 0.3);
  r.userData.t = 0;
  r.userData.life = life;
  r.userData.scale = scale;
}

function arrowGeo(grow) {
  const s = new THREE.Shape();
  const g = grow || 1;
  s.moveTo(0.58 * g, 0);
  s.lineTo(-0.06 * g, 0.48 * g);
  s.lineTo(-0.06 * g, 0.2 * g);
  s.lineTo(-0.58 * g, 0.2 * g);
  s.lineTo(-0.58 * g, -0.2 * g);
  s.lineTo(-0.06 * g, -0.2 * g);
  s.lineTo(-0.06 * g, -0.48 * g);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function stickGeo() {
  return voxMerge([
    voxBox(0.19, 0.52, 0.19, PALETTE.coral, 0, 0, 0),
    voxBox(0.21, 0.09, 0.21, PALETTE.cream, 0, 0.09, 0),
    voxBox(0.21, 0.09, 0.21, PALETTE.cream, 0, -0.11, 0),
    voxBox(0.06, 0.2, 0.06, PALETTE.ink, 0, 0.36, 0)
  ]);
}

export function init(scene) {
  root = new THREE.Group();
  root.name = "fx";
  scene.add(root);

  const geo = voxBox(0.24, 0.24, 0.24, 0xFFFFFF, 0, 0, 0);
  mesh = new THREE.InstancedMesh(geo, voxMaterial(), MAX);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  root.add(mesh);

  rings = [];
  const ringGeo = new THREE.RingGeometry(0.62, 1, 22);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < RINGS; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: PALETTE.cream,
      transparent: true,
      opacity: 0,
      depthWrite: false
    }));
    m.visible = false;
    m.renderOrder = 3;
    m.userData = { t: 0, life: 0.5, scale: 4 };
    root.add(m);
    rings.push(m);
  }

  const beamGeo = new THREE.CylinderGeometry(1.1, 1.5, 14, 12, 1, true);
  beamGeo.translate(0, 7, 0);
  beacon = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.yellow,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide
  }));
  beacon.visible = false;
  beacon.renderOrder = 1;
  root.add(beacon);

  const bRingGeo = new THREE.RingGeometry(2.2, 2.9, 26);
  bRingGeo.rotateX(-Math.PI / 2);
  beaconRing = new THREE.Mesh(bRingGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.yellow,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  }));
  beaconRing.position.y = 0.06;
  beaconRing.visible = false;
  beaconRing.renderOrder = 3;
  root.add(beaconRing);

  stickMesh = new THREE.InstancedMesh(stickGeo(), voxMaterial(), STICKS);
  stickMesh.frustumCulled = false;
  stickMesh.castShadow = true;
  stickMesh.count = 0;
  stickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(stickMesh);

  sparkMesh = new THREE.InstancedMesh(
    voxBox(0.17, 0.17, 0.17, 0xFFFFFF, 0, 0, 0),
    new THREE.MeshBasicMaterial({ color: PALETTE.yellow, transparent: true, opacity: 0.95, depthWrite: false }),
    STICKS
  );
  sparkMesh.frustumCulled = false;
  sparkMesh.count = 0;
  sparkMesh.renderOrder = 4;
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(sparkMesh);

  const blastGeo = new THREE.RingGeometry(0.87, 1, 26);
  blastGeo.rotateX(-Math.PI / 2);
  blastRing = new THREE.InstancedMesh(blastGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.coral, transparent: true, opacity: 0.7, depthWrite: false
  }), STICKS);
  blastRing.frustumCulled = false;
  blastRing.count = 0;
  blastRing.renderOrder = 3;
  blastRing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(blastRing);

  leash = [];
  const outlineGeo = arrowGeo(1.24);
  const fillGeo = arrowGeo(1);
  const outlineMat = new THREE.MeshBasicMaterial({
    color: PALETTE.ink, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
  });
  for (let i = 0; i < LEASH; i++) {
    const group = new THREE.Group();
    const outline = new THREE.Mesh(outlineGeo, outlineMat);
    outline.renderOrder = 20;
    group.add(outline);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({
      color: PALETTE.coral, transparent: true, opacity: 1, depthTest: false, depthWrite: false
    }));
    fill.position.z = 0.01;
    fill.renderOrder = 21;
    group.add(fill);
    group.visible = false;
    group.frustumCulled = false;
    root.add(group);
    leash.push({ group, fill });
  }

  head = 0;
  live = 0;
}

function at(ev, key, def) {
  const v = ev[key];
  if (typeof v !== "number") return def;
  return Number.isInteger(v) ? v + 0.5 : v;
}

function handle(game, ev) {
  const t = ev && (ev.type || ev.t || ev.kind);
  if (!t) return;
  const pose = trainPose(game, 0);
  const x = at(ev, "x", pose ? pose.x : 0);
  const z = at(ev, "z", pose ? pose.z : 0);

  switch (t) {
    case "explosion":
    case "dynamite":
      burst(x, 0.5, z, 34, 7.5, 7, 0.4, 1.1, PALETTE.rockDark, 17);
      burst(x, 0.8, z, 14, 3, 4.5, 0.55, 1.5, PALETTE.cream, 2);
      ringAt(x, z, PALETTE.coral, 7, 0.55);
      break;
    case "throw":
      burst(x, 1.2, z, 5, 1.2, 1.6, 0.14, 0.4, PALETTE.cream, 9);
      break;
    case "railPlaced":
    case "placeRail":
      burst(x, 0.15, z, 7, 1.6, 2, 0.17, 0.5, PALETTE.sleeper, 14);
      ringAt(x, z, PALETTE.green, 2.4, 0.4);
      break;
    case "treeFall":
    case "treeDown":
      burst(x, 1.3, z, 12, 2.2, 2.4, 0.24, 0.9, PALETTE.leaf, 11);
      break;
    case "hitTree":
    case "chop":
      burst(x, 1.0, z, 4, 1.6, 2, 0.16, 0.45, PALETTE.wood, 14);
      break;
    case "hitOre":
    case "mine":
      burst(x, 0.6, z, 4, 1.6, 2, 0.15, 0.45, PALETTE.iron, 14);
      break;
    case "oreDepleted":
    case "rockBreak":
      burst(x, 0.5, z, 10, 3, 3, 0.22, 0.7, PALETTE.rockDark, 15);
      break;
    case "gold":
    case "goldNode":
      burst(x, 0.9, z, 22, 2.6, 5, 0.2, 1.3, PALETTE.goldNode, 7);
      burst(x, 1.2, z, 8, 1.4, 4, 0.16, 1.1, PALETTE.cream, 5);
      ringAt(x, z, PALETTE.yellow, 4.2, 0.6);
      break;
    case "scoop":
    case "splash":
      burst(x, 0.1, z, 9, 2.2, 3, 0.17, 0.55, PALETTE.water, 15);
      break;
    case "pour":
    case "cool":
    case "steam":
      burst(x, 1.9, z, 12, 1.4, 2.6, 0.3, 1.1, PALETTE.cream, -1.5);
      break;
    case "teleport":
    case "leashTeleport":
    case "toolReturn":
      burst(x, 0.2, z, 18, 1.2, 6, 0.22, 0.9, PALETTE.cyan, 1);
      ringAt(x, z, PALETTE.cyan, 3.4, 0.5);
      break;
    case "derail":
    case "wreck":
      burst(x, 1.2, z, 44, 8, 8, 0.45, 1.6, PALETTE.loco, 16);
      burst(x, 1.6, z, 22, 3, 3.4, 0.7, 2.2, PALETTE.rockDark, -0.6);
      ringAt(x, z, PALETTE.coral, 9, 0.7);
      break;
    case "overheat":
      burst(x, 2.2, z, 40, 5, 7, 0.4, 1.5, PALETTE.coral, 12);
      ringAt(x, z, PALETTE.coral, 8, 0.6);
      break;
    case "arrive":
    case "station":
      burst(x, 3.2, z, 30, 4.5, 3.5, 0.26, 2.2, PALETTE.yellow, 6);
      break;
    case "buy":
    case "bought":
      burst(x, 0.8, z, 10, 1.6, 3, 0.2, 0.8, PALETTE.yellow, 8);
      break;
    default:
      break;
  }
}

function stationAhead(game) {
  if (game.phase !== "run" && game.phase !== "countdown") return null;
  const list = (game.world && game.world.stations) || [];
  const pose = trainPose(game, 0);
  if (!pose || !list.length) return null;
  let best = null;
  for (const s of list) {
    if (s.pruned) continue;
    const x = typeof s.stopX === "number" ? s.stopX
      : (typeof s.x === "number" ? s.x : (typeof s.x0 === "number" ? s.x0 + 6 : null));
    if (x == null || x < pose.x - 2) continue;
    const z = typeof s.railZ === "number" ? s.railZ
      : (typeof s.anchorZ === "number" ? s.anchorZ : (typeof s.z === "number" ? s.z : 12));
    if (!best || x < best.x) best = { x, z };
  }
  return best;
}

function syncSticks(game, step) {
  const list = game.sticks || [];
  const throwLen = Math.max(1, TUNE.DYNAMITE_THROW);
  const fuseLen = Math.max(0.2, TUNE.DYNAMITE_FUSE_S);
  let n = 0;
  let nr = 0;
  sparkT -= step;
  for (const s of list) {
    if (!s || n >= STICKS || typeof s.x !== "number") continue;
    const flying = s.state === "fly";
    const prog = flying ? Math.min(1, Math.max(0, 1 - (s.left || 0) / throwLen)) : 1;
    const y = flying ? 0.9 + Math.sin(prog * Math.PI) * 1.15 : 0.28;
    dummy.position.set(s.x, y, s.z);
    if (flying) dummy.rotation.set(pulse * 9, 0, pulse * 13);
    else dummy.rotation.set(Math.PI / 2, 0, 0);
    const body = flying ? 1.55 : 1.3;
    dummy.scale.set(body, body, body);
    dummy.updateMatrix();
    stickMesh.setMatrixAt(n, dummy.matrix);

    const blink = flying ? 1 : (Math.sin(pulse * (14 + (1 - s.fuse / fuseLen) * 30)) > 0 ? 1 : 0.25);
    const sy = flying ? y + 0.5 : 0.62;
    dummy.position.set(s.x, sy, s.z);
    dummy.rotation.set(pulse * 6, pulse * 5, 0);
    const ss = (0.9 + blink * 0.8) * (flying ? 1.2 : 1.4);
    dummy.scale.set(ss, ss, ss);
    dummy.updateMatrix();
    sparkMesh.setMatrixAt(n, dummy.matrix);
    n++;

    if (!flying && nr < STICKS) {
      const k = 1 - Math.min(1, Math.max(0, s.fuse / fuseLen));
      const r = (s.radius || 2.5) * (0.9 + 0.1 * Math.sin(pulse * (6 + k * 22)));
      dummy.position.set(s.x, 0.07, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r, 1, r);
      dummy.updateMatrix();
      blastRing.setMatrixAt(nr++, dummy.matrix);
    }
    if (sparkT <= 0) {
      spawn(s.x, sy, s.z, (Math.random() - 0.5) * 1.4, 1.6 + Math.random(), (Math.random() - 0.5) * 1.4,
        0.11, 0.35, PALETTE.yellow, 6);
    }
  }
  if (sparkT <= 0) sparkT = 0.06;
  stickMesh.count = n;
  sparkMesh.count = n;
  blastRing.count = nr;
  if (n) {
    stickMesh.instanceMatrix.needsUpdate = true;
    sparkMesh.instanceMatrix.needsUpdate = true;
  }
  if (nr) blastRing.instanceMatrix.needsUpdate = true;
}

function syncLeash(game) {
  const cam = activeCamera();
  let li = 0;
  if (cam && game.players) {
    const worldH = 2 * ARROW_DEPTH * Math.tan((cam.fov * Math.PI) / 360);
    const size = worldH * ARROW_SCREEN;
    game.players.forEach((p) => {
      if (li >= LEASH || !p || typeof p.x !== "number") return;
      if (!(p.leashT > 0)) return;
      ndc.set(p.x, 1.1, p.z).project(cam);
      let nx = ndc.x;
      let ny = ndc.y;
      if (ndc.z > 1) { nx = -nx; ny = -ny; }
      const mag = Math.hypot(nx, ny);
      if (!isFinite(mag) || mag < 1e-4) return;
      const k = Math.min(ARROW_EDGE_X / Math.max(Math.abs(nx), 1e-6), ARROW_EDGE_Y / Math.max(Math.abs(ny), 1e-6));
      const ex = nx * k;
      const ey = ny * k;

      ray.set(ex, ey, 0.5).unproject(cam).sub(cam.position).normalize();
      const rec = leash[li++];
      const m = rec.group;
      m.visible = true;
      m.position.copy(cam.position).addScaledVector(ray, ARROW_DEPTH);
      m.quaternion.copy(cam.quaternion);
      m.rotateZ(Math.atan2(ey, ex));

      const warn = Math.min(1, p.leashT / Math.max(0.5, TUNE.LEASH_WARN_S));
      const beat = 0.5 + 0.5 * Math.sin(pulse * (7 + warn * 16));
      const s = size * (0.9 + beat * 0.22);
      m.scale.set(s, s, s);
      const idx = (p.colorIdx | 0) % COLOR_OPTIONS.length;
      const opt = COLOR_OPTIONS[idx];
      rec.fill.material.color.setHex(opt && opt.hex != null ? opt.hex : PALETTE.coral);
      rec.fill.material.opacity = 0.7 + beat * 0.3;
    });
  }
  for (let i = li; i < LEASH; i++) leash[i].group.visible = false;
}

export function sync(game, dt, events) {
  if (!root || !game) return;
  const step = Math.min(Math.max(dt || 0.016, 0.001), 0.1);
  pulse += step;

  const list = events || [];
  for (let i = 0; i < list.length; i++) handle(game, list[i]);

  const train = game.train;
  const speed = train && typeof train.speed === "number" ? train.speed : 0;
  if (speed > 0.05) {
    smokeT -= step;
    if (smokeT <= 0) {
      smokeT = 0.26;
      const p = trainPose(game, 0.6);
      if (p) {
        spawn(p.x - p.dirX * 0.4, 2.9, p.z - p.dirZ * 0.4,
          (Math.random() - 0.5) * 0.5, 1.7 + Math.random(), (Math.random() - 0.5) * 0.5,
          0.5 + Math.random() * 0.3, 1.5, PALETTE.cream, -0.8);
      }
    }
  }
  if (train && train.heat > 0.82 && Math.random() < 0.35) {
    const p = trainPose(game, 3.4);
    if (p) spawn(p.x, 2.4, p.z, (Math.random() - 0.5), 2.2, (Math.random() - 0.5), 0.32, 0.9, PALETTE.coral, -1);
  }

  syncSticks(game, step);

  let n = 0;
  for (let i = 0; i < MAX; i++) {
    if (P.life[i] <= 0) continue;
    P.life[i] -= step;
    if (P.life[i] <= 0) continue;
    P.vy[i] -= P.grav[i] * step;
    P.x[i] += P.vx[i] * step;
    P.y[i] += P.vy[i] * step;
    P.z[i] += P.vz[i] * step;
    if (P.y[i] < 0.06) {
      P.y[i] = 0.06;
      P.vy[i] *= -0.32;
      P.vx[i] *= 0.62;
      P.vz[i] *= 0.62;
    }
    const k = P.life[i] / P.max[i];
    const s = P.size[i] * (0.35 + k * 0.9);
    dummy.position.set(P.x[i], P.y[i], P.z[i]);
    dummy.rotation.set(P.spin[i] * (1 - k), P.spin[i] * k, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.instanceColor.setXYZ(n, P.r[i], P.g[i], P.b[i]);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;

  for (const r of rings) {
    if (!r.visible) continue;
    r.userData.t += step;
    const k = r.userData.t / r.userData.life;
    if (k >= 1) {
      r.visible = false;
      continue;
    }
    const s = 0.3 + k * r.userData.scale;
    r.scale.set(s, s, s);
    r.material.opacity = 0.85 * (1 - k);
  }

  const st = stationAhead(game);
  const nose = st ? trainPose(game, 0) : null;
  const far = st && nose ? Math.min(1, Math.max(0, (Math.hypot(st.x - nose.x, st.z - nose.z) - 22) / 26)) : 0;
  if (st && far > 0.01) {
    beacon.visible = true;
    beaconRing.visible = true;
    beacon.position.set(st.x + 0.5, 0, st.z + 0.5);
    beaconRing.position.set(st.x + 0.5, 0.06, st.z + 0.5);
    const f = 0.5 + 0.5 * Math.sin(pulse * 2.4);
    beacon.material.opacity = (0.07 + f * 0.1) * far;
    beaconRing.material.opacity = (0.28 + f * 0.32) * far;
    const s = 1 + f * 0.06;
    beaconRing.scale.set(s, 1, s);
  } else {
    beacon.visible = false;
    beaconRing.visible = false;
  }

  syncLeash(game);
}

export function dispose() {
  if (mesh) mesh.geometry.dispose();
  if (stickMesh) stickMesh.geometry.dispose();
  if (sparkMesh) sparkMesh.geometry.dispose();
  if (blastRing) blastRing.geometry.dispose();
}
