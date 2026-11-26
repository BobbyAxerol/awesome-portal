/**
 * D7 (CORE_EDGE_DISPLAY_COVERAGE_MATRIX_20261125), the frontend share: the banner of branches that are not whole prints each distinct
 * code once with its count (the Portal lists one branch per relation and environment, so one code arrived 19 times), and the
 * environment-scoped reads use `selected_environment` only when the resource names one.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionApi } from "../../../../api/ports";
import { branchSummary } from "./model";
import { usePortfolioReads } from "./use360";

describe("branchSummary", () => {
  it("prints a repeated code once with its count", () => {
    expect(branchSummary(Array<string>(19).fill("EDS04_PORTFOLIO_NOT_FOUND"))).toBe("Eds04 portfolio not found (19 reads)");
  });
  it("keeps every distinct code, in the order first seen", () => {
    expect(branchSummary(["EDS04_PORTFOLIO_NOT_FOUND", "EDS07_MIRROR_READS_DISABLED", "EDS04_PORTFOLIO_NOT_FOUND"])).toBe("Eds04 portfolio not found (2 reads), Eds07 mirror reads disabled");
  });
  it("a single code carries no count", () => {
    expect(branchSummary(["X_Y"])).toBe("X y");
  });
  it("no branch, no text", () => {
    expect(branchSummary([])).toBe("");
  });
});

/** A resource body that exists but names no environment (found nowhere): the page must not ask env-scoped reads on a guess. */
describe("usePortfolioReads with a resource that names no environment", () => {
  it("asks no equity, NAV, dataset or correlation read", async () => {
    const getFinancialChart = vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "X" }));
    const getManagerSeries = vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "X" }));
    const getManagerDataset = vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "X" }));
    const getCorrelation = vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "X" }));
    const unnamed = {
      state: "partial", selectedEnvironment: null, asOfMs: null, workspaceId: null, data: {}, objects: {}, scalars: {}, capabilities: [], unavailableBranches: [], panels: {},
    };
    const api = {
      getPortfolio360Resource: async () => ({ ok: true as const, value: unnamed }),
      getPortfolioCapital: async () => ({ ok: false as const, status: "unavailable" as const, reason: "X" }),
      getCapitalLedger: async () => ({ ok: false as const, status: "unavailable" as const, reason: "X" }),
      getFinancialChart, getManagerSeries, getManagerDataset, getCorrelation,
    } as unknown as ExecutionApi;
    const { result } = renderHook(() => usePortfolioReads(api, "pf_x", true, "30D", { allocations: true, risk: true, people: false }));
    await waitFor(() => expect(result.current.resource.phase).toBe("ready"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(getFinancialChart).not.toHaveBeenCalled();
    expect(getManagerSeries).not.toHaveBeenCalled();
    expect(getManagerDataset).not.toHaveBeenCalled();
    expect(getCorrelation).not.toHaveBeenCalled();
  });
});

describe("branchSummary, portfolio found but no deployment in the read profile", () => {
  it("says the real reason instead of 'not found'", async () => {
    const { branchSummary: summary, NO_DEPLOYMENT_IN_PROFILE: code } = await import("./model");
    const text = summary(Array<string>(15).fill(code));
    expect(text).toContain("links no deployment to this portfolio");
    expect(text).toContain("(15 reads)");
    expect(text).not.toMatch(/not found/i);
  });
});
