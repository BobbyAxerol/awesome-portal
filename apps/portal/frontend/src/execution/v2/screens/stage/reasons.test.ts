import { describe, expect, it } from "vitest";

import { STAGE_WHY, STAGE_WHY_KEYS, stageWhy, type StageWhyKey } from "./reasons";

describe("stage disabled-reason dictionary (hi-fi KIT.WHY)", () => {
  it("holds exactly the five strings the hi-fi prints", () => {
    expect(STAGE_WHY).toEqual({
      noGrant: "Needs the approver grant",
      notEnabled: "Not enabled for this profile",
      liveClosed: "Live decisions are closed on this build",
      readOnly: "Read-only on this build",
      relay: "Relay is not qualified yet",
    });
    expect([...STAGE_WHY_KEYS].sort()).toEqual(["liveClosed", "noGrant", "notEnabled", "readOnly", "relay"]);
  });

  it("every sentence is plain: no trailing full stop (the hi-fi adds '· My access'), no dash, no code", () => {
    for (const key of STAGE_WHY_KEYS) {
      const text = STAGE_WHY[key];
      expect(text.trim(), key).toBe(text);
      expect(text, key).not.toMatch(/[—–]|N\/A|\.$|[A-Z]{3,}_/);
    }
  });

  it("stageWhy returns the sentence; an unknown key reads as notEnabled, never as a permission", () => {
    for (const key of STAGE_WHY_KEYS) expect(stageWhy(key)).toBe(STAGE_WHY[key]);
    expect(stageWhy("constructor" as StageWhyKey)).toBe("Not enabled for this profile");
    expect(stageWhy("__proto__" as StageWhyKey)).toBe("Not enabled for this profile");
  });

  it("a read does not change the table", () => {
    const before = JSON.stringify(STAGE_WHY);
    stageWhy("noGrant");
    expect(JSON.stringify(STAGE_WHY)).toBe(before);
  });
});
