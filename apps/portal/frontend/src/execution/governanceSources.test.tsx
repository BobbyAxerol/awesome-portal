/** §56 consumer — checklist source links and per-run claim choices, from the published synthetic fixture (not copied). */
import { cleanup, render, screen } from "@testing-library/react";
import { choose } from "./choiceTestUtil";
import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../../../packages/contracts/fixtures/governance-review-sources.synthetic.valid.json";
import { readChecklistItem } from "./api/rows";
import { GateR1Review, refHref } from "./screens/GateR1Review";
import { NewApprovalRequestScreen } from "./screens/NewApprovalRequest";
import { readRunOptions } from "./runSuggestions";

afterEach(cleanup);

const withRun = (extra: Record<string, unknown>) => ({ items: [{ run_id: "rrun_a", status: "COMPLETED", binding: { alpha_id: "alpha_rsi" }, ...extra }] });

describe("checklist source reference", () => {
  it("reads a linked finding with its actual kind, and an absent one with its typed reason", () => {
    expect(readChecklistItem(fixture.linked_checklist)).toMatchObject({ ref: { kind: "RUN", runId: "run_5512" }, refReason: null });
    expect(readChecklistItem({ ...fixture.absent_checklist, label: "x", outcome: "pass" })).toMatchObject({ ref: null, refReason: "R1_FINDING_SOURCE_NOT_RECORDED" });
  });
  it("keeps historical responses (no field) unchanged, and refuses an unsafe run id instead of linking it", () => {
    expect(readChecklistItem({ label: "x", outcome: "pass" })).not.toHaveProperty("ref");
    expect(readChecklistItem({ label: "x", outcome: "pass", evidence_ref: { kind: "RUN", id: "a", run_id: "../../admin" } })).toMatchObject({ ref: null, refReason: "R1_EVIDENCE_SOURCE_NOT_LINKABLE" });
    expect(readChecklistItem({ label: "x", outcome: "pass", evidence_ref: { kind: "NOTE", id: "a", run_id: "run_1" } })).toMatchObject({ ref: null });
  });
  it("links to the run's own screen and keeps the approval's workspace; a RUN is never worded as a Report", () => {
    expect(refHref({ kind: "REPORT", runId: "run_5512" }, "ws_1")).toBe("/research/quantbt/runs/run_5512/report?workspace_id=ws_1");
    expect(refHref({ kind: "RUN", runId: "run_5512" }, null)).toBe("/research/quantbt/runs/run_5512/overview");
    const item = readChecklistItem(fixture.linked_checklist)!;
    render(
      <GateR1Review approvalId="AP-1" alphaLabel="RSI" quorumMet={0} quorumRequired={2} policyVersion="v3" creator="A" actor="B" passport={[]}
        checklist={[item, { label: "No source finding", outcome: "pass", ref: null, refReason: "R1_FINDING_SOURCE_NOT_RECORDED" }]}
        evidenceWorkspaceId="ws_1" onRequestCondition={vi.fn()} />,
    );
    const link = document.querySelector("[data-evidence-ref]") as HTMLAnchorElement;
    expect(link.textContent).toContain("Run · run_5512");
    expect(link.textContent).not.toContain("Report");
    expect(link.getAttribute("href")).toBe("/research/quantbt/runs/run_5512/overview?workspace_id=ws_1");
    expect(document.querySelector("[data-evidence-ref-absent]")!.getAttribute("title")).toBe("the finding recorded no source");
  });
});

describe("claims per run", () => {
  it("tells apart listed ids, an empty list, an unpublished list and a legacy response", () => {
    expect(readRunOptions(withRun(fixture.claims))[0]!.claims).toEqual([{ id: "claim_1", grade: null, state: null }]);
    expect(readRunOptions(withRun(fixture.empty_claims))[0]!.claims).toEqual([]);
    expect(readRunOptions(withRun(fixture.absent_claims))[0]).toMatchObject({ claims: null, claimsReason: "R1_INTAKE_RUN_NOT_PUBLISHED" });
    expect(readRunOptions(withRun({}))[0]).not.toHaveProperty("claims");
  });
  const base = { onSubmit: vi.fn(), outcome: null, submitting: false, onReset: vi.fn() } as const;
  it("picking a run with exactly one eligible claim takes it; several are left to the reader; none says so", () => {
    render(<NewApprovalRequestScreen {...base} runOptions={readRunOptions(withRun(fixture.claims))} />);
    choose("Pick a completed run from Research", /alpha_rsi/);
    expect((screen.getByLabelText("Methodology claim") as HTMLInputElement).value).toBe("claim_1");
    cleanup();
    render(<NewApprovalRequestScreen {...base} runOptions={readRunOptions(withRun({ ...fixture.claims, eligible_methodology_claim_ids: ["c1", "c2"], methodology_claims: [] }))} />);
    choose("Pick a completed run from Research", /alpha_rsi/);
    expect((screen.getByLabelText("Methodology claim") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Pick a methodology claim for this run" })).toBeTruthy();
    cleanup();
    render(<NewApprovalRequestScreen {...base} runOptions={readRunOptions(withRun(fixture.empty_claims))} />);
    choose("Pick a completed run from Research", /alpha_rsi/);
    expect(document.querySelector("[data-claims-note]")!.textContent).toMatch(/lists no eligible claim/);
  });
});
