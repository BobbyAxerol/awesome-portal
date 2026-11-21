/**
 * The old stage lists land on the V2 Fleet (UXM-07 S1/S7, review2/07 s2).
 *
 * Flag on (`fleet` in the manifest): `/deployments/{paper,sandbox,live}` redirect
 * to `/deployments/alphas` with the lens' stage words and the stage's
 * environment, keeping every other param. The workbench detail routes do not
 * redirect. Flag off: the V1 list renders where it was, and the build carries
 * no redirect chunk.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fleetUrlForStageList, type StageList } from "./stageRedirect";
import { stagesForLens } from "./fleetModel";

// The V1 containers are not under test (and read their own data): each is a marker, so "stays on V1" is observable.
vi.mock("../../../screens/recomposeContainers", () => {
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
vi.mock("../../../screens/containers", () => {
  const stub = (name: string) => () => <p data-v1={name}>{name}</p>;
  return {
    AdminCatalogueContainer: stub("Admin"), ApprovalInboxContainer: stub("Inbox"), CanaryControlRoomContainer: stub("Canary"),
    GateR1ReviewContainer: stub("R1"), GateR2ReviewContainer: stub("R2"), IncidentDetailContainer: stub("Incident"),
    LiveFullOperationsContainer: stub("LiveFull"), OperationsQueueContainer: stub("Operations"), PaperExitReviewContainer: stub("Exit"),
    SandboxCertificationContainer: stub("SandboxCertification"), GateLiveReviewContainer: stub("LiveReview"),
  };
});

const originalFetch = globalThis.fetch;

describe("fleetUrlForStageList", () => {
  it.each<[StageList, string, string]>([
    ["paper", "", "/deployments/alphas?env=paper&stage=paper"],
    ["sandbox", "", "/deployments/alphas?env=sandbox&stage=sandbox"],
    // Real-funded is canary + live; the live environment is the default and stays out of the URL.
    ["live", "", "/deployments/alphas?stage=canary%2Clive"],
  ])("%s list lands on the Fleet", (list, search, expected) => {
    expect(fleetUrlForStageList(list, search)).toBe(expected);
  });

  it("uses the Fleet's own lens definitions, so the two cannot drift", () => {
    expect(new URLSearchParams(fleetUrlForStageList("live").split("?")[1]).get("stage")).toBe(stagesForLens("real").join(","));
    expect(new URLSearchParams(fleetUrlForStageList("paper").split("?")[1]).get("stage")).toBe(stagesForLens("paper").join(","));
    expect(new URLSearchParams(fleetUrlForStageList("sandbox").split("?")[1]).get("stage")).toBe(stagesForLens("sandbox").join(","));
  });

  it("keeps every other param, and the hash", () => {
    expect(fleetUrlForStageList("paper", "?workspace_id=ws_1&q=carry&sort=updated&sel=al_9", "#x"))
      .toBe("/deployments/alphas?workspace_id=ws_1&q=carry&sort=updated&sel=al_9&env=paper&stage=paper#x");
  });

  it("a stage or env the link already carries wins over the stage list's", () => {
    expect(fleetUrlForStageList("paper", "?stage=canary,live")).toBe("/deployments/alphas?stage=canary%2Clive&env=paper");
    expect(fleetUrlForStageList("paper", "?env=sandbox&stage=sandbox")).toBe("/deployments/alphas?env=sandbox&stage=sandbox");
  });
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

/** Lets lazy chunks and any redirect land inside act. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });

async function mountRoute(url: string) {
  // Both come from the same module graph: resetModules gives each test a fresh context object.
  const { ExecutionPreviewRoute } = await import("../../../ExecutionPreviewRoute");
  const { PortalPresentationProvider } = await import("../../../../app/presentation");
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(
    <MemoryRouter initialEntries={[url]}>
      <PortalPresentationProvider registry={null}>
      <Routes>
        <Route path="/deployments/paper" element={<><Where /><ExecutionPreviewRoute screenId="EXECUTION_PAPER_WORKBENCH_SCREEN" /></>} />
        <Route path="/deployments/sandbox" element={<><Where /><ExecutionPreviewRoute screenId="EXECUTION_SANDBOX_CERTIFICATION_SCREEN" /></>} />
        <Route path="/deployments/live" element={<><Where /><ExecutionPreviewRoute screenId="EXECUTION_LIVE_FULL_OPERATIONS_SCREEN" /></>} />
        <Route path="/deployments/paper/:deploymentId" element={<><Where /><ExecutionPreviewRoute screenId="EXECUTION_PAPER_WORKBENCH_SCREEN" /></>} />
        <Route path="/deployments/sandbox/:deploymentId" element={<><Where /><ExecutionPreviewRoute screenId="EXECUTION_SANDBOX_CERTIFICATION_SCREEN" /></>} />
        <Route path="/deployments/live/:deploymentId" element={<><Where /><ExecutionPreviewRoute screenId="EXECUTION_LIVE_FULL_OPERATIONS_SCREEN" /></>} />
        <Route path="/deployments/alphas" element={<Where />} />
      </Routes>
      </PortalPresentationProvider>
    </MemoryRouter>,
  ); });
  return view;
}

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

describe("flag on", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "shell,fleet");
    vi.resetModules();
  });

  it.each([
    ["/deployments/paper", "/deployments/alphas?env=paper&stage=paper"],
    ["/deployments/sandbox", "/deployments/alphas?env=sandbox&stage=sandbox"],
    ["/deployments/live", "/deployments/alphas?stage=canary%2Clive"],
  ])("%s redirects to the Fleet with the matching stage", async (from, to) => {
    await mountRoute(from);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(to));
  });

  it("keeps workspace_id and other params on the way", async () => {
    await mountRoute("/deployments/paper?workspace_id=ws_TEST_ONLY&q=carry");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/deployments/alphas?workspace_id=ws_TEST_ONLY&q=carry&env=paper&stage=paper"));
  });

  it("a deep link that already names a stage keeps it", async () => {
    await mountRoute("/deployments/live?stage=live");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/deployments/alphas?stage=live"));
  });

  it.each(["/deployments/paper/dep_1", "/deployments/sandbox/dep_2", "/deployments/live/dep_3"])("%s (a workbench) does not redirect", async (path) => {
    await mountRoute(path);
    await settle();
    expect(screen.getByTestId("where").textContent).toBe(path);
    expect(document.querySelector("[data-v1]")?.getAttribute("data-v1")).toMatch(/Workbench|Certification|LiveFull/);
  });
});

describe("flag on, fleet not in the manifest", () => {
  it("keeps the V1 list where it was", async () => {
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "shell,ops");
    vi.resetModules();
    await mountRoute("/deployments/paper?workspace_id=ws_1");
    await settle();
    expect(screen.getByTestId("where").textContent).toBe("/deployments/paper?workspace_id=ws_1");
    expect(document.querySelector("[data-v1]")?.getAttribute("data-v1")).toBe("PaperOverview");
  });
});

describe("flag off", () => {
  beforeEach(() => vi.resetModules());

  it.each(["/deployments/paper", "/deployments/sandbox", "/deployments/live"])("%s stays on the V1 list", async (path) => {
    const { container } = await mountRoute(`${path}?workspace_id=ws_1`);
    await settle();
    expect(screen.getByTestId("where").textContent).toBe(`${path}?workspace_id=ws_1`);
    expect(container.querySelector(".exec-ctxbar")).toBeNull();
    expect(container.querySelector("[data-v1]")?.getAttribute("data-v1")).toBe({ "/deployments/paper": "PaperOverview", "/deployments/sandbox": "SandboxOverview", "/deployments/live": "LiveOverview" }[path]);
  });

  it("the source gates the redirect import on the raw env string and imports it once", () => {
    const source = readFileSync(join(process.cwd(), "src/execution/ExecutionPreviewRoute.tsx"), "utf8");
    expect(source).toMatch(/const V2FleetStageRedirect = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS \? lazy\(\(\) => import\("\.\/v2\/screens\/fleet\/stageRedirect"\)\) : null;/);
    expect(source.match(/v2\/screens\/fleet\/stageRedirect/g)).toHaveLength(1);
    // No static import of the redirect or of the fleet model from the entry: a flag-off build reaches them through no path.
    expect(source).not.toMatch(/^import .*fleet(Model|\/stageRedirect)/m);
  });
});
