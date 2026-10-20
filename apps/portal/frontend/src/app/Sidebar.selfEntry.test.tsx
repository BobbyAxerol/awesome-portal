/**
 * BE-P7 · the self-only "My access" rail entry for a member who has no Profile & Access entry of their own.
 *
 * The entry exists only while the shell hands the rail an offer (a LIVE self-navigation projection says the self entry is allowed),
 * only with the V2 shell flag on, and only when the `profile` flag mounts the page it opens. Everything else fails closed, and an
 * admin whose rail already lists Profile & Access gets no duplicate. The registry is not edited. Lane: FIXTURE_LAB (the public
 * registry fixture; jsdom).
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";
import { V2_ROLE_PRESETS } from "../execution/v2/shell/roleNav";
import { Sidebar, SELF_ENTRY_LABEL, railGroups, withSelfEntry } from "./Sidebar";
import { SELF_ENTRY_PATH } from "./selfNavView";

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
const PROFILE = "administration.profile_access.manage";
const OFFER = { workspaceId: "ws_TEST_ONLY" };

function rail(props: { caps?: readonly string[]; v2Shell?: boolean; selfEntry?: { workspaceId: string } | null; mounted?: boolean; url?: string }) {
  const view = render(
    <MemoryRouter initialEntries={[props.url ?? "/execution?env=paper&workspace_id=ws_TEST_ONLY"]}>
      <Sidebar
        registry={registry}
        options={{ capabilities: props.caps ?? [] }}
        collapsed={false}
        v2Shell={props.v2Shell ?? true}
        selfEntry={props.selfEntry === undefined ? OFFER : props.selfEntry}
        selfEntryMounted={props.mounted ?? true}
      />
    </MemoryRouter>,
  );
  const links = [...view.container.querySelectorAll<HTMLAnchorElement>("a.portal-navitem")].map((a) => ({
    label: a.querySelector(".portal-navitem-label")?.textContent ?? "",
    href: a.getAttribute("href") ?? "",
  }));
  return { ...view, links, groups: [...view.container.querySelectorAll(".portal-navgroup-label")].map((n) => n.textContent) };
}
const mine = (links: { label: string; href: string }[]) => links.filter((l) => l.label === SELF_ENTRY_LABEL);

describe("the offer is listed", () => {
  it("an ordinary member gets one 'My access' link to the self-only path, carrying the workspace and the shared context", () => {
    const { links, groups } = rail({});
    expect(mine(links)).toEqual([{ label: "My access", href: `${SELF_ENTRY_PATH}?workspace_id=ws_TEST_ONLY&env=paper` }]);
    expect(groups).toContain("Administration");
    // The admin matrix is not listed for this member, and the entry is not it.
    expect(links.map((l) => l.href)).not.toContain("/administration/profile-access");
  });

  it("the entry carries the OFFER's workspace even when the address names none (a context-resolved member)", () => {
    const { links } = rail({ url: "/execution?env=sandbox", selfEntry: { workspaceId: "ws_from_context" } });
    expect(mine(links)[0]!.href).toBe(`${SELF_ENTRY_PATH}?workspace_id=ws_from_context&env=sandbox`);
  });

  it("an id with characters the query must escape is escaped", () => {
    const { links } = rail({ selfEntry: { workspaceId: "ws a&b" } });
    expect(new URL(mine(links)[0]!.href, "http://x").searchParams.get("workspace_id")).toBe("ws a&b");
  });

  it("it sits in the registry's Administration group, in the registry's order (after Governance and Deployments, before Research)", () => {
    const groups = withSelfEntry(railGroups(registry, { capabilities: [] }, true, ""), registry, OFFER, "");
    const ids = groups.map((g) => g.id);
    expect(ids.indexOf("administration")).toBeGreaterThan(-1);
    const orderOf = (id: string) => registry.feature_groups.find((g) => g.id === id)?.order;
    const known = ids.filter((id) => orderOf(id) !== undefined);
    expect(known.map((id) => orderOf(id))).toEqual([...known.map((id) => orderOf(id)!)].sort((a, b) => a - b));
  });

  it("the link is a real NavLink to the page: current only on that path", () => {
    const { container } = rail({ url: `${SELF_ENTRY_PATH}?workspace_id=ws_TEST_ONLY` });
    const link = [...container.querySelectorAll("a.portal-navitem")].find((a) => a.textContent?.includes(SELF_ENTRY_LABEL))!;
    expect(link.className).toContain("portal-navitem-active");
  });
});

describe("fail closed: no entry", () => {
  it.each<[string, Parameters<typeof rail>[0]]>([
    ["no offer (the projection is loading, expired, failed or denied)", { selfEntry: null }],
    ["the shell flag off", { v2Shell: false }],
    ["the profile flag off (the page it opens is not mounted)", { mounted: false }],
    ["a workspace id the address cannot carry (over 128 characters)", { selfEntry: { workspaceId: "w".repeat(129) } }],
    ["a workspace id with a control character", { selfEntry: { workspaceId: "ws\u0007x" } }],
    ["an empty workspace id", { selfEntry: { workspaceId: "" } }],
  ])("%s", (_name, props) => {
    expect(mine(rail(props).links)).toEqual([]);
  });

  it("an admin whose rail lists Profile & Access keeps that one entry and gets no duplicate", () => {
    const { links } = rail({ caps: [...V2_ROLE_PRESETS.manager, PROFILE] });
    expect(mine(links)).toEqual([]);
    expect(links.filter((l) => l.label === "Profile & Access")).toHaveLength(1);
  });

  it("a registry without PROFILE_ACCESS yields no entry (nothing is invented)", () => {
    const slim: PortalRegistryDocument = { ...registry, features: registry.features.filter((f) => f.id !== "PROFILE_ACCESS") };
    expect(withSelfEntry(railGroups(slim, { capabilities: [] }, true, ""), slim, OFFER, "")).toEqual(railGroups(slim, { capabilities: [] }, true, ""));
  });

  it("no offer returns the very same groups (not a copy)", () => {
    const base = railGroups(registry, { capabilities: [] }, true, "");
    expect(withSelfEntry(base, registry, null, "")).toBe(base);
  });
});

describe("the flag-off rail is untouched", () => {
  it("with the shell flag off the DOM is the registry's whatever offer is passed", () => {
    const withOffer = rail({ v2Shell: false });
    const without = rail({ v2Shell: false, selfEntry: null });
    expect(withOffer.container.innerHTML).toBe(without.container.innerHTML);
  });
});
