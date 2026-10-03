import { describe, expect, it } from "vitest";
import { PublishBlockedActionSchema, publishBlockedAction } from "../src/research/release-candidate-publish-action";

describe("§31 bounded guidance never grants authority", () => {
  it.each([
    [null, "NONE"], ["P22_LOCAL_SEAL_REQUIRED", "SEAL_CANDIDATE"],
    ["P22_CURRENT_SOURCE_CHANGED", "CREATE_NEW_RUN_AND_SEAL"], ["P22_SOURCE_PIN_CHANGED", "CREATE_NEW_RUN_AND_SEAL"],
    ["P22_RELEASE_CANDIDATE_SUPERSEDED", "REVIEW_CURRENT_CANDIDATE"],
    ["P22_PUBLICATION_INTAKE_DISABLED", "WAIT"], ["P22_GOVERNANCE_SOURCE_UNAVAILABLE", "WAIT"],
    ["P22_ALREADY_DELIVERED", "NONE"], ["P22_PACK_INTEGRITY_FAILED", "NONE"],
    ["P22_PUBLICATION_OWNED_BY_ANOTHER_ACTOR", "NONE"], ["FUTURE_UNKNOWN_REASON", "NONE"],
  ])("%s → %s", (reason, action) => {
    expect(publishBlockedAction(reason)).toBe(action);
    expect(PublishBlockedActionSchema.safeParse(action).success).toBe(true);
  });
});
