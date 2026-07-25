// Track Crew — TV DOM: tiny run readout, join screen with QR and crew, wreck screen and the derail edge pulse.

import { TUNE } from "../config.js";
import { COLOR_OPTIONS, HATS } from "../data/avatars.js";
import { trainPose } from "./render/trainmesh.js";

const FULL_WRECK_S = 4.5;
const FULL_JOIN_MIN = 0;

const el = {};
const shown = {};
let root = null;
let qr = null;
let qrCode = "";
let room = { code: "", url: "" };
let pulseT = 0;
let lastPhase = "";

const SYMBOLS = `
<svg width="0" height="0" class="tv-defs" aria-hidden="true"><defs>
<symbol id="tc-loco" viewBox="0 0 48 32">
<rect x="2" y="14" width="34" height="10" rx="1.5"/><rect x="24" y="4" width="12" height="11" rx="1.5"/>
<rect x="6" y="6" width="7" height="9" rx="1"/><rect x="0" y="24" width="44" height="3"/>
<circle cx="10" cy="27.5" r="3.6"/><circle cx="22" cy="27.5" r="3.6"/><circle cx="33" cy="27.5" r="3.6"/>
<rect x="27" y="7" width="6" height="4.5" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-cap" viewBox="0 0 32 32">
<path d="M6 17c0-6 4-9.5 10-9.5S26 11 26 17z"/><rect x="4.5" y="17" width="23" height="4.2" rx="1"/>
<path d="M3 21.5h26c0 3.6-6.2 5-13 5s-13-1.4-13-5z"/><rect x="13" y="10" width="6" height="3.2" rx="1.2" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-cowboy" viewBox="0 0 32 32">
<path d="M9.5 18.5c0-8 2-12 6.5-12s6.5 4 6.5 12z"/><path d="M2 18.5h28c0 4-6.6 5.6-14 5.6S2 22.5 2 18.5z"/>
<rect x="9" y="15" width="14" height="3" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-beanie" viewBox="0 0 32 32">
<circle cx="16" cy="6" r="3"/><path d="M6 20c0-6.5 4.5-11 10-11s10 4.5 10 11z"/>
<rect x="4" y="20" width="24" height="5.4" rx="2.2"/><rect x="11" y="12" width="10" height="3" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-top" viewBox="0 0 32 32">
<rect x="10" y="4" width="12" height="15" rx="1"/><rect x="4" y="19" width="24" height="4.4" rx="1.4"/>
<rect x="10" y="14" width="12" height="4" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-straw" viewBox="0 0 32 32">
<path d="M10 17c0-6 2.4-9 6-9s6 3 6 9z"/><path d="M1 17.5h30c0 4.2-7 6-15 6s-15-1.8-15-6z"/>
<rect x="9.5" y="14" width="13" height="3.2" fill="#FFF6E9"/></symbol>
<symbol id="tc-hat-none" viewBox="0 0 32 32">
<circle cx="16" cy="12" r="7.5"/><path d="M4 30c0-6.4 5.4-9.5 12-9.5S28 23.6 28 30z"/></symbol>
<symbol id="tc-coin" viewBox="0 0 32 32">
<circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="9" fill="#FFF6E9"/>
<path d="M14 10h4v12h-4z" /><path d="M11 13h10v3H11zM11 18h10v3H11z"/></symbol>
</defs></svg>`;

const TILE_GREEN = `<svg class="tile" viewBox="0 0 64 50" aria-hidden="true">
<polygon points="32,30 60,20 60,28 32,38" fill="#4CA315" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="32,30 4,20 4,28 32,38" fill="#3D8611" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="32,4 60,20 32,36 4,20" fill="#7CD628" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
<rect x="28.5" y="9" width="7" height="10" fill="#111"/><polygon points="32,29 23.5,19 40.5,19" fill="#111"/></svg>`;

const TILE_RETRY = `<svg class="tile" viewBox="0 0 64 50" aria-hidden="true">
<polygon points="32,30 60,20 60,28 32,38" fill="#0FA3AF" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="32,30 4,20 4,28 32,38" fill="#0C8B95" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
<polygon points="32,4 60,20 32,36 4,20" fill="#21D0DE" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
<ellipse cx="32" cy="20" rx="9" ry="6" fill="none" stroke="#111" stroke-width="3.4" stroke-dasharray="36 12"/>
<polygon points="41,27 36.2,18.5 45.8,18.5" fill="#111"/></svg>`;

