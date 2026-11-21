# ELP2-06 — named Manager read contracts / Claude handoff

## Claude intake2026-10-18 — Manager/360 request plan

Owner Codex. FE-005/006/007/008/009/010/011/012/013/014/017/022/025/029/032/033/035/036/041
have been compared to current code, not marked collectively delivered. FE-005
already preserves conservative totals; FE-009 already enforces1MiB serialized
response/200 groups, no truncation. FE-006 CHANGES_REQUESTED: source-specific
methodology, not universal Dietz/TWR. FE-011 CHANGES_REQUESTED: retain qualified
precomputed numeric Score and sorting. FE-010 financial statements cover selected
authorized scope/stages before table filters; group totals cover the complete
authorized FILTERED query, never just a page. Do not silently change this meaning.

To-do: guaranteed metric keys; bounded text search; FE-025+041 ONE selectable
7D/30D/90D/ALL window contract; typed series/compare; basis-qualified flow graph;
slim measured map. Bind query/window/scope/generation in cursor/cache. FE-036
NEEDS_OWNER_DECISION: explicitly current-only or separately authorized bounded
as-of; do not ignore as_of_ms. Exit: regenerated DTOs, canonical absence/zero/
partial/size/cursor fixtures, affected actual PG/API tests and measurements,
then Claude consumer receipt. [Per-request input and limits](../ELP2-10/claude-review-intake-2026-10-18.md).


Producer: ELP2-06 commit containing this packet, parent
`c4109ef350a58c1ae3840d9c3f4c2110b312a079`, branch `docs/research-loop-plan`.
Landing requires normal hook; see [actual test / gate matrix](README.md).
Source pins and limits are in [source alignment](source-alignment.md).
This is a **backend contract handoff**, not a frontend assignment or acceptance.

## 1. Public artifact pins / generation

| Artifact | SHA256 |
| --- | --- |
| `packages/contracts/openapi/execution-manager-models.openapi.json` | `20671744f987ee1b4a9c8d1c4353aab714f6ea88ccc9655d5a3b073d5181f618` |
| `packages/contracts/generated/execution-manager-models.d.ts` | `3a3958a5677966a0110d91f1c650b9044a0402121a3d78563081121bb814aa8f` |
| `packages/contracts/schemas/execution-manager-dataset.v1.schema.json` | `5f605db57b9d0695de68e81202f24f60259529abee0b06273189d6b2eb9d0164` |
| `apps/control-api/src/execution-v2/manager-model.contract.ts` | `e5a69a6ea546205ca9c54a9e71a52fbc33aded2c28ae93c7cd114e24e0dd029d` |
| `apps/control-api/src/execution-v2/manager-score.ts` | `152fcc02c10726f4870aa1238a2142f35cc187b60e3bd49cd915f803c8734193` |
| additive migration135 | `1e4c6822e675955b7608c5bc0cd11fde145c1a8a6303a17bb6770b35ab0b1939` |

Regenerate from repo contract workspace:
`npm run generate:execution-manager-models`; generator reads the actual backend
Zod vocabulary. Full existing `npm run generate` also includes this target.
Do not author manual duplicate interfaces or broad string-index source types.
Public components: `ManagerDataset`, `ManagerDatasetQuery`, `ManagerMetric`,
`ManagerDatasetRow`; operations below reference the same schema version
`portal.execution.manager-dataset.v1`. Custom semantic refinements run in Zod
and have explicit contract tests; generated JSON Schema is the structural layer.

Shared **synthetic** fixtures, never real-data receipts:

- `packages/contracts/fixtures/execution-manager-dataset.synthetic.valid.json`:
  empty authorized snapshot, stale/partial quality, scores policy_pending.
- `packages/contracts/fixtures/execution-manager-dataset.rows.synthetic.valid.json`:
  scoped row, actual source-zero versus null absence and policy-pending score.
- Pure query tests in `apps/control-api/test/elp206-manager-model.spec.ts` cover
  null/ties, restricted peer, groups, currencies/profiles, stage overlap and
  cursors. They are component fixtures, not new TS authority.

## 2. Named operation map

Prefix `/api/v1/execution/manager`; session and current workspace access needed.

