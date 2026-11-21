# ELP2-04 — Planned route authorization inventory

Status: **DESIGN_ONLY / IMPLEMENTATION_PENDING / TEST_PENDING**.
This file records source presence and a proposed enforcement map. It is not a
protection receipt, an activation instruction or a claim that a route is safe.
Every implementation and test entry below is `PENDING`; runtime is
`NOT_OBSERVED`. Dependent implementation waits for ELP2-03's evaluator,
current-policy/revocation checkpoint and primary integration.

## 1. Inputs, pins and bounded ownership

- Parent-supplied source reference: `700aa6a47cdfc72c53ced8f1851144e1ab58f3e0`
  (ELP2-01) on `docs/research-loop-plan`, worktree
  `/home/bobby/portal-research`. ELP2-02 work is concurrent; this design does
  not repin its dirty files as landed source or predict ELP2-03's final API.
- Baseline enumeration: [ELP2-00 source census](../ELP2-00/source-census.json),
  source `be56efdf8a44b0fd8cd44202b04ada582293a1dd`;
  artifact SHA-256
  `2f2448ca1c88165412675b67bebe5f64e72de93974d8ecfaf15c05808141ca51`.
  Its source locators/hashes remain historical enumeration pins; implementation
  must reconcile source/handler drift and any routes added by 02/03 before exit.
- Authority: [phase task map](README.md), Unified §14.9, campaign
  `AGENT_WORKING_RULES.md`, Portal guide §4.8/§15 ELP2-04.
- Subagent owns this Markdown file only. No application/schema/migration,
  shared index, Git, test/build, DB, Docker, network or remote change is part
  of this output. No API/browser/runtime was exercised.
- Inventory method: read the existing census JSON, controller/service/query
  source and current guards. Do not duplicate the 00 JSON or count wildcard
  endpoints as all downstream routes.

Baseline totals: **112 Execution patterns / 28 controllers, 84 GET + 28 POST**.
All 112 have class-level `SessionGuard` in that source inventory. That proves
neither resource nor field authority. Existing handler-specific workspace,
capability, CSRF and business checks remain relevant and must be preserved.

## 2. Scope and disposition legend

The scope object name below is **proposed**, not an already published type.
ELP2-03's delivered evaluator is the authority for the actual contract.

A server-minted `AuthorizedExecutionQueryScope` must bind actor/current session
generation, viewer/source workspace, environment/profile, current policy and
binding revisions, resource tuples and field/action policy. Browser parameters
cannot mint/expand it. Scope must be mandatory at Execution query/service
boundaries for full-manager and restricted callers alike; an omitted scope
must not mean all rows. Keep Research/Planning shared-query semantics unchanged.

- `S` = baseline class-level `SessionGuard` only, **not** a complete description
  of additional handler/service checks and **not** an enforcement verdict.
- Each controller's **Locus** names the required ELP2-03-scope integration
  point. Every row inherits that locus, with an optional route-specific note.
- Test IDs abbreviate `ELP2-T04-xx` as `T04-xx`; these are proposed requirement
  mappings, not test executions or new coverage counts.
- `I/T=PENDING/PENDING` means implementation and test disposition are pending.
  A proposed `KEEP_RETIRED_410`, disabled or internal classification still
  requires source and direct-API evidence at implementation, not an automatic
  test exemption. No new exports or streams are commissioned here.
- Hidden existing resources and unknown IDs need a consistent safe denial/not-found
  policy before resource-dependent detail/count/provenance. Authorized empty is
  distinct from denied, incomplete source and unavailable publication.
- Preserve current legitimate legacy grants and gate-specific decisions. Do not
  replace all resource reads with `business.read_all`, grant new pending rights,
  or use broad ADMIN fallback. Full business read is not technical/mutation access.

## 3. All 112 baseline route patterns

All paths below are complete baseline patterns. Source paths are relative to
the repository root; line numbers come from the pinned00 census. Row statuses
are deliberately not updated from source presence to PASS.

### 3.1 ActivationController — 5 routes

Source: `apps/control-api/src/activation/activation.controller.ts`.  
Locus `ACT`: activation/activation.service.ts:260; current plan/detail/apply/verify resource and operation lookups; keep existing origin/CSRF, kill-switch and commissioning checks.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/activation/capabilities` | S | `ACT` · `capabilities:34` | T04-04, T04-06, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/activation/plans/:plan_id` | S | `ACT` · `detail:40` | T04-04, T04-06, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/activation/plans` | S | `ACT` · `plan:50` · current command-specific scope plus all existing gate/security/CAS preconditions | T04-04, T04-06, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/activation/plans/:plan_id/apply` | S | `ACT` · `apply:71` · current commit-time authority; retry/status stay bound to original actor/resource/policy | T04-04, T04-06, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/activation/plans/:plan_id/verify` | S | `ACT` · `verify:86` | T04-04, T04-06, T04-08, T04-12 | PENDING/PENDING |

### 3.2 CanaryController — 2 routes

Source: `apps/control-api/src/canary/canary.controller.ts`.  
Locus `GATE`: canary service/repository exact deployment/envelope, current canary read/decide and resource scope; not a fourth source environment.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/deployments/:deployment_id/canary` | S | `GATE` · `detail:29` | T04-04, T04-07, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/canary-envelopes` | S | `GATE` · `create:39` · exact object/action authority; preserve current business validators | T04-04, T04-07, T04-08, T04-12 | PENDING/PENDING |

### 3.3 CommandCenterController — 1 routes

Source: `apps/control-api/src/command-center/command-center.controller.ts`.  
Locus `COMP`: command-center snapshot composition; filter authorized operational population before counters and joins.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/command-center` | S | `COMP` · `snapshot:20` | T04-03, T04-05, T04-08, T04-11 | PENDING/PENDING |

### 3.4 ExecutionAnalyticsController — 15 routes

Source: `apps/control-api/src/execution/analytics.controller.ts`.  
Locus `AN`: execution analytics/local-query/portfolio360 services and analytics.proxy; resource authorization before analytic inputs, previews and derived totals.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `POST /api/v1/execution/approvals/:approvalId/capital-preview` | S | `AN` · `capitalPreview:44` · approval + gate-specific capital-preview authority; not generic ADMIN bypass | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/orders/:orderId/funnel` | S | `AN` · `orderFunnel:65` · exact order lineage before funnel/child joins | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/alphas/:alphaId/insight-previews` | S | `AN` · `insightPreviews:70` · exact Alpha plus preview authority; computation POST is not permission to read peers | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/alphas/equity-sparklines` | S | `AN` · `equitySparklines:89` · authorized Alpha set before batch/sparkline population | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/alphas/:alphaId/stage-drift` | S | `AN` · `stageDrift:100` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/portfolios/:portfolioId/correlation` | S | `AN` · `portfolioCorrelation:111` · authorized analytical input set; restricted caller must not infer peer correlations | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/portfolios/:portfolioId/capital-ledger` | S | `AN` · `capitalLedger:122` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/portfolios/:portfolioId/cross-equity` | S | `AN` · `portfolioCrossEquity:139` · full portfolio/equity authority, not linked portfolio discovery | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/broker-bindings/:bindingId/exposure` | S | `AN` · `bindingExposure:149` · internal/physical binding policy before exposure totals | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/deployments/:deploymentId/query-analytics` | S | `AN` · `deploymentQueryAnalytics:154` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/alphas/:alphaId/query-analytics` | S | `AN` · `alphaQueryAnalytics:163` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/portfolios/:portfolioId/query-analytics` | S | `AN` · `portfolioQueryAnalytics:168` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/live-gates/:approvalId/query-analytics` | S | `AN` · `liveGateQueryAnalytics:177` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/views/observed-timeline` | S | `AN` · `observedTimeline:188` · authorized event population and metadata, no hidden source counts | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/deployments/paper/:deploymentId/projection/:panel` | S | `AN` · `paperWorkbenchPanel:203` | T04-03, T04-04, T04-05, T04-08, T04-12 | PENDING/PENDING |

### 3.5 ExecutionContractAuthorityController — 1 routes

Source: `apps/control-api/src/execution/contract-authority.controller.ts`.  
Locus `META`: contract-authority service; public business-contract metadata only, no technical credentials or resource-existence oracle.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/contract-authority` | S | `META` · `authority:32` | T04-08, T04-11 | PENDING/PENDING |

### 3.6 ExecutionCurrentSourceController — 2 routes

Source: `apps/control-api/src/execution/current-source.controller.ts`.  
Locus `RETIRED`: current-source.controller.ts:8; proposed disposition KEEP_RETIRED_410, never republish raw relation/browser selector.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/current-source/:environment/screens/:screenId` | S | `RETIRED` · `screen:8` | T04-08, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/current-source/:environment/screens/:screenId/sources/:sourceId/relations/:relation` | S | `RETIRED` · `relation:13` | T04-08, T04-11 | PENDING/PENDING |

### 3.7 ExecutionDurableMirrorIntegrityController — 1 routes

Source: `apps/control-api/src/execution/durable-mirror-integrity.controller.ts`.  
Locus `TECH`: durable-mirror integrity diagnostics; explicit technical permission, sanitized details and scoped counts; business.read_all alone insufficient.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/durable-mirror/integrity` | S | `TECH` · `integrity:44` | T04-03, T04-05, T04-08, T04-11 | PENDING/PENDING |

