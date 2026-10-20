/**
 * FE-068 · the stage screens' disabled controls take their reason from the caller's own advisory eligibility when the server
 * published one, and keep today's generic reason otherwise. Nothing here ever enables a control.
 *
 * Bodies are the canonical `governance-requester-reads` fixture cases read through the strict reader. Lane: FIXTURE_LAB.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { readStageActionEligibilityV1, type StageActionEligibility, type StageActionEligibilityRead } from "../../readers/stageActionEligibility";
import { loadCanonical } from "../../testkit/loadCanonical";
import { DecisionPanel } from "../canary/Rail";
import { DECISIONS } from "../canary/model";
import { ProtectiveLadder } from "../live/tabs";
import { LADDER, type LiveModel } from "../live/model";
import { ReviewNoteForm } from "../sandbox/ReviewNoteForm";
import {
  NOT_COMMISSIONED_WHY, STAGE_WHY, sessionStepUpText, stageActionReason, stageWhy,
} from "./reasons";
import StageEligibilityProvider, { useStageEligibility } from "./StageEligibility";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Draft = any;
const CASES = loadCanonical<{ stage_action_eligibility: Record<string, Draft> }>("governance-requester-reads.synthetic").stage_action_eligibility;

function readOf(body: unknown): Result<StageActionEligibilityRead> {
  const value = readStageActionEligibilityV1(body);
  return value === null ? { ok: false, status: "unavailable", reason: "unreadable" } : { ok: true, value };
}
const eligibilityOf = (name: string): StageActionEligibility => {
  const read = readStageActionEligibilityV1(CASES[name]);
  if (read === null || read.kind !== "stage_action_eligibility") throw new Error(`case ${name} unreadable`);
  return read.eligibility;
};

function fakeApi(answer: (workspaceId: string | undefined, call: number) => Result<StageActionEligibilityRead> | Promise<Result<StageActionEligibilityRead>>) {
  let calls = 0;
  const getStageActionEligibility = vi.fn(async (workspaceId?: string) => answer(workspaceId, ++calls));
  return { api: { getStageActionEligibility } as unknown as ExecutionApi, getStageActionEligibility };
}

const NOT_COMMISSIONED_TEXT = `${NOT_COMMISSIONED_WHY} · Basis: none published · Step-up: not determined`;

describe("stageActionReason (pure text)", () => {
  it("NOT_COMMISSIONED reads 'Not offered in the portal yet' with the basis and the step-up state as text", () => {
    for (const action of ["canary.hold", "canary.reduce", "canary.rollback", "canary.request_scale", "live.halt", "live.reduce", "live.emergency_close"] as const) {
      expect(stageActionReason(eligibilityOf("admin_with_r2_read"), action, "fallback")).toBe(NOT_COMMISSIONED_TEXT);
    }
  });

  it("maps the refusing classes to the stage dictionary, with the basis and step-up state", () => {
    expect(stageActionReason(eligibilityOf("plain_user"), "sandbox.review_note", "fallback")).toBe(`${STAGE_WHY.noGrant} · Basis: Admin role · Step-up: not required`);
    expect(stageActionReason(eligibilityOf("admin_without_r2_grant"), "paper.exit_review_request", "fallback"))
      .toBe(`${STAGE_WHY.noGrant} · Basis: Admin role and the R2 read grant · Step-up: not required`);
    expect(stageActionReason(eligibilityOf("admin_other_workspace_grant"), "paper.exit_review_request", "fallback")).toMatch(/^Needs the approver grant/);
    expect(stageActionReason(eligibilityOf("projection_not_authorized"), "paper.exit_review_request", "fallback")).toMatch(/^Not enabled for this profile/);
    expect(stageActionReason(eligibilityOf("retained_review_read_only"), "approval.create", "fallback"))
      .toBe(`${STAGE_WHY.readOnly} · Basis: workspace membership · Step-up: not required`);
  });

  it("an ELIGIBLE row, a missing read and an unknown action all keep the control's own reason, word for word", () => {
    expect(stageActionReason(eligibilityOf("admin_with_r2_read"), "approval.create", "Blocked until every step passes")).toBe("Blocked until every step passes");
    expect(stageActionReason(null, "canary.hold", stageWhy("liveClosed"))).toBe(STAGE_WHY.liveClosed);
    expect(stageActionReason(undefined, "live.halt", "fallback")).toBe("fallback");
    expect(stageActionReason(eligibilityOf("admin_with_r2_read"), "nope" as never, "fallback")).toBe("fallback");
  });

  it("every sentence is plain: no dash, no N/A, no trailing stop, no raw reason code", () => {
    for (const name of Object.keys(CASES)) {
      for (const row of eligibilityOf(name).actions) {
        const text = stageActionReason(eligibilityOf(name), row.action, "fallback");
        expect(text, `${name} ${row.action}`).not.toMatch(/[—–]|N\/A|\.$|[A-Z]{3,}_[A-Z]/);
      }
    }
  });

  it("the session step-up is told as a fact about the session", () => {
    const fmt = (ms: number) => `T${ms}`;
    expect(sessionStepUpText(eligibilityOf("session_step_up_active"), fmt)).toBe("This session has an active step-up until T1792300120000");
    expect(sessionStepUpText(eligibilityOf("plain_user"), fmt)).toBe("This session has no active step-up");
    expect(sessionStepUpText(null, fmt)).toBeNull();
  });
});

const dock = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
const reasonOf = (label: string) => {
  const button = screen.getByRole("button", { name: label });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};

describe("canary decisions", () => {
  it("without a provider the four decisions read today's sentence and are all disabled", () => {
    dock(<DecisionPanel />);
    for (const d of DECISIONS) {
      expect((screen.getByRole("button", { name: d.label }) as HTMLButtonElement).disabled).toBe(true);
      expect(reasonOf(d.label)).toBe(STAGE_WHY.liveClosed);
    }
  });

  it("under a provider they read the server's NOT_COMMISSIONED reason, and every one is still disabled", async () => {
    const { api } = fakeApi(() => readOf(CASES.admin_with_r2_read));
    dock(<StageEligibilityProvider api={api}><DecisionPanel /></StageEligibilityProvider>);
    await waitFor(() => expect(reasonOf("Hold")).toBe(NOT_COMMISSIONED_TEXT));
    for (const d of DECISIONS) {
      expect(reasonOf(d.label)).toBe(NOT_COMMISSIONED_TEXT);
      expect((screen.getByRole("button", { name: d.label }) as HTMLButtonElement).disabled, d.label).toBe(true);
    }
  });

  it("even a body that says ELIGIBLE for everything cannot be read (the schema pins canary NOT_COMMISSIONED), so the decisions keep today's sentence", async () => {
    const forged = structuredClone(CASES.admin_with_r2_read);
    Object.assign(forged.actions[3], { verdict: "ELIGIBLE", eligible: true, reason_class: "SUBMIT_CHECKS_REQUIRED", public_copy_key: "SUBMIT_CHECKS_REQUIRED" });
    const { api, getStageActionEligibility } = fakeApi(() => readOf(forged));
    dock(<StageEligibilityProvider api={api}><DecisionPanel /></StageEligibilityProvider>);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(reasonOf("Hold")).toBe(STAGE_WHY.liveClosed);
    expect((screen.getByRole("button", { name: "Hold" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a failed read keeps today's sentence", async () => {
    const { api, getStageActionEligibility } = fakeApi(() => ({ ok: false, status: "unavailable", reason: "INTERNAL_ERROR" }));
    dock(<StageEligibilityProvider api={api}><DecisionPanel /></StageEligibilityProvider>);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(reasonOf("Rollback")).toBe(STAGE_WHY.liveClosed);
  });

  it("a port with no such method keeps today's sentence", async () => {
    dock(<StageEligibilityProvider api={{} as unknown as ExecutionApi}><DecisionPanel /></StageEligibilityProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(reasonOf("Request scale")).toBe(STAGE_WHY.liveClosed);
  });
});

describe("live protective ladder", () => {
  const model = { ladder: LADDER, gapNote: null } as unknown as LiveModel;

  it("without a provider every rung reads 'Live decisions are closed on this build'", () => {
    dock(<ProtectiveLadder model={model} />);
    for (const rung of LADDER) expect(reasonOf(rung.title)).toBe(STAGE_WHY.liveClosed);
  });

  it("under a provider each rung reads the server's reason and stays disabled", async () => {
    const { api } = fakeApi(() => readOf(CASES.admin_with_r2_read));
    dock(<StageEligibilityProvider api={api}><ProtectiveLadder model={model} /></StageEligibilityProvider>);
    await waitFor(() => expect(reasonOf("Halt")).toBe(NOT_COMMISSIONED_TEXT));
    for (const rung of LADDER) {
      expect(reasonOf(rung.title)).toBe(NOT_COMMISSIONED_TEXT);
      expect((screen.getByRole("button", { name: rung.title }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("sandbox review note", () => {
  const identity = { workspaceId: "ws_TEST_ONLY", workflowVersion: 3 } as never;
  const shut = (api: ExecutionApi, node = true) =>
    dock(
      node
        ? <StageEligibilityProvider api={api}><ReviewNoteForm api={api} capability={{ state: "unavailable", reasonCode: "ADMIN_ROLE_REQUIRED" }} identity={identity} onRecorded={() => undefined} /></StageEligibilityProvider>
        : <ReviewNoteForm api={api} capability={{ state: "unavailable", reasonCode: "ADMIN_ROLE_REQUIRED" }} identity={identity} onRecorded={() => undefined} />,
    );

  it("a shut note without a provider reads today's sentence", () => {
    shut({} as unknown as ExecutionApi, false);
    expect(reasonOf("Record review note")).toBe(STAGE_WHY.notEnabled);
  });

  it("a shut note under a provider reads the server's reason for sandbox.review_note", async () => {
    const { api } = fakeApi(() => readOf(CASES.plain_user));
    shut(api);
    await waitFor(() => expect(reasonOf("Record review note")).toBe(`${STAGE_WHY.noGrant} · Basis: Admin role · Step-up: not required`));
    expect((screen.getByRole("button", { name: "Record review note" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an ELIGIBLE verdict does not open a shut note", async () => {
    const { api, getStageActionEligibility } = fakeApi(() => readOf(CASES.admin_with_r2_read));
    shut(api);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(reasonOf("Record review note")).toBe(STAGE_WHY.notEnabled);
    expect((screen.getByRole("button", { name: "Record review note" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the provider", () => {
  function Probe() {
    const eligibility = useStageEligibility();
    return <output data-testid="probe">{eligibility === null ? "none" : eligibility.workspaceId + ":" + eligibility.actions[1]!.verdict}</output>;
  }

  it("asks on mount with the workspace, and again when the window regains focus (never cached)", async () => {
    const { api, getStageActionEligibility } = fakeApi((_ws, call) => readOf(call === 1 ? CASES.plain_user : CASES.admin_with_r2_read));
    render(<StageEligibilityProvider api={api} workspaceId="ws_TEST_ONLY"><Probe /></StageEligibilityProvider>);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ws_TEST_ONLY:NOT_ELIGIBLE"));
    expect(getStageActionEligibility).toHaveBeenCalledWith("ws_TEST_ONLY");
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ws_TEST_ONLY:ELIGIBLE"));
    expect(getStageActionEligibility).toHaveBeenCalledTimes(2);
  });

  it("a focus while a read is out does not start a second one", async () => {
    let release!: (value: Result<StageActionEligibilityRead>) => void;
    const slow = new Promise<Result<StageActionEligibilityRead>>((resolve) => { release = resolve; });
    const { api, getStageActionEligibility } = fakeApi(() => slow);
    render(<StageEligibilityProvider api={api}><Probe /></StageEligibilityProvider>);
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
    expect(getStageActionEligibility).toHaveBeenCalledTimes(1);
    release(readOf(CASES.plain_user));
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ws_TEST_ONLY:NOT_ELIGIBLE"));
  });

  it("a workspace switch asks again, and the old workspace's late answer is dropped", async () => {
    let releaseOld!: (value: Result<StageActionEligibilityRead>) => void;
    const old = new Promise<Result<StageActionEligibilityRead>>((resolve) => { releaseOld = resolve; });
    const other = structuredClone(CASES.admin_with_r2_read);
    other.workspace_id = "ws_OTHER";
    const { api, getStageActionEligibility } = fakeApi((ws) => (ws === "ws_TEST_ONLY" ? old : readOf(other)));
    const view = render(<StageEligibilityProvider api={api} workspaceId="ws_TEST_ONLY"><Probe /></StageEligibilityProvider>);
    view.rerender(<StageEligibilityProvider api={api} workspaceId="ws_OTHER"><Probe /></StageEligibilityProvider>);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ws_OTHER:ELIGIBLE"));
    releaseOld(readOf(CASES.plain_user));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId("probe").textContent).toBe("ws_OTHER:ELIGIBLE");
    expect(getStageActionEligibility).toHaveBeenCalledTimes(2);
  });

  it("a body for another workspace than the one asked is not an answer", async () => {
    const { api, getStageActionEligibility } = fakeApi(() => readOf(CASES.plain_user));
    render(<StageEligibilityProvider api={api} workspaceId="ws_ELSEWHERE"><Probe /></StageEligibilityProvider>);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("probe").textContent).toBe("none");
  });

  it("a failed re-ask forgets the earlier answer instead of keeping a stale reason", async () => {
    const { api } = fakeApi((_ws, call) => (call === 1 ? readOf(CASES.plain_user) : { ok: false, status: "unavailable", reason: "INTERNAL_ERROR" }));
    render(<StageEligibilityProvider api={api}><Probe /></StageEligibilityProvider>);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ws_TEST_ONLY:NOT_ELIGIBLE"));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("none"));
  });

  it("unmounting stops listening", async () => {
    const { api, getStageActionEligibility } = fakeApi(() => readOf(CASES.plain_user));
    const view = render(<StageEligibilityProvider api={api}><Probe /></StageEligibilityProvider>);
    await waitFor(() => expect(getStageActionEligibility).toHaveBeenCalledTimes(1));
    view.unmount();
    window.dispatchEvent(new Event("focus"));
    expect(getStageActionEligibility).toHaveBeenCalledTimes(1);
  });
});
