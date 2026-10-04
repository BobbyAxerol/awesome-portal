// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceFlowRoute } from "./EvidenceFlowRoute";
import { SplitRoute } from "./SplitRoute";
import { SearchRoute } from "./SearchRoute";
import { FreezeRoute } from "./FreezeRoute";
import { ExecuteRoute } from "./ExecuteRoute";
import { RunLibraryRoute } from "./RunLibraryRoute";
import { NewRunRoute } from "./NewRunRoute";
import { forgetSearchReads } from "./useSearch";
import { forgetSplitReads } from "./useSplit";
import { forgetRunIdentities } from "./retainedLane";
import { clearRunStatusCache } from "./useRunStatus";
import { forgetObservedFolds } from "./evidenceCursor";
import { libraryPage, libraryRow } from "./runStates.fixture";
import { useRunLibrary } from "./useRunLibrary";

vi.mock("lightweight-charts", () => ({ ColorType: { Solid: "solid" }, LineType: { WithSteps: 1 }, CandlestickSeries: "candles", LineSeries: "line", createSeriesMarkers: () => ({ setMarkers: vi.fn() }), createChart: () => ({ addSeries: () => ({ setData: vi.fn(), applyOptions: vi.fn(), data: () => [] }), panes: () => [], remove: vi.fn(), setCrosshairPosition: vi.fn(), timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange: vi.fn(), fitContent: vi.fn() }) }) }));
const fx = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "../../../packages/contracts/fixtures", name), "utf8"));
const w3 = JSON.parse(readFileSync(join(process.cwd(), "src/research/w3RealWfo.fixture.json"), "utf8"));
const w3b = JSON.parse(readFileSync(join(process.cwd(), "src/research/w3bRealWfo.fixture.json"), "utf8"));
const RUN = w3b.progress.run_id as string;
const WS = "ws_scope_a", OTHER = "ws_scope_b";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls: { url: URL; init?: RequestInit }[] = [];
function response(path: string) {
  if (path.endsWith("/runs")) return libraryPage([libraryRow("COMPLETED", { runId: RUN })]);
  if (path.endsWith("/progress")) return w3b.progress;
  if (path.endsWith("/requested-spec")) return w3b.requested_spec;
  if (path.endsWith("/current-source/evidence")) return w3.evidence;
  if (path.endsWith("/current-source/split")) return w3.split;
  if (path.endsWith("/current-source/search")) return w3.search;
  if (path.endsWith("/current-source/freeze")) return w3b.freeze;
  if (path.endsWith("/current-source/replay/transitions")) return fx("research-current-source.replay-transitions.valid.json");
  if (path.endsWith("/current-source/replay/child-audit")) return fx("research-current-source.replay-child-audit.fold0.valid.json");
  if (path.endsWith("/current-source/replay")) return w3b.replay;
  if (path.endsWith("/execute/replay")) {
    // Exercise retained fallback from the canonical structural replay document.
    const body = fx("research-replay.p04-not-published.valid.json");
    return { ...body, route: { ...body.route, state: "NOT_PUBLISHED" } };
  }
  if (path.endsWith("/evidence")) return w3b.hub_evidence;
  if (path.endsWith("/split")) return w3b.hub_split;
  if (path.endsWith("/search")) return w3b.hub_search;
  if (path.endsWith("/freeze")) return w3b.hub_freeze;
  if (path.includes("/atlas")) return fx("research-foundation.atlas-current.valid.json");
  if (path.endsWith("/alphas")) return fx("research-alpha-import.registry.valid.json");
  if (path.endsWith("/datasets")) return fx("research-dataset-catalog.v2.healthy.valid.json");
  return null;
}
beforeEach(() => {
  calls.length = 0; window.sessionStorage.clear(); forgetSearchReads(); forgetSplitReads(); forgetRunIdentities(); clearRunStatusCache(); forgetObservedFolds();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://local"); calls.push({ url, init });
    const body = response(url.pathname);
    return body === null ? json({ error: { code: "RESEARCH_NOT_PUBLISHED", message: "Not published" } }, 404) : json(body);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Navigator() {
  const navigate = useNavigate(), location = useLocation();
  return <><button onClick={() => navigate(`?workspace_id=${OTHER}`)}>Change workspace</button><output data-address>{location.search}</output></>;
}
function mount(screenName: string, element: React.ReactNode, query = `?workspace_id=${WS}`) {
  return render(<MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN}/${screenName}${query}`]}><Navigator /><Routes><Route path={`/research/quantbt/runs/:runId/${screenName}`} element={element} /></Routes></MemoryRouter>);
}
describe("explicit Research workspace reaches route, lazy readers and named navigation", () => {
  it.each([
    ["evidence", <EvidenceFlowRoute />, "/evidence"],
    ["split", <SplitRoute />, "/current-source/split"],
    ["search", <SearchRoute />, "/current-source/search"],
    ["freeze", <FreezeRoute />, "/current-source/freeze"],
    ["execute", <ExecuteRoute />, "/current-source/replay"],
  ] as const)("%s passes explicit workspace to every issued reader", async (screenName, element, expected) => {
    mount(screenName, element);
    await waitFor(() => expect(calls.some(call => call.url.pathname.endsWith(expected))).toBe(true), { timeout: 5000 });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call.url.searchParams.get("workspace_id"), call.url.pathname).toBe(WS);
    for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href^='/research/quantbt']")) expect(new URL(link.href).searchParams.get("workspace_id")).toBe(WS);
  });
  it("workspace change aborts prior Evidence request and cannot publish its late response", async () => {
    let deliver: ((value: Response) => void) | undefined, oldSignal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://local"); calls.push({ url, init });
      if (url.pathname.endsWith("/evidence") && !url.pathname.includes("current-source") && url.searchParams.get("workspace_id") === WS) {
        oldSignal = init?.signal;
        return new Promise<Response>(resolve => { deliver = resolve; });
      }
      if (url.searchParams.get("workspace_id") === OTHER) return json({ error: { code: "RESEARCH_RUN_NOT_FOUND", message: "Not available" } }, 404);
      const body = response(url.pathname); return body === null ? json({}, 404) : json(body);
    });
    const view = mount("evidence", <EvidenceFlowRoute />);
    await waitFor(() => expect(deliver).toBeDefined());
    fireEvent.click(screen.getByText("Change workspace"));
    await waitFor(() => expect(oldSignal?.aborted).toBe(true));
    await act(async () => { deliver!(json(w3b.hub_evidence)); });
    expect(view.container.querySelector("[data-hub-revision]")).toBeNull();
    for (const call of calls.filter(call => call.url.searchParams.get("workspace_id") === OTHER)) expect(new Headers(call.init?.headers).has("If-None-Match")).toBe(false);
  });
  it("Library filter rewrites, clear and outgoing links retain workspace", async () => {
    function LibraryFilterProbe() { const library = useRunLibrary(WS); return <><button onClick={() => library.setFilters({ ...library.filters, q: "alpha" })}>Filter</button><button onClick={() => library.setFilters({ ...library.filters, q: "" })}>Clear</button></>; }
    render(<MemoryRouter initialEntries={[`/research/quantbt/runs?workspace_id=${WS}`]}><Navigator /><LibraryFilterProbe /><RunLibraryRoute /></MemoryRouter>);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("Filter"));
    await waitFor(() => expect(document.querySelector("[data-address]")?.textContent).toContain(`workspace_id=${WS}`));
    expect(document.querySelector("[data-address]")?.textContent).toContain("q=alpha");
    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() => expect(document.querySelector("[data-address]")?.textContent).toBe(`?workspace_id=${WS}`));
    for (const call of calls) expect(call.url.searchParams.get("workspace_id")).toBe(WS);
    for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href^='/research/quantbt']")) expect(new URL(link.href).searchParams.get("workspace_id")).toBe(WS);
  });
  it("New Run foundation, registry, catalog, clone and start-over share one workspace", async () => {
    render(<MemoryRouter initialEntries={[`/research/quantbt/runs/new?workspace_id=${WS}&from=${RUN}`]}><Navigator /><NewRunRoute /></MemoryRouter>);
    await waitFor(() => expect(calls.some(call => call.url.pathname.endsWith("/requested-spec"))).toBe(true));
    for (const call of calls.filter(call => (call.init?.method ?? "GET") === "GET")) expect(call.url.searchParams.get("workspace_id"), call.url.pathname).toBe(WS);
    const start = document.querySelector<HTMLButtonElement>("[data-action='start-over']");
    expect(start).not.toBeNull(); fireEvent.click(start!);
    await waitFor(() => expect(document.querySelector("[data-address]")?.textContent).toBe(`?workspace_id=${WS}`));
  });
  it("S01 P22 publication lookup carries the Library workspace, including late reads", async () => {
    const rc = fx("research-release-candidate.consumer.fixtures.json").seal;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://local"); calls.push({ url, init });
      if (url.pathname.endsWith("/runs")) return json(libraryPage([{ ...libraryRow("COMPLETED", { runId: RUN }), rc: { kind: "LOCAL_SEAL", release_candidate_id: rc.release_candidate_id, draft_id: null, sealed_at_utc_ms: rc.sealed_at_utc_ms, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" } }]));
      return json({ error: { code: "RESEARCH_NOT_PUBLISHED", message: "Not published" } }, 404);
    });
    render(<MemoryRouter initialEntries={[`/research/quantbt/runs?workspace_id=${WS}`]}><RunLibraryRoute /></MemoryRouter>);
    await waitFor(() => expect(calls.some(call => call.url.pathname.endsWith("/publication"))).toBe(true));
    for (const call of calls) expect(call.url.searchParams.get("workspace_id"), call.url.pathname).toBe(WS);
  });
  it("S02 bound version publication lookup carries the producer workspace", async () => {
    const entry = fx("research-alpha-import.registry.valid.json").entries[0];
    render(<MemoryRouter initialEntries={[`/research/quantbt/runs/new?workspace_id=${WS}&alpha=${entry.alpha_id}&av=${entry.alpha_version_id}`]}><NewRunRoute /></MemoryRouter>);
    await waitFor(() => expect(calls.some(call => call.url.pathname.endsWith("/publication"))).toBe(true));
    for (const call of calls.filter(call => call.url.pathname.endsWith("/publication"))) expect(call.url.searchParams.get("workspace_id")).toBe(WS);
  });
});
