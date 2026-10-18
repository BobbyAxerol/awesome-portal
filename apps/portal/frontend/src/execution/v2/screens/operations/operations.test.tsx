/**
 * Operations queue V2: states, filters forwarded to the port, disabled
 * controls with their reasons, outcome tone, paging, the 24H window.
 *
 * Data is the contract fixture plus the e2e double's synthetic rows, read
 * through the real V2 reader, so the screen is tested against what the HTTP
 * client would hand it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import { operationalQueueSearch, readOperationalQueueV2, type OperationalQueueQueryV2, type OperationalQueueReadV2 } from "../../readers/operationalQueue";
import OperationsV2, { MINE_REASON, PAGE_LIMIT, queryFor, ROW_CAP, type OperationsV2Props } from "./index";
import { receiptOutcome, triageOutcome } from "./outcome";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** One hour after the newest fixed row, so the default 24H window holds all twelve. */
const NOW = new Date("2026-08-22T13:00:00Z");

function fromDouble(query: OperationalQueueQueryV2): Result<OperationalQueueReadV2> {
  const answer = answerOperationsV2("GET", "/operations", operationalQueueSearch(query));
  if (answer === null || answer.status !== 200) {
    const code = (answer?.body as { error?: { code?: string } } | undefined)?.error?.code ?? "UNKNOWN";
    return { ok: false, status: "unavailable", reason: `${code}: refused` };
  }
  const read = readOperationalQueueV2(answer.body);
  return read === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value: read };
}

interface Options {
  /** Overrides the page size the screen asked for, to make a second page exist. */
  limit?: number;
  queue?: (query: OperationalQueueQueryV2, call: number) => Result<OperationalQueueReadV2> | Promise<Result<OperationalQueueReadV2>>;
}

function fakeApi(options: Options = {}) {
  const calls: OperationalQueueQueryV2[] = [];
  const queue = vi.fn(async (query: OperationalQueueQueryV2) => {
    calls.push(query);
    if (options.queue) return options.queue(query, calls.length);
    return fromDouble({ ...query, limit: options.limit ?? query.limit });
  });
  const api = { listOperationalQueueV2: queue, getIncidentRootV2: vi.fn() } as unknown as ExecutionApi;
  return { api, calls, queue };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function mount(api: ExecutionApi, props: Partial<OperationsV2Props> = {}, entry = "/execution/operations") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <OperationsV2 api={api} now={NOW} {...props} />
      <Where />
    </MemoryRouter>,
  );
}

const table = () => screen.findByRole("table", { name: "Commands" });
const flags = (root: HTMLElement) => [...root.querySelectorAll(".exec-flag")].map((el) => ({ kind: el.getAttribute("data-k"), text: el.textContent ?? "" }));

