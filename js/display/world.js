// Track Crew — tile grid, props, ground piles, spatial queries and pruning behind the train.

import { TOOLS } from "../data/tools.js";
import { pushEvent } from "./state.js";

export const TILE = { VOID: 0, GRASS: 1, SAND: 2, WATER: 3, BANK: 4 };

const GROUND_NAME = ["void", "grass", "sand", "water", "bank"];
const MARGIN = 6;
const GROW_X = 128;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TOOL_KEYS = { tool_axe: 1, tool_pick: 1, tool_bucket: 1 };

export function tileKey(x, z) {
  return x + "," + z;
}

export function createWorld() {
  return {
    grid: new Uint8Array(0),
    w: 0, h: 0, originX: 0, originZ: 0,
    props: new Map(),
    itemAt: new Map(),
    segments: [],
    stations: [],
    cursorX: 0,
    anchorZ: 0,
    plate: null,
    minX: 0,
    maxX: 0
  };
}

export function ensureBounds(world, x0, x1, z0, z1) {
  if (world.w === 0) {
    const ox = x0 - MARGIN;
    const oz = z0 - MARGIN;
    const w = (x1 - x0 + 1) + MARGIN * 2 + GROW_X;
    const h = (z1 - z0 + 1) + MARGIN * 2;
    world.originX = ox;
    world.originZ = oz;
    world.w = w;
    world.h = h;
    world.grid = new Uint8Array(w * h);
    world.minX = x0;
    world.maxX = x1;
    return;
  }
  const curX1 = world.originX + world.w - 1;
  const curZ1 = world.originZ + world.h - 1;
  if (x0 >= world.originX && x1 <= curX1 && z0 >= world.originZ && z1 <= curZ1) {
    if (x1 > world.maxX) world.maxX = x1;
    if (x0 < world.minX) world.minX = x0;
    return;
  }
  const nx0 = Math.min(world.originX, x0 - MARGIN);
  const nz0 = Math.min(world.originZ, z0 - MARGIN);
  const nx1 = Math.max(curX1, x1 + MARGIN + GROW_X);
  const nz1 = Math.max(curZ1, z1 + MARGIN);
  const nw = nx1 - nx0 + 1;
  const nh = nz1 - nz0 + 1;
  const g = new Uint8Array(nw * nh);
  for (let z = 0; z < world.h; z++) {
    const src = world.grid.subarray(z * world.w, z * world.w + world.w);
    g.set(src, (z + world.originZ - nz0) * nw + (world.originX - nx0));
  }
  world.grid = g;
  world.w = nw;
  world.h = nh;
  world.originX = nx0;
  world.originZ = nz0;
  if (x1 > world.maxX) world.maxX = x1;
  if (x0 < world.minX) world.minX = x0;
}

export function groundAt(world, x, z) {
  const gx = x - world.originX;
  const gz = z - world.originZ;
  if (gx < 0 || gz < 0 || gx >= world.w || gz >= world.h) return TILE.VOID;
  return world.grid[gz * world.w + gx];
}

export function setGround(world, x, z, code) {
  const gx = x - world.originX;
  const gz = z - world.originZ;
  if (gx < 0 || gz < 0 || gx >= world.w || gz >= world.h) return;
  world.grid[gz * world.w + gx] = code;
}

export function tileAt(world, x, z) {
  const code = groundAt(world, x, z);
  return { ground: GROUND_NAME[code] || "void", code, prop: world.props.get(tileKey(x, z)) || null };
}

export function isGroundCode(code) {
  return code === TILE.GRASS || code === TILE.SAND || code === TILE.BANK;
}

export function isWalkable(world, x, z) {
  if (!isGroundCode(groundAt(world, x, z))) return false;
  const p = world.props.get(tileKey(x, z));
  return !p;
}

export function isRailable(world, x, z) {
  if (!isGroundCode(groundAt(world, x, z))) return false;
  return !world.props.has(tileKey(x, z));
}

export function propAt(world, x, z) {
  return world.props.get(tileKey(x, z)) || null;
}

