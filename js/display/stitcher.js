// Track Crew — segment chaining, socket alignment, supply guarantee and station generation.

import { makeRng, shuffle } from "../shared/rng.js";
import { segmentsFor, CORRIDOR_ROWS } from "../data/segments/index.js";
import { pushEvent } from "./state.js";
import { TILE, ensureBounds, setGround, addProp, addSegmentRecord, tileKey } from "./world.js";
import { addChainRun, addPendingRun } from "./rails.js";

const STATION_TAIL = 26;
const OFFER_ROW = -5;
const SOUTH_ROW = 5;

function groundCode(biome) {
  return biome === "desert" ? TILE.SAND : TILE.GRASS;
}

export function roundDistance(game, round) {
  const T = game.tune;
  return T.ROUND1_DIST * Math.pow(T.DIST_GROWTH, Math.max(0, round - 1));
}

function margins(game, seg) {
  const T = game.tune;
  const need = T.SUPPLY_FACTOR * (T.PATH_OVERHEAD * seg.len);
  return {
    wood: seg.supply.wood - need - T.SUPPLY_FACTOR * (seg.minBanks || 0),
    iron: seg.supply.iron - need
  };
}

function score(game, seg) {
  const m = margins(game, seg);
  return Math.min(m.wood, m.iron);
}

function totals(game, list) {
  let len = 0;
  let wood = 0;
  let iron = 0;
  let banks = 0;
  for (const s of list) {
    len += s.len;
    wood += s.supply.wood;
    iron += s.supply.iron;
    banks += s.minBanks || 0;
  }
  const T = game.tune;
  const rails = Math.ceil(len * T.PATH_OVERHEAD);
  return {
    len, wood, iron, banks, rails,
    needWood: T.SUPPLY_FACTOR * (rails + banks),
    needIron: T.SUPPLY_FACTOR * rails
  };
}

function hasWater(seg) {
  if (seg.water != null) return !!seg.water;
  for (const row of seg.map) if (row.indexOf("~") >= 0) return true;
  return false;
}

function fixWaterGaps(game, list, pool, ranked) {
  const T = game.tune;
  const maxDry = Math.max(T.SEG_MAX_LEN, T.HEAT_FULL_S * T.TRAIN_BASE_SPEED * 0.5);
  for (let guard = 0; guard < 24; guard++) {
    let dry = 0;
    let at = -1;
    for (let i = 0; i < list.length; i++) {
      if (hasWater(list[i])) { dry = 0; continue; }
      dry += list[i].len;
      if (dry > maxDry) { at = i; break; }
    }
    if (at < 0) return true;
    const used = new Set(list.map((s) => s.id));
    const swap = ranked.find((s) => hasWater(s) && !used.has(s.id)) || pool.find((s) => hasWater(s) && s.id !== list[at].id);
    if (!swap) return false;
    list[at] = swap;
  }
  return false;
}

function selectSegments(game, rng, biome, dist) {
  const pool = segmentsFor(biome);
  const bag = shuffle(rng, pool);
  const list = [];
  let total = 0;
  let bi = 0;
  while (total < dist && list.length < 48) {
    let cand = bag[bi % bag.length];
    if (list.length && cand.id === list[list.length - 1].id) cand = bag[(bi + 1) % bag.length];
    bi++;
    list.push(cand);
    total += cand.len;
  }
  const ranked = pool.slice().sort((a, b) => score(game, b) - score(game, a));
  let swaps = 0;
  for (let guard = 0; guard < 64; guard++) {
    const t = totals(game, list);
    if (t.wood >= t.needWood && t.iron >= t.needIron) break;
    const used = new Set(list.map((s) => s.id));
    const bestUnused = ranked.find((s) => !used.has(s.id)) || null;
    let worst = 0;
    for (let i = 1; i < list.length; i++) if (score(game, list[i]) < score(game, list[worst])) worst = i;
    if (bestUnused && score(game, bestUnused) > score(game, list[worst])) {
      list[worst] = bestUnused;
      swaps++;
      continue;
    }
    const add = ranked[0] && list.length && ranked[0].id === list[list.length - 1].id ? ranked[1] : ranked[0];
    if (!add) break;
    list.push(add);
    swaps++;
  }
  fixWaterGaps(game, list, pool, ranked);
  for (let guard = 0; guard < 16; guard++) {
    const t = totals(game, list);
    if (t.wood >= t.needWood && t.iron >= t.needIron) break;
    const add = ranked[0] && list.length && ranked[0].id === list[list.length - 1].id ? ranked[1] : ranked[0];
    if (!add) break;
    list.push(add);
    swaps++;
  }
  return { list, swaps, stats: totals(game, list) };
}

