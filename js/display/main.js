// Track Crew — display entry: boot gate, module wiring, fixed-step simulation loop and the debug bot harness.

import { TUNE } from "../config.js";
import { PHASE, MSG, BUZZ, CTX } from "../shared/protocol.js";
import { START_CONSIST } from "../data/wagons.js";
import { biomeForRound } from "../data/biomes.js";
import { createGame, drainEvents } from "./state.js";
import { startWorld, buildRound } from "./stitcher.js";
import { initTrain, tickTrain, resetTrainTo, wagonStats } from "./train.js";
import {
  addPlayer, removePlayer, markLost, markBack, applyInput, onButton, contextFor, tickPlayers
} from "./players.js";
import { pushPlayers, blockedTile } from "./collision.js";
import { enterLobby, tickLobbyShop } from "./lobby.js";
import { greenTiles } from "./rails.js";
import { groundAt, TILE, tileKey, tileDist } from "./world.js";

const STEP = 1 / TUNE.SIM_HZ;
const RENDER_LAYERS = ["./render/terrain.js", "./render/props.js", "./render/trainmesh.js", "./render/charmesh.js", "./render/fx.js"];

export function newGame(opts) {
  const o = opts || {};
  const game = createGame({ seed: o.seed, tune: o.tune });
  const biome = biomeForRound(1, 0);
  startWorld(game, biome);
  initTrain(game, START_CONSIST);
  const st = game.world.stations[0];
  buildRound(game, { round: 1, biome, seed: game.seed });
  resetTrainTo(game, st.stopX, st.railZ);
  game.route.startStation = 0;
  game.route.startS = game.train.s;
  enterLobby(game);
  return game;
}

export function stepGame(game, dt) {
  game.time += dt;
  game.phaseT += dt;
  tickPlayers(game, dt);
  pushPlayers(game);
  tickTrain(game, dt);
  if (game.phase !== PHASE.RUN) tickLobbyShop(game, dt);
}

async function optional(path) {
  try {
    return await import(path);
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[track-crew] module not available yet:", path);
    return null;
  }
}

function bootGate(root) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.id = "tc-boot-gate";
    el.setAttribute("style", [
      "position:fixed", "inset:0", "display:flex", "align-items:center", "justify-content:center",
      "background:#111111", "color:#FFF6E9", "z-index:9999", "cursor:pointer",
      "font-family:Bungee,Space Grotesk,system-ui,sans-serif", "letter-spacing:0.06em", "text-align:center"
    ].join(";"));
    el.innerHTML = '<div style="font-size:clamp(28px,5vw,64px)">CLICK TO START</div>';
    (root || document.body).appendChild(el);
    const go = () => {
      el.removeEventListener("click", go);
      el.remove();
      resolve();
    };
    el.addEventListener("click", go);
  });
}

async function goFullscreen() {
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (e) {
    /* user can stay windowed */
  }
}

