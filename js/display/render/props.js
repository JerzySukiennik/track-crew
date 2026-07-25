// Track Crew — instanced world props, gold nodes, ground piles, loose items, rails, stations, shop furniture and build tiles.

import * as THREE from "three";
import { PALETTE, TUNE } from "../../config.js";
import { WAGONS } from "../../data/wagons.js";
import { voxBox, voxMerge, voxMaterial, voxMix } from "../../shared/avatar3d.js";
import { getFocus, cameraBasis } from "../camera.js";
import { greenTiles } from "../rails.js";

const RANGE = 78;
const REBUILD_S = 2;
const REBUILD_MOVE = 3;
const GOLD_CAP = 16;
const SLOT_CAP = 8;
const GOLD_BRIGHT = voxMix(PALETTE.goldNode, 0xFFFFFF, 0.4);
const GOLD_DARK = voxMix(PALETTE.goldNode, 0x000000, 0.34);

const kits = new Map();
const stations = new Map();
const labels = new Map();
const dummy = new THREE.Object3D();
const EMPTY = [];
const goldSpots = [];

let root = null;
let greenMesh = null;
let greenMat = null;
let floorFill = null;
let floorFrame = null;
let floorMat = null;
let goldRing = null;
let goldBeam = null;
let slotMesh = null;
let scrapPad = null;
let rerollPad = null;
let priceTags = [];
let billboard = null;
let acc = 99;
let pulse = 0;
let currentBiome = null;
let lastX = 1e9;
let lastZ = 1e9;

function ikit(name, geo, cap, shadow) {
  const mesh = new THREE.InstancedMesh(geo, voxMaterial(), cap);
  mesh.castShadow = shadow !== false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const entry = { name, geo, mesh, cap, n: 0 };
  kits.set(name, entry);
  root.add(mesh);
  return entry;
}

function begin() {
  for (const k of kits.values()) k.n = 0;
}

function place(name, x, y, z, ry, s) {
  const k = kits.get(name);
  if (!k) return;
  if (k.n >= k.cap) return;
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry || 0, 0);
  const sc = s || 1;
  dummy.scale.set(sc, sc, sc);
  dummy.updateMatrix();
  k.mesh.setMatrixAt(k.n++, dummy.matrix);
}

function end() {
  for (const k of kits.values()) {
    k.mesh.count = k.n;
    k.mesh.instanceMatrix.needsUpdate = true;
  }
}

function treeGeo(leafHex, trunkHex) {
  return voxMerge([
    voxBox(0.3, 0.85, 0.3, trunkHex, 0, 0.42, 0),
    voxBox(1.15, 0.62, 1.15, leafHex, 0, 1.1, 0),
    voxBox(0.8, 0.5, 0.8, voxMix(leafHex, 0xFFFFFF, 0.14), 0, 1.62, 0)
  ]);
}

function goldTreeGeo() {
  return voxMerge([
    voxBox(0.38, 0.9, 0.38, GOLD_DARK, 0, 0.45, 0),
    voxBox(1.34, 0.7, 1.34, PALETTE.goldNode, 0, 1.24, 0),
    voxBox(0.96, 0.56, 0.96, GOLD_BRIGHT, 0, 1.85, 0),
    voxBox(0.34, 0.34, 0.34, PALETTE.cream, 0, 2.3, 0),
    voxBox(0.14, 0.5, 0.14, GOLD_BRIGHT, 0, 2.62, 0)
  ]);
}

function goldOreGeo() {
  return voxMerge([
    voxBox(0.94, 0.52, 0.9, GOLD_DARK, 0, 0.26, 0),
    voxBox(0.68, 0.4, 0.64, PALETTE.goldNode, 0, 0.7, 0),
    voxBox(0.3, 0.3, 0.3, GOLD_BRIGHT, -0.2, 1.0, 0.1),
    voxBox(0.24, 0.24, 0.24, PALETTE.cream, 0.22, 0.98, -0.14),
    voxBox(0.16, 0.44, 0.16, GOLD_BRIGHT, 0.02, 1.3, 0)
  ]);
}

