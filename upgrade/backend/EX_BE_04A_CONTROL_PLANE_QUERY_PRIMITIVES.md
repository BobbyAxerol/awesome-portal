# EX-BE-04a — TypeScript Control-Plane Query Primitives

> Status: `FOUNDATION_COMPLETE`  
> Delivered: 2026-08-21  
> Authority: Portal control-plane PostgreSQL only  
> Next slice: `EX-BE-05a` governance/evidence/approval repository and API

## 1. Goal and boundary

`EX-BE-04a` supplies the reusable list-query foundation required by Approval
Inbox and later Portal-owned workflow queues. It implements BR-EX-01, 02, 03
and 17 from the Execution Loop master plan:

- opaque signed bidirectional keyset pagination;
- stable server-side sort with an immutable ID tie-break;
- allowlisted server-side filters and sorts;
- exact total and filtered counts;
- default page size 100 and hard maximum 250;
- workspace scope and RBAC outside client-controlled filters.

This slice is deliberately not an Approval Inbox endpoint. It creates no
approval/evidence tables, migrations, controller or production signing secret.
Those belong to `EX-BE-05a`. It also has no Rust, AWS HK, projection, realtime
or Trading System dependency and does not read or modify Trading System data.

## 2. Implementation map

| File | Responsibility |
|---|---|
| `apps/control-api/src/query/contracts.ts` | typed resource, request, response, error and telemetry contracts |
| `apps/control-api/src/query/request.ts` | bounded parsing, filter/sort allowlists and canonicalization |
| `apps/control-api/src/query/cursor.ts` | HMAC cursor codec, rotation, TTL and query/scope binding |
| `apps/control-api/src/query/postgres.ts` | safe SQL compilation, exact counts, keyset traversal and transaction boundary |
| `packages/contracts/schemas/keyset-page.v1.schema.json` | cross-boundary response metadata authority |
| `apps/control-api/test/query.spec.ts` | real PostgreSQL acceptance corpus and security tests |

Every concrete list defines a `PostgresListResource`; callers cannot provide
table names, columns or operators. A resource declares:

- its fixed table and explicitly selected public columns;
- its workspace column and allowed roles;
- allowlisted filter fields, types and operators;
- allowlisted non-null sort columns and immutable ID field;
- default stable sort, statement timeout and row mapper.

The selected-column list must include all cursor sort columns. This prevents a
new private database column from leaking through an accidental `SELECT *`.

## 3. Wire contract

The canonical response is `keyset-page.v1`:

```json
{
  "rows": [],
  "total_count": 182000,
  "filtered_count": 45500,
  "next_cursor": "opaque-or-null",
  "prev_cursor": null,
  "has_more": true,
  "has_previous": false,
  "applied_filters": [
    { "field": "status", "op": "eq", "value": "PENDING" }
  ],
  "applied_sort": [
    { "field": "sla_due_at", "direction": "asc" },
    { "field": "approval_id", "direction": "asc" }
  ]
}
```

`rows` stays resource-specific; the shared schema owns navigation, count and
echo semantics. A concrete endpoint added by `EX-BE-05a` must publish its own
row schema and compose it with this metadata contract. There is no offset,
page number or browser-derived count.

Requests accept one of `after` or `before`, never both. Sort input may be a
bounded string or structured list; filter input is structured. The parser
normalizes equivalent `in` values and filter ordering before cursor binding.

## 4. Cursor and threat model

Token format is `kc1.<key-id>.<canonical-payload>.<hmac-sha256>` and is opaque
to clients. The signature is domain-separated and checked in constant time.
The payload binds all values that could otherwise be replayed across authority
or query boundaries:

- resource ID;
- authenticated workspace ID;
- direction (`after` or `before`);
- canonical filter/sort/limit fingerprint;
- full keyset boundary including the immutable tie-break;
- issue and expiry times;
- signing-key ID and schema version.

