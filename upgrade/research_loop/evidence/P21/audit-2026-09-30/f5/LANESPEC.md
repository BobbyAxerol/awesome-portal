# F5 LANESPEC — real-API lane spec brought to the landed UI (6e540cda)

Command (cwd `apps/portal/frontend`):
`RESEARCH_PREVIEW_ORIGIN=https://research-portal.primusspark.com RESEARCH_PREVIEW_BASE_URL=http://localhost:8095 npx playwright test -c playwright.research-preview.config.ts --reporter=list`

| run | exit | pass | fail | skip |
|---|---|---|---|---|
| before (coordinator log) | 1 | 36 | 18 | 0 |
| final (lanespec-run3.log) | 1 | 48 | 6 | 0 |

Only `e2e/_preview-research-real-api.spec.ts` changed (+75/-12). No source, backend, baseline or stack change.

## Spec changes (each has a one-line reason comment in the spec)
1. S04 WFO: five hero tiles (F4 / D-AN-01), INITIAL_EQUITY tile asserted absent; `data-exact` per tile from the lane. On this seal (R-WFO-017) `summary_analytics`, `summary_analytics_v2` and `enriched_analysis` are not served, so Net return = passport account return and OOS Sharpe = `fold_verdicts.mean_oos_sharpe` (fold-mean fallback); the all-time `metrics.sharpe` branch is coded but NOT exercised by this run.
2. S11 alpha rail: path prefix + `av` == `binding.alpha_version_id` (F2b).
3. S11: seal chip `data-s="SEALED_LOCAL"` + text "sealed locally" (F1/F3). Published receipt: the screen still prints `approval <id>`; that assertion was kept. It failed because of the stub, see below.
4. S13: `data-lifecycle` asserted only when the claimed ladder mixes lifecycles, absence otherwise (F1c). Live data: all ACTIVE, so absence is what is checked.
5. S10: `Number(v).toFixed(3)` with leading `-` replaced by U+2212 (F3). Not the failing step in any S10 cell (axe fails later).
6. S14 "signed publication": `data-absent` == served `import_attestation.signature.reason_code` (fixture-served registration, not a live read; the real registry has no row for the fixture version).

## Extra drift found beyond the 6 listed (all spec side)
- S11 P22 publish: the stub approval omitted `assignee_pool_availability`, a REQUIRED `ApprovalMirror` field. The page threw `TypeError: Cannot read properties of undefined (reading 'state')` (PoolLine) and went blank. Stub fixed. NOTE for Bobby: the screen crashes on a contract-invalid payload instead of degrading; low priority, contract makes the field required.
- S13 fold chart: the spec expected one `[data-fold-bar]` per fold; the UI draws lines past 8 fold positions (CG-P20-04, LINES_PAST_FOLDS=8). Live ladder has 9 positions. Spec now asserts `data-fold-mode="lines"`, 0 bars, one `[data-fold-line]` per drawn series; bar-by-bar check kept for the bars mode.
- S14 new-run slot: now follows the registry row's `run_admission` (F1 CG-FG-S14-03). With no registry row for the fixture version it is `data-absent-code="REGISTRY_NOT_READ"`, text "run admission not read yet"; spec pins that, not the old `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` / "Not admitted yet (OL-01)".

## Remaining red cells (6) — all UI bug (ours), colour contrast, NOT loosened
| cell | class | evidence |
|---|---|---|
| W6b S10 P04 at 1440 / 660 (2) | UI bug: axe color-contrast serious, `#626d85` | `.ln-unrouted`, `.ln-pick > .ln-reason[data-reason-code]`, `.ln-rowbtn > .ln-rowwhen` (17 nodes at 1440 for P04) |
| W6b S10 WFO at 1440 / 660 (2) | same | same selectors |
| E20 S14 at laptop / mobile (2) | UI bug: axe color-contrast, `#626d85` | `#ai-tab-3 > .txt > .sub` (1 node); every other S14 assertion now passes up to the axe line |

The coordinator expected 2 S10 axe cells; it is 4 (P04 and WFO x 2 viewports), and S14 is a further 2 with the same token, hidden before behind the spec drift. The `axeBlocking` filter only exempts `#939db0`; `#626d85` is not exempted and I did not add an exemption. Owner: the AXEFIX agent (colour/token decision).

## Asked
- 2 stub cells (P22): present as the 2 `X1 S11 DOUBLE P22 publish` cells; red before (stub drift above), green now.
- 2 CG-S00-AV-01 cells: did not appear in this run (no S00 cell failed; S00 passed).

Screenshots: red axe cells fail before `finish()`, so no per-cell screenshot was written; none hashed. Receipts of passing cells: `scratchpad/f5l/lanespec-shots/`. Logs: `scratchpad/f5l/lanespec-run{1,2,3}.log`. `tsc --noEmit` only reports pre-existing roadmap-task-board errors (no node_modules there); none in apps/portal/frontend.
