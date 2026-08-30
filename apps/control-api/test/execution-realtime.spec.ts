import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { loadConfig } from "../src/config";
import { bindRealtimeLifecycle } from "../src/execution/realtime.controller";
import { parseRealtimeSnapshot, resolveResumeCursor } from "../src/execution/realtime.proxy";

const CURSOR = "018f0df0-9568-7cc2-babc-76a14ab55d2a:1842";

describe("EX-BE-06 same-origin realtime boundary", () => {
  it("uses Last-Event-ID when a native EventSource reconnect retains its original URL cursor", () => {
    expect(resolveResumeCursor(undefined, CURSOR)).toBe(CURSOR);
    expect(resolveResumeCursor(CURSOR, undefined)).toBe(CURSOR);
    expect(resolveResumeCursor(CURSOR, CURSOR)).toBe(CURSOR);

    // Native EventSource reuses the original URL (and therefore its snapshot
    // cursor) while adding the ID of the last event it delivered as a header.
    // The header is the only cursor that can continue the stream safely.
    const deliveredEventId = "018f0df0-9568-7cc2-babc-76a14ab55d2a:1843";
    expect(resolveResumeCursor(deliveredEventId, CURSOR)).toBe(deliveredEventId);

    expect(() => resolveResumeCursor(undefined, undefined)).toThrow("REALTIME_CURSOR_AMBIGUOUS");
    expect(() => resolveResumeCursor("not-a-cursor", undefined)).toThrow("REALTIME_CURSOR_INVALID");
  });

  it("fails closed unless edge, mTLS and HTTPS are configured together", () => {
    const base = {
      DATABASE_URL: "postgres://portal:portal@localhost/portal",
      PORTAL_ENV: "local",
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_REALTIME_SSE: "true",
      FEATURE_EXECUTION_SHADOW_QUERY: "true",
      FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW: "true",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/delegation.key",
      EXECUTION_EDGE_CA_FILE: "/run/secrets/ca.crt",
      EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/client.crt",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/client.key",
    };
    expect(() => loadConfig({ ...base, EXECUTION_EDGE_ORIGIN: "http://edge.internal:8443" }))
      .toThrow(/must use HTTPS/);
    expect(() => loadConfig({ ...base, EXECUTION_EDGE_CLIENT_KEY_FILE: "" }))
      .toThrow(/mTLS requires/);
    expect(loadConfig({ ...base, EXECUTION_EDGE_ORIGIN: "https://edge.internal:8443" })
      .FEATURE_EXECUTION_REALTIME_SSE).toBe("true");
  });

  it("accepts only an exact scope-bound realtime snapshot", () => {
    const value = {
      schema_version: "execution.realtime-snapshot.v1",
      delivery_profile: "shadow",
      workspace_id: "workspace_paper_binance_usdm",
      environment: "paper",
      projection_epoch: "018f0df0-9568-7cc2-babc-76a14ab55d2a",
      projection_sequence: 1842,
      cursor: CURSOR,
      stream_available: true,
      resnapshot_not_before: null,
      capability_snapshot_id: "cap-n08",
      activation_manifest_digest: `sha256:${"a".repeat(64)}`,
    };
    expect(parseRealtimeSnapshot(
      Buffer.from(JSON.stringify(value)),
      "workspace_paper_binance_usdm",
      "paper",
    )).toEqual(value);
    expect(() => parseRealtimeSnapshot(
      Buffer.from(JSON.stringify({ ...value, workspace_id: "other" })),
      "workspace_paper_binance_usdm",
      "paper",
    )).toThrow("REALTIME_SNAPSHOT_INVALID");
    expect(() => parseRealtimeSnapshot(
      Buffer.from(JSON.stringify({ ...value, command_enabled: true })),
      "workspace_paper_binance_usdm",
      "paper",
    )).toThrow("REALTIME_SNAPSHOT_INVALID");
  });

  it("accepts a profile-bound Manager projection snapshot including valid-empty Live", () => {
    const value = {
      schema_version: "execution.manager-realtime-snapshot.v2",
      delivery_profile: "current_projection",
      workspace_id: "workspace_live_binance_usdm",
      environment: "live",
      profile_id: "LIVE_BINANCE_USDM",
      projection_epoch: "018f0df0-9568-7cc2-babc-76a14ab55d2a",
      projection_sequence: 0,
      cursor: "018f0df0-9568-7cc2-babc-76a14ab55d2a:0",
      stream_available: true,
      data_state: "EMPTY_VALID",
      fact_count: 0,
      source_read_at: "2026-08-30T10:42:01Z",
      projection_state_digest: `sha256:${"b".repeat(64)}`,
      resnapshot_not_before: null,
      activation_manifest_digest: `sha256:${"c".repeat(64)}`,
    };
    expect(parseRealtimeSnapshot(
      Buffer.from(JSON.stringify(value)),
      "workspace_live_binance_usdm",
      "live",
      "LIVE_BINANCE_USDM",
    )).toEqual(value);
    expect(() => parseRealtimeSnapshot(
      Buffer.from(JSON.stringify(value)),
      "workspace_live_binance_usdm",
      "live",
      "LIVE_OTHER",
    )).toThrow("REALTIME_SNAPSHOT_INVALID");
    expect(() => parseRealtimeSnapshot(
      Buffer.from(JSON.stringify({ ...value, fact_count: 1 })),
      "workspace_live_binance_usdm",
      "live",
      "LIVE_BINANCE_USDM",
    )).toThrow("REALTIME_SNAPSHOT_INVALID");
  });

  it("requires the exact manager projection dependencies when N26 is enabled", () => {
    const base = {
      DATABASE_URL: "postgres://portal:portal@localhost/portal",
      PORTAL_ENV: "local",
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_REALTIME_SSE: "true",
      EXECUTION_REALTIME_AUTHORITY_MODE: "manager_projection",
      FEATURE_EXECUTION_ANALYTICS_QUERY: "true",
      EXECUTION_EDGE_MANAGER_V2_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_ORIGIN: "https://edge.internal:8443",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/delegation.key",
      EXECUTION_EDGE_CA_FILE: "/run/secrets/ca.crt",
      EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/client.crt",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/client.key",
    };
    expect(loadConfig(base).EXECUTION_REALTIME_AUTHORITY_MODE).toBe("manager_projection");
    expect(() => loadConfig({ ...base, FEATURE_EXECUTION_ANALYTICS_QUERY: "false" }))
      .toThrow(/manager-projection realtime requires/);
    expect(() => loadConfig({ ...base, EXECUTION_EDGE_MANAGER_V2_PROFILE_ID: "" }))
      .toThrow(/manager-projection realtime requires/);
  });

  it("cancels the private stream when the downstream response closes", async () => {
    const response = new EventEmitter();
    const upstream = Object.assign(new EventEmitter(), {
      closeCalls: [] as Array<number | undefined>,
      close(code?: number) {
        this.closeCalls.push(code);
        this.emit("close");
      },
    });
    let leaseChecks = 0;
    bindRealtimeLifecycle(response, upstream, async () => {
      leaseChecks += 1;
      return true;
    }, 5);

    response.emit("close");
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(upstream.closeCalls).toEqual([8]);
    expect(leaseChecks).toBe(0);
    expect(response.listenerCount("close")).toBe(0);
  });

  it("fails closed and releases the monitor when the session lease is lost", async () => {
    const response = Object.assign(new EventEmitter(), {
      chunks: [] as string[],
      ended: false,
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      },
      end() {
        this.ended = true;
      },
    });
    const upstream = Object.assign(new EventEmitter(), {
      closeCalls: 0,
      close() {
        this.closeCalls += 1;
        this.emit("close");
      },
    });
    bindRealtimeLifecycle(response, upstream, async () => false, 2);

    await new Promise((resolve) => setTimeout(resolve, 12));

    expect(upstream.closeCalls).toBe(1);
    expect(response.ended).toBe(true);
    expect(response.chunks.join("\n")).toContain("event: auth.expired");
    expect(response.chunks.join("\n")).toContain('"terminal":true');
    expect(response.chunks.join("\n")).toContain('"reconnect_required":false');
    expect(response.listenerCount("close")).toBe(0);
  });
});
