/**
 * UXM-07 route contract · what `ExecutionPreviewRoute` does with the URL (audit 2026-10-19, part 1 and 2).
 *
 * The build flags are read when the modules load, so each case stubs the env, resets the module graph and
 * imports the route fresh (the `stageRedirect.test` pattern). The screens are stubs that print the props the
 * route gave them: this file is about the route, not about the screens.
 *
 * D3 Esc keeps the query context and path/`sel` cannot disagree · D4/D10/M12 access and Admin links ·
 * D6 env lock on path-env routes · M2 Compare gating · redirects for `/deployments/alphas/archived` and
 * `/governance/exit-reviews` · flag off ships and renders nothing new.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { envLockFor, cockpitClearSearch, PATH_ENV_REASON } from "../../ExecutionPreviewRoute";
import { useRouteFeatures } from "./routeFeatures";

// V1 containers are markers: "stays on V1" is observable and nothing reads data.
vi.mock("../../screens/recomposeContainers", () => {
  const stub = (name: string) => () => <p data-v1={name}>{name}</p>;
  return {
    AccountBroker360RichContainer: stub("AccountBroker360"), AccountsBindingsRichContainer: stub("AccountsBindings"),
    AlphaFleetRichContainer: stub("AlphaFleet"), AlphaThreeSixtyRichContainer: stub("AlphaThreeSixty"),
    FullBlotterRichContainer: stub("FullBlotter"), LiveOverviewRichContainer: stub("LiveOverview"),
    PaperOverviewRichContainer: stub("PaperOverview"), PaperWorkbenchRichContainer: stub("PaperWorkbench"),
    PortfolioListRichContainer: stub("PortfolioList"), PortfolioThreeSixtyRichContainer: stub("PortfolioThreeSixty"),
    SandboxOverviewRichContainer: stub("SandboxOverview"),
  };
});
vi.mock("../../screens/containers", () => {
  const stub = (name: string) => () => <p data-v1={name}>{name}</p>;
  return {
    AdminCatalogueContainer: stub("Admin"), ApprovalInboxContainer: stub("Inbox"), CanaryControlRoomContainer: stub("Canary"),
    GateR1ReviewContainer: stub("R1"), GateR2ReviewContainer: stub("R2"), IncidentDetailContainer: stub("Incident"),
    LiveFullOperationsContainer: stub("LiveFull"), OperationsQueueContainer: stub("Operations"), PaperExitReviewContainer: stub("Exit"),
    SandboxCertificationContainer: stub("SandboxCertification"), GateLiveReviewContainer: stub("LiveReview"),
  };
});
// V2 screens that take the links under test: each prints what it was given.
vi.mock("../screens/cockpit", () => ({
  default: (props: { accessHref?: string; workspaceId?: string; pathSelection?: { id: string; kind: string } | null; onClearPathSelection?: () => void }) => (
    <div
      data-testid="cockpit"
      data-access={props.accessHref ?? ""}
      data-workspace={props.workspaceId ?? ""}
      data-path={props.pathSelection ? `${props.pathSelection.kind}:${props.pathSelection.id}` : ""}
    >
      <button type="button" onClick={() => props.onClearPathSelection?.()}>clear-path</button>
    </div>
  ),
}));
vi.mock("../screens/blotter", () => ({
  default: (props: { accessHref?: string }) => <div data-testid="blotter" data-access={props.accessHref ?? ""} />,
}));
vi.mock("../screens/admin", () => ({
  default: (props: { accessHref?: string; portfoliosHref?: string; operationsHref?: string }) => (
    <div data-testid="admin" data-access={props.accessHref ?? ""} data-portfolios={props.portfoliosHref ?? ""} data-operations={props.operationsHref ?? ""} />
  ),
}));
// The stubs import the hook inside the factory: after `resetModules` the route and the stubs must share the fresh context.
vi.mock("../screens/portfolios", async () => {
  const { useRouteFeatures: read } = await import("./routeFeatures");
  return { default: () => <div data-testid="portfolios" data-compare={String(read().compare)} /> };
});
vi.mock("../screens/portfolios/portfolio", async () => {
  const { useRouteFeatures: read } = await import("./routeFeatures");
  return { default: () => <div data-testid="portfolio" data-compare={String(read().compare)} /> };
});
vi.mock("../screens/compare", () => ({ default: () => <div data-testid="compare" /> }));
vi.mock("../screens/fleet", () => ({ default: () => <div data-testid="fleet" /> }));

const originalFetch = globalThis.fetch;

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where" data-nav={useNavigationType()}>{`${pathname}${search}`}</output>;
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });

const ROUTES: readonly [string, string][] = [
  ["/governance/approvals", "EXECUTION_APPROVAL_INBOX_SCREEN"],
  ["/governance/approvals/:approvalId/r1", "EXECUTION_GATE_R1_REVIEW_SCREEN"],
  ["/governance/exit-reviews", "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
  ["/governance/exit-reviews/:reviewId", "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
  ["/deployments/blotter", "EXECUTION_FULL_BLOTTER_SCREEN"],
  ["/administration/actions", "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN"],
  ["/deployments/alphas/:alphaId", "EXECUTION_ALPHA_360_SCREEN"],
  ["/deployments/paper/:deploymentId", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  ["/deployments/sandbox/:deploymentId", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
  ["/deployments/live/:deploymentId", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
  ["/deployments/portfolios", "EXECUTION_PORTFOLIO_360_SCREEN"],
  ["/deployments/portfolios/:portfolioId", "EXECUTION_PORTFOLIO_360_SCREEN"],
  ["/deployments/compare", "EXECUTION_COMPARE_SCREEN"],
];

async function mountRoute(url: string) {
  const { ExecutionPreviewRoute } = await import("../../ExecutionPreviewRoute");
  const { PortalPresentationProvider } = await import("../../../app/presentation");
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[url]}>
        <PortalPresentationProvider registry={null}>
          <Routes>
            {ROUTES.map(([path, screenId]) => (
              <Route key={path} path={path} element={<><Where /><ExecutionPreviewRoute screenId={screenId} /></>} />
            ))}
            {/* The landing places of the redirects: only the location is observed there. */}
            <Route path="/deployments/alphas" element={<Where />} />
          </Routes>
        </PortalPresentationProvider>
      </MemoryRouter>,
    );
  });
  return view;
}

