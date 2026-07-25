// Track Crew — renderer, warm sun with one shadow map, hemisphere fill, biome fog and horizon.

import * as THREE from "three";
import { PALETTE } from "../../config.js";
import { getFocus } from "../camera.js";

const SHADOW_MAP = 2048;
const SUN_DIR = new THREE.Vector3(-0.66, 0.45, -0.6).normalize();
const SUN_DIST = 110;

const ctx = {
  renderer: null,
  scene: null,
  sun: null,
  hemi: null,
  fog: null,
  biome: null,
  targetRatio: 1,
  ratio: 1,
  ema: 16,
  cool: 0,
  last: 0,
  frames: 0,
  w: 0,
  h: 0
};

function biomeOf(game) {
  const key = (game && game.biome) || "meadows";
  return PALETTE.biome[key] || PALETTE.biome.meadows;
}

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    stencil: false
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = false;

  ctx.targetRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  ctx.ratio = ctx.targetRatio;
  renderer.setPixelRatio(ctx.ratio);

  const scene = new THREE.Scene();
  const b = PALETTE.biome.meadows;
  scene.background = new THREE.Color(b.fog);
  scene.fog = new THREE.Fog(b.fog, b.fogNear, b.fogFar);

  const hemi = new THREE.HemisphereLight(PALETTE.sky, b.ground, 0.62);
  hemi.position.set(0, 40, 0);
  scene.add(hemi);

  const amb = new THREE.AmbientLight(0xFFF3DC, 0.18);
  scene.add(amb);

  const sun = new THREE.DirectionalLight(0xFFF0C8, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SUN_DIST * 2.2;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.03;
  sun.position.copy(SUN_DIR).multiplyScalar(SUN_DIST);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  ctx.renderer = renderer;
  ctx.scene = scene;
  ctx.sun = sun;
  ctx.hemi = hemi;
  ctx.fog = scene.fog;
  ctx.biome = null;

  applyBiome(b);
  resize(renderer, null);

  return {
    renderer,
    scene,
    sun,
    render(cam) {
      resize(renderer, cam);
      adapt();
      ctx.frames++;
      if (ctx.frames === 2 || ctx.frames === 12) relight();
      renderer.info.reset();
      renderer.render(scene, cam);
    }
  };
}

function relight() {
  ctx.scene.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.material) o.material.needsUpdate = true;
  });
}

function resize(renderer, cam) {
  const canvas = renderer.domElement;
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  if (w === ctx.w && h === ctx.h) return;
  ctx.w = w;
  ctx.h = h;
  renderer.setSize(w, h, false);
  if (cam) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
}

function adapt() {
  const now = performance.now();
  if (ctx.last) {
    const ms = now - ctx.last;
    if (ms < 200) ctx.ema += (ms - ctx.ema) * 0.06;
  }
  ctx.last = now;
  if (ctx.cool > 0) {
    ctx.cool--;
    return;
  }
  if (ctx.ema > 21.5 && ctx.ratio > 1) {
    ctx.ratio = 1;
    ctx.renderer.setPixelRatio(ctx.ratio);
    ctx.cool = 240;
  } else if (ctx.ema < 13 && ctx.ratio < ctx.targetRatio) {
    ctx.ratio = ctx.targetRatio;
    ctx.renderer.setPixelRatio(ctx.ratio);
    ctx.cool = 240;
  }
}

function applyBiome(b) {
  if (ctx.biome === b) return;
  ctx.biome = b;
  ctx.scene.background.setHex(b.fog);
  ctx.fog.color.setHex(b.fog);
  ctx.fog.near = b.fogNear;
  ctx.fog.far = b.fogFar;
  ctx.hemi.groundColor.setHex(b.ground);
}

export function sync(game) {
  if (!ctx.scene) return;
  applyBiome(biomeOf(game));

  const f = getFocus();
  const span = Math.max(24, f.dist * 1.2);
  const cam = ctx.sun.shadow.camera;
  const texel = (span * 2) / SHADOW_MAP;
  const sx = Math.round(f.cx / texel) * texel;
  const sz = Math.round(f.cz / texel) * texel;

  ctx.sun.position.set(sx + SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, sz + SUN_DIR.z * SUN_DIST);
  ctx.sun.target.position.set(sx, 0, sz);
  ctx.sun.target.updateMatrixWorld();

  if (cam.right !== span) {
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.updateProjectionMatrix();
  }

  const zoom = f.dist / 34;
  ctx.fog.near = ctx.biome.fogNear * zoom;
  ctx.fog.far = ctx.biome.fogFar * zoom;
}

export function rendererInfo() {
  if (!ctx.renderer) return null;
  const r = ctx.renderer.info.render;
  return {
    calls: r.calls,
    triangles: r.triangles,
    programs: ctx.renderer.info.programs ? ctx.renderer.info.programs.length : 0,
    geometries: ctx.renderer.info.memory.geometries,
    textures: ctx.renderer.info.memory.textures,
    pixelRatio: ctx.ratio,
    frameMs: Math.round(ctx.ema * 10) / 10
  };
}

export function fogRange() {
  return ctx.fog;
}
