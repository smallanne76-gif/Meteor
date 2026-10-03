# LEAVE THE LIGHT ON

*A first-person psychological horror game about a missed phone call.*

You drive to your dead father's lake house on the night your brother went missing, to find him. The thing hunting you through the dark
is looking for him too. You think you are trying to survive. You are trying to say goodbye.

> **Play with headphones, in the dark, alone.** The game is slow on purpose. There is no jump-scare spam, no boss, and almost no HUD.

## Run it

```bash
cd game
npm install                  # three.js, esbuild, playwright-core (QA only) and the OFL fonts
npm run serve                # http://localhost:8080  (any static file server works)
# or a production bundle:
npm run build                # → dist/  (code-split ES modules + assets, ~30 MB)
python3 -m http.server 8080 --directory dist
```

Needs a desktop browser with **WebGL 2** and a mouse (pointer lock). Chrome / Edge / Firefox are fine.
Pick a quality preset under *Settings → Graphics*: `LOW · MEDIUM · HIGH · ULTRA · CINEMATIC`. `HIGH` is the default; `LOW` runs on integrated GPUs.

## Controls

| Action | Key |
|---|---|
| Move / look | `W A S D` / mouse |
| Interact · use · read | `E` or click (some things are *hold*) |
| Flashlight | `F` |
| Run · crouch | `Shift` · `C` |
| **Be still** — hold your breath / close your eyes where it matters | `Space` |
| Raise the field recorder (summer) | `Q` |
| Journal (notes, photographs, tapes) | `Tab` |
| Pause · settings | `Esc` |

Accessibility (Settings): subtitle on/off, size, background and speaker names; brightness/gamma; mouse sensitivity, invert-Y, crouch toggle, *be still* (hold-breath / eyes-closed) as a toggle instead of a held key;
FOV; motion blur, camera shake and head-bob toggles; *reduce flashing* (replaces strobing lights and white flashes with slow dips — the Ice House blackout
is the main one); a switch for the synthesised voice murmur (captions only); separate volume sliders (master, music, effects, ambience, voices).
Settings switches are keyboard-operable (Tab to focus, Space/Enter to flip). Quality presets can be changed live, including from the pause menu.

## The game

Seven chapters. Designed for roughly one and a half to two and a half hours at a slow, curious pace (an estimate — it has not been timed with a human player):

