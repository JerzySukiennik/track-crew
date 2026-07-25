// Track Crew — 3D lobby and shop: floor-tile buttons, offer crates, wagon carrying, scrapping and rerolls.

import { PHASE, CTX } from "../shared/protocol.js";
import { WAGONS, SHOP_TYPES, OFFER_COUNT } from "../data/wagons.js";
import { biomeForRound } from "../data/biomes.js";
import { makeRng, shuffle } from "../shared/rng.js";
import { pushEvent, setPhase } from "./state.js";
import { tileDist } from "./world.js";
import { buildRound } from "./stitcher.js";
import { addChainRun, chainTileAtX, dropPending } from "./rails.js";
import {
  wagonAtTile, attachWagon, detachWagon, upgradeWagon, emptyWagons,
  resetTrainTo, updatePoses, WAGON_LEN
} from "./train.js";

const TILE_RANGE = 1.4;
const OFFER_RANGE = 1.5;

export function wagonValue(type, level) {
  const def = WAGONS[type];
  if (!def) return 0;
  let v = def.price || 0;
  for (let i = 1; i <= (level || 0); i++) v += (def.levels[i] && def.levels[i].price) || 0;
  return v;
}

export function copyPrice(game, type) {
  const def = WAGONS[type];
  if (!def || !def.price) return 0;
  const owned = game.train.wagons.filter((w) => w.type === type).length;
  return Math.floor(def.price * Math.pow(game.tune.COPY_PRICE_MUL, owned));
}

export function crateKey(kind, type, level) {
  return kind === "upgrade" ? "upgrade_crate:" + type + ":" + level : "wagon_crate:" + type + (level ? ":" + level : "");
}

export function parseCrate(k) {
  if (!k) return null;
  const parts = String(k).split(":");
  if (parts[0] === "wagon_crate") return { kind: "wagon", type: parts[1], level: Number(parts[2] || 0) };
  if (parts[0] === "upgrade_crate") return { kind: "upgrade", type: parts[1], level: Number(parts[2] || 1) };
  return null;
}

export function rollOffers(game) {
  const rng = makeRng((game.seed ^ Math.imul(game.round, 40503) ^ (game.shop.rerolls * 7919)) >>> 0);
  const cands = [];
  for (const type of SHOP_TYPES) {
    const price = copyPrice(game, type);
    if (!price) continue;
    cands.push({ key: "w:" + type, kind: "wagon", type, level: 0, price, weight: 3 });
  }
  const seen = new Set();
  for (const w of game.train.wagons) {
    const def = WAGONS[w.type];
    if (!def || w.level >= def.levels.length - 1) continue;
    const next = w.level + 1;
    const key = "u:" + w.type + ":" + next;
    if (seen.has(key)) continue;
    seen.add(key);
    const price = (def.levels[next] && def.levels[next].price) || 0;
    if (!price) continue;
    cands.push({ key, kind: "upgrade", type: w.type, level: next, price, weight: 4 });
  }
  const bag = [];
  for (const c of cands) for (let i = 0; i < c.weight; i++) bag.push(c);
  const picked = [];
  const used = new Set();
  for (const c of shuffle(rng, bag)) {
    if (picked.length >= OFFER_COUNT) break;
    if (used.has(c.key)) continue;
    used.add(c.key);
    picked.push(c);
  }
  const st = game.shop.station;
  game.shop.offers = picked.map((c, i) => ({
    id: "of" + (game.seq++),
    kind: c.kind, type: c.type, level: c.level, price: c.price, sold: false,
    x: st ? st.offerSpots[i % st.offerSpots.length].x : 0,
    z: st ? st.offerSpots[i % st.offerSpots.length].z : 0
  }));
  return game.shop.offers;
}

export function insertSlots(game) {
  const t = game.train;
  const out = [];
  for (let i = 1; i < t.wagons.length; i++) {
    const a = t.wagons[i];
    out.push({ slot: i + 1, x: a.x - a.dirX * (a.len / 2 + 0.2), z: a.z - a.dirZ * (a.len / 2 + 0.2) });
  }
  return out;
}

export function enterLobby(game) {
  const plate = game.world.plate;
  game.shop.open = false;
  game.shop.offers = [];
  game.floorTile = plate
    ? { x: plate.startTile.x, z: plate.startTile.z, size: plate.startTile.size, kind: "start", on: 0, need: 0 }
    : null;
  setPhase(game, PHASE.LOBBY);
  return game.floorTile;
}