const where = () => screen.getByTestId("where").textContent;
const query = (href: string | null | undefined) => new URLSearchParams((href ?? "").split("?")[1] ?? "");

beforeEach(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  globalThis.fetch = originalFetch;
});

function flags(manifest: string) {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
  vi.resetModules();
}

describe("cockpitClearSearch (D3)", () => {
  it("keeps every param but sel", () => {
    expect(cockpitClearSearch("?workspace_id=ws_1&sel=AP-2&from=portfolios&env=paper")).toBe("?workspace_id=ws_1&from=portfolios&env=paper");
    expect(cockpitClearSearch("?sel=AP-2")).toBe("");
    expect(cockpitClearSearch(new URLSearchParams("a=1"))).toBe("?a=1");
  });
});

describe("envLockFor (D6)", () => {
  const all = () => true;
  const none = () => false;

  it.each([
    ["EXECUTION_PAPER_WORKBENCH_SCREEN", "paper"],
    ["EXECUTION_PAPER_WORKBENCH_VNM_SCREEN", "paper"],
    ["EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "sandbox"],
    ["EXECUTION_CANARY_CONTROL_ROOM_SCREEN", "live"],
    ["EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "live"],
  ])("%s is decided by its path (%s), whatever the flags", (screenId, env) => {
    for (const isV2 of [all, none]) expect(envLockFor(screenId, {}, isV2)).toMatchObject({ reason: PATH_ENV_REASON, effective: env });
  });

  it.each([
    "EXECUTION_COMMAND_CENTER_SCREEN",
    "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
    "EXECUTION_APPROVAL_INBOX_SCREEN",
    "EXECUTION_GATE_R1_REVIEW_SCREEN",
    "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
    "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
    "EXECUTION_OPERATIONS_QUEUE_SCREEN",
    "EXECUTION_INCIDENT_DETAIL_SCREEN",
    "EXECUTION_FULL_BLOTTER_SCREEN",
  ])("%s: locked with a reason when its V2 screen is on, untouched when off", (screenId) => {
    const lock = envLockFor(screenId, {}, all);
    expect(lock?.reason.length ?? 0).toBeGreaterThan(10);
    expect(lock?.effective).toBeUndefined();
    expect(envLockFor(screenId, {}, none)).toBeUndefined();
  });

  it("the alpha route is the Fleet only without an alpha id; a 360 reads per environment", () => {
    expect(envLockFor("EXECUTION_ALPHA_360_SCREEN", { hasAlphaId: false }, all)).toBeDefined();
    expect(envLockFor("EXECUTION_ALPHA_360_SCREEN", { hasAlphaId: true }, all)).toBeUndefined();
    expect(envLockFor("EXECUTION_ALPHA_360_SCREEN", { hasAlphaId: false }, none)).toBeUndefined();
  });

  it("Compare has its own screen id and is locked while the compare flag is on; the portfolios route is never locked", () => {
    expect(envLockFor("EXECUTION_COMPARE_SCREEN", {}, all)).toBeDefined();
    expect(envLockFor("EXECUTION_COMPARE_SCREEN", {}, none)).toBeUndefined();
    expect(envLockFor("EXECUTION_PORTFOLIO_360_SCREEN", {}, all)).toBeUndefined();
  });

  it("Operations points at its own filter instead of claiming the bar applies", () => {
    expect(envLockFor("EXECUTION_OPERATIONS_QUEUE_SCREEN", {}, all)?.reason).toMatch(/own Environment filter/);
  });

  it("screens that do read the environment are not locked (accounts, 360s)", () => {
    for (const id of ["EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN", "EXECUTION_ACCOUNT_BROKER_360_SCREEN", "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN"]) {
      expect(envLockFor(id, {}, all)).toBeUndefined();
    }
  });
});

describe("shell + cockpit on", () => {
  beforeEach(() => flags("shell,cockpit,blotter,admin"));

  it("D3: Esc on a path selection keeps the query context and drops sel", async () => {
    await mountRoute("/governance/approvals/AP-1/r1?workspace_id=ws_1&from=portfolios&env=paper&sel=AP-1");
    const cockpit = await screen.findByTestId("cockpit");
    expect(cockpit.getAttribute("data-path")).toBe("r1:AP-1");
    fireEvent.click(screen.getByRole("button", { name: "clear-path" }));
    await waitFor(() => expect(where()).toBe("/governance/approvals?workspace_id=ws_1&from=portfolios&env=paper"));
  });

  it("D3: Esc without a sel still keeps workspace_id (the old code dropped the whole query)", async () => {
    await mountRoute("/governance/approvals/AP-1/r1?workspace_id=ws_1");
    await screen.findByTestId("cockpit");
    fireEvent.click(screen.getByRole("button", { name: "clear-path" }));
    await waitFor(() => expect(where()).toBe("/governance/approvals?workspace_id=ws_1"));
  });

  it("D3: when sel names another request than the path, sel wins and the path is replaced", async () => {
    await mountRoute("/governance/approvals/AP-1/r1?workspace_id=ws_1&sel=AP-2");
    await waitFor(() => expect(where()).toBe("/governance/approvals?workspace_id=ws_1&sel=AP-2"));
    // `replace`, so Back does not return to the disagreeing URL; the cockpit now mounts with no path selection.
    expect(screen.getByTestId("where").getAttribute("data-nav")).toBe("REPLACE");
    expect((await screen.findByTestId("cockpit")).getAttribute("data-path")).toBe("");
  });

  it("D3: sel equal to the path's request is not a conflict", async () => {
    await mountRoute("/governance/approvals/AP-1/r1?sel=AP-1");
    await settle();
    expect(where()).toBe("/governance/approvals/AP-1/r1?sel=AP-1");
    expect(screen.getByTestId("cockpit").getAttribute("data-path")).toBe("r1:AP-1");
  });

  it("D4/D10: the cockpit, Blotter and Admin get the My access link with the shared context", async () => {
    await mountRoute("/governance/approvals?workspace_id=ws_1&env=paper&window=30d&sel=AP-3");
    const href = (await screen.findByTestId("cockpit")).getAttribute("data-access");
    expect(href?.startsWith("/administration/profile-access?")).toBe(true);
    // sel is screen-local: it never travels.
    expect(Object.fromEntries(query(href))).toEqual({ env: "paper", window: "30d", workspace_id: "ws_1" });
    cleanup();

    await mountRoute("/deployments/blotter?workspace_id=ws_1");
    expect(query((await screen.findByTestId("blotter")).getAttribute("data-access")).get("workspace_id")).toBe("ws_1");
    cleanup();

    await mountRoute("/administration/actions?workspace_id=ws_1");
    const admin = await screen.findByTestId("admin");
    expect(admin.getAttribute("data-access")).toBe("/administration/profile-access?workspace_id=ws_1");
  });

  it("M12: Admin's links point at routes that exist, with no ?source=admin", async () => {
    await mountRoute("/administration/actions");
    const admin = await screen.findByTestId("admin");
    expect(admin.getAttribute("data-portfolios")).toBe("/deployments/portfolios");
    expect(admin.getAttribute("data-operations")).toBe("/execution/operations");
    expect(admin.getAttribute("data-access")).toBe("/administration/profile-access");
  });

  it("A1: the Exit Reviews root lands on the cockpit's exit-review view, keeping the context", async () => {
    await mountRoute("/governance/exit-reviews?workspace_id=ws_1&env=paper");
    await waitFor(() => expect(where()).toBe("/governance/approvals?workspace_id=ws_1&env=paper&view=exit-reviews"));
    expect(screen.getByTestId("where").getAttribute("data-nav")).toBe("REPLACE");
  });

  it("A1: an exit review with an id is not redirected", async () => {
    await mountRoute("/governance/exit-reviews/EX-7?workspace_id=ws_1");
    expect((await screen.findByTestId("cockpit")).getAttribute("data-path")).toBe("exit:EX-7");
    expect(where()).toBe("/governance/exit-reviews/EX-7?workspace_id=ws_1");
  });

  it("the shell on shows the bar, and a deployment path wins over ?env= with the one-line notice", async () => {
    const { container } = await mountRoute("/deployments/paper/dep_1?env=live");
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    expect(container.querySelectorAll('[data-control="env"] button')).toHaveLength(0);
    expect(container.querySelector<HTMLElement>('[data-control="env"]')?.dataset.v).toBe("paper");
    expect(container.querySelector(".exec-ctxbar")?.textContent).toContain("The path sets the environment");
  });

  it.each([
    ["/deployments/sandbox/dep_2", "sandbox"],
    ["/deployments/live/dep_3", "live"],
  ])("%s shows %s as the environment", async (path, env) => {
    const { container } = await mountRoute(`${path}?env=paper`);
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    expect(container.querySelector(`[data-control="env"]`)?.getAttribute("data-v")).toBe(env);
  });

  it("a screen that ignores the environment says so on the bar (Admin)", async () => {
    const { container } = await mountRoute("/administration/actions");
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    expect(container.querySelector('[data-control="env"]')).toBeNull();
    expect(container.querySelector(".exec-ctxbar")?.textContent).toMatch(/no environment filter/);
  });

  it("D7: rejected params are named on the bar, never echoed, and can be dismissed", async () => {
    const { container } = await mountRoute("/administration/actions?stage=foo&env=xx&window=24h&q=ok");
    await waitFor(() => expect(container.querySelector('[data-notice="invalid-params"]')).not.toBeNull());
    const notice = container.querySelector('[data-notice="invalid-params"]')!;
    expect(notice.textContent).toMatch(/parameters: env, window, stage( |$)/);
    expect(notice.textContent).not.toMatch(/foo|xx|24h/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(container.querySelector('[data-notice="invalid-params"]')).toBeNull();
    // The URL was rewritten to defaults once; the valid, screen-local param stays.
    expect(where()).toBe("/administration/actions?q=ok");
  });
});

describe("fleet on", () => {
  beforeEach(() => flags("shell,fleet"));

  it("`/deployments/alphas/archived` lands on the Fleet's Archived lens, keeping the context", async () => {
    await mountRoute("/deployments/alphas/archived?workspace_id=ws_1&env=paper#x");
    await waitFor(() => expect(where()).toBe("/deployments/alphas?workspace_id=ws_1&env=paper&tab=archived"));
    expect(screen.getByTestId("where").getAttribute("data-nav")).toBe("REPLACE");
  });

  it("a real alpha id is not touched", async () => {
    await mountRoute("/deployments/alphas/al_9?workspace_id=ws_1");
    await settle();
    expect(where()).toBe("/deployments/alphas/al_9?workspace_id=ws_1");
    expect(document.querySelector("[data-v1]")?.getAttribute("data-v1")).toBe("AlphaThreeSixty");
  });
});

describe("compare flag (M2)", () => {
  it("the Portfolios mounts read compare=false while the compare flag is off", async () => {
    flags("shell,portfolios");
    await mountRoute("/deployments/portfolios");
    expect((await screen.findByTestId("portfolios")).getAttribute("data-compare")).toBe("false");
    cleanup();
    await mountRoute("/deployments/portfolios/pf_1");
    expect((await screen.findByTestId("portfolio")).getAttribute("data-compare")).toBe("false");
  });

  it("and compare=true when it is on", async () => {
    flags("shell,portfolios,compare");
    await mountRoute("/deployments/portfolios");
    expect((await screen.findByTestId("portfolios")).getAttribute("data-compare")).toBe("true");
  });

  it("Compare mounts on its own route (registry rev 9) with the compare flag on", async () => {
    flags("shell,portfolios,compare");
    await mountRoute("/deployments/compare?in=pf_1,pf_2&env=paper");
    expect(await screen.findByTestId("compare")).toBeTruthy();
    expect(where()).toBe("/deployments/compare?in=pf_1,pf_2&env=paper");
  });

  it("the pre-rev-9 URL is redirected to it: `view` dropped, every other param kept, the path's portfolio becomes the first pick", async () => {
    flags("shell,portfolios,compare");
    await mountRoute("/deployments/portfolios?view=compare&in=pf_1,pf_2&from=portfolios&workspace_id=ws_1");
    expect(await screen.findByTestId("compare")).toBeTruthy();
    expect(where()).toBe("/deployments/compare?in=pf_1%2Cpf_2&from=portfolios&workspace_id=ws_1");
    cleanup();
    await mountRoute("/deployments/portfolios/pf_9?view=compare&env=paper");
    expect(await screen.findByTestId("compare")).toBeTruthy();
    expect(where()).toBe("/deployments/compare?env=paper&in=pf_9");
  });

  it("with the compare flag off the old URL is the portfolios screen again, not a redirect", async () => {
    flags("shell,portfolios");
    await mountRoute("/deployments/portfolios?view=compare");
    expect(await screen.findByTestId("portfolios")).toBeTruthy();
    expect(screen.queryByTestId("compare")).toBeNull();
    expect(where()).toBe("/deployments/portfolios?view=compare");
  });

  it("outside any route (a screen under test) Compare reads as available", () => {
    function Probe() {
      return <i data-testid="probe" data-compare={String(useRouteFeatures().compare)} />;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe").getAttribute("data-compare")).toBe("true");
  });
});

describe("flag off", () => {
  beforeEach(() => vi.resetModules());

  it("nothing is redirected and no V2 element renders", async () => {
    const { container } = await mountRoute("/deployments/alphas/archived?workspace_id=ws_1");
    await settle();
    expect(where()).toBe("/deployments/alphas/archived?workspace_id=ws_1");
    expect(container.querySelector(".exec-ctxbar")).toBeNull();
    cleanup();

    const root = await mountRoute("/governance/exit-reviews?workspace_id=ws_1");
    await settle();
    expect(where()).toBe("/governance/exit-reviews?workspace_id=ws_1");
    expect(root.container.querySelector('[data-testid="cockpit"]')).toBeNull();
  });

  it("the shell on but the cockpit and fleet off keeps both old paths where they were", async () => {
    flags("shell");
    await mountRoute("/governance/exit-reviews");
    await settle();
    expect(where()).toBe("/governance/exit-reviews");
    cleanup();
    await mountRoute("/deployments/alphas/archived");
    await settle();
    expect(where()).toBe("/deployments/alphas/archived");
  });

  it("the source gates both redirect imports on the raw env string and imports the chunk once per component", () => {
    const source = readFileSync(join(process.cwd(), "src/execution/ExecutionPreviewRoute.tsx"), "utf8");
    expect(source).toMatch(/const V2ArchivedRedirect = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\n?\s*\? lazy\(/);
    expect(source).toMatch(/const V2ExitReviewsRedirect = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\n?\s*\? lazy\(/);
    // No static import of the redirect module from the entry.
    expect(source).not.toMatch(/^import .*shell\/redirects/m);
  });
});
