/**
 * ExecCommandBar · the V2 bar bound to the registry, the session's capabilities and the router.
 * Role is never an input: every assertion is about which capabilities open which rows.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { PortalRegistryDocument } from "../../../portal/contracts";
import type { NavOptions } from "../../../portal/navigation";
import { ENTITY_SEARCH_NOTICE, EXEC_COMMAND_PLACEHOLDER, ExecCommandBar, execGoToEntries } from "./ExecCommandBar";
import { V2_CAPABILITY, V2_NAV_TOKEN, V2_ROLE_PRESETS } from "./roleNav";

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);
const PROFILE = "administration.profile_access.manage";

const options = (capabilities: readonly string[]): NavOptions => ({ capabilities });
const ids = (capabilities: readonly string[]) => execGoToEntries(registry, options(capabilities)).map((entry) => entry.id);

describe("execGoToEntries", () => {
  it("fails closed: with no capabilities only the entries that need none are offered", () => {
    const ids = execGoToEntries(registry, options([])).map((entry) => entry.id);
    expect(ids).toContain("go:EXECUTION_COMMAND_CENTER");
    expect(ids).toContain("go:EXECUTION_ALPHA_FLEET");
    for (const gated of ["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_OPERATIONS", "EXECUTION_APPROVALS", "EXECUTION_BLOTTER", "PROFILE_ACCESS"]) {
      expect(ids, gated).not.toContain(`go:${gated}`);
    }
  });

  it("offers a gated entry only to somebody who holds its capability", () => {
    expect(ids([V2_NAV_TOKEN.accounts])).toContain("go:EXECUTION_ACCOUNTS_BINDINGS");
    expect(ids([V2_NAV_TOKEN.accounts])).not.toContain("go:EXECUTION_OPERATIONS");
    expect(ids([V2_NAV_TOKEN.operations])).toContain("go:EXECUTION_OPERATIONS");
    expect(ids([V2_NAV_TOKEN.portfolios])).toContain("go:EXECUTION_PORTFOLIOS");
    expect(ids([V2_NAV_TOKEN.blotter])).toContain("go:EXECUTION_BLOTTER");
    expect(ids([V2_CAPABILITY.governanceLiveRead])).toContain("go:EXECUTION_APPROVALS");
    // The registry layer gates Profile & Access on its own enforced capability.
    expect(ids([PROFILE])).toContain("go:PROFILE_ACCESS");
  });

  it("filters by the capability list, not by a role name: a researcher loses Accounts and Portfolios", () => {
    const researcher = ids([...V2_ROLE_PRESETS.researcher]);
    expect(researcher).toEqual(expect.arrayContaining(["go:EXECUTION_COMMAND_CENTER", "go:EXECUTION_ALPHA_FLEET", "go:EXECUTION_APPROVALS"]));
    for (const hidden of ["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_OPERATIONS", "EXECUTION_BLOTTER"]) {
      expect(researcher, hidden).not.toContain(`go:${hidden}`);
    }
    const manager = ids([...V2_ROLE_PRESETS.manager]);
    expect(manager).toEqual(
      expect.arrayContaining(
        ["COMMAND_CENTER", "PORTFOLIOS", "ALPHA_FLEET", "ACCOUNTS_BINDINGS", "OPERATIONS", "APPROVALS", "BLOTTER"].map((id) => `go:EXECUTION_${id}`),
      ),
    );
  });

  it("invents no capability and no route: every row is a registry feature's canonical route", () => {
    const entries = execGoToEntries(registry, options([...V2_ROLE_PRESETS.manager, PROFILE]));
    const routes = new Set(registry.features.map((feature) => feature.canonical_route));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.group).toBe("Go to");
      expect(routes.has(entry.href), entry.href).toBe(true);
    }
  });

  it("keeps the registry's own visibility rules for link-only rows (Blotter off the sidebar is still not offered when hidden)", () => {
    const hidden: PortalRegistryDocument = {
      ...registry,
      features: registry.features.map((feature) => (feature.id === "EXECUTION_BLOTTER" ? { ...feature, maturity: "HIDDEN" as const } : feature)),
    };
    const offered = execGoToEntries(hidden, options([V2_NAV_TOKEN.blotter])).map((entry) => entry.id);
    expect(offered).not.toContain("go:EXECUTION_BLOTTER");
    expect(execGoToEntries(registry, options([V2_NAV_TOKEN.blotter])).map((entry) => entry.id)).toContain("go:EXECUTION_BLOTTER");
  });
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function Harness({ capabilities, initial = "/execution?env=paper&window=30d&ccy=USD&tab=x" }: { capabilities: readonly string[]; initial?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter initialEntries={[initial]}>
      <button onClick={() => setOpen(true)}>Open bar</button>
      <ExecCommandBar registry={registry} options={options(capabilities)} open={open} onClose={() => setOpen(false)} />
      <Where />
    </MemoryRouter>
  );
}

function openBar(capabilities: readonly string[], initial?: string) {
  render(<Harness capabilities={capabilities} initial={initial} />);
  const opener = screen.getByRole("button", { name: "Open bar" });
  opener.focus();
  fireEvent.click(opener);
  return { opener, input: screen.getByRole("combobox") as HTMLInputElement };
}

describe("ExecCommandBar rendering", () => {
  it("is an accessible modal dialog whose input says why entity search is absent", () => {
    const { input } = openBar([...V2_ROLE_PRESETS.manager]);
    const dialog = screen.getByRole("dialog", { name: "Command bar" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(input.getAttribute("placeholder")).toBe(EXEC_COMMAND_PLACEHOLDER);
    const notice = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(notice?.textContent).toBe(ENTITY_SEARCH_NOTICE);
    expect(ENTITY_SEARCH_NOTICE).toContain("Not published (FE-023)");
    expect(screen.queryByText(/Search alphas/)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("lists only the permitted Go to rows", () => {
    openBar([V2_NAV_TOKEN.accounts]);
    const rows = screen.getAllByRole("option").map((row) => row.textContent);
    expect(rows).toContain("Accounts");
    expect(rows).not.toContain("Operations");
    expect(rows).not.toContain("Portfolios");
  });

  it("offers a typed filter over the permitted rows, and never a row the caller cannot enter", () => {
    const { input } = openBar([V2_NAV_TOKEN.accounts]);
    fireEvent.change(input, { target: { value: "operations" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getAllByText("No result").length).toBeGreaterThan(0);
  });
});

describe("ExecCommandBar navigation", () => {
  it("navigates to the chosen row and carries env, window and currency over, leaving screen-local params behind", () => {
    const { input } = openBar([V2_NAV_TOKEN.accounts]);
    fireEvent.change(input, { target: { value: "accounts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const where = screen.getByTestId("where").textContent ?? "";
    const url = new URL(where, "http://x");
    expect(url.pathname).toBe("/deployments/accounts");
    expect(url.searchParams.get("env")).toBe("paper");
    expect(url.searchParams.get("window")).toBe("30D".toLowerCase());
    expect(url.searchParams.get("ccy")).toBe("USD");
    expect(url.searchParams.has("tab")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("navigates on click and plain URLs stay plain when there is no context to carry", () => {
    openBar([], "/execution");
    fireEvent.click(screen.getByRole("option", { name: "Alpha Fleet" }));
    expect(screen.getByTestId("where").textContent).toBe("/deployments/alphas");
  });
});

describe("ExecCommandBar keyboard and focus", () => {
  it("Escape closes the bar and returns focus to the opener", () => {
    const { opener, input } = openBar([...V2_ROLE_PRESETS.manager]);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("arrows move the active row and Enter opens it", () => {
    const { input } = openBar([...V2_ROLE_PRESETS.manager], "/execution");
    const first = screen.getAllByRole("option")[0].textContent;
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe(first);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = screen.getAllByRole("option")[1].textContent;
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe(second);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).not.toBe("/execution");
  });

  it("traps Tab inside the dialog", () => {
    const { input } = openBar([...V2_ROLE_PRESETS.manager]);
    // The input is the only tabbable element; Tab from it must stay on it.
    input.focus();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(input);
  });
});
