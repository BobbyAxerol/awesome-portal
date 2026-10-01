/**
 * Conservative claim-family projection shared by P19 Lineage and P20 Compare.
 * The source's issued sentence is display text, never a parser input.
 */
import { z } from "zod";

import { ResearchSplitSourceSchema, type ResearchSplitSource } from "./progress.contract";

const StoredSplitProjectionSchema = z.object({
  schema_version: z.literal("research.split-projection.v1"),
  source: ResearchSplitSourceSchema,
}).strict();

export function claimSplitFromProjection(value: unknown): ResearchSplitSource | null {
  const parsed = StoredSplitProjectionSchema.safeParse(value);
  return parsed.success ? parsed.data.source : null;
}

export function researchClaimFamily(input: {
  validationClaim: string | null;
  split: ResearchSplitSource | null;
}) {
  if (input.validationClaim === "walk_forward_oos") {
    return {
      family: "WALK_FORWARD_OOS_COMPATIBILITY" as const,
      rank: 3,
      origin: "SOURCE_ATTESTED" as const,
      availability: { state: "AVAILABLE" as const, reason_code: null },
    };
  }
  if (input.split?.protocol.kind === "THREE_WINDOW_CURRENT"
    && input.split.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH"
    && input.split.windows.outer_oos.data_role === "OUTER_OOS_OBSERVATION") {
    return {
      family: "WALK_FORWARD_OOS_COMPATIBILITY" as const,
      rank: 3,
      origin: "PORTAL_DERIVED_FROM_SOURCE_PROTOCOL" as const,
      availability: { state: "AVAILABLE" as const, reason_code: null },
    };
  }
  return {
    family: "NOT_PUBLISHED" as const,
    rank: null,
    origin: "NOT_PUBLISHED" as const,
    availability: { state: "NOT_PUBLISHED" as const, reason_code: "P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED" },
  };
}
