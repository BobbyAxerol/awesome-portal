/**
 * Entity search of the command bar (WP-D): every kind goes through the read that owns it, results are the server's rows, capped, and
 * every group names its read. No read, no invented row.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../../../portal/contracts";
import type { ExecutionApi } from "../../api/ports";
import { ENTITY_SEARCH_HINT, ENTITY_SEARCH_INDEX_NOTICE, ENTITY_SEARCH_NOTICE, ExecCommandBar, compactNotes } from "./ExecCommandBar";
import { MIN_QUERY, PER_KIND, hrefFor, isRealId, searchEntities, searchSourcesFor, type SearchSources } from "./entitySearch";
import { V2_ROLE_PRESETS } from "./roleNav";

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
const MANAGER = { capabilities: [...V2_ROLE_PRESETS.manager] };
const ALL: SearchSources = { alpha: true, portfolio: true, account: true, operation: true, approval: true };
const signal = () => new AbortController().signal;

const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = (reason: string) => ({ ok: false as const, status: "unavailable" as const, reason });

interface Calls {
  alphas: unknown[];
  bindings: unknown[];
  portfolios: number;
  portfolioQueries: unknown[];
  operations: unknown[];
  incidents: unknown[];
  approvals: unknown[];
}

/** A port that answers the six reads the search uses, and records what it was asked. */
function fakeApi(over: Partial<Record<keyof ExecutionApi, unknown>> = {}): { api: ExecutionApi; calls: Calls } {
  const calls: Calls = { alphas: [], bindings: [], portfolios: 0, portfolioQueries: [], operations: [], incidents: [], approvals: [] };
  const api = {
    getAlphaFleet: async (query: unknown) => {
      calls.alphas.push(query);
      return ok({ page: { rows: [{ alphaId: "al_btc", alphaLabel: "BTC-Trend", version: "v3", stage: "LIVE" }, { alphaId: "al_eth", alphaLabel: "", version: "v1", stage: "PAPER" }], filteredCount: 14, totalCount: 40 } });
    },
    getBindings: async (query: unknown) => {
      calls.bindings.push(query);
      return ok({ page: { rows: [{ bindingId: "b1", accountId: "acct_main", venue: "BINANCE" }, { bindingId: "b2", accountId: "acct_main", venue: "BINANCE" }], filteredCount: 2, totalCount: 9 } });
    },
    listPortfolios: async (query?: unknown) => {
      calls.portfolios += 1;
      calls.portfolioQueries.push(query);
      return ok({ truncated: true, items: [{ portfolioId: "pf_core", name: "Core Book" }, { portfolioId: "pf_alt", name: "Alt Sleeve" }, { portfolioId: "pf_core2", name: "Other" }] });
    },
    listOperationalQueueV2: async (query: unknown) => {
      calls.operations.push(query);
      return ok({ kind: "queue", queue: { page: { filteredCount: 1, rows: [{ operationId: "op_9", commandKey: "RECALL", targetType: "PORTFOLIO", targetId: "pf_core" }] } } });
    },
    getIncidentRootV2: async (id: string, workspace?: string) => {
      calls.incidents.push([id, workspace]);
      return ok({ kind: "incident", incident: { incidentId: id, workflowState: "OPEN" } });
    },
    listApprovals: async (query: unknown) => {
      calls.approvals.push(query);
      return ok({ page: { rows: [{ id: "AP-201", gate: "R1", subject: "Carry v3.2 to PF-MAIN" }, { id: "AP-352", gate: "R2", subject: "Core budget" }] }, counts: { pending: 2, overdue: null, dueSoon: null } });
    },
    ...over,
  } as unknown as ExecutionApi;
  return { api, calls };
}

describe("searchSourcesFor: only the kinds the caller's rail lists", () => {
  it("a manager searches all five kinds", () => {
    expect(searchSourcesFor(registry, MANAGER)).toEqual(ALL);
  });
  it("a researcher (own R1 reads only) searches alphas and approvals, never portfolios, accounts or operations", () => {
    expect(searchSourcesFor(registry, { capabilities: [...V2_ROLE_PRESETS.researcher] })).toEqual({ alpha: true, portfolio: false, account: false, operation: false, approval: true });
  });
  it("no capability: alphas only", () => {
    expect(searchSourcesFor(registry, { capabilities: [] })).toEqual({ alpha: true, portfolio: false, account: false, operation: false, approval: false });
  });
});