export async function start(params) {
  const p = params || {};
  const tvRoot = document.getElementById("tv-root");
  const canvas = document.getElementById("gl");

  await bootGate(tvRoot || document.body);
  goFullscreen();

  const game = newGame({ seed: p.seed == null ? undefined : p.seed });
  const audio = await optional("./audio.js");
  if (audio && audio.initAudio) audio.initAudio();

  const sceneMod = await optional("./render/scene.js");
  const camMod = await optional("./camera.js");
  const hudMod = await optional("./hud.js");
  let view = null;
  let cam = null;
  const layers = [];
  if (sceneMod && sceneMod.initScene && canvas) {
    try {
      view = sceneMod.initScene(canvas);
      for (const path of RENDER_LAYERS) {
        const m = await optional(path);
        if (m && typeof m.init === "function" && typeof m.sync === "function") {
          m.init(view.scene);
          layers.push(m);
        }
      }
    } catch (e) {
      console.error("[track-crew] scene init failed", e);
      view = null;
    }
  }
  if (camMod && camMod.createCamera) {
    const aspect = (canvas && canvas.clientWidth ? canvas.clientWidth / Math.max(1, canvas.clientHeight) : 16 / 9);
    cam = camMod.createCamera(aspect);
  }
  if (hudMod && hudMod.initHud && tvRoot) hudMod.initHud(tvRoot);

  const byCid = new Map();
  let host = null;
  try {
    const fbMod = await import("../net/firebase.js");
    if (!fbMod.isConfigured || fbMod.isConfigured()) {
      const netMod = await import("../net/nethost.js");
      host = await netMod.createHost({
        roomCode: p.room || "",
        handlers: {
          onPeerJoin() {},
          onPeerLeave(cid) {
            const pid = byCid.get(cid);
            if (pid) markLost(game, pid);
          },
          onEvent(cid, msg) {
            if (!msg) return;
            if (msg.type === MSG.JOIN) {
              const pid = addPlayer(game, {
                cid, name: msg.name, hat: msg.hat, colorIdx: msg.colorIdx, skinIdx: msg.skinIdx
              });
              if (!pid) {
                host.sendEvent(cid, { type: MSG.REJECT, reason: "full" });
                return;
              }
              byCid.set(cid, pid);
              const pl = game.players.get(pid);
              markBack(game, pid, host.peerMode(cid));
              host.sendEvent(cid, {
                type: MSG.WELCOME, pid, colorIdx: pl.colorIdx, phase: game.phase, round: game.round
              });
              return;
            }
            const pid = byCid.get(cid);
            if (!pid) return;
            if (msg.type === MSG.BTN) onButton(game, pid);
            else if (msg.type === MSG.LEAVE) { removePlayer(game, pid); byCid.delete(cid); }
          },
          onInput(cid, v) {
            const pid = byCid.get(cid);
            if (pid) applyInput(game, pid, v);
          }
        }
      });
      game.roomCode = host.roomCode;
      game.joinUrl = location.origin + location.pathname + "?role=controller&room=" + host.roomCode;
    } else {
      console.warn("[track-crew] firebase not configured — running offline (no phones can join)");
    }
  } catch (e) {
    console.error("[track-crew] networking unavailable", e);
  }

  const debug = p.debug ? attachBots(game, 5) : null;

  let last = (typeof performance !== "undefined" ? performance.now() : Date.now());
  let acc = 0;
  let hudT = 0;
  let padT = 0;

  function netOut(events) {
    if (!host) return;
    for (const ev of events) {
      if (ev.type === "phase") host.broadcastEvent({ type: MSG.PHASE, phase: ev.phase, round: ev.round });
      else if (ev.type === "derailWarn") host.broadcastEvent({ type: MSG.BUZZ, kind: BUZZ.DERAIL_WARN });
      else if (ev.type === "overheatWarn") host.broadcastEvent({ type: MSG.BUZZ, kind: BUZZ.OVERHEAT_WARN });
      else if (ev.type === "derail" || ev.type === "overheat" || ev.type === "arrive") {
        host.broadcastEvent({ type: MSG.BUZZ, kind: BUZZ.ROUND_END });
      }
    }
  }

  function padcast() {
    if (!host) return;
    game.players.forEach((pl) => {
      if (!pl.cid || pl.conn === "lost") return;
      const c = contextFor(game, pl.pid);
      host.sendPad(pl.cid, {
        hold: pl.carry ? { k: pl.carry.k, n: pl.carry.n } : null,
        ctx: c.ctx,
        near: c.near
      });
    });
  }

  function frame(now) {
    const t = now == null ? Date.now() : now;
    const dt = Math.min(0.25, (t - last) / 1000);
    last = t;
    advance(dt);
    requestAnimationFrame(frame);
  }

  function advance(dt) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < TUNE.SIM_MAX_CATCHUP) {
      if (debug) debug.tick(game, STEP);
      stepGame(game, STEP);
      acc -= STEP;
      steps++;
    }
    if (acc > STEP * TUNE.SIM_MAX_CATCHUP) acc = 0;

    const events = drainEvents(game);
    for (const m of layers) {
      try { m.sync(game, dt, events); } catch (e) { console.error("[track-crew] render layer failed", e); }
    }
    if (cam && camMod && camMod.updateCamera) camMod.updateCamera(cam, game, dt);
    if (view && cam) view.render(cam);
    if (audio && audio.consume) audio.consume(game, events);
    hudT += dt;
    if (hudMod && hudMod.syncHud && hudT >= 1 / TUNE.HUD_HZ) {
      hudT = 0;
      try { hudMod.syncHud(game, events); } catch (e) { console.error("[track-crew] hud failed", e); }
    }
    netOut(events);
    padT += dt;
    if (padT >= 1 / TUNE.PAD_HZ) { padT = 0; padcast(); }
  }
  requestAnimationFrame(frame);
  if (p.debug) {
    window.TCSTEP = (frames, dt) => {
      const step = dt || 1 / 60;
      for (let i = 0; i < (frames || 1); i++) advance(step);
      return { t: game.time, phase: game.phase, round: game.round, trainX: game.train.x, rails: game.rails.chain.length, gold: game.gold };
    };
  }

  window.addEventListener("resize", () => {
    if (view && view.resize) view.resize();
    if (cam && canvas) {
      cam.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      cam.updateProjectionMatrix();
    }
  });
  window.TCGAME = game;
  return game;
}

