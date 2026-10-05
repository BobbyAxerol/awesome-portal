/**
 * Screen 02 · the run setup the current Portal executor offers for this exact context (S02 linked-window setup).
 *
 * One GET when the Alpha / version / workspace / dataset / symbol / timeframe context changes: not on mount
 * without a full context, not per keystroke (a typed symbol settles first), the previous request aborted.
 * The answer belongs to the exact context it was asked for AND to a revision the server has not since called
 * obsolete: an answer for another context, or one whose `source_revision` a 409 has retired, never shows.
 *
 * It is configuration facts, never run authorization. The engine catalogue (Atlas) stays a separate list;
 * this one is only what is runnable for the chosen Alpha, with the typed reason of every disabled profile.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ProfilePins,
  type ProfileTemporalGuards,
} from "./dataDeclarationV2";
import { getRunSetupOptions, type SetupOptions, type SetupOptionsResult, type SetupProfile, type SetupQuery } from "./setupClient";
import type { RunDraft } from "./runDraft";

/** Wait this long after the context last changed before asking (a symbol being typed is not a context yet). */
export const RUN_SETUP_SETTLE_MS = 300;

/** The setup context of a draft, or null until every part exists (a bound Alpha version, dataset, symbol, timeframe). */
export function setupContextFrom(
  draft: Pick<RunDraft, "bound" | "alphaId" | "alphaVersionId" | "datasetId" | "symbol" | "timeframe">,
  workspaceId?: string,
): SetupQuery | null {
  const alphaId = draft.alphaId.trim();
  const alphaVersionId = draft.alphaVersionId.trim();
  const datasetId = draft.datasetId.trim();
  const symbol = draft.symbol.trim().toUpperCase();
  const timeframe = draft.timeframe.trim();
  if (!draft.bound || alphaId === "" || alphaVersionId === "" || datasetId === "" || symbol === "" || timeframe === "") return null;
  return { ...(workspaceId ? { workspaceId } : {}), alphaId, alphaVersionId, datasetId, symbol, timeframe };
}

/** The exact identity of a context; two queries with the same key are the same question. */
export function setupContextKey(query: SetupQuery): string {
  return JSON.stringify([query.workspaceId ?? "", query.alphaId, query.alphaVersionId, query.datasetId, query.symbol, query.timeframe]);
}

/** Whether a served body answers this context (workspace only when one was asked for: the body always names its own). */
export function answersContext(options: SetupOptions, query: SetupQuery): boolean {
  const context = options.context;
  return (
    context.alpha_id === query.alphaId
    && context.alpha_version_id === query.alphaVersionId
    && context.dataset_id === query.datasetId
    && context.symbol === query.symbol
    && context.timeframe === query.timeframe
    && (query.workspaceId === undefined || context.workspace_id === query.workspaceId)
  );
}

export type RunSetupStatus = "idle" | "pending" | "served" | "absent" | "error";

export type RunSetupFailure = "refused" | "client-error" | "server-error" | "network" | "obsolete-revision" | "other-context";

export interface RunSetupError {
  failure: RunSetupFailure;
  status: number | null;
  code: string | null;
  requestId: string | null;
}

export interface RunSetupState {
  status: RunSetupStatus;
  /** The served options, or null in every other state. */
  options: SetupOptions | null;
  error: RunSetupError | null;
  /** Asks again for the context on screen (the retry of an error state). */
  retry: () => void;
  /** A 409 said this revision is obsolete: it is never shown again and the context is read once more. */
  invalidate: (revision: string) => void;
}

type Answer = { key: string; attempt: number; result: SetupOptionsResult };