describe("searchEntities", () => {
  it("searches nothing under the minimum length", async () => {
    const { api, calls } = fakeApi();
    const out = await searchEntities(api, "a".repeat(MIN_QUERY - 1), ALL, undefined, signal());
    expect(out).toEqual({ entries: [], notes: [] });
    expect(calls.alphas).toHaveLength(0);
    expect(calls.portfolios).toBe(0);
  });

  it("alphas: the server searches by name; rows are the server's, with their read named and the match count", async () => {
    const { api, calls } = fakeApi();
    const out = (await searchEntities(api, "btc", { ...ALL, portfolio: false, account: false, operation: false, approval: false }, undefined, signal()))!;
    expect(calls.alphas).toEqual([{ search: "btc", limit: PER_KIND, environment: "all" }]);
    expect(out.entries.map((e) => [e.group, e.label, e.detail, e.href])).toEqual([
      ["Alphas", "BTC-Trend", "LIVE · v3", "/deployments/alphas/al_btc"],
      // No label published: the id is the label, not an invented name.
      ["Alphas", "al_eth", "PAPER · v1", "/deployments/alphas/al_eth"],
    ]);
    expect(out.notes).toEqual(["Alphas: alpha fleet read, server search by name, 2 of 14 shown"]);
  });

  it("accounts: the bindings read's own search; a repeated account is listed once", async () => {
    const { api, calls } = fakeApi();
    const out = (await searchEntities(api, "acct", { ...ALL, alpha: false, portfolio: false, operation: false, approval: false }, undefined, signal()))!;
    // The read takes one environment, so an account is asked of each, the bar's own first; a repeated account is listed once.
    expect(calls.bindings).toEqual([
      { search: "acct", limit: PER_KIND, environment: "live" },
      { search: "acct", limit: PER_KIND, environment: "paper" },
      { search: "acct", limit: PER_KIND, environment: "sandbox" },
    ]);
    expect(out.entries.map((e) => [e.label, e.detail, e.href])).toEqual([["acct_main", "BINANCE · Real-funded", "/deployments/accounts/acct_main?env=live"]]);
    expect(out.notes[0]).toBe("Accounts: bindings read, server search per environment (Real-funded 1 of 2, Paper 0 of 2, Sandbox 0 of 2 shown)");
    const paper = (await searchEntities(api, "acct", { ...ALL, alpha: false, portfolio: false, operation: false, approval: false }, undefined, signal(), "paper"))!;
    expect(calls.bindings[3]).toEqual({ search: "acct", limit: PER_KIND, environment: "paper" });
    expect(paper.entries[0]?.detail).toBe("BINANCE · Paper");
  });

  it("portfolios: no search parameter exists, so the text is matched here and the note says so, including a truncated list", async () => {
    const { api, calls } = fakeApi();
    const out = (await searchEntities(api, "core", { ...ALL, alpha: false, account: false, operation: false, approval: false }, undefined, signal()))!;
    expect(calls.portfolios).toBe(1);
    expect(out.entries.map((e) => e.href)).toEqual(["/deployments/portfolios/pf_core", "/deployments/portfolios/pf_core2"]);
    expect(out.notes[0]).toBe("Portfolios: portfolio list read (no search parameter), matched here in 3 loaded, list truncated by the server, 2 of 2 shown");
  });

  it("operations: the queue read by exact target id, with the workspace; an inc_ text also asks the incident read by exact id", async () => {
    const { api, calls } = fakeApi();
    const only = { ...ALL, alpha: false, portfolio: false, account: false, approval: false };
    const out = (await searchEntities(api, "pf_core", only, "ws_1", signal()))!;
    expect(calls.operations).toEqual([{ targetId: "pf_core", limit: PER_KIND, workspaceId: "ws_1" }]);
    expect(calls.incidents).toHaveLength(0);
    expect(out.entries[0]).toMatchObject({ group: "Operations", label: "op_9", href: "/execution/operations?operation=op_9" });
    expect(out.notes).toEqual(["Operations: queue read, exact target id, 1 of 1 shown"]);

    const inc = (await searchEntities(api, "inc_77", only, "ws_1", signal()))!;
    expect(calls.incidents).toEqual([["inc_77", "ws_1"]]);
    expect(inc.entries.map((e) => [e.group, e.href])).toContainEqual(["Incidents", "/execution/operations/incidents/inc_77"]);
  });

  it("an incident id that is not found says so; it is never invented", async () => {
    const { api } = fakeApi({ getIncidentRootV2: async () => fail("not found") });
    const out = (await searchEntities(api, "inc_404", { ...ALL, alpha: false, portfolio: false, account: false, approval: false }, undefined, signal()))!;
    expect(out.entries.map((e) => e.group)).not.toContain("Incidents");
    expect(out.notes).toContain("Incidents: incident links and exact id, none found");
  });

  it("approvals: no search parameter exists, so the first page is matched here by id or subject and the note says how many rows", async () => {
    const { api, calls } = fakeApi();
    const out = (await searchEntities(api, "carry", { ...ALL, alpha: false, portfolio: false, account: false, operation: false }, "ws_1", signal()))!;
    expect(calls.approvals).toEqual([{ filter: "ALL", limit: 50, workspaceId: "ws_1" }]);
    expect(out.entries.map((e) => [e.label, e.detail, e.href])).toEqual([["Carry v3.2 to PF-MAIN", "R1 · AP-201", "/governance/approvals?sel=AP-201"]]);
    expect(out.notes[0]).toBe("Approvals: approvals read (no search parameter), matched here in the first 2 rows, 1 of 1 shown");
    const byId = (await searchEntities(api, "ap-352", { ...ALL, alpha: false, portfolio: false, account: false, operation: false }, undefined, signal()))!;
    expect(byId.entries.map((e) => e.href)).toEqual(["/governance/approvals?sel=AP-352"]);
  });

  it("caps every kind at PER_KIND whatever the server returns", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ alphaId: `al_${i}`, alphaLabel: `A${i}`, version: "v1", stage: "PAPER" }));
    const { api } = fakeApi({ getAlphaFleet: async () => ok({ page: { rows: many, filteredCount: 12, totalCount: 12 } }) });
    const valid = (await searchEntities(api, "al", { ...ALL, portfolio: false, account: false, operation: false, approval: false }, undefined, signal()))!;
    expect(valid.entries).toHaveLength(PER_KIND);
    expect(valid.notes[0]).toMatch(/5 of 12 shown/);
  });

  it("a failing read is one named note and does not hide the others; a thrown read is a note too", async () => {
    const { api } = fakeApi({
      getAlphaFleet: async () => fail("Alpha fleet read refused (403)"),
      listApprovals: async () => {
        throw new Error("boom");
      },
    });
    const out = (await searchEntities(api, "core", ALL, undefined, signal()))!;
    expect(out.notes).toContain("Alphas: not available (Alpha fleet read refused (403))");
    expect(out.notes).toContain("Approvals: the read did not complete");
    expect(out.entries.map((e) => e.group)).toEqual(expect.arrayContaining(["Portfolios", "Operations"]));
  });

  it("an aborted search resolves to null: a stale answer is never returned", async () => {
    const { api } = fakeApi();
    const controller = new AbortController();
    const pending = searchEntities(api, "core", ALL, undefined, controller.signal);
    controller.abort();
    expect(await pending).toBeNull();
  });
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

