import { R1EvidenceReferenceFieldsSchema, type R1EvidenceReferenceFields } from "./contracts";
import type { EvidenceRecord } from "./governance.repository";

/** Resolve only explicit, hash-bound Research sources in an already verified manifest. */
export function checklistEvidenceReference(
  basisHashes: readonly string[], evidence: readonly EvidenceRecord[],
): R1EvidenceReferenceFields {
  const absent = (reason: NonNullable<R1EvidenceReferenceFields["evidence_ref_reason"]>) =>
    R1EvidenceReferenceFieldsSchema.parse({ evidence_ref: null, evidence_ref_reason: reason });
  const hashes = [...new Set(basisHashes)];
  if (!hashes.length) return absent("R1_FINDING_SOURCE_NOT_RECORDED");
  const matches = hashes.flatMap((hash) => evidence.filter((entry) => entry.sha256 === hash));
  if (hashes.some((hash) => !matches.some((entry) => entry.sha256 === hash))) {
    return absent("R1_FINDING_EVIDENCE_NOT_IN_MANIFEST");
  }
  // Explicit kind taxonomy only: labels, display values and notes are not identity.
  const kinds = {
    ALPHA_ARTIFACT: "RUN", RUN: "RUN", REPORT: "REPORT", REPORT_ARTIFACT: "REPORT",
    FREEZE: "FREEZE", FREEZE_ARTIFACT: "FREEZE", AUDIT: "AUDIT", FINAL_AUDIT: "AUDIT",
  } as const;
  const refs = matches.map((entry) => {
    const kind = kinds[entry.kind as keyof typeof kinds];
    if (entry.sourceAuthority !== "RESEARCH" || !kind) return null;
    const parsed = R1EvidenceReferenceFieldsSchema.safeParse({
      evidence_ref: {
        kind, id: kind === "RUN" ? entry.sourceReference : entry.artifactId,
        run_id: entry.sourceReference,
      }, evidence_ref_reason: null,
    });
    return parsed.success ? parsed.data : null;
  });
  if (refs.some((ref) => ref === null)) return absent("R1_EVIDENCE_SOURCE_NOT_LINKABLE");
  const unique = new Map(refs.map((ref) => [JSON.stringify(ref!.evidence_ref), ref!]));
  if (unique.size !== 1) return absent("R1_FINDING_MULTIPLE_EVIDENCE_SOURCES");
  return [...unique.values()][0];
}
