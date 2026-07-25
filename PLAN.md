# TRACK CREW — BUILD PLAN (FROZEN CONTRACT v1)

Source of truth for gameplay: `ClaudeMemory/projects/track-crew.md` (interview 2026-07-24, ~67 decisions). Visual language: `mockups/variant-b.html` ("Sticker Arcade", approved). This document is the frozen contract for 4 parallel Coders. **Nothing in sections 2–6 may be renegotiated by a Coder.** Anything marked `[PLANNER DECISION]` is a call made where the spec was silent — flag these to the client, but implement them as written.

Repo: `JerzySukiennik/track-crew` · Live: `jerzysukiennik.github.io/track-crew` · Game language: English only. Code/comments/commits in English; no comments beyond a one-line file header. Zero build step; ES modules from CDN.

---

## 0. Global technical decisions

- three.js **0.160.0** via importmap (`https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`, addons under `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/`).
- Firebase **10.12.2** modular from `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js` and `firebase-database.js`. RTDB is **signaling + fallback relay only** — never a gameplay data path once DataChannels are open.
- qrcodejs from cdnjs via plain `<script>` tag (non-module), global `QRCode`.
- Single entry `index.html?role=display|controller&room=CODE`. No role param → landing page with "OPEN ON THE TV" hint + manual code entry (controller path).
- Display is the **only** simulation. Phones send input and render only their own pad UI.
- No physics engine. Capsule-vs-tilegrid collision, 1×1 m tiles, train on rail spline.
- Flat world: all walkable ground at y=0; obstacles/water are tile flags, no elevation. `[PLANNER DECISION]` — keeps collision, pathing and the segment format trivially simple; the "toy diorama" look comes from props and palette, not terrain relief.
- World main axis = **+X** (train travels east on average, meanders laterally in Z). Camera yaw fixed 45°, pitch 38°, never rotates. Joystick up = screen up via constant rotation `CAM_YAW` in config.
- Sim: fixed-step 60 Hz (accumulator, max 4 catch-up steps). Renderer: RAF. HUD DOM: 5 Hz. Pad messages to phones: 10 Hz. Phone input: 25 Hz.
- Audio: **real CC0 files committed to the repo only, zero WebAudio synthesis** (hard client rule). Display requires one click at boot ("CLICK TO START") to satisfy autoplay policy and go fullscreen. `[PLANNER DECISION]`
- iOS Safari: `navigator.vibrate` is **not supported** — every "vibration" alarm also triggers a full-pad coral flash; vibrate is called where available, flash is the guaranteed channel. `[PLANNER DECISION]`
- Firebase project: **new project on gzowotesla@gmail.com**, Spark plan. `js/net/firebase.js` ships with a clearly marked placeholder config object; filling it is a deploy-time step, not a Coder task.

---

## 1. Full file tree

