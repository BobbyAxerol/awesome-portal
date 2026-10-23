/**
 * Operations V2 URL state (M3), V1 hand-off params (M11/#6) and target links
 * (#5): the window and the filters survive a refresh, a pasted link and Back;
 * `?operation=` is consumed once; `?filter=` is answered, not applied; a target
 * with a page is a link that keeps the context and does not also open the row.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import {
  operationalQueueSearch, readIncidentRootV2, readOperationalQueueV2,
  type OperationalQueueQueryV2, type OperationalQueueReadV2,
} from "../../readers/operationalQueue";
import OperationsV2 from "./index";
import { DEFAULT_RANGE, NO_FILTERS, invalidNotice, legacyFilterNotice, readOpsUrl, writeOpsUrl } from "./opsUrl";
import { TargetLink } from "./TargetLink";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-08-22T13:00:00Z");

function fromDouble(query: OperationalQueueQueryV2): Result<OperationalQueueReadV2> {
  const answer = answerOperationsV2("GET", "/operations", operationalQueueSearch(query));
  if (answer === null || answer.status !== 200) return { ok: false, status: "unavailable", reason: "refused" };
  const read = readOperationalQueueV2(answer.body);
  return read === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value: read };
}

function fakeApi() {
  const calls: OperationalQueueQueryV2[] = [];
  const api = {
    listOperationalQueueV2: vi.fn(async (query: OperationalQueueQueryV2) => {
      calls.push(query);
      return fromDouble(query);
    }),
    getIncidentRootV2: vi.fn(async (id: string) => {
      const answer = answerOperationsV2("GET", `/operations/incidents/${encodeURIComponent(id)}`, new URLSearchParams());
      const read = answer === null ? null : readIncidentRootV2(answer.body);
      return read === null ? { ok: false as const, status: "unavailable" as const, reason: "unreadable" } : { ok: true as const, value: read };
    }),
  } as unknown as ExecutionApi;
  return { api, calls };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

/** A router with a page behind the queue, so Back has somewhere to go and a replace is visible. */
function mountRouted(entry: string, props: Partial<React.ComponentProps<typeof OperationsV2>> = {}) {
  const { api, calls } = fakeApi();
  const router = createMemoryRouter(
    [{ path: "*", element: <><OperationsV2 api={api} now={NOW} {...props} /><Where /></> }],
    { initialEntries: ["/prev", entry], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return { router, calls, api };
}

const where = () => screen.getByTestId("where").textContent ?? "";
const params = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.findByRole("table", { name: "Commands" });
const last = <T,>(items: readonly T[]): T => items[items.length - 1]!;

describe("readOpsUrl / writeOpsUrl", () => {
  it("reads the defaults from an empty query and writes nothing back", () => {
    const read = readOpsUrl(new URLSearchParams());
    expect(read.range).toBe(DEFAULT_RANGE);
    expect(read.filters).toEqual(NO_FILTERS);
    expect(read.invalid).toEqual([]);
    expect(read.legacyFilter).toBeNull();
    expect(writeOpsUrl(new URLSearchParams("env=paper"), { filters: NO_FILTERS, range: "24H" }).toString()).toBe("env=paper");
  });

  it("reads any case, writes lower case, and keeps every other param", () => {
    const read = readOpsUrl(new URLSearchParams("range=7D&lens=ALL&state=Resolved&severity=critical&verification=failed&target=portfolio&environment=PAPER&q=account%2Fsync"));
    expect(read.range).toBe("7D");
    expect(read.filters).toEqual({
      lens: "all", triage: "RESOLVED", severity: "CRITICAL", verification: "FAILED", targetType: "PORTFOLIO", env: "paper", commandKey: "account/sync",
    });
    expect(read.invalid).toEqual([]);
    const written = writeOpsUrl(new URLSearchParams("workspace_id=ws_1&sel=op_1"), { filters: read.filters, range: read.range });
    expect(Object.fromEntries(written)).toEqual({
      workspace_id: "ws_1", sel: "op_1", range: "7d", lens: "all", state: "resolved", severity: "critical", verification: "failed",
      target: "portfolio", environment: "paper", q: "account/sync",
    });
  });

  it("reads a value it does not know as the default and lists the key", () => {
    const read = readOpsUrl(new URLSearchParams("range=2y&severity=loud&target=system&q=" + "x".repeat(201)));
    expect(read.range).toBe("24H");
    expect(read.filters.severity).toBe("");
    expect(read.filters.targetType).toBe("");
    expect(read.filters.commandKey).toBe("");
    expect(read.invalid).toEqual(["range", "severity", "target", "q"]);
  });

  it("reports V1's filter without applying it", () => {
    const read = readOpsUrl(new URLSearchParams("filter=findings"));
    expect(read.legacyFilter).toBe("findings");
    expect(read.filters).toEqual(NO_FILTERS);
    expect(legacyFilterNotice("findings")).toContain("no such filter");
    expect(invalidNotice(["severity"])).toContain("severity");
  });
});

describe("window and filters in the URL (M3)", () => {
  it("a window click is written with replace, so Back leaves the screen and not the previous window", async () => {
    const { router } = mountRouted("/execution/operations?workspace_id=ws_1");
    await table();
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    await waitFor(() => expect(params().get("range")).toBe("7d"));
    expect(params().get("workspace_id")).toBe("ws_1");
    expect(router.state.historyAction).toBe("REPLACE");
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(where()).toBe("/prev"));
  });

  it("the default window and the default lens are not written", async () => {
    mountRouted("/execution/operations?range=7d&lens=all");
    await table();
    expect(screen.getByRole("button", { name: "7D" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "24H" }));
    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    await waitFor(() => expect(where()).toBe("/execution/operations"));
  });

  it("a pasted link restores the window, the lens, the filters and the search, and asks the server for them", async () => {
    const { calls } = mountRouted("/execution/operations?range=30d&lens=all&severity=critical&verification=uncertain&target=portfolio&environment=live&q=portfolio%2Fadjust-target-budget");
    await table();
    expect(screen.getByRole("button", { name: "30D" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("group", { name: "Lens" })).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Severity") as HTMLSelectElement).value).toBe("CRITICAL");
    expect((screen.getByLabelText("Verification") as HTMLSelectElement).value).toBe("UNCERTAIN");
    expect((screen.getByLabelText("Target type") as HTMLSelectElement).value).toBe("PORTFOLIO");
    expect((screen.getByLabelText("Environment") as HTMLSelectElement).value).toBe("live");
    expect((screen.getByLabelText("Command key") as HTMLInputElement).value).toBe("portfolio/adjust-target-budget");
    expect(last(calls)).toMatchObject({
      severity: "CRITICAL", verificationResult: "UNCERTAIN", targetType: "PORTFOLIO", environment: "live", commandKey: "portfolio/adjust-target-budget",
    });
    expect(last(calls).triageState).toBeUndefined();
  });

  it("a filter change is a replace; Back after it still leaves the screen", async () => {
    const { router, calls } = mountRouted("/execution/operations");
    await table();
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "ERROR" } });
    await waitFor(() => expect(params().get("severity")).toBe("error"));
    await waitFor(() => expect(last(calls).severity).toBe("ERROR"));
    expect(router.state.historyAction).toBe("REPLACE");
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "" } });
    await waitFor(() => expect(params().has("severity")).toBe(false));
  });

  it("the triage filter writes the lens it implies, and the search box writes q on submit", async () => {
    mountRouted("/execution/operations");
    await table();
    fireEvent.change(screen.getByLabelText("Triage"), { target: { value: "RESOLVED" } });
    await waitFor(() => expect(params().get("state")).toBe("resolved"));
    expect(params().get("lens")).toBe("all");
    fireEvent.change(screen.getByLabelText("Command key"), { target: { value: " account/sync " } });
    expect(params().has("q")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(params().get("q")).toBe("account/sync"));
  });

  it("a value that is not valid is dropped from the URL and said, and the query is the default", async () => {
    const { calls } = mountRouted("/execution/operations?severity=loud&range=2y&env=paper");
    await table();
    await waitFor(() => expect(params().has("severity")).toBe(false));
    expect(params().has("range")).toBe(false);
    expect(params().get("env")).toBe("paper");
    expect(screen.getByText(/Ignored unknown values for range, severity in the link/)).toBeTruthy();
    expect(calls.every((q) => q.severity === undefined)).toBe(true);
  });

  it("the filters ride along when the incident drawer closes", async () => {
    const { router } = mountRouted("/execution/operations/incidents/inc_TEST_ONLY_operational?severity=error&workspace_id=ws_1", { incidentId: "inc_TEST_ONLY_operational" });
    const drawer = await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_operational" });
    fireEvent.click(within(drawer).getByText("Close"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/execution/operations"));
    expect(new URLSearchParams(router.state.location.search).get("severity")).toBe("error");
  });
});

