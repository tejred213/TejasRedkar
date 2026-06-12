# Tejas Redkar — Portfolio №21

Racing-broadcast design language meets machine learning. Carbon black, F1 red
(#E10600) and amber telemetry — with a real-time Three.js "data circuit" in the
hero: a glowing racing line lapped by a car light (it brakes for corners), an
amber telemetry trail, and a neural-network node cloud firing signals overhead.

## Structure

```
PortfolioBuilder/
├── index.html      # All content
├── css/style.css   # Racing design system & responsive styles
└── js/
    ├── main.js     # Scroll reveals, counters, nav, 3D card tilt
    └── scene.js    # Three.js hero scene (CDN import map, no build step)
```

No build step. Three.js loads from the jsdelivr CDN via an import map; if the
CDN or WebGL is unavailable the hero degrades to the flat carbon background.

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

**GitHub Pages** — push this folder to a repo named `tejred213.github.io`
(or any repo with Pages enabled, branch `main`, root folder). Done.

**Vercel / Netlify** — import the repo, no build command, output dir `/`.

## Dual identity: Street mode / Race mode

Two complete themes with a garage-shutter transition between them:

- **Race mode** — the carbon/red/amber night identity with the 3D hero.
- **Street mode** — a clean daylight aesthetic (warm paper, graph-paper grid,
  same red accent), 3D scene disabled.

First-time visitors get Street mode between 07:00–19:00 local time and Race
mode at night, but both sides are always one click away via the nav toggle.
A theme-matched hint (angular amber arrow + mono caps in Race mode, a
hand-drawn curve + serif italic in Street mode) hangs under the toggle and
points at it; it disappears forever after the visitor's first switch.

Transitions match the destination: entering Race mode rolls the corrugated
garage shutter down; entering Street mode wipes a clean paper panel across.
The choice persists in `localStorage` (`tr-theme`).

## Racing-line scroll spine

A fixed telemetry line down the left margin (viewports ≥1280px): scroll
progress draws the red→amber racing line, a car diamond rides it, sector
markers (S1–S5) light up as you pass each section and are clickable shortcuts.

## Performance & accessibility notes

- The 3D scene pauses when the hero scrolls off-screen or the tab is hidden.
- Mobile gets reduced particle/node counts automatically.
- `prefers-reduced-motion` users get a single static render and no animations.
- Card tilt is disabled on touch devices.

## Things you may want to edit

- **Experience dates** ([index.html](index.html), `#experience`) — roles came from
  public LinkedIn snippets; periods are generic ("CURRENT STINT" / "EARLIER").
  Replace with real date ranges.
- **Stats** (`.stats`) — repo and project counts are point-in-time.
- **Circuit shape** ([js/scene.js](js/scene.js), `trackPoints`) — control points of
  the racing line; tweak to resemble your favourite circuit.