```
Track Crew/
├─ index.html                  Entry shell: importmap, fonts, qrcodejs, #tv-root/#pad-root/#gl, boot script tag
├─ PLAN.md                     This contract
├─ firebase.rules.json         RTDB security rules (deployed manually)
├─ css/
│  ├─ tokens.css               Sticker Arcade design tokens + shared primitives   [Coder 4]
│  ├─ tv.css                   TV HUD screens (join / run / wreck)                [Coder 2]
│  └─ pad.css                  Landscape controller + rotate gate + join picker   [Coder 3]
├─ js/
│  ├─ boot.js                  Query parsing, role routing, dynamic import of display/ or controller/ main
│  ├─ config.js                TUNE object (all tuning constants), PALETTE (3D hex), CAM_YAW
│  ├─ data/
│  │  ├─ wagons.js             WAGONS table (economy, levels, capacities)
│  │  ├─ tools.js              TOOLS table (axe/pick/bucket/dynamite behavior numbers)
│  │  ├─ biomes.js             BIOMES table (ground/prop colors, fog, music key, unlock order)
│  │  ├─ avatars.js            HATS, COLOR_OPTIONS, SKIN_OPTIONS
│  │  └─ segments/
│  │     ├─ index.js           SEGMENTS registry (imports the 3 biome files, exports flat list + byBiome)
│  │     ├─ meadows.js         12 hand-authored meadows segments
│  │     ├─ forest.js          12 hand-authored forest segments
│  │     └─ desert.js          12 hand-authored desert segments
│  ├─ shared/
│  │  ├─ protocol.js           Message types, CTX/BUZZ/PHASE enums, PROTO version, channel names
│  │  ├─ rng.js                mulberry32 seeded RNG + shuffle + pick
│  │  └─ avatar3d.js           buildAvatar() — voxel character THREE.Group (display chars + pad live preview)
│  ├─ net/
│  │  ├─ firebase.js           Firebase init, RTDB refs helper (placeholder config)
│  │  ├─ signaling.js          Offer/answer/ICE exchange over RTDB, room claim/cleanup
│  │  ├─ rtc.js                RTCPeerConnection wrapper, dual DataChannels, open/close plumbing
│  │  ├─ relay.js              RTDB fallback channel (latest-value input/pad, push queues for events)
│  │  ├─ nethost.js            Display-side unified net API (RTC first, relay merge, per-peer state)
│  │  └─ netclient.js          Phone-side unified net API (RTC attempt, 6 s fallback, quiet "slow link" state)
│  ├─ controller/
│  │  ├─ main.js               Controller entry: rotate gate, join → pad lifecycle, reconnection
│  │  ├─ join.js               Name/hat/color/skin picker with live 3D preview, localStorage persistence
│  │  ├─ pad.js                Landscape pad: joystick, context button, hold readout, buzz/flash
│  │  └─ rotate.js             Portrait detection + full-screen "ROTATE YOUR PHONE" gate
│  └─ display/
│     ├─ main.js               Display entry: click-to-start, wiring, fixed-step loop, event drain order
│     ├─ state.js              createGame(), authoritative state shape, phase machine, event queue
│     ├─ world.js              Tile grid, props, piles, queries, pruning behind train
│     ├─ stitcher.js           Segment chaining, socket alignment, 1.6× supply guarantee, station generation
│     ├─ collision.js          Capsule-vs-tile slide, player-vs-player push, train wall blocking
│     ├─ players.js            Movement, carry slot, context resolution, button handling, auto-actions, leash
│     ├─ rails.js              Rail placement, auto-connect shapes, rail spline, green-tile query
│     ├─ train.js              Spline follow, heat, crafters/holders/vault/dynamite wagons, derail/overheat, tool hook
│     ├─ lobby.js              3D lobby/shop/scrapyard logic, floor-tile buttons, offers, wagon carry/insert
│     ├─ camera.js             Fixed-angle framing camera (players + train front), zoom clamp, smoothing
│     ├─ hud.js                TV DOM: gold + distance, join screen (QR/code/crew), wreck screen, red pulse
│     ├─ audio.js              File-based SFX/music player, per-biome loops, alarm ducking, event consumer
│     └─ render/
│        ├─ scene.js           Renderer, lights, shadowmap, fog, sky/horizon
│        ├─ terrain.js         Merged per-segment ground geometry (vertex colors), water tiles, dispose
│        ├─ props.js           Instanced trees/rocks/ore/gold nodes, ground piles, loose items, green highlights
│        ├─ trainmesh.js       Locomotive + wagons meshes, tank heat color, holder stack, hook tools
│        ├─ charmesh.js        Player characters (avatar3d), carry stack over head, no-signal icon, wagon-on-head
│        └─ fx.js              Explosions, dust, teleport, derail wreck, station glow, leash edge arrows
└─ assets/
   └─ audio/
      ├─ SOURCES.md            Every file: source URL + CC0 license confirmation
      ├─ sfx/                  ~20 CC0 sfx files (list in §7, Coder 4)
      └─ music/                3 calm CC0 loops (meadows/forest/desert)
```

---

## 2. Module API contract (frozen — do not invent cross-module APIs)

All shared modules are side-effect-free on import. Dependency wiring happens only in `display/main.js` and `controller/main.js`. Positions are meters in world space; tiles are integer `{x,z}`.

### shared/protocol.js (owner: Coder 3; imported by everyone)
```js
export const PROTO = 1;
export const CH = { EVENT: "ev", INPUT: "in" };            // DataChannel labels
export const PHASE = { LOBBY:"lobby", COUNTDOWN:"countdown", RUN:"run", WRECK:"wreck", SHOP:"shop" };
export const CTX = { NONE:0, PICKUP:1, SWAP:2, DROP:3, PLACE_RAIL:4, BUILD_BANK:5, LOAD:6,
                     TAKE_RAILS:7, THROW:8, BUY:9, SCRAP:10, REROLL:11, INSERT_WAGON:12, TAKE_STASH:13 };
export const CTX_LABEL = { /* CTX code → pad button label string, e.g. 4:"PLACE RAIL" */ };
export const BUZZ = { DERAIL_WARN:"derailWarn", OVERHEAT_WARN:"overheatWarn", ROUND_END:"roundEnd" };
```

### shared/rng.js (owner: Coder 4)
```js
export function makeRng(seed)            // → () => float [0,1)
export function pick(rng, arr)           // → element
export function shuffle(rng, arr)        // → new shuffled array
```

