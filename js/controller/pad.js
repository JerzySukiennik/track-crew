// Landscape pad: icon sprite, thumb stick sampled at INPUT_HZ, one context button, carry readout, buzz flash.

import { CTX, CTX_LABEL, PHASE } from "../shared/protocol.js";
import { TUNE } from "../config.js";

const num = (k, d) => (TUNE && typeof TUNE[k] === "number" ? TUNE[k] : d);

const DEADZONE = 0.15;

const SPRITE = `
<symbol id="tc-pan" viewBox="0 0 32 32"><path d="M16 2l4.4 5h-8.8zM16 30l-4.4-5h8.8zM2 16l5-4.4v8.8zM30 16l-5 4.4v-8.8z"/></symbol>
<symbol id="tc-wood" viewBox="0 0 32 32"><rect x="1.5" y="5" width="29" height="10" rx="5"/><circle cx="6.5" cy="10" r="3.2" fill="#FFD400"/><circle cx="6.5" cy="10" r="1.2"/><rect x="1.5" y="18" width="29" height="10" rx="5"/><circle cx="6.5" cy="23" r="3.2" fill="#FFD400"/><circle cx="6.5" cy="23" r="1.2"/></symbol>
<symbol id="tc-iron" viewBox="0 0 32 32"><path d="M6 20l6-11h9l5 8-4 9H9z"/><path d="M12 9l3 8 8-1" fill="none" stroke="#FFD400" stroke-width="2"/></symbol>
<symbol id="tc-rail" viewBox="0 0 32 32"><rect x="2" y="7" width="28" height="4" rx="1.4"/><rect x="2" y="21" width="28" height="4" rx="1.4"/><rect x="6" y="4" width="4" height="24" rx="1.4"/><rect x="14" y="4" width="4" height="24" rx="1.4"/><rect x="22" y="4" width="4" height="24" rx="1.4"/></symbol>
<symbol id="tc-axe" viewBox="0 0 32 32"><rect x="14" y="6" width="4.4" height="23" rx="2" transform="rotate(12 16 17)"/><path d="M18 3c6 0 10 3.4 11 8-4.4 1.6-8.6 1.2-12.6-1z"/></symbol>
<symbol id="tc-pick" viewBox="0 0 32 32"><rect x="14" y="8" width="4.4" height="21" rx="2"/><path d="M3 12c5-6 11-8 13-6.6C18 7 12 9 8.6 14zM29 12c-5-6-11-8-13-6.6C14 7 20 9 23.4 14z"/></symbol>
<symbol id="tc-bucket" viewBox="0 0 32 32"><path d="M6 10h20l-2.6 18H8.6z"/><path d="M4 6h24v4H4z"/><path d="M10 4c0-2 12-2 12 0" fill="none" stroke="currentColor" stroke-width="2.4"/></symbol>
<symbol id="tc-boom" viewBox="0 0 32 32"><rect x="10" y="10" width="12" height="19" rx="3"/><path d="M16 10V5c0-2 4-2 4-4" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="10" y="15" width="12" height="3" fill="#FFF6E9"/></symbol>
<symbol id="tc-crate" viewBox="0 0 32 32"><rect x="4" y="7" width="24" height="20" rx="2"/><path d="M4 13h24M4 21h24M13 7v20M21 7v20" stroke="#FFF6E9" stroke-width="2" fill="none"/></symbol>
<symbol id="tc-wagon" viewBox="0 0 32 32"><rect x="3" y="9" width="26" height="13" rx="2"/><rect x="8" y="12" width="16" height="6" fill="#FFF6E9"/><circle cx="9" cy="25" r="3.4"/><circle cx="23" cy="25" r="3.4"/></symbol>
<symbol id="tc-vault" viewBox="0 0 32 32"><rect x="3" y="5" width="26" height="22" rx="3"/><circle cx="16" cy="16" r="6.5" fill="#FFF6E9"/><circle cx="16" cy="16" r="2.2"/><path d="M16 8v3M16 21v3M8.5 16h3M20.5 16h3" stroke="#111111" stroke-width="2"/></symbol>
<symbol id="tc-empty" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="5 5"/></symbol>
<symbol id="tc-grab" viewBox="0 0 32 32"><path d="M16 2l6 6h-4v7h-4V8h-4z"/><path d="M4 17h24v11H4z" fill="none" stroke="currentColor" stroke-width="3.4"/><rect x="4" y="17" width="24" height="3.2"/></symbol>
<symbol id="tc-drop" viewBox="0 0 32 32"><path d="M16 21l-6-6h4V4h4v11h4z"/><path d="M4 24h24v5H4z"/></symbol>
<symbol id="tc-swap" viewBox="0 0 32 32"><path d="M6 11h16V6l7 7-7 7v-5H6z"/><path d="M26 25H10v5l-7-7 7-7v5h16z"/></symbol>
<symbol id="tc-load" viewBox="0 0 32 32"><path d="M16 3l6 7h-4v8h-4v-8h-4z" transform="rotate(180 16 10.5)"/><rect x="4" y="19" width="24" height="10" rx="2"/><rect x="9" y="22" width="14" height="4" fill="#FFF6E9"/></symbol>
<symbol id="tc-throw" viewBox="0 0 32 32"><path d="M16 2l3.2 8.4L28 8l-5.6 7.2L30 20l-9-.6 1.6 9-6.6-6.4-6.6 6.4L11 19.4 2 20l7.6-4.8L4 8l8.8 2.4z"/></symbol>
<symbol id="tc-coin" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#FFF6E9" stroke-width="2.4"/><path d="M16 10v12M12.5 13h7" stroke="#FFF6E9" stroke-width="2.4" fill="none"/></symbol>
<symbol id="tc-scrap" viewBox="0 0 32 32"><path d="M5 12h22l-2.4 16H7.4z"/><rect x="3" y="6" width="26" height="5" rx="2"/><path d="M12 16v8M20 16v8" stroke="#FFF6E9" stroke-width="2.4"/></symbol>
<symbol id="tc-dice" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="4"/><circle cx="11" cy="11" r="2.6" fill="#FFF6E9"/><circle cx="21" cy="21" r="2.6" fill="#FFF6E9"/><circle cx="16" cy="16" r="2.6" fill="#FFF6E9"/></symbol>
<symbol id="tc-plank" viewBox="0 0 32 32"><rect x="2" y="8" width="28" height="6" rx="2"/><rect x="2" y="18" width="28" height="6" rx="2"/><path d="M9 8v6M22 18v6" stroke="#FFF6E9" stroke-width="2"/></symbol>
<symbol id="tc-hat-cap" viewBox="0 0 32 32"><path d="M6 17c0-6 4-9.5 10-9.5S26 11 26 17z"/><rect x="4.5" y="17" width="23" height="4.2" rx="1"/><path d="M3 21.5h26c0 3.6-6.2 5-13 5s-13-1.4-13-5z"/><rect x="13" y="10" width="6" height="3.2" rx="1.2" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-cowboy" viewBox="0 0 32 32"><path d="M9.5 18.5c0-8 2-12 6.5-12s6.5 4 6.5 12z"/><path d="M2 18.5h28c0 4-6.6 5.6-14 5.6S2 22.5 2 18.5z"/><rect x="9" y="15" width="14" height="3" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-beanie" viewBox="0 0 32 32"><circle cx="16" cy="6" r="3"/><path d="M6 20c0-6.5 4.5-11 10-11s10 4.5 10 11z"/><rect x="4" y="20" width="24" height="5.4" rx="2.2"/><rect x="11" y="12" width="10" height="3" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-top" viewBox="0 0 32 32"><rect x="10" y="4" width="12" height="16" rx="1.5"/><rect x="9" y="14" width="14" height="3.4" fill="#FFF6E9"/><path d="M3 20h26c0 3.4-5.8 4.6-13 4.6S3 23.4 3 20z"/></symbol>
<symbol id="tc-hat-straw" viewBox="0 0 32 32"><path d="M10 18c0-7 2.6-10 6-10s6 3 6 10z"/><path d="M1 18.5h30c0 3.6-7 5.2-15 5.2S1 22.1 1 18.5z"/><path d="M9.5 16.5h13" stroke="#FFF6E9" stroke-width="2.6"/></symbol>
<symbol id="tc-hat-none" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M9 23L23 9" stroke="currentColor" stroke-width="3"/></symbol>
`;