describe("ExecCommandBar search", () => {
  function mount(api: ExecutionApi, capabilities = MANAGER.capabilities, url = "/execution?env=paper&workspace_id=ws_1") {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <ExecCommandBar registry={registry} options={{ capabilities }} open onClose={() => undefined} searchApi={api} debounceMs={5} />
        <Where />
      </MemoryRouter>,
    );
  }

  it("debounces: a burst of keystrokes is one search, and the results are grouped under the read that answered", async () => {
    const { api, calls } = fakeApi();
    mount(api);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "co" } });
    fireEvent.change(input, { target: { value: "cor" } });
    fireEvent.change(input, { target: { value: "core" } });
    await waitFor(() => expect(screen.getByRole("list", { name: "Reads used" })).toBeTruthy());
    expect(calls.alphas).toHaveLength(1);
    expect(calls.alphas[0]).toMatchObject({ search: "core" });
    const notes = screen.getByRole("list", { name: "Reads used" }).textContent ?? "";
    expect(notes).toContain("Alphas: alpha fleet read, server search by name");
    expect(notes).toContain("Approvals: approvals read (no search parameter)");
    const groups = [...document.querySelectorAll(".exec-cmdbar-group")].map((g) => g.textContent);
    expect(groups).toEqual(expect.arrayContaining(["Alphas", "Portfolios"]));
  });

  it("choosing a result navigates to its screen and keeps the context", async () => {
    const { api } = fakeApi();
    mount(api);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "btc" } });
    const option = await screen.findByRole("option", { name: /BTC-Trend/ });
    fireEvent.click(option);
    const url = new URL(screen.getByTestId("where").textContent ?? "", "http://x");
    expect(url.pathname).toBe("/deployments/alphas/al_btc");
    expect(url.searchParams.get("env")).toBe("paper");
    expect(url.searchParams.get("workspace_id")).toBe("ws_1");
  });

  it("passes the address's workspace to the workspace-scoped reads and its environment to the bindings read", async () => {
    const { api, calls } = fakeApi();
    mount(api);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(calls.approvals).toHaveLength(1));
    expect(calls.approvals[0]).toMatchObject({ workspaceId: "ws_1" });
    expect(calls.operations[0]).toMatchObject({ workspaceId: "ws_1" });
    expect(calls.bindings[0]).toMatchObject({ environment: "paper" });
  });

  it("a caller without the capabilities never triggers those reads", async () => {
    const { api, calls } = fakeApi();
    mount(api, [], "/execution");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(calls.alphas).toHaveLength(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(calls.portfolios).toBe(0);
    expect(calls.bindings).toHaveLength(0);
    expect(calls.operations).toHaveLength(0);
    expect(calls.approvals).toHaveLength(0);
  });

  it("shorter than the minimum: no read at all, Go to rows only", async () => {
    const spy = vi.fn();
    const { api } = fakeApi({ getAlphaFleet: async (q: unknown) => (spy(q), ok({ page: { rows: [], filteredCount: 0, totalCount: 0 } })) });
    mount(api);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "a" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: "Reads used" })).toBeNull();
  });

  it("closing the bar and reopening it starts from an empty search", async () => {
    const { api } = fakeApi();
    const view = render(
      <MemoryRouter initialEntries={["/execution"]}>
        <ExecCommandBar registry={registry} options={MANAGER} open onClose={() => undefined} searchApi={api} debounceMs={5} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(screen.getByRole("list", { name: "Reads used" })).toBeTruthy());
    view.rerender(
      <MemoryRouter initialEntries={["/execution"]}>
        <ExecCommandBar registry={registry} options={MANAGER} open={false} onClose={() => undefined} searchApi={api} debounceMs={5} />
      </MemoryRouter>,
    );
    view.rerender(
      <MemoryRouter initialEntries={["/execution"]}>
        <ExecCommandBar registry={registry} options={MANAGER} open onClose={() => undefined} searchApi={api} debounceMs={5} />
      </MemoryRouter>,
    );
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("list", { name: "Reads used" })).toBeNull();
  });
});

const indexBody = (over: Record<string, unknown> = {}) => ({
  workspaceId: "ws_1", readAtMs: 1, query: { q: "core", kinds: [], limit: 5 },
  groups: [
    { kind: "alpha", totalMatched: 14, rows: [{ kind: "alpha", id: "al_btc", label: "BTC-Trend", detail: "LIVE", routeHint: "/deployments/alphas/al_btc" }] },
    { kind: "portfolio", totalMatched: 0, rows: [] },
    { kind: "account", totalMatched: null, rows: [{ kind: "account", id: "acct_main", label: "acct_main", detail: null, routeHint: "/deployments/accounts/acct_main" }] },
    { kind: "incident", totalMatched: null, rows: [{ kind: "incident", id: "inc_1", label: "inc_1", detail: "OPEN", routeHint: "/execution/operations/incidents/inc_1" }] },
  ],
  ...over,
});

