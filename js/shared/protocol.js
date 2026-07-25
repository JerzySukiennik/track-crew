// Wire protocol: version, DataChannel names, message types and the enums shared by display and pad.

export const PROTO = 1;

export const CH = { EVENT: "ev", INPUT: "in" };

export const PHASE = { LOBBY: "lobby", COUNTDOWN: "countdown", RUN: "run", WRECK: "wreck", SHOP: "shop" };

export const CTX = {
  NONE: 0, PICKUP: 1, SWAP: 2, DROP: 3, PLACE_RAIL: 4, BUILD_BANK: 5, LOAD: 6,
  TAKE_RAILS: 7, THROW: 8, BUY: 9, SCRAP: 10, REROLL: 11, INSERT_WAGON: 12, TAKE_STASH: 13
};

export const CTX_LABEL = {
  0: "",
  1: "PICK UP",
  2: "SWAP",
  3: "DROP",
  4: "PLACE RAIL",
  5: "BUILD BANK",
  6: "LOAD",
  7: "TAKE RAILS",
  8: "THROW",
  9: "BUY",
  10: "SCRAP",
  11: "REROLL",
  12: "INSERT",
  13: "TAKE STASH"
};

export const BUZZ = { DERAIL_WARN: "derailWarn", OVERHEAT_WARN: "overheatWarn", ROUND_END: "roundEnd" };

export const MSG = {
  JOIN: "join", WELCOME: "welcome", REJECT: "reject", BTN: "btn", PHASE: "phase",
  BUZZ: "buzz", KICK: "kick", LEAVE: "leave", INPUT: "in", PAD: "pad"
};

export const MSG_KEY = "type";

export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

export const ROOM_CODE_LEN = 4;

export const SEQ_MOD = 65536;

export function newerSeq(q, last) {
  if (last == null) return true;
  if (q === last) return false;
  return ((q - last + SEQ_MOD) % SEQ_MOD) < SEQ_MOD / 2;
}
