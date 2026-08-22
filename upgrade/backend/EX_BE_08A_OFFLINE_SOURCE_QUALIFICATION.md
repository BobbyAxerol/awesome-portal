# EX-BE-08a — Offline Source Qualification Foundation

> **Status:** `OFFLINE_FOUNDATION_COMPLETE / LIVE_SOURCE_AND_CROSS_CELL_EVIDENCE_PENDING`  
> **Date:** 2026-08-22  
> **Authority:** Portal-owned Rust evidence harness only  
> **Activation:** none; registry remains `fixture`, runtime flags remain false  
> **Trading System:** no source, container, database, Redis, CLI or runtime mutation

## 1. Goal and binding references

This slice implements the part of `EX-BE-08a` that can be proven without an
approved AWS-HK endpoint or source credential. It creates a deterministic gate
between a captured/redacted source response and the Portal projection model.
It does **not** claim live source parity, cross-cell performance or production
readiness.

Binding design and exit gates remain in:

- [Execution Loop backend master plan](../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md),
  especially §§4, 12–14;
- [EX-BE-07b source-backed repositories and APIs](./EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md),
  especially §8;
- [EX-BE-02-LIVE discovery request](./EX_BE_02_LIVE_AWS_HK_DISCOVERY_AND_SAFE_BOOTSTRAP_REQUEST.md),
  whose D0–D4 authority gates are unchanged;
- [Execution backend hardening checkpoint](./EX_BE_HARDENING_CHECKPOINT.md).

## 2. Delivered architecture

The new pure Rust `source-qualification` crate provides this offline path:

```text
immutable TS v1 fixture
  -> pinned ts-adapter-v1 parsing/mapping
  -> canonical ProjectionObservation corpus
  -> compatibility + bound + digest validation
  -> live-order ProjectionReducer
  -> independent immutable-journal replay
  -> frozen semantic state digest comparison
  -> redacted, bounded qualification report
```

The corpus identity pins:

- corpus schema `execution.source-qualification.v1`;
- source contract revision `v1`;
- source gateway SHA-256 identity;
- adapter `ts-adapter-v1`;
- capability snapshot ID;
- capture timestamp, workspace and environment scope.

The sealed corpus digest covers the identity, scope, expected count, frozen
state digest and all observations. Any content or expectation drift is visible
before reducer state is created.

## 3. Fail-closed invariants and resource bounds

- A corpus is limited to 5,000 observations and 8 MiB. This is a bounded
  captured qualification unit, not permission to fetch an unbounded source
  response. Existing endpoint-specific adapter/transport limits still win.
- Corpus, capability, ingestion and entity identifiers are non-empty,
  ASCII-safe and at most 128 bytes.
- Digests must be lowercase canonical `sha256:<64 hex>` values.
- Every observation must carry the exact adapter and capability identity of
  the corpus and pass the projection reducer's completeness/payload rules.
- A source read more than two seconds after the sealed capture fails closed.
  Qualification projection time cannot precede corpus capture.
- Duplicate observations remain idempotent. An ingestion-ID collision with
  different content is rejected. Out-of-order observations never roll state
  backward. Sequence gaps remain visible and block the offline gate.
- Live-order state and journal replay must produce the same semantic digest,
  which must equal the independently frozen expected digest.
- The report contains only bounded identities, digests, status, blocker codes
  and counters/bytes. It never serializes source payloads, entity IDs,
  credentials or tokens.
- `activation_authorized` is always `false`, including a passing report.

Stable reason codes make failure evidence machine-readable without exposing
source values: schema/contract/adapter drift, invalid ID/digest, count/byte
overflow, observation identity mismatch, capture/projection time inversion,
corpus tamper, reducer rejection, replay mismatch and golden parity mismatch.

## 4. Evidence completed offline

The locked Docker gate `./scripts/execution-edge-test.sh` exercises the whole
Rust/PostgreSQL workspace, not only the new crate. At this checkpoint it passes
81 tests, `cargo fmt --check`, and Clippy with `-D warnings`.

The six focused qualification tests prove:

1. the immutable `orders.v1.json` Trading System response is parsed by the real
   v1 adapter, mapped to a canonical order fact and compared with frozen state
   digest
   `sha256:f1886c57d7d2d0897b4d98b5eb489ba5e283dd2e532a1e0b48cff429776e3cc4`;
2. live reduction and journal replay agree under duplicate, out-of-order and
   explicit source-gap input, and the report is redacted;
3. corpus tampering and source contract drift stop before reduction;
4. unknown source vocabulary remains raw and `supported=false` rather than
   becoming authoritative;
5. the 5,000-observation cap is processed deterministically while the report
   stays below 2 KiB;
6. future receipt, projection-time inversion and idempotency collision fail
   closed.

The wider gate also retains previously delivered evidence: typed fixtures for
all seven allowlisted source reads, transport byte/redirect/digest guards,
182,000-observation replay, 182,000-row PostgreSQL query/navigation, exact
decimals, active/retained epoch behavior, 100-client SSE fan-out and
source-backed analytics integrity.

These are deterministic correctness and bounded-capacity tests. Their wall
time is **not** a production latency benchmark and does not satisfy the p95/p99,
RSS, cross-cell or soak requirements in master-plan §13.2.

## 5. Deliberately not delivered

The following require an approved source and cannot be inferred from fixtures:

- the production poll/delta mapper for every source fact kind, including real
  pagination/cursor and snapshot-completeness semantics;
- a dedicated read-only Trading System service identity and verified capability
  snapshot from AWS-HK;
- SGP↔AWS WireGuard/mTLS/delegated-JWT success, expiry, rotation and revocation
  evidence;
- writing a real source stream into a `BUILDING` Portal epoch;
- real source-versus-projection count/digest parity, restart, cursor-gap,
  cutover and rollback drills;
- measured p50/p95/p99, RSS/allocations, upstream time, rows scanned, queue
  depth/drop and reconnect evidence at locked workload sizes;
- network-partition/fault injection, long-lived SSE soak, backup/restore and DR
  rehearsal;
- any `fixture -> shadow`, `shadow -> paper`, registry or runtime activation.

In particular, the current public v1 fixtures prove typed parsing but do not
publish enough authoritative delta/cursor semantics to invent a production
ingestion mapper. That contract must come from D0/D4 evidence or a future
published Trading System revision; Portal must not substitute direct database,
Redis, CLI or shell access.

## 6. Next gates and ownership

Recommended order after this offline checkpoint:

1. receive and review the sanitized **D0** AWS-HK response;
2. separately approve and execute D1–D3 connectivity/PKI deployment steps with
   rollback recorded;
3. at **D4**, obtain a least-privilege Paper read identity and capture redacted
   source corpora/capability evidence;
4. implement the published source mapper into a new `BUILDING` epoch and run
   shadow parity, restart, gap, mismatch and adapter-rollback drills;
5. measure master-plan §13.2 workloads and complete observability, alert,
   restore and soak evidence;
6. request an explicit owner decision before changing any screen profile or
   runtime flag.

`EX-BE-05b` remains separate and blocked on a published authenticated command
capability. Read qualification must never imply command authority.

Claude may continue source-independent screen adapters and complete/partial/
stale/missing/forbidden/capability-mismatch fixture states. Frontend code must
keep `fixture` visibly labelled and must not bind live SSE topics or assume a
shadow profile until the owner activation gate above is closed.
