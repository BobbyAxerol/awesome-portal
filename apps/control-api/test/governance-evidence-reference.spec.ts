import { describe, expect, it } from "vitest";
import { checklistEvidenceReference } from "../src/governance/evidence-reference";
import { R1EvidenceReferenceFieldsSchema } from "../src/governance/contracts";
import type { EvidenceRecord } from "../src/governance/governance.repository";

const hash = `sha256:${"a".repeat(64)}`;
const entry = (overrides: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  evidenceId: "ev_1", ordinal: 0, kind: "ALPHA_ARTIFACT", label: "Report S09",
  displayValue: "Do not parse this into a source", note: null, verification: "SERVER_PINNED",
  artifactId: "artifact_1", sha256: hash, sizeBytes: "42", mediaType: "application/json",
  schemaVersion: "quant.run-artifact.v1", sourceAuthority: "RESEARCH", sourceReference: "run_5512",
  required: true, capturedAt: new Date("2026-10-11T00:00:00Z"),
  retentionClass: "GOVERNANCE_LONG_TERM", accessPolicy: "WORKSPACE_APPROVER", ...overrides,
});

describe("§56 R1 immutable source references", () => {
  it("links a hash-bound run, never upgrades a label mentioning Report into REPORT", () => {
    expect(checklistEvidenceReference([hash], [entry()])).toEqual({
      evidence_ref: { kind: "RUN", id: "run_5512", run_id: "run_5512" }, evidence_ref_reason: null,
    });
  });
  it.each(["REPORT", "FREEZE", "AUDIT"] as const)("preserves explicit %s artifact identity and run navigation", (kind) => {
    expect(checklistEvidenceReference([hash], [entry({ kind })])).toEqual({
      evidence_ref: { kind, id: "artifact_1", run_id: "run_5512" }, evidence_ref_reason: null,
    });
  });
  it("distinguishes unrecorded and missing manifest hashes", () => {
    expect(checklistEvidenceReference([], [entry()]).evidence_ref_reason).toBe("R1_FINDING_SOURCE_NOT_RECORDED");
    expect(checklistEvidenceReference([`sha256:${"b".repeat(64)}`], [entry()]).evidence_ref_reason)
      .toBe("R1_FINDING_EVIDENCE_NOT_IN_MANIFEST");
  });
  it.each([
    { sourceAuthority: "EXECUTION_CELL" }, { sourceReference: "../secret" },
    { sourceReference: null }, { kind: "DATASET_MANIFEST" }, { kind: "REPORT", artifactId: null },
  ])("does not manufacture an href for an unsupported source %j", (override) => {
    expect(checklistEvidenceReference([hash], [entry(override)])).toEqual({
      evidence_ref: null, evidence_ref_reason: "R1_EVIDENCE_SOURCE_NOT_LINKABLE",
    });
  });
  it("rejects ambiguous sources sharing a hash, deduplicates the same real pointer", () => {
    expect(checklistEvidenceReference([hash], [entry(), entry({ sourceReference: "run_2" })]).evidence_ref_reason)
      .toBe("R1_FINDING_MULTIPLE_EVIDENCE_SOURCES");
    expect(checklistEvidenceReference([hash, hash], [entry(), entry()]).evidence_ref?.run_id).toBe("run_5512");
  });
  it("keeps null and reason paired in the runtime contract", () => {
    expect(R1EvidenceReferenceFieldsSchema.safeParse({ evidence_ref: null, evidence_ref_reason: null }).success).toBe(false);
    expect(R1EvidenceReferenceFieldsSchema.safeParse({
      evidence_ref: { kind: "RUN", id: "run_1", run_id: "run_1" },
      evidence_ref_reason: "R1_FINDING_SOURCE_NOT_RECORDED",
    }).success).toBe(false);
  });
});
