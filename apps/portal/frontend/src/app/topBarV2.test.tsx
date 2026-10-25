/**
 * The V2 top bar (WP-D, audit 2026-10-23): the search is a visible field that opens the command bar, and the signed-in user is named.
 * Both exist only with the `v2` prop (a route the V2 bar owns), so the flag-off bar is the one it was. The carbon CSS keeps the plain
 * button hidden and shows only the button that carries `data-v2-search`; the stylesheet is read here because jsdom does not lay out.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferencesProvider } from "./preferences";
import { PortalPresentationProvider } from "./presentation";
import { PortalContext } from "./context";
import { TopBar } from "./TopBar";

const session = vi.hoisted(() => ({ principal: true }));
vi.mock("../auth/session", () => ({
  useSession: () => ({
    principal: session.principal ? { principalId: "p_1", username: "bobby", role: "ADMIN", sessionId: "sess_1" } : null,
    access: { kind: "unavailable", requestId: null },
  }),
  isOwnerAccess: () => false,
}));

afterEach(() => {
  cleanup();
  session.principal = true;
});

const registryDoc = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

function mount(v2: Parameters<typeof TopBar>[0]["v2"], onOpenPalette = () => undefined, extra: { breadcrumbs?: { label: string; route: string | null }[]; environment?: "research" | null } = {}) {
  return render(
    <MemoryRouter initialEntries={["/execution"]}>
      <PortalContext.Provider value={{ registry: registryDoc, environment: null }}>
        <PreferencesProvider>
          <PortalPresentationProvider registry={null}>
            <TopBar breadcrumbs={extra.breadcrumbs ?? []} environment={(extra.environment ?? null) as never} onOpenPalette={onOpenPalette} onToggleMobileNav={() => undefined} v2={v2} />
          </PortalPresentationProvider>
        </PreferencesProvider>
      </PortalContext.Provider>
    </MemoryRouter>,
  );
}

describe("V2 top bar", () => {
  it("the search button says Search or jump to, shows Cmd K, carries the V2 marker and opens the bar", () => {
    const open = vi.fn();
    mount({ userHref: null }, open);
    const button = screen.getByRole("button", { name: /Search or jump to/ });
    expect(button.hasAttribute("data-v2-search")).toBe(true);
    expect(button.textContent).toContain("⌘K");
    fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("without the v2 prop the button is the plain Search one with no marker, and no user chip", () => {
    mount(undefined);
    const button = screen.getByRole("button", { name: /Search/ });
    expect(button.hasAttribute("data-v2-search")).toBe(false);
    expect(button.textContent).not.toContain("jump");
    expect(document.querySelector("[data-v2-user]")).toBeNull();
  });

  it("names the signed-in user with the session's own username and role, as a statement when no access page is on offer", () => {
    mount({ userHref: null });
    const chip = document.querySelector<HTMLElement>("[data-v2-user]")!;
    expect(chip.textContent).toBe("bobby · ADMIN");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.getAttribute("title")).toMatch(/Display only: access comes from your grants/);
  });

  it("is a link to the member's own access when the shell has such a page", () => {
    mount({ userHref: "/administration/my-access?workspace_id=ws_1" });
    const chip = document.querySelector<HTMLAnchorElement>("[data-v2-user]")!;
    expect(chip.tagName).toBe("A");
    expect(chip.getAttribute("href")).toBe("/administration/my-access?workspace_id=ws_1");
  });

  it("no session, no chip: a user is never invented", () => {
    session.principal = false;
    mount({ userHref: null });
    expect(document.querySelector("[data-v2-user]")).toBeNull();
  });
});

describe("V2 breadcrumbs and the Portal environment badge (QA1 OV-06, R2-18, R2-25)", () => {
  const crumb = (route: string) => registryDoc.features.find((f: { canonical_route: string; group: string; label: string }) => f.canonical_route === route);
  const trailFor = (route: string) => {
    const feature = crumb(route);
    const group = registryDoc.feature_groups.find((g: { id: string }) => g.id === feature.group);
    return [{ label: group.label, route: null }, { label: feature.label, route }];
  };
  const text = () => [...document.querySelectorAll(".portal-breadcrumbs .portal-crumb")].map((n) => n.textContent?.replace(/^\//, ""));

  it.each([["/execution", "Overview"], ["/deployments/alphas", "Alpha Fleet"], ["/execution/operations", "Operations"], ["/governance/approvals", "Approvals"], ["/deployments/portfolios", "Portfolios"]])(
    "%s reads Execution / %s on a V2 bar",
    (route, label) => {
      mount({ userHref: null }, undefined, { breadcrumbs: trailFor(route) });
      expect(text()).toEqual(["Execution", label]);
    },
  );

  it("without the v2 prop the registry's own trail is untouched", () => {
    mount(undefined, undefined, { breadcrumbs: trailFor("/execution") });
    expect(text()[0]).not.toBe("Execution");
  });

  it("labels the summary's environment as the Portal's on a V2 bar, and leaves it alone otherwise", () => {
    mount({ userHref: null }, undefined, { environment: "research" });
    expect(document.querySelector(".portal-env-prefix")?.textContent).toBe("Portal");
    expect(document.querySelector(".portal-env-wrap")?.getAttribute("title")).toMatch(/not an Execution environment/);
    expect(document.querySelector(".badge-env")?.textContent).toBe("RESEARCH");
    cleanup();
    mount(undefined, undefined, { environment: "research" });
    expect(document.querySelector(".portal-env-wrap")).toBeNull();
  });
});

describe("the carbon stylesheet", () => {
  const css = readFileSync(join(__dirname, "../styles/shell.css"), "utf8").replace(/\s+/g, " ");

  it("still hides the plain search button on carbon, and shows only the V2-marked one", () => {
    expect(css).toMatch(/:root\[data-theme="execution-carbon"\] \.portal-topbar \.portal-search-btn,/);
    expect(css).toMatch(/\.portal-search-btn\[data-v2-search\] \{ display: inline-flex;/);
  });

  it("the field is a clamped width only above the phone breakpoint; the phone bar keeps its 44px button", () => {
    expect(css).toMatch(/@media \(min-width: 721px\) \{ :root\[data-theme="execution-carbon"\] \.portal-topbar \.portal-search-btn\[data-v2-search\] \{ width: clamp\(176px, 16vw, 240px\);/);
  });

  it("the V2 bar's chrome text is on the 11px floor and the field's label does not wrap", () => {
    expect(css).toMatch(/\.portal-topbar:has\(\[data-v2-search\]\) :is\(\.portal-workspace, \.portal-pref select, \.portal-search-btn, \.portal-user-chip, \.portal-env-prefix, \.badge-env\) \{ font-size: 11px;/);
    expect(css).toMatch(/\.portal-search-label \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
  });

  it("between the phone bar and 1100px the field is the icon alone (no label cut), the name stays for assistive tech", () => {
    expect(css).toMatch(/@media \(min-width: 721px\) and \(max-width: 1099px\) \{ [^}]*\.portal-search-btn\[data-v2-search\] \{ width: 36px;/);
    expect(css).toMatch(/\.portal-search-btn\[data-v2-search\] \.portal-search-label \{ position: absolute; width: 1px;/);
  });

  it("the V2 search button names itself with a title", () => {
    mount({ userHref: null });
    expect(screen.getByRole("button", { name: /Search or jump to/ }).getAttribute("title")).toBe("Search or jump to (Ctrl K)");
  });

  it("the user chip is hidden below 1280px, where the trail needs the room", () => {
    expect(css).toMatch(/@media \(max-width: 1279px\) \{ :root\[data-theme="execution-carbon"\] \.portal-topbar \.portal-user-chip \{ display: none; \}/);
  });
});