### shared/avatar3d.js (owner: Coder 2; uses data/avatars.js)
```js
export function buildAvatar({ hat, colorIdx, skinIdx })   // → THREE.Group, ~1.4 m tall, origin at feet
export function setAvatarWalk(group, phase)               // phase float — simple limb bob
```

### js/config.js (owner: Coder 4)
```js
export const TUNE = Object.freeze({ /* every constant from §6, flat keys as listed there */ });
export const PALETTE = Object.freeze({ ink:0x111111, yellow:0xFFD400, coral:0xFF5747,
  cyan:0x21D0DE, cream:0xFFF6E9, green:0x7CD628 /* + 3D-only ground/prop hexes */ });
export const CAM_YAW = Math.PI / 4;
```

### data tables (owner: Coder 4) — shapes in §6.

### net/nethost.js (owner: Coder 3)
```js
export async function createHost({ roomCode, handlers })
// handlers: { onPeerJoin(cid), onPeerLeave(cid), onEvent(cid, msg), onInput(cid, {x, y, q}) }
// → { sendEvent(cid, msg), sendPad(cid, pad), broadcastEvent(msg), peerMode(cid) /* "rtc"|"relay" */, close() }
```

### net/netclient.js (owner: Coder 3)
```js
export async function connectClient({ roomCode, cid, handlers })
// handlers: { onOpen(mode /* "rtc"|"relay" */), onEvent(msg), onPad(pad), onClose() }
// → { sendEvent(msg), sendInput({x, y}), mode(), close() }
```

### display/state.js (owner: Coder 1)
```js
export function createGame({ seed })      // → game (shape in §5)
export function pushEvent(game, ev)       // append to game.events
export function drainEvents(game)         // → events array, clears queue (called once per frame by main.js)
export function setPhase(game, phase)     // phase machine transitions + phase broadcast event
```

### display/world.js (owner: Coder 1)
```js
export function createWorld()                              // → game.world sub-object
export function tileAt(world, x, z)                        // → { ground:"grass"|"sand"|"water"|"bank", prop:null|Prop }
export function isWalkable(world, x, z)                    // ground != water && no blocking prop
export function isRailable(world, x, z)
export function hitProp(game, x, z)                        // one tool hit; → { done:bool, yield?:"wood"|"iron", gold?:number }
export function buildBank(game, x, z)                      // water → bank tile; emits event
export function dropPile(game, res, count, x, z)           // merges with existing pile on tile
export function takePile(game, x, z)                       // → { res, count } | null
export function pruneBehind(game, xMin)                    // dispose segments fully behind; emits segmentPruned
```

### display/stitcher.js (owner: Coder 1; consumes data/segments)
```js
export function buildRound(game, { round, biome, seed })
// Appends stitched segments + end station (clearing, 3 approach rails, start tile, shop siding).
// → { routeTiles, need: { wood, iron } }   Must satisfy the 1.6× rule (§4).
```

### display/collision.js (owner: Coder 1)
```js
export function slideMove(game, px, pz, dx, dz, radius)    // → { x, z } capsule slide vs tiles/props/train wall
export function pushPlayers(game)                          // symmetric circle-vs-circle separation, called once per tick
```

### display/players.js (owner: Coder 1)
```js
export function addPlayer(game, { cid, name, hat, colorIdx, skinIdx })  // → pid (reclaims by cid on rejoin)
export function removePlayer(game, pid)                    // drops carried items on ground
export function markLost(game, pid) / markBack(game, pid)  // 30 s no-signal freeze handling
export function applyInput(game, pid, { x, y })            // stores latest stick vector (CAM_YAW-rotated)
export function onButton(game, pid)                        // executes contextFor() action
export function contextFor(game, pid)                      // → { ctx: CTX.*, near: string }  (priority order in §2a)
export function tickPlayers(game, dt)                      // movement, auto-actions, leash, tool logic
```

### display/rails.js (owner: Coder 1)
```js
export function tryPlaceRail(game, x, z)     // → bool; auto-shape, extends spline, consumes 1 carried rail
export function greenTiles(game)             // → [{x,z}] currently placeable tiles (renderer highlight)
export function splinePoint(game, s)         // → { x, z, dirX, dirZ } at arc length s
export function splineLength(game)           // → meters of laid track ahead of round start
```

### display/train.js (owner: Coder 1)
```js
export function initTrain(game, wagonList)                 // [{type, level}] slot order
export function tickTrain(game, dt)                        // advance, heat, craft, dynamite dispense, checks
export function wagonAtTile(game, x, z)                    // → wagonIndex | -1
export function depositTo(game, pid, wagonIndex)           // whole carried stack; → bool
export function takeRails(game, pid, wagonIndex)           // whole Holder stack into hands; → bool
export function takeStash(game, pid, wagonIndex)           // Vault LIFO withdraw; → bool
export function coolTank(game, amount)
export function attachWagon(game, type, level, slot) / detachWagon(game, slot)
```

