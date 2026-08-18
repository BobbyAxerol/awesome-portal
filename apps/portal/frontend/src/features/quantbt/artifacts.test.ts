/**
 * Artifact state classification.
 *
 * These are the three cases the old `data?.rows ?? []` idiom collapsed into
 * "empty", each of which the screen has to say something different about.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { PortalApiError, type RowsPayload } from "../../lib/api";
import { artifactExplanation, artifactStateKind, artifactTable } from "./artifacts";

/** Minimal query result: only the fields the classifier reads. */
function query(overrides: Partial<UseQueryResult<RowsPayload>>): UseQueryResult<RowsPayload> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    ...overrides,
  } as UseQueryResult<RowsPayload>;
}

describe("artifactTable", () => {
  it("reads a well-formed envelope and reports its population", () => {
    const table = artifactTable(
      query({ data: { total_rows: 40_000, returned_rows: 2, rows: [{ trial_id: 1 }, { trial_id: 2 }] } }),
    );
    expect(table.state).toBe("ready");
    expect(table.rows).toHaveLength(2);
    expect(table.population).toEqual({ total: 40_000, returned: 2, truncated: true });
  });

  it("separates an artifact with no rows from one that could not be read", () => {
    const empty = artifactTable(query({ data: { total_rows: 0, returned_rows: 0, rows: [] } }));
    expect(empty.state).toBe("empty");
    expect(empty.population.total).toBe(0);
  });

  it("calls a 404 absent, not failed, and keeps the population null", () => {
    const table = artifactTable(
      query({
        isError: true,
        error: new PortalApiError("artifact wfo/candidates.parquet not found", 404, null, "req-1"),
      }),
    );
    expect(table.state).toBe("absent");
    if (table.state === "ready") throw new Error("unreachable");
    // The distinction the funnel depends on: an absent artifact contributes no
    // number at all, where `?? []` used to contribute a zero.
    expect(table.population).toEqual({ total: null, returned: null, truncated: false });
    expect(artifactStateKind(table.state)).toBe("unavailable");
  });

  it("calls a 403 denied", () => {
    const table = artifactTable(
      query({ isError: true, error: new PortalApiError("forbidden", 403, "DENIED", null) }),
    );
    expect(table.state).toBe("denied");
    if (table.state === "ready") throw new Error("unreachable");
    expect(artifactStateKind(table.state)).toBe("denied");
  });

  it("calls a 500 failed", () => {
    const table = artifactTable(
      query({ isError: true, error: new PortalApiError("boom", 500, null, null) }),
    );
    expect(table.state).toBe("failed");
  });

  it("refuses to read a bare array as an empty artifact", () => {
    // What an API build older than the row-envelope contract returns. Read as
    // `?? []` it renders as a run with no trials at all — blank charts under a
    // provenance line claiming nothing is missing.
    const table = artifactTable(query({ data: [{ trial_id: 1 }] as unknown as RowsPayload }));
    expect(table.state).toBe("malformed");
    expect(table.rows).toEqual([]);
    expect(table.population.total).toBeNull();
    expect(artifactExplanation(table, "wfo/trials.parquet")).toContain("older build");
  });

  it("refuses a partial envelope missing its counts", () => {
    const table = artifactTable(query({ data: { rows: [] } as unknown as RowsPayload }));
    expect(table.state).toBe("malformed");
  });

  it("reports loading while the query is pending", () => {
    expect(artifactTable(query({ isPending: true })).state).toBe("loading");
  });

  it("names the artifact when explaining an absence", () => {
    const table = artifactTable(
      query({ isError: true, error: new PortalApiError("not found", 404, null, null) }),
    );
    expect(artifactExplanation(table, "wfo/candidates.parquet")).toContain("wfo/candidates.parquet");
  });
});