| operationId | GET suffix | Scope / consumer |
| --- | --- | --- |
| `executionManagerFundOverviewGetV1` | `/fund-overview` | business.read_all, whole authorized population; Fund overview, never derive from a restricted Fleet page |
| `executionManagerFleetGetV1` | `/fleet` | authorized Alpha tuples; Fleet before drill-down |
| `executionManagerPortfolio360GetV1` | `/portfolios/{id}/overview` | explicit portfolio.read, otherwise distinct portfolio.read_restricted; response remains authorized-only |
| `executionManagerAlpha360GetV1` | `/alphas/{id}/overview` | alpha.read on exact Alpha |
| `executionManagerAccount360GetV1` | `/accounts/{id}/overview` | account.read on exact Account |
| `executionManagerDeployment360GetV1` | `/deployments/{id}/overview` | deployment ID must exist in Alpha-authorized correlated tuples; not a new invented deployment command/read grant |

No route accepts relation/SQL/source cursor/URL/JWT/certificate. A 360 overview
is not a claim every History/Execution/Score tab has a qualified new dataset.
Existing04 scoped current/resource/history routes and54 named operations keep
their separate authority;05 catalogue metadata says what remains unavailable.

## 3. Query / state semantics

- Required `environment=paper|sandbox|live`; optional `workspace_id`, otherwise
  current workspace. **No ALL economic aggregate.** Existing stage-union API
  remains navigation; render separately partitioned domains, never add Paper
  or Sandbox NAV to actual NAV. Live+Canary are stage memberships, not a rank.
- `stage_filter` and `group_by` are comma-separated arrays; `lifecycle_filter`
  is a scalar. `filters`, `sort`, `economic_partition` are JSON query values.
  Read allowed fields/operators/max counts from generated query type. No
  client-side sorting of one page claiming full-query ordering.
- Sort/filter finite declared scalars, ≤3 sort keys, ≤16 filters, ≤2 group keys;
  null last asc/desc, stable row key for ties. Money sort/filter pins common
  economic partition. Return/ratio is not summed to obtain a Portfolio return.
- `limit`1…200; signed `after` OR `before`, never both. Cursor is scope/source/
  generation/resource/query-bound. Changing filter/sort/group/limit/workspace or
  grants starts a new query.409 means discard page/cursor and re-read safely;
  don't auto-loop an expired/tampered cursor.
- `page.authorized_filtered_count` and `groups` cover the full authorized
  filtered query, not current page. Stage groups overlap: do not add them as
  one book. `capital_statements` explicitly have
  `AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS` scope; do not
  relabel them as totals of arbitrary filtered rows or use them to renormalize q.
- Every metric has exact decimal string or null, unit/currency/basis/window,
  denominator/methodology, availability/reason, completeness/freshness,
  confidence, provenance and calculation/policy revision. Source zero is real
  zero; missing is not zero. Missing member/metric census is
  `SOURCE_FACT_CENSUS_INCOMPLETE`; source clocks are not Portal observation time.
  Do not format opaque revisions/cursors as an order or timestamp.
- Scores have independent raw/composition/direct_nav fields with null value
  and `policy_pending`; Regime unavailable. These states are intentional, not
  “0 score”. Pure score reference calculations are not a numeric product API.
  `funding_bucket_pnl` is null / `LOT_ATTRIBUTION_METHOD_NOT_APPROVED`.
-200: typed authorized snapshot (may be empty/partial/stale).400: invalid closed
  query/cursor;401: session required;404: unavailable resource/current grant,
  intentionally does not disclose peers;409: authority/head changed;503:
  publication/field policy/projection/capacity unavailable. Private no-store;
  no per-browser upstream fetch/poll/stream. Error body uses existing typed
  `ExecutionReadScopeError`; never render raw SQL/source exception strings.

## 4. Source → model boundary and missing implementation

`manager-model.store.ts::prepareManagerProjection` takes an internal normalized
document plus the existing qualified dataset publication; this is **not** an
HTTP ingest endpoint or an instruction for the browser to send authority.
Allnew42families remain unqualified in the pinned catalogue. Even a product
policy grant cannot make TEST_ONLY data readable: `ManagerModelService` refuses
it. Service branch tests use synthetic qualified-shaped adapters only.

The parent `ExecutionProfileProjectionRepository.commit` accepts an optional
branded Manager model. Parent raw projection + Manager head/revision/checkpoint
are atomic in one client transaction; epoch/catalogue coupling and quarantine
fences apply. Existing writers do **not** manufacture this optional payload or
receive a new schedule here. No source poller, DB source connection or ACK added.

