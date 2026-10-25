/**
 * The PortalRoutes mount for the access self-view (UXM-07 S1e).
 *
 * Flag off, or `profile` absent from the manifest: PROFILE_ACCESS is the V1
 * screen, typed denial for a non-owner included, and the build carries no V2
 * chunk. Flag on: a non-owner gets the self-view, an owner gets it with the V1
 * matrix one tab away.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerAccessEffective } from "../../../../../e2e/bffDoubleAccess";
import type { PortalRegistryDocument } from "../../../../portal/contracts";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({
  useSession: () => session.current,
  isOwnerAccess: (access: { kind: string; access?: { isOwner?: boolean } }) => access.kind === "ready" && access.access?.isOwner === true,
}));

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);
const ROUTE = "/administration/profile-access";
const originalFetch = globalThis.fetch;

function signIn(owner: boolean) {
  session.current = {
    principal: { principalId: "p_me", username: "stan", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: {
      kind: "ready",
      access: {
        userId: "usr_me",
        isOwner: owner,
        ownerState: owner ? "OWNER" : "NOT_OWNER",
        capabilities: owner ? ["administration.profile_access.manage", "governance.r1.read"] : ["governance.r1.read"],
      },
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://portal.test");
    const access = answerAccessEffective("GET", url.pathname, url.searchParams, { userId: "usr_me" });
    if (access !== null) return json(access.body, access.status);
    if (url.pathname === "/api/admin/profile-access") return json({ schema_version: "portal.profile-access.v1", accounts: [] });
    return json({}, 200);
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  globalThis.fetch = originalFetch;
  session.current = null;
});

async function mountRoutes(search = "?workspace_id=ws_TEST_ONLY") {
  const { PortalRoutes } = await import("../../../../app/PortalRoutes");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`${ROUTE}${search}`]}>
        <PortalRoutes registry={registry} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("flag off", () => {
  beforeEach(() => vi.resetModules());

  it("a non-owner still gets the V1 typed denial and no V2 element", async () => {
    signIn(false);
    const { container } = await mountRoutes();
    expect(await screen.findByText(/Deciding who may govern belongs to the Portal owner/)).toBeTruthy();
    expect(container.querySelector(".exec-acc, .exec-flag")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("the source gates the V2 import on the raw env string and keeps the V1 module as the fallback", () => {
    const source = readFileSync(join(process.cwd(), "src/app/PortalRoutes.tsx"), "utf8");
    // The only import() of the access chunk sits behind the raw manifest string, as ExecutionPreviewRoute does for fleet/cockpit/ops.
    expect(source).toMatch(/const V2Access = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\?\s*lazy\(\(\) => import\("\.\.\/execution\/v2\/screens\/access"\)\)\s*:\s*null;/);
    expect(source.match(/execution\/v2\/screens\/access/g)).toHaveLength(1);
    expect(source).toMatch(/PROFILE_ACCESS: \{ component: V2Access !== null \? ProfileAccessEntry : ProfileAccess \}/);
    // WP-D passes the shell's resolved default workspace as a prop (`sessionWorkspaceId`), so the element may carry props after `manage`.
    expect(source).toMatch(/V2Access !== null && isV2Screen\("profile"\) \?\s*\(\s*<>\s*<PageBar \/>\s*<V2Access manage=\{<ProfileAccess \/>\}[^>]*\/>\s*<\/>\s*\) : <ProfileAccess \/>/);
  });
});

describe("flag on, key absent from the manifest", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "fleet,cockpit");
    vi.resetModules();
  });

  it("is the V1 screen: the typed denial, not the self-view", async () => {
    signIn(false);
    const { container } = await mountRoutes();
    expect(await screen.findByText(/Deciding who may govern belongs to the Portal owner/)).toBeTruthy();
    expect(container.querySelector(".exec-acc")).toBeNull();
  });
});

describe("profile flag on", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "profile");
    vi.resetModules();
  });

  it("a non-owner gets the self-view where V1 showed a denial", async () => {
    signIn(false);
    await mountRoutes();
    expect(await screen.findByRole("table", { name: "Granted to you" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Profile & Access");
    expect(screen.queryByText(/Deciding who may govern belongs to the Portal owner/)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("an owner keeps the V1 matrix on a second tab", async () => {
    signIn(true);
    await mountRoutes();
    await screen.findByRole("table", { name: "Granted to you" });
    fireEvent.click(screen.getByRole("tab", { name: "Manage grants" }));
    await waitFor(() => expect(screen.getByTestId("profile-access")).toBeTruthy());
    expect(screen.queryByRole("table", { name: "Granted to you" })).toBeNull();
  });
});