export function addProp(game, kind, x, z, gold) {
  const w = game.world;
  const k = tileKey(x, z);
  if (w.props.has(k)) return null;
  const hits = kind === "tree" ? TOOLS.axe.hits : kind === "ore" ? TOOLS.pick.hits : 0;
  const treeYield = game.tune.TREE_YIELD == null ? 1 : game.tune.TREE_YIELD;
  const charges = kind === "ore" ? game.tune.IRON_NODE_YIELD : kind === "tree" ? treeYield : 0;
  const p = {
    key: k, kind, x, z, hits, hp: hits, charges,
    gold: gold ? 1 : 0,
    variant: ((x * 73856093) ^ (z * 19349663)) >>> 0 & 3
  };
  w.props.set(k, p);
  return p;
}

export function removeProp(game, x, z) {
  const k = tileKey(x, z);
  const p = game.world.props.get(k);
  if (p) game.world.props.delete(k);
  return p || null;
}

export function hitProp(game, x, z) {
  const p = game.world.props.get(tileKey(x, z));
  if (!p || p.kind === "rock") return { done: false };
  const isTree = p.kind === "tree";
  p.hp -= 1;
  pushEvent(game, { type: isTree ? "chop" : "mine", x, z });
  if (p.hp > 0) return { done: false };
  const res = isTree ? "wood" : "iron";
  p.charges -= 1;
  let gold = 0;
  if (p.gold) {
    gold = game.tune.GOLD_PER_NODE;
    p.gold = 0;
    game.gold += gold;
    game.stats.roundGold += gold;
    pushEvent(game, { type: "gold", amount: gold, x, z });
  }
  dropPile(game, res, 1, x, z);
  if (p.charges <= 0) {
    game.world.props.delete(p.key);
    pushEvent(game, { type: isTree ? "treeFall" : "rockBreak", x, z, kind: p.kind });
    return { done: true, yield: res, gold };
  }
  p.hp = p.hits;
  return { done: false, yield: res, gold };
}

export function buildBank(game, x, z) {
  const w = game.world;
  if (groundAt(w, x, z) !== TILE.WATER) return false;
  let touches = false;
  for (const d of DIRS) {
    if (isGroundCode(groundAt(w, x + d[0], z + d[1]))) { touches = true; break; }
  }
  if (!touches) return false;
  setGround(w, x, z, TILE.BANK);
  pushEvent(game, { type: "bankBuilt", x, z });
  return true;
}

function freeSpot(game, k, x, z) {
  const w = game.world;
  for (let r = 0; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const tx = x + dx;
        const tz = z + dz;
        if (!isWalkable(w, tx, tz)) continue;
        const ex = w.itemAt.get(tileKey(tx, tz));
        if (!ex || ex.k === k) return { x: tx, z: tz };
      }
    }
  }
  return null;
}

export function dropItem(game, k, n, x, z) {
  if (!k || n <= 0) return null;
  const w = game.world;
  const spot = freeSpot(game, k, Math.floor(x), Math.floor(z));
  if (!spot) return null;
  const key = tileKey(spot.x, spot.z);
  const ex = w.itemAt.get(key);
  if (ex && ex.k === k) {
    ex.n += n;
    return ex;
  }
  const it = { iid: "it" + (game.seq++), k, n, x: spot.x, z: spot.z, t: 0 };
  w.itemAt.set(key, it);
  game.items.set(it.iid, it);
  return it;
}

export function dropPile(game, res, count, x, z) {
  return dropItem(game, res, count, x, z);
}

export function itemAt(world, x, z) {
  return world.itemAt.get(tileKey(x, z)) || null;
}

export function removeItem(game, it) {
  if (!it) return null;
  game.items.delete(it.iid);
  const key = tileKey(it.x, it.z);
  if (game.world.itemAt.get(key) === it) game.world.itemAt.delete(key);
  return it;
}

export function takePile(game, x, z) {
  const it = itemAt(game.world, Math.floor(x), Math.floor(z));
  if (!it) return null;
  removeItem(game, it);
  return { res: it.k, count: it.n, k: it.k, n: it.n };
}

export function tileDist(px, pz, x, z) {
  const cx = Math.min(Math.max(px, x), x + 1);
  const cz = Math.min(Math.max(pz, z), z + 1);
  return Math.hypot(px - cx, pz - cz);
}

