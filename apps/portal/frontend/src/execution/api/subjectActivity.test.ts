import { beforeEach, describe, expect, it } from "vitest";
import { forgetSubjectCeiling, readSubjectActivity, subjectActivityPath, subjectCeiling } from "./subjectActivity";

const wire = {
  schema_version: "portal.execution.subject-records.v1",
  logical_operation_id: "executionAlphaOrdersV1",
  authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
  source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
  history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
  environment: "paper",
  profile_id: "PAPER_BINANCE_USDM",
  resource: { kind: "alpha", id: "adaptive_hma_cpp_00115m", resolution: "PUBLISHED_STRATEGY_ID" },
  timeframe: { value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX", source_field: null },
  source_health: { availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1_788_785_600_000 },
  coverage: { retained_row_count: 1, oldest_observed_at_ms: 1_788_785_600_000, newest_observed_at_ms: 1_788_785_600_000, source_completeness: "COMPLETE", source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL" },
  state: "AVAILABLE",
  page: { limit: 500, returned_count: 1, has_more: false, next_cursor: null },
  records: [{ record_id: "ord_1", values: { order_id: "ord_1", updated_at: "2026-09-07T12:00:00.000Z", price: "101.25" } }],
  projection: { epoch_id: "epoch_1", sequence: 7, source_as_of_ms: 1_788_785_600_000, last_successful_refresh_at_ms: 1_788_785_600_000, completeness: "COMPLETE" },
};

describe("BR-EX-81 subject activity BFF wire", () => {
  it("keeps the exact retained-current semantics and exact values", () => {
    const parsed = readSubjectActivity(wire);
    expect(parsed).toMatchObject({
      environment: "paper",
      timeframe: { value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX" },
      records: [{ recordId: "ord_1", values: { price: "101.25" } }],
    });
    expect(parsed?.historySemantics).toBe("RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY");
  });

  it("builds only an exact named alpha/account operation", () => {
    expect(subjectActivityPath({ environment: "paper", subjectKind: "alpha", subjectId: "a/b", relation: "orders", limit: 200 })).toBe("/resources/alphas/a%2Fb/orders?environment=paper&limit=200");
    expect(subjectActivityPath({ environment: "live", subjectKind: "account", subjectId: "acc_1", relation: "fills", after: "portal-token" })).toContain("/resources/accounts/acc_1/fills?");
  });

  describe("phase 3 · the ceiling is the server's, learned from its own answers", () => {
    beforeEach(() => { forgetSubjectCeiling(); });

    it("asks for what the caller wanted before anything has been declared", () => {
      // The old clamp was a hard-coded 500 copied from the server's request
      // schema into a file that could never see it change. Until the server
      // has said a ceiling, refusing is the server's job, not ours.
      expect(subjectCeiling()).toBeNull();
      expect(subjectActivityPath({ environment: "paper", subjectKind: "alpha", subjectId: "a", relation: "orders", limit: 999 }))
        .toContain("limit=999");
    });

    it("clamps to the ceiling once a page envelope declares one", () => {
      readSubjectActivity({
        schema_version: "portal.execution.subject-activity.v1",
        logical_operation_id: "executionAlphaOrdersV1",
        authority: "PORTAL_CONTROL",
        source_authority: "TRADING_SYSTEM",
        history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
        environment: "paper",
        profile_id: "PAPER_BINANCE_USDM",
        resource: { kind: "ALPHA", id: "a" },
        relation: "orders",
        state: "POPULATED",
        page: { limit: 200, maximum_page_rows: 500, returned_count: 1, has_more: false, next_cursor: null },
        records: [{ record_id: "ord_1", values: { price: "1" } }],
        projection: {},
      });
      expect(subjectCeiling()).toBe(500);
      expect(subjectActivityPath({ environment: "paper", subjectKind: "alpha", subjectId: "a", relation: "orders", limit: 999 }))
        .toContain("limit=500");
      // A smaller ask stays smaller: the ceiling is a maximum, not a target.
      expect(subjectActivityPath({ environment: "paper", subjectKind: "alpha", subjectId: "a", relation: "orders", limit: 50 }))
        .toContain("limit=50");
    });
  });
});
