// Track Crew — authoritative game state: creation, event queue and the phase machine.

import { TUNE } from "../config.js";
import { PHASE } from "../shared/protocol.js";
import { createWorld } from "./world.js";

const EVENT_CAP = 600;

export function createGame({ seed, tune } = {}) {
  const s = seed == null || !Number.isFinite(Number(seed)) ? (Date.now() >>> 0) : (Number(seed) >>> 0);
  const t = tune ? Object.freeze(Object.assign({}, TUNE, tune)) : TUNE;
  return {
    phase: PHASE.LOBBY,
    prevPhase: PHASE.LOBBY,
    round: 1,
    attempt: 1,
    gold: 0,
    seed: s,
    biome: "meadows",
    phaseT: 0,
    time: 0,
    tune: t,
    roomCode: "",
    joinUrl: "",
    players: new Map(),
    items: new Map(),
    world: createWorld(),
    rails: {
      tiles: [], set: new Set(), points: [], cum: [], totalLen: 0,
      lastTile: null, chain: [], pending: [], pendingSet: new Set()
    },
    train: {
      s: 0, speed: 0, heat: 0, warn: false, delayT: 0,
      wagons: [], hookTools: [], stickT: 0,
      x: 0, z: 0, dirX: 1, dirZ: 0,
      tileSet: new Set(), running: false, arrived: false,
      warnD: false, warnH: false, blinkT: 0, remaining: 0
    },
    shop: { offers: [], rerolls: 0, station: null, open: false },
    floorTile: null,
    sticks: [],
    route: {
      round: 0, startX: 0, startS: 0, stopX: 0, dist: 0,
      stationIndex: 0, startStation: 0, routeTiles: [],
      need: { wood: 0, iron: 0 }, supply: { wood: 0, iron: 0, banks: 0, rails: 0 }
    },
    stats: { distanceTotal: 0, roundGold: 0, roundsSurvived: 0, distToStation: 0, wrecks: 0 },
    events: [],
    seq: 1
  };
}

export function pushEvent(game, ev) {
  if (!ev || !ev.type) return null;
  const q = game.events;
  if (q.length >= EVENT_CAP) q.shift();
  q.push(ev);
  return ev;
}

export function drainEvents(game) {
  if (game.events.length === 0) return [];
  const out = game.events;
  game.events = [];
  return out;
}

export function setPhase(game, phase) {
  if (game.phase === phase) return game.phase;
  game.prevPhase = game.phase;
  game.phase = phase;
  game.phaseT = 0;
  pushEvent(game, { type: "phase", phase, round: game.round, attempt: game.attempt });
  return phase;
}

export function isPlaying(game) {
  return game.phase === PHASE.RUN || game.phase === PHASE.COUNTDOWN;
}

export function nextId(game, prefix) {
  return (prefix || "id") + (game.seq++);
}
