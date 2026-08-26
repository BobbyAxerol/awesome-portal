# EX-BE-03 / N05 Retention, Recovery and Cleanup

Status: `SOURCE_DARK_COMPLETE / RETENTION_RECOVERY_CORE_COMPLETE /
LIVE_POLICY_ACTIVATION_PENDING / LIVE_SOURCE_OFF`

Date: 2026-08-26

## 1. Outcome

Portal now has a Rust/PostgreSQL lifecycle for bounded local projection storage
without turning expired, missing or failed data into an ordinary empty result.
Cleanup is possible only for a `RETIRED` epoch after immutable policy evidence,
full-journal archive coverage, encrypted-archive evidence, a successful restore
verification and the rollback window have all passed.

This is an offline/source-dark N05 delivery. It does not call AWS-HK, read the
Trading System, enable Source Proxy, activate an epoch, change a registry delivery
profile, schedule a production backup or delete any runtime data.

## 2. Authority boundary

```text
Trading System / Source Proxy
          X                     source remains off in N05
          |
Portal shared consumer (N04)
          |
          v
Portal PostgreSQL projection
  | ACTIVE       never cleaned
  | RETAINED     rollback/overlap only; never cleaned
  | RETIRED      eligible only after all N05 evidence gates
  v
Encrypted archive + verified deterministic restore
          |
          v
Audited atomic cleanup of heavy RETIRED-epoch rows
```

Trading System owns source truth. Portal owns only its projection, retention
policy, archive/restore proof and cleanup audit. N05 adds no source, broker,
command, Redis, CLI or Trading-System database authority.

## 3. Retention and pressure model

Each scope receives an immutable lifecycle-policy snapshot containing:

- semantic policy version and canonical SHA-256 digest;
- hot and rollback windows;
- Portal projection storage budget;
- soft and hard pressure percentages;
- maximum journal rows;
- scope and creation time.

The policy digest is recomputed from canonical fields before persistence, so a
caller cannot attach an arbitrary digest to drifted values. Version reuse with a
different digest fails closed.

Storage pressure is integer-only and overflow-safe:

| State | Portal behavior |
|---|---|
| `HEALTHY` | continue |
| `SOFT_LIMIT` | schedule already eligible RETIRED cleanup |
| `HARD_LIMIT` | pause ingestion and create a new BUILDING recovery epoch |
| cursor expired / sequence gap | pause ingestion and create a new BUILDING epoch |

Neither hard pressure nor a source gap grants permission to compact ACTIVE or
RETAINED truth. There is no in-place ACTIVE repair path.

## 4. Query retention truth

The existing Query API contract remains canonical and now has one checked
frontend fixture covering all five states:

- `HOT`;
- `PARTIAL_HOT`;
- `COLD_REQUESTABLE`, with an explicit access-request path;
- `PURGED`;
- `UNKNOWN`.

Cold, purged and unknown history returns typed availability metadata rather than
an empty-success response. The fixture is:

`services/portal-execution-edge-rs/crates/query-api/fixtures/retention-availability.v1.json`

## 5. Recovery and cleanup gates

The exact lifecycle is:

1. a replacement BUILDING epoch passes parity and becomes ACTIVE;
2. the previous ACTIVE epoch becomes RETAINED for its overlap window;
3. retirement is rejected until overlap ends and another ACTIVE epoch exists;
4. recovery evidence must cover the exact maximum journal ordinal, exact
   projection sequence and exact activated state digest;
5. evidence records an archive digest, an encryption-key digest and ordered
   archive/restore verification times;
6. a cleanup plan computes `retired_at + max(hot_window, rollback_window)` and
   cannot shorten either boundary;
7. cleanup starts only with a transaction-local audit UUID and no live lease;
8. heavy rows are removed atomically; failure rolls back the entire operation;
9. the RETIRED epoch shell, immutable recovery checkpoint and completed cleanup
   audit remain available for traceability.

