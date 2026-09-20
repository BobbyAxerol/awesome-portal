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

## R1 closeout — internal identifiers removed from the browser surface

Codex's review was right, and the defect was mine. P05's handoff states the
browser never receives lease epochs or worker identities. `scheduler.ts` typed
`leaseEpoch` as a first-class field and `QueuePanel` rendered it as
`lease e1`.

The deeper fault was the shape of my own guard: `artifacts.test.ts` asserted
`/hmac|lease_epoch|worker_id|relation_cursor/` against **one module**, and the
module beside it then broke the same rule. A guard scoped to a file is not a
boundary.

Removed:

- `WorkerAttempt.leaseEpoch` — the type now carries `ordinal`, `state` and a
  server-redacted `message`, asserted field-for-field.
- the `lease {…}` render in the attempt drawer.
- `isClaimableP06Job` **entirely**, not merely its digest field. Claimability is
  not a browser decision: the server's typed state already answers it, and a row
  the scheduler has not accepted must not reach the queue as an item. A test
  asserts the export no longer exists.
- the fixture message `"worker lost lease"`, which named the concept in copy
  even after the field was gone.

Added `researchBoundary.test.ts`: a sweep over **every** Research module for
lease epoch, worker identity, work digest, credential, storage locator, direct
source access and digest computation — plus a guard that the sweep itself has
not silently shrunk. The browser probe makes the same assertion against the
rendered text and markup, because a clean module can still put a server string
on screen.

**HiFi anatomy preserved.** The logical-run → attempt-ordinal structure is
unchanged and the drawer was not replaced by a placeholder. What the reader
loses is a fencing token they could not act on; what they keep is which attempt,
what state, and why.

### Contract gap CG-P06-01 — attempts need a time, not a lease

Removing the lease exposes a real gap rather than closing one. When two attempts
both read `FAILED`, the researcher's next question is *when*, and the ordinal
does not answer it. The lease epoch was accidentally serving as that
distinguisher.

- **Wanted:** `started_at` and `ended_at` on each attempt, UTC with
  milliseconds, nullable while running.
- **Why it is safe:** a timestamp is a server-published fact about the run, not
  an internal fencing token.
- **Affected panel:** the attempt drawer in `QueuePanel`.
- **Owner:** P10/P11, with the queue BFF.

Not invented here: adding the field to the frontend type without a server
contract would be authoring a contract, which is not this slice's to do.