function placeSegment(game, seg, x0, zOff, round) {
  const w = game.world;
  const code = groundCode(seg.biome);
  const rows = seg.map.length;
  ensureBounds(w, x0, x0 + seg.len - 1, zOff, zOff + rows - 1);
  const golds = [];
  const plain = [];
  for (let r = 0; r < rows; r++) {
    const line = seg.map[r];
    const z = zOff + r;
    for (let c = 0; c < seg.len; c++) {
      const ch = line.charAt(c) || ".";
      const x = x0 + c;
      if (ch === "~") { setGround(w, x, z, TILE.WATER); continue; }
      setGround(w, x, z, code);
      if (ch === "T") plain.push(addProp(game, "tree", x, z, false));
      else if (ch === "I") plain.push(addProp(game, "ore", x, z, false));
      else if (ch === "R") addProp(game, "rock", x, z, false);
      else if (ch === "G") golds.push(addProp(game, "tree", x, z, true));
      else if (ch === "g") golds.push(addProp(game, "ore", x, z, true));
    }
  }
  const rec = addSegmentRecord(w, {
    id: seg.id + "@" + x0, srcId: seg.id, biome: seg.biome, x0, len: seg.len,
    z0: zOff, rows, entryZ: zOff + seg.entryRow, exitZ: zOff + seg.exitRow,
    round, station: false, pruned: false, map: seg.map
  });
  return { rec, golds, plain };
}

function clampGold(game, golds, plain, round, rng) {
  const T = game.tune;
  const max = round <= T.GOLD_ROUND_EARLY ? T.GOLD_NODES_EARLY : T.GOLD_NODES_MAX;
  const list = golds.filter(Boolean);
  if (list.length > max) {
    const extra = shuffle(rng, list).slice(max);
    for (const p of extra) p.gold = 0;
    return max;
  }
  if (list.length < 1 && plain.length) {
    const p = shuffle(rng, plain.filter(Boolean))[0];
    if (p) { p.gold = 1; return 1; }
  }
  return list.length;
}

export function buildStation(game, biome, opts) {
  const w = game.world;
  const T = game.tune;
  const x0 = w.cursorX;
  const len = T.STATION_LEN;
  const anchorZ = w.anchorZ;
  const z0 = anchorZ - Math.floor(CORRIDOR_ROWS / 2) + 1;
  const rows = CORRIDOR_ROWS;
  const code = groundCode(biome);
  const tailX = opts && opts.tail ? x0 - STATION_TAIL : x0;
  ensureBounds(w, tailX - 2, x0 + len - 1, z0, z0 + rows - 1);
  for (let z = z0; z < z0 + rows; z++) {
    for (let x = tailX; x < x0 + len; x++) {
      setGround(w, x, z, code);
      w.props.delete(tileKey(x, z));
    }
  }
  const station = {
    index: w.stations.length,
    id: "station-" + w.stations.length,
    station: true, plate: false, pruned: false,
    biome, x0, len, z0, rows,
    clearX0: x0, clearLen: len, tailX, anchorZ, railZ: anchorZ,
    stopX: x0 + 4,
    buildingX: x0 + 6, buildingZ: anchorZ - 8,
    startTile: { x: x0 + 8, z: anchorZ + SOUTH_ROW - 1, size: T.START_TILE_SIZE },
    scrapPad: { x: x0 + 2, z: anchorZ + SOUTH_ROW },
    rerollTile: { x: x0 + 5, z: anchorZ + SOUTH_ROW },
    offerSpots: [
      { x: x0 + 1, z: anchorZ + OFFER_ROW },
      { x: x0 + 3, z: anchorZ + OFFER_ROW },
      { x: x0 + 5, z: anchorZ + OFFER_ROW },
      { x: x0 + 7, z: anchorZ + OFFER_ROW },
      { x: x0 + 9, z: anchorZ + OFFER_ROW }
    ],
    spawn: { x: x0 + 3, z: anchorZ + 3 }
  };
  w.stations.push(station);
  addSegmentRecord(w, station);
  const railTiles = [];
  if (opts && opts.connected) {
    for (let x = tailX; x < x0 + len; x++) railTiles.push({ x, z: anchorZ });
    addChainRun(game, railTiles);
  } else {
    const approach = Math.max(1, T.STATION_APPROACH_RAILS);
    for (let i = approach - 1; i >= 0; i--) railTiles.push({ x: station.stopX - i, z: anchorZ });
    addPendingRun(game, railTiles);
  }
  w.cursorX = x0 + len;
  pushEvent(game, { type: "stationBuilt", index: station.index, x0: station.clearX0, stopX: station.stopX });
  return station;
}