const WRECK_ART = `<svg class="wreck-art" viewBox="0 0 210 132" aria-hidden="true">
<rect x="0" y="120" width="210" height="8" fill="#111"/>
<g stroke="#111" stroke-width="3.5" fill="#C98B45">
<rect x="6" y="103" width="44" height="10" rx="2" transform="rotate(-9 28 108)"/>
<rect x="156" y="99" width="46" height="10" rx="2" transform="rotate(17 179 104)"/></g>
<g stroke="#111" stroke-width="5" stroke-linecap="round">
<path d="M182 44l16-11"/><path d="M188 60h18"/><path d="M172 28l7-15"/></g>
<g transform="rotate(-22 110 74)">
<rect x="52" y="52" width="96" height="34" fill="#FF5747" stroke="#111" stroke-width="5"/>
<rect x="120" y="22" width="42" height="34" fill="#FFD400" stroke="#111" stroke-width="5"/>
<rect x="130" y="30" width="22" height="16" fill="#FFF6E9" stroke="#111" stroke-width="4"/>
<rect x="64" y="28" width="22" height="26" fill="#21D0DE" stroke="#111" stroke-width="5"/>
<circle cx="76" cy="92" r="11" fill="#FFF6E9" stroke="#111" stroke-width="5"/>
<circle cx="118" cy="92" r="11" fill="#FFF6E9" stroke="#111" stroke-width="5"/></g></svg>`;

const HAT_SYMBOL = ["tc-hat-cap", "tc-hat-cowboy", "tc-hat-beanie", "tc-hat-top", "tc-hat-straw", "tc-hat-none"];

function hatHref(i) {
  return "#" + (HAT_SYMBOL[i] || HAT_SYMBOL[HATS.length - 1]);
}

function html() {
  return `
${SYMBOLS}
<div class="tv-run" id="tv-run">
  <div class="hud-gold"><svg viewBox="0 0 32 32" fill="currentColor"><use href="#tc-coin"/></svg><span id="hud-gold">0</span></div>
  <div class="hud-dist"><span class="k">TO STATION</span><span class="v" id="hud-dist">—</span></div>
</div>

<div class="tv-screen tv-join" id="tv-join" hidden>
  <div class="tv-top">
    <span class="tv-mark">
      <svg class="loco" viewBox="0 0 48 32" fill="currentColor"><use href="#tc-loco"/></svg>
      <span class="chip">TRACK CREW</span>
    </span>
    <span class="state" id="join-state">LOBBY · WAITING FOR CREW</span>
  </div>
  <div class="join-body">
    <div class="qr-card">
      <div class="qr-slot" id="qr-slot">
        <div class="qr-wait"><svg viewBox="0 0 48 32" fill="currentColor"><use href="#tc-loco"/></svg></div>
      </div>
      <span class="cap" id="qr-cap">SCAN TO JOIN</span>
    </div>
    <div class="join-right">
      <span class="eyebrow" id="join-eyebrow">ROOM CODE</span>
      <div class="code" id="join-code"><span>·</span><span>·</span><span>·</span><span>·</span></div>
      <p class="fallback" id="join-fallback">No camera? Open <span class="url" id="join-url">—</span> and type the code.</p>
      <p class="fallback join-note" id="join-note">Setting up the room. The code and the QR appear here the moment the room server answers.</p>
      <div class="crew" id="join-crew"></div>
    </div>
  </div>
  <div class="footbar">
    ${TILE_GREEN}
    <div>
      <div class="line1">THIS GAME HAS NO BUTTONS.</div>
      <div class="line2">Walk your voxel onto the green START tile. When all boots are on the tile, the engine rolls.</div>
    </div>
    <span class="stamp">FEET<br>= ENTER</span>
  </div>
</div>

<div class="tv-screen tv-wreck" id="tv-wreck" hidden>
  <div class="hazard"></div>
  <div class="tv-top">
    <span class="tv-mark">
      <svg class="loco" viewBox="0 0 48 32" fill="currentColor"><use href="#tc-loco"/></svg>
      <span class="chip">TRACK CREW</span>
    </span>
    <span class="state coral" id="wreck-state">RUN ENDED · NO TRACK LEFT</span>
  </div>
  <div class="end-body">
    <div class="end-head">
      <div class="words">
        <h1 id="wreck-title">OFF THE<br><em>RAILS!</em></h1>
        <p id="wreck-line">The engine went looking for track and found a meadow.</p>
      </div>
      ${WRECK_ART}
      <span class="round-stamp">ATTEMPT<br><span id="wreck-attempt">NO. 1</span></span>
    </div>
    <div class="stats">
      <div class="stat a"><div class="k">ROUNDS SURVIVED</div><div class="v" id="st-rounds">0</div></div>
      <div class="stat b"><div class="k">TOTAL DISTANCE</div><div class="v" id="st-dist">0<small> M</small></div></div>
      <div class="stat c"><div class="k">GOLD THIS ROUND</div><div class="v" id="st-round-gold">+0</div></div>
      <div class="stat d"><div class="k">SHARED PURSE</div><div class="v" id="st-purse">0</div></div>
    </div>
  </div>
  <div class="footbar">
    ${TILE_RETRY}
    <div>
      <div class="line1">STAND ON THE RETRY TILE.</div>
      <div class="line2">The purse carries over. New run starts the moment the last pair of boots lands on the tile.</div>
    </div>
    <span class="aboard" id="wreck-aboard"></span>
    <span class="stamp" id="wreck-stamp">0 OF 0<br>ABOARD</span>
  </div>
</div>

<div class="tv-count" id="tv-count" hidden><span id="count-n">3</span></div>
<div class="tv-banner" id="tv-banner" hidden><span id="banner-txt">SHOP</span></div>
<div class="tv-pulse" id="tv-pulse"></div>`;
}