describe("loaded queue", () => {
  it("shows only published counts in the strip and the foot", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    const kpis = document.querySelector(".exec-ops-kpis") as HTMLElement;
    expect(within(kpis).getByText("In scope").nextElementSibling?.textContent).toBe("12");
    expect(within(kpis).getByText("Matching").nextElementSibling?.textContent).toBe("8");
    expect(within(kpis).getByText("Loaded").nextElementSibling?.textContent).toBe("8");
    expect(within(kpis).getByText("Read").nextElementSibling?.textContent).toBe("Available");
    expect(screen.getByText(/8 of 8 matching · 12 in scope/)).toBeTruthy();
    expect(screen.getByText("End of the list.")).toBeTruthy();
  });

  it("defaults to the Needs attention lens: triage_state=UNACKNOWLEDGED, the page limit, no assigned_to", async () => {
    const { api, calls } = fakeApi();
    mount(api, { workspaceId: "ws_1" });
    await table();
    expect(calls[0]).toMatchObject({ workspaceId: "ws_1", triageState: "UNACKNOWLEDGED", limit: PAGE_LIMIT });
    expect(Object.keys(calls[0])).not.toContain("assignedTo");
    expect(screen.getByRole("button", { name: "Needs attention" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders Time, Target and operation, Receipt and Next from published fields", async () => {
    const { api } = fakeApi();
    mount(api);
    const t = await table();
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Time", "Target and operation", "Receipt", "Next"]);
    const row = within(t).getByText(/Account acc_TEST_ONLY_operational/).closest("tr") as HTMLElement;
    expect(within(row).getByText("22 Aug 12:00Z")).toBeTruthy();
    expect(within(row).getByText(/account\/sync · Paper · Warning/)).toBeTruthy();
    expect(within(row).getByText("Blocked, not sent")).toBeTruthy();
    expect(within(row).getByText("Unacknowledged")).toBeTruthy();
  });

  it("prints no dash, no N/A, and says Not published with the request ids", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toContain("N/A");
    expect(text).toContain("Not published (FE-020)");
    expect(text).toContain("Not published (FE-032)");
    fireEvent.click(screen.getByRole("tab", { name: "Audit" }));
    expect(document.body.textContent).toContain("Not published (FE-021)");
    fireEvent.click(screen.getByRole("tab", { name: "Exceptions" }));
    expect(document.body.textContent).toContain("Not published (FE-031)");
  });

  it("source health is a Not published panel with the integration state", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    expect(document.querySelector("details")?.textContent).toContain("Not published (FE-021)");
    expect(document.querySelector("details")?.textContent).toContain("unavailable");
  });
});

describe("Mine, Acknowledge, Resolve are disabled with a reason", () => {
  it("disables Mine and points at the reason", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    const mine = screen.getByRole("button", { name: "Mine" }) as HTMLButtonElement;
    expect(mine.disabled).toBe(true);
    const reason = document.getElementById(mine.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toContain(MINE_REASON);
    expect(MINE_REASON).toContain("Not published (FE-030)");
  });

  it("opening a row shows the fields and disabled Acknowledge and Resolve with reasons", async () => {
    const { api } = fakeApi();
    mount(api);
    const t = await table();
    fireEvent.click(within(t).getByText(/Account acc_TEST_ONLY_operational/));
    const dock = await screen.findByRole("complementary", { name: "account/sync" });
    expect(screen.getByTestId("where").textContent).toContain("sel=op_01K3COMMANDPLAN000000000000");
    expect(within(dock).getByText("op_01K3COMMANDPLAN000000000000")).toBeTruthy();
    expect(within(dock).getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(within(dock).getByText("Not started")).toBeTruthy();
    for (const label of ["Acknowledge", "Resolve"]) {
      const button = within(dock).getByRole("button", { name: label }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      const why = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(why?.textContent).toMatch(/^Not published \(FE-015\)/);
    }
    expect(dock.textContent).toContain("Not published (FE-020)");
    expect(dock.textContent?.match(/Not published \(FE-032\)/g)).toHaveLength(2);
    expect(dock.textContent).toContain("Not published (FE-021)");
    expect(dock.textContent).not.toMatch(/[—–]/);
    fireEvent.click(within(dock).getByText("Close"));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByTestId("where").textContent).not.toContain("sel=");
  });

  it("in overlay mode the dock is a modal dialog", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
    }));
    const { api } = fakeApi();
    mount(api);
    const t = await table();
    fireEvent.click(within(t).getByText(/Account acc_TEST_ONLY_operational/));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("a link that names an operation opens it; one that is not loaded says so", async () => {
    const { api } = fakeApi();
    mount(api, { requestedOperation: "op_TEST_ONLY_s01" });
    expect(await screen.findByRole("complementary", { name: "portfolio/adjust-target-budget" })).toBeTruthy();
    cleanup();
    mount(fakeApi().api, { requestedOperation: "op_missing" });
    expect(await screen.findByText("Not in the loaded rows")).toBeTruthy();
  });
});

