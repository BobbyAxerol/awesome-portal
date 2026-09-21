# P11 frontend composition — Screen 03 Run Progress

**Status:** `FE_RUN_PROGRESS_MOUNTED` · Claude · 2026-09-21
**Handoff consumed:** [Claude P11 handoff](./frontend-handoff-claude.md) ·
[P11 report](./phase-report.md)
**UX authority:** [spec 03](../../release-v1.1/docs/screens/03_run_progress.md) +
`QuantBT 03 Run Progress.dc.html`
**Contract:** `@portal/contracts-research-progress`
(`packages/contracts/generated/research-progress.d.ts`, 613 lines). Alias added
to the frontend `tsconfig.json`; no DTO is hand-written and no error string is
parsed.

Route: `/research/quantbt/runs/:runId/progress`, mounted as a **sibling** of the
legacy `runs/:runId/*` workspace. A P11 run id is not a legacy run, so routing
it through `RunWorkspace` would have fetched a run the legacy store never had
and rendered a mismatch before this screen drew.

## What was built

| File | Lines | Role |
|---|---|---|
| `src/research/RunProgress.tsx` | 768 | The seven-block HIFI composition |
| `src/research/runProgress.test.tsx` | 731 | `P11-T01…T10`, 46 tests |
| `src/research/useRunProgress.ts` | 382 | Snapshot, stream lifecycle, poll floor, console ring, cancel |
| `src/research/progressClient.ts` | 217 | Four typed operations, frame classification, refusals |
| `src/research/RunProgressRoute.tsx` | 35 | The product route |
| `e2e/_probe-research-product.spec.ts` | +145 | Six browser tests |
| `e2e/fixtures.ts` | +32 | Progress read, console page, cancel, and a real SSE stub |
| `src/research/researchBoundary.test.ts` | +24/−2 | Stream rule restated as a checked allowlist |
| `src/features/quantbt/QuantBTModule.tsx` | +10/−2 | Route mounted; the legacy passport fetch stopped |

## The rule the screen turns on

Spec 03 §1.1: **the stream is an accelerator and the 5-second poll is the
floor.** The screen has to be correct with no SSE at all, so every fact is
reconciled from a snapshot and the stream only arrives earlier.

A browser test proves it directly — `EventSource` is *deleted from the window*
before the route loads, and the screen still renders the stage rail, the
server's `tqdm_line`, the fold timeline and the artifacts, with the transport
reading `poll` and **no alert anywhere**. A dropped stream is a grey dot and a
changed label, never a banner (pitfall 5).

## EventSource lifecycle

Native `EventSource` reconnects forever. Against a `401` or a typed gap that is
a loop nobody notices until it is a bill, so every exit is explicit and tested:

| trigger | behaviour | test |
|---|---|---|
| snapshot is terminal | never opened at all | asserts zero instances |
| `run_completed` / `run_failed` | closed immediately, then one reconciling snapshot | asserts `closed === true` |
| `research.progress.gap` | closed, then state **replaced** from the snapshot route — a hole is not stitched | asserts a follow-up read |
| `auth.expired` | closed, and **not** re-opened | asserts the instance count does not grow |
| transport error | closed, handover to the poll floor — not a tight retry | asserts exactly one instance |
| unmount | closed | asserts `closed === true` |
| tab hidden | closed; a fresh snapshot on return | `visibilitychange` handler |

The resume cursor is the applied sequence, sent as `after_seq`, and an event at
or below it is dropped — a stale frame never moves state backwards (§T04).

## Nothing local creates a fact

- **`eta_s` is the server's.** A `null` ETA renders "not reported"; the page
  computes nothing (pitfall 1).
- **Completion is `readiness.mandatory === "SEALED"`** and nothing else. No
  timer, animation or console line produces a completion, an artifact, a claim,
  a counter or an ETA.
- **The claim is dashed until the source issues it.** `FORECAST` draws a dashed
  border, `ISSUED` a solid one, and the flip is a border-style change and a
  badge swap — nothing louder (§3.4).
- **Decimal strings are printed, never parsed.** `12.500/60.000 core-min`
  reaches the DOM as the server wrote it.
- **No local clock.** A test asserts `Date.now()` and `new Date()` appear
  nowhere on the surface; the fold timeline is bounded by the snapshot's own
  `updated_at_utc_ms`.

## A sealed artifact is readiness, not authorization

`reader_href` is `null` by contract in P11. The card stays rich — name, state,
size, digest — and stays **unlinked**, and the screen says why once, plainly,
so a missing link reads as a boundary rather than as a bug to report. A test
asserts zero anchors in the artifact strip in every state.

## Console

A ring buffer in a ref, flushed on a 100 ms batch, capped at 500 displayed
lines with `OLDER_DROPPED` shown when the window has overflowed. Putting a line
per trial through React state re-renders the whole screen (pitfall 3).

Backfill is one bounded page keyed on `after_seq` with the contract's `limit`,
never a full history — asserted in the browser by reading the outgoing URL. The
box is `role="log"` with `aria-live="polite"`, and auto-scroll sets `scrollTop`
directly; a test asserts `scrollIntoView` appears nowhere (pitfall 4).

## Cancel and retry

Cancel is offered only when `current.may_cancel` is true, behind one confirm
step. There is **no retry**: the contract pins `may_retry: false` with a reason,
and the screen prints `P12_OWNED_NO_P11_RETRY_ROUTE` rather than offering an
action the server does not have (pitfall 9).

