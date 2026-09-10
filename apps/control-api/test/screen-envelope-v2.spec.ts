/**
 * PHASE 1 (round 2) · V2 drops the duplicate, V1 is left exactly as it was.
 *
 * The whole phase rests on one claim: `data.<panel>` was never anything but
 * `panels.<panel>.data.rows`, so the wire can stop carrying it. The projection
 * runs on the way out, which is why every existing service test still asserts
 * against an untouched V1 envelope.
 */
import { describe, expect, it } from "vitest";
import {
  screenEnvelopeV2From,
  screenResponseMetrics,
  wantsScreenV2,
  SCREEN_V2_MEDIA_TYPE,
} from "../src/execution/screen-envelope-v2";

const panel = (rows: unknown[] | null) => ({
  state: rows === null ? "EMPTY" : "READY",
  data: rows === null ? null : { rows },
  clocks: { read_at_ms: 1_700_000_000_000 },
  coverage: { source_total: rows === null ? "0" : String(rows.length), has_more: false },
  reason_code: null,
});

/** The envelope shape the services build, in the order they build it. */
function v1() {
  const panels = {
    performance: panel([{ id: "p1", pnl: "12.50" }, { id: "p2", pnl: "-3.25" }]),
    sessions: panel(null),
  };
  return {
    schema_version: "execution.paper-overview.v1",
    record_authority: "PORTAL_CONTROL",
    workspace_id: "ws_1",
    completeness: "PARTIAL",
    capabilities: [{ capability_id: "source.performance", state: "READY" }],
    panels,
    data: { performance: panels.performance.data!.rows, sessions: [] },
    deployment: { id: "dep_1" },
    query: { limit: 50 },
  };
}

describe("screen envelope V2 projection", () => {
  it("carries no collection twice", () => {
    const v2 = screenEnvelopeV2From(v1()) as Record<string, unknown>;
    expect(v2.data).toBeUndefined();
    expect(v2.panels).toBeDefined();
    expect(v2.screen_context).toBeDefined();
    expect(v2.schema_version).toBe("execution.paper-overview.v2");
  });

  it("moves everything after the rows into screen_context", () => {
    const v2 = screenEnvelopeV2From(v1()) as { screen_context: Record<string, unknown> };
    expect(v2.screen_context.deployment).toEqual({ id: "dep_1" });
    expect(v2.screen_context.query).toEqual({ limit: 50 });
    // A panel-keyed entry is the duplicate, so it must not reappear as context.
    expect(v2.screen_context.performance).toBeUndefined();
    expect(v2.screen_context.sessions).toBeUndefined();
  });

  it("leaves the envelope head where it was", () => {
    const v2 = screenEnvelopeV2From(v1()) as Record<string, unknown>;
    expect(v2.record_authority).toBe("PORTAL_CONTROL");
    expect(v2.workspace_id).toBe("ws_1");
    expect(v2.completeness).toBe("PARTIAL");
    expect(v2.capabilities).toEqual([{ capability_id: "source.performance", state: "READY" }]);
  });

  it("keeps a data key that names no panel, because that one is content", () => {
    const source = v1() as Record<string, unknown>;
    (source.data as Record<string, unknown>).profile_coverage = { checked: 3 };
    const v2 = screenEnvelopeV2From(source) as { screen_context: Record<string, unknown> };
    expect(v2.screen_context.profile_coverage).toEqual({ checked: 3 });
  });

  it("does not touch an envelope that has only one copy to begin with", () => {
    // Account 360 carries `data` and no panels; dropping it would lose the screen.
    const accountLike = { schema_version: "execution.account-360.v1", data: { balances: [] } };
    expect(screenEnvelopeV2From(accountLike)).toBe(accountLike);
  });

  it("loses no rows on the way", () => {
    const before = v1();
    const v2 = screenEnvelopeV2From(before) as { panels: Record<string, { data?: { rows?: unknown[] } | null }> };
    expect(v2.panels.performance.data!.rows).toEqual(before.data.performance);
    expect(v2.panels.sessions.data).toBeNull();
  });

  it("negotiates only on the exact media type", () => {
    expect(wantsScreenV2(`${SCREEN_V2_MEDIA_TYPE}, application/json`)).toBe(true);
    expect(wantsScreenV2("application/json")).toBe(false);
    expect(wantsScreenV2(undefined)).toBe(false);
  });

  it("labels metrics by operation, never by a resource id", () => {
    const metrics = screenResponseMetrics("execution.paper-overview", "v2", screenEnvelopeV2From(v1()));
    expect(metrics.panel_count).toBe(2);
    expect(metrics.row_count).toBe(2);
    expect(JSON.stringify(metrics)).not.toContain("dep_1");
    expect(JSON.stringify(metrics)).not.toContain("ws_1");
  });

  it("is smaller than the V1 it projects from", () => {
    const source = v1();
    expect(Buffer.byteLength(JSON.stringify(screenEnvelopeV2From(source))))
      .toBeLessThan(Buffer.byteLength(JSON.stringify(source)));
  });
});
