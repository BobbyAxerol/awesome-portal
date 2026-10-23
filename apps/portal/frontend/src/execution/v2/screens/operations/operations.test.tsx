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
import { sourceHealthSummary } from "./useSourceHealth";
import OperationsV2, { MINE_REASON, PAGE_LIMIT, queryFor, ROW_CAP, type OperationsV2Props } from "./index";
import { receiptOutcome, triageOutcome } from "./outcome";
import type { UtcEpochMs } from "../../../screenDataContract";
import { whyText } from "../../gapWhyTestUtil";

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
  /** Per-profile source health the `operations` composition answers with; absent = the port has no such read. */
  profiles?: readonly { profile: string; state: string | null; reasonCode: string | null }[] | "fails";
}

function fakeApi(options: Options = {}) {
  const calls: OperationalQueueQueryV2[] = [];
  const queue = vi.fn(async (query: OperationalQueueQueryV2) => {
    calls.push(query);
    if (options.queue) return options.queue(query, calls.length);
    return fromDouble({ ...query, limit: options.limit ?? query.limit });
  });
  const getOperationalComposition = vi.fn(async (name: string, query?: Record<string, string | number | undefined>) => {
    void name;
    void query;
    return options.profiles === "fails"
      ? { ok: false as const, status: "unavailable" as const, reason: "COMPOSITION_UNAVAILABLE" }
      : { ok: true as const, value: { sourceHealth: { profiles: options.profiles ?? [] } } };
  });
  const api = {
    listOperationalQueueV2: queue,
    getIncidentRootV2: vi.fn(),
    ...(options.profiles === undefined ? {} : { getOperationalComposition }),
  } as unknown as ExecutionApi;
  return { api, calls, queue, getOperationalComposition };
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
    const kpis = screen.getByRole("group", { name: "Queue counts" });
    expect(within(kpis).getByText("In scope").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("12");
    expect(within(kpis).getByText("Matching").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("8");
    expect(within(kpis).getByText("Loaded").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("8");
    expect(within(kpis).getByText("Read").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("Available");
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

  it("renders the six hi-fi columns: Time, Target and operation, Intent, Receipt, Display, Next; Intent and Display are Not available per row (OP-6)", async () => {
    const { api } = fakeApi();
    mount(api);
    const t = await table();
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Time", "Target and operation", "Intent", "Receipt", "Display", "Next"]);
    const row = within(t).getByText(/Account acc_TEST_ONLY_operational/).closest("tr") as HTMLElement;
    expect(within(row).getByText("22 Aug 12:00Z")).toBeTruthy();
    expect(within(row).getByText(/Sync · Paper · Warning/)).toBeTruthy();
    expect(within(row).getByText("Blocked, not sent")).toBeTruthy();
    // Next is an action, not a repeat of the lens: the default lens is all UNACKNOWLEDGED.
    expect(within(row).queryByText("Unacknowledged")).toBeNull();
    expect(within(row).getByRole("button", { name: "Review" })).toBeTruthy();
    // Intent and Display have no source yet: each cell says Not available and the request id is behind its disclosure.
    for (const [label, fe] of [["Intent", "FE-020"], ["Display", "FE-032"]] as const) {
      const cell = row.querySelector(`td[data-l='${label}']`);
      expect(cell?.textContent, label).toContain("Not available");
      expect(whyText(cell ?? null), label).toContain(`Not published (${fe})`);
    }
    // The queue no longer carries a one-line "Not available: Intent, Display" under its filters.
    expect(document.querySelector(".exec-ops-na-line")?.textContent ?? "").not.toContain("Intent");
  });

  it("prints no dash, no N/A, and says Not published with the request ids", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toContain("N/A");
    const reasons = [...document.querySelectorAll("td[data-l='Intent'], td[data-l='Display']")].map((cell) => whyText(cell)).join("\n");
    expect(reasons).toContain("Not published (FE-020)");
    expect(reasons).toContain("Not published (FE-032)");
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

describe("Source health summary (OP-7)", () => {
  const PROFILES = [
    { profile: "paper_binance_usdm", state: "AVAILABLE", reasonCode: null },
    { profile: "sandbox_binance_usdm", state: "PARTIAL", reasonCode: "SOURCE_PARTIAL" },
    { profile: "real_funded_binance_usdm", state: "PARTIAL", reasonCode: null },
  ] as const;

  it("prints the per-profile states the Overview prints, and counts the partial ones in the summary", async () => {
    const { api, getOperationalComposition } = fakeApi({ profiles: PROFILES });
    mount(api, { workspaceId: "ws_1" });
    await table();
    await waitFor(() => expect(document.querySelector("summary")?.textContent).toContain("2 of 3 partial"));
    expect(getOperationalComposition).toHaveBeenCalledWith("operations", { workspace_id: "ws_1" });
    const profiles = screen.getByRole("table", { name: "Source health by profile" });
    expect(within(profiles).getAllByRole("row").slice(1).map((r) => r.textContent)).toEqual([
      "Paper Binance USDM✓OK: Available",
      "Sandbox Binance USDM◐PartialSOURCE_PARTIAL",
      "Real-funded Binance USDM◐Partial",
    ]);
    // The journal sentence stays: it is about the journal, not the profiles.
    expect(document.querySelector("details")?.textContent).toContain("Not published (FE-021)");
  });

  it("counts only PARTIAL profiles as partial and names every other non-available state in its own words", async () => {
    const mixed = [
      { profile: "paper_binance_usdm", state: "AVAILABLE", reasonCode: null },
      { profile: "sandbox_binance_usdm", state: "PARTIAL", reasonCode: null },
      { profile: "real_funded_binance_usdm", state: "UNAVAILABLE", reasonCode: "SOURCE_DOWN" },
      { profile: "canary_binance_usdm", state: "UNAVAILABLE", reasonCode: null },
      { profile: "live_binance_usdm", state: null, reasonCode: null },
    ] as const;
    const { api } = fakeApi({ profiles: mixed });
    mount(api);
    await table();
    await waitFor(() => expect(document.querySelector("summary")?.textContent).toContain("1 of 5 partial · 2 unavailable · 1 state not stated"));
    // Not "4 of 5 partial": unavailable and unstated are not relabelled.
    expect(document.querySelector("summary")?.textContent).not.toContain("4 of 5 partial");
    const profiles = screen.getByRole("table", { name: "Source health by profile" });
    const rows = within(profiles).getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(rows[2]).toContain("Unavailable");
    expect(rows[2]).not.toContain("Partial");
    expect(rows[4]).toContain("State not stated");
  });

  it("sourceHealthSummary prints no extra clause when every non-available profile is partial", () => {
    expect(sourceHealthSummary([
      { profile: "a", state: "PARTIAL", reasonCode: null },
      { profile: "b", state: "AVAILABLE", reasonCode: null },
    ])).toBe("1 of 2 partial");
  });

  it("a failed or absent composition read says Not available in the summary, never a healthy profile", async () => {
    const failed = fakeApi({ profiles: "fails" });
    mount(failed.api);
    await table();
    await waitFor(() => expect(document.querySelector("summary")?.textContent).toContain("Not available"));
    expect(screen.queryByRole("table", { name: "Source health by profile" })).toBeNull();
    cleanup();
    const absent = fakeApi();
    mount(absent.api);
    await table();
    await waitFor(() => expect(document.querySelector("summary")?.textContent).toContain("Not available"));
  });
});

describe("a state word is not drawn as a number (OP-9)", () => {
  it("the Read cell holds its word in the body role, not the KPI numeral", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    const read = within(screen.getByRole("group", { name: "Queue counts" })).getByText("Read").nextElementSibling as HTMLElement;
    expect(read.querySelector(".exec-ops-kpi-word")?.textContent).toBe("Available");
    expect(read.querySelector(".exec-blk-num")).toBeNull();
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
    fireEvent.click(within(t).getByText(/Account acc_TEST_ONLY_operational/).closest("tr")!);
    const dock = await screen.findByRole("complementary", { name: "Sync" });
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
    const gaps = within(dock).getByTestId("not-available-line");
    expect(gaps.textContent).toContain("Not available: Amounts, Who acknowledged or resolved it");
    expect(whyText(gaps)).toContain("Amounts: Not published (FE-032)");
    expect(whyText(gaps)).toContain("Who acknowledged or resolved it: Not published (FE-021)");
    // Intent and Display are their own sections, each with its own typed reason (they are not one merged line any more).
    const intent = within(dock).getByRole("region", { name: "Intent" });
    expect(whyText(intent)).toContain("Not published (FE-020)");
    const display = within(dock).getByRole("region", { name: "Display" });
    expect(whyText(display)).toContain("Not published (FE-032)");
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
    fireEvent.click(within(t).getByText(/Account acc_TEST_ONLY_operational/).closest("tr")!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("a link that names an operation opens it; one that is not loaded says so", async () => {
    const { api } = fakeApi();
    mount(api, { requestedOperation: "op_TEST_ONLY_s01" });
    expect(await screen.findByRole("complementary", { name: "Adjust target budget" })).toBeTruthy();
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
    expect(within(row).queryByText("Unacknowledged")).toBeNull();
    // The one safe call to action for an unknown outcome is a control, and it opens the dock.
    fireEvent.click(within(row).getByRole("button", { name: "Check original request" }));
    const dock = await screen.findByRole("complementary");
    const sendAgain = within(dock).getByRole("button", { name: "Send again" }) as HTMLButtonElement;
    expect(sendAgain.disabled).toBe(true);
    expect(document.getElementById(sendAgain.getAttribute("aria-describedby")!)?.textContent).toBe("Blocked until the outcome is known.");
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
    expect(within(screen.getByRole("group", { name: "Lens" })).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
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
    fireEvent.click(within(screen.getByRole("group", { name: "Lens" })).getByRole("button", { name: "All" }));
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

/** The double's body with the instant the read was taken moved: a range counts back from the read, not from the reader's clock. */
const readAt = (iso: string) => (query: OperationalQueueQueryV2): Result<OperationalQueueReadV2> => {
  const result = fromDouble(query);
  if (!result.ok || result.value.kind !== "queue") return result;
  return { ok: true, value: { kind: "queue", queue: { ...result.value.queue, observedAtMs: Date.parse(iso) as UtcEpochMs } } };
};

describe("local 24H window", () => {
  it("hides loaded rows older than the window and says how many", async () => {
    const { api } = fakeApi({ queue: readAt("2026-08-23T09:00:00Z") });
    mount(api, { now: new Date("2026-08-23T09:00:00Z") });
    const t = await table();
    expect(within(t).getByText(/Account acc_TEST_ONLY_operational/)).toBeTruthy();
    expect(within(t).queryByText(/Deployment dep_TEST_ONLY_eth/)).toBeNull();
    expect(screen.getByText("2 loaded older than 24H hidden.")).toBeTruthy();
  });

  it("widening the window shows them again; nothing is refetched", async () => {
    const { api, queue } = fakeApi({ queue: readAt("2026-08-30T00:00:00Z") });
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

describe("the range counts back from the read (WP-B)", () => {
  it("a read taken weeks before the reader's clock still shows its own 24H, and says the read is old", async () => {
    const { api } = fakeApi();
    // The double's read was taken 22 Aug 13:00Z; the reader's clock is two months later (a fixture served unrebased, a late snapshot).
    mount(api, { now: new Date("2026-10-23T09:00:00Z") });
    const t = await table();
    expect(within(t).getByText(/Account acc_TEST_ONLY_operational/)).toBeTruthy();
    expect(within(t).queryByText(/older than 24H/)).toBeNull();
    const note = screen.getByText(/This read was observed .*more than a day ago\. Ranges count back from that read, not from now\./);
    expect(note.getAttribute("role")).toBe("status");
  });

  it("a fresh read says nothing about its age", async () => {
    const { api } = fakeApi();
    mount(api);
    await table();
    expect(screen.queryByText(/more than a day ago/)).toBeNull();
  });

  it("a read that states no instant falls back to the reader's clock", async () => {
    const { api } = fakeApi({ queue: readAt("1970-01-01T00:00:00Z") });
    mount(api, { now: new Date("2026-08-30T00:00:00Z") });
    expect(within(await table()).getByText(/All 8 loaded rows are older than 24H/)).toBeTruthy();
    expect(screen.queryByText(/more than a day ago/)).toBeNull();
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
    const kpis = screen.getByRole("group", { name: "Queue counts" });
    expect(within(kpis).getByText("Read").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("Empty");
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