describe("the one server search (GET /search) is the primary source", () => {
  it("one read answers every kind the rail lists; no per-read search is made", async () => {
    const searchSpy = vi.fn(async () => ok(indexBody()));
    const { api, calls } = fakeApi({ searchEntities: searchSpy });
    const out = (await searchEntities(api, "core", ALL, "ws_1", signal()))!;
    expect(out.via).toBe("index");
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith({ q: "core", kinds: ["alpha", "portfolio", "account", "operation", "approval", "incident"], limit: PER_KIND, workspaceId: "ws_1" });
    expect(calls.alphas).toHaveLength(0);
    // The index returned no portfolio, so the portfolio list is asked too (a name on screen the index does not know); nothing else is.
    expect(calls.portfolios).toBe(1);
    expect(calls.bindings).toHaveLength(0);
    expect(calls.operations).toHaveLength(0);
    // The approvals list is matched too (the index filled less than the cap): the request at the top of the queue is found by id or subject.
    expect(calls.approvals).toHaveLength(1);
    expect(out.entries.filter((e) => e.group !== "Portfolios" && e.group !== "Approvals").map((e) => [e.group, e.label, e.detail, e.href])).toEqual([
      ["Alphas", "BTC-Trend", "LIVE", "/deployments/alphas/al_btc"],
      ["Accounts", "acct_main", undefined, "/deployments/accounts/acct_main"],
      ["Incidents", "inc_1", "OPEN", "/execution/operations/incidents/inc_1"],
    ]);
    expect(out.entries.filter((e) => e.group === "Portfolios").map((e) => e.label)).toEqual(["Core Book", "Other"]);
  });

  it("each group says how many are shown of how many matched; a counted zero, an uncounted group and a missing group differ", async () => {
    const { api } = fakeApi({ searchEntities: async () => ok(indexBody()) });
    const out = (await searchEntities(api, "core", ALL, undefined, signal()))!;
    expect(out.notes).toEqual([
      "Alphas: entity search read, 1 of 14 shown",
      "Accounts: entity search read, 1 shown, count not published",
      "Operations: entity search read, none returned",
      "Incidents: entity search read, 1 shown, count not published",
      // The index counted zero portfolios, so the portfolio list was asked as well and its answer replaces the index's empty line.
      "Portfolios: portfolio list read (no search parameter), matched here in 3 loaded, list truncated by the server, 2 of 2 shown",
      "Approvals: approvals read (no search parameter), matched here in the first 2 rows, 1 of 1 shown",
    ]);
  });

  it("a NOT_COMMISSIONED group is said so (not a zero, not 'count not published') and the kind's own read is still asked", async () => {
    const groups = ["alpha", "portfolio", "account", "operation", "approval", "incident"].map((kind) => ({ kind, totalMatched: null, rows: [], notCommissioned: true }));
    const { api, calls } = fakeApi({ searchEntities: async () => ok(indexBody({ groups })) });
    const out = (await searchEntities(api, "core", ALL, undefined, signal()))!;
    expect(out.via).toBe("index");
    // The index lines of the kinds the list reads then answered are replaced by those reads; the others keep the honest "not covered" line.
    expect(out.notes.filter((note) => note.includes("entity search")).sort()).toEqual([
      "Alphas: entity search does not cover this kind yet",
      "Incidents: entity search does not cover this kind yet",
      "Operations: entity search does not cover this kind yet",
    ]);
    expect(out.notes.filter((note) => note.includes("entity search")).some((note) => note.includes("count not published") || /\b0 of\b/.test(note))).toBe(false);
    expect(calls.portfolios).toBe(1);
    // The bindings read takes one environment, so the account is looked for in each of the three.
    expect(calls.bindings).toHaveLength(3);
    expect(calls.approvals).toHaveLength(1);
  });

  it("asks only for the kinds the rail lists", async () => {
    const spy = vi.fn(async () => ok(indexBody()));
    const { api } = fakeApi({ searchEntities: spy });
    await searchEntities(api, "core", { alpha: true, portfolio: false, account: false, operation: false, approval: true }, undefined, signal());
    expect(spy).toHaveBeenCalledWith({ q: "core", kinds: ["alpha", "approval"], limit: PER_KIND });
  });

  it("not published (refused, unreadable, or no port method): the per-read searches answer, labelled as such", async () => {
    for (const over of [{ searchEntities: async () => fail("not served") }, { searchEntities: async () => { throw new Error("x"); } }, {}]) {
      const { api, calls } = fakeApi(over);
      const out = (await searchEntities(api, "core", ALL, undefined, signal()))!;
      expect(out.via).toBe("reads");
      expect(calls.alphas).toHaveLength(1);
      expect(out.notes.some((n) => n.includes("matched here"))).toBe(true);
    }
  });

  it("skipIndex goes straight to the reads (no second probe)", async () => {
    const spy = vi.fn(async () => ok(indexBody()));
    const { api, calls } = fakeApi({ searchEntities: spy });
    const out = (await searchEntities(api, "core", ALL, undefined, signal(), "live", { skipIndex: true }))!;
    expect(spy).not.toHaveBeenCalled();
    expect(out.via).toBe("reads");
    expect(calls.alphas).toHaveLength(1);
  });
});

