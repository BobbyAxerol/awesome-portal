import { describe, expect, it } from "vitest";
import { finalAuditTargetApplicable } from "../src/research/final-audit.contract";

describe("§32 server-owned linked-audit target applicability", () => {
  it("never treats absent/unpublished/prose as audit authority", () => {
    for (const value of [undefined, null, [], "ISSUED", {}, { audit_target_kind: "NOT_PUBLISHED" }]) {
      expect(finalAuditTargetApplicable(value)).toBeNull();
    }
  });
  it("uses only the existing typed target, not the claim or optimizer prose", () => {
    expect(finalAuditTargetApplicable({ audit_target_kind: "SINGLE_PARAMETER_SET" })).toBe(true);
    expect(finalAuditTargetApplicable({ audit_target_kind: "FIXED_PARAMETER_PROFILE", claim: "ISSUED" })).toBe(false);
    expect(finalAuditTargetApplicable({ audit_target_kind: "PER_FOLD_PARAMETER_SELECTIONS" })).toBe(false);
  });
});