### display/lobby.js (owner: Coder 1)
```js
export function enterLobby(game)                           // first-boot baseplate west of station 0
export function enterShop(game)                            // rolls offers, spawns crates/price tags/tiles at station
export function rollOffers(game)                           // 5 offers per rules in §6
export function tickLobbyShop(game, dt)                    // start/retry tile occupancy + countdown, purchases
```

### display/camera.js (owner: Coder 2)
```js
export function createCamera(aspect)                       // → THREE.PerspectiveCamera (fov 40)
export function updateCamera(cam, game, dt)                // frame players + train front, zoom clamp, smooth
```

### display/render/* (owner: Coder 2) — uniform shape
```js
// scene.js
export function initScene(canvas)          // → { renderer, scene, render(cam) }
// terrain.js / props.js / trainmesh.js / charmesh.js / fx.js — each:
export function init(scene)
export function sync(game, dt, events)     // continuous state read + consumes relevant drained events
```

### display/hud.js (owner: Coder 2)
```js
export function initHud(tvRoot)
export function syncHud(game, events)      // gold, distance-to-station, phase screens, red derail pulse
```

### display/audio.js (owner: Coder 4)
```js
export function initAudio()                // called from the boot click gesture
export function consume(game, events)      // maps sim events → sfx; manages biome music + ducking
export function setMusic(biomeKey | null)
```

### controller modules (owner: Coder 3)
```js
// join.js
export function runJoin(padRoot)           // → Promise<{ name, hat, colorIdx, skinIdx }> (localStorage-backed)
// pad.js
export function initPad(padRoot, { onInput, onButton })    // 25 Hz stick sampling, single button
export function setPad(pad)                // { hold:{k,n}|null, ctx, near } from display
export function setPhasePad(phase)         // minimal phase-dependent pad states (lobby hint / run / wreck)
export function buzz(kind)                 // vibrate if available + guaranteed coral full-pad flash
// rotate.js
export function initRotateGate()           // shows/hides gate on orientation change; returns isLandscape()
```

### 2a. Context button priority (frozen, evaluated in players.contextFor)
Target tile = 1 tile ahead of facing direction; item search radius `TUNE.ACT_RANGE`.
1. Holding dynamite stick → `THROW` (thrown `DYNAMITE_THROW` tiles along facing, fuse, area clear, resources scatter as piles).
2. Holding rails AND target tile is in `greenTiles()` → `PLACE_RAIL`. Holding rails otherwise → `DROP` (whole stack).
3. Holding wood AND target tile is water adjacent to land/bank → `BUILD_BANK` (1 wood → tile becomes walkable+railable bank). `[PLANNER DECISION]` — this is the "bridge/embankment from wood": 1 wood per water tile, built tile permanent.
4. Shop phase specials when adjacent: `BUY` (crate/upgrade), `SCRAP` (at scrapyard with wagon on head), `REROLL` (reroll tile, costs gold), `INSERT_WAGON` (glowing train slot with wagon on head).
5. Facing a wagon: Crafter accepting your resource → `LOAD` (whole stack); Holder with rails and hands empty/rails → `TAKE_RAILS`; Vault → `LOAD` (holding) / `TAKE_STASH` (empty hands).
6. Item/pile/tool/stick on target or within range: hands empty → `PICKUP`; holding something → `SWAP` (held drops on ground, target taken).
7. Holding anything → `DROP`. Else `NONE`.

Auto-actions (no button, within `ACT_RANGE`): chop with axe at tree, mine with pickaxe at ore/gold ore, scoop with empty bucket at water tile, pour with full bucket at Water Tank **only when heat > `COOL_MIN_HEAT`**. Harvest yields drop as ground piles at the node — tool holders never auto-fill their hands. `[PLANNER DECISION]` — the carry slot holds either ONE tool OR one resource stack; this enforces the spec's carrier role.

---

## 3. Network schema

### 3.1 Transport
Phone = RTC initiator, display = host peer. Phone creates both channels: `"ev"` (reliable, ordered — default) and `"in"` (`{ordered:false, maxRetransmits:0}`). All messages JSON. ICE: STUN only (`stun:stun.l.google.com:19302`); no TURN — the RTDB relay is the fallback for TURN-shaped failures. `[PLANNER DECISION]`

