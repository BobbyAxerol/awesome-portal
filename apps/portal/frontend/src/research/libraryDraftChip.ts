/*
 * The Run Library's "Continue draft · step N" chip reads the New Run draft
 * through this one function (sessionStorage only; never throws).
 */
import { readDraftSummary, type RunDraftScope } from "./runDraftStore";

export interface LibraryDraftSummary {
  /** 1-based wizard step the saved draft stopped on. */
  step: number;
}

export function readLibraryDraftSummary(scope?: RunDraftScope | null): LibraryDraftSummary | null {
  const summary = readDraftSummary(scope);
  return summary === null ? null : { step: summary.stepNumber };
}
