// Track Crew — global tuning constants, 3D palette and the fixed camera yaw.

export const TUNE = Object.freeze({
  TILE: 1,
  MAX_PLAYERS: 5,
  MAX_WAGONS: 8,
  PLAYER_SPEED: 4.2,
  PLAYER_R: 0.35,
  ACT_RANGE: 1.3,

  INPUT_HZ: 25,
  PAD_HZ: 10,
  RELAY_IN_HZ: 10,
  RELAY_PAD_HZ: 3,
  RTC_FALLBACK_S: 6,
  DISCONNECT_GRACE_S: 30,

  TRAIN_BASE_SPEED: 0.20,
  ROUND_SPEED_GROWTH: 1.04,
  TRAIN_START_DELAY: 20,
  DERAIL_WARN_S: 5,

  ROUND1_DIST: 26,
  DIST_GROWTH: 1.04,
  MAX_ROUND_S: 240,

  HEAT_FULL_S: 360,
  COOL_MIN_HEAT: 0.30,
  CRAFT_CYCLE_S: 1,

  IRON_NODE_YIELD: 3,
  TREE_YIELD: 1,
  GOLD_PER_NODE: 10,

  SUPPLY_FACTOR: 1.6,
  PATH_OVERHEAD: 1.15,

  LEASH_M: 35,
  LEASH_WARN_S: 5,
  TOOL_RETURN_M: 40,
  TOOL_RETURN_S: 5,
  STICK_COOLDOWN_S: 25,

  REROLL_COST: 10,
  SCRAP_REFUND: 0.5,
  COPY_PRICE_MUL: 1.5,
  COUNTDOWN_S: 3,

  DYNAMITE_THROW: 5,
  DYNAMITE_FUSE_S: 1.5,

  CORRIDOR_ROWS: 24,
  SEG_MIN_LEN: 24,
  SEG_MAX_LEN: 44,
  STATION_LEN: 12,
  STATION_APPROACH_RAILS: 3,
  START_TILE_SIZE: 3,
  PRUNE_BEHIND_M: 60,

  GOLD_NODES_EARLY: 3,
  GOLD_NODES_MAX: 5,
  GOLD_ROUND_EARLY: 3,

  CAM_FOV: 40,
  CAM_PITCH: 38 * Math.PI / 180,
  CAM_ZOOM_MIN: 18,
  CAM_ZOOM_MAX: 55,
  CAM_SMOOTH: 6,

  HUD_HZ: 5,
  SIM_HZ: 60,
  SIM_MAX_CATCHUP: 4,
  NAME_MAX: 12,
  ROOM_CODE_LEN: 4,
  ROOM_CODE_ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ",
  STICK_DEADZONE: 0.15,
  MUSIC_VOLUME: 0.45,
  MUSIC_DUCK: 0.12,
  SFX_VOLUME: 0.8
});

export const PALETTE = Object.freeze({
  ink: 0x111111,
  yellow: 0xFFD400,
  coral: 0xFF5747,
  cyan: 0x21D0DE,
  cream: 0xFFF6E9,
  green: 0x7CD628,

  rail: 0x6B7076,
  sleeper: 0x8A5A32,
  railGhost: 0x7CD628,
  water: 0x2FA9D8,
  waterDeep: 0x1F7FAE,
  bank: 0xB98A4E,
  trunk: 0x8A5A32,
  leaf: 0x4FB03A,
  leafDark: 0x2F8A2A,
  rock: 0x8E9299,
  rockDark: 0x6C7076,
  iron: 0x9BA3AC,
  ironVein: 0x5F6A74,
  goldNode: 0xFFC017,
  wood: 0xC98B45,
  station: 0xFF5747,
  stationRoof: 0xFFD400,
  loco: 0xFF5747,
  tank: 0x21D0DE,
  wagon: 0xFFF6E9,
  sky: 0xCFE9F2,

  biome: Object.freeze({
    meadows: Object.freeze({
      ground: 0x8FCB52,
      groundAlt: 0x7FBC46,
      accent: 0xC7E27A,
      prop: 0x4FB03A,
      rock: 0x8E9299,
      fog: 0xCFE9F2,
      fogNear: 30,
      fogFar: 110
    }),
    forest: Object.freeze({
      ground: 0x5FA045,
      groundAlt: 0x54903C,
      accent: 0x9AC96B,
      prop: 0x2F8A2A,
      rock: 0x7C838C,
      fog: 0xBFDCC9,
      fogNear: 26,
      fogFar: 95
    }),
    desert: Object.freeze({
      ground: 0xE8C77A,
      groundAlt: 0xDDB864,
      accent: 0xF3DFA8,
      prop: 0x9EA857,
      rock: 0xB08A5A,
      fog: 0xF2E2BE,
      fogNear: 34,
      fogFar: 125
    })
  })
});

export const CAM_YAW = Math.PI / 4;