export function initHud(tvRoot) {
  root = tvRoot;
  root.innerHTML = html();
  const id = (k) => root.querySelector("#" + k);
  el.run = id("tv-run");
  el.gold = id("hud-gold");
  el.dist = id("hud-dist");
  el.join = id("tv-join");
  el.joinState = id("join-state");
  el.code = id("join-code");
  el.url = id("join-url");
  el.crew = id("join-crew");
  el.qrSlot = id("qr-slot");
  el.qrCap = id("qr-cap");
  el.eyebrow = id("join-eyebrow");
  el.wreck = id("tv-wreck");
  el.wreckState = id("wreck-state");
  el.wreckTitle = id("wreck-title");
  el.wreckLine = id("wreck-line");
  el.attempt = id("wreck-attempt");
  el.stRounds = id("st-rounds");
  el.stDist = id("st-dist");
  el.stRoundGold = id("st-round-gold");
  el.stPurse = id("st-purse");
  el.aboard = id("wreck-aboard");
  el.stamp = id("wreck-stamp");
  el.count = id("tv-count");
  el.countN = id("count-n");
  el.banner = id("tv-banner");
  el.bannerTxt = id("banner-txt");
  el.pulse = id("tv-pulse");

  buildCrew(0);
  setRoom(room.code, room.url);
}

export function setRoom(code, url) {
  room.code = code || "";
  room.url = url || defaultUrl(room.code);
  if (!el.code) return;
  const spans = el.code.children;
  for (let i = 0; i < spans.length; i++) {
    spans[i].textContent = room.code[i] || "·";
  }
  if (el.url) setText(el.url, prettyUrl(room.url));
  if (el.qrCap) setText(el.qrCap, room.code ? "SCAN TO JOIN" : "NO ROOM YET");
  if (el.eyebrow) setText(el.eyebrow, room.code ? "ROOM CODE" : "ROOM CODE PENDING");
  el.join.classList.toggle("noroom", !room.code);
  makeQr();
}

function defaultUrl(code) {
  const base = location.origin + location.pathname;
  return base + "?role=controller" + (code ? "&room=" + code : "");
}

