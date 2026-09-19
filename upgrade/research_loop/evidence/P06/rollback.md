# P06 rollback and recovery boundary

P06 has no running scheduler service or browser producer to stop. Its safe
rollback is operationally a **pause of future claims**, not deletion of
durable facts:

1. Do not route the legacy direct-submit path to `enqueueDurableJob` until P10
   owns that cutover.
2. If a future P10 worker is attached, stop only its named consumer from
   claiming new records. Do not delete `research.jobs`, `research.job_outbox`,
   `research.job_events`, worker attempts, P05 artifact evidence or a
   workspace.
3. Let unexpired leases end or request cancellation through the same CAS
   contract. Recover expired claims as the same logical work; a late child is
   lease-fenced and cannot publish success.
4. Resume from the durable outbox only after the named transport and worker
   identity have been requalified. The migration is intentionally additive and
   its down section is evidence-preserving no-op.

Test teardown removes only the exact tmpfs P06 PostgreSQL container and test
temporary paths. It never reaches a production container, volume, runner,
release, HMD source or Trading System process.
