/**
 * Phase 3 · the server states its limits and the frontend stops writing them.
 *
 * The gate the plan sets is precise: change the bound on the server and the
 * frontend must ask for the new page **without a line of frontend changing**.
 * That is what the first block proves, with two different bounds.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_BOUNDS,
  boundsOf,
  readRuntimeManifest,
} from "./runtimeManifest";
import {
  PAGE_SIZE_RUNGS,
  pageSizeLadder,
  setDeclaredPageBound,
  declaredPageBound,
} from "./api/managerRelations";
import { RUNTIME_MANIFEST } from "./analytics.presentation.fixtures";
import {
  isAvailable,
  readScreenContracts,
  screenContractParity,
  unavailableSentence,
} from "./screenContracts";
import { SCREEN_CONTRACTS, SCREEN_CONTRACT_UNAVAILABLE } from "./screenContracts.fixtures";
import { contractFor, forgetExecutionRuntime, loadExecutionRuntime } from "./useExecutionRuntime";
import type { ExecutionApi } from "./api/ports";
import type { ScreenContract } from "./screenContracts";

beforeEach(() => { setDeclaredPageBound(null); });

describe("11-2 · the page ladder is the server's, not ours", () => {
  it("asks for whatever the server declares, at two different bounds", () => {
    setDeclaredPageBound(200);
    expect(pageSizeLadder()).toEqual([200, ...PAGE_SIZE_RUNGS]);
    // The same code, a different server. Nothing here changed but the manifest.
    setDeclaredPageBound(500);
    expect(pageSizeLadder()).toEqual([500, ...PAGE_SIZE_RUNGS]);
    expect(declaredPageBound()).toBe(500);
  });

  it("drops retreat rungs that are not smaller than the declared page", () => {
    // A server that declares 20 must not be asked for 50 on the way down.
    setDeclaredPageBound(20);
    expect(pageSizeLadder()).toEqual([20, 5]);
  });

  it("falls back to the frontend default, and says so, when there is no manifest", () => {
    expect(pageSizeLadder(null)).toEqual([DEFAULT_PAGE_BOUNDS.maximumPageRows, ...PAGE_SIZE_RUNGS]);
    expect(boundsOf(null)).toEqual({ bounds: DEFAULT_PAGE_BOUNDS, source: "FRONTEND_DEFAULT" });
  });
});

describe("11-1 · the manifest reader", () => {
  it("reads dev's shape and names the bounds as the server's", () => {
    const manifest = readRuntimeManifest(RUNTIME_MANIFEST)!;
    expect(manifest.bounds).toEqual({ maximumPageRows: 200, maximumResponseBytes: 1_048_576, maximumCursorBytes: 4_096 });
    expect(boundsOf(manifest).source).toBe("SERVER_DECLARED");
    expect(manifest.semantics.total_history).toBe("NOT_ASSERTED");
    expect(manifest.externalGates).toHaveLength(4);
  });

  it("refuses a manifest whose bounds are absent or not numbers", () => {
    // Falling back here would let the server's silence pass as our default
    // wearing the server's name.
    const withoutRows = structuredClone(RUNTIME_MANIFEST) as Record<string, unknown>;
    delete (withoutRows.bounds as Record<string, unknown>).maximum_page_rows;
    expect(readRuntimeManifest(withoutRows)).toBeNull();
    const asString = structuredClone(RUNTIME_MANIFEST) as Record<string, unknown>;
    (asString.bounds as Record<string, unknown>).maximum_cursor_bytes = "4096";
    expect(readRuntimeManifest(asString)).toBeNull();
    expect(readRuntimeManifest({ ...RUNTIME_MANIFEST, schema_version: "something.else" })).toBeNull();
  });
});

describe("11-3 · the contract validator judges shape, not the server's numbers", () => {
  const contractSource = readFileSync(join(__dirname, "screenDataContract.ts"), "utf8");

  it("no longer pins the three bounds to literals", () => {
    expect(contractSource).not.toMatch(/maximum_page_rows !== 200/);
    expect(contractSource).not.toMatch(/maximum_response_bytes !== 1_048_576/);
    expect(contractSource).not.toMatch(/maximum_cursor_bytes !== 4_096/);
  });

  it("still refuses a bound that is not a positive integer, and a history cap", () => {
    expect(contractSource).toMatch(/positiveInteger\(pageBounds\.maximum_page_rows\)/);
    expect(contractSource).toMatch(/total_history_cap !== false/);
    expect(contractSource).toMatch(/exactKeys\(pageBounds/);
  });
});

describe("11-5 · registry and server catalogue must agree", () => {
  const catalogue = readScreenContracts(SCREEN_CONTRACTS)!;
  const registry = JSON.parse(
    readFileSync(join(__dirname, "../../../registry/registry.json"), "utf8"),
  ) as { screens: { screen_id: string; route: string }[] };
  const routes = Object.fromEntries(registry.screens.map((screen) => [screen.screen_id, screen.route]));

  it("reads all 25 published screens", () => {
    expect(catalogue).toHaveLength(25);
    expect(catalogue.every(isAvailable)).toBe(true);
  });

  /*
   * The registry owns Research and Planning screens too, which the Execution
   * server never claims to serve. They are named rather than filtered by
   * prefix: a screen quietly dropping off the server would otherwise hide
   * inside a pattern.
   */
  const registryOnly = registry.screens
    .map((screen) => screen.screen_id)
    .filter((id) => !catalogue.some((c) => c.screenId === id));

  it("finds no divergence today", () => {
    expect(screenContractParity(catalogue, routes, registryOnly)).toEqual([]);
    expect(registryOnly.length).toBe(registry.screens.length - catalogue.length);
  });

  it("goes red when a route is changed on either side", () => {
    // The gate is only worth having if it fails. Move one route and it must
    // name the screen, both routes, and which side moved.
    const moved = catalogue.map((c) =>
      c.screenId === "EXECUTION_FULL_BLOTTER_SCREEN" ? { ...c, uiRouteTemplate: "/deployments/blotter-v2" } : c);
    const findings = screenContractParity(moved, routes, registryOnly);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      screenId: "EXECUTION_FULL_BLOTTER_SCREEN",
      kind: "ROUTE_DIFFERS",
      serverRoute: "/deployments/blotter-v2",
      registryRoute: "/deployments/blotter",
    });
  });

  it("goes red when the server serves a screen the registry never heard of", () => {
    const extra = [...catalogue, { ...catalogue[0], screenId: "EXECUTION_INVENTED_SCREEN" }];
    const findings = screenContractParity(extra, routes, registryOnly);
    expect(findings.map((f) => f.kind)).toContain("MISSING_IN_REGISTRY");
  });
});