### 3.2 Signaling handshake (RTDB, step by step)
1. Display generates 4-char code from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I/L/O), claims `rooms/{CODE}` via transaction on `rooms/{CODE}/meta = { createdAt: serverTimestamp, v: PROTO }`; retries on collision. Registers `onDisconnect().remove()` on `rooms/{CODE}` and removes it on unload.
2. Phone opens QR URL `…/?role=controller&room=CODE`. Generates/loads persistent `cid` (localStorage `trackcrew.cid`). Verifies `rooms/{CODE}/meta` exists.
3. Phone creates pc + channels, writes offer to `rooms/{CODE}/sig/{cid}/offer = { type, sdp }`.
4. Display listens on `rooms/{CODE}/sig` (child_added), answers at `rooms/{CODE}/sig/{cid}/answer`.
5. ICE candidates: pushed under `rooms/{CODE}/sig/{cid}/ice/c/…` (phone) and `…/ice/d/…` (display); each side consumes the other's.
6. On both channels open: phone sends `join` on `"ev"`; display replies `welcome`; both detach signaling listeners; phone deletes `rooms/{CODE}/sig/{cid}`.
7. **Fallback:** if channels are not open **6 s** (`TUNE.RTC_FALLBACK_S`) after the offer write, phone sets `rooms/{CODE}/relay/{cid}/mode = true` and switches to relay paths. Pad shows a small quiet "SLOW LINK" chip; no modal. Display always listens on `rooms/{CODE}/relay`.

### 3.3 Relay paths (fallback only)
- `rooms/{CODE}/relay/{cid}/in` — phone **overwrites** latest `{x,y,q}` at 10 Hz.
- `rooms/{CODE}/relay/{cid}/out` — display overwrites latest pad object at 3 Hz.
- `rooms/{CODE}/relay/{cid}/ec` / `ed` — push queues for reliable events (client→display / display→client); consumer deletes after read.

### 3.4 Messages
Reliable `"ev"` channel:

| Type | Dir | Fields |
|---|---|---|
| `join` | C→D | `proto:int, cid:string, name:string(≤12), hat:int, colorIdx:int, skinIdx:int` |
| `welcome` | D→C | `pid:string, colorIdx:int, phase:string, round:int` |
| `reject` | D→C | `reason:"full"\|"version"\|"badname"` |
| `btn` | C→D | *(none)* — single context button press |
| `phase` | D→C | `phase:string, round:int` |
| `buzz` | D→C | `kind:BUZZ.*` |
| `kick` | D→C | `reason:string` |
| `leave` | C→D | *(none)* |

Unreliable `"in"` channel:

| Type | Dir | Fields | Rate |
|---|---|---|---|
| `in` | C→D | `x:float, y:float` (−1..1, deadzone 0.15 applied on phone), `q:int` seq (stale-drop) | 25 Hz |
| `pad` | D→C | `hold:{k:string,n:int}\|null, ctx:int(CTX), near:string` | 10 Hz + immediate reliable copy on `ctx` change |

### 3.5 Security rules (`firebase.rules.json`)
```json
{ "rules": {
  ".read": false, ".write": false,
  "rooms": { "$code": {
    ".read": true, ".write": true,
    ".validate": "$code.length === 4 && newData.hasChild('meta') || data.exists()"
} } } }
```
Open per-room read/write (party game, no auth), everything else denied; rooms self-delete via `onDisconnect`.

---

## 4. World data format — the "klocek" (segment)

Corridor is **24 rows** (Z) tall, flat, chained along +X. `[PLANNER DECISION]`

```js
{
  id: "meadows-river-01",
  biome: "meadows",                 // "meadows" | "forest" | "desert"
  len: 32,                          // tiles along +X (24–48 allowed)
  entryRow: 12, exitRow: 12,        // socket: corridor anchor row at x=0 and x=len-1 (0..23)
  minBanks: 2,                      // minimum wood spent on water crossing along any sane path
  supply: { wood: 14, iron: 12, gold: 1 },   // wood = count('T'); iron = 3*count('I'); gold = count('G')+count('g')
  map: [ /* 24 strings, each len chars, row 0 = north */ ]
}
```
Charset: `.` ground (biome-colored) · `~` water · `T` tree (1 wood, then gone) · `I` iron ore (3 yields of 1 iron, then gone — `IRON_NODE_YIELD`) · `R` rock (impassable, dynamite-clearable, no yield) · `G` golden tree · `g` golden ore (normal yield + `GOLD_PER_NODE` gold instantly).

**Authoring rules (per segment):** entry/exit rows and the 3 tiles around each socket must be clear buildable ground; at least one all-ground path ≥2 tiles wide must connect entry to exit after felling trees (rocks may not fully wall the corridor); water may span the corridor only if crossable with ≤4 banks; no props on rows 0–1 and 22–23 (visual margin).

