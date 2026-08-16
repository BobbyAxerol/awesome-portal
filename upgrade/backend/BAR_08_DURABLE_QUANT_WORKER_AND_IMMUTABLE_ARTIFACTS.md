# BAR-08 — Durable Quant Worker & Immutable Artifacts

> **Version:** 0.1<br>
> **Status:** BAR-08-BE1/BE2/BE3 complete (ADR-004/006 proposed)<br>
> **Updated:** 2026-08-16<br>
> **Unified phase:** U11 Durable Quant Worker & Immutable Artifacts<br>
> **Guide authority:** v0.4 §6.4 worker lifecycle, §6.7 NATS, §8.1–8.6 artifacts

## 1. Goal and scope

BAR-08 introduces the durable worker and immutable artifact authorities:

- Separate immutable `run` intent from `run_attempt` executions (history is
  never overwritten; retry creates a new attempt).
- Claim-lease/heartbeat lifecycle with standardized failure codes and
  cooperative cancel + hard-kill grace.
- Content-addressed artifact commit (temp → checksums → manifest →
  content-addressed bundle), reopen-by-digest with tamper detection,
  reconcile and explicit legacy import.
- Job broker port with in-memory (tests) and NATS JetStream adapters; the
  durable worker executes the existing engine, finalizes bundles and
  publishes terminal events, acking only after persistence.
- Compose wiring: private `portal-nats` (JetStream), `portal-minio`
  (S3-compatible local/CI) and `quant-worker-py` (portal-api image, non-root).

Non-goals: object-store adapter wiring for bundles (local layout is
S3-path-compatible; adapter swap is the next slice), Rust query paths,
dataset snapshots.

## 2. Locked decisions

1. **The registry decides idempotency, not the broker.** Redelivery of a
   completed attempt is a no-op; the worker acks only after the terminal
   state is persisted.
2. **Standardized failure codes** (`ENGINE_IMPORT_FAILED`, `CAPABILITY_MISMATCH`,
   `DATASET_NOT_FOUND`, `SCHEMA_INVALID`, `ALPHA_IMPORT_FAILED`,
   `RESOURCE_EXCEEDED`, `CANCELLED`, `ENGINE_ERROR`,
   `ARTIFACT_COMMIT_FAILED`, `LEASE_LOST`) are the only terminal failure
   codes; unknown codes are rejected.
3. **Bundles are content-addressed** (`blobs/<sha256>` + manifest v2.0.0 +
   `checksums.sha256`); a staged engine `manifest.json` is preserved as
   `legacy/manifest.json` so the v2 manifest stays the single authority.
4. **ADR-004/ADR-006** document the MinIO provider choice and single-host
   supervision, both proposed for owner confirmation.

## 3. Implementation evidence

- [x] `services/durable_runs.py`: RunIntent/RunAttempt registry, append-only
  history, claim/heartbeat/lease-verify/reclaim, terminal transitions with
  standardized codes.
- [x] `services/artifact_store.py`: content-addressed blobs, staged bundle
  commit (required-file check, digest-verified blobs), reopen with tamper
  detection, orphan/corrupt reconcile, explicit legacy import.
- [x] `services/job_broker.py`: JobBroker port with InMemoryJobBroker and
  NatsJetStreamBroker (stream/consumer auto-provisioning, workqueue
  retention, pull consumer, ack-after-persist).
- [x] `workers/durable_worker.py` + `durable_worker_main.py`: subscribe →
  intent auto-registration → claim → heartbeat loop → execute engine →
  stage → commit bundle → succeeded/failed events; redelivery no-op;
  failure classification; cooperative cancel.
- [x] BE suite: `9` tests (claim/heartbeat/terminal transitions, append-only
  history + retry-new-attempt, lease expiry/reclaim + non-standard code
  rejection, bundle commit/reopen/tamper, required-files + reconcile,
  legacy import, worker redelivery-no-op with exactly one succeeded event,
  failure-code mapping + failed event, cooperative cancel).
- [x] Docker smoke: NATS + worker over the golden market; published job →
  real three-window execution → content-addressed bundle (v2.0.0, 17 files)
  → `quant.run.succeeded` event; redelivery created a separate attempt
  (retry semantics) without duplicating the succeeded attempt.
- [x] Full Portal backend regression `317 passed, 1 skipped`; full Planning
  backend `18 passed`; workspace verification passes including the protected
  strategy hash. No change was pushed or deployed.

Technical debt and rollback:

- The MinIO adapter swap for bundle storage and the Control-API outbox→NATS
  relay are the next U11 slices; the legacy inline FastAPI worker remains
  the compatibility path.
- Rollback: stop `quant-worker-py`; legacy artifact readers are untouched.

## 4. Next slice after BAR-08

BAR-09 (U12 engine capability authority): inspector from the public QuantBT
API and the exact installed wheel; signed/hashed capability manifests;
actor/quota/alpha/data/methodology/backend/resource preflight; reject
unadvertised or uncertified capabilities even when syntactically valid.
