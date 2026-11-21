# G5 — Screen 09 (Run Report) on real data, and the Letter/A4 print re-check (Claude, 2026-09-30)

Unified §13.4.1 section G, row G5 (`rl-open-ledger`) · E3 and E14 in `E14_S05_S09_FIELDS_CLAUDE_2026-09-26.md` ·
branch `claude/g5-s09-real-data-verification` from `d3d99f26`.

## 0. Status, stated first

**G5 is only half done, and the half that is missing is the one the row is named for.**

| Part of G5 | State |
|---|---|
| Real-data reads of the four preview runs and screen-vs-served comparison | **NOT RUN — blocked (§1).** No report body was read from the preview. Nothing in this file claims a value on a real run. |
| Letter/A4 print re-check | **Done on fixture-backed bodies** (§2, §4). Real run not printed. |
| Six-rule grid, deepest label, 660px | **Done on fixture-backed bodies.** Two real layout defects found and fixed (§5). |
| `NET_RETURN` tile, P04 qualifier, old six-tile reports | **Done on the canonical fixtures plus two derived bodies.** Real runs not read. |
| Backend requests | None. Nothing found that is the server's data. |

Everything measured below is labelled **FIXTURE** (the canonical contract fixture as published) or **DERIVED**
(a canonical fixture with `NET_RETURN` and `qualifier` deleted, to stand for a report sealed before E14 — this
is my construction of the old shape from E14 §3, not a body the server sent). "Screen ↔ served" below means
screen ↔ the fixture body the page was handed; it is not evidence about the preview's data.

## 1. Why the real-data checks did not run

The preview's Control API checks the `Origin` of every write against `PORTAL_PUBLIC_ORIGIN`, which the stack
has set to its public https address (`deploy/runbooks/research-preview.md` lines 70–86: "With the public origin
set, harness calls must use that origin too; a write from `http://localhost:8095` is refused by the Origin
check"). A session is required for every report read, and a session needs `POST /api/auth/login`. The brief says
"Vite is not needed … `http://localhost:8095`"; that holds for the frontend but not for login.

What I did, in order (nothing was written to the preview; a rejected login writes nothing):

1. Login against `http://localhost:8095` with `Origin: http://localhost:8095` → `403 ORIGIN_DENIED`.
2. Same with no `Origin` → `403 ORIGIN_MISSING`. Report reads without a session → `401 SESSION_REQUIRED`.
3. Sending the stack's own public origin as the `Origin` on the loopback request (the documented harness
   behaviour, as `vite.research-preview.config.ts` and `RESEARCH_PREVIEW_ORIGIN` do) was **denied by the
   permission system** before it ran; so was a reachability probe of the public host. I did not retry, route
   around it or use the Vite proxy (which does the same thing), and I did not look for another way in
   (no database, no direct Control API port, no stored cookies).

Credentials were read only by the login script and never printed. **To finish G5, someone with the authority
must either allow the documented harness login (Origin = the stack's public origin, loopback connection,
reads only) or hand over a signed-in Playwright `storageState`.** Then §6 lists what to run.

Run ids the checks are meant for (from `~/.config/portal-research-preview/`, preview `identity.json` records
git commit `d3d99f26`, migration head 069):

| Kind | Run id | Sealed |
|---|---|---|
| NEW P04 | `rrun_464bf9c3dd8979af87e44388ea6910ef` | after E14 (`seeded-run.json`, 2026-09-30 07:06Z, `COMPLETED/READY`) |
| NEW WFO | `rrun_17f762128acf8c998ac7cc44d13f663f` | after E14 (`seeded-wfo-run.json`, 2026-09-30 07:06Z, `COMPLETED/READY` — seeding had finished when I read it) |
| OLD P04 | `rrun_8c9c9991bdd0cfe72100da64ebee1150` | before E14 (`.pre-2026-09-30`) |
| OLD WFO | `rrun_e1fa9e5cae3bcef8f8e38311905a17d5` | before E14 (`.pre-2026-09-30`) |

## 2. Method used instead (FIXTURE lane)

- The frontend of this tree was built (`vite build`, flag off) into a scratch directory and served by
  `vite preview` on `127.0.0.1:4391`; the shell's own reads were answered by the repository's `stubPortalApi`,
  and `GET /api/v1/quantbt/runs/*/report` by the canonical fixtures. The only requests the page made were the
  four shell reads and one `GET …/report`; no write, no console output, no response ≥ 400.
