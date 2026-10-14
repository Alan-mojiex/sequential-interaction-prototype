# SONARA Studies 1–6

Six interaction studies for **SONARA**, a music-layering prototype: one original song (“Midnight Bloom”, 116 BPM) that the user builds up one layer at a time. Exported from Claude artifacts on 2026-10-14 with source unchanged.

| # | Folder | Final action | `SONARA_CONFIG.actions` |
|---|---|---|---|
| 1 | [`study-1-play/`](study-1-play/) | Play | `[]` |
| 2 | [`study-2-beat/`](study-2-beat/) | Add beat | `["beat"]` |
| 3 | [`study-3-bass/`](study-3-bass/) | Add bass | `["beat", "bass"]` |
| 4 | [`study-4-percussion/`](study-4-percussion/) | Add percussion | `["beat", "bass", "perc"]` |
| 5 | [`study-5-strings/`](study-5-strings/) | Add strings | `["beat", "bass", "perc", "strings"]` |
| 6 | [`study-6-voice/`](study-6-voice/) | Add voice | `["beat", "bass", "perc", "strings", "voice"]` |

Each folder holds a self-contained `index.html` and a `STUDY.md` describing behaviour, states and code locations.

## Run

No install or build. Either open any `index.html` in a browser, or serve the repo root:

```sh
npx serve .            # or
python3 -m http.server 8000
```

Click Play to start audio (browsers block autoplay). Requires a browser with the Web Audio API; Google Fonts load from the web and fall back to system fonts offline.

## Structure

The six `index.html` files are byte-identical except for the `<title>` and one config line (line 112):

```html
<script>window.SONARA_CONFIG = {"label": "...", "actions": [...]};</script>
```

`actions` is the ordered list of layers the user adds after Play (`beat`, `bass`, `perc`, `strings`, `voice`); an optional `cooldown` (seconds, default 2.5) sets the wait between actions. This makes the studies a natural sequence for a connected prototype: the engine (`window.SonaraSong`) and UI can be shared, with each step defined by its config.
