// Join picker: name, hat, clothes colour and skin with a live rotating 3D preview and taken-colour greying.

import { ensureIcons, iconSvg, hatIconId, loadAvatarData } from "./pad.js";
import { watchTaken } from "../net/signaling.js";

const STORE = "trackcrew.profile";
const CID_KEY = "trackcrew.cid";

function readProfile() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    return p;
  } catch (e) {
    return null;
  }
}

function writeProfile(p) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) {}
}

function cleanName(s) {
  return String(s || "").replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 12).trim();
}

function buildFallbackAvatar(THREE, opt, data) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: data.colors[opt.colorIdx] || "#FF5747" });
  const skin = new THREE.MeshLambertMaterial({ color: data.skins[opt.skinIdx] || "#F6C89F" });
  const ink = new THREE.MeshLambertMaterial({ color: "#222228" });
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  box(0.22, 0.42, 0.22, ink, -0.14, 0.21, 0);
  box(0.22, 0.42, 0.22, ink, 0.14, 0.21, 0);
  box(0.62, 0.5, 0.34, cloth, 0, 0.67, 0);
  box(0.16, 0.44, 0.16, skin, -0.39, 0.68, 0);
  box(0.16, 0.44, 0.16, skin, 0.39, 0.68, 0);
  box(0.46, 0.42, 0.42, skin, 0, 1.13, 0);
  const hat = String((data.hats[opt.hat] && data.hats[opt.hat].key) || "none");
  if (hat !== "none") {
    box(0.52, 0.14, 0.52, ink, 0, 1.36, 0);
    if (hat === "top") box(0.4, 0.3, 0.4, ink, 0, 1.56, 0);
    if (hat === "cap") box(0.24, 0.06, 0.3, ink, 0, 1.33, 0.3);
    if (hat === "cowboy" || hat === "straw") box(0.78, 0.06, 0.78, ink, 0, 1.32, 0);
  }
  return g;
}

