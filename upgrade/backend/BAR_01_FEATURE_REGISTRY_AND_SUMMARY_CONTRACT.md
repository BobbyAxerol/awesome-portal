# BAR-01 — Feature Registry and Command Center Summary Contract

> **Version:** 0.1<br>
> **Status:** BAR-01-BE1/BE2 complete; BAR-01-BE3 pending<br>
> **Updated:** 2026-08-15<br>
> **Unified phases:** U02 Shared Foundations, U03 Unified Shell<br>
> **Runtime authority:** current FastAPI services remain authoritative

## 1. Goal and scope

BAR-01 defines the first mother-Portal metadata and read-only aggregation
boundary. It gives later backend/frontend agents one exact contract for:

- Feature Registry.
- Screen Contract.
- Concern Registry.
- Runtime capability availability.
- Command Center summary over current QuantBT and Planning services.

This slice is architecture and contract work for U02/U03. It does not create a
new durable product authority and does not begin U07/U10 early.

Primary guide sources:

- [§P0.12 Feature Registry](../quantbt_portal_architecture_uiux_final_v0.4_vi.md#p012-feature-registry--contract-trung-tâm-của-prototype)
- [§P0.13 Screen Contract](../quantbt_portal_architecture_uiux_final_v0.4_vi.md#p013-screen-contract--đơn-vị-thảo-luận-cho-các-vòng-sau)
- [§P0.14 Command Center](../quantbt_portal_architecture_uiux_final_v0.4_vi.md#p014-command-center-prototype)
- [§P0.15 Portal Map](../quantbt_portal_architecture_uiux_final_v0.4_vi.md#p015-portal-map--lifecycle-prototype)
- [§21.3 Command Center screen](../quantbt_portal_architecture_uiux_final_v0.4_vi.md#213-screen-03--command-center)
- [Unified Plan U02](../UNIFIED_IMPLEMENTATION_PLAN.md#phase-u02--shared-foundations--figma-ready-design-system)
- [Unified Plan U03](../UNIFIED_IMPLEMENTATION_PLAN.md#phase-u03--unified-shell-feature-registry--command-center)

## 2. Decisions locked by this deep dive

1. **Static product metadata and runtime health are different contracts.**
   `FeatureMaturity=AVAILABLE` does not imply that its runtime dependency is
   currently reachable. `FeatureMaturity=COMMISSIONED` does not become runtime
   `available` because a fixture renders.
2. **One source-controlled registry is the metadata authority.** Sidebar,
   command palette, route fallback, preview, task links and telemetry IDs read
   the same document.
3. **The frontend consumes registry data through the Portal API.** It does not
   import a second hand-maintained TypeScript feature list.
4. **The current Portal FastAPI is the temporary read-only registry/summary
   host.** It does not gain QuantBT/Planning write authority.
5. **Planning aggregation uses private HTTP contracts.** Portal API never
   imports Planning repository code and never reads its SQLite database.
6. **Summary adapters fail independently.** One unavailable source returns a
   partial, truthful `200` response; it does not erase healthy sections or
   invent zero values.
7. **Invalid registry source fails startup/readiness.** Product metadata with
   duplicate routes, dangling references or invalid states is a deploy error,
   not a runtime warning.
8. **No new PostgreSQL, NATS, Redis or MinIO is introduced.** The registry is
   immutable source for the deployed commit; dynamic durable authority waits
   for U07/U10.

## 3. Current service facts used by the design

### QuantBT Portal FastAPI

Existing read contracts useful to a local adapter:

```text
GET /api/health
GET /api/datasets
GET /api/runs
GET /api/runs/{run_id}
```

The local `RunManager` persists status/artifact files and exposes an in-process
read model. BAR-01 may summarize these existing records but must not treat them
as the future durable Run Registry.

### Roadmap & Task Board FastAPI

Existing private read contracts useful to an HTTP adapter:

```text
GET /api/ready
GET /api/v1/tasks
GET /api/v1/roadmap
```

Planning local-browser state is not visible to the backend. When Planning runs
in LOCAL mode, the server summary reports `unavailable` or `local_only`; it
must not claim task counts from another user/browser.

## 4. Temporary source layout for U02/U03

Use a neutral app-owned sidecar, not a frontend-only file and not a formal
workspace package before U09:

```text
apps/portal/registry/
  registry.json
  schemas/
    portal-registry-source.v1.schema.json
    portal-registry.v1.schema.json
    portal-summary.v1.schema.json
  README.md
```

Rules:

- JSON is canonical in this slice to avoid adding a YAML runtime dependency.
- `registry.json` is source-controlled, reviewed and included in both test and
  Portal API image contexts.
- The backend loads it once at startup through an injected repository path,
  validates it and computes its digest.
- Production path is image-owned and read-only. An HTTP request can never
  choose a registry path.
- Frontend retrieves the document from the API. It may hard-code only shell
  bootstrap routes: loading, registry-error, auth callback, not-authorized and
  not-found.
- U09 moves schemas/types into the formal shared contract workspace with a
  compatibility adapter; it does not create a second simultaneous authority.

## 5. Registry document contract

### 5.1 Source and response envelopes

```ts
interface PortalRegistrySourceV1 {
  schema_version: "portal.registry.v1";
  registry_id: "portal-default";
  revision: number;                 // positive, manually incremented
  feature_groups: FeatureGroupDefinition[];
  lifecycle_stages: LifecycleStageDefinition[];
  features: PortalFeatureDefinitionV1[];
  screens: ScreenContractV1[];
  concerns: ConcernDefinitionV1[];
}

interface PortalRegistryDocumentV1 extends PortalRegistrySourceV1 {
  content_digest: `sha256:${string}`; // computed for the public document
}
```

`registry.json` validates against `portal-registry-source.v1` and never contains
`content_digest`. The loader computes an internal source digest, filters hidden
content, validates the result against `portal-registry.v1`, then computes the
public `content_digest` over canonical UTF-8 JSON with sorted object keys and
compact separators, excluding `content_digest` itself. Array order is semantic
and therefore included.

The source file contains no generated timestamp. API response metadata may add
`served_at`, but volatile values never change the registry digest.

### 5.2 Stable identifiers

Feature, screen, concern and lifecycle entity IDs use uppercase snake case and
match:

```text
^[A-Z][A-Z0-9_]{2,63}$
```

IDs are stable telemetry/link keys, not display labels. Renaming a label does
not rename its ID. Replacing an ID requires a deprecated alias/migration entry.

Feature-group IDs are the controlled lowercase slugs from the guide:

```ts
type FeatureGroupId =
  | "command"
  | "research"
  | "backtests"
  | "deployments"
  | "data_ops"
  | "planning"
  | "administration";

interface FeatureGroupDefinition {
  id: FeatureGroupId;
  label: string;
  order: number;
}
```

### 5.3 Feature maturity and data mode

```ts
type FeatureMaturity =
  | "AVAILABLE"
  | "PROTOTYPE"
  | "COMMISSIONED"
  | "BLOCKED"
  | "HIDDEN"
  | "DEPRECATED";

type FeatureDataMode = "REAL" | "FIXTURE" | "STATIC_PREVIEW" | "NONE";

type PortalEnvironment =
  | "local"
  | "research"
  | "paper"
  | "sandbox"
  | "live";
```

Meanings:

- `AVAILABLE`: current implementation and phase evidence exist.
- `PROTOTYPE`: interactive subset exists; missing authority is visible.
- `COMMISSIONED`: designed/planned, preview only, compute/mutation disabled.
- `BLOCKED`: implementation/activation has an explicit unresolved gate.
- `HIDDEN`: excluded from public registry responses and product navigation.
- `DEPRECATED`: compatibility access only, not offered for new work.
- `REAL`: values originate from an authoritative current adapter.
- `FIXTURE`: explicit fixture banner/provenance required.
- `STATIC_PREVIEW`: layout/brief only, no live metric claim.
- `NONE`: no data is rendered.

Maturity is source metadata. Runtime reachability uses
`CapabilityAvailabilityV1` in §8.

### 5.4 Feature definition

```ts
interface PortalFeatureDefinitionV1 {
  id: string;
  group: FeatureGroupId;
  label: string;
  description: string;
  canonical_route: string;
  legacy_routes: string[];
  maturity: FeatureMaturity;
  data_mode: FeatureDataMode;
  permissions: string[];
  environments: PortalEnvironment[];
  source_module: string | null;
  prototype_frame_id: string | null;
  roadmap_epic_id: string | null;
  default_task_id: string | null;
  screen_ids: string[];
  concern_ids: string[];
  lifecycle_stage_ids: string[];
  summary_source_ids: string[];
  hidden_for_roles: string[];
  activation_gate: string | null;
  navigation: {
    order: number;
    icon_key: string;
    show_in_sidebar: boolean;
    show_in_command_palette: boolean;
  };
}
```

`icon_key` selects from a reviewed Portal icon map; registry JSON never embeds
React components, arbitrary HTML, SVG or remote asset URLs.

### 5.5 Screen contract

```ts
interface ScreenContractV1 {
  screen_id: string;
  contract_revision: number;
  feature_id: string;
  maturity: FeatureMaturity;
  data_mode: FeatureDataMode;
  route: string;
  primary_persona: string;
  primary_decision: string;
  primary_action: string | null;
  permissions: string[];
  inputs: Array<{
    id: string;
    authority: string;
    required: boolean;
  }>;
  backend_dependency_ids: string[];
  concern_ids: string[];
  related_repositories: string[];
  related_task_ids: string[];
  activation_gate: string | null;
}
```

`authority` names a contract/service/artifact, not a filesystem path. A screen
cannot claim `REAL` data without at least one input authority and backend
dependency.

### 5.6 Concern contract

```ts
type ConcernCategory =
  | "PRODUCT_DECISION"
  | "AUTHORIZATION"
  | "SOURCE_OF_TRUTH"
  | "BACKEND_CONTRACT"
  | "STATE_MACHINE"
  | "RESILIENCE_STATE"
  | "QUANT_SEMANTICS"
  | "PERFORMANCE"
  | "AUDIT_LINEAGE"
  | "SECURITY"
  | "ACCESSIBILITY"
  | "TEST_EVIDENCE"
  | "DEPENDENCY"
  | "ACTIVATION_GATE";

type ConcernStatus =
  | "OPEN"
  | "PARTIAL"
  | "VERIFIED_CURRENT"
  | "BLOCKED"
  | "NOT_APPLICABLE";

type ConcernSeverity = "BLOCKING" | "HIGH" | "MEDIUM" | "LOW";

interface ConcernDefinitionV1 {
  id: string;
  category: ConcernCategory;
  status: ConcernStatus;
  severity: ConcernSeverity;
  statement: string;
  feature_ids: string[];
  screen_ids: string[];
  evidence_refs: string[];
  task_ids: string[];
  activation_gate: string | null;
  reviewed_at: string; // timezone-aware UTC date-time
}
```

The Command Center blocking-concern count is deterministic:

```text
severity == BLOCKING
and status in {OPEN, PARTIAL, BLOCKED}
and at least one referenced feature is not HIDDEN/DEPRECATED
```

It is not inferred from free-text task titles.

### 5.7 Lifecycle stage

Lifecycle is product metadata, never paper/live operational state:

```ts
interface LifecycleStageDefinition {
  id: string;
  label: string;
  order: number;
  feature_ids: string[];
  maturity: FeatureMaturity;
  description: string;
}
```

No lifecycle stage may expose PnL, deployment health or execution state unless
a separately authoritative summary adapter exists in its later phase.

## 6. Registry validation invariants

Startup validation rejects the deployment when any invariant fails:

1. `schema_version`, `registry_id` and positive `revision` are valid.
2. Feature, screen, concern and lifecycle IDs are unique; group slugs are
   unique within the controlled `FeatureGroupId` set.
3. Canonical routes begin with `/`, are unique and do not collide with another
   feature's legacy route.
4. Legacy routes are unique after normalization.
5. All feature → screen/concern/lifecycle and screen/concern → feature
   references resolve.
6. Navigation order is unique inside each visible feature group.
7. `COMMISSIONED` and `BLOCKED` features have an activation gate and roadmap or
   default task link.
8. `HIDDEN` features are excluded from the public document, counts, command
   palette and sidebar.
9. `DEPRECATED` features do not appear in default navigation but may retain
   compatibility routes.
10. `REAL` screens identify input authority and backend dependency.
11. `FIXTURE`/`STATIC_PREVIEW` cannot satisfy an `AVAILABLE` runtime source.
12. Permission and environment values come from reviewed enumerations.
13. Routes, labels and descriptions contain no executable HTML/script.
14. No secret, credential, host path or raw private endpoint is present.
15. Source `content_digest`, if accidentally authored, is rejected; the loader
    computes it.

Registry invalidity affects readiness because navigation/route/maturity truth
cannot be trusted. It is not silently reduced to an empty registry.

## 7. Registry API

The current Portal FastAPI temporarily serves:

```http
GET /api/v1/portal/registry
```

Response is `PortalRegistryDocumentV1` after filtering `HIDDEN` entries and
recomputing references/count-visible content if role filtering is later added.

Headers:

```text
ETag: "sha256:<public-document-digest>"
Cache-Control: no-cache, must-revalidate
Vary: Authorization, Cookie
```

Behavior:

- Honor `If-None-Match` with `304`.
- A public-document digest differs from the private source digest when hidden
  entries are removed.
- Until U07, the response contains only metadata safe for every authenticated
  future Portal user; permission fields are descriptive, not enforcement.
- Unknown schema major fails startup. Unknown optional field fails validation
  in v1 because schemas use `additionalProperties=false`.
- Additive compatible changes require a revision increment. Breaking changes
  require `portal.registry.v2` and an explicit compatibility window.

## 8. Runtime capability availability

### 8.1 Availability type

```ts
type AvailabilityState =
  | "available"
  | "unavailable"
  | "degraded"
  | "stale"
  | "denied"
  | "commissioned";

interface CapabilityAvailabilityV1 {
  state: AvailabilityState;
  reason_code: string | null;
  detail: string | null;       // safe, user-facing
  retryable: boolean;
  checked_at: string;          // UTC
  as_of: string | null;        // source observation time
  stale_after_seconds: number | null;
  authority: {
    service: string;
    contract: string;
    endpoint: string | null;   // logical/internal contract, no host URL
  };
  provenance: {
    source_revision: string | null;
    content_digest: string | null;
  };
}
```

Required reason codes in BAR-01:

```text
CAPABILITY_NOT_IMPLEMENTED
UPSTREAM_UNAVAILABLE
UPSTREAM_TIMEOUT
INCOMPATIBLE_CONTRACT
SOURCE_DATA_UNAVAILABLE
LOCAL_ONLY_STATE
PERMISSION_DENIED
STALE_OBSERVATION
PARTIAL_SOURCE_FAILURE
```

Reasons are stable machine codes. `detail` never contains stack traces,
filesystem paths, internal hostnames or submitted data.

### 8.2 Evidence value

Every dynamic metric/value carries its own evidence state:

```ts
interface EvidenceValueV1<T> {
  availability: CapabilityAvailabilityV1;
  value: T | null;
  unit: string | null;
  timezone: string | null;
  segment: string | null;
  source_artifact_digest: string | null;
}
```

Invariant: `value` is `null` unless state is `available`, `degraded` or `stale`.
An unavailable task/run count is never serialized as `0`.

## 9. Command Center summary contract

### 9.1 Endpoint and response

```http
GET /api/v1/portal/summary
```

```ts
interface PortalSummaryV1 {
  schema_version: "portal.summary.v1";
  registry_digest: `sha256:${string}`;
  environment: PortalEnvironment;
  requested_at: string;
  completed_at: string;
  overall_availability: CapabilityAvailabilityV1;
  registry_counts: {
    by_maturity: Record<FeatureMaturity, number>;
    blocking_concerns: number;
  };
  sections: PortalSummarySectionV1[];
  priority_items: PriorityItemV1[];
}

interface PortalSummarySectionV1 {
  source_id: string;
  feature_id: string;
  label: string;
  availability: CapabilityAvailabilityV1;
  metrics: Record<string, EvidenceValueV1<number | string>>;
  recent_items: SummaryLinkItemV1[];
  warnings: SummaryWarningV1[];
}

interface SummaryLinkItemV1 {
  id: string;
  label: string;
  route: string;
  resource_id: string | null;
  observed_at: string;
  authority: string;
}

interface SummaryWarningV1 {
  code: string;
  severity: "warning" | "error";
  title: string;
  detail: string;
  observed_at: string;
  evidence_digest: string | null;
}
```

`registry_counts` is computed only from the validated public registry.
Dynamic sections are supplied by adapters.

### 9.2 First adapter set

#### `quantbt_current`

Authority: current Portal FastAPI run manager/dataset provider.

Allowed fields:

- Total/current run counts by current state.
- Active/queued run count.
- Latest run ID, status, protocol, strategy and observed timestamps.
- Historical dataset capability availability.
- Links to current run/library routes.

Forbidden fields:

- Invented ETA.
- PnL/portfolio/deployment/account values.
- Recomputed QuantBT metrics.
- Claim that filesystem run state is the future durable Run Registry.

#### `planning_current`

Authority: Roadmap & Task Board private HTTP API.

Allowed fields:

- Task count by existing status.
- Roadmap phase count and current phase metadata when derivable from the
  existing contract.
- Recent task/roadmap links with explicit API mode.

Rules:

- Use a server-owned base URL and strict response schema/size validation.
- Never import Planning repository modules or open its SQLite path.
- No mutation and no `X-Portal-Actor` impersonation.
- LOCAL browser mode returns `LOCAL_ONLY_STATE`; no server count is guessed.

#### `registry_current`

Authority: validated source registry.

Allowed fields:

- Feature maturity counts.
- Blocking concern count.
- Lifecycle stage metadata.
- Commissioned feature/task links.

Lifecycle values are static metadata and must be labeled as such.

### 9.3 Adapter port

The application service depends on a port, not FastAPI/HTTP details:

```py
class PortalSummaryAdapter(Protocol):
    source_id: str

    async def collect(
        self,
        context: SummaryContext,
        *,
        deadline: float,
    ) -> PortalSummarySection: ...
```

Suggested dependency direction:

```text
api/routes_portal.py
  -> services/portal_overview.py
       -> domain/portal_registry.py
       -> adapters/quantbt_summary.py
       -> adapters/planning_summary.py
       -> repositories/portal_registry.py
```

No adapter calls another route handler. The QuantBT adapter reads an exported
service/manager port; the Planning adapter uses private HTTP.

## 10. Aggregation and failure semantics

1. Validate/load registry at startup.
2. Collect independent dynamic adapters concurrently.
3. Apply a configurable per-adapter hard deadline; initial default `500 ms`,
   allowed range `100–2000 ms`.
4. Do not retry inside the browser request. Retry amplification harms latency
   and hides dependency health.
5. Convert timeout/connection/contract failures to typed unavailable sections.
6. Return `200` when the registry is valid even if one or all optional dynamic
   adapters are unavailable.
7. Set overall state:
   - `available`: all required current sections available.
   - `degraded`: at least one section is degraded/stale/unavailable while a
     useful truthful response remains.
   - `unavailable`: no dynamic current section is usable.
8. Invalid registry or summary serialization is an internal contract failure,
   affects readiness and returns RFC 7807-compatible `503`/`500` as applicable.
9. Cancellation/disconnect propagates to pending HTTP adapter calls.
10. Adapter failure details are logged structurally, while the response uses a
    safe reason code/detail.

## 11. Priority-item rules

BAR-01 only emits priority types backed by current authority:

```text
RUN_FAILED
HISTORICAL_DATA_UNAVAILABLE
REGISTRY_BLOCKING_CONCERN
```

Ordering:

1. Failed current run when evidenced by current run status.
2. Historical data unavailable for an otherwise available backtest feature.
3. Source-controlled blocking concern.
4. Normal recent work is not a priority item.

The current Planning contract has no authoritative blocker field or state; its
task statuses are only `Backlog`, `Ready`, `In Progress`, `Validating` and
`Done`. BAR-01 therefore shows Planning counts/recent work but does not infer a
blocker from title, priority, dependency or notes. A future versioned Planning
blocker/concern contract may add that priority type.

Do not emit incident, live approval, reconciliation or deployment priorities
until their authoritative later-phase adapters exist. The full target priority
order in §21.3 remains commissioned metadata, not fake runtime data.

Every priority item contains:

```ts
interface PriorityItemV1 {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  feature_id: string;
  resource_id: string | null;
  observed_at: string;
  authority: string;
  route: string;
  evidence_digest: string | null;
}
```

`route` must resolve through the validated registry or a validated resource
route template. User-controlled arbitrary URLs are rejected.

## 12. Performance and caching budget

- Summary response target is `< 50 KB`; hard test ceiling is `100 KB`.
- Return at most five `recent_items` and five warnings per section.
- Dynamic summary target follows the guide's same-region metadata p95 `< 200
  ms`; the `500 ms` timeout is a failure bound, not the SLO.
- Adapters request bounded projections only. No artifact series, console tail,
  trial table, task body or document content belongs in this response.
- Registry endpoint uses ETag/conditional GET.
- First implementation has no Redis and no correctness-dependent cache.
- An optional measured in-process micro-cache may be added later, but its value
  must retain original `as_of/checked_at`; cache time never becomes source time.

## 13. Security and authorization boundary

- Before U07, registry and summary expose only metadata safe for every future
  authenticated Portal user.
- Permission arrays describe intended access; they do not grant access and do
  not replace server checks.
- `HIDDEN` entries never leave the backend in BAR-01.
- Summary adapters use configured private service destinations; request query,
  route or registry data cannot alter upstream host/path.
- Upstream payloads are size-limited and schema-validated.
- No credential, JWT, session, host path, private storage path or internal
  hostname appears in responses/evidence.
- Later U07 filtering recomputes the public digest/ETag per visibility class and
  adds `Vary`; it does not trust frontend role filtering.
- All BAR-01 endpoints are read-only. No command endpoint is added.

## 14. Backend implementation slices

The implementation agent should use these coherent commit boundaries.

### BAR-01-BE1 — Registry schemas and fixture

- Add `apps/portal/registry` source and JSON Schemas.
- Populate the minimum current/commissioned feature, screen and concern set
  directly from the v0.4 guide.
- Add schema, reference, route collision and digest tests.

Gate: invalid/dangling/duplicate fixture tests fail deterministically.

Implementation evidence — 2026-08-15:

- [x] Added canonical `portal.registry.v1` source with 7 feature groups, 9
  lifecycle stages, 13 features, 17 screen contracts and 8 tracked concerns.
- [x] Only `QUANTBT_RESEARCH` and `PLANNING` are `AVAILABLE + REAL`; Alpha,
  Data Catalog, Approval, Paper, Sandbox and Live remain commissioned without
  runtime summary sources.
- [x] Added Draft 2020-12 source/public/summary schemas with strict unknown-field
  rejection, computed public digest boundary and unavailable-value `null`
  enforcement.
- [x] Added cross-reference symmetry, route collision, source-module/evidence,
  maturity, deterministic digest and truthful summary contract tests.
- [x] Targeted registry contract suite: `12 passed`.
- [x] Full backend suite: `128 passed, 1 skipped`; the skip is the explicit
  opt-in external Historical real-data test.
- [x] Root workspace verification now requires tracked registry/schema files
  and checks JSON syntax before Compose validation.

### BAR-01-BE2 — Registry repository and API

- Add immutable domain models and repository loader.
- Validate at startup, compute public digest and readiness state.
- Add registry GET endpoint, ETag and `304` tests.
- Copy sidecar into API image and verify no frontend duplicate registry exists.

Gate: one commissioned feature is added only through registry data and appears
in endpoint output without route-handler/sidebar edits.

Implementation evidence — 2026-08-15:

- [x] Added frozen domain models and a one-load repository that validates both
  Draft 2020-12 schemas, typed domain projection and deterministic structural/
  security invariants before the application becomes ready.
- [x] Source and public digests are computed independently; `HIDDEN` features,
  screens, lifecycle membership and concern references are removed before the
  public digest is calculated.
- [x] Added read-only `GET /api/v1/portal/registry` with strong ETag,
  `If-None-Match` weak/list/wildcard handling, `304`, `no-cache,
  must-revalidate` and the future-auth-safe `Vary` contract.
- [x] Added `GET /api/ready`; invalid/missing/unknown-major registry input now
  fails app composition, and both development/production Compose healthchecks
  use readiness instead of liveness.
- [x] Moved `jsonschema==4.26.0` into runtime dependencies and copied the
  image-owned registry sidecar after the dependency layer to preserve Docker
  build caching.
- [x] The BAR-01 registry suites pass `30` tests, including immutable snapshot,
  hidden filtering, path-override isolation, duplicate/dangling/unsafe source,
  ETag and commissioned-feature data-only gates.
- [x] Full backend regression passes `146 passed, 1 skipped`; the skip is the
  explicit opt-in external Historical real-data test.
- [x] Built `local/portal-portal-api:dev` and probed the running image:
  readiness `ready`, 13 public features, digest/ETag match and conditional
  request `304`; the image also owns a writable non-root artifact-root default
  so the same probe works without Compose-only environment overrides.

### BAR-01-BE3 — QuantBT summary adapter

- Read bounded current run/dataset metadata through exported ports.
- Add evidence wrappers, current failure mapping and priority rules.
- Test empty run library, active/completed/failed run and Historical unavailable.

Gate: no numerical metric is recalculated and unavailable is never zero.

### BAR-01-BE4 — Planning summary adapter

- Add private async HTTP client with fixed destination, timeout, size and schema
  validation.
- Support API/current and LOCAL-only unavailable states.
- Test timeout, 5xx, malformed/oversized response and healthy counts.

Gate: no direct Planning import/database access and no mutation occur.

### BAR-01-BE5 — Aggregator and endpoint

- Collect adapters concurrently with deadline/cancellation.
- Add partial/degraded semantics, priority merge and payload limits.
- Add summary endpoint contract/fault tests.

Gate: one failed adapter does not delay or erase a healthy adapter.

### BAR-01-BE6 — Frontend contract handoff

- Export registry/summary OpenAPI schema and canonical JSON fixtures.
- Document query keys, ETag behavior and all loading/empty/partial/stale/denied
  states for the frontend agent.
- Do not implement shell visuals in this backend slice.

Gate: frontend types can be generated/validated without a second handwritten
feature model.

## 15. Test matrix

### Registry

- Valid source, deterministic canonical digest.
- Unknown/additional field.
- Duplicate ID/navigation order/canonical or legacy route.
- Dangling feature/screen/concern/lifecycle reference.
- Commissioned/blocked without activation gate/task link.
- REAL screen without authority/dependency.
- Hidden filtering and public digest.
- ETag `200/304` behavior.
- Startup/readiness failure on invalid registry.

### Summary

- Empty current run library is available with count `0`.
- An unavailable run source has `value=null`, never zero.
- Latest/active/failed run mapping and stable priority ordering.
- Historical capability available/unavailable/degraded mapping.
- Planning API healthy, LOCAL-only, timeout, connect error, 5xx, malformed and
  oversized payload.
- Concurrent collection stays inside deadline.
- Client cancellation cancels upstream request.
- Partial response remains schema-valid and returns `200`.
- Invalid registry/serialization returns typed failure and readiness impact.
- Payload count/size ceiling.
- No forbidden PnL/deployment/incident/account fields.

### Compatibility and security

- Existing QuantBT/Planning routes and tests remain unchanged.
- Protected strategy hash remains unchanged.
- Registry path cannot be supplied through HTTP.
- Arbitrary upstream host/URL and unsafe priority route are rejected.
- Response/error snapshots contain no host path/internal hostname/secret.

## 16. Frontend handoff contract

The frontend agent receives:

```text
GET /api/v1/portal/registry
GET /api/v1/portal/summary
portal.registry.v1 schema + canonical fixture
portal.summary.v1 schema + healthy/partial/unavailable fixtures
FeatureMaturity vs AvailabilityState semantic table
ETag and query invalidation behavior
priority ordering and route constraints
```

Frontend rules:

- Product nav/command/preview is generated from registry output.
- Runtime badges use availability, not feature maturity.
- Loading/partial/stale/denied/unavailable are visibly distinct.
- No dynamic zero is rendered from `null`/unavailable.
- Full target cards remain commissioned when no authoritative section exists.
- The UI does not merge Planning localStorage into a shared server summary.

## 17. Non-goals and deferred authority

BAR-01 does not implement:

- Shared `packages/contracts-*` workspace; U09 owns it.
- Cloudflare identity, local login or role enforcement; U07 owns it.
- PostgreSQL Command Center read models; U10 owns them.
- Durable NATS progress/worker queue/object store; U11 owns them.
- Generic QuantBT engine capability registry; U12 owns it.
- Dataset Snapshot/Data Catalog; U13 owns it.
- Approval, paper, sandbox, live, account, deployment, incident or
  reconciliation summaries.
- Final high-fidelity Command Center UI.

## 18. BAR-01 exit evidence

BAR-01 backend contract is complete only when:

- Source registry validates and has deterministic digest/ETag.
- Public output has no hidden/dangling/colliding metadata.
- QuantBT and Planning adapters are read-only and independently fail-safe.
- Summary healthy/empty/partial/stale/unavailable fixtures pass.
- No fake runtime metric or future operational priority appears.
- OpenAPI/fixtures are sufficient for a separate frontend agent.
- Current backend/frontend/Planning tests and production builds still pass.
- Workspace verification passes and every coherent slice is committed.

BE1/BE2 satisfy the schema, immutable registry repository, deployment
readiness and HTTP caching foundation. The next backend slice is BAR-01-BE3:
a read-only QuantBT summary adapter over exported current run/dataset ports,
with evidence wrappers, truthful empty/active/completed/failed states and
Historical capability mapping. BE3 must not recalculate QuantBT metrics, treat
the filesystem model as the future durable Run Registry, call route handlers,
or begin the Planning adapter/aggregator early.
