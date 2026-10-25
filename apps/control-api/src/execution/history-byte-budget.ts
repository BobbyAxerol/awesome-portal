/** Safety admission, not a production latency/SLO qualification. A workbench
 * may include its bounded snapshot/analytics as well as full-range extrema.
 * Exact history is already keyset-paged by /execution/history; this composite
 * screen must refuse an oversized representation, never silently return an
 * oldest/newest slice and describe it as the whole retained range. */
export interface PaperHistoryBytePolicy {
  maximum_history_bytes: number;
  maximum_row_bytes: number;
  maximum_response_bytes: number;
}
/** Internal DI override for a measured target. Values are UTF-8 bytes, not
 * rows or compressed transfer bytes; changing them does not certify an SLO. */
export const PAPER_HISTORY_BYTE_POLICY_TOKEN = Symbol("PAPER_HISTORY_BYTE_POLICY");
export const PAPER_HISTORY_BYTE_POLICY: Readonly<PaperHistoryBytePolicy> = Object.freeze({
  maximum_history_bytes: 8 * 1024 * 1024,
  maximum_row_bytes: 256 * 1024,
  maximum_response_bytes: 16 * 1024 * 1024,
});

export interface HistoryByteBudget { maximumBytes: number; maximumRowBytes: number }

export class HistoryByteBudgetError extends Error {
  constructor(readonly code: "N33_HISTORY_ROW_TOO_LARGE" | "N33_HISTORY_RESPONSE_TOO_LARGE") {
    super(code);
  }
}

export function validateHistoryByteBudget(budget: HistoryByteBudget): void {
  if (!Number.isSafeInteger(budget.maximumBytes) || budget.maximumBytes < 1 ||
    !Number.isSafeInteger(budget.maximumRowBytes) || budget.maximumRowBytes < 1 ||
    budget.maximumRowBytes > budget.maximumBytes) throw new Error("HISTORY_BYTE_BUDGET_INVALID");
}

export function validatePaperHistoryBytePolicy(policy: PaperHistoryBytePolicy): void {
  validateHistoryByteBudget({ maximumBytes: policy.maximum_history_bytes, maximumRowBytes: policy.maximum_row_bytes });
  if (!Number.isSafeInteger(policy.maximum_response_bytes) ||
    policy.maximum_response_bytes < policy.maximum_history_bytes) throw new Error("HISTORY_BYTE_BUDGET_INVALID");
}

/** Called on the selected extrema population, not all source rows. PostgreSQL
 * jsonb::text sizes are conservative relative to the compact JSON fields; a
 * separate final-envelope check accounts for all other screen data. */
export function assertHistorySelectionBytes(total: unknown, largest: unknown, budget: HistoryByteBudget): void {
  validateHistoryByteBudget(budget);
  const parse = (value: unknown): bigint => {
    if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("HISTORY_BYTE_CENSUS_INVALID");
    return BigInt(value);
  };
  if (parse(largest) > BigInt(budget.maximumRowBytes)) throw new HistoryByteBudgetError("N33_HISTORY_ROW_TOO_LARGE");
  if (parse(total) > BigInt(budget.maximumBytes)) throw new HistoryByteBudgetError("N33_HISTORY_RESPONSE_TOO_LARGE");
}

export function assertPaperResponseBytes(body: unknown, maximumBytes = PAPER_HISTORY_BYTE_POLICY.maximum_response_bytes): void {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("HISTORY_BYTE_BUDGET_INVALID");
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > maximumBytes)
    throw new HistoryByteBudgetError("N33_HISTORY_RESPONSE_TOO_LARGE");
}
