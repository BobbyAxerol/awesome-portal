# Backend owed to the Execution V2 frontend, ranked (10 November 2026)

Package B1 (Bobby handed the backend role for the FE-facing slice to Claude; priority = what integrates with the frontend). This file is
the scout inventory that comes before any build. It is evidence-first: every "real answer today" below was established by reading the
controller / `app.module.ts` / `main.ts` bootstrap, the fixture-BFF route table (`apps/portal/frontend/src/fixtureBff/routeTable.ts`,
`apps/portal/fixture-bff/ROUTES.md`) or the committed evidence notes, not by calling any stack. Nothing here was probed over a network.

Base: `3b0b3b291`. Not read and not touched: Codex's uncommitted worktree `/home/bobby/portal-research`.
Name clash to avoid: `evidence/UXM-07/b1-handoff.md` is the older B1 (operations queue, FE-042/043, already landed). This is a new package.

## 0. Method and the one-line answer

Sources read: `FRONTEND_BACKEND_SYNC.md` (sections 0b to 6, committed copy), `backend-requests.md`, `UI_ADJUSTMENT_PLAN_2026-11-10.md`, the
Backend Data Contract Guide v1.2 (sections cited per row), `SLICE_CODEX_CONTRACT_CONSUMERS_2026-10-29.md`, `EQUITY_PROJECTION_*`, the
control-api route census (270 decorated routes, regenerated from `src/**/*.controller.ts`), `git log --grep FE-0xx`, and every
`notPublishedText(` / `FE-0xx` the screens print (`src/execution/v2/blocks/notPublished.tsx` is the one table: `FE_REQUEST_LABEL`).

One-line answer: most FE-0xx requests are already delivered and consumed (git evidence below). What is still owed splits into three:
(1) Portal-ownable gaps with no real producer: the emitted `effective_at_ms`, the `win_rate_pct` / `max_drawdown_pct` partition keys,
and per-deployment allocation time (built in this package, section 2); (2) built-but-dark or contract-only routes that need Codex to
mount or decide (section 3); (3) facts that need a real Edge / PM / Core source (section 4: exact requests).

## 1. Status of every request the frontend prints, as of `3b0b3b291`

"Delivered" = a committed producer plus a committed FE consumer exists (commit named); it is NOT "qualified against a real source".
Screens print `Not published (FE-xxx)` for these only when the real source is dark, which is correct behaviour.

| Id | What the FE prints / consumes (file:line) | Real control-api today | Verdict |
|---|---|---|---|
| FE-005/025/041 (windowed totals, window) | `managerDataset.ts` reader, `MeasureSeg.tsx:40`, `drawdownInput.ts:14` | `manager/*` routes take `window`; typed `EXACT_METRIC_WINDOW_NOT_PUBLISHED` absence (`manager-query-p1.ts:51`) | delivered (`1686ec867`) |
| FE-012/027 (group by, stage lifecycle) | `fleetMetricsModel.ts`, `FE_FLEET.board/readiness` | row has `current_stage`, `entered_at_ms`, `days_in_stage` (`manager-model.contract.ts:178`); entered/days are typed absence until a source states a transition | delivered (`7ab7f3a82`, `8c214464d`); FE_FLEET.board/readiness still print the gap for the criteria half (FE-028) |
| FE-013 (series NAV/drawdown) | `ManagerSeriesPanel.tsx:41`, `seriesModel.ts:126` | `GET manager/series` mounted (`manager-series.controller.ts`) | delivered (`d46e4088e`); series SOURCE gaps are real-source (section 4, S-1) |
| FE-015/060/068 (eligibility, step-up, stage actions) | `command/model.ts:716,794,812` | `governance/stage-action-eligibility`, `profile-access/v2/eligibility(/batch)` | delivered (`0bfe26431`, `95c8a4d30`); `model.ts:716/794/812` print FE-015 for capability text that no route publishes (section 4, S-5) |
| FE-017 (capital statements) | `flowModel.ts:26` | statement keys exist (`managerStatementFields`); naming table PM-side | partly; PM naming table is open (S-4) |
| FE-020/021/030/031 (preview, audit, cockpit, event feed) | `operations/OperationDock.tsx:184`, `notPublished.tsx` `FE_OPERATIONS` | `subject-records.v2` activity (`subject-activity.controller.ts:41,52`); no audit-source, no unified `/subjects/{kind}/{id}/events` | open, source-bound (S-6) |
| FE-032 (receipt state and amounts) | `command/model.ts:606,613`, `QueueTable.tsx:73` | receipts on capital commands; `QueueTable` row has no `displayState` | open, source-bound (S-7) |
| FE-033/034/035 (compare, archived, map) | `AlphaCompare.tsx:71`, `FE_FLEET.archived/map` | `manager/series` aligned compare delivered; no archived list, no `view=MAP` | FE-034 open (PM+Research); FE-035 Portal-ownable, not built here (see 2.6) |
| FE-042/043 (incident links, status counts) | `IncidentLinks.tsx:93`, `operations/index.tsx:390` | on `operations` queue (`afc5864e6`, `a8d296723`) | delivered |
| FE-066/067/070/071/072 (stage names, runtime, calendar, canary envelope, typed rows) | stage screens print `Not published (FE-0xx)` when dark | `certification` / `canary` / `live` / `screens/paper/:id` / `vn-market` mounted; typed branches (`scoped-stage-facts.ts`, `canary-envelope-facts.ts`) | delivered (`ee701edbd`, `2997abdbe`, `00589cc15`, `7846b6a70`); values dark until Edge facts are commissioned |
| FE-069 (new request lookup, run list) | `request/*` | `governance/approvals/request-lookup` (`approval-request-lookup.ts`) | delivered (`8a8b9a654`) |
| FE-073/074 (paper-read members, approval create) | readers | delivered | closed (`34f119156`) |
| FE-023 (entity search) | `api/httpApi.ts:1359`, `ExecCommandBar.tsx:20` | **no controller** for `GET /api/v1/execution/search` (contract only: `execution-entity-search.openapi.json`) | open, Portal-ownable, not built here (2.7) |
| FE-024 (visit digest) | `readers/visitDigest.ts` | `visit-digest` + `visit-digest/seen` mounted | delivered |
| FE-037/038/057/058 (capability names, my-access, projection times) | `v2/shell/*` | self-navigation / self-context mounted | delivered |
| FE-044..055 (S1e/S2 cards) | `backend-requests.md` | portfolios cursor, approvals by portfolio, ledger seq/receipt_ref, binding sleeves, blotter relations: not individually re-verified | OPEN (re-verify each when its screen is next touched); FE-046 ledger `seq/command_id/receipt_ref` is not in `execution-analytics` capital-ledger (PM source) |