describe("ExecCommandBar with the server search", () => {
  const mountBar = (api: ExecutionApi) =>
    render(
      <MemoryRouter initialEntries={["/execution?workspace_id=ws_1"]}>
        <ExecCommandBar registry={registry} options={MANAGER} open onClose={() => undefined} searchApi={api} debounceMs={5} />
        <Where />
      </MemoryRouter>,
    );
  const noticeText = () => document.querySelector(".exec-cmdbar-notice")?.textContent;

  it("names the one read in the notice once it answered, shows its groups and navigates with the route hint", async () => {
    const spy = vi.fn(async () => ok(indexBody()));
    const { api, calls } = fakeApi({ searchEntities: spy });
    mountBar(api);
    expect(noticeText()).toBe(`${ENTITY_SEARCH_NOTICE}. ${ENTITY_SEARCH_HINT}`);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    fireEvent.click(await screen.findByRole("option", { name: /BTC-Trend/ }));
    expect(new URL(screen.getByTestId("where").textContent ?? "", "http://x").pathname).toBe("/deployments/alphas/al_btc");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calls.alphas).toHaveLength(0);
  });

  it("the notice says the search looks in every kind you may see while the one search is the source", async () => {
    const { api } = fakeApi({ searchEntities: async () => ok(indexBody()) });
    mountBar(api);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await screen.findByRole("list", { name: "Reads used" });
    expect(noticeText()).toBe(`${ENTITY_SEARCH_INDEX_NOTICE}. ${ENTITY_SEARCH_HINT}`);
  });

  it("unpublished: the per-read fallback answers once per query, /search is probed once and not again, the typed FE-023 notice stays", async () => {
    const spy = vi.fn(async () => fail("404"));
    const { api, calls } = fakeApi({ searchEntities: spy });
    mountBar(api);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "core" } });
    await waitFor(() => expect(calls.alphas).toHaveLength(1));
    await screen.findByRole("list", { name: "Reads used" });
    fireEvent.change(input, { target: { value: "cora" } });
    await waitFor(() => expect(calls.alphas).toHaveLength(2));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(noticeText()).toBe(`${ENTITY_SEARCH_NOTICE}. ${ENTITY_SEARCH_HINT}`);
    expect(screen.getByRole("list", { name: "Reads used" }).textContent).toContain("Alphas: alpha fleet read, server search by name");
  });
});

describe("a NON-HOME workspace reaches every search family", () => {
  it("the five per-read families carry the workspace (alpha, account and portfolio reads included), and so does /search", async () => {
    const { api, calls } = fakeApi();
    await searchEntities(api, "core", ALL, "ws_other", signal(), "paper", { skipIndex: true });
    expect(calls.alphas).toEqual([{ search: "core", limit: PER_KIND, environment: "all", workspace_id: "ws_other" }]);
    expect(calls.bindings.map((q) => [(q as { environment: string }).environment, (q as { workspace_id: string }).workspace_id])).toEqual([["paper", "ws_other"], ["live", "ws_other"], ["sandbox", "ws_other"]]);
    expect(calls.portfolioQueries).toEqual([{ workspaceId: "ws_other" }]);
    expect(calls.operations[0]).toMatchObject({ workspaceId: "ws_other" });
    expect(calls.approvals[0]).toMatchObject({ workspaceId: "ws_other" });
    const spy = vi.fn(async () => ok(indexBody()));
    await searchEntities(fakeApi({ searchEntities: spy }).api, "core", ALL, "ws_other", signal());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_other" }));
  });

  it("no workspace in the address: no workspace_id is sent (the server's own home), never an invented one", async () => {
    const { api, calls } = fakeApi();
    await searchEntities(api, "core", ALL, undefined, signal(), "live", { skipIndex: true });
    expect(calls.alphas[0]).not.toHaveProperty("workspace_id");
    expect(calls.bindings[0]).not.toHaveProperty("workspace_id");
    expect(calls.portfolioQueries).toEqual([undefined]);
  });
});

describe("results belong to one scope (workspace, environment, capabilities, text)", () => {
  /** A port whose /search answer is released by hand, so an old answer can arrive after the scope changed. */
  function deferredApi() {
    const pending: { workspaceId: string | undefined; release: (body: unknown) => void }[] = [];
    const api = {
      searchEntities: (query: { workspaceId?: string }) =>
        new Promise((resolve) => pending.push({ workspaceId: query.workspaceId, release: (body) => resolve(ok(body)) })),
    } as unknown as ExecutionApi;
    return { api, pending };
  }
  const bodyFor = (label: string) => indexBody({ groups: [{ kind: "alpha", totalMatched: 1, rows: [{ kind: "alpha", id: "al_x", label, detail: null, routeHint: "/deployments/alphas/al_x" }] }] });

  function GoTo() {
    const nav = useNavigate();
    return (
      <>
        <button onClick={() => nav("/execution?workspace_id=ws_B")}>to B</button>
        <button onClick={() => nav("/execution?workspace_id=ws_A&env=paper")}>to paper</button>
        <Where />
      </>
    );
  }
  const tree = (url: string, api: ExecutionApi, capabilities: readonly string[]) => (
    <MemoryRouter initialEntries={[url]}>
      <ExecCommandBar registry={registry} options={{ capabilities }} open onClose={() => undefined} searchApi={api} debounceMs={1} />
      <GoTo />
    </MemoryRouter>
  );

  it("a deferred workspace A answer that arrives after the switch to B is dropped, and nothing of A can be chosen", async () => {
    const { api, pending } = deferredApi();
    render(tree("/execution?workspace_id=ws_A", api, MANAGER.capabilities));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0].workspaceId).toBe("ws_A");
    fireEvent.click(screen.getByRole("button", { name: "to B" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].workspaceId).toBe("ws_B");
    await act(async () => pending[0].release(bodyFor("Alpha of A")));
    expect(screen.queryByText("Alpha of A")).toBeNull();
    expect(screen.queryByRole("list", { name: "Reads used" })).toBeNull();
    await act(async () => pending[1].release(bodyFor("Alpha of B")));
    fireEvent.click(await screen.findByRole("option", { name: /Alpha of B/ }));
    expect(new URL(screen.getByTestId("where").textContent ?? "", "http://x").searchParams.get("workspace_id")).toBe("ws_B");
  });

  it("an environment switch drops the old answer and asks again", async () => {
    const { api, pending } = deferredApi();
    render(tree("/execution?workspace_id=ws_A", api, MANAGER.capabilities));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "to paper" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[0].release(bodyFor("Live answer")));
    expect(screen.queryByText("Live answer")).toBeNull();
  });

  it("a delivered answer is dropped when the workspace changes", async () => {
    const { api, pending } = deferredApi();
    render(tree("/execution?workspace_id=ws_A", api, MANAGER.capabilities));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].release(bodyFor("Alpha of A")));
    expect(await screen.findByText("Alpha of A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "to B" }));
    expect(screen.queryByText("Alpha of A")).toBeNull();
  });

  it("removing a capability removes its group from the shown results and its read from the next search", async () => {
    const { api, calls } = fakeApi();
    const view = render(tree("/execution?workspace_id=ws_A", api, MANAGER.capabilities));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "core" } });
    await waitFor(() => expect(calls.approvals).toHaveLength(1));
    await screen.findByRole("list", { name: "Reads used" });
    expect(screen.getByRole("list", { name: "Reads used" }).textContent).toContain("Approvals");
    view.rerender(tree("/execution?workspace_id=ws_A", api, []));
    expect(screen.queryByRole("list", { name: "Reads used" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("list", { name: "Reads used" }).textContent).not.toContain("Approvals"));
    expect(screen.getByRole("list", { name: "Reads used" }).textContent).not.toContain("Portfolios");
    expect(calls.approvals).toHaveLength(1);
  });
});

