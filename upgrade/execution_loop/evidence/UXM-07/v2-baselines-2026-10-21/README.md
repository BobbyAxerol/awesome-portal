# V2 pixel baselines, 2026-10-21

Spec: `apps/portal/frontend/e2e/execution-v2-visual.spec.ts` (project `chromium-v2`, port-4176 build).
Recorder: `scripts/portal-web-visual-record-v2.sh` (pinned image `mcr.microsoft.com/playwright:v1.62.1-noble` through `scripts/portal-web-visual.sh`, `--workers=2`).
Snapshots: `apps/portal/frontend/e2e/execution-v2-visual.spec.ts-snapshots/v2-<screen>-<width>-chromium-v2-linux.png` (46 files).

Lane: FIXTURE_LAB over BFF_DOUBLE. These are pixel baselines of what the screens draw from the in-repo doubles; they say nothing about a real read.
Capture: `#portal-content` (sidebar excluded), operations theme, fixed page clock (`OPERATIONS_V2_DOUBLE_NOW_ISO`), seeded `Math.random`, polling >= 1 s off, CSS animation/transition/caret off, focus dropped, fonts loaded, canvases painted, viewport grown to the document height so a sticky bar is photographed once. Masked: `.exec-acct-ago` (relative age), `[data-volatile]`; neither appears in these fixture states, so nothing is masked in the recorded images. A 501, console error, failed response or foreign request fails the cell.
Outside the pinned image the cells skip (the host renders differently).

Stability: recorded once (46 passed), then compared twice in a row (46 passed, 46 passed). Same on the first recording, before the capture fix below. After the second pass (defects 3 to 5 below) the 9 changed cells were recorded again and the full set compared twice more: see the last section.

Contact sheets: one PNG per screen in this directory (widest first, scaled, cropped to 1500 px; the real images are the snapshot files).

## Review (every image looked at)

ok = no defect seen. "scroll clip" = text cut at the edge of a table that is its own `overflow-x: auto` scroller (cards.css); since the second pass the cut-off edge fades (`data-more`), so it reads as "goes on".

| Screen | Width | ok? | Notes |
|---|---|---|---|
| fleet | 1440 / 1024 / 390 | ok | 1024 stacks the KPI tiles 3+2; 390 turns rows into cards |
| overview | 1440 / 390 | ok | PARTIAL banner and "at least 1" / "3 of 214" are the fixture's honest-count copy |
| portfolios | 1440 / 390 | ok | "Top 6 / 9" + Load more |
| portfolio-360 | 1440 / 390 | ok | gap hatch on the equity chart is the fixture's published gap |
| alpha-360-overview | 1440 / 1024 / 390 | ok | 1024/390: tab strip scrolls ("RESEARCH EVIDE|" at 390 is the tab scroller) |
| alpha-360-orders | 1440 / 1024 / 390 | ok | 1024: Orders and Fills tables scroll; the right edge fades. Times were first masked magenta by an over-wide `time` mask; fixed, see below |
| alpha-360-deployments | 1440 / 1024 / 390 | ok | 1024: scroll; the right edge fades |
| account-360 | 1440 / 390 | ok | "STALE 14 MIN" is the fixture's age at the frozen clock; the "As of" lines were masked before the fix |
| compare | 1440 / 390 | ok | Canary + Pilot, the double's comparable pair (USDT, Simulated): chart, legend and both metric columns drawn. Core (mixed book) + Satellite drew "Pick two comparable portfolios" in the first recording |
| blotter | 1440 / 390 | ok | first page of 50 / 10 rows of 137 |
| workbench-paper | 1440 / 390 | ok | first shot had the sticky "alpha_btc_trend . Paper monitor" bar drawn over the middle of the equity chart (element shot scrolling); fixed |
| live | 1440 / 390 | ok, note | `TEST_ONLY:*` ids and 9,007,199,254,740,993.1235 are the fixture's published precision case. 1440: Orders/Fills/Positions tables scroll; the right edge fades. 390 is 5 618 px (was 13 117): five cards per table, Load more draws five more |
| canary | 1440 / 390 | ok | same fixture ids/precision values |
| sandbox | 1440 / 390 | ok | empty review-note textarea is the real control |
| admin-actions | 1440 / 390 | ok | UNAVAILABLE + "Fail closed" banner are the fixture's relay-off state |
| users | 1440 / 390 | ok | 123 rows in one page (3013 / 7673 px) |
| trade-replay | 1440 / 390 | ok | candles + marker overlay and the trade log drawn; chart is canvas, compared twice without drift |
| access | 1440 / 390 | ok | "Read 22 Aug 13:00Z" is fixture data; the signed-in user id under "bobby" is drawn (it was a magenta mask block) |
| cockpit | 1440 / 390 | ok | "Preview build. Decisions are shown here, not recorded." banner; 390 shows the detail panes as "Nothing selected" below the queue (1440 has R2 AP-352 selected) |
| operations | 1440 / 390 | ok | times were masked magenta by the over-wide mask; fixed |
| scoped-slice | 1440 / 390 | ok, note | 1440: Fleet table scrolls; the right edge fades. The "Financial data" cell prints the raw reason code `SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE`; this is deliberate and pinned by `slice.test.tsx` (the lab page shows the published code verbatim), so it is recorded as is, not changed |

