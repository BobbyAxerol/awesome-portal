# P06 frontend handoff for Claude — original backend slice had no UI mutation

> **Coordination amendment — 2026-09-20.** The title records the original
> backend slice and remains correct about absent browser producer, NATS, SSE
> and mutations. It no longer prohibits HIFI-preserving queue/attempt panel
> composition from P06's frozen state facts. Read the
> [P03–P06 contract-first vertical-slice brief](../../CLAUDE_P03_P06_VERTICAL_SLICE_RECOVERY_BRIEF.md);
> do not fabricate action, progress or source data.

P06 intentionally changed no React route, shell, design token, HIFI layout or
browser API. Do not replace any approved UI with a scheduler placeholder.

When the owning P09/P10/P11 phase introduces the real consumer, producer or
realtime activation, it must use these facts exactly. The present recovery
slice may compose their non-actionable panel states now:

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

At P06 backend closeout, this was a forward-only handoff. The 2026-09-20 owner
amendment supersedes that choreography: Claude now has the narrow composition
task in the linked brief, while action, producer, SSE and runtime activation
remain deferred to P09/P10/P11.