describe("unknown outcome is never success", () => {
  it("tones an UNCERTAIN source or verification as unknown, whatever sits beside it", () => {
    expect(receiptOutcome("UNCERTAIN", "NOT_STARTED").kind).toBe("unknown");
    expect(receiptOutcome("SUCCEEDED", "UNCERTAIN").kind).toBe("unknown");
    expect(receiptOutcome("FAILED", "UNCERTAIN").kind).toBe("unknown");
    expect(receiptOutcome("UNCERTAIN", "SUCCEEDED")).toMatchObject({ kind: "unknown", checkOriginal: true });
  });

  it("only a success that verification also confirmed is ok", () => {
    const sources = ["BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN"] as const;
    const verifications = ["NOT_STARTED", "PENDING", "SUCCEEDED", "FAILED", "PARTIAL", "UNCERTAIN", "DENIED", "EXPIRED"] as const;
    for (const s of sources) {
      for (const v of verifications) {
        const ok = receiptOutcome(s, v).kind === "ok";
        expect(ok, `${s}/${v}`).toBe(s === "SUCCEEDED" && v === "SUCCEEDED");
      }
    }
  });

  it("an unverified success is pending, and a resolved triage is never green", () => {
    expect(receiptOutcome("SUCCEEDED", "NOT_STARTED").kind).toBe("pending");
    expect(receiptOutcome("SUCCEEDED", "PENDING").kind).toBe("pending");
    expect(triageOutcome("RESOLVED").kind).toBe("neutral");
    expect(triageOutcome("UNACKNOWLEDGED").kind).toBe("attention");
  });

  it("renders the unknown row with the unknown flag and the check-original guidance", async () => {
    const { api } = fakeApi();
    mount(api);
    const t = await table();
    const row = within(t).getByText(/Portfolio pf_TEST_ONLY_canary/).closest("tr") as HTMLElement;
    expect(flags(row)).toContainEqual({ kind: "unknown", text: expect.stringContaining("Unknown outcome") });
    expect(flags(row).some((f) => f.kind === "ok")).toBe(false);
    expect(within(row).getByText("Check the original request")).toBeTruthy();
    fireEvent.click(within(row).getByText(/Portfolio pf_TEST_ONLY_canary/));
    const dock = await screen.findByRole("complementary");
    expect(within(dock).getByText("Outcome unknown. Check the original request. Do not send it again.")).toBeTruthy();
  });

  it("no verified flag appears on a row whose success is unverified", async () => {
    const { api } = fakeApi();
    mount(api);
    const t = await table();
    const row = within(t).getByText("Succeeded, not verified").closest("tr") as HTMLElement;
    expect(row.textContent).toContain("acc_TEST_ONLY_binance01");
    expect(flags(row)[0]).toEqual({ kind: "pending", text: expect.stringContaining("Succeeded, not verified") });
  });
});

