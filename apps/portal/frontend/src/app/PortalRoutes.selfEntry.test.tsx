/**
 * BE-P7 · `/administration/my-access`: the self-only route, mounted with the `profile` flag, rendering the access screen's SELF view
 * and never the admin matrix. The old `/administration/profile-access` path keeps the matrix prop for admins. Flags are read at module
 * load, so each case stubs the env and imports the route table fresh. Lane: FIXTURE_LAB (jsdom; the two screens are probes).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";

vi.mock("../features/admin/ProfileAccess", () => ({ ProfileAccess: () => <p data-testid="v1-matrix">matrix</p> }));
vi.mock("../execution/v2/screens/access", () => ({
  default: (props: { manage?: unknown }) => <p data-testid="v2-access" data-manage={props.manage === undefined ? "none" : "matrix"}>self-view</p>,
}));

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

describe("/administration/my-access", () => {
  it("profile flag on: the self view, with NO matrix prop (the admin surface cannot be reached from this path)", async () => {
    await mountAt("/administration/my-access?workspace_id=ws_TEST_ONLY", "profile");
    expect((await screen.findByTestId("v2-access")).getAttribute("data-manage")).toBe("none");
    expect(screen.queryByTestId("v1-matrix")).toBeNull();
  });

  it("?view=manage on the self-only path asks for nothing more", async () => {
    await mountAt("/administration/my-access?workspace_id=ws_TEST_ONLY&view=manage", "profile");
    expect((await screen.findByTestId("v2-access")).getAttribute("data-manage")).toBe("none");
  });

  it("the old path stays for admins: the same view WITH the matrix prop (its owner + capability guard is the view's)", async () => {
    await mountAt("/administration/profile-access", "profile");
    expect((await screen.findByTestId("v2-access")).getAttribute("data-manage")).toBe("matrix");
  });

  it("profile flag off (or only the shell flag): the path is not a route, and the catch-all answers", async () => {
    for (const manifest of ["", "shell", "fleet"]) {
      await mountAt("/administration/my-access", manifest);
      expect(await screen.findByText("No feature in the current registry claims this route.")).toBeTruthy();
      expect(screen.queryByTestId("v2-access")).toBeNull();
      cleanup();
    }
  });

  it("flag off the old path is the V1 screen, unchanged", async () => {
    await mountAt("/administration/profile-access", "");
    expect(await screen.findByTestId("v1-matrix")).toBeTruthy();
  });
});
