# G6 — visual suite diagnosis at `49256a2a` (Claude, 2026-09-30)

This is read-only. No snapshot was updated, no baseline was touched, and nothing was committed.

- **Run:** `./scripts/portal-web-visual.sh` in `mcr.microsoft.com/playwright:v1.62.1-noble`, worktree `portal-research-w1-build`, detached HEAD `49256a2a` (based on `d3d99f26`). The result was **320 passed · 12 failed · 16 skipped** over 32.8 min with 4 workers.
- **Last green run:** 332 passed · 16 skipped · 0 failed at `1dec9d33` (2026-09-26, per `OL22_VISUAL_BASELINE_CLAUDE_2026-09-26.md` and `FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md`). Every failure below therefore comes from `1dec9d33..49256a2a`, or from the conditions this run ran under.
- **Baselines:** all ten Research `run-*` shots were last recorded in `0ddda3d0` (2026-09-07). `planning-board-operations-workstation` was last recorded in `7441c572` (2026-09-17).
- **Changes since the last green run:** from `1dec9d33` to HEAD, nothing under `src/execution/**`, Planning, or `playwright.config.ts` changed. The only change to `e2e/*.spec.ts` is the three-line `assertPinnedVisualHost()` guard, which was already green in the OL-22 run. The shell change is `src/app/TopBar.tsx` plus the new `src/app/researchRunCrumb.ts`.
- **Host load:** the load average was **27.0 (15-min) on 8 cores** when this run finished, and 15.5 while the commit hook was still running. The hook runs control-api and contracts vitest containers, and other worktrees were running vitest at the same time.
- **Method:** I read the expected, actual and diff PNGs. For each Research pair I searched vertical shifts from 0 to 24 px and measured the residual difference in the content column (x ≥ 250) after alignment, then looked at crops above and below each residual band. For #1, #2, #5 and #12 I extracted `trace.zip` and read the action timeline and network log.

## Root causes, in short

| Cause | Commit | What it does to the shots |
|---|---|---|
| **C1 · run crumb in the topbar (D1)** | `c81e8dc2` 2026-09-27 *merge(research): E4/E11/E12/E15 screens 00-04, D1 run label, E13 lineage parent*. `researchRunCrumb.ts` and the `TopBar.tsx` change exist in **neither parent** and were written inside the merge commit itself. | Every run-scoped Research route now shows `Research / QuantBT Backtest / visual-baseline-run` (on the running fixture: `/ visual-baseline-run-running`). `.portal-topbar` has `flex-wrap: wrap`, so at **laptop (1280 px)** the extra crumb pushes **"Planned modules"** onto a second topbar row. On the longer run-progress crumb, the **account icon** wraps as well. The topbar then grows by 1–2 px (overview, parameters, optimization, execution, audit) or by 9–13 px (run-progress), and the whole page shifts down by that amount. At workstation width nothing wraps, and the crumb alone stays under the 0.2 % tolerance. |
| **C2 · Profile & Access lost its SOON badge** | `4fcd8eee` 2026-09-16 *feat(a4-4): Profile & Access, owner-aware navigation…*. That is intended, and the A4 baselines were re-recorded for it. | The Research baselines were **not** re-recorded, because the missing badge (a few hundred px) stayed under `maxDiffPixelRatio: 0.002`. This drift was already hidden inside every Research shot, and C1 pushed the total over the tolerance. |
| **L · host load** | none (no code changed) | Screenshot and test budgets were exhausted before an image was produced. |

After shift alignment, the content column of every Research page is the same as the baseline: the charts, tables, fold timeline, console, audit panels and metric table all match. What remains is sub-pixel anti-aliasing from the 1–2 px non-integer shift, plus 7–9 px near the "Run progress" heading. **No Research screen body changed.** E16-R1 S08 candles, E2c band, E14 NET_RETURN, E1 ShortId, RF-04 and S14 do not appear in any of these shots.

## Per failure

### 1 · `execution-fixtures.spec.ts:197` paper-workbench-1c-and-its-vn-variant-4h @ laptop

