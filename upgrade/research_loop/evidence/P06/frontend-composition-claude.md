# P06 frontend composition — queue, attempt and recovery panels

**Status:** `FE_QUEUE_PANEL_COMPLETE` · Claude · 2026-09-20

`apps/portal/frontend/src/research/QueuePanel.tsx`.

- All eight states render with their own chip: `QUEUED`, `CLAIMED`, `RUNNING`,
  `RETRY_WAIT`, `CANCEL_REQUESTED`, `SUCCEEDED`, `FAILED`, `CANCELLED`.
- **Attempts nest under one logical run.** Three attempts show as
  `3 attempts` inside one `run_id`, in a drawer, never as three runs. Listing
  attempts as runs would inflate the research record with work nobody requested.
- **An optional diagnostic failure is not a primary failure.** A `SUCCEEDED`
  run with a failed `OPTIONAL` check states
  "The run result itself is unaffected" and does not turn terminal.
- **No percent, no ETA, no timer.** Progress prints `3 of 10` only when the
  server published counts; otherwise the panel says *progress not reported*
  rather than drawing an empty bar.
- No cancel, retry or submit control exists. P10/P11 own those operations, and a
  control that looks live before the operation exists is worse than none.

## Finding FE-P06-01 — four facts read as one sentence

The status line rendered `QUEUED in flight progress not reported 2 attempts`
with only whitespace between four independent facts, which reads as a single
run-on phrase. Found in the browser capture, not in the unit tests. Separators
added.

**Data lane:** typed inactive. No queue BFF exists; the panel takes a
`LogicalRun` as props.