### 3.8 ExecutionFinancialChartController — 2 routes

Source: `apps/control-api/src/execution/financial-chart.controller.ts`.  
Locus `FIN`: financial-chart service and durable-financial repository; subject policy before range query, aggregation and decision records, same predicate for coverage.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/views/equity-chart` | S | `FIN` · `chart:74` | T04-03, T04-04, T04-05, T04-07, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/views/risk-decisions` | S | `FIN` · `decisions:93` | T04-03, T04-04, T04-05, T04-07, T04-11 | PENDING/PENDING |

### 3.9 ExecutionMarketCandlesController — 1 routes

Source: `apps/control-api/src/execution/market-candles.controller.ts`.  
Locus `MARKET`: market-candles service; authorized environment/dataset capability, existing public-source/provenance rules and limits; no invented resource ownership.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/market/venue-candles` | S | `MARKET` · `get:66` | T04-03, T04-08, T04-11 | PENDING/PENDING |

### 3.10 MarketContextController — 2 routes

Source: `apps/control-api/src/execution/market-context.controller.ts`.  
Locus `MARKET`: market-context service; authorized profile/dataset, existing qualification checks, no source-credential exposure.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/market/latest` | S | `MARKET` · `latest:45` | T04-03, T04-08, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/market/candles` | S | `MARKET` · `candles:56` | T04-03, T04-08, T04-11 | PENDING/PENDING |

### 3.11 MaximumDataOperationController — 3 routes

Source: `apps/control-api/src/execution/maximum-data-operation.controller.ts`.  
Locus `NAMED`: maximum-data-operation.service.ts:72 and retained-operation-page.ts:12; per-operation row/field policy, current scope in continuation; manifest filters capability metadata.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/manager/deployments` | S | `NAMED` · `deployments:40` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/manager/operations` | S | `NAMED` · `operationsManifest:62` · safe authorized alias/capability metadata; no raw source identity | T04-01, T04-03, T04-04, T04-05, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/manager/current/:operationId` | S | `NAMED` · `currentRelation:72` · all 54 aliases require per-alias policy coverage; this pattern is not one generic grant | T04-01, T04-03, T04-04, T04-05, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |

### 3.12 OperationalCompositionController — 7 routes

Source: `apps/control-api/src/execution/operational-composition.controller.ts`.  
Locus `COMP`: operational-composition service; scope each approval/review/waiver/incident/operation before nested composition and counts; preserve existing gate authority.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/compositions/approvals/:approval_id` | S | `COMP` · `approval:52` | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/compositions/exit-reviews/:review_id` | S | `COMP` · `exitReview:59` · PaperExit read scope before evidence snapshot and decision context | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/compositions/waivers` | S | `COMP` · `waivers:71` | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/compositions/operations` | S | `COMP` · `operations:78` | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/compositions/incidents/:incident_id` | S | `COMP` · `incident:88` | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/compositions/command-center` | S | `COMP` · `commandCenter:94` · exact current scope before snapshot/stream/composition, as applicable | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/compositions/admin-action-drawer` | S | `COMP` · `adminActionDrawer:99` | T04-03, T04-04, T04-05, T04-08, T04-11, T04-12 | PENDING/PENDING |

### 3.13 PortalDerivationsController — 5 routes

Source: `apps/control-api/src/execution/portal-derivations.controller.ts`.  
Locus `AN`: portal-derivations service; authorization before capital/quality/activity/group derivation, no denied physical/peer denominator.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/derivations/source-health` | S | `AN` · `sourceHealth:32` | T04-03, T04-04, T04-05, T04-10, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/derivations/deployments/:deployment_id/execution-quality` | S | `AN` · `executionQuality:38` | T04-03, T04-04, T04-05, T04-10, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/derivations/conditional-groups/:group_id` | S | `AN` · `conditionalLegs:45` | T04-03, T04-04, T04-05, T04-10, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/derivations/portfolios/:portfolio_id/capital` | S | `AN` · `portfolioCapital:52` | T04-03, T04-04, T04-05, T04-10, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/derivations/alphas/:alpha_id/activity` | S | `AN` · `alphaActivity:59` | T04-03, T04-04, T04-05, T04-10, T04-11 | PENDING/PENDING |

### 3.14 ExecutionProfileHistoryController — 1 routes

Source: `apps/control-api/src/execution/profile-history.controller.ts`.  
Locus `HIST`: profile-history.service.ts:30; mandatory principal/scope, identical predicates in profile-projection.repository.ts:376 page and :627 coverage.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/history/:environment/:relationKey` | S | `HIST` · `read:15` | T04-03, T04-04, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |

### 3.15 ExecutionProfileReadAdapterController — 1 routes

Source: `apps/control-api/src/execution/profile-read-adapter.controller.ts`.  
Locus `ADAPTER`: profile-read-adapter.service.ts:113; policy intersection before caller filters/:145 selection/:154 counts and limits, adapter-specific fields.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/adapters/:environment/:capabilityId` | S | `ADAPTER` · `read:21` | T04-01, T04-03, T04-04, T04-05, T04-08, T04-11 | PENDING/PENDING |

### 3.16 ExecutionRealtimeController — 5 routes

Source: `apps/control-api/src/execution/realtime.controller.ts`.  
Locus `STREAM`: local-read-authority.ts:24 and realtime controller snapshot/open/send boundaries; current resource/field policy, revision-bound cursor and revoke; retain existing disabled paths.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/realtime/diagnostics` | S | `STREAM` · `realtimeDiagnostics:60` · technical permission; no business-read-to-technical elevation | T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/profiles/:environment/realtime-snapshot` | S | `STREAM` · `profileSnapshot:121` · filter fields/rows and source metadata before snapshot bytes | T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/profiles/:environment/stream` | S | `STREAM` · `profileStream:145` · disabled retained path preserved; existing enabled path scope/revoke at delivery | T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/command-center/stream` | S | `STREAM` · `commandCenter:235` · exact current scope before snapshot/stream/composition, as applicable | T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/command-center/realtime-snapshot` | S | `STREAM` · `commandCenterSnapshot:282` · same resource/field policy as corresponding snapshot/stream | T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |

### 3.17 ExecutionRetainedReviewController — 1 routes

Source: `apps/control-api/src/execution/retained-review.controller.ts`.  
Locus `CONTEXT`: retained-review.controller.ts:25 and :83; current permissions and authorized metadata counts/oldest/newest before response, recheck after data flight.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/retained-review` | S | `CONTEXT` · `context:25` | T04-03, T04-05, T04-08, T04-10, T04-11, T04-12 | PENDING/PENDING |

### 3.18 ExecutionRuntimeManifestController — 1 routes

