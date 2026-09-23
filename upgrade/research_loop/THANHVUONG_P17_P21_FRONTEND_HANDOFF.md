# Thanhvuong frontend handoff — Research P17–P21

## Assignment frozen by Bobby

This is one isolated frontend campaign. It starts from the published
`docs/research-loop-plan` baseline, not from `dev`, and it never modifies or
deploys the running Portal.

| Item | Required value |
|---|---|
| Contributor branch | `feat/thanhvuong/research-p17-p21` |
| Upstream remote | `primus-origin` only |
| Exact base | the `docs/research-loop-plan` commit recorded in `.portal-contributor-workspace` when Bobby provisions the workspace |
| Return path | one PR from the assigned feature branch to `docs/research-loop-plan` |
| Explicitly excluded | direct `docs/research-loop-plan`/`dev`/`main` writes, P22, backend contract changes, migrations, deployment, runtime flags, Execution Loop |

The contributor must not create a replacement branch, rebase this branch, or
change the PR base. If the baseline moves while the campaign is in review,
report both SHAs to Bobby; Bobby decides the integration path.

## Owned presentation scope

| Phase | Product screen | Mandatory handoff |
|---|---|---|
| P17 | S08 — Route-aware replay and state-at-cursor | [P17 handoff](./evidence/P17/frontend-handoff-claude.md) |
| P18 | S09 — Report, print and reproducible export | [P18 handoff](./evidence/P18/frontend-handoff-claude.md) |
| P19 | S10 — Attempt lineage, semantic diffs and exposure | [P19 handoff](./evidence/P19/frontend-handoff-claude.md) |
| P20 | S13 — Compare modes and derived correlation | [P20 handoff](./evidence/P20/frontend-handoff-claude.md) |
| P21 | S11 — Release Candidate composer and immutable evidence pack | [P21 handoff](./evidence/P21/frontend-handoff-claude.md) |

P16 has already been delivered by Claude. Treat its components, contracts,
routes and visual decisions as read-only integration context; do not redesign
or regress them while implementing P17–P21.

## Required method

1. Read `CLAUDE-FOR-thanhvuong.md`, Unified Plan P17–P21, each linked phase
   guide/spec/HiFi HTML, all listed frontend handoffs, and addenda before
   editing the owning screen.
2. Verify the provisioned user/workspace/remote/branch and prove the assigned
   branch descends from `primus-origin/docs/research-loop-plan`.
3. Consume generated typed same-origin clients only. Preserve typed
   loading/empty/partial/stale/denied/unavailable states and exact decimal/UTC
   values. Do not invent engine, execution, approval or source facts.
4. Keep HiFi-rich composition on product routes; do not replace a whole screen
   with an envelope because one panel is unavailable. Missing facts remain in
   the owning panel with the published typed state/reason.
5. Before each phase handoff, inspect the actual product route at desktop and
   compact viewports, compare it with its HiFi HTML, run the prescribed
   type/unit/browser checks, and distinguish real from fixture evidence.
6. Commit coherent phase-scoped changes. At P21, run the campaign acceptance
   set and provide one complete PR packet: branch/base/head SHAs, files,
   tests, browser receipts, HiFi comparison, source blockers, and no known
   in-scope workaround/debt.

## Boundary for Codex/Bobby

Any missing named DTO, state discriminator, server refusal, BFF operation,
generated client, source fact, or backend defect is a `CG-Pxx-*` request with
locator, actual/expected behavior, smallest safe proposal, and test needed.
Do not modify backend contracts or runtime to make a screen green. Bobby/Codex
will return an explicit contract amendment or mark the fact truthfully absent.

## Addendum — RF-01 shared-module changes (Claude, 2026-09-23)

Bobby's Q7 approval (2026-09-23) allowed RF-01 to change shared Research
modules on the condition that every change is **additive** and the old API
keeps working. This is the promised note. Nothing below requires a change in
the P17–P21 branch; it tells you what you may now use, and what to expect when
Bobby/Codex integrate the moved baseline. Packet: [RF-01](./evidence/RF-01/README.md).