export function useRunSetup(
  query: SetupQuery | null,
  get: (query: SetupQuery, signal?: AbortSignal) => Promise<SetupOptionsResult> = getRunSetupOptions,
  settleMs: number = RUN_SETUP_SETTLE_MS,
): RunSetupState {
  const key = query === null ? null : setupContextKey(query);
  const latest = useRef(query);
  latest.current = query;
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  /* Revisions a 409 retired, per context key: an answer carrying one never shows. */
  const [obsolete, setObsolete] = useState<{ key: string; revisions: readonly string[] } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const asked = latest.current;
      if (asked === null) return;
      get(asked, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setAnswer({ key, attempt, result });
        },
        () => {
          /* An abort is the previous request being replaced: it says nothing. */
        },
      );
    }, settleMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` and `attempt` capture every input of the request; the query object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const invalidate = useCallback(
    (revision: string) => {
      if (key === null) return;
      setObsolete((previous) => {
        const revisions = previous?.key === key ? previous.revisions : [];
        return revisions.includes(revision) ? previous : { key, revisions: [...revisions, revision] };
      });
      setAttempt((n) => n + 1);
    },
    [key],
  );

  return useMemo((): RunSetupState => {
    const base = { retry, invalidate };
    if (key === null || query === null) return { status: "idle", options: null, error: null, ...base };
    if (answer === null || answer.key !== key || answer.attempt !== attempt) return { status: "pending", options: null, error: null, ...base };
    const result = answer.result;
    switch (result.state) {
      case "served": {
        const retired = obsolete?.key === key && obsolete.revisions.includes(result.body.source_revision);
        if (retired) return { status: "error", options: null, error: { failure: "obsolete-revision", status: null, code: null, requestId: null }, ...base };
        if (!answersContext(result.body, query)) return { status: "error", options: null, error: { failure: "other-context", status: null, code: null, requestId: null }, ...base };
        return { status: "served", options: result.body, error: null, ...base };
      }
      case "absent":
        return { status: "absent", options: null, error: null, ...base };
      case "network":
        return { status: "error", options: null, error: { failure: "network", status: null, code: null, requestId: null }, ...base };
      case "refused":
        return { status: "error", options: null, error: { failure: "refused", status: result.status, code: result.code, requestId: result.requestId }, ...base };
      case "stale-options":
        return { status: "error", options: null, error: { failure: "obsolete-revision", status: 409, code: result.code, requestId: result.requestId }, ...base };
      default:
        return { status: "error", options: null, error: { failure: result.state, status: result.status, code: result.code, requestId: result.requestId }, ...base };
    }
  }, [key, query, answer, attempt, obsolete, retry, invalidate]);
}

/* ------------------------------------------------ profiles from the setup */

function nonEmpty(list: readonly string[]): readonly string[] | null {
  return list.length > 0 ? list : null;
}

/**
 * A setup `Profile` as the `ProfilePins` every downstream helper already reads (`admittedFrequencies`,
 * `trialsPinned`, `seedPinned`, `admitsSpecV2`, `selectProfile` …). A disabled profile is kept with its typed
 * `reason_code` as `reason`; the browser never decides a profile is runnable. An empty served list is "none
 * admitted" (`null`), the same as an Atlas profile that serves no list.
 */
export function profilePinsFromSetup(profile: SetupProfile): ProfilePins {
  const seed: ProfilePins["seed"] =
    profile.seed_policy === "LOCKED"
      ? profile.random_seed !== null
        ? { state: "fixed", value: profile.random_seed }
        : { state: "unpinned", value: null }
      : profile.seed_policy === "FORBIDDEN"
        ? { state: "forbidden", value: null }
        : { state: "free", value: null };
  const guards = profile.temporal_guards;
  const temporalGuards: ProfileTemporalGuards = {
    policy: guards.policy,
    defaults: guards.defaults
      ? { labelHorizonBars: guards.defaults.label_horizon_bars, purgeBars: guards.defaults.purge_bars, embargoBars: guards.defaults.embargo_bars }
      : null,
    maxBars: guards.max_bars,
    zeroSemantics: guards.zero_semantics,
  };
  const inner = profile.inner_constraints;
  return {
    profileId: profile.profile_id,
    enabled: profile.state === "ENABLED",
    reason: profile.reason_code,
    protocol: profile.protocol,
    executionRoute: profile.execution_route,
    optimizationMode: profile.optimization_mode,
    trials: { min: profile.trial_count.min, max: profile.trial_count.max, default: profile.trial_default },
    seed,
    folds: profile.fold_bounds ? { ...profile.fold_bounds } : null,
    granularity: null,
    windowMode: null,
    maxSpanDays: profile.max_span_days,
    timeframe: profile.timeframe,
    requestedSpecVersions: nonEmpty(profile.requested_spec_versions),
    frequencies: nonEmpty(profile.frequencies),
    windowModes: nonEmpty(profile.window_modes),
    trialDefault: profile.trial_default,
    earlyStopping: null,
    innerValidation: profile.inner_validation,
    optimizationSchedule: profile.optimization_schedule,
    trialScope: profile.trial_scope,
    maxTotalTrials: profile.max_total_trials,
    innerConstraints: inner
      ? {
          folds: { ...inner.fold_bounds },
          frequencies: inner.frequencies,
          windowModes: inner.window_modes,
          trainWindowPattern: inner.train_window_pattern,
        }
      : null,
    seedRequirement: profile.seed_policy === "REQUIRED" ? "required" : profile.seed_policy === "OPTIONAL" ? "optional" : null,
    allowedPinNames: profile.allowed_pin_names,
    parameterPolicy: profile.parameter_policy,
    temporalGuards,
    independentHoldout: profile.independent_holdout,
  };
}

/** Every served profile, runnable or not, as `ProfilePins` (a disabled one keeps its typed reason). */
export function profilesFromSetup(options: SetupOptions): readonly ProfilePins[] {
  return options.profiles.map(profilePinsFromSetup);
}

/** The profiles the form reads: the setup's when it is served, else the Atlas list (older server, or not read yet). */
export function setupProfilesOr(options: SetupOptions | null, atlasProfiles: readonly ProfilePins[] | null): readonly ProfilePins[] | null {
  return options === null ? atlasProfiles : profilesFromSetup(options);
}

/** What a disabled profile says about itself: its id and the typed reason code, for the catalogue-versus-runnable explanation. */
export function disabledSetupProfiles(options: SetupOptions): readonly { profileId: string; protocol: string; reasonCode: string | null }[] {
  return options.profiles.filter((profile) => profile.state !== "ENABLED").map((profile) => ({ profileId: profile.profile_id, protocol: profile.protocol, reasonCode: profile.reason_code }));
}
