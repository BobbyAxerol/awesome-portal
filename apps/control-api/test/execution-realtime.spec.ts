import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { loadConfig } from "../src/config";
import { bindRealtimeLifecycle } from "../src/execution/realtime.controller";
import { resolveResumeCursor } from "../src/execution/realtime.proxy";

const CURSOR = "018f0df0-9568-7cc2-babc-76a14ab55d2a:1842";

describe("EX-BE-06 same-origin realtime boundary", () => {
  it("requires one exact snapshot or Last-Event-ID cursor", () => {
    expect(resolveResumeCursor(undefined, CURSOR)).toBe(CURSOR);
    expect(resolveResumeCursor(CURSOR, undefined)).toBe(CURSOR);
    expect(resolveResumeCursor(CURSOR, CURSOR)).toBe(CURSOR);
    expect(() => resolveResumeCursor(undefined, undefined)).toThrow("REALTIME_CURSOR_AMBIGUOUS");
    expect(() => resolveResumeCursor(CURSOR, `${CURSOR}0`)).toThrow("REALTIME_CURSOR_AMBIGUOUS");
    expect(() => resolveResumeCursor("not-a-cursor", undefined)).toThrow("REALTIME_CURSOR_INVALID");
  });

  it("fails closed unless edge, mTLS and HTTPS are configured together", () => {
    const base = {
      DATABASE_URL: "postgres://portal:portal@localhost/portal",
      PORTAL_ENV: "local",
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_REALTIME_SSE: "true",
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
    const response = new EventEmitter();
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
    expect(response.listenerCount("close")).toBe(0);
  });
});
