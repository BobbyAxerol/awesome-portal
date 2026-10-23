/**
 * "Where each V1 screen went" (artifact table), end to end through the real route table (WP-D, audit 2026-10-23 section 4):
 * every old URL lands on its V2 destination with its context kept, the replay alias reaches the replay tab, and with the flags
 * off nothing is redirected. The screens are stubs: this file is about the URL.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alphaReplayUrl } from "../../ExecutionPreviewRoute";
import { ALPHA_REPLAY_ALIAS_PATH, EXECUTION_PREVIEW_EXTRA_ROUTES } from "../../previewRegistry";

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
vi.mock("../screens/fleet", () => ({ default: () => <div data-testid="fleet" /> }));
vi.mock("../screens/alpha", () => ({
  default: (props: { alphaId: string }) => <div data-testid="alpha" data-alpha={props.alphaId} />,
}));
vi.mock("../screens/cockpit", () => ({ default: () => <div data-testid="cockpit" /> }));
vi.mock("../screens/compare", () => ({ default: () => <div data-testid="compare" /> }));
vi.mock("../screens/portfolios", () => ({ default: () => <div data-testid="portfolios" /> }));
vi.mock("../screens/portfolios/portfolio", () => ({ default: () => <div data-testid="portfolio" /> }));

const originalFetch = globalThis.fetch;

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

const ROUTES: readonly [string, string][] = [
  ["/deployments/alphas/:alphaId", "EXECUTION_ALPHA_360_SCREEN"],
  ["/deployments/paper", "EXECUTION_PAPER_WORKBENCH_SCREEN"],
  ["/deployments/sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
  ["/deployments/live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
  ["/deployments/portfolios", "EXECUTION_PORTFOLIO_360_SCREEN"],
  ["/governance/exit-reviews", "EXECUTION_PAPER_EXIT_REVIEW_SCREEN"],
  // The extra paths of the real table, mounted the way `PortalRoutes` mounts them.
  ...EXECUTION_PREVIEW_EXTRA_ROUTES.map((extra): [string, string] => [extra.path, extra.screenId]),
];

async function mount(url: string, manifest: string | null) {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  if (manifest !== null) vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
  vi.resetModules();
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  const { ExecutionPreviewRoute } = await import("../../ExecutionPreviewRoute");
  const { PortalPresentationProvider } = await import("../../../app/presentation");
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <PortalPresentationProvider registry={null}>
          <Routes>
            {ROUTES.map(([path, screenId]) => (
              <Route key={path} path={path} element={<><Where /><ExecutionPreviewRoute screenId={screenId} /></>} />
            ))}
            <Route path="/deployments/alphas" element={<Where />} />
            <Route path="/deployments/compare" element={<Where />} />
            <Route path="/governance/approvals" element={<Where />} />
          </Routes>
        </PortalPresentationProvider>
      </MemoryRouter>,
    );
  });
}
const where = () => screen.getByTestId("where").textContent;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  globalThis.fetch = originalFetch;
});

describe("alphaReplayUrl", () => {
  it("is the alpha's own route with tab=replay, every other param and the hash kept, the id encoded", () => {
    expect(alphaReplayUrl("al_btc", "")).toBe("/deployments/alphas/al_btc?tab=replay");
    expect(alphaReplayUrl("al_btc", "?workspace_id=ws_1&env=paper&window=30d", "#x")).toBe("/deployments/alphas/al_btc?workspace_id=ws_1&env=paper&window=30d&tab=replay#x");
    expect(alphaReplayUrl("a/b c", new URLSearchParams("tab=overview"))).toBe("/deployments/alphas/a%2Fb%20c?tab=replay");
  });
});

describe("the replay alias", () => {
  it("is a route of the real table that names the Alpha 360 screen and no new feature", () => {
    expect(ALPHA_REPLAY_ALIAS_PATH).toBe("/deployments/alphas/:alphaId/replay");
    expect(EXECUTION_PREVIEW_EXTRA_ROUTES).toEqual([{ path: ALPHA_REPLAY_ALIAS_PATH, screenId: "EXECUTION_ALPHA_360_SCREEN" }]);
  });

  it("`/deployments/alphas/:id/replay` replaces itself with the replay tab, keeping the context", async () => {
    await mount("/deployments/alphas/al_btc/replay?workspace_id=ws_1&env=paper", "shell,alpha");
    await waitFor(() => expect(where()).toBe("/deployments/alphas/al_btc?workspace_id=ws_1&env=paper&tab=replay"));
    expect(await screen.findByTestId("alpha")).toBeTruthy();
    expect(screen.getByTestId("alpha").getAttribute("data-alpha")).toBe("al_btc");
  });

  it("a trailing slash reaches the same place", async () => {
    await mount("/deployments/alphas/al_btc/replay/", "shell,alpha");
    await waitFor(() => expect(where()).toBe("/deployments/alphas/al_btc?tab=replay"));
  });

  it("the existing deep link `?tab=replay` is untouched", async () => {
    await mount("/deployments/alphas/al_btc?tab=replay&env=paper", "shell,alpha");
    expect(await screen.findByTestId("alpha")).toBeTruthy();
    expect(where()).toBe("/deployments/alphas/al_btc?tab=replay&env=paper");
  });
});

describe("where each V1 screen went", () => {
  const FLAGS = "shell,fleet,cockpit,alpha,portfolios,compare";

  it.each([
    ["Paper list", "/deployments/paper?workspace_id=ws_1", "/deployments/alphas?workspace_id=ws_1&env=paper&stage=paper"],
    ["Sandbox list", "/deployments/sandbox?workspace_id=ws_1", "/deployments/alphas?workspace_id=ws_1&env=sandbox&stage=sandbox"],
    ["Live list", "/deployments/live?workspace_id=ws_1", "/deployments/alphas?workspace_id=ws_1&stage=canary%2Clive"],
    ["Archived Alphas", "/deployments/alphas/archived?workspace_id=ws_1", "/deployments/alphas?workspace_id=ws_1&tab=archived"],
    ["Exit Reviews root", "/governance/exit-reviews?workspace_id=ws_1", "/governance/approvals?workspace_id=ws_1&view=exit-reviews"],
    ["Compare (pre rev 9)", "/deployments/portfolios?view=compare&in=pf_1,pf_2", "/deployments/compare?in=pf_1%2Cpf_2"],
  ])("%s: %s lands on %s", async (_name, from, to) => {
    await mount(from, FLAGS);
    await waitFor(() => expect(where()).toBe(to));
  });

  it("flag off: no old URL is redirected (the V1 screens answer where they were)", async () => {
    await mount("/deployments/alphas/archived?workspace_id=ws_1", null);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(where()).toBe("/deployments/alphas/archived?workspace_id=ws_1");
    cleanup();
    await mount("/deployments/paper?workspace_id=ws_1", null);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(where()).toBe("/deployments/paper?workspace_id=ws_1");
  });
});
