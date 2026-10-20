/** UXM-07 S0 · with the shell flag on, PreviewFrame mounts the V2 context bar and keeps the rest of the frame. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../../portal/contracts";

// V1 containers are markers: "stays on V1" is observable and nothing reads data. The V2 screens are the real ones.
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

beforeEach(() => {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "shell");
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("V2 shell flag on", () => {
  it("renders the context bar inside the surface, after the banner, before the children", async () => {
    const { PreviewFrame } = await import("../ExecutionPreviewRoute");
    let container!: HTMLElement;
    await act(async () => {
      container = render(
        <MemoryRouter initialEntries={["/execution/fleet?env=paper"]}>
          <PreviewFrame screenId="alpha_fleet"><p data-testid="child">child</p></PreviewFrame>
        </MemoryRouter>,
      ).container;
    });
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    const surface = container.querySelector(".exec-surface")!;
    expect(surface.contains(container.querySelector(".exec-ctxbar"))).toBe(true);
    const order = [...surface.children].map((el) => el.className || el.tagName);
    expect(order.findIndex((c) => String(c).includes("exec-preview-banner")))
      .toBeLessThan(order.findIndex((c) => String(c).includes("exec-ctxbar")));
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  async function frame(manifest: string, screenId: string, entry = "/execution/orders?env=paper") {
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
    vi.resetModules();
    const { PreviewFrame } = await import("../ExecutionPreviewRoute");
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[entry]}>
          <PreviewFrame screenId={screenId}><p>child</p></PreviewFrame>
        </MemoryRouter>,
      );
    });
    await waitFor(() => expect(document.querySelector(".exec-ctxbar")).not.toBeNull());
  }

  it("the V2 Blotter draws no environment buttons (its read has none) and presses nothing, with the reason kept, and only there", async () => {
    await frame("shell,blotter", "EXECUTION_FULL_BLOTTER_SCREEN");
    expect(screen.queryByRole("button", { name: "Paper" })).toBeNull();
    expect(document.querySelector('[data-control="env"]')).toBeNull();
    expect(document.querySelector(".exec-ctxbar")?.textContent).toContain("Not published (FE-052)");
    expect(document.querySelector('[data-notice="lock"]')?.textContent).toContain("Not applied: Environment");
  });

  it("the V2 Blotter reads 'Window: Current retained window' (its read takes no window), and only there", async () => {
    await frame("shell,blotter", "EXECUTION_FULL_BLOTTER_SCREEN");
    expect(document.querySelector(".exec-ctxbar-lock")?.textContent).toBe("Window: Current retained window");
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    expect(document.querySelector(".exec-ctxbar")?.textContent).toContain("Not published (FE-025)");
    cleanup();
    await frame("shell", "EXECUTION_FULL_BLOTTER_SCREEN");
    expect(document.querySelector(".exec-ctxbar-lock")).toBeNull();
    cleanup();
    await frame("shell,blotter", "alpha_fleet");
    expect(document.querySelector(".exec-ctxbar-lock")).toBeNull();
  });

  it("leaves the environment live on the Blotter while the blotter flag is off, and on other screens", async () => {
    await frame("shell", "EXECUTION_FULL_BLOTTER_SCREEN");
    expect((screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    await frame("shell,blotter", "alpha_fleet");
    expect((screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Operations states why the window is off (its own Range, FE-025) without a fixed-window chip", async () => {
    await frame("shell,ops", "EXECUTION_OPERATIONS_QUEUE_SCREEN", "/execution/operations?env=paper");
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    expect(document.querySelector(".exec-ctxbar")?.textContent).toContain("Operations has its own Range control below. The server takes no window (FE-025).");
    expect(document.querySelector(".exec-ctxbar-lock")).toBeNull();
  });

  it("another screen keeps the generic window reason, and Operations with its flag off does too", async () => {
    await frame("shell,ops", "alpha_fleet", "/execution/fleet?env=paper");
    const generic = (): string | null | undefined => {
      expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
      return document.querySelector(".exec-ctxbar")?.textContent;
    };
    expect(generic()).toContain("Window applies when the server supports it.");
    cleanup();
    await frame("shell", "EXECUTION_OPERATIONS_QUEUE_SCREEN", "/execution/operations?env=paper");
    expect(generic()).toContain("Window applies when the server supports it.");
  });
});

/* ── S3 stage screens (2026-10-19) · one key and one chunk per screen, mounted through the real PortalRoutes ── */

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
const S3_KEYS = ["workbench", "sandbox", "canary", "live", "request"] as const;

