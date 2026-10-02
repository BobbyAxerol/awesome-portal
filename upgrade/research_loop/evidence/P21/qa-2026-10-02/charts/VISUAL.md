# Research Loop V1.1 visual baseline spec (S00-S14) — notes, 2026-10-02

Base `267b8934`. Spec: `apps/portal/frontend/e2e/research-loop.visual.spec.ts` (compare-only, no PNG committed).

## Feed
Everything goes through `installLane()` of `e2e/research-qualification/stubs.ts` (P23 lane): `e2e/research-foundation/*.json`, canonical contract fixtures re-keyed with fs (`contractFixture`), typed builders. Two additions inside the spec, both copied, not invented:
- S02: `research-dataset-catalog.v2.healthy.valid.json` served at `/api/v1/research/datasets/catalog-v2` (the lane only stubs v1), then the wizard step `data` is opened.
- S04 WFO: the W3 recorded retained-source bodies (`src/research/w3RealWfo.fixture.json`, `w3bRealWfo.fixture.json`, read with fs), same routes as `_probe-research-w3-wfo.spec.ts`. These live under `src/`, not `packages/contracts` — the only non-contract source.
The 501 catch-all of `stubPortalApi` is a hard failure in every cell (an unstubbed route can never be photographed).

## Determinism
Clock install + `setFixedTime(2026-08-17T12:00Z)`, seeded `Math.random`, `setInterval >= 1000ms` neutralised, reduced-motion + webdriver smoke gate, CSS animation/transition/caret/outline off, fonts `loaded`, canvases sized + 2 rAF, all scroll offsets 0, focus blurred, UTC/en-US, Research Light (`usePreferences`). `fullPage:false`, clip = viewport (1440x900, 390x844).

## Cells (14 screens x 2 viewports = 28 images)
Screen numbers follow the screen NAME as the task listed them; the repo numbers differ for four screens (shown in labels).

| Cell | Route | Status |
|---|---|---|
| S00 journey map | /research/quantbt/journey | covered |
| S01 run library | /research/quantbt/runs | covered |
| S02 new run, data declaration | /research/quantbt/runs/new, step `data` | covered |
| S03 search (repo 06) | .../R-WFO-118/search | covered |
| S04 evidence hub, retained WFO | .../evidence (W3 bodies) | covered |
| S04 evidence hub, fixed P04 | .../evidence (lane default, retained refused) | covered |
| S05 freeze/claim (repo 07) | .../freeze | covered |
| S06 split (repo 05) | .../split | covered |
| S07/S08 execute replay (repo 08) | .../execute#...seq=5 | covered (one screen, one cell) |
| S09 report | .../report | covered |
| S10 lineage | /alphas/alpha-momentum-btc/lineage | covered |
| S11 release candidate | /runs/run_rc_0917/release-candidate | covered |
| S13 compare | /alphas/alpha-momentum-btc/compare | covered |
| S14 alpha import | /research/quantbt/alpha-import | covered |

Skipped: none. Not in the request, therefore not included: repo screen 03 run progress, S12 atlas (both stubbed by the lane; add as two cells if wanted).

## Host proof (no snapshots, no docker/sudo)
`vite build` + two `vite preview` (4174/4175) on the host, then with `RESEARCH_LOOP_VISUAL=1 PORTAL_VISUAL_PINNED_IMAGE=host-proof-only npx playwright test e2e/research-loop.visual.spec.ts --project=chromium`: 28 ran, 28 failed with exactly `A snapshot doesn't exist at .../research-loop.visual.spec.ts-snapshots/rl-...-chromium-linux.png` — every cell reached the screenshot, zero 501 gaps (the first run caught S02's missing `catalog-v2`, fixed). Without `PORTAL_VISUAL_PINNED_IMAGE` the file throws the visualHost guard. A temporary copy that wrote PNGs to scratch produced 28 images (3.3 MB total) and, run twice on the same host, 23 were byte-identical and 5 differed by 5-56 pixels (<=0.004%, antialiasing; tolerance is 0.2% = ~2600 px). Temp copy deleted. Host PNGs are NOT baselines.

## Wiring (so the default gate does not go red)
`playwright.config.ts` ignores the file unless `RESEARCH_LOOP_VISUAL` is set, and `scripts/portal-web-visual.sh` forwards that variable into the container. Once baselines are committed, drop the ignore.

## Record only these baselines inside the pinned image
```
RESEARCH_LOOP_VISUAL=1 ./scripts/portal-web-visual.sh --update e2e/research-loop.visual.spec.ts --project=chromium
```
`--update` runs `e2e:update` (`--update-snapshots=all`) but only for the named file, so it writes only `e2e/research-loop.visual.spec.ts-snapshots/` and never touches existing snapshots. Verify afterwards with the same command without `--update`.

## Environment caveat
The worktree had no `node_modules`; the host proof used a symlinked/copied hybrid (main checkout + `lightweight-charts`, `fancy-canvas`, `uplot` from `/tmp/portal-product-active-frontend-node_modules`) because the main checkout's install is stale. `npx tsc -b --noEmit` exit 0 and `vitest run src/styles` 13/13 were run on that tree.
