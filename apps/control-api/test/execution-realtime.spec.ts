import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
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
});