export function stationDepart(game, st) {
  const stop = chainTileAtX(game, st.stopX);
  if (stop) st.railZ = stop.z;
  const last = game.rails.lastTile;
  const east = st.clearX0 + st.clearLen - 1;
  if (!last || last.x >= east) return st.railZ;
  const tiles = [];
  for (let x = last.x + 1; x <= east; x++) tiles.push({ x, z: last.z });
  addChainRun(game, tiles);
  return st.railZ;
}

export function enterShop(game) {
  const w = game.world;
  const st = w.stations[game.route.stationIndex] || w.stations[w.stations.length - 1];
  dropPending(game);
  if (st) stationDepart(game, st);
  emptyWagons(game);
  game.attempt = 1;
  game.round += 1;
  const loco = game.train.wagons[0];
  game.biome = biomeForRound(game.round, loco ? loco.level : 0);
  buildRound(game, { round: game.round, biome: game.biome, seed: game.seed });
  game.shop.station = st;
  game.shop.open = true;
  game.shop.rerolls = 0;
  rollOffers(game);
  game.floorTile = { x: st.startTile.x, z: st.startTile.z, size: st.startTile.size, kind: "start", on: 0, need: 0 };
  game.stats.roundGold = 0;
  pushEvent(game, { type: "shopOpen", round: game.round, station: st.index });
  return st;
}

export function enterWreck(game) {
  const st = game.world.stations[game.route.startStation];
  game.wreckAt = game.attempt;
  game.shop.open = false;
  game.shop.offers = [];
  if (!st) return null;
  game.floorTile = { x: st.startTile.x, z: st.startTile.z, size: st.startTile.size, kind: "retry", on: 0, need: 0 };
  let i = 0;
  game.players.forEach((p) => {
    p.x = st.spawn.x + 0.5 + (i % 3);
    p.z = st.spawn.z + 0.5 + Math.floor(i / 3);
    p.vx = 0;
    p.vz = 0;
    p.leashT = 0;
    i++;
    pushEvent(game, { type: "teleport", pid: p.pid, x: p.x, z: p.z });
  });
  return st;
}

export function startRun(game) {
  const st = game.world.stations[game.route.startStation];
  const retry = game.countdownFrom === PHASE.WRECK;
  if (retry) game.attempt += 1;
  if (st) resetTrainTo(game, st.stopX, st.railZ);
  game.route.startS = game.train.s;
  game.train.delayT = game.tune.TRAIN_START_DELAY;
  game.train.arrived = false;
  game.floorTile = null;
  game.shop.open = false;
  game.shop.offers = [];
  game.wreckAt = -1;
  game.wreckKind = null;
  updatePoses(game);
  pushEvent(game, { type: "roundStart", round: game.round, attempt: game.attempt, retry });
  setPhase(game, PHASE.RUN);
  return game.round;
}

function occupancy(game, ft) {
  const r = (ft.size - 1) / 2;
  let on = 0;
  let total = 0;
  game.players.forEach((p) => {
    if (p.conn === "lost") return;
    total++;
    if (Math.abs(Math.floor(p.x) - ft.x) <= r && Math.abs(Math.floor(p.z) - ft.z) <= r) on++;
  });
  ft.on = on;
  ft.need = total;
  return total > 0 && on === total;
}

export function nearestOffer(game, p) {
  let best = null;
  let bestD = OFFER_RANGE;
  for (const o of game.shop.offers) {
    if (o.sold) continue;
    const d = tileDist(p.x, p.z, o.x, o.z);
    if (d <= bestD) { bestD = d; best = o; }
  }
  return best;
}

export function shopContext(game, p, target) {
  if (game.phase !== PHASE.SHOP) return null;
  const st = game.shop.station;
  if (!st) return null;
  const crate = p.carry ? parseCrate(p.carry.k) : null;
  if (crate && tileDist(p.x, p.z, st.scrapPad.x, st.scrapPad.z) <= TILE_RANGE && crate.kind === "wagon") {
    return { ctx: CTX.SCRAP, near: "SCRAPYARD", ref: null };
  }
  if (crate) {
    const wi = wagonAtTile(game, target.x, target.z);
    if (wi >= 0) return { ctx: CTX.INSERT_WAGON, near: WAGONS[game.train.wagons[wi].type].name.toUpperCase(), ref: wi };
    const t = game.train;
    const tail = t.wagons[t.wagons.length - 1];
    if (tail && Math.hypot(p.x - tail.x, p.z - tail.z) <= WAGON_LEN + 1) {
      return { ctx: CTX.INSERT_WAGON, near: "TRAIN", ref: t.wagons.length - 1 };
    }
    return null;
  }
  if (!p.carry && tileDist(p.x, p.z, st.rerollTile.x, st.rerollTile.z) <= TILE_RANGE) {
    return { ctx: CTX.REROLL, near: "REROLL " + game.tune.REROLL_COST + "G", ref: null };
  }
  if (!p.carry) {
    const o = nearestOffer(game, p);
    if (o) {
      const label = (o.kind === "upgrade" ? WAGONS[o.type].name + " " + ["", "II", "III"][o.level] : WAGONS[o.type].name);
      return { ctx: CTX.BUY, near: (label + " " + o.price + "G").toUpperCase(), ref: o };
    }
  }
  return null;
}

