# Portal Execution Edge maximum-data owner return v1

## Accepted outcome

`EX-DP-07` returns a complete, portable and digest-bound handoff for the
existing qualified Manager-v2 **current-page** read plane. Its exact status is
`RETURN_PACK_ACCEPTED_FOR_CURRENT_QUALIFIED_READS_AND_TYPED_EXTERNAL_GATES`.
That means the pack is ready for the Portal team to bind selected fixed E5
operations behind its server-side BFF after the normal immutable-image release
window. It does **not** claim a new deployment, a generic database API, an
arbitrary relation selector, source credential propagation, command activation
or an event/replay journal.

## What is usable now

- 34 frozen Portal field requirements map exactly once: 22
  `AVAILABLE_DIRECT`, 5 `AVAILABLE_DERIVED_AT_PORTAL`, 6 genuine
  `OWNER_ACTION_REQUIRED` source gaps, and 1 `CONTRACT_INCOMPATIBLE` Canary
  comparison. See `owner-response.v2.json`.
- The existing private Manager-v2 read plane is qualified for Paper, Sandbox
  and Live through profile-bound mTLS and the source proxy's 96-relation,
  catalogue-bound GET surface. A selected E5 operation has an upper bound of
  200 rows / 1 MiB and preserves source freshness, completeness and as-of
  metadata.
- All 99 census relations / 1,387 census columns, lineage and profile metadata
  are present as sanitized metadata only. The census intentionally contains no
  business rows, credentials or connection material.
- Existing direct pages cover current deployments, positions, sessions,
  orders, fills, account/balance/sync/binding, reconciliation, command journal,
  dead-letter, risk/sizing, equity/performance and instrument-reference
  surfaces only at their stated semantics. Page access is not proof of replay
  or total retained history.

## Measured bounded current-page evidence

The narrow E7 read-only probe used only the existing Edge mTLS mounts, source
proxy, catalogue and `deployment_current` named page with `limit=1`.

| Profile | Catalogue | Named-page state | Concurrent bound observed | Typed source errors | p95 ms |
| --- | --- | --- | ---: | ---: | ---: |
| Paper | 200 / available / fresh / complete / 96 relations | fresh / partial, continuation after reconnect | 1 | 1 × 503 during a two-request sample | 31.666 |
| Sandbox | 200 / available / fresh / complete / 96 relations | fresh / partial, continuation after reconnect | 1 | 1 × 503 during a two-request sample | 34.376 |
| Live | 200 / available / fresh / complete / 96 relations | fresh / complete / authoritative empty | 2 | 0 | 73.117 |

Use one concurrent named page per Paper/Sandbox profile and two per Live until
a new qualified measurement changes the policy. The configured admission limit
of two is **not** a blanket SLO. No automatic retry hides an upstream 503.
Full metrics and scope are in `e7-resilience-capacity.v1.json` and
`benchmarks/SOURCE_RATE_WINDOWS.csv`.

A separate bounded Live `order_current` page also received a typed HTTP 503.
That observation is preserved as `SOURCE_UNAVAILABLE_OBSERVED`, with no
automatic retry or empty-data substitution; it is an availability fact, not a
second capacity result.

## Exact semantic boundaries

- Current orders are current state, not lifecycle replay.
- `fill_history` may be a bounded retained range, but not correction-aware
  replay.
- Equity/performance are retained snapshots, not event history.
- A zero-row page is only `SOURCE_EMPTY_COMPLETE` when its envelope says
  `AVAILABLE` and `COMPLETE`.
- Portal consumers must use UTC epoch milliseconds and exact decimal strings;
  source continuations remain opaque and relation/profile-bound.

`EVENT_CONTINUITY_REPORT.md` and the six domain-capability JSON files are the
machine-readable/operational ruling for these boundaries.

## Genuine external source evidence requirements

The current source cannot honestly prove a global sequence, retention floor,
correction journal, full replay, independent-cell SGP ingest or a controlled
1/5/30-minute outage recovery test. These are explicit source/operational
requirements with named owners in `SOURCE_OWNER_GAPS.json` and
`e7-resilience-capacity.v1.json`; they are not hidden implementation debt and
are not papered over by an Edge cache or synthetic stream.

## Portal handoff

1. Validate this directory with `tools/validate_maximum_data_e7.py` and its
   `MANIFEST.sha256` file index.
2. Read `owner-response.v2.json` first, then E3 coverage CSVs, E5 publication,
   E6 acceptance and each domain-capability ruling.
3. Bind only a selected named E5 operation in the Portal server-side BFF.
   Never pass relation names, SQL, DB credentials, mTLS material or opaque
   cursor state to the browser.
4. Treat `OWNER_ACTION_REQUIRED` and `CONTRACT_INCOMPATIBLE` as typed product
   states, not empty data. Do not infer history/replay from current rows.
5. Use `RELEASE_COMPATIBILITY_MATRIX.json` for a separately approved deployment
   and rollback window; E7 itself changed no running container, source, route,
   identity, database, cache or command path.

## Integrity and rollback

`MANIFEST.sha256` hashes every portable return-pack file except itself. The
owner response binds the E7 manifest rather than recursively hashing itself.
The offline Rust `maximum-data-return` crate, Python verifier and Control API
fixture test reject missing artifacts, frozen-pin drift, unsafe replay claims,
unmeasured capacity promotion and private runtime/connection material.

Rollback is source-only: remove the additive E7 pack and validator before a
separately approved deployment. No runtime rollback is necessary because E7
made no runtime mutation.