Source: `apps/control-api/src/execution/runtime-manifest.controller.ts`.  
Locus `META`: runtime-manifest service; split safe product availability from technical topology/config, filter per authorized environment/capability.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/runtime-manifest` | S | `META` · `manifest:32` | T04-08, T04-11 | PENDING/PENDING |

### 3.19 ExecutionSubjectActivityController — 2 routes

Source: `apps/control-api/src/execution/subject-activity.controller.ts`.  
Locus `ACTIVITY`: subject-activity.service.ts:103; subject authorization before mirror.subjectRows/subjectCoverage, filtered fields and policy-bound cursor.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/resources/alphas/:alphaId/:relation` | S | `ACTIVITY` · `alpha:40` | T04-01, T04-03, T04-04, T04-07, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/resources/accounts/:accountId/:relation` | S | `ACTIVITY` · `account:50` | T04-01, T04-03, T04-04, T04-07, T04-11, T04-12 | PENDING/PENDING |

### 3.20 GovernanceController — 22 routes

Source: `apps/control-api/src/governance/governance.controller.ts`.  
Locus `GOV`: governance service/repository, PaperExit and operations dispatch; preserve existing gate capabilities, add exact resource scope before list/count/detail/plan/status/audit joins.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/governance/review-capture-capabilities` | S | `GOV` · `captureCapabilities:68` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/r2/capture` | S | `GOV` · `captureR2:74` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/paper-exit/create` | S | `GOV` · `createPaperExit:83` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/sandbox/capture-note` | S | `GOV` · `captureSandboxNote:92` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/operations` | S | `GOV` · `operationsQueue:101` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/:operation_id/acknowledge` | S | `GOV` · `acknowledgeOperation:114` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/:operation_id/resolve` | S | `GOV` · `resolveOperation:134` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/commands/catalog` | S | `GOV` · `catalogue:154` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/commands/tasks` | S | `GOV` · `commandTasks:177` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/commands/tasks/:task_id/run` | S | `GOV` · `runCommandTask:186` · exact task/action capability, resource scope and existing disabled catalogue | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/commands/tasks/:task_id/plan` | S | `GOV` · `planCommandTask:207` · exact task/action capability and resource-bound plan | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/approvals` | S | `GOV` · `approvals:228` · gate/resource predicates on both page and separate counts | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/approvals` | S | `GOV` · `createApproval:237` · preserve Research publication authority and workspace; no new researcher read_all requirement | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/waivers` | S | `GOV` · `conditionsRegister:260` · same authorized gate/resource population before conditions page/count | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/approvals/history` | S | `GOV` · `approvalHistory:273` · current read grant before historical decision attribution | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/approvals/:approval_id/r1` | S | `GOV` · `r1:282` · current R1 read plus exact approval/resource lineage | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/approvals/:approval_id/r2` | S | `GOV` · `r2:292` · current R2 read; do not reuse R1 decision executor or relax business prerequisites | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/approvals/:approval_id/live` | S | `GOV` · `live:302` · current Live read; do not auto-enable Live mutation/upstream trading | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/governance/exit-reviews/:review_id` | S | `GOV` · `exitReview:317` · PaperExit read scope before evidence snapshot and decision context | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/commands/plans` | S | `GOV` · `plan:327` · current command-specific scope plus all existing gate/security/CAS preconditions | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/:operation_id/apply` | S | `GOV` · `apply:408` · current commit-time authority; retry/status stay bound to original actor/resource/policy | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/operations/:operation_id` | S | `GOV` · `operation:454` · status/audit read scope follows original operation resource, not opaque ID possession | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |

### 3.21 LiveOperationsController — 1 routes

Source: `apps/control-api/src/live/live-operations.controller.ts`.  
Locus `GATE`: live-operations service exact deployment scope plus current Live read capability; full business read does not commission commands.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/deployments/:deployment_id/live` | S | `GATE` · `detail:23` | T04-04, T04-07, T04-08 | PENDING/PENDING |

### 3.22 ManagerListsController — 4 routes

Source: `apps/control-api/src/manager-lists/manager-lists.controller.ts`.  
Locus `LIST`: manager-lists.service.ts:104/:174 and repository; server visibility before SQL list/count/sort and nested child/summary aggregation, restricted portfolio shell.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/alphas` | S | `LIST` · `fleet:26` | T04-01, T04-02, T04-03, T04-05, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/portfolios` | S | `LIST` · `portfolios:34` | T04-01, T04-02, T04-03, T04-05, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/broker-bindings` | S | `LIST` · `bindings:42` | T04-01, T04-02, T04-03, T04-05, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/broker-bindings/:binding_id` | S | `LIST` · `binding:50` | T04-01, T04-02, T04-03, T04-05, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |

### 3.23 IncidentController — 9 routes

Source: `apps/control-api/src/operations/incident.controller.ts`.  
Locus `INCIDENT`: incident operations service/repository; exact incident plus correlated operation/resource scope, current read/action capability and commit recheck.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `POST /api/v1/execution/operations/incidents` | S | `INCIDENT` · `create:50` · exact object/action authority; preserve current business validators | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/operations/incidents/:incident_id` | S | `INCIDENT` · `detail:66` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/acknowledge` | S | `INCIDENT` · `acknowledge:76` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/assign` | S | `INCIDENT` · `assign:93` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/annotations` | S | `INCIDENT` · `annotate:110` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/evidence` | S | `INCIDENT` · `evidence:127` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/operations` | S | `INCIDENT` · `correlateOperation:144` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/mitigate` | S | `INCIDENT` · `mitigate:161` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/operations/incidents/:incident_id/resolve` | S | `INCIDENT` · `resolve:178` | T04-03, T04-04, T04-06, T04-07, T04-08, T04-11, T04-12 | PENDING/PENDING |

### 3.24 PaperReadController — 4 routes

Source: `apps/control-api/src/paper-read/paper-read.controller.ts`.  
Locus `PRODUCT`: product-read-source.ts:108/:192/:282/:584; intersect structural lineage with current authorized resources before sorting/counts/paging and Paper composition.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/screens/paper` | S | `PRODUCT` · `overview:31` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/screens/paper/:deployment_id` | S | `PRODUCT` · `workbench:39` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/screens/paper/:deployment_id/vn-market` | S | `PRODUCT` · `workbenchVnm:48` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/screens/blotter` | S | `PRODUCT` · `blotter:57` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-11, T04-12 | PENDING/PENDING |

### 3.25 ProfileReadController — 3 routes

Source: `apps/control-api/src/profile-read/profile-read.controller.ts`.  
Locus `PRODUCT`: profile-read service and product-read-source; Sandbox/Live/account scope before relation fetch and account/broker joins; physical redaction.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/screens/sandbox` | S | `PRODUCT` · `sandbox:26` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-10, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/screens/live` | S | `PRODUCT` · `live:31` · current Live read; do not auto-enable Live mutation/upstream trading | T04-01, T04-03, T04-04, T04-05, T04-07, T04-10, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/screens/accounts/:account_id` | S | `PRODUCT` · `account:36` | T04-01, T04-03, T04-04, T04-05, T04-07, T04-10, T04-11 | PENDING/PENDING |

### 3.26 ResourceReadController — 4 routes

Source: `apps/control-api/src/resource-read/resource-read.controller.ts`.  
Locus `RESOURCE`: resource-read.service.ts:173/:221/:240; current resource scope before selection/composition; field DTO and post-await check after shared DATA template.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/resources/alphas/:resource_id` | S | `RESOURCE` · `alpha:38` | T04-01, T04-02, T04-04, T04-05, T04-07, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/resources/portfolios/:resource_id` | S | `RESOURCE` · `portfolio:43` | T04-01, T04-02, T04-04, T04-05, T04-07, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/resources/accounts/:resource_id` | S | `RESOURCE` · `account:48` | T04-01, T04-02, T04-04, T04-05, T04-07, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |
| `GET /api/v1/execution/resources/bindings/:resource_id` | S | `RESOURCE` · `binding:53` | T04-01, T04-02, T04-04, T04-05, T04-07, T04-09, T04-10, T04-11, T04-12 | PENDING/PENDING |

### 3.27 SandboxCertificationController — 5 routes

Source: `apps/control-api/src/sandbox/sandbox-certification.controller.ts`.  
Locus `GATE`: sandbox certification service/repository; exact deployment/certification scope, distinct read/submit/decide/promotion authorities and current grant at commit.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/deployments/:deployment_id/certification` | S | `GATE` · `detail:45` | T04-04, T04-06, T04-07, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/sandbox-certifications` | S | `GATE` · `create:55` · exact object/action authority; preserve current business validators | T04-04, T04-06, T04-07, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/sandbox-certifications/:certification_id/submit` | S | `GATE` · `submit:73` | T04-04, T04-06, T04-07, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/sandbox-certifications/:certification_id/decisions` | S | `GATE` · `decide:96` | T04-04, T04-06, T04-07, T04-08, T04-12 | PENDING/PENDING |
| `POST /api/v1/execution/governance/sandbox-certifications/:certification_id/promotion-plans` | S | `GATE` · `planPromotion:119` | T04-04, T04-06, T04-07, T04-08, T04-12 | PENDING/PENDING |

### 3.28 ScreenBffController — 2 routes

Source: `apps/control-api/src/screen-bff/screen-bff.controller.ts`.  
Locus `META`: screen-bff.service.ts:20/:46; safe screen metadata and effective actions from evaluator, resource/deep-link policy; no role-only permission inference.

| Method / path | Current guard | Required scope / specific check | Proposed test IDs | I/T |
| --- | --- | --- | --- | --- |
| `GET /api/v1/execution/screen-contracts` | S | `META` · `catalogue:22` | T04-04, T04-08, T04-11 | PENDING/PENDING |
| `GET /api/v1/execution/screen-contracts/:screen_id` | S | `META` · `detail:30` | T04-04, T04-08, T04-11 | PENDING/PENDING |

## 4. The 54 named aliases behind one route

The 112 count includes **one** `GET /api/v1/execution/manager/current/:operationId`
pattern, not 54 additional controller routes. Its alias coverage must be
expanded at the policy/test layer, not hidden behind a single happy-path test.

Canonical linkage (do not maintain a second drifting alias catalogue here):

- Baseline `relation_registry` in [source census](../ELP2-00/source-census.json):
  **96 relations = 54 SCREEN_BOUND + 16 PROJECTION_INPUT + 13 AUDIT_ONLY +
  13 INTERNAL_ONLY**; the latter 42 must not become browser aliases.