async function initPreview(canvas, getOpt, data) {
  let THREE = null;
  try { THREE = await import("three"); } catch (e) { return null; }
  let build = null;
  let walk = null;
  try {
    const mod = await import("../shared/avatar3d.js");
    if (typeof mod.buildAvatar === "function") build = mod.buildAvatar;
    if (typeof mod.setAvatarWalk === "function") walk = mod.setAvatarWalk;
  } catch (e) {
    build = null;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(0, 1.05, 3.5);
  camera.lookAt(0, 0.8, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6b5a, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(2.5, 4, 3);
  scene.add(sun);
  const pivot = new THREE.Group();
  scene.add(pivot);

  let current = null;
  let phase = 0;
  let raf = 0;
  let last = 0;
  let alive = true;

  function rebuild() {
    if (current) {
      pivot.remove(current);
      current.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    }
    const opt = getOpt();
    let g = null;
    if (build) {
      try { g = build({ hat: opt.hat, colorIdx: opt.colorIdx, skinIdx: opt.skinIdx }); } catch (e) { g = null; }
    }
    if (!g) g = buildFallbackAvatar(THREE, opt, data);
    current = g;
    pivot.add(g);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    pivot.rotation.y += dt * 0.7;
    phase += dt * 3;
    if (walk && current) { try { walk(current, phase); } catch (e) { walk = null; } }
    if (canvas.clientWidth !== renderer.domElement.width / renderer.getPixelRatio()) resize();
    renderer.render(scene, camera);
  }

  resize();
  rebuild();
  raf = requestAnimationFrame(frame);
  window.addEventListener("resize", resize);

  return {
    update: rebuild,
    dispose() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      try { renderer.dispose(); } catch (e) {}
    }
  };
}

export async function runJoin(padRoot) {
  ensureIcons();
  const data = await loadAvatarData();
  const saved = readProfile() || {};
  const sel = {
    name: cleanName(saved.name || ""),
    hat: Number.isInteger(saved.hat) && saved.hat < data.hats.length ? saved.hat : 0,
    colorIdx: Number.isInteger(saved.colorIdx) && saved.colorIdx < data.colors.length ? saved.colorIdx : 0,
    skinIdx: Number.isInteger(saved.skinIdx) && saved.skinIdx < data.skins.length ? saved.skinIdx : 0
  };

  padRoot.innerHTML =
    '<div class="join">' +
      '<div class="join-left">' +
        '<div class="join-preview"><canvas class="join-canvas"></canvas></div>' +
        '<div class="join-tag">YOUR CREW MEMBER</div>' +
      '</div>' +
      '<div class="join-right">' +
        '<div class="join-row"><span class="eyebrow">NAME</span>' +
          '<input class="join-name" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" ' +
          'autocorrect="off" spellcheck="false" placeholder="CREW"></div>' +
        '<div class="join-row"><span class="eyebrow">HAT</span><div class="opt-row hats"></div></div>' +
        '<div class="join-row"><span class="eyebrow">COLOR</span><div class="opt-row colors"></div></div>' +
        '<div class="join-row"><span class="eyebrow">SKIN</span><div class="opt-row skins"></div></div>' +
        '<button class="join-go" type="button">JOIN THE CREW</button>' +
      '</div>' +
    '</div>';

  const root = padRoot.querySelector(".join");
  const nameEl = root.querySelector(".join-name");
  const hatsEl = root.querySelector(".opt-row.hats");
  const colorsEl = root.querySelector(".opt-row.colors");
  const skinsEl = root.querySelector(".opt-row.skins");
  const goEl = root.querySelector(".join-go");
  const canvas = root.querySelector(".join-canvas");
  nameEl.value = sel.name;

  data.hats.forEach((h, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt hat";
    b.dataset.idx = String(i);
    b.innerHTML = iconSvg(hatIconId(h.key));
    hatsEl.appendChild(b);
  });
  data.colors.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt color";
    b.dataset.idx = String(i);
    b.style.background = c;
    colorsEl.appendChild(b);
  });
  data.skins.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt skin";
    b.dataset.idx = String(i);
    b.style.background = c;
    skinsEl.appendChild(b);
  });

  let taken = new Set();
  let preview = null;

  function paint() {
    hatsEl.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", Number(b.dataset.idx) === sel.hat));
    colorsEl.querySelectorAll(".opt").forEach((b) => {
      const i = Number(b.dataset.idx);
      b.classList.toggle("on", i === sel.colorIdx);
      b.classList.toggle("taken", taken.has(i));
      b.disabled = taken.has(i);
    });
    skinsEl.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", Number(b.dataset.idx) === sel.skinIdx));
    if (preview) preview.update();
  }

  function applyTaken(map) {
    let mine = "";
    try { mine = localStorage.getItem(CID_KEY) || ""; } catch (e) { mine = ""; }
    const next = new Set();
    Object.keys(map || {}).forEach((cid) => {
      if (cid === mine) return;
      const v = Number(map[cid]);
      if (Number.isInteger(v)) next.add(v);
    });
    taken = next;
    if (taken.has(sel.colorIdx)) {
      for (let i = 0; i < data.colors.length; i++) {
        if (!taken.has(i)) { sel.colorIdx = i; break; }
      }
    }
    paint();
  }

  const room = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
  let stopTaken = null;
  if (room.length === 4) {
    watchTaken(room, applyTaken).then((f) => { stopTaken = f; }).catch(() => {});
  }

  hatsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (!b) return;
    sel.hat = Number(b.dataset.idx);
    paint();
  });
  colorsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (!b || b.disabled) return;
    sel.colorIdx = Number(b.dataset.idx);
    paint();
  });
  skinsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (!b) return;
    sel.skinIdx = Number(b.dataset.idx);
    paint();
  });
  nameEl.addEventListener("input", () => { sel.name = cleanName(nameEl.value); });

  preview = await initPreview(canvas, () => sel, data);
  if (!preview) root.querySelector(".join-preview").classList.add("flat");
  paint();

  return new Promise((resolve) => {
    goEl.addEventListener("click", () => {
      sel.name = cleanName(nameEl.value) || "CREW";
      writeProfile(sel);
      if (stopTaken) { try { stopTaken(); } catch (e) {} }
      if (preview) preview.dispose();
      padRoot.innerHTML = "";
      resolve({ name: sel.name, hat: sel.hat, colorIdx: sel.colorIdx, skinIdx: sel.skinIdx });
    });
  });
}