| | Chapter | Place | What you do |
|---|---|---|---|
| I | **Halden Lodge** | the lakeside house, kept exactly as it was | find the keys (cookie jar · piano owls · Dad's tin), live through a memory in the kitchen, hide from the Searcher in a wardrobe, answer the phone |
| II | **The Search** | forest trail, lamp posts, the search camp, the boathouse | light the lamps (it will not cross the light), read the sign-in sheet, play the tape of your own voice |
| III | **The Ice House** | Dad's listening room, ice cellar and brick tunnels | splice Jo's voicemail from four reels (one is a decoy), crack the cold-room dial, then run |
| IV | **The Loop** | the lodge on the night of the birthday; a corridor with too many doors | close your eyes and follow the hum — "warmer" is the only map; the recording booth |
| V | **Summer** | the same lake, six summers ago | paddle a canoe, record the loon, the frogs and your brother; where "no rush" comes from |
| VI | **Thin Ice** | the frozen lake under aurora | listen: low tones are thick ice, high tones are thin; the island in the north bay |
| VII | **Goodbye** | the same lake at dawn, thawing | talk to Jo; hold his hand and let go when you are ready; walk home; turn the porch light off; find the eighth note |

There is no combat. The Searcher hunts by light, footsteps and sight; it will not enter lit places. When it catches you, you wake by the fire (or at the last lamp) — and it is never a game over.
Everything that matters is in the objects: read the notes, turn the photographs over, listen to the tapes.

## How it is built (honest version)

* **Engine:** hand-built on **three.js r170 / WebGL 2** (not Unreal or Unity — nothing here can run a UE5 project in a browser, and this build had to be playable and testable in a headless sandbox).
  A custom HDR pipeline replaces the stock renderer path: MSAA half-float scene target, depth-only SSAO, dual-filter bloom, one final composite pass
  (ACES, per-scene colour grades, DOF, camera-rotation motion blur, chromatic aberration, vignette, film grain, eyelids/memory/cold/dread overlays),
  height-fog with directional scattering patched into the stock fog chunks, a fixed light pool (no shader recompiles when lights change),
  a streamed terrain with instanced 3-LOD pines (and, in summer, a swaying grass-and-wildflower meadow, `src/world/meadow.js`), planar mirror (the Searcher in the bathroom mirror), and procedural fire/steam/snow/pollen/breath particles.
* **Art:** every texture (snow, bark, plaster, brick, wool, wood, tile, ice, water…) is **baked procedurally with numpy** (`tools/gen_textures.py`, PBR albedo + normal + ORM) and every model is generated in code
  (lofted skinned characters with a sculpted, morph-target face and strand hair; articulated first-person hands; the lodge, boathouse, ice house, canoe, piano, fireplace…). No scanned or downloaded assets were used.
* **Audio:** *all* sound is synthesised live in WebAudio — footsteps by surface, wind, ice song, doors, a formant-synth voice for hums, calls and murmured dialogue, a convolution reverb generated per space,
  HRTF-positioned sources with occlusion, and a small procedural score built around one seven-note motif that is finished only in the last minutes of the game.
  Characters do **not** have recorded voice acting; dialogue is subtitled, with a soft synthetic murmur underneath (can be turned off).
* **Structure:** `src/core` (engine, player, input, interaction, save), `src/gfx` (renderer, sky, lights, materials, particles), `src/world` (terrain, lodge, props, lake…),
  `src/chars` (humanoid, face, hands, the Searcher), `src/audio`, `src/levels` (chapters), `src/story` (what happens in them), `src/ui`, `src/flow.js` (title → chapters → credits).
* **Saves:** one auto-save slot (localStorage) written at checkpoints; *Continue* resumes at the last one.

## Testing

`tools/qa/multi.mjs` drives headless Chromium (software GL) through scripted steps using the `?test=` entry points and `game.advance(seconds)` to fast-forward, and saves screenshots:

```bash
TEST=halden EXTRA='&phase=lodge&skipintro' node tools/qa/multi.mjs shots '[{"name":"hall","script":"game.player.teleport(0,0,3.5,0)","frames":8}]'
```

The full chain title → prologue → lodge → search → ice house → loop → summer → lake → final → credits → title has been run end-to-end this way (puzzles skipped by direct calls).
**What has *not* been verified:** frame rate on real GPUs (the sandbox only has a software rasteriser) and how the synthesised audio *sounds* to a human ear — both are best checked by playing it.

## Known limitations

* **Not photoreal.** The look aims for atmosphere — dense fog, real shadows, HDR grading, PBR materials — but everything is procedural, so characters (especially faces and the Searcher's silhouette) and organic surfaces read as stylised, not photographic.
* **No recorded voices or music.** Speech is captioned and carried by a synthesised murmur; the score is generated. It is coherent, but it is not a substitute for actors and a composer.
* **Never played by a person.** Every chapter has been driven by scripts (including real interaction presses, the Search lamp/dash/boathouse/hatch chain, the preset switch from the pause menu, the accessibility toggles and a clean-clone boot), but pacing, puzzle difficulty and the emotional beats need a human playthrough. Timings quoted above are estimates.
* **Performance is unmeasured on real hardware.** Triangle/draw-call counts were profiled (shadow maps refresh every other frame below ULTRA; the lodge is ~0.4 M triangles in view), but frame rates need a real GPU.
* **Desktop only:** keyboard + mouse with pointer lock; no gamepad or touch.

## Credits & licences

See [`ASSETS.md`](ASSETS.md). Everything is original or procedurally generated; the only third-party code is three.js (MIT) and the fonts (SIL OFL 1.1).