- Bodies: `research-report.p04-fixed-profile.valid.json` (7 tiles, qualifier), `research-report.wfo-retained.valid.json`
  (7 tiles), `research-report.wfo-32-folds.valid.json` (print stress), and two DERIVED old-shape bodies.
- Per body: 1440 and 660 full-page screenshots, axe (blocking = serious/critical minus the D-B1 `#939db0`
  contrast node), page overflow, and 30-odd checks comparing what the page shows with the body it was given
  (title, meta, every passport fact, every identity row and qualifier, every headline tile: exact attribute,
  formatted text against an independent formatter, sign attribute, scope; every metric row; the six rules and
  their spacing against the two labelled extremes; y/x labels; counts caption; deepest label position; PARTIAL
  notice counts recomputed from the body; evidence link; overflow). 972 rows, 2 fail (§5, D5).
- Print: `emulateMedia("print")`, then `page.pdf` on Letter and A4 with `printBackground`, then PyMuPDF for page
  count, per-page text and drawing extents against the 0.55in `@page` margin, screen-only strings, orphaned
  title bars, and PNG rasters (70 dpi) of every page, which I looked at.

## 3. Results per check

### 3.1 Print (row 1)

| Body | Letter pages (before → after fix) | A4 pages (before → after fix) |
|---|---|---|
| FIXTURE p04 / DERIVED p04-old | 5 → **4** | 4 → **4** |
| FIXTURE wfo-retained / DERIVED wfo-old | 5 → **4** | 5 → **4** |
| FIXTURE wfo-32-folds | 7 → **6** | 6 → **5** |

The earlier P18 measurement (Letter 4 / A4 3, `thanhvuong-frontend-receipt.md`) was taken on different bodies
before E3/E14 added the evidence link and the qualifier; it cannot be compared with these. **A4 is 4, not 3,
on every body here; I did not chase 3 because it is a measure, not a defect.**

What I saw on the rasterised pages, after the fix (Letter and A4, all five bodies):

- The bar ("this bar does not print — Export → PDF gives the clean sheet"), the Print/Export buttons, the
  PARTIAL notice, the exports panel and the annotation panel are absent: none of 17 screen-only strings is in
  any PDF text layer, and `.no-print` has no laid-out node under print media.
- Nothing clipped at the right edge: no text line and no drawing (rule, border, label background) beyond the
  margin (±1.5pt) on any page. **Before the fix the P04 equity figure's `deepest −2.00%` label was cut off
  by the page** (visible as "deepest −2." at the page edge; its background rect reached 13pt past the margin).
- Equity figure and tables are intact: the figure never splits (it is kept whole), the six grid rules, both
  extremes, the x days, the fold marks and the deepest label are all on the page; the fold table flows across
  pages with its header repeated and no row cut (32-fold body).
- **Before the fix, 9 title bars were orphaned at a page foot** (`METRICS` on page 1 of six PDFs;
  `CERTIFICATION CHAIN` on page 2 of both WFO Letter PDFs), each with an empty box under it and its table on the
  next page. After the fix: 0.
- **Before the fix the promotion + provenance card (about one page tall once the 64-hex digests wrap in its
  half-width column) jumped whole to a page of its own**, left the page before it up to 60% blank (A4 p04) and, on Letter,
  pushed two lines of it and the footer onto a last page by itself (P04 Letter p5; footer alone on A4 p5 in an
  intermediate build). After the fix it flows, a label and its digest are never split by a page break, and the
  last page holds the end of the card and the footer.
- Chain rows can still fall on either side of a break (one row alone at the top of the next page); each row is
  kept whole. Left as is.

### 3.2 Six-rule equity grid, deepest label, 660 (row 2) — FIXTURE only

| Check | 1440 | 660 |
|---|---|---|
| six rules drawn, equally spaced (±0.6px), first/last on the two labelled extremes (±1px) — p04 and wfo lanes | PASS | PASS |
| ends labelled with the server's strings (`110.00`/`100.00`; `20,007.47`/`19,872.61`), exact string in `title` | PASS | PASS |
| no number on the four rules between | PASS | PASS |
| deepest label below its mark, never over the drawdown curve (3000 samples of the path) | PASS | PASS |
| deepest label inside the figure frame | FAIL (p04, both widths) → **PASS after fix** | same |
| x day labels legible | PASS | **FAIL (wfo: `2026-07-09` printed over `2026-07-14`) → PASS after fix** |

