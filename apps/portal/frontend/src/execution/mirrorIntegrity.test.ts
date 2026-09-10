/**
 * PHASE 2B (round 2) · the sentence a panel is allowed to say.
 *
 * The rule this pins: `0 finding(s)` is only ever said for a measured READY.
 * Every other state has to explain itself, because a zero that nobody measured
 * is indistinguishable from a mirror that is clean.
 */
import { describe, expect, it } from "vitest";
import { mirrorIntegritySentence, readMirrorIntegrity, type MirrorIntegrity } from "./mirrorIntegrity";

const base = {
  schema_version: "execution.durable-mirror-integrity.v1",
  measured_revision: "rev-1", measured_at_ms: 1, read_at_ms: 2, findings: [],
};

describe("mirror integrity reader", () => {
  it("refuses a body that is not the integrity envelope", () => {
    expect(readMirrorIntegrity(null)).toBeNull();
    expect(readMirrorIntegrity({ ...base, schema_version: "something.else.v1" })).toBeNull();
    expect(readMirrorIntegrity({ ...base, state: "SORT_OF_FINE" })).toBeNull();
  });

  it("keeps a missing count null, never zero", () => {
    const read = readMirrorIntegrity({
      ...base, state: "UNAVAILABLE", reason_code: "EDS06_MIRROR_NEVER_MEASURED",
      gap_findings: null, conflict_findings: null, total_findings: null,
    });
    expect(read?.totalFindings).toBeNull();
    expect(read?.gapFindings).toBeNull();
  });

  it("drops a finding it cannot read rather than inventing its fields", () => {
    const read = readMirrorIntegrity({
      ...base, state: "PARTIAL", reason_code: "EDS06_MIRROR_INTEGRITY_FINDINGS",
      gap_findings: 1, conflict_findings: 0, total_findings: 1,
      findings: [
        { kind: "GAP", relation_key: "manager.order:orders", reason_code: "X", findings: 2 },
        { kind: "NONSENSE", relation_key: "a", reason_code: "b", findings: 1 },
        { kind: "GAP", reason_code: "b", findings: 1 },
      ],
    });
    expect(read?.findings).toHaveLength(1);
    expect(read?.findings[0]?.findings).toBe(2);
  });
});

describe("the sentence", () => {
  const of = (over: Partial<MirrorIntegrity>): MirrorIntegrity => ({
    state: "READY", reasonCode: null, measuredRevision: "rev-1", measuredAtMs: 1,
    readAtMs: 2, gapFindings: 0, conflictFindings: 0, totalFindings: 0, findings: [], ...over,
  });

  it("says a measured clean mirror is measured", () => {
    expect(mirrorIntegritySentence(of({}))).toContain("current revision");
  });

  it("never claims zero for a state nobody measured", () => {
    for (const reasonCode of [
      "EDS06_MIRROR_DISABLED", "EDS06_MIRROR_NEVER_MEASURED",
      "EDS06_MIRROR_PROFILE_NOT_CONFIGURED", "EDS06_MIRROR_READ_FAILED",
    ]) {
      const sentence = mirrorIntegritySentence(of({
        state: "UNAVAILABLE", reasonCode, totalFindings: null, gapFindings: null, conflictFindings: null,
      }));
      expect(sentence, reasonCode).not.toMatch(/\b0\b/);
      expect(sentence.length, reasonCode).toBeGreaterThan(30);
    }
  });

  it("counts what was recorded when something was", () => {
    const sentence = mirrorIntegritySentence(of({
      state: "PARTIAL", reasonCode: "EDS06_MIRROR_INTEGRITY_FINDINGS",
      gapFindings: 2, conflictFindings: 1, totalFindings: 5,
    }));
    expect(sentence).toContain("5 finding(s)");
  });
});