**Stitcher rules (frozen):**
1. Pick segments of the round's biome (seeded RNG, no immediate repeats) until `Σlen ≥ roundDist(round)`.
2. Translate each segment in Z so its `entryRow` aligns with the previous `exitRow` (world corridor drifts laterally — routes wind but never U-turn, matching the fixed camera).
3. Supply guarantee: `wood ≥ SUPPLY_FACTOR × (railsNeeded + Σ minBanks)` and `iron ≥ SUPPLY_FACTOR × railsNeeded`, where `railsNeeded = ceil(Σlen × PATH_OVERHEAD)`. If short, replace the lowest-supply segment with the richest unused one; repeat until satisfied (data must make this always terminable — Coder 4 balances segments so average supply ≈ 1.8× len).
4. Gold: clamp total golden nodes to 1–3 (round ≤3) / max 5; excess golden nodes demote to normal, deficit promotes a random tree/ore.
5. Append end station: 12-tile clearing, station building (visible from afar), **3 pre-laid approach rails**, green START tile (3×3), shop siding + scrapyard pad + reroll tile (active only in SHOP phase).
6. Rounds are continuous: new route appends after the previous station; `pruneBehind` frees everything >60 m behind the locomotive.

---

## 5. Game state shape & tick

```js
game = {
  phase, round: 1, attempt: 1, gold: 0, seed, biome: "meadows", phaseT: 0,
  players: Map(pid → { pid, cid, name, hat, colorIdx, skinIdx,
      x, z, vx, vz, faceX, faceZ, stick: {x,y}, carry: null | {k, n},  // k: "wood"|"iron"|"rail"|"tool_axe"|"tool_pick"|"tool_bucket"|"stick"|"wagon_crate:<type>"|"upgrade_crate:<type>:<lvl>"
      bucketFull: false, autoT: 0, leashT: 0, conn: "rtc"|"relay"|"lost", lostAt: 0 }),
  items: Map(iid → { iid, k, x, z, n }),               // loose items & piles on ground
  world: { grid, w, h, originX, props: Map, segments: [], stations: [] },
  rails: { tiles: [{x,z,shape}], set: Set("x,z"), points: [], totalLen, lastTile },
  train: { s, speed, heat, warn: false, delayT,        // delayT: 10 s hold after round start
           wagons: [{ type, level, inv: {...} }],       // slot 0 loco, 1 tank, 2..7 free
           hookTools: [], stickT: 0 },
  shop: { offers: [], rerolls: 0 },
  stats: { distanceTotal: 0, roundGold: 0, roundsSurvived: 0 },
  events: []                                           // drained once per frame
}
```
Phase machine: `LOBBY → COUNTDOWN(3 s) → RUN → (WRECK → COUNTDOWN → RUN same round) | (arrive → SHOP → COUNTDOWN → RUN round+1)`.
`[PLANNER DECISION]` Wreck retry keeps the world exactly as-is (placed rails persist, harvested nodes stay gone, wagon inventories kept — only arrival at a station empties wagons per spec), train resets to the round's start station, heat resets, `attempt++`. Since rails persist, retries can never become unwinnable.
`[PLANNER DECISION]` Late join allowed in any phase; spawn beside the locomotive.

Per-tick order (60 Hz, in `display/main.js`): net inputs → `tickPlayers` → `pushPlayers` → `tickTrain` → `tickLobbyShop` (lobby/shop phases) → checks already inside train/players (derail warn at `splineRemaining/speed ≤ DERAIL_WARN_S`, derail, overheat, arrival, leash teleport, tool return, disconnect grace). Per-frame: `drainEvents` → render syncs → `updateCamera` → `audio.consume` → `hud.sync` (5 Hz throttle) → padcast (10 Hz): `contextFor` + carry → `sendPad`.

Sent to phones: **only** the `pad` message + phase/buzz events. Phones render nothing else.

---

## 6. Data tables (Coder 4 authors; all numbers TUNABLE unless from the approved economy)

**`data/wagons.js`** — from the approved economy (prices fixed by client):
```js
export const WAGONS = {
  loco:     { name:"Locomotive", unique:true,  levels:[ {}, {price:60, speedMul:0.85, unlocks:"forest"}, {price:110, speedMul:0.85, unlocks:"desert"} ] },
  tank:     { name:"Water Tank", unique:true,  levels:[ {}, {price:35, heatMul:0.75}, {price:70, heatMul:0.60} ] },
  crafter:  { name:"Crafter",  price:30, levels:[ {capWood:10,capIron:10,perCycle:1}, {price:30,capWood:20,capIron:20,perCycle:2}, {price:60,capWood:30,capIron:30,perCycle:3} ] },
  holder:   { name:"Holder",   price:25, levels:[ {capRails:10}, {price:25,capRails:20}, {price:50,capRails:30} ] },
  ghost:    { name:"Ghost",    price:20, levels:[ {} ] },          // players walk through its column
  dynamite: { name:"Dynamite", price:45, levels:[ {sticks:1,radius:2.5}, {price:40,sticks:2,radius:3.75} ] },
  workshop: { name:"Workshop", price:70, levels:[ {} ] },          // spawns a second tool set on its hook
  vault:    { name:"Vault",    price:55, levels:[ {cap:10}, {price:40,cap:20} ] } // never empties at round end
};
```
Rules encoded in lobby.js: copies allowed for non-unique types, n-th copy price ×1.5 of previous (30→45→68, floor); upgrades are physical crates applied to one specific wagon; Crafter feeds any **adjacent** Holder, blinks warning when it has none; starting consist `loco+tank+crafter+holder`.