const BOT_ROLES = ["carry", "axe", "pick", "carry", "bucket"];

function rowMap(game) {
  const m = new Map();
  for (const t of game.route.routeTiles) if (!m.has(t.x)) m.set(t.x, t.z);
  return m;
}

function bfsStep(game, p, isGoal, limit) {
  const start = { x: Math.floor(p.x), z: Math.floor(p.z) };
  const seen = new Set([tileKey(start.x, start.z)]);
  const queue = [{ x: start.x, z: start.z, first: null }];
  const cap = limit || 2600;
  let head = 0;
  while (head < queue.length && head < cap) {
    const cur = queue[head++];
    if (cur.first && isGoal(cur.x, cur.z)) return cur.first;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cur.x + d[0];
      const z = cur.z + d[1];
      const key = tileKey(x, z);
      if (seen.has(key)) continue;
      seen.add(key);
      const solid = blockedTile(game, x, z);
      if (isGoal(x, z) && (!solid || cur.first)) return solid ? cur.first : (cur.first || { x, z });
      if (solid) continue;
      queue.push({ x, z, first: cur.first || { x, z } });
    }
  }
  return null;
}

function walkTo(game, p, isGoal) {
  const b = p.bot;
  const tx = Math.floor(p.x);
  const tz = Math.floor(p.z);
  if (!b.step || b.stepT <= 0 || b.stepX !== tx || b.stepZ !== tz) {
    b.step = bfsStep(game, p, isGoal, 4200);
    b.stepT = 0.25;
    b.stepX = tx;
    b.stepZ = tz;
  }
  const step = b.step;
  if (!step) { p.stick.x = 0; p.stick.y = 0; return false; }
  const dx = step.x + 0.5 - p.x;
  const dz = step.z + 0.5 - p.z;
  const d = Math.max(1e-4, Math.hypot(dx, dz));
  p.stick.x = dx / d;
  p.stick.y = dz / d;
  return true;
}

function facePoint(p, x, z) {
  const dx = x - p.x;
  const dz = z - p.z;
  if (Math.abs(dx) >= Math.abs(dz)) { p.faceX = dx >= 0 ? 1 : -1; p.faceZ = 0; }
  else { p.faceX = 0; p.faceZ = dz >= 0 ? 1 : -1; }
}

function stand(p) {
  p.stick.x = 0;
  p.stick.y = 0;
}

function pressIf(game, p, want) {
  const c = contextFor(game, p.pid);
  if (c.ctx !== want) return false;
  onButton(game, p.pid);
  return true;
}

function findTool(game, p, key) {
  for (const h of game.train.hookTools) if (h.k === key) return { kind: "hook", x: h.x, z: h.z };
  let best = null;
  let bestD = Infinity;
  game.items.forEach((it) => {
    if (it.k !== key) return;
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < bestD) { bestD = d; best = { kind: "item", x: it.x + 0.5, z: it.z + 0.5 }; }
  });
  return best;
}

function ensureTool(game, p, key) {
  if (p.carry && p.carry.k === key) return true;
  const src = findTool(game, p, key);
  if (!src) { stand(p); return false; }
  if (Math.hypot(src.x - p.x, src.z - p.z) <= 1.15) {
    stand(p);
    facePoint(p, src.x, src.z);
    const c = contextFor(game, p.pid);
    if (c.ctx === CTX.PICKUP || c.ctx === CTX.SWAP) onButton(game, p.pid);
    return false;
  }
  walkTo(game, p, (x, z) => Math.hypot(x + 0.5 - src.x, z + 0.5 - src.z) < 0.95);
  return false;
}

