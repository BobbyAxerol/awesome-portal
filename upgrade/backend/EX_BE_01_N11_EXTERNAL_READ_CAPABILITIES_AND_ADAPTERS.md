# N11 — Published External Read Capabilities and Adapters

Status: `PORTAL_REQUEST_GATE_AND_ADAPTER_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`  
Date: 2026-08-26  
Owner: Portal backend; publication owner: Trading System

## 1. Outcome

N11 closes the Portal-owned half of the external read boundary. One consolidated,
machine-readable request now covers every known Trading System read needed by
BR-EX-24…27, VNM session truth, stage/replay/binding/live panels and operations.
It replaces per-screen prose requests and deliberately does not open a route.

```text
Trading System owner publication (not yet returned)
  catalogue + semantic rulings + schemas + fixtures + evidence + manifest
                              |
                    Python offline verifier
                              |
                 Rust compatibility/read gate
                              |
                 typed mapper generated later
```

No Trading System code, database, Redis, CLI, broker, AWS-HK listener, mTLS
configuration, delegated JWT issuer, Source Proxy location, registry delivery
profile or Portal runtime was changed.

## 2. Consolidated capability surface

Twenty-four exact `GET` capabilities are locked:

| Group | Capabilities |
|---|---|
| Orders | list, trace, legs, fills |
| Deployment | positions, execution quality, contribution |
| Binding/portfolio | binding snapshot, full-population exposure verdict, packed correlation samples |
| Venue/market | VNM calendar, ticks, candles |
| Current state | account, session, reconciliation |
| Operations | command journal, findings, alerts, dead letters, trace order, streams, alpha activity, Redis-retention facts |

The last item is a typed retention facts endpoint, not generic Redis authority.
Generic SQL, DB credentials, Redis get/scan/keyspace, CLI/shell, broker access,
commands, mutations and wildcard paths remain explicitly rejected.

## 3. Owner publication gate

The owner must return one sanitized pack containing catalogue, semantic
rulings, acceptance results, manifest and real JSON Schema/positive fixture
files. The verifier:

- rejects duplicate JSON keys, symlinks, traversal and over-sized metadata;
- locks every method, path, auth mode, row bound and byte bound;
- verifies the actual schema and fixture bytes against both catalogue and
  corpus index instead of trusting declared hashes;
- requires an Execution Cell authority/freshness/completeness envelope and
  rejects secret-shaped fixture fields;
- requires source commit/image identity, owner acceptance and evidence-only
  authority for acceptance mode;
- permits an explicit partial publication, while every missing capability
  remains unavailable.

Template, candidate and acceptance are separate modes. Even a valid accepted
pack returns `portal_activation=false`.

## 4. Rust compatibility adapter

`external-read-adapter` is a pure, source-dark Rust crate. It provides:

- a closed 24-capability enum and route/bounds table;
- strict owner catalogue/manifest deserialization and SHA-256 binding;
- fail-closed authority and publication-completeness checks;
- exact `GET` request blueprints with required `workspace_id` and
  `environment`, strict resource IDs, per-capability query allowlists,
  bounded limits and mutually exclusive cursors;
- transport-owned authentication: the crate never stores or emits a secret;
- response binding to contract revision, capability and response-schema hash;
- typed `Success`, `Denied`, `Retryable`, `Unavailable` and `Incompatible`
  outcomes instead of false empty data;
- Execution Cell authority, timestamp, integer source sequence, freshness,
  completeness, projection lag and trace validation;
- recursive secret-shaped response rejection.

The crate intentionally stops before HTTP transport and generated data
mappers. Those are legal only after exact owner schemas/fixtures pass the
acceptance verifier.

## 5. Semantic decisions carried in the pack

- twelve order statuses map to `FILLED`, `PARTIAL`, `REJECTED`, `OPEN` or
  `ALL`; canceled/expired remain reachable only through `ALL`;
- the funnel remains four-stage unless the owner publishes stable signal and
  intent identity, timestamps, order binding and completeness;
- binding exposure is a full-population server verdict per currency; missing
  or stale population is `UNKNOWN`;
- packed correlation has one sample count per cell and an explicit diagonal
  ruling;
- VNM timezone, sessions, lot/tick/settlement policy and
  `LO/ATO/ATC/MP` semantics are owner-published, never inferred by Portal.

## 6. Acceptance evidence

| Gate | Result |
|---|---:|
| N11 verifier unit suite | 17/17 passed |
| Request template validation | 24 capabilities; valid; non-authoritative |
| Focused Rust unit suite | 8/8 passed |
| Focused Rust clippy `-D warnings` | passed |
| Full Rust workspace regression | 211/211 passed |
| Full Rust workspace clippy `-D warnings` | passed |
| PostgreSQL projection backup/restore signature | matched |
| Portal monorepo workspace verification | passed |

The negative suite covers authority widening, route/method/auth/bounds drift,
missing capability, partial publication, zero digest, manifest drift, owner
identity mismatch, unresolved semantics, corpus mismatch, changed artifact
bytes, secret-shaped fixture data, failed acceptance evidence, duplicate keys
and symlinks. Rust tests cover partial publication, request injection, scope,
limits/cursors, schema headers, secret-shaped responses and distinct error
outcomes.

## 7. Honest remaining gate and rollback

The Trading System owner has not yet returned an accepted publication. Thus no
claim is made that these routes exist, are reachable or contain real data.
Frontend panels remain unavailable/fixture-labelled; Source Proxy locations and
all source/query/SSE flags remain unchanged.

Rollback is one source commit. There is no data migration, runtime service,
network rule, secret, deployment or external state to undo.

## 8. Next backend phase

N12 is the live command relay contract/authority phase. Keep it separate from
this read-only pack: read failure must never grant command authority. Before a
final owner handoff, append N12's exact command publication request so the
Trading System owner receives one coordinated read+command packet rather than
another sequence of narrow requests.
