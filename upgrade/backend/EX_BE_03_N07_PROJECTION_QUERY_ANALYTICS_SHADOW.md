# EX-BE-03 / N07 Projection, Query, analytics and narrow screen APIs in shadow

Status: `PORTAL_IMPLEMENTATION_COMPLETE / SHADOW_PROFILE_INACTIVE /
N06_REAL_EVIDENCE_PENDING / OWNER_PROMOTION_PENDING`

Date: 2026-08-26

## 1. Outcome

N07 now provides the Portal-owned activation authority and the first narrow
source-backed Paper screen boundary. The commissioned slice is deliberately
small: Paper Workbench `orders` and `positions` for one deployment. It does not
claim the equity, accounting, execution-quality, contribution, Alpha Fleet or
Trade Replay contracts requested in later BR packages.

No runtime was activated. Registry delivery remains `fixture`; Edge Query,
Paper Workbench, realtime and command flags remain false. The current N06 truth
still lacks accepted real 24-hour evidence, so no synthetic report can promote
the BUILDING epoch.

## 2. Architecture and authority

```text
browser session
      |
      | GET same-origin /api/v1/execution/deployments/paper/{id}/projection/{panel}
      v
TypeScript Control API
  session/RBAC + bounded query parser
  exact delegated resource: execution:screen:paper-workbench:{id}
      |
      | reusable HTTP/2 + TLS 1.3 mTLS + short delegated JWT
      v
Rust Execution Edge
  exact panel allowlist + workspace/environment/deployment scope injection
  activation-manifest revalidation + signed keyset Query
      |
      | REPEATABLE READ READ ONLY
      v
Portal-owned PostgreSQL projection ACTIVE epoch
      |
      +-- immutable N07 activation manifest and owner audit
```

Trading System remains upstream authority for source facts. Portal owns only
the projection, query semantics, freshness interpretation, UI delivery profile
and owner-gated activation. Browser and TypeScript never receive source
credentials, database credentials, mTLS private keys or raw delegated tokens.

## 3. Manifest-bound activation

`source-qualification::shadow_screen` defines exact schema
`execution.shadow-screen-activation.v1`. Acceptance requires:

- exact screen, public/private route, `shadow` delivery and fixed Paper scope;
- exact `d4.paper-read.v2` source revision, adapter/capability and immutable
  source/Edge/Control/schema/query digests;
- one N06 `EVIDENCE_ACCEPTED` report tied to the candidate BUILDING epoch,
  source revision and `PAPER_BINANCE_USDM` scope;
- equal expected, projected and replay semantic state digests;
- non-placeholder fixture parity, source-loss, auth, load, rollback and visual
  honest-state evidence hashes;
- projection/query/screen true while realtime/command stay false;
- explicit post-evidence owner approval.

Candidate evaluation cannot activate an epoch or mutate runtime/registry. Only
the private `AcceptedShadowActivation` Rust capability is accepted by
`PgProjectionStore::activate_shadow_epoch`.

Migration `0010_shadow_screen_activation.sql` stores the immutable manifest,
canonical digest, owner and timestamps. The cutover transaction locks the
candidate and current ACTIVE epoch, rejects unresolved gaps/dead letters,
recomputes the semantic digest, retains the previous epoch and activates the
candidate atomically. The old digest-only activation path is test-only.

Every N07 screen read calls `active_shadow_screen_authority`, deserializes and
revalidates the stored evidence, recomputes its canonical digest and verifies
the ACTIVE epoch identity. Missing or tampered authority fails closed.

## 4. Query and screen contract

Public route:

```text
GET /api/v1/execution/deployments/paper/{deploymentId}/projection/{panel}
panel = orders | positions
```

Bounded client query fields:

- `limit`: 1–250;
- `status`: at most 20 CSV values;
- `currency`: at most 12 CSV values;
- `instrument_id`: bounded contains search;
- `sort`: `as_of | projection_sequence | status | currency`;
- `direction`: `asc | desc`;
- exactly one of `after` or `before`.

The BFF has no `deployment_id` query input. Rust injects the deployment from the
authorized path as an immutable population filter. PostgreSQL applies that
filter before `total_count`; user filters apply afterward for
`filtered_count`. Thus counts and exact currency aggregates cannot disclose
another deployment. Both filter classes, workspace, environment, epoch,
resource, page size and sort are bound into the signed cursor.

The response publishes:

