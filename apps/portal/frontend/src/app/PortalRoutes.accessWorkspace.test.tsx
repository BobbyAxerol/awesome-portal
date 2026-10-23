/**
 * WP-E request answered by WP-D: the Access mount hands the page the workspace the shell's self-context RESOLVED, so "Granted to
 * you" shows without a workspace in the address. The context carries only a resolved workspace (never a guess), and the page's
 * own rule still puts the address first. Lane: FIXTURE_LAB (jsdom; the page is a probe).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";

vi.mock("../features/admin/ProfileAccess", () => ({ ProfileAccess: () => <p>matrix</p> }));
vi.mock("../execution/v2/screens/access", () => ({
  default: (props: { sessionWorkspaceId?: string | null }) => <p data-testid="v2-access" data-session-workspace={props.sessionWorkspaceId ?? "none"}>self-view</p>,
}));

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function mountAt(url: string, resolved: string | null) {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "profile");
  vi.resetModules();
  const { PortalRoutes } = await import("./PortalRoutes");
  const { SelfWorkspaceContext } = await import("./selfNavView");
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <SelfWorkspaceContext.Provider value={resolved}>
          <PortalRoutes registry={registry} />
        </SelfWorkspaceContext.Provider>
      </MemoryRouter>,
    );
  });
}

describe("Profile & Access mount: the shell's resolved workspace", () => {
  it("passes the resolved default workspace when the address names none", async () => {
    await mountAt("/administration/profile-access", "ws_resolved");
    expect((await screen.findByTestId("v2-access")).getAttribute("data-session-workspace")).toBe("ws_resolved");
  });

  it("passes nothing when the shell resolved none (AMBIGUOUS, NONE, failed): no workspace is invented", async () => {
    await mountAt("/administration/profile-access", null);
    expect((await screen.findByTestId("v2-access")).getAttribute("data-session-workspace")).toBe("none");
  });

  it("outside the shell (no provider) the default is none", async () => {
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "profile");
    vi.resetModules();
    const { PortalRoutes } = await import("./PortalRoutes");
    await act(async () => {
      render(<MemoryRouter initialEntries={["/administration/profile-access"]}><PortalRoutes registry={registry} /></MemoryRouter>);
    });
    expect((await screen.findByTestId("v2-access")).getAttribute("data-session-workspace")).toBe("none");
  });
});
