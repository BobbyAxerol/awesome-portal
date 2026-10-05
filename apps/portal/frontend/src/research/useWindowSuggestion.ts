/**
 * Screen 02 · Suggest / Apply / Reset of the window declaration (S02 linked-window setup).
 *
 * The suggestion is an editable indexed-bar hint (`EDITABLE_HEURISTIC_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION`),
 * asked for by an explicit `suggest()` and never by a drag or a keystroke. The hook makes no request on mount,
 * keeps one request in flight, aborts it when the context, the options revision or the profile changes, and
 * discards an answer that is not for exactly the request it made. The declaration-estimate debounce and its
 * signature fence (`useDeclarationEstimate`) are untouched: applying a suggestion edits the draft, and the
 * estimate then asks for the actual fold geometry as it does for any edit.
 *
 * Nothing the reader typed is overwritten silently. `apply()` is the reader's decision and returns a draft
 * patch; `reset()` returns exactly the values `apply()` replaced (for a clone, its original bounds).
 * Auto-apply exists for one case only: every window field is empty and no coverage prefill was placed.
 *
 * Outer bounds: `start_utc_ms` and `end_exclusive_utc_ms` go out together, only when BOTH were set by the
 * reader (a bound the coverage prefill placed is not the reader's), otherwise neither goes and the server
 * answers a bounded automatic range. Never one edge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type SetupOptions,
  type SetupQuery,
  type SuggestionRequest,
  type WindowPatch,
  type WindowSuggestion,
  type WindowSuggestionResult,
  postWindowSuggestion,
} from "./setupClient";
import { type CoveragePrefill, type PrefillField, type RunDraft, type WindowDraft, utcMs } from "./runDraft";
import { setupContextKey } from "./useRunSetup";

/* --------------------------------------------------------- pure helpers */

