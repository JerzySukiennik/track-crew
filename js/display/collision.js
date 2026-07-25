// Track Crew — capsule-vs-tile sliding, player-vs-player pushing and the solid train wall.

import { isWalkable, tileKey } from "./world.js";

const EPS = 1e-3;
const PUSH_STEP = 0.09;

export function blockedTile(game, x, z) {
  if (!isWalkable(game.world, x, z)) return true;
  return game.train.tileSet.has(tileKey(x, z));
}

function resolveAxis(game, moved, other, from, r, axis) {
  const dir = moved > from ? 1 : moved < from ? -1 : 0;
  if (!dir) return moved;
  const lead = moved + dir * r;
  const tile = Math.floor(lead);
  if (Math.floor(from + dir * r) === tile) return moved;
  const minO = Math.floor(other - r + EPS);
  const maxO = Math.floor(other + r - EPS);
  for (let o = minO; o <= maxO; o++) {
    const bx = axis === 0 ? tile : o;
    const bz = axis === 0 ? o : tile;
    if (blockedTile(game, bx, bz)) {
      return dir > 0 ? tile - r - EPS : tile + 1 + r + EPS;
    }
  }
  return moved;
}

export function slideMove(game, px, pz, dx, dz, radius) {
  let x = px;
  let z = pz;
  if (dx) x = resolveAxis(game, px + dx, pz, px, radius, 0);
  if (dz) z = resolveAxis(game, pz + dz, x, pz, radius, 1);
  return { x, z };
}

function nearestFree(game, x, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  let best = null;
  let bestD = Infinity;
  for (let r = 1; r <= 4 && !best; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const tx = bx + dx;
        const tz = bz + dz;
        if (blockedTile(game, tx, tz)) continue;
        const d = Math.hypot(tx + 0.5 - x, tz + 0.5 - z);
        if (d < bestD) { bestD = d; best = { x: tx + 0.5, z: tz + 0.5 }; }
      }
    }
  }
  return best;
}

export function pushPlayers(game) {
  const T = game.tune;
  const list = [];
  game.players.forEach((p) => { if (p.conn !== "lost") list.push(p); });
  const min = T.PLAYER_R * 2;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-4) { dx = (i % 2 ? 1 : -1) * 0.01; dz = 0.01; d = Math.hypot(dx, dz); }
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
    }
  }
  for (const p of list) {
    if (!blockedTile(game, Math.floor(p.x), Math.floor(p.z))) continue;
    const free = nearestFree(game, p.x, p.z);
    if (!free) continue;
    const dx = free.x - p.x;
    const dz = free.z - p.z;
    const d = Math.max(1e-4, Math.hypot(dx, dz));
    p.x += (dx / d) * PUSH_STEP;
    p.z += (dz / d) * PUSH_STEP;
  }
}
