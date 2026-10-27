/**
 * Shell text hygiene (QA3 R3-10, R1-10): the words a person reads in the palette, the context bar, the breadcrumbs and the rail are plain.
 * No ticket or request numbers (FE-nnn, BR-EX-, A360-, ELP2-REQ-) and no HTTP verb or path ("GET /search"). The scan covers rendered text AND the
 * attributes a person can reach (title, aria-label, placeholder), because a title is user text too. The diagnostic detail of a search may name the
 * list that answered, but never with a ticket number.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferencesProvider } from "../../../app/preferences";
import { PortalPresentationProvider } from "../../../app/presentation";
import { PortalContext } from "../../../app/context";
import { Sidebar } from "../../../app/Sidebar";
import { TopBar } from "../../../app/TopBar";
import type { PortalRegistryDocument } from "../../../portal/contracts";
import type { ExecutionApi } from "../../api/ports";
import { envLockFor, windowLockFor } from "../../ExecutionPreviewRoute";
import { ConnectedContextBar } from "./ContextBar";
import { ExecCommandBar } from "./ExecCommandBar";
import { V2_ROLE_PRESETS } from "./roleNav";

vi.mock("../../../auth/session", () => ({
  useSession: () => ({
    principal: { principalId: "p_1", username: "bobby", role: "ADMIN", sessionId: "s_1" },
    access: { kind: "ready", access: { isOwner: true, capabilities: [] } },
  }),
  isOwnerAccess: () => true,
}));

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
const MANAGER = { capabilities: [...V2_ROLE_PRESETS.manager] };
const FORBIDDEN = /\bFE-\d{2,3}\b|BR-EX-|A360-|ELP2-REQ-|\bGET \/|\bPOST \/|\/api\//;

/** Every string a person can read inside `root`: text nodes (hidden text included) and title, aria-label, placeholder attributes. */
function readable(root: ParentNode): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.trim()) out.push(n.textContent.trim());
  for (const el of (root as Element).querySelectorAll?.("[title],[aria-label],[placeholder]") ?? []) {
    for (const attr of ["title", "aria-label", "placeholder"]) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}
const offenders = (root: ParentNode) => readable(root).filter((text) => FORBIDDEN.test(text));

const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = (reason: string) => ({ ok: false as const, status: "unavailable" as const, reason });
const indexBody = {
  workspaceId: "ws_1", readAtMs: 1, query: { q: "core", kinds: [], limit: 5 },
  groups: [
    { kind: "alpha", totalMatched: 1, rows: [{ kind: "alpha", id: "al_1", label: "Carry A", detail: "LIVE", routeHint: "/deployments/alphas/al_1" }] },
    { kind: "portfolio", totalMatched: 0, rows: [] },
    { kind: "account", totalMatched: null, rows: [] },
  ],
};
const listApi = (over: Record<string, unknown> = {}) =>
  ({
    getAlphaFleet: async () => ok({ page: { rows: [], filteredCount: 0, totalCount: 0 } }),
    getBindings: async () => ok({ page: { rows: [], filteredCount: 0, totalCount: 0 } }),
    listPortfolios: async () => ok({ truncated: false, items: [{ portfolioId: "pf_core", name: "Core" }] }),
    listOperationalQueueV2: async () => ok({ kind: "queue", queue: { page: { filteredCount: 0, rows: [] } } }),
    listApprovals: async () => ok({ page: { rows: [] }, counts: null }),
    getIncidentRootV2: async () => fail("none"),
    ...over,
  }) as unknown as ExecutionApi;
const roster = async () => ({ accounts: [{ userId: "u1", username: "hoa", displayName: "Hoa Nguyen", role: "USER", accountState: "ACTIVE" }], counts: { matching: 1 } });

