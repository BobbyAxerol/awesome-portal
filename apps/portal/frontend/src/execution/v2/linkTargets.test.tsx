/**
 * Link targets · every path a V2 screen can link to is a path the app mounts.
 *
 * The Compare links once pointed at /deployments/compare, which nothing mounts: the unit tests pinned the same wrong
 * string and every e2e spec typed its URL directly. This is the cheap guard (no browser): it renders the REAL
 * PortalRoutes (registry fixture, preview + V2 flags on, the heavy screens stubbed) at each path and asserts the
 * NotFound screen does not come up. The paths come from two places so neither can drift on its own:
 *
 *   1. the route builders the screens share (portfolios DEFAULT_ROUTES, the account/alpha/fleet href helpers, the admin
 *      defaults), called with sample ids;
 *   2. every in-app path literal in the V2 sources (comments stripped), which catches a screen that builds its own.
 *
 * The executable counterpart that clicks the links in a browser is e2e/execution-v2-links.spec.ts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../../portal/contracts";
import { ADMIN_OPERATIONS_HREF, ADMIN_PORTFOLIOS_HREF } from "./screens/admin";
import { accountHref, deploymentHref as accountDeploymentHref, ACCESS_PATH, ACCOUNTS_PATH, alphaHref as accountAlphaHref, portfolioHref } from "./screens/account/model";
import { deploymentHref as alphaDeploymentHref, replayHref } from "./screens/alpha/model";
import { reviewRouteFor } from "../screens/ApprovalInbox";
import { SPINE_ROUTES } from "./screens/canary/model";
import { canaryHref } from "./screens/live/model";
import { NEW_REQUEST_HREF, QUEUE_HREF, RUN_LIBRARY_HREF } from "./screens/request/model";
import { DEFAULT_ROUTES as WORKBENCH_ROUTES } from "./screens/workbench/model";
import { FLEET_ROUTE, fleetUrlForStageList } from "./screens/fleet/stageRedirect";
import { alphaHref as fleetAlphaHref } from "./screens/fleet/fleetModel";
import { DEFAULT_ROUTES, joinQuery } from "./screens/portfolios/routes";

// The screens are not under test, only whether a route mounts one. Each stub says which screen the route chose.
vi.mock("../ExecutionPreviewRoute", () => ({
  ExecutionPreviewRoute: ({ screenId }: { screenId: string }) => <p data-testid="mounted-screen">{screenId}</p>,
  PreviewFrame: ({ children }: { children: unknown }) => <>{children as never}</>,
}));
vi.mock("../../features/admin/UsersAccess", () => ({ UsersAccess: () => <p data-testid="mounted-screen">users</p> }));
vi.mock("../../features/admin/ProfileAccess", () => ({ ProfileAccess: () => <p data-testid="mounted-screen">profile-access</p> }));
vi.mock("../../features/quantbt/QuantBTModule", () => ({ QuantBTModule: () => <p data-testid="mounted-screen">quantbt</p> }));
vi.mock("../../features/planning/PlanningModule", () => ({ PlanningModule: () => <p data-testid="mounted-screen">planning</p> }));

const NOT_FOUND = "No feature in the current registry claims this route.";

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);

beforeEach(() => {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "");
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Renders PortalRoutes at `path` and says which screen mounted, or "NOT_FOUND". */
async function mountedAt(path: string): Promise<string> {
  const { PortalRoutes } = await import("../../app/PortalRoutes");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PortalRoutes registry={registry} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    if (screen.queryByText(NOT_FOUND) === null && screen.queryByTestId("mounted-screen") === null) throw new Error("still loading");
  });
  const stub = screen.queryByTestId("mounted-screen");
  const result = stub === null ? "NOT_FOUND" : (stub.textContent ?? "");
  cleanup();
  return result;
}

