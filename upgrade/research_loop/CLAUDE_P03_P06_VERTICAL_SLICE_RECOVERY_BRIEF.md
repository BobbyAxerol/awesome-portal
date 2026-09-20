# Claude directive — P03–P06 contract-first HiFi composition recovery

**Status:** `OWNER_DIRECTED / READY_FOR_CLAUDE`  
**Date:** 2026-09-20  
**Scope owner:** Bobby  
**Working principle:** stable contract first, then HiFi composition; never
fake activation to make a screen look complete.

## Copy/paste task directive

> Work on the current shared Research Loop branch only. First read
> `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` §13.1–§13.5, especially §13.2.1
> and the P03–P06 board rows; then read this brief and all four phase handoffs
> in `upgrade/research_loop/evidence/P03` through `P06`. Inspect the current
> committed frontend harnesses under `apps/portal/frontend/src/research/`.
> Do **not** redo or replace them. Implement the next contract-first HiFi
> composition layer for P03–P06, preserving all existing authority/state
> rules. Use the detailed HTML/spec files as UX authority. Do not modify
> Control API, Research schema, QuantBT adapter, Execution, runtime/deploy
> configuration, or backend semantics. Report exact files, tests, screens,
> state coverage, visual evidence and any true contract gap in the same phase
> evidence folders and Unified board row.

## Why this exists

P03–P06 backend foundations and their frontend state/data harnesses are already
complete. The former choreography deferred screen composition until P09–P11.
That would recreate the Execution failure where a rich approved HiFi surface
appeared only after backend work had accumulated, then degraded into sparse
envelopes. The owner amendment allows composition now while preserving later
ownership of shared routing, BFF producers and realtime activation.

This is an additive coordination correction. It does **not** reopen P03–P06
backend exit gates or claim P09/P10/P11 complete.

## Required reading order

1. `git status --short`, `git log -1 --oneline`, and the current diff. Preserve
   any work already present; do not reset, checkout over it, re-record visual
   baselines, or replace another agent's files.
