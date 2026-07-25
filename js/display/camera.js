// Track Crew — fixed-angle framing camera: never rotates, frames the crew plus the front of the train.

import * as THREE from "three";
import { TUNE, CAM_YAW } from "../config.js";
import { trainPose } from "./render/trainmesh.js";

const PITCH = TUNE.CAM_PITCH;
const OFF = new THREE.Vector3(
  -Math.cos(PITCH) * Math.sin(CAM_YAW),
  Math.sin(PITCH),
  Math.cos(PITCH) * Math.cos(CAM_YAW)
).normalize();

const VIEW = OFF.clone().negate();
const RIGHT = new THREE.Vector3().crossVectors(VIEW, new THREE.Vector3(0, 1, 0)).normalize();
const UP = new THREE.Vector3().crossVectors(RIGHT, VIEW).normalize();

const MARGIN = 5.5;
const LOOK_AHEAD = 11;
const state = {
  cx: 0,
  cy: 0.9,
  cz: 0,
  dist: 34,
  ready: false
};

const pts = [];
const tmp = new THREE.Vector3();
let active = null;

export function createCamera(aspect) {
  const cam = new THREE.PerspectiveCamera(TUNE.CAM_FOV, aspect || 16 / 9, 0.6, 460);
  cam.position.set(OFF.x * state.dist, OFF.y * state.dist, OFF.z * state.dist);
  cam.lookAt(0, 0.9, 0);
  active = cam;
  return cam;
}

function collect(game) {
  pts.length = 0;
  if (!game) return;

  const players = game.players;
  if (players && typeof players.forEach === "function") {
    players.forEach((p) => {
      if (!p || typeof p.x !== "number") return;
      pts.push(p.x, p.z);
    });
  }

  const parked = game.phase === "lobby" || game.phase === "shop" || game.phase === "wreck";
  const pose = trainPose(game, 0);
  if (pose) {
    pts.push(pose.x, pose.z);
    if (!parked) pts.push(pose.x + pose.dirX * LOOK_AHEAD, pose.z + pose.dirZ * LOOK_AHEAD);
  }

  const ft = game.floorTile;
  if (ft && typeof ft.x === "number") {
    const r = ((ft.size || 3) - 1) / 2 + 1;
    pts.push(ft.x + 0.5 - r, ft.z + 0.5 - r);
    pts.push(ft.x + 0.5 + r, ft.z + 0.5 + r);
  }

  if (parked) {
    const wagons = (game.train && game.train.wagons) || null;
    const tail = wagons && wagons.length ? wagons[wagons.length - 1] : null;
    if (tail && typeof tail.x === "number") pts.push(tail.x, tail.z);
    const offers = (game.shop && game.shop.offers) || null;
    if (offers && game.phase === "shop") {
      for (const o of offers) {
        if (o && !o.sold && typeof o.x === "number") pts.push(o.x + 0.5, o.z + 0.5);
      }
    }
  }
}

export function updateCamera(cam, game, dt) {
  active = cam;
  collect(game);
  const step = Math.min(Math.max(dt || 0.016, 0.001), 0.1);

  if (pts.length === 0) {
    cam.position.set(state.cx + OFF.x * state.dist, state.cy + OFF.y * state.dist, state.cz + OFF.z * state.dist);
    cam.lookAt(state.cx, state.cy, state.cz);
    return;
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], z = pts[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const tx = (minX + maxX) * 0.5;
  const tz = (minZ + maxZ) * 0.5;

  let halfW = 0;
  let halfH = 0;
  for (let i = 0; i < pts.length; i += 2) {
    tmp.set(pts[i] - tx, 0, pts[i + 1] - tz);
    halfW = Math.max(halfW, Math.abs(tmp.dot(RIGHT)));
    halfH = Math.max(halfH, Math.abs(tmp.dot(UP)));
  }
  halfW += MARGIN;
  halfH += MARGIN * 0.8;

  const tanV = Math.tan((cam.fov * Math.PI) / 360);
  const needed = Math.max(halfH / tanV, halfW / (tanV * Math.max(cam.aspect, 0.4)));
  const wanted = Math.min(Math.max(needed, TUNE.CAM_ZOOM_MIN), TUNE.CAM_ZOOM_MAX);

  if (!state.ready) {
    state.ready = true;
    state.cx = tx;
    state.cz = tz;
    state.dist = wanted;
  }

  const outRate = 1 - Math.exp(-TUNE.CAM_SMOOTH * 1.7 * step);
  const inRate = 1 - Math.exp(-TUNE.CAM_SMOOTH * 0.42 * step);
  const posRate = 1 - Math.exp(-TUNE.CAM_SMOOTH * step);

  state.dist += (wanted - state.dist) * (wanted > state.dist ? outRate : inRate);
  state.cx += (tx - state.cx) * posRate;
  state.cz += (tz - state.cz) * posRate;

  cam.position.set(
    state.cx + OFF.x * state.dist,
    state.cy + OFF.y * state.dist,
    state.cz + OFF.z * state.dist
  );
  cam.lookAt(state.cx, state.cy, state.cz);
}

export function getFocus() {
  return state;
}

export function activeCamera() {
  return active;
}

export function cameraBasis() {
  return { OFF, RIGHT, UP, VIEW };
}