- `apps/control-api/src/execution/eds11r-manager-relation.registry.ts:79`
  validates counts; `:131–146` compiles three unique indexes
  (route/operation/relation), each 54. Its canonical generated source is
  `apps/control-api/src/execution/eds11r-manager-relation-registry.generated.ts`,
  imported at registry line 4. No second alias manifest is proposed here.
- `eds11r-manager-relation.registry.ts:173` resolves route aliases;
  `:207–219` emits the browser-safe manifest.
- `maximum-data-operation.controller.ts:72` resolves the accepted named route;
  `maximum-data-operation.service.ts:72` and retained compatibility
  `retained-operation-page.ts:12` both need policy enforcement.

Planned alias coverage artifact/test must iterate the canonical registry and
record for **each 54**: operation/route ID, required resource grain, recognized
identity fields, allowed output fields, available policy adapter, retained and
read-through paths, cursor binding and direct-API negative case. Status is
**PENDING for all 54**. A source schema allowlist is not a caller field allowlist.

If a relation cannot safely resolve a row's authorized resource, return the
typed unavailable/denied disposition for that dependent operation; never infer
from a physical account or owner display string, nor globally disable unrelated
working routes. Apply policy before page selection, counts, ordering and
continuation. Full-manager business paths and approved restricted paths need
positive tests as well as denies. Rejected aliases must not accept arbitrary
source/schema/relation selectors.

### 4.1 Explicit alias-by-alias planning addendum

Read-only expansion at parent reference `b448c0be655817dc49dd02f86aa2544e64c00d48`.
This preserves the earlier linkage-only design above and fills its planning
matrix; it does **not** change the canonical registry or deliver enforcement.
Registry SHA-256:
`37076f0969d905b48d4e6e3244bf14bd5896fd3c9e20c4e68190e728fd41b1cb`.
All54 entries below remain **PENDING / NOT_RUN**. Canonical relation names here
are server-side review locators, never browser selectors or newly published
routes. Alias suffixes resolve under
`GET /api/v1/execution/manager/current/:operationId`.

Actions below are from the current03 finite `ACCESS_ACTIONS` vocabulary, not
new `order.read`/`fill.read` capabilities. A reviewed, current
`business.read_all` covers the business resource population subject to
business-safe field policy, **not** technical/maintenance data. A narrow action
also needs an exact resource/environment selector, current accepted relations
and approved field policy; it does not implicitly grant every listed field.
An `or` between resource actions is chosen by a qualified typed resolver for
the actual scope, never by unioning fragments of unrelated grants.

Field-policy legend (design IDs, not published enums/config):

- **A:** approved Alpha/strategy/own identity metadata; researcher identity must
  come from stable verified mapping, never trader/name/deployer equality.
- **F:** approved internal-account/own-deployment financial fields; custody
  totals, peers, full-pool limits and subtraction denominators remain withheld.
- **B:** explicit physical-binding/custody field scope, not inherited from an
  internal account or a shared venue ID.
- **L:** linked-Portfolio shell/approved own slice only. Pending exact field
  matrix stays unavailable/default-deny for new disclosure; no peer IDs/counts,
  total capital, rank, full PortfolioScore or complete portfolio coverage.
- **P:** full Portfolio financial fields under exact portfolio authority;
  `portfolio.discover_linked` alone is insufficient.
- **X:** order/fill/conditional lifecycle details for the exact authorized
  account/Alpha/deployment tuple, including nested-child filtering.
- **J:** scoped audit/status/receipt fields plus the referenced business-resource
  policy; no opaque-ID possession, actor display string or digest bypass.
- **D:** approved own-slice business-quality/status fields with scoped counts.
- **T:** separately authorized sanitized technical diagnostics; no
  `business.read_all` fallback.
- **M:** safe product/instrument/calendar metadata only, without converting
  catalogue visibility into private holdings/resource discoverability.

Every row inherits these two-path enforcement and proof requirements:
`MaximumDataOperationService.relationPage` and `retainedOperationPage` must
apply the same resolved scope/field intersection **before** page selection,
ordering, counts/coverage and continuation issuance. Current retained code
sorts/slices after scalar projection; that scalar allowlist is not caller
authorization. Read-through may use only a source-qualified scope operation or
a complete bounded authorized input; filtering one global source page is not
an exact authorized query. Missing/ambiguous resolver means a typed unavailable/
denied disposition for that operation, not guessed ownership or global fallback.

Planned alias probe `A01…A54` is a case label under T04, **not an extra gate or
a claimed new test count**. Each needs a valid full-manager or approved narrow
positive, hidden-row/field negative, environment and unknown/hidden ID parity,
retained/read-through parity, policy-bound cursor/cache and post-await revoke.
Tests listed are requirement mappings, all **NOT_RUN**.

