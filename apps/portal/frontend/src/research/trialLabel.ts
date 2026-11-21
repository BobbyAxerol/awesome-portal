/**
 * W1 §1.5 — the one trial label. Prints what the SAME read served and never
 * computes one number from the other (no `+1` in the browser).
 */

export interface TrialLabelInput {
  ordinal?: number | string | null;
  sourceId?: number | string | null;
}

function served(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

/** `trial 351 · source 350` | `trial 351` | `source 350` | `null` (caller shows a typed absence). */
export function trialLabel(t: TrialLabelInput): string | null {
  const ordinal = served(t.ordinal);
  const source = served(t.sourceId);
  if (ordinal !== null && source !== null) return `trial ${ordinal} · source ${source}`;
  if (ordinal !== null) return `trial ${ordinal}`;
  if (source !== null) return `source ${source}`;
  return null;
}

export const trialTitle = "trial = display ordinal across studies; source = the source's own zero-based trial id";
