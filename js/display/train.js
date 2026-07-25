// Track Crew — spline following, heat, crafting, wagon inventories, hook tools and the derail/overheat/arrive checks.

import { PHASE } from "../shared/protocol.js";
import { WAGONS } from "../data/wagons.js";
import { TOOLS, TOOL_SET } from "../data/tools.js";
import { pushEvent, setPhase } from "./state.js";
import { pruneBehind, dropItem, tileKey } from "./world.js";
import { splinePoint, sAtTile, sAtX } from "./rails.js";

export const LOCO_LEN = 3.0;
export const WAGON_LEN = 2.4;
export const WAGON_GAP = 0.35;
export const WAGON_HALF_W = 0.45;
const HOOK_SIDE = 1.0;
const HOOK_SPACING = 1.2;
const OVERHEAT_WARN = 0.8;
const OVERHEAT_REARM = 0.72;

export function wagonStats(type, level) {
  const def = WAGONS[type];
  if (!def) return {};
  const lv = def.levels[Math.min(level || 0, def.levels.length - 1)] || {};
  return lv;
}

function makeInv(game, type, level) {
  const lv = wagonStats(type, level);
  if (type === "crafter") return { wood: 0, iron: 0, t: 0 };
  if (type === "holder") return { rails: 0 };
  if (type === "vault") return { stack: [], count: 0 };
  if (type === "dynamite") return { sticks: lv.sticks || 1, t: 0 };
  return {};
}

function makeWagon(game, type, level) {
  return {
    type, level: level | 0, inv: makeInv(game, type, level | 0),
    blink: false, len: type === "loco" ? LOCO_LEN : WAGON_LEN,
    x: 0, z: 0, dirX: 1, dirZ: 0, s: 0, slot: 0
  };
}

export function initTrain(game, wagonList) {
  const t = game.train;
  t.wagons = (wagonList || []).map((w) => makeWagon(game, w.type, w.level || 0));
  t.hookTools = TOOL_SET.map((k) => ({ k: TOOLS[k].key, host: "tank", x: 0, z: 0 }));
  syncWorkshopHooks(game);
  t.heat = 0;
  t.warn = false;
  t.warnD = false;
  t.warnH = false;
  t.arrived = false;
  t.stickT = 0;
  updatePoses(game);
  return t.wagons;
}

export function locoSpeed(game) {
  const T = game.tune;
  const loco = game.train.wagons[0];
  const lvl = loco ? loco.level : 0;
  return T.TRAIN_BASE_SPEED * Math.pow(T.ROUND_SPEED_GROWTH, Math.max(0, game.round - 1)) * Math.pow(0.85, lvl);
}

export function heatRate(game) {
  const T = game.tune;
  const tank = game.train.wagons.find((w) => w.type === "tank");
  const mul = tank ? (wagonStats("tank", tank.level).heatMul || 1) : 1;
  return mul / T.HEAT_FULL_S;
}

export function updatePoses(game) {
  const t = game.train;
  let s = t.s;
  const set = t.tileSet;
  set.clear();
  for (let i = 0; i < t.wagons.length; i++) {
    const w = t.wagons[i];
    const half = w.len / 2;
    const cs = s - half;
    const p = splinePoint(game, cs);
    w.s = cs;
    w.x = p.x;
    w.z = p.z;
    w.dirX = p.dirX;
    w.dirZ = p.dirZ;
    w.slot = i;
    if (w.type !== "ghost") stampTiles(set, w);
    s = cs - half - WAGON_GAP;
  }
  const nose = splinePoint(game, t.s);
  t.x = nose.x;
  t.z = nose.z;
  t.dirX = nose.dirX;
  t.dirZ = nose.dirZ;
  const tank = t.wagons.find((w) => w.type === "tank") || t.wagons[0];
  const shop = t.wagons.find((w) => w.type === "workshop") || null;
  const counts = { tank: 0, workshop: 0 };
  for (const h of t.hookTools) {
    const key = h.host === "workshop" && shop ? "workshop" : "tank";
    const host = key === "workshop" ? shop : tank;
    if (!host) continue;
    const n = counts[key]++;
    const px = -host.dirZ;
    const pz = host.dirX;
    h.x = host.x + px * HOOK_SIDE + host.dirX * (n - 1) * HOOK_SPACING;
    h.z = host.z + pz * HOOK_SIDE + host.dirZ * (n - 1) * HOOK_SPACING;
  }
}