| Case | Exact operationId · alias | Canonical server relation · declared row key | Required resource binding / action | Field-policy decision | Planned tests / disposition |
| --- | --- | --- | --- | --- | --- |
| A01 | `managerAccountBalancesPageV1` · `account-balances` | `public.account_balances` · `account_id, currency` | ACCOUNT(account_id), currency; resolve INTERNAL versus PHYSICAL before fields; **account.read** | F: free/locked/total only approved internal account; no physical/visible subtraction | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A02 | `managerAccountPoliciesPageV1` · `account-policies` | `public.account_policies` · `account_policy_id` | ACCOUNT(account_id), policy(account_policy_id); exact mode/venue; **account.read** | F: policy/fee/margin settings only approved account fields; no cross-account defaults | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A03 | `managerAccountReservationsPageV1` · `account-reservations` | `public.account_reservations` · `reservation_id` | ACCOUNT(account_id) + strategy_id/client_order_id lineage; **account.read** | F: reservations/amount/reason only authorized account+deployment tuple | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A04 | `managerAccountSyncCurrentStatePageV1` · `account-sync-current-state` | `public.account_sync_current_state` · `account_id` | ACCOUNT(account_id); sync/state digest is data identity only; **account.read** | F: buying_power/currency plus safe own sync status; digests not access proof | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A05 | `managerAccountSyncEffectivePageV1` · `account-sync-effective` | `public.account_sync_effective` · `sync_id` | ACCOUNT(account_id); sync_id has no declared primary key; **account.read** | F: bound account metrics/status; do not infer physical custody or uniqueness | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A06 | `managerAccountSyncSnapshotsPageV1` · `account-sync-snapshots` | `public.account_sync_snapshots` · `sync_id` | ACCOUNT(account_id); sync_id and historical archive references; **account.read** | F: current account rights before historical rows; archive handles not download rights | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A07 | `managerAccountsPageV1` · `accounts` | `public.accounts` · `account_id` | ACCOUNT(account_id) + strategy_id via verified current relation; **account.read** | F/A: approved internal identity; external_account_ref/trader_id not automatically public | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A08 | `managerAlphaRiskConfigPageV1` · `alpha-risk-config` | `public.alpha_risk_config` · `alpha_id` | ALPHA(alpha_id), current owner/membership and accepted environment; **alpha.read** | A/F: risk settings are separately approved fields, not granted by discovery | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A09 | `managerAlphasPageV1` · `alphas` | `public.alphas` · `alpha_id` | ALPHA(alpha_id), verified current owner identity, not source name; **alpha.read** | A: approved own Alpha metadata; no enumeration of peer IDs | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A10 | `managerBrokerAccountSyncCurrentStatePageV1` · `broker-account-sync-current-state` | `public.broker_account_sync_current_state` · `venue, mode, external_account_ref` | BINDING via (venue, mode, external_account_ref) qualified resolver; **binding.read** | B: physical buying_power/digests require custody field scope | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A11 | `managerBrokerAccountSyncEffectivePageV1` · `broker-account-sync-effective` | `public.broker_account_sync_effective` · `sync_id` | BINDING via external_account_ref + venue/mode; sync_id not authority; **binding.read** | B: same physical scope, no inferential balance from shared account | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A12 | `managerBrokerAccountSyncSnapshotsPageV1` · `broker-account-sync-snapshots` | `public.broker_account_sync_snapshots` · `sync_id` | BINDING via external_account_ref + venue/mode, current before archive; **binding.read** | B: historical custody scope; archive metadata separately allowlisted | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A13 | `managerBrokerSyncStateHistoryPageV1` · `broker-sync-state-history` | `public.broker_sync_state_history` · `history_id` | Resolve (scope_type,scope_key,mode,venue) to ACCOUNT/BINDING; **account.read or binding.read according to resolved scope** | D: approved status only; unresolved/unknown scope type cannot fall back to all | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A14 | `managerBrokerSyncValuationCurrentStatePageV1` · `broker-sync-valuation-current-state` | `public.broker_sync_valuation_current_state` · `scope_type, scope_key, mode, venue` | Resolve scope_type/scope_key + mode/venue to ACCOUNT/BINDING; **account.read or binding.read according to resolved scope** | F/B: physical/internal valuation partition; no combined subtraction oracle | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A15 | `managerBrokerSyncValuationHistoryPageV1` · `broker-sync-valuation-history` | `public.broker_sync_valuation_history` · `scope_type, scope_key, mode, venue, bucket_start` | Same typed ACCOUNT/BINDING resolver, including bucket_start; **account.read or binding.read according to resolved scope** | F/B: current grant on historical valuation; restrict all bucket counts/bounds | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A16 | `managerCommandAckEvidencePageV1` · `command-ack-evidence` | `public.command_ack_evidence` · `evidence_id` | Join command_id to command journal and exact account/Alpha/deployment lineage; **audit.read** | J: safe authorized receipt fields; source_stream/message IDs separately redacted | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A17 | `managerCommandJournalPageV1` · `command-journal` | `public.command_journal` · `command_id` | command_id -> ACCOUNT/ALPHA + current deployment tuple; aggregate_key not authority; **audit.read** | J: audit scope plus business-resource scope; idempotency scopes/keys not blindly public | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A18 | `managerConditionalOrderGroupLegsPageV1` · `conditional-order-group-legs` | `public.conditional_order_group_legs` · `group_id, leg_id` | group_id -> conditional_order_groups -> ACCOUNT/ALPHA/deployment; **account.read** | X: child legs inherit exact parent scope; full prices/qty only approved field set | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A19 | `managerConditionalOrderGroupsPageV1` · `conditional-order-groups` | `public.conditional_order_groups` · `group_id` | group_id + account_id/strategy_id/session -> deployment tuple; **account.read** | X: plan/error/correlation/internal IDs allowlisted; no hidden peer group counts | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A20 | `managerDeadLettersPageV1` · `dead-letters` | `public.dead_letters` · `id` | ROOT technical transport scope; no trustworthy business-resource key in this row; **maintenance.read** | T: explicit sanitized diagnostic fields; business.read_all is insufficient | T04-08/11/12; **PENDING / NOT_RUN** |
| A21 | `managerExecutionReplayJobsPageV1` · `execution-replay-jobs` | `public.execution_replay_jobs` · `replay_id` | replay_id -> qualified immutable job/resource binding; row lacks business scope; **audit.read plus original job resource authority** | J: status/digest only if job binding qualified; error text and mismatch counts scoped | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A22 | `managerExecutionSessionsPageV1` · `execution-sessions` | `public.execution_sessions` · `execution_session_id` | execution_session_id + account_id/strategy_id/mode/venue; **account.read** | X/F: only authorized deployment session counters; no whole-account pool counts | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A23 | `managerFillsPageV1` · `fills` | `public.fills` · `fill_id, trade_time` | ACCOUNT(account_id) + strategy_id/session/order lineage, fill_id/trade_time; **account.read** | X/F: exact fills/costs for authorized tuple; not broker/global replay authority | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A24 | `managerInstrumentAliasesPageV1` · `instrument-aliases` | `public.instrument_aliases` · `venue, product, alias` | Qualified instrument alias -> canonical instrument, restricted to authorized context; **alpha.read on referencing Alpha or business.read_all** | M: product instrument metadata only; no private holdings implied by catalogue | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A25 | `managerInstrumentMetadataHistoryPageV1` · `instrument-metadata-history` | `public.instrument_metadata_history` · `history_id` | canonical_instrument_id -> permitted instrument context, history_id; **alpha.read on referencing Alpha or business.read_all** | M: public metadata history, not grant to historical portfolio/holdings | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A26 | `managerInstrumentsPageV1` · `instruments` | `public.instruments` · `instrument_id` | instrument_id/canonical_instrument_id -> authorized instrument context; **alpha.read on referencing Alpha or business.read_all** | M: product precision/lot/margin metadata; no account/private configuration | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A27 | `managerMarginBalancesPageV1` · `margin-balances` | `public.margin_balances` · `account_id, instrument_id, currency` | ACCOUNT(account_id), instrument_id/currency; classify internal/custody; **account.read** | F: margin totals only approved account; native pool margin not implicit | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A28 | `managerOperatorOperationsPageV1` · `operator-operations` | `public.operator_operations` · `operation_id` | Resolve scope_type/scope_id to canonical resource; actor string not principal mapping; **audit.read plus resolved business-resource authority** | J: scoped operator status/reason; hide peer actor/detail and unknown typed scopes | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A29 | `managerOrderBracketLegsPageV1` · `order-bracket-legs` | `public.order_bracket_legs` · `leg_id` | bracket_group_id -> order_brackets -> ACCOUNT/ALPHA/deployment; **account.read** | X: parent/child/OCO leg facts only within approved parent scope | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A30 | `managerOrderBracketsPageV1` · `order-brackets` | `public.order_brackets` · `bracket_group_id` | bracket_group_id + account_id/strategy_id/session -> deployment; **account.read** | X: bracket/risk/session references and error text require field policy | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A31 | `managerOrdersPageV1` · `orders` | `public.orders` · `order_id` | ACCOUNT(account_id) + strategy_id/session -> deployment; order_id; **account.read** | X/F: order facts in exact tuple; trader/external identifiers and errors allowlisted | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A32 | `managerPaperAccountSeedPageV1` · `paper-account-seed` | `public.paper_account_seed` · `account_id, currency` | ACCOUNT(account_id), currency, paper environment; **account.read** | F: initial_balance is finance; Paper seed never actual NAV or cross-mode permission | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A33 | `managerPaperMatcherConfigPageV1` · `paper-matcher-config` | `public.paper_matcher_config` · `venue, instrument_id` | venue/instrument_id within authorized Paper deployment; not a user-owned entity; **account.read on referencing Paper account or business.read_all** | M/F: approved simulation config fields; not permission to mutate matcher config | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A34 | `managerPaperOpenOrdersPageV1` · `paper-open-orders` | `public.paper_open_orders` · `account_id, client_order_id` | ACCOUNT(account_id), client_order_id + strategy_id, Paper only; **account.read** | X: approved open orders for authorized tuple; expiry/status not total-history proof | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A35 | `managerPerformanceProjectionCurrentStatePageV1` · `performance-projection-current-state` | `public.performance_projection_current_state` · `scope_type, scope_key, currency` | Resolve scope_type/scope_key/currency to ACCOUNT/PORTFOLIO/ALPHA; **Resolved account.read / portfolio.read / alpha.read** | F/P: aggregate only authorized source population; no full portfolio via own Alpha | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A36 | `managerPortfolioAllocationsPageV1` · `portfolio-allocations` | `public.portfolio_allocations` · `allocation_id` | PORTFOLIO(portfolio_id) + deployment_id/account_id/strategy_id tuple; **portfolio.read; restricted branch requires portfolio.read_restricted** | L/F: own approved allocation slice only; shell discovery never amounts/counts | T04-02/03/04/09/10/11/12; **PENDING / NOT_RUN** |
| A37 | `managerPortfolioAuditCurrentStatePageV1` · `portfolio-audit-current-state` | `public.portfolio_audit_current_state` · `action, target_type, target_id` | Resolve target_type/target_id + action to canonical business resource; **audit.read plus resolved business-resource authority** | J: repeat_count/timestamps scoped; unknown target types not global audit authority | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A38 | `managerPortfolioCapitalLedgerPageV1` · `portfolio-capital-ledger` | `public.portfolio_capital_ledger` · `capital_ledger_id` | PORTFOLIO(portfolio_id) + account_id/strategy_id/allocation_id lineage; **portfolio.read** | P/J: capital before/after/amount and actor/reason; no linked-shell ledger by default | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A39 | `managerPortfolioEquitySnapshotsPageV1` · `portfolio-equity-snapshots` | `public.portfolio_equity_snapshots` · `id, ts` | PORTFOLIO(portfolio_id), snapshot id/ts; consolidated economic population; **portfolio.read** | P: full portfolio equity/account_count/fees/denominators; not researcher slice | T04-03/04/05/07/10/11/12; **PENDING / NOT_RUN** |
| A40 | `managerPortfoliosPageV1` · `portfolios` | `public.portfolios` · `portfolio_id` | PORTFOLIO(portfolio_id); discover eligibility via verified current own Alpha link; **portfolio.read OR portfolio.discover_linked / portfolio.read_restricted** | L: restricted shell explicit approved ID/label only; owner string never owner user_id | T04-02/03/04/09/10/11/12; **PENDING / NOT_RUN** |
| A41 | `managerPositionsV2PageV1` · `positions-v2` | `public.positions_v2` · `position_id` | ACCOUNT(account_id) + strategy_id/instrument/mode/venue -> deployment; **account.read** | X/F: exact approved positions/PnL, no whole shared physical inventory | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A42 | `managerReconciliationFindingsPageV1` · `reconciliation-findings` | `public.reconciliation_findings` · `finding_id` | ACCOUNT(account_id) + strategy_id/execution_session_id -> deployment; **account.read** | D: own business-safe finding/status; no peer counts or host/system detail | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A43 | `managerReconciliationObservationBucketsPageV1` · `reconciliation-observation-buckets` | `public.reconciliation_observation_buckets` · `action, target_type, target_id, bucket_start` | Resolve target_type/target_id -> permitted canonical resource, bucket_start; **audit.read plus resolved business-resource authority** | D/J: observation/mismatch/repair counts only authorized target, no global totals | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A44 | `managerRedisTransportEpochsPageV1` · `redis-transport-epochs` | `public.redis_transport_epochs` · `transport_name` | ROOT technical transport scope; transport_name/current_run_id are not business bindings; **maintenance.read** | T: sanitized epoch diagnostics, never business read_all or workload credentials | T04-08/11/12; **PENDING / NOT_RUN** |
| A45 | `managerRiskGrantsPageV1` · `risk-grants` | `public.risk_grants` · `risk_grant_id` | ACCOUNT(account_id) + strategy_id/session/mode/venue; **account.read** | F/J: approved risk budget/status; decision_digest never evidence of caller permission | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A46 | `managerRiskProfilesPageV1` · `risk-profiles` | `public.risk_profiles` · `strategy_id, mode, venue, instrument_id` | ALPHA via strategy_id plus instrument_id/mode/venue qualified mapping; **alpha.read** | A/F: risk limits require approved field policy; source strategy ID not researcher principal | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A47 | `managerServiceHeartbeatsPageV1` · `service-heartbeats` | `public.service_heartbeats` · `service_name` | ROOT technical service scope; service_name/instance_id; **maintenance.read** | T: sanitized service health only, no host topology from business-read permission | T04-08/11/12; **PENDING / NOT_RUN** |
| A48 | `managerSettlementCalendarsPageV1` · `settlement-calendars` | `public.settlement_calendars` · `venue, market, trade_date` | venue/market/trade_date within authorized product market context; **alpha.read on referencing Alpha or business.read_all** | M: calendar metadata, not inferred account/portfolio membership | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A49 | `managerSizingDecisionsPageV1` · `sizing-decisions` | `public.sizing_decisions` · `decision_id` | ACCOUNT(account_id) + strategy_id/mode/venue, decision_id; **account.read** | F/J: equity/risk/notional/quantity require approved account finance; no absent-as-zero | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A50 | `managerStrategiesPageV1` · `strategies` | `public.strategies` · `strategy_id` | ALPHA via strategy_id qualified registry mapping; trader_id not owner user_id; **alpha.read** | A: approved own strategy metadata; no fuzzy trader/username authority | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A51 | `managerStrategyDeploymentsPageV1` · `strategy-deployments` | `public.strategy_deployments` · `deployment_id` | DEPLOYMENT(deployment_id) + ALPHA/PORTFOLIO/ACCOUNT tuple; **alpha.read or account.read only for approved deployment tuple** | A/F: metadata and linkage allowlisted; parent Alpha does not grant account finances | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A52 | `managerTradersPageV1` · `traders` | `public.traders` · `trader_id` | trader_id -> verified business/researcher identity mapping; source name is not Portal user_id; **business.read_all or alpha.read for verified own linked identity** | A: do not enumerate peer names/IDs; unmapped self identity remains typed unavailable | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A53 | `managerVenueAccountsPageV1` · `venue-accounts` | `public.venue_accounts` · `venue_account_id` | BINDING(venue_account_id) + account_id/venue/external_account_ref resolver; **binding.read** | B: full custody identifiers only explicit physical field scope; no inherited pool balance | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |
| A54 | `managerVenuesPageV1` · `venues` | `public.venues` · `venue` | venue within authorized product catalogue/context; **alpha.read on referencing Alpha or business.read_all** | M: safe venue catalogue fields; no credential/native-account metadata | T04-01/03/04/07/08/11/12; **PENDING / NOT_RUN** |

