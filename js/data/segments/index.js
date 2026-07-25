// Track Crew — segment registry: flat list plus per-biome buckets for the stitcher.

import { MEADOWS_SEGMENTS } from "./meadows.js";
import { FOREST_SEGMENTS } from "./forest.js";
import { DESERT_SEGMENTS } from "./desert.js";

export const SEGMENTS = [...MEADOWS_SEGMENTS, ...FOREST_SEGMENTS, ...DESERT_SEGMENTS];

export const SEGMENTS_BY_BIOME = {
  meadows: MEADOWS_SEGMENTS,
  forest: FOREST_SEGMENTS,
  desert: DESERT_SEGMENTS
};

export const SEGMENT_BY_ID = SEGMENTS.reduce((m, s) => { m[s.id] = s; return m; }, {});

export const CORRIDOR_ROWS = 24;

export function segmentsFor(biome) {
  return SEGMENTS_BY_BIOME[biome] || MEADOWS_SEGMENTS;
}