**`data/tools.js`**: `axe {target:"tree", hits:3, hitS:0.6}`, `pick {target:"ore", hits:3, hitS:0.6}`, `bucket {scoopS:1.0, cool:0.35}`, `stick {throwTiles:5, fuseS:1.5}`.

**`data/biomes.js`**: `meadows` (water frequent, medium trees, sparse ore) → `forest` (dense trees, medium water) → `desert` (scarce water, sparse trees, rich ore/rocks); each: ground/accent hexes, fog color, `music` key.

**`data/avatars.js`**: 6 hats (`cap, cowboy, beanie, top, straw, none`), 8 clothe colors (coral, cyan, yellow, green, purple, orange, pink, blue — taken colors greyed on pad), 4 skin tones.

**`config.js TUNE`** (starting numbers, all tunable):
```
TILE 1 · MAX_PLAYERS 5 · MAX_WAGONS 8 · PLAYER_SPEED 4.2 · PLAYER_R 0.35 · ACT_RANGE 1.3
INPUT_HZ 25 · PAD_HZ 10 · RELAY_IN_HZ 10 · RELAY_PAD_HZ 3 · RTC_FALLBACK_S 6 · DISCONNECT_GRACE_S 30
TRAIN_BASE_SPEED 0.85 · ROUND_SPEED_GROWTH 1.04 · TRAIN_START_DELAY 10 · DERAIL_WARN_S 5
ROUND1_DIST 130 · DIST_GROWTH 1.18 · MAX_ROUND_S 240
HEAT_FULL_S 100 · COOL_MIN_HEAT 0.30 · CRAFT_CYCLE_S 2
CHOP_... in tools.js · IRON_NODE_YIELD 3 · GOLD_PER_NODE 10
SUPPLY_FACTOR 1.6 · PATH_OVERHEAD 1.15
LEASH_M 35 · LEASH_WARN_S 5 · TOOL_RETURN_M 40 · TOOL_RETURN_S 5 · STICK_COOLDOWN_S 25
REROLL_COST 10 · SCRAP_REFUND 0.5 · COPY_PRICE_MUL 1.5 · COUNTDOWN_S 3
```

---

## 7. Four Coder workstreams (strict file ownership — no file has two writers)

Every Coder codes against this contract only; peers' modules are assumed to exist exactly as specified. For solo testing each Coder may build throwaway harnesses **inside their own files** behind `?debug=1` (never shipped visible). Client convention applies to all: full files only, one-line header comment, English.

**Coder 1 — Simulation (display authority).**
Owns: `display/main.js, state.js, world.js, stitcher.js, collision.js, players.js, rails.js, train.js, lobby.js`.
Assumes: protocol enums, TUNE/data tables, nethost API, render/hud/audio `init/sync` signatures. Debug harness: `?debug=1` may spawn 2 scripted bot players locally (dev only — the product is phones-only).

**Coder 2 — Rendering, camera, TV HUD.**
Owns: `display/camera.js, hud.js, render/scene.js, terrain.js, props.js, trainmesh.js, charmesh.js, fx.js, shared/avatar3d.js, css/tv.css`.
Builds against a hand-written static `game` object literal matching §5. Perf budget (hard): ≤250 draw calls, ≤500k tris, one 2048 shadow-casting directional light, instancing for all props, merged ground geometry per segment, dispose on prune. Water tank heat = material color lerp blue→red. HUD consumes tokens from `css/tokens.css` (Sticker Arcade: ink 4px borders, hard offset shadows, Bungee/Space Grotesk/Space Mono, sticker tilt) — replicate the mockup's join and wreck screens.

**Coder 3 — Network + phone controller.**
Owns: `shared/protocol.js, net/* (6 files), controller/* (4 files), css/pad.css, firebase.rules.json`.
Implements §3 verbatim (protocol.js is transcription, not design). Controller: landscape pad per mockup screen 01 (stick bottom-left, one button bottom-right with context sticker label, hold readout top-center, identity chip top-left, empty middle, rail motif), portrait rotate gate, join flow with live avatar preview (imports `shared/avatar3d.js` — stub cube until Coder 2 lands), buzz = vibrate-if-available + coral flash, `touch-action:none`, wake-lock via `navigator.wakeLock` where available. Tests with a local echo display page behind `?debug=1`.