function harvestRole(game, p, kind, toolKey) {
  if (!ensureTool(game, p, toolKey)) return;
  const head = game.rails.lastTile || { x: game.train.x, z: game.train.z };
  const rows = p.bot.rows;
  const held = p.bot.goal;
  let best = null;
  if (held && game.world.props.get(held.key) === held && held.x >= head.x - 6 && held.x <= head.x + 16) best = held;
  if (!best) best = pickProp(game, p, kind, head, rows, 5, 12);
  if (!best) best = pickProp(game, p, kind, head, rows, 11, 26);
  if (!best) { stand(p); return; }
  p.bot.goal = best;
  if (tileDist(p.x, p.z, best.x, best.z) <= game.tune.ACT_RANGE - 0.15) {
    stand(p);
    facePoint(p, best.x + 0.5, best.z + 0.5);
    return;
  }
  if (!walkTo(game, p, (x, z) => Math.abs(x - best.x) + Math.abs(z - best.z) === 1)) {
    p.bot.skip.set(best.key, game.time + 12);
    p.bot.goal = null;
  }
}

function pickProp(game, p, kind, head, rows, maxLane, ahead) {
  let best = null;
  let bestScore = Infinity;
  game.world.props.forEach((prop) => {
    if (prop.kind !== kind) return;
    if (prop.x < head.x - 6 || prop.x > head.x + ahead) return;
    const until = p.bot.skip.get(prop.key);
    if (until && until > game.time) return;
    const row = rows.get(prop.x);
    const lane = row == null ? 0 : Math.abs(prop.z - row);
    if (lane > maxLane) return;
    const dHead = Math.abs(prop.x - head.x) + Math.abs(prop.z - head.z) * 0.7;
    const dMe = Math.hypot(prop.x - p.x, prop.z - p.z);
    const score = dHead + dMe * 0.5 + (prop.gold ? -6 : 0);
    if (score < bestScore) { bestScore = score; best = prop; }
  });
  return best;
}

function bucketRole(game, p) {
  const T = game.tune;
  if (!ensureTool(game, p, "tool_bucket")) return;
  const tank = game.train.wagons.find((w) => w.type === "tank");
  if (!p.bucketFull) {
    const water = nearestWaterTile(game, p);
    if (!water) { stand(p); return; }
    if (tileDist(p.x, p.z, water.x, water.z) <= T.ACT_RANGE - 0.15) {
      stand(p);
      facePoint(p, water.x + 0.5, water.z + 0.5);
      return;
    }
    if (!walkTo(game, p, (x, z) => Math.abs(x - water.x) + Math.abs(z - water.z) === 1)) stand(p);
    return;
  }
  if (!tank) { stand(p); return; }
  if (game.train.heat <= T.COOL_MIN_HEAT + 0.05) {
    if (Math.hypot(p.x - tank.x, p.z - tank.z) <= 6) { stand(p); return; }
    walkTo(game, p, (x, z) => Math.hypot(x + 0.5 - tank.x, z + 0.5 - tank.z) < 4);
    return;
  }
  if (Math.hypot(p.x - tank.x, p.z - tank.z) <= T.ACT_RANGE + 1.1) { stand(p); return; }
  walkTo(game, p, (x, z) => Math.hypot(x + 0.5 - tank.x, z + 0.5 - tank.z) < T.ACT_RANGE + 0.8);
}

function nearestWaterTile(game, p) {
  const w = game.world;
  const cx = Math.floor(game.train.x);
  const cz = Math.floor(game.train.z);
  let best = null;
  let bestD = Infinity;
  for (let dz = -22; dz <= 22; dz++) {
    for (let dx = -20; dx <= 70; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (groundAt(w, x, z) !== TILE.WATER) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bestD) { bestD = d; best = { x, z }; }
    }
  }
  return best;
}

