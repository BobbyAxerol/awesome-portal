# BE-P3 (ELP2-06 serving data) - Claude status ledger, 2026-10-20

Owner: Claude (backend writer, scoped assignment of 2026-10-20). Branch `claude/be-gaps-2-p3` from `792319bb`
(the shared name `claude/be-gaps-2` was already advanced by another writer with `6cd24760`; this package avoids
writing onto that ref). Tier R3 focused. Statuses use the guide vocabulary: nothing here is PRODUCT_COMPLETE.
No source, HK, SSH, credential, runtime, Docker runtime stack or migration was used. Fixtures are
`TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`.

## Status per request id

| Id | Status | Commit | What exists |
| --- | --- | --- | --- |
| FE-066 | CONTRACT_COMPLETE (legacy bodies); SCOPED_V2 bodies FRONTEND_INTEGRATION_PENDING / OWNER_DECISION_PENDING | `1ac72a26` | Five optional keys travel together on the Paper profile `deployment` block, the Canary and Live `deployment` blocks and the Sandbox `certification` record: `alpha_id`, `alpha_name`, `portfolio_name`, `alpha_reason_code`, `portfolio_name_reason_code`. |
| S3-U5 | same as FE-066 | `1ac72a26` | `alpha_id` on the three stage bodies is the same key set (Sandbox carries it on `certification`, which is its deployment-bearing block). |
| S3-U4 | CONTRACT_COMPLETE (quantity); notional OWNER_DECISION_PENDING | `61194261` | Paper workbench `data.positions_by_side`. |
| S3-U3 | VERIFIED_SERVED + CONTRACT_COMPLETE | `6484c595` | Chart and analytics for a DEPLOYMENT subject are served; chart contract published for the first time. |
| S3-U2 | CONTRACT_COMPLETE | `8199d6ef` | Four legacy-compatibility schemas + one OpenAPI + producer-written fixtures. |
| S3-U1 | VERIFIED (no code change) | (this ledger) | Route is served but flag-gated off and not scoped; see below. |

### FE-066 / S3-U5: how the identity is composed
- Single composition point: `ExecutionProductReadSource.resolveDeploymentScope` returns `identity` inside the same authority fence that resolves the deployment (`deployment-identity.ts`, pure leaf `deployment-identity.contract.ts`). `ProfileReadService.snapshot` hands it to the Sandbox/Canary/Live composers beside the body (WeakMap, nothing added to `current_source`); the Paper workbench reads it from the resolution.
- `alpha_id`: ONLY from the SCOPED_V2 qualified tuple publication (deployment -> alpha), subject to the viewer's `alpha_id` field policy. Never from `strategy_id` (Codex rule of FE-052). On the LEGACY_COMPATIBILITY path there is no qualified membership, so `alpha_id: null` with `ALPHA_MEMBERSHIP_NOT_QUALIFIED`. Other reasons: `ALPHA_MEMBERSHIP_NOT_PUBLISHED`, `ALPHA_MEMBERSHIP_AMBIGUOUS`, `ALPHA_IDENTITY_NOT_AUTHORIZED`, `DEPLOYMENT_IDENTITY_NOT_READ`.
- `alpha_name`: ALWAYS null today, reason `ALPHA_NAME_NOT_PUBLISHED`. No execution relation publishes an alpha display name (`alphas` = id/description, `strategies` = ids; Resource360 `alpha_label` is "Unnamed alpha" for the same reason). The only alpha names live in the Research catalogue, a different namespace with no qualified join. Needs a Codex/Bobby decision (publish `name` on `strategies`/`alphas`, or an Execution<->Research alpha-id equivalence).
- `portfolio_name`: `portfolios.name` of the deployment's own `portfolio_id` from the same retained document, under the viewer's row and field policy (a portfolio shared with a hidden peer alpha is `PORTFOLIO_NAME_NOT_AUTHORIZED`). Other reasons: `PORTFOLIO_NOT_ASSIGNED`, `PORTFOLIO_NAME_NOT_PUBLISHED`, `PORTFOLIO_NAME_AMBIGUOUS`, `DEPLOYMENT_IDENTITY_NOT_READ`.
- NOT covered: the SCOPED_V2 stage bodies (`portal.execution.following-parent.v2` for Sandbox/Canary, `portal.execution.live-source-operations.v2` for Live). They are strict Codex contracts with a parent-field purpose seal; adding identity needs a new field purpose. In a SCOPED_V2 workspace the stage screens therefore still get no identity keys (the FE must treat absence as "not published"). Producer-receipt request below.
- Pre-existing drift noticed, not changed (FE-067 area, another writer): `execution-live-full-operations.v1` declares `deployment.portfolio_id` required non-null and `runtime_state` const null, but the Live source-only composer can emit null / a state string; `ProfileRead` (`current_source`) is `additionalProperties:false` yet the producer adds `read_at_ms`, `as_of_ms`, `panels`, `resource_resolution`; Sandbox source-only `certification` uses `workflow_state: NOT_COMMISSIONED`, outside the enum.