| Spec | What changed | Cause commit | Class | Recommended action |
|---|---|---|---|---|
| `execution-fixtures @ laptop › paper-workbench-1c-and-its-vn-variant-4h` | **No image was produced**: there is no actual.png and no diff.png. The trace shows setup took 18.4 s (the `/execution/_fixtures` render took 8 s alone), then `toHaveScreenshot` started with its own `timeout: 60_000`. The test's 60 s budget ran out at +60 s. `screencast.showOverlays: …closed` is teardown noise from the killed page. Neighbouring groups also took 45–58 s. | None. `src/execution/**` is unchanged since the green run. | **FLAKE / infra** (load). A latent budget flaw adds to it: a screenshot timeout of 60 s cannot fit inside a 60 s test that has already spent 18 s on setup. | Re-run this spec alone, after the hook has finished. Separately, and not as a baseline change: raise the test timeout for chart groups, e.g. `test.setTimeout(120_000)` or `test.slow()`, so this does not recur under load. |

### 2 · `visual.spec.ts` planning-board @ workstation (operations)

| Spec | What changed | Cause commit | Class | Recommended action |
|---|---|---|---|---|
| `operations theme › planning-board @ workstation` | **No image was produced.** The page was ready at +5.7 s. After that, the first full-page capture did not finish within the 5 s `toHaveScreenshot` timeout. The same screen passed in the research theme and at the other three breakpoints. | None. Planning is unchanged since `7441c572`. | **FLAKE / infra** (load). | Re-run alone. No baseline action. |

### 3–11 · Research run screens

In the rows below, *C1 wrap* means the topbar change described under C1: "Planned modules" moves to a second row, the page shifts by N px, and the body is identical after alignment.

| # | Spec (theme · screen @ bp) | Size exp → act | What changed (measured) | Cause | Class | Recommended action |
|---|---|---|---|---|---|---|
| 3 | research · run-progress @ laptop | 1686 → 1695 | C1 wrap with a **9 px** shift. The crumb reads `visual-baseline-run-running`, and both the account icon and "Planned modules" wrap. C2 badge missing. After alignment the residual is 9 px. Fold timeline, stage chips and live console are identical. | C1 + C2 | INTENDED content with a **layout side-effect** (see note) | Bobby decides C1 (fix or accept), then re-record |
| 4 | research · run-audit @ laptop | 1277 → 1277 | 5,022 px, only in the topbar (crumb added, "Planned modules" wrapped inside the fixed-height bar) and the sidebar (no **SOON** on Profile & Access). The residual in the content column is **0**. | C1 + C2 | INTENDED with side-effect | same |
| 5 | research · run-optimization @ workstation | no actual | **No image was produced.** The page was ready at +10.4 s, and the first 4314 px capture did not finish within 5 s. The same screen passed at laptop in the research theme. At workstation, C1 does not wrap. | None | **FLAKE / infra** | Re-run. It should pass, because the crumb alone is under tolerance at workstation width. |
| 6 | operations · run-overview @ laptop | 2237 → 2238 | C1 wrap with a **1 px** shift. After alignment the metric table (Total return 708.17 %, CAGR, Sharpe…) is pixel-identical apart from anti-aliasing. | C1 + C2 | INTENDED with side-effect | Bobby decides C1, then re-record |
| 7 | operations · run-optimization @ laptop | 4314 → 4315 | C1 wrap with a **1 px** shift. Stage durations, fold timeline and charts are identical after alignment. The first capture was stable, and the retry timed out under load. | C1 + C2 | INTENDED with side-effect | same |
| 8 | operations · run-parameters @ laptop | 2152 → 2154 | C1 wrap with a **2 px** shift. The parameter grid (LEN_ATR1 10 … WINDOW 22) is identical. | C1 + C2 | INTENDED with side-effect | same |
| 9 | operations · run-execution @ laptop | 2841 → 2842 | C1 wrap with a **1 px** shift. Tables are identical after alignment. | C1 + C2 | INTENDED with side-effect | same |
| 10 | operations · run-progress @ laptop | 1682 → 1695 | C1 wrap with a **13 px** shift. The account icon and "Planned modules" both drop to row 2, so the topbar grows from about 51 to 64 px. 216,606 px (0.10) differ, all from the shift. The residual after alignment is 7 px. | C1 + C2 | INTENDED with side-effect | same |
| 11 | operations · run-audit @ laptop | 1257 → 1259 | C1 wrap with a **2 px** shift. The reconciliation list, the export button and the Links into Planning section are identical. | C1 + C2 | INTENDED with side-effect | same |