function bestGreen(game, p, forwardOnly) {
  const list = greenTiles(game);
  if (!list.length) return null;
  const rows = p.bot.rows;
  const last = game.rails.lastTile;
  let best = null;
  let bestScore = -Infinity;
  for (const t of list) {
    if (forwardOnly && t.x <= last.x) continue;
    const row = rows.get(t.x);
    const lane = row == null ? 0 : Math.abs(t.z - row);
    if (lane > 8 && t.x <= last.x) continue;
    const score = (t.x - last.x) * 6 - lane * 1.4 + (t.join ? 20 : 0);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function waterAtHead(game) {
  const last = game.rails.lastTile;
  if (!last) return null;
  const prev = game.rails.chain.length > 1 ? game.rails.chain[game.rails.chain.length - 2] : null;
  let best = null;
  let bestScore = -Infinity;
  for (const d of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
    const x = last.x + d[0];
    const z = last.z + d[1];
    if (prev && prev.x === x && prev.z === z) continue;
    if (groundAt(game.world, x, z) !== TILE.WATER) continue;
    const score = d[0] * 4 - Math.abs(d[1]);
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  return best;
}

function crafterFor(game, res) {
  const t = game.train;
  let best = null;
  for (let i = 0; i < t.wagons.length; i++) {
    const w = t.wagons[i];
    if (w.type !== "crafter" || w.blink) continue;
    const st = wagonStats("crafter", w.level);
    const cap = res === "wood" ? st.capWood : st.capIron;
    if (w.inv[res] >= cap) continue;
    if (!best || w.inv[res] < best.w.inv[res]) best = { i, w };
  }
  return best;
}

function fullHolder(game, min) {
  const t = game.train;
  for (let i = 0; i < t.wagons.length; i++) {
    const w = t.wagons[i];
    if (w.type === "holder" && w.inv.rails >= min) return { i, w };
  }
  return null;
}

function approachWagon(game, p, idx) {
  const w = game.train.wagons[idx];
  if (!w) return false;
  const px = -w.dirZ;
  const pz = w.dirX;
  const spots = [
    { x: Math.floor(w.x + px * 1.2), z: Math.floor(w.z + pz * 1.2) },
    { x: Math.floor(w.x - px * 1.2), z: Math.floor(w.z - pz * 1.2) }
  ];
  const tx = Math.floor(p.x);
  const tz = Math.floor(p.z);
  if (spots.some((s) => s.x === tx && s.z === tz)) {
    stand(p);
    facePoint(p, w.x, w.z);
    return true;
  }
  walkTo(game, p, (x, z) => spots.some((s) => s.x === x && s.z === z));
  return false;
}

function actOnTile(game, p, tile, ctx) {
  const tx = Math.floor(p.x);
  const tz = Math.floor(p.z);
  const spots = [];
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = tile.x + d[0];
    const z = tile.z + d[1];
    if (!blockedTile(game, x, z)) spots.push({ x, z });
  }
  if (!spots.length) { stand(p); return false; }
  if (spots.some((s) => s.x === tx && s.z === tz)) {
    stand(p);
    facePoint(p, tile.x + 0.5, tile.z + 0.5);
    return pressIf(game, p, ctx);
  }
  walkTo(game, p, (x, z) => spots.some((s) => s.x === x && s.z === z));
  return false;
}

function carryRole(game, p) {
  const rails = p.carry && p.carry.k === "rail" ? p.carry.n : 0;
  const head = game.rails.lastTile;

  if (rails > 0 && head) {
    const blocked = waterAtHead(game);
    const green = bestGreen(game, p, !!blocked);
    if (green) {
      actOnTile(game, p, green, CTX.PLACE_RAIL);
      return;
    }
    if (blocked) {
      parkRails(game, p);
      return;
    }
    stand(p);
    return;
  }

  if (p.carry && (p.carry.k === "wood" || p.carry.k === "iron")) {
    const water = p.carry.k === "wood" ? waterAtHead(game) : null;
    if (water && head) {
      actOnTile(game, p, water, CTX.BUILD_BANK);
      return;
    }
    if (p.carry.n < 6) {
      const more = bestPile(game, p, p.carry.k, 7);
      if (more) {
        if (Math.floor(p.x) === more.x && Math.floor(p.z) === more.z) {
          stand(p);
          facePoint(p, more.x + 0.5, more.z + 0.5);
          pressIf(game, p, CTX.PICKUP);
          return;
        }
        walkTo(game, p, (x, z) => x === more.x && z === more.z);
        return;
      }
    }
    const cr = crafterFor(game, p.carry.k);
    if (cr) {
      p.bot.waitT = 0;
      if (approachWagon(game, p, cr.i)) pressIf(game, p, CTX.LOAD);
      return;
    }
    stand(p);
    pressIf(game, p, CTX.DROP);
    return;
  }

  if (p.carry) {
    stand(p);
    pressIf(game, p, CTX.DROP);
    return;
  }

  const holder = fullHolder(game, 1);
  const needBank = !!waterAtHead(game);
  if (!needBank) {
    let railPile = null;
    let bestD = 14;
    game.items.forEach((it) => {
      if (it.k !== "rail") return;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bestD) { bestD = d; railPile = it; }
    });
    if (railPile) {
      if (Math.floor(p.x) === railPile.x && Math.floor(p.z) === railPile.z) {
        stand(p);
        facePoint(p, railPile.x + 0.5, railPile.z + 0.5);
        pressIf(game, p, CTX.PICKUP);
        return;
      }
      walkTo(game, p, (x, z) => x === railPile.x && z === railPile.z);
      return;
    }
  }
  const wantRails = holder && !needBank && (holder.w.inv.rails >= 3 || !hasPiles(game, p));
  if (wantRails) {
    if (approachWagon(game, p, holder.i)) pressIf(game, p, CTX.TAKE_RAILS);
    return;
  }

  const pile = bestPile(game, p, needBank ? "wood" : null);
  if (pile) {
    if (Math.floor(p.x) === pile.x && Math.floor(p.z) === pile.z) {
      stand(p);
      facePoint(p, pile.x + 0.5, pile.z + 0.5);
      pressIf(game, p, CTX.PICKUP);
      return;
    }
    walkTo(game, p, (x, z) => x === pile.x && z === pile.z);
    return;
  }
  if (needBank) {
    const stuck = game.train.wagons.findIndex((w) => w.type === "crafter" && w.inv.wood > 0);
    if (stuck >= 0) {
      if (approachWagon(game, p, stuck)) pressIf(game, p, CTX.TAKE_STASH);
      return;
    }
    stand(p);
    return;
  }
  if (holder) {
    if (approachWagon(game, p, holder.i)) pressIf(game, p, CTX.TAKE_RAILS);
    return;
  }
  stand(p);
}

function clearOfItems(game, x, z) {
  if (blockedTile(game, x, z)) return false;
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) if (game.world.itemAt.get(tileKey(x + a, z + b))) return false;
  }
  return true;
}

