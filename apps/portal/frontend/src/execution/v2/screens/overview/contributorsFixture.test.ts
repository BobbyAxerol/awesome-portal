// @vitest-environment node
/**
 * The populated review lane answers the Overview's alpha_id-grouped FUND read (FE-CAT-5) through the unmodified production HTTP
 * port and reader: groups per partition, one group with a published true zero and one with a net_pnl that is a typed absence.
 * The sparse lane (the original L0 double) is not changed and offers no alpha group, so the panel keeps its typed absence.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerReviewManager } from "../../../../../../fixture-bff/review-manager";
import { setFixtureNow, setFixtureScale } from "../../../../../e2e/bffScale";
import { createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";
import { contributorsView } from "./contributorsModel";

const OPEN: DeliveryPolicy = { policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: false, sseEnabled: false,
  governanceWriteEnabled: false, paperCommandsEnabled: false, sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false };

function populated() {
  setFixtureScale("medium");
  setFixtureNow("2026-10-22T12:00:00Z");
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input), "http://fixture.test");
    const response = answerReviewManager("GET", url.pathname, url.searchParams, "populated");
    return new Response(JSON.stringify(response?.body ?? { error: { code: "FIXTURE_GAP" } }), { status: response?.status ?? 501, headers: { "content-type": "application/json" } });
  });
  return createHttpApi({ policy: OPEN, readScope: {} });
}
afterEach(() => {
  vi.unstubAllGlobals();
  setFixtureScale("small");
  setFixtureNow("2026-08-22T13:00:00Z");
});

describe("populated lane: FUND grouped by alpha_id", () => {
  it("is accepted by the production reader and port as the question asked, with a published zero and a typed absence", async () => {
    const api = populated();
    const ask = { surface: "FUND" as const, environment: "paper" as const, window: "30D" as const, groupBy: ["alpha_id" as const], limit: 1 };
    const fundResult = await api.getManagerDataset({ surface: "FUND", environment: "paper", window: "30D" });
    const result = await api.getManagerDataset(ask);
    expect(fundResult.ok, JSON.stringify(fundResult)).toBe(true);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!fundResult.ok || !result.ok) return;
    const view = contributorsView({ served: true, fundRead: { phase: "ready", value: fundResult.value, warnings: [] }, fund: fundResult.value, grouped: { phase: "ready", value: result.value, warnings: [] } });
    expect(view.kind).toBe("ready");
    if (view.kind !== "ready") return;
    expect(view.groups.length).toBeGreaterThan(2);
    const amounts = view.groups.flatMap((g) => g.lines.map((l) => l.amount));
    expect(amounts.some((m) => m?.kind === "value" && m.zero)).toBe(true);
    expect(amounts.some((m) => m?.kind === "absent" && m.reasonCode === "SOURCE_FACTS_NOT_PUBLISHED")).toBe(true);
    expect(view.groups.every((g) => g.alphaId !== null && g.uniqueRowCount >= 1)).toBe(true);
    expect(new Set(view.groups.map((g) => g.alphaId)).size).toBe(view.groups.length);
    expect(view.population.authorizedFilteredCount).toBeGreaterThanOrEqual(view.groups.length);
  });

  it("answers the same question for another window and environment (the groups follow the page's selection)", async () => {
    const api = populated();
    for (const window of ["7D", "90D"] as const) {
      const result = await api.getManagerDataset({ surface: "FUND", environment: "paper", window, groupBy: ["alpha_id"], limit: 1 });
      expect(result.ok, window).toBe(true);
      if (result.ok) expect(result.value.selectedWindow?.requested).toBe(window);
    }
  });
});