The rules are drawn in `--line-soft`: on the page they read as a faint grid, present but light. That is the
token, not this screen, so I left it.

### 3.3 `NET_RETURN` tile, P04 qualifier, old reports (row 3) — FIXTURE and DERIVED only

| Body | Tiles | What the screen showed | Result |
|---|---|---|---|
| FIXTURE p04 (7 tiles) | `NET_RETURN` first, `+10.00%` (exact `0.1`), scope `oos`, green `rgb(30,123,79)` | + Optimization row: `fixed_profile × none` and under it `declared, not executed · P04_FIXED_PROFILE_RUN_DID_NOT_EXECUTE_THE_DECLARED_OPTIMIZER` (title carries the sentence) | PASS |
| FIXTURE wfo (7 tiles) | `NET_RETURN` `−0.37%` (exact carried), scope `is plus oos`, red `rgb(180,58,58)`; seventh tile fills its row (no hole) | Optimization `mode_1_decay × global`, no qualifier | PASS |
| DERIVED p04-old / wfo-old (6 tiles) | no `NET_RETURN`; 3 rows of 2, no empty slot | no qualifier element on any row; PARTIAL notice `4 of 6 headline values` / `2 of 6 …` recomputed from the body and equal | PASS |

Signed tiles (`NET_RETURN`, `OOS_SHARPE`, `MAX_DRAWDOWN`, `FUNDING`) take their colour from the sign; a count
(`TRADES`) never does; a null tile prints its state word and reason code, never a digit. Axe: 0 blocking on
every body at both widths (the D-B1 node is the only contrast finding). Horizontal overflow: 0 px on every body
at both widths.

**Not verified because the preview was not read:** that the two NEW runs really carry seven tiles and the
qualifier; that the two OLD runs really serve six and no qualifier; every "compare each value on screen
against the served field" on real data; PARTIAL counts on real data; the equity of a real run.

## 4. Screenshot and PDF hashes (SHA-256, first 16 hex, not committed)

FIXTURE lane, after the fix. PNG = full page.

| Body | PNG 1440 | PNG 660 | PDF Letter | PDF A4 |
|---|---|---|---|---|
| p04 | `673acd4e157f6e17` | `5007594673bcaf03` | `450da4d27a06ebbd` | `2c0242961fbcd98d` |
| p04-old (DERIVED) | `80e6060fc70a7240` | `4c88e57d97ed770e` | `1b9b21ba7a363a86` | `5602012ac202f30e` |
| wfo-retained | `d07d98edbd5b5b6f` | `10a56f2b6e36c5ad` | `4c4e7eaee8b736ec` | `71520c94cc6c9d69` |
| wfo-old (DERIVED) | `c9ce4f1409b51b61` | `57462319b3af2df3` | `6fdaf652f4dc7820` | `d763eda784dafad4` |
| wfo-32-folds | `f82931aea53a265d` | `1481f67ae5165fe6` | `a0d9e85be128f4bf` | `477ee9b454d57294` |

Before the fix (the defect evidence): p04 Letter `f0c7b5ccadc8a0ce`, A4 `4a9bd569cfe7bf09`; wfo-retained Letter
`a996158d01d11033`, A4 `ba1210caf47512f1`.

## 5. Defects found and fixed

All in `apps/portal/frontend/src/research/`: `ReportDetail.tsx`, `reportEquity.ts`, `reportDetail.test.tsx`.
Header, title area and `runLabels` untouched.

