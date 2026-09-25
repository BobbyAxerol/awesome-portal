import { describe, expect, it } from "vitest";

import {
  ResearchAttemptLineageQuerySchema,
  ResearchAttemptLineageResponseSchema,
} from "../src/research/lineage.contract";

const EMPTY = {
  schema_version: "research.attempt-lineage.v1",
  read_authority: "PORTAL_PERSISTED_RESEARCH",
  alpha: {
    alpha_id: "alpha-p19", name: "P19", active_version_id: null, active_version_state: null,
    active_version_availability: { state: "NOT_PUBLISHED", reason_code: "P19_ALPHA_HAS_NO_ACTIVE_VERSION" },
    versions: [],
  },
  attempts: [],
  counts: {
    total_attempts: 0, returned_attempts: 0, draft_attempts: 0, submitted_attempts: 0, failed_attempts: 0,
    abandoned_attempts: 0, child_runs: 0, technical_retries: 0, storied_returned: 0, probe_returned: 0,
  },
  counts_definitions: {
    version: "research.lineage-counts.v1",
    rows: [
      "total_attempts", "returned_attempts", "draft_attempts", "submitted_attempts", "failed_attempts",
      "abandoned_attempts", "child_runs", "technical_retries", "storied_returned", "probe_returned",
    ].map((key) => ({ key, includes: `${key} definition`, run_library_equivalent: null })),
  },
  presentation_rule: {
    version: "research.lineage-presentation.v1",
    storied_when: ["PROMOTION_PICK", "RELEASE_CANDIDATE", "VERSION_FIRST_ATTEMPT", "GATES_RESET", "MATERIAL_CHANGES"],
    material_change_threshold: 2,
  },
  coverage: { state: "COMPLETE", reason_code: null, oldest_returned_created_at_utc_ms: null, window: "NEWEST", older_cursor: null },
  source_absences: {
    promotion_pick: { state: "NOT_PUBLISHED", reason_code: "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK" },
    historical_semantic_diff: { state: "AVAILABLE", reason_code: null },
  },
  as_of_utc_ms: 1_790_000_000_000,
  lineage_revision: `p19r2_${"a".repeat(64)}`,
  etag: `"p19r2_${"a".repeat(64)}"`,
};

describe("P19 Attempt Lineage wire contract", () => {
  it("keeps the graph bound and requires explicit partial/absence vocabulary", () => {
    expect(ResearchAttemptLineageQuerySchema.parse({ limit: "128" })).toEqual({ limit: 128 });
    expect(() => ResearchAttemptLineageQuerySchema.parse({ limit: "129" })).toThrow();
    expect(ResearchAttemptLineageResponseSchema.safeParse(EMPTY).success).toBe(true);
  });

  it("W6b: the only paging input is an opaque cursor, and a revision is mandatory", () => {
    expect(ResearchAttemptLineageQuerySchema.parse({ cursor: "lc1.k.p.s" })).toEqual({ limit: 128, cursor: "lc1.k.p.s" });
    expect(() => ResearchAttemptLineageQuerySchema.parse({ after: "2026-09-22" })).toThrow();
    const { etag: _etag, ...withoutEtag } = EMPTY;
    expect(ResearchAttemptLineageResponseSchema.safeParse(withoutEtag).success).toBe(false);
    expect(ResearchAttemptLineageResponseSchema.safeParse({ ...EMPTY, etag: `W/"p19r2_${"a".repeat(64)}"` }).success).toBe(false);
  });
});
