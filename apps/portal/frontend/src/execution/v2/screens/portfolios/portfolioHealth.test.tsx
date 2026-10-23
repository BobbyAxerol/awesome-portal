/** WP-K slice 6 (N3): the portfolio health roll-up, read strictly from the published list and drawn in the Health column. */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readPortfolioList } from "../../../api/profileRead";
import { loadCanonical } from "../../testkit/loadCanonical";
import { toRows } from "./listModel";
import { PortfolioTable } from "./PortfolioTable";
import { DEFAULT_ROUTES } from "./routes";

afterEach(cleanup);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const body = (): Draft => structuredClone(loadCanonical<Draft>("execution-portfolio-list.health.valid.json"));
const read = (raw: unknown) => readPortfolioList(raw);

describe("the reader", () => {
  it("the L0 list (no health) reads as before; the health fixture reads a published worst-of roll-up and a typed absence", () => {
    const l0 = read(loadCanonical<Draft>("execution-portfolio-list.valid.json"));
    expect(l0?.items.every((i) => i.health === undefined)).toBe(true);
    const list = read(body())!;
    expect(list.items[0]!.health).toEqual({ state: "PUBLISHED", value: "ATTENTION", asOf: "2026-09-02T09:59:41Z", deploymentsByHealth: { HEALTHY: 1, ATTENTION: 1, DEGRADED: 0, HALTED: 0 } });
    expect(list.items[1]!.health).toEqual({ state: "NOT_PUBLISHED", reasonCode: "DEPLOYMENT_HEALTH_NOT_PUBLISHED" });
  });
  it.each([
    ["a value that is not the worst class that has a deployment", (b: Draft) => { b.items[0].health.value = "HEALTHY"; }],
    ["counts that exceed the portfolio's deployment_count", (b: Draft) => { b.items[0].health.deployments_by_health.HEALTHY = 5; }],
    ["a published roll-up over zero deployments", (b: Draft) => { b.items[0].health.deployments_by_health = { HEALTHY: 0, ATTENTION: 0, DEGRADED: 0, HALTED: 0 }; }],
    ["a published roll-up with a reason", (b: Draft) => { b.items[0].health.reason_code = "NO"; }],
    ["a basis other than worst-of", (b: Draft) => { b.items[0].health.basis = "AVERAGE"; }],
    ["an absence that carries a value", (b: Draft) => { b.items[1].health.value = "HEALTHY"; }],
    ["an unknown key", (b: Draft) => { b.items[0].health.score = 3; }],
    ["a health that is not an object", (b: Draft) => { b.items[0].health = "HEALTHY"; }],
  ])("a malformed health voids the whole read: %s", (_name, mutate) => {
    const b = body();
    mutate(b);
    expect(read(b)).toBeNull();
  });
});

describe("the Health column", () => {
  const draw = () => render(
    <MemoryRouter>
      <PortfolioTable rows={toRows(read(body())!.items)} hidden={new Set()} routes={DEFAULT_ROUTES} search={new URLSearchParams()} selected={new Set()} onToggle={() => undefined} />
    </MemoryRouter>,
  );
  it("draws the roll-up class with the counts in its title, and the lifecycle state when no roll-up is published", () => {
    draw();
    const rollup = screen.getAllByTestId("health-rollup");
    expect(rollup).toHaveLength(1);
    expect(within(rollup[0]!).getByText("Attention")).toBeTruthy();
    expect(rollup[0]!.getAttribute("title")).toMatch(/1 healthy, 1 attention, 0 degraded, 0 halted .* lifecycle Active/);
    const absent = screen.getAllByTestId("health-absent");
    expect(absent).toHaveLength(1);
    expect(absent[0]!.textContent).toContain("DEPLOYMENT_HEALTH_NOT_PUBLISHED");
  });
  it("a list without health keeps the lifecycle flag and no roll-up marks", () => {
    render(
      <MemoryRouter>
        <PortfolioTable rows={toRows(read(loadCanonical<Draft>("execution-portfolio-list.valid.json"))!.items)} hidden={new Set()} routes={DEFAULT_ROUTES} search={new URLSearchParams()} selected={new Set()} onToggle={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.queryAllByTestId("health-rollup")).toHaveLength(0);
    expect(screen.queryAllByTestId("health-absent")).toHaveLength(0);
  });
});
