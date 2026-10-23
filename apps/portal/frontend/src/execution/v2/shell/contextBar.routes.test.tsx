/**
 * The persistent context bar on every V2 route (WP-D, audit 2026-10-23 section 4): environment, window, basis and scope are each
 * either a pressed choice the data follows or a typed fact. The locks come from the route table itself (`envLockFor`,
 * `windowLockFor`), so a route changing its read changes this table.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { envLockFor, windowLockFor } from "../../ExecutionPreviewRoute";
import { BASIS_EACH_CURRENCY, ConnectedContextBar, SCOPE_EVERY_PORTFOLIO } from "./ContextBar";
import { useContextFacts } from "./contextFacts";

afterEach(cleanup);

const allOn = () => true;

function Facts({ ccy, scope }: { ccy?: string | null; scope?: string | null }) {
  useContextFacts({ ccy, scope });
  return null;
}

function mount(screenId: string, url: string, path = "*", context: Parameters<typeof envLockFor>[1] = {}, facts?: { ccy?: string | null; scope?: string | null }) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path={path}
          element={
            <>
              {facts ? <Facts {...facts} /> : null}
              <ConnectedContextBar envLock={envLockFor(screenId, context, allOn) ?? null} windowLock={windowLockFor(screenId, context, allOn)} />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const bar = () => screen.getByRole("group", { name: "Context" });
const chip = (kind: string) => bar().querySelector(`[data-control="${kind}"]`);

describe("window chips: drawn only where the server applies the window", () => {
  it.each([
    ["Overview", "EXECUTION_COMMAND_CENTER_SCREEN", "/execution", "*", {}],
    ["Portfolio 360", "EXECUTION_PORTFOLIO_360_SCREEN", "/deployments/portfolios/pf_1", "/deployments/portfolios/:portfolioId", {}],
    ["Portfolios", "EXECUTION_PORTFOLIO_360_SCREEN", "/deployments/portfolios", "*", {}],
    ["Compare", "EXECUTION_COMPARE_SCREEN", "/deployments/compare", "*", {}],
  ] as const)("%s shows 7D 30D 90D ALL, pressed from the URL", (_name, screenId, url, path, context) => {
    mount(screenId, `${url}?window=30d`, path, context);
    const group = screen.getByRole("group", { name: "Window" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["7D", "30D", "90D", "ALL"]);
    expect(screen.getByRole("button", { name: "30D" }).getAttribute("aria-pressed")).toBe("true");
    expect(bar().textContent).not.toMatch(/Not applied: [^·]*Window/);
  });

  it.each([
    ["Alpha Fleet", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", {}],
    ["Approvals", "EXECUTION_APPROVAL_INBOX_SCREEN", {}],
    ["Admin", "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN", {}],
    ["Alpha 360", "EXECUTION_ALPHA_360_SCREEN", { hasAlphaId: true }],
    ["Account", "EXECUTION_ACCOUNT_BROKER_360_SCREEN", {}],
    ["Incident", "EXECUTION_INCIDENT_DETAIL_SCREEN", {}],
  ] as const)("%s says the window is not applied and draws no window button", (_name, screenId, context) => {
    mount(screenId, "/x?window=30d", "*", context);
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    expect(bar().textContent).toMatch(/Not applied: .*Window/);
  });

  it.each([
    ["Blotter", "EXECUTION_FULL_BLOTTER_SCREEN", {}, "Window: Current retained window"],
    ["Workbench", "EXECUTION_PAPER_WORKBENCH_SCREEN", { hasDeploymentId: true }, "Window: Published window"],
    ["Sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", { hasDeploymentId: true }, "Window: Certification run"],
    ["Canary", "EXECUTION_CANARY_CONTROL_ROOM_SCREEN", { hasDeploymentId: true }, "Window: Trial window"],
    ["Live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", { hasDeploymentId: true }, "Window: Since activation"],
  ] as const)("%s names the window its read fixes, never a pressed button", (_name, screenId, context, text) => {
    mount(screenId, "/x", "*", context);
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    expect(bar().textContent).toContain(text);
  });

  it("Operations points at its own range", () => {
    mount("EXECUTION_OPERATIONS_QUEUE_SCREEN", "/execution/operations");
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    expect(bar().textContent).toContain("Own range below");
  });
});

describe("environment: pressed choice, path-fixed chip, or typed Not applied", () => {
  it("Overview keeps the three buttons, Real-funded pressed by default", () => {
    mount("EXECUTION_COMMAND_CENTER_SCREEN", "/execution");
    expect(screen.getByRole("button", { name: "Real-funded" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Paper" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sandbox" })).toBeTruthy();
  });

  it("a deployment route draws its environment as a chip, not buttons", () => {
    mount("EXECUTION_PAPER_WORKBENCH_SCREEN", "/deployments/paper/d1", "*", { hasDeploymentId: true });
    expect(screen.queryByRole("group", { name: "Environment" })).toBeNull();
    expect(chip("env")?.textContent).toBe("Paper");
  });

  it("the Fleet and Approvals say the environment is not applied", () => {
    mount("EXECUTION_ALPHA_FLEET_LIST_SCREEN", "/deployments/alphas");
    expect(bar().textContent).toMatch(/Not applied: Environment, Window/);
    cleanup();
    mount("EXECUTION_APPROVAL_INBOX_SCREEN", "/governance/approvals");
    expect(bar().textContent).toMatch(/Not applied: Environment, Window/);
  });
});

describe("basis and scope: typed facts on every route, never controls", () => {
  const ROUTES_UNDER_TEST = [
    ["EXECUTION_COMMAND_CENTER_SCREEN", "/execution", {}],
    ["EXECUTION_ALPHA_FLEET_LIST_SCREEN", "/deployments/alphas", {}],
    ["EXECUTION_OPERATIONS_QUEUE_SCREEN", "/execution/operations", {}],
    ["EXECUTION_APPROVAL_INBOX_SCREEN", "/governance/approvals", {}],
    ["EXECUTION_FULL_BLOTTER_SCREEN", "/deployments/blotter", {}],
    ["EXECUTION_ADMIN_ACTION_DRAWER_SCREEN", "/administration/actions", {}],
    ["EXECUTION_COMPARE_SCREEN", "/deployments/compare", {}],
    ["EXECUTION_PAPER_WORKBENCH_SCREEN", "/deployments/paper/d1", { hasDeploymentId: true }],
  ] as const;

  it.each(ROUTES_UNDER_TEST)("%s states each currency on its own and the published scope", (screenId, url, context) => {
    mount(screenId, url, "*", context);
    expect(chip("basis")?.textContent).toBe(BASIS_EACH_CURRENCY);
    expect(chip("basis")?.getAttribute("title")).toMatch(/never converted/);
    expect(chip("scope")?.textContent).toBe(SCOPE_EVERY_PORTFOLIO);
    expect(chip("scope")?.getAttribute("title")).toMatch(/No scope parameter is published/);
  });

  it("neither chip is a control: no button, no select, no link inside them", () => {
    mount("EXECUTION_COMMAND_CENTER_SCREEN", "/execution");
    for (const kind of ["basis", "scope"]) {
      const node = chip(kind)!;
      expect(node.tagName).toBe("SPAN");
      expect(node.querySelector("button, select, a, input")).toBeNull();
    }
    // Nothing in the bar offers a basis or FX choice.
    expect(bar().textContent).not.toMatch(/FX|convert to|display currency/i);
  });

  it("a Portfolio screen names its portfolio as the scope", () => {
    mount("EXECUTION_PORTFOLIO_360_SCREEN", "/deployments/portfolios/pf_alpha", "/deployments/portfolios/:portfolioId");
    expect(chip("scope")?.textContent).toBe("Scope: portfolio pf_alpha");
  });

  it("the portfolio register (no id) keeps the published default scope", () => {
    mount("EXECUTION_PORTFOLIO_360_SCREEN", "/deployments/portfolios", "*");
    expect(chip("scope")?.textContent).toBe(SCOPE_EVERY_PORTFOLIO);
  });

  it("a screen that states one currency changes the basis chip to that currency, not to a conversion", () => {
    mount("EXECUTION_ACCOUNT_BROKER_360_SCREEN", "/deployments/accounts/a1", "*", {}, { ccy: "USDT" });
    expect(chip("basis")?.textContent).toBe("Basis: USDT, one currency");
  });

  it("a screen's own server-derived scope statement wins over the default", () => {
    mount("EXECUTION_ALPHA_FLEET_LIST_SCREEN", "/deployments/alphas", "*", {}, { scope: "Scope: Your alphas" });
    expect(chip("scope")?.textContent).toBe("Scope: Your alphas");
  });
});
