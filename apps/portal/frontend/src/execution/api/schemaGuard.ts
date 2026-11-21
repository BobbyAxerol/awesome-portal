/**
 * The V1 readers' guard against a V2 body on the same route.
 *
 * With the workspace in SCOPED_V2 the server answers the V2 body on the SAME
 * routes the V1 readers were written for (`/governance/approvals/{id}/r2`,
 * `/governance/exit-reviews/{id}`, `/live`, certification, canary, live-full,
 * staged activation). A V1 reader is tolerant on purpose (it reads
 * `data ?? body`, defaults a missing flag to the fail-closed value), so given a
 * V2 body it does not fail: it answers a V1-shaped object that is wrong
 * ("no R1 lineage", `capital: []`, three side-effect flags `true`). Misreading
 * is worse than refusing, so every V1 reader asks this guard first and, on a
 * refusal, answers its existing "unreadable" result (`null`).
 *
 * The guard refuses when:
 * - `schema_version` (top level, or inside a V1 `data` envelope) is a string
 *   that is not a `.v1` version: the body says it is another generation;
 * - a V2-only marker (`provenance_basis`, `field_contract_revision`) sits at
 *   the top level under a V1 `schema_version` or none: a V2 body wearing a V1
 *   label is the same misread, one step removed.
 *
 * It accepts everything else, so a V1 body (with or without a
 * `schema_version`) is read exactly as before.
 *
 * The reason is typed and names the version, for the one place that has to
 * tell the reader why a body was not read (`refusalReason`).
 */

export type V1RefusalCode = "SCHEMA_VERSION_NOT_V1" | "V2_MARKERS_UNDER_V1_VERSION";

export interface V1Refusal {
  code: V1RefusalCode;
  /** The `schema_version` the body carried; `null` when it carried none (markers only). */
  schemaVersion: string | null;
}

const V1_VERSION = /\.v1$/;
const V2_MARKER_KEYS = ["provenance_basis", "field_contract_revision"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** The `schema_version` of a body, or `null` when it has none that is a string. */
export function schemaVersionOf(raw: unknown): string | null {
  const body = record(raw);
  return typeof body?.schema_version === "string" ? body.schema_version : null;
}

/** `null` when a V1 reader may read this body; otherwise the typed reason it must not. */
export function v1Refusal(raw: unknown): V1Refusal | null {
  const body = record(raw);
  if (body === null) return null;
  const top = body.schema_version;
  if (top !== undefined && (typeof top !== "string" || !V1_VERSION.test(top))) {
    return { code: "SCHEMA_VERSION_NOT_V1", schemaVersion: typeof top === "string" ? top : null };
  }
  const inner = record(body.data)?.schema_version;
  if (inner !== undefined && (typeof inner !== "string" || !V1_VERSION.test(inner))) {
    return { code: "SCHEMA_VERSION_NOT_V1", schemaVersion: typeof inner === "string" ? inner : null };
  }
  if (V2_MARKER_KEYS.some((key) => key in body)) {
    return { code: "V2_MARKERS_UNDER_V1_VERSION", schemaVersion: typeof top === "string" ? top : null };
  }
  return null;
}

/**
 * The sentence for a V1 reader's "could not be read" when the body was refused
 * for its version, or `fallback` when the refusal is not the cause.
 */
export function refusalReason(raw: unknown, fallback: string): string {
  const refusal = v1Refusal(raw);
  if (refusal === null) return fallback;
  const named = refusal.schemaVersion === null ? "a V2 shape" : `schema_version "${refusal.schemaVersion}"`;
  return `${fallback.replace(/\.$/, "")}: the body carries ${named}, which the V1 reader does not read (${refusal.code}).`;
}
