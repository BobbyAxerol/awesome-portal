/**
 * RV-07 · UXM-10 F-8 · the route's port is keyed on the VALUE of the policy and the session, for every screen.
 *
 * A presentation-only change (tab, selection, a rewritten `?tab=` slug) must not make a new port, so no screen reads again.
 * A change of the policy value or of the session makes a new port: every screen sees a new `api` and reads again, the old
 * port is aborted and its late answer is rejected, and the session-wide runtime catalogue is forgotten. A workspace or query
 * change is a prop of the screen, not part of the port (each screen's read effect cancels and fences it; the Stage eligibility
 * provider's own test, "a workspace switch asks again, and the old workspace's late answer is dropped", pins that half).
 * Lane: FIXTURE_LAB. No network: `fetch` is a stub.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "../auth/authApi";
import { createHttpApi } from "./api/httpApi";
import type { ExecutionApi } from "./api/ports";
import type { DeliveryPolicy } from "./profile";
import { screenDeliveryPolicy } from "./profile";
import { forgetExecutionRuntime, loadExecutionRuntime } from "./useExecutionRuntime";
import { apiScopeKey, useValueStableApi } from "./useValueStableApi";

const principal = (sessionId: string, role = "owner"): AuthPrincipal => ({ principalId: "usr_TEST_ONLY", sessionId, role }) as unknown as AuthPrincipal;
let session: AuthPrincipal | null = principal("s1");

vi.mock("../auth/session", async (original) => ({ ...(await original<typeof import("../auth/session")>()), useSession: () => ({ principal: session, access: { kind: "loading" } }) }));
vi.mock("../app/presentation", async (original) => ({ ...(await original<typeof import("../app/presentation")>()), usePresentation: () => ({ setEntityLabel: () => undefined }) }));

/** What the inbox container gets from the route: the port and the workspace. A probe, so the route is judged alone. */
const seen: { api: ExecutionApi; workspaceId: string | undefined }[] = [];
vi.mock("./screens/containers", async (original) => ({
  ...(await original<typeof import("./screens/containers")>()),
  ApprovalInboxContainer: ({ api, workspaceId }: { api: ExecutionApi; workspaceId?: string }) => {
    seen.push({ api, workspaceId });
    return <p data-testid="probe">{workspaceId ?? "own"}</p>;
  },
}));

const raw = { delivery_policy: { policy_revision: 4, query_enabled: true, governance_write_enabled: false } };
const policyNow = (revision = 4): DeliveryPolicy | null => screenDeliveryPolicy({ delivery_policy: { ...raw.delivery_policy, policy_revision: revision } });

let fetchCalls: { url: string; signal: AbortSignal | undefined }[] = [];
beforeEach(() => {
  session = principal("s1");
  seen.length = 0;
  fetchCalls = [];
  forgetExecutionRuntime();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), signal: init?.signal ?? undefined });
    // Never answers: a read is "in flight" until the test says otherwise.
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  forgetExecutionRuntime();
});

describe("useValueStableApi", () => {
  it("a policy object with the same value, rebuilt each render, keeps the port; the factory ran once", () => {
    const make = vi.fn(createHttpApi);
    const view = renderHook(({ policy, scope }) => useValueStableApi(policy, scope, { make }), { initialProps: { policy: policyNow(), scope: "s1" } });
    const first = view.result.current;
    for (let i = 0; i < 5; i += 1) {
      const rebuilt = policyNow();
      view.rerender({ policy: rebuilt, scope: "s1" });
      expect(view.result.current).toBe(first);
    }
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("the key is the value: policy and session, in order", () => {
    expect(apiScopeKey("a", policyNow())).toBe(apiScopeKey("a", policyNow()));
    expect(apiScopeKey("a", policyNow(4))).not.toBe(apiScopeKey("a", policyNow(5)));
    expect(apiScopeKey("a", policyNow())).not.toBe(apiScopeKey("b", policyNow()));
    expect(apiScopeKey("a", null)).not.toBe(apiScopeKey("a", policyNow()));
  });

  it("a change of the policy value makes a new port and aborts the old one; a change of the session does the same", () => {
    const signals: AbortSignal[] = [];
    const make = vi.fn((options: Parameters<typeof createHttpApi>[0]) => {
      signals.push(options.signal!);
      return createHttpApi(options);
    });
    const view = renderHook(({ policy, scope }) => useValueStableApi(policy, scope, { make }), { initialProps: { policy: policyNow(4), scope: "s1" } });
    const first = view.result.current;
    view.rerender({ policy: policyNow(5), scope: "s1" });
    const second = view.result.current;
    expect(second).not.toBe(first);
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
    view.rerender({ policy: policyNow(5), scope: "s2" });
    expect(view.result.current).not.toBe(second);
    expect(signals.map((s) => s.aborted)).toEqual([true, true, false]);
  });

  it("StrictMode's second effect run does not abort the live port", () => {
    const signals: AbortSignal[] = [];
    const make = (options: Parameters<typeof createHttpApi>[0]) => {
      signals.push(options.signal!);
      return createHttpApi(options);
    };
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const view = renderHook(() => useValueStableApi(policyNow(), "s1", { make }), { wrapper });
    view.rerender();
    expect(view.result.current).toBeTruthy();
    // StrictMode may build a discarded port; the one in use is not aborted.
    expect(signals[signals.length - 1]!.aborted).toBe(false);
  });

  it("the old port's in-flight read is aborted when the scope changes, and the new port reads for itself (never the old answer)", async () => {
    const view = renderHook(({ scope }) => useValueStableApi(policyNow(), scope), { initialProps: { scope: "s1" } });
    const oldApi = view.result.current;
    const late = oldApi.getRuntimeManifest();
    await act(async () => {});
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.signal?.aborted).toBe(false);
    view.rerender({ scope: "s2" });
    await act(async () => {});
    expect(fetchCalls[0]!.signal?.aborted).toBe(true);
    // The old read ends with a typed absence, not a value for the new scope and not a throw.
    const answer = await late;
    expect(answer.ok).toBe(false);
    void view.result.current.getRuntimeManifest();
    await act(async () => {});
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[1]!.signal?.aborted).toBe(false);
  });

  it("the session-wide runtime catalogue is forgotten when the scope changes, so the next page load asks again", async () => {
    const view = renderHook(({ scope }) => useValueStableApi(policyNow(), scope), { initialProps: { scope: "s1" } });
    const stub = { getRuntimeManifest: vi.fn(async () => ({ ok: false, status: "unavailable", reason: "x" })), getScreenContracts: vi.fn(async () => ({ ok: false, status: "unavailable", reason: "x" })) } as unknown as ExecutionApi;
    await loadExecutionRuntime(stub);
    await loadExecutionRuntime(stub);
    expect(stub.getRuntimeManifest).toHaveBeenCalledTimes(1);
    view.rerender({ scope: "s2" });
    await loadExecutionRuntime(stub);
    expect(stub.getRuntimeManifest).toHaveBeenCalledTimes(2);
  });
});

