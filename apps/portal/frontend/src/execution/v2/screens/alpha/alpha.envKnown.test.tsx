/**
 * D5 (CORE_EDGE_DISPLAY_COVERAGE_MATRIX_20261125): Alpha 360 sent `environment=live` for a paper alpha because, with no usable resource,
 * the book fell back to the URL default. The environment of an env-scoped read must come from the alpha's own deployments or from an
 * `env` the address names; with neither, the read is not asked (no guess for the Portal to answer with a 400).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID } from "../../../../../e2e/bffDoubleAlpha";
import AlphaScreen from "./index";
import { alphaHttpApi, serveAlphaDouble, sessionOf } from "./testApi";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = sessionOf(["governance.r1.read"]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const envCalls = (calls: readonly string[]) => calls.filter((url) => /[?&]environment=/.test(url));

function mount(entry: string, alphaId: string) {
  const served = serveAlphaDouble();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaScreen api={alphaHttpApi()} alphaId={alphaId} />
    </MemoryRouter>,
  );
  return served;
}

describe("the book of an env-scoped read", () => {
  it("a resource that could not be read leaves no read naming an environment the page guessed", async () => {
    const served = mount("/deployments/alphas/alpha_down", "alpha_down");
    expect((await screen.findAllByText(/could not be read/)).length).toBeGreaterThan(0);
    // Give any (wrongly) enabled effect its turn before asserting an absence.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(served.callsTo("/resources/alphas/alpha_down").length).toBeGreaterThan(0);
    expect(envCalls(served.calls)).toEqual([]);
  });

  it("an environment the address names is the author's choice and is used", async () => {
    const served = mount("/deployments/alphas/alpha_down?env=paper", "alpha_down");
    expect((await screen.findAllByText(/could not be read/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(envCalls(served.calls).length).toBeGreaterThan(0));
    expect(envCalls(served.calls).every((url) => /[?&]environment=paper(&|$)/.test(url))).toBe(true);
  });

  it("a readable alpha still asks its own deployed book, never another", async () => {
    const served = mount(`/deployments/alphas/${ALPHA_DOUBLE_ID}`, ALPHA_DOUBLE_ID);
    await screen.findByRole("heading", { level: 1, name: new RegExp(ALPHA_DOUBLE_ID) });
    await waitFor(() => expect(envCalls(served.calls).length).toBeGreaterThan(0));
    const books = new Set(envCalls(served.calls).map((url) => new URL(url, "http://portal.test").searchParams.get("environment")));
    expect(books.size).toBe(1);
  });
});