| Module | What changed | Old API | What to use in S08–S11/S13 |
|---|---|---|---|
| `ResearchPanel.tsx` | New optional `recovery` prop, shown only in `unavailable` / `failed-retryable` / `stale`. New export `RefusalNote`. The state notice renders `state.detail` inside a closed `details` disclosure. | unchanged (`actions` keeps the FE-P03-01 rule) | Put "read again" in `recovery`, never in `actions`. Render a slot-level refusal with `<RefusalNote refusal={…} />`. |
| `state.ts` | `ResearchState.detail?: string \| null` (optional). `RESEARCH_WORKSPACE_FORBIDDEN` copy is now neutral: "You don't have access to this in your current workspace, or it doesn't exist." | unchanged | Do not write a denial sentence that names a workspace, an owner or confirms existence. |
| `researchRefusal.ts` (new) | `toResearchRefusal(error)` → `{ message (fixed copy), detail (server text), code, status, requestId, state, mayRetry, terminal, stopsPolling, sessionExpired }`; `refusalState(refusal, retainsContent)`; `REFUSAL_COPY`. Order: P03 codes → published `RESEARCH_<SURFACE>_<KIND>` codes → status. | `toEvidenceRefusal`, `toSplitRefusal`, `toSearchRefusal`, `toFreezeRefusal`, `toLibraryRefusal` remain as re-exports of it. **One behaviour change:** `.message` is now the fixed screen sentence; the server's text moved to `.detail`. A test that asserted `.message === <server text>` must assert `.detail` instead. | For a status-only read, use `toResearchRefusal` + `refusalState`; add your surface's published codes to `SURFACE_CODES` rather than a new copy. Never put the server's sentence in `reason`. |
| `auth/sessionExpiry.ts` (new) | `reportSessionExpired()`; `AuthGate` answers with Frame 01D `SESSION_EXPIRED` and returns to the same URL after sign-in. `toResearchRefusal` calls it on `401`. | — | Nothing to do if you use `toResearchRefusal`. A typed-code mapper of your own must call `reportSessionExpired()` on `401`. |
| `inspectionCursor.ts` (new) | `p02-cursor.v2` codec: `decodeInspectionCursor`, `encodeInspectionCursor`, `CURSOR_STAGES`, `INSPECTION_CURSOR_KEYS`, `cursorProblemText`. `stage` is the only closed key; every value is opaque. | — | Do not hand-parse a hash. Interpret `fold`/`trial`/`seq` as numbers only against a set your own contract publishes. |
| `evidenceCursor.ts` | Now an adapter over the codec. `EvidenceCursor.carried?` holds keys S04–S07 do not read (`study`, `pick`, `trade`, `mode`, `playback_ordinal`, non-numeric `trial`/`seq`) so they survive a round trip. `useEvidenceCursor()` also returns `problems`. `EVIDENCE_STAGES` is `CURSOR_STAGES`. | `parseCursor`, `serializeCursor`, `deepDiveHref`, `DEFAULT_CURSOR`, `useEvidenceCursor` unchanged in signature | S08 (replay) reads `playback_ordinal` from `cursor.carried` or, better, from `decodeInspectionCursor` directly. Render `problems` with `RouteCursorNotice` (`CursorNotice.tsx`). |
| `artifacts.ts` / `ArtifactPanel.tsx` | Six authority states: `PENDING` added. CORRUPT/MISSING have their own withheld-export sentences. | unchanged | S09 export and S11 evidence pack: an artifact's export still needs sealed + registered + a server-published action. |
| `progressClient.ts` | `ProgressRead.retained_artifacts?` (generated), `RetainedArtifact` type; `ProgressRefusal` is now `ResearchRefusal & { closesStream }`. | `toProgressRefusal` unchanged in name | — |

Contract side (generated, additive): `research-progress` gains
`ProgressRetainedArtifact` + optional `retained_artifacts`;
`research-foundation` gains `CursorStage`, the `stage` query parameter and
optional `InspectionCursor.codec`.

## Addendum — RF-02 shared-module changes (Claude, 2026-09-23)

Additive again; old names and APIs kept. Packet: [RF-02](./evidence/RF-02/README.md).

| Module | Change | For S08–S11/S13 |
|---|---|---|
| `researchRefusal.ts` | 34 surface codes now, including the six `RESEARCH_CURRENT_SOURCE_*`. On current-source reads `CONFLICT` means **pending retention** (state `unavailable`, its own sentence), not "changed since read" | S08 replay and S11 evidence pack read retained source: use `toResearchRefusal`, never write your own sentence for that 409 |
| `Formula.tsx` (new) | KaTeX 0.16.47 as a lazy chunk with a mono fallback; `formulaToTex` maps only identifiers, `*`, `max` and operators | Use it for any engine formula; never hand-write LaTeX for an engine fact |
| `EngineAtlas.tsx` | Hash is `#tab=&mode=&schedule=&route=&run=`; `atlasHash` / `atlasLocationFromHash` exported | Link to the Atlas with `run=` so its breadcrumb and deep links return to your run |
| `EvidenceFlow.tsx` | Chart companion tables are wrapped in `div.sr-only` (a `<table>` does not clip); metric values wrap instead of overflowing | Do the same for any exact-value table or tile: real runs carry 40+ digit decimals |
| Atlas contract | `current_release.walk_forward_options`, `current_release.config_digest`, `modes[].facts` (optional, additive) | S13 compare can name a run's mode × schedule claim from `facts` instead of composing one |
| Real-API lane | `playwright.research-preview.config.ts` + `e2e/_preview-research-real-api.spec.ts` against the preview stack | Add S08–S11/S13 to `SCREENS` when their flags are on in a preview; list any expected typed refusal in `EXPECTED_REFUSALS` with the sentence the screen must show |
