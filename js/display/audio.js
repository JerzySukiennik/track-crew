// Track Crew — file-based CC0 sfx and per-biome music player; maps drained sim events to sounds.

import { TUNE } from "../config.js";

const SFX_DIR = "assets/audio/sfx/";
const MUSIC_DIR = "assets/audio/music/";
const POOL = 3;

const SFX = {
  chop_1: 0.9,
  chop_2: 0.9,
  tree_fall: 1.0,
  mine_1: 0.85,
  mine_2: 0.85,
  rock_break: 1.0,
  splash_scoop: 0.8,
  steam_pour: 0.8,
  rail_clank: 0.9,
  pickup: 0.7,
  drop: 0.7,
  load: 0.8,
  coin: 1.0,
  buy: 0.9,
  reroll: 0.8,
  error: 0.7,
  explosion: 1.0,
  derail_crash: 1.0,
  arrive_bell: 0.9,
  teleport: 0.8,
  tick: 0.7,
  craft: 0.6,
  warn_beep: 0.8,
  start: 0.9,
  whistle: 1.0
};

const MUSIC = {
  meadows: "meadows.mp3",
  forest: "forest.mp3",
  desert: "desert.mp3"
};

const EVENT_SFX = {
  chop: ["chop_1", "chop_2"],
  hitTree: ["chop_1", "chop_2"],
  treeFall: "tree_fall",
  treeDown: "tree_fall",
  mine: ["mine_1", "mine_2"],
  hitOre: ["mine_1", "mine_2"],
  oreDepleted: "rock_break",
  rockBreak: "rock_break",
  scoop: "splash_scoop",
  splash: "splash_scoop",
  pour: "steam_pour",
  cool: "steam_pour",
  steam: "steam_pour",
  railPlaced: "rail_clank",
  placeRail: "rail_clank",
  bankBuilt: "load",
  buildBank: "load",
  pickup: "pickup",
  take: "pickup",
  takeRails: "pickup",
  takeStash: "pickup",
  swap: "pickup",
  drop: "drop",
  load: "load",
  deposit: "load",
  craft: "craft",
  railCrafted: "craft",
  gold: "coin",
  goldNode: "coin",
  purse: "coin",
  buy: "buy",
  bought: "buy",
  scrap: "coin",
  reroll: "reroll",
  insertWagon: "buy",
  error: "error",
  denied: "error",
  explosion: "explosion",
  dynamite: "explosion",
  derail: "derail_crash",
  wreck: "derail_crash",
  overheat: "explosion",
  arrive: "arrive_bell",
  station: "arrive_bell",
  teleport: "teleport",
  leashTeleport: "teleport",
  toolReturn: "teleport",
  countdown: "tick",
  tick: "tick",
  countdownGo: "start",
  roundStart: "start",
  derailWarn: "whistle",
  overheatWarn: "warn_beep",
  warn: "warn_beep",
  join: "buy",
  playerJoin: "buy"
};

const state = {
  ready: false,
  pools: new Map(),
  music: new Map(),
  current: null,
  duck: false,
  duckT: 0,
  musicGain: TUNE.MUSIC_VOLUME
};

function eventType(ev) {
  if (!ev) return null;
  if (typeof ev === "string") return ev;
  return ev.type || ev.t || ev.kind || ev.name || null;
}

function makePool(name) {
  const list = [];
  for (let i = 0; i < POOL; i++) {
    const a = new Audio(SFX_DIR + name + ".mp3");
    a.preload = "auto";
    a.volume = Math.min(1, (SFX[name] || 1) * TUNE.SFX_VOLUME);
    a.addEventListener("error", () => { a.dataset.broken = "1"; });
    list.push(a);
  }
  return { list, i: 0 };
}

export function initAudio() {
  if (state.ready) return;
  try {
    for (const name of Object.keys(SFX)) state.pools.set(name, makePool(name));
    for (const key of Object.keys(MUSIC)) {
      const a = new Audio(MUSIC_DIR + MUSIC[key]);
      a.preload = "auto";
      a.loop = true;
      a.volume = 0;
      a.addEventListener("error", () => { a.dataset.broken = "1"; });
      state.music.set(key, a);
    }
    state.ready = true;
  } catch (e) {
    state.ready = false;
  }
}

export function play(name) {
  if (!state.ready) return;
  const pool = state.pools.get(name);
  if (!pool) return;
  const a = pool.list[pool.i];
  pool.i = (pool.i + 1) % pool.list.length;
  if (a.dataset.broken) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    return;
  }
}

export function setMusic(biomeKey) {
  if (!state.ready) return;
  if (state.current === biomeKey) return;
  const prev = state.current ? state.music.get(state.current) : null;
  if (prev) {
    try { prev.pause(); prev.currentTime = 0; } catch (e) { state.current = null; }
  }
  state.current = biomeKey && state.music.has(biomeKey) ? biomeKey : null;
  const next = state.current ? state.music.get(state.current) : null;
  if (!next || next.dataset.broken) return;
  try {
    next.volume = state.duck ? TUNE.MUSIC_DUCK : state.musicGain;
    const p = next.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    return;
  }
}

function applyDuck(on) {
  if (state.duck === on) return;
  state.duck = on;
  const cur = state.current ? state.music.get(state.current) : null;
  if (!cur) return;
  try { cur.volume = on ? TUNE.MUSIC_DUCK : state.musicGain; } catch (e) { state.duck = !on; }
}

export function consume(game, events) {
  if (!state.ready) return;

  if (game && game.biome) setMusic(game.biome);

  const counts = new Map();
  const list = events || [];
  for (let i = 0; i < list.length; i++) {
    const type = eventType(list[i]);
    if (!type) continue;
    const entry = EVENT_SFX[type];
    if (!entry) continue;
    const n = counts.get(type) || 0;
    if (n >= 2) continue;
    counts.set(type, n + 1);
    const name = Array.isArray(entry) ? entry[(n + i) % entry.length] : entry;
    play(name);
    if (type === "derailWarn" || type === "overheatWarn") state.duckT = TUNE.DERAIL_WARN_S;
  }

  const warn = !!(game && game.train && game.train.warn);
  if (state.duckT > 0) state.duckT -= 1 / TUNE.SIM_HZ;
  applyDuck(warn || state.duckT > 0);
}

export function stopMusic() {
  setMusic(null);
}
