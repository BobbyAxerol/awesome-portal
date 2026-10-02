# W2A — New Run (base b3394702, not committed)

Plan §3 items 1–7 done in `NewRun.tsx`, `NewRunRoute.tsx`, `runDraft.ts`, `runDraftStore.ts`, `EstimateStatus.tsx`.

- Advanced walk-forward: First OOS, frequency, window mode, label/purge/embargo (when `limits.temporalGuardsRequired`, set by the route from the Atlas `temporal_guards` + a v2-admitting profile) and the mode/schedule are required; every message names its field.
- Symbols: `limits.listedSymbols` (whole list only) and `limits.unlistedSymbol` (server search miss on a partial list). Choosing a dataset (or the protocol) does not engage the step, so no empty-symbol flash.
- Draft: autosave on every edit, kept on leave; cleared on create or "Start over" (route rebuilt by key). One history entry per step (the screen writes only steps the reader moved to; Back/Forward follow the address). `?step=review` with an empty draft opens the first incomplete step (waits for `?from=/fork=/av=/mode=/route=` links).
- `readDraftSummary()` in `runDraftStore.ts` -> `{stepsDone, total: 7, step, stepNumber}` or null (pure sessionStorage read, never throws).
- Back/Next skip passive steps (bound Strategy; Optimization once the profile pins trials and seed). Pills stay, read "pinned". The protocol toggle moved from Strategy to the Walk-forward step.
- Review: every error in one list, each a link to its step. Rail shows only on Review (timeline only beside Data/Walk-forward). Review rows list only what is declared.
- 403: one `Read-only session.` (Review banner; estimate line), code/request id in the tooltip. Display layer only (the client copy tables are untouched).
- Words: V2 "preflight only" notes, regex helper, "not declared"/"no version chosen" chips, per-row `RELEASE_DEFAULT · LOCKED` (now one summary line + toggle), duplicate profile text on trials/seed hints removed. `s14-ui-receipt`/`s14-api-receipt` hidden from the alpha select and from the sole-ACTIVE preselect.

Tests: new `newRun.w2a.test.tsx` (26). 14 existing New Run test files updated for the intended change (sessionStorage cleared per test, rail only on Review, new messages).
Not run: Playwright/visual baselines (the Review rail and Strategy/Walk-forward layouts changed; baselines need a pinned-image run by Bobby).
