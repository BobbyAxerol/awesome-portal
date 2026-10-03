/** Additive UI guidance, not permission to compute, reseal or publish. */
import { z } from "zod";

export const PublishBlockedActionSchema = z.enum([
  "NONE", "SEAL_CANDIDATE", "CREATE_NEW_RUN_AND_SEAL", "REVIEW_CURRENT_CANDIDATE", "WAIT",
]);

export function publishBlockedAction(reason: string | null): z.infer<typeof PublishBlockedActionSchema> {
  switch (reason) {
    case "P22_LOCAL_SEAL_REQUIRED": return "SEAL_CANDIDATE";
    // A sealed actor/run draft cannot be reopened. Use the existing new-run
    // flow, then review declarations and seal a new candidate; retain old bytes.
    case "P22_CURRENT_SOURCE_CHANGED":
    case "P22_SOURCE_PIN_CHANGED": return "CREATE_NEW_RUN_AND_SEAL";
    case "P22_RELEASE_CANDIDATE_SUPERSEDED": return "REVIEW_CURRENT_CANDIDATE";
    case "P22_RELEASE_CANDIDATE_CURRENTNESS_UNKNOWN":
    case "P22_PUBLICATION_INTAKE_DISABLED":
    case "P22_GOVERNANCE_SOURCE_UNAVAILABLE":
    case "P22_SOURCE_FACTS_PARTIAL":
    case "P22_PUBLICATION_PENDING":
    case "P22_PUBLICATION_OUTCOME_UNKNOWN": return "WAIT";
    default: return "NONE";
  }
}
