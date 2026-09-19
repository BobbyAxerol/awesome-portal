# P06 evidence — durable scheduler, isolated workers and retry

Status: `TECHNICALLY_COMPLETE / BACKEND_COMPLETE_FE_HANDOFF_READY` on
2026-09-19.

P06 adds the Research-only durable scheduling foundation. PostgreSQL is the
only lifecycle authority; the Python process has no database, broker,
Execution, Trading System, browser or CLI credential. This packet is not a
runtime rollout, a NATS credential activation, a browser producer, or a
direct-submit cutover.

Read in order:

1. [phase-report.md](./phase-report.md) — exact authority and phase boundary.
2. [changes.json](./changes.json) and
   [contract-results.json](./contract-results.json) — source inventory and
   durable contract facts.
3. [scheduler-policy.md](./scheduler-policy.md) — admission, lease, retry and
   mandatory/optional semantics.
4. [delta-real-data.json](./delta-real-data.json) — real claimed-lease Delta
   receipt, distinct from a fixture claim.
5. [test-results.json](./test-results.json) — P06 test matrix and limits.
6. [frontend-handoff-claude.md](./frontend-handoff-claude.md) — no UI change,
   but precise future consumer rules.
7. [resource-cleanup.json](./resource-cleanup.json) and
   [rollback.md](./rollback.md) — C4 closeout and safe reversal.
8. [debt-register.json](./debt-register.json) — P06 has no open
   implementation debt; later phase ownership is explicitly distinguished.

`P10` alone may attach the existing named producer/direct-submit path and
deployment-bound NATS credentials. `P09/P11` own browser/readiness composition.
Those later owners must consume the P06 state machine; they must not recreate
another scheduler, progress timer, or job identity.
