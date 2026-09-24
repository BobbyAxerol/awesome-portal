import { describe, expect, it } from "vitest";

import {
  ResearchRunLibraryItemSchema,
  ResearchRunLibraryQuerySchema,
  ResearchRunLibraryResponseSchema,
  ResearchRunLibrarySparklineResponseSchema,
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
      claim_ledger: {
        issued: 0, not_issued: 0, pending_source: 0, failed: 0, cancelled_before_source: 0, legacy_metadata_only: 0,
      },
      filter_catalog: { alphas: [], modes: [], scratch_available: false },
      as_of_utc_ms: 1_725_000_000_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("RF-05: rc, claim state, status basis, mode schedule/protocol and metric scope are typed and strict", () => {
    const absent = { state: "NOT_PUBLISHED", reason_code: "X_NOT_PUBLISHED" };
    const cell = (role: string) => ({
      key: role.toLowerCase(), label: role, role, value: null, tone: "DEFAULT", availability: absent,
      scope: null, definition_id: null,
    });
    const item = {
      run_id: "rrun_a", attempt_id: null, source_kind: "RESEARCH_DURABLE", row_kind: "LOGICAL_RUN",
      relationship: { kind: "PRIMARY", logical_run_key: null, parent_run_id: null, technical_retry_count: 0 },
      status: "COMPLETED",
      status_basis: { kind: "DURABLE_LIFECYCLE", availability: { state: "AVAILABLE", reason_code: null } },
      mode: { display: "mode_1_decay · global", key: "mode_1_decay", schedule: "global", protocol: "three_window_decay", availability: { state: "AVAILABLE", reason_code: null } },
      strategy_id: { value: null, availability: absent },
      binding: null, binding_availability: absent,
      rc: {
        kind: "LOCAL_SEAL", release_candidate_id: "rc_01J9ZQ3M4N5P6Q7R8S9T0VWXYZ", draft_id: null,
        delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED", sealed_at_utc_ms: 1,
      },
      rc_availability: { state: "AVAILABLE", reason_code: null },
      instrument: { display: null, availability: absent },
      created_at_utc_ms: 1,
      certificate: { grade: null, availability: absent },
      claim: { state: "NOT_ISSUED", text: "The fixed P10 qualification sealed its artifacts but did not issue a release claim.", availability: { state: "AVAILABLE", reason_code: null } },
      stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({ key, state: "done", tip: null, tooltip_source: "NOT_PUBLISHED", availability: absent })),
      stats: [cell("OOS_SHARPE"), cell("DECAY"), { ...cell("TRADE_COUNT"), value: "45", scope: "CHILD_TAPE", definition_id: "research.metric.v1.trade_count", availability: { state: "AVAILABLE", reason_code: null } }],
      superseded_note: null,
      comparison: { key: null, availability: absent },
      sparkline: { kind: "oos_equity", availability: { state: "AVAILABLE", reason_code: null } },
      evidence_revision: `p13r1_${"a".repeat(64)}`,
      source_updated_at_utc_ms: 1,
    };
    expect(ResearchRunLibraryItemSchema.safeParse(item).success).toBe(true);
    expect(ResearchRunLibraryItemSchema.safeParse({ ...item, rc: { ...item.rc, release_candidate_id: "rc_bad" } }).success).toBe(false);
    expect(ResearchRunLibraryItemSchema.safeParse({ ...item, claim: { ...item.claim, state: "MAYBE" } }).success).toBe(false);
    const { rc_availability: _omitted, ...withoutRcAvailability } = item;
    expect(ResearchRunLibraryItemSchema.safeParse(withoutRcAvailability).success).toBe(false);

    expect(ResearchRunLibrarySparklineResponseSchema.safeParse({
      schema_version: "research.run-sparkline.v1", run_id: "rrun_a", values: ["19996.89", "19965.99"],
      availability: { state: "AVAILABLE", reason_code: null }, source_revision: `p13r1_${"a".repeat(64)}`,
      source: {
        series_kind: "EQUITY_OOS", value_field: "equity", projection_revision: `p13r1_${"a".repeat(64)}`,
        series_digest: "b".repeat(64), source_observation_count: 744, source_sampling: "EXTREMA_BUCKET_V1",
        persisted_point_count: 25, display_sampling: "EXTREMA_BUCKET_24_V1", first_at_utc_ms: 1, last_at_utc_ms: 2,
      },
    }).success).toBe(true);
  });
});