describe("filters are forwarded to the read", () => {
  it("severity, verification, target type, environment and triage reach the port; the cursor is dropped", async () => {
    const { api, calls } = fakeApi();
    mount(api);
    await table();
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "ERROR" } });
    await waitFor(() => expect(calls.at(-1)?.severity).toBe("ERROR"));
    fireEvent.change(screen.getByLabelText("Verification"), { target: { value: "FAILED" } });
    await waitFor(() => expect(calls.at(-1)?.verificationResult).toBe("FAILED"));
    fireEvent.change(screen.getByLabelText("Target type"), { target: { value: "PORTFOLIO" } });
    await waitFor(() => expect(calls.at(-1)?.targetType).toBe("PORTFOLIO"));
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "live" } });
    await waitFor(() => expect(calls.at(-1)?.environment).toBe("live"));
    fireEvent.change(screen.getByLabelText("Triage"), { target: { value: "ACKNOWLEDGED" } });
    await waitFor(() => expect(calls.at(-1)?.triageState).toBe("ACKNOWLEDGED"));
    expect(calls.at(-1)).toMatchObject({
      severity: "ERROR", verificationResult: "FAILED", targetType: "PORTFOLIO", environment: "live", triageState: "ACKNOWLEDGED",
    });
    expect(calls.at(-1)?.after).toBeUndefined();
    // Choosing a triage state leaves the lens on neither segment.
    expect(screen.getByRole("button", { name: "Needs attention" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("command key is applied on submit, not per keystroke", async () => {
    const { api, calls, queue } = fakeApi();
    mount(api);
    await table();
    const before = queue.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Command key"), { target: { value: "account/sync" } });
    expect(queue.mock.calls.length).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(calls.at(-1)?.commandKey).toBe("account/sync"));
  });

  it("the All lens drops the triage filter", async () => {
    const { api, calls } = fakeApi();
    mount(api);
    await table();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(calls.at(-1)?.triageState).toBeUndefined());
    expect(await screen.findByText(/12 of 12 matching/)).toBeTruthy();
  });

  it("queryFor is the whole mapping", () => {
    expect(queryFor({ lens: "attention", triage: "", severity: "", verification: "", targetType: "", env: "", commandKey: "" }))
      .toMatchObject({ triageState: "UNACKNOWLEDGED" });
    expect(queryFor({ lens: "all", triage: "RESOLVED", severity: "INFO", verification: "", targetType: "", env: "paper", commandKey: "x" }))
      .toMatchObject({ triageState: "RESOLVED", severity: "INFO", environment: "paper", commandKey: "x" });
  });
});

describe("keyset paging", () => {
  it("loads the next page with the server cursor and shows N of total", async () => {
    const { api, calls } = fakeApi({ limit: 5 });
    mount(api);
    const t = await table();
    expect(within(t).getAllByRole("row")).toHaveLength(1 + 5);
    expect(screen.getByText(/5 of 8 matching · 12 in scope/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText(/8 of 8 matching · 12 in scope/)).toBeTruthy());
    expect(calls[1].after).toBeTruthy();
    expect(within(await table()).getAllByRole("row")).toHaveLength(1 + 8);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("End of the list.")).toBeTruthy();
  });

  it("a cursor the server voided reloads from the first page and says so", async () => {
    const { api, calls } = fakeApi({
      limit: 5,
      queue: (query, call) => (call === 2
        ? { ok: false, status: "unavailable", reason: "OPERATIONAL_READ_CHANGED: The read changed" }
        : fromDouble({ ...query, limit: 5 })),
    });
    mount(api);
    await table();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText(/reloaded from the first page/)).toBeTruthy();
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].after).toBeUndefined();
  });

  it("a failed next page keeps the rows and says what failed", async () => {
    const { api } = fakeApi({
      limit: 5,
      queue: (query, call) => (call === 2
        ? { ok: false, status: "unavailable", reason: "OPERATIONAL_READ_UNAVAILABLE: later" }
        : fromDouble({ ...query, limit: 5 })),
    });
    mount(api);
    const t = await table();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toContain("OPERATIONAL_READ_UNAVAILABLE");
    expect(within(t).getAllByRole("row")).toHaveLength(1 + 5);
  });

  it("stops at the DOM budget and tells the reader to narrow the filters", async () => {
    const row = (n: number) => {
      const base = answerOperationsV2("GET", "/operations", new URLSearchParams("limit=1"))?.body as { page: { rows: Record<string, unknown>[] } };
      return { ...base.page.rows[0], operation_id: `op_bulk_${String(n).padStart(4, "0")}` };
    };
    const body = (answerOperationsV2("GET", "/operations", new URLSearchParams("limit=1"))?.body) as Record<string, any>;
    const page = Array.from({ length: ROW_CAP }, (_v, n) => row(n));
    const read = readOperationalQueueV2({
      ...body,
      page: { ...body.page, rows: page, total_count: 500, filtered_count: 500, has_more: true, next_cursor: "c" },
    });
    if (read === null) throw new Error("fixture");
    const { api } = fakeApi({ queue: () => ({ ok: true, value: read }) });
    mount(api);
    await table();
    const more = screen.getByRole("button", { name: "Load more" }) as HTMLButtonElement;
    expect(more.disabled).toBe(true);
    expect(document.getElementById(more.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Narrow the filters");
    expect(screen.getByText(/200 of 500 matching · 500 in scope/)).toBeTruthy();
  });
});

