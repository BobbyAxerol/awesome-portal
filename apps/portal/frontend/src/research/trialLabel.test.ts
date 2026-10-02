import { describe, expect, it } from "vitest";

import { trialLabel, trialTitle } from "./trialLabel";

describe("trialLabel (W1 §1.5)", () => {
  it("prints both only where the same read served both", () => {
    expect(trialLabel({ ordinal: 351, sourceId: 350 })).toBe("trial 351 · source 350");
  });
  it("prints the ordinal alone", () => {
    expect(trialLabel({ ordinal: 351 })).toBe("trial 351");
  });
  it("labels a lone source id `source`, never `trial`", () => {
    expect(trialLabel({ sourceId: 350 })).toBe("source 350");
    expect(trialLabel({ ordinal: null, sourceId: "study_2.trial_1" })).toBe("source study_2.trial_1");
  });
  it("returns null so the caller shows a typed absence; never computes one from the other", () => {
    expect(trialLabel({})).toBeNull();
    expect(trialLabel({ ordinal: null, sourceId: null })).toBeNull();
    expect(trialLabel({ sourceId: 350 })).not.toContain("351");
  });
  it("never prints # and zero is a served value", () => {
    expect(trialLabel({ ordinal: 1, sourceId: 0 })).toBe("trial 1 · source 0");
    expect(trialLabel({ ordinal: 351, sourceId: 350 })).not.toContain("#");
    expect(trialTitle).toMatch(/zero-based/);
  });
});