/* ── the real route ─────────────────────────────────────────────────────────────────────────────────────────── */

describe("ExecutionPreviewRoute hands every screen a port that survives a presentation-only change", () => {
  async function mountRoute(initial: string) {
    const { ExecutionPreviewRoute } = await import("./ExecutionPreviewRoute");
    let go: (to: string) => void = () => undefined;
    function Nav() {
      const navigate = useNavigate();
      go = (to) => navigate(to);
      return null;
    }
    // `policy` is rebuilt on every render, as the real routes do through `screenDeliveryPolicy`.
    function Screen() {
      return <ExecutionPreviewRoute screenId="EXECUTION_APPROVAL_INBOX_SCREEN" policy={policyNow()} />;
    }
    const view = render(
      <MemoryRouter initialEntries={[initial]}>
        <Nav />
        <Routes>
          <Route path="/governance/approvals" element={<Screen />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    return { go: (to: string) => act(async () => go(to)), view };
  }

  it("a tab / selection / slug change re-renders the screen with the SAME port and issues no new request", async () => {
    const { go } = await mountRoute("/governance/approvals?tab=one");
    const first = seen[seen.length - 1]!.api;
    const requests = fetchCalls.length;
    for (const to of ["/governance/approvals?tab=two", "/governance/approvals?tab=two&sel=AP-1", "/governance/approvals?tab=promotion-plans"]) {
      await go(to);
      expect(seen[seen.length - 1]!.api, to).toBe(first);
    }
    expect(fetchCalls.length, "no read was issued by a presentation-only change").toBe(requests);
    expect(new Set(seen.map((s) => s.api)).size).toBe(1);
  });

  it("a workspace change keeps the port (the screen's own effect re-reads, cancels and fences by the new workspace) and passes the new workspace", async () => {
    const { go } = await mountRoute("/governance/approvals");
    const first = seen[seen.length - 1]!.api;
    expect(screen.getByTestId("probe").textContent).toBe("own");
    await go("/governance/approvals?workspace_id=ws_A");
    expect(screen.getByTestId("probe").textContent).toBe("ws_A");
    await go("/governance/approvals?workspace_id=ws_B");
    expect(screen.getByTestId("probe").textContent).toBe("ws_B");
    expect(seen.map((s) => s.workspaceId).filter((w, i, all) => i === 0 || w !== all[i - 1])).toEqual([undefined, "ws_A", "ws_B"]);
    expect(new Set(seen.map((s) => s.api)).size).toBe(1);
    expect(seen[seen.length - 1]!.api).toBe(first);
  });

  it("a session change is a new scope: a new port, and the old port's reads are aborted", async () => {
    const { go } = await mountRoute("/governance/approvals");
    const first = seen[seen.length - 1]!.api;
    void first.getRuntimeManifest();
    await act(async () => {});
    const pending = fetchCalls.filter((c) => c.url.includes("runtime-manifest"));
    expect(pending.length).toBeGreaterThan(0);
    session = principal("s2", "viewer");
    await go("/governance/approvals?tab=x");
    expect(seen[seen.length - 1]!.api).not.toBe(first);
    expect(pending.every((c) => c.signal?.aborted)).toBe(true);
  });

  it("a policy revision change is a new scope too", async () => {
    const { ExecutionPreviewRoute } = await import("./ExecutionPreviewRoute");
    const view = render(
      <MemoryRouter initialEntries={["/governance/approvals"]}>
        <ExecutionPreviewRoute screenId="EXECUTION_APPROVAL_INBOX_SCREEN" policy={policyNow(4)} />
      </MemoryRouter>,
    );
    await act(async () => {});
    const first = seen[seen.length - 1]!.api;
    view.rerender(
      <MemoryRouter initialEntries={["/governance/approvals"]}>
        <ExecutionPreviewRoute screenId="EXECUTION_APPROVAL_INBOX_SCREEN" policy={policyNow(5)} />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(seen[seen.length - 1]!.api).not.toBe(first);
  });
});