const biomeGeo = new Map();

function geoFor(kind, biomeKey) {
  const key = kind + ":" + biomeKey;
  let g = biomeGeo.get(key);
  if (g) return g;
  const b = PALETTE.biome[biomeKey] || PALETTE.biome.meadows;
  if (kind === "tree") g = treeGeo(b.prop, PALETTE.trunk);
  else g = rockGeo(b.rock);
  biomeGeo.set(key, g);
  return g;
}

function applyBiome(biomeKey) {
  if (currentBiome === biomeKey) return;
  currentBiome = biomeKey;
  const tree = kits.get("tree");
  const rock = kits.get("rock");
  if (tree) tree.mesh.geometry = geoFor("tree", biomeKey);
  if (rock) rock.mesh.geometry = geoFor("rock", biomeKey);
}

function rockGeo(hex) {
  return voxMerge([
    voxBox(0.86, 0.5, 0.82, hex, 0, 0.25, 0),
    voxBox(0.5, 0.36, 0.46, voxMix(hex, 0xFFFFFF, 0.16), 0.12, 0.62, -0.08)
  ]);
}

function oreGeo(veinHex) {
  return voxMerge([
    voxBox(0.88, 0.44, 0.84, PALETTE.rockDark, 0, 0.22, 0),
    voxBox(0.24, 0.22, 0.24, veinHex, -0.2, 0.5, 0.12),
    voxBox(0.2, 0.18, 0.2, veinHex, 0.16, 0.46, -0.16),
    voxBox(0.16, 0.16, 0.16, veinHex, 0.05, 0.58, 0.2)
  ]);
}

function railPieceGeo() {
  return voxMerge([
    voxBox(0.54, 0.07, 0.09, PALETTE.rail, 0.26, 0.16, -0.18),
    voxBox(0.54, 0.07, 0.09, PALETTE.rail, 0.26, 0.16, 0.18),
    voxBox(0.17, 0.09, 0.68, PALETTE.sleeper, 0.3, 0.08, 0)
  ]);
}

function toolGeo(kind) {
  if (kind === "axe") {
    return voxMerge([
      voxBox(0.09, 0.62, 0.09, PALETTE.sleeper, 0, 0.31, 0),
      voxBox(0.3, 0.22, 0.12, PALETTE.iron, 0.14, 0.58, 0),
      voxBox(0.1, 0.24, 0.13, PALETTE.ironVein, -0.06, 0.58, 0)
    ]);
  }
  if (kind === "pick") {
    return voxMerge([
      voxBox(0.09, 0.62, 0.09, PALETTE.sleeper, 0, 0.31, 0),
      voxBox(0.62, 0.1, 0.1, PALETTE.iron, 0, 0.6, 0),
      voxBox(0.12, 0.12, 0.12, PALETTE.ironVein, 0, 0.6, 0)
    ]);
  }
  if (kind === "bucket") {
    return voxMerge([
      voxBox(0.36, 0.32, 0.36, PALETTE.cyan, 0, 0.16, 0),
      voxBox(0.4, 0.07, 0.4, PALETTE.ink, 0, 0.33, 0),
      voxBox(0.06, 0.2, 0.3, PALETTE.ink, 0.2, 0.42, 0)
    ]);
  }
  return voxMerge([
    voxBox(0.17, 0.44, 0.17, PALETTE.coral, 0, 0.22, 0),
    voxBox(0.19, 0.07, 0.19, PALETTE.cream, 0, 0.28, 0),
    voxBox(0.05, 0.16, 0.05, PALETTE.ink, 0, 0.5, 0)
  ]);
}

function crateGeo(hex) {
  return voxMerge([
    voxBox(0.62, 0.56, 0.62, hex, 0, 0.28, 0),
    voxBox(0.66, 0.1, 0.66, PALETTE.cream, 0, 0.28, 0),
    voxBox(0.14, 0.6, 0.14, PALETTE.cream, 0, 0.28, 0)
  ]);
}

