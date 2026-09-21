# P11 frontend handoff — Screen 03 Run Progress

The backend and generated P11 contract are ready. This handoff deliberately
does **not** ask for a global UI refactor or a deployment. Work only in the
Research Screen-03 composition/routes/tests you own; do not modify the worker,
Control API, P11 OpenAPI, migration, `apps/portal/backend` or deployment
overlays without routing a backend issue to Codex.

## Use this contract and no substitute

Generate/consume `packages/contracts/generated/research-progress.d.ts` from
`packages/contracts/openapi/research-progress.openapi.json`. There are exactly
four browser operations:

| Operation | Product use |
|---|---|
| `researchProgressGetV1` — `GET /api/v1/research/runs/{runId}/progress` | Initial/recovery snapshot and bounded polling fallback. |
| `researchProgressStreamV1` — `GET /api/v1/research/runs/{runId}/events` | Same-origin SSE only. |
| `researchProgressConsoleGetV1` — `GET /api/v1/research/runs/{runId}/console` | Explicit structured console observations, max 500 per page. |
| `researchProgressCancelV1` — `POST /api/v1/research/runs/{runId}/cancel` | Existing cancel affordance only; server decides `may_cancel` and rechecks ADMIN/CSRF/origin. |

Never use legacy `/api/v1/alphas*`, raw Portal API, private `/internal/*`,
worker source roots, direct database, NATS, broker, CLI, fixture timer or a
handwritten duplicate DTO/error vocabulary. Generated public types have no
`attempt_id`, `lease_epoch` or `worker_attempt_id`; do not recreate them in
React state, URL, storage or DOM.

`ProgressEvent` is a generated discriminated union keyed by `event_type`.
Narrow that union normally (for example `trial_completed` →
`ProgressTrialPayload`, `artifact_sealed` → `ProgressArtifactSealedPayload`);
do not cast or parse `payload` as an untyped source object. The separate
`ConsolePage` is the only console rendering input.

`artifact.reader_href` is deliberately `null` in P11: a sealed card means
readiness, not download authorization. Keep the HIFI card rich but non-linking
when the value is null; do not invent a route or expose a worker path. P12/P13
may later publish a separate named artifact-reader contract.

## P11 display-fact amendment — consume, never infer

`CG-P11-01` and `CG-P11-02` now have generated contract fields. Read the
precise semantics in
[the P11 display-fact amendment](./contract-amendment-display-facts.md).

- `fold.fold_timeline` is source-owned. Render a complete Search → OOS →
  freeze Gantt only when `state === "COMPLETE"`; render any `PARTIAL` source
  segments literally and name the partial condition, never fill gaps. For
  `NOT_PUBLISHED`, preserve the present single whole-fold band. A missing
  field is possible only on a pre-amendment persisted snapshot and has the
  same `NOT_PUBLISHED` meaning.
- `claim.methodology_certificate` is separate from `claim.text` and the
  engine Atlas. Render an A–D chip only when
  `state === "ISSUED"` and `grade !== null`. For `NOT_PUBLISHED`,
  `NOT_ISSUED`, or a pre-amendment missing field, omit the chip and do not
  parse/cast any string to recover one.

The current P04 source deliberately publishes `NOT_PUBLISHED` for both. This
is not a UI defect and does not need a new client state, placeholder grade,
timer, or manual DTO. Regenerate the contract before touching this composition
and retain the existing HIFI layout in every typed state.

## Required state handling

1. Keep the full HIFI Screen-03 layout in every state. Change panels inside
   the composition; do not replace the route with a generic unavailable page.
2. Render `PENDING_SOURCE_CALLBACK`, source `partial`, `NOT_ISSUED`,
   `SEALED`, `FAILED`, typed `400/401/403/404/409/503`, and cancellation
   resolution literally from the contract. `current.effective_status` is the
   Portal terminal truth; `progress.status` can retain the source fact when a
   cancellation CAS wins.
3. Completion badge/action must require source `readiness.mandatory ===
   "SEALED"`; no local timer, animation or received console line may create
   completion, an artifact, a claim, a counter or an ETA.
4. Keep console ring at 500 displayed lines. It is an explicit structured
   observation lane, never a source of authoritative lifecycle/accounting.
   Use `after_seq` for a bounded page; do not issue a full-history read.
5. Preserve UTC milliseconds and exact decimal strings. Do not turn `null`,
   missing, `0` or a `NOT_ISSUED` claim into a success/default.

## EventSource lifecycle — mandatory

- Open only while the route is visible and the snapshot has a live,
  non-terminal status. Send `after_seq` or use the opaque numeric
  `Last-Event-ID`; deduplicate monotonic sequence numbers in the reducer.
- On `run_completed`, `run_failed`, `research.progress.gap`, `auth.expired`,
  `409`, `401`, `403` or unmount: call `EventSource.close()` immediately.
  Do **not** let native EventSource reconnect forever.
- A transient transport error uses the approved 5-second snapshot poll while
  visible. Stop polling on terminal/auth/refusal/unmount; restart an SSE only
  after a fresh eligible snapshot and a bounded UI decision, never a tight
  retry loop.
- Do not infer event replay/global ordering/correction beyond one run's
  numeric P11 sequence and stated retention floor. If the cursor is expired or
  a typed gap arrives, replace local state from `researchProgressGetV1`.

## Screen-03 HIFI/browser evidence

Implement and evidence the S03 spec/HTML, including stage rail/Gantt,
artifact drawer, 500-line console, terminal/revoked-session cleanup,
cancel-race display, visibility/unmount cleanup, reduced motion/a11y and
660px layout. Compare the product composition against the HIFI HTML in a
browser before calling it accepted; fixture receipts must be labelled as
fixtures and never as live worker proof.

The backend stays feature-dark. Do not claim `V11-P11-DR/BR/GX`, a running
worker, a real deployment or `PRODUCT_ACTIVE` until a later approved change
window runs the P11 dark-runbook.

## Backend questions that should return to Codex

Open a focused request rather than inventing frontend values if Screen 03
needs any of: artifact download/read authorisation, retry/requeue, full log
history, accuracy of ETA, a future selection/evaluation denominator, or a
source declaration absent from this contract. P12/P13/P15 own most of those
future capabilities.