function parkRails(game, p) {
  const bx = Math.floor(p.x);
  const bz = Math.floor(p.z);
  if (clearOfItems(game, bx, bz)) {
    for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = bx + d[0];
      const z = bz + d[1];
      if (blockedTile(game, x, z)) continue;
      stand(p);
      facePoint(p, x + 0.5, z + 0.5);
      if (pressIf(game, p, CTX.DROP)) return true;
    }
  }
  const head = game.rails.lastTile;
  if (!walkTo(game, p, (x, z) => clearOfItems(game, x, z) && Math.abs(x - head.x) + Math.abs(z - head.z) <= 5)) stand(p);
  return false;
}

function hasPiles(game, p) {
  let found = false;
  game.items.forEach((it) => {
    if (found) return;
    if (it.k !== "wood" && it.k !== "iron") return;
    if (it.x < game.train.x - 6) return;
    found = true;
  });
  return found;
}

function bestPile(game, p, wantKind, maxDist) {
  let best = null;
  let bestScore = Infinity;
  const needs = { wood: 0, iron: 0 };
  for (const w of game.train.wagons) {
    if (w.type !== "crafter") continue;
    const st = wagonStats("crafter", w.level);
    needs.wood += Math.max(0, (st.capWood || 0) - w.inv.wood);
    needs.iron += Math.max(0, (st.capIron || 0) - w.inv.iron);
  }
  game.items.forEach((it) => {
    if (it.k !== "wood" && it.k !== "iron") return;
    if (wantKind && it.k !== wantKind) return;
    if (!wantKind && needs[it.k] <= 0) return;
    if (it.x < game.train.x - 8) return;
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (maxDist && d > maxDist) return;
    const score = d - it.n * 0.7;
    if (score < bestScore) { bestScore = score; best = it; }
  });
  return best;
}

function workRole(game, p) {
  if (p.bot.role === "idle") { stand(p); return; }
  if (p.bot.role === "axe") { harvestRole(game, p, "tree", "tool_axe"); return; }
  if (p.bot.role === "pick") { harvestRole(game, p, "ore", "tool_pick"); return; }
  if (p.bot.role === "bucket") { bucketRole(game, p); return; }
  carryRole(game, p);
}

function unstick(game, p, dt) {
  const b = p.bot;
  const moved = Math.hypot(p.x - b.lastX, p.z - b.lastZ);
  b.stuckT += dt;
  if (b.stuckT >= 0.5) {
    if (moved < 0.3 && (p.stick.x !== 0 || p.stick.y !== 0)) {
      b.avoidT = 0.55;
      b.avoidSide = b.avoidSide === 1 ? -1 : 1;
    }
    b.stuckT = 0;
    b.lastX = p.x;
    b.lastZ = p.z;
  }
  if (b.avoidT > 0) {
    b.avoidT -= dt;
    const sx = p.stick.x;
    const sz = p.stick.y;
    if (sx !== 0 || sz !== 0) {
      p.stick.x = -sz * b.avoidSide;
      p.stick.y = sx * b.avoidSide;
    }
  }
}

