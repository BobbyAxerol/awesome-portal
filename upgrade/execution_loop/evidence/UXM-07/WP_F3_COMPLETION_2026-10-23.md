# WP-F3 completion: Paper workbench, Sandbox, Canary, Live (2026-10-23)

Lane FIXTURE_LAB, not acceptance evidence. Scope: audit sections 9, 11, 12, 13 of `PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md`, item B9 of 6(d), highlights 13 to 16. Rule from Bobby: where the real API has no data, the fixture lane fills the design through the same routes and readers (register `## 2f3`); a member with no published place is a typed gap plus a request to the contracts lane (board section 5, row F3 to K). No schema widened, no command or Live flag enabled, no component prints a figure it computed.

## What changed

- `e2e/bffSimulatedStage.ts` (new): lit Paper, Sandbox, Canary and Live bodies for the stage deployments, wired by one marked call line in `e2e/bffSimulated.ts`. States are reached by deployment id: `_dark`, `_mismatch`, `_stale`, `_gap`, `_breach`, `_halted`, `_vn` (and `dep_b2` mismatch, `dep_c1` halted in the review universe). Live "Broker mismatch hides broker values" is reachable at `/deployments/live/dep_live_01_mismatch`; the broker side is absent from the body itself.
- Spine ticks (R1, R2, Paper, Sandbox, Canary) on all four screens: `screens/stage/useStageLifecycle.ts` reads WP-C's `life_*` keys of the alpha dataset through the same port; nothing is drawn done without a published exit.
- Canary: KPI caption is the server's share of the approved cap; the duration row prints the published trial day; drill says Passed; stale broker blocker sentence.
- Live: Broker equity caption from the server's difference ("Matches internal"); mismatch adds the risk-increasing blocker line.
- Workbench: named by the alpha when its name is published, the design's question line, VN market chip linking `/vn-market` when the plain profile publishes a VN calendar (answers D to F3), 13px table body in the kv panels.
- CSS (own files): rollback flag never breaks mid-word, Triad rows keep figure and unit whole and wrap the row, sandbox code list wraps, chart readout figures not split (`charts.css` one rule and one class on `EquityPanel.tsx`, WP-C's file, additive).
- `scripts/layout-audit.mjs`: 23 added routes (other tabs and every state above).

## Element table

States: DATA, TYPED (absence is legal), BLOCKED with blocker (CONTRACT = row F3 to K, WP-D = shell file owned by D).

### 9 Deployment (Paper)
| # | Element | State |
|---|---|---|
| 1 | Context bar (env switch, basis, scope, window buttons) | BLOCKED WP-D (shell) |
| 2 | Breadcrumb | DATA |
| 3 | Title: alpha name | DATA (FE-066 name published in the lit body) |
| 3b | Title: alpha version | BLOCKED CONTRACT (7) |
| 4 | Subtitle question | DATA |
| 5 | Portfolio, account, alpha line | DATA |
| 6 | Alpha / Account / Operations links; VN chip | DATA |
| 7 | Runtime | DATA |
| 8 | Display freshness | DATA |
| 9 | Reconciliation (1 open finding, 1 unknown order) | DATA |
| 10 | Lifecycle ticks R1, R2 | DATA |
| 10b | "3 of 7 criteria" | BLOCKED CONTRACT (5) |
| 11 | Request exit review + reason | DATA |
| 12 | Tabs Overview, Orders, Fills, Positions, Sessions (populated) | DATA |
| 13 | Equity chart, simulated hatch | DATA |
| 13b | Approved band | BLOCKED CONTRACT (4) |
| 14 | High / Low markers (low at the first point is not marked by the chart) | DATA |
| 15 | Drawdown strip | BLOCKED CONTRACT (4) |
| 16 | Exit gate observation days, trades | DATA |
| 17 | Exit gate drift, fills reconcile, cost drift | BLOCKED CONTRACT (5) |
| 18 | Open exit review | DATA |
| 19, 20 | Runtime health rows, provenance | DATA |
| 21 | Accounting | DATA |
| 22 | Funding | TYPED |
| 23 | Execution quality tiles | DATA |
| 24 | Latency | TYPED (request 6 posted) |
| 25 | "On scroll" strip (sticky at the bottom of the viewport; a full-page capture draws it mid-page: capture artifact, intended pin kept, e2e F-4 rule) | DATA |

### 11 Sandbox
| # | Element | State |
|---|---|---|
| 1 | Context bar | BLOCKED WP-D |
| 2, 3 | Breadcrumb, chip, title, subtitle | DATA |
| 4, 5, 6 | Runtime, freshness, reconciliation chips | DATA |
| 7 | Stage chips with ticks, Sandbox failed | DATA |
| 8 | Source-partial banner (only when a panel did not report) | DATA |
| 9 to 14 | Tabs, five KPIs | DATA |
| 15 | Internal / Broker / Difference | DATA |
| 16 to 19 | Findings, exit review, submit, request | DATA |
| 20 | What exit needs, provenance | DATA |
| 21 | Review note form (server rule: 8 characters; design says 24: deviation recorded, rule is the server's) | DATA |
| 22, 23 | Seven steps, lineage | DATA |

### 12 Canary
| # | Element | State |
|---|---|---|
| 1 | Context bar | BLOCKED WP-D |
| 2, 3, 4 | Guard frame, breadcrumb, Real capital at risk | DATA |
| 5 | Title and subtitle (alpha) | DATA |
| 6, 7, 8 | Runtime, freshness, reconciliation | DATA |
| 9 | Stage chips with ticks | DATA |
| 10 | Trial day 6 of 14, started, review opens | DATA |
| 11 to 15 | Five KPIs | DATA |
| 16 | Live series | DATA |
| 16b | Paper and Backtest series | BLOCKED CONTRACT (3) |
| 17 | Promotion decision (closed, with reasons) | DATA |
| 18 | Tabs | DATA |
| 19 | Envelope verdict | DATA |
| 20 | Cap, limit, approved | DATA |
| 21 | Consumed, used bar and percent (four caps) | DATA |
| 21b | Duration row limit and used | BLOCKED CONTRACT (1) |
| 22 | Before scale-up | DATA |
| 23 | Rollback readiness (four checks) | DATA |

### 13 Live
| # | Element | State |
|---|---|---|
| 1 | Context bar | BLOCKED WP-D |
| 2, 3, 4 | Guard frame, breadcrumb, tag, title | DATA |
| 5, 6, 7 | Runtime, freshness, reconciliation (Matched or Mismatch) | DATA |
| 8 | Stage chips with ticks | DATA |
| 9 | Source banner (dark variant) | DATA |
| 10 to 14 | Five KPIs | DATA |
| 10b | Capital "Allocated", gross "% of capital", open orders limit | BLOCKED CONTRACT (8) |
| 15 | Live series with high and low | DATA |
| 15b | Drawdown strip | BLOCKED CONTRACT (4, deployment subject) |
| 16 | Protective ladder | DATA |
| 17 | What is blocking | DATA |
| 18 | Tabs | DATA |
| 19 | Internal / Broker / Difference, and the MISMATCH state | DATA |
| 20 | Positions and orders rows | DATA |
| 20b | Leverage, ack latency columns | BLOCKED CONTRACT (2) |

Counts: DATA 83, TYPED 2, BLOCKED 14 (WP-D 4, CONTRACT 10).

## Tests (all run in this worktree)
- `vitest run` canary, live, sandbox, workbench, stage, titleAbsence, v2Hygiene, uxm10Css, budgets, testHygiene, disabledReason: 36 files passed, 3680 tests passed, 5 skipped (0 failed).
- `vitest run` fixtureBff, charts, blocks: 40 files passed, 841 tests passed, 1 skipped.
- New: `fixtureBff/stageLitScreens.test.tsx` (25, the four screens on the lit lane, every state), `stageLit.test.ts` (6), `stageLitFigures.test.ts` (10, integer invariants), `canary/canary.wpf3.test.ts` (6), `live/live.wpf3.test.ts` (6), `stage/useStageLifecycle.test.tsx` (9).
- Two existing assertions changed on purpose: workbench "no question line" now expects it; canary duration Consumed expects the published day.
- `npx tsc --noEmit -p .` ran separately: clean (before the last CSS-only edits; no TS changed after).

## Layout (`scripts/layout-audit.mjs`, 1440/1280/1024/660/390; overflow / clipped / wrapped / font outliers)
- Before (original code, 4 default routes): paper 3 font outliers at every width and 1 wrapped at 390; sandbox, canary, live 0.
- After (28 routes: 4 defaults, 7 other tabs, 10 state variants, 4 dark/variant checks): every route and width 0/0/0/0 except Paper (default and `_dark`): 0/0/0/2 at every width. The two are the kv panel's "3 of 14 days" and "30 of 60 trades" (13px mono) judged against a column whose mode is the 11px state flags in the same column (heuristic; the figures are 13px like every table body).
- Mid-run findings fixed: triad figure and unit spilling at 1280 (6 to 17px), sandbox plan code list spilling (58 to 85px), rollback READY breaking mid-word, chart readout wrapping at 390.

## Not verified
- Context bar chips on these routes (WP-D lands them); the real Edge (all lit values are fixture); Playwright, visual baselines, `e2e` specs (not run: board rule); the chart's Low marker at the first point; Low label overlapping an x tick in the Live chart (charts, WP-C).