Id with no commit and no mention in a producer: FE-006, 007, 008, 009, 010, 011, 014, 016, 026, 028, 029, 036. Codex disposed several
(`FRONTEND_BACKEND_SYNC.md` 0b/0c: FE-005/009 implemented, FE-006/011 changes requested, FE-026/036 owner decision, FE-036 decided
"current only"). They print no `Not published` text beyond FE-006/011/028/029 labels, so they are not FE blockers today.

## 2. Owed AND Portal can own it (ranked; built in STEP 2 unless noted)

Ranking rule: (1) a screen prints `Not published` or a client fallback for it today, (2) no real source is needed to answer, (3) effort.

| # | Item | Consumer (file:line) | Real control-api answers today | Blocker | Effort |
|---|---|---|---|---|---|
| 2.1 | Manager metric `effective_at_ms` (optional, emitted metric only) | reader `readers/managerMetric.ts:239`; `flowModel.ts:41-44` (Time column, node captions); `AllocationFlow.tsx` | The zod accepts it (`manager-model.contract.ts:60`) but **no producer sets it**: `sumMetric` (`manager-model.ts:92`) spreads the first source fact and never copies `effective_at_ms`. A real dataset therefore never carries a time; the capital-flow screen falls back to the ledger | none: every fact already carries a source-stated `effective_at_ms` | S |
| 2.2 | `win_rate_pct` partition metric (PERCENT, 0..100, row level, absent = Not published) | `FleetDatasetTable.tsx:237`, `fleetMetricsModel.ts:69` | Key space is open (`partitionMetrics` is `z.record(z.string(), ...)`, `manager-model.contract.ts:173`) but there is no fact kind, no reducer key and no invariant, so it is never served; fixture-BFF simulates it (register 2) | real numbers need a closed-trade source (Edge/PM, request R-WIN below); the contract, admission and reducer need none | S-M |
| 2.3 | `max_drawdown_pct` partition metric (PERCENT) | `FleetDatasetTable.tsx:236`, `portfolio/Overview.tsx:256`, `overview/index.tsx:271`, `registerMetrics.ts:80` | Same as 2.2 (only the fixture BFF publishes it) | real numbers need Edge/TS (the series route also serves a DRAWDOWN line) | S (with 2.2) |
| 2.4 | Per-deployment allocation time (item d of the brief) | `flowModel.ts:53-135` derives it from the capital ledger "when unambiguous"; `AllocationFlow.tsx` | not in the dataset (`children` carries tuple + stage + binding only, `manager-model.contract.ts:176`) | none: the allocation fact has `effective_at_ms`; additive optional child field | S-M (contract + reader) |
| 2.5 | Brief item (a): money / sort / metric enumerations | `manager-query-p1.contract.ts:43-48` | Decision: `win_rate_pct` and `max_drawdown_pct` are PERCENT, not money: they are NOT added to `managerMoneyFields` (that list drives "economic partition required", `manager-model.ts:66`) and NOT added to `metric_keys` / `sort_fields` (the row-level `metrics` map is a closed enum, and the FE already treats both as "open partition key, not a sort field", `fleetMetricsModel.ts:124`). Adding them to the closed map would change every published fixture and the FE reader for no consumer | none | decision recorded, no code |
| 2.6 | FE-035 `view=MAP` | `FE_FLEET.map` | none | Portal-ownable (a projection of the same dataset, bounded rows) but needs a query-contract change and its own byte cap; not built (needs a FE consumer that does not exist yet) | M |
| 2.7 | FE-023 `GET /api/v1/execution/search` | `httpApi.ts:1359` | no controller; the bar fans out to the list reads and matches in the browser | operations / incidents / approvals are Portal PG records; alphas / portfolios / accounts come from the Manager source under the read scope. Authorization per kind is the risk, so it needs the PG cell for every negative case | L (not built here) |