describe("local 24H window", () => {
  it("hides loaded rows older than the window and says how many", async () => {
    const { api } = fakeApi();
    mount(api, { now: new Date("2026-08-23T09:00:00Z") });
    const t = await table();
    expect(within(t).getByText(/Account acc_TEST_ONLY_operational/)).toBeTruthy();
    expect(within(t).queryByText(/Deployment dep_TEST_ONLY_eth/)).toBeNull();
    expect(screen.getByText("2 loaded older than 24H hidden.")).toBeTruthy();
  });

  it("widening the window shows them again; nothing is refetched", async () => {
    const { api, queue } = fakeApi();
    mount(api, { now: new Date("2026-08-30T00:00:00Z") });
    const t = await table();
    expect(within(t).getByText(/All 8 loaded rows are older than 24H/)).toBeTruthy();
    const calls = queue.mock.calls.length;
    const windowGroup = screen.getByRole("group", { name: "Window" });
    fireEvent.click(within(windowGroup).getByRole("button", { name: "30D" }));
    expect(within(await table()).getAllByRole("row").length).toBeGreaterThan(2);
    expect(queue.mock.calls.length).toBe(calls);
  });
});

describe("states", () => {
  it("loading, then the table", async () => {
    let release: (value: Result<OperationalQueueReadV2>) => void = () => undefined;
    const pending = new Promise<Result<OperationalQueueReadV2>>((resolve) => { release = resolve; });
    const { api } = fakeApi({ queue: () => pending });
    mount(api);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    await act(async () => { release(fromDouble({ limit: 50 })); });
    expect(await table()).toBeTruthy();
  });

  it("denied is Withheld with the server's code, and Try again reads again", async () => {
    const { api, queue } = fakeApi({ queue: () => ({ ok: false, status: "denied", reason: "OPERATIONAL_READ_AUTHORITY_REQUIRED: no" }) });
    mount(api);
    expect(await screen.findByText("Withheld")).toBeTruthy();
    expect(screen.getByText(/OPERATIONAL_READ_AUTHORITY_REQUIRED/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(queue.mock.calls.length).toBe(2));
  });

  it("unavailable is Unavailable, not an empty queue", async () => {
    const { api } = fakeApi({ queue: () => ({ ok: false, status: "unavailable", reason: "never arrived" }) });
    mount(api);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText(/Nothing matched/)).toBeNull();
  });

  it("another shape is refused with its schema_version, never rendered", async () => {
    const { api } = fakeApi({ queue: () => ({ ok: true, value: { kind: "unsupported_shape", schemaVersion: "execution.operations-queue.v1" } }) });
    mount(api);
    expect(await screen.findByText(/execution\.operations-queue\.v1/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("EMPTY read: the table says nothing matched and the counts stay the server's", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "CRITICAL" } });
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "sandbox" } });
    expect(await screen.findByText("Nothing matched these filters.")).toBeTruthy();
    expect(screen.getByText(/0 of 0 matching · 12 in scope/)).toBeTruthy();
    const kpis = document.querySelector(".exec-ops-kpis") as HTMLElement;
    expect(within(kpis).getByText("Read").nextElementSibling?.textContent).toBe("Empty");
  });

  it("a failed refresh keeps the last rows and marks them stale", async () => {
    const { api } = fakeApi({
      queue: (query, call) => (call === 1 ? fromDouble(query) : { ok: false, status: "unavailable", reason: "OPERATIONAL_READ_UNAVAILABLE: busy" }),
    });
    mount(api);
    const t = await table();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Stale: the refresh failed/)).toBeTruthy();
    expect(within(t).getAllByRole("row").length).toBeGreaterThan(1);
  });
});
