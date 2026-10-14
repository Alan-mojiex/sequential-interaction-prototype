# sequential-interaction-prototype
code base for project 2 in creative tec 1

Live site: https://alan-mojiex.github.io/sequential-interaction-prototype/

## SONARA · Build the track

One continuous, linear sequence prototype built from the six SONARA interaction studies. The user builds one original song, “Midnight Bloom” (116 BPM), one layer at a time:

**Play → Add beat → Add bass → Add percussion → Add strings → Add voice → full-track ending**

- **Start:** silent dark stage, still record, pulsing Play button (“Press play”).
- **Each step:** the next action unlocks only after the previous layer has landed, following the studies: 2.5 s countdown on the button, then “+ Add <layer>”. A click queues the layer onto the next beat with a riser, and it lands with a flash, a ripple and a particle burst in the layer's colour. The same song, record and visuals carry through every step.
- **Song too short?** While any layer is still missing, the song wraps back to bar 1 at the final downbeat instead of ending, keeping every layer already in.
- **Ending:** once all six layers are in, the song plays to its final chord, then an end card (“You built Midnight Bloom”) offers **Start over**, which returns to the silent start. **↺ Reset** (top right) does the same at any time.

### Where things are

| Path | What |
|---|---|
| `docs/` | The published static site (GitHub Pages source: `main` → `/docs`) |
| `docs/index.html` | Page markup, sequence config (`SONARA_CONFIG.actions`) and end card |
| `docs/css/sonara.css` | Styles from the studies, plus the end card |
| `docs/js/engine.js` | The studies' Web Audio engine; only change: wrap to bar 1 until every layer is in |
| `docs/js/sequence.js` | The studies' visuals and one-action-at-a-time flow; additions marked `Sequence:` |
| `docs/.nojekyll` | Tells GitHub Pages to serve the files as-is |
| `studies/` | The six original studies extracted from `sonara-studies.zip`, each with `STUDY.md` |

### Run locally

No build step or dependencies. Open `docs/index.html` in a browser, or serve it with `python3 -m http.server -d docs 8000`. The audio is synthesized live with the Web Audio API, so there are no audio files. Fonts load from Google Fonts and fall back to system fonts when offline.