Declared row keys above come directly from the registry; a primary key is not
an ACL join. In particular, `account_sync_effective` and
`broker_account_sync_effective` declare observed sync IDs without a declared
primary key, and `margin_balances`, `paper_matcher_config` and
`risk_profiles` use declared unique composite keys. Preserve those source
identity dispositions rather than inventing stronger provenance.

At04 implementation entry, mechanically compare these54 operation+alias+
relation+key tuples to the canonical generated registry. Reconcile source
drift instead of using this design snapshot as a second runtime catalogue.
Then record each actual adapter/enforced/retired/disabled/internal decision
with implementation locator and real direct-API receipt. A PENDING row is not
an authorization allowlist or permission to activate a diagnostic alias.

## 5. Adjacent auth/admin/facade boundaries

These are **outside** the 112 Execution total. Their role is preservation and
bypass regression, not reopening unrelated Research/Planning work. Baseline
adjacent guards below are source inventory observations; all ELP2-04 checks
remain PENDING.

| Boundary | Baseline routes / guard | Required preservation / regression | Proposed tests | I/T |
| --- | --- | --- | --- | --- |
| Auth context/CSRF/login/change-password/logout | 5 exact `/api/auth/*` patterns in00 adjacent_routes; no class guard, handler-specific auth/security | Preserve phase02 current session generation, credential lifecycle, Origin/CSRF and safe responses. Never put login behind an authenticated Execution resource guard | T04-08, T04-12 + unchanged T02 regressions | PENDING/PENDING |
| Account lifecycle administration | 9 patterns in `admin/account-lifecycle.controller.ts:124–249`; `OwnerAccessGuard` | Protected owner/current-session/step-up and lifecycle invariants; business read_all/research ownership must not unlock users/reset/revoke/admin | T04-08, T04-12 + T02 regressions | PENDING/PENDING |
| Governance grant administration | 4 patterns in `admin/governance-grants.controller.ts:87–153`; `OwnerAccessGuard` | Preserve ceiling/self-elevation/protected-owner checks, CAS/idempotency and current authority at commit; grants read is not user-management delegation | T04-06, T04-08, T04-12 + T03 regressions | PENDING/PENDING |
| Effective-access self read | 1 `GET /api/admin/access/self`, `owner-access.controller.ts:29`; `SessionGuard` | Current caller only; safe permissions, no protected/internal identity enumeration | T04-08, T04-11 | PENDING/PENDING |
| Owner step-up | 2 patterns in `admin/owner-step-up.controller.ts:36/:50`; `OwnerAccessGuard` | Preserve owner/current generation, current credentials and CSRF; no privilege gain from business rights | T04-08, T04-12 | PENDING/PENDING |
| Phase02 additive own-profile boundary | Not part of00's5 auth patterns; `auth/profile.controller.ts` is concurrently implemented | At04 entry reconcile landed02 routes. Allowlisted own fields only; never accept role, owner anchor, TS mapping or policy revision writes from self profile | T04-08, T04-12 + T02 tests | PENDING/PENDING |
| Shared façade boundary | `facade/facade.controller.ts:185` array/wildcard dispatch; `SessionGuard` | Verify no wildcard covers `/api/v1/execution/*`; preserve legacy workspace/owner export checks and response security. Do not enumerate/rewrite unrelated Research routes or count wildcards as downstream operation coverage | T04-06, T04-08, T04-11 | PENDING/PENDING |
| Planning façade boundary | `facade/planning.controller.ts:46`; `SessionGuard` | Negative regression that new Execution policy plumbing does not capture or relax unrelated Planning authority | T04-08 boundary regression only | PENDING/PENDING |

The 16 baseline admin routes above are 9+4+1+2, distinct from 5 auth patterns.
Any 02/03 new policy/profile routes must be added as an explicit delta at 04 entry;
a baseline inventory cannot certify routes created later.

### 5.1 Explicit02/03 route delta — separate from baseline112

Read source at parent reference
`b448c0be655817dc49dd02f86aa2544e64c00d48`.
Phase02 own-profile has a landed producer checkpoint; Phase03 source and
OpenAPI were inspected in the shared working tree while its PG gate was
pending. **SOURCE_WORKING_TREE is not a03 landed/runtime receipt.** These ten
routes do not change the historical112 Execution-pattern count or certify
the later04 guards. ELP2-04 preservation/bypass dispositions below remain
**PENDING / NOT_RUN**, independent of any02/03 producer tests.

Source contracts used for this design snapshot:

- `auth/profile.controller.ts:16–57`;
  `packages/contracts/openapi/portal-profile.openapi.json` SHA-256
  `9a8e8ba48f175ff312658913071b79df5050fc229231c0fe25592cdb45c7ef6b`.