describe("ids on screen are found, and nothing that does not exist is offered (QA1 I-40, I-42)", () => {
  it("hrefFor follows the server's hint only when the app owns that route; otherwise the entity's own screen", () => {
    const routes = ["/deployments/alphas", "/execution/operations", "/governance/approvals", "/deployments/portfolios", "/deployments/accounts"];
    expect(hrefFor("alpha", "al_1", "/deployments/alphas/al_1", routes)).toBe("/deployments/alphas/al_1");
    expect(hrefFor("operation", "op_1", "/operations?operation=op_1", routes)).toBe("/execution/operations?operation=op_1");
    expect(hrefFor("approval", "AP-1", "/approvals?sel=AP-1", routes)).toBe("/governance/approvals?sel=AP-1");
    expect(hrefFor("incident", "inc_1", "/execution/operations/incidents/inc_1", routes)).toBe("/execution/operations/incidents/inc_1");
    expect(hrefFor("alpha", "al_1", "/nowhere/al_1", routes)).toBe("/deployments/alphas/al_1");
    expect(hrefFor("alpha", "al_1", "/anything", undefined)).toBe("/anything");
  });

  it("the index path maps a hint the app does not own to the entity's screen", async () => {
    const body = indexBody({ groups: [{ kind: "operation", totalMatched: 1, rows: [{ kind: "operation", id: "op_TEST_ONLY_s01", label: "RECALL", detail: "live", routeHint: "/operations?operation=op_TEST_ONLY_s01" }] }] });
    const { api } = fakeApi({ searchEntities: async () => ok(body) });
    const out = (await searchEntities(api, "op_TEST", ALL, undefined, signal(), "live", { routes: ["/execution/operations"] }))!;
    expect(out.entries.find((e) => e.group === "Operations")?.href).toBe("/execution/operations?operation=op_TEST_ONLY_s01");
  });

  it("an account the index cannot count (null, no rows) is asked of the bindings read in every environment", async () => {
    const body = indexBody({ groups: [{ kind: "alpha", totalMatched: 0, rows: [] }, { kind: "account", totalMatched: null, rows: [] }] });
    const { api, calls } = fakeApi({ searchEntities: async () => ok(body) });
    const out = (await searchEntities(api, "acct_main", ALL, undefined, signal()))!;
    expect(out.via).toBe("index");
    expect(calls.bindings).toHaveLength(3);
    expect(out.entries.filter((e) => e.group === "Accounts").map((e) => e.label)).toEqual(["acct_main"]);
    // The index's own empty line for that kind is replaced, not repeated.
    expect(out.notes.filter((n) => n.startsWith("Accounts:"))).toHaveLength(1);
  });

  it("an index that DID answer for accounts (rows or a counted zero) is not asked twice", async () => {
    const body = indexBody({ groups: [{ kind: "account", totalMatched: 0, rows: [] }] });
    const { api, calls } = fakeApi({ searchEntities: async () => ok(body) });
    await searchEntities(api, "acct_main", ALL, undefined, signal());
    expect(calls.bindings).toHaveLength(0);
  });

  it("an inc_ id the index cannot count is looked up by its exact id; a missing one is said to be missing, not invented", async () => {
    const empty = indexBody({ groups: [{ kind: "incident", totalMatched: null, rows: [] }] });
    const found = fakeApi({ searchEntities: async () => ok(empty) });
    const hit = (await searchEntities(found.api, "inc_77", ALL, "ws_1", signal()))!;
    expect(found.calls.incidents).toEqual([["inc_77", "ws_1"]]);
    expect(hit.entries.map((e) => [e.group, e.href])).toContainEqual(["Incidents", "/execution/operations/incidents/inc_77"]);
    const missing = fakeApi({ searchEntities: async () => ok(empty), getIncidentRootV2: async () => fail("not found") });
    const none = (await searchEntities(missing.api, "inc_404", ALL, undefined, signal()))!;
    expect(none.entries.map((e) => e.group)).not.toContain("Incidents");
    expect(none.notes).toContain("Incidents: incident links and exact id, none found");
  });

  it("compactNotes: reads with a result keep their line, the empty ones are one line", () => {
    expect(compactNotes(["Alphas: a, 2 of 14 shown", "Portfolios: p, 0 of 0 shown", "Operations: entity search read, none returned", "Incidents: x, none found"]))
      .toEqual(["Alphas: a, 2 of 14 shown", "No match in: Portfolios, Operations, Incidents"]);
    expect(compactNotes(["Alphas: a, 2 of 14 shown"])).toEqual(["Alphas: a, 2 of 14 shown"]);
    expect(compactNotes([])).toEqual([]);
  });
});

