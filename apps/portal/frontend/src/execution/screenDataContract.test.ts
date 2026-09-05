import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDS02_PANEL_STATES,
  formatUtcEpochMs,
  readContractAuthority,
  readExactDecimal,
  readGeneratedPanelEnvelope,
  readOpaqueIdentifier,
  readUtcEpochMs,
} from "./screenDataContract";

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");

function panel(state: string, data: unknown) {
  return {
    state,
    data,
    clocks: {
      event_time_ms: 1788540677000, source_published_at_ms: null, received_at_ms: null,
      ingested_at_ms: null, processed_at_ms: null, as_of_ms: 1788540677000, read_at_ms: 1788540677303,
    },
    coverage: {
      from_ms: null, to_ms: null, source_total: "900719925474099312345", filtered_total: "1",
      returned_count: 1, truncated: false, downsampled: false, has_more: false, next_cursor: null, gaps: [],
    },
    source_history_semantics: "CURRENT_STATE_ONLY",
    formula: null,
    reason_code: state === "READY" ? null : "TYPED_STATE",
    retryable: false,
  };
}

describe("EDS-02 frozen frontend generated contract decoder", () => {
  it("reads generated authority metadata without fixture/source leakage", () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, "execution-contract-authority.valid.json"), "utf8"));
    const authority = readContractAuthority(raw);
    expect(authority).not.toBeNull();
    expect(authority?.clock_contract.wire_type).toBe("UTC_EPOCH_MS");
    expect(authority?.screen_data_manifest.screens[0].operation.operation_id).toBe("executionGateR1Review");
    expect(readContractAuthority({ ...raw, redaction: { ...raw.redaction, href: "/bad" } })).toBeNull();
  });

  it("formats UTC epoch milliseconds in a browser-timezone-invariant way", () => {
    const august = readUtcEpochMs(Date.UTC(2026, 7, 22, 12, 0, 20, 417));
    const marchDstBoundary = readUtcEpochMs(Date.UTC(2026, 2, 8, 7, 30, 0, 0));
    expect(august).not.toBeNull();
    expect(marchDstBoundary).not.toBeNull();
    expect(formatUtcEpochMs(august!)).toBe("2026-08-22 12:00:20.417 UTC");
    expect(formatUtcEpochMs(marchDstBoundary!)).toBe("2026-03-08 07:30:00.000 UTC");
    expect(readUtcEpochMs("1788540677303")).toBeNull();
    expect(readUtcEpochMs(1788540677303.1)).toBeNull();
    expect(readUtcEpochMs(8_640_000_000_000_001)).toBeNull();
  });

  it("round-trips exact decimals and refuses number-coerced large identifiers", () => {
    expect(readExactDecimal("6123.000000000000000001", "USDT", 18)).toBe("6123.000000000000000001");
    expect(readExactDecimal(6123, "USDT", 0)).toBeNull();
    expect(readExactDecimal("1.00", "USDT", 1)).toBeNull();
    expect(readOpaqueIdentifier("900719925474099312345")).toBe("900719925474099312345");
    expect(readOpaqueIdentifier(9007199254740993)).toBeNull();
  });

  it("accepts every stated panel state while rejecting READY+null and terminal data", () => {
    for (const state of EDS02_PANEL_STATES) {
      const data = ["READY", "PARTIAL", "STALE"].includes(state) ? { exact: "1.00" } : null;
      expect(readGeneratedPanelEnvelope(panel(state, data))).not.toBeNull();
    }
    expect(readGeneratedPanelEnvelope(panel("READY", null))).toBeNull();
    expect(readGeneratedPanelEnvelope(panel("EMPTY", { invalid: true }))).toBeNull();
    const missingData = panel("READY", { exact: "1.00" });
    delete (missingData as Record<string, unknown>).data;
    expect(readGeneratedPanelEnvelope(missingData)).toBeNull();

    const malformedCoverage = panel("READY", { exact: "1.00" });
    malformedCoverage.coverage.returned_count = 201;
    expect(readGeneratedPanelEnvelope(malformedCoverage)).toBeNull();

    const malformedFormula = panel("READY", { exact: "1.00" }) as Record<string, unknown>;
    malformedFormula.formula = {
      formula_id: "net_pnl", formula_version: "v1", input_revision: null,
      input_digest: "not-a-digest", composite_read_revision: null,
    };
    expect(readGeneratedPanelEnvelope(malformedFormula)).toBeNull();
  });

  it("rejects authority metadata whose counts or action graph cannot be trusted", () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, "execution-contract-authority.valid.json"), "utf8"));
    expect(readContractAuthority({ ...raw, screen_data_manifest: { ...raw.screen_data_manifest, screen_count: 2 } })).toBeNull();
    expect(readContractAuthority({ ...raw, action_manifest: { ...raw.action_manifest, action_count: 2 } })).toBeNull();
    const invalidSourceAuthority = structuredClone(raw);
    invalidSourceAuthority.screen_data_manifest.screens[0].panels[0].source_authority = "DERIVED";
    expect(readContractAuthority(invalidSourceAuthority)).toBeNull();
    const leakedRelation = structuredClone(raw);
    leakedRelation.screen_data_manifest.screens[0].panels[0].source_relation_or_operation = "private_relation";
    expect(readContractAuthority(leakedRelation)).toBeNull();
    expect(readContractAuthority({ ...raw, upstream_url: "https://edge.internal" })).toBeNull();
    const disconnectedAction = structuredClone(raw);
    disconnectedAction.action_manifest.actions[0].source_screen_id = "PAPER_TRADING_SCREEN";
    expect(readContractAuthority(disconnectedAction)).toBeNull();
  });

  it("keeps production contract modules free of fixture imports", () => {
    for (const file of ["screenDataContract.ts", "contractAuthorityRoutes.ts", "api/contractAuthority.ts"]) {
      const body = readFileSync(join(__dirname, file), "utf8");
      expect(body).not.toMatch(/fixtures\//i);
      expect(body).not.toMatch(/fixtureApi/i);
    }
  });
});
