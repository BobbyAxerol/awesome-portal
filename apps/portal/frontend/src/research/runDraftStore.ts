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

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveRunDraft(draft: RunDraft): void {
  try {
    store()?.setItem(RUN_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota or blocked storage: the form works without it */
  }
}

export function clearRunDraft(): void {
  try {
    store()?.removeItem(RUN_DRAFT_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStored(): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    const raw = store()?.getItem(RUN_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.windows) || !isRecord(parsed.walkForward) || !Array.isArray(parsed.parameters)) return null;
  return parsed;
}

/**
 * The stored declaration laid over `base`, or null when nothing usable is stored or the address owns the
 * declaration. Only the shapes the form reads are checked; an unreadable value is dropped, never repaired.
 */
export function restoreRunDraft(base: RunDraft, search: string): RunDraft | null {
  const query = new URLSearchParams(search);
  if (query.get("from") || query.get("fork")) return null;
  const parsed = readStored();
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
export function readDraftSummary(): DraftSummary | null {
  const stored = readStored();
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