export function startWorld(game, biome) {
  const w = game.world;
  w.cursorX = 0;
  w.anchorZ = 0;
  game.biome = biome;
  const station = buildStation(game, biome, { tail: true, connected: true });
  const plateX0 = station.tailX;
  const plateLen = station.clearX0 - plateX0;
  w.plate = {
    id: "lobby", plate: true, station: false, pruned: false,
    x0: plateX0, len: plateLen, z0: station.z0, rows: station.rows, biome,
    startTile: { x: plateX0 + plateLen - 5, z: w.anchorZ + SOUTH_ROW - 1, size: game.tune.START_TILE_SIZE },
    spawn: { x: plateX0 + plateLen - 8, z: w.anchorZ + 4 }
  };
  addSegmentRecord(w, w.plate);
  return station;
}

export function buildRound(game, { round, biome, seed }) {
  const w = game.world;
  const T = game.tune;
  const rng = makeRng(((seed >>> 0) ^ Math.imul(round, 2654435761)) >>> 0);
  const dist = roundDistance(game, round);
  const startStation = w.stations[w.stations.length - 1];
  const sel = selectSegments(game, rng, biome, dist);
  const routeTiles = [];
  let golds = [];
  let plain = [];
  let x = w.cursorX;
  for (const seg of sel.list) {
    const zOff = w.anchorZ - seg.entryRow;
    const out = placeSegment(game, seg, x, zOff, round);
    golds = golds.concat(out.golds);
    plain = plain.concat(out.plain);
    const span = Math.max(1, seg.len - 1);
    for (let c = 0; c < seg.len; c++) {
      const row = Math.round(seg.entryRow + (seg.exitRow - seg.entryRow) * (c / span));
      routeTiles.push({ x: x + c, z: zOff + row });
    }
    x += seg.len;
    w.anchorZ = zOff + seg.exitRow;
  }
  w.cursorX = x;
  const goldCount = clampGold(game, golds, plain, round, rng);
  const station = buildStation(game, biome, { tail: false, connected: false });
  for (let c = 0; c < station.clearLen; c++) routeTiles.push({ x: station.clearX0 + c, z: station.railZ });

  const st = sel.stats;
  const need = { wood: st.rails + st.banks, iron: st.rails };
  game.route = {
    round,
    startX: startStation ? startStation.stopX : 0,
    startS: 0,
    stopX: station.stopX,
    dist: st.len,
    stationIndex: station.index,
    startStation: startStation ? startStation.index : 0,
    routeTiles,
    need,
    supply: { wood: st.wood, iron: st.iron, banks: st.banks, rails: st.rails, gold: goldCount },
    ok: st.wood >= st.needWood && st.iron >= st.needIron,
    needWood: st.needWood,
    needIron: st.needIron,
    segments: sel.list.map((s) => s.id),
    swaps: sel.swaps
  };
  pushEvent(game, { type: "roundBuilt", round, dist: st.len, stopX: station.stopX });
  return { routeTiles, need };
}