const pathOf = (target: string) => target.split(/[?#]/)[0];

describe("the guard itself", () => {
  it("sees a path nothing mounts as NOT_FOUND (the /deployments/compare bug)", async () => {
    expect(await mountedAt("/deployments/compare")).toBe("NOT_FOUND");
    expect(await mountedAt("/execution/portfolios")).toBe("NOT_FOUND");
  });
});

describe("the shared route builders produce mounted paths", () => {
  const ID = "x_1";
  const SCREEN_FOR: [string, string, string][] = [
    ["portfolios list", DEFAULT_ROUTES.list, "EXECUTION_PORTFOLIO_360_SCREEN"],
    ["portfolio 360", DEFAULT_ROUTES.portfolio(ID), "EXECUTION_PORTFOLIO_360_SCREEN"],
    ["compare", DEFAULT_ROUTES.compare as string, "EXECUTION_PORTFOLIO_360_SCREEN"],
    ["compare with ids", joinQuery(DEFAULT_ROUTES.compare as string, "in=a,b"), "EXECUTION_PORTFOLIO_360_SCREEN"],
    ["alpha 360", DEFAULT_ROUTES.alpha(ID), "EXECUTION_ALPHA_360_SCREEN"],
    ["fleet", DEFAULT_ROUTES.fleet, "EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
    ["account 360", DEFAULT_ROUTES.account(ID), "EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    ["paper workbench", DEFAULT_ROUTES.deployment(ID, "PAPER"), "EXECUTION_PAPER_WORKBENCH_SCREEN"],
    ["sandbox workbench", DEFAULT_ROUTES.deployment(ID, "SANDBOX"), "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
    ["live workbench", DEFAULT_ROUTES.deployment(ID, "LIVE"), "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
    ["canary has its own route under live", DEFAULT_ROUTES.deployment(ID, "CANARY"), "EXECUTION_CANARY_CONTROL_ROOM_SCREEN"],
    ["approvals", DEFAULT_ROUTES.approvals, "EXECUTION_APPROVAL_INBOX_SCREEN"],
    ["operations", DEFAULT_ROUTES.operations, "EXECUTION_OPERATIONS_QUEUE_SCREEN"],
    ["profile access", DEFAULT_ROUTES.access, "profile-access"],
  ];
  it.each(SCREEN_FOR)("portfolios DEFAULT_ROUTES · %s -> %s mounts %s", async (_label, target, screenId) => {
    expect(await mountedAt(target)).toBe(screenId);
  });

  const OTHER: [string, string][] = [
    ["account deploymentHref(paper)", accountDeploymentHref(ID, "paper")],
    ["account deploymentHref(sandbox)", accountDeploymentHref(ID, "sandbox")],
    ["account deploymentHref(live)", accountDeploymentHref(ID, "live")],
    ["account deploymentHref(unknown mode)", accountDeploymentHref(ID, null)],
    ["account alphaHref", accountAlphaHref(ID)],
    ["account portfolioHref", portfolioHref(ID)],
    ["account accountHref", accountHref(ID)],
    ["ACCOUNTS_PATH", ACCOUNTS_PATH],
    ["ACCESS_PATH", ACCESS_PATH],
    ["alpha deploymentHref(paper)", alphaDeploymentHref("paper", ID)],
    ["alpha deploymentHref(sandbox)", alphaDeploymentHref("sandbox", ID)],
    ["alpha deploymentHref(live)", alphaDeploymentHref("live", ID)],
    ["alpha replayHref", replayHref(ID, "order:o1")],
    ["fleet alphaHref", fleetAlphaHref(ID)],
    ["FLEET_ROUTE", FLEET_ROUTE],
    ["fleetUrlForStageList(paper)", fleetUrlForStageList("paper")],
    ["fleetUrlForStageList(live)", fleetUrlForStageList("live")],
    ["ADMIN_PORTFOLIOS_HREF", ADMIN_PORTFOLIOS_HREF],
    ["ADMIN_OPERATIONS_HREF", ADMIN_OPERATIONS_HREF],
  ];
  it.each(OTHER)("%s is mounted", async (_label, target) => {
    expect(await mountedAt(pathOf(target))).not.toBe("NOT_FOUND");
  });
});

// ------------------------------------------------------- the S3 stage screens (2026-10-19)

describe("the S3 stage screens' own paths mount the screen they name", () => {
  const ID = "dep_1";
  const MOUNTS: [string, string][] = [
    [`/deployments/paper/${ID}`, "EXECUTION_PAPER_WORKBENCH_SCREEN"],
    [`/deployments/paper/${ID}/vn-market`, "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN"],
    [`/deployments/sandbox/${ID}`, "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
    [`/deployments/live/${ID}`, "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
    [`/deployments/live/${ID}/canary`, "EXECUTION_CANARY_CONTROL_ROOM_SCREEN"],
    ["/governance/approvals/new", "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN"],
  ];
  it.each(MOUNTS)("%s mounts %s", async (path, screenId) => {
    expect(await mountedAt(path)).toBe(screenId);
  });

  it("Canary is a child of Live: both paths are distinct screens", async () => {
    expect(await mountedAt(`/deployments/live/${ID}`)).not.toBe(await mountedAt(`/deployments/live/${ID}/canary`));
  });

  // Every link a new screen builds, from the builders it exports (the literal scan below also reads the same sources).
  const BUILT: [string, string, string][] = [
    ["Live canaryHref", canaryHref(ID), "EXECUTION_CANARY_CONTROL_ROOM_SCREEN"],
    ["Canary spine to paper", SPINE_ROUTES.paper!(ID), "EXECUTION_PAPER_WORKBENCH_SCREEN"],
    ["Canary spine to sandbox", SPINE_ROUTES.sandbox!(ID), "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
    ["Canary spine to live", SPINE_ROUTES.live!(ID), "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
    ["Workbench to the deployment's blotter", WORKBENCH_ROUTES.blotter(ID), "EXECUTION_FULL_BLOTTER_SCREEN"],
    ["Workbench to an order in the blotter", WORKBENCH_ROUTES.blotter(ID, "o_1"), "EXECUTION_FULL_BLOTTER_SCREEN"],
    ["Workbench to the alpha", WORKBENCH_ROUTES.alpha("a_1"), "EXECUTION_ALPHA_360_SCREEN"],
    ["Workbench to the account", WORKBENCH_ROUTES.account("acc_1"), "EXECUTION_ACCOUNT_BROKER_360_SCREEN"],
    ["Workbench to the portfolio", WORKBENCH_ROUTES.portfolio("pf_1"), "EXECUTION_PORTFOLIO_360_SCREEN"],
    ["Workbench to operations", WORKBENCH_ROUTES.operations, "EXECUTION_OPERATIONS_QUEUE_SCREEN"],
    ["Workbench to exit reviews", WORKBENCH_ROUTES.exitReviews, "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
    ["Workbench to the fleet", WORKBENCH_ROUTES.fleet, "EXECUTION_ALPHA_FLEET_LIST_SCREEN"],
    ["Request QUEUE_HREF", QUEUE_HREF, "EXECUTION_APPROVAL_INBOX_SCREEN"],
    ["Request NEW_REQUEST_HREF", NEW_REQUEST_HREF, "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN"],
    ["Request Open request (R1 gate)", reviewRouteFor({ id: "AP-1", gate: "R1" }), "EXECUTION_GATE_R1_REVIEW_SCREEN"],
    ["reviewRouteFor R2", reviewRouteFor({ id: "AP-1", gate: "R2" }), "EXECUTION_GATE_R2_REVIEW_SCREEN"],
    ["reviewRouteFor paper exit", reviewRouteFor({ id: "EX-1", gate: "PAPER_EXIT" }), "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
    ["reviewRouteFor live gate", reviewRouteFor({ id: "AP-1", gate: "LIVE_GATE" }), "EXECUTION_GATE_LIVE_REVIEW_SCREEN"],
  ];
  it.each(BUILT)("%s (%s) resolves to %s", async (_label, target, screenId) => {
    expect(await mountedAt(pathOf(target))).toBe(screenId);
  });

  it("the Request screen's Run Library link is a mounted path (a different module, mounted by the shell)", async () => {
    expect(await mountedAt(pathOf(RUN_LIBRARY_HREF))).not.toBe("NOT_FOUND");
  });
});

// ------------------------------------------------------- every path literal in the V2 sources

const V2_ROOT = join(process.cwd(), "src/execution/v2");
const SKIP = /(\.test\.tsx?$|[\\/]testkit[\\/]|harness|\.fixtures?\.tsx?$|\.testbase\.tsx?$)/;
/** Bare lane roots are prefixes that `backTo.ts` matches against (its ROOTS list), not links: none of them is a route. */
const LANE_ROOTS = new Set(["/deployments", "/governance", "/execution", "/administration"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !SKIP.test(full)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** In-app path literals: a string/template starting with one of the lanes' roots. `${...}` becomes a sample id. */
const LITERAL = /(["'`])(\/(?:deployments|execution|governance|administration)(?:\/[^"'`\s]*)?)\1/g;

function literals(): { file: string; path: string }[] {
  const found = new Map<string, string>();
  for (const file of walk(V2_ROOT)) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(LITERAL)) {
      // `/deployments/${lane}/${id}`: the lane placeholder stands for each workbench lane, not for an id.
      const lanes = /^\/deployments\/\$\{[^}]*\}\//.test(match[2]) ? ["paper", "sandbox", "live"] : [null];
      for (const lane of lanes) {
        const text = lane === null ? match[2] : match[2].replace(/^\/deployments\/\$\{[^}]*\}/, `/deployments/${lane}`);
        const path = pathOf(text.replace(/\$\{[^}]*\}/g, "x_1"));
        if (LANE_ROOTS.has(path)) continue;
        if (!found.has(path)) found.set(path, relative(process.cwd(), file));
      }
    }
  }
  return [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, file]) => ({ file, path }));
}

describe("every in-app path literal in the V2 sources is mounted", () => {
  const found = literals();

  it("finds the literals (the scan itself is not empty)", () => {
    expect(found.length).toBeGreaterThan(10);
    expect(found.map((entry) => entry.path)).toContain("/deployments/portfolios");
  });

  it.each(found.map((entry) => [entry.path, entry.file] as const))("%s (%s)", async (path) => {
    expect(await mountedAt(path)).not.toBe("NOT_FOUND");
  });
});