function stampTiles(set, w) {
  const half = w.len / 2;
  for (let a = -half; a <= half + 0.001; a += 0.4) {
    for (let b = -WAGON_HALF_W; b <= WAGON_HALF_W + 0.001; b += WAGON_HALF_W) {
      const x = Math.floor(w.x + w.dirX * a - w.dirZ * b);
      const z = Math.floor(w.z + w.dirZ * a + w.dirX * b);
      set.add(tileKey(x, z));
    }
  }
}

export function wagonAtTile(game, x, z) {
  const t = game.train;
  let best = -1;
  let bestD = 1.6;
  for (let i = 0; i < t.wagons.length; i++) {
    const w = t.wagons[i];
    const dx = x + 0.5 - w.x;
    const dz = z + 0.5 - w.z;
    const along = Math.abs(dx * w.dirX + dz * w.dirZ);
    const side = Math.abs(-dx * w.dirZ + dz * w.dirX);
    if (along > w.len / 2 + 0.35 || side > WAGON_HALF_W + 0.6) continue;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function holderRoom(game, w) {
  const cap = wagonStats("holder", w.level).capRails || 0;
  return Math.max(0, cap - w.inv.rails);
}

export function adjacentHolders(game, index) {
  const t = game.train;
  const out = [];
  for (const i of [index - 1, index + 1]) {
    const w = t.wagons[i];
    if (w && w.type === "holder") out.push(w);
  }
  return out;
}

function tickCrafters(game, dt) {
  const T = game.tune;
  const t = game.train;
  for (let i = 0; i < t.wagons.length; i++) {
    const w = t.wagons[i];
    if (w.type !== "crafter") continue;
    const holders = adjacentHolders(game, i);
    w.blink = holders.length === 0;
    if (w.blink) continue;
    w.inv.t = Math.min(w.inv.t + dt, T.CRAFT_CYCLE_S);
    if (w.inv.t < T.CRAFT_CYCLE_S) continue;
    const per = wagonStats("crafter", w.level).perCycle || 1;
    let room = 0;
    for (const h of holders) room += holderRoom(game, h);
    const n = Math.min(per, w.inv.wood, w.inv.iron, room);
    if (n <= 0) continue;
    w.inv.t = 0;
    w.inv.wood -= n;
    w.inv.iron -= n;
    let left = n;
    for (const h of holders) {
      if (left <= 0) break;
      const take = Math.min(left, holderRoom(game, h));
      h.inv.rails += take;
      left -= take;
    }
    pushEvent(game, { type: "craft", n, slot: i, x: w.x, z: w.z });
  }
}

function tickDynamite(game, dt) {
  const T = game.tune;
  for (const w of game.train.wagons) {
    if (w.type !== "dynamite") continue;
    const cap = wagonStats("dynamite", w.level).sticks || 1;
    if (w.inv.sticks >= cap) { w.inv.t = 0; continue; }
    w.inv.t += dt;
    if (w.inv.t >= T.STICK_COOLDOWN_S) {
      w.inv.t = 0;
      w.inv.sticks += 1;
    }
  }
}

function tickToolReturn(game, dt) {
  const T = game.tune;
  const limit = game.train.x - T.TOOL_RETURN_M;
  const back = [];
  game.items.forEach((it) => {
    if (it.k !== "tool_axe" && it.k !== "tool_pick" && it.k !== "tool_bucket") return;
    if (it.x >= limit) { it.t = 0; return; }
    it.t = (it.t || 0) + dt;
    if (it.t >= T.TOOL_RETURN_S) back.push(it);
  });
  for (const it of back) {
    game.items.delete(it.iid);
    game.world.itemAt.delete(tileKey(it.x, it.z));
    const hook = { k: it.k, host: freeHookHost(game), x: 0, z: 0 };
    game.train.hookTools.push(hook);
    updatePoses(game);
    pushEvent(game, { type: "toolReturn", k: it.k, x: hook.x, z: hook.z });
  }
}

export function coolTank(game, amount) {
  const t = game.train;
  t.heat = Math.max(0, t.heat - amount);
  if (t.heat < OVERHEAT_REARM) t.warnH = false;
  return true;
}

export function depositTo(game, pid, wagonIndex) {
  const p = game.players.get(pid);
  const w = game.train.wagons[wagonIndex];
  if (!p || !p.carry || !w) return false;
  const c = p.carry;
  if (w.type === "crafter") {
    if (c.k !== "wood" && c.k !== "iron") return false;
    const st = wagonStats("crafter", w.level);
    const cap = c.k === "wood" ? (st.capWood || 0) : (st.capIron || 0);
    const room = Math.max(0, cap - w.inv[c.k]);
    if (room <= 0) { pushEvent(game, { type: "error", pid, reason: "full" }); return false; }
    const n = Math.min(room, c.n);
    w.inv[c.k] += n;
    c.n -= n;
    if (c.n <= 0) p.carry = null;
    pushEvent(game, { type: "load", pid, k: c.k, n, slot: wagonIndex });
    return true;
  }
  if (w.type === "vault") {
    const cap = wagonStats("vault", w.level).cap || 0;
    const room = Math.max(0, cap - w.inv.count);
    if (room <= 0) { pushEvent(game, { type: "error", pid, reason: "full" }); return false; }
    const n = Math.min(room, c.n);
    w.inv.stack.push({ k: c.k, n });
    w.inv.count += n;
    c.n -= n;
    if (c.n <= 0) p.carry = null;
    pushEvent(game, { type: "load", pid, k: c.k, n, slot: wagonIndex });
    return true;
  }
  return false;
}

export function takeRails(game, pid, wagonIndex) {
  const p = game.players.get(pid);
  const w = game.train.wagons[wagonIndex];
  if (!p || !w || w.type !== "holder" || w.inv.rails <= 0) return false;
  if (p.carry && p.carry.k !== "rail") return false;
  const n = w.inv.rails;
  w.inv.rails = 0;
  if (p.carry) p.carry.n += n;
  else p.carry = { k: "rail", n };
  pushEvent(game, { type: "takeRails", pid, n, slot: wagonIndex });
  return true;
}

export function crafterStash(game, wagonIndex) {
  const w = game.train.wagons[wagonIndex];
  if (!w || w.type !== "crafter") return null;
  const wood = w.inv.wood || 0;
  const iron = w.inv.iron || 0;
  if (wood <= 0 && iron <= 0) return null;
  const k = wood >= iron ? "wood" : "iron";
  return { k, n: w.inv[k] };
}

export function takeStash(game, pid, wagonIndex) {
  const p = game.players.get(pid);
  const w = game.train.wagons[wagonIndex];
  if (!p || !w) return false;
  if (w.type === "crafter") {
    const out = crafterStash(game, wagonIndex);
    if (!out) return false;
    if (p.carry && p.carry.k !== out.k) return false;
    w.inv[out.k] = 0;
    if (p.carry) p.carry.n += out.n;
    else p.carry = { k: out.k, n: out.n };
    pushEvent(game, { type: "takeStash", pid, k: out.k, n: out.n, slot: wagonIndex });
    return true;
  }
  if (w.type !== "vault" || !w.inv.stack.length) return false;
  const top = w.inv.stack[w.inv.stack.length - 1];
  if (p.carry && p.carry.k !== top.k) return false;
  w.inv.stack.pop();
  w.inv.count -= top.n;
  if (p.carry) p.carry.n += top.n;
  else p.carry = { k: top.k, n: top.n };
  pushEvent(game, { type: "takeStash", pid, k: top.k, n: top.n, slot: wagonIndex });
  return true;
}

export function freeHookHost(game) {
  const t = game.train;
  if (!t.wagons.some((w) => w.type === "workshop")) return "tank";
  let tank = 0;
  let shop = 0;
  for (const h of t.hookTools) {
    if (h.host === "workshop") shop++;
    else tank++;
  }
  return shop < tank ? "workshop" : "tank";
}

export function syncWorkshopHooks(game) {
  const t = game.train;
  const shops = t.wagons.filter((w) => w.type === "workshop").length;
  const want = shops * TOOL_SET.length;
  let have = t.hookTools.filter((h) => h.host === "workshop").length;
  while (have < want) {
    t.hookTools.push({ k: TOOLS[TOOL_SET[have % TOOL_SET.length]].key, host: "workshop", x: 0, z: 0 });
    have++;
  }
  while (have > want) {
    const idx = t.hookTools.map((h) => h.host).lastIndexOf("workshop");
    if (idx < 0) break;
    t.hookTools.splice(idx, 1);
    have--;
  }
  updatePoses(game);
  return want;
}

export function attachWagon(game, type, level, slot) {
  const t = game.train;
  const T = game.tune;
  if (t.wagons.length >= T.MAX_WAGONS) return false;
  const at = Math.max(2, Math.min(slot == null ? t.wagons.length : slot, t.wagons.length));
  t.wagons.splice(at, 0, makeWagon(game, type, level || 0));
  updatePoses(game);
  if (type === "workshop") syncWorkshopHooks(game);
  pushEvent(game, { type: "insertWagon", wagon: type, slot: at });
  return true;
}

export function detachWagon(game, slot) {
  const t = game.train;
  if (slot < 2 || slot >= t.wagons.length) return null;
  const w = t.wagons.splice(slot, 1)[0];
  updatePoses(game);
  if (w.type === "workshop") syncWorkshopHooks(game);
  return { type: w.type, level: w.level };
}

export function upgradeWagon(game, slot, type) {
  const w = game.train.wagons[slot];
  if (!w || w.type !== type) return false;
  const def = WAGONS[type];
  if (!def || w.level >= def.levels.length - 1) return false;
  w.level += 1;
  if (w.type === "dynamite") w.inv.sticks = Math.max(w.inv.sticks, wagonStats(type, w.level).sticks || 1);
  pushEvent(game, { type: "buy", upgrade: type, level: w.level, slot });
  return true;
}

export function emptyWagons(game) {
  for (const w of game.train.wagons) {
    if (w.type === "crafter") { w.inv.wood = 0; w.inv.iron = 0; w.inv.t = 0; }
    else if (w.type === "holder") w.inv.rails = 0;
  }
}

export function resetTrainTo(game, x, z) {
  const t = game.train;
  let s = z == null ? null : sAtTile(game, x, z);
  if (s == null) {
    s = sAtX(game, x);
    if (s == null) {
      console.warn("[track-crew] no laid rail at or before x=" + x + "; train parked at the start of the chain");
      s = 0;
    }
  }
  t.s = s;
  t.heat = 0;
  t.warn = false;
  t.warnD = false;
  t.warnH = false;
  t.arrived = false;
  t.speed = 0;
  updatePoses(game);
}

export function tickTrain(game, dt) {
  const T = game.tune;
  const t = game.train;
  const running = game.phase === PHASE.RUN && !t.arrived;
  t.speed = running && t.delayT <= 0 ? locoSpeed(game) : 0;
  if (running) {
    if (t.delayT > 0) t.delayT = Math.max(0, t.delayT - dt);
    else {
      const step = t.speed * dt;
      t.s += step;
      game.stats.distanceTotal += step;
    }
    t.heat = Math.min(1, t.heat + heatRate(game) * dt);
  }
  tickCrafters(game, dt);
  tickDynamite(game, dt);
  updatePoses(game);
  t.remaining = Math.max(0, game.rails.totalLen - t.s);
  const station = game.world.stations[game.route.stationIndex];
  game.stats.distToStation = station ? Math.max(0, station.stopX + 0.5 - t.x) : 0;
  if (!running) return;

  tickToolReturn(game, dt);
  pruneBehind(game, t.x - T.PRUNE_BEHIND_M);

  if (t.heat >= OVERHEAT_WARN && !t.warnH) {
    t.warnH = true;
    pushEvent(game, { type: "overheatWarn" });
  } else if (t.heat < OVERHEAT_REARM && t.warnH) {
    t.warnH = false;
  }

  const warnDist = t.speed * T.DERAIL_WARN_S;
  const outOfTrack = t.delayT <= 0 && t.remaining <= warnDist + 0.001;
  if (outOfTrack && !t.warnD) {
    t.warnD = true;
    pushEvent(game, { type: "derailWarn", remaining: t.remaining });
  } else if (!outOfTrack && t.warnD) {
    t.warnD = false;
  }
  t.warn = t.warnD || t.warnH;

  if (station && t.x >= station.stopX + 0.5) {
    t.arrived = true;
    t.speed = 0;
    t.warn = false;
    game.stats.roundsSurvived += 1;
    pushEvent(game, { type: "arrive", round: game.round, station: station.index });
    setPhase(game, PHASE.SHOP);
    return;
  }
  if (t.heat >= 1) {
    t.heat = 1;
    game.stats.wrecks += 1;
    game.wreckKind = "overheat";
    pushEvent(game, { type: "overheat", x: t.x, z: t.z });
    pushEvent(game, { type: "explosion", x: t.x, z: t.z, radius: 2 });
    setPhase(game, PHASE.WRECK);
    return;
  }
  if (t.remaining <= 0.001) {
    game.stats.wrecks += 1;
    game.wreckKind = "derail";
    pushEvent(game, { type: "derail", x: t.x, z: t.z });
    setPhase(game, PHASE.WRECK);
  }
}

export function dropWagonAsCrate(game, type, level, x, z) {
  return dropItem(game, "wagon_crate:" + type + (level ? ":" + level : ""), 1, x, z);
}