const HAT_FALLBACK = ["cap", "cowboy", "beanie", "top", "straw", "none"];
const COLOR_FALLBACK = ["#FF5747", "#21D0DE", "#FFD400", "#7CD628", "#8B5CF6", "#FF8A1F", "#FF77C8", "#3B82F6"];
const SKIN_FALLBACK = ["#F6C89F", "#E0A272", "#A9714B", "#6B4426"];

const CARRY = {
  wood: { icon: "tc-wood", name: "WOOD" },
  iron: { icon: "tc-iron", name: "IRON" },
  rail: { icon: "tc-rail", name: "RAILS" },
  tool_axe: { icon: "tc-axe", name: "AXE" },
  tool_pick: { icon: "tc-pick", name: "PICKAXE" },
  tool_bucket: { icon: "tc-bucket", name: "BUCKET" },
  stick: { icon: "tc-boom", name: "DYNAMITE" }
};

const CTX_ICON = {
  1: "tc-grab", 2: "tc-swap", 3: "tc-drop", 4: "tc-rail", 5: "tc-plank", 6: "tc-load",
  7: "tc-rail", 8: "tc-throw", 9: "tc-coin", 10: "tc-scrap", 11: "tc-dice", 12: "tc-wagon", 13: "tc-vault"
};

const PHASE_NOTE = {
  [PHASE.LOBBY]: "WALK ONTO THE GREEN START TILE",
  [PHASE.COUNTDOWN]: "HOLD ON — THE ENGINE IS ROLLING",
  [PHASE.RUN]: "",
  [PHASE.WRECK]: "OFF THE RAILS · STAND ON THE RETRY TILE",
  [PHASE.SHOP]: "SPEND THE PURSE · CARRY WAGONS TO THE TRAIN"
};