/** path, the flag that mounts V2 there, the V2 root (`data-screen`), the V1 marker the flag-off route shows. */
const STAGE_MOUNTS: readonly (readonly [string, (typeof S3_KEYS)[number], string, string])[] = [
  ["/deployments/paper/dep_1", "workbench", "workbench-v2", "PaperWorkbench"],
  ["/deployments/paper/dep_1/vn-market", "workbench", "workbench-v2", "PaperWorkbench"],
  ["/deployments/sandbox/dep_1", "sandbox", "sandbox-v2", "SandboxCertification"],
  ["/deployments/live/dep_1", "live", "live-v2", "LiveFull"],
  ["/deployments/live/dep_1/canary", "canary", "canary-v2", "Canary"],
  ["/governance/approvals/new", "request", "new-request-v2", "NewRequest"],
];
const V2_ROOTS = ["workbench-v2", "sandbox-v2", "canary-v2", "live-v2", "new-request-v2"];

describe("S3 stage screens flag on", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    // Nothing answers: the V2 roots render their own states, the V1 markers need no data.
    globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 404, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function mountApp(manifest: string, path: string): Promise<HTMLElement> {
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
    vi.resetModules();
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
    return container;
  }
  const locks = (container: HTMLElement) => [...container.querySelectorAll(".exec-ctxbar-lock")].map((el) => el.textContent ?? "");
  const roots = (container: HTMLElement) => V2_ROOTS.filter((name) => container.querySelector(`[data-screen="${name}"]`) !== null);

  it.each(STAGE_MOUNTS)("%s (key %s) mounts the V2 root %s and no V1 marker", async (path, key, root, v1) => {
    const container = await mountApp(`shell,${key}`, path);
    await waitFor(() => expect(container.querySelector(`[data-screen="${root}"]`)).not.toBeNull());
    expect(roots(container)).toEqual([root]);
    expect(container.querySelector(`[data-v1="${v1}"]`)).toBeNull();
  });

  it.each(STAGE_MOUNTS)("%s (key %s) stays V1 when only the other S3 keys are on (per-key flags, no shared `stages`)", async (path, key, root, v1) => {
    const others = S3_KEYS.filter((other) => other !== key).join(",");
    const container = await mountApp(`shell,${others}`, path);
    await waitFor(() => expect(container.querySelector(`[data-v1="${v1}"]`)).not.toBeNull());
    expect(roots(container)).toEqual([]);
    expect(root).toBeTruthy();
  });

  it("/deployments/live/:id is Live and /deployments/live/:id/canary is Canary, with every key on", async () => {
    const all = `shell,${S3_KEYS.join(",")}`;
    let container = await mountApp(all, "/deployments/live/dep_1");
    await waitFor(() => expect(container.querySelector('[data-screen="live-v2"]')).not.toBeNull());
    expect(roots(container)).toEqual(["live-v2"]);
    cleanup();
    container = await mountApp(all, "/deployments/live/dep_1/canary");
    await waitFor(() => expect(container.querySelector('[data-screen="canary-v2"]')).not.toBeNull());
    expect(roots(container)).toEqual(["canary-v2"]);
  });

  it("the Paper variant is a prop of the one screen: /vn-market mounts the same root with variant vnm", async () => {
    const container = await mountApp("shell,workbench", "/deployments/paper/dep_1/vn-market");
    await waitFor(() => expect(container.querySelector('[data-screen="workbench-v2"]')).not.toBeNull());
    expect(container.querySelector('[data-screen="workbench-v2"]')?.getAttribute("data-variant")).toBe("vnm");
  });

  it("a stage list route (no deployment id) is not a V2 stage screen, whatever the keys", async () => {
    const container = await mountApp(`shell,${S3_KEYS.join(",")}`, "/deployments/paper");
    await waitFor(() => expect(container.querySelector(".exec-preview-banner")).not.toBeNull());
    expect(roots(container)).toEqual([]);
  });

  it.each([
    ["/deployments/sandbox/dep_1", "sandbox", "Window: Certification run", "sandbox"],
    ["/deployments/live/dep_1", "live", "Window: Since activation", "live"],
    ["/deployments/live/dep_1/canary", "canary", "Window: Trial window", "live"],
    ["/deployments/paper/dep_1", "workbench", "Window: Published window", "paper"],
    ["/deployments/paper/dep_1/vn-market", "workbench", "Window: Published window", "paper"],
  ])("%s: the context bar says what the V2 read covers and why the environment is fixed", async (path, key, windowText, env) => {
    const container = await mountApp(`shell,${key}`, path);
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    expect(locks(container)).toContain(windowText);
    const chip = container.querySelector<HTMLElement>('[data-control="env"]');
    expect(chip?.dataset.v).toBe(env);
    expect(container.querySelector('[data-control="env"] button')).toBeNull();
    expect(document.getElementById(chip?.getAttribute("aria-describedby") ?? "")?.textContent).toBe("The deployment fixes the environment.");
  });

  it("the locks are pure: stage screens lock only on a deployment route with their own key on; a list route and a missing key keep the old words", async () => {
    const { envLockFor, windowLockFor, PATH_ENV_REASON, DEPLOYMENT_ENV_REASON } = await import("../ExecutionPreviewRoute");
    const only = (...keys: string[]) => (key: string) => keys.includes(key);
    const SCREENS = [
      ["EXECUTION_PAPER_WORKBENCH_SCREEN", "workbench", "paper", "Published window"],
      ["EXECUTION_PAPER_WORKBENCH_VNM_SCREEN", "workbench", "paper", "Published window"],
      ["EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "sandbox", "sandbox", "Certification run"],
      ["EXECUTION_CANARY_CONTROL_ROOM_SCREEN", "canary", "live", "Trial window"],
      ["EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "live", "live", "Since activation"],
    ] as const;
    for (const [screenId, key, env, effective] of SCREENS) {
      expect(envLockFor(screenId, { hasDeploymentId: true }, only(key))).toMatchObject({ reason: DEPLOYMENT_ENV_REASON, effective: env });
      expect(windowLockFor(screenId, { hasDeploymentId: true }, only(key))?.effective).toBe(effective);
      // list route, or the key is off: path reason, no window lock
      expect(envLockFor(screenId, {}, only(key))).toMatchObject({ reason: PATH_ENV_REASON, effective: env });
      expect(envLockFor(screenId, { hasDeploymentId: true }, only())).toMatchObject({ reason: PATH_ENV_REASON, effective: env });
      expect(windowLockFor(screenId, {}, only(key))).toBeUndefined();
      expect(windowLockFor(screenId, { hasDeploymentId: true }, only())).toBeUndefined();
    }
  });

  it("with the stage flag off the same route keeps the path reason and no fixed-window chip", async () => {
    const container = await mountApp("shell", "/deployments/live/dep_1/canary");
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    expect(locks(container).filter((text) => text.startsWith("Window:"))).toEqual([]);
    const chip = container.querySelector<HTMLElement>('[data-control="env"]');
    expect(document.getElementById(chip?.getAttribute("aria-describedby") ?? "")?.textContent).toBe("The path sets the environment.");
  });

  it("New request leaves the light governance surface for Carbon when its flag is on, and only then", async () => {
    let container = await mountApp("request", "/governance/approvals/new");
    await waitFor(() => expect(container.querySelector('[data-screen="new-request-v2"]')).not.toBeNull());
    expect(container.querySelector(".exec-surface")?.getAttribute("data-surface")).toBe("deployments");
    expect(container.querySelector(".exec-surface")?.getAttribute("data-theme")).toBe("operations-carbon");
    cleanup();
    container = await mountApp("shell", "/governance/approvals/new");
    await waitFor(() => expect(container.querySelector('[data-v1="NewRequest"]')).not.toBeNull());
    expect(container.querySelector(".exec-surface")?.getAttribute("data-surface")).toBe("governance");
  });
});
