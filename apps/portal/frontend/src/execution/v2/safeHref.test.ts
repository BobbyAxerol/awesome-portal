/**
 * `safeInternalHref`: a server-supplied link reaches the router only as an in-app path.
 * react-router treats `//host`, `/\host` and `scheme:` as external, so none of them may pass.
 */
import { describe, expect, it } from "vitest";

import { safeInternalHref } from "./safeHref";
import { safeInternalHref as liveExport } from "./screens/live/model";

describe("safeInternalHref", () => {
  it.each([
    ["//evil.example"],
    ["/\\evil.example"],
    ["/\tevil"],
    ["/\nevil"],
    ["/\u0000evil"],
    ["javascript:x"],
    ["https://x"],
    ["http://x"],
    ["evil.example/x"],
    [""],
    ["\\\\evil.example"],
    ["/" + "a".repeat(600)],
  ])("refuses %j", (href) => {
    expect(safeInternalHref(href)).toBeNull();
  });

  it("refuses non-strings", () => {
    expect(safeInternalHref(null)).toBeNull();
    expect(safeInternalHref(undefined)).toBeNull();
  });

  it.each([["/governance/approvals/AP-1/r1"], ["/deployments/live/dep_1/canary?tab=a&b=c"], ["/"]])("keeps %s", (href) => {
    expect(safeInternalHref(href)).toBe(href);
  });

  it("is the same function Live exports (one rule, three screens)", () => {
    expect(liveExport).toBe(safeInternalHref);
  });
});
