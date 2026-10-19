/**
 * UXM-07 S0 · the flag-off proof: with VITE_EXECUTION_V2_SCREENS unset the
 * preview frame renders exactly the markup it rendered before V2 existed.
 * The snapshot below was captured from the V1 frame before the V2 branch was
 * added; a diff here is a pixel change on every V1 screen.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalRegistryDocument } from "../../portal/contracts";
import { PreviewFrame } from "../ExecutionPreviewRoute";
import { EXECUTION_V2_SCREENS, EXECUTION_V2_SHELL, parseV2Manifest } from "./flags";

// V1 containers are markers: which screen the route chose is observable and nothing reads data.
vi.mock("../screens/recomposeContainers", () => {
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
vi.mock("../screens/containers", () => {
  const stub = (name: string) => () => <p data-v1={name}>{name}</p>;
  return {
    AdminCatalogueContainer: stub("Admin"), ApprovalInboxContainer: stub("Inbox"), CanaryControlRoomContainer: stub("Canary"),
    GateR1ReviewContainer: stub("R1"), GateR2ReviewContainer: stub("R2"), IncidentDetailContainer: stub("Incident"),
    LiveFullOperationsContainer: stub("LiveFull"), OperationsQueueContainer: stub("Operations"), PaperExitReviewContainer: stub("Exit"),
    SandboxCertificationContainer: stub("SandboxCertification"), GateLiveReviewContainer: stub("LiveReview"),
  };
});
vi.mock("../screens/NewApprovalRequest", () => ({ NewApprovalRequestContainer: () => <p data-v1="NewRequest">NewRequest</p> }));

afterEach(cleanup);

describe("V2 flag off", () => {
  it("the manifest is empty and the shell flag is off", () => {
    expect(parseV2Manifest(undefined).size).toBe(0);
    expect(EXECUTION_V2_SCREENS.size).toBe(0);
    expect(EXECUTION_V2_SHELL).toBe(false);
  });

  it("PreviewFrame renders the V1 markup with no V2 element", async () => {
    let container!: HTMLElement;
    await act(async () => {
      container = render(
      <MemoryRouter initialEntries={["/execution/fleet"]}>
        <PreviewFrame screenId="alpha_fleet"><p>child</p></PreviewFrame>
      </MemoryRouter>,
      ).container;
    });
    expect(container.querySelector(".exec-ctxbar, .exec-cmdbar, .exec-flag")).toBeNull();
    // Nothing of the S3 stage screens or the cockpit's request drawer is in the frame either.
    expect(container.querySelector('[data-screen$="-v2"], .exec-dock, .exec-ck-btn')).toBeNull();
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div data-theme="operations-carbon" data-density="operational" data-surface="deployments" class="exec-surface exec-preview-shell"><aside class="exec-preview-banner" role="status" data-execution-preview="http"><strong>PORTAL READS · SAME-ORIGIN</strong><span>Every read is a same-origin Portal BFF call · commands go through the relay</span><details class="exec-preview-details"><summary>Details</summary><p>The browser calls only the Portal's declared /api/v1/execution routes on this origin. It never contacts AWS-HK, the Trading System, any broker or any database directly; screens whose contract is not published render a typed unavailable state instead of substitute data.</p></details><details class="exec-preview-inspector"><summary>Inspector</summary><dl class="exec-preview-inspector-list"><div><dt>screen</dt><dd><code data-preview-screen-id="true">alpha_fleet</code></dd></div><div><dt>delivery</dt><dd><code>http</code></dd></div><div><dt>build flag</dt><dd><code>VITE_EXECUTION_PREVIEW_ENABLED=true</code></dd></div></dl></details></aside><p>child</p></div>"`);
  });

  it("the New request frame is still the light governance surface, and a stage frame still has no window or environment lock", async () => {
    let container!: HTMLElement;
    await act(async () => {
      container = render(
        <MemoryRouter initialEntries={["/governance/approvals/new"]}>
          <PreviewFrame screenId="EXECUTION_NEW_APPROVAL_REQUEST_SCREEN"><p>child</p></PreviewFrame>
        </MemoryRouter>,
      ).container;
    });
    expect(container.querySelector(".exec-surface")?.getAttribute("data-surface")).toBe("governance");
    expect(container.querySelector(".exec-surface")?.getAttribute("data-theme")).toBeNull();
    cleanup();
    await act(async () => {
      container = render(
        <MemoryRouter initialEntries={["/deployments/live/dep_1/canary"]}>
          <PreviewFrame screenId="EXECUTION_CANARY_CONTROL_ROOM_SCREEN"><p>child</p></PreviewFrame>
        </MemoryRouter>,
      ).container;
    });
    expect(container.querySelector(".exec-ctxbar, .exec-ctxbar-lock")).toBeNull();
  });
});

/* ── S3 stage screens (2026-10-19): with the manifest empty every route renders its V1 screen ── */

describe("V2 flag off · S3 stage routes", () => {
  const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "");
    vi.resetModules();
    globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    globalThis.fetch = originalFetch;
  });

  it.each([
    ["/deployments/paper/dep_1", "PaperWorkbench"],
    ["/deployments/paper/dep_1/vn-market", "PaperWorkbench"],
    ["/deployments/sandbox/dep_1", "SandboxCertification"],
    ["/deployments/live/dep_1", "LiveFull"],
    ["/deployments/live/dep_1/canary", "Canary"],
    ["/governance/approvals/new", "NewRequest"],
  ])("%s renders the V1 screen (%s), with no V2 root and no V2 chrome", async (path, v1) => {
    const { PortalRoutes } = await import("../../app/PortalRoutes");
    const { PortalPresentationProvider } = await import("../../app/presentation");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    let container!: HTMLElement;
    await act(async () => {
      container = render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>
            <PortalPresentationProvider registry={registry}><PortalRoutes registry={registry} /></PortalPresentationProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      ).container;
    });
    await waitFor(() => expect(container.querySelector(`[data-v1="${v1}"]`)).not.toBeNull());
    expect(container.querySelector('[data-screen$="-v2"], .exec-ctxbar, .exec-dock')).toBeNull();
  });
});