describe("incidents are found by prefix as well as by exact id (QA2 R3-22)", () => {
  const link = (id: string) => ({ state: "LINKED", incidentId: id, relationship: "RELATED", incident: { workflowState: "OPEN" } });
  const queueWith = (rows: unknown[]) => async () => ok({ kind: "queue", queue: { page: { filteredCount: rows.length, rows } } });
  const rows = [
    { operationId: "op_1", commandKey: "C", targetType: "PORTFOLIO", targetId: "p", incidentLinks: { items: [link("inc_TEST_ONLY_fx_a"), link("inc_TEST_ONLY_fx_b")] } },
    { operationId: "op_2", commandKey: "C", targetType: "PORTFOLIO", targetId: "p", incidentLinks: { items: [link("inc_TEST_ONLY_fx_a"), { state: "NOT_ATTESTED" }] } },
    { operationId: "op_3", commandKey: "C", targetType: "PORTFOLIO", targetId: "p" },
  ];
  const onlyOps = { ...ALL, alpha: false, portfolio: false, account: false, approval: false };

  it('"inc" lists the incident ids the queue rows link to, once each, and offers no id no row links to', async () => {
    const { api } = fakeApi({ listOperationalQueueV2: queueWith(rows), getIncidentRootV2: async () => fail("none") });
    const out = (await searchEntities(api, "inc", onlyOps, "ws_1", signal(), "live", { skipIndex: true }))!;
    expect(out.entries.filter((e) => e.group === "Incidents").map((e) => e.label)).toEqual(["inc_TEST_ONLY_fx_a", "inc_TEST_ONLY_fx_b"]);
    expect(out.entries.filter((e) => e.group === "Incidents").map((e) => e.href)[0]).toBe("/execution/operations/incidents/inc_TEST_ONLY_fx_a");
    expect(out.notes.find((n) => n.startsWith("Incidents:"))).toContain("matched here in the first 3 rows");
  });

  it("a text that matches none says none found; an exact id the incident read knows is added", async () => {
    const { api } = fakeApi({ listOperationalQueueV2: queueWith(rows) });
    const none = (await searchEntities(api, "inc_zzz", onlyOps, undefined, signal(), "live", { skipIndex: true }))!;
    expect(none.entries.filter((e) => e.group === "Incidents").map((e) => e.label)).toEqual(["inc_zzz"]); // the exact read (fake) answers
    const noneAtAll = fakeApi({ listOperationalQueueV2: queueWith(rows), getIncidentRootV2: async () => fail("no") });
    const out = (await searchEntities(noneAtAll.api, "inc_zzz", onlyOps, undefined, signal(), "live", { skipIndex: true }))!;
    expect(out.entries.filter((e) => e.group === "Incidents")).toEqual([]);
  });

  it("through the index path an uncounted empty incident group is completed the same way", async () => {
    const body = indexBody({ groups: [{ kind: "incident", totalMatched: null, rows: [] }] });
    const { api } = fakeApi({ searchEntities: async () => ok(body), listOperationalQueueV2: queueWith(rows), getIncidentRootV2: async () => fail("no") });
    const out = (await searchEntities(api, "inc", ALL, undefined, signal()))!;
    expect(out.via).toBe("index");
    expect(out.entries.filter((e) => e.group === "Incidents").map((e) => e.label)).toEqual(["inc_TEST_ONLY_fx_a", "inc_TEST_ONLY_fx_b"]);
  });
});

