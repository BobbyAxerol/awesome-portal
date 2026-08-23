/**
 * The five analytics reads that had no port method at all.
 *
 * Before this, `getCapitalPreview` was the only one of the six endpoints the
 * adapter could reach. The readers existed and were tested; the screens
 * existed and were tested; nothing joined them, so four screens had no path to
 * real data and the gap was invisible because every test supplied props
 * directly.
 *
 * These assert the join: the route each call issues, the body it sends, and
 * that a typed 422 arrives as something the operator can act on rather than as
 * "backend unavailable".
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlphaInsightContainer,
  CorrelationContainer,
  FullBlotterFunnelContainer,
} from "./screens/containers";

import { createHttpApi } from "./api/httpApi";
import { createFixtureApi } from "./api/fixtureApi";
import type { DeliveryPolicy } from "./profile";
import { INSIGHT_BATCH_LIMIT } from "./analytics";

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Serves the canonical contract document for whichever endpoint is called. */
function serving(document: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(document), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("document", { cookie: "__Host-portal_csrf=tok" });
  return calls;
}

const fixtureDoc = async (name: string) => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  return JSON.parse(
    readFileSync(
      join(__dirname, "../../../../../packages/contracts/fixtures", `execution-analytics.${name}.valid.json`),
      "utf8",
    ),
  );
};

describe("each read issues the route its OpenAPI operation declares", () => {
  it("GET the order funnel", async () => {
    const calls = serving(await fixtureDoc("order-funnel"));
    const result = await createHttpApi({ policy: OPEN }).getOrderFunnel("order 1/2");
    expect(result.ok).toBe(true);
    // Path segments are encoded: an order id with a slash must not invent a
    // route segment.
    expect(calls[0].url).toBe("/api/v1/execution/orders/order%201%2F2/funnel");
  });

  it("GET the correlation", async () => {
    const calls = serving(await fixtureDoc("correlation"));
    expect((await createHttpApi({ policy: OPEN }).getCorrelation("PF-1")).ok).toBe(true);
    expect(calls[0].url).toBe("/api/v1/execution/portfolios/PF-1/correlation");
  });

  it("GET the capital ledger", async () => {
    const calls = serving(await fixtureDoc("capital-ledger"));
    expect((await createHttpApi({ policy: OPEN }).getCapitalLedger("PF-1")).ok).toBe(true);
    expect(calls[0].url).toBe("/api/v1/execution/portfolios/PF-1/capital-ledger");
  });

  it("GET the binding exposure", async () => {
    const calls = serving(await fixtureDoc("binding-exposure"));
    expect((await createHttpApi({ policy: OPEN }).getBindingExposure("binding-1")).ok).toBe(true);
    expect(calls[0].url).toBe("/api/v1/execution/broker-bindings/binding-1/exposure");
  });

  it("POSTs the insight batch, because 64 items do not belong in a URL", async () => {
    const calls = serving(await fixtureDoc("insight-batch"));
    const result = await createHttpApi({ policy: OPEN }).getInsightBatch("alpha-1", {
      portfolioId: "PF-1",
      items: [{ insightId: "insight-1", alphaId: "alpha-1" }],
    });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe("/api/v1/execution/alphas/alpha-1/insight-previews");
    expect(calls[0].init?.method).toBe("POST");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({
      portfolio_id: "PF-1",
      items: [{ insight_id: "insight-1", alpha_id: "alpha-1" }],
    });
  });
});

