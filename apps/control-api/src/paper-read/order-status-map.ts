/**
 * P4-F (finding F11) — the one versioned source→canonical order-status map.
 *
 * Shared by the paper-read consumer (row normalization + provenance) and the
 * local projection filter (so a canonical query word matches the raw source
 * word before normalization). One map, one version; extending it is a
 * reviewed contract change, never an inline special case.
 */
export const ORDER_STATUS_MAP_VERSION = "order-status-map.v1";

export const CANONICAL_ORDER_STATUSES = new Set([
  "INITIALIZED", "SUBMITTED", "ACCEPTED", "REJECTED", "DENIED", "PENDING_UPDATE",
  "PENDING_CANCEL", "PARTIALLY_FILLED", "FILLED", "CANCELED", "EXPIRED", "TRIGGERED",
]);

export const ORDER_STATUS_SOURCE_MAP: Readonly<Record<string, string>> = {
  RISK_REJECTED: "REJECTED",
};

/** Canonical word for a source word; null when the word is genuinely unknown. */
export function canonicalOrderStatus(word: string): string | null {
  if (CANONICAL_ORDER_STATUSES.has(word)) return word;
  return ORDER_STATUS_SOURCE_MAP[word] ?? null;
}