function prettyUrl(url) {
  return String(url).replace(/^https?:\/\//, "").replace(/\?.*$/, "");
}

function makeQr() {
  if (!el.qrSlot) return;
  if (!room.code) {
    if (qrCode !== "") {
      qrCode = "";
      qr = null;
      el.qrSlot.innerHTML = '<div class="qr-wait"><svg viewBox="0 0 48 32" fill="currentColor"><use href="#tc-loco"/></svg></div>';
    }
    return;
  }
  if (qrCode === room.code) return;
  qrCode = room.code;
  el.qrSlot.innerHTML = "";
  qr = null;
  if (typeof window.QRCode !== "function") {
    el.qrSlot.innerHTML = '<div class="qr-fallback">' + room.code + "</div>";
    return;
  }
  try {
    qr = new window.QRCode(el.qrSlot, {
      text: room.url,
      width: 420,
      height: 420,
      colorDark: "#111111",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
    });
  } catch (e) {
    el.qrSlot.innerHTML = '<div class="qr-fallback">' + room.code + "</div>";
  }
}

function setText(node, text) {
  if (node && node.textContent !== text) node.textContent = text;
  return node;
}

function buildCrew(n) {
  if (!el.crew) return;
  const max = TUNE.MAX_PLAYERS;
  if (el.crew.children.length !== max) {
    let s = "";
    for (let i = 0; i < max; i++) {
      s += '<div class="slot-card open" data-i="' + i + '">' +
        '<span class="dot"></span><svg viewBox="0 0 32 32" fill="currentColor" hidden><use href="#tc-hat-none"/></svg>' +
        '<span class="who">OPEN</span></div>';
    }
    el.crew.innerHTML = s;
  }
}

const TILT = [-1.5, 1, -0.8, 1.6, -1.2];

function syncCrew(game) {
  if (!el.crew) return;
  const cards = el.crew.children;
  const list = [];
  if (game.players) game.players.forEach((p) => list.push(p));
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const p = list[i];
    const svg = card.querySelector("svg");
    const who = card.querySelector(".who");
    const dot = card.querySelector(".dot");
    if (p) {
      const color = COLOR_OPTIONS[(p.colorIdx | 0) % COLOR_OPTIONS.length];
      if (card.dataset.pid !== String(p.pid)) {
        card.dataset.pid = String(p.pid);
        card.className = "slot-card";
        card.style.background = color.css;
        card.style.transform = "rotate(" + TILT[i % TILT.length] + "deg)";
        svg.hidden = false;
        svg.querySelector("use").setAttribute("href", hatHref(p.hat | 0));
        dot.hidden = true;
      }
      setText(who, String(p.name || "CREW").toUpperCase());
      card.classList.toggle("lost", p.conn === "lost");
    } else if (card.dataset.pid !== "") {
      card.dataset.pid = "";
      card.className = "slot-card open";
      card.style.background = "";
      card.style.transform = "";
      svg.hidden = true;
      dot.hidden = false;
      setText(who, "OPEN");
    }
  }
}

function stationAheadX(game) {
  const list = (game.world && game.world.stations) || [];
  const pose = trainPose(game, 0);
  if (!pose) return null;
  let best = null;
  for (const s of list) {
    const x = typeof s.stopX === "number" ? s.stopX
      : (typeof s.x === "number" ? s.x : (typeof s.x0 === "number" ? s.x0 + 6 : null));
    if (x == null || x < pose.x - 1) continue;
    if (best == null || x < best) best = x;
  }
  if (best == null) return null;
  return Math.max(0, best - pose.x);
}

function distanceText(game) {
  let d = null;
  const st = game.stats;
  if (st && typeof st.distToStation === "number" && st.distToStation > 0) d = st.distToStation;
  else if (typeof game.distToStation === "number") d = game.distToStation;
  else d = stationAheadX(game);
  if (d == null) return "—";
  return Math.max(0, Math.round(d)) + " M";
}

function aboardCount(game) {
  const ft = game.floorTile;
  if (ft && typeof ft.need === "number") {
    return { on: ft.on || 0, total: ft.need || 0 };
  }
  let total = 0;
  if (game.players) {
    game.players.forEach((p) => {
      if (p.conn !== "lost") total++;
    });
  }
  return { on: 0, total };
}

