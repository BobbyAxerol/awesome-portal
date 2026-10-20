/**
 * W3 · the shell merges the actor's own navigation projection into the rail (FE-057/058).
 *
 * Lane: FIXTURE_LAB (the self-navigation bodies are the canonical fixture, `execution-access.synthetic.valid.json`, with only
 * the scope and the clock rewritten) through a BFF_DOUBLE (an in-test `fetch`); jsdom, no browser. The flag-off proof lives in
 * `PortalShell.flagOff.test` (digests) and is unchanged; the second describe here repeats the thing it cannot see: with the
 * manifest set but `shell` absent, no request is made.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";
import { loadCanonical } from "../execution/v2/testkit/loadCanonical";

const session = vi.hoisted(() => ({ capabilities: [] as string[], principal: true }));
vi.mock("../auth/session", () => ({
  useSession: () => ({
    principal: session.principal ? { principalId: "p_1", username: "ordinary", role: "VIEWER", sessionId: "sess_1" } : null,
    access: { kind: "ready", access: { isOwner: false, capabilities: session.capabilities } },
  }),
  isOwnerAccess: () => false,
}));

type Draft = any;
const FIXTURE = loadCanonical<{ cases: { type: string; case_name: string; value: Draft }[]; self_context_cases: { case_name: string; value: Draft }[] }>("execution-access.synthetic");
const contextBody = (name: string): Draft => ({ ...FIXTURE.self_context_cases.find((entry) => entry.case_name === name)!.value, observed_at_ms: Date.now(), valid_until_ms: Date.now() + 60_000 });
const bodyOf = (name: string): Draft => FIXTURE.cases.find((entry) => entry.type === "AccessSelfNavigation" && entry.case_name === name)!.value;

const FIXTURES = join(process.cwd(), "../registry/fixtures");
const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(FIXTURES, "registry.public.json"), "utf8"));
const summary = JSON.parse(readFileSync(join(FIXTURES, "summary.healthy.json"), "utf8"));
const links = JSON.parse(readFileSync(join(FIXTURES, "links.public.json"), "utf8"));
const originalFetch = globalThis.fetch;

const NAV_PATH = "/api/admin/profile-access/v2/self-navigation";
const CONTEXT_PATH = "/api/admin/profile-access/v2/self-context";
type Answer = Response | Promise<Response>;
interface Harness {
  /** Every self-navigation request URL, in order. */
  asked: string[];
  /** Decides each answer; default: the APP_ONLY body for the asked scope with a ceiling a minute away. */
  answer: (url: URL, index: number) => Answer;
  /** Every self-context request, in order (the read takes no query). */
  contextAsked: string[];
  /** Decides each self-context answer; default: the typed absence `NONE` (a member with no workspace). */
  contextAnswer: (index: number) => Answer;
}

