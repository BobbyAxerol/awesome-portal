# FE screen/action matrix — re-run on the current bundle (P24-T09 / P24-T13 / FND-20), Claude, 2026-10-08

Spec `apps/portal/frontend/e2e/_preview-research-p24-matrix.spec.ts` (unchanged cells), receipt `fe-screen-action-matrix-receipt-2026-10-08.json` (the 2026-10-04 receipt is untouched).
Supersedes the **validity** of the 2026-10-04 run for the screens changed since (S02 recipes / run types / native, S03 native panel, S04 window analytics, S08 Replay card, S09 supplement, S13 window compare); it does not
replace its history.

**Target:** the clean rebuilt preview at `http://localhost:8095`, built from lane HEAD `938fa74d` (clean tree, `preview.sh build && up`; running image IDs = built tags; identity `938fa74d`): Control
`sha256:5c5a3f2622fd…`, Portal API/worker `sha256:ba74c3b0c12d…`, Web `sha256:ae678e3fa75f…`. GET and navigation only (non-GET aborted, the two stateless computing POSTs excepted).

## Result

**73 cells · 682 checks = 613 PASS / 0 FAIL / 69 NA** (2026-10-04: 613 / 0 / 69). Wall clock 21.8 min, one worker.

One honest incident: the first full pass was 612 / **1 FAIL** — `S02 New Run` console check: eight `403` on `POST /api/v1/research/datasets/declaration-estimates`. It is a **harness defect, not a product defect**: that POST is a stateless estimate the screen
makes (shipped after the 2026-10-04 run), and the harness let it through without the stack's public `Origin`, which the Control API checks on every write. Fixed in `e2e/w1StateRuns.ts` (`getOnly` sends the Origin, as the S02 spec already does) and the S02 cell re-run on the
same bundle: PASS. The failing row is kept in the receipt (`first_run_failures`); the S02 rows in the receipt are the re-run.

## What this does and does not cover

Covered per cell (unchanged definition): load, no writes, refresh, deep link, navigation, print, responsive at 1440 / 1280 / 390 / 360, axe (0 critical / 0 serious), console. The interactive blocks added since 2026-10-04 (Replay card, window compare, Report supplement)
are `no-print`, so the print check holds.

**Not covered by this matrix** (named, not waived):
- Write controls remain `NOT_RUN_WRITE` here (real receipts are the P22 publish and journey packets).
- The new window surfaces are acceptance-tested by their own real-API specs, not by matrix cells: `_preview-research-wex.spec.ts` (16 cases at 1280 / 660) and `_preview-research-s06-trials.spec.ts` (below). The matrix opens Replay / Report / Compare with their new blocks collapsed or idle.
- A pending-run Holdout, a Limit / OCO Alpha run and a 6,400-row ledger have **no real run**; none is claimed.
- `denied` / `stale` states do not exist on the preview; Operations Dark and mobile print stay on the QA addendum; real-device print is a review item.

Verdict: **T09 / T13 = READY_FOR_BOBBY_REVIEW for the GET/navigation denominator on the current bundle.** Not P24 closure, not release.

## S06 real trials (new, same day)

`_preview-research-s06-trials.spec.ts`, real API, GET-only, 1280 and 660: `rrun_70d7d8d1…` (400 trials, 3 PRUNED on the first 200 rows) and `rrun_7d4709b7…` (390 retained after an early stop, 7 PRUNED): paging with the screen's own control reaches every trial exactly once (400 / 390), no
duplicates, no horizontal scroll, no console error, no write. **It found a real defect:** a PRUNED trial's IS cell printed `0.00` because the source stores `mean_is_sharpe = "0"` with no reason for a trial that has `objective: null` and `pruned: true`.
Fixed on the screen (a pruned trial is never drawn as a number: "not published · pruned before the engine published an objective") with a unit test; the source-side ask is `BR-S02-20` (§46 of the request ledger). The largest retained ledger is 400 rows, so
**6,400-row paging is not verified** and is not claimed.