Items that look owed but are not a code gap:

| Item | Finding |
|---|---|
| `GET /api/admin/profile-access/v2/effective` ("none yet" in `routeTable.ts:77`) | **Stale note.** The controller exists: `execution-v2/access.controller.ts:71` (`@Get("/effective")`, service `access.service.ts:447`, schema `portal.access-effective.v1`). Fix the note in `routeTable.ts` and `ROUTES.md` (FE test support, not mine in this package) |
| (c) `GET /api/v1/execution/runtime-manifest` answers a typed 404 on the retained-review Control API | By reading the tip: V1 is not a Core read (`retained-read-profile.ts` `coreExecutionRead` lists only `/runtime-manifest/v2`), so on retained review the guard binds it to the source workspace and answers 404 `Workspace not found.` when the caller has no read grant there (`session.guard.ts:102`). If the caller is `SCOPED_V2` the controller answers 503 `RUNTIME_MANIFEST_TECHNICAL_FIELDS_NOT_COMMISSIONED` by design (`runtime-manifest.controller.ts:50`). The 404 `EXECUTION_READ_NOT_AVAILABLE` seen on 31 Oct came from the deployed image, which predates the tip (SLICE_CODEX_CONTRACT_CONSUMERS note). Moving the V1 path into `coreExecutionRead` would only turn the 404 into that 503. The FE degrades correctly (`useExecutionRuntime.ts:43`: named `FRONTEND_DEFAULT` bounds, equal to the server's 200 / 1 MiB / 4096). Needs a Codex decision, not code: R-MAN below |
| (b) approval evidence and equity-projection source mounted dark (`1c6a13e1c`, `14f0cfdeb`) | Built and tested (`approval-evidence.spec` 25/25 etc.); mounted only when `retained_review_v1` + `PORTAL_ENV=local` + `AUTH_MODE=dev` (`approval-evidence.bootstrap.ts`, `equity-projection-source.bootstrap.ts`). Every body is typed absence (`SourceNotCommissioned*Port`); field authority is deny-all (`EVIDENCE_FIELD_AUTHORITY_NOT_IMPLEMENTED = true`). Nothing Portal can add without a source; the unmount/mount is `main.ts` and `app.module.ts` (Codex's in-flight files). Needs R-EVD, R-EQS below |
| `GET /deployments/{id}/equity-projection` (V1) | No controller at all (`real: "none yet"`, fixture only, `runtime_active` const false). The dark V2 source route supersedes it. FE consumers (`readers/equityProjection.ts`, `equityProjectionV2.ts`) read the fixture lane only |
| S3-U1 shadow-panel keyset route | exists (`analytics.controller.ts`: `deployments/paper/:deploymentId/projection/:panel`); no FE caller. A frontend job, not backend |

## 3. Needs Codex (mount or decide; I did not touch the files)

| Id | Request | Exact lines / decision |
|---|---|---|
| R-MOUNT | If B1's new files add a controller (none does in this package) Codex would register it | none required: this package adds no route, no module, no `app.module.ts` line |
| R-MAN | Decide whether V1 `runtime-manifest` stays source-workspace bound (404 for a caller with no source-workspace grant) or the static catalogue part (page bounds, semantics, external gates: compile-time intake constants, no technical configuration) is answered for any authenticated caller | owner: Codex (`runtime-manifest.controller.ts`, `retained-read-profile.ts`); effect on FE: only the `boundsSource` caption flips from FRONTEND_DEFAULT to SERVER_DECLARED |
| R-EVD | Mount `approvalEvidence: "SOURCE_DARK"` outside the local review profile, supply a port with real sections (prior economic history, evidence diff, obligations, receipt preview) and an `ApprovalEvidenceFieldAuthority` | needs Edge/Core inputs in `WP_K_CONTRACTS_2026-10-23.md`; owner Codex+Edge |
| R-EQS | Same for `equityProjectionSource`: a retained per-deployment equity series (workspace, currency, timestamp semantics, revision, digest, gaps, retention), an immutable Research band (reference + digest), `EQUITY_SERIES` / `EQUITY_BAND` policy purposes (6 seals, `PARENT_FIELD_SEAL_CAP` 32 to 38) | owner Edge + Research + Codex policy |
| R-N29 | After B1 lands in the integration branch, refresh the release-integrity pins (`scripts/refresh-release-integrity-ledgers.sh`; N29 then EDS-12). B1 changes `manager-model.contract.ts`, so the contract schema hash moves | owner Codex gate |

## 4. Needs a real Edge / PM / Core / TS source (exact requests; not Portal's to invent)

| Id | Field and route | Semantics | Owner |
|---|---|---|---|
| R-WIN | Manager fact `kind: "win_rate_pct"` (after B1 the contract admits it): `metric.unit = "PERCENT"`, `value` in `[0, 100]`, `denominator` = closed-trade count as an exact decimal string, `window` = the window the closed trades were counted in, `methodology_ref` naming the win definition (winning closed trades / closed trades, fees included or not stated), `effective_at_ms` = the time of the last counted close | closed-trade ledger per (alpha version, portfolio, deployment); one fact per deployment tuple; a deployment with no closed trade publishes the metric `UNAVAILABLE` + reason `NO_CLOSED_TRADES`, never `0` | PM / Edge (closed-trade ledger) |
| R-MDD | Manager fact `kind: "max_drawdown_pct"`: PERCENT, value `<= 0`, `window` stated, `methodology_ref` (peak-to-trough on which equity basis) | per deployment tuple; Portal never pools two drawdowns | TS / Edge |
| S-1 | `manager/series` points for NAV / NET_PNL / RETURN / DRAWDOWN on live data (route mounted, values dark) | exact decimal strings per bucket, gaps explicit | Edge / PM |
| S-4 | Capital statement naming table: `opening` vs `initial_funds`, decrease vs recall, `pending_fees` (FE-017) | one table with an owner and a test | PM |
| S-5 | Capability and grant text per operation / family (`command/model.ts:716,794,812`, FE-015): which capability and grant enable an operation | closed vocabulary with `reason_class`, `grant_ref`, `step_up_required` (FE-015 amendment) | Core / Portal governance |
| S-6 | Audit source "who did what" (FE-021) and unified subject event feed (FE-031): `/subjects/{kind}/{id}/events?from_ms&to_ms&kinds` with actor and receipt ref | needs a qualified TS journal; incident `historical_children` stays NOT_PUBLISHED until then | TS / Core |
| S-7 | Capital-flow ledger page (FE-032/046): `seq`, `command_id`, `receipt_ref`, `state`, per-basis edges, cursor | non-amount receipts allowed (SYNC section 0 row 1) | PM |
| S-8 | Stage facts values (FE-066/067/070/071/072): `runtime_state`, reconciliation verdict + unknown-order count, session rows, VN calendar, canary envelope rows, rollback-item check dates, trial calendar | typed branches are mounted; Edge must publish the facts | Edge |
| S-9 | Archived alpha list + paper-monitor return after archive + archive commands (FE-034/022) | PM + Research | PM / Research |

## 5. Where the B1 build lands (the result of section 2)

See the commit list in the package report; every built row has: contract (zod in `manager-model.contract.ts` and
`manager-dataset-invariants.ts`, generated schema/openapi/d.ts via `npm run generate`), fixture (`packages/contracts/tooling/execution-manager-p1-fixtures.mjs`
function, written by the generator), handler (reducer in `manager-model.ts`, no new route), unit spec, FE reader pass-through
(only `src/execution/v2/readers/*`), and a register entry (`SIMULATED_DATA_REGISTER_2026-10-22.md` section 2m) for the TEST_ONLY
values. Nothing here is a source receipt or an acceptance claim.
