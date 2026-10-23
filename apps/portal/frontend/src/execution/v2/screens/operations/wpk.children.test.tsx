/**
 * WP-K slice 3: the incident page reads the scoped incident's children and the Audit tab reads the audit feed, both through optional port methods and
 * the strict readers, from the canonical fixtures. A port without the read, a null section or an omitted one keeps today's typed absences.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import type { ExecutionApi, Result } from "../../../api/ports";
import { readIncidentChildrenV1, readOperationsAuditV1 } from "../../readers/incidentChildren";
import { readIncidentRootV2, readOperationalQueueV2 } from "../../readers/operationalQueue";
import { loadCanonical } from "../../testkit/loadCanonical";
import { AuditPanel } from "./AuditPanel";
import IncidentPage from "./IncidentPage";

afterEach(() => cleanup());

const INCIDENT = "inc_TEST_ONLY_operational";
const children = (name: string) => {
  const read = readIncidentChildrenV1(loadCanonical<{ value: unknown }>(`execution-incident-children.${name}.synthetic.valid.json`).value);
  if (read === null || read.kind !== "incident_children") throw new Error("fixture unreadable");
  return read.children;
};
const audit = (name: string) => {
  const read = readOperationsAuditV1(loadCanonical<{ value: unknown }>(`execution-operations-audit.${name}.synthetic.valid.json`).value);
  if (read === null || read.kind !== "operations_audit") throw new Error("fixture unreadable");
  return read.page;
};

function port(extra: Partial<ExecutionApi> = {}): ExecutionApi {
  return {
    getIncidentRootV2: vi.fn(async (id: string) => {
      const answer = answerOperationsV2("GET", `/operations/incidents/${encodeURIComponent(id)}`, new URLSearchParams());
      const read = readIncidentRootV2(answer?.body);
      return read === null ? ({ ok: false, status: "unavailable", reason: "unreadable" } as Result<never>) : { ok: true as const, value: read };
    }),
    listOperationalQueueV2: vi.fn(async () => {
      const read = readOperationalQueueV2(answerOperationsV2("GET", "/operations", new URLSearchParams())?.body);
      if (read === null) throw new Error("fixture");
      return { ok: true as const, value: read };
    }),
    ...extra,
  } as unknown as ExecutionApi;
}
const mountPage = (p: ExecutionApi) => render(<MemoryRouter><IncidentPage api={p} incidentId={INCIDENT} /></MemoryRouter>);

describe("incident children", () => {
  it("published: evidence per source with true zeros, the assignee, the server's gate verdict with blockers, the timeline with versions and actors, original targets", async () => {
    mountPage(port({ getIncidentChildren: async () => ({ ok: true, value: children("published") }) }));
    const evidence = await screen.findByTestId("children-evidence");
    expect(within(evidence).getAllByRole("listitem").map((li) => li.getAttribute("data-source"))).toEqual(["Findings", "Alerts", "Dead letters", "Order trace"]);
    expect(evidence.textContent).toContain("Position limit finding");
    expect(screen.getAllByText(/Assigned to TEST_ONLY:actor-1/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("children-gate").textContent).toMatch(/not yet eligible to resolve: Open dead letter, Unverified order trace/);
    const timeline = screen.getByTestId("children-timeline");
    expect(timeline.textContent).toMatch(/Assigned · TEST_ONLY:actor-2 · v1 to v2/);
    expect(timeline.textContent).toMatch(/Opened · v1/);
    const linked = screen.getByTestId("children-linked");
    expect(linked.textContent).toMatch(/Original target Deployment TEST_ONLY:dep-1/);
    expect(linked.textContent).toMatch(/Original target not attested/);
  });
  it("eligible with a published empty blocker list says eligible; an empty evidence collection is a stated zero, not an absence", async () => {
    mountPage(port({ getIncidentChildren: async () => ({ ok: true, value: children("eligible") }) }));
    expect((await screen.findByTestId("children-gate")).textContent).toBe("The server reports this incident eligible to resolve.");
    expect(screen.getByTestId("children-evidence").textContent).toMatch(/Findings · 0/);
  });
  it.each(["not-read", "no-source"])("%s keeps every section on its typed absence and claims no verdict", async (name) => {
    mountPage(port({ getIncidentChildren: async () => ({ ok: true, value: children(name) }) }));
    await screen.findByText("Resolution gates");
    expect(screen.queryByTestId("children-evidence")).toBeNull();
    expect(screen.queryByTestId("children-gate")).toBeNull();
    expect(screen.queryByTestId("children-timeline")).toBeNull();
    expect(screen.queryByTestId("children-linked")).toBeNull();
    expect(screen.getAllByText(/Not published|Not available/).length).toBeGreaterThan(0);
  });
  it("a refused read, a port without the read and a throwing port are the same typed absence", async () => {
    for (const extra of [{ getIncidentChildren: async () => ({ ok: false, status: "unavailable", reason: "refused" }) }, {}, { getIncidentChildren: () => { throw new Error("no"); } }]) {
      const view = mountPage(port(extra as Partial<ExecutionApi>));
      await screen.findByText("Resolution gates");
      await waitFor(() => expect(screen.queryByTestId("children-gate")).toBeNull());
      view.unmount();
    }
  });
});

describe("audit feed", () => {
  it("shows actor, action, subject and receipt; a row with no receipt says so; older events are counted, not loaded", async () => {
    render(<MemoryRouter><AuditPanel rows={[]} api={port({ getOperationsAudit: async () => ({ ok: true, value: audit("page") }) })} onOpenOperation={() => undefined} /></MemoryRouter>);
    const table = await screen.findByRole("table", { name: "Audit feed" });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(3);
    expect(table.textContent).toMatch(/TEST_ONLY:actor-1/);
    expect(table.textContent).toMatch(/Acknowledged/);
    expect(table.textContent).toMatch(/TEST_ONLY:receipt-1/);
    expect(table.textContent).toMatch(/No receipt written/);
    expect(screen.getByText(/older events exist and are not loaded/)).toBeTruthy();
  });
  it("an empty feed is a stated zero; a port without the read keeps the workflow record of the loaded rows", async () => {
    const first = render(<MemoryRouter><AuditPanel rows={[]} api={port({ getOperationsAudit: async () => ({ ok: true, value: audit("empty") }) })} onOpenOperation={() => undefined} /></MemoryRouter>);
    expect(await screen.findByText("0 events.")).toBeTruthy();
    first.unmount();
    render(<MemoryRouter><AuditPanel rows={[]} api={port()} onOpenOperation={() => undefined} /></MemoryRouter>);
    expect((await screen.findAllByText(/Who did it is not shown|No operation is loaded/)).length).toBeGreaterThan(0);
  });
});
