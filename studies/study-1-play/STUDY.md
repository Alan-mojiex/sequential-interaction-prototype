# SONARA — Study 1 / 6 · Play

Source artifact: https://claude.ai/code/artifact/ea2dfc5a-2251-4333-87b0-8abcefdc2711  
File: `index.html` (single self-contained page, ~51 KB).

## What the study does

One fixed original song, **“Midnight Bloom”** (D minor, 116 BPM, 40 bars ≈ 1:22), synthesized live with the Web Audio API. This is the baseline study: the only action is **Play**. It starts the soft keys layer (arpeggio + electric-piano pad) with a filter “wake-up” sweep and lets it run to the end. No other layers can be added — the add-layer button never appears.

## Main visual and interactive components

| Component | What it is | Where |
|---|---|---|
| Stage canvas `#stage` | Full-screen 2D canvas: background halo whose colour follows the active layers, starfield, record grooves, layer visuals, ripples, particles, spinning platter | markup line 84; drawing in `frame()` lines 508–711 |
| Header | SONARA wordmark + tagline; study label (`#study`, from `SONARA_CONFIG.label`) | lines 85–88; label set line 776 |
| Reset `#reset` | Top-right “↺ Reset”; disposes the audio context and starts fresh | line 89; `reset()` line 770 |
| Song row | Disc icon, title, `#step-n` (“Step x of y”), BPM | lines 90–111 |
| Layer chips `#chips` | One pill per layer (Keys, Beat, Bass, Perc, Strings, Voice): off / queued (blinking) / on (filled) | built line 463; CSS lines 34–39; state set in `ui()` line 721 |
| Play button `#play` | Circular button; icon switches play / pause / play-again; pulses while idle | CSS lines 41–49; `onPlay()` line 758 |
| Action button `#act` | Present in markup but stays hidden in this study (`actions` is empty) | CSS lines 51–60; `ui()` line 739 |
| Hint `#hint` | Live-region status text (“Press play”, “Paused”, “That’s the track · play again”…) | `ui()` lines 737–753 |
| Progress lanes `#lanes` | Six thin lanes, each filling from the moment its layer entered; white playhead `#head`; a “… ready” marker shows when the next layer unlocks | built line 464; CSS lines 63–69; `ui()` lines 722–734 |

Layer visuals on the canvas (each reads its own `AnalyserNode` and score events):

- Keys (pale blue-white) — arpeggio notes light dots on a ring at radius 1.22×, angle set by pitch class; `frame()` lines 576–589.
- Platter — the record itself; label colour follows the room glow, rim brightens with the beat; lines 689–707.

## User actions, feedback, states and transitions

**Song states** (`#play[data-state]`): `idle` → `playing` ⇄ `paused` → `done`.

- **Play (idle)** → audio context created/resumed, keys layer turned on, a low-pass filter sweeps 280 Hz → 20 kHz over 3 beats (“wake”), record spins up. `onPlay()` 758, `Song.start()` 392.
- **Pause / resume** → `AudioContext.suspend()/resume()`; spin eases down/up; hint shows “Paused”. `Song.pause()/resume()` 433–434.
- **End of song** → final Dm chord on bar 41's downbeat, big white ripple, button shows play-again; pressing it resets and restarts. `playStep` 330–339, `tick()` 387, `onPlay()` 760.
- **Reset** → fades master out, closes the context, rebuilds a fresh `Song` at step 0. `reset()`/`boot()` 770–771.

## Where things live in `index.html`

| Lines | Block |
|---|---|
| 1–4 | Doctype, base reset styles, `<title>`, Google Fonts links |
| 5–83 | Page CSS: colour tokens, header, dock, chips, play/act buttons, lanes, responsive (≤560 px) and reduced-motion rules |
| 84–111 | Markup: canvas, header, reset, dock (song row, chips, play, act, hint, lanes) |
| 112 | **`window.SONARA_CONFIG`** — the only line (besides `<title>`) that differs between the six studies. Here: `{"label": "Study 1 / 6 · Play", "actions": []}` |
| 113–442 | **Audio engine** IIFE → `window.SonaraSong` |
|  · 115–147 | Tempo constants, song data `SEC` (A/B sections: chords, roots, melody), `FORM` A A B A B, vowel formants |
|  · 149–216 | `class Song`, `init()`: audio graph — per-layer gain → panner → mix; analysers per layer; reverb (generated impulse), tempo delay, glue compressor, limiter |
|  · 218–323 | Instruments: kick, snare, pluck, keyPad, bassNote, conga, tom, string section, violin, pizz, choirChord, leadNote |
|  · 325–376 | `playStep(n, t)` — the score, one 16th-note step at a time, per layer |
|  · 377–389 | `tick()` — lookahead scheduler (25 ms interval, 120 ms ahead), queued→on transitions, end detection |
|  · 391–439 | Public API: `start`, `queue`, `riser`, `progress`, `elapsed`, `pause`, `resume`, `dispose` |
| 444–781 | **UI + visuals** IIFE |
|  · 448–460 | Config merge (`cooldown` default 2.5 s), layer colours `COL`, labels, queued messages |
|  · 469–506 | Canvas sizing, analyser level helper, shape helpers, particle burst |
|  · 508–711 | `frame()` render loop: score events → visual hits, glow colour, per-layer drawing, ripples, platter |
|  · 713–755 | `ui()` — syncs play button, chips, lanes, step counter, action button and hint every frame |
|  · 756–779 | `advance`, `onPlay`, `onAct`, `reset`, `boot`, event listeners; `window.__sonara()` returns the live `Song` for debugging |

## External dependencies and assets

- **No build step, no npm packages, no audio or image files.** Every sound is synthesized at runtime (oscillators, filtered noise, generated reverb impulse); every visual is drawn on a `<canvas>`.
- **Google Fonts** (Unbounded, Manrope, JetBrains Mono) loaded from `fonts.googleapis.com`. Offline, the page still works and falls back to system fonts.
- A modern browser with Web Audio (`AudioContext`, `StereoPannerNode`, `ConvolverNode`). Audio starts only after a click (browser autoplay rules).
- Run: open `index.html` directly, or serve the folder (`npx serve .` / `python3 -m http.server`).

## Notes for connecting the studies

- All six studies share the identical engine and UI; behaviour is driven entirely by `SONARA_CONFIG.actions` (ordered list of layers the user adds; any of `beat`, `bass`, `perc`, `strings`, `voice`) plus optional `label` and `cooldown`.
- The header comment at line 447 mentions a `pre` option, but the code ignores it — Play always starts only `keys` (`startLayers`, line 460).
- `window.SonaraSong` exposes `Song` and timing constants, so the engine could be extracted into a shared module for a connected prototype.