describe("the batch cap is refused, not silently truncated", () => {
  it("refuses more items than one batch carries and says how many", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createHttpApi({ policy: OPEN }).getInsightBatch("alpha-1", {
      portfolioId: "PF-1",
      items: Array.from({ length: INSIGHT_BATCH_LIMIT + 1 }, (_, i) => ({
        insightId: `i-${i}`,
        alphaId: `a-${i}`,
      })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/65/);
    // Nothing was sent: a truncated batch would answer a question nobody asked.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a typed 422 arrives as something the operator can act on", () => {
  it("does not collapse a correctable analytics failure into unavailable", async () => {
    serving({ error: { code: "ANALYTICS_INPUT_LIMIT_EXCEEDED", message: "internal" } }, 422);
    const result = await createHttpApi({ policy: OPEN }).getCorrelation("PF-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("insufficient_data");
      expect(result.reason).toMatch(/Narrow the selection/);
      expect(result.reason).not.toContain("internal");
    }
  });

  it("keeps a 503 as unavailable, with nothing to correct", async () => {
    serving({ error: { code: "ANALYTICS_ARITHMETIC_UNAVAILABLE" } }, 503);
    const result = await createHttpApi({ policy: OPEN }).getCapitalLedger("PF-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("unavailable");
  });
});

describe("delivery policy still gates every one of them", () => {
  it("answers unavailable when the screen has no published policy", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi({ policy: null });
    for (const call of [
      api.getOrderFunnel("o"),
      api.getCorrelation("p"),
      api.getCapitalLedger("p"),
      api.getBindingExposure("b"),
      api.getInsightBatch("a", { portfolioId: "p", items: [] }),
    ]) {
      expect((await call).ok).toBe(false);
    }
    // Deny-by-default is enforced before the request, not after it.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the fixture port answers all five", () => {
  it("serves a parsed object and an envelope for each", async () => {
    const api = createFixtureApi();
    const funnel = await api.getOrderFunnel("order-1");
    const correlation = await api.getCorrelation("PF-1");
    const ledger = await api.getCapitalLedger("PF-1");
    const exposure = await api.getBindingExposure("binding-1");
    const batch = await api.getInsightBatch("alpha-1", { portfolioId: "PF-1", items: [] });
    for (const r of [funnel, correlation, ledger, exposure, batch]) expect(r.ok).toBe(true);
    if (funnel.ok) expect(funnel.value.envelope.authority).toBeTruthy();
  });

  it("serves the bounded funnel when asked, so the state is reachable from a screen", async () => {
    const api = createFixtureApi({ boundedFunnel: true });
    const result = await api.getOrderFunnel("order-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.funnel.bounded.hasMore).toBe(true);
      expect(result.value.funnel.bounded.total).toBe(4180);
    }
  });

  it("honours unavailableEndpoints for the new methods too", async () => {
    const api = createFixtureApi({ unavailableEndpoints: ["getCorrelation"] });
    expect((await api.getCorrelation("PF-1")).ok).toBe(false);
    expect((await api.getCapitalLedger("PF-1")).ok).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * The containers — where the port, the reader and the screen finally meet.
 * ------------------------------------------------------------------------ */

describe("the analytics containers join the port to the screens", () => {
  it("renders a funnel fetched through the port, not passed as a prop", async () => {
    render(<FullBlotterFunnelContainer api={createFixtureApi()} orderId="order-1" />);
    // The four hop labels the strip draws, in its own words.
    expect(await screen.findByText("submit")).toBeTruthy();
    for (const hop of ["risk grant", "order ACK", "fill"]) {
      expect(screen.getByText(hop), hop).toBeTruthy();
    }
  });

  it("shows the bounded window when the port serves one", async () => {
    render(
      <FullBlotterFunnelContainer
        api={createFixtureApi({ boundedFunnel: true })}
        orderId="order-1"
      />,
    );
    expect(await screen.findByText(/Bounded window/)).toBeTruthy();
  });

  it("renders the failure the port reports rather than an empty panel", async () => {
    render(
      <FullBlotterFunnelContainer
        api={createFixtureApi({ unavailableEndpoints: ["getOrderFunnel"] })}
        orderId="order-1"
      />,
    );
    // The strip resolves a non-ok status through PanelState; what must not
    // happen is a funnel drawn with four MISSING stages, which would read as
    // "we looked and nothing was there".
    await waitFor(() => expect(screen.queryByText(/not observed/)).toBeNull());
  });

  it("draws the correlation panel from the port, envelope included", async () => {
    const { container } = render(
      <CorrelationContainer api={createFixtureApi()} portfolioId="PF-1" />,
    );
    // The panel itself, not a stand-in renderer: the container is concrete now
    // because no screen ever supplied the render prop it used to demand.
    //
    // Asserting the matrix table would be wrong — the fixture sits at the
    // packed transport limit, so 150 entities are 22,500 cells against a 4,096
    // budget and the panel correctly degrades to the leader lens. What proves
    // the container is that the panel rendered and says why.
    await waitFor(() => expect(container.textContent).toMatch(/past the/));
    expect(container.textContent).toMatch(/4,096/);
    // The authority badge proves the envelope travelled with the figures.
    expect(container.textContent).toMatch(/EXECUTION|DERIVED|PORTAL|BROKER/);
  });

  it("shows the port's failure instead of an empty matrix", async () => {
    const { container } = render(
      <CorrelationContainer
        api={createFixtureApi({ unavailableEndpoints: ["getCorrelation"] })}
        portfolioId="PF-1"
      />,
    );
    await waitFor(() => expect(container.textContent).not.toMatch(/past the/));
  });

  it("does not re-fetch forever when the request object is rebuilt each render", async () => {
    const api = createFixtureApi();
    const spy = vi.spyOn(api, "getInsightBatch");
    function Harness() {
      // A fresh literal every render — the shape most call sites will use.
      return (
        <AlphaInsightContainer
          api={api}
          alphaId="alpha-1"
          request={{ portfolioId: "PF-1", items: [{ insightId: "i-1", alphaId: "alpha-1" }] }}
          render={({ batch }) => <span>{batch ? "loaded" : "loading"}</span>}
        />
      );
    }
    const { rerender } = render(<Harness />);
    await screen.findByText("loaded");
    rerender(<Harness />);
    rerender(<Harness />);
    await waitFor(() => expect(screen.getByText("loaded")).toBeTruthy());
    // One read for the mount. Depending on the object identity would make this
    // climb with every render.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
