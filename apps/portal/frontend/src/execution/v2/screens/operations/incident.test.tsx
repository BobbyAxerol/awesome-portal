/**
 * Incident root drawer (S1d): states, the Not published panels, disabled
 * actions with reasons, and that it opens over a queue that stays mounted.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import { readIncidentRootV2, type IncidentRootReadV2 } from "../../readers/operationalQueue";
import { readOperationalQueueV2 } from "../../readers/operationalQueue";
import { IncidentRootDrawer, INCIDENT_ACTION_REASONS, railFor } from "./IncidentRootDrawer";
import { ACTIONS_UNAVAILABLE_WHY } from "./UnavailableActions";
import OperationsV2 from "./index";
import { whyText } from "../../gapWhyTestUtil";
import { loadCanonical } from "../../testkit/loadCanonical";
import { readIncidentDetail } from "../../../operations";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function incidentFromDouble(id: string): Result<IncidentRootReadV2> {
  const answer = answerOperationsV2("GET", `/operations/incidents/${encodeURIComponent(id)}`, new URLSearchParams());
  if (answer === null || answer.status !== 200) {
    const code = (answer?.body as { error?: { code?: string } } | undefined)?.error?.code ?? "UNKNOWN";
    return { ok: false, status: "unavailable", reason: `${code}: refused` };
  }
  const read = readIncidentRootV2(answer.body);
  return read === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value: read };
}

function api(incident: (id: string) => Result<IncidentRootReadV2> | Promise<Result<IncidentRootReadV2>> = incidentFromDouble) {
  const getIncidentRootV2 = vi.fn(async (id: string, workspaceId?: string) => {
    void workspaceId;
    return incident(id);
  });
  const listOperationalQueueV2 = vi.fn(async () => {
    const body = answerOperationsV2("GET", "/operations", new URLSearchParams())?.body;
    const read = readOperationalQueueV2(body);
    if (read === null) throw new Error("fixture");
    return { ok: true as const, value: read };
  });
  return { port: { getIncidentRootV2, listOperationalQueueV2 } as unknown as ExecutionApi, getIncidentRootV2 };
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const NOW = new Date("2026-08-22T13:00:00Z");

function overQueue(port: ExecutionApi, id: string, entry = `/execution/operations/incidents/${id}`, workspaceId?: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <OperationsV2 api={port} now={NOW} incidentId={id} workspaceId={workspaceId} />
      <Where />
    </MemoryRouter>,
  );
}

describe("route drawer over the queue", () => {
  it("opens the incident beside a queue that is still mounted", async () => {
    const { port } = api();
    overQueue(port, "inc_TEST_ONLY_operational");
    const drawer = await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_operational" });
    expect(drawer).toBeTruthy();
    expect(await screen.findByRole("table", { name: "Commands" })).toBeTruthy();
  });

  it("in overlay mode it is a modal dialog; Escape closes it back to the queue route", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
    }));
    const { port } = api();
    overQueue(port, "inc_TEST_ONLY_operational", "/execution/operations/incidents/inc_TEST_ONLY_operational?workspace_id=ws_1&env=paper");
    const dialog = await screen.findByRole("dialog", { name: "Incident inc_TEST_ONLY_operational" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByTestId("where").textContent).toBe("/execution/operations?workspace_id=ws_1&env=paper");
  });

  it("passes the workspace to the read", async () => {
    const { port, getIncidentRootV2 } = api();
    overQueue(port, "inc_TEST_ONLY_operational", undefined, "ws_9");
    await screen.findByRole("complementary", { name: /Incident/ });
    expect(getIncidentRootV2).toHaveBeenCalledWith("inc_TEST_ONLY_operational", "ws_9");
  });

  it("the incident drawer wins over a selected operation; there is one panel", async () => {
    const { port } = api();
    overQueue(port, "inc_TEST_ONLY_operational", "/execution/operations/incidents/inc_TEST_ONLY_operational?sel=op_01K3COMMANDPLAN000000000000");
    await screen.findByRole("complementary", { name: /Incident/ });
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });
});

function drawerOnly(port: ExecutionApi, id = "inc_TEST_ONLY_operational") {
  return render(
    <MemoryRouter>
      <IncidentRootDrawer api={port} incidentId={id} mode="dock" onClose={() => undefined} />
    </MemoryRouter>,
  );
}

/**
 * Waits for the READY drawer, not just any aside: the shared Drawer renders an aside in the loading phase too, so
 * `findByRole("complementary")` can resolve on the skeleton and a synchronous query after it then races the read.
 * The workflow rail exists only once the incident has been read.
 */
async function readyDrawer(port: ExecutionApi, id = "inc_TEST_ONLY_operational"): Promise<HTMLElement> {
  drawerOnly(port, id);
  const rail = await screen.findByRole("list", { name: "Workflow state" });
  return rail.closest("aside") as HTMLElement;
}

