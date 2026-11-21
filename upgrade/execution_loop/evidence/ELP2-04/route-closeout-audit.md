# ELP2-04 — Remaining route-boundary review

Status: **SOURCE_REVIEW_ONLY / CLOSEOUT_IN_PROGRESS / NOT_RUNTIME_ACCEPTED**.

Reviewed 2026-10-16 against shared checkout `docs/research-loop-plan`, HEAD
`c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64` **plus concurrent uncommitted ELP2-04
changes**. HEAD alone is not the candidate pin. This is a delta to
[route-authorization-plan.md](route-authorization-plan.md), not a replacement
for its 112-pattern/54-alias inventory. Source existence is not a PASS receipt.
Line locators below describe the inspected working files and may move during
integration. No deployment, upstream probe, DB mutation or test was performed
for this review.

## 1. Scope implementation already present; acceptance still separate

Current changes wire `ExecutionReadScopes` into Manager raw-snapshot reads,
History, named retained aliases, Product/Resource reads, local analytics,
Portfolio360, financial series/risk records, subject activity and the profile
adapter used by read-only tasks. Their intended boundary is scope before
filter/count/page/aggregate, finite purpose DTOs and a final policy/source
fence. They are **IMPLEMENTED_AWAITING_FOCUSED_RECEIPT**, not automatically
accepted because the implementation exists. Source tests in the E cell are
synthetic test-authority PostgreSQL receipts, not production authority.

Stream endpoints now have a compatibility-only boundary in
`execution/realtime.controller.ts:57` (`assertLegacyStream`). This prevents a
new V2 policy from implicitly commissioning the legacy global stream.
Preserving an explicitly legacy transport and refusing an unqualified V2
transport is different from disabling every legitimate scoped reader.

## 2. Remaining family-by-family gaps

### A. Activation — five routes

- Existing controls: `activation/activation.controller.ts:34–116` validates
  workspace membership; mutations enforce origin/CSRF and strict schemas.
  `activation/activation.service.ts:75,106,128,260` requires ADMIN for plan,
  apply and verify. Existing capability versions, evidence and repository CAS
  remain necessary controls.
- Missing ELP2 boundary: capabilities/detail (`service.ts:58,150`) are only
  workspace-bound. ADMIN is not the V2 `maintenance.*`/activation action
  selector; plan detail can expose technical evidence without current resource
  permission. There is no current ELP2 scope or post-await read fence.
- Minimal remediation: classify the finite capability/plan DTO as technical
  versus business availability, require its exact action/resource for V2,
  preserve explicitly legacy behavior. Preserve all existing mutation
  prerequisites; do not commission commands under a read scope. Mutation
  action integration must be reviewed at commit, not bolted onto the GET only.

### B. Canary / Sandbox certification / Live deployment

- Canary `canary/canary.service.ts:71–99` already evaluates current
  `governance.canary.read/decide` per workspace. It is not an unguarded ADMIN
  fallback. Source child facts go through profile readers.
- Live `live/live-operations.service.ts:60–99` requires
  `governance.live.read`, uses exact deployment source resolution and does not
  fabricate a deployment when source lineage is unresolved.
- Sandbox `sandbox/sandbox-certification.service.ts:148–166` obtains its
  deployment snapshot through the profile reader; writes remain ADMIN-gated.
- Remaining gap: Portal-owned envelope/certification lookup is still primarily
  workspace + gate authority, without ELP2 exact deployment lineage/current
  field authorization and final delivery fencing. Scoped child data alone
  cannot authorize the parent stored governance record. Preserve these gate
  controls while adding qualified deployment/resource intersection; never use
  R1 as the Canary/Live executor or make source unavailability authorize writes.

### C. Command Center — standalone and composition

- `command-center/command-center.controller.ts:20–34` checks workspace
  membership. Repository `:131–158` rechecks retained workspace access and
  filters governance triage with `approvalReadGates`.