After selected source publication/config is qualified, ELP2-REQ-06-002 must bind
the private adapter, materialize precomputed snapshot/score revisions with
source-set/dependency/config hashes and benchmark the bounded worker. Runtime
anchors and full source financial history remain unapproved. Own NAV/direct
score cannot depend on every child q or a Research run; missing own NAV cannot
fall back to an allocation mean. Cross-profile ALL must be separate scoped
partitions with its own tie-out; this API deliberately rejects ALL today.

## 5. ELP2-REQ-06-001 — Claude work once Bobby assigns UXM-08

Sender Codex → consumer Claude; status `AWAITING_CONSUMER_REVIEW`, frontend
`NOT_STARTED_BY_OWNER_DIRECTION`. Source: this packet / the ELP2-06 commit.
Scope: Fund/Portfolio Overview → Fleet → Alpha/Account/Deployment overview.
No request to redesign current UI now; Claude owns approved component/HiFi work.

Suggested assignment prompt:

> Read campaign rules, Unified ELP2-06/UXM-08, the complete Manager UX guide
> §§6–12, this handoff and the gate matrix. Audit/reuse current components and
> preserve approved deep links, workspace and query context. Use generated
> Manager operation/types and shared fixtures, not manual source mapping.
> Every displayed field needs unit, absence, scope, freshness and provenance.
> Keep Fund full authority separate from restricted summaries and money domains.
> Score/config/source pending stays typed; never substitute sample q or make a
> numeric score by averaging children. Do not activate source/commands/stream.
> First deliver the source→component/state map and design/fixture receipt;
> product API acceptance requires source-qualified projection, not TEST_ONLY.
> Browser-check approved design/current baseline at1280/660, keyboard, overflow,
> exact decimal/null/zero, empty/403-or404/409/503, filter/group/sort/page/back,
> workspace reload and no idle upstream fanout. Record console/network and
> exact build/source/schema pins. Do not re-record unrelated baselines.
> If a field/state is missing, append a request with locator/UI impact/typed
> semantics/test/done-when in this packet and link Unified; don't invent facts.

Consumer exit: assigned Claude acknowledges exact producer SHA/artifact pins;
maps all6operations and typed states; actual browser receipt distinguishes
fixture from qualified API. Until then this request is not VERIFIED/CLOSED.
No new frontend-to-backend request arrived during this backend-only phase.

## 6. Backend next / rollback

ELP2-07 contract/status work is independently plannable **only after Bobby's
next assignment**, with upstream execution still gated by exact authority.
06runtime/recompute/ALL tie-out resumes after00-002/003/004/005 and05-001
selected dependencies are satisfied. No goal or next phase is auto-started.
Rollback: compatible reader/generation off, keep135/history/checkpoints and
source facts. Never rollback by deleting evidence or relaxing policy/source gates.
# Current source/worker dependency return —2026-10-18

Original06-002 remains OPEN. [Current05source audit](../ELP2-05/manager-source-intake.md)
distinguishes implemented PM selected-history/delivery from the missing
qualified financial assembly. Existing ManagerRuntimeInstallation,
ManagerProjectionConsumer, RAW/Composition/Regime workers, original/historical
custody and six named scoped APIs are present: do not build them again.

Next dependency-closed implementation: bind accepted source normalization and
RAW/Composition task factories to the existing runtime partition, preserving
its source-set/config/lease/revision/atomic-commit/ACK semantics. Full economic
ownership/NAV/flow/cost/denominator inputs are still missing as specified in
original05-001; an injected fixture proof callback is not a genuine producer.
Independent own-NAV/direct score must not wait for all child q or Research.

Regime additionally requires accepted exact Research/Alpha-version/params/
trade-params/reference population, knowable feature/outcome grid, split/
purge/embargo/untouched/selection/archive manifests and its approved artifact.
PM financial reports alone cannot certify that corpus. Formula/weights/bands
are already selected; no new formula decision or production fixture defaults.
Done-when is actual producer→existing worker→immutable projection→scoped API
proof, including full-denominator and final current-authority negatives, not
source code presence or only a calibration signature. Reuse compatible
component receipts without rerunning unrelated gates; installed-source and
consumer acceptance remain separate. No new FE field or Claude ACK in this
intake; consumer owner-held/AWAITING_CONSUMER_REVIEW under7.3.

### C4/P1 follow-through —2026-10-18

Selected-window/query-options, authorized name filters/grouping, true metric
keys and point-in-time stock versus exact-window flow semantics are integrated
WIP. [Producer packet](../ELP2-10/manager-intake-2026-10-18.md) names actual
generated contracts and examples; ALL without source inception stays typed
unavailable. No financial publication/calibration or consumer ACK inferred.

