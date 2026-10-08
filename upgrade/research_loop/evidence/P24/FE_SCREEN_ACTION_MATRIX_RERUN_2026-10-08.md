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

## Update 2026-10-08 (later) — BR-S02-20 delivered and re-verified

Codex `4cff6010` publishes `value: null` + `TRIAL_PRUNED_NO_OBJECTIVE` for all five objective metrics of a PRUNED trial and a typed-absent objective decomposition. Preview rebuilt clean from `4cff6010` (clean tree): Control `sha256:dfd648a5f1e4…`, Portal API / worker
`sha256:53cd72ecd455…`, Web `sha256:2108e2498122…` — every running image equals its built tag.

Real API on the two runs: `rrun_70d7d8d1…` 3 PRUNED and `rrun_7d4709b7…` 7 PRUNED (first 200 rows each): **10 of 10 pruned trials have all five metrics `null` + `TRIAL_PRUNED_NO_OBJECTIVE` and an absent decomposition**. The S06 and WEX specs on the served bundle: **20/20** (S06 4, WEX 16, at 1280 and 660).
The screen's own PRUNED guard stays (it is now redundant against the repaired server and still protects an older one). Not verified on real data: a COMPLETE trial with a true zero (none among the first 200 rows of either run); that case is covered by Codex's unit and contract tests only.

Tooling observation (not a product defect): after the build, `preview.sh up` left `portal-api` and `quant-worker-py` on the previous image although their tags had moved, and `preview.sh up portal-api quant-worker-py` (the scoped rollout, which does check for in-flight children) did not recreate them either.
They were recreated with the same compose invocation plus `--force-recreate` (no in-flight job; DB/NATS untouched), then nginx was re-resolved. Image equality is therefore checked by comparing each running image ID with its tag, not by the script's exit code.

## Update 2026-10-08 (evening) — re-run on the bundle with the one-chart S08, native optimization summary and candidate paging

Target: shared preview `http://localhost:8095`, Web image = tag (`89d8f2d4…`, built from lane `84fe9fca`'s frontend; backend images unchanged from `6441e93c`). Receipt `fe-screen-action-matrix-receipt-2026-10-08b.json` (the morning receipt is untouched). GET and navigation only.

**73 cells · 682 checks = 612 PASS / 1 FAIL / 69 NA** (morning: 613 / 0 / 69). Wall clock 23.0 min, one worker. All eight S08 cells (including the one-chart native Replay cell), the S04 / S05 Split / S06 / S09 / S11 cells and the two states pass.

**The one FAIL is a backend gap, not a harness or UI defect:** cell `S01 Run Library`, check `console` — `Failed to load resource: 404 … /api/v1/quantbt/runs/rrun_ee50cb82…/report`. The Library now lists the COMPLETED native optimized run first (it did not exist in the morning run) and its "open report" navigation reads `GET /report`, which answers `404 RESEARCH_REPORT_NOT_FOUND` for a native run (the full native Report is not delivered, §51). Reproduced alone (`-g "S01 Run Library"`, same failure). Request `§54` in `CODEX_BACKEND_GAPS_2026-09-30.md` asks for a typed absence (200 with a reason, or a capability on the library row). I did not hide the request by recipe family in the frontend: that would re-derive a server fact. Not waived: the cell stays FAIL until the server types it.

Not covered (unchanged): write controls (`NOT_RUN_WRITE`), `denied` / `stale` states, device print. Verdict: **T09 / T13 = NOT READY — one open console failure with a named backend request**; every other cell is READY_FOR_BOBBY_REVIEW for the GET/navigation denominator. Not P24 closure, not release.