let ui = null;
let onInputCb = null;
let onButtonCb = null;
let raf = 0;
let lastSend = 0;
let vec = { x: 0, y: 0 };
let padCache = "";
let releaseStick = null;
let idleBound = false;

export function ensureIcons() {
  if (document.getElementById("tc-sprite")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "tc-sprite";
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = "<defs>" + SPRITE + "</defs>";
  document.body.appendChild(svg);
}

export function iconSvg(id, cls) {
  return '<svg class="' + (cls || "") + '" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><use href="#' + id + '"/></svg>';
}

export function hatIconId(hat) {
  const k = typeof hat === "number" ? (HAT_FALLBACK[hat] || "none") : String(hat || "none").toLowerCase();
  return HAT_FALLBACK.indexOf(k) >= 0 ? "tc-hat-" + k : "tc-hat-none";
}

function asColor(v) {
  if (typeof v === "number") return "#" + v.toString(16).padStart(6, "0");
  if (typeof v === "string") return v.charAt(0) === "#" || v.indexOf("rgb") === 0 ? v : "#" + v;
  if (v && typeof v === "object") return asColor(v.hex != null ? v.hex : v.css != null ? v.css : v.color);
  return "#888888";
}

export async function loadAvatarData() {
  let mod = null;
  try { mod = await import("../data/avatars.js"); } catch (e) { mod = null; }
  const rawHats = (mod && (mod.HATS || mod.hats)) || HAT_FALLBACK;
  const rawColors = (mod && (mod.COLOR_OPTIONS || mod.COLORS)) || COLOR_FALLBACK;
  const rawSkins = (mod && (mod.SKIN_OPTIONS || mod.SKINS)) || SKIN_FALLBACK;
  const hats = Array.from(rawHats).map((h, i) => {
    if (typeof h === "string") return { key: h, label: h.toUpperCase() };
    const key = h && (h.key || h.id || h.name) ? String(h.key || h.id || h.name) : HAT_FALLBACK[i] || "none";
    return { key, label: String(h.label || h.name || key).toUpperCase() };
  });
  return {
    hats,
    colors: Array.from(rawColors).map(asColor),
    skins: Array.from(rawSkins).map(asColor)
  };
}

function carryInfo(hold) {
  if (!hold || !hold.k) return { icon: "tc-empty", name: "EMPTY", n: 0, empty: true };
  const k = String(hold.k);
  if (CARRY[k]) return { icon: CARRY[k].icon, name: CARRY[k].name, n: hold.n || 1, empty: false };
  if (k.indexOf("wagon_crate:") === 0) return { icon: "tc-wagon", name: k.split(":")[1].toUpperCase(), n: 1, empty: false };
  if (k.indexOf("upgrade_crate:") === 0) {
    const p = k.split(":");
    const lvl = ["", "I", "II", "III"][Number(p[2]) || 1] || "";
    return { icon: "tc-crate", name: (p[1] || "").toUpperCase() + " " + lvl, n: 1, empty: false };
  }
  return { icon: "tc-crate", name: k.toUpperCase(), n: hold.n || 1, empty: false };
}

export function initPad(padRoot, { onInput, onButton } = {}) {
  onInputCb = onInput || null;
  onButtonCb = onButton || null;
  ensureIcons();
  padRoot.innerHTML =
    '<div class="pad">' +
      '<div class="pad-rail" aria-hidden="true"></div>' +
      '<div class="pad-note"></div>' +
      '<div class="pad-id">' + iconSvg("tc-hat-cap") + '</div>' +
      '<div class="pad-hold">' +
        '<span class="glyph">' + iconSvg("tc-empty") + '</span>' +
        '<span class="txt"><span class="row"><span class="name">EMPTY</span><span class="count"></span></span></span>' +
      '</div>' +
      '<div class="pad-link">SLOW LINK</div>' +
      '<div class="pad-stick"><span class="ring"></span>' +
        '<span class="tick t-up"></span><span class="tick t-dn"></span><span class="tick t-l"></span><span class="tick t-r"></span>' +
        '<span class="knob">' + iconSvg("tc-pan") + '</span>' +
      '</div>' +
      '<div class="pad-act off"><span class="ctx"></span>' + iconSvg("tc-empty", "act-icon") + '<span class="label">WAIT</span></div>' +
      '<div class="pad-flash"></div>' +
      '<div class="pad-notice"><div class="pad-notice-card"><div class="t"></div><div class="s"></div></div></div>' +
    '</div>';

  const root = padRoot.querySelector(".pad");
  ui = {
    root,
    note: root.querySelector(".pad-note"),
    id: root.querySelector(".pad-id"),
    hold: root.querySelector(".pad-hold"),
    holdGlyph: root.querySelector(".pad-hold .glyph"),
    holdName: root.querySelector(".pad-hold .name"),
    holdCount: root.querySelector(".pad-hold .count"),
    link: root.querySelector(".pad-link"),
    stick: root.querySelector(".pad-stick"),
    knob: root.querySelector(".pad-stick .knob"),
    act: root.querySelector(".pad-act"),
    actCtx: root.querySelector(".pad-act .ctx"),
    actIcon: root.querySelector(".pad-act .act-icon"),
    actLabel: root.querySelector(".pad-act .label"),
    flash: root.querySelector(".pad-flash"),
    notice: root.querySelector(".pad-notice"),
    noticeT: root.querySelector(".pad-notice .t"),
    noticeS: root.querySelector(".pad-notice .s")
  };

  bindTouch(root);
  bindIdleGuard();
  padCache = "";
  vec = { x: 0, y: 0 };
  if (raf) cancelAnimationFrame(raf);
  lastSend = 0;
  raf = requestAnimationFrame(loop);
  return ui;
}

function haltMotion() {
  if (releaseStick) releaseStick();
  vec = { x: 0, y: 0 };
  lastSend = 0;
  if (onInputCb) onInputCb({ x: 0, y: 0 });
}

function bindIdleGuard() {
  if (idleBound) return;
  idleBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") haltMotion();
  });
  window.addEventListener("blur", haltMotion);
  window.addEventListener("pagehide", haltMotion);
}

