// Track Crew — avatar customisation options: hats, clothing colours and skin tones.

export const HATS = [
  { id: "cap",    name: "Conductor Cap" },
  { id: "cowboy", name: "Cowboy Hat" },
  { id: "beanie", name: "Beanie" },
  { id: "top",    name: "Top Hat" },
  { id: "straw",  name: "Straw Hat" },
  { id: "none",   name: "Bare Head" }
];

export const COLOR_OPTIONS = [
  { id: "coral",  name: "Coral",  hex: 0xFF5747, css: "#FF5747" },
  { id: "cyan",   name: "Cyan",   hex: 0x21D0DE, css: "#21D0DE" },
  { id: "yellow", name: "Yellow", hex: 0xFFD400, css: "#FFD400" },
  { id: "green",  name: "Green",  hex: 0x7CD628, css: "#7CD628" },
  { id: "purple", name: "Purple", hex: 0x9B5DE5, css: "#9B5DE5" },
  { id: "orange", name: "Orange", hex: 0xFF8A1F, css: "#FF8A1F" },
  { id: "pink",   name: "Pink",   hex: 0xFF6FB5, css: "#FF6FB5" },
  { id: "blue",   name: "Blue",   hex: 0x3B7DFF, css: "#3B7DFF" }
];

export const SKIN_OPTIONS = [
  { id: "light",  name: "Light",  hex: 0xF6D3B0, css: "#F6D3B0" },
  { id: "tan",    name: "Tan",    hex: 0xE0A870, css: "#E0A870" },
  { id: "brown",  name: "Brown",  hex: 0xA9713F, css: "#A9713F" },
  { id: "deep",   name: "Deep",   hex: 0x6B4326, css: "#6B4326" }
];

export const HAT_COUNT = HATS.length;
export const COLOR_COUNT = COLOR_OPTIONS.length;
export const SKIN_COUNT = SKIN_OPTIONS.length;

export function clampHat(i) { return ((i | 0) % HAT_COUNT + HAT_COUNT) % HAT_COUNT; }
export function clampColor(i) { return ((i | 0) % COLOR_COUNT + COLOR_COUNT) % COLOR_COUNT; }
export function clampSkin(i) { return ((i | 0) % SKIN_COUNT + SKIN_COUNT) % SKIN_COUNT; }
