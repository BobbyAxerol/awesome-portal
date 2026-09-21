import { describe, expect, it } from "vitest";

import {
  ResearchRunLibraryQuerySchema,
  ResearchRunLibraryResponseSchema,
} from "../src/research/run-library.contract";

describe("P12 Run Library wire contract", () => {
  it("normalizes repeated filters deterministically and keeps ids polling isolated", () => {
    const query = ResearchRunLibraryQuerySchema.parse({
      "status[]": ["FAILED", "RUNNING", "FAILED"],
      status: "COMPLETED",
      mode: ["mode_2", "mode_1"],
      "alpha[]": ["scratch", "alpha-delta"],
      limit: "24",
    });
    expect(query.status).toEqual(["COMPLETED", "FAILED", "RUNNING"]);
    expect(query.mode).toEqual(["mode_1", "mode_2"]);
    expect(query.alpha).toEqual(["alpha-delta", "scratch"]);
    expect(query.limit).toBe(24);
    expect(() => ResearchRunLibraryQuerySchema.parse({ ids: "run_a", q: "alpha" })).toThrow(
      /ids polling is mutually exclusive/,
    );
    expect(() => ResearchRunLibraryQuerySchema.parse({ cursor: "one", before: "two" })).toThrow(
      /mutually exclusive/,
    );
  });

  it("keeps the list response exact-value and explicit-absence shaped", () => {
    const parsed = ResearchRunLibraryResponseSchema.safeParse({
      schema_version: "research.run-library.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      items: [],
      page: {
        limit: 50, total_rows: 0, filtered_rows: 0, next_cursor: null, prev_cursor: null,
        has_more: false, has_previous: false, order: "CREATED_AT_DESC_RUN_ID_DESC",
      },
      counters: { logical_runs: 0, worker_children: 0, technical_retries: 0, legacy_metadata_rows: 0 },
      claim_ledger: { issued: 0, not_issued: 0, pending_source: 0, failed: 0 },
      filter_catalog: { alphas: [], modes: [], scratch_available: false },
      as_of_utc_ms: 1_725_000_000_000,
    });
    expect(parsed.success).toBe(true);
  });
});