**Note on the layout side-effect (C1).** Adding the run to the crumb is the intended D1 behaviour. The consequence is not intended: on every run-scoped Research route at 1280 px, the topbar controls wrap onto a second row. `.portal-breadcrumbs` has `min-width: 0; overflow: hidden`, but the parent `.portal-topbar` has `flex-wrap: wrap`, so the controls wrap instead of the crumb shrinking. The label is `known ?? shortId(runId) ?? runId`. The fixture run has no short label, so the full id is printed, and a real `R-WFO-118` would wrap less. This is not strictly a regression the visual gate should wave through, and it is also not fixture drift. **Bobby should choose one of two options:**

- **(a)** Fix the topbar: let the crumb shrink with an ellipsis, for example by giving the run segment a `max-width` and `text-overflow: ellipsis` and keeping `flex: 1 1 auto; min-width: 0` on `.portal-breadcrumbs` so the controls stay on one row. Then re-record the Research shots.
- **(b)** Accept the two-row topbar and re-record as is.

Either way the re-record has to be `./scripts/portal-web-visual.sh --update`, which uses `--update-snapshots=all`. That mode is required because the research-theme laptop shots that *passed* (overview, parameters, optimization, execution) carry the same C1 and C2 drift under the tolerance. Re-recording only the failing shots would leave them stale.

### 12 · `chromium-preview` `execution-preview.spec.ts:40` "every product route … never leaves the origin"

| Spec | What changed | Cause commit | Class | Recommended action |
|---|---|---|---|---|
| `execution-preview.spec.ts:40` | **No request left the origin.** All 597 requests in the trace went to `127.0.0.1:4175`, the preview origin, so the `foreignRequests` assertion never ran and would have passed. The failure was the 60 s **test timeout**. The test walks 27 routes (20 `ROUTES` + 7 `FEATURE_ROOTS`) inside one 60 s test and was at route 18/27 (`/deployments/portfolios/PF-CRYPTO`) at +58 s. At that point the page still showed "Checking your session…", and the lazy chunks (`ExecutionPreviewRoute-*.js`, `useRevision`, `screenContracts`, IBM Plex fonts) were still in flight. Each route took about 3.2 s under this load. The spec ran alongside `execution-journeys` "no enabled control is a no-op", which took 10.8 min on the same preview server. | None. `src/execution/**` and `bffDouble.ts` are unchanged since the green run. The new `useRunLabel()` in `TopBar` receives `undefined` on non-Research paths. | **FLAKE / infra** (load). A latent budget flaw adds to it: 27 navigations with `settle()` fit in 60 s only on an idle host. | Re-run alone. Separately: `test.setTimeout(120_000)` or `test.slow()` on this test. |

## Re-run

**I did not re-run anything.** The commit hook was still running in this worktree when I finished: control-api `vitest` in `control-api-test-net-*` and `contracts-test-node`, with `packages/contracts` mounted from this tree. Re-running the suite would run `npm run build` into `apps/portal/frontend/dist` in the same tree and add load, which conflicts with the rule to freeze code while the hook runs. The trace evidence (no image produced, no code change in those areas since the green run, load average 27 on 8 cores) is enough to classify #1, #2, #5 and #12 as load flakes.

The script forwards its arguments to `playwright test` unchanged, and the `npm` script `e2e:visual` never updates snapshots. Once the hook has finished and the host is quiet, this command confirms the four flakes:

```bash
cd /home/bobby/portal-research-w1-build && sudo -n env HOST_UID=$(id -u) HOST_GID=$(id -g) \
  ./scripts/portal-web-visual.sh --workers=1 --output=test-results/g6-rerun \
  '--grep=paper-workbench-1c\|planning-board.@.workstation\|run-optimization.@.workstation\|never.leaves.the.origin'
```

Write `\|` exactly as shown: the argument is expanded into the container's `sh -lc` string, where an unescaped `|` would become a pipe. The original failure artifacts are backed up in the session scratchpad at `g6/orig-test-results/`.

## What Bobby needs to decide

1. **C1 topbar:** fix the wrap (a) or accept the two-row topbar (b). This must be decided before any re-record.
2. **Research baseline re-record:** approve re-recording all 32 Research shots (8 screens × laptop/workstation × 2 themes; all of them carry the crumb and the badge drift) with `--update`, which covers C1 and the latent C2 badge drift from `4fcd8eee`. Look at the forced snapshots before trusting them.
3. **Budgets (test debt, not a baseline change):** raise the timeouts for the chart-heavy fixture groups and for the 27-route preview walk.
