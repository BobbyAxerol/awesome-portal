import { describe, expect, it } from "vitest";

import {
  ResearchAttemptLineageQuerySchema,
  ResearchAttemptLineageResponseSchema,
} from "../src/research/lineage.contract";

describe("P19 Attempt Lineage wire contract", () => {
  it("keeps the graph bound and requires explicit partial/absence vocabulary", () => {
    expect(ResearchAttemptLineageQuerySchema.parse({ limit: "128" })).toEqual({ limit: 128 });
    expect(() => ResearchAttemptLineageQuerySchema.parse({ limit: "129" })).toThrow();
    const response = ResearchAttemptLineageResponseSchema.safeParse({
      schema_version: "research.attempt-lineage.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      alpha: {
        alpha_id: "alpha-p19", name: "P19", active_version_id: null, active_version_state: null,
        active_version_availability: { state: "NOT_PUBLISHED", reason_code: "P19_ALPHA_HAS_NO_ACTIVE_VERSION" },
        versions: [],
      },
      attempts: [],
      counts: { total_attempts: 0, returned_attempts: 0, draft_attempts: 0, submitted_attempts: 0, failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 0 },
      coverage: { state: "COMPLETE", reason_code: null, oldest_returned_created_at_utc_ms: null },
      source_absences: {
        promotion_pick: { state: "NOT_PUBLISHED", reason_code: "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK" },
        historical_semantic_diff: { state: "AVAILABLE", reason_code: null },
      },
      as_of_utc_ms: 1_790_000_000_000,
    });
    expect(response.success).toBe(true);
  });
});
