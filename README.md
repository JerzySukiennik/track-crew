# Track Crew

A co-op party game for 1–5 players. One screen runs the world, everyone else plays on their phone.

A train leaves the station and never stops. Your crew has to stay ahead of it: chop wood, mine iron, craft rails and lay them in front of the engine — while somebody keeps the boiler cool. Run out of track and the train goes off the rails.

**Play:** open the game on a laptop connected to a TV, then scan the QR code with each phone.

## How it works

- **The TV is the game.** It runs the whole simulation and is the only source of truth.
- **Phones are pads.** A joystick and one button that does whatever makes sense where you are standing — chop, pick up, load, place a rail, throw a stick of dynamite.
- **Phones talk to the TV directly** over WebRTC. Firebase is only used to introduce them to each other via the room code; once connected, nothing goes through the cloud. If a peer connection cannot be established, input falls back to a slower relay automatically.

## The rules that matter

- **Three tools per game**, no matter how many players: an axe, a pickaxe and a bucket. They are physical objects — pick them up, hand them over, leave them lying around. Whoever has no tool carries resources and lays track.
- **Your hands hold one thing**: a tool, or a stack of one resource. Choose.
- **One rail = one wood + one iron.** Feed a Crafter, and it passes finished rails to an adjacent Holder.
- **Rails are gone once laid.** There is no picking them back up.
- **Rounds are continuous.** The station you arrive at is where the next round begins, so anything you leave on the ground is still there next time. Wagons empty on arrival — except the Vault.
- **No buttons anywhere.** Confirmations happen by standing on a tile on the ground with the whole crew.

## Running it

Any static file server from the repo root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/?role=display` on the machine driving the TV. Phones join by scanning the QR code the game shows.

Add `?debug=1` to run with scripted bot players instead of phones.

## Built with

Vanilla JavaScript, ES modules straight from a CDN, no build step. three.js for rendering, hand-rolled collision on a tile grid (no physics engine), Firebase Realtime Database for signaling only. All sound effects and music are CC0 files committed to the repo — see `assets/audio/SOURCES.md` for every source and licence.

`PLAN.md` is the frozen technical contract the build was written against.
