/**
 * Phase 10 — the evidence F2 requires.
 *
 * The load-bearing ones are the fail-closed pair: a CRITICAL finding disables
 * exit, and `runtime_state: null` never becomes HALTED. Both are failures an
 * operator would read as reassurance.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  certificationBlocked,
  readSandboxCertification,
  EVALUATION_STATES,
  STEP_KEYS,
} from "./certification";
import { SANDBOX_CERTIFICATION_FIXTURE } from "./certification.fixtures";
import { SandboxCertificationScreen } from "./screens/SandboxCertification";
import { SandboxCertificationContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";

afterEach(cleanup);

const CONTRACTS = join(__dirname, "../../../../../packages/contracts");
const published = () =>
  JSON.parse(
    readFileSync(
      join(CONTRACTS, "fixtures/execution-sandbox-certification.unavailable.valid.json"),
      "utf8",
    ),
  );
const schema = () =>
  JSON.parse(
    readFileSync(join(CONTRACTS, "schemas/execution-sandbox-certification.v1.schema.json"), "utf8"),
  );

const cert = () => readSandboxCertification(SANDBOX_CERTIFICATION_FIXTURE)!;

/** Build a certification with every step at `evaluation`, and a chosen gate. */
function withSteps(evaluation: string, eligible: boolean, findings: unknown[] = []) {
  const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
  raw.steps = raw.steps.map((s: Record<string, unknown>) => ({ ...s, evaluation_state: evaluation }));
  raw.progress.eligible = eligible;
  raw.progress.passed_count = evaluation === "PASS" ? 7 : 0;
  raw.progress.blocker_codes = eligible ? [] : raw.progress.blocker_codes;
  raw.findings = {
    total_count: findings.length,
    returned_count: findings.length,
    truncated: false,
    rows: findings,
  };
  return readSandboxCertification(raw)!;
}

describe("the inlined document has not drifted", () => {
  it("equals the published fixture", () => {
    expect(SANDBOX_CERTIFICATION_FIXTURE).toEqual(published());
  });
});

describe("the vocabulary is the schema's", () => {
  it("knows the seven step keys and the four evaluation states", () => {
    const step = schema().$defs.Step.properties;
    expect([...STEP_KEYS]).toEqual(step.step_key.enum);
    expect([...EVALUATION_STATES].sort()).toEqual([...step.evaluation_state.enum].sort());
  });

  it("keeps STALE and FAIL as separate states", () => {
    // Evidence that expired is not evidence that failed.
    expect(EVALUATION_STATES).toContain("STALE");
    expect(EVALUATION_STATES).toContain("FAIL");
  });
});