function hex(v) {
  return "#" + ("000000" + (v >>> 0).toString(16)).slice(-6);
}

function trimLabels() {
  if (labels.size <= 48) return;
  const inUse = new Set();
  for (const t of priceTags) if (t.material.map) inUse.add(t.material.map);
  if (scrapPad) inUse.add(scrapPad.userData.label.material.map);
  if (rerollPad) inUse.add(rerollPad.userData.label.material.map);
  for (const [key, tex] of labels) {
    if (inUse.has(tex)) continue;
    tex.dispose();
    labels.delete(key);
    if (labels.size <= 32) return;
  }
}

function labelTexture(text, bgHex) {
  const key = text + "|" + bgHex;
  const have = labels.get(key);
  if (have) return have;
  trimLabels();
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 144;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = hex(PALETTE.ink);
  g.fillRect(8, 16, c.width - 16, c.height - 32);
  g.fillStyle = hex(bgHex);
  g.fillRect(18, 26, c.width - 36, c.height - 52);
  g.fillStyle = hex(PALETTE.ink);
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 58;
  do {
    g.font = size + 'px Bungee, "Arial Black", sans-serif';
    if (g.measureText(text).width <= c.width - 56) break;
    size -= 3;
  } while (size > 20);
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  labels.set(key, tex);
  return tex;
}

function makeLabel(text, bgHex, width) {
  const w = width || 2.1;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * 0.375),
    new THREE.MeshBasicMaterial({ map: labelTexture(text, bgHex), transparent: true, depthWrite: false })
  );
  mesh.renderOrder = 4;
  if (billboard) mesh.quaternion.copy(billboard);
  return mesh;
}

function retextLabel(mesh, text, bgHex) {
  const tex = labelTexture(text, bgHex);
  if (mesh.material.map !== tex) {
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
  }
}

function makePad(fillHex, text) {
  const group = new THREE.Group();
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
    color: fillHex, transparent: true, opacity: 0.5, depthWrite: false
  }));
  fill.position.y = 0.035;
  fill.scale.set(3, 1, 3);
  fill.renderOrder = 2;
  group.add(fill);

  const frame = new THREE.Mesh(voxMerge([
    voxBox(3.1, 0.08, 0.16, PALETTE.ink, 0, 0.04, -1.47),
    voxBox(3.1, 0.08, 0.16, PALETTE.ink, 0, 0.04, 1.47),
    voxBox(0.16, 0.08, 3.1, PALETTE.ink, -1.47, 0.04, 0),
    voxBox(0.16, 0.08, 3.1, PALETTE.ink, 1.47, 0.04, 0)
  ]), voxMaterial());
  group.add(frame);

  const post = new THREE.Mesh(voxMerge([
    voxBox(0.16, 1.5, 0.16, PALETTE.ink, 0, 0.75, 0)
  ]), voxMaterial());
  post.castShadow = true;
  post.position.set(-1.2, 0, -1.2);
  group.add(post);

  const label = makeLabel(text, fillHex, 2.3);
  label.position.set(-1.2, 1.9, -1.2);
  group.add(label);

  group.visible = false;
  group.userData = { fill, label };
  return group;
}