Tamper, expiry, unknown key, wrong direction, wrong workspace/resource or query
drift all return the same safe `INVALID_CURSOR` error. Multiple verification
keys support rotation while only the active key signs new tokens. Production
key loading and rotation wiring is intentionally deferred to `EX-BE-05a`,
where the endpoint and runtime configuration first exist.

## 5. PostgreSQL semantics

The service opens one `REPEATABLE READ READ ONLY` transaction, applies a local
bounded statement timeout, then obtains:

1. exact workspace-scoped total count;
2. exact workspace-scoped filtered count;
3. `limit + 1` rows using a lexicographic keyset predicate.

All three statements see one snapshot, so counts and rows in a response cannot
contradict each other because of a concurrent write. Navigation never uses
`OFFSET`. Reverse traversal flips each effective sort direction for the scan,
then restores canonical display order before mapping rows.

The immutable ID tie-break is appended when the caller's sort omits it. Mixed
ascending/descending multi-column sorts compile as an OR-of-prefix-equalities
keyset predicate. All values use PostgreSQL bindings; identifiers originate
only from startup-validated resource definitions.

Telemetry records resource, direction, timing, counts, returned rows and limit.
It intentionally excludes actor ID, workspace ID, cursors and filter values.
A telemetry sink failure cannot fail an already committed read-only query.

## 6. Acceptance evidence

The real PostgreSQL 16 test creates an unlogged 182,000-row workspace corpus,
a second isolated workspace, stable duplicate timestamps and the required
indexes. It proves:

- exact 182,000 total and filtered counts;
- 100 default / 250 maximum page bounds;
- forward and reverse traversal without offset;
- immutable-ID stability for duplicate primary sort values;
- no duplicate rows after an insert before an existing cursor;
- navigation availability is recomputed after rows before a cursor are evicted;
- filter/sort allowlists and hostile-value parameterization;
- cursor tamper, expiry, rotation and cross-query/scope rejection;
- RBAC and workspace isolation;
- public-column projection and telemetry data minimization;
- fail-open telemetry after a completed query.

Evidence recorded on 2026-08-21:

- Control API TypeScript typecheck: pass;
- Control API + PostgreSQL suite: **76/76 pass**, including **14 EX-BE-04a tests**;
- canonical contracts/AJV/OpenAPI sync: **8/8 pass**;
- canonical contracts/Python jsonschema snapshot suite: **7/7 pass**;
- root workspace verify: recorded after final documentation update.

## 7. Exit status and technical debt

`EX-BE-04a` is `FOUNDATION_COMPLETE`, not `PRODUCT_COMPLETE`. It removes query
mechanism risk but does not change a screen delivery profile from `fixture`.

`EX-BE-05a` must next add:

1. versioned governance, approval and evidence migrations/repositories;
2. session-guarded `GET /api/v1/execution/governance/approvals` and Gate R1
   detail/decision endpoints;
3. concrete resource descriptors, row schemas and OpenAPI contracts;
4. runtime cursor-key configuration, rotation procedure and RFC 7807 mapping;
5. SoD, optimistic concurrency, immutable evidence hash and audit tests;
6. query-plan/performance evidence on the final indexes and real row shape.

Interactive exact counts can become expensive as a concrete table and policy
grow. The contract deliberately fails through the bounded timeout rather than
silently replacing an exact safety count with an estimate. `EX-BE-05a` must
record `EXPLAIN (ANALYZE, BUFFERS)` plus p50/p95/p99 against the named 182k
corpus; production budgets are not inferred from unit-test duration.

Nullable sort columns are not supported by this primitive. Concrete workflow
schemas must make cursor sort columns `NOT NULL`, or a future version must add
an explicit, tested null-order contract before such a resource is registered.

## 8. Frontend/Claude handoff

Claude's existing `readKeysetPage` adapter already consumes the delivered
snake-case response fields. Frontend work can continue on fixture-backed
Approval Inbox and Gate R1 states without waiting for AWS or Trading System.
Do not wire a real endpoint until `EX-BE-05a` publishes the concrete approval
row/OpenAPI contract; until then the registry delivery profile remains
`fixture` and runtime query capability remains disabled.
