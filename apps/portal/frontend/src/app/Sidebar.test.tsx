/**
 * The left rail with the V2 shell flag on and off (UXM-07 D1, FE-039, M13).
 *
 * Flag off the rail is the registry's sidebar, link for link; `PortalShell.flagOff.test` holds the DOM digest.
 * Flag on it is the V2 overlay: capability-filtered, one Approvals, and Execution links carry the shared context.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";
import { V2_ROLE_PRESETS } from "../execution/v2/shell/roleNav";
import { sidebarGroups } from "../portal/navigation";
import { Sidebar, railGroups } from "./Sidebar";

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);
const PROFILE = "administration.profile_access.manage";

function rail(v2Shell: boolean, capabilities: readonly string[], url = "/execution") {
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <Sidebar registry={registry} options={{ capabilities }} collapsed={false} v2Shell={v2Shell} />
    </MemoryRouter>,
  );
  const links = [...view.container.querySelectorAll<HTMLAnchorElement>("a.portal-navitem")].map((a) => ({
    label: a.querySelector(".portal-navitem-label")?.textContent ?? "",
    href: a.getAttribute("href") ?? "",
  }));
  const groups = [...view.container.querySelectorAll(".portal-navgroup-label")].map((n) => n.textContent);
  return { ...view, links, groups };
}
const labels = (links: { label: string }[]) => links.map((l) => l.label);

describe("flag off", () => {
  it("lists exactly the registry's sidebar, with its own labels and bare canonical routes", () => {
    const { links, groups } = rail(false, [...V2_ROLE_PRESETS.manager], "/execution?env=paper&workspace_id=ws_1");
    const expected = sidebarGroups(registry, { capabilities: [...V2_ROLE_PRESETS.manager] }).flatMap((g) => g.features);
    expect(links).toEqual(expected.map((f) => ({ label: f.label, href: f.canonical_route })));
    expect(groups).toEqual(sidebarGroups(registry, { capabilities: [...V2_ROLE_PRESETS.manager] }).map((g) => g.group.label));
  });

  it("still carries both Approvals entries, Paper, Sandbox, Live, Waivers and Exit Reviews (nothing is filtered)", () => {
    const { links } = rail(false, []);
    const hrefs = links.map((l) => l.href);
    for (const route of ["/backtests/approvals", "/governance/approvals", "/deployments/paper", "/deployments/sandbox", "/deployments/live", "/governance/waivers", "/governance/exit-reviews"]) {
      expect(hrefs).toContain(route);
    }
  });

  it("is the default when no prop is given (the build flag is off in this suite)", () => {
    const view = render(
      <MemoryRouter><Sidebar registry={registry} options={{}} collapsed={false} /></MemoryRouter>,
    );
    expect(view.container.querySelectorAll("a.portal-navitem").length).toBe(sidebarGroups(registry, {}).flatMap((g) => g.features).length);
  });
});

describe("flag on", () => {
  it("D1: the manager's rail is the V2 overlay in V2 order, under one Execution group", () => {
    const { links, groups } = rail(true, [...V2_ROLE_PRESETS.manager, PROFILE]);
    expect(groups).toContain("Execution");
    const execution = railGroups(registry, { capabilities: [...V2_ROLE_PRESETS.manager, PROFILE] }, true, "").find((g) => g.id === "execution");
    expect(execution?.items.map((i) => i.label)).toEqual(["Overview", "Portfolios", "Alpha Fleet", "Accounts", "Operations", "Approvals"]);
    const hrefs = links.map((l) => l.href);
    for (const gone of ["/deployments/paper", "/deployments/sandbox", "/deployments/live", "/governance/waivers", "/governance/exit-reviews", "/deployments/blotter", "/administration/actions"]) {
      expect(hrefs).not.toContain(gone);
    }
  });

  it("capability filtering: a researcher loses Portfolios, Accounts and Operations; no capability loses the scoped Approvals (the old stub stays)", () => {
    const researcher = labels(rail(true, [...V2_ROLE_PRESETS.researcher]).links);
    expect(researcher).toEqual(expect.arrayContaining(["Overview", "Alpha Fleet", "Approvals"]));
    for (const gone of ["Portfolios", "Accounts", "Operations"]) expect(researcher).not.toContain(gone);
    cleanup();
    const nobody = labels(rail(true, []).links);
    expect(nobody).toEqual(expect.arrayContaining(["Overview", "Alpha Fleet"]));
    for (const gone of ["Portfolios", "Accounts", "Operations"]) expect(nobody).not.toContain(gone);
    // The scoped Approvals is hidden for this caller, so the registry stub it replaces is kept (one Approvals, never zero).
    const hrefs = rail(true, []).links.map((l) => l.href);
    expect(hrefs).not.toContain("/governance/approvals");
    expect(hrefs).toContain("/backtests/approvals");
  });

  it("FE-039: the old APPROVALS entry is hidden, so there is one Approvals and it is the governance one", () => {
    const { links } = rail(true, [...V2_ROLE_PRESETS.manager]);
    const approvals = links.filter((l) => /approvals/i.test(l.label) || l.href.includes("approvals"));
    expect(approvals.map((l) => l.href.split("?")[0])).toEqual(["/governance/approvals"]);
    expect(links.map((l) => l.href.split("?")[0])).not.toContain("/backtests/approvals");
    // The flag-off rail still lists both (asserted above): the replacement is a V2 rail rule, not a registry change.
  });

  it("FE-039: a caller who cannot see the scoped Approvals keeps the old stub, so Approvals does not vanish", () => {
    const { links } = rail(true, []);
    expect(links.map((l) => l.href.split("?")[0])).toContain("/backtests/approvals");
    expect(links.map((l) => l.href.split("?")[0])).not.toContain("/governance/approvals");
  });

  it("only the exact route is current: /execution/operations marks Operations, not Overview", () => {
    const current = (url: string, v2Shell = true) => {
      const view = render(
        <MemoryRouter initialEntries={[url]}>
          <Sidebar registry={registry} options={{ capabilities: [...V2_ROLE_PRESETS.manager] }} collapsed={false} v2Shell={v2Shell} />
        </MemoryRouter>,
      );
      const active = [...view.container.querySelectorAll("a.portal-navitem-active")].map((a) => a.querySelector(".portal-navitem-label")?.textContent);
      cleanup();
      return active;
    };
    expect(current("/execution")).toEqual(["Overview"]);
    expect(current("/execution?env=paper&workspace_id=ws_1")).toEqual(["Overview"]);
    expect(current("/execution/operations")).toEqual(["Operations"]);
    expect(current("/execution/operations?operation=op_1")).toEqual(["Operations"]);
    // Flag off: the rail is what it was (prefix match), so the parent entry still lights up on a child route.
    expect(current("/execution/operations", false)).toHaveLength(2);
  });

  it("Research and Planning entries keep their registry labels and plain hrefs", () => {
    const { links } = rail(true, [...V2_ROLE_PRESETS.manager], "/execution?env=paper&workspace_id=ws_1&window=30d");
    for (const route of ["/research/quantbt", "/planning", "/portal-map", "/research/alphas"]) {
      expect(links.find((l) => l.href === route), route).toBeDefined();
    }
  });

  it("M13: Execution links carry workspace_id, env, window and ccy like the command bar; screen-local params and `from` do not travel", () => {
    const { links } = rail(
      true,
      [...V2_ROLE_PRESETS.manager, PROFILE],
      "/deployments/alphas?workspace_id=ws_1&env=paper&window=30d&ccy=usd&sel=al_9&q=carry&stage=paper&from=portfolios",
    );
    const overview = links.find((l) => l.label === "Overview")!;
    expect(overview.href.startsWith("/execution?")).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(overview.href.split("?")[1]))).toEqual({
      env: "paper", window: "30d", ccy: "USD", workspace_id: "ws_1",
    });
    for (const label of ["Portfolios", "Alpha Fleet", "Accounts", "Operations", "Approvals", "Profile & Access"]) {
      const href = links.find((l) => l.label === label)?.href ?? "";
      expect(new URLSearchParams(href.split("?")[1]).get("workspace_id"), label).toBe("ws_1");
      expect(href, label).not.toMatch(/sel=|q=carry|stage=|from=/);
    }
  });

  it("defaults stay out of the carried context, and a bare URL gives bare links", () => {
    const { links } = rail(true, [...V2_ROLE_PRESETS.manager], "/execution?env=live&window=90d");
    expect(links.find((l) => l.label === "Overview")!.href).toBe("/execution");
    cleanup();
    expect(rail(true, [...V2_ROLE_PRESETS.manager], "/execution").links.find((l) => l.label === "Operations")!.href).toBe("/execution/operations");
  });

  it("an invalid context value is dropped, not propagated", () => {
    const { links } = rail(true, [...V2_ROLE_PRESETS.manager], "/execution?env=xx&workspace_id=ws_1");
    expect(links.find((l) => l.label === "Overview")!.href).toBe("/execution?workspace_id=ws_1");
  });

  it("the collapsed rail keeps the V2 label for assistive tech", () => {
    const view = render(
      <MemoryRouter>
        <Sidebar registry={registry} options={{ capabilities: [...V2_ROLE_PRESETS.manager] }} collapsed v2Shell />
      </MemoryRouter>,
    );
    const names = [...view.container.querySelectorAll("a.portal-navitem .sr-only")].map((n) => n.textContent);
    expect(names).toEqual(expect.arrayContaining(["Overview", "Alpha Fleet", "Approvals"]));
  });
});

describe("W3 · the Navigation unavailable line (notice prop)", () => {
  const notice = ({ collapsed }: { collapsed: boolean }) => <div data-testid="notice" data-collapsed={String(collapsed)}>Navigation unavailable: test</div>;
  const mountWith = (v2Shell: boolean, collapsed = false, withNotice = true) =>
    render(
      <MemoryRouter>
        <Sidebar registry={registry} options={{ capabilities: [...V2_ROLE_PRESETS.manager] }} collapsed={collapsed} v2Shell={v2Shell} notice={withNotice ? notice : undefined} />
      </MemoryRouter>,
    );

  it("flag on: drawn first inside the rail's own <nav>, which keeps its name and its entries", () => {
    const view = mountWith(true);
    const nav = view.getByRole("navigation", { name: "Primary navigation" });
    expect(nav.firstElementChild?.getAttribute("data-testid")).toBe("notice");
    expect(nav.querySelectorAll("a.portal-navitem").length).toBeGreaterThan(0);
    expect(view.getAllByRole("navigation")).toHaveLength(1);
  });

  it("the collapsed state is handed to the notice", () => {
    expect(mountWith(true, true).getByTestId("notice").getAttribute("data-collapsed")).toBe("true");
  });

  it("flag off: the prop is ignored, the DOM is exactly the one without it", () => {
    const withNotice = mountWith(false);
    const html = withNotice.container.innerHTML;
    withNotice.unmount();
    expect(mountWith(false, false, false).container.innerHTML).toBe(html);
    expect(html).not.toContain("Navigation unavailable");
  });

  it("flag on without a notice: no extra element, the first child is the first group", () => {
    const view = mountWith(true, false, false);
    expect(view.container.querySelector("[data-testid=notice]")).toBeNull();
    expect(view.container.querySelector("nav")?.firstElementChild?.className).toBe("portal-navgroup");
  });
});