### S3-U4: positions_by_side
Per instrument, exact (BigInt) `long_quantity`, `short_quantity`, `gross_quantity = long + short` from the deployment's open position rows; no total across instruments; rows it cannot classify (side other than LONG/SHORT/FLAT, negative/non-decimal quantity, no instrument, closed) are counted in `excluded` and the block is PARTIAL; a partial positions window is PARTIAL `SOURCE_POSITIONS_PARTIAL`; unreadable relation is UNAVAILABLE. **Notional by side is not derived**: `notional = {UNAVAILABLE, E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED}`, the same reason the live composers refuse to total position notional. Useful finding for the FE: long/short **exposure values** with currency already exist as series: `GET /views/equity-chart?subject_kind=deployment&metric=exposure_long|exposure_short` (last point), contract now published. Account-level A360-1 not done (Account resource contract is the scoped v2 one; the pure function is reusable).

### S3-U3: deployment chart and analytics
- `GET /views/equity-chart` accepts `subject_kind=deployment`: authority `alpha.read` with the SCOPED_V2 tuple check (a deployment outside the viewer's tuples is the same 404 as an unknown one); metrics = performance snapshots (equity, net/gross/realized/unrealized pnl, fee, funding, cash_*, notional, exposure_long/short). `margin_*`, `drawdown`, `allocated_capital` are a typed UNAVAILABLE `EDS07_METRIC_NOT_RETAINED_FOR_SUBJECT` for a deployment, never a zero series. Mirror reads disabled -> UNAVAILABLE `EDS07_DURABLE_MIRROR_READS_DISABLED` (retryable).
- Before this, the route had NO schema, OpenAPI or fixture. Now: `execution-financial-chart.v1` schema, OpenAPI, d.ts, generator, seven cases; the real service is run against them (12 tests).
- `GET /deployments/{id}/query-analytics`: served from the local projection and already published; the real service output for a DEPLOYMENT subject validates against `execution-query-analytics.v1`; new `execution-query-analytics.deployment.valid.json`.

### S3-U2: variants per kind (answer to "which should the FE read")
| Kind | Route | Server answers | FE should |
| --- | --- | --- | --- |
| Alpha resource | `/resources/alphas/{id}` | `execution.alpha-resource.v1` (LEGACY) or `.v2` (SCOPED_V2, already published) | dispatch on `schema_version`; v2 has no `alpha_label`/`version`/`health`, only raw facts |
| Orders / fills | `/resources/alphas/{id}/orders\|fills` | `portal.execution.subject-records.v1` (LEGACY) or `.v2` (SCOPED_V2, `values` limited to the scoped field set) | same; v1 now published |
| Observed timeline | `/views/observed-timeline` | one wire version `portal.execution.observed-timeline-bff.v1` (scoped mode nulls some clocks) | read as published; no status/outcome (FE-054 stays open) |
| Candles | `/market/venue-candles` AND `/market/candles` | venue-candles envelope `portal.execution.market-candles.v1` (venue public, or data layer behind the same envelope); `/market/candles` = Trading System market context (published earlier) | the replay reads both and never merges, as it does; venue-candles is the stable envelope |

### FE double vs real server (defects to hand to the FE; measured by validating `e2e/bffDoubleAlpha.ts` against the new schemas, all 7 probes fail)
1. Alpha resource: real has `delivery_profile`, `requested_environment`, `resource` (with `label`), `projection[]`, `actor`, populated `panels` (the double has `panels: {}`); `data.alpha` has `valuation_warning` and each deployment carries `strategy_id`; real `health` is READY|ATTENTION|FINDING (the double uses NOT_READY); real `alpha_label` is "Unnamed alpha", `version` "UNVERSIONED" and deployment `portfolio_name` null (the double invents "BTC-Trend"/"3"/"Core"); the real names come from `data.alpha.portfolios[]` joined on `portfolio_id`.
2. Subject records: real `projection` has no `completeness` and does have `received_at_ms`; cursor is a Portal-signed `kc1.` token (the double uses `orders-p2`). Rest matches.
3. Observed timeline: real `observed_timeline` is a full panel envelope (`clocks`, `coverage`, `formula`, data with `observation_authority`, `source_current_page_row_count`, `observed_entry_count`, three `unavailable_segments`); the double returns a different shape (`freshness`, bare state); real response has `workspace_id`, `projection.payload_digest/source_contract_revision/source_catalogue_sha256`, and `page.limit`; real `values` null-or-string, entries have more `source_clock` values.
4. Venue candles: real envelope has no `environment`/`profile_id` and `source.note` is always a string; real candles carry `trades` (number|null).
5. Equity chart: real `schema_version` is `portal.execution.financial-chart.v1`, `source_authority` TRADING_SYSTEM, panel has `source_history_semantics`, `data.time_basis`, comparison mode ABSOLUTE_EQUITY|DIRECT_RETAINED_VALUE, sampling algorithm NONE|MIN_MAX_LAST_BUCKET_V1, `target_points` 512..4096, `preserves_gaps` false, **gaps are never published** (coverage.gaps always empty), series id `account:<id>:currency:<ccy>`. The double's declared gap cannot occur in production.

### S3-U1: `GET /deployments/paper/{id}/projection/{panel}` (`execution.paper-workbench.shadow-panel.v1`)
Served by control-api (`ExecutionAnalyticsController.paperWorkbenchPanel`), but: (a) default OFF - needs `FEATURE_EXECUTION_SHADOW_QUERY=true` and `FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW=true`, otherwise typed 404 `N07_SHADOW_SCREEN_DISABLED`; (b) it is a passthrough POST to the legacy upstream analytics cell (`/internal/v1/screens/paper-workbench/{id}/{panel}/query`), NOT the local projection; (c) it does not go through `ExecutionLocalReadAuthority`/SCOPED_V2 tuples (the other analytics routes do), so it is not qualified for a scoped workspace; (d) no test covers the route itself (only `shadowQueryBody`); (e) the response schema and canonical `execution-paper-workbench.orders-shadow.valid.json` exist for the orders panel only. Conclusion: it cannot replace the profile's orders/positions until a local-projection, scoped implementation exists. No change made (an authority decision, not a contract gap).

## Files (shared ones marked *)
Source: `apps/control-api/src/execution/deployment-identity{,.contract}.ts`, `paper-read/positions-by-side.ts`, edits in `execution/product-read-source.ts`*, `profile-read/profile-read.service.ts`*, `paper-read/paper-read.service.ts`*, `sandbox|canary|live` services*.
Contracts: schemas `execution-{paper-read,sandbox-certification,canary-control-room,live-full-operations}.v1` (identity, sides), new `execution-{financial-chart,alpha-resource,subject-records,observed-timeline,market-candles}.v1`; OpenAPI `execution-paper-read`*, new `execution-financial-chart`, `execution-serving-reads`; d.ts regenerated by `openapi-typescript`; generators `generate-execution-financial-chart.mjs`, `generate-execution-serving-reads.mjs`; fixtures (identity x4, positions-by-side x3, financial-chart, query-analytics.deployment, alpha-resource/subject-records/observed-timeline/market-candles).
Shared edits kept minimal: `packages/contracts/package.json`*, `tooling/verify-generated.sh`*, `tooling/snapshot.py`* (one contiguous BE-P3 block), `scripts/contracts-test.sh`* (stages two pure leaf files). `contracts-snapshot.json` and the EDS-12/N29 ledgers NOT touched: the lead regenerates them.

## Tests
control-api: `deployment-identity` 30, `paper-read-positions-by-side` 4, `be-p3-financial-chart` 12, `be-p3-serving-reads` 1, `be-p3-serving-records` 3. contracts: `execution-deployment-identity` 29, `execution-positions-by-side` 19, `execution-financial-chart` 5, `execution-serving-reads` 13. Regression: `paper-read` 21, `paper-read-blotter-scope` 42, `profile-read` 12, `resource-read` 14, `elp2-product-reads` 86, `elp204-explicit-resource-read` 88 (final focused run of 10 files: 271 pass), contracts `fixtures` 135.

## Not run / remains
- PostgreSQL-backed specs were not run (none touched; Sandbox/Canary/Live composers were exercised through their private composers with fakes, not through the DB-backed `canary-control-room`/`sandbox-certification` specs).
- Full hook / R2 not run (R3 focused only). Docker contract gate: see the final report for the last result.
- Remains: SCOPED_V2 stage-body identity (field purpose); alpha display-name source; shadow-panel qualification; account-level A360-1; FE readers/double alignment for the differences above.

## Producer-receipt request to Codex
1. FE-066/S3-U5: accept the five-key identity and decide the SCOPED_V2 parent-field purpose for `alpha_id`/`portfolio_name` on following-parent v2 and live-source v2; decide the alpha display-name source.
2. S3-U4: decide whether position notional by side may be published (needs position currency and mark lineage, E5) or whether the FE should use `exposure_long/short` chart series.
3. S3-U1: qualify or retire the shadow-panel route (scoped authority, local projection).
4. Re-run `scripts/contracts-snapshot` regeneration at merge (new tracked files are listed in `snapshot.py` under "BE-P3").