/** `2026-05-01T00:00` (the draft's UTC input form) from epoch ms. */
export function formatDraftInstant(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/**
 * The four edges of a Three Window declaration: IS = [A, B), OOS = [B, C), Holdout = [C, D). B is both the IS
 * end and the OOS start, C both the OOS end and the Holdout start. Empty text is an unset edge.
 * `linked` is false when the draft's OOS start is not B or the Holdout start is not C (a draft that is not linked).
 */
export interface WindowEdges {
  a: string;
  b: string;
  c: string;
  d: string;
  linked: boolean;
}

/** The edges of a Three Window draft; null for any other protocol. */
export function edgesOf(draft: Pick<RunDraft, "protocol" | "windows">): WindowEdges | null {
  if (draft.protocol !== "three_window_decay") return null;
  const { is, oos, holdout } = draft.windows;
  return {
    a: is.start,
    b: is.endExclusive,
    c: oos.endExclusive,
    d: holdout.endExclusive,
    linked: oos.start === is.endExclusive && holdout.start === oos.endExclusive,
  };
}

/** The three windows of four edges, B and C shared: the one place linked edits become window fields. */
export function windowsFromEdges(edges: Pick<WindowEdges, "a" | "b" | "c" | "d">): { is: WindowDraft; oos: WindowDraft; holdout: WindowDraft } {
  return {
    is: { start: edges.a, endExclusive: edges.b },
    oos: { start: edges.b, endExclusive: edges.c },
    holdout: { start: edges.c, endExclusive: edges.d },
  };
}

type Windowed = Pick<RunDraft, "protocol" | "windows" | "walkForward" | "coveragePrefill">;

/**
 * Auto-apply of a served suggestion is allowed only while the reader has declared nothing: every window field of the
 * protocol is empty, or holds only the outer bound a coverage prefill placed and nobody touched (the suggestion is
 * the profile-aware replacement for exactly that). Anything the reader typed, a copied run holds, or a touched
 * prefill field keeps the draft: the proposal is shown and waits for an explicit Apply.
 */
export function autoApplyAllowed(draft: Windowed): boolean {
  const prefill = draft.coveragePrefill;
  if (prefill !== undefined && prefill.touched.length > 0) return false;
  const placed = prefill?.placed ?? {};
  const fields: readonly { field: PrefillField | null; value: string }[] =
    draft.protocol === "three_window_decay"
      ? [
          { field: "is.start", value: draft.windows.is.start },
          { field: null, value: draft.windows.is.endExclusive },
          { field: null, value: draft.windows.oos.start },
          { field: null, value: draft.windows.oos.endExclusive },
          { field: null, value: draft.windows.holdout.start },
          { field: "holdout.endExclusive", value: draft.windows.holdout.endExclusive },
        ]
      : [
          { field: "walkForward.start", value: draft.walkForward.start },
          { field: "walkForward.endExclusive", value: draft.walkForward.endExclusive },
          { field: null, value: draft.walkForward.splitMode },
        ];
  return fields.every(({ field, value }) => value.trim() === "" || (field !== null && placed[field] === value));
}

/** The outer-bound fields of a protocol, as the draft stores them. */
function outerValues(draft: Windowed): readonly { field: PrefillField; value: string }[] {
  return draft.protocol === "advanced"
    ? [{ field: "walkForward.start", value: draft.walkForward.start }, { field: "walkForward.endExclusive", value: draft.walkForward.endExclusive }]
    : [{ field: "is.start", value: draft.windows.is.start }, { field: "holdout.endExclusive", value: draft.windows.holdout.endExclusive }];
}

/**
 * The outer range the reader set, in epoch ms, or null unless BOTH edges are the reader's own, readable and
 * ordered. A value the coverage prefill placed and nobody touched is the prefill's, not the reader's.
 */
export function userOuterBounds(draft: Windowed): { startUtcMs: number; endExclusiveUtcMs: number } | null {
  const [from, to] = outerValues(draft);
  const placed = draft.coveragePrefill?.placed ?? {};
  if (from === undefined || to === undefined) return null;
  const own = (entry: { field: PrefillField; value: string }) => entry.value.trim() !== "" && placed[entry.field] !== entry.value;
  if (!own(from) || !own(to)) return null;
  const start = utcMs(from.value);
  const end = utcMs(to.value);
  return start !== null && end !== null && end > start ? { startUtcMs: start, endExclusiveUtcMs: end } : null;
}

const FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;
const WINDOW_MODES = ["expanding", "rolling"] as const;

/** Advanced preferences the draft has no field for. */
export interface SuggestionPreferences {
  /** `initial_train_bars`: a whole number of at least 1. */
  initialTrainBars?: number;
}

export type SuggestionRequestResult =
  | { state: "request"; request: SuggestionRequest }
  /** A request the server would refuse by construction is not sent. */
  | { state: "blocked"; reason: "PROFILE_NOT_ENABLED" | "ROLLING_NEEDS_TRAIN_WINDOW" };

/**
 * The POST body for the selected profile. Both outer bounds or neither; Advanced preferences
 * (`frequency`, `window_mode`, `initial_train_bars`) only for Advanced, `train_window` only for rolling
 * (an expanding window forbids it, a rolling one requires it).
 */
export function buildSuggestionRequest(input: {
  context: SetupQuery;
  options: Pick<SetupOptions, "source_revision" | "profiles">;
  profileId: string;
  draft: Windowed & Pick<RunDraft, "walkForward">;
  preferences?: SuggestionPreferences;
}): SuggestionRequestResult {
  const { context, options, profileId, draft } = input;
  const profile = options.profiles.find((entry) => entry.profile_id === profileId);
  if (profile === undefined || profile.state !== "ENABLED") return { state: "blocked", reason: "PROFILE_NOT_ENABLED" };
  const bounds = userOuterBounds(draft);
  const request: SuggestionRequest = {
    ...(context.workspaceId ? { workspace_id: context.workspaceId } : {}),
    alpha_id: context.alphaId,
    alpha_version_id: context.alphaVersionId,
    dataset_id: context.datasetId,
    symbol: context.symbol,
    timeframe: context.timeframe,
    profile_id: profileId,
    options_revision: options.source_revision,
    ...(bounds ? { start_utc_ms: bounds.startUtcMs, end_exclusive_utc_ms: bounds.endExclusiveUtcMs } : {}),
  };
  if (draft.protocol !== "advanced") return { state: "request", request };
  const wf = draft.walkForward;
  const frequency = FREQUENCIES.find((value) => value === wf.frequency);
  const windowMode = WINDOW_MODES.find((value) => value === wf.windowMode);
  const trainBars = input.preferences?.initialTrainBars;
  if (windowMode === "rolling" && !wf.trainWindow) return { state: "blocked", reason: "ROLLING_NEEDS_TRAIN_WINDOW" };
  return {
    state: "request",
    request: {
      ...request,
      ...(frequency ? { frequency } : {}),
      ...(windowMode ? { window_mode: windowMode } : {}),
      ...(windowMode === "rolling" && wf.trainWindow ? { train_window: wf.trainWindow } : {}),
      ...(trainBars !== undefined && Number.isInteger(trainBars) && trainBars >= 1 ? { initial_train_bars: trainBars } : {}),
    },
  };
}

/** What `apply()` and `reset()` change in the draft. */
export type DraftWindowPatch = Partial<Pick<RunDraft, "windows" | "walkForward" | "coveragePrefill">>;

export type SuggestionPatchResult =
  | { state: "patch"; patch: DraftWindowPatch }
  /** No patch: the server published none (`reasonCode` is its typed `reason_code`), or it cannot be written into this draft. */
  | { state: "none"; reasonCode: string | null };

/** The coverage provenance after a suggestion owns the outer bounds: no later prefill may replace them. */
function touchedOuter(draft: Pick<RunDraft, "coveragePrefill">, fields: readonly PrefillField[]): CoveragePrefill {
  const prior = draft.coveragePrefill ?? { source: null, placed: {}, touched: [] };
  return {
    source: prior.source,
    placed: Object.fromEntries(Object.entries(prior.placed).filter(([key]) => !fields.includes(key as PrefillField))),
    touched: [...new Set([...prior.touched, ...fields])],
  };
}

/**
 * The draft patch of a served suggestion. Three Window writes the six window strings (B and C shared);
 * Advanced writes the analysis start, end and first OOS instant only (the reader's frequency, window mode
 * and widths are preferences it was asked with, not its answer). A `NOT_PUBLISHED` suggestion has no patch.
 * Written as UTC `YYYY-MM-DDTHH:mm`; a source clock that is not UTC is not written (the draft reads UTC).
 */
export function suggestionToDraftPatch(proposal: WindowSuggestion, draft: Pick<RunDraft, "protocol" | "windows" | "walkForward" | "coveragePrefill">): SuggestionPatchResult {
  const metadata = proposal.metadata;
  const patch: WindowPatch | null = metadata.state === "AVAILABLE" ? metadata.patch : null;
  if (patch === null) return { state: "none", reasonCode: metadata.reason_code };
  if (metadata.source_timezone !== "UTC") return { state: "none", reasonCode: "SOURCE_TIMEZONE_NOT_UTC" };
  if (patch.protocol !== draft.protocol) return { state: "none", reasonCode: "PROTOCOL_MISMATCH" };
  if (patch.protocol === "three_window_decay") {
    const { is, oos, holdout } = patch.windows;
    const windows = windowsFromEdges({
      a: formatDraftInstant(is.start_utc_ms),
      b: formatDraftInstant(is.end_exclusive_utc_ms),
      c: formatDraftInstant(oos.end_exclusive_utc_ms),
      d: formatDraftInstant(holdout.end_exclusive_utc_ms),
    });
    return { state: "patch", patch: { windows, coveragePrefill: touchedOuter(draft, ["is.start", "holdout.endExclusive"]) } };
  }
  const wf = patch.walk_forward;
  return {
    state: "patch",
    patch: {
      walkForward: {
        ...draft.walkForward,
        start: formatDraftInstant(wf.start_utc_ms),
        endExclusive: formatDraftInstant(wf.end_exclusive_utc_ms),
        splitMode: formatDraftInstant(wf.first_oos_utc_ms),
      },
      coveragePrefill: touchedOuter(draft, ["walkForward.start", "walkForward.endExclusive"]),
    },
  };
}

/** Everything `apply()` replaces, as it stood before. */
export interface PreApply {
  protocol: RunDraft["protocol"];
  windows: RunDraft["windows"];
  walkForward: Pick<RunDraft["walkForward"], "start" | "endExclusive" | "splitMode">;
  coveragePrefill: RunDraft["coveragePrefill"];
}

export function preApplyOf(draft: Pick<RunDraft, "protocol" | "windows" | "walkForward" | "coveragePrefill">): PreApply {
  return {
    protocol: draft.protocol,
    windows: draft.windows,
    walkForward: { start: draft.walkForward.start, endExclusive: draft.walkForward.endExclusive, splitMode: draft.walkForward.splitMode },
    coveragePrefill: draft.coveragePrefill,
  };
}

/** The patch that returns exactly the pre-apply values (Advanced keeps every other walk-forward field as it is now). */
export function resetPatchOf(before: PreApply, draft: Pick<RunDraft, "walkForward">): DraftWindowPatch {
  return before.protocol === "three_window_decay"
    ? { windows: before.windows, coveragePrefill: before.coveragePrefill }
    : { walkForward: { ...draft.walkForward, ...before.walkForward }, coveragePrefill: before.coveragePrefill };
}

/* ------------------------------------------------------- the state machine */

export type SuggestionState =
  /** Nothing asked: no request is made on mount, and none per edit. */
  | { kind: "idle" }
  | { kind: "pending" }
  /** A served suggestion with a patch the reader may apply. */
  | { kind: "proposal"; suggestion: WindowSuggestion }
  /** The server published no suggestion for this request: its typed `reason_code`, no patch. */
  | { kind: "not-published"; suggestion: WindowSuggestion; reasonCode: string | null }
  /** A 409: the options revision this was bound to is obsolete. Read the options again. */
  | { kind: "stale"; revision: string }
  | { kind: "blocked"; reason: Extract<SuggestionRequestResult, { state: "blocked" }>["reason"] }
  | { kind: "refused"; code: string; fieldPath: readonly string[] | null; requestId: string | null }
  | { kind: "error"; failure: "client-error" | "server-error" | "network" | "absent" | "mismatch"; status: number | null; code: string | null; requestId: string | null };

export interface WindowSuggestionInput {
  /** The setup context (null until every part exists: nothing can be suggested). */
  context: SetupQuery | null;
  /** The served options the suggestion is bound to (null: no suggestion). */
  options: SetupOptions | null;
  /** The selected ENABLED profile; a disabled or unknown one is never asked about. */
  profileId: string | null;
  draft: RunDraft;
  /** A 409 retired this options revision (wire to `useRunSetup().invalidate`). */
  onStale?: (revision: string) => void;
  /** Called once with the patch when a served suggestion arrives and `autoApplyAllowed(draft)` holds. Never for an edited draft. */
  onAutoApply?: (patch: DraftWindowPatch) => void;
  post?: (request: SuggestionRequest, signal?: AbortSignal) => Promise<WindowSuggestionResult>;
}

export interface WindowSuggestionController {
  state: SuggestionState;
  /** The served suggestion (a patch or a typed NOT_PUBLISHED), or null. */
  proposal: WindowSuggestion | null;
  /** True once `apply()` replaced something and `reset()` can put it back. */
  canReset: boolean;
  suggest: (preferences?: SuggestionPreferences) => void;
  /** The patch to write into the draft, or null when there is none; records the pre-apply values. */
  apply: () => DraftWindowPatch | null;
  /** The patch that restores exactly the values the first `apply()` replaced, or null when nothing was applied. */
  reset: () => DraftWindowPatch | null;
  /** Drops the proposal without touching the draft. */
  dismiss: () => void;
}

function sameContext(suggestion: WindowSuggestion, context: SetupQuery): boolean {
  const echoed = suggestion.context;
  return (
    echoed.alpha_id === context.alphaId
    && echoed.alpha_version_id === context.alphaVersionId
    && echoed.dataset_id === context.datasetId
    && echoed.symbol === context.symbol
    && echoed.timeframe === context.timeframe
    && (context.workspaceId === undefined || echoed.workspace_id === context.workspaceId)
  );
}

export function useWindowSuggestion(input: WindowSuggestionInput): WindowSuggestionController {
  const { context, options, profileId, draft, onStale, onAutoApply, post = postWindowSuggestion } = input;
  /* What a suggestion is for: context, options snapshot and profile. Any change discards the proposal. */
  const scope = context === null || options === null || profileId === null ? null : `${setupContextKey(context)}|${options.source_revision}|${profileId}`;
  const [answer, setAnswer] = useState<{ scope: string; state: SuggestionState } | null>(null);
  const [pendingScope, setPendingScope] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<{ scope: string; before: PreApply } | null>(null);

  const latest = useRef({ draft, context, options, profileId, scope, onStale, onAutoApply, post });
  latest.current = { draft, context, options, profileId, scope, onStale, onAutoApply, post };
  const controller = useRef<AbortController | null>(null);

  /* A new scope aborts what is in flight; nothing is asked on mount. */
  useEffect(() => {
    return () => {
      controller.current?.abort();
      controller.current = null;
      setPendingScope(null);
    };
  }, [scope]);

  const suggest = useCallback((preferences?: SuggestionPreferences) => {
    const now = latest.current;
    if (controller.current !== null || now.scope === null || now.context === null || now.options === null || now.profileId === null) return;
    const built = buildSuggestionRequest({ context: now.context, options: now.options, profileId: now.profileId, draft: now.draft, preferences });
    const scopeAtAsk = now.scope;
    if (built.state === "blocked") {
      setAnswer({ scope: scopeAtAsk, state: { kind: "blocked", reason: built.reason } });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setPendingScope(scopeAtAsk);
    const revision = now.options.source_revision;
    const asked = now.context;
    now.post(built.request, abort.signal).then(
      (result) => {
        if (abort.signal.aborted || latest.current.scope !== scopeAtAsk) return;
        controller.current = null;
        setPendingScope(null);
        let state: SuggestionState;
        switch (result.state) {
          case "served": {
            const body = result.body;
            if (body.options_revision !== revision || body.profile_id !== built.request.profile_id || !sameContext(body, asked)) {
              state = { kind: "error", failure: "mismatch", status: null, code: null, requestId: null };
            } else if (body.metadata.state === "AVAILABLE" && body.metadata.patch !== null) {
              state = { kind: "proposal", suggestion: body };
            } else {
              state = { kind: "not-published", suggestion: body, reasonCode: body.metadata.reason_code };
            }
            break;
          }
          case "stale-options":
            state = { kind: "stale", revision };
            latest.current.onStale?.(revision);
            break;
          case "refused":
            state = { kind: "refused", code: result.code, fieldPath: result.fieldPath, requestId: result.requestId };
            break;
          case "absent":
            state = { kind: "error", failure: "absent", status: null, code: null, requestId: null };
            break;
          case "network":
            state = { kind: "error", failure: "network", status: null, code: null, requestId: null };
            break;
          default:
            state = { kind: "error", failure: result.state, status: result.status, code: result.code, requestId: result.requestId };
        }
        setAnswer({ scope: scopeAtAsk, state });
        if (state.kind === "proposal" && latest.current.onAutoApply && autoApplyAllowed(latest.current.draft)) {
          const patch = suggestionToDraftPatch(state.suggestion, latest.current.draft);
          if (patch.state === "patch") {
            /* Read the draft now: a state updater runs at the next render, by which time the patch below has already landed. */
            const before = preApplyOf(latest.current.draft);
            setBaseline((previous) => (previous?.scope === scopeAtAsk ? previous : { scope: scopeAtAsk, before }));
            latest.current.onAutoApply(patch.patch);
          }
        }
      },
      () => {
        /* An abort is the request being replaced: it says nothing. */
        if (controller.current === abort) controller.current = null;
      },
    );
  }, []);

  const state: SuggestionState = useMemo(() => {
    if (scope === null) return { kind: "idle" };
    if (pendingScope === scope) return { kind: "pending" };
    return answer !== null && answer.scope === scope ? answer.state : { kind: "idle" };
  }, [scope, pendingScope, answer]);

  const proposal = state.kind === "proposal" || state.kind === "not-published" ? state.suggestion : null;

  const apply = useCallback((): DraftWindowPatch | null => {
    const now = latest.current;
    if (now.scope === null || state.kind !== "proposal") return null;
    const result = suggestionToDraftPatch(state.suggestion, now.draft);
    if (result.state !== "patch") return null;
    const scopeAtApply = now.scope;
    /* The first apply fixes what reset returns to; a second apply does not move it. */
    setBaseline((previous) => (previous?.scope === scopeAtApply ? previous : { scope: scopeAtApply, before: preApplyOf(now.draft) }));
    return result.patch;
  }, [state]);

  const reset = useCallback((): DraftWindowPatch | null => {
    const now = latest.current;
    if (baseline === null || baseline.scope !== now.scope) return null;
    const patch = resetPatchOf(baseline.before, now.draft);
    setBaseline(null);
    return patch;
  }, [baseline]);

  const dismiss = useCallback(() => setAnswer(null), []);

  return { state, proposal, canReset: baseline !== null && baseline.scope === scope, suggest, apply, reset, dismiss };
}