The database immutability trigger continues rejecting journal, snapshot and D4
failure deletion during normal operation. It admits DELETE only for the exact
RUNNING cleanup UUID, exact RETIRED epoch, verified checkpoint and elapsed
rollback gate.

## 6. Removed and retained material

Eligible cleanup removes only heavy, epoch-scoped Portal projection rows:

- analytics facts/snapshots;
- D4 failure/checkpoint rows;
- expired shared-consumer lease rows;
- series points, snapshots and event journal;
- visible entities, ingestion keys and stream checkpoints;
- gaps and dead letters.

It retains:

- epoch identity, scope, lifecycle and state digests;
- immutable lifecycle policies;
- immutable archive/encryption/restore checkpoint;
- cleanup plan/result and deterministic result digest;
- global retention/freshness policy evidence and replay audit rows.

## 7. Failure semantics

| Condition | Result |
|---|---|
| ACTIVE or BUILDING epoch | not recoverable/retireable; no cleanup |
| RETAINED overlap still active | `EpochNotRetireable` |
| no replacement ACTIVE epoch | `EpochNotRetireable` |
| partial journal/sequence/state coverage | `RecoveryCheckpointCoverageMismatch` |
| invalid encryption/archive/restore proof | `InvalidRecoveryCheckpoint` |
| missing policy/checkpoint | `CleanupEvidenceMissing` |
| rollback deadline not reached | `CleanupNotReady` |
| live consumer lease | `CleanupLeaseStillActive` |
| direct immutable-row mutation | PostgreSQL rejects it |
| replayed cleanup UUID | `CleanupNotReady`; no second deletion |
| transaction/database failure | full rollback; no partial cleanup |

## 8. Test evidence

Reproducible gate:

```bash
cd /home/bobby/portal-backend-plan
./scripts/execution-edge-test.sh
```

N05 coverage includes:

- policy/digest validation and version collision behavior;
- integer storage budget at healthy/soft/hard and journal-row limits;
- cursor-expiry and sequence-gap new-BUILDING directives;
- all five typed retention availability fixtures;
- fresh PostgreSQL migration 0009;
- active/retained cleanup refusal and overlap boundary;
- immutable journal and recovery evidence;
- exact archive coverage and deterministic replay digest;
- rollback deadline and idempotent cleanup refusal;
- atomic cleanup while preserving ACTIVE truth and audit shells;
- PostgreSQL dump/restore signature including policy, recovery and cleanup tables;
- workspace rustfmt, all Rust targets and strict Clippy.

No fixture contains a source credential, opaque cursor/token, DSN, account,
strategy, order, fill, position or production business value.

## 9. Production activation boundary

N05 supplies mechanisms and offline evidence, not live policy values. Before N06,
the owner must separately approve:

1. production hot/rollback windows, byte budget and pressure thresholds;
2. encrypted archive destination and restore operator/runbook;
3. backup/restore scheduling and monitoring;
4. N02/N03 accepted owner artifacts and N04 thin wire adapter;
5. a bounded N06 owner window.

Until then, source, live cleanup scheduler and all registry profile changes stay
off.

## 10. Claude parallel lane

Claude should consume the canonical five-state fixture and render:

- `PARTIAL_HOT` as clipped coverage, not a complete chart;
- `COLD_REQUESTABLE` as an explicit access workflow;
- `PURGED` as unavailable by policy, not “0 rows”;
- `UNKNOWN` as missing/unverified policy;
- rebuilding/gap recovery as a distinct non-authoritative state.

Frontend must not infer retention from an empty points array, invent a policy,
start source polling, or change registry delivery profiles.

## 11. Next backend work

N06 real-source qualification remains gated by N02/N03 owner publication, the
N04 wire adapter, owner-approved live retention values and an explicit change
window. While that gate remains closed, source-independent N09/N10 work may
continue after intake triage without weakening N05.