- exact epoch and activation-manifest authority;
- `PORTAL_PROJECTION` plus typed upstream authorities;
- exact decimal strings and full filtered-set currency aggregates;
- `EVENT_SOURCED | POLL_BOUNDED | UNKNOWN` completeness;
- poll bound, server read time, age/lag, freshness policy and state;
- `ok | empty | partial | stale` panel truth plus typed warnings;
- bidirectional keysets, exact counts and typed retention.

Empty, stale, poll-bounded and retention-unconfigured results remain visible;
the server does not manufacture chart/table facts.

## 5. Authentication, transport and bounded failure

- Browser authority is the existing Portal session and workspace context.
- TypeScript issues a short delegated read JWT for exactly
  `execution:screen:paper-workbench:{deploymentId}`.
- SGP→AWS uses the existing reusable mTLS HTTP/2 pool and bounded bulkhead.
- Response body remains capped at 2 MiB; concurrency, queue and timeouts are
  bounded by existing analytics transport settings.
- Only allowlisted `N07_*`/`ANALYTICS_*` upstream error codes with an identical
  HTTP status cross the BFF. Arbitrary upstream text/detail is discarded.
- Cursor expiry/context drift returns `N07_CURSOR_RESNAPSHOT_REQUIRED` (409).
- Epoch change, missing/tampered activation, unavailable projection and invalid
  queries have distinct typed codes; no error body contains source secrets.

## 6. Independent runtime gates and rollback

All defaults remain false:

```text
EDGE_PROJECTION_INGESTION_ENABLED
EDGE_SHADOW_QUERY_ENABLED
EDGE_PAPER_WORKBENCH_SHADOW_ENABLED
FEATURE_EXECUTION_SHADOW_QUERY
FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW
```

Realtime and command flags must remain false for N07. The SGP opt-in overlay is
`deploy/compose.execution-shadow-query.yaml`; merely committing it changes
nothing. Edge cursor keys are a separate root-owned keyring, not a Control API
cursor or governance-plan key.

Rollback order is registry `shadow -> fixture`, then BFF screen, BFF Query,
Edge screen and Edge Query off. Retained epoch recovery follows N05. Rollback
does not delete the manifest or projection evidence.

## 7. Test coverage

The N07-specific corpus covers:

- deterministic candidate evaluation with zero activation authority;
- owner-only acceptance and unknown-field/route/scope/flag/parity rejection;
- fresh PostgreSQL migration, atomic cutover and immutable audit lookup;
- stored-manifest tamper/no-screen failure;
- 182,000-row keyset scale with deployment-scoped exact counts/aggregates;
- client deployment-scope injection rejection;
- canonical Rust/OpenAPI fixture deserialization;
- empty/partial/freshness/authority response semantics;
- TypeScript flag dependency, query bounds and exact delegated resource;
- typed upstream error preservation without detail leakage;
- generated TypeScript/OpenAPI/fixture snapshot compatibility;
- PostgreSQL dump/restore including N07 activation evidence.

Required repository gates are:

```bash
./scripts/execution-edge-test.sh
./scripts/control-api-test.sh
./scripts/contracts-test.sh
./scripts/portal verify
```

Operational parity/source-loss/load/rollback/visual hashes must come from a
real N06-accepted window; unit fixtures are not operational evidence.

## 8. Remaining operational exit gate

1. Trading System owner publishes and accepts N02/N03 artifacts.
2. N04 consumes those exact bytes and N06 completes accepted 24-hour evidence.
3. N07 candidate manifest binds exact images/schema/query and six gate hashes.
4. Bobby reviews and approves the N07 acceptance manifest.
5. Activation transaction promotes only the named Paper epoch.
6. Edge Query then Paper screen are enabled; SGP BFF follows.
7. Claude runs fixture-vs-shadow and visual honest-state review.
8. Only then may registry change the named screen from `fixture` to `shadow`.

Until all eight steps pass, the current safe state is the correct state.

## 9. Claude lane

Use
`CODEX_TO_CLAUDE_N07_SHADOW_SCREEN_APIS_HANDOFF.md`. Claude can build the
adapter, typed error/state handling and parity tests now, but must not change
registry or imply the response covers the broader BR-EX-41/49/50 panels.

## 10. Next backend phase

N08 is the next dependency-ordered backend phase: SSE real-source activation,
qualified separately from N07. If real N06 evidence is still unavailable, N09
Portal-owned product gaps and N10 source-dark analytics contracts can proceed
without activating N07.
