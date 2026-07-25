// Track Crew — tool behaviour numbers for the three shared tools and the dynamite stick.

export const TOOLS = {
  axe:    { key: "tool_axe",    name: "Axe",      target: "tree", hits: 3, hitS: 0.45 },
  pick:   { key: "tool_pick",   name: "Pickaxe",  target: "ore",  hits: 3, hitS: 0.45 },
  bucket: { key: "tool_bucket", name: "Bucket",   target: "water", scoopS: 1.0, cool: 0.6 },
  stick:  { key: "stick",       name: "Dynamite", throwTiles: 5, fuseS: 1.5 }
};

export const TOOL_SET = ["axe", "pick", "bucket"];

export const TOOL_BY_KEY = {
  tool_axe: TOOLS.axe,
  tool_pick: TOOLS.pick,
  tool_bucket: TOOLS.bucket,
  stick: TOOLS.stick
};
