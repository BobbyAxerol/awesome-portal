# SPEC_W1 — Wave W1: run-status honesty, exits, cursor and link fixes

Base: `9a2571db` (checked out; `FRONTEND_AUDIT_2026-10-02.md` present). All `file:line` are at this base, under `apps/portal/frontend/src/research/` unless stated (`R/`). Generated types are in `packages/contracts/generated/` (`G/`).
Sources read: FRONTEND_AUDIT §5 W1, FLOW_C, DOCS_B_S09_S10, DOCS_B_S11_S12, FLOW_B, DOCS_A, plus the code. Rubric added by Bobby: **fewer words** (one short sentence, tooltip carries the rest, no raw enums, one humaniser).
Spec only. Nothing under `apps/` or `packages/` was changed.

---------------------------------------------------------------------------
## 0. Findings that shape the design (read first)

1. **No screen reads a status the same way.** What each screen already gets from the server:

| Screen | Field that says what state the run is in | Where in `G/` |
|---|---|---|
| S03 Progress | `ProgressRead.current.effective_status` (`QUEUED|RUNNING|FINISHING|COMPLETED|FAILED|CANCELLED`), `availability` (`AVAILABLE|QUEUED_NO_SOURCE|CANCELLED_BEFORE_SOURCE|PENDING_SOURCE_CALLBACK`), `current.failed_at {stage, fold, basis}`, `current.new_run_from {state, reason_code}`, `current.terminal_materialization` | `research-progress.d.ts:706-760` |
| S04 hub | `EvidenceHub.lifecycle {durable_status, display_status, phase, terminal_outcome}` (optional), `core.run_identity.status`, `readiness`, `stages[] {key, state: PENDING|RUNNING|DONE}` — **no FAILED value, no failed_at** | `research-evidence.d.ts:1008-1059, 871-878` |
| S05–S08 | current-source 409 `details.lane_state` = `PENDING_SOURCE|PENDING_RETENTION|NOT_RETAINED_LEGACY|NOT_RETAINED_TERMINAL` (does not tell FAILED from CANCELLED) | `research-current-source.d.ts:1999-2012` |
| S09 report | 200 = sealed report (a FAILED run has a sealed "failed sheet", `coreFailed()`); 404 `RESEARCH_REPORT_NOT_FOUND` is identical for unknown / not-yours / not-sealed (audit F-04). **No status field.** | `R/ReportDetail.tsx:1657`, `R/reportClient.ts:371` |
| S10 lineage | `AttemptNode.state`, `AttemptNode.primary_run.state`, `.run_id`, `.display_label`, `presentation_kind` | `research-attempt-lineage.d.ts:210-250` |
| S11 RC | `ComposeResponse.local_seal.state` (`UNSEALED|SEALED_LOCAL`), `actions.may_seal / seal_blocked_reason / publish`, `run.attempt`. **No run status.** | `research-release-candidate.d.ts:146-300` |
| S13 compare | `run.run_state` per run | `research-compare.d.ts:636` |
| Library | `RunLibraryItem.status` (`COMPLETED|RUNNING|FAILED|QUEUED|DRAFT|CANCELLED|RECOVERY_REQUIRED`), `status_basis.kind`, `rc`, `attempt_id`, `source_kind` | `research-run-library.d.ts:752, 807-880` |

   **Consequence.** The one read that every screen can use for the cases where its own read has no status (S09 404, S11, S05–S08 409) is the Run Library poll-by-ids, which `useRunVisibility` already does for S09 (`R/useRunVisibility.ts:36`). W1 generalises it into `useRunStatus` (no new endpoint, no backend change). Optional backend asks are listed in §8; none block W1.

2. **Hub chip bug is a missing mapping, not a server lie.** `tabSub()` (`R/EvidenceFlow.tsx:1101-1125`, state read at **1112**: `const state = row ? row.state : "not published"`, execute branch **1114-1115** appends the route → `RUNNING · signal_notional`) prints the raw hub stage state. The hub stage row of a FAILED run keeps `RUNNING` for the stage that was running at the last persisted snapshot (that is exactly what Progress calls `failed_at.basis = SOURCE_RUNNING_STAGE`). Same raw read in `StageDot` (**1127-1140**, tone from `row.state` at **1131**) and in the stage row of `StagePreviewTab` (**3939-3947**, `data-stage-state={row.state}` and the text `{row.state}`). Fix = one mapping from (row.state, lifecycle) → word/tone, §3 B1.

3. **"local seal blocked" next to "SEALED LOCALLY"** is `compose.gate_verdict` printed unconditionally by `IdentityBlock` (`R/ReleaseCandidateDetail.tsx:983-989`, `data-verdict-title` / `data-verdict-body`). `gate_verdict` is composed at compose time and has no seal awareness (`G/research-release-candidate.d.ts:146-149, 279-282`). `IdentityBlock` already knows the seal (`compose.local_seal.state` at **975**) but does not use it for the verdict. Fix §3 B2.

4. **S10 "3 of 49"** is the server's `presentation_kind` classification (`PROBE`) hidden by default: `showProbes = !presentationKnown || (probesChoice ?? linkedProbe)` (`R/LineageDetail.tsx:2371`), `visible` filter **2373-2376**, `isHideableProbe` **183-185**. Every newest run (WFO-024..027, P04-021/022) is classed PROBE, and `defaultAttemptId` (**82-99**) only picks among non-probes, so the screen opens on a different run than the one the reader came from. Fix §3 B4.

5. **Trial number**: the progress read serves `selection.trial` (display ordinal, 351) and `selection.source_trial_id` (350, zero-based) in the same object (`R/RunProgress.tsx:985` already says "source trial id N (zero-based); trial M is the display ordinal" in a tooltip). Search/Split/Freeze serve only the source id. The hub cursor `trial=` in the hash is the ordinal. Nothing prints both together. Fix §3 B5 (and a backend ask so S05/S06 can print the ordinal without computing `+1`).

---------------------------------------------------------------------------
## 1. Shared design (build first — group G1)

### 1.1 `R/runTerminalState.ts` (new, pure, no React)

One mapping, one humaniser, used by every screen. Style: same as `RunLibrary.openTarget` (`R/RunLibrary.tsx:1729-1813`, which already maps status → one link) — pure function, `data-*` hooks, sentences with the long form in `title`.

