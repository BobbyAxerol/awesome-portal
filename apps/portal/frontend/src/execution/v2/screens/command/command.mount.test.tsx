/**
 * The command story route is OFF by default (UXM-09, FIXTURE ONLY): with the V2 manifest empty or without `command`,
 * /execution/command is a path nothing mounts; with `command` (and the umbrella) the real PortalRoutes mounts the story, labelled as
 * a fixture story over a fake port.
 *
 * Same method as slice.mount.test.tsx: the REAL PortalRoutes with the registry fixture, the heavy screens stubbed. FIXTURE_LAB.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../../../../portal/contracts";
import { EXEC_V2_PENDING_KEYS, EXEC_V2_RESERVED_KEYS, EXEC_V2_SCREEN_KEYS, isV2Screen, parseV2Manifest } from "../../flags";
import { STORY_LABEL } from "./index";

vi.mock("../../../ExecutionPreviewRoute", () => ({
  ExecutionPreviewRoute: ({ screenId }: { screenId: string }) => <p data-testid="mounted-screen">{screenId}</p>,
  PreviewFrame: ({ children }: { children: unknown }) => <>{children as never}</>,
}));
vi.mock("../../../../features/admin/UsersAccess", () => ({ UsersAccess: () => <p data-testid="mounted-screen">users</p> }));
vi.mock("../../../../features/admin/ProfileAccess", () => ({ ProfileAccess: () => <p data-testid="mounted-screen">profile-access</p> }));
vi.mock("../../../../features/quantbt/QuantBTModule", () => ({ QuantBTModule: () => <p data-testid="mounted-screen">quantbt</p> }));
vi.mock("../../../../features/planning/PlanningModule", () => ({ PlanningModule: () => <p data-testid="mounted-screen">planning</p> }));

const NOT_FOUND = "No feature in the current registry claims this route.";
const TITLE = "Command confirmation";
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
  const { PortalRoutes, EXECUTION_COMMAND_ROUTE } = await import("../../../../app/PortalRoutes");
  expect(EXECUTION_COMMAND_ROUTE).toBe("/execution/command");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PortalRoutes registry={registry} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    if (screen.queryByText(NOT_FOUND) === null && screen.queryByRole("heading", { name: TITLE }) === null) throw new Error("still loading");
  });
  return screen.queryByText(NOT_FOUND) !== null ? "NOT_FOUND" : "STORY";
}

describe("the `command` flag key", () => {
  it("is a manifest key that mounts something: not reserved, no longer pending, and read by isV2Screen", () => {
    expect(EXEC_V2_SCREEN_KEYS).toContain("command");
    expect(EXEC_V2_RESERVED_KEYS as readonly string[]).not.toContain("command");
    expect(EXEC_V2_PENDING_KEYS as readonly string[]).not.toContain("command");
  });

  it("is OFF unless the manifest names it, and never by another key", () => {
    expect(isV2Screen("command", parseV2Manifest(undefined), true)).toBe(false);
    expect(isV2Screen("command", parseV2Manifest(""), true)).toBe(false);
    expect(isV2Screen("command", parseV2Manifest(EXEC_V2_SCREEN_KEYS.filter((k) => k !== "command").join(",")), true)).toBe(false);
    expect(isV2Screen("command", parseV2Manifest("command"), true)).toBe(true);
    expect(isV2Screen("command", parseV2Manifest("command"), false)).toBe(false);
  });
});

describe("/execution/command", () => {
  it("is not mounted with the manifest unset", async () => {
    expect(await open("/execution/command", { manifest: "", umbrella: "true" })).toBe("NOT_FOUND");
  });

  it("is not mounted when the manifest names every other key", async () => {
    const others = EXEC_V2_SCREEN_KEYS.filter((k) => k !== "command").join(",");
    expect(await open("/execution/command", { manifest: others, umbrella: "true" })).toBe("NOT_FOUND");
  });

  it("is not mounted without the umbrella, even when the manifest names it", async () => {
    expect(await open("/execution/command", { manifest: "command", umbrella: "" })).toBe("NOT_FOUND");
  });

  it("is mounted, labelled as a fixture story over a fake port, when the manifest names it", async () => {
    expect(await open("/execution/command", { manifest: "command", umbrella: "true" })).toBe("STORY");
    expect(STORY_LABEL).toBe("Fixture: not connected");
    expect(screen.getByRole("note").textContent).toContain(STORY_LABEL);
    // The published catalogue came with the route: the disabled operations are listed, not "not read".
    expect(screen.queryByText(/The command catalogue has not been read/)).toBeNull();
  });
});

describe("the route's boundary", () => {
  const dir = __dirname;
  const SRC = join(dir, "../../../..");
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("only catalogueLane.ts imports the contracts package JSON", () => {
    const importers = readdirSync(dir)
      .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
      .filter((name) => /from\s+"[^"]*packages\/contracts\/[^"]*\.json"/.test(strip(readFileSync(join(dir, name), "utf8"))));
    expect(importers).toEqual(["catalogueLane.ts"]);
  });

  it("the story is reached only through the flag-gated lazy import in PortalRoutes", () => {
    const routes = readFileSync(join(SRC, "app/PortalRoutes.tsx"), "utf8");
    expect(routes).toMatch(/const V2Command = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\?\s*lazy\(\(\) => import\("\.\.\/execution\/v2\/screens\/command\/storyRoute"\)\)\s*:\s*null/);
    expect(routes).toContain('isV2Screen("command")');
    expect(routes).not.toMatch(/^import .*screens\/command/m);
  });
});
