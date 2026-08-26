# N11 Consolidated Trading System External Read Publication Request

Status: `PORTAL_REQUEST_AND_GATE_COMPLETE / OWNER_PUBLICATION_PENDING`  
Request revision: `portal.execution.external-read-request.v1`

This is the single consolidated request from Portal to the Trading System
owner. It supersedes sending separate source requests for BR-EX-24…27, VNM
session truth, stage/replay/binding/live source panels and the eight ops reads.

It does **not** authorize Portal to change Trading System, call a source route,
receive database/Redis/CLI/broker credentials or mount a Source Proxy location.
The checked-in files are non-authoritative examples with zero digests,
`owner_accepted=false`, `published=false` and `portal_reachable=false`.

## Owner deliverables

Return one sanitized directory containing these five metadata files plus the
two bounded artifact directories:

1. `capability-catalogue.json`
2. `semantic-rulings.json`
3. `golden-corpus-index.json`
4. `acceptance-results.json`
5. `owner-publication.manifest.json`
6. `schemas/<capability-id>.schema.json`
7. `fixtures/<capability-id>.valid.json`

The owner pack may publish a strict subset first, but it must set
`partial_publication=true`; every missing panel remains typed unavailable. A
claim of complete publication must contain all 24 capabilities.

Every published capability requires:

- exact purpose-built `GET` path from the request catalogue;
- TLS 1.3 mTLS plus exact-resource delegated read JWT;
- explicit `workspace_id` and `environment` request scope in addition to the
  delegated JWT; resource routes also require a strict path resource ID;
- a versioned response JSON Schema and positive secret-free fixture, each bound
  by a non-zero SHA-256 digest;
- authority/freshness envelope with `EXECUTION_CELL`, `as_of`, source sequence,
  completeness, projection lag and trace ID;
- declared keyset/response limits no wider than the request;
- negative evidence for wrong/missing/revoked identity, wrong workspace/
  environment/entity, expired assertion, schema drift, over-limit response,
  stale/partial/unavailable and source loss/recovery.

The verifier reads every published schema and fixture as regular non-symlink
JSON, checks its bytes against both catalogue and corpus index, validates the
  common Execution Cell envelope and rejects secret-shaped fields. A manifest
  containing invented hashes without the actual artifacts is therefore NO-GO.

The common positive response envelope carries `authority=EXECUTION_CELL`, an
RFC3339 `as_of`, non-negative integer `source_sequence`, freshness in
`FRESH|DEGRADED|STALE|UNAVAILABLE`, completeness in
`COMPLETE|PARTIAL|UNKNOWN`, non-negative `projection_lag_ms`, `trace_id` and an
object-valued `data`. Pagination remains capability-schema-owned.

## Semantics the owner must rule explicitly

- twelve Trading System order statuses → five Full Blotter buckets, with
  `CANCELED`/`EXPIRED` still reachable through `ALL`;
- four-stage funnel remains authoritative unless real signal/intent facts carry
  stable identity, timestamp, order binding and completeness;
- binding exposure verdict is calculated from full virtual population plus
  physical broker truth per currency; missing/stale population is `UNKNOWN`;
- packed correlation publishes one sample count per packed cell; the owner must
  publish self-pair counts or explicitly choose nullable diagonal semantics;
- VNM calendar/session timeline and `LO`/`ATO`/`ATC`/`MP` remain verbatim venue
  semantics, never aliases invented by Portal.

## Hard rejects

No generic SQL/database access, `redis/get`, `redis/scan`, arbitrary Redis
keyspace/stream access, CLI/shell route, broker credential, command/mutation,
wildcard path/method, raw secret, public listener or caller-selectable source
scope is accepted.

## Verification

Portal validates the examples offline:

```bash
python3 scripts/execution-n11-external-read-verify.py --mode template
```

After the owner returns a candidate:

```bash
python3 scripts/execution-n11-external-read-verify.py \
  --mode candidate --pack-dir /secure/path/to/owner-pack
```

Acceptance mode additionally requires owner acceptance, all declared evidence
cases and immutable file digests. Acceptance still does not activate runtime:

```bash
python3 scripts/execution-n11-external-read-verify.py \
  --mode acceptance --pack-dir /secure/path/to/owner-pack
```

Only after acceptance does Portal import the exact response schemas and golden
fixtures, generate typed mappers, render exact Source Proxy locations and run
source parity/load/fault/rollback evidence. Activation remains a separate
profile decision.
