# UDB-02 ownership, isolation and retained import

Core retains users, credentials, sessions, owner anchor, workspace membership,
grants/revocation, Governance/approval/command state, incidents/workflow and
all Research metadata/publication/seals. P22 RC → R1 remains in Core with its
original foreign keys, audit and idempotency. No identity tables are cloned.

Execution owns projection snapshots, fleet/binding/portfolio entities, local
timeseries, mirror schema, local query/operation continuation schema and
ephemeral cache/admission coordination. Seven repositories use the explicit
`EXECUTION_DATA_POOL`; Command Center uses Core for Governance/operations and
Execution for its single projection read. This cross-store read is not a
cross-database atomic snapshot. Authoritative event ledger remains Core/dark.

## Forward schema and roles

Independent ledger `131.execution-store.v1`, immutable hash-pinned input DDL
(014,016–026,030,031,033,130), not another copy of Core's `pgmigrations`.
Three original workspace foreign keys explicitly point to the local
`execution_workspace_references` receipt table. This is not membership:
HTTP authentication/authorization still resolve the current principal and
workspace in Core. Internal mirror constraints are retained unchanged.
Core-target and historical-input drift are refused before DDL.

Private PG16.15 pinned image, private network/no published PG port, independent
named volume. Owner credentials mount only on PG and the one-shot operator;
Control API gets a separate runtime DSN file and role. Runtime cannot change
retained facts, schema, users or roles; it may SELECT and update only six
ephemeral coordination/query tables. Core/Research keep their existing DSN,
pool and volume. Domain pool max6, max12 queued, 2s acquisition and 5s statement
bounds. A domain overload does not consume Core pool slots.

## Import policy

Read-only repeatable-read snapshot of the **local Portal-owned dev store**;
no TS/Edge/Redis/CLI/database access. Exact original workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660` is retained, not remapped into a personal one.
The named preview operator API provisions that workspace through the existing
Core owner anchor, with OWNER membership and a product audit event. It creates
no user/password/session/delegated grant and refuses non-local/non-dev runtime.

The primary `projection-history` lane imports these six tables:

- `execution_profile_projection_snapshots`
- `execution_manager_projection_snapshots`
- `execution_alpha_fleet_projection`
- `execution_binding_projection`
- `execution_portfolio_projection`
- `execution_timeseries_history`

Snapshots/resources retained fully within one authorized workspace. History
is latest ≤20,000 rows per environment/profile/relation and ≤100,000 total
rows/128MiB transfer. The manifest records source count, retained count,
truncation, timestamp range and SHA-256 for every table/file. Import is atomic,
empty-scope-only, scoped by run ID and rerun verifies content, never overwrites.
PostgreSQL JSON text preserves exact decimal strings and UTC microseconds.

The complementary `current-entities` lane imports all4,136 retained current
entities, plus only their necessary batch/revision/observation FK closure:

- `execution_durable_mirror_batches`:100 of223,108 source batches.
- `execution_durable_mirror_revisions`:7 of223,107 source revisions.
- `execution_durable_mirror_observations`:1,808 of3,940,381 source observations.
- `execution_durable_mirror_current_entities`:4,136 of4,136 source entities.

It preserves the latest per-profile revision and entity first/last batch and
last revision references. These are historical provenance, **not live replay
or resume authority**. The two lanes are separate immutable run-ID receipts;
neither rewrites the other. Auxiliary closure is explicitly incomplete.
Latest profile documents alone had lost accounts/deployments/etc on source
refusal; retaining existing older entities avoids discarding valid local
review facts, without changing current source availability or freshness.

Only legacy **history** is hydrated: mirror range remains0, no duplicate history.
Caches, leases, flights, refresh health, upstream continuation and query cursor
rows are not imported. Snapshot provenance/cursor strings remain immutable
historical metadata, never live resume authority. Source `as_of` null remains
null; receipt/import time never becomes source freshness. Local received time
does not prove Trading System availability or current population.

UDB-03 owns enabling retained readers, source-independent mode and per-screen
permissions/consumer coverage. UDB-02 alone does not claim all panels available.
Missing/source-stale/profile-empty states and coverage are handed off explicitly.