describe("root content", () => {
  it("shows the state rail, severity, target, timestamps and version for OPEN", async () => {
    drawerOnly(api().port);
    const drawer = await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_operational" });
    const rail = within(drawer).getByRole("list", { name: "Workflow state" });
    const steps = within(rail).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent?.trim())).toEqual(["Open", "Mitigated", "Resolved"]);
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["current", "todo", "todo"]);
    expect(steps[0].getAttribute("aria-current")).toBe("step");
    // State and severity ride one flag in the header (INC-7), as the kit's "Open · Critical".
    const headFlag = drawer.querySelector(".exec-dock-head .exec-flag") as HTMLElement;
    expect(headFlag.textContent).toContain("Open · Warning");
    expect(headFlag.getAttribute("data-k")).toBe("attention");
    expect(within(drawer).getByText(/Account acc_TEST_ONLY_operational/, { selector: ".exec-ops-mono" })).toBeTruthy();
    expect(within(drawer).getByText("Not acknowledged")).toBeTruthy();
    expect(within(drawer).getByText("Not mitigated")).toBeTruthy();
    expect(within(drawer).getByText("Not resolved")).toBeTruthy();
    expect(within(drawer).getAllByText("22 Aug 12:00Z").length).toBe(2);
    expect(drawer.textContent).toContain("Integration unavailable");
    expect(drawer.textContent).toContain("Forward only");
  });

  it("MITIGATED marks Open done and Mitigated current", async () => {
    const drawer = await readyDrawer(api().port, "inc_TEST_ONLY_mitigated");
    const steps = within(within(drawer).getByRole("list", { name: "Workflow state" })).getAllByRole("listitem");
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["done", "current", "todo"]);
    expect(within(drawer).getAllByText("22 Aug 12:30Z").length).toBeGreaterThan(0);
  });

  it("RESOLVED is a Portal record, never a green flag", async () => {
    const drawer = await readyDrawer(api().port, "inc_TEST_ONLY_resolved");
    const flag = drawer.querySelector(".exec-flag") as HTMLElement;
    expect(flag.getAttribute("data-k")).toBe("neutral");
    expect(flag.textContent).toContain("Resolved in the Portal");
    expect(drawer.querySelector('.exec-flag[data-k="ok"]')).toBeNull();
    expect(drawer.textContent).toContain("never resumes a deployment");
  });

  it("railFor is forward-only for every state", () => {
    expect(railFor("OPEN").map((s) => s.step)).toEqual(["current", "todo", "todo"]);
    expect(railFor("MITIGATED").map((s) => s.step)).toEqual(["done", "current", "todo"]);
    expect(railFor("RESOLVED").map((s) => s.step)).toEqual(["done", "done", "current"]);
  });

  it("without a detail read each of the four sections keeps its place and its own typed absence with the root's reason code (FE-031); assignee is FE-030", async () => {
    const drawer = await readyDrawer(api().port);
    for (const name of ["Evidence", "Operations taken", "Resolution gates", "Timeline"]) {
      const section = within(drawer).getByRole("region", { name });
      expect(within(section).getByRole("heading", { name })).toBeTruthy();
      const line = within(section).getByTestId("not-available-line");
      expect(line.textContent).toContain(`Not available: ${name}`);
      const why = whyText(line);
      expect(why, name).toContain(`${name}: Not published: event feed`);
      expect(why, name).toContain("ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED");
    }
    const priority = drawer.querySelector(".exec-dock-priority") as HTMLElement;
    expect(whyText(within(priority).getByTestId("not-available-line"))).toContain("Assignee: Not published: creator, ladder, SLA and needs-you");
    // No timeline is drawn from nothing: no list of events, no gate verdicts.
    expect(drawer.textContent).not.toMatch(/gates are not met|0 references|2 events|eligible to resolve/);
    expect(drawer.textContent).not.toMatch(/[\u2014\u2013]/);
    expect(drawer.textContent).not.toContain("N/A");
  });

  it("with the published incident detail the four sections show its evidence, operations, resolution_gate and timeline (canonical fixture)", async () => {
    const raw = loadCanonical<Record<string, unknown>>("execution-incident-detail.open");
    const detail = readIncidentDetail(raw);
    expect(detail).not.toBeNull();
    const base = api();
    const port = { ...base.port, getIncident: vi.fn(async () => ({ ok: true as const, value: detail! })) } as unknown as ExecutionApi;
    const drawer = await readyDrawer(port);
    await waitFor(() => expect(within(drawer).queryAllByTestId("not-available-line")).toHaveLength(0));
    // Operations taken: the correlated operation, its relationship and verification.
    const ops = within(drawer).getByRole("region", { name: "Operations taken" });
    expect(ops.textContent).toContain("account/sync");
    expect(ops.textContent).toContain("Triggered by");
    expect(ops.textContent).toContain("Not started");
    // Evidence: the server published an empty collection (total 0), which is a statement, not an absence.
    expect(within(drawer).getByRole("region", { name: "Evidence" }).textContent).toContain("No evidence references are recorded");
    // Resolution gates: eligible false and the four blocker codes, as published.
    const gates = within(drawer).getByRole("region", { name: "Resolution gates" });
    expect(gates.textContent).toContain("not yet eligible");
    const blockers = within(within(gates).getByRole("list", { name: "Blockers" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(blockers).toEqual([
      "Incident acknowledgement required",
      "Incident assignee required",
      "Incident not mitigated",
      "Clean dry run evidence required",
    ]);
    expect(gates.textContent).toContain("Clean dry-run evidence is not present.");
    // Timeline: both events with their version steps.
    const timeline = within(drawer).getByRole("region", { name: "Timeline" });
    expect(timeline.textContent).toContain("Create");
    expect(timeline.textContent).toContain("v0 to v1");
    expect(timeline.textContent).toContain("Annotate");
    expect(timeline.textContent).toContain("v1 to v2");
    // The assignee is now a published fact (unassigned), not a gap line.
    expect(within(drawer).getByText("Unassigned")).toBeTruthy();
  });

  it("a detail read that fails leaves the four sections absent, each on its own", async () => {
    const base = api();
    const port = { ...base.port, getIncident: vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "x" })) } as unknown as ExecutionApi;
    const drawer = await readyDrawer(port);
    expect(within(drawer).getAllByTestId("not-available-line").length).toBeGreaterThanOrEqual(5);
  });

  it("the blocked actions are ONE disclosure with one link to My access, not four greyed buttons (INC-8)", async () => {
    const drawer = await readyDrawer(api().port);
    const disclosure = drawer.querySelector('details[data-role="actions-unavailable"]') as HTMLDetailsElement;
    expect(disclosure).not.toBeNull();
    expect(disclosure.querySelector("summary")!.textContent).toBe("Actions not available yet");
    const links = within(drawer).getAllByRole("link", { name: /access/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/administration/profile-access");
    // Nothing in the footer can be pressed, so nothing can look like an action.
    expect(drawer.querySelector("footer button")).toBeNull();
    for (const label of ["Acknowledge", "Assign to me", "Mark mitigated", "Mark resolved"]) expect(within(drawer).queryByRole("button", { name: label })).toBeNull();
  });

  it("the disclosure says why in one sentence and names who can act today, and keeps each action's own reason", async () => {
    const drawer = await readyDrawer(api().port);
    const disclosure = drawer.querySelector('details[data-role="actions-unavailable"]') as HTMLElement;
    expect(disclosure.textContent).toContain(ACTIONS_UNAVAILABLE_WHY);
    expect(ACTIONS_UNAVAILABLE_WHY).toMatch(/nobody can do these from the Portal today, Admins included/);
    const wanted: Record<string, string> = {
      Acknowledge: INCIDENT_ACTION_REASONS.acknowledge,
      "Assign to me": INCIDENT_ACTION_REASONS.assign,
      "Mark mitigated": INCIDENT_ACTION_REASONS.mitigate,
      "Mark resolved": INCIDENT_ACTION_REASONS.resolve,
    };
    const items = within(disclosure).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    for (const [label, reason] of Object.entries(wanted)) {
      const item = items.find((li) => li.textContent?.startsWith(label));
      expect(item, label).toBeTruthy();
      expect(item!.textContent, label).toContain(reason);
      expect(reason).toMatch(/^Not published: /);
      expect(reason).not.toMatch(/FE-\d/);
    }
  });
});