async function openPalette(api: ExecutionApi, text: string, reader: typeof roster = roster) {
  const view = render(
    <MemoryRouter initialEntries={["/execution"]}>
      <ExecCommandBar registry={registry} options={MANAGER} open onClose={() => undefined} searchApi={api} debounceMs={1} peopleReader={reader} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
  await waitFor(() => expect(document.querySelector(".exec-cmdbar-option, .exec-cmdbar-empty")).not.toBeNull());
  await screen.findByRole("list", { name: "Reads used" }).catch(() => undefined);
  return view;
}

describe("the palette speaks plain words", () => {
  it("before any search", () => {
    render(<MemoryRouter initialEntries={["/execution"]}><ExecCommandBar registry={registry} options={MANAGER} open onClose={() => undefined} searchApi={listApi()} /></MemoryRouter>);
    expect(offenders(document.body)).toEqual([]);
    expect(document.querySelector(".exec-cmdbar-notice")?.textContent).toMatch(/^Search looks in alphas, portfolios/);
  });

  it("with results from the one search, and its details open", async () => {
    await openPalette(listApi({ searchEntities: async () => ok(indexBody) }), "core");
    (document.querySelector(".exec-cmdbar-details") as HTMLDetailsElement | null)?.setAttribute("open", "");
    expect(offenders(document.body)).toEqual([]);
    expect(document.querySelector(".exec-cmdbar-details > summary")?.textContent).toBe("Details");
  });

  it("with results from the per-list fallback, and its details open", async () => {
    await openPalette(listApi({ searchEntities: async () => fail("not served") }), "core");
    expect(offenders(document.body)).toEqual([]);
  });

  it("an empty answer names what was searched, in words", async () => {
    await openPalette(listApi({ listPortfolios: async () => ok({ truncated: false, items: [] }), searchEntities: async () => ok({ ...indexBody, groups: [] }) }), "zzzzz", async () => ({ accounts: [], counts: { matching: 0 } }));
    await waitFor(() => expect(document.querySelector(".exec-cmdbar-empty")?.textContent ?? "").toMatch(/Nothing matched/));
    expect(document.querySelector(".exec-cmdbar-empty")?.textContent).toContain("zzzzz");
    expect(offenders(document.body)).toEqual([]);
  });
});

describe("no palette result links to a missing id", () => {
  it("a result list built from rows with missing ids carries no 'undefined' in any option, label or link", async () => {
    const bad = { kind: "approval", id: "undefined", label: "Carry v1.9", detail: null, routeHint: "/approvals?sel=undefined" };
    await openPalette(listApi({ searchEntities: async () => ok({ ...indexBody, groups: [{ kind: "approval", totalMatched: 1, rows: [bad] }] }), listApprovals: async () => ok({ page: { rows: [{ id: undefined, gate: "R1", subject: "Carry ghost" }] }, counts: null }) }), "carry");
    await waitFor(() => expect(document.querySelector(".exec-cmdbar-notice")).not.toBeNull());
    expect(document.body.textContent).not.toMatch(/undefined/);
  });
});

describe("the context bar of every V2 route speaks plain words", () => {
  const SCREENS = [
    "EXECUTION_COMMAND_CENTER_SCREEN", "EXECUTION_ALPHA_FLEET_LIST_SCREEN", "EXECUTION_ALPHA_360_SCREEN", "EXECUTION_PORTFOLIO_360_SCREEN", "EXECUTION_COMPARE_SCREEN",
    "EXECUTION_ACCOUNT_BROKER_360_SCREEN", "EXECUTION_FULL_BLOTTER_SCREEN", "EXECUTION_OPERATIONS_QUEUE_SCREEN", "EXECUTION_INCIDENT_DETAIL_SCREEN",
    "EXECUTION_APPROVAL_INBOX_SCREEN", "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN", "EXECUTION_PAPER_WORKBENCH_SCREEN", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
    "EXECUTION_CANARY_CONTROL_ROOM_SCREEN", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
  ];
  it.each(SCREENS)("%s", (screenId) => {
    const context = { hasAlphaId: true, hasDeploymentId: true };
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <ConnectedContextBar envLock={envLockFor(screenId, context, () => true) ?? null} windowLock={windowLockFor(screenId, context, () => true)} />
      </MemoryRouter>,
    );
    expect(offenders(document.body)).toEqual([]);
  });
});

describe("breadcrumbs and the rail speak plain words", () => {
  it("every feature's trail on a V2 bar, with the user chip and the search field", () => {
    for (const feature of registry.features) {
      const group = registry.feature_groups.find((g) => g.id === feature.group);
      render(
        <MemoryRouter initialEntries={["/execution"]}>
          <PortalContext.Provider value={{ registry, environment: null }}>
            <PreferencesProvider>
              <PortalPresentationProvider registry={null}>
                <TopBar breadcrumbs={[{ label: group?.label ?? "", route: null }, { label: feature.label, route: feature.canonical_route }]} environment={null} onOpenPalette={() => undefined} onToggleMobileNav={() => undefined} v2={{ userHref: null }} />
              </PortalPresentationProvider>
            </PreferencesProvider>
          </PortalContext.Provider>
        </MemoryRouter>,
      );
      expect(offenders(document.body), feature.id).toEqual([]);
      cleanup();
    }
  });

  it("the rail with its badges", () => {
    render(
      <MemoryRouter initialEntries={["/execution"]}>
        <Sidebar registry={registry} options={MANAGER} collapsed={false} v2Shell badges={{ EXECUTION_OPERATIONS: { count: 3, tone: "bad", label: "3 open exceptions" }, EXECUTION_APPROVALS: { count: 4, tone: "warn", label: "4 pending approvals" } }} />
      </MemoryRouter>,
    );
    expect(offenders(document.body)).toEqual([]);
  });
});
