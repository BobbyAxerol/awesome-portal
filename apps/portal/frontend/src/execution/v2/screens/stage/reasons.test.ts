import { describe, expect, it } from "vitest";

import { STAGE_REASON_WHY, STAGE_WHY, STAGE_WHY_KEYS, captureReasonText, stageWhy, type StageWhyKey } from "./reasons";

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

describe("captureReasonText (FE-068, BE-P7: the capabilities row's reason_code in the eligibility's own words)", () => {
  it("reads every reason class the capture predicate publishes through the SAME dictionary as the eligibility", () => {
    expect(captureReasonText("RETAINED_REVIEW_READ_ONLY")).toBe("Read-only on this build");
    expect(captureReasonText("ADMIN_ROLE_REQUIRED")).toBe("Needs the Admin role");
    expect(captureReasonText("GOVERNANCE_CAPABILITY_REQUIRED")).toBe("Needs the approver grant");
    expect(captureReasonText("GOVERNANCE_SCOPE_MISMATCH")).toBe("The grant does not cover this deployment");
    expect(captureReasonText("CAPTURE_PROJECTION_NOT_AUTHORIZED")).toBe("The paper projection is not authorised for this capture");
    for (const code of Object.keys(STAGE_REASON_WHY)) expect(captureReasonText(code), code).toBe(STAGE_REASON_WHY[code as keyof typeof STAGE_REASON_WHY]);
  });

  it("any other code (a free string in the schema) is null: the screen keeps the code as sent and its own generic sentence", () => {
    for (const code of ["GRANT_NOT_PUBLISHED", "SOURCE_OWNED", "ADMIN_REQUIRED", "SUBMIT_CHECKS_REQUIRED", "", "constructor", "__proto__", "toString"]) {
      expect(captureReasonText(code), code).toBeNull();
    }
    expect(captureReasonText(null)).toBeNull();
    expect(captureReasonText(undefined)).toBeNull();
    expect(captureReasonText(7 as never)).toBeNull();
  });

  it("is text only: a read does not change the dictionary, and no sentence reads as a permission", () => {
    const before = JSON.stringify(STAGE_REASON_WHY);
    captureReasonText("ADMIN_ROLE_REQUIRED");
    expect(JSON.stringify(STAGE_REASON_WHY)).toBe(before);
    for (const code of Object.keys(STAGE_REASON_WHY)) expect(captureReasonText(code)).not.toMatch(/\b(allowed|granted|open|enabled)\b(?! for)/i);
  });
});
