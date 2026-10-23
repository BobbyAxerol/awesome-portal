/**
 * The nav is a function of capabilities, never of a role name (review2/05 D11-D12).
 * The four presets are named sets of capabilities used here as test data; the
 * assertions are about which entries a capability set opens.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { PortalRegistryDocument } from "../../../portal/contracts";
import { sidebarGroups } from "../../../portal/navigation";
import { GO_TO_GROUP, V2_NAV_TOKEN, V2_NAV_RULES, V2_ROLE_PRESETS, applyV2Nav, filterEntriesByCapabilities, goToEntries, holds, v2Crumbs, type CommandEntry, type V2RolePreset } from "./roleNav";

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);

// The profile entry is gated by the registry layer; grant it so the overlay is what is under test.
const groups = sidebarGroups(registry, { capabilities: ["administration.profile_access.manage"] });

const labels = (capabilities: ReadonlySet<string>) =>
  applyV2Nav(groups, capabilities).flatMap((group) => group.items.map((item) => item.label));
const executionLabels = (capabilities: ReadonlySet<string>) =>
  applyV2Nav(groups, capabilities).find((group) => group.id === "execution")?.items.map((item) => item.label) ?? [];

describe("holds", () => {
  const caps = new Set(["a", "b"]);

  it("treats no need as open and checks allOf and anyOf together", () => {
    expect(holds(caps, undefined)).toBe(true);
    expect(holds(caps, { allOf: ["a", "b"] })).toBe(true);
    expect(holds(caps, { allOf: ["a", "c"] })).toBe(false);
    expect(holds(caps, { anyOf: ["c", "b"] })).toBe(true);
    expect(holds(caps, { allOf: ["a"], anyOf: ["c"] })).toBe(false);
  });

  it("fails closed on an empty anyOf", () => {
    expect(holds(caps, { anyOf: [] })).toBe(false);
  });
});

describe("applyV2Nav presets", () => {
  const expected: Record<V2RolePreset, string[]> = {
    manager: ["Overview", "Portfolios", "Alpha Fleet", "Accounts", "Operations", "Approvals", "Blotter"],
    researcher: ["Overview", "Alpha Fleet", "Approvals"],
    operator: ["Overview", "Portfolios", "Alpha Fleet", "Accounts", "Operations", "Blotter"],
    reviewer: ["Overview", "Portfolios", "Alpha Fleet", "Approvals"],
  };

  for (const preset of Object.keys(expected) as V2RolePreset[]) {
    it(`${preset}: lists exactly its Execution entries, in V2 order`, () => {
      expect(executionLabels(V2_ROLE_PRESETS[preset])).toEqual(expected[preset]);
    });
  }

  it("gives the manager eight rail entries (Blotter included, from the registry) with Profile & Access", () => {
    const out = applyV2Nav(groups, V2_ROLE_PRESETS.manager);
    const admin = out.find((group) => group.id === "administration")?.items.map((item) => item.label) ?? [];
    expect(admin).toEqual(["Profile & Access"]);
    expect(executionLabels(V2_ROLE_PRESETS.manager).length + admin.length).toBe(8);
  });

  it("hides Accounts and Portfolios from the researcher", () => {
    const all = labels(V2_ROLE_PRESETS.researcher);
    expect(all).not.toContain("Accounts");
    expect(all).not.toContain("Portfolios");
  });

  it("lists nothing guarded for a caller with no capabilities, and keeps the open entries", () => {
    expect(executionLabels(new Set())).toEqual(["Overview", "Alpha Fleet"]);
  });

  it("lists Blotter (the registry has it) and never Waivers, Exit Reviews, Admin Actions or the stage routes in the rail", () => {
    const all = labels(V2_ROLE_PRESETS.manager);
    expect(all).toContain("Blotter");
    expect(labels(V2_ROLE_PRESETS.researcher)).not.toContain("Blotter");
    for (const gone of ["Waivers", "Exit Reviews", "Admin Actions", "Paper Trading", "Sandbox", "Live Operations"]) {
      expect(all, gone).not.toContain(gone);
    }
  });

  it("follows the capability, not a name: a researcher holding accounts.read gets Accounts", () => {
    const extended = new Set([...V2_ROLE_PRESETS.researcher, V2_NAV_TOKEN.accounts]);
    expect(executionLabels(extended)).toContain("Accounts");
  });

  it("keeps features it has no rule for, in their registry group and order", () => {
    const research = applyV2Nav(groups, new Set()).find((group) => group.id === "research");
    const registryResearch = groups.find((entry) => entry.group.id === "research");
    expect(research?.items.map((item) => item.featureId)).toEqual(registryResearch?.features.map((f) => f.id));
  });

  it("puts the Execution group where its first entry sat and never invents an empty group", () => {
    const out = applyV2Nav(groups, V2_ROLE_PRESETS.manager);
    expect(out.every((group) => group.items.length > 0)).toBe(true);
    const ids = out.map((group) => group.id);
    expect(ids.indexOf("execution")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("execution")).toBeLessThan(ids.indexOf("research"));
  });

  it("FE-039: a feature that carries navigation.scoped_v2_replacement is dropped from the rail and the Go to list", () => {
    const stub = groups.flatMap((entry) => entry.features).find((feature) => feature.id === "APPROVALS");
    // The fixture is registry rev 7: the old stub names its replacement.
    expect(stub?.navigation.scoped_v2_replacement).toEqual({ read_mode: "SCOPED_V2", feature_id: "EXECUTION_APPROVALS" });
    const items = applyV2Nav(groups, V2_ROLE_PRESETS.manager).flatMap((group) => group.items);
    expect(items.map((item) => item.featureId)).not.toContain("APPROVALS");
    expect(items.filter((item) => item.label === "Approvals").map((item) => item.route)).toEqual(["/governance/approvals"]);
    expect(goToEntries(groups, V2_ROLE_PRESETS.manager).map((entry) => entry.id)).not.toContain("go:APPROVALS");
  });

  it("the stub stays when its replacement is hidden by capability (a caller with no approval read keeps APPROVALS)", () => {
    const items = applyV2Nav(groups, new Set()).flatMap((group) => group.items);
    expect(items.map((item) => item.featureId)).not.toContain("EXECUTION_APPROVALS");
    expect(items.map((item) => item.featureId)).toContain("APPROVALS");
    expect(goToEntries(groups, new Set()).map((entry) => entry.id)).toContain("go:APPROVALS");
  });

  it("the stub stays when the replacement is not listed in the registry groups at all", () => {
    const patched = groups.map((entry) => ({ ...entry, features: entry.features.filter((feature) => feature.id !== "EXECUTION_APPROVALS") }));
    expect(applyV2Nav(patched, V2_ROLE_PRESETS.manager).flatMap((group) => group.items).map((item) => item.featureId)).toContain("APPROVALS");
  });

  it("a null scoped_v2_replacement does not hide anything", () => {
    const patched = groups.map((entry) => ({
      ...entry,
      features: entry.features.map((feature) => feature.id === "APPROVALS" ? { ...feature, navigation: { ...feature.navigation, scoped_v2_replacement: null } } : feature),
    }));
    expect(applyV2Nav(patched, new Set()).flatMap((group) => group.items).map((item) => item.featureId)).toContain("APPROVALS");
  });

  it("carriesContext is true for the Execution entries and Profile & Access, false for Research and Planning", () => {
    const items = applyV2Nav(groups, V2_ROLE_PRESETS.manager).flatMap((group) => group.items);
    const flag = (id: string) => items.find((item) => item.featureId === id)?.carriesContext;
    for (const id of ["EXECUTION_COMMAND_CENTER", "EXECUTION_PORTFOLIOS", "EXECUTION_ALPHA_FLEET", "EXECUTION_APPROVALS", "PROFILE_ACCESS"]) expect(flag(id), id).toBe(true);
    for (const id of ["QUANTBT_RESEARCH", "PLANNING", "PORTAL_MAP", "ALPHA_POOL"]) expect(flag(id), id).toBe(false);
  });

  it("keeps the registry feature on each item so icon and route stay registry-owned", () => {
    const item = applyV2Nav(groups, V2_ROLE_PRESETS.manager)
      .flatMap((group) => group.items)
      .find((entry) => entry.label === "Alpha Fleet");
    expect(item?.route).toBe("/deployments/alphas");
    expect(item?.feature.id).toBe("EXECUTION_ALPHA_FLEET");
  });
});

describe("rule table", () => {
  it("never mentions a role name", () => {
    const text = JSON.stringify(V2_NAV_RULES).toLowerCase();
    for (const role of ["manager", "researcher", "operator", "reviewer"]) expect(text).not.toContain(role);
  });

  it("names every rail and link-only entry", () => {
    for (const rule of V2_NAV_RULES) {
      if (rule.surface !== "hidden") expect(rule.label, rule.featureId).toBeTruthy();
    }
  });
});

describe("goToEntries and filterEntriesByCapabilities", () => {
  it("offers the rail entries including Blotter for a manager, and its route resolves from the registry", () => {
    const entries = goToEntries(groups, V2_ROLE_PRESETS.manager);
    expect(entries.every((entry) => entry.group === GO_TO_GROUP)).toBe(true);
    const names = entries.map((entry) => entry.label);
    expect(names).toContain("Blotter");
    expect(entries.find((entry) => entry.label === "Blotter")?.href).toBe("/deployments/blotter");
  });

  it("omits Blotter and the guarded rows for a researcher", () => {
    const names = goToEntries(groups, V2_ROLE_PRESETS.researcher).map((entry) => entry.label);
    expect(names).not.toContain("Blotter");
    expect(names).not.toContain("Accounts");
    expect(names).toContain("Approvals");
  });

  it("still finds Blotter when a registry revision takes it out of the sidebar (extra features)", () => {
    const withoutBlotter = groups.map((entry) => ({ ...entry, features: entry.features.filter((f) => f.id !== "EXECUTION_BLOTTER") }));
    const blotter = registry.features.find((feature) => feature.id === "EXECUTION_BLOTTER")!;
    expect(applyV2Nav(withoutBlotter, V2_ROLE_PRESETS.operator).flatMap((g) => g.items).map((i) => i.label)).not.toContain("Blotter");
    expect(goToEntries(withoutBlotter, V2_ROLE_PRESETS.operator, [blotter]).map((e) => e.label)).not.toContain("Blotter");
  });

  it("the Blotter breadcrumb reads Execution / Blotter", () => {
    const trail = [{ label: "Deployments", route: null }, { label: "Blotter", route: "/deployments/blotter" }];
    expect(v2Crumbs(trail, registry.features).map((c) => c.label)).toEqual(["Execution", "Blotter"]);
  });

  it("filters caller-supplied entries by their own need", () => {
    const entries: CommandEntry[] = [
      { id: "a", group: "Account", label: "Binance-02", href: "/a", requires: { allOf: [V2_NAV_TOKEN.accounts] } },
      { id: "b", group: "Alpha", label: "BTC-Trend v3", href: "/b" },
    ];
    expect(filterEntriesByCapabilities(entries, V2_ROLE_PRESETS.researcher).map((e) => e.id)).toEqual(["b"]);
    expect(filterEntriesByCapabilities(entries, V2_ROLE_PRESETS.operator).map((e) => e.id)).toEqual(["a", "b"]);
  });
});
