/**
 * DR-02 · the one Research bound-warning definition (Search S06 + Freeze S07).
 *
 * Owner decision (Claude, delegated by Bobby 2026-09-25): the two screens
 * share ONE relative definition instead of two diagnostics under one label.
 *
 *  - reference space: the DECLARED numeric range the run was bound to (the
 *    alpha/profile declaration looked up by the run's exact adapter digest),
 *    never a run-narrowed range and never a browser guess;
 *  - position: p = (value - minimum) / (maximum - minimum), exact decimal;
 *  - AT_BOUND   when p <= 6%  or p >= 94% (inclusive);
 *  - NEAR_BOUND when p <= 18% or p >= 82% (inclusive) and not AT_BOUND;
 *  - INTERIOR   otherwise;
 *  - NOT_APPLICABLE with a typed reason for zero-width/pinned ranges,
 *    categorical/boolean parameters, or a value outside its declaration.
 *
 * The thresholds are the Search spec's (06 §A1: ≤6%/≥94%, near 18%/82%);
 * the Freeze hi-fi's "≤ one step, near 12%/88%" is retired, not kept as a
 * second diagnostic under the same words. The copy is the guide's safe copy
 * (§9.4): it states a position, never "not an optimum", and it is not a gate.
 *
 * Arithmetic is exact: decimals are scaled to one BigInt denominator, so an
 * inclusive 6% boundary is never lost to binary floating point.
 */

import { z } from "zod";

export const BOUND_WARNING_DEFINITION_ID = "research.bound-warning.v1" as const;
export const BOUND_WARNING_COPY_VERSION = "research.bound-warning-copy.v1" as const;

/** Percent thresholds, inclusive, on the declared reference space. */
export const BOUND_WARNING_THRESHOLDS = Object.freeze({ at_bound_percent: 6, near_bound_percent: 18 });

export const BoundWarningSchema = z.object({
  definition_id: z.literal(BOUND_WARNING_DEFINITION_ID),
  copy_version: z.literal(BOUND_WARNING_COPY_VERSION),
  reference_space: z.literal("DECLARED_RANGE"),
  state: z.enum(["AT_BOUND", "NEAR_BOUND", "INTERIOR", "NOT_APPLICABLE"]),
  side: z.enum(["LOWER", "UPPER"]).nullable(),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
}).strict();

export type BoundWarning = z.infer<typeof BoundWarningSchema>;

const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function parse(value: string): { units: bigint; scale: number } | null {
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (fraction.length > 18) return null;
  const units = BigInt(`${match[2]}${fraction}` || "0") * (match[1] === "-" ? -1n : 1n);
  return { units, scale: fraction.length };
}

function scaled(value: { units: bigint; scale: number }, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function warning(
  state: BoundWarning["state"],
  side: BoundWarning["side"],
  reasonCode: string | null,
): BoundWarning {
  return {
    definition_id: BOUND_WARNING_DEFINITION_ID,
    copy_version: BOUND_WARNING_COPY_VERSION,
    reference_space: "DECLARED_RANGE",
    state,
    side,
    reason_code: reasonCode,
  };
}

/**
 * Classify one parameter against its declared range.
 *
 * `kind` other than NUMERIC (categorical/boolean) is never given a synthetic
 * ordinal position: it answers NOT_APPLICABLE with its reason.
 */
export function boundWarning(input: {
  kind: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  value: string;
  minimum: string | null;
  maximum: string | null;
}): BoundWarning {
  if (input.kind !== "NUMERIC") return warning("NOT_APPLICABLE", null, "BOUND_WARNING_CATEGORICAL_PARAMETER");
  if (input.minimum === null || input.maximum === null) {
    return warning("NOT_APPLICABLE", null, "BOUND_WARNING_DECLARED_RANGE_NOT_PUBLISHED");
  }
  const value = parse(input.value);
  const minimum = parse(input.minimum);
  const maximum = parse(input.maximum);
  if (!value || !minimum || !maximum) return warning("NOT_APPLICABLE", null, "BOUND_WARNING_VALUE_NOT_EXACT_DECIMAL");
  const scale = Math.max(value.scale, minimum.scale, maximum.scale);
  const v = scaled(value, scale);
  const lo = scaled(minimum, scale);
  const hi = scaled(maximum, scale);
  if (hi === lo) return warning("NOT_APPLICABLE", null, "BOUND_WARNING_ZERO_WIDTH_RANGE");
  if (hi < lo) return warning("NOT_APPLICABLE", null, "BOUND_WARNING_DECLARED_RANGE_INVERTED");
  if (v < lo || v > hi) return warning("NOT_APPLICABLE", null, "BOUND_WARNING_VALUE_OUTSIDE_DECLARED_RANGE");
  const span = hi - lo;
  const fromLower = (v - lo) * 100n;
  const fromUpper = (hi - v) * 100n;
  const at = BigInt(BOUND_WARNING_THRESHOLDS.at_bound_percent) * span;
  const near = BigInt(BOUND_WARNING_THRESHOLDS.near_bound_percent) * span;
  const side: BoundWarning["side"] = fromLower <= fromUpper ? "LOWER" : "UPPER";
  const distance = side === "LOWER" ? fromLower : fromUpper;
  if (distance <= at) return warning("AT_BOUND", side, null);
  if (distance <= near) return warning("NEAR_BOUND", side, null);
  return warning("INTERIOR", null, null);
}

/** Display placement of a value in its declared range, rounded to 0.01 %. */
export function positionPercent(value: string, minimum: string, maximum: string): number | null {
  const v = parse(value);
  const lo = parse(minimum);
  const hi = parse(maximum);
  if (!v || !lo || !hi) return null;
  const scale = Math.max(v.scale, lo.scale, hi.scale);
  const span = scaled(hi, scale) - scaled(lo, scale);
  if (span <= 0n) return null;
  const offset = scaled(v, scale) - scaled(lo, scale);
  if (offset < 0n || offset > span) return null;
  // Round half up to basis points of a percent: exact until the final division.
  const basisPoints = (offset * 10_000n * 2n + span) / (span * 2n);
  return Number(basisPoints) / 100;
}
