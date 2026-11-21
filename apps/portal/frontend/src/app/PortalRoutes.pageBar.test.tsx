/**
 * WP-D: the audit found no context bar at all on Profile & Access and Users (they are mounted outside the preview frame). With the
 * shell flag on and the page's own V2 screen mounted, the same bar is drawn above them, stating basis and scope and saying the page's
 * read takes no environment or window. Shell flag off: nothing new renders. Lane: FIXTURE_LAB (jsdom; the pages are probes).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";

vi.mock("../features/admin/ProfileAccess", () => ({ ProfileAccess: () => <p>matrix</p> }));
vi.mock("../features/admin/UsersAccess", () => ({ UsersAccess: () => <p data-testid="v1-users">v1 users</p> }));
vi.mock("../execution/v2/screens/access", () => ({ default: () => <p data-testid="v2-access">self-view</p> }));
vi.mock("../execution/v2/screens/users", () => ({ default: () => <p data-testid="v2-users">roster</p> }));

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function mountAt(url: string, manifest: string) {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
  vi.resetModules();
  const { PortalRoutes } = await import("./PortalRoutes");
  await act(async () => {
    render(<MemoryRouter initialEntries={[url]}><PortalRoutes registry={registry} /></MemoryRouter>);
  });
}

const bar = () => screen.queryByRole("group", { name: "Context" });

describe("the context bar on Profile & Access and Users", () => {
  it.each([
    ["Profile & Access", "/administration/profile-access", "v2-access"],
    ["My access (self-only path)", "/administration/my-access?workspace_id=ws_1", "v2-access"],
    ["Users", "/administration/users", "v2-users"],
  ])("%s: bar above the page, basis and scope stated, environment and window not applied", async (_name, url, page) => {
    await mountAt(url, "shell,profile,users");
    expect(await screen.findByTestId(page)).toBeTruthy();
    const group = (await screen.findByRole("group", { name: "Context" })) as HTMLElement;
    expect(group.querySelector('[data-control="basis"]')?.textContent).toBe("Basis: each currency on its own");
    expect(group.querySelector('[data-control="scope"]')?.textContent).toBe("Scope: every portfolio you may see");
    expect(group.textContent).toMatch(/Not applied: Environment, Window/);
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    // The bar comes first in the document, the page after it.
    const pageNode = screen.getByTestId(page);
    expect(group.compareDocumentPosition(pageNode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the bar's surface takes only the bar's height (its own class, no second full-height surface)", async () => {
    await mountAt("/administration/profile-access", "shell,profile");
    const group = (await screen.findByRole("group", { name: "Context" })) as HTMLElement;
    expect(group.closest(".exec-page-ctxbar")).not.toBeNull();
  });

  it("shell flag off (the page's own flag on): the page is drawn without a bar", async () => {
    await mountAt("/administration/profile-access", "profile");
    expect(await screen.findByTestId("v2-access")).toBeTruthy();
    expect(bar()).toBeNull();
    cleanup();
    await mountAt("/administration/users", "users");
    expect(await screen.findByTestId("v2-users")).toBeTruthy();
    expect(bar()).toBeNull();
  });

  it("the V1 pages (page flag off) never get the bar, whatever the shell flag says", async () => {
    await mountAt("/administration/users", "shell");
    expect(await screen.findByTestId("v1-users")).toBeTruthy();
    expect(bar()).toBeNull();
  });
});