function bindTouch(root) {
  const st = { pid: null, cx: 0, cy: 0, travel: 0, moved: false };
  let btnPid = null;

  const zoneOf = (e) => {
    const r = root.getBoundingClientRect();
    const relY = (e.clientY - r.top) / r.height;
    if (relY < 0.26) return null;
    return (e.clientX - r.left) / r.width < 0.5 ? "stick" : "act";
  };

  const stickDown = (e) => {
    const base = ui.stick.getBoundingClientRect();
    const homeX = base.left + base.width / 2;
    const homeY = base.top + base.height / 2;
    st.travel = base.width * 0.34;
    const dx = e.clientX - homeX;
    const dy = e.clientY - homeY;
    if (Math.hypot(dx, dy) > base.width * 0.5) {
      st.cx = e.clientX;
      st.cy = e.clientY;
      ui.stick.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
    } else {
      st.cx = homeX;
      st.cy = homeY;
      ui.stick.style.transform = "";
    }
    ui.stick.classList.add("live");
    st.pid = e.pointerId;
    stickMove(e);
  };

  const stickMove = (e) => {
    let dx = e.clientX - st.cx;
    let dy = e.clientY - st.cy;
    const d = Math.hypot(dx, dy);
    if (d > st.travel && d > 0) { dx = (dx / d) * st.travel; dy = (dy / d) * st.travel; }
    ui.knob.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
    let vx = dx / st.travel;
    let vy = -dy / st.travel;
    const mag = Math.min(1, Math.hypot(vx, vy));
    if (mag < DEADZONE) { vec = { x: 0, y: 0 }; return; }
    const k = ((mag - DEADZONE) / (1 - DEADZONE)) / Math.hypot(vx, vy);
    vec = { x: vx * k, y: vy * k };
  };

  const stickUp = () => {
    st.pid = null;
    vec = { x: 0, y: 0 };
    ui.knob.style.transform = "";
    ui.stick.style.transform = "";
    ui.stick.classList.remove("live");
  };

  root.addEventListener("pointerdown", (e) => {
    const z = zoneOf(e);
    if (!z) return;
    e.preventDefault();
    try { root.setPointerCapture(e.pointerId); } catch (err) {}
    if (z === "stick") { if (st.pid === null) stickDown(e); return; }
    if (btnPid !== null) return;
    btnPid = e.pointerId;
    ui.act.classList.add("down");
    if (onButtonCb) onButtonCb();
  }, { passive: false });

  root.addEventListener("pointermove", (e) => {
    if (e.pointerId === st.pid) { e.preventDefault(); stickMove(e); }
  }, { passive: false });

  const release = (e) => {
    if (e.pointerId === st.pid) stickUp();
    if (e.pointerId === btnPid) { btnPid = null; ui.act.classList.remove("down"); }
  };
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
  root.addEventListener("lostpointercapture", release);
  root.addEventListener("contextmenu", (e) => e.preventDefault());
  releaseStick = stickUp;
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  const period = 1000 / num("INPUT_HZ", 25);
  if (!lastSend) lastSend = t - period;
  if (t - lastSend < period) return;
  lastSend = t - lastSend > period * 4 ? t : lastSend + period;
  if (onInputCb) onInputCb({ x: Math.round(vec.x * 1000) / 1000, y: Math.round(vec.y * 1000) / 1000 });
}

