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
import OperationsV2 from "./index";

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

describe("root content", () => {
  it("shows the state rail, severity, target, timestamps and version for OPEN", async () => {
    drawerOnly(api().port);
    const drawer = await screen.findByRole("complementary", { name: "Incident inc_TEST_ONLY_operational" });
    const rail = within(drawer).getByRole("list", { name: "Workflow state" });
    const steps = within(rail).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent?.trim())).toEqual(["Open", "Mitigated", "Resolved"]);
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["current", "todo", "todo"]);
    expect(steps[0].getAttribute("aria-current")).toBe("step");
    expect(within(drawer).getByText("Warning")).toBeTruthy();
    expect(within(drawer).getByText(/Account acc_TEST_ONLY_operational/, { selector: ".exec-ops-mono" })).toBeTruthy();
    expect(within(drawer).getByText("Not acknowledged")).toBeTruthy();
    expect(within(drawer).getByText("Not mitigated")).toBeTruthy();
    expect(within(drawer).getByText("Not resolved")).toBeTruthy();
    expect(within(drawer).getAllByText("22 Aug 12:00Z").length).toBe(2);
    expect(drawer.textContent).toContain("Integration unavailable");
    expect(drawer.textContent).toContain("Forward only");
  });

  it("MITIGATED marks Open done and Mitigated current", async () => {
    drawerOnly(api().port, "inc_TEST_ONLY_mitigated");
    const drawer = await screen.findByRole("complementary");
    const steps = within(within(drawer).getByRole("list", { name: "Workflow state" })).getAllByRole("listitem");
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["done", "current", "todo"]);
    expect(within(drawer).getAllByText("22 Aug 12:30Z").length).toBeGreaterThan(0);
  });

  it("RESOLVED is a Portal record, never a green flag", async () => {
    drawerOnly(api().port, "inc_TEST_ONLY_resolved");
    const drawer = await screen.findByRole("complementary");
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

  it("evidence, operations, gates, timeline and assignee are Not published with their request and reason code", async () => {
    drawerOnly(api().port);
    const drawer = await screen.findByRole("complementary");
    const items = within(drawer).getAllByRole("listitem").filter((li) => li.textContent?.includes("Not published"));
    expect(items.map((li) => li.textContent)).toEqual([
      "Not published (FE-031) Evidence.ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED",
      "Not published (FE-031) Operations taken.ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED",
      "Not published (FE-031) Resolution gates.ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED",
      "Not published (FE-031) Timeline.ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED",
      "Not published (FE-030) Assignee.ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED",
    ]);
    // No timeline is drawn from nothing: no list of events, no gate verdicts.
    expect(drawer.textContent).not.toMatch(/gates are not met|0 references|2 events/);
    expect(drawer.textContent).not.toMatch(/[—–]/);
    expect(drawer.textContent).not.toContain("N/A");
  });

  it("every action is disabled and points at its reason", async () => {
    drawerOnly(api().port);
    const drawer = await screen.findByRole("complementary");
    const wanted: Record<string, string> = {
      Acknowledge: INCIDENT_ACTION_REASONS.acknowledge,
      "Assign to me": INCIDENT_ACTION_REASONS.assign,
      "Mark mitigated": INCIDENT_ACTION_REASONS.mitigate,
      "Mark resolved": INCIDENT_ACTION_REASONS.resolve,
    };
    for (const [label, reason] of Object.entries(wanted)) {
      const button = within(drawer).getByRole("button", { name: label }) as HTMLButtonElement;
      expect(button.disabled, label).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent, label).toBe(reason);
      expect(reason).toMatch(/^Not published \(FE-0\d\d\)/);
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
