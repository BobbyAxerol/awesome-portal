/** Availability of a derived comparison over the *entire authorized balance
 * set* in one qualified snapshot. It never means a missing source is zero. */
export function accountComparisonAvailability(qualified: boolean, balanceCount: number, comparedCount: number) {
  if (!qualified || balanceCount === 0) return {
    state: "UNAVAILABLE" as const, reason_code: "ACCOUNT_COMPARISON_INPUTS_NOT_QUALIFIED" as const,
  };
  if (comparedCount === balanceCount) return { state: "AVAILABLE" as const, reason_code: null };
  if (comparedCount > 0) return { state: "PARTIAL" as const, reason_code: "ACCOUNT_COMPARISON_INCOMPLETE" as const };
  return { state: "UNAVAILABLE" as const, reason_code: "ACCOUNT_COMPARISON_INCOMPLETE" as const };
}

/** Money must arrive as decimal text, or as an exactly representable integer.
 * A JSON fractional number (or an unsafe integer) may already have lost
 * precision before this reader sees it; converting it to text cannot fix it. */
export function exactFinancialDecimal(value: unknown): string | null {
  const raw = typeof value === "string" ? value
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null;
  return raw !== null && raw.length <= 128 && /^-?\d+(?:\.\d+)?$/.test(raw) ? raw : null;
}
