import { describe, expect, it } from "vitest";
import { parseHash, routeHash } from "../src/lib/router";

describe("router", () => {
  it("keeps the legacy hashes of the views that still exist", () => {
    expect(parseHash("#view=reports")).toEqual({ view: "reports", page: null });
    expect(parseHash("#view=board")).toEqual({ view: "board", page: null });
    expect(routeHash({ view: "roadmap", page: null })).toBe("#view=roadmap");
    expect(routeHash({ view: "docs", page: "tong-quan-he-thong" })).toBe(
      "#view=docs&page=tong-quan-he-thong",
    );
  });

  it("falls back safely for unsupported hashes", () => {
    expect(parseHash("#view=unknown")).toEqual({ view: "docs", page: null });
  });

  it("degrades the views removed in v1.1 to docs instead of a blank screen", () => {
    // Interpretation, Evidence and Portal Preview were removed outright, so an
    // old bookmark must land somewhere real rather than resolve to a route
    // whose feature no longer ships.
    for (const removed of ["interpretation", "evidence", "portal"]) {
      expect(parseHash(`#view=${removed}`)).toEqual({ view: "docs", page: null });
    }
  });
});