**Coder 4 — Data, segments, shell, audio.**
Owns: `index.html, css/tokens.css, js/boot.js, js/config.js, js/data/* (incl. 36 segments), shared/rng.js, display/audio.js, assets/audio/*`.
Segments: 12 per biome, hand-balanced to §4 authoring rules, average supply ≈1.8× len; include the spec's archetypes (river crossing, dense forest, narrow pass, gold clearing) in biome variants. Shell: importmap, fonts, qrcodejs script, `#tv-root #pad-root #gl` divs (frozen DOM contract), boot routing, and `<link>` tags for all three css files.
**Audio (hard rule: real CC0 files downloaded into the repo, zero synthesis):** fetch from Kenney.nl CC0 packs (Impact Sounds, Interface Sounds, UI Audio) for: chop×2, tree-fall, mine×2, splash-scoop, steam-hiss/pour, rail-clank, pickup, drop, load, coin, buy, reroll, error, explosion, crash-derail, arrive-bell, teleport-whoosh, countdown-tick; train whistle from OpenGameArt/freesound **CC0-filtered only**; 3 calm music loops from FreePD.com (CC0). Every file logged in `assets/audio/SOURCES.md` with URL + license proof; sfx <300 KB, music <4 MB; playback via `new Audio`, failure → silence. `audio.consume` maps event types → files, ducks music during overheat/derail warnings.

**Integration order:** (1) Coder 4 shell + data land first (everything imports them); (2) Coder 3 net + controller verified against a bare echo; (3) Coder 1 sim headless on the shell (debug bots, console asserts: stitcher 1.6× rule, derail, heat); (4) Coder 2 render/hud attach; (5) assembly smoke test = real phone joins via QR, lays 10 rails, derails, retries. `display/main.js` (Coder 1) is the only file that wires all four streams — it must import exactly the signatures above.

---

## 8. Risk list (mitigation chosen)

1. **P2P fails on guest networks (no TURN).** → Designed-in RTDB relay after 6 s, latest-value overwrite at 10/3 Hz, quiet "SLOW LINK" chip. Relay is a first-class mode in nethost, not an afterthought.
2. **60 fps on Intel MBP 2019.** → Hard budgets (≤250 draw calls), instanced props, merged per-segment ground, single shadow light, fog + prune culling, no per-voxel objects, no postprocessing.
3. **Irreversible rails starve the run.** → Stitcher enforces `1.6×` supply mathematically at build time (swap-in rule §4.3); segments authored to 1.8× average; dev assert logs violation.
4. **iOS Safari controller quirks** (no forced landscape, no vibrate, audio policy, sleep). → Rotate gate; flash-as-buzz; audio only on display (armed by boot click); wake lock + fallback of continuous touch keeping page active; PWA-less plain page.
5. **Continuous world grows unbounded.** → `pruneBehind` 60 m with geometry disposal; items behind pruned line deleted (except tools, which auto-return by rule).
6. **Camera can't frame 5 scattered players.** → 35 m leash with 5 s warning + teleport bounds the frame by construction; zoom clamp 18–55 m.
7. **Coders' modules don't link.** → This contract freezes every signature, enum, message, DOM id and file owner; main.js wiring owned by exactly one Coder; protocol.js is transcription.
8. **Firebase Spark abuse/limits.** → Signaling ≈ a few KB per game; rooms self-delete on disconnect; rules confine writes to `rooms/{4-char}`.
9. **Deadlocked runs (lost tools, empty world).** → Tool return rule (>40 m behind loco, 5 s → hook); banks permanent; retry preserves placed rails; supply rule.
10. **"One big build" (client-accepted risk).** → Contract-first split keeps rework local: gameplay tuning lives almost entirely in `config.js`/`data/*` (Coder 4 files), so balance passes don't touch sim/render/net code.

---

## 9. Amendment by the orchestrator (2026-07-24)

The Planner assigned a single `css/ui.css` to Coder 4 while Coder 2 and Coder 3 both needed to write UI styles into it — two writers on one file. Split into three files with single ownership, as reflected in §1 and §7:

- `css/tokens.css` — Coder 4 — palette variables, font imports, shared primitives (sticker border/shadow/tilt mixin classes).
- `css/tv.css` — Coder 2 — TV HUD and its phase screens.
- `css/pad.css` — Coder 3 — landscape controller, rotate gate, join picker.

`index.html` (Coder 4) links all three. No other change to the contract.