- Actual source-level gap: `command-center.repository.ts:184–213` selects
  incidents and `count(*) OVER()` by workspace only; operation/verified-operation
  queues (`:229,:273`) have the same broad input concern. Projection state
  (`:306`) is read before resource scope and subsequently supplies fleet,
  reconciliation and journal aggregates. Profile-level access is not
  authorization for all underlying financial rows or all environments.
- Remediation: independently mint each profile's scope, read raw snapshot
  data, intersect identities/fields **before** fleet/reconciliation/journal
  counters, then compose finite scoped totals. Scope Portal operations and
  incidents using qualified target lineage before counts. Keep useful own-slice
  cards; missing target lineage is a typed absence for that card, not a fake
  zero and not a denial of the entire screen. Final fence must cover every
  participating profile and Portal gate permission.

### D. Analytics — local paths versus remote proxy paths

- Local branches in `execution/analytics.controller.ts:90–146,248–268` invoke
  current local read authority and the scoped local services. These must not
  be disabled by a blanket proxy fix.
- Remote-only or fallback branches remain in `:44–72` (capital preview, order
  funnel, insight preview), `:149–150` (binding exposure), `:203–220` (Paper
  projection) and `:270–278` (query analytics fallback); Portfolio fallback
  also needs the same boundary when local Portfolio360 is disabled.
- `execution/analytics.proxy.ts:321–346` signs actor/session/workspace/role and
  requested resource, with mTLS/bulkhead/request-byte limits. This is safe
  transport authentication but **not** proof that current V2 resource/field
  policy was evaluated or that returned source projection has matching pins.
  Capital preview separately requires ADMIN and binds stored approval scope;
  neither substitutes for the new exact policy.
- Remediation: a shared current-policy compatibility boundary around every
  remote call; retain explicit legacy operation, but V2 needs source-qualified
  delegation/publication/finite DTO agreement. Until that agreement exists,
  return a transport-specific typed commissioning absence for these remote
  branches only. Do not accept a raw role-based response and filter one global
  page afterward, and do not label this refusal a complete V2 analytics reader.

### E. Governance, operations and operational compositions

- `governance/governance.service.ts:193–267` evaluates current gate access
  before inbox/conditions/history. Detail methods `:497,:619,:739` retain
  distinct R1/R2/Live grants. Plans/apply have quorum, self-review, evidence
  hashes, expiry, idempotency and current-authority controls. These are real
  existing protections, not a SessionGuard-only surface.
- Remaining ELP2 gap: gate visibility is workspace-level; qualified resource
  intersection is not applied uniformly to approval page + separate counts,
  conditions/history and parent records. Existing row-scope SQL support in
  `query/postgres.ts:348–405` does not activate itself for every caller.
- Paper Exit now has current read authority `paper-exit.service.ts:502` and
  repository checks; confirm its exact target-lineage semantics separately.
  Preserve this fix and do not revert to role-only reads.
- Incident `operations/incident.service.ts:50–77,167–188` requires ADMIN but
  does not intersect the incident/correlated operation's V2 resource tuples.
  `operations/workflow.service.ts:151` likewise needs resource-scoped queue
  predicates and counts, not only role filtering.
- Critical composition gap: `execution/operational-composition.service.ts:170–206`
  appends a journal after the main consumer read. Its `redactedCommandJournal`
  (`:209–254`) loops all profiles, emits global source revisions and selected
  journal rows without resource scope. Redacting credential-like keys does not
  authorize those rows. Scope this additional data before sort/limit/digest;
  do not undo useful scoped source-health work in the same service.

### F. Technical diagnostics, metadata and retained context

- Mirror integrity (`execution/durable-mirror-integrity.controller.ts:51–80`)
  checks workspace/profile read but not `maintenance.read`, then exposes
  profile-wide findings/counts. Technical authority must be explicit; business
  read-all is not technical access.