describe("states", () => {
  it("loading shows the skeleton, not an empty incident", () => {
    const { port } = api(() => new Promise<never>(() => undefined));
    drawerOnly(port);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Workflow state" })).toBeNull();
  });

  it("denied is Withheld with the server's code", async () => {
    const { port } = api(() => ({ ok: false, status: "denied", reason: "OPERATIONAL_READ_AUTHORITY_REQUIRED: no" }));
    drawerOnly(port);
    expect(await screen.findByText("Withheld")).toBeTruthy();
    expect(screen.getByText(/OPERATIONAL_READ_AUTHORITY_REQUIRED/)).toBeTruthy();
  });

  it("an unknown incident keeps the 404 code and draws nothing else", async () => {
    drawerOnly(api().port, "inc_NOT_FOUND");
    expect(await screen.findByText(/OPERATIONAL_READ_NOT_FOUND/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Workflow state" })).toBeNull();
  });

  it("the legacy incident shape is refused, not mis-rendered", async () => {
    drawerOnly(api().port, "inc_LEGACY_SHAPE");
    expect(await screen.findByText(/execution\.incident-detail\.v1/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Workflow state" })).toBeNull();
  });

  it("a read that throws is unavailable", async () => {
    const { port } = api(() => { throw new Error("socket"); });
    drawerOnly(port);
    await waitFor(() => expect(screen.getByText(/never reached the Portal/)).toBeTruthy());
  });

  it("an id change reads again", async () => {
    const { port, getIncidentRootV2 } = api();
    const view = drawerOnly(port, "inc_TEST_ONLY_operational");
    await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_operational" });
    view.rerender(
      <MemoryRouter>
        <IncidentRootDrawer api={port} incidentId="inc_TEST_ONLY_mitigated" mode="dock" onClose={() => undefined} />
      </MemoryRouter>,
    );
    await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_mitigated" });
    expect(getIncidentRootV2).toHaveBeenCalledTimes(2);
  });
});
