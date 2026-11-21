/**
 * Screen 02 · the declaration is autosaved (U15, extended).
 *
 * The draft is written to `sessionStorage` on every edit and kept until the run is created or the reader starts over,
 * so a reload, the browser Back button or any link out of the wizard and back brings the declaration back. Every storage
 * access is guarded: private windows, blocked site data and previews throw or answer null, and the form must render the
 * same without it. A link that owns the declaration (`?from=`, `?fork=`, another `?av=`) never restores an older draft
 * over it.
 */

import { type RunDraft, type StepId, STEPS, draftIsEmpty, firstIncompleteStep, stepsDone } from "./runDraft";

export const RUN_DRAFT_STORAGE_KEY = "research.quantbt.new-run.draft.v1";
export const SCOPED_RUN_DRAFT_STORAGE_PREFIX = "research.quantbt.new-run.draft.v2";
export interface RunDraftScope { actorId: string; workspaceId: string }

/** Missing named auth/workspace facts disable persistence; never infer a default. */
export function runDraftScope(actorId?: string | null, workspaceId?: string | null): RunDraftScope | null {
  return typeof actorId === "string" && actorId.trim() !== "" && typeof workspaceId === "string" && workspaceId.trim() !== ""
    ? { actorId, workspaceId } : null;
}

export function runDraftStorageKey(scope?: RunDraftScope | null): string | null {
  return scope && runDraftScope(scope.actorId, scope.workspaceId)
    ? `${SCOPED_RUN_DRAFT_STORAGE_PREFIX}:${encodeURIComponent(JSON.stringify([scope.actorId, scope.workspaceId]))}` : null;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveRunDraft(draft: RunDraft, scope?: RunDraftScope | null): void {
  const key = runDraftStorageKey(scope);
  if (key === null) return;
  try {
    store()?.setItem(key, JSON.stringify({ version: 2, actor_id: scope!.actorId, workspace_id: scope!.workspaceId, draft }));
  } catch {
    /* quota or blocked storage: the form works without it */
  }
}

export function clearRunDraft(scope?: RunDraftScope | null): void {
  const key = runDraftStorageKey(scope);
  if (key === null) return;
  try {
    store()?.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStored(scope?: RunDraftScope | null): Record<string, unknown> | null {
  const key = runDraftStorageKey(scope);
  if (key === null) return null;
  let parsed: unknown;
  try {
    const raw = store()?.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 2 || parsed.actor_id !== scope!.actorId || parsed.workspace_id !== scope!.workspaceId || !isRecord(parsed.draft)) return null;
  const draft = parsed.draft;
  if (!isRecord(draft.windows) || !isRecord(draft.walkForward) || !Array.isArray(draft.parameters)) return null;
  return draft;
}

/**
 * The stored declaration laid over `base`, or null when nothing usable is stored or the address owns the
 * declaration. Only the shapes the form reads are checked; an unreadable value is dropped, never repaired.
 */
export function restoreRunDraft(base: RunDraft, search: string, scope?: RunDraftScope | null): RunDraft | null {
  const query = new URLSearchParams(search);
  if (query.get("from") || query.get("fork")) return null;
  const parsed = readStored(scope);
  if (parsed === null) return null;
  const version = query.get("av");
  if (version && parsed.alphaVersionId !== version) return null;
  return { ...base, ...(parsed as Partial<RunDraft>) };
}

/** What the Run Library's "Continue draft" chip needs: how far the saved declaration is, and where it resumes. */
export interface DraftSummary {
  /** Steps filled in soundly (Review is never one), of `total`. */
  stepsDone: number;
  total: number;
  /** The step the draft resumes on: the first one still to fill in. */
  step: StepId;
  /** The 1-based position of `step` among the wizard's steps. */
  stepNumber: number;
}

/**
 * The saved draft in two numbers, or null when none is saved or it is still empty. A pure read of `sessionStorage`:
 * it never writes and never asks the server, so a list screen can call it on every render.
 */
export function readDraftSummary(scope?: RunDraftScope | null): DraftSummary | null {
  const stored = readStored(scope);
  if (stored === null) return null;
  /* A stored shape from an older build may lack a field: it is laid over blanks, and one that still cannot be read is no draft. */
  const blank = { alphaVersionId: "", datasetId: "", symbol: "", timeframe: "", optunaTrials: "", earlyStopping: "", randomSeed: "", optimizationMode: "", optimizationSchedule: "", strategyId: "", alphaId: "", bound: true, protocol: "three_window_decay" };
  try {
    const draft = { ...blank, ...stored } as unknown as RunDraft;
    if (draftIsEmpty(draft)) return null;
    const step = firstIncompleteStep(draft);
    return {
      stepsDone: stepsDone(draft).size,
      total: STEPS.length - 1,
      step,
      stepNumber: STEPS.findIndex((candidate) => candidate.id === step) + 1,
    };
  } catch {
    return null;
  }
}
