/**
 * U05 route-adapter tests.
 *
 * The mapping lives in the Planning source so the standalone hash router and
 * the embedded path router can never disagree about which views exist. These
 * tests run from the Portal side, through the same build alias the app uses,
 * which also proves the alias resolves.
 */
import { describe, expect, it } from "vitest";

import {
  PLANNING_ROOT,
  PLANNING_VIEWS,
  canonicalPlanningPathFromHash,
  parsePlanningPath,
  planningPath,
} from "@/embedded/planningRoutes";
import { parseHash, type View } from "@/lib/router";

const LEGACY_VIEWS: View[] = [
  "docs",
  "roadmap",
  "board",
  "reports",
  "interpretation",
  "evidence",
  "portal",
];

describe("view coverage", () => {
  it("maps every view the legacy hash router accepts", () => {
    const mapped = PLANNING_VIEWS.map((entry) => entry.view);
    expect(new Set(mapped)).toEqual(new Set(LEGACY_VIEWS));
  });

  it("gives each view a distinct canonical segment", () => {
    const segments = PLANNING_VIEWS.map((entry) => entry.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });
});

describe("path round-trip", () => {
  it("parses back every canonical path it produces", () => {
    for (const { view } of PLANNING_VIEWS) {
      expect(parsePlanningPath(planningPath(view)).view).toBe(view);
    }
  });

  it("carries a docs page id through the path", () => {
    const path = planningPath("docs", "tong-quan-he-thong");
    expect(path).toBe(`${PLANNING_ROOT}/docs/tong-quan-he-thong`);
    expect(parsePlanningPath(path)).toEqual({ view: "docs", page: "tong-quan-he-thong" });
  });

  it("round-trips a page id that needs escaping", () => {
    // The id is percent-encoded on the way out, so an embedded slash stays
    // part of the id instead of being read as another path segment.
    const path = planningPath("docs", "a b/c");
    expect(path).toBe(`${PLANNING_ROOT}/docs/a%20b%2Fc`);
    expect(parsePlanningPath(path).page).toBe("a b/c");
  });

  it("degrades an unknown segment to docs, matching the legacy parser", () => {
    expect(parsePlanningPath(`${PLANNING_ROOT}/not-a-view`).view).toBe("docs");
    expect(parseHash("#view=not-a-view").view).toBe("docs");
  });

  it("carries no page for non-docs views", () => {
    expect(parsePlanningPath(`${PLANNING_ROOT}/board`).page).toBeNull();
  });
});

describe("legacy hash adapter", () => {
  it("translates every legacy hash the standalone app produces", () => {
    for (const view of LEGACY_VIEWS) {
      expect(canonicalPlanningPathFromHash(`#view=${view}`)).toBe(planningPath(view));
    }
  });

  it("translates a docs deep link with its page", () => {
    expect(canonicalPlanningPathFromHash("#view=docs&page=tong-quan-he-thong")).toBe(
      `${PLANNING_ROOT}/docs/tong-quan-he-thong`,
    );
  });

  it("renames the Planning-local portal mockup to a preview route", () => {
    // Inside the real Portal this view is a preview, not a second product
    // surface (v0.4 §P0.7).
    expect(canonicalPlanningPathFromHash("#view=portal")).toBe(`${PLANNING_ROOT}/portal-preview`);
  });

  it("leaves the location alone for an empty or unknown hash", () => {
    expect(canonicalPlanningPathFromHash("")).toBeNull();
    expect(canonicalPlanningPathFromHash("#")).toBeNull();
    expect(canonicalPlanningPathFromHash("#view=nope")).toBeNull();
    expect(canonicalPlanningPathFromHash("#other=1")).toBeNull();
  });
});