## Defects found

1. Over-wide mask: the first recording masked every `<time>` (magenta blocks over order times, "As of", "Last source update", Operations TIME column), which hid real content. Fixed in the spec: absolute instants are deterministic under the fixed clock.
2. Sticky bar artefact (Workbench 1440): the element screenshot scrolled and stitched, so the sticky bar appeared over the chart. Fixed in the spec by growing the viewport to the document height before the shot. No product change.
3. Live at 390 was 13 117 px tall. Product change (`screens/live/parts.tsx`): at 660 px and narrower a retained-observation table is five cards and Load more first draws five more of the rows already loaded, then asks the server for its next page; the caption already read "Top 5 of 20 orders loaded". The table layout above 660 px is unchanged. A two-column card (as the Blotter) was tried and did not shorten a ten-field card, so it was not kept. Now 5 618 px.
4. Tables cut off at their own scroller's edge with nothing to show it (Alpha 360 Orders/Deployments at 1024, Live at 1440, scoped Fleet at 1440). Cell padding already equals the HiFi (7-8 px / 12 px), and Live's panels carry up to 14 source fields, so the columns do not fit; instead the scroller fades the cut-off edge (`useKeyboardScroll` sets `data-more` only while the wrap overflows; `cards.css` masks that edge; fades both sides once scrolled). The tables, their columns and their DOM are unchanged.
5. Compare drew "Pick two comparable portfolios": the recorded pair was Core (mixed book) + Satellite (no series). The double already holds a comparable pair, Canary + Pilot, so the cell now picks those; the double's list is not changed (the 6 / 9 list is pinned by many unit tests). Other "empty" cells were checked: Sandbox, Canary, Live, Portfolio 360, Overview, Operations and Admin print "Not available" lines and the relay-off state because the source or the fixture publishes nothing there, not because a route is missing (a missing route fails the cell). Access drew a magenta block over the signed-in user id because `.exec-acc-code` is also the user-id class; the mask is dropped (the id is a constant of the fixture session).

Not changed, noted: Users at 390 is 7 673 px (123 rows in one page), Alpha 360 Orders at 390 is 4 466 px.

## Second pass

Re-recorded with the recorder (grep): Live 1440/390, Compare 1440/390, Access 1440/390, Alpha 360 Orders & Fills 1024, Alpha 360 Deployments 1024, Scoped slice 1440 (9 images; the recorder compared each group twice). The other 37 snapshot files are byte-identical. The recorder now escapes `| ( ) &` in its grep so an alternation reaches Playwright intact.