```ts
/** Every status word any read can hand us, as sent. */
export type RunStatusWire =
  | "DRAFT" | "QUEUED" | "CLAIMED" | "RUNNING" | "SEALING" | "FINISHING" | "CANCEL_REQUESTED"
  | "READY" | "COMPLETED" | "FAILED" | "CANCELLED" | "RECOVERY_REQUIRED";

export type RunPhase =
  | "queued"        // QUEUED, DRAFT, CLAIMED
  | "running"       // RUNNING, SEALING, FINISHING, CANCEL_REQUESTED
  | "completed"     // READY, COMPLETED
  | "failed"        // FAILED
  | "cancelled"     // CANCELLED
  | "attention"     // RECOVERY_REQUIRED
  | "unavailable"   // 404/403 — one state, by design (F-04: server does not tell them apart)
  | "unread";       // the read failed or the status is unknown: nothing concluded

export type RunExitId = "progress" | "new-run" | "library" | "hub" | "report";

export interface RunTerminalState {
  phase: RunPhase;
  /** Humanised once. Never an enum token: "queued" "running" "completed" "failed" "cancelled" "needs recovery" "not available". */
  word: string;
  /** One line (<= 6 words), or null where the screen needs no banner (completed, running with data). Long sentence = `tip`. */
  banner: string | null;
  tip: string | null;
  tone: "good" | "accent" | "warn" | "bad" | "quiet";
  /** Ordered; first is the primary action. Empty for completed. */
  exits: readonly RunExitId[];
  /** What exists to open. The UI hides, never disables-with-prose. */
  has: { evidence: boolean; report: boolean; releaseCandidate: boolean };
}

export interface RunStateInput {
  /** From whichever read the screen already has; null = none. */
  status: RunStatusWire | string | null;
  /** The screen's read: ok / refused 404|403 / failed. */
  read: "ok" | "not-found" | "unread";
  /** For banner text only, from `progress.current.failed_at.stage` ("S4"). Never guessed. */
  failedStage?: string | null;
  /** A local RC seal exists (S11 compose.local_seal / Library item.rc.kind === "LOCAL_SEAL"); null = not known here. */
  sealed?: boolean | null;
}

export function runTerminalState(input: RunStateInput): RunTerminalState;
export function runStatusWord(status: string | null): string;   // the single humaniser; replaces ad-hoc `.replace(/_/g," ")`, EvidenceFlow.statusWord's vocabulary and RunLibrary STATUS_CHIPS words
export function isEndedWithoutEvidence(phase: RunPhase): boolean; // failed | cancelled | attention | unavailable
```

Banner / word table (the exact strings; "fewer words"):

| phase | word | banner | tip (tooltip, was the inline paragraph) | tone | exits |
|---|---|---|---|---|---|
| queued | queued | `Queued.` | "Waiting for a worker. This page updates when one claims it." | accent | progress, library |
| running | running | `Running.` | "Evidence seals when the run ends." | accent | progress, library |
| completed | completed | null | – | good | – |
| failed | failed | `Failed at S4.` if `failedStage`, else `Failed.` | "It ended before sealing evidence. Progress shows where." | bad | progress, new-run, library |
| cancelled | cancelled | `Cancelled.` | "It stopped before sealing evidence; nothing will arrive." | quiet | progress, new-run, library |
| attention | needs recovery | `Needs recovery.` | "Not sealed yet; its record is on Progress." | warn | progress, library |
| unavailable | not available | `Run not available.` | existing F-04 sentence `REFUSAL_COPY.denied` | quiet | library |
| unread | – | `Could not read this run.` + Retry button | the refusal code in the title only | warn | library |

`has`: completed → `{evidence:true, report: sealed-report-exists-per-screen, releaseCandidate:true}`; failed → `{evidence:false, report:true (failed sheet exists), releaseCandidate:false}` — report only offered by screens that actually got a 200; all others false. A screen passes what it knows; the function never claims a report exists.

### 1.2 `R/useRunStatus.ts` (new; generalises `useRunVisibility.ts`)

```ts
export type RunStatusRead =
  | { state: "idle" } | { state: "reading" }
  | { state: "listed"; status: RunStatusWire | null; sealed: boolean | null; label: string | null; attemptId: string | null; legacy: boolean }
  | { state: "not-listed" } | { state: "unread" };
export function useRunStatus(runId: string, enabled: boolean, workspaceId?: string): RunStatusRead;
```
Same single `runLibraryApi.list({ids:[runId]})` call as today (`R/useRunVisibility.ts:36-66`); adds `sealed = item.rc?.kind === "LOCAL_SEAL"`, `attemptId = item.attempt_id`. `useRunVisibility` stays as a thin re-export so S09 tests keep passing. A module-level per-run cache (like `observedByRun`, `R/evidenceCursor.ts:147`) so S09 → S11 → S10 do not re-ask within a session. Legacy rows (`source_kind = LEGACY_1_0_8_METADATA`) map to `phase:"unavailable"`-like `legacy:true` and keep `openTarget`'s existing refusal.

### 1.3 `R/RunExitBar.tsx` (new)

```tsx
export interface RunExitBarProps {
  runId: string;
  state: RunTerminalState;            // from runTerminalState
  cursor?: EvidenceCursor | null;     // carried into hub/report links only
  onRetry?: () => void;               // shown for phase "unread"
  hide?: readonly RunExitId[];        // a screen drops the exit that points at itself
  className?: string;
}
export function RunExitBar(p: RunExitBarProps): JSX.Element | null;
```
Renders one line: `<span data-run-phase={phase}>{banner}</span>` (title = tip) then the exits as plain links, primary first, 1–3 words each: **`Progress`**, **`New run`** (title: "same draft, fresh preflight" → `newRunFromHref`, `R/RunProgress.tsx:455`), **`Library`**, **`Hub`**, **`Report`**. Role `status` (not `alert`; `alert` only for `unread`). Hooks: `data-run-exit-bar`, links `data-exit="progress|new-run|library|hub|report"`. Touch height ≥ 24px (W3 will lift to 40). Returns `null` for `completed`/`running`-with-data so successful screens are untouched. `New run` is shown for failed/cancelled without a progress read: `NewRunRoute` already owns the typed refusal for `?from=` (`R/NewRun.tsx:3313`); on S03, where `new_run_from` is served, `RunExitBar` takes the existing `NewRunFrom` control instead (do not duplicate: S03 passes `hide={["new-run"]}`).

### 1.3a Skeleton rule (applies to every cell below)
When `isEndedWithoutEvidence(phase)` the screen renders: header (crumb + title) → `RunExitBar` → the sections the matrix keeps. **No ghost cards, no empty frames, no disabled controls with a reason in prose, no Print on a screen with nothing to print.** Print is rendered iff a sealed sheet exists.

### 1.4 `R/runLinks.ts` (new) — one builder per destination, cursor-aware

