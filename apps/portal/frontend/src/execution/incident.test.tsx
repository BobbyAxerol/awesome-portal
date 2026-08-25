/**
 * Phase 8 — the eleven pieces of evidence F1b requires, numbered against it.
 *
 * Two of them are the reason this screen is careful rather than merely
 * complete: #10, that resolving offers no way to resume a deployment, and #2,
 * that four dark sources render as four unavailable panels rather than as an
 * absence of findings. Both are failures an operator would read as good news.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IncidentDetailScreen } from "./screens/IncidentDetail";
import { IncidentDetailContainer } from "./screens/containers";
import { blockerText, incidentRail, readIncidentDetail, INCIDENT_STATES } from "./operations";
import { INCIDENT_OPEN_FIXTURE, INCIDENT_RESOLVED_FIXTURE } from "./operations.fixtures";
import { createFixtureApi } from "./api/fixtureApi";
import { MemoryRouter } from "react-router-dom";

afterEach(cleanup);

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");
const load = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.valid.json`), "utf8"));

const open = () => readIncidentDetail(INCIDENT_OPEN_FIXTURE)!;
const withIncident = (patch: Record<string, unknown>) => {
  const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
  Object.assign(raw.incident, patch);
  return readIncidentDetail(raw)!;
};

describe("the inlined documents have not drifted", () => {
  it("equal the published fixtures", () => {
    expect(INCIDENT_OPEN_FIXTURE).toEqual(load("execution-incident-detail.open"));
    expect(INCIDENT_RESOLVED_FIXTURE).toEqual(load("execution-incident-workflow.resolved"));
  });
});

describe("#1 — the rail is forward-only, and fails closed", () => {
  it("knows the three states the schema declares, in order", () => {
    const schema = JSON.parse(
      readFileSync(
        join(__dirname, "../../../../../packages/contracts/schemas/execution-operations.v1.schema.json"),
        "utf8",
      ),
    );
    expect([...INCIDENT_STATES]).toEqual(schema.$defs.IncidentRecord.properties.workflow_state.enum);
  });

  it("marks the current step and everything before it", () => {
    expect(incidentRail("MITIGATED")).toEqual([
      { state: "OPEN", done: true, current: false },
      { state: "MITIGATED", done: false, current: true },
      { state: "RESOLVED", done: false, current: false },
    ]);
  });

  it("draws no rail at all for a state it does not recognise", () => {
    // A plausible-looking rail over an unknown state is worse than none: it
    // invites the reader to believe a transition exists.
    expect(incidentRail(null)).toEqual([]);
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={withIncident({ workflow_state: "REOPENED" })} />);
    expect(screen.getByText(/not one this screen recognises/)).toBeTruthy();
  });

  it("never renders a reverse or reopen step", () => {
    const { container } = render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    const rail = container.querySelector(".exec-inc-rail")!;
    expect(rail.textContent).not.toMatch(/reopen|revert|back/i);
    expect(screen.getByText(/forward-only · each transition audited/)).toBeTruthy();
  });
});

describe("#2 — four source panels, unavailable rather than empty", () => {
  it("renders one frame for each of the four", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    for (const title of ["Findings", "Alerts", "Dead letters", "Order trace"]) {
      expect(screen.getByLabelText(title), title).toBeTruthy();
    }
  });

  it("says the evidence is missing, not that there is none", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    const findings = screen.getByLabelText("Findings");
    expect(within(findings).getByText(/missing evidence, not an absence of findings/)).toBeTruthy();
  });

  it("reads an unreadable panel state as unavailable, never as empty or ok", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    raw.source_panels[0].panel_state = "fine";
    expect(readIncidentDetail(raw)!.sourcePanels[0].panelState).toBe("unavailable");
  });
});

describe("#3 — exact and truncated collection counts", () => {
  it("states each collection's own total", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    // EL-V2-07: each collection lives on its own tab.
    expect(screen.getByText("0 references")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Operations/ }));
    expect(screen.getByText("1 operations")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Timeline/ }));
    expect(screen.getByText("2 events")).toBeTruthy();
  });

  it("says the rest were not sent when the server bounded a collection", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    raw.timeline.total_count = 4180;
    raw.timeline.returned_count = 2;
    raw.timeline.truncated = true;
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={readIncidentDetail(raw)!} />);
    fireEvent.click(screen.getByRole("tab", { name: /Timeline/ }));
    expect(screen.getByText(/showing 2 of 4180 events — the rest were not sent/)).toBeTruthy();
  });

  it("says a count is unpublished rather than printing zero", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    delete raw.evidence.total_count;
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={readIncidentDetail(raw)!} />);
    expect(screen.getByText(/references count not published/)).toBeTruthy();
  });
});

describe("#4 — ADMIN visibility", () => {
  it("offers no actions to a USER, and says why", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    raw.actor.roles = ["USER"];
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={readIncidentDetail(raw)!} />);
    expect(screen.queryByRole("button", { name: /Mark RESOLVED/ })).toBeNull();
    expect(screen.getByText(/Admin operators only/)).toBeTruthy();
  });

  it("shows the port's failure rather than a blank incident", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={null} status="denied" reason="not your workspace" />);
    expect(screen.queryByRole("button", { name: /Mark RESOLVED/ })).toBeNull();
  });
});

describe("#6 — the resolution gate names which blocker, not merely that there is one", () => {
  it("lists all four in the operator's words", () => {
    const { container } = render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} onResolve={() => {}} />);
    // Scoped to the footer: the header also says "no assignee", which is the
    // same fact stated for a different reason and would satisfy an unscoped
    // match without the blocker ever rendering.
    const reasons = container.querySelector(".exec-inc-footer .exec-disabled-reason")!;
    expect(reasons.textContent).toMatch(/Nobody has acknowledged/);
    expect(reasons.textContent).toMatch(/This incident has no assignee/);
    expect(reasons.textContent).toMatch(/not been recorded as mitigated/);
    expect(reasons.textContent).toMatch(/clean dry-run evidence reference/);
  });

  it("keeps resolve disabled while the server says ineligible", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} onResolve={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Mark RESOLVED/ }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows an unknown blocker as itself rather than dropping it", () => {
    // A blocker nobody can read is still a blocker; hiding it makes the button
    // look arbitrarily disabled.
    expect(blockerText("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("treats an absent gate as ineligible", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    delete raw.resolution_gate;
    expect(readIncidentDetail(raw)!.resolutionGate).toBeNull();
  });

  it("treats an unreadable eligible flag as not eligible", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    raw.resolution_gate.eligible = "yes";
    expect(readIncidentDetail(raw)!.resolutionGate!.eligible).toBe(false);
  });
});

describe("#10 — resolving never resumes a deployment", () => {
  it("offers no resume control anywhere on the screen", () => {
    const { container } = render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} onResolve={() => {}} />);
    // Named in codex's stop gates as the affordance that must not appear.
    expect(container.textContent).not.toMatch(/\bresume\b(?!\s+is)/i);
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
  });

  it("states that resolving closes the Portal record only", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    expect(screen.getByText(/closes the Portal incident only/)).toBeTruthy();
    expect(screen.getByText(/never resumes a deployment/)).toBeTruthy();
  });

  it("says the deployment is still halted once resolved", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={withIncident({ workflow_state: "RESOLVED" })} />);
    expect(screen.getByText(/remains halted/)).toBeTruthy();
    expect(screen.getByText(/deliberately left to the operator/)).toBeTruthy();
  });

  it("reads both source flags fail-closed", () => {
    const unreadable = withIncident({
      source_side_effect_requested: "no",
      deployment_resume_requested: "no",
    });
    // Unreadable "did this touch the source" must not read as "it did not".
    expect(unreadable.sourceSideEffectRequested).toBe(true);
    expect(unreadable.deploymentResumeRequested).toBe(true);
  });
});

describe("evidence is a reference, never a body", () => {
  it("says so, so nobody looks for a download that does not exist", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    expect(screen.getByText(/never an artifact body/)).toBeTruthy();
  });
});

describe("#9 — an annotation renders without echoing anything unsafe", () => {
  it("shows the server's redaction state rather than re-deriving one", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    raw.annotations.rows[0].redaction_state = "REDACTED";
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={readIncidentDetail(raw)!} />);
    expect(screen.getByText(/REDACTED/)).toBeTruthy();
  });

  it("does not treat a missing annotation id as a renderable note", () => {
    const raw = JSON.parse(JSON.stringify(INCIDENT_OPEN_FIXTURE));
    raw.annotations.rows = [{ body: "orphan" }];
    expect(readIncidentDetail(raw)!.annotations.rows).toEqual([]);
  });
});

describe("#11 — keyboard and structure", () => {
  it("labels every panel so each can be reached directly", () => {
    render(<IncidentDetailScreen onOpenOperation={() => undefined} incident={open()} />);
    for (const label of ["Evidence", "Annotations", "Incident state"]) expect(screen.getByLabelText(label), label).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Timeline/ }));
    expect(screen.getByLabelText("Timeline")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Operations/ }));
    expect(screen.getByLabelText("Operations taken")).toBeTruthy();
  });

  it("makes a correlated operation a real button", () => {
    render(<IncidentDetailScreen incident={open()} onOpenOperation={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Operations/ }));
    expect(screen.getByRole("button", { name: "op_fixture_1253" }).tagName).toBe("BUTTON");
  });
});

describe("the container fetches through the port", () => {
  it("renders the incident", async () => {
    render(<MemoryRouter><IncidentDetailContainer api={createFixtureApi()} incidentId="inc_fixture_44" /></MemoryRouter>);
    expect(await screen.findByText(/inc_fixture_44/)).toBeTruthy();
  });

  it("shows the port's failure rather than an empty incident", async () => {
    render(<MemoryRouter><IncidentDetailContainer
        api={createFixtureApi({ unavailableEndpoints: ["getIncident"] })}
        incidentId="inc_fixture_44"
      /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByLabelText("Timeline")).toBeNull());
  });
});

describe("the reader fails closed", () => {
  it("returns null without an incident", () => {
    expect(readIncidentDetail({})).toBeNull();
    expect(readIncidentDetail({ incident: {} })).toBeNull();
    expect(readIncidentDetail(null)).toBeNull();
  });
});