Full set compared twice after the second pass: 46 passed, 46 passed.

## Third pass: New request and the interaction states (DEBT-UXM07-016)

Cells added to `execution-v2-visual.spec.ts` in `5b9e2d32`; images recorded with the recorder (`--workers=2`, grep over the new groups plus Scoped slice, whose cell the fix below touches), then **the whole spec** (every V2 cell, 61 files) compared twice in a row: 61 passed, 61 passed (before the merge of fe-parity `a512d55d`; see "Pending" below). A cell can now carry `act` (what the reader does to reach the state) and `shot: "viewport"` (a modal drawer is fixed to the window, so the window is photographed instead of a document grown to its height).

| Cell | Widths | How the state is reached |
|---|---|---|
| New request | 1440, 390 | `/governance/approvals/new` |
| New request drawer | 1600 (docked), 1440, 390 (overlay behind a scrim) | `/governance/approvals?compose=request`, viewport shot |
| NaWhy open | 1440, 390 | Users, click the first "Not published" button (aria-label "Not published, reason"); viewport shot |
| Pager page 2 | 1440, 390 | scoped slice `fixture=chain`, click Older: "Newer rows exist, older rows exist" |
| Operations dock | 1600 (docked), 1440, 390 | click the first row's target button, viewport shot |
| Incident drawer | 1600 (docked), 1440, 390 | `/execution/operations/incidents/inc_fixture_44`, viewport shot |

15 new images. Every one was looked at (all widths).

| Screen | Widths | ok? | Notes |
|---|---|---|---|
| new-request | 1440 / 390 | ok | form column is 880 px wide at 1440 (HIFI form width); at 390 the 1 / 2 / 3 stepper stacks to three rows |
| new-request-drawer | 1600 / 1440 / 390 | ok, note | docked at 1600 beside the queue; overlay at 1440 and 390. At 1440 the "?" help mark after "type its id below." wraps alone onto the next line (the shared GapWhy mark). Not changed: the fix is in a shared block and would move other baselines |
| na-why-open | 1440 / 390 | ok | the disclosure body ("Not published (FE-015, FE-026, FE-037, FE-038): It appears here once the source publishes it.") opens under its value and above the next label |
| scoped-slice-page-2 | 1440 / 390 | defect found, fixed | see below. "1 reads started" in the stream facts is the approved copy and the unit test pins it (slice.test.tsx); noted for Bobby, not changed |
| operations-dock | 1600 / 1440 / 390 | ok | Acknowledge and Resolve are `disabled` (computed grey) with their reason and "My access" beside them at every width |
| incident-drawer | 1600 / 1440 / 390 | ok | the four actions are `disabled` the same way at every width |

### Defect found and fixed

At 390 the scoped slice's Fleet cards pushed the label of the Financial data cell ("FINANCIAL DATA") 9 px past the card's left padding: the flag stretched to the width of the reason code under it (`AUTHORIZED_RETAINED_FACTS`, which cannot break), and a flex row with `justify-content: flex-end` overflows at its start. At 1440 the same flag was drawn as a bar as wide as the code. `slice.css`: `.exec-slice-avail` aligns its items to the start, and its reason code may wrap (`overflow-wrap: anywhere`). No copy changed. The pre-existing `v2-scoped-slice-1440` and `-390` images show the same cell, so they were re-recorded; the other baselines are byte-identical.

### Pending (not done)

After these images were recorded, fe-parity `a512d55d` was merged (Access words on the Access screen, Compare mounted at `/deployments/compare` with registry revision 9, the Portfolio 360 Actions rail words). `v2-access-1440/390`, the Compare cells (the spec already uses the new route) and any other cell the recorder shows as changed must be re-recorded, then the whole spec compared twice. That run waited more than 10 minutes for `/tmp/portal-heavy.lock` and was stopped (AGENT_WORKING_RULES 10.10b); nothing was recorded after the merge.
