import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDS02_PANEL_STATES,
  EDS02_SOURCE_AUTHORITIES,
  exactDecimal,
  executionContractAuthority,
  executionContractAuthorityEvidence,
  opaqueIdentifier,
  panelEnvelope,
  utcEpochMs,
} from "../src/execution/contract-authority";

const actor = { userId: "usr_eds02", username: "eds02-admin", role: "ADMIN" } as const;

function envelopeFor(state: (typeof EDS02_PANEL_STATES)[number], data: unknown) {
  return {
    state,
    data,
    clocks: {
      event_time_ms: null, source_published_at_ms: null, received_at_ms: null,
      ingested_at_ms: null, processed_at_ms: null, as_of_ms: null, read_at_ms: utcEpochMs(1_788_540_677_303),
    },
    coverage: {
      from_ms: null, to_ms: null, source_total: null, filtered_total: null,
      returned_count: 0, truncated: false, downsampled: false, has_more: false,
      next_cursor: null, gaps: [],
    },
    source_history_semantics: "CURRENT_STATE_ONLY",
    formula: null,
    reason_code: state === "READY" ? null : "TESTED_STATE",
    retryable: false,
  };
}

describe("EDS-02 generated screen, panel and action authority", () => {
  it("is reproducible from the pinned E3/E5 source pack", () => {
    const result = spawnSync(
      process.execPath,
      ["tooling/generate-eds02-contract-source.mjs", "--check"],
      {
        cwd: resolve(__dirname, ".."),
        env: process.env,
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it("classifies every frozen field/action, including the two explicit BR-EX-72 Portal list extensions", () => {
    const document = executionContractAuthority(actor, "ws_primary") as Record<string, any>;
    expect(document.screen_data_manifest.screen_count).toBe(25);
    expect(document.screen_data_manifest.field_definition_count).toBe(34);
    expect(document.action_manifest.action_count).toBe(12);
    const fieldIds = new Set(
      document.screen_data_manifest.screens.flatMap((screen: Record<string, any>) =>
        screen.panels.map((panel: Record<string, unknown>) => panel.field_id),
      ),
    );
    expect(fieldIds.size).toBe(34);
    const sourceAuthorities = new Set(
      document.screen_data_manifest.screens.flatMap((screen: Record<string, any>) =>
        screen.panels.map((panel: Record<string, string>) => panel.source_authority),
      ),
    );
    expect([...sourceAuthorities].sort()).toEqual([...EDS02_SOURCE_AUTHORITIES].sort());
    expect(document.screen_data_manifest.screens.map((screen: Record<string, unknown>) => screen.screen_id))
      .toEqual(expect.arrayContaining([
        "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
        "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
      ]));
    expect(document.generated_digests.composite).toBe(executionContractAuthorityEvidence().generated_digests.composite);
    const serialized = JSON.stringify(document).toLowerCase();
    for (const forbidden of ["public.", "/internal/v2/manager", "postgres://", "redis://", "cursor=", "https://", "http://", "href"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses role filtering without changing the static source digest", () => {
    const admin = executionContractAuthority(actor, "ws_primary") as Record<string, any>;
    const reader = executionContractAuthority({ ...actor, role: "USER" }, "ws_primary") as Record<string, any>;
    expect(admin.screen_data_manifest.screen_count).toBe(25);
    expect(reader.screen_data_manifest.screen_count).toBe(24);
    expect(reader.screen_data_manifest.screens.some((screen: Record<string, string>) =>
      screen.screen_id === "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
    )).toBe(false);
    expect(admin.generated_digests.composite).toBe(reader.generated_digests.composite);
    expect(admin.generated_digests.authorized_screen_data_manifest)
      .not.toBe(reader.generated_digests.authorized_screen_data_manifest);
  });

  it("preserves UTC epoch milliseconds, exact decimals and opaque large identifiers without coercion", () => {
    expect(utcEpochMs(-1)).toBe(-1);
    expect(() => utcEpochMs(1.5)).toThrowError(expect.objectContaining({ code: "EDS02_UTC_EPOCH_MS_INVALID" }));
    expect(() => utcEpochMs(8_640_000_000_000_001)).toThrowError(expect.objectContaining({ code: "EDS02_UTC_EPOCH_MS_INVALID" }));
    expect(() => utcEpochMs(Number.MAX_SAFE_INTEGER + 1)).toThrowError(expect.objectContaining({ code: "EDS02_UTC_EPOCH_MS_INVALID" }));
    expect(exactDecimal("6123.000000000000000001", "USDT", 18)).toBe("6123.000000000000000001");
    expect(() => exactDecimal(6123, "USDT", 0)).toThrowError(expect.objectContaining({ code: "EDS02_EXACT_DECIMAL_INVALID" }));
    expect(() => exactDecimal("1.00", "USDT", 1)).toThrowError(expect.objectContaining({ code: "EDS02_DECIMAL_SCALE_MISMATCH" }));
    expect(opaqueIdentifier("900719925474099312345")).toBe("900719925474099312345");
    expect(() => opaqueIdentifier(9007199254740993)).toThrowError(expect.objectContaining({ code: "EDS02_IDENTIFIER_INVALID" }));
  });

  it("covers every panel state and forbids READY/PARTIAL/STALE null data", () => {
    for (const state of EDS02_PANEL_STATES) {
      const data = state === "READY" || state === "PARTIAL" || state === "STALE" ? { exact: "1.00" } : null;
      expect(panelEnvelope(envelopeFor(state, data))).toMatchObject({ state, data });
    }
    for (const state of ["READY", "PARTIAL", "STALE"] as const) {
      expect(() => panelEnvelope(envelopeFor(state, null))).toThrowError(expect.objectContaining({ code: "EDS02_PANEL_DATA_REQUIRED" }));
    }
    for (const state of ["EMPTY", "UNAVAILABLE", "DENIED", "ERROR"] as const) {
      expect(() => panelEnvelope(envelopeFor(state, { invalid: true }))).toThrowError(expect.objectContaining({ code: "EDS02_PANEL_DATA_FORBIDDEN" }));
    }
    const missingData = envelopeFor("READY", { exact: "1.00" }) as Record<string, unknown>;
    delete missingData.data;
    expect(() => panelEnvelope(missingData as never)).toThrowError(expect.objectContaining({ code: "EDS02_PANEL_DATA_MISSING" }));
  });
});
