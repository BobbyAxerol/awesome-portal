/**
 * W4 · CG-P08-04 (Control API side): the research dataset catalog BFF.
 * A strict bounded read of the private P08 adapter; any drift, oversize or
 * auth failure is a typed refusal, never a partial or guessed catalog.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ResearchDatasetCatalogClient } from "../src/research/dataset-catalog.client";
import { ResearchDatasetCatalogController } from "../src/research/dataset-catalog.controller";
import { ResearchPreflightError } from "../src/research/preflight.error";

const user = { userId: "u1", username: "u1", role: "ADMIN", mustChangePassword: false } as never;
const config = {
  INTERNAL_PRINCIPAL_SECRET: "w4-test-principal-secret-0123456789",
  PORTAL_API_BASE_URL: "http://portal-api.test",
  RESEARCH_PREFLIGHT_TIMEOUT_MS: 1_000,
} as never;

const catalog = {
  schema_version: "research.dataset-catalog.v1",
  coverage_rule: "Month partitions only.",
  datasets: [{
    dataset_id: "crypto-binance-1m", venue: "BINANCE", availability: "available", unavailable_reason: null,
    source_class: "historical_market_data", usage_scopes: ["backtest", "research"], excluded_scopes: [],
    source_timezone: "UTC", calendar_policy: "CRYPTO_24_7", timeframes: ["1min", "1h", "4h", "1D"],
    symbols: {
      state: "PUBLISHED", reason: null, total: 1, truncated: false,
      items: [{ symbol: "BTCUSDT", contract_kind: "PERPETUAL", coverage: { first_month: "2020-01", last_month: "2026-09", months: 81, granularity: "MONTH_PARTITION" } }],
    },
  }],
};

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

async function refusal(promise: Promise<unknown>): Promise<ResearchPreflightError> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(ResearchPreflightError);
    return error as ResearchPreflightError;
  }
  throw new Error("expected a typed refusal");
}

afterEach(() => vi.unstubAllGlobals());

describe("CG-P08-04 research dataset catalog", () => {
  it("returns the strict bounded catalog through a signed private call", async () => {
    respond(200, catalog);
    const client = new ResearchDatasetCatalogClient(config);
    expect(await client.read(user)).toEqual(catalog);
    const call = (fetch as unknown as { mock: { calls: [URL, RequestInit][] } }).mock.calls[0]!;
    expect(String(call[0])).toBe("http://portal-api.test/internal/research/datasets");
    expect((call[1].headers as Record<string, string>)["x-portal-principal"]).toBeTruthy();
  });

  it("refuses a drifted document, a private auth failure and an outage with typed codes", async () => {
    const client = new ResearchDatasetCatalogClient(config);
    respond(200, { ...catalog, extra: true });
    expect((await refusal(client.read(user))).code).toBe("RESEARCH_PREFLIGHT_REJECTED");
    respond(401, { detail: "private service authentication failed" });
    expect((await refusal(client.read(user))).status).toBe(503);
    respond(503, { detail: "historical dataset catalog is unavailable" });
    expect((await refusal(client.read(user))).code).toBe("RESEARCH_PREFLIGHT_UNAVAILABLE");
    respond(200, { ...catalog, datasets: [{ ...catalog.datasets[0], symbols: { ...catalog.datasets[0]!.symbols, items: [{ symbol: "../etc", contract_kind: null, coverage: null }] } }] });
    expect((await refusal(client.read(user))).code).toBe("RESEARCH_PREFLIGHT_REJECTED");
  });

  it("answers a non-member with 404 before any private call", async () => {
    const read = vi.fn();
    const controller = new ResearchDatasetCatalogController({ read } as never, { isMember: async () => false } as never);
    const error = await refusal(controller.list({ portalUser: user, portalWorkspaceId: "w1" } as never, {}));
    expect(error.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    expect((await refusal(controller.list({ portalUser: user, portalWorkspaceId: "w1" } as never, { extra: "1" }))).status).toBe(400);
  });
});
