/**
 * DR-02 · one renderer for the one bound-warning definition.
 *
 * Search S06 and Freeze S07 both draw `bound_warning` through this component,
 * so the same server state reads with the same words on both screens. The
 * browser classifies nothing: state, side and reason come from the server's
 * `research.bound-warning.v1`; this file only chooses words and a tone.
 *
 * The copy never says "not an optimum" and never asks for a widen before a
 * deploy — the guide's safe copy (§9.4) is the tooltip, verbatim.
 */

export interface BoundWarningValue {
  definition_id: "research.bound-warning.v1";
  copy_version: "research.bound-warning-copy.v1";
  reference_space: "DECLARED_RANGE";
  state: "AT_BOUND" | "NEAR_BOUND" | "INTERIOR" | "NOT_APPLICABLE";
  side: "LOWER" | "UPPER" | null;
  reason_code: string | null;
}

/** Guide §9.4 safe copy, verbatim — the whole meaning of a warning. */
export const BOUND_WARNING_COPY =
  "Selected value is near a configured boundary; review sensitivity and declared bounds.";

const WORDS: Record<BoundWarningValue["state"], string> = {
  AT_BOUND: "at bound",
  NEAR_BOUND: "near bound",
  INTERIOR: "interior",
  NOT_APPLICABLE: "no position",
};

const REASON_WORDS: Record<string, string> = {
  BOUND_WARNING_ZERO_WIDTH_RANGE: "the declared range has zero width",
  BOUND_WARNING_CATEGORICAL_PARAMETER: "a categorical value has no position in a range",
  BOUND_WARNING_DECLARED_RANGE_NOT_PUBLISHED: "no declared range was published",
  BOUND_WARNING_VALUE_OUTSIDE_DECLARED_RANGE: "the value lies outside its declaration",
  BOUND_WARNING_VALUE_NOT_EXACT_DECIMAL: "the value is not an exact decimal",
  BOUND_WARNING_DECLARED_RANGE_INVERTED: "the declared range is inverted",
};

/** The words a reader sees, e.g. `near upper bound`. */
export function boundWarningWords(warning: BoundWarningValue): string {
  if ((warning.state === "AT_BOUND" || warning.state === "NEAR_BOUND") && warning.side) {
    return `${warning.state === "AT_BOUND" ? "at" : "near"} ${warning.side.toLowerCase()} bound`;
  }
  return WORDS[warning.state];
}

export function boundWarningTitle(warning: BoundWarningValue, positionPercent?: number): string {
  const where = positionPercent === undefined ? "" : `${positionPercent}% of the declared range · `;
  if (warning.state === "AT_BOUND" || warning.state === "NEAR_BOUND") {
    return `${where}${BOUND_WARNING_COPY} (${warning.definition_id}: ≤6% / ≥94% at bound, ≤18% / ≥82% near)`;
  }
  if (warning.state === "NOT_APPLICABLE") {
    return `${where}${REASON_WORDS[warning.reason_code ?? ""] ?? warning.reason_code ?? "not applicable"} (${warning.definition_id})`;
  }
  return `${where}inside the declared range, away from both bounds (${warning.definition_id})`;
}

/**
 * The note cell. `positionPercent` is the server's placement; it is printed,
 * never used to decide anything.
 */
export function BoundWarningNote({
  warning,
  positionPercent,
  className = "",
}: {
  /** Absent from a server that predates DR-02: the placement alone is printed, never a guessed warning. */
  warning: BoundWarningValue | null | undefined;
  positionPercent?: number;
  className?: string;
}) {
  if (!warning) {
    return (
      <span
        className={`mono ${className}`}
        style={{ color: "var(--ink-faint)" }}
        title="this server publishes no bound warning (research.bound-warning.v1); only the placement is shown"
        data-bound-warning="NOT_PUBLISHED"
      >
        {positionPercent === undefined ? "" : `${positionPercent}% · `}warning not published
      </span>
    );
  }
  const flagged = warning.state === "AT_BOUND" || warning.state === "NEAR_BOUND";
  return (
    <span
      className={`mono ${className}`}
      style={{ color: warning.state === "AT_BOUND" ? "var(--bad)" : flagged ? "var(--warn)" : "var(--ink-faint)" }}
      title={boundWarningTitle(warning, positionPercent)}
      data-bound-warning={warning.state}
      data-bound-side={warning.side ?? ""}
      data-bound-definition={warning.definition_id}
    >
      {positionPercent === undefined ? "" : `${positionPercent}% · `}
      {boundWarningWords(warning)}
    </span>
  );
}