export function init(scene) {
  root = new THREE.Group();
  root.name = "props";
  scene.add(root);
  kits.clear();
  stations.clear();

  const basis = cameraBasis();
  const aim = new THREE.Object3D();
  aim.lookAt(basis.OFF.x, basis.OFF.y, basis.OFF.z);
  billboard = aim.quaternion.clone();

  ikit("tree", geoFor("tree", "meadows"), 520);
  ikit("treeGold", goldTreeGeo(), GOLD_CAP);
  ikit("rock", geoFor("rock", "meadows"), 340);
  ikit("iron", oreGeo(PALETTE.iron), 340);
  ikit("goldOre", goldOreGeo(), GOLD_CAP);
  ikit("rail", railPieceGeo(), 900, false);
  ikit("log", voxBox(0.66, 0.2, 0.22, PALETTE.wood, 0, 0, 0), 300);
  ikit("ingot", voxBox(0.38, 0.15, 0.24, PALETTE.iron, 0, 0, 0), 300);
  ikit("railItem", voxMerge([
    voxBox(0.5, 0.07, 0.07, PALETTE.rail, 0, 0.04, -0.13),
    voxBox(0.5, 0.07, 0.07, PALETTE.rail, 0, 0.04, 0.13),
    voxBox(0.12, 0.06, 0.38, PALETTE.sleeper, 0, 0, 0)
  ]), 300);
  ikit("axe", toolGeo("axe"), 12);
  ikit("pick", toolGeo("pick"), 12);
  ikit("bucket", toolGeo("bucket"), 12);
  ikit("stick", toolGeo("stick"), 24);
  ikit("crate", crateGeo(PALETTE.wood), 24);
  ikit("crateUp", crateGeo(PALETTE.cyan), 24);

  const ringGeo = new THREE.RingGeometry(0.78, 1.5, 20);
  ringGeo.rotateX(-Math.PI / 2);
  goldRing = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.yellow, transparent: true, opacity: 0.6, depthWrite: false
  }), GOLD_CAP);
  goldRing.frustumCulled = false;
  goldRing.count = 0;
  goldRing.renderOrder = 2;
  goldRing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(goldRing);

  const beamGeo = new THREE.CylinderGeometry(0.62, 1.1, 8, 10, 1, true);
  beamGeo.translate(0, 4, 0);
  goldBeam = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.goldNode, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide
  }), GOLD_CAP);
  goldBeam.frustumCulled = false;
  goldBeam.count = 0;
  goldBeam.renderOrder = 1;
  goldBeam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(goldBeam);

  const slotGeo = new THREE.BoxGeometry(0.5, 2.6, 1.7);
  slotGeo.translate(0, 1.3, 0);
  slotMesh = new THREE.InstancedMesh(slotGeo, new THREE.MeshBasicMaterial({
    color: PALETTE.yellow, transparent: true, opacity: 0.45, depthWrite: false
  }), SLOT_CAP);
  slotMesh.frustumCulled = false;
  slotMesh.count = 0;
  slotMesh.renderOrder = 3;
  slotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(slotMesh);

  floorMat = new THREE.MeshBasicMaterial({
    color: PALETTE.green,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const floorPlane = new THREE.PlaneGeometry(1, 1);
  floorPlane.rotateX(-Math.PI / 2);
  floorFill = new THREE.Mesh(floorPlane, floorMat);
  floorFill.position.y = 0.04;
  floorFill.renderOrder = 2;
  floorFill.visible = false;
  root.add(floorFill);

  floorFrame = new THREE.Mesh(voxMerge([
    voxBox(1.02, 0.07, 0.07, PALETTE.ink, 0, 0.03, -0.475),
    voxBox(1.02, 0.07, 0.07, PALETTE.ink, 0, 0.03, 0.475),
    voxBox(0.07, 0.07, 1.02, PALETTE.ink, -0.475, 0.03, 0),
    voxBox(0.07, 0.07, 1.02, PALETTE.ink, 0.475, 0.03, 0)
  ]), voxMaterial());
  floorFrame.visible = false;
  root.add(floorFrame);

  scrapPad = makePad(PALETTE.coral, "SCRAP");
  root.add(scrapPad);
  rerollPad = makePad(PALETTE.cyan, "REROLL " + TUNE.REROLL_COST + "G");
  root.add(rerollPad);

  priceTags = [];
  for (let i = 0; i < 5; i++) {
    const tag = makeLabel("", PALETTE.yellow, 2.4);
    tag.visible = false;
    root.add(tag);
    priceTags.push(tag);
  }

  greenMat = new THREE.MeshBasicMaterial({
    color: PALETTE.green,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });
  const plane = new THREE.PlaneGeometry(0.94, 0.94);
  plane.rotateX(-Math.PI / 2);
  greenMesh = new THREE.InstancedMesh(plane, greenMat, 96);
  greenMesh.frustumCulled = false;
  greenMesh.count = 0;
  greenMesh.renderOrder = 2;
  greenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(greenMesh);

  acc = 99;
  currentBiome = "meadows";
  lastX = 1e9;
  lastZ = 1e9;
}

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

const CHANGE_EVENTS = {
  treeFall: 1, treeDown: 1, oreDepleted: 1, rockBreak: 1, explosion: 1, dynamite: 1,
  railPlaced: 1, railJoined: 1, placeRail: 1, pickup: 1, take: 1, takeRails: 1,
  takeStash: 1, swap: 1, drop: 1, load: 1, deposit: 1, bankBuilt: 1, buildBank: 1,
  gold: 1, goldNode: 1, buy: 1, bought: 1, scrap: 1, reroll: 1, insertWagon: 1,
  toolReturn: 1, teleport: 1, leashTeleport: 1, throw: 1, craft: 1,
  roundBuilt: 1, roundStart: 1, worldChanged: 1, segmentPruned: 1, stationBuilt: 1,
  playerJoin: 1, playerLeave: 1, join: 1, arrive: 1, shopOpen: 1, phase: 1
};

const PROP_KIND = {
  T: "tree", tree: "tree",
  G: "treeGold", goldTree: "treeGold", treeGold: "treeGold", gold_tree: "treeGold",
  I: "iron", iron: "iron", ore: "iron", iron_ore: "iron",
  g: "goldOre", goldOre: "goldOre", gold_ore: "goldOre", goldIron: "goldOre",
  R: "rock", rock: "rock"
};

function propKind(p) {
  if (p == null) return null;
  if (typeof p === "string") return PROP_KIND[p] || null;
  const raw = p.kind || p.type || p.k || p.prop;
  let name = PROP_KIND[raw] || null;
  if (!name) return null;
  if (p.gold || p.golden) {
    if (name === "tree") name = "treeGold";
    else if (name === "iron") name = "goldOre";
  }
  return name;
}

function eachProp(world, fn) {
  const props = world.props;
  if (!props) return;
  if (typeof props.forEach === "function" && !Array.isArray(props)) {
    props.forEach((v, key) => {
      let x = v && typeof v.x === "number" ? v.x : NaN;
      let z = v && typeof v.z === "number" ? v.z : NaN;
      if (!isFinite(x) && typeof key === "string") {
        const c = key.split(",");
        x = +c[0];
        z = +c[1];
      }
      if (isFinite(x) && isFinite(z)) fn(v, x, z);
    });
    return;
  }
  if (Array.isArray(props)) {
    for (const v of props) if (v && isFinite(v.x)) fn(v, v.x, v.z);
  }
}

function itemsOf(game) {
  const out = [];
  const items = game.items;
  if (!items) return out;
  if (typeof items.forEach === "function") items.forEach((v) => { if (v) out.push(v); });
  else if (Array.isArray(items)) for (const v of items) if (v) out.push(v);
  return out;
}

function placeItem(k, n, x, z) {
  const key = typeof k === "string" ? k : "";
  const cx = x + 0.5;
  const cz = z + 0.5;
  if (key === "wood" || key === "iron" || key === "rail") {
    const kit = key === "wood" ? "log" : key === "iron" ? "ingot" : "railItem";
    const count = Math.min(n || 1, 7);
    for (let i = 0; i < count; i++) {
      const r = hash2(x * 7 + i, z * 13 + i);
      const lift = key === "rail" ? 0.07 : 0.11;
      place(kit, cx + (r - 0.5) * 0.28, 0.06 + i * lift, cz + (hash2(i, x + z) - 0.5) * 0.28,
        (i % 2) * 0.6 + r * 0.5, 1);
    }
    return;
  }
  if (key === "tool_axe") return place("axe", cx, 0, cz, hash2(x, z) * 6.28, 1);
  if (key === "tool_pick") return place("pick", cx, 0, cz, hash2(x, z) * 6.28, 1);
  if (key === "tool_bucket") return place("bucket", cx, 0, cz, hash2(x, z) * 6.28, 1);
  if (key === "stick") return place("stick", cx, 0, cz, hash2(x, z) * 6.28, 1);
  if (key.indexOf("wagon_crate") === 0) return place("crate", cx, 0, cz, 0.3, 1);
  if (key.indexOf("upgrade_crate") === 0) return place("crateUp", cx, 0, cz, -0.3, 0.85);
  return place("crate", cx, 0, cz, 0, 0.7);
}

function stationGeo() {
  const wallHex = PALETTE.station;
  const roofHex = PALETTE.stationRoof;
  return voxMerge([
    voxBox(7.6, 0.34, 11.2, PALETTE.cream, 0, 0.17, 0),
    voxBox(7.9, 0.14, 11.5, PALETTE.ink, 0, 0.05, 0),
    voxBox(4.6, 2.7, 6.4, wallHex, -0.6, 1.5, 0),
    voxBox(5.6, 0.5, 7.4, roofHex, -0.6, 3.05, 0),
    voxBox(5.9, 0.16, 7.7, PALETTE.ink, -0.6, 2.78, 0),
    voxBox(0.9, 0.28, 7.5, voxMix(roofHex, 0x000000, 0.25), -0.6, 3.38, 0),
    voxBox(1.1, 1.7, 0.2, PALETTE.cream, -0.6, 1.05, 3.25),
    voxBox(0.9, 0.9, 0.2, PALETTE.cyan, -0.6, 2.2, 3.25),
    voxBox(0.7, 1.9, 0.7, PALETTE.bank, 1.1, 3.6, -2.2),
    voxBox(0.34, 4.6, 0.34, PALETTE.ink, 2.6, 2.3, 4.4),
    voxBox(1.9, 1.1, 0.18, PALETTE.yellow, 3.4, 4.3, 4.4),
    voxBox(2.1, 0.2, 0.26, PALETTE.ink, 3.4, 3.7, 4.4)
  ]);
}

function syncStations(game) {
  const list = (game.world && game.world.stations) || [];
  const live = new Set();
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s) continue;
    if (s.pruned) continue;
    const x = typeof s.buildingX === "number" ? s.buildingX
      : (typeof s.x === "number" ? s.x : (typeof s.x0 === "number" ? s.x0 + 6 : null));
    const z = typeof s.buildingZ === "number" ? s.buildingZ
      : (typeof s.z === "number" ? s.z : (typeof s.z0 === "number" ? s.z0 + 4 : 4));
    if (x == null) continue;
    const key = (s.id || "st") + "@" + Math.round(x);
    live.add(key);
    if (stations.has(key)) continue;
    const mesh = new THREE.Mesh(stationGeo(), voxMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x + 0.5, 0, z + 0.5);
    root.add(mesh);
    stations.set(key, mesh);
  }
  for (const [key, mesh] of stations) {
    if (!live.has(key)) {
      mesh.geometry.dispose();
      root.remove(mesh);
      stations.delete(key);
    }
  }
}