function botThink(game, p, dt) {
  const ft = game.floorTile;
  if (ft) {
    p.bot.prepT += dt;
    const ahead = game.rails.totalLen - game.train.s;
    const ready = p.bot.role === "idle" || ahead >= 18 || p.bot.prepT > 120;
    if (!ready && game.phase !== PHASE.COUNTDOWN) { workRole(game, p); return; }
    const r = (ft.size - 1) / 2;
    const inside = Math.abs(Math.floor(p.x) - ft.x) <= r && Math.abs(Math.floor(p.z) - ft.z) <= r;
    if (inside) { stand(p); return; }
    walkTo(game, p, (x, z) => Math.abs(x - ft.x) <= r && Math.abs(z - ft.z) <= r);
    return;
  }
  p.bot.prepT = 0;
  if (game.phase !== PHASE.RUN) { stand(p); return; }
  workRole(game, p);
}

export function attachBots(game, count, roles) {
  const list = [];
  const n = Math.min(count == null ? 3 : count, game.tune.MAX_PLAYERS);
  for (let i = 0; i < n; i++) {
    const pid = addPlayer(game, { cid: "bot" + i, name: "BOT" + i, hat: i % 6, colorIdx: i, skinIdx: i % 4 });
    if (!pid) break;
    const p = game.players.get(pid);
    p.bot = { role: (roles && roles[i]) || BOT_ROLES[i % BOT_ROLES.length], rows: rowMap(game), t: 0, step: null, stepT: 0, stepX: 0, stepZ: 0, prepT: 0, stuckT: 0, avoidT: 0, avoidSide: 1, lastX: 0, lastZ: 0, goal: null, skip: new Map(), waitT: 0 };
    list.push(p);
  }
  let lastRound = game.round;
  return {
    players: list,
    tick(g, dt) {
      if (g.round !== lastRound) {
        lastRound = g.round;
        const rows = rowMap(g);
        for (const p of list) if (p.bot) p.bot.rows = rows;
      }
      g.players.forEach((p) => {
        if (!p.bot) return;
        p.bot.t += dt;
        p.bot.stepT -= dt;
        botThink(g, p, dt);
        unstick(g, p, dt);
      });
    }
  };
}

export function runHeadless(opts) {
  const o = opts || {};
  const game = newGame({ seed: o.seed, tune: o.tune });
  const bots = attachBots(game, o.bots == null ? 5 : o.bots, o.roles);
  const limit = o.seconds == null ? 400 : o.seconds;
  const log = { derailWarn: 0, derail: 0, overheat: 0, arrive: 0, rails: 0, craft: 0, gold: 0, pour: 0, scoop: 0, load: 0, takeRails: 0, chop: 0, mine: 0, bank: 0, warnBeforeDerail: false };
  let warnAt = -1;
  let elapsed = 0;
  while (elapsed < limit) {
    bots.tick(game, STEP);
    stepGame(game, STEP);
    elapsed += STEP;
    const evs = drainEvents(game);
    for (const ev of evs) {
      if (ev.type === "derailWarn") { log.derailWarn++; if (warnAt < 0) warnAt = elapsed; }
      else if (ev.type === "railPlaced") log.rails++;
      else if (ev.type === "craft") log.craft += ev.n;
      else if (ev.type === "gold") log.gold += ev.amount;
      else if (ev.type === "pour") log.pour++;
      else if (ev.type === "scoop") log.scoop++;
      else if (ev.type === "load") log.load++;
      else if (ev.type === "takeRails") log.takeRails++;
      else if (ev.type === "chop") log.chop++;
      else if (ev.type === "mine") log.mine++;
      else if (ev.type === "bankBuilt") log.bank++;
      else if (ev.type === "derail") { log.derail++; log.warnBeforeDerail = warnAt >= 0 && elapsed - warnAt > 0.5; }
      else if (ev.type === "overheat") log.overheat++;
      else if (ev.type === "arrive") log.arrive++;
    }
    if (o.stopOn && o.stopOn(game, elapsed)) break;
  }
  return { game, log, elapsed, bots };
}
