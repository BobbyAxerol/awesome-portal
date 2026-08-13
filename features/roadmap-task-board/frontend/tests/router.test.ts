import { describe, expect, it } from "vitest";
import { parseHash, routeHash } from "../src/lib/router";

describe("router", () => {
  it("keeps legacy routes and supports the lazy interpretation route", () => {
    expect(parseHash("#view=reports")).toEqual({ view: "reports", page: null });
    expect(parseHash("#view=interpretation")).toEqual({ view: "interpretation", page: null });
    expect(routeHash({ view: "interpretation", page: null })).toBe("#view=interpretation");
  });

  it("falls back safely for unsupported hashes", () => {
    expect(parseHash("#view=unknown")).toEqual({ view: "docs", page: null });
  });
});