export function applyShop(game, p, ctx, ref) {
  const st = game.shop.station;
  if (!st) return false;
  if (ctx === CTX.BUY) {
    const o = ref;
    if (!o || o.sold) return false;
    if (game.gold < o.price) { pushEvent(game, { type: "error", pid: p.pid, reason: "gold" }); return false; }
    game.gold -= o.price;
    o.sold = true;
    p.carry = { k: crateKey(o.kind, o.type, o.level), n: 1 };
    pushEvent(game, { type: "buy", kind: o.kind, wagon: o.type, price: o.price, pid: p.pid });
    return true;
  }
  if (ctx === CTX.REROLL) {
    if (game.gold < game.tune.REROLL_COST) { pushEvent(game, { type: "error", pid: p.pid, reason: "gold" }); return false; }
    game.gold -= game.tune.REROLL_COST;
    game.shop.rerolls += 1;
    rollOffers(game);
    pushEvent(game, { type: "reroll", pid: p.pid, n: game.shop.rerolls });
    return true;
  }
  if (ctx === CTX.SCRAP) {
    const crate = parseCrate(p.carry && p.carry.k);
    if (!crate || crate.kind !== "wagon") return false;
    const refund = Math.floor(wagonValue(crate.type, crate.level) * game.tune.SCRAP_REFUND);
    game.gold += refund;
    p.carry = null;
    pushEvent(game, { type: "scrap", wagon: crate.type, refund, pid: p.pid });
    return true;
  }
  if (ctx === CTX.INSERT_WAGON) {
    const crate = parseCrate(p.carry && p.carry.k);
    if (!crate) return false;
    const idx = typeof ref === "number" ? ref : game.train.wagons.length - 1;
    if (crate.kind === "upgrade") {
      const w = game.train.wagons[idx];
      if (!w || w.type !== crate.type || w.level !== crate.level - 1) {
        pushEvent(game, { type: "error", pid: p.pid, reason: "wrongWagon" });
        return false;
      }
      if (!upgradeWagon(game, idx, crate.type)) return false;
      p.carry = null;
      return true;
    }
    const slot = Math.max(2, idx + 1);
    if (!attachWagon(game, crate.type, crate.level, slot)) {
      pushEvent(game, { type: "error", pid: p.pid, reason: "full" });
      return false;
    }
    p.carry = null;
    return true;
  }
  return false;
}

export function detachToHands(game, p, wagonIndex) {
  const t = game.train;
  const w = t.wagons[wagonIndex];
  if (!w || wagonIndex < 2) return false;
  const out = detachWagon(game, wagonIndex);
  if (!out) return false;
  p.carry = { k: crateKey("wagon", out.type, out.level), n: 1 };
  pushEvent(game, { type: "pickup", pid: p.pid, k: p.carry.k });
  return true;
}

export function tickLobbyShop(game, dt) {
  const T = game.tune;
  if (game.phase === PHASE.SHOP && !game.shop.open) enterShop(game);
  if (game.phase === PHASE.WRECK && game.wreckAt !== game.attempt) enterWreck(game);
  if (game.phase === PHASE.SHOP) game.shop.slots = insertSlots(game);

  if (game.phase === PHASE.COUNTDOWN) {
    const ft = game.floorTile;
    if (ft && !occupancy(game, ft)) {
      pushEvent(game, { type: "countdownAbort", on: ft.on, need: ft.need });
      pushEvent(game, { type: "error", reason: "countdownAbort" });
      setPhase(game, game.countdownFrom || PHASE.LOBBY);
      return;
    }
    const prev = Math.ceil(game.countdown);
    game.countdown -= dt;
    const now = Math.ceil(game.countdown);
    if (now !== prev && now > 0) pushEvent(game, { type: "countdown", n: now });
    if (game.countdown <= 0) startRun(game);
    return;
  }

  const ft = game.floorTile;
  if (!ft) return;
  if (!occupancy(game, ft)) return;
  game.countdownFrom = game.phase;
  game.countdown = T.COUNTDOWN_S;
  pushEvent(game, { type: "countdown", n: Math.ceil(T.COUNTDOWN_S) });
  setPhase(game, PHASE.COUNTDOWN);
}
