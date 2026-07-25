// Track Crew — crew characters: voxel avatars, carried stack over the head, tool swing and the no-signal freeze.

import * as THREE from "three";
import { PALETTE, TUNE, CAM_YAW } from "../../config.js";
import { TOOLS } from "../../data/tools.js";
import { buildAvatar, setAvatarWalk, disposeAvatar, voxBox, voxMerge, voxMaterial } from "../../shared/avatar3d.js";

const STACK_MAX = 12;
const CARRY_HEX = {
  wood: PALETTE.wood,
  iron: PALETTE.iron,
  rail: PALETTE.rail
};

const crew = new Map();
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

let root = null;
let unitGeo = null;
let toolGeos = null;
let signalGeo = null;

function makeToolGeos() {
  return {
    tool_axe: voxMerge([
      voxBox(0.08, 0.52, 0.08, PALETTE.sleeper, 0, 0, 0),
      voxBox(0.26, 0.2, 0.11, PALETTE.iron, 0.1, 0.24, 0)
    ]),
    tool_pick: voxMerge([
      voxBox(0.08, 0.52, 0.08, PALETTE.sleeper, 0, 0, 0),
      voxBox(0.52, 0.1, 0.1, PALETTE.iron, 0, 0.24, 0)
    ]),
    tool_bucket: voxMerge([
      voxBox(0.32, 0.28, 0.32, PALETTE.cyan, 0, -0.14, 0),
      voxBox(0.26, 0.06, 0.26, PALETTE.ink, 0, -0.02, 0),
      voxBox(0.36, 0.06, 0.36, PALETTE.ink, 0, 0.02, 0)
    ]),
    tool_bucket_full: voxMerge([
      voxBox(0.32, 0.28, 0.32, PALETTE.cyan, 0, -0.14, 0),
      voxBox(0.28, 0.07, 0.28, PALETTE.water, 0, -0.01, 0),
      voxBox(0.36, 0.06, 0.36, PALETTE.ink, 0, 0.03, 0),
      voxBox(0.1, 0.06, 0.1, PALETTE.cream, 0.06, 0.03, -0.05)
    ]),
    stick: voxMerge([
      voxBox(0.15, 0.4, 0.15, PALETTE.coral, 0, 0, 0),
      voxBox(0.17, 0.06, 0.17, PALETTE.cream, 0, 0.06, 0),
      voxBox(0.05, 0.14, 0.05, PALETTE.ink, 0, 0.26, 0)
    ])
  };
}

export function init(scene) {
  root = new THREE.Group();
  root.name = "crew";
  scene.add(root);
  crew.clear();
  unitGeo = voxBox(0.36, 0.16, 0.36, 0xFFFFFF, 0, 0, 0);
  toolGeos = makeToolGeos();
  signalGeo = voxMerge([
    voxBox(0.46, 0.46, 0.1, PALETTE.coral, 0, 0, 0),
    voxBox(0.1, 0.22, 0.14, PALETTE.cream, 0, 0.05, 0.02),
    voxBox(0.1, 0.1, 0.14, PALETTE.cream, 0, -0.14, 0.02)
  ]);
}

function makeCrew(p) {
  const group = buildAvatar({ hat: p.hat, colorIdx: p.colorIdx, skinIdx: p.skinIdx });
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  const stack = new THREE.InstancedMesh(unitGeo, voxMaterial(), STACK_MAX);
  stack.castShadow = true;
  stack.frustumCulled = false;
  stack.count = 0;
  stack.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stack.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(STACK_MAX * 3), 3);
  group.add(stack);

  const crate = new THREE.Mesh(voxMerge([
    voxBox(0.86, 0.62, 0.86, PALETTE.wagon, 0, 0, 0),
    voxBox(0.9, 0.12, 0.9, PALETTE.ink, 0, 0.2, 0),
    voxBox(0.3, 0.3, 0.3, PALETTE.yellow, 0, 0.4, 0)
  ]), voxMaterial());
  crate.position.set(0, 1.75, 0);
  crate.castShadow = true;
  crate.visible = false;
  group.add(crate);

  const tool = new THREE.Mesh(toolGeos.tool_axe, voxMaterial());
  tool.position.set(0, -0.4, 0.12);
  tool.rotation.x = -0.35;
  tool.castShadow = true;
  tool.visible = false;
  group.userData.rig.armR.add(tool);

  const signal = new THREE.Mesh(signalGeo, voxMaterial());
  signal.position.set(0, 1.95, 0);
  signal.visible = false;
  group.add(signal);

  return { group, stack, crate, tool, signal, phase: Math.random() * 6.28, px: p.x, pz: p.z, sway: 0, swing: 0 };
}

function carryHex(k) {
  if (!k) return null;
  const hex = CARRY_HEX[k];
  return hex == null ? null : hex;
}