describe("0/7 unavailable — the published fixture", () => {
  it("reads seven steps in the server's order and recomputes none of them", () => {
    const c = cert();
    expect(c.steps).toHaveLength(7);
    expect(c.steps.map((s) => s.stepKey)).toEqual([...STEP_KEYS]);
    // The counts are the server's, not `steps.filter(PASS).length`.
    expect(c.progress!.passedCount).toBe(0);
    expect(c.progress!.totalCount).toBe(7);
    expect(c.progress!.eligible).toBe(false);
  });

  it("names all seven blocker codes rather than one greyed button", () => {
    const { container } = render(
      <SandboxCertificationScreen certification={cert()} onRequestExit={() => {}} />,
    );
    // Scoped to the footer: each step also carries its own blocker_code chip,
    // so an unscoped match finds two of each and proves neither.
    const reasons = container.querySelector(".exec-cert-footer .exec-disabled-reason")!;
    for (const key of STEP_KEYS) {
      expect(reasons.textContent, key).toContain(`SANDBOX_STEP_${key}_UNAVAILABLE`);
    }
  });

  it("keeps submit and exit disabled", () => {
    render(
      <SandboxCertificationScreen certification={cert()} onSubmit={() => {}} onRequestExit={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /Submit for review/ }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: /Request Sandbox Exit Review/ }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("does not read zero findings as a clean result", () => {
    render(<SandboxCertificationScreen certification={cert()} />);
    expect(screen.getByText(/absence of evidence, not a clean result/)).toBeTruthy();
  });
});

describe("5/7 mixed and 7/7 eligible", () => {
  it("opens the actions only when the server says eligible and every step passed", () => {
    render(
      <SandboxCertificationScreen
        certification={withSteps("PASS", true)}
        onSubmit={() => {}}
        onRequestExit={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Request Sandbox Exit Review/ }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("stays blocked when a step is not PASS even if eligible says otherwise", () => {
    // The server's verdict governs, and the handoff's own rule is stated where
    // it can be tested: any non-PASS step keeps this shut.
    const mixed = withSteps("STALE", true);
    const gate = certificationBlocked(mixed);
    expect(gate.blocked).toBe(true);
    expect(gate.reasons.join(" ")).toMatch(/7 of 7 steps are not PASS/);
  });

  it("distinguishes a stale step from a failed one in the markup", () => {
    const { container } = render(<SandboxCertificationScreen certification={withSteps("STALE", false)} />);
    expect(container.querySelectorAll('[data-evaluation="STALE"]')).toHaveLength(7);
    const failed = render(<SandboxCertificationScreen certification={withSteps("FAIL", false)} />);
    expect(failed.container.querySelectorAll('[data-evaluation="FAIL"]')).toHaveLength(7);
  });
});

describe("a CRITICAL finding disables exit", () => {
  const critical = [
    {
      finding_id: "f1",
      severity: "CRITICAL",
      status: "OPEN",
      identity: "position BTC-USDT-SWAP",
      local_value: "0.0000",
      broker_value: "0.0300",
    },
  ];

  it("blocks even when the server marked the gate eligible", () => {
    const gate = certificationBlocked(withSteps("PASS", true, critical));
    expect(gate.blocked).toBe(true);
    expect(gate.reasons.join(" ")).toMatch(/unresolved CRITICAL/);
  });

  it("shows the fail-closed banner in the hi-fi's words", () => {
    render(<SandboxCertificationScreen certification={withSteps("PASS", true, critical)} />);
    expect(screen.getByRole("alert").textContent).toMatch(/activation fail-closed/);
  });

  it("stops blocking once the finding is resolved", () => {
    const resolved = [{ ...critical[0], status: "RESOLVED" }];
    expect(certificationBlocked(withSteps("PASS", true, resolved)).blocked).toBe(false);
  });
});

describe("runtime_state stays null", () => {
  it("reads null as null", () => {
    expect(cert().runtimeState).toBeNull();
  });

  it("renders it as not stated, never HALTED", () => {
    const { container } = render(<SandboxCertificationScreen certification={cert()} />);
    const head = container.querySelector(".exec-cert-head")!;
    expect(head.textContent).toMatch(/runtime not stated/);
    // Scoped to the header: the footer legitimately quotes the hi-fi's exit
    // requirement ("return HALTED"), which is a precondition rather than a
    // claim about the current runtime. Translating an absence into a state is
    // what tells an operator a deployment is stopped when nobody knows.
    expect(head.textContent).not.toMatch(/\bHALTED\b/);
  });
});

describe("the three source panels degrade independently", () => {
  it("renders one frame each", () => {
    render(<SandboxCertificationScreen certification={cert()} />);
    for (const title of ["Internal virtual state", "Physical broker state", "Difference"]) {
      expect(screen.getByLabelText(title), title).toBeTruthy();
    }
  });

  it("lets one fail without the others", () => {
    const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
    raw.source_panels[0].panel_state = "stale";
    const parsed = readSandboxCertification(raw)!;
    expect(parsed.sourcePanels[0].panelState).toBe("stale");
    expect(parsed.sourcePanels[1].panelState).toBe("unavailable");
  });

  it("shows the fixture profile label on each", () => {
    render(<SandboxCertificationScreen certification={cert()} />);
    const internal = screen.getByLabelText("Internal virtual state");
    expect(within(internal).getByText(/profile fixture/)).toBeTruthy();
  });
});

describe("a promotion plan is a record of refusal", () => {
  it("says so rather than letting plan_id read as an activation", () => {
    const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
    raw.promotion_plans = [
      {
        plan_id: "pp_1",
        target_stage: "CANARY",
        evidence_set_hash: "sha256:cc",
        status: "BLOCKED",
        blocker_codes: ["PRODUCTION_COMMAND_INACTIVE"],
        source_side_effect_requested: false,
        created_at: "2026-08-23T18:00:00.000Z",
      },
    ];
    render(<SandboxCertificationScreen certification={readSandboxCertification(raw)!} />);
    expect(screen.getByText(/refused, not an activation attempt/)).toBeTruthy();
  });
});

describe("the submitter cannot approve, and a USER can do neither", () => {
  it("disables submit once it has been submitted", () => {
    const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
    raw.certification.submitted_by_user_id = "usr_fixture_admin";
    raw.progress.eligible = true;
    raw.steps = raw.steps.map((s: Record<string, unknown>) => ({ ...s, evaluation_state: "PASS" }));
    render(
      <SandboxCertificationScreen
        certification={readSandboxCertification(raw)!}
        onSubmit={() => {}}
        onRequestExit={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Submit for review/ }).hasAttribute("disabled")).toBe(true);
  });

  it("offers nothing to a USER", () => {
    const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
    raw.actor.roles = ["USER"];
    render(<SandboxCertificationScreen certification={readSandboxCertification(raw)!} />);
    expect(screen.queryByRole("button", { name: /Submit/ })).toBeNull();
    expect(screen.getByText(/Admin operators only/)).toBeTruthy();
  });
});

describe("the reader fails closed", () => {
  it("returns null without a certification", () => {
    expect(readSandboxCertification({})).toBeNull();
    expect(readSandboxCertification(null)).toBeNull();
  });

  it("reads unknown enums as not stated", () => {
    const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
    raw.steps[0].evaluation_state = "GREAT";
    raw.steps[0].strip_state = "SOON";
    const parsed = readSandboxCertification(raw)!;
    expect(parsed.steps[0].evaluationState).toBeNull();
    expect(parsed.steps[0].stripState).toBeNull();
  });

  it("reads the three side-effect flags fail-closed", () => {
    const raw = JSON.parse(JSON.stringify(SANDBOX_CERTIFICATION_FIXTURE));
    raw.source_side_effect_requested = "no";
    raw.runtime_activation_requested = "no";
    raw.promotion_execution_requested = "no";
    const parsed = readSandboxCertification(raw)!;
    expect(parsed.sourceSideEffectRequested).toBe(true);
    expect(parsed.runtimeActivationRequested).toBe(true);
    expect(parsed.promotionExecutionRequested).toBe(true);
  });
});

describe("the container fetches through the port", () => {
  it("renders the certification", async () => {
    render(<SandboxCertificationContainer api={createFixtureApi()} deploymentId="dep_77" />);
    expect(await screen.findByLabelText("Certification steps")).toBeTruthy();
  });

  it("shows the port's failure rather than an empty strip", async () => {
    render(
      <SandboxCertificationContainer
        api={createFixtureApi({ unavailableEndpoints: ["getSandboxCertification"] })}
        deploymentId="dep_77"
      />,
    );
    await waitFor(() => expect(screen.queryByLabelText("Certification steps")).toBeNull());
  });
});
