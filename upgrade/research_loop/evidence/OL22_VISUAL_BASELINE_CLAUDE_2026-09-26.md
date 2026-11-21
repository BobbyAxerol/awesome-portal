# OL-22 — the 33 visual cells were a runner mistake, not a baseline drift (Claude, 2026-09-26)

Unified §13.4.1 OL-22 · P23 debt `S06-VISUAL-BASELINE-HOST-DRIFT` · owner question `B-P23-06`.

## What was believed

P23 reported "33 ô visual baseline lệch trên host contributor": chromium 28/248 and
chromium-preview 5/100 failing `toHaveScreenshot` against the owner's immutable baselines
(last regenerated `6fbe5a7c`, 2026-09-17), ratios 0.01–0.05, deterministic across reruns,
including suites that branch never touched. The register filed it as **cause not diagnosed**,
owner to decide, because "contributors never regenerate visual baselines".

## What it actually is

`scripts/portal-web-visual.sh` runs the suite inside a pinned image and says why in its own
comment:

> Rendering is font- and GPU-sensitive, so the pinned image is part of the contract: a baseline
> recorded in a different image is not comparable.

The image is `mcr.microsoft.com/playwright:v1.62.1-noble`, and CI's "Portal web visual baseline"
job runs only that script. A bare `npx playwright test` on any developer or contributor host
compares the image's PNGs against that host's own font rasteriser, so the cells differ.

Measured on this host, same tree (`1dec9d33`), same config:

| How it was run | Result |
|---|---|
| `npx playwright test -c playwright.config.ts --project=chromium` (bare host) | **28 failed**, 220 passed — all `toHaveScreenshot`, ratios 0.01–0.05 |
| `./scripts/portal-web-visual.sh` (pinned image) | **332 passed · 16 skipped · 0 failed** |

The 28 are the same shape as P23's 28: `execution-fixtures` ×21 and `visual.spec` ×7, including
`planning-reports` and legacy `research` screens that no Research commit touches. So the
baselines are correct, the tree is correct, and there is nothing for the owner to decide:
**B-P23-06 is answered by evidence, not by a decision.**

## Why it happened twice, and the guard

Nothing stopped a bare run from producing a misleading diff. `apps/portal/frontend/e2e/visualHost.ts`
now refuses it: the three screenshot specs call `assertPinnedVisualHost()`, which throws unless
`PORTAL_VISUAL_PINNED_IMAGE` is set, and `portal-web-visual.sh` passes that variable into the
container. Bare run:

```
Error: Visual baseline specs must run inside the pinned Playwright image.
Run: ./scripts/portal-web-visual.sh   (from the repository root)
```

The guard relaxes no comparison and regenerates nothing — `updateSnapshots: "none"` still stands,
and baselines remain the owner's to regenerate. Verified after the guard landed: the pinned run is
still 332 passed · 16 skipped · 0 failed.

## Logs (not committed)

`pinned.log` (before the guard) · `pinned2.log` (after) · `head-off.log` (bare host, 28 failed),
in this session's scratchpad `ol22/`.