function swingAngle(k, autoT, full) {
  if (!(autoT > 0)) return 0;
  if (k === "tool_axe" || k === "tool_pick") {
    const span = (k === "tool_axe" ? TOOLS.axe.hitS : TOOLS.pick.hitS) || 0.45;
    const t = Math.min(1, autoT / span);
    if (t < 0.68) return (t / 0.68) * 2.3;
    return 2.3 - ((t - 0.68) / 0.32) * 3.2;
  }
  if (k === "tool_bucket" && !full) {
    const t = Math.min(1, autoT / (TOOLS.bucket.scoopS || 1));
    return -Math.sin(t * Math.PI) * 0.85;
  }
  return 0;
}

export function sync(game, dt) {
  if (!root || !game || !game.players) return;
  const step = Math.min(Math.max(dt || 0.016, 0.001), 0.1);
  const live = new Set();

  game.players.forEach((p, pid) => {
    if (!p || typeof p.x !== "number") return;
    const key = pid + ":" + p.hat + ":" + p.colorIdx + ":" + p.skinIdx;
    live.add(key);
    let c = crew.get(key);
    if (!c) {
      c = makeCrew(p);
      root.add(c.group);
      crew.set(key, c);
    }

    const lost = p.conn === "lost";
    const vx = typeof p.vx === "number" ? p.vx : (p.x - c.px) / step;
    const vz = typeof p.vz === "number" ? p.vz : (p.z - c.pz) / step;
    c.px = p.x;
    c.pz = p.z;
    const speed = lost ? 0 : Math.hypot(vx, vz);

    c.group.position.set(p.x, 0, p.z);
    const fx = typeof p.faceX === "number" ? p.faceX : 0;
    const fz = typeof p.faceZ === "number" ? p.faceZ : 1;
    if (fx !== 0 || fz !== 0) {
      const want = Math.atan2(fx, fz);
      let d = want - c.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      c.group.rotation.y += d * Math.min(1, step * 16);
    }

    const norm = Math.min(speed / TUNE.PLAYER_SPEED, 1.35);
    c.phase += step * (4 + norm * 9);
    c.group.userData.amp = lost ? 0 : Math.min(1, norm * 1.25);
    setAvatarWalk(c.group, c.phase);

    c.sway += ((norm > 0.05 ? Math.sin(c.phase) * 0.06 : 0) - c.sway) * Math.min(1, step * 9);

    const carry = p.carry;
    const k = carry && carry.k;
    const hex = carryHex(k);
    let n = 0;
    if (hex != null) {
      n = Math.min(carry.n || 1, STACK_MAX);
      for (let i = 0; i < n; i++) {
        dummy.position.set(c.sway * (i + 1) * 0.5, 1.56 + i * 0.17, 0);
        dummy.rotation.set(0, (i % 2) * 0.24 - 0.12, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        c.stack.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(hex).convertSRGBToLinear();
        c.stack.instanceColor.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
      }
      c.stack.instanceColor.needsUpdate = true;
      c.stack.instanceMatrix.needsUpdate = true;
    }
    c.stack.count = n;

    const isCrate = typeof k === "string" && (k.indexOf("wagon_crate") === 0 || k.indexOf("upgrade_crate") === 0);
    c.crate.visible = isCrate;

    const geoKey = k === "tool_bucket" && p.bucketFull ? "tool_bucket_full" : k;
    const toolGeo = geoKey && toolGeos[geoKey];
    if (toolGeo) {
      c.tool.geometry = toolGeo;
      c.tool.visible = true;
    } else {
      c.tool.visible = false;
    }

    const want = lost ? 0 : swingAngle(k, p.autoT, p.bucketFull);
    c.swing += (want - c.swing) * Math.min(1, step * 26);
    if (Math.abs(c.swing) > 0.005) {
      const rig = c.group.userData.rig;
      rig.armR.rotation.x += c.swing;
      rig.armL.rotation.x += c.swing * 0.25;
      rig.torso.rotation.x = -c.swing * 0.12;
    } else if (c.group.userData.rig.torso.rotation.x !== 0) {
      c.group.userData.rig.torso.rotation.x = 0;
    }

    c.signal.visible = lost;
    if (lost) c.signal.rotation.y = -c.group.rotation.y - CAM_YAW;
  });

  for (const [key, c] of crew) {
    if (!live.has(key)) {
      drop(c);
      crew.delete(key);
    }
  }
}

function drop(c) {
  c.group.remove(c.stack);
  c.group.remove(c.crate);
  c.group.remove(c.signal);
  if (c.tool.parent) c.tool.parent.remove(c.tool);
  c.crate.geometry.dispose();
  c.stack.dispose();
  root.remove(c.group);
  disposeAvatar(c.group);
}

export function dispose() {
  for (const [, c] of crew) drop(c);
  crew.clear();
}
