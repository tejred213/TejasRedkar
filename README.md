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
- **Stats** (`.stats`) — the public-repo and live-project counts are kept current
  by the project sync (below); the ML/DL count is point-in-time.
- **Circuit shape** ([js/scene.js](js/scene.js), `trackPoints`) — control points of
  the racing line; tweak to resemble your favourite circuit.

## Auto-adding new projects

[.github/workflows/sync-projects.yml](.github/workflows/sync-projects.yml) runs
daily (and on demand from the Actions tab). It looks for your GitHub repos tagged
with the **`portfolio`** topic that the page doesn't link to yet, adds a card for
each to the end of the projects grid, refreshes the public-repo and live-project
counts, and opens a PR. Vercel builds a preview for the PR; merging publishes.

- **Add a project:** give the repo the `portfolio` topic (repo page → ⚙ next to
  *About*). Set the repo's *Website* field too if it's deployed: that becomes the
  card's live link and `● LIVE` badge.
- **Card copy:** with an `ANTHROPIC_API_KEY` repo secret, Claude writes the title,
  description and tags from the README in the voice of the existing cards.
  Without it, the card uses the repo description (or README intro), topics and
  language. Either way, edit the PR branch if the copy needs a tweak.
- **Existing cards are never touched.** Hand-written cards stay as they are; the
  sync only inserts above the `sync-projects` marker in [index.html](index.html).
  Reorder or promote a card to `featured` by hand.
- **Keep a repo off the site:** remove its topic and close the PR. Only one sync PR
  is open at a time; later runs wait until it's merged or closed.
- Repos with no description and an empty README are skipped and listed in the PR.

Run it locally (no files are written with `--dry-run`):

```bash
cd scripts && npm install
GITHUB_TOKEN=$(gh auth token) node sync-projects.mjs --dry-run
```
