/**
 * The slice route is OFF by default (UXM-08, FIXTURE ONLY): with the V2 manifest empty or without `scoped`,
 * /execution/slice is a path nothing mounts; with `scoped` (and the umbrella) the real PortalRoutes mounts the slice.
 *
 * Same method as linkTargets.test.tsx: the REAL PortalRoutes with the registry fixture, the heavy screens stubbed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../../../../portal/contracts";
import { EXEC_V2_PENDING_KEYS, EXEC_V2_RESERVED_KEYS, EXEC_V2_SCREEN_KEYS, isV2Screen, parseV2Manifest } from "../../flags";

vi.mock("../../../ExecutionPreviewRoute", () => ({
  ExecutionPreviewRoute: ({ screenId }: { screenId: string }) => <p data-testid="mounted-screen">{screenId}</p>,
  PreviewFrame: ({ children }: { children: unknown }) => <>{children as never}</>,
}));
vi.mock("../../../../features/admin/UsersAccess", () => ({ UsersAccess: () => <p data-testid="mounted-screen">users</p> }));
vi.mock("../../../../features/admin/ProfileAccess", () => ({ ProfileAccess: () => <p data-testid="mounted-screen">profile-access</p> }));
vi.mock("../../../../features/quantbt/QuantBTModule", () => ({ QuantBTModule: () => <p data-testid="mounted-screen">quantbt</p> }));
vi.mock("../../../../features/planning/PlanningModule", () => ({ PlanningModule: () => <p data-testid="mounted-screen">planning</p> }));

const NOT_FOUND = "No feature in the current registry claims this route.";
const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function open(path: string, env: { manifest: string; umbrella: string }): Promise<string> {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", env.umbrella);
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", env.manifest);
  vi.resetModules();
  const { PortalRoutes, EXECUTION_SLICE_ROUTE } = await import("../../../../app/PortalRoutes");
  expect(EXECUTION_SLICE_ROUTE).toBe("/execution/slice");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PortalRoutes registry={registry} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    if (screen.queryByText(NOT_FOUND) === null && screen.queryByText("Scoped slice") === null) throw new Error("still loading");
  });
  return screen.queryByText(NOT_FOUND) !== null ? "NOT_FOUND" : "SLICE";
}

describe("the `scoped` flag key", () => {
  it("is a manifest key that mounts something (not reserved, not pending), and is read by isV2Screen", () => {
    expect(EXEC_V2_SCREEN_KEYS).toContain("scoped");
    expect(EXEC_V2_RESERVED_KEYS as readonly string[]).not.toContain("scoped");
    expect(EXEC_V2_PENDING_KEYS as readonly string[]).not.toContain("scoped");
  });

  it("is OFF unless the manifest names it, and never by another key", () => {
    expect(isV2Screen("scoped", parseV2Manifest(undefined), true)).toBe(false);
    expect(isV2Screen("scoped", parseV2Manifest(""), true)).toBe(false);
    expect(isV2Screen("scoped", parseV2Manifest(EXEC_V2_SCREEN_KEYS.filter((k) => k !== "scoped").join(",")), true)).toBe(false);
    expect(isV2Screen("scoped", parseV2Manifest("scoped"), true)).toBe(true);
    // It needs the umbrella like every key.
    expect(isV2Screen("scoped", parseV2Manifest("scoped"), false)).toBe(false);
  });
});

describe("/execution/slice", () => {
  it("is not mounted with the manifest unset", async () => {
    expect(await open("/execution/slice", { manifest: "", umbrella: "true" })).toBe("NOT_FOUND");
  });

  it("is not mounted when the manifest names every other key", async () => {
    const others = EXEC_V2_SCREEN_KEYS.filter((k) => k !== "scoped").join(",");
    expect(await open("/execution/slice", { manifest: others, umbrella: "true" })).toBe("NOT_FOUND");
  });

  it("is not mounted without the umbrella, even when the manifest names it", async () => {
    expect(await open("/execution/slice", { manifest: "scoped", umbrella: "" })).toBe("NOT_FOUND");
  });

  it("is mounted, and says it is a fixture, when the manifest names it", async () => {
    expect(await open("/execution/slice", { manifest: "scoped", umbrella: "true" })).toBe("SLICE");
    // One short line; the long words are its title.
    expect(screen.getByRole("note").textContent).toBe("Fixture: not connected");
    expect(screen.getByRole("note").getAttribute("title")).toContain("Fixture frames, not a real stream");
    expect(screen.getByRole("note").getAttribute("title")).toContain("Not connected to a real source");
  });
});