describe("people and portfolios are found by NAME (QA3 R3-23, R1-22)", () => {
  const roster = vi.fn(async (q: { limit: number; q: string }) => ({
    accounts: [{ userId: "usr_9", username: "hoa", displayName: "Hoa Nguyen", role: "USER", accountState: "ACTIVE" }],
    counts: { matching: 1 },
    asked: q,
  }));
  const withPeople = { ...ALL, person: true };

  it("a person is found through the roster read by name, and opens the Users screen on that account", async () => {
    const { api } = fakeApi({ searchEntities: async () => ok(indexBody()) });
    const out = (await searchEntities(api, "Hoa", withPeople, "ws_1", signal(), "live", { readPeople: roster }))!;
    expect(roster).toHaveBeenCalledWith({ limit: PER_KIND, q: "Hoa" });
    expect(out.entries.filter((e) => e.group === "People").map((e) => [e.label, e.detail, e.href])).toEqual([["Hoa Nguyen", "hoa · user · active", "/administration/users?sel=usr_9&q=hoa"]]);
    expect(out.notes).toContain("People: account roster, server search by name and username, 1 of 1 shown");
  });

  it("the same through the per-list fallback", async () => {
    const { api } = fakeApi();
    const out = (await searchEntities(api, "Hoa", withPeople, undefined, signal(), "live", { skipIndex: true, readPeople: roster }))!;
    expect(out.entries.some((e) => e.group === "People" && e.label === "Hoa Nguyen")).toBe(true);
  });

  it("no people source (not an administrator): the roster is not read", async () => {
    const reader = vi.fn(async () => ({ accounts: [], counts: { matching: 0 } }));
    const { api } = fakeApi();
    await searchEntities(api, "Hoa", ALL, undefined, signal(), "live", { skipIndex: true, readPeople: reader });
    expect(reader).not.toHaveBeenCalled();
  });

  it("a refused roster read is one named note, not a failure of the search", async () => {
    const { api } = fakeApi();
    const out = (await searchEntities(api, "Hoa", withPeople, undefined, signal(), "live", { skipIndex: true, readPeople: async () => { throw new Error("403"); } }))!;
    expect(out.notes).toContain("People: the read did not complete");
    expect(out.entries.length).toBeGreaterThanOrEqual(0);
  });

  it("a portfolio the index does not know ('Core', 'Canary') is found by its name in the portfolio list", async () => {
    const { api } = fakeApi({
      searchEntities: async () => ok(indexBody({ groups: [{ kind: "portfolio", totalMatched: 0, rows: [] }] })),
      listPortfolios: async () => ok({ truncated: false, items: [{ portfolioId: "pf_TEST_ONLY_core", name: "Core" }, { portfolioId: "pf_TEST_ONLY_canary", name: "Canary" }] }),
    });
    const core = (await searchEntities(api, "Core", ALL, undefined, signal()))!;
    expect(core.entries.filter((e) => e.group === "Portfolios").map((e) => [e.label, e.href])).toEqual([["Core", "/deployments/portfolios/pf_TEST_ONLY_core"]]);
    const canary = (await searchEntities(api, "canary", ALL, undefined, signal()))!;
    expect(canary.entries.filter((e) => e.group === "Portfolios").map((e) => e.label)).toEqual(["Canary"]);
  });
});

describe("approvals are found by request id and by subject; no result carries a missing id (QA4 R3-01)", () => {
  const onlyApprovals = { ...ALL, alpha: false, portfolio: false, account: false, operation: false };
  const approvalRows = [
    { id: "AP-352", gate: "R2", subject: "Carry v3.2 -> Core" },
    { id: "AP-201", gate: "R1", subject: "RSI v1.7 -> Satellite" },
  ];
  const api = (rows: unknown[], over: Record<string, unknown> = {}) => fakeApi({ listApprovals: async () => ok({ page: { rows }, counts: null }), ...over }).api;

  it("AP-352 by its id and 'Carry v3' by its subject, through the approvals list, with the index empty", async () => {
    const a = api(approvalRows, { searchEntities: async () => ok(indexBody({ groups: [{ kind: "approval", totalMatched: 0, rows: [] }] })) });
    const byId = (await searchEntities(a, "AP-352", onlyApprovals, undefined, signal()))!;
    expect(byId.entries.map((e) => [e.label, e.href])).toEqual([["Carry v3.2 -> Core", "/governance/approvals?sel=AP-352"]]);
    const bySubject = (await searchEntities(a, "Carry v3", onlyApprovals, undefined, signal()))!;
    expect(bySubject.entries.map((e) => e.href)).toEqual(["/governance/approvals?sel=AP-352"]);
  });

  it("an index hit with no real id ('undefined') is not offered, and the real request is", async () => {
    const bad = { kind: "approval", id: "undefined", label: "Carry v1.9 · dep_75", detail: "R1", routeHint: "/approvals?sel=undefined" };
    const a = api(approvalRows, { searchEntities: async () => ok(indexBody({ groups: [{ kind: "approval", totalMatched: 1, rows: [bad] }] })) });
    const out = (await searchEntities(a, "Carry", onlyApprovals, undefined, signal(), "live", { routes: ["/governance/approvals"] }))!;
    expect(out.entries.map((e) => e.label)).toEqual(["Carry v3.2 -> Core"]);
    for (const entry of out.entries) expect(entry.href).not.toMatch(/undefined|null|NaN/);
  });

  it("per-list fallback: a row without an id is skipped, never printed as sel=undefined", async () => {
    const a = api([{ id: undefined, gate: "R1", subject: "Carry ghost" }, ...approvalRows]);
    const out = (await searchEntities(a, "Carry", onlyApprovals, undefined, signal(), "live", { skipIndex: true }))!;
    expect(out.entries.map((e) => e.label)).toEqual(["Carry v3.2 -> Core"]);
  });

  it("isRealId", () => {
    for (const bad of ["", " ", "undefined", "Null", "NaN", undefined, null, 5]) expect(isRealId(bad), String(bad)).toBe(false);
    for (const good of ["AP-352", "al_1", "inc_TEST_ONLY_fx_a"]) expect(isRealId(good)).toBe(true);
  });

  it("index and list rows of one request are listed once", async () => {
    const hit = { kind: "approval", id: "AP-352", label: "Carry v3.2 -> Core", detail: "R2", routeHint: "/governance/approvals?sel=AP-352" };
    const a = api(approvalRows, { searchEntities: async () => ok(indexBody({ groups: [{ kind: "approval", totalMatched: 1, rows: [hit] }] })) });
    const out = (await searchEntities(a, "Carry", onlyApprovals, undefined, signal(), "live", { routes: ["/governance/approvals"] }))!;
    expect(out.entries.filter((e) => e.id === "approval:AP-352")).toHaveLength(1);
  });
});