function greenList(game) {
  const r = game.rails;
  if (!r) return EMPTY;
  try {
    const live = greenTiles(game);
    if (Array.isArray(live)) return live;
  } catch (e) {
    return EMPTY;
  }
  return EMPTY;
}

const RAIL_RY = { e: 0, w: Math.PI, s: -Math.PI / 2, n: Math.PI / 2 };
const SHAPE_DIRS = {
  ew: ["e", "w"], ns: ["n", "s"],
  ne: ["n", "e"], nw: ["n", "w"], se: ["s", "e"], sw: ["s", "w"]
};

function placeRailTile(t) {
  const dirs = SHAPE_DIRS[t.shape] || SHAPE_DIRS.ew;
  place("rail", t.x + 0.5, 0, t.z + 0.5, RAIL_RY[dirs[0]], 1);
  place("rail", t.x + 0.5, 0, t.z + 0.5, RAIL_RY[dirs[1]], 1);
}

export function sync(game, dt, events) {
  if (!root || !game) return;
  pulse += dt || 0.016;

  const list = events || [];
  let force = false;
  for (let i = 0; i < list.length; i++) {
    const t = list[i] && (list[i].type || list[i].t || list[i].kind);
    if (t && CHANGE_EVENTS[t]) force = true;
  }

  acc += dt || 0.016;
  const f0 = getFocus();
  const moved = Math.abs(f0.cx - lastX) + Math.abs(f0.cz - lastZ);
  const due = force || acc >= REBUILD_S || moved > REBUILD_MOVE;

  if (due) {
    acc = 0;
    lastX = f0.cx;
    lastZ = f0.cz;
    applyBiome(game.biome || "meadows");
    const focus = f0;
    const range = Math.max(RANGE, focus.dist * 1.9);
    const world = game.world || {};
    begin();
    goldSpots.length = 0;

    eachProp(world, (p, x, z) => {
      if (Math.abs(x - focus.cx) > range || Math.abs(z - focus.cz) > range) return;
      const kind = propKind(p);
      if (!kind) return;
      const r = hash2(x, z);
      const golden = kind === "treeGold" || kind === "goldOre";
      const s = golden ? 1 : (kind === "rock" ? 0.85 + r * 0.4 : 0.86 + r * 0.34);
      place(kind, x + 0.5, 0, z + 0.5, golden ? r * 1.2 : r * 6.283, s);
      if (golden && goldSpots.length < GOLD_CAP * 2) goldSpots.push(x + 0.5, z + 0.5);
    });

    const items = itemsOf(game);
    for (const it of items) {
      if (!it || typeof it.x !== "number") continue;
      if (Math.abs(it.x - focus.cx) > range || Math.abs(it.z - focus.cz) > range) continue;
      placeItem(it.k || it.kind, it.n, it.x, it.z);
    }

    const rails = game.rails;
    if (rails && rails.tiles) {
      for (const t of rails.tiles) {
        if (!t || t.hidden) continue;
        if (Math.abs(t.x - focus.cx) > range || Math.abs(t.z - focus.cz) > range) continue;
        placeRailTile(t);
      }
    }

    const offers = (game.shop && game.shop.offers) || EMPTY;
    for (const o of offers) {
      if (!o || o.sold || typeof o.x !== "number") continue;
      place(o.kind === "upgrade" ? "crateUp" : "crate", o.x + 0.5, 0, o.z + 0.5,
        o.kind === "upgrade" ? -0.3 : 0.3, o.kind === "upgrade" ? 0.85 : 1);
    }

    end();
    syncStations(game);

    let gi = 0;
    for (let i = 0; i + 1 < goldSpots.length && gi < GOLD_CAP; i += 2) {
      dummy.position.set(goldSpots[i], 0.05, goldSpots[i + 1]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      goldRing.setMatrixAt(gi, dummy.matrix);
      dummy.position.y = 0;
      dummy.updateMatrix();
      goldBeam.setMatrixAt(gi, dummy.matrix);
      gi++;
    }
    goldRing.count = gi;
    goldBeam.count = gi;
    goldRing.instanceMatrix.needsUpdate = true;
    goldBeam.instanceMatrix.needsUpdate = true;
  }

  const gwave = 0.5 + 0.5 * Math.sin(pulse * 3.4);
  goldRing.material.opacity = 0.34 + gwave * 0.42;
  goldBeam.material.opacity = 0.1 + gwave * 0.14;

  const green = greenList(game);
  let n = 0;
  for (const g of green) {
    if (!g || n >= 96) break;
    dummy.position.set(g.x + 0.5, 0.035, g.z + 0.5);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    greenMesh.setMatrixAt(n++, dummy.matrix);
  }
  greenMesh.count = n;
  greenMesh.instanceMatrix.needsUpdate = true;
  greenMat.opacity = 0.42 + 0.3 * (0.5 + 0.5 * Math.sin(pulse * 4.2));

  syncFloorTile(game);
  syncShop(game);
}

function syncFloorTile(game) {
  const ft = game.floorTile;
  if (!ft || typeof ft.x !== "number") {
    floorFill.visible = false;
    floorFrame.visible = false;
    return;
  }
  const size = ft.size || 3;
  const cx = ft.x + 0.5;
  const cz = ft.z + 0.5;
  floorFill.visible = true;
  floorFrame.visible = true;
  floorFill.position.set(cx, 0.04, cz);
  floorFill.scale.set(size, 1, size);
  floorFrame.position.set(cx, 0, cz);
  floorFrame.scale.set(size, 1, size);

  const ready = ft.need > 0 && ft.on >= ft.need;
  const wave = 0.5 + 0.5 * Math.sin(pulse * (ready ? 9 : 3.2));
  floorMat.color.setHex(ft.kind === "retry" ? PALETTE.cyan : PALETTE.green);
  floorMat.opacity = (ready ? 0.72 : 0.42) + wave * 0.26;
}

function wagonLabel(o) {
  const def = WAGONS[o.type];
  const name = String((def && def.name) || o.type || "WAGON").toUpperCase();
  const lv = o.kind === "upgrade" ? " " + (["", "II", "III"][o.level] || "") : "";
  return name + lv + " " + o.price + "G";
}

function syncShop(game) {
  const shopping = game.phase === "shop";
  const st = shopping ? (game.shop && game.shop.station) : null;

  if (st && st.scrapPad) {
    scrapPad.visible = true;
    scrapPad.position.set(st.scrapPad.x + 0.5, 0, st.scrapPad.z + 0.5);
  } else {
    scrapPad.visible = false;
  }
  if (st && st.rerollTile) {
    rerollPad.visible = true;
    rerollPad.position.set(st.rerollTile.x + 0.5, 0, st.rerollTile.z + 0.5);
  } else {
    rerollPad.visible = false;
  }
  const padWave = 0.5 + 0.5 * Math.sin(pulse * 3);
  if (scrapPad.visible) scrapPad.userData.fill.material.opacity = 0.58 + padWave * 0.3;
  if (rerollPad.visible) rerollPad.userData.fill.material.opacity = 0.58 + padWave * 0.3;

  const offers = shopping ? ((game.shop && game.shop.offers) || EMPTY) : EMPTY;
  for (let i = 0; i < priceTags.length; i++) {
    const tag = priceTags[i];
    const o = offers[i];
    if (!o || o.sold || typeof o.x !== "number") {
      tag.visible = false;
      continue;
    }
    tag.visible = true;
    retextLabel(tag, wagonLabel(o), o.kind === "upgrade" ? PALETTE.cyan : PALETTE.yellow);
    tag.position.set(o.x + 0.5, 1.55 + Math.sin(pulse * 2 + i) * 0.06, o.z + 0.5);
  }

  const slots = shopping ? ((game.shop && game.shop.slots) || EMPTY) : EMPTY;
  const train = game.train || {};
  const dirX = typeof train.dirX === "number" ? train.dirX : 1;
  const dirZ = typeof train.dirZ === "number" ? train.dirZ : 0;
  const ry = Math.atan2(-dirZ, dirX);
  let sn = 0;
  for (const s of slots) {
    if (!s || typeof s.x !== "number" || sn >= SLOT_CAP) continue;
    dummy.position.set(s.x, 0, s.z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    slotMesh.setMatrixAt(sn++, dummy.matrix);
  }
  slotMesh.count = sn;
  slotMesh.instanceMatrix.needsUpdate = true;
  slotMesh.material.opacity = 0.24 + padWave * 0.34;
}

export function dispose() {
  for (const k of kits.values()) k.geo.dispose();
  for (const [, g] of biomeGeo) g.dispose();
  biomeGeo.clear();
  kits.clear();
  for (const [, m] of stations) m.geometry.dispose();
  stations.clear();
  for (const [, t] of labels) t.dispose();
  labels.clear();
}