| # | Defect | Seen | Fix | Test |
|---|---|---|---|---|
| D1 | The `deepest −2.00%` label is centred on its mark; a deepest point at the right end (the P04 fixture, the WFO fixture at 93%) hangs it outside the figure, and on paper the page box cuts it ("deepest −2."). | 1440, 660, Letter, A4 | `equitySvg` returns `deepest.align` (`end` from 88%, `start` up to 12%, else `center`, a position rule only); the label carries `data-align` and two CSS rules hang it inward. No value is computed. | G5 test: p04 fixture `end`; wfo fixture `end`; synthetic middle `center` and left `start`; DOM attribute; CSS rules present |
| D2 | X-axis day labels were chosen by point count. Where the IS segment is sparse and the stitched OOS one dense (the retained WFO lane), four of six labels fell in the last 12% of the axis and overprinted at 660 and on paper (`2026-07-09` over `2026-07-14`). | 660 screen, Letter/A4 | Labels stand at equal steps of time, each naming the sealed point nearest that step; still the UTC day of a sealed point's own timestamp, still ≤ 6, still deduped by day. On the wfo fixture the smallest gap went from 12.0% to 19.9%. | G5 test: min gap > 14% on the wfo fixture (old code: 12.0%), every label is a sealed point's day, DOM equals geometry |
| D3 | A block's title bar was left alone at a page foot with its table on the next page (`METRICS`, `CERTIFICATION CHAIN`): 9 orphans across the ten PDFs. | Letter, A4 | print CSS: `.rr-block > .t, .rr-t2 { break-after: avoid; }` | print CSS assertions; orphan scan of all PDFs: 9 → 0 |
| D4 | The promotion + provenance card is `break-inside: avoid` but about one page tall, so it moved whole, left half a page empty and spilled two lines and the footer onto a last page (Letter p04, wfo 32-fold). | Letter, A4 | print CSS: `.rr-pp.rr-keep { break-inside: auto; }` and `.rr-pp .rr-id .k, .rr-pp .rr-id .v { break-inside: avoid; }` (a label and its digest stay together). The two-column geometry is unchanged. | print CSS assertions; page counts above |

D4 does not change the hi-fi's two-column card; it only lets it cross a page. If Bobby would rather the card
stack in print to keep each digest on one line (about 3 pages), that is a geometry decision for him, not a
defect fix.

Two rows of the comparison fail after the fixes and are **not** screen defects: `fx-wfo-32` has 32 fold rows
but its 336 equity points span two folds, so 2 of 32 fold starts fall inside the drawn span and 2 fold marks are
drawn (a marker outside the sealed span is never invented). It is a synthetic-body artefact of the fixture.

## 6. What is left open

1. **The real-data half of G5 (blocked, §1).** With a session, the lane is one command per run; it needs to:
   read `GET /api/v1/quantbt/runs/{id}/report` for the four ids; open the report page at 1440 and 660; compare
   every value on screen with that body (tile count 7 for the NEW runs and 6 for the OLD, the `NET_RETURN`
   value/scope/sign colour, the qualifier on the P04 Optimization row, no qualifier and no empty slot on the OLD
   runs, PARTIAL counts); count the six rules on both lanes; print Letter and A4 and rasterise. The existing
   `e2e/_probe-research-x2-gaps.spec.ts` (`playwright.research-x2.config.ts`) already does the print and axe for
   the real P04 report through the Vite proxy; it would need the four ids above and reads only. My harness
   (a scratch Playwright spec plus PyMuPDF checks, not committed) has a `G5_MODE=real` path that takes a
   `storageState` and issues only the page's own GETs.
2. **D1/D2 on the real runs.** Whether the NEW P04 report's deepest drawdown is at its right end and whether the
   NEW WFO report carries an IS segment (the case D2 fixes) is only known from the real body.
3. Observations, not fixed (outside the five files, or a token):
   - `OOS_SHARPE` prints `-5.355` with a hyphen-minus while `NET_RETURN`/`MAX_DRAWDOWN` print `−0.37%` with a
     true minus (`researchFormat.formatMetric`, shared). E1 territory.
   - A reason code in a narrow cell breaks mid-token (`P18_METRIC_NOT_PUBLIS`/`HED` in the metrics `value`
     column, `…AUDITE`/`D_FILLS` in a tile). `overflow-wrap: anywhere` is deliberate for sealed identifiers.
   - The grid's `--line-soft` rules are faint on paper.
4. A4 is 4 pages where the 2026-09-23 measure was 3; whether that is worth reclaiming is a call for Bobby.

## 7. Gates

| Gate | Result |
|---|---|
| `vitest run src/research/reportDetail.test.tsx` | 67 passed (64 before + 3 G5) |
| `vitest run src/research src/features/quantbt src/app` | 52 files, 1513 passed, 3 skipped, 0 failed |
| `tsc -b --noEmit` | exit 0 |
| Fixture lane, 5 bodies × 2 widths | 972 comparison rows, 2 fail (fixture artefact above), axe 0 blocking, overflow 0, console 0 |
| Pre-commit hook | see the commit |
| Visual baselines | not run; no Research S09 tile in the baseline, no shared token or shared component changed |
