# P06 frontend handoff for Claude — no UI mutation in this phase

P06 intentionally changed no React route, shell, design token, HIFI layout or
browser API. Do not replace any approved UI with a scheduler placeholder.

When the owning P09/P10/P11 phase introduces the consumer, it must use these
facts exactly:

- A logical work item is not a worker attempt. Retries keep the same logical
  job/run and receive a new attempt ordinal/lease epoch.
- The future P10 producer, not the browser, forms the canonical SHA-256 work
  digest from target/effective configuration/objective/data role/seed/runtime.
  A P03 compatibility row with no digest is not P06-claimable and must not be
  surfaced as a fake queued P06 job.
- Render state from server facts only: `QUEUED`, `CLAIMED`, `RUNNING`,
  `RETRY_WAIT`, `CANCEL_REQUESTED`, `SUCCEEDED`, `FAILED`, `CANCELLED`.
  Do not manufacture percent complete or an ETA.
- `MANDATORY` and `OPTIONAL` are explicit. An optional diagnostic failure is
  not a primary failure; later readiness aggregation remains server-owned.
- A successful outbox event means a publisher transport action, not completed
  compute. A stale/late worker result must render according to the authoritative
  terminal state, never its local message.
- Queue/attempt data must be workspace-scoped and use the eventual named P10
  BFF. Do not call PostgreSQL, Python, NATS, Execution or a new client-side
  scheduler directly.

P06 requires no Claude action now. This is a forward contract handoff, not an
invitation to alter the existing P01–P06 UI review work.