describe("?operation= (M3)", () => {
  it("selects the operation as sel with replace, removes operation from the URL, and Back leaves the screen", async () => {
    const { router } = mountRouted("/execution/operations?operation=op_TEST_ONLY_s01&workspace_id=ws_1&lens=all");
    expect(await screen.findByRole("complementary", { name: "Portfolio pf_TEST_ONLY_canary" })).toBeTruthy();
    await waitFor(() => expect(params().get("sel")).toBe("op_TEST_ONLY_s01"));
    expect(params().has("operation")).toBe(false);
    expect(params().get("workspace_id")).toBe("ws_1");
    expect(router.state.historyAction).toBe("REPLACE");
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(where()).toBe("/prev"));
  });

  it("is not forced again after the reader closes the dock", async () => {
    mountRouted("/execution/operations?operation=op_TEST_ONLY_s01");
    const dock = await screen.findByRole("complementary", { name: "Portfolio pf_TEST_ONLY_canary" });
    fireEvent.click(within(dock).getByText("Close"));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    expect(params().has("sel")).toBe(false);
    expect(params().has("operation")).toBe(false);
  });

  it("a sel already in the URL wins, and operation is still removed", async () => {
    mountRouted("/execution/operations?operation=op_TEST_ONLY_s01&sel=op_TEST_ONLY_s02&lens=all");
    expect(await screen.findByRole("complementary", { name: "Portfolio pf_TEST_ONLY_satellite" })).toBeTruthy();
    await waitFor(() => expect(params().has("operation")).toBe(false));
    expect(params().get("sel")).toBe("op_TEST_ONLY_s02");
  });

  it("an operation that is not on a loaded page says so, and does not invent a row", async () => {
    mountRouted("/execution/operations?operation=op_missing");
    expect(await screen.findByText("Not in the loaded rows")).toBeTruthy();
    expect(params().get("sel")).toBe("op_missing");
  });

  it("the prop the route passes is consumed once, without a param in the URL", async () => {
    mountRouted("/execution/operations", { requestedOperation: "op_TEST_ONLY_s01" });
    expect(await screen.findByRole("complementary", { name: "Portfolio pf_TEST_ONLY_canary" })).toBeTruthy();
    expect(params().get("sel")).toBe("op_TEST_ONLY_s01");
  });
});