const navBody = (url: URL, ceilingMs = 60_000, name = "APP_ONLY_NOT_SOURCE_AUTHORITY") => ({
  ...bodyOf(name),
  workspace_id: url.searchParams.get("workspace_id"),
  environment: url.searchParams.get("environment"),
  observed_at_ms: Date.now(),
  valid_until_ms: Date.now() + ceilingMs,
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function Jump({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return <button type="button" data-testid={`jump-${label}`} onClick={() => navigate(to)}>{label}</button>;
}

async function mount(route: string, env: { manifest?: string }, harness: Partial<Harness> = {}, capabilities: string[] = []) {
  session.capabilities = capabilities;
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", env.manifest ?? "");
  vi.resetModules();
  const { PortalShell } = await import("./PortalShell");
  const { PreferencesProvider } = await import("./preferences");
  const { __resetPortalClientCaches } = await import("../portal/client");
  __resetPortalClientCaches();
  const state: Harness = { asked: [], answer: (url) => ok(navBody(url)), contextAsked: [], contextAnswer: () => ok(contextBody("ABSENT_NO_MEMBERSHIP")), ...harness };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === NAV_PATH) {
      state.asked.push(`${url.search}`);
      return state.answer(url, state.asked.length - 1);
    }
    if (url.pathname === CONTEXT_PATH) {
      state.contextAsked.push(`${url.search}`);
      return state.contextAnswer(state.contextAsked.length - 1);
    }
    if (url.pathname.includes("/portal/registry")) {
      return new Response(JSON.stringify(registry), { status: 200, headers: { ETag: `"${registry.content_digest}"` } });
    }
    if (url.pathname.includes("/portal/summary")) return new Response(JSON.stringify(summary), { status: 200 });
    if (url.pathname.includes("/portal/links")) return new Response(JSON.stringify(links), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <PreferencesProvider>
          <PortalShell />
          <Jump to="/execution?workspace_id=ws_other&env=paper" label="other-workspace" />
          <Jump to="/execution?workspace_id=ws_TEST_ONLY&env=live" label="live" />
          <Jump to="/research/quantbt" label="research" />
          <Where />
        </PreferencesProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("navigation", { name: "Primary navigation" });
  return { ...view, state };
}

const rail = () => screen.getByRole("navigation", { name: "Primary navigation" });
const railLabels = () => [...rail().querySelectorAll("a.portal-navitem .portal-navitem-label")].map((node) => node.textContent);
const SCOPED = "/execution?workspace_id=ws_TEST_ONLY&env=paper";
const ON = { manifest: "shell" };

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("shell flag on: the rail lists what the server listed, and only that", () => {
  it("an ordinary session (no execution tokens) gets Portfolios and Accounts from the projection, not Operations", async () => {
    const { state } = await mount(SCOPED, ON);
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(railLabels()).toContain("Accounts");
    expect(railLabels()).not.toContain("Operations"); // HIDDEN in the body
    expect(state.asked).toEqual(["?workspace_id=ws_TEST_ONLY&environment=paper"]);
    expect(within(rail()).queryByText(/Navigation unavailable/)).toBeNull();
  });

  it("a HIDDEN-everything projection lists nothing extra", async () => {
    const { state } = await mount(SCOPED, ON, { answer: (url) => ok(navBody(url, 60_000, "ABSENT_PERMISSION")) });
    await waitFor(() => expect(state.asked).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(railLabels()).not.toContain("Portfolios");
    expect(railLabels()).not.toContain("Accounts");
    expect(within(rail()).queryByText(/Navigation unavailable/)).toBeNull();
  });

  it("the session's own capabilities are never removed by the projection", async () => {
    // governance.r1.read keeps Approvals in the rail whatever the projection says (it has no say about Approvals).
    await mount(SCOPED, ON, { answer: (url) => ok(navBody(url, 60_000, "ABSENT_PERMISSION")) }, ["governance.r1.read"]);
    await waitFor(() => expect(railLabels()).toContain("Approvals"));
  });

  it("no workspace in the address: the navigation is not asked until the self-context names one; the rail is today's meanwhile", async () => {
    const { state } = await mount("/execution", ON, { contextAnswer: () => new Promise<Response>(() => {}) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(state.contextAsked).toEqual([""]); // the read takes no query at all
    expect(state.asked).toEqual([]);
    expect(railLabels()).not.toContain("Portfolios");
    expect(within(rail()).queryByText(/Navigation unavailable/)).toBeNull();
  });

  it("no signed-in session: nothing is asked", async () => {
    session.principal = false;
    try {
      const { state } = await mount(SCOPED, ON);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(state.asked).toEqual([]);
      expect(state.contextAsked).toEqual([]);
    } finally {
      session.principal = true;
    }
  });

  it("the selected ContextBar environment is the one asked (never a union)", async () => {
    const { state } = await mount("/execution?workspace_id=ws_TEST_ONLY&env=sandbox", ON);
    await waitFor(() => expect(state.asked).toHaveLength(1));
    expect(state.asked[0]).toBe("?workspace_id=ws_TEST_ONLY&environment=sandbox");
  });

  it("an address without env asks for the ContextBar default, live", async () => {
    const { state } = await mount("/execution?workspace_id=ws_TEST_ONLY", ON);
    await waitFor(() => expect(state.asked).toHaveLength(1));
    expect(state.asked[0]).toBe("?workspace_id=ws_TEST_ONLY&environment=live");
  });
});

describe("shell flag on: scope changes", () => {
  it("a new environment clears the old rail at once and the old answer, arriving late, is dropped", async () => {
    let releaseFirst: (response: Response) => void = () => {};
    const { state } = await mount(SCOPED, ON, {
      answer: (url, index) => (index === 0 ? new Promise<Response>((resolve) => { releaseFirst = resolve; }) : ok(navBody(url, 60_000, "ABSENT_PERMISSION"))),
    });
    await waitFor(() => expect(state.asked).toHaveLength(1));
    fireEvent.click(screen.getByTestId("jump-live"));
    await waitFor(() => expect(state.asked).toHaveLength(2));
    // The paper answer (APP_ONLY, would list Portfolios) arrives after the switch to live.
    releaseFirst(ok(navBody(new URL(`http://x${NAV_PATH}?workspace_id=ws_TEST_ONLY&environment=paper`))));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(railLabels()).not.toContain("Portfolios");
  });

  it("switching workspace drops the previous rail in the same commit (no Portfolios under ws_other until ws_other says so)", async () => {
    let releaseSecond: (response: Response) => void = () => {};
    const { state } = await mount(SCOPED, ON, {
      answer: (url, index) => (index === 0 ? ok(navBody(url)) : new Promise<Response>((resolve) => { releaseSecond = resolve; })),
    });
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    fireEvent.click(screen.getByTestId("jump-other-workspace"));
    expect(railLabels()).not.toContain("Portfolios"); // synchronous: the very next DOM
    await waitFor(() => expect(state.asked).toHaveLength(2));
    releaseSecond(ok(navBody(new URL(`http://x${NAV_PATH}?workspace_id=ws_other&environment=paper`))));
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
  });

  it("leaving for a route with no workspace clears the rail", async () => {
    await mount(SCOPED, ON);
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    fireEvent.click(screen.getByTestId("jump-research"));
    expect(railLabels()).not.toContain("Portfolios");
  });
});

describe("shell flag on: a failed or expired read says so, visibly, with a Retry", () => {
  it("a 500 prints 'Navigation unavailable: <reason>' inside the rail's landmark, lists nothing, and Retry asks again", async () => {
    const { state } = await mount(SCOPED, ON, {
      answer: (url, index) => (index === 0 ? new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR" }, request_id: "req_5" }), { status: 500 }) : ok(navBody(url))),
    });
    const line = await within(rail()).findByText(/Navigation unavailable:/);
    expect(line.closest("[role=status]")?.textContent).toBe("Navigation unavailable: The Portal answered 500. Code INTERNAL_ERROR. Request req_5.");
    expect(railLabels()).not.toContain("Portfolios");

    const retry = within(rail()).getByRole("button", { name: "Retry" });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(state.asked).toHaveLength(2);
    expect(within(rail()).queryByText(/Navigation unavailable/)).toBeNull();
  });

  it("the line is the first thing in the landmark and the Retry control is in the tab order before the first entry", async () => {
    await mount(SCOPED, ON, { answer: () => new Response("{}", { status: 503 }) });
    const retry = await within(rail()).findByRole("button", { name: "Retry" });
    expect(retry.getAttribute("tabindex")).toBeNull();
    expect(rail().firstElementChild?.getAttribute("data-selfnav")).toBe("unavailable");
    // Nothing moved focus onto it.
    expect(document.activeElement).not.toBe(retry);
  });

  it("a read that never settles shows no notice (loading is not a failure)", async () => {
    await mount(SCOPED, ON, { answer: () => new Promise<Response>(() => {}) });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(within(rail()).queryByText(/Navigation unavailable/)).toBeNull();
  });

  it("the ceiling passes: the rail shuts with the Portal-clock sentence, ONE re-read is made, and no more", async () => {
    const { state } = await mount(SCOPED, ON, {
      answer: (url, index) => (index === 0 ? ok(navBody(url, 250)) : ok({ ...navBody(url, 0), valid_until_ms: Date.now() + 1, observed_at_ms: Date.now() })),
    });
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    await waitFor(() => expect(railLabels()).not.toContain("Portfolios"), { timeout: 2000 });
    await within(rail()).findByText(/no longer shown/);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(state.asked).toHaveLength(2);
    expect(within(rail()).getByRole("status").textContent).toMatch(/^Navigation unavailable: The navigation read for your session ended at .* \(Portal clock\) and is no longer shown\. Retry to check again\.$/);
  });
});

describe("shell with the manifest set but the shell key absent", () => {
  it("asks nothing, draws nothing", async () => {
    const { state } = await mount(SCOPED, { manifest: "fleet" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(state.asked).toEqual([]);
    expect(rail().querySelector("[data-selfnav]")).toBeNull();
  });

  it("nor does a build with no manifest at all", async () => {
    const { state } = await mount(SCOPED, { manifest: "" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(state.asked).toEqual([]);
  });
});

describe("shell flag on: the address names no workspace (BE-P7 self-context)", () => {
  const ctx = (name: string) => ({ contextAnswer: () => ok(contextBody(name)) });

  it("RESOLVED: the navigation is asked for THAT workspace (and the selected environment), then the rail lists it", async () => {
    const { state } = await mount("/execution?env=sandbox", ON, ctx("RESOLVED_SOLE_MEMBERSHIP"));
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(state.contextAsked).toEqual([""]);
    expect(state.asked).toEqual(["?workspace_id=ws_TEST_ONLY_personal&environment=sandbox"]);
    // The address is not rewritten for the member: only a CHOICE goes into it.
    expect(screen.getByTestId("where").textContent).toBe("/execution?env=sandbox");
  });

  it("AMBIGUOUS: the candidates are offered in the order published, nothing is read until the member chooses, and the choice goes in the address", async () => {
    const { state } = await mount("/execution?env=paper", ON, ctx("AMBIGUOUS_SEVERAL_WITH_GRANT_RECORDS"));
    const group = await within(rail()).findByRole("group", { name: "Workspaces" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["ws_TEST_ONLY_a", "ws_TEST_ONLY_b"]);
    expect(rail().firstElementChild?.getAttribute("data-selfnav")).toBe("choose");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(state.asked).toEqual([]); // nothing guessed
    expect(railLabels()).not.toContain("Portfolios");

    fireEvent.click(within(group).getByRole("button", { name: "ws_TEST_ONLY_b" }));
    expect(screen.getByTestId("where").textContent).toBe("/execution?env=paper&workspace_id=ws_TEST_ONLY_b");
    await waitFor(() => expect(state.asked).toEqual(["?workspace_id=ws_TEST_ONLY_b&environment=paper"]));
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(within(rail()).queryByRole("group", { name: "Workspaces" })).toBeNull();
    expect(state.contextAsked).toHaveLength(1); // the address has a workspace now
  });

  it("NONE: 'No workspace membership.' in the rail's own notice, nothing else asked", async () => {
    const { state } = await mount("/execution", ON, ctx("ABSENT_NO_MEMBERSHIP"));
    const line = await within(rail()).findByText(/Navigation unavailable:/);
    expect(line.closest("[role=status]")?.textContent).toBe("Navigation unavailable: No workspace membership.");
    expect(state.asked).toEqual([]);
  });

  it("UNAVAILABLE (too many memberships) is its own sentence, never a first-N list", async () => {
    await mount("/execution", ON, ctx("UNAVAILABLE_TOO_MANY_MEMBERSHIPS"));
    const line = await within(rail()).findByText(/Navigation unavailable:/);
    expect(line.closest("[role=status]")?.textContent).toBe("Navigation unavailable: Too many workspace memberships to choose from.");
    expect(within(rail()).queryByRole("group", { name: "Workspaces" })).toBeNull();
  });

  it("a failed context read prints its reason with a Retry; Retry asks the context again and a RESOLVED answer then scopes the rail", async () => {
    const { state } = await mount("/execution", ON, {
      contextAnswer: (index) => (index === 0 ? new Response("{}", { status: 503 }) : ok(contextBody("RESOLVED_SOLE_MEMBERSHIP"))),
    });
    const line = await within(rail()).findByText(/Navigation unavailable:/);
    expect(line.closest("[role=status]")?.textContent).toBe("Navigation unavailable: The Portal answered 503.");
    expect(state.asked).toEqual([]);
    fireEvent.click(within(rail()).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(state.contextAsked).toHaveLength(2);
  });

  it("the shell flag off asks neither read", async () => {
    const { state } = await mount("/execution", { manifest: "fleet" }, ctx("RESOLVED_SOLE_MEMBERSHIP"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(state.contextAsked).toEqual([]);
    expect(state.asked).toEqual([]);
  });
});

describe("shell flag on: the self-only 'My access' entry (BE-P7 self_entry)", () => {
  const PROFILE_ON = { manifest: "shell,profile" };
  const myAccess = () => [...rail().querySelectorAll<HTMLAnchorElement>("a.portal-navitem")].filter((a) => a.querySelector(".portal-navitem-label")?.textContent === "My access");

  it("an ordinary member with a live projection and the profile page mounted gets the entry, carrying the workspace and the context", async () => {
    await mount(SCOPED, PROFILE_ON);
    await waitFor(() => expect(myAccess()).toHaveLength(1));
    expect(myAccess()[0]!.getAttribute("href")).toBe("/administration/my-access?workspace_id=ws_TEST_ONLY&env=paper");
    expect(railLabels()).not.toContain("Profile & Access"); // no admin entry for this member
  });

  it("and it opens the self-only page: the path changes and the matrix is not mounted", async () => {
    await mount(SCOPED, PROFILE_ON);
    await waitFor(() => expect(myAccess()).toHaveLength(1));
    fireEvent.click(myAccess()[0]!);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/administration/my-access?workspace_id=ws_TEST_ONLY&env=paper"));
    await waitFor(() => expect(screen.getByRole("link", { name: /My access/ })).toBeTruthy());
  });

  it("the context-resolved workspace is the one the entry opens for", async () => {
    await mount("/execution?env=sandbox", PROFILE_ON, { contextAnswer: () => ok(contextBody("RESOLVED_SOLE_MEMBERSHIP")) });
    await waitFor(() => expect(myAccess()).toHaveLength(1));
    expect(myAccess()[0]!.getAttribute("href")).toBe("/administration/my-access?workspace_id=ws_TEST_ONLY_personal&env=sandbox");
  });

  it("without the profile flag there is no entry (the page it opens is not mounted)", async () => {
    await mount(SCOPED, ON);
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(myAccess()).toHaveLength(0);
  });

  it.each([
    ["a read still loading", { answer: () => new Promise<Response>(() => {}) }],
    ["a failed read", { answer: () => new Response("{}", { status: 500 }) }],
    ["a denied read", { answer: () => new Response("{}", { status: 403 }) }],
  ])("%s offers no entry (fail closed)", async (_name, harness) => {
    await mount(SCOPED, PROFILE_ON, harness);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(myAccess()).toHaveLength(0);
  });

  it("no entry while the member still has to choose a workspace, and none for a member with no workspace", async () => {
    await mount("/execution", PROFILE_ON, { contextAnswer: () => ok(contextBody("AMBIGUOUS_MEMBER_ONLY")) });
    await within(rail()).findByRole("group", { name: "Workspaces" });
    expect(myAccess()).toHaveLength(0);
    cleanup();
    await mount("/execution", PROFILE_ON, { contextAnswer: () => ok(contextBody("ABSENT_NO_MEMBERSHIP")) });
    await within(rail()).findByText(/No workspace membership/);
    expect(myAccess()).toHaveLength(0);
  });

  it("the entry goes with the rail when the session ceiling passes", async () => {
    await mount(SCOPED, PROFILE_ON, { answer: (url, index) => (index === 0 ? ok(navBody(url, 250)) : new Response("{}", { status: 500 })) });
    await waitFor(() => expect(myAccess()).toHaveLength(1));
    await waitFor(() => expect(myAccess()).toHaveLength(0), { timeout: 2000 });
  });

  it("an owner who holds the admin capability keeps Profile & Access and gets no second entry", async () => {
    await mount(SCOPED, PROFILE_ON, {}, ["administration.profile_access.manage"]);
    await waitFor(() => expect(railLabels()).toContain("Profile & Access"));
    await waitFor(() => expect(railLabels()).toContain("Portfolios"));
    expect(myAccess()).toHaveLength(0);
  });
});
