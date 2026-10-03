/**
 * W2B · the three retired QuantBT screens redirect to the redesigned ones.
 * The real module is mounted in a MemoryRouter; every request is a 404, so
 * the destination screens render their refusal states and the test is about
 * routing only (path, query and hash travel with the redirect).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QuantBTModule } from "./QuantBTModule";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: "NOT_UNDER_TEST", message: "not under test" } }), { status: 404 })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function Where() {
  const location = useLocation();
  return <output data-where>{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function mountAt(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/research/quantbt/*"
            element={
              <>
                <QuantBTModule />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const where = () => document.querySelector("[data-where]")?.textContent;

describe("W2B · retired QuantBT screens redirect, keeping query and hash", () => {
  it.each([
    ["/research/quantbt/new", "/research/quantbt/runs/new"],
    ["/research/quantbt/new?from=rrun_1#step=3", "/research/quantbt/runs/new?from=rrun_1#step=3"],
    ["/research/quantbt/imports", "/research/quantbt/alpha-import"],
    ["/research/quantbt/imports?x=1#h", "/research/quantbt/alpha-import?x=1#h"],
    ["/research/quantbt/runs/legacy", "/research/quantbt/runs"],
    ["/research/quantbt/runs/legacy?status=FAILED&q=abc", "/research/quantbt/runs?status=FAILED&q=abc"],
  ])("%s -> %s", async (from, to) => {
    mountAt(from);
    await waitFor(() => expect(where()).toBe(to), { timeout: 10_000 });
  });

  it("D7 · an unknown address shows a short not-found screen with one Library exit, and stays put", async () => {
    mountAt("/research/quantbt/does-not-exist-xyz");
    await waitFor(() => expect(document.querySelector("[data-research-not-found]")).not.toBeNull(), { timeout: 10_000 });
    expect(where()).toBe("/research/quantbt/does-not-exist-xyz");
    expect(document.querySelectorAll("[data-research-not-found] a")).toHaveLength(1);
  });

  it("the landing screen draws no module header (its own title is the only one)", async () => {
    mountAt("/research/quantbt");
    await waitFor(() => expect(where()).toBe("/research/quantbt"));
    expect(document.querySelector(".portal-module-header")).toBeNull();
  });

  it("a legacy result tab keeps the module header and no run count", async () => {
    mountAt("/research/quantbt/overview");
    await waitFor(() => expect(document.querySelector(".portal-module-header")).toBeTruthy());
    expect(document.querySelector(".portal-module-header")?.textContent).not.toMatch(/Runs\s*\(\d+\)/);
  });
});