- Realtime diagnostics (`execution/realtime.controller.ts:68–125`) is ADMIN
  only, emits profile health/recovery and source-admission diagnostics. It
  needs independent technical authorization per profile and a finite public
  DTO. A configured profile is not the caller's profile grant.
- Runtime manifest (`execution/runtime-manifest.service.ts:22–108`) is static,
  has no row/source I/O and redacts credentials/origins, but includes image and
  publication pins, per-profile concurrency and `environmentParity(config)`.
  Separate harmless product capabilities from technical runtime config; do
  not claim every static field is private or fabricate a resource owner.
- Contract-authority endpoint is similarly workspace-gated static contract
  metadata. Its safe finite metadata disposition needs a test, not an invented
  financial row predicate.
- Screen contracts (`screen-bff/screen-bff.service.ts:18–64`) contain catalogue
  metadata and a caller-supplied resource placeholder, not fetched financial
  data. Role-derived `ready` is not V2 effective permission; clarify availability
  versus authorization or expose evaluator-backed actions. A URL echo is not
  proof that the resource exists.
- Retained context (`execution/retained-review.controller.ts:26–108` as read)
  rechecks workspace access but shares all-profile counts, oldest/newest and
  payload digests. Needs scoped metadata before aggregation and policy-bound
  delivery. **Another agent is actively implementing this family**; reread
  latest code/receipt before claiming it remains missing. Never cache permission
  together with reusable immutable metadata.

### G. Market and public endpoints

- Venue candles (`execution/market-candles.controller.ts:66–88`) requires a
  session/workspace, strict named venue/symbol/interval filters. Service has
  bounded public-venue endpoints, 6,000-bar cap, 6s timeout, rate budget and
  public-data cache (`market-candles.service.ts:45–53`). These are public price
  data, not private holdings; do not invent Alpha/account ownership for them.
- Market Context (`market-context.controller.ts:45–91`, service `:60–94`)
  validates workspace, exact named operation and accepted environment capability,
  runtime activation and strict source envelope. Still needs explicit current
  profile/dataset policy at the Portal boundary and final revocation fence when
  V2 is active; source qualification and session auth do not imply that grant.
- Distinguish `venue_public` versus private Data Layer source selection in the
  venue-candles handler. Public market permission must not silently authorize
  the private-source branch. Record a deliberate finite public-metadata/data
  classification, with source-specific negative tests.
- Retired raw current-source routes retain unconditional 410. Keep them retired
  and exercise direct negative probes; do not resurrect arbitrary relation reads.

### H. Export/download and streams

- Baseline 112-pattern census has **no commissioned Execution export/download
  controller**. New read grants must not infer `report.export`. Existing scope
  engine lists export separately and rejects legacy elevation; add a direct
  action-negative receipt, not a fictional export success.
- Research report prepare/status/download is a separate existing scope and
  must remain unchanged. The legacy Research façade export now verifies the
  run's workspace and ADMIN (`facade/facade.controller.ts:214–236`); do not
  report the old missing-workspace bug as still present or count Research
  exports as Execution authorization coverage.
- Stream compatibility refusal is implemented separately, but reopen/send and
  revoke negatives still require measured focused evidence. Diagnostics are
  not covered merely because stream subscription was fenced.

## 3. Minimal integration order / ownership

1. Finish scoped metadata/context and operational journal with their assigned
   agents; obtain focused test result for already wired families.
2. Technical readers: explicit `maintenance.read`, canonical ROOT/profile
   binding, finite safe DTO, delivery fence; compatibility must be chosen from
   current trusted policy, not a business grant that would block technical-only
   principals. Primary owns the shared compatibility helper.
3. Analytics remote boundary: narrowly refuse only unqualified V2 remote
   transport, preserving scoped local positives and explicit legacy behavior.
4. Command Center raw-input-before-count implementation and exact Portal
   target lineage. Then remaining gate/activation/incident boundaries above.
