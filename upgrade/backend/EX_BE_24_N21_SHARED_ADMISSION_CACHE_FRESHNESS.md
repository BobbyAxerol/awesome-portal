# EX-BE-24 — N21 Shared Admission, Cache and Freshness

**Status:** `COMPLETE / DUAL_CELL_SHARED_AUTHORITY / TD-EX-02_CLOSED / N22_READY`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** none; all existing source/product flags retain their value

## 1. Goal and result

N21 closes the multi-replica source-budget gap before Paper product reads are
enabled. Admission is shared inside each deployment cell and never depends on
a cross-region database:

- SGP Control API replicas coordinate through the existing Control API
  PostgreSQL database;
- AWS-HK Rust Edge replicas coordinate through the existing projection
  PostgreSQL database;
- no Redis, new infrastructure, Trading System change or cross-cell database
  dependency was introduced.

Both authorities enforce a source-wide and profile-wide budget using
PostgreSQL time and row locks. The Portal default is 8 requests/second, below
the profile Source Proxy's 10 requests/second enforcement boundary and the
accepted owner ceiling, with 8 active requests by default. Expiring
permits recover after process loss. No dispatch path retries an ambiguous
source request.

This closes `TD-EX-02`; horizontal scaling can no longer multiply the accepted
source request rate by the number of BFF or Edge replicas.

## 2. SGP BFF authority

Migration `1723680000014_execution-shared-admission.sql` adds four bounded
coordination tables:

- `execution_shared_admission_state`;
- `execution_shared_admission_leases`;
- `execution_shared_read_flights`;
- `execution_shared_read_cache`.

`ExecutionSharedReadRepository` provides one atomic sequence:

1. validate source/profile/workspace/principal/role/adapter/path;
2. return a same-scope short cache hit, join one bounded flight, or become its
   leader;
3. acquire both source and profile quotas under row locks;
4. dispatch once through the existing mTLS/delegated-JWT proxy;
5. publish the bounded result and release flight/permit atomically.

Cache and coalescing keys bind the workspace, principal identity and role,
profile, adapter revision and exact request digest. A result from another
security or compatibility scope is therefore not addressable. Leader cleanup
is best effort without masking the original source error; PostgreSQL expiry is
the recovery authority.

## 3. AWS-HK Rust Edge authority

Projection migration `0011_shared_source_admission.sql` adds shared source and
profile state, expiring leases and a short source-read cache. The Rust Edge:

- requires projection PostgreSQL whenever Manager read is enabled;
- admits every Manager catalogue, capability, projection, relation and
  current-source request through the same shared authority;
- performs exactly one outbound dispatch;
- exposes typed admission/unavailable outcomes instead of retrying;
- caches only the authenticated catalogue envelope, bound to source, profile,
  adapter revision and operation;
- decodes cached bytes through the same pinned Manager contract before use.

The local in-process pacer/bulkhead remains defense in depth and can only
reduce traffic. PostgreSQL is the cross-replica authority.

## 4. Truth and freshness preservation

Every cache record carries and revalidates:

- source authority;
- `as_of`;
- freshness;
- completeness;
- source/profile and adapter revision;
- exact SHA-256 ETag;
- server-clock `stored_at` and `expires_at`.

The Control API response exposes `HIT`, `MISS` or `COALESCED` plus exact cache
provenance. Cache TTL defaults to 750 ms and is hard-capped at 5 seconds. It is
not a source of record and cannot turn stale, partial, paused or unavailable
source truth into fresh/complete truth.

Existing N19 bounds remain authoritative: maximum 200 relation rows, 1 MiB
response bodies, catalogue-bound cursor/key validation and no raw browser
relation API. N21 adds no N+1 composition path.

## 5. Loss, recovery and rollback

- abandoned permits and leaders recover only after their bounded DB-clock
  lease expires;
- a follower waits only for the current leader and never becomes an implicit
  retry;
- database loss returns typed unavailable and sends no unadmitted request;
- a source timeout or ambiguous dispatch is returned once;
- rollback disables Manager/BFF product-read flags or rolls back the image;
  no cache data is needed to recover authoritative truth;
- dump/restore signatures now include all seven N21 coordination/cache tables
  across both cells.

## 6. Verification

- N21 static dual-cell contract/secret/restore gate: pass;
- Control API real-PostgreSQL N21 suite: 5/5 pass, covering two-replica
  coalescing, scope isolation, shared rate/concurrency, abandoned lease
  recovery and provenance rejection;
- Rust PostgreSQL N21 suite: 3/3 pass, covering multi-store quota, lease
  recovery, cache profile/revision isolation and expiry;
- full Rust workspace tests, zero-warning Clippy, formatting, migration
  restore/replay and dependency audit: pass;
- Compose configuration bounds and environment template gate: pass;
- `git diff --check` and secret-shaped material scan: pass.

Test containers/networks are temporary. The reusable dependency/compiler
caches contain no source or runtime credentials.

## 7. Explicit non-effects

N21 did not call AWS-HK or Trading System, publish an image, activate Paper,
Sandbox or Live, change a registry delivery profile, merge to `dev`/`main`, or
touch stable runtime/data. It is an admission and truth-preservation phase.

## 8. Next phase

N22 may now activate the complete current Paper read set through canonical
screen BFF APIs. It must use this shared path, prove per-screen source parity,
replace only matching Paper smoke data and preserve typed empty/stale/partial/
unavailable states.