describe("11-6 · a screen the server does not serve says so in the server's words", () => {
  it("reads the canonical TYPED_UNAVAILABLE contract", () => {
    const [contract] = readScreenContracts(SCREEN_CONTRACT_UNAVAILABLE)!;
    expect(isAvailable(contract)).toBe(false);
    expect(unavailableSentence(contract)).toContain("TYPED_UNAVAILABLE");
    expect(unavailableSentence(contract)).toContain("N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED");
    expect(unavailableSentence(contract)).toContain("delivery phase N28");
  });

  it("says the reason is missing rather than inventing one", () => {
    const raw = structuredClone(SCREEN_CONTRACT_UNAVAILABLE) as Record<string, unknown>;
    ((raw.screen as Record<string, unknown>).data_api as Record<string, unknown>).unavailable_reason = null;
    const [contract] = readScreenContracts(raw)!;
    expect(unavailableSentence(contract)).toContain("it published no reason");
  });
});

describe("11-1 · the two session reads happen once, and never block a screen", () => {
  const contracts = readScreenContracts(SCREEN_CONTRACTS)!;

  function countingApi(over: Partial<ExecutionApi> = {}) {
    const calls = { manifest: 0, contracts: 0 };
    const api = {
      async getRuntimeManifest() {
        calls.manifest += 1;
        return { ok: true as const, value: readRuntimeManifest(RUNTIME_MANIFEST)! };
      },
      async getScreenContracts() {
        calls.contracts += 1;
        return { ok: true as const, value: contracts as readonly ScreenContract[] };
      },
      ...over,
    } as unknown as ExecutionApi;
    return { api, calls };
  }

  beforeEach(() => { forgetExecutionRuntime(); });

  it("reads the manifest and the catalogue once, however many screens ask", async () => {
    const { api, calls } = countingApi();
    await Promise.all([loadExecutionRuntime(api), loadExecutionRuntime(api), loadExecutionRuntime(api)]);
    await loadExecutionRuntime(api);
    expect(calls).toEqual({ manifest: 1, contracts: 1 });
    expect(declaredPageBound()).toBe(200);
  });

  it("keeps drawing on the labelled default when the manifest fails", async () => {
    const { api } = countingApi({ getRuntimeManifest: async () => { throw new Error("edge down"); } });
    const runtime = await loadExecutionRuntime(api);
    expect(runtime.boundsSource).toBe("FRONTEND_DEFAULT");
    expect(runtime.bounds).toEqual(DEFAULT_PAGE_BOUNDS);
    // The ladder must not silently pretend the default is the server's word.
    expect(declaredPageBound()).toBeNull();
    // …and the catalogue still arrived, so one failure does not lose the other.
    expect(runtime.contracts).toHaveLength(25);
  });

  it("degrades on a port that has neither method, rather than throwing", async () => {
    const runtime = await loadExecutionRuntime({} as ExecutionApi);
    expect(runtime.boundsSource).toBe("FRONTEND_DEFAULT");
    expect(runtime.contracts).toBeNull();
  });

  it("finds one screen's contract by id", async () => {
    const { api } = countingApi();
    const runtime = await loadExecutionRuntime(api);
    expect(contractFor(runtime, "EXECUTION_FULL_BLOTTER_SCREEN")?.uiRouteTemplate).toBe("/deployments/blotter");
    expect(contractFor(runtime, "NOT_A_SCREEN")).toBeNull();
  });
});