```ts
export interface LinkCursor { cursor?: EvidenceCursor | null; window?: EvidenceWindow | null }
export const runPath    = (runId: string, tail: "" | "progress" | "evidence" | "report" | "release-candidate" | "split" | "search" | "freeze" | "execute") => string;
export const hubHref    = (runId: string, c?: LinkCursor & { stage?: EvidenceStage }) => string;   // default stage "claim" ONLY when the caller says so; never DEFAULT_CURSOR
export const reportHref = (runId: string, c?: LinkCursor) => string;     // hash = serializeCursor({...cursor, stage:"claim"}); ?window= via withWindow
export const rcHref     = (runId: string, c?: LinkCursor) => string;     // same; hash keys never include `pack=` (packFromHash regex `(?:^#|&)pack=` is unaffected)
export const progressHref = (runId: string, c?: LinkCursor) => string;
```
Cursor fields every run-scoped builder carries (all of `EvidenceCursor`, `R/evidenceCursor.ts:40-55`): `stage` (set by the destination's meaning), `fold`, `trial`, `params`, `schedule`, `route`, `seq`, `carried` (study/pick/trade/mode/playback_ordinal) **and** `?window=` (query; `withWindow`). A link with no cursor in hand carries none (never `fold=1`).
`releaseCandidateHref(runId, c?)` in `R/releaseCandidateClient.ts:135` becomes a one-line delegate to `rcHref` (owned by G3). `lineageHref` gets `run` (below, owned by G4).

### 1.5 `R/trialLabel.ts` (new)
```ts
/** "trial 351 · source 350" | "trial 351" | "source 350" | null. Prints what the SAME read served; never computes one from the other. */
export function trialLabel(t: { ordinal?: number | string | null; sourceId?: number | string | null }): string | null;
export const trialTitle: string; // "trial = display ordinal across studies; source = the source's own zero-based trial id"
```
Callers render a typed absence when it returns `null`. Never a bare `#350`, never bare `trial 350` for a source id.

### 1.6 Root data hooks (for tests; every screen sets them)
`data-run-phase={phase}` on the screen root (`[data-screen]` element) and `data-run-exit-bar` on the bar. Tests assert on these, not on copy.

---------------------------------------------------------------------------
## 2. Status matrix

Legend: **Banner** = the one line from §1.1 (exact words); **Hidden** = sections not rendered; **Exits** = `RunExitBar` items in order; **Code** = where to change; **Data** = field the decision reads. "UI derives nothing": every phase is a direct field → `runTerminalState` lookup.

States columns: QUEUED · RUNNING · COMPLETED+sealed · COMPLETED+unsealed · FAILED · CANCELLED · NOT_FOUND/DENIED (one state: F-04) · STALE/partial (overlay, not a phase).

### S03 Progress (`R/RunProgress.tsx`, `R/RunProgressRoute.tsx`)
Already status-aware (`stateWord` 2541, no-source branch 2491-2535, not-found 2473-2488). W1 = unify words + add Library/Hub exits; do not redraw.

| State | Data | Page shows | Hidden | Exits | Code |
|---|---|---|---|---|---|
| QUEUED | `availability=QUEUED_NO_SOURCE` | keep: title `Run queued — R-WFO-025`, h2 `queued — waiting for a worker` → change to banner `Queued.` (tip = old h2 title), `ServedAttempts` | 15 "pending source" cells (DOCS_A: S04 15 ô; here the no-source branch is already minimal) | Progress (self→hidden), Library | no-source branch `R/RunProgress.tsx:2491-2535`: replace the h2 text with `runTerminalState().banner`, add `<RunExitBar hide={["progress"]}>` |
| RUNNING | `effective_status=RUNNING|FINISHING` | unchanged (live) | – | none | – |
| COMPLETED sealed | `effective_status=COMPLETED` | unchanged; next = hub hand-off (`handoffHref` 2537) | – | Hub (existing `offerNext` 2547), Report, RC links present | no change |
| COMPLETED unsealed | `COMPLETED` and `terminal_materialization != READY` | `writing terminal record…` (exists, 2516) | next hidden until READY (`offerNext` 2547 uses `sealed`) | Library | no change |
| FAILED | `FAILED`, `failed_at`, `terminal_reason` | existing failed face; stage rail marks `failed_at.stage` (479-537); `overall.pct` is **never** shown as progress for FAILED (server still sends 10): `R/RunProgress.tsx:633-640` already `failed`; keep; header chip word from `runStatusWord` | ETA, rate, "search done" absents | New run (existing `NewRunFrom`), Library | add `Library` link next to `NewRunFrom` (`R/RunProgress.tsx:2310-2340`) |
| CANCELLED | `CANCELLED_BEFORE_SOURCE` or `CANCELLED` | `Cancelled.`; attempts; `writing terminal record…` | everything else | New run, Library | no-source branch 2491; terminal branch uses `terminalStatus` 2540 |
| NOT_FOUND/DENIED | refusal 404/403 | `Run not available.` + `Library` (exists 2473-2488: copy `REFUSAL_COPY.denied` stays only as tooltip; page keeps one sentence = banner) | all | Library | 2473-2488: banner via `runTerminalState({read:"not-found"})` |
| STALE/partial | `ResearchState.state=stale|partial` | existing ResearchPanel recovery | – | – | none |

Chip target consistency (FLOW_B #6): stage chips S1–S3 → deep dive, S4/S5 → hub tab. Fix: S4 chip → `/execute` deep dive (route exists), S5 → hub claim tab. `stageTarget` `R/RunProgress.tsx:~395-410` (the switch whose `default` returns `{path:"evidence", stage:"claim"}`; add `case "S4": return {path:"execute", stage:"execute"}`). 

### S04 Evidence hub (`R/EvidenceFlow.tsx`)
Data: `lifecycleOf(hub)` (437-440) else `runStatus(hub)` (427-430). Existing `SealNotice` (4775-4800) already prints the banner (and its sentences are too long — shorten to the §1.1 banner, old sentence → `title`; it already splits "lead" vs tooltip at 4783-4786, so only the `sentence` strings in `sealNoticeOf` 4674-4772 change).

| State | Chips (tab sub, `tabSub` 1101) | Page shows | Hidden | Exits | Code |
|---|---|---|---|---|---|
| QUEUED | stage subs `pending` for all | `Queued.` | metric/claim/series cards | Progress, Library | `sealNoticeOf` 4724-4730 + `SummaryTab` 3533: render stage list only when `phase=IN_PROGRESS && readiness=NOT_READY` |
| RUNNING | S4 `running` (genuine) | `Running.` + live cursor | cards the hub does not hold (as today) | Progress | same |
| COMPLETED sealed | `done` / `OOS` / `cert A` | unchanged | – | Report, RC (carry cursor, B3) | links 1510-1513, 4463, 4473, 4579 |
| COMPLETED unsealed | `done` | unchanged; claim card says not issued (server) | – | Report, RC | – |
| FAILED | the stage that was RUNNING at the last snapshot → `failed`; stages after → `not run`; DONE stays `done`; dot tone bad (**B1**) | `Failed.` (S-stage unknown on hub; Progress has it) | the 20 "not published" metric cards and the empty equity block (FLOW_C #8) → **one line**: banner only; the stage list stays (what ran) | Progress (primary), New run, Library | tabSub 1112; StageDot 1131; StagePreviewTab 3945; SummaryTab 3533; claim tab 4338 |
| CANCELLED | RUNNING-at-cancel → `cancelled`; others `not run` / `done`; no "pending retention" prose (409s are logged as console noise; skip the passport read when `phase=TERMINAL`, already `passportSkipOf` 3896-3920 returns null for terminal so the read IS made → set `skip` also for `terminal_outcome=CANCELLED|FAILED` with readiness NOT_READY: stops the 409) | `Cancelled.` | same as FAILED | Library (primary), New run | `passportSkipOf` 3896 |
| NOT_FOUND/DENIED | none | `Run not available.` | whole hub chrome (tabs, cursor bar) | Library | `EvidenceFlow` 4872+: refusal 404/403 branch → `RunExitBar` only |
| STALE/partial | unchanged | `ResearchPanel` notice | – | – | – |

Stage word mapping (B1): see §3.

### S05–S08 stage pages (`SplitDetail.tsx`, `SearchDetail.tsx`, `FreezeDetail.tsx`, `ExecuteDetail.tsx` + `StageDenied.tsx`)
Their body keeps the lane's typed absence (`LANE_STATE_COPY`, `R/SplitDetail.tsx:780-806, 1643`). W1 adds the **exit bar only** when the lane refused with `NOT_RETAINED_TERMINAL | PENDING_SOURCE | PENDING_RETENTION | NOT_RETAINED_LEGACY` or 404/403, status via `useRunStatus` (enabled only then — no extra request on success).

| State | Data | Page shows | Hidden | Exits | Code |
|---|---|---|---|---|---|
| QUEUED | 409 `PENDING_SOURCE` + Library `QUEUED` | `Queued.` | fold lane rows, θ*, charts (no ghost) | Progress, Library | `splitScreenState` 1634-1647 + bar |
| RUNNING | `PENDING_SOURCE` + `RUNNING` | `Running.` (S05 split may already be readable: keep what the lane serves) | – | Progress | same |
| COMPLETED sealed/unsealed | lane 200 | unchanged | – | stage next/prev (unchanged) | – |
| FAILED | `NOT_RETAINED_TERMINAL` + `FAILED` | `Failed.` — replaces "PARTIAL source has not reported" (FLOW_C table) | fold ledger/θ*/charts | Progress, New run, Library | same |
| CANCELLED | `NOT_RETAINED_TERMINAL` + `CANCELLED` | `Cancelled.` (the S05 TERMINAL screen is the best existing; its text stays only as tooltip) | same | Progress, New run, Library | same |
| NOT_FOUND/DENIED | 404/403 | `Run not available.` | everything | Library | `RunNotFound` `R/SplitDetail.tsx:430-455` → render `RunExitBar` (keep component, delete its 12-word paragraph: banner + tooltip) ; `StageDenied.tsx:12-31` same |
| STALE/partial | existing | unchanged | – | – | – |

Back-links on S05–S07 (FLOW_B #14): Evidence Flow crumb only → every stage keeps its current "← hub" and gains `Library` via the shared header (W4 owns the header; W1 does not add crumbs).

### S09 Report (`R/ReportDetail.tsx`, `R/ReportRoute.tsx`)
Data: report 200/404 + `useRunStatus` on 404 (existing hook at 1705 → `useRunStatus`). `reportNoticeState` (1657-1680) is where the status already enters; extend, do not replace.

| State | Data | Page shows | Hidden | Exits | Code |
|---|---|---|---|---|---|
| QUEUED | 404 + Library `QUEUED` | `Queued.` | sheet header body, Print, exports, annotation, `Hub`/`Execute` back-links | Progress, Library | `ReportScreen` 1700-1760; `NoPrintBar` 474-549 hides Print unless a sheet exists (N-09) |
| RUNNING | 404 + `RUNNING` | `Running.` | same | Progress, Library | same |
| COMPLETED sealed | 200 | unchanged | – | Hub, Execute, RC, Lineage (cursor-carrying, B3) | links 493-525 |
| COMPLETED unsealed | 404 + `COMPLETED` | `No sealed report yet.` (not "EMPTY — No sealed report is available for this run") | sheet, Print | Progress, Hub, Library | `reportNoticeState` 1666-1679 |
| FAILED | 200 failed sheet (`FailedSheet`) | existing `NO CLAIM — RUN FAILED AT S4` (keep, it is honest) | Exports, RC link (`hasClaim` false, 502) | Progress, New run, Library added to `NoPrintBar` when `failed` | `NoPrintBar` 474; `R/ReportFailedSheet.tsx` |
| CANCELLED | 404 + `CANCELLED` | `Cancelled.` | sheet, Print | Progress, New run, Library | `reportNoticeState` |
| NOT_FOUND/DENIED | 404 + `not-listed` | `Run not available.` | sheet, Print, `Hub`/`Execute` links to the missing run | Library | `NoPrintBar` must not receive `runId`-scoped links when `state.state==="denied"` |
| STALE/partial | `reportClient.ts:391-408` partial notice | unchanged (already names counts) | – | – | – |

### S10 Lineage (`R/LineageDetail.tsx`, `R/LineageRoute.tsx`)
Data: `attempt.state`, `attempt.primary_run.state`, `presentation_kind`. Already uses `runHasReport` (**111-116**) for the report link; extend.

| State (of the selected attempt) | Page shows | Hidden | Exits (on the selected panel) | Code |
|---|---|---|---|---|
| QUEUED / RUNNING | node chip `QUEUED` / `RUNNING` (own state, VD-F1-02) | report, freeze, RC links | Progress | selected panel links 1905-1945 |
| COMPLETED sealed | unchanged | – | evidence, report, freeze, RC, compare | – |
| COMPLETED unsealed | unchanged | – | evidence, report, freeze, RC (draft) | – |
| FAILED | chip `FAILED`, reason line | **report, freeze, RC** (N-05: RC and freeze are enabled today) | Progress, Evidence, New run (clone), | `runHasReport` 111-116 → rename `runHasEvidence` and use for freeze (1936) and RC (1939) |
| CANCELLED | chip `CANCELLED` | same | Progress, New run | same |
| NOT_FOUND/DENIED (alpha) | `Run not available`-style: `Alpha not available.` | the ROOT/SELECTED/DIFF/PROMOTION/COUNTS skeleton (N-08) | Library | `LineageScreen` denied branch: render header + `RunExitBar` only |
| STALE/partial | `coverage PARTIAL P19_BOUNDED_GRAPH_LIMIT_REACHED` notice (exists) | – | `load older` | – |

### S11 Release Candidate (`R/ReleaseCandidateDetail.tsx`, `R/ReleaseCandidateRoute.tsx`)
**Needs the run status** (compose has none) → `useRunStatus(runId, true)` in `ComposeContainer` (`R/ReleaseCandidateRoute.tsx:25-37`), passed to `ComposeScreen`; compose read still fires (a sealed RC of a completed run must not wait for the Library read; the status only gates the failed/cancelled/queued face).

| State | Data | Page shows | Hidden | Exits | Code |
|---|---|---|---|---|---|
| QUEUED | Library `QUEUED` | `Queued.` | IdentityBlock, PackBlock, RecordBlock, SealCard, PublishCard, MirrorGhost, meta row | Progress, Library | `ComposeScreen` 2285-2375: early return `<RunExitBar>` for phases queued/running/failed/cancelled/attention |
| RUNNING | `RUNNING` | `Running.` | same | Progress, Library | same |
| COMPLETED sealed | `local_seal.state=SEALED_LOCAL` | unchanged **minus the gate verdict** (B2) | verdict block | Run report, Lineage (cursor/run, B3), Publish | `IdentityBlock` 966-1000 |
| COMPLETED unsealed | `UNSEALED` | composer DRAFT as today (seal blocked reason from `actions`) | – | Run report | – |
| FAILED | Library `FAILED` | `Failed.` | **the whole composer** (FLOW_C #2, N-S11-2); no "PARTIAL source gap" banner, no RUN REPORT button unless a failed sheet exists → `Report` exit then | Progress, New run, Library | same early return |
| CANCELLED | `CANCELLED` | `Cancelled.` | same | Progress, New run, Library | same |
| NOT_FOUND/DENIED | compose 404/403 (`Notice`) | `Run not available.` | ghost seal/publish/mirror cards, `denied — nothing from this block` ×3, RUN REPORT button, raw `rrun_` crumb (N-S11-3) | Library | `ComposeScreen`: when `state.state==="denied"` early return bar; crumb uses `runLabelFor` (already) |
| STALE/partial | `Notice` 2338-2340 | unchanged | – | – | – |

### S12 Atlas (`R/EngineAtlas.tsx`) — not run-scoped
Only W1 item: unknown `release_id` (404) currently "EMPTY" + three dead tabs (N-S12-1). → one line `Release not found.` + link `Current release` (existing `← current release` handler, `EngineAtlas.tsx:1623`), tabs hidden. No status matrix.

### S13 Compare (`R/CompareDetail.tsx`)
Rows print `run.run_state` raw (`CompareDetail.tsx:716-720` `{run.run_state}`) → `runStatusWord(run.run_state)`. For a row whose state is not completed: hide its `report` and `RC` links (`CompareDetail.tsx:724-735`, also `1717`) — same `has` rule. Denied alpha: header + `RunExitBar` (Library) only. Pair tab with a failed/cancelled run: the server already refuses typed (`REFUSED`); keep its sentence and add Library exit.

---------------------------------------------------------------------------
## 3. Bugs, exact fixes

### B1 — hub chip says RUNNING on a FAILED run
- Cause: raw `row.state` at `R/EvidenceFlow.tsx:1112` (tab sub), `1131` (dot tone), `3945-3946` (stage row text + `data-stage-state`).
- Mapping `stageChip(rowState, lifecycleOrStatus)` in `runTerminalState.ts`:

| `Stage.state` | run phase in-progress/completed | failed | cancelled | attention |
|---|---|---|---|---|
| `DONE` | `done` | `done` | `done` | `done` |
| `RUNNING` | `running` | `failed` | `cancelled` | `stopped` |
| `PENDING` | `pending` | `not run` | `not run` | `not run` |

  Source of "failed": `lifecycle.terminal_outcome` (`FAILED|CANCELLED`) / `phase=ATTENTION_REQUIRED`, else `core.run_identity.status` when `lifecycle` is absent (rolling deploy; use `runStatus()` 427). This is the same fact Progress derives as `failed_at.basis = SOURCE_RUNNING_STAGE` (`G/research-progress.d.ts:639-648`); not a new inference. Tone: failed → `bad`, cancelled/not run → `quiet`, stopped → `warn`.
- Sub for failed/cancelled/not-run drops the ` · fold N` suffix (`tabSub` 1124) and the ` · {route}` suffix (1115): `failed`, `not run`. (Route id `signal_notional` is a raw token; it lives in the header identity strip.)
- `data-stage-state` keeps the mapped word. Visible text through `runStatusWord`-style humaniser (no uppercase enum in `StagePreviewTab` 3945).
- Optional backend ask B-2 (§8): `Stage.failed` or `failed_at` on hub stages so the hub does not rely on RUNNING-means-failed.

### B2 — RC "local seal blocked" beside "SEALED LOCALLY"
- Cause: `R/ReleaseCandidateDetail.tsx:983-989` prints `compose.gate_verdict.title/body` unconditionally.
- Fix: `IdentityBlock({compose, state, publication})` → render the verdict `div.rc-verdict` only when `compose.local_seal.state !== "SEALED_LOCAL"`. When sealed, the taxonomy row takes the full width (`.rc-taxrow` CSS in `RC_CSS`). No replacement text (the chip `SEALED LOCALLY` and the seal card already say it — one fact once).
- Also rename the label/tooltip: `VERDICT_LABEL` → tooltip "verdict at compose time" on the unsealed branch only.
- Optional backend ask B-3: sealed-aware `gate_verdict`.

### B3 — every link builder and the cursor it must carry
Rule: a link carries the cursor of the screen it sits on; a link with no cursor in hand carries none (never a hardcoded `fold=1`, never `DEFAULT_CURSOR` for a back-link). Fields: `stage` (by destination), `fold`, `trial`, `params`, `schedule`, `route`, `seq`, `carried.*`, `?window=`.

| # | Builder (file:line) | Destination | Today | Must carry |
|---|---|---|---|---|
| 1 | `ReleaseCandidateDetail.tsx:525-527` `hubHref` | hub (RC header crumb `627`, rail) | `{...DEFAULT_CURSOR, stage:"claim"}` → **fold=1 always** | RC route must read the cursor (`parseCursor(window.location.hash)` as `ReportRoute.tsx:28` does) and `hubHref(runId, {cursor, stage:"claim"})`; with no hash → no hash |
| 2 | `ReleaseCandidateDetail.tsx:655` | report | none | cursor + window |
| 3 | `ReleaseCandidateDetail.tsx:661`, `releaseCandidateClient.ts:386` (`railRoute`) | lineage | `?av=` | `?av=` + `?run=<runId>` (+ `attempt=` from `compose.run.attempt` when it is a valid id) |
| 4 | `releaseCandidateClient.ts:388-389` `railRoute` run/selected_params | hub, freeze | none | cursor |
| 5 | `ReportDetail.tsx:493` | hub (claim) | `cursor` from hash; hash empty when entered from hub → `fold=1` (FLOW_C #6) | fixed by #8/#9 (inbound links carry cursor) |
| 6 | `ReportDetail.tsx:501` | execute | same | same |
| 7 | `ReportDetail.tsx:511, 1374` | RC | none | cursor + window (RC then back-links correctly) |
| 8 | `EvidenceFlow.tsx:1510` (nav) | report | none | cursor + window |
| 9 | `EvidenceFlow.tsx:1513` | RC | none | cursor + window |
| 10 | `EvidenceFlow.tsx:4463` | report | none | cursor + window |
| 11 | `EvidenceFlow.tsx:4473` | RC | none | cursor + window |
| 12 | `EvidenceFlow.tsx:4579` (`StageNav` claim → report) | report | none | cursor + window |
| 13 | `ExecuteDetail.tsx:1573` | report | cursor with stale `stage:"execute"` | `reportHref` forces `stage:"claim"` |
| 14 | `ReportDetail.tsx:519-525` | lineage | `?av=` only (N-04) | `?av=` + `?run=<runId>` |
| 15 | `EvidenceFlow.tsx:806`, `FreezeDetail.tsx:1685`, `NewRun.tsx:617,3318,3357`, `AlphaImport.tsx:720,1050,1484` | lineage | `?av=` | add `run` only where a run id is in hand (EvidenceFlow, FreezeDetail); NewRun/AlphaImport have none |
| 16 | `LineageDetail.tsx:653-655` `reportHref`, `:649-651` `evidenceHref`, `:1936` freeze, `:806/1196/1277/1939` RC | run screens | none | none available on S10 (no evidence cursor) — OK; keep, but route through `runLinks.ts` |
| 17 | `CompareDetail.tsx:604-610, 728, 1717` | report/RC/evidence | none | none available — OK; via `runLinks.ts` |
| 18 | `RunLibrary.tsx:1644, 1782-1813` | RC, hub, progress | none | none — OK |
| 19 | `ExecuteCandleReplay.tsx:2061` | split | `{...DEFAULT_CURSOR, fold: foldIndex>=0 ? foldIndex+1 : 1}` | use the live cursor (`cursor`) instead of `DEFAULT_CURSOR`; `1` fallback only when no cursor (screen always has one) |
| 20 | `JourneyMap.tsx:417, 435` | hub | cursor from card pick, else none | OK |
| 21 | `RunProgress.tsx:411-414, 518, 1997, 2537` | hub/stages | hand-off cursor (fold 9/trial 351) | OK; **but** hub "reset to θ*" (`EvidenceFlow` `onResetCursor`) must reset to this hand-off, not fold 1 (FLOW_B 3a) — hub reads `progress.claim.handoff_cursor` already in `RunProgress`; expose via `laneSelection`; owner G2 |
| 22 | S14 (`AlphaImport.tsx`) | its only run-scoped link: none; the "back" the audit means is `back-to-lineage` `:1050` → `lineageHref(contextAlpha)` | OK | no run in hand |

Receiving side:
- `R/ReleaseCandidateRoute.tsx` ComposeContainer: read `parseCursor(location.hash)` and pass `cursor` to `ComposeScreen` (new prop `cursor: EvidenceCursor | null`; `null` when the hash has no cursor keys). `packFromHash` runs first (line 53) and is unaffected.
- `R/LineageRoute.tsx:20`: also read `run=` (and `probes=`); `LineageScreen` prop `initialRun`; `fromLink` (`LineageDetail.tsx:2352-2363`) resolves `initialRun` against `attempt.primary_run.run_id` (and `child_runs[].run_id`) of the returned graph — a lookup, not a derivation. Not in the returned graph → the existing "not returned for this alpha" notice (`2495`).
- `lineageHref(alphaId, {attempt, av, run})` (`R/lineageClient.ts:58`): `run` param added; tests `lineageDetail.*` unaffected (new optional).

### B4 — S10 default shows 3 of 49
- Cause lines: 2371 (`showProbes`), 2373-2376 (`visible`), 82-99 (`defaultAttemptId` only over non-probes via `isHideableProbe` at 91), 994-995 (band `+N probes`), 1356 counts.
- Design: **open on the viewed attempt + newest N; probes behind one toggle.**
  - `LINEAGE_RECENT = 8` (display constant, not a classification).
  - `recentIds` = ids of the newest 8 attempts by `created_at_utc_ms` (server field).
  - `pinnedIds` = `{selectedId, fromLink.attempt}`.
  - `visible` filter becomes: `matches && (showProbes || !isHideableProbe(a) || recentIds.has(id) || pinnedIds.has(id))`.
  - Probe toggle copy: `older probes (K)` where `K = probes not already visible` (replaces `show 46 probe attempts`; also fixes 47-vs-46, N-12, because K is computed from the same visible set). Band chip `+K probes` same K (`LineageDetail.tsx:1055-1068`).
  - `defaultAttemptId` input becomes `visible` plus `initialRun`/`initialAttempt` precedence: `?attempt` > `?run` > existing rank (sealed RC → … → first).
  - Toggle state written to `?probes=1` (`LineageRoute` `replace`), read once at mount (UX finding "toggle not in URL").
  - Counter text unchanged API: `counterText(shown, returned, total)` (`278`) → `showing 11 of 49` on a default view.
  - The chip on a recent probe still says `probe` (server class stays honest; just not hidden).

### B5 — trial numbering label
One helper `trialLabel()` (§1.5). Replace every print:

| Site | Prints today | Becomes |
|---|---|---|
| `RunProgress.tsx:992` (`objective · trial {selection.trial} · params`) | `trial 351` | `trialLabel({ordinal: selection.trial, sourceId: selection.source_trial_id})` = `trial 351 · source 350` |
| `RunProgress.tsx:944` (per-fold study line) | `study X · trial {sourceTrialId}` | `study X · source N` (per-fold has source id only; ordinal cumulative → tooltip `933-934` stays) |
| `RunProgress.tsx:961` (`trial {count(trial)} · running`) | ordinal | `trial N` |
| `RunProgress.tsx:997, 1000, 1922` (hand-off / claim cursor) | `trial 351` | `trial 351` (hand-off serves ordinal only; add `source` when `selection` in the same read has it) |
| `EvidenceFlow.tsx:1435, 1438` (cursor pill `#351`, `#351 · global`) | `#351` | `trial 351` (+ ` · source N` only when the lane read that carries the same selection serves it); drop `#` |
| `SearchSurface.tsx:325` (`θ* #{selected}`) | `θ* #350` | `θ* · source 350` |
| `SearchDetail.tsx:1440` | `θ* · selected trial 350` | `θ* · source 350` |
| `SearchDetail.tsx:1544, 1569` (ledger rows / sampled) | `trial 350` | `source 350` (ledger ids are source ids) |
| `SearchDetail.tsx:2221, 2345` | `trial 350` | `source 350` |
| `SplitDetail.tsx:1532, 1541, 1549, 2725-2726` | `source trial 350` / `GLOBAL · source trial 350` | `source 350` / `GLOBAL · source 350` |
| `FreezeDetail.tsx:975-977` | `· trial 350` + tooltip "ordinal = source + 1" | `· source 350` (tooltip = `trialTitle`; delete "= source + 1" arithmetic text) |
| `CausalSelectionPanel.tsx:107-108` | `trial study_2.trial_1` | `source study_2.trial_1` (study-qualified id) |
| `ReleaseCandidateDetail.tsx:838-842` (pick) | `trial 350` | `source 350` |
| RC rail node `selected_params` `detail` (server text, "retained trial 350 · global") | server-composed | backend ask B-5: ordinal beside it; FE prints verbatim until then |
| Hub tab/cursor bar, Progress hand-off link `RunProgress.tsx:2538` `fold N · trial M` | ordinal | unchanged, labelled `trial` (ordinal) |

Rule: when only a source id is served the label says `source`, never `trial`; the ordinal is printed only when the same read serves it. The S05/S06 `trial 351 · source 350` form needs backend B-4 (ordinal on current-source selection) — FE must not add 1.

---------------------------------------------------------------------------
## 4. Test plan

### 4.1 Unit (Vitest + Testing Library), one test per matrix cell
Canonical fixtures: existing real captures `R/w3RealWfo.fixture.json` (WFO global complete, sealed), `R/g8RealP04.fixture.json` (P04), `R/w5cRealRc.fixture.json` (RC sealed/unsealed), `R/ResearchFixtures.tsx`. New `R/runStates.fixture.ts`: factories that spread a canonical object and override only the status fields (`libraryRow(status, {rc, source_kind})`, `hubFor(phase)` = canonical hub with `lifecycle` + `stages[]` override, `progressFor(status)`, `compose(sealed|unsealed)`, `report404()`), so no screen text is hand-built.

Naming `W1-{screen}-{state}`; each asserts: `[data-run-phase]`, banner text exact (§1.1), the exit link set and order (`[data-exit]`), hidden sections absent (`queryBy…` null), no `button[data-action=print]` when no sheet.

New/extended test files:
- `runTerminalState.test.ts` — table test: every wire status × `read` → phase/word/banner/exits (8 phases × statuses incl. `FINISHING`, `CANCEL_REQUESTED`, unknown → `unread`); `runStatusWord` never returns an `UPPER_SNAKE` token; `stageChip` table of B1 (9 cells).
- `runExitBar.test.tsx` — order, hide, `onRetry`, cursor in hub/report hrefs, no `fold=1` when no cursor.
- `runLinks.test.ts` — every builder × (no cursor / full cursor + window): exact href; `packFromHash` unaffected by `rcHref`.
- `trialLabel.test.ts` — 4 shapes; never `#`; never computes.
- `evidenceFlow.w1.test.tsx` — hub: FAILED fixture → tab S4 reads `failed`, no `RUNNING` text anywhere in `[data-stage-card]`, dot `data-stage-dot="failed"`; CANCELLED; QUEUED; metric cards hidden on FAILED; exits.
- `releaseCandidate.w1.test.tsx` — sealed fixture: no `[data-verdict-title]` (B2); FAILED/CANCELLED/QUEUED via mocked `runLibraryApi`: only `RunExitBar`, no `[data-panel=identity|pack|seal|publish]`; 404 → no ghost cards; cursor hash in → back-link href carries it.
- `reportDetail.w1.test.tsx` — 404 + Library `CANCELLED|QUEUED|COMPLETED|not-listed` → banner/exits; failed sheet exits; Print absent without sheet; link hrefs carry cursor + `?run=`.
- `lineageDetail.w1.test.tsx` — 49-attempt fixture (re-use the `w6b` lineage fixture scaled): default `showing 11 of 49`, selected = `?run=` attempt even if PROBE, toggle label `older probes (K)`, `?probes=1` round trip, FAILED selected hides freeze/RC links, denied → no skeleton.
- `compareDetail.w1.test.tsx` — state word humanised, report/RC links absent for FAILED row.
- `runProgress.w1.test.tsx` — Library link beside `NewRunFrom`; S4 chip target `/execute`.
- Stage pages: `splitDetail.w1.test.tsx`, `searchDetail.w1.test.tsx` — 409 `NOT_RETAINED_TERMINAL` + Library FAILED/CANCELLED → bar; `trialLabel` strings (no `#350`, no bare `trial 350`).
- Update existing tests that assert old strings (`#351`, `show N probe attempts`, `GATE VERDICT`, `EMPTY — No sealed report…`): grep `rc-verdict|show .* probe attempts|No sealed report is available|θ\* #` in `R/*.test.tsx` and `e2e/`.

### 4.2 Playwright real-API probe per state (read-only: GET only, same rules as the audit)
New `e2e/_preview-research-w1-states.spec.ts` (+ shared `e2e/w1StateRuns.ts`) in the style of `_preview-research-real-api.spec.ts`. Runs are discovered at run time, not hard-coded, by Library `GET …/runs?status=…` (ids that exist today: sealed WFO `rrun_3d5633d2adb712722fe4ba108102aa5d`, unsealed `rrun_686af4b1d64472591b6a64a1db1233a3` / `rrun_9ec42333b812f7e41e389a36e06328df`, FAILED `rrun_3955ea932446580929253b86ec5e7317`; CANCELLED WFO-019 and QUEUED WFO-025 found by status; NOT_FOUND = `rrun_` + 32 zero hex). For each state × route in {progress, evidence + each stage tab, split/search/freeze/execute, report, release-candidate, alphas/…/lineage?run=}:

| State | Live run | Asserts |
|---|---|---|
| COMPLETED sealed | WFO-023 | no banner; RC has no `[data-verdict-title]` and has `SEALED`; report→hub link href contains `fold=` of the cursor used to enter; Back keeps hash |
| COMPLETED unsealed | WFO-027 | RC composer present; seal button state typed |
| FAILED | P04-020 | hub tab S4 text matches `/failed/i`, never `/running/i`; hub shows no "not published" wall (`count("not published") <= 2`); report failed sheet + `Progress|New run|Library` exits; RC = exit bar only; split/search = exit bar |
| CANCELLED | WFO-019 | every screen: `Cancelled.` + exits; no 409 retry loops (count 409s ≤ 1 per screen) |
| QUEUED | WFO-025 (skip with annotation if no QUEUED run exists any more — it was stuck QUEUED, G-23) | `Queued.`; no ghost cards |
| RUNNING | none live → covered by unit + a `page.route` fulfil of the Library row for a real id (GET only) | `Running.` + `Progress` exit |
| NOT_FOUND/DENIED | zero-run id | each screen: one `Run not available.`, only `Library` exit, **no** link containing the missing id, no Print |
| STALE/partial | `page.route` 503 on one GET (non-GET aborted as the audit did) | existing notice + retry; no phase change |
| Cursor | WFO-023 `#stage=claim&fold=4&trial=351` | hub→report→RC→hub round trip via real clicks and `goBack/goForward`: hash identical at each hop; lineage opened from report/RC selects that run's attempt (`?attempt=` written by the screen) even when it is a PROBE; default lineage view `showing N of 49` with N ≥ 9 |
| Trial label | WFO-023 | S03/S04/S05/S06 text dump: no `/#35[01]\b/`, no bare `/trial 350/`; where both served: `trial 351 · source 350` |

Console budget per run: zero `console.error`, 404/409 only on the documented lanes. Run in background, commit first (per project memory: never poll a long Playwright run; visual lane only via `./scripts/portal-web-visual.sh`; `--update-snapshots` is Bobby's, so the visual baselines affected by removed text are listed for him: hub FAILED, RC sealed, lineage default).

### 4.3 Gates before merge
`tsc`, lint, the touched `R/*.test.tsx`, then the real-API lane above on the preview, then a manual contact sheet of: hub FAILED, RC FAILED/CANCELLED, report CANCELLED, lineage default, RC sealed. Contracts: no change to `packages/contracts` (nothing to regenerate).

---------------------------------------------------------------------------
## 5. Size and ownership

Estimate (source / test LoC): G1 ≈ 420 / 380 · G2 ≈ 300 / 420 · G3 ≈ 330 / 380 · G4 ≈ 240 / 260 · e2e ≈ 450. Total ≈ 1,300 source, 1,900 test/e2e, ~34 files touched, 9 new. Roughly 1 working day with four agents plus one integration pass; G1 must land (signatures frozen in §1) before G2–G4 compile, but G2–G4 can start against the §1 signatures.

Disjoint file ownership (no file in two groups):

| Group | Scope | Owns (files) |
|---|---|---|
| **G1 — shared core** | §1: `runTerminalState`, `useRunStatus`, `RunExitBar`, `runLinks`, `trialLabel`, fixtures | new: `R/runTerminalState.ts`, `R/useRunStatus.ts`, `R/RunExitBar.tsx`, `R/runLinks.ts`, `R/trialLabel.ts`, `R/runStates.fixture.ts`, their 5 tests; edit: `R/useRunVisibility.ts` (re-export), `R/evidenceCursor.ts` only if `withWindow` needs export, `e2e/w1StateRuns.ts`, `e2e/_preview-research-w1-states.spec.ts` skeleton + cursor/trial probes |
| **G2 — S03, S04 hub, S05–S08** | B1, hub exits/hidden walls, stage-page exit bars, link rows 8–13/19/21, trial rows in progress/hub/stages | `R/EvidenceFlow.tsx`, `R/RunProgress.tsx`, `R/SplitDetail.tsx`, `R/SearchDetail.tsx`, `R/SearchSurface.tsx`, `R/FreezeDetail.tsx`, `R/CausalSelectionPanel.tsx`, `R/ExecuteDetail.tsx`, `R/ExecuteCandleReplay.tsx`, `R/StageDenied.tsx`; tests `evidenceFlow.w1`, `runProgress.w1`, `splitDetail.w1`, `searchDetail.w1`; e2e `_preview-research-w1-hub.spec.ts` |
| **G3 — S09 report + S11 RC** | B2, report/RC status faces, RC cursor, link rows 1–7, 13 (receiving side) | `R/ReportDetail.tsx`, `R/ReportRoute.tsx`, `R/ReportFailedSheet.tsx`, `R/reportClient.ts`, `R/ReleaseCandidateDetail.tsx`, `R/ReleaseCandidateRoute.tsx`, `R/releaseCandidateClient.ts`; tests `reportDetail.w1`, `releaseCandidate.w1`; e2e `_preview-research-w1-report-rc.spec.ts` |
| **G4 — S10, S12, S13, Library, links in** | B4, `?run=`/`?probes=`, denied skeletons, compare words, atlas 404, link rows 14–18 | `R/LineageDetail.tsx`, `R/LineageRoute.tsx`, `R/lineageClient.ts`, `R/useLineage.ts`, `R/CompareDetail.tsx`, `R/EngineAtlas.tsx`, `R/RunLibrary.tsx` (`openTarget` uses `runTerminalState` words; no behaviour change), `R/JourneyMap.tsx`, `R/NewRun.tsx` + `R/AlphaImport.tsx` (only `lineageHref` call sites, if signature needs it: none, optional param); tests `lineageDetail.w1`, `compareDetail.w1`; e2e `_preview-research-w1-lineage.spec.ts` |

Merge order: G1 → (G2 ∥ G3 ∥ G4) → integration (update stale string assertions, run lane). Anything outside these files (e.g. W2 `NewRun.tsx` validation, W3 mobile, W4 header) is out of W1.

---------------------------------------------------------------------------
## 6. Fewer-words ledger for W1 (KEEP / SHORTEN / REMOVE / MOVE-TO-TOOLTIP)

| Where | Current | Action | Proposed | Words saved |
|---|---|---|---|---|
| S04 `sealNoticeOf` (`EvidenceFlow.tsx:4702-4766`) | "This run was cancelled. It stopped before sealing evidence, so no metric, series or claim was produced for it, and none will arrive." | SHORTEN + MOVE-TO-TOOLTIP | `Cancelled.` | 24 |
| same, FAILED | "This run failed before sealing evidence, so none will arrive. Its progress record shows where it stopped." | same | `Failed.` | 18 |
| same, IN_PROGRESS | "This run is RUNNING and has not sealed its evidence yet. The hub shows what the projection holds; …" | same | `Running.` | 28 |
| S04 failed hub | 20 "not published" cards + empty equity | REMOVE | banner only | ~40 |
| S09 `reportNoticeState` (`ReportDetail.tsx:1668-1678`) | "EMPTY — No sealed report is available for this run." + collapsed `run status … report read answered 404 …` | SHORTEN | `No sealed report yet.` / `Cancelled.` / `Queued.` | 8 |
| S09 `NoPrintBar` | `← Hub · Stage 5 Claim` · `← Execute replay` | SHORTEN | `← Hub` · `← Execute` | 4 |
| S11 verdict (sealed) | "GATE VERDICT local seal blocked — review evidence" | REMOVE | – | 7 |
| S11 failed | full composer + PARTIAL banner | REMOVE | `Failed.` | ~60 |
| S10 probe toggle | `show 46 probe attempts` | SHORTEN | `older probes (38)` | 1 |
| S03 no-source h2 | `queued — waiting for a worker` | KEEP semantics, SHORTEN | `Queued.` | 4 |
| `RunNotFound` / stage denied | "run not available" + F-04 paragraph + "Open the Run Library →" | SHORTEN + MOVE-TO-TOOLTIP | `Run not available.` + `Library` | ~25 |
| Hub tab sub | `RUNNING · signal_notional` | SHORTEN | `failed` | 1+token |
| Trial | `trial 351` / `#350` / `θ* #350` | normalise | `trial 351 · source 350` (adds 2 words only where both are served, removes the contradiction) | – |

---------------------------------------------------------------------------
## 7. Out of W1 (noted, not specified here)
W2 New Run validation; W3 mobile (hub tab strip overlap, targets); W4 one absence component / value formatter / header; W5 a11y, charts, `seq`/`window` into the hash, causal study selector; hub-tab-vs-deep-dive decision (Bobby's §6.1); seal-confirm/publish live audit (needs a sealable unsealed run on the preview, DATA gap P3-17).

## 8. Optional backend asks (none block W1; file in the Codex request list)
- B-1 `ComposeResponse.run_status` (+ `report_sealed`) on the RC compose read, so S11 needs no Library read.
- B-2 hub `Stage.failed: boolean` or `lifecycle.failed_at` (same shape as `ProgressFailedAt`), so the hub does not infer failure from "RUNNING in a terminal run".
- B-3 sealed-aware `gate_verdict` (or omit it once `local_seal.state=SEALED_LOCAL`).
- B-4 `selected_trial_ordinal` beside `selected_trial_id` on current-source split/search/freeze selections, so S05/S06 can print `trial 351 · source 350` without `+1` in the browser.
- B-5 same ordinal inside the RC rail `selected_params.detail` text.
- Pre-existing: queued run stuck since 16:31Z (G-23) — outside FE.