export function nearestProp(game, px, pz, range, kind) {
  const w = game.world;
  const r = Math.ceil(range) + 1;
  const bx = Math.floor(px);
  const bz = Math.floor(pz);
  let best = null;
  let bestD = range;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const p = w.props.get(tileKey(bx + dx, bz + dz));
      if (!p) continue;
      if (kind && p.kind !== kind) continue;
      const d = tileDist(px, pz, p.x, p.z);
      if (d <= bestD) { bestD = d; best = p; }
    }
  }
  return best;
}

export function nearestWater(game, px, pz, range) {
  const w = game.world;
  const r = Math.ceil(range) + 1;
  const bx = Math.floor(px);
  const bz = Math.floor(pz);
  let best = null;
  let bestD = range;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = bx + dx;
      const z = bz + dz;
      if (groundAt(w, x, z) !== TILE.WATER) continue;
      const d = tileDist(px, pz, x, z);
      if (d <= bestD) { bestD = d; best = { x, z }; }
    }
  }
  return best;
}

export function nearestItem(game, px, pz, range, filter) {
  const w = game.world;
  const r = Math.ceil(range) + 1;
  const bx = Math.floor(px);
  const bz = Math.floor(pz);
  let best = null;
  let bestD = range;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const it = w.itemAt.get(tileKey(bx + dx, bz + dz));
      if (!it) continue;
      if (filter && !filter(it)) continue;
      const d = tileDist(px, pz, it.x, it.z);
      if (d <= bestD) { bestD = d; best = it; }
    }
  }
  return best;
}

export function explodeAt(game, cx, cz, radius) {
  const w = game.world;
  const r = Math.ceil(radius);
  const bx = Math.floor(cx);
  const bz = Math.floor(cz);
  const hit = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = bx + dx;
      const z = bz + dz;
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > radius) continue;
      const p = w.props.get(tileKey(x, z));
      if (p) hit.push(p);
    }
  }
  let wood = 0;
  let iron = 0;
  let gold = 0;
  for (const p of hit) {
    w.props.delete(p.key);
    if (p.gold) {
      gold += game.tune.GOLD_PER_NODE;
      game.gold += game.tune.GOLD_PER_NODE;
      game.stats.roundGold += game.tune.GOLD_PER_NODE;
    }
    if (p.kind === "tree") { wood += 1; dropPile(game, "wood", 1, p.x, p.z); }
    else if (p.kind === "ore") { iron += p.charges; dropPile(game, "iron", p.charges, p.x, p.z); }
  }
  if (gold > 0) pushEvent(game, { type: "gold", amount: gold, x: bx, z: bz });
  pushEvent(game, { type: "explosion", x: cx, z: cz, radius, props: hit.length });
  return { props: hit.length, wood, iron, gold };
}

export function addSegmentRecord(world, rec) {
  world.segments.push(rec);
  return rec;
}

export function pruneBehind(game, xMin) {
  const w = game.world;
  let pruned = 0;
  for (const seg of w.segments) {
    if (seg.pruned) continue;
    if (seg.x0 + seg.len > xMin) continue;
    seg.pruned = true;
    pruned++;
    const rescued = [];
    const x1 = seg.x0 + seg.len - 1;
    const z1 = seg.z0 + seg.rows - 1;
    for (let z = seg.z0; z <= z1; z++) {
      for (let x = seg.x0; x <= x1; x++) {
        const key = tileKey(x, z);
        setGround(w, x, z, TILE.VOID);
        if (w.props.has(key)) w.props.delete(key);
        const it = w.itemAt.get(key);
        if (it) {
          w.itemAt.delete(key);
          game.items.delete(it.iid);
          if (TOOL_KEYS[it.k]) game.train.hookTools.push({ k: it.k, host: "tank", x: it.x, z: it.z });
          else if (String(it.k).indexOf("_crate:") > 0) rescued.push(it);
        }
      }
    }
    for (const t of game.rails.tiles) {
      if (t.x >= seg.x0 && t.x <= x1 && t.z >= seg.z0 && t.z <= z1) t.hidden = true;
    }
    const loco = game.train.wagons[0];
    for (const it of rescued) {
      dropItem(game, it.k, it.n, Math.floor(loco ? loco.x : seg.x0), Math.floor(loco ? loco.z : seg.z0) + 2);
      pushEvent(game, { type: "toolReturn", k: it.k, x: it.x, z: it.z });
    }
    pushEvent(game, { type: "segmentPruned", id: seg.id, x0: seg.x0, len: seg.len });
  }
  return pruned;
}
