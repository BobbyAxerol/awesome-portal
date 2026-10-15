import { createHash } from "crypto";
import type { EvidenceRecord } from "./governance.repository";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Byte-identical to the original R1 manifest hash; usable inside transactions. */
export function computeEvidenceManifestHash(evidence: readonly EvidenceRecord[]): string {
  const value = [...evidence]
    .sort((left, right) => left.ordinal - right.ordinal || left.evidenceId.localeCompare(right.evidenceId))
    .map((item) => ({ evidence_id: item.evidenceId, sha256: item.sha256,
      schema_version: item.schemaVersion, source_authority: item.sourceAuthority,
      captured_at: item.capturedAt.toISOString() }));
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}
