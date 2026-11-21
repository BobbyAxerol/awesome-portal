# P06 phase report — durable scheduler, isolated workers and retry

Status: `TECHNICALLY_COMPLETE / BACKEND_COMPLETE_FE_HANDOFF_READY` —
2026-09-19.

## Delivered authority

P06 extends the additive Research schema with an explicit logical work key and
required SHA-256 canonical work digest, mandatory/optional readiness class,
bounded retry limit, worker lease/fence fields, requester-fairness cursor,
immutable job-event ledger and a transactional ID-only outbox. PostgreSQL
remains the sole authority for admission, state transitions, retry,
cancellation and terminal commit.

A command retry must keep its exact logical work key and canonical work digest.
A second authorised workspace user may use a different command ID for the same
deterministic work and receives the existing job; that replay is audited. A
changed digest/key, resource declaration, job kind, readiness class or queue
cannot silently merge. Pre-P06 compatibility rows are retained but excluded
from P06 claiming because their canonical work identity was never published;
P10 must normalize its named producer rather than guess one. This closes the
cross-user diagnostic/retry ambiguity found during P06 review.

The narrow `ResearchSchedulerOutboxService` claims records and calls a
publish-before-ack transport port. It publishes only IDs, work key, queue
class and digest-bound event metadata; it has no NATS socket, credential or
runtime loop. A failed publish leaves the short outbox lease recoverable.

## Real worker proof

The P06 child is an allowlisted P04 Delta-RSI qualification operation, not a
generic plugin runner. The supervisor creates PID, user, mount and network
namespaces; mounts an exact per-receipt tmpfs scratch directory with a 64 MiB
aggregate cap; passes a bounded receipt through it; clears credential-bearing
environment prefixes; enforces address-space, CPU, file, FD, wall-clock and
in-namespace process caps; and kills the exact child process group on timeout.

`V11-P06-DR` exercises the actual chain: a PostgreSQL job is enqueued and
claimed, marked running, executed by the namespace-isolated QuantBT 1.1.1
child over the pinned 500-bar Golden P04 Parquet tape, then committed once by
the same worker-attempt/lease epoch. The child returns a tiny scalar receipt;
P05 remains the only durable artifact writer/sealer. This keeps the child
below the database and artifact-authority boundary.

## Recovery and intentional boundaries

- Claim/recovery handles an expired worker lease as a retry of the same
  logical job with a new worker attempt/lease epoch. A late worker is fenced.
- Cancellation beats a late success deterministically. A queue cancellation
  is terminal immediately; an active child receives a cancellation state
  before finalisation.
- One `HEAVY` job per workspace is admitted at a time. Queue ordering is
  requester-fair and no claim reads a dataset or creates a P08 binding.
- `MANDATORY` and `OPTIONAL` are explicit durable facts. P06 proves optional
  diagnostic failure cannot overwrite a primary job; P11 later owns the
  aggregate publication/readiness decision.

P06 does **not** add a browser route, a direct run-submit producer, a generic
strategy importer, a runtime NATS consumer, a Compose service, or a deployment
change. P10 owns the existing direct-path cutover and NATS deployment binding;
P07 owns imported strategy admission; P09/P11 own consumer/readiness UI.
These are phase-owner boundaries rather than P06 debt.
