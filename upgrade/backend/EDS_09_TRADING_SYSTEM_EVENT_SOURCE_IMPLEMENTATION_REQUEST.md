# EDS-09 — Trading System event-source implementation addendum

**Status:** `OFFICIAL_IMPLEMENTATION_ADDENDUM / SOURCE_OWNER_ACTION_REQUIRED / PORTAL_SOURCE_DARK`  
**Date:** 2026-09-05  
**Parent request:** [`Official Trading System Owner Request — N28 Genuine Gaps Only`](./TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md), MC-01 `event.full-incremental`  
**Machine contract:** [`eds08-source-continuity-v1`](../../services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1/)

## 1. One purpose, no competing request

This is the single implementation addendum for **MC-01**. It does not replace
the official owner request, ask for a Portal change, or create a second event
platform request.

The goal is to publish the maximum truthful, versioned event source the Trading
System already can support, so that Portal can later ingest it through the
private Execution Edge. Prefer one coherent contract family and one return
pack over one request per screen or per relation.

Do not delay a useful result for a source redesign. The source owner retains
the choice of immutable journal, outbox, CDC bridge, or append-only keyset
tail. Portal does not prescribe a Trading System table, database, queue,
cache, endpoint implementation, or broker integration.

## 2. What must be assessed and returned together

Assess all three event classes in one delivery. Publish every class/profile
combination that is true today; classify the rest honestly. Do not infer an
event source from mutable current rows, page hashes, Portal projection deltas,
or a `domain_events` table that has no exact owner-controlled sequence.

| Event class | Product truth unlocked when accepted | Required profiles |
| --- | --- | --- |
| `execution.position-lifecycle.v1` | retained position-version / exposure lifecycle | `PAPER`, `SANDBOX`, `LIVE` where source truth exists |
| `execution.fill-lifecycle.v1` | correction- and tombstone-safe Trade Replay | `PAPER`, `SANDBOX`, `LIVE` where source truth exists |
| `risk.decision-lifecycle.v1` | corrected risk-decision lifecycle | `PAPER`, `SANDBOX`, `LIVE` where source truth exists |

An unavailable class or profile is acceptable only as a precise
`SOURCE_GAP_CONFIRMED` result. Do not synthesize it. A non-event bounded read
may be returned as `CAPABILITY_ACCEPTED_NON_EVENT`, but it does **not** unlock
replay.

## 3. Minimum contract semantics

For each `EVENT_SOURCE_ACCEPTED` entry, the owner-published contract must bind
one stream to its workspace, profile, venue, resource and filter scope, and
provide all of the following:

1. source epoch and contiguous owner-controlled sequence encoded as an exact
   decimal-string `u64`;
2. immutable event ID and immutable entity-version ID;
3. UTC epoch-millisecond timestamps;
4. explicit correction and tombstone causality;
5. declared retention floor and an opaque relation-bound resumable cursor;
6. a snapshot with high-watermark `W`, followed only by tail sequence `W + 1`;
7. explicit `RESNAPSHOT_REQUIRED`-style handling for a gap, epoch change, or
   retention boundary; and
8. cross-profile rejection rather than a silently broadened read.

The wire contract must be separately versioned and resolve the current
GET/stream ambiguity: H2 over TLS 1.3 mTLS, delegated-read JWT audience and
scope binding, payload checksum, compression rule, decoded-frame bound,
snapshot/tail framing, resume cursor, backpressure and typed errors. It must
remain a private server-to-server read surface; browsers never receive its
cursor, certificate material, JWT, relation name, or source connection data.

## 4. Scope exclusions

This delivery is **source-dark**. It must not:

- deploy or restart Portal, Execution Edge, Source Proxy, or runtime
  containers;
- change Portal flags, activate a profile, or open source traffic;
- give Portal direct access to a Trading System database, Redis, broker,
  queue, CLI, shell, or source credential;
- add a generic query endpoint or claim global ordering across unrelated
  streams; or
- include a credential, private key, certificate, DSN, raw SQL, real business
  row, account identifier, strategy identifier, or instrument identifier in
  the return pack.

Commands and mutation authority remain outside this addendum.

## 5. Required owner implementation and evidence

Work in the Trading System repository on the owner-approved feature branch.
First inspect its current sources and publish a source-as-is mapping for all
three classes. Then implement only the narrow owner-side contract needed for
the truthful classes.

Before return, run focused source tests covering at least:

- exact duplicate delivery and idempotent identity;
- an injected sequence gap and explicit resnapshot outcome;
- correction and tombstone causality;
- epoch reset and retention-floor expiry;
- snapshot high-watermark followed by the first legal tail frame;
- resume cursor behavior after restart;
- cross-profile denial;
- positive mTLS/delegated-JWT read proof and negative wrong
  audience/profile/capability proof; and
- bounded frame/body, backpressure, restart, corruption and rollback handling.

Evidence must state the declared retention and the sizing proof: at least twice
peak expected ingestion capacity, disk/spool bound, and behavior under source
loss and recovery. It may use synthetic data only.

## 6. One sanitized return package

Return one immutable package, not chat fragments. It must contain the exact
EDS-08 machine return plus the versioned contract/evidence referenced by its
SHA-256 fields:

```text
portal-execution-event-source-return-v1/
  owner-return.v1.json
  source-event-envelope.v1.schema.json
  snapshot-tail.v1.schema.json
  wire-contract.md
  fixtures/
  acceptance/
  RETURN_MANIFEST.sha256
```

`owner-return.v1.json` must validate against the supplied
`owner-return.v1.schema.json`, contain all 18 EDS-08 gap entries, name the
source commit and owner ID, and use only one of these states per entry:

- `EVENT_SOURCE_ACCEPTED` when every event requirement above is proven;
- `CAPABILITY_ACCEPTED_NON_EVENT` for a valid bounded non-event capability;
- `SOURCE_GAP_CONFIRMED` with a concise truthful reason otherwise.

From the root of the returned package, provide output for:

```bash
sha256sum -c RETURN_MANIFEST.sha256
python3 services/portal-execution-edge-rs/tools/validate_eds08_source_continuity.py \
  --owner-return portal-execution-event-source-return-v1/owner-return.v1.json
```

If the validator does not live in the Trading System repository, copy no
Portal runtime secrets; run it from an audited Portal checkout or give Portal
the package and source commit for independent validation.

## 7. Handoff and next boundary

Return to Bobby/Portal:

1. Trading System source commit SHA and immutable image digest, if built;
2. the single sanitized package above with a passing manifest;
3. a short source-as-is mapping that names accepted versus gap-confirmed
   classes/profiles; and
4. the test command/output summary, without secrets or business rows.

This does **not** authorize deployment. Portal will independently validate the
package and then propose a separate, narrow activation window for exactly one
accepted class/profile. No activation happens as part of this source-owner
delivery.

## 8. Portal receipt rule

Portal accepts only manifest- and schema-valid `EVENT_SOURCE_ACCEPTED` bytes.
It will build a narrow adapter for that exact versioned wire contract, not a
generic relation reader. The remaining event classes/profiles stay typed and
visible until their owner evidence becomes true.