describe("V1 hand-off params (M11, #6)", () => {
  it.each(["findings", "broker_sync"])("?filter=%s says the queue has no such filter, drops the param and narrows nothing", async (value) => {
    const { calls } = mountRouted(`/execution/operations?filter=${value}&workspace_id=ws_1`);
    await table();
    expect(await screen.findByText(`This link asked for the “${value}” filter. The operations queue has no such filter, so the list is not narrowed by it.`)).toBeTruthy();
    await waitFor(() => expect(params().has("filter")).toBe(false));
    expect(params().get("workspace_id")).toBe("ws_1");
    expect(calls.every((q) => q.triageState === "UNACKNOWLEDGED" && q.severity === undefined && q.commandKey === undefined)).toBe(true);
  });

  it("the notice goes away once the reader changes a filter", async () => {
    mountRouted("/execution/operations?filter=findings");
    await screen.findByText(/This link asked for the “findings” filter/);
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "ERROR" } });
    await waitFor(() => expect(screen.queryByText(/This link asked for/)).toBeNull());
  });
});

describe("targets are links (#5)", () => {
  function mountPlain(entry = "/execution/operations?workspace_id=ws_1&env=paper&lens=all") {
    const { api } = fakeApi();
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/execution/operations" element={<OperationsV2 api={api} now={NOW} />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
  }

  it("the table links Portfolio, Account and Deployment to their pages with the context kept", async () => {
    mountPlain();
    const t = await table();
    // Two operations may name the same account; every link to it goes to the same page.
    const hrefOf = (name: RegExp) => [...new Set(within(t).getAllByRole("link", { name }).map((a) => a.getAttribute("href")))].join("|");
    expect(hrefOf(/^Portfolio pf_TEST_ONLY_canary$/)).toBe("/deployments/portfolios/pf_TEST_ONLY_canary?env=paper&workspace_id=ws_1");
    expect(hrefOf(/^Account acc_TEST_ONLY_binance02$/)).toBe("/deployments/accounts/acc_TEST_ONLY_binance02?env=paper&workspace_id=ws_1");
    expect(hrefOf(/^Deployment dep_TEST_ONLY_btc$/)).toBe("/deployments/sandbox/dep_TEST_ONLY_btc?env=paper&workspace_id=ws_1");
    expect(hrefOf(/^Deployment dep_TEST_ONLY_eth$/)).toBe("/deployments/paper/dep_TEST_ONLY_eth?env=paper&workspace_id=ws_1");
  });

  it("clicking a target goes there and does not also open the operation; Enter on it does not either", async () => {
    mountPlain();
    const t = await table();
    const link = within(t).getByRole("link", { name: /^Portfolio pf_TEST_ONLY_canary$/ });
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.keyDown(link, { key: " " });
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(link);
    expect(where()).toBe("/deployments/portfolios/pf_TEST_ONLY_canary?env=paper&workspace_id=ws_1");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("the operation dock links its target too", async () => {
    mountPlain("/execution/operations?workspace_id=ws_1&sel=op_TEST_ONLY_s04&lens=all");
    const dock = await screen.findByRole("complementary", { name: "Deployment dep_TEST_ONLY_btc" });
    const link = within(dock).getByRole("link", { name: "Deployment dep_TEST_ONLY_btc" });
    expect(link.getAttribute("href")).toBe("/deployments/sandbox/dep_TEST_ONLY_btc?workspace_id=ws_1");
  });

  it("the incident drawer links its target in the subtitle and in the facts", async () => {
    const { api } = fakeApi();
    render(
      <MemoryRouter initialEntries={["/execution/operations/incidents/inc_TEST_ONLY_operational?workspace_id=ws_1"]}>
        <OperationsV2 api={api} now={NOW} incidentId="inc_TEST_ONLY_operational" />
      </MemoryRouter>,
    );
    const drawer = await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_operational" });
    const links = within(drawer).getAllByRole("link").filter((a) => /^(Account|Portfolio|Deployment) /.test(a.textContent ?? ""));
    expect(links).toHaveLength(2);
    for (const a of links) expect(a.getAttribute("href")).toMatch(/^\/deployments\/(accounts|portfolios|paper|sandbox|live)\/[^?]+\?workspace_id=ws_1$/);
  });

  it("a deployment whose environment has no route stays plain text, with no link to a page that does not resolve", () => {
    render(
      <MemoryRouter>
        <TargetLink type="DEPLOYMENT" id="dep_x" environment="" />
        <TargetLink type="ACCOUNT" id="acc_y" environment="" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Deployment dep_x").tagName).toBe("SPAN");
    expect(screen.getByRole("link", { name: "Account acc_y" }).getAttribute("href")).toBe("/deployments/accounts/acc_y");
    expect(screen.queryByRole("link", { name: /dep_x/ })).toBeNull();
  });

  it("encodes an id that is not URL-safe", () => {
    render(
      <MemoryRouter>
        <TargetLink type="ACCOUNT" id="acc/1 2" environment="live" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Account acc/1 2" }).getAttribute("href")).toBe("/deployments/accounts/acc%2F1%202");
  });

  it("stops Enter and Space (they would also open the row) but lets Escape and Tab reach the drawer (F-1)", () => {
    const seen: string[] = [];
    render(
      <MemoryRouter>
        <div onKeyDown={(event) => seen.push(event.key)}>
          <TargetLink type="ACCOUNT" id="acc_y" environment="live" />
        </div>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Account acc_y" });
    for (const key of ["Enter", " ", "Escape", "Tab", "ArrowDown"]) fireEvent.keyDown(link, { key });
    expect(seen).toEqual(["Escape", "Tab", "ArrowDown"]);
  });
});

describe("denied reads link to My access (D9)", () => {
  const denied = (over: Partial<ExecutionApi> = {}) => ({
    listOperationalQueueV2: vi.fn(async () => ({ ok: false as const, status: "denied" as const, reason: "OPERATIONAL_READ_DENIED" })),
    getIncidentRootV2: vi.fn(async () => ({ ok: false as const, status: "denied" as const, reason: "INCIDENT_READ_DENIED" })),
    ...over,
  }) as unknown as ExecutionApi;

  it("a denied queue offers My access with the context kept, beside Try again", async () => {
    render(
      <MemoryRouter initialEntries={["/execution/operations?env=paper&workspace_id=ws_1"]}>
        <OperationsV2 api={denied()} now={NOW} />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: "See what you can access" });
    expect(link.getAttribute("href")).toBe("/administration/profile-access?env=paper&workspace_id=ws_1");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("the route may name another My access", async () => {
    render(
      <MemoryRouter initialEntries={["/execution/operations"]}>
        <OperationsV2 api={denied()} now={NOW} accessHref="/profile-access" />
      </MemoryRouter>,
    );
    expect((await screen.findByRole("link", { name: "See what you can access" })).getAttribute("href")).toBe("/profile-access");
  });

  it("an unavailable queue offers Try again and no access link", async () => {
    const down = { listOperationalQueueV2: vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "PORTAL_READ_FAILED" })) } as unknown as ExecutionApi;
    render(
      <MemoryRouter initialEntries={["/execution/operations"]}>
        <OperationsV2 api={down} now={NOW} />
      </MemoryRouter>,
    );
    await screen.findByText(/PORTAL_READ_FAILED/);
    expect(screen.queryByRole("link", { name: "See what you can access" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("a denied incident links to My access inside the drawer, and the footer's blocked actions use the same route", async () => {
    const { api } = fakeApi();
    const port = { ...(api as object), getIncidentRootV2: vi.fn(async () => ({ ok: false as const, status: "denied" as const, reason: "INCIDENT_READ_DENIED" })) } as unknown as ExecutionApi;
    render(
      <MemoryRouter initialEntries={["/execution/operations/incidents/inc_x?workspace_id=ws_1"]}>
        <OperationsV2 api={port} now={NOW} incidentId="inc_x" accessHref="/profile-access" />
      </MemoryRouter>,
    );
    const drawer = await screen.findByRole("complementary", { name: "Incident" });
    const hrefs = within(drawer).getAllByRole("link", { name: /See what you can access|My access/ }).map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h!.startsWith("/profile-access"))).toBe(true);
    expect(hrefs).toContain("/profile-access?workspace_id=ws_1");
  });
});
