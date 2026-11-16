import { describe, expect, it } from "vitest";
import { CurrentSourceProxyError } from "../src/execution/current-source.proxy";
import { deferReasonCode } from "../src/execution/profile-projection.worker";

// Offline: no database. Edge answers a Manager that is connected to another database than the pinned one with HTTP 502 and the
// typed code MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH; Core must record its own stable reason, not a generic rejection.
describe("profile projection: durable reason of a deferred refresh", () => {
  it("a database-identity mismatch is recorded as N31_SOURCE_DATABASE_CHANGED", () => {
    const error = new CurrentSourceProxyError("N17B_SOURCE_REJECTED", 502, {
      availability: "UNAVAILABLE", reason_code: "MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH", retryable: false,
    });
    expect(deferReasonCode(error)).toBe("N31_SOURCE_DATABASE_CHANGED");
  });
  it("any other source rejection keeps its own code", () => {
    const error = new CurrentSourceProxyError("N17B_SOURCE_REJECTED", 502, {
      availability: "UNAVAILABLE", reason_code: "MANAGER_V2_SOURCE_UNAVAILABLE", retryable: false,
    });
    expect(deferReasonCode(error)).toBe("N17B_SOURCE_REJECTED");
  });
  it("a plain failure without details keeps the generic code", () => {
    expect(deferReasonCode(new Error("boom"))).toBe("N31_SOURCE_REFRESH_FAILED");
  });
});
