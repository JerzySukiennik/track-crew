# Track Crew — audio sources

Every file in `sfx/` and `music/` is a real recorded audio file released under **CC0 1.0 Universal**
(public domain dedication, <https://creativecommons.org/publicdomain/zero/1.0/>). No sound in this
project is synthesised at runtime — the game only plays these files.

All files were transcoded to MP3 with `ffmpeg` for cross-browser playback (Safari does not decode Ogg
Vorbis): sfx are mono 128 kbps, music is stereo 96 kbps. Transcoding does not affect the licence.

## Packs used

| Pack / work | Author | Source | Licence proof |
|---|---|---|---|
| Impact Sounds (1.0) | Kenney | <https://kenney.nl/assets/impact-sounds> | Bundled `License.txt`: "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/" |
| Interface Sounds | Kenney | <https://kenney.nl/assets/interface-sounds> | Same bundled `License.txt` wording (CC0) |
| Digital Audio | Kenney | <https://kenney.nl/assets/digital-audio> | Same bundled `License.txt` wording (CC0) |
| RPG Audio | Kenney | <https://kenney.nl/assets/rpg-audio> | Same bundled `License.txt` wording (CC0) |
| Sci-Fi Sounds | Kenney | <https://kenney.nl/assets/sci-fi-sounds> | Same bundled `License.txt` wording (CC0) |
| CC0 water / splash / slime SFX | rubberduck | <https://opengameart.org/content/40-cc0-water-splash-slime-sfx> | OpenGameArt licence field: CC0 |
| Steam release sounds | bart | <https://opengameart.org/content/steam-release-sounds> | OpenGameArt licence field: CC0 |
| steam-train-whistle.wav (id 188240) | gadzooks | <https://freesound.org/people/gadzooks/sounds/188240/> | Freesound licence link: `creativecommons.org/publicdomain/zero/1.0/` |
| FreePD music library | FreePD.com | <https://web.archive.org/web/20200313033548/https://freepd.com/> | Archived site text: "This music is all licensed CC0 1.0 Universal Public Domain Dedication." |

`freepd.com` went offline in 2026; the three music tracks were retrieved from the Internet Archive
snapshots of the original `freepd.com/music/` files (URLs below).

## sfx/

| File | Origin file | Pack |
|---|---|---|
| chop_1.mp3 | `Audio/chop.ogg` | Kenney RPG Audio |
| chop_2.mp3 | `Audio/impactWood_medium_001.ogg` | Kenney Impact Sounds |
| tree_fall.mp3 | `Audio/impactWood_heavy_000.ogg` | Kenney Impact Sounds |
| mine_1.mp3 | `Audio/impactMining_000.ogg` | Kenney Impact Sounds |
| mine_2.mp3 | `Audio/impactMining_003.ogg` | Kenney Impact Sounds |
| rock_break.mp3 | `Audio/impactPlate_heavy_000.ogg` | Kenney Impact Sounds |
| splash_scoop.mp3 | `splash_05.ogg` | rubberduck, CC0 water / splash / slime SFX |
| steam_pour.mp3 | `steam hisses - Marker #2.wav` | bart, Steam release sounds |
| rail_clank.mp3 | `Audio/impactMetal_medium_000.ogg` | Kenney Impact Sounds |
| pickup.mp3 | `Audio/handleSmallLeather.ogg` | Kenney RPG Audio |
| drop.mp3 | `Audio/drop_003.ogg` | Kenney Interface Sounds |
| load.mp3 | `Audio/impactPlank_medium_002.ogg` | Kenney Impact Sounds |
| coin.mp3 | `Audio/handleCoins.ogg` | Kenney RPG Audio |
| buy.mp3 | `Audio/confirmation_002.ogg` | Kenney Interface Sounds |
| reroll.mp3 | `Audio/scroll_003.ogg` | Kenney Interface Sounds |
| error.mp3 | `Audio/error_004.ogg` | Kenney Interface Sounds |
| explosion.mp3 | `Audio/explosionCrunch_000.ogg` | Kenney Sci-Fi Sounds |
| derail_crash.mp3 | `Audio/lowFrequency_explosion_000.ogg` | Kenney Sci-Fi Sounds |
| arrive_bell.mp3 | `Audio/impactBell_heavy_001.ogg` | Kenney Impact Sounds |
| teleport.mp3 | `Audio/phaseJump3.ogg` | Kenney Digital Audio |
| tick.mp3 | `Audio/tick_002.ogg` | Kenney Interface Sounds |
| craft.mp3 | `Audio/metalClick.ogg` | Kenney RPG Audio |
| warn_beep.mp3 | `Audio/bong_001.ogg` | Kenney Interface Sounds |
| start.mp3 | `Audio/confirmation_004.ogg` | Kenney Interface Sounds |
| whistle.mp3 | `188240_44431-hq.mp3` (first 4 s, faded) | gadzooks, Freesound 188240 |

## music/

| File | Track | Source URL |
|---|---|---|
| meadows.mp3 | Happy Whistling Ukulele | `https://web.archive.org/web/20190403235644id_/https://freepd.com/music/Happy%20Whistling%20Ukulele.mp3` |
| forest.mp3 | Forest Frolic Loop | `https://web.archive.org/web/20190403150906id_/https://freepd.com/music/Forest%20Frolic%20Loop.mp3` |
| desert.mp3 | Desert Fox Underscore | `https://web.archive.org/web/20190403114718id_/https://freepd.com/music/Desert%20Fox%20Underscore.mp3` |

## Budget check

- 25 sfx files, largest `whistle.mp3` at 64 KB — all well under the 300 KB limit.
- 3 music loops, largest `desert.mp3` at 1.6 MB — all well under the 4 MB limit.
- Total `assets/audio` payload: ~5.3 MB.
