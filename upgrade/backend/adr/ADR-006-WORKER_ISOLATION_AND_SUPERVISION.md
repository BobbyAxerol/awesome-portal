# ADR-006 — Worker isolation and supervision on the current VPS

> **Status:** Proposed for owner confirmation (BAR-08 prerequisite)<br>
> **Date:** 2026-08-16<br>
> **Required by:** U11 durable worker

## Context

The durable Quant worker must survive redelivery, kill and restart without
duplicating successful runs. The VPS is a single host; no Kubernetes.

## Decision

- One `quant-worker-py` container per host (non-root, resource limits),
  reusing the portal-api image with the durable-worker entrypoint.
- Isolation: the existing ProcessPoolExecutor per run (forkserver) plus
  JetStream claim-lease/heartbeat for orchestration; a hard-kill grace timer
  in the supervisor bounds runaway attempts and yields `LEASE_LOST`.
- Redelivery idempotency lives in the append-only attempt registry; a
  completed attempt is a no-op on any broker redelivery.

## Rejected alternatives

- Systemd per-run processes: no durable queue semantics.
- K8s/containerd supervisor: out of scope on the current VPS.

## Security/operations impact

- Worker never sees live secrets; cancellation is desired-state with grace.

## Migration and rollback

- The legacy FastAPI inline worker remains the compatibility path until U11
  parity gates pass; rollback = stop the durable worker container.

## Acceptance evidence

- Kill/restart/redelivery smoke shows exactly one successful attempt; lease
  expiry marks `LEASE_LOST` and allows reclaim.