2. [Unified Plan §13](../UNIFIED_IMPLEMENTATION_PLAN.md#research-loop-v11),
   especially §13.1–13.5 and §13.2.1.
3. This brief plus:
   - [P03 handoff](./evidence/P03/frontend-handoff-claude.md)
   - [P04 handoff](./evidence/P04/frontend-handoff-claude.md)
   - [P05 handoff](./evidence/P05/frontend-handoff-claude.md)
   - [P06 handoff](./evidence/P06/frontend-handoff-claude.md)
4. The frozen UX authority: [screen index](./release-v1.1/docs/SPEC_INDEX.md),
   [Screen 12](./release-v1.1/docs/screens/12_engine_atlas.md) and
   [its HiFi HTML](<./release-v1.1/QuantBT 12 Mode Atlas.dc.html>),
   [Screen 03](./release-v1.1/docs/screens/03_run_progress.md) and
   [its HiFi HTML](<./release-v1.1/QuantBT 03 Run Progress.dc.html>),
   [Screen 04](./release-v1.1/docs/screens/04_evidence_flow.md) and
   [its HiFi HTML](<./release-v1.1/QuantBT 04 Evidence Flow.dc.html>), the
   route matrix and state semantics.
5. Existing frontend foundations — reuse, do not duplicate:
   `state.ts`, `queryKeys.ts`, `fixtures.ts`, `atlas.ts`, `artifacts.ts`,
   `scheduler.ts` and their tests under `apps/portal/frontend/src/research/`.

## Stable facts and non-negotiable boundaries

| Phase | Stable input available now | May compose now | Still owned later / forbidden now |
|---|---|---|---|
| P03 | actor/workspace-scoped state vocabulary, query keys, refusal fixtures | Research scope/context and all seven state presentations | login/workspace authority, direct DB/API creation, generated producer |
| P04 | generated `ResearchEngineAtlasDocument`, same-origin Atlas read contract, 14 route descriptors | Screen 12 cards/tabs, current/history, four independent axes, disabled reasons | run submit, engine/data direct request, inferred approval |
| P05 | exact artifact states and metadata/export eligibility rules | reusable artifact/readiness panels in the HiFi composition | artifact browser DTO, filesystem path, raw cursor, download/mutation without server action |
| P06 | logical-job/attempt/optional-diagnostic/late-result semantics | queue/attempt/retry/finishing panels and drawer presentation | browser work-digest, direct scheduler/NATS/worker access, submit/cancel, fabricated ETA/percent/SSE |

The known frontend harness commit is `c9b68454`; verify current HEAD rather
than assuming it is unchanged. It supplies semantic/data helpers, **not** a
license to replace the approved composition with cards of diagnostic text.

## Deliverable scope

### 1. P03 — Research presentation foundation

- Reuse `researchState`, `ResearchPresentationMetaV1`, query keys and fixtures
  to make one reusable Research state boundary suitable for later screens.
- Render loading, empty, partial, stale, denied, unavailable and terminal with
  retained panel geometry and a non-leaking refusal reason.
- A denied object must reveal neither workspace/object identity nor a guessed
  zero value. Scope changes must not retain prior actor/workspace content.

### 2. P04 — Screen 12 Engine Atlas composition

- Implement the Screen 12 HiFi anatomy in the Research route boundary with the
  approved Research Light visual system; do not modify global Execution Carbon
  or shared shell without a separate owner decision.
- Consume the generated same-origin Atlas client when the real route is wired.
  The real-data lane must display current vs historical release truth, all 14
  routes, the four axes independently, never-claim text and exact refusal
  reason.
- A route may be engine-supported yet integration-blocked. It remains visibly
  described and disabled; it never gains a submit/run affordance.

### 3. P05 — Artifact/readiness panel composition

- Build reusable HiFi panels needed by Run Progress/Evidence Flow, preserving
  `WRITING`, `SEALED`, `CORRUPT`, `MISSING`, `ABORTED`, denied and unavailable.
- Keep the panel in place for every state. A sealed disk candidate is not
  downloadable unless the future server DTO says sealed, registered and action
  admitted.
- Preserve exact decimal strings, UTC milliseconds, null and opaque cursors;
  do not decode a cursor or preload an artifact.

### 4. P06 — Queue/attempt/recovery panel composition

- Build reusable queue/attempt cards or drawer panels for `QUEUED`, `CLAIMED`,
  `RUNNING`, `RETRY_WAIT`, `CANCEL_REQUESTED`, `SUCCEEDED`, `FAILED` and
  `CANCELLED`.
- Show logical run versus attempt ordinal correctly; optional diagnostic failure
  is distinct from primary failure; late worker messages cannot overwrite a
  terminal server state.
- Never generate ETA, percent, local work digest, timer-driven progress or
  actionable cancel/retry/submit controls before P10/P11 publish their exact
  server operations.

## Data lanes and action discipline

1. **Real lane:** only named same-origin BFF/generated-client data. Preserve
   server freshness, exact values, UTC and typed errors verbatim.
2. **Visual fixture lane:** allowed solely for component/browser visual tests or
   an explicitly labelled isolated preview. It must be impossible to mistake it
   for product data and it must not survive as a product-route fallback.
3. **Typed inactive lane:** where no named DTO exists, keep the full HiFi panel
   with its exact unavailable/pending/denied fact. Do not replace the route
   with a generic envelope, raw JSON or a blank page.
4. Browser never reaches PostgreSQL, filesystem/Parquet, Python, QuantBT,
   Rust reader, NATS, Trading System, Execution Edge or CLI. It never creates
   a job merely by mount, hover, tab switch, slider or reconnect.

## Test and evidence gates

- Start with targeted `vitest` tests for modified Research modules and `tsc`.
  Run the affected frontend build; do not run unrelated full compute/runtime
  suites for docs/TSX-only work unless a shared surface changed or the required
  commit hook invokes them.
- Add component tests for every named state and every P04 route-axis condition;
  add interaction tests proving no mutation/direct-source request is made.
- For each concrete route: test deep link/back-forward, hard refresh, keyboard
  navigation, screen-reader labels, 1280px and 660px layouts, and console
  warning/error zero. Retain screenshots/traces outside Git and reference them
  by authorized private location/digest.
- Keep a field → source → transform → DTO → component/panel → test matrix.
  A state or field omitted by the source is typed unavailable, not silently
  invented or zero-filled.
- Update the matching P03/P04/P05/P06 evidence packet and Unified board row;
  state exactly what is a real consumer, visual fixture, typed inactive panel,
  or later P09/P10/P11 activation. Do not create a parallel tracker.

## Completion criteria for this recovery slice

The recovery is complete only when the approved P03–P06 visual foundations are
implemented from the existing contracts, all states retain HiFi composition,
each real/inactive/fixture lane is labelled truthfully, targeted UI/build gates
pass, and no prohibited action/network path exists. It must not claim that P09
shared-route work, P10 named BFF/producer work or P11 realtime/readiness work
has been delivered.

## Coordination

- Codex owns backend/contract work and will not change approved UI composition.
- Claude owns the UI/UX recovery implementation. If a real field or named BFF
  is missing, report one precise contract gap with source location, desired
  DTO/state and affected panel; do not modify backend authority to unblock it.
- Work on the same owner-provided branch, use focused commits, and preserve all
  unrelated existing changes. Push/PR/merge/deploy only when Bobby directs.
