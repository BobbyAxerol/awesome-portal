# BE-R2-3 — Maximum current Screen BFF and derived exact-query completion

Status: complete on 2026-09-11. This is a server-side BFF and contract
integrity change only. It does not deploy, restart, activate, mutate or
contact a Portal runtime, Execution Edge, Source Proxy, Trading System,
database, broker or command plane.

## Outcome

The named same-origin Screen BFF path now makes a sharp distinction between a
complete current Portal projection and an incomplete hot window. Blotter may
publish a Portal-derived count and aggregate only when the current committed
`orders` projection proves that exact result. It no longer turns a bounded,
partial window into an apparent exact count.

The phase also repairs a composition-routing edge case: Portal-owned Command
Center, Operations, Waivers and Admin Drawer read DTOs remain available as
honest local composition when a local execution projection has not yet been
configured. Once a projection workspace is configured, the existing strict
workspace binding remains in force.

## Authority boundary

Browser code continues to call named same-origin Portal operations only. It
cannot choose a Manager relation, send an Edge cursor, obtain mTLS material or
obtain a delegated assertion. `ExecutionProductReadSource` owns the accepted
screen/relation binding, filters, sort, scope, limits and opaque Portal cursor.
No generic relation endpoint, direct Trading System database path, Source
Proxy path or client-side global-page filtering was added.

The existing product map remains the authority for the current catalogue:

- `SCREEN_BFF_CATALOGUE` supplies named screen bindings;
- `ExecutionProductReadSource` consumes the local committed projection first
  and only uses its pre-existing named Manager fallback path;
- `PaperReadService` emits Paper/Blotter product DTOs;
- `OperationalCompositionService` emits Command Center, Operations, Waivers
  and Admin Drawer read DTOs from Portal-owned workflow plus accepted facts.

An empty Portal-owned panel remains a panel-local typed empty state. It is not
replaced by fixture rows and it does not collapse the entire screen.

## Exact Blotter proof

`execution.full-blotter.v1` publishes `exact_total`, `filtered_total` and
`aggregates` as `DERIVED` only if every condition below is true:

1. the named screen is `EXECUTION_FULL_BLOTTER_SCREEN` and relation is
   `orders`;
2. the response came from a committed local projection;
3. that relation declares `completeness = COMPLETE`;
4. the server-owned deployment scope declares `state = EXACT`; and
5. the local BFF supplied all three proof values after applying the same
   server-owned filter as the returned rows.

When accepted, the DTO includes:

- `authority: DERIVED`;
- `formula_version: portal.current-projection.orders-exact-query.v1`;
- `mirror_revision` (projection epoch, sequence, digest and refresh time);
- `coverage` (relation completeness, scope state, returned rows, current
  population and filtered population); and
- `history_semantics: CURRENT_PROJECTION_POPULATION_NOT_FULL_HISTORY`.

The aggregate is calculated from the scoped/filter-matched population, not
from every item in the projection. Thus a `status=FILLED` view cannot inherit
the aggregate of unfiltered orders.

If any proof fails, totals and aggregates are `null` and the named capability
is typed without guessing:

| Condition | State | Reason code |
| --- | --- | --- |
| Local orders mirror is partial | `PARTIAL` | `BE_R2_3_LOCAL_MIRROR_INCOMPLETE` |
| Server-owned scope is partial | `PARTIAL` | `BE_R2_3_LOCAL_SCOPE_PARTIAL` |
| Required local proof fields missing | `UNAVAILABLE` | `BE_R2_3_LOCAL_EXACT_QUERY_PROOF_MISSING` |
| No local exact-query page | `UNAVAILABLE` | `PHASE2_LOCAL_EXACT_QUERY_NOT_ACTIVE` |

A future direct Manager exact-total contract remains `TRADING_SYSTEM`; Portal
does not relabel it as a derivation. No branch makes a claim about global
historical total, replay continuity or rows beyond the current committed
population.

The proof has a checked-in canonical contract in
`execution-paper-read.v1.schema.json` and the matching Paper Read OpenAPI
document/generated declaration. `exact_query` is not an undocumented
best-effort object: it requires its schema/version, relation, history
semantics, state, authority, formula/reason and coverage. A `DERIVED` result
also requires the exact mirror revision. An `AVAILABLE` result cannot use a
null authority or reason. The canonical fixture and negative contract cases
prove those constraints.

## Duplicate approval integrity

The phase reuses the existing PostgreSQL concurrency regression rather than
introducing a second, weaker imitation. It sends two parallel requests with
the same approval request key and proves one accepted request ID with replay
semantics, then proves distinct conflicting requests receive the typed
duplicate outcome. It exercises the real uniqueness/serialization boundary in
`governance-product.spec.ts`.

## Verification

The isolated Docker Control API test cell passed on 2026-09-11:

```text
./scripts/control-api-test.sh
TypeScript build: passed
Vitest: 58 files passed, 496 tests passed

./scripts/contracts-test.sh
Canonical fixtures/OpenAPI/generated types: 121 tests passed
```

Focused evidence covered:

- complete local 201-order projection: exact total `201`, filtered total `1`
  and filter-scoped aggregate only;
- same projection marked `PARTIAL`: no projected total, filtered total or
  aggregate is emitted;
- Blotter DTO: complete proof is labelled `DERIVED`; partial proof returns the
  typed reason and null values;
- named authenticated same-origin Command Center and Blotter BFF shells,
  including no raw source route escape;
- direct/empty/partial/unavailable Paper fixtures, cursor binding and profile
  projection suite; and
- real concurrent approval replay/conflict regression.

The contract gate additionally validates the new canonical fixture, rejects a
derived result with its mirror proof removed, rejects an `AVAILABLE` result
with null authority, and confirms generated Paper Read types exactly match
OpenAPI.

Expected test logs intentionally include exercised fail-closed source cases;
the suite asserts their typed outcomes and completed with exit status zero.

## Frontend handoff

Keep the approved rich Blotter shell. Render `exact_query` within the relevant
count/aggregate panel:

- `AVAILABLE` plus `DERIVED`: show current-projection provenance and do not
  call it full history;
- `PARTIAL`: retain the table/chart shell, show its panel-local reason and no
  invented total;
- `UNAVAILABLE`: retain the shell and render its typed reason; and
- future `TRADING_SYSTEM` direct totals: render the source authority rather
  than a Portal-derived label.

Command Center, Operations, Waivers and Admin Drawer must retain their
Portal-owned composition shell when execution projection is dark. They must
not replace it with demo data or attempt a browser-to-Manager fallback.

## Remaining external facts are not phase debt

The current Manager contract still bounds what can be truthfully shown. Any
`SOURCE_GAP_CONFIRMED`, unavailable relation, incomplete retained population
or absent source history remains typed. Those are source facts, not a reason
to widen Portal authority or fabricate rows. BE-R2-3 leaves no known
implementation gap within its approved scope.