function syncWreck(game) {
  const st = game.stats || {};
  const overheat = game.wreckKind === "overheat" || (game.train && game.train.heat >= 0.99);
  setText(el.wreckState, overheat ? "RUN ENDED · BOILER BLEW" : "RUN ENDED · NO TRACK LEFT");
  el.wreckTitle.innerHTML = overheat ? 'BOILER<br><em>BLEW!</em>' : 'OFF THE<br><em>RAILS!</em>';
  setText(el.wreckLine, overheat
    ? "Nobody poured a bucket in time. The water tank ran dry and the engine let everyone know."
    : "The engine went looking for track and found a meadow. Lay rail before the loco gets there.");
  setText(el.attempt, "NO. " + (game.attempt || 1));
  setText(el.stRounds, String(st.roundsSurvived != null ? st.roundsSurvived : Math.max(0, (game.round || 1) - 1)));
  el.stDist.innerHTML = Math.round(st.distanceTotal || 0).toLocaleString("en-US") + "<small> M</small>";
  setText(el.stRoundGold, "+" + Math.round(st.roundGold || 0));
  setText(el.stPurse, Math.round(game.gold || 0).toLocaleString("en-US"));

  const ab = aboardCount(game);
  if (el.aboard.children.length !== ab.total) {
    let s = "";
    for (let i = 0; i < ab.total; i++) s += "<i></i>";
    el.aboard.innerHTML = s;
  }
  for (let i = 0; i < el.aboard.children.length; i++) {
    el.aboard.children[i].className = i < ab.on ? "on" : "off";
  }
  el.stamp.innerHTML = ab.on + " OF " + ab.total + "<br>ABOARD";
}

export function syncHud(game, events) {
  if (!root || !game) return;
  const phase = game.phase || "lobby";
  const t = game.phaseT || 0;

  if (!room.code) {
    const code = game.roomCode || game.room || (window.TC && window.TC.room) || "";
    if (code) setRoom(code, game.joinUrl || defaultUrl(code));
  }

  const list = events || [];
  for (let i = 0; i < list.length; i++) {
    const ty = list[i] && (list[i].type || list[i].t || list[i].kind);
    if (ty === "derailWarn" || ty === "overheatWarn" || ty === "warn") pulseT = TUNE.DERAIL_WARN_S;
  }
  const warn = !!(game.train && game.train.warn) || pulseT > 0;
  if (pulseT > 0) pulseT -= 1 / TUNE.HUD_HZ;
  el.pulse.classList.toggle("on", warn && phase === "run");

  const running = phase === "run" || phase === "countdown";
  el.run.hidden = !running;
  if (running) {
    setText(el.gold, String(Math.round(game.gold || 0)));
    setText(el.dist, distanceText(game));
  }

  const joining = phase === "lobby";
  el.join.hidden = !joining;
  if (joining) {
    const n = game.players ? game.players.size || game.players.length || 0 : 0;
    el.join.classList.toggle("dock", n > FULL_JOIN_MIN);
    setText(el.joinState, !room.code ? "LOBBY · SETTING UP ROOM"
      : n === 0 ? "LOBBY · WAITING FOR CREW" : "LOBBY · " + n + " ABOARD");
    syncCrew(game);
  }

  const wrecked = phase === "wreck";
  el.wreck.hidden = !wrecked;
  if (wrecked) {
    el.wreck.classList.toggle("dock", t > FULL_WRECK_S);
    syncWreck(game);
  }

  const counting = phase === "countdown";
  el.count.hidden = !counting;
  if (counting) {
    const left = Math.max(0, Math.ceil((TUNE.COUNTDOWN_S || 3) - t));
    setText(el.countN, left > 0 ? String(left) : "GO!");
    el.count.classList.toggle("go", left === 0);
  }

  const shopping = phase === "shop";
  el.banner.hidden = !shopping;
  if (shopping) setText(el.bannerTxt, "STATION · SPEND THE PURSE");

  if (phase !== lastPhase) {
    lastPhase = phase;
    root.dataset.phase = phase;
  }
  shown.phase = phase;
}

export function hudInfo() {
  return { room: room.code, phase: shown.phase };
}
