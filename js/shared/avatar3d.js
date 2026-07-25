// Track Crew — voxel crew member builder shared by the TV world and the phone join preview.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HATS, COLOR_OPTIONS, SKIN_OPTIONS, clampHat, clampColor, clampSkin } from "../data/avatars.js";

const INK = 0x141414;
const CREAM = 0xFFF6E9;
const BOOT = 0x3B3B42;
const STRAW = 0xE0BA6A;
const LEATHER = 0x8A5A32;

const SHARED_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

const _c = new THREE.Color();

function box(w, h, d, hex, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x || 0, y || 0, z || 0);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.setHex(hex).convertSRGBToLinear();
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

function part(parts, castShadow) {
  const mesh = new THREE.Mesh(merge(parts), SHARED_MATERIAL);
  mesh.castShadow = castShadow !== false;
  mesh.receiveShadow = false;
  return mesh;
}

function hatParts(hatId, cloth, skin) {
  switch (hatId) {
    case "cap":
      return [
        box(0.50, 0.16, 0.50, cloth, 0, 0.08, 0),
        box(0.46, 0.07, 0.26, cloth, 0, 0.02, -0.34),
        box(0.16, 0.06, 0.06, CREAM, 0, 0.13, 0.25)
      ];
    case "cowboy":
      return [
        box(0.84, 0.07, 0.72, LEATHER, 0, 0.035, 0),
        box(0.40, 0.24, 0.40, LEATHER, 0, 0.18, 0),
        box(0.42, 0.06, 0.42, 0x5E3B20, 0, 0.09, 0)
      ];
    case "beanie":
      return [
        box(0.52, 0.18, 0.52, cloth, 0, 0.09, 0),
        box(0.54, 0.08, 0.54, CREAM, 0, 0.02, 0),
        box(0.14, 0.14, 0.14, CREAM, 0, 0.24, 0)
      ];
    case "top":
      return [
        box(0.62, 0.06, 0.62, INK, 0, 0.03, 0),
        box(0.38, 0.40, 0.38, INK, 0, 0.26, 0),
        box(0.40, 0.08, 0.40, cloth, 0, 0.12, 0)
      ];
    case "straw":
      return [
        box(0.92, 0.06, 0.82, STRAW, 0, 0.03, 0),
        box(0.40, 0.20, 0.40, STRAW, 0, 0.16, 0),
        box(0.42, 0.05, 0.42, cloth, 0, 0.09, 0)
      ];
    default:
      return [box(0.44, 0.07, 0.42, mix(skin, INK, 0.55), 0, 0.02, 0)];
  }
}

function mix(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

export function buildAvatar(opts) {
  const o = opts || {};
  const hat = HATS[clampHat(typeof o.hat === "number" ? o.hat : HATS.findIndex((h) => h.id === o.hat))] || HATS[0];
  const cloth = COLOR_OPTIONS[clampColor(o.colorIdx)].hex;
  const skin = SKIN_OPTIONS[clampSkin(o.skinIdx)].hex;
  const clothDark = mix(cloth, INK, 0.3);

  const group = new THREE.Group();

  const torso = part([
    box(0.56, 0.44, 0.34, cloth, 0, 0.64, 0),
    box(0.58, 0.09, 0.36, clothDark, 0, 0.46, 0),
    box(0.20, 0.16, 0.02, CREAM, 0, 0.68, 0.18)
  ]);
  group.add(torso);

  const headParts = [
    box(0.46, 0.44, 0.44, skin, 0, 0.22, 0),
    box(0.09, 0.09, 0.03, INK, -0.11, 0.26, 0.22),
    box(0.09, 0.09, 0.03, INK, 0.11, 0.26, 0.22),
    box(0.16, 0.05, 0.03, mix(skin, INK, 0.45), 0, 0.11, 0.22)
  ];
  for (const p of hatParts(hat.id, cloth, skin)) {
    p.translate(0, 0.44, 0);
    headParts.push(p);
  }
  const head = part(headParts);
  head.position.set(0, 0.88, 0);
  group.add(head);

  const armGeo = (side) => [
    box(0.15, 0.34, 0.20, cloth, 0, -0.17, 0),
    box(0.16, 0.11, 0.21, skin, 0, -0.39, 0)
  ];
  const armL = part(armGeo(-1));
  armL.position.set(-0.36, 0.86, 0);
  group.add(armL);
  const armR = part(armGeo(1));
  armR.position.set(0.36, 0.86, 0);
  group.add(armR);

  const legGeo = () => [
    box(0.21, 0.36, 0.24, clothDark, 0, -0.18, 0),
    box(0.23, 0.10, 0.30, BOOT, 0, -0.41, 0.03)
  ];
  const legL = part(legGeo());
  legL.position.set(-0.14, 0.46, 0);
  group.add(legL);
  const legR = part(legGeo());
  legR.position.set(0.14, 0.46, 0);
  group.add(legR);

  group.userData.rig = { torso, head, armL, armR, legL, legR };
  group.userData.amp = 1;
  group.userData.headY = 1.42;
  group.userData.cloth = cloth;
  group.userData.skin = skin;
  return group;
}

export function setAvatarWalk(group, phase) {
  const rig = group && group.userData && group.userData.rig;
  if (!rig) return;
  const amp = group.userData.amp == null ? 1 : group.userData.amp;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const swing = s * 0.85 * amp;
  const over = Math.sin(phase * 2) * 0.12 * amp;

  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.8;
  rig.armR.rotation.x = swing * 0.8;
  rig.armL.rotation.z = 0.06 + amp * 0.05;
  rig.armR.rotation.z = -0.06 - amp * 0.05;

  const bob = Math.abs(c) * 0.055 * amp;
  rig.torso.position.y = bob;
  rig.head.position.y = 0.88 + bob;
  rig.armL.position.y = 0.86 + bob;
  rig.armR.position.y = 0.86 + bob;
  rig.torso.rotation.z = over * 0.35;
  rig.head.rotation.z = -over * 0.5;
  rig.head.rotation.x = -amp * 0.06;
}

export function disposeAvatar(group) {
  group.traverse((o) => {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
}

export function avatarMaterial() {
  return SHARED_MATERIAL;
}

export function voxBox(w, h, d, hex, x, y, z) {
  return box(w, h, d, hex, x, y, z);
}

export function voxMerge(parts) {
  return merge(parts);
}

export function voxMaterial() {
  return SHARED_MATERIAL;
}

export function voxMix(a, b, t) {
  return mix(a, b, t);
}
