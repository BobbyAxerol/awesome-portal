/**
 * The Paper profile selection through the real HTTP client (`fetch` stubbed): the three profile-routed reads carry `profile_id`
 * only while a non-default profile is selected on a Paper route, and the Paper-bound reads Core does not route by profile answer
 * "unavailable" instead of drawing the default profile's numbers under another profile's name.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeliveryPolicy } from "../profile";
import { createHttpApi } from "./httpApi";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
const api = () => createHttpApi({ policy: OPEN, readScope: {} });

function at(url: string): string[] {
  window.history.replaceState({}, "", url);
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => {
    calls.push(path);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("Paper profile selection at the HTTP port", () => {
  it("sends no profile_id by default", async () => {
    const calls = at("/deployments/paper");
    await api().getScreenProfile("paper");
    await api().getPaperWorkbenchProfile("dep_1");
    await api().getBlotterProfile({ limit: 50 });
    expect(calls.map((c) => c.replace(/^.*\/screens/, "/screens"))).toEqual(["/screens/paper", "/screens/paper/dep_1", "/screens/blotter?limit=50"]);
  });

  it("sends profile_id on the three routed reads when a profile is selected on a Paper route", async () => {
    const calls = at("/deployments/paper/dep_1?paper_profile=PAPER_OKX_SWAP");
    await api().getScreenProfile("paper");
    await api().getPaperWorkbenchProfile("dep_1", "vnm");
    await api().getBlotterProfile({ limit: 50 });
    expect(calls.map((c) => c.replace(/^.*\/screens/, "/screens"))).toEqual([
      "/screens/paper?profile_id=PAPER_OKX_SWAP",
      "/screens/paper/dep_1/vn-market?profile_id=PAPER_OKX_SWAP",
      "/screens/blotter?limit=50&profile_id=PAPER_OKX_SWAP",
    ]);
  });

  it("ignores the param off a Paper route and never routes sandbox/live reads by it", async () => {
    const calls = at("/fleet?paper_profile=PAPER_OKX_SWAP");
    await api().getScreenProfile("paper");
    expect(calls[0]).not.toContain("profile_id");
    at("/deployments/paper?paper_profile=PAPER_OKX_SWAP");
    const sandbox = at("/deployments/paper?paper_profile=PAPER_OKX_SWAP");
    await api().getScreenProfile("sandbox");
    expect(sandbox[0]).not.toContain("profile_id");
  });

  it("refuses to draw Paper-bound reads that are not routed per profile while a non-default profile is selected", async () => {
    const calls = at("/deployments/paper/dep_1?paper_profile=PAPER_OKX_SWAP");
    const quality = await api().getDeploymentQuality("dep_1", "paper");
    const sparks = await api().getEquitySparklines("paper");
    const mirror = await api().getMirrorIntegrity("paper");
    for (const result of [quality, sparks, mirror]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("selected Paper profile");
    }
    expect(calls).toHaveLength(0);
    // Sandbox/live reads are untouched.
    await api().getDeploymentQuality("dep_1", "sandbox");
    expect(calls).toHaveLength(1);
  });
});

describe("Paper profile selection on a Portfolio 360 page", () => {
  it("routes the resource and the paper capital read by the selected profile, and leaves the default byte-identical", async () => {
    let calls = at("/deployments/portfolios/pf_1?paper_profile=PAPER_OKX_SWAP");
    await api().getPortfolio360Resource("pf_1");
    await api().getPortfolioCapital("pf_1", "paper");
    await api().getPortfolioCapital("pf_1", "live");
    expect(calls.map((c) => c.replace(/^.*\/(resources|derivations)/, "/$1"))).toEqual([
      "/resources/portfolios/pf_1?profile_id=PAPER_OKX_SWAP",
      "/derivations/portfolios/pf_1/capital?environment=paper&profile_id=PAPER_OKX_SWAP",
      "/derivations/portfolios/pf_1/capital?environment=live",
    ]);
    calls = at("/deployments/portfolios/pf_1");
    await api().getPortfolio360Resource("pf_1");
    await api().getPortfolioCapital("pf_1", "paper");
    expect(calls.map((c) => c.replace(/^.*\/(resources|derivations)/, "/$1"))).toEqual([
      "/resources/portfolios/pf_1", "/derivations/portfolios/pf_1/capital?environment=paper",
    ]);
  });
});

describe("Paper profile selection on an Account 360 page", () => {
  it("routes the account resource by the selected profile and leaves the default byte-identical", async () => {
    let calls = at("/deployments/accounts/acct_1?paper_profile=PAPER_OKX_SWAP");
    await api().getAccount360Resource("acct_1");
    expect(calls.map((c) => c.replace(/^.*\/resources/, "/resources"))).toEqual(["/resources/accounts/acct_1?profile_id=PAPER_OKX_SWAP"]);
    calls = at("/deployments/accounts/acct_1");
    await api().getAccount360Resource("acct_1");
    expect(calls.map((c) => c.replace(/^.*\/resources/, "/resources"))).toEqual(["/resources/accounts/acct_1"]);
  });
});