- `execution-v2/access.controller.ts:15–89` working SHA-256
  `05a6f9c4823c174abfc472d4564a0bebb461f68c87c6add6ba0bfb26b3fe9d88`;
  `packages/contracts/openapi/execution-access.openapi.json` working SHA-256
  `475b23e20a4828462367d48dc7d61bdf22d7b8e194679238785f6bf7999f6714`.
  Re-pin after03 landing before reusing this snapshot.

All ten have class-level `SessionGuard`. That alone is not their full
authority: each row records the service/security boundary to preserve.
Browser input never supplies actor/session generation, owner anchor, verified
TS mapping, approved policy installation or membership acceptance. The03
controller deliberately has **no public policy-install or TS-acceptance
route**; synthetic trust-provider results never become production authority.

| Delta | Method / path · operationId | Current source checks to preserve | Action / exact scope and enforcement locus | Planned04 regression / disposition |
| --- | --- | --- | --- | --- |
| D02-01 | `GET /api/auth/profile` · `portalOwnProfileGetV1` | SessionGuard; server caller; private/no-store | Own current identity only, equivalent purpose `profile.read_self`; `ProfileController.project` and current `OwnerAccessService.effectiveAccess`. Do not reinterpret this already-supported self read as requiring a newly seeded business grant | T04-08/11/12 + T02 preservation; **PENDING / NOT_RUN** |
| D02-02 | `PATCH /api/auth/profile` · `portalOwnProfilePatchV1` | SessionGuard + Origin/double-submit CSRF + strict display-name/revision allowlist + idempotency key; lifecycle TX checks caller/session/generation and CAS | Own identity only, purpose `profile.update_self`; `AccountLifecycleService.updateOwnProfile`. Reject role, owner, TS mapping and permission writes; original operation revision differs from current profile revision | T04-08/12 + T02 identity/lifecycle; **PENDING / NOT_RUN** |
| D03-01 | `GET /api/admin/profile-access/v2/effective` · `portalScopedAccessEffectiveGetV1` | SessionGuard; strict workspace query; service transaction locks/rechecks active actor/session generation and current workspace; no-store | `ExecutionAccessService.effective`: current caller's grants/states only, not arbitrary `subject_user_id`. Policy pending remains typed; do not expose other subjects or treat pending grant as effective TS right | T04-04/08/11/12 + T03; **PENDING / NOT_RUN** |
| D03-02 | `POST /api/admin/profile-access/v2/preview` · `portalScopedAccessPreviewPostV1` | SessionGuard + Origin/CSRF + key syntax + strict body; no-store; current transactional context | `ExecutionAccessService.preview/previewResult` uses `validateDelegation`: current `access.grant` ceiling, exact target/action/resource/environment/validity/parent chain and policy revisions. Advisory result is not a grant; preserve refusal before disclosing unauthorized before-state | T04-04/08/11/12 + T03 ceiling/self-escalation; **PENDING / NOT_RUN** |
| D03-03 | `POST /api/admin/profile-access/v2/proposals` · `portalScopedAccessProposalPostV1` | Same mutation boundary + fresh actor-bound step-up; current authority before keyed replay; preview digest + policy/ceiling/membership revisions and locked target checks | `ExecutionAccessService.propose`: exact `access.grant` delegable change at commit, not generic ADMIN or `access.propose` alone. Immutable original receipt; APP_APPLIED differs from TS_PENDING/ACCEPTED, no browser acceptance write | T04-04/06/08/12 + T03 CAS/replay/revoke race; **PENDING / NOT_RUN** |
| D03-04 | `GET /api/admin/profile-access/v2/proposals/:id` · `portalScopedAccessProposalGetV1` | SessionGuard; strict workspace/id; current transaction; no-store | `ExecutionAccessService.proposal`: current valid issuer, exact proposal subject, or current `access.read` on USER(subject) in workspace; policy ready. Hidden and unknown proposal safe404; being the old issuer after loss of authority is not enough | T04-04/06/07/08/11/12 + T03; **PENDING / NOT_RUN** |
| D03-05 | `POST /api/admin/profile-access/v2/grants/:id/revoke` · `portalScopedAccessRevokePostV1` | SessionGuard + Origin/CSRF/key + strict body; fresh step-up; current authority before keyed replay; policy/grant CAS; protected-owner/self-change denial | `ExecutionAccessService.revoke`: current `access.revoke` on every resolved resource × environment in the grant. Immediate local revocation and descendant-chain recheck; TS revocation remains separately unconfirmed. No restoration of revoked rights through replay | T04-06/07/08/12 + T03 revoke/step-up; **PENDING / NOT_RUN** |
| D03-06 | `POST /api/admin/profile-access/v2/grants/:id/preview-revoke` · `portalScopedAccessRevokePreviewPostV1` | SessionGuard + Origin/CSRF/key syntax + strict body; current transaction; no-store | `ExecutionAccessService.previewRevoke`: exact current `access.revoke` on every grant resource/environment before advisory diff; hidden/unknown safe404, revision CAS. Preview does not commit or require/replace actual fresh-step-up check at revoke | T04-04/06/07/08/11/12 + T03; **PENDING / NOT_RUN** |
| D03-07 | `POST /api/admin/profile-access/v2/step-up` · `portalScopedAccessStepUpPostV1` | SessionGuard + Origin/CSRF/key syntax + strict password/workspace; Argon2 current credential, transactional credential-generation recheck; no-store | `ExecutionAccessService.stepUp`: current delegated `access.grant` or `access.revoke` eligibility in this workspace; grants no capability and is not owner recovery. Expiry binds exact caller/session; never return/store password in receipt | T04-08/12 + T03 step-up/revocation; **PENDING / NOT_RUN** |
| D03-08 | `GET /api/admin/profile-access/v2/audit` · `portalScopedAccessAuditGetV1` | SessionGuard; strict workspace/subject/limit≤100/cursor; current transaction; no-store | `ExecutionAccessService.audit`: current `audit.read` on USER(subject), not all users by workspace alone. Cursor bound to caller generation, workspace, subject, policy/scope revision and limit; events selected with the same subject predicate | T04-03/04/06/07/08/11/12 + T03 audit/cursor; **PENDING / NOT_RUN** |

At04 entry reconcile `:id` controller paths with OpenAPI `{id}` equivalence,
record exact03 landed SHA/schema hash and any later additions, and test
business-read/Research ownership cannot unlock these administrative mutations.
Do not add `OwnerAccessGuard` to all V2 delegation routes: that would remove
the approved scoped-delegator design; preserve the shared evaluator, explicit
ceiling, current principal and per-operation checks instead.

## 6. Central implementation and leakage checklist

Every item below: **implementation PENDING / tests PENDING**.

1. **Mandatory scope at repositories, not only a global guard.** Reuse
   `execution/local-read-authority.ts:24` for workspace/profile admission, then
   current03 resource/field scope. Keep viewer workspace distinct from configured
   source workspace. Current membership must precede historical attribution.
2. **SQL predicates before count/page/exists.** Reuse
   `query/contracts.ts:105` and `query/postgres.ts:187/:203/:245`
   server-owned visibility. Extend via an Execution-specific safe adapter for
   composite resource tuples/joins; do not add caller SQL or break other query
   users. Count, facets, aggregate and rank must see the same authorized
   population. Restricted financial fields cannot be used for sorting/filtering
   to infer values after output redaction.
3. **Nested rows and shared physical accounts.** Fleet and360 responses require
   child filtering and financial-basis policy, not only an allowed parent ID.
   `manager-lists.service.ts:104–115` currently returns shared
   `snapshot.summary`; `:174–214` uses full portfolio counts and capital.
   Recompute authorized summaries or use the restricted DTO. Do not publish
   hidden peer totals, financial denominators, allocation/deployment counts,
   physical custody balances or policy-filtered row counts as lineage rejects.
4. **Local product source and fallback parity.**
   `execution/product-read-source.ts:282–307` must intersect policy before
   `filterAndSort`, slicing and count; structural deployment
   `scopeRows` at `:584` is not authorization. Its total at `:369` must
   not describe denied population. The named-current read-through path at
   `:147` cannot bypass the scoped local path. Do not fetch a first global
   page and present a filtered subset as an exact authorized query.
5. **Resource-field DTOs.** `resource-read.service.ts:82` includes physical,
   broker and sibling relations. Restricted Portfolio discovery needs a
   separately safe shell/schema; no full DTO handed to FE for hiding.
   Alpha researcher owner differs from deployer; no fuzzy names or trader IDs.
6. **History/coverage/analytics.** `profile-history.service.ts:30` lacks
   caller scope in baseline signature. Apply identical predicates to
   `profile-projection.repository.ts:376` page and `:627` coverage;
   mirror/history/financial analytics need the same protection. User omission
   of an entity filter must not expand a restricted caller to the whole profile.
