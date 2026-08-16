/**
 * Canonical Portal routes <-> legacy hash views (v0.4 §P0.10).
 *
 * The standalone app keeps its `#view=` hash router for the compatibility
 * window; the embedded module addresses the same views by path. Both read this
 * one mapping so a view can never exist under one addressing scheme only.
 */
import type { View } from "@/lib/router";

/** Canonical mount point inside the Portal shell. */
export const PLANNING_ROOT = "/planning";

/** Canonical path segment for each view, in navigation order. */
export const PLANNING_VIEWS: ReadonlyArray<{ view: View; segment: string; label: string }> = [
  { view: "docs", segment: "docs", label: "Documents" },
  { view: "roadmap", segment: "roadmap", label: "Roadmap" },
  { view: "board", segment: "board", label: "Task Board" },
  { view: "reports", segment: "reports", label: "Reports" },
  { view: "interpretation", segment: "interpretation", label: "Interpretation" },
  { view: "evidence", segment: "evidence", label: "Evidence" },
  // `#view=portal` was the Planning-local Portal mockup. Inside the real
  // Portal it is a preview of the product map, not a second product surface.
  { view: "portal", segment: "portal-preview", label: "Portal Preview" },
];

const BY_SEGMENT = new Map(PLANNING_VIEWS.map((entry) => [entry.segment, entry.view]));
const BY_VIEW = new Map(PLANNING_VIEWS.map((entry) => [entry.view, entry.segment]));

/** Canonical path for a view, optionally deep-linking a docs page. */
export function planningPath(view: View, page?: string | null): string {
  const segment = BY_VIEW.get(view) ?? "docs";
  if (view === "docs" && page) return `${PLANNING_ROOT}/docs/${encodeURIComponent(page)}`;
  return `${PLANNING_ROOT}/${segment}`;
}

export interface PlanningLocation {
  view: View;
  page: string | null;
}

/**
 * Parses a path under the Planning root.
 *
 * An unknown segment resolves to `docs`, matching the legacy hash parser, so a
 * stale link degrades to the documentation index instead of a blank screen.
 */
export function parsePlanningPath(pathname: string): PlanningLocation {
  const rest = pathname.startsWith(PLANNING_ROOT)
    ? pathname.slice(PLANNING_ROOT.length)
    : pathname;
  const [, segment = "", page = ""] = rest.split("/");
  const view = BY_SEGMENT.get(segment) ?? "docs";
  return { view, page: view === "docs" && page ? decodeURIComponent(page) : null };
}

/**
 * Translates a legacy `#view=…&page=…` hash onto a canonical path.
 *
 * Returns `null` for an empty hash so a caller can leave the location alone
 * rather than forcing a redirect to docs.
 */
export function canonicalPlanningPathFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const view = params.get("view");
  if (!view || !BY_VIEW.has(view as View)) return null;
  return planningPath(view as View, params.get("page"));
}
