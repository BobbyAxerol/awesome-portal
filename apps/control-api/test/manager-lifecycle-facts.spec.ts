import { describe, expect, it } from "vitest";
import { deriveManagerRowLifecycleFromFacts as derive, validateManagerLifecycle, managerStageLifecyclePolicy, MS_PER_DAY,
  MANAGER_STAGE_LIFECYCLE_POLICY, type ManagerStageTransitionFact } from "../src/execution-v2/manager-lifecycle";

const fact: ManagerStageTransitionFact = { alpha_id: "a", alpha_version_id: "v", portfolio_id: "p",
  environment: "paper", stage: "PAPER", entered_at_ms: 1000, exited_at_ms: null, source_revision: "r" };
const input = () => ({ ...fact, stages: ["PAPER"] as const, as_of_ms: 1000 + 7 * MS_PER_DAY + 123,
  facts: [fact] });

describe("Manager source stage timing", () => {
  it("validates ALL timing at each environment cutoff, not the oldest combined clock", () => {
    const i = input(), issues: unknown[] = [];
    validateManagerLifecycle({ as_of_ms: 1000, environment: "ALL",
      environment_coverage: [{ environment: "paper", as_of_ms: i.as_of_ms }],
      items: [{ ...derive(i), environment: "paper", stage_presence: ["PAPER"] }] },
      { addIssue: issue => issues.push(issue), path: [] });
    expect(issues).toEqual([]);
  });
  it("publishes exact transition and elapsed complete UTC days without mutating source", () => {
    const i = input(); const before = structuredClone(i);
    expect(derive(i)).toEqual({ current_stage: "PAPER", entered_at_ms: 1000, days_in_stage: 7,
      stage_lifecycle_reasons: { current_stage: null, entered_at_ms: null, days_in_stage: null } });
    expect(i).toEqual(before);
  });
  it.each(["alpha_id", "alpha_version_id", "portfolio_id", "environment", "source_revision"] as const)(
    "does not join a different %s", key => {
      expect(derive({ ...input(), facts: [{ ...fact, [key]: "other" }] }).entered_at_ms).toBeNull();
    });
  it("respects half-open intervals and future transitions", () => {
    const i = input();
    expect(derive({ ...i, facts: [{ ...fact, exited_at_ms: i.as_of_ms }] }).entered_at_ms).toBeNull();
    expect(derive({ ...i, facts: [{ ...fact, entered_at_ms: i.as_of_ms + 1 }] }).entered_at_ms).toBeNull();
    expect(derive({ ...i, as_of_ms: fact.entered_at_ms }).days_in_stage).toBe(0);
  });
  it("keeps multiple or withheld stages absent", () => {
    expect(derive({ ...input(), stages: ["PAPER", "SANDBOX"] }).entered_at_ms).toBeNull();
    expect(derive({ ...input(), stages: [] }).current_stage).toBeNull();
  });
  it("deduplicates identical entry facts but rejects competing current entries", () => {
    expect(derive({ ...input(), facts: [fact, { ...fact }] }).days_in_stage).toBe(7);
    expect(() => derive({ ...input(), facts: [fact, { ...fact, entered_at_ms: 2000 }] })).toThrow("AMBIGUOUS");
  });
  it("rejects malformed matching facts and invalid snapshots", () => {
    expect(() => derive({ ...input(), facts: [{ ...fact, entered_at_ms: NaN }] })).toThrow("INVALID");
    expect(() => derive({ ...input(), as_of_ms: Infinity })).toThrow("INVALID");
  });
  it("keeps the served policy unchanged until coordinated schema publication", () => {
    expect(managerStageLifecyclePolicy.safeParse({ ...MANAGER_STAGE_LIFECYCLE_POLICY,
      entry_time: "SOURCE_STAGE_TRANSITION" }).success).toBe(false);
    expect(managerStageLifecyclePolicy.safeParse(MANAGER_STAGE_LIFECYCLE_POLICY).success).toBe(true);
  });
});
