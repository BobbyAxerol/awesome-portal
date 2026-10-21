# V2 pixel baselines, 2026-10-21

Spec: `apps/portal/frontend/e2e/execution-v2-visual.spec.ts` (project `chromium-v2`, port-4176 build).
Recorder: `scripts/portal-web-visual-record-v2.sh` (pinned image `mcr.microsoft.com/playwright:v1.62.1-noble` through `scripts/portal-web-visual.sh`, `--workers=2`).
Snapshots: `apps/portal/frontend/e2e/execution-v2-visual.spec.ts-snapshots/v2-<screen>-<width>-chromium-v2-linux.png` (46 files).

Lane: FIXTURE_LAB over BFF_DOUBLE. These are pixel baselines of what the screens draw from the in-repo doubles; they say nothing about a real read.
Capture: `#portal-content` (sidebar excluded), operations theme, fixed page clock (`OPERATIONS_V2_DOUBLE_NOW_ISO`), seeded `Math.random`, polling >= 1 s off, CSS animation/transition/caret off, focus dropped, fonts loaded, canvases painted, viewport grown to the document height so a sticky bar is photographed once. Masked: `.exec-acct-ago` (relative age), `.exec-acc-code` (request id), `[data-volatile]`; none of them appear in these fixture states, so nothing is masked in the recorded images. A 501, console error, failed response or foreign request fails the cell.
Outside the pinned image the cells skip (the host renders differently).

Stability: recorded once (46 passed), then compared twice in a row (46 passed, 46 passed). Same on the first recording, before the capture fix below.

Contact sheets: one PNG per screen in this directory (widest first, scaled, cropped to 1500 px; the real images are the snapshot files).

## Review (every image looked at)

ok = no defect seen. "scroll clip" = text cut at the edge of a table that is its own `overflow-x: auto` scroller (cards.css), which is how the product behaves at that width; not a defect.

| Screen | Width | ok? | Notes |
|---|---|---|---|
| fleet | 1440 / 1024 / 390 | ok | 1024 stacks the KPI tiles 3+2; 390 turns rows into cards |
| overview | 1440 / 390 | ok | PARTIAL banner and "at least 1" / "3 of 214" are the fixture's honest-count copy |
| portfolios | 1440 / 390 | ok | "Top 6 / 9" + Load more |
| portfolio-360 | 1440 / 390 | ok | gap hatch on the equity chart is the fixture's published gap |
| alpha-360-overview | 1440 / 1024 / 390 | ok | 1024/390: tab strip scrolls ("RESEARCH EVIDE|" at 390 is the tab scroller) |
| alpha-360-orders | 1440 / 1024 / 390 | ok | 1024: Fills table scroll clip at LIQUIDITY. Times were first masked magenta by an over-wide `time` mask; fixed, see below |
| alpha-360-deployments | 1440 / 1024 / 390 | ok | 1024: scroll clip at the last column |
| account-360 | 1440 / 390 | ok | "STALE 14 MIN" is the fixture's age at the frozen clock; the "As of" lines were masked before the fix |
| compare | 1440 / 390 | ok, note | Core + Satellite are not comparable in the fixture (mixed books; Satellite has no series), so the chart area is the honest "Pick two comparable portfolios" state. No comparable pair exists in the double |
| blotter | 1440 / 390 | ok | first page of 50 / 10 rows of 137 |
| workbench-paper | 1440 / 390 | ok | first shot had the sticky "alpha_btc_trend . Paper monitor" bar drawn over the middle of the equity chart (element shot scrolling); fixed |
| live | 1440 / 390 | ok, note | `TEST_ONLY:*` ids and 9,007,199,254,740,993.1235 are the fixture's published precision case. 1440: Orders/Fills/Positions tables scroll clip at VENUE/EXIT PRICE. 390 is 13 117 px tall (20 orders + 20 fills as cards), 668 KB |
| canary | 1440 / 390 | ok | same fixture ids/precision values |
| sandbox | 1440 / 390 | ok | empty review-note textarea is the real control |
| admin-actions | 1440 / 390 | ok | UNAVAILABLE + "Fail closed" banner are the fixture's relay-off state |
| users | 1440 / 390 | ok | 123 rows in one page (3013 / 7673 px) |
| trade-replay | 1440 / 390 | ok | candles + marker overlay and the trade log drawn; chart is canvas, compared twice without drift |
| access | 1440 / 390 | ok | "Read 22 Aug 13:00Z" is fixture data |
| cockpit | 1440 / 390 | ok | "Preview build. Decisions are shown here, not recorded." banner; 390 shows the detail panes as "Nothing selected" below the queue (1440 has R2 AP-352 selected) |
| operations | 1440 / 390 | ok | times were masked magenta by the over-wide mask; fixed |
| scoped-slice | 1440 / 390 | ok, note | 1440: Fleet table scroll clip at INSTANCES. The "Financial data" cell prints the raw reason code `SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE`; this is deliberate and pinned by `slice.test.tsx` (the lab page shows the published code verbatim), so it is recorded as is, not changed |

## Defects found

1. Over-wide mask: the first recording masked every `<time>` (magenta blocks over order times, "As of", "Last source update", Operations TIME column), which hid real content. Fixed in the spec: only `.exec-acct-ago`, `.exec-acc-code`, `[data-volatile]` are masked. Absolute instants are deterministic under the fixed clock.
2. Sticky bar artefact (Workbench 1440): the element screenshot scrolled and stitched, so the sticky bar appeared over the chart. Fixed in the spec by growing the viewport to the document height before the shot. No product change.

No product code was changed. Existing snapshot files were not touched.