export function setPad(pad) {
  if (!ui || !pad) return;
  const key = JSON.stringify([pad.hold || null, pad.ctx || 0, pad.near || ""]);
  if (key === padCache) return;
  padCache = key;
  const info = carryInfo(pad.hold);
  ui.holdGlyph.innerHTML = iconSvg(info.icon);
  ui.holdName.textContent = info.name;
  ui.holdCount.textContent = info.n > 1 ? "×" + info.n : "";
  ui.hold.classList.toggle("empty", info.empty);
  const ctx = pad.ctx || CTX.NONE;
  const label = CTX_LABEL[ctx] || "";
  ui.act.classList.toggle("off", ctx === CTX.NONE);
  ui.actLabel.textContent = label || "—";
  ui.actIcon.outerHTML = iconSvg(CTX_ICON[ctx] || "tc-empty", "act-icon");
  ui.actIcon = ui.act.querySelector(".act-icon");
  const near = String(pad.near || "").toUpperCase();
  ui.actCtx.textContent = near ? "NEAR: " + near : "";
  ui.actCtx.style.display = near ? "" : "none";
}

export function setPhasePad(phase) {
  if (!ui) return;
  const note = PHASE_NOTE[phase] != null ? PHASE_NOTE[phase] : "";
  ui.note.textContent = note;
  ui.note.classList.toggle("on", !!note);
  ui.root.classList.toggle("wreck", phase === PHASE.WRECK);
}

export function buzz(kind) {
  if (!ui) return;
  const plan = kind === "derailWarn" ? { n: 3, pat: [90, 60, 90, 60, 180] }
    : kind === "overheatWarn" ? { n: 2, pat: [140, 90, 140] }
    : { n: 1, pat: [300] };
  if (navigator.vibrate) { try { navigator.vibrate(plan.pat); } catch (e) {} }
  const f = ui.flash;
  f.classList.remove("go");
  void f.offsetWidth;
  f.style.animationIterationCount = String(plan.n);
  f.classList.add("go");
}

export function setLink(mode) {
  if (!ui) return;
  ui.link.classList.toggle("on", mode === "relay");
}

export function setNotice(title, sub) {
  if (!ui) return;
  if (!title) { ui.notice.classList.remove("on"); return; }
  ui.noticeT.textContent = title;
  ui.noticeS.textContent = sub || "";
  ui.notice.classList.add("on");
}

export function setIdentity(color, hat) {
  if (!ui) return;
  ui.id.style.background = color || "#FF5747";
  ui.id.innerHTML = iconSvg(hatIconId(hat));
}

export function stopPad() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}