When a cancellation CAS wins, `effective_status` becomes `CANCELLED` while
`progress.status` may still read `RUNNING`. Both are shown: the Portal terminal
truth in the pill, the source fact untouched beneath it, and a chip naming the
resolution.

## The stream rule became an allowlist

`researchBoundary.test.ts` banned `EventSource` outright — written when no
Research module had a stream. The prohibition was never "no stream", it is "no
direct dependency", so it is now an allowlist with positive checks: exactly one
module may open one, that module may not contain a URL literal or any scheme,
and the URL it opens is built by the client from the contract's own path. The
rule is stricter than the ban it replaced because it now checks *where* the
stream connects.

## Defects found by reading the screenshot

1. **A running fold was invisible.** Its band was bounded by the last completed
   fold's end — which, for the newest fold, *was* its own start, so the band
   collapsed to zero width and its state label collided with the track. The
   local clock was not an option (the page may not invent time), so the frame
   is bounded by the snapshot's `updated_at_utc_ms` instead. Three tests lock
   it, including one asserting no local clock is read anywhere.
2. **Two disabled controls had no reason** — the fold filter chip with no fold
   reported, and the confirm button while a cancellation is in flight. Caught
   by the repository's own §3.5 guard, not by me; both now state why.

## Test matrix

| ID | Requirement | Result |
|---|---|---|
| P11-T01 | every HIFI block from the snapshot; five stages in order; exact decimals; null ETA absent; failure verbatim | pass |
| P11-T01b | a running fold is visible; no local clock | pass |
| P11-T02 | a sealed artifact is rich and unlinked | pass |
| P11-T03 | forecast dashed, issued solid, completion only from the seal | pass |
| P11-T04 | a dropped stream is a dot, never a banner | pass |
| P11-T05 | the stream opens when it should and closes when it must (7 exits) | pass |
| P11-T06 | an out-of-order frame never moves state backwards | pass |
| P11-T07 | bounded console, typed observation, `role=log`, no `scrollIntoView` | pass |
| P11-T08 | cancel confirms once; no retry is offered; cancellation resolution shown | pass |
| P11-T09 | typed availability and `401/403/404/409/503` keep the composition | pass |
| P11-T10 | no private identity recreated; four published paths only | pass |

## Gates

| gate | command | result |
|---|---|---|
| typecheck | `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| research suite | `npx vitest run src/research` | **339 passed / 12 files** |
| full frontend suite | `npm test` | **163 files, 2748 passed, 1 skipped, 0 failed** |
| build | `npm run build` | **exit 0** |
| browser probe | `npx playwright test --config=playwright.research-probe.config.ts` | **29 passed**, 0 console errors or warnings |

Every exit code was read from the command itself, not from a pipeline tail.

## Browser receipt — the real product route

| check | result |
|---|---|
| renders at 1280 and 660 | pass |
| exactly one `.portal-shell` | pass |
| five stages, in order, `S3` `aria-disabled` | pass |
| server's `tqdm_line` and exact decimals | verbatim |
| fold timeline, three folds, running band visible | pass |
| artifacts unlinked, disclosure shown | 0 anchors |
| claim dashed while `readiness.mandatory` is `PENDING` | computed `border-style: dashed` |
| **correct with `EventSource` deleted from the window** | `poll`, 0 alerts |
| console `role=log` / `aria-live=polite`; backfill bounded | `after_seq` + `limit=500` |
| cancel confirms once; retry reason stated | pass |
| reduced motion | 0 elements animate above 1 ms |
| horizontal overflow | 0 px at both widths |
| console errors + warnings | **0** |

### Screenshot receipt — ephemeral, not archived

| file | dimensions | sha256 |
|---|---|---|
| `s03-progress-laptop.png` | 1280x1250 | `1c5b38f5537cab5606f95ae25f263dd321261df7f48937f2f43b288ca0dda23b` |
| `s03-progress-mobile.png` | 660x1416 | `91d2be6aed9e46c55d867d96b56790a7beee9e1108ce36965e27c3d62d1197e8` |
| `s03-console.png` | 1280x1250 | `823a2073bd652432958c59d5035a15bc5ef04632e0efd33248f92029a560b0ca` |

Location: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/research-shots-p11/`.

**These are fixture receipts.** The four operations are answered from fixtures
generated to the contract's shapes; no worker ran. They are not live worker
proof and are not claimed as such.

## Not claimed

`V11-P11-DR/BR/GX`, a running worker, a deployment and `PRODUCT_ACTIVE` are all
**not** claimed — the backend stays feature-dark and only an approved change
window running the P11 dark-runbook can settle them.

The hi-fi's per-fold search / OOS / freeze segments are **not** drawn: the
contract publishes one start and one end per fold, and subdividing them here
would draw a methodology the server never described. Recorded below rather than
invented.

## Backend requests

### `CG-P11-01` — fold segments

Spec 03 §2.4 draws each fold as search → OOS → freeze tick. `ProgressSnapshot.folds[]`
carries only `started_at_utc_ms` and `completed_at_utc_ms`, so one band is
drawn per fold. If the segment boundaries are meant to be visible, they need to
be published; the browser must not infer them.

### `CG-P11-02` — the claim's certificate grade

Spec 03 §2.7 shows a cert chip beside an issued claim. The contract's `claim`
carries `state`, `text` and `cursor` only. The chip is not rendered rather than
derived from the claim text.

Both are display-completeness gaps, not blockers: the screen is honest without
them.
