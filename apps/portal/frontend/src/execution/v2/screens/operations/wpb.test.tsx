/**
 * WP-B: Operations filled from the fixture lane (simulated rows through the same double and reader), and the routed incident page.
 * Rows visible, Intent / Receipt / Display as three facts, Next actions, Source segment, Exceptions and Audit tabs, the ops drawer
 * sections, the peek, the incident page (sections, many-to-many operations, typed gaps, deep links) and the pure views.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import {
  operationalQueueSearch, readIncidentRootV2, readOperationalQueueV2, type IncidentRootReadV2, type OperationalQueueQueryV2,
  type OperationalQueueReadV2, type OperationV2,
} from "../../readers/operationalQueue";
import IncidentPage, { linkedOperationsOf, SCAN_PAGES } from "./IncidentPage";
import OperationsV2 from "./index";
import { auditEventsOf, incidentsOf, nextActionOf, openExceptionsOf } from "./opsViews";
import { readOpsUrl, writeOpsUrl } from "./opsUrl";
import { whyText } from "../../gapWhyTestUtil";

afterEach(() => cleanup());

const NOW = new Date("2026-08-22T13:00:00Z");

function queueAnswer(query: OperationalQueueQueryV2): Result<OperationalQueueReadV2> {
  const answer = answerOperationsV2("GET", "/operations", operationalQueueSearch(query), true);
  const read = answer === null ? null : readOperationalQueueV2(answer.body);
  return read === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value: read };
}
function incidentAnswer(id: string): Result<IncidentRootReadV2> {
  const answer = answerOperationsV2("GET", `/operations/incidents/${id}`, new URLSearchParams(), true);
  if (answer === null || answer.status !== 200) return { ok: false, status: "unavailable", reason: `HTTP ${answer?.status ?? "none"}` };
  const read = readIncidentRootV2(answer.body);
  return read === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value: read };
}
function fakeApi() {
  const queue = vi.fn(async (query: OperationalQueueQueryV2) => queueAnswer(query));
  const root = vi.fn(async (id: string) => incidentAnswer(id));
  return { api: { listOperationalQueueV2: queue, getIncidentRootV2: root } as unknown as ExecutionApi, queue, root };
}
function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
function mount(entry = "/execution/operations?lens=all&range=all") {
  const { api, queue, root } = fakeApi();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <OperationsV2 api={api} now={NOW} />
      <Where />
    </MemoryRouter>,
  );
  return { api, queue, root };
}
const table = (name = "Commands") => screen.findByRole("table", { name });
const rowOf = (t: HTMLElement, text: RegExp) => within(t).getAllByRole("row").find((r) => text.test(r.textContent ?? ""))!;

describe("Operations with the lane's rows", () => {
  it("draws rows with Receipt and Display as flags and Intent as a typed gap, per row", async () => {
    mount();
    const t = await table();
    const rows = within(t).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    const canary = rowOf(t, /pf_TEST_ONLY_canary/);
    expect(within(canary).getByText("Unknown outcome")).toBeTruthy();
    expect(within(canary).getByText("Catching up")).toBeTruthy();
    expect(canary.textContent).toContain("Delivery: awaiting receipt");
    expect(canary.textContent).toContain("Not available");
    const stale = rowOf(t, /pf_TEST_ONLY_core.*Adjust target budget/s);
    expect(within(stale).getByText("Stale")).toBeTruthy();
  });

  it("Next: check original request for an unknown outcome, display updating, open obligations, review", async () => {
    mount();
    const t = await table();
    expect(within(rowOf(t, /pf_TEST_ONLY_canary/)).getByRole("button", { name: "Check original request" })).toBeTruthy();
    expect(within(rowOf(t, /pf_TEST_ONLY_satellite/)).getByText("Display updating")).toBeTruthy();
    expect(within(rowOf(t, /dep_TEST_ONLY_btc/)).getByRole("link", { name: "Open obligations" }).getAttribute("href")).toContain("dep_TEST_ONLY_btc");
    expect(within(rowOf(t, /pf_TEST_ONLY_core.*Adjust target budget/s)).getByRole("button", { name: "Review" })).toBeTruthy();
  });

  it("health strip draws pending receipts, display lag and open exceptions as the server counted them", async () => {
    mount();
    await table();
    const strip = screen.getByRole("group", { name: "Operations health" });
    const value = (label: string) => within(strip).getByText(label).nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent;
    expect(Number(value("Pending receipts"))).toBeGreaterThan(0);
    expect(Number(value("Display catching up"))).toBeGreaterThan(0);
    expect(value("Open exceptions")).toBe("3");
    expect(within(strip).getByText("Display catching up").nextElementSibling?.textContent).toContain("at least");
  });

  it("the Exceptions tab carries the server count and lists the open incidents the rows link to", async () => {
    mount();
    await table();
    const tab = screen.getByRole("tab", { name: /Exceptions/ });
    expect(within(tab).getByText("3")).toBeTruthy();
    fireEvent.click(tab);
    const t = await table("Exceptions");
    const ids = within(t).getAllByRole("link").map((a) => a.textContent);
    expect(ids).toEqual(expect.arrayContaining(["inc_TEST_ONLY_fx_mismatch", "inc_TEST_ONLY_fx_recall", "inc_TEST_ONLY_fx_budget"]));
    expect(ids).not.toContain("inc_TEST_ONLY_fx_sync");
    expect(screen.getByText(/The server counts 3 open exceptions in scope/)).toBeTruthy();
    const link = within(t).getByRole("link", { name: "Open incident inc_TEST_ONLY_fx_mismatch" });
    expect(link.getAttribute("href")).toMatch(/^\/execution\/operations\/incidents\/inc_TEST_ONLY_fx_mismatch/);
    // The budget incident is named by two operations and the mismatch incident by two: many to many.
    expect(within(t).getByRole("list", { name: "Operations linked to inc_TEST_ONLY_fx_budget" }).querySelectorAll("li").length).toBeGreaterThanOrEqual(3);
  });

  it("the Audit tab lists the workflow timestamps the rows publish and says once that the actor is not published", async () => {
    mount();
    await table();
    fireEvent.click(screen.getByRole("tab", { name: "Audit" }));
    const t = await table("Audit");
    expect(within(t).getAllByText("Created").length).toBeGreaterThan(5);
    expect(within(t).getAllByText("Acknowledged").length).toBeGreaterThan(0);
    expect(within(t).getAllByText("Resolved in the Portal").length).toBeGreaterThan(0);
    expect(screen.getByText(/Who it is not shown|Who did it is not shown/)).toBeTruthy();
    expect(screen.getAllByText(/events? in the loaded operations/).length).toBeGreaterThan(0);
  });

  it("Source: All and Commands show the table, Admin journal says it publishes no rows, and the choice lives in the URL", async () => {
    mount();
    await table();
    const group = screen.getByRole("group", { name: "Source" });
    fireEvent.click(within(group).getByRole("button", { name: "Admin journal" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("source=journal"));
    expect(screen.queryByRole("table", { name: "Commands" })).toBeNull();
    expect(screen.getByText(/The admin journal publishes no rows/)).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Commands" }));
    expect(await table()).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toContain("source=commands");
    fireEvent.click(within(group).getByRole("button", { name: "All" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).not.toContain("source="));
  });

  it("a link with an unknown source is dropped and said", async () => {
    mount("/execution/operations?source=nope");
    await table();
    expect(screen.getByText(/Ignored an unknown value for source/)).toBeTruthy();
  });

  it("the ops drawer shows Intent, Receipt and Display as separate sections with their own provenance, then incidents and the peek", async () => {
    mount("/execution/operations?lens=all&range=all&sel=op_TEST_ONLY_s01");
    const dock = await screen.findByRole("complementary");
    const intent = within(dock).getByRole("region", { name: "Intent" });
    const receipt = within(dock).getByRole("region", { name: "Receipt" });
    const display = within(dock).getByRole("region", { name: "Display" });
    expect(whyText(intent)).toContain("Not published (FE-020)");
    expect(within(receipt).getByText("Unknown outcome")).toBeTruthy();
    expect(within(receipt).getByText("Awaiting receipt")).toBeTruthy();
    expect(receipt.textContent).toContain("Read at");
    expect(within(display).getByText("Catching up")).toBeTruthy();
    expect(display.textContent).toContain("Counted");
    for (const section of [intent, receipt, display]) expect(section.querySelector("[data-role='provenance']")).toBeTruthy();
    const incidents = within(dock).getByRole("region", { name: "Linked incidents" });
    const page = within(incidents).getByRole("link", { name: /Open incident inc_TEST_ONLY_fx_mismatch/ });
    expect(page.getAttribute("href")).toMatch(/incidents\/inc_TEST_ONLY_fx_mismatch(\?|$)/);
    expect(page.getAttribute("href")).not.toContain("peek");
    const peek = within(incidents).getByRole("link", { name: "Peek at incident inc_TEST_ONLY_fx_mismatch beside the queue" });
    expect(peek.getAttribute("href")).toContain("peek=1");
    // The target is a link to its page; the pending-control entry is absent without the fixture mount.
    expect(within(dock).getAllByRole("link", { name: /pf_TEST_ONLY_canary/ }).length).toBeGreaterThan(0);
  });

  it("the peek drawer offers the full page", async () => {
    const { api } = fakeApi();
    render(
      <MemoryRouter initialEntries={["/execution/operations/incidents/inc_TEST_ONLY_fx_recall?peek=1"]}>
        <Routes>
          <Route path="/execution/operations/incidents/:incidentId" element={<OperationsV2 api={api} now={NOW} incidentId="inc_TEST_ONLY_fx_recall" />} />
        </Routes>
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: "Open full page" });
    expect(link.getAttribute("href")).toBe("/execution/operations/incidents/inc_TEST_ONLY_fx_recall");
  });
});

function mountIncident(id: string, api: ExecutionApi = fakeApi().api) {
  render(
    <MemoryRouter initialEntries={[`/execution/operations/incidents/${id}?env=paper`]}>
      <IncidentPage api={api} incidentId={id} />
      <Where />
    </MemoryRouter>,
  );
}

describe("incident page", () => {
  it("draws the head, the stepper and the six sections from the root and the queue links", async () => {
    mountIncident("inc_TEST_ONLY_fx_mismatch");
    expect(await screen.findByRole("heading", { level: 1, name: /inc_TEST_ONLY_fx_mismatch/ })).toBeTruthy();
    expect(screen.getByText(/Open · Critical/)).toBeTruthy();
    expect(screen.getByText(/Observed 22 Aug 13:00Z/)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Workflow state steps" })).getByText("Open").getAttribute("aria-current")).toBe("step");
    for (const name of ["Evidence", "Operations taken", "Resolution gates", "Timeline", "Children and original targets", "Actions"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
  });

  it("links operations many to many: the two operations that name the incident, with receipt, target now and original target typed", async () => {
    mountIncident("inc_TEST_ONLY_fx_mismatch");
    const ops = await screen.findByRole("list", { name: "Linked operations" });
    const items = within(ops).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Triggered by this incident");
    expect(items[1].textContent).toContain("Related to this incident");
    expect(ops.textContent).toContain("Original target: not attested (ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED)");
    expect(within(items[0]).getByText("Unknown outcome")).toBeTruthy();
    const href = within(items[0]).getByRole("link", { name: "Adjust target budget" }).getAttribute("href");
    expect(href).toContain("/execution/operations?");
    expect(href).toContain("operation=op_TEST_ONLY_s01");
    expect(href).toContain("env=paper");
    expect(screen.getByText(/Found in the newest \d+ of \d+ operations\./)).toBeTruthy();
  });

  it("an incident that is shared: the budget incident is named by three operations", async () => {
    mountIncident("inc_TEST_ONLY_fx_budget");
    const ops = await screen.findByRole("list", { name: "Linked operations" });
    expect(within(ops).getAllByRole("listitem")).toHaveLength(3);
  });

  it("gates print the published facts or a typed gap, never a verdict; the server's verdict is said as not published", async () => {
    mountIncident("inc_TEST_ONLY_fx_recall");
    const gates = await screen.findByRole("list", { name: "Resolution gates" });
    const items = within(gates).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0].getAttribute("data-state")).toBe("met");
    expect(items[0].textContent).toContain("Acknowledged");
    expect(items[1].getAttribute("data-state")).toBe("not-published");
    expect(items[1].textContent).toContain("FE-030");
    expect(items[2].getAttribute("data-state")).toBe("open");
    expect(items[3].getAttribute("data-state")).toBe("not-published");
    expect(screen.getByText("Server verdict not published")).toBeTruthy();
    expect(screen.queryByText(/eligible to resolve/)).toBeNull();
  });

  it("evidence is four typed gaps, the timeline is the root's own timestamps, and the actor is not published", async () => {
    mountIncident("inc_TEST_ONLY_fx_sync");
    await screen.findByRole("list", { name: "Evidence sources" });
    const chips = within(screen.getByRole("list", { name: "Evidence sources" })).getAllByRole("listitem");
    expect(chips.map((c) => c.getAttribute("data-source"))).toEqual(["Findings", "Alerts", "Dead letters", "Order trace"]);
    const timeline = within(screen.getByRole("list", { name: "Timeline" })).getAllByRole("listitem");
    expect(timeline.map((li) => li.querySelector(".exec-opi-event-word")?.textContent)).toEqual(["Created", "Acknowledged", "Mitigated"]);
    const gaps = screen.getAllByTestId("not-available-line");
    expect(gaps.some((g) => g.textContent?.includes("Actor") && whyText(g).includes("FE-021"))).toBe(true);
    expect(screen.getAllByRole("listitem", { name: "" }).length).toBeGreaterThan(0);
  });

  it("every action is disabled with its reason", async () => {
    mountIncident("inc_TEST_ONLY_fx_mismatch");
    const group = await screen.findByRole("group", { name: "Incident actions" });
    const labels = ["Acknowledge", "Assign to me", "Record exposure mitigated", "Attach dry-run evidence", "Mark mitigated", "Mark resolved"];
    for (const label of labels) {
      const button = within(group).getByRole("button", { name: label }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/^Not published \(FE-\d+\)/);
    }
  });

  it("a resolved incident has all steps done; an unknown id is a typed read failure, not an empty page", async () => {
    mountIncident("inc_TEST_ONLY_fx_resume");
    const rail = await screen.findByRole("list", { name: "Workflow state steps" });
    expect(within(rail).getByText("Resolved").getAttribute("aria-current")).toBe("step");
    cleanup();
    mountIncident("inc_NOT_FOUND");
    expect(await screen.findByText(/HTTP 404/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Resolution gates" })).toBeNull();
  });

  it("a legacy body is refused with its schema version", async () => {
    mountIncident("inc_LEGACY_SHAPE");
    expect(await screen.findByText(/execution\.incident-detail\.v1/)).toBeTruthy();
  });

  it("the queue read is paged up to the scan bound and the page says when older operations were not searched", async () => {
    const calls: OperationalQueueQueryV2[] = [];
    const api = {
      getIncidentRootV2: async (id: string) => incidentAnswer(id),
      listOperationalQueueV2: async (query: OperationalQueueQueryV2) => {
        calls.push(query);
        return queueAnswer({ ...query, limit: 2 });
      },
    } as unknown as ExecutionApi;
    mountIncident("inc_TEST_ONLY_fx_mismatch", api);
    await screen.findByRole("list", { name: "Linked operations" });
    expect(calls).toHaveLength(SCAN_PAGES);
    expect(calls[0].after).toBeUndefined();
    expect(calls[1].after).toBeTruthy();
    expect(screen.getByText(/older operations were not searched/)).toBeTruthy();
  });

  it("when the queue read fails the operations panel is typed unavailable and the rest of the page stays", async () => {
    const api = {
      getIncidentRootV2: async (id: string) => incidentAnswer(id),
      listOperationalQueueV2: async () => ({ ok: false, status: "unavailable", reason: "OPERATIONAL_READ_UNAVAILABLE" }),
    } as unknown as ExecutionApi;
    mountIncident("inc_TEST_ONLY_fx_mismatch", api);
    expect(await screen.findByText("OPERATIONAL_READ_UNAVAILABLE")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resolution gates" })).toBeTruthy();
  });
});

describe("pure views", () => {
  const rows = (): readonly OperationV2[] => {
    const r = queueAnswer({ limit: 250 });
    if (!r.ok || r.value.kind !== "queue") throw new Error("queue");
    return r.value.queue.page.rows;
  };

  it("incidentsOf joins the rows' links once per incident, newest link first; openExceptionsOf keeps OPEN only", () => {
    const all = incidentsOf(rows());
    expect(all.map((i) => i.incidentId).sort()).toEqual(["inc_TEST_ONLY_fx_budget", "inc_TEST_ONLY_fx_mismatch", "inc_TEST_ONLY_fx_recall", "inc_TEST_ONLY_fx_resume", "inc_TEST_ONLY_fx_sync"]);
    expect(openExceptionsOf(rows()).map((i) => i.incidentId).sort()).toEqual(["inc_TEST_ONLY_fx_budget", "inc_TEST_ONLY_fx_mismatch", "inc_TEST_ONLY_fx_recall"]);
    const budget = all.find((i) => i.incidentId === "inc_TEST_ONLY_fx_budget")!;
    expect(budget.edges).toHaveLength(3);
    expect(budget.edges.map((e) => e.linkedAt.ms)).toEqual([...budget.edges.map((e) => e.linkedAt.ms)].sort((a, b) => b - a));
  });

  it("linkedOperationsOf agrees with incidentsOf", () => {
    expect(linkedOperationsOf(rows(), "inc_TEST_ONLY_fx_mismatch")).toHaveLength(incidentsOf(rows()).find((i) => i.incidentId === "inc_TEST_ONLY_fx_mismatch")!.edges.length);
    expect(linkedOperationsOf(rows(), "inc_nothing")).toEqual([]);
  });

  it("auditEventsOf: created for every row, acknowledged and resolved only when published, newest first", () => {
    const data = rows();
    const events = auditEventsOf(data);
    expect(events.filter((e) => e.kind === "created")).toHaveLength(data.length);
    expect(events.filter((e) => e.kind === "acknowledged")).toHaveLength(data.filter((r) => r.acknowledgedAt !== null).length);
    expect(events.filter((e) => e.kind === "resolved")).toHaveLength(data.filter((r) => r.resolvedAt !== null).length);
    expect(events.map((e) => e.at.ms)).toEqual([...events.map((e) => e.at.ms)].sort((a, b) => b - a));
  });

  it("nextActionOf: doubt first, then display, then receipt, else review; no axis published is a plain review", () => {
    const base = { sourceStatus: "SUCCEEDED", verificationResult: "SUCCEEDED", triageState: "UNACKNOWLEDGED" } as const;
    expect(nextActionOf({ ...base, sourceStatus: "UNCERTAIN", displayState: "CATCHING_UP" })).toBe("check-original");
    expect(nextActionOf({ ...base, displayState: "CATCHING_UP", deliveryState: "AWAITING_RECEIPT" })).toBe("display-updating");
    expect(nextActionOf({ ...base, deliveryState: "AWAITING_RECEIPT" })).toBe("open-obligations");
    expect(nextActionOf({ ...base })).toBe("review");
    expect(nextActionOf({ ...base, displayState: null, deliveryState: null })).toBe("review");
  });

  it("the source segment round-trips through the URL and never replaces other keys", () => {
    const read = readOpsUrl(new URLSearchParams("source=JOURNAL&range=7d"));
    expect(read.source).toBe("journal");
    const next = writeOpsUrl(new URLSearchParams("x=1"), { filters: read.filters, range: read.range, source: read.source });
    expect(next.get("source")).toBe("journal");
    expect(next.get("x")).toBe("1");
    expect(writeOpsUrl(next, { filters: read.filters, range: read.range }).get("source")).toBe("journal");
    expect(writeOpsUrl(next, { filters: read.filters, range: read.range, source: "" }).has("source")).toBe(false);
  });
});