5. Reconcile census and 54 aliases, contracts, consumer handoff and route tests.

No blanket generic-deny handler, broad ADMIN bypass, synthetic source authority,
policy-free aggregate or renamed test disposition closes these gaps. Remaining
unknowns must name their specific source/action mapping and affected route.

## 4. Cell E observation

Read-only log watched: `/tmp/elp204-scoped-read-e-20261016.log`. Primary reported
the first E build failed on a missing brace in the shared raw-snapshot helper,
then corrected it; tests did not run. Primary is preparing cell F from a new
copy. This is **not** build/test PASS. Any later owned compile/test failures
require explicit fixes and a new source pin.

## 5. Same-turn implementation addendum (supersedes only named findings)

After the read-only review, primary assigned the following existing-scope
changes to this agent. These are **source changes, not runtime closure**:

- Technical integrity/diagnostics now select trusted current policy. V2 uses
  the shared canonical-root `authorizeTechnicalProfile` helper and final
  delivery fence, with strict finite schemas in
  `execution-v2/technical-read.contract.ts`. Business read-all cannot replace
  maintenance permission. No raw finding selector/count, topology, credentials
  or source-admission internals enter the V2 DTO. Explicit legacy results are
  rechecked after async work.
- All remote Analytics proxy requests now have a shared selection fence:
  V2 returns `ANALYTICS_SCOPED_TRANSPORT_NOT_COMMISSIONED` before delegation or
  network; policy activation during legacy I/O returns `ANALYTICS_ACCESS_CHANGED`.
  Local scoped analytics remains enabled. This is a **transport-commissioning
  blocker**, not a claim that V2 remote analytics is implemented.
- Command Center now accepts a full trusted principal and independently scopes
  each raw profile before deployment counters. Available own-slice Fleet stays
  visible; unavailable profile cells are null, not zero. Global source clocks
  and revisions are removed from the scoped response. Portal workflow cards
  remain `PORTAL_WORKFLOW_TARGET_LINEAGE_NOT_PUBLISHED`; journal/reconciliation
  cards name their missing scoped field contracts. These blockers are not
  converted into PASS or a global screen denial.
- Manager `environment=all` now publishes explicit per-profile
  `profile_dispositions`; denied/unqualified profiles no longer erase permitted
  profiles. Explicit single-profile errors retain their refusal. Dropped
  profiles cannot fall back to an unscoped legacy aggregate. Cursor identity
  includes the dispositions. The shared generated contract/fixture requires
  synchronization by primary.

Light boundary-unit result: `elp2-technical-reads.spec.ts` **6/6 PASS**;
`elp2-financial-reads.spec.ts` **1/1 PASS** after fixing the test's retained
configuration to the exact existing runtime profile contract. The first
financial attempt failed configuration validation, not a safety gate; the
validator was not weakened. No actual DB/source/TLS call was made by these
pure tests. Manager/Command Center PostgreSQL cases remain for the primary's
isolated focused cell.

Cell F failed compile before tests: this agent corrected the adapter's inferred
row type with an explicit `Record<string, unknown>` map. Other reported errors
belonged to Product and Governance integration owners. Do not count F as a
PostgreSQL acceptance run. Runtime manifest, Activation, gate parent-record
lineage and the public/private market distinction from §2 remain separate
review items unless a newer owner's receipt closes them.

## 6. Activation boundary and focused-cell correction

The approved follow-up changes only Activation GET routing, not command
commissioning. `activation/activation.controller.ts:55` selects current trusted
policy before reading capabilities or a plan. V2 receives
`ACTIVATION_TECHNICAL_FIELDS_NOT_COMMISSIONED`: the existing maintenance-health
field vocabulary does not authorize plan signatures, compatibility details or
evidence. No plan-existence/evidence query runs first, and no unrelated
health-only DTO replaces the plan. Legacy GET responses remain unchanged with
a post-I/O compatibility fence. GETs are private/no-store; POST plan/apply/verify
and their existing origin/CSRF/CAS controls are unchanged.

