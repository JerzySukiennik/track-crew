// Track Crew — biome table: 3D colours, fog, music key and the locomotive-gated unlock order.

import { PALETTE } from "../config.js";

export const BIOME_ORDER = ["meadows", "forest", "desert"];

export const BIOMES = {
  meadows: {
    key: "meadows",
    name: "Meadows",
    order: 0,
    unlockedFrom: 0,
    music: "meadows",
    ground: PALETTE.biome.meadows.ground,
    groundAlt: PALETTE.biome.meadows.groundAlt,
    accent: PALETTE.biome.meadows.accent,
    prop: PALETTE.biome.meadows.prop,
    rock: PALETTE.biome.meadows.rock,
    fog: PALETTE.biome.meadows.fog,
    fogNear: PALETTE.biome.meadows.fogNear,
    fogFar: PALETTE.biome.meadows.fogFar
  },
  forest: {
    key: "forest",
    name: "Forest",
    order: 1,
    unlockedFrom: 1,
    music: "forest",
    ground: PALETTE.biome.forest.ground,
    groundAlt: PALETTE.biome.forest.groundAlt,
    accent: PALETTE.biome.forest.accent,
    prop: PALETTE.biome.forest.prop,
    rock: PALETTE.biome.forest.rock,
    fog: PALETTE.biome.forest.fog,
    fogNear: PALETTE.biome.forest.fogNear,
    fogFar: PALETTE.biome.forest.fogFar
  },
  desert: {
    key: "desert",
    name: "Desert",
    order: 2,
    unlockedFrom: 2,
    music: "desert",
    ground: PALETTE.biome.desert.ground,
    groundAlt: PALETTE.biome.desert.groundAlt,
    accent: PALETTE.biome.desert.accent,
    prop: PALETTE.biome.desert.prop,
    rock: PALETTE.biome.desert.rock,
    fog: PALETTE.biome.desert.fog,
    fogNear: PALETTE.biome.desert.fogNear,
    fogFar: PALETTE.biome.desert.fogFar
  }
};

export function biomeForRound(round, locoLevel) {
  const idx = Math.min(Math.max(0, locoLevel | 0), BIOME_ORDER.length - 1);
  return BIOME_ORDER[idx];
}