7. **Metadata/counts.** `retained-review.controller.ts:83–115` computes
   profile-wide current/history counts and oldest/newest timestamps.
   Scope or withhold these under typed absence; do not leak them around a safe
   detail DTO. Contract/runtime/operation manifests expose only permitted
   product metadata; technical diagnostics require separate authority.
8. **Cursor/continuation binding.** Include current principal/session,
   workspace/profile, policy and binding revisions, field-set/resource-scope
   fingerprint, operation/query/page bounds and source revision where needed.
   Targets: `query/postgres.ts:280`,
   `maximum-data-operation.service.ts:323`,
   `maximum-data-continuation.repository.ts:14`,
   `financial-query-cursor.repository.ts:11`,
   `subject-activity.service.ts:384`,
   `retained-operation-page.ts:36` and
   `product-read-source.ts:294`. Offset+payload digest or actor+role alone is
   insufficient. Revoke/unlink/relink must stale old cursors even if data stays
   byte-identical; unknown cursors never grant access.
9. **Cache and coalescing.** Preserve immutable DATA-only reuse in
   `resource-read.service.ts:183–221` and retained data flights.
   Do not put permissions/current caller/read clocks into shared templates.
   Redact and recheck current policy after awaiting shared DATA and before
   returning response bytes. Completed scoped response caches need policy-bound
   keys. `shared-read.repository.ts:746` currently keys principal/role rather
   than current policy; verify HIT/FOLLOWER/MISS return paths in
   `current-source.proxy.ts:1033/:1042/:1126` independently.
10. **SSE/replay.** Before open/snapshot and each data-delivery boundary require
    current scope; bind resumes to current revisions and field policy.
    `realtime.controller.ts:175` delivery and `:201` workspace/session
    monitor do not yet prove current business resource grants.
    Command stream at `:258` needs the same distinction.
    Retained stream404/snapshot204 remain disabled as designed; no activation
    here. Do not claim new source continuity/authoritative replay from04 tests.
11. **Export/status/audit/download.** No dedicated V2 Execution export
    controller was found in00. Do not create an export service just to claim
    coverage. Prove existing disabled direct paths and scoped status/audit;
    a later activated export needs creation/status/download current policy,
    immutable job-scope binding, expiry/revoke and file/cache authorization.
    Preserve adjacent legacy export's current workspace/owner restrictions.
12. **Governance and commands.** Reuse current gate capability enforcement
    (`governance.service.ts:193/:286`) and resource-bound evidence.
    Audit PaperExit role-based remnants (`paper-exit.service.ts:225/:233`,
    `:362/:434`) and activation/operation/facade paths explicitly.
    Do not replace a gate's executor with R1 or infer decide/manage/command
    from read_all. Keep quorum, independent reviewer, CAS, evidence hash,
    CSRF/Origin, commissioning, kill switch and TS outcome separation.
13. **Race/revoke proof.** Use a deferred barrier: authorize read → pause data
    flight → commit revoke/unlink → release flight → refuse stale response.
    Check scoped cache hits and follower as well as leader; do not promise
    retrospective revocation of bytes already delivered before the
    authorization linearization point. For streams prove no unauthorized data
    after revocation is observed at the delivery boundary.
14. **Compatibility and completeness.** At04 entry compare baseline112 and
    all54 canonical aliases with delivered source; each needs an enforced,
    retired, disabled or internal disposition, implementation locator and actual
    test receipt. Internal/disabled is not an escape hatch for a working feature.
    Full-manager and approved restricted positive paths must remain useful.
    High-severity unresolved leakage means the relevant exit stays OPEN.

## 7. Proposed evidence matrix and reuse

No tests were run for this design. Proposed isolated test work must follow the
primary's4CPU/4GiB,8GiB transient,≤2workers/one-heavy-lane budget and normal hooks.

| Requirement | Required probe | Existing focused reuse / gap | I/T |
| --- | --- | --- | --- |
| T04-01 | Own/shared Alpha plus nested deployment/account rows, same physical account shared by a peer | `manager-lists.spec.ts:140/:244`, `resource-read.spec.ts`; add policy-specific exact fields/absence tests | PENDING/PENDING |
| T04-02 | Linked Portfolio discoverable minimal shell; no full Portfolio or peer finance | `resource-read.spec.ts`; add restricted DTO/direct detail+join probes | PENDING/PENDING |
| T04-03 | List/search/filter/facets/count and query parameters cannot expand scope | `query.spec.ts:232/:436`, `manager-lists.spec.ts:140`; add scoped count+summary oracle assertions | PENDING/PENDING |
| T04-04 | Details/deep links/joins, hidden existing versus unknown IDs safe response | `resource-read.spec.ts`, `profile-read.spec.ts`, `governance-product.spec.ts`; direct API across controller families | PENDING/PENDING |
| T04-05 | Aggregate and shared physical subtraction/denominator leakage | Manager lists/query analytics/financial chart suites; vary hidden peer balances and assert restricted result unchanged | PENDING/PENDING |
| T04-06 | Export/status/audit/download same current scope; disabled direct path remains unavailable | Governance continuation/product and adjacent façade security suites; do not invoke a side-effecting legacy export GET merely to collect bytes | PENDING/PENDING |
| T04-07 | Former member/current revoke cannot recover historical rows, cursor or grant | `a4-governance-delegation.spec.ts:532`, governance product; add resource-current-vs-history cases | PENDING/PENDING |
| T04-08 | Direct API/ADMIN bypass, safe error/capability boundary, useful valid legacy paths | Owner-access/governance/retained-review suites; add complete route matrix assertion and no business-read-to-tech/command escalation | PENDING/PENDING |
| T04-09 | Linked/unlinked/relinked and historical owner discovery | Add real isolated policy+resource binding fixture; no username/deployer inference | PENDING/PENDING |
| T04-10 | Restricted Portfolio cannot infer totals/peers via aggregate/sort/filter/rank | Manager/Resource/financial tests; mutate hidden values without changing authorized result/order | PENDING/PENDING |
| T04-11 | Denied fields absent through aliases/export/SSE/cache/metadata as well as ordinary JSON | `udb-resource-data-cache.spec.ts:13–52`, `execution-realtime.spec.ts:10`, named-operation suites; include all54 alias dispositions | PENDING/PENDING |
| T04-12 | Unlink/revoke during leader/follower/cache read or operation await, stale revisions and concurrency | `udb-retained-data-flights.spec.ts:5–35`, `execution-realtime.spec.ts:10`, governance delegation race tests; add deferred real API barrier | PENDING/PENDING |

Static census equality and unit tests cannot replace disposable PostgreSQL/API
leakage tests. Fixtures are TEST_ONLY, not actual TS human membership acceptance.
Existing unchanged receipts may be reused only after primary records relevant
source/schema/profile dependency compatibility; this plan itself reuses no
runtime verdict.

## 8. Unresolved source/authority ambiguities and next handoff

- Exact Stan ceiling/researcher disclosure matrix and accepted TS human
  membership remain pending00 decisions/requests002/003. Implement/test denied
  and TEST_ONLY accepted state paths without silently granting real users.
- Current Fleet owner/display fields and legacy strategy/account links do not
  prove stable researcher ownership or the target
  `(alpha_id, alpha_version_id, portfolio_id)` grain. Phase03/05 mappings must
  supply authority; do not guess from labels.
- Physical versus internal account balance classification and each alias's
  resource identity need an explicit adapter/field-policy map. Ambiguous
  source rows cannot become authorized by sharing a physical account.
- Existing PaperExit/activation/operations ADMIN checks mix authority and
  business prerequisites. Classify individually before refactoring; a single
  evaluator gate does not justify deleting independent reviewer/role requirements.
- Current alias/replay/history schemas and legacy continuation formats differ.
  A revisioned compatibility change may be needed; do not add required fields
  to accepted consumers without schema/version/handoff.
- Source file:line locators can drift under02/03. Primary must repin entry source
  and reconcile added routes; this file is not source/deployed identity evidence.
- Source/readiness/technical diagnostics require different visibility from
  business read; exact public metadata fields must be explicitly mapped.
- No runtime qualification, actual TS acceptance, approved export/source/SSE
  activation, frontend/browser acceptance or new production grant is delivered.

**Backend next:** after03's current evaluator and revoke checkpoint, implement
the listed Execution scope adapters and direct-API leakage matrix inside04.
No05+ assignment is inferred.

**Claude next:** only after primary publishes concrete generated policy/field
contracts and fixtures: manager/researcher variants, denied versus authorized
empty, linked shell and disabled export/stream states. Frontend remains
NOT_STARTED_BY_OWNER_DIRECTION; acknowledgement AWAITING_CONSUMER_REVIEW.

**Bidirectional handoff:** primary receives this design inventory and ambiguity
list, not a claimed implementation or acceptance. Canonical pending requests
stay in00; no duplicate approval ledger or backend fact is created here.