`elp2-activation-read-boundary.spec.ts`: **4/4 pure tests PASS**, covering both
V2 GET refusals without service reads, legacy detail preservation, and a policy
change during legacy I/O. This is a boundary receipt, **not** proof of positive
V2 Activation implementation. Positive detail requires identity-only lookup of
the exact from/target profiles followed by commissioned technical field policy
and a final authority fence; it must not require unrelated profiles.

Primary reported cell G build PASS and 472 tests PASS, but all 17 Manager-suite
tests were NOT RUN because `migrateTestDatabase()` lacked its required URL.
The harness now passes `testConfig().DATABASE_URL`; no application validator or
authorization rule was relaxed. These 17 tests remain pending focused H, not
inherited PASS. The separate local-read-authority expected-error mismatch is
owned by primary. No runtime, deployment or remote branch changed here.

Parent-record dependencies still requiring exact authority, independently of
the newly scoped current-source child:

- `canary/canary.service.ts:83`: the existing current Canary gate grant is real,
  but envelope limits and lineage require exact persisted deployment/profile
  mapping and appropriate finite parent-field policy before return.
- `live/live-operations.service.ts:60`: the Live gate grant and exact readable
  source-only fallback are existing controls. The branch returning a stored
  canary and lineage needs the same parent-record authority and gate delivery
  recheck; Live screen access is not permission to execute upstream commands.
- `sandbox/sandbox-certification.service.ts:148`: scoped source reads do not
  implicitly authorize the stored certification evidence, account binding and
  workflow history. Resolve the stored exact deployment tuple and commissioned
  parent action/fields; do not invent a Sandbox grant namespace.

These are concrete source/authority mappings, not a proposal to hide every
legitimate screen behind generic denial. Static product metadata can remain
available under its existing workspace boundary; technical runtime pins/config
must be separately classified, and catalogue readiness must not masquerade as
an effective action grant.

## 7. Parent-record safety boundary (not feature commissioning)

Primary subsequently approved narrow read-boundary fixes for the three parent
families above. Canary, Live and Sandbox DETAIL now return their own typed V2
reason before parent or child data lookup:
`CANARY_SCOPED_PARENT_NOT_COMMISSIONED`,
`LIVE_SCOPED_PARENT_NOT_COMMISSIONED`, and
`SANDBOX_SCOPED_PARENT_NOT_COMMISSIONED`. Existing Canary/Live gate grants are
still checked first and rechecked at legacy delivery. Explicit legacy payloads
remain unchanged, with a final compatibility fence. Mounted controllers retain
the trusted session and viewer workspace, and mark GET responses private/no-store.
No create, decision, submit, plan, apply or upstream command behavior changed.

Pure `elp2-governance-parent-read-boundary.spec.ts`: **11/11 PASS** (3.38 s).
The tests prove pre-I/O refusal, preservation of legacy payloads, policy change
rejection and gate revocation rejection. Their mocks do **not** prove qualified
source lineage, positive V2 parent reads or runtime deployment. These exact
named feature gaps remain **OPEN** pending commissioned parent fields and
qualified mapping; the safe boundary is not presented as full screen closure.

Core-workspace correction: Activation/Canary/Live/Sandbox now use shared
`coreSelectionMode`, which checks the current Core identity/session/membership
and sticky policy without rewriting the workspace into the retained Execution
source workspace. Both affected pure suites passed **15/15** after that change.
Cell H stopped at TypeScript compilation: Activation's widened session type
had omitted its existing `csrfSecretHash` extension. Restored
`AuthSession & { csrfSecretHash: string }`; Canary/Sandbox already retain it,
and Live is GET-only. H ran no tests and is not acceptance evidence. No further
source expansion is included while primary prepares the next focused build.
