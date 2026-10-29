/** The Live-gate evidence frame prints the inbox row's blocker line only through the guarded join (R-B); otherwise the generic state stands. */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readLiveParentV2 } from "../../readers/governanceParents";
import { loadCanonical } from "../../testkit/loadCanonical";
import { EvidenceFrame, type EvidenceState } from "./EvidenceFrame";
import type { InboxRowV2 } from "./inboxRowV2";

afterEach(cleanup);

const fixture = loadCanonical<Record<string, any>>("execution-positive-parent.synthetic");
const incomplete = () => {
  const parent = readLiveParentV2(fixture.live)!;
  return { ...parent, approval: { ...parent.approval, evidenceComplete: false } };
};
const WS = incomplete().header.workspaceId;
const rowFor = (over: Partial<InboxRowV2> = {}): InboxRowV2 => {
  const parent = incomplete();
  return {
    id: parent.approval.approvalId, gate: "LIVE_GATE", subject: "Live gate", subjectId: parent.anchors.deploymentId, subjectType: "DEPLOYMENT", target: null,
    environment: "LIVE", releaseCandidate: null, requester: null, creator: null, status: "PENDING", policyVersion: null, approvalVersion: parent.approval.approvalVersion,
    blockerCount: 4, blockerSummary: "Four Canary branches are unavailable", sla: null, quorumMet: 0, quorumRequired: 2, inert: null, needsYou: false, updatedAt: null, ...over,
  };
};
const ready = (): EvidenceState => ({ status: "ready", partial: false, data: { kind: "livev2", parent: incomplete() }, warnings: [] });
const mount = (props: Partial<Parameters<typeof EvidenceFrame>[0]> = {}) =>
  render(
    <MemoryRouter>
      <EvidenceFrame kind="live" header={{ id: incomplete().approval.approvalId, title: "Live gate", context: null, gate: "LIVE_GATE" }} evidence={ready()} blockerRow={rowFor()} requestedWorkspace={WS} inboxCurrent {...props} />
    </MemoryRouter>,
  );
const text = () => document.body.textContent ?? "";

describe("Live evidence banner and the guarded blocker join", () => {
  it("a full match adds one line with the row's count and summary under 'Evidence incomplete'", () => {
    mount();
    expect(text()).toMatch(/Evidence incomplete/);
    expect(text()).toContain("Blockers: 4 blockers · Four Canary branches are unavailable");
  });

  it.each([
    ["a different subject id", { subjectId: "dep_other" }],
    ["a different approval version", { approvalVersion: 99 }],
    ["a different gate", { gate: "R2" as const }],
    ["a null summary", { blockerSummary: null }],
  ])("%s keeps the generic incomplete state and prints no blocker line", (_n, over) => {
    mount({ blockerRow: rowFor(over as Partial<InboxRowV2>) });
    expect(text()).toMatch(/Evidence incomplete/);
    expect(text()).not.toMatch(/Blockers:/);
    expect(text()).not.toMatch(/no blockers|0 blockers/i);
  });

  it("a row that is paged out, a stale inbox, or another workspace prints nothing either", () => {
    for (const props of [{ blockerRow: null }, { inboxCurrent: false }, { requestedWorkspace: "ws_other" }] as const) {
      mount(props);
      expect(text()).toMatch(/Evidence incomplete/);
      expect(text()).not.toMatch(/Blockers:/);
      cleanup();
    }
  });

  it("a row is present but the gate read was denied: the row's summary is not shown on a gate that was not read", () => {
    mount({ evidence: { status: "failed", panel: "denied", reason: "Your session may not read this gate." } });
    expect(text()).not.toMatch(/Blockers:|Four Canary branches/);
    expect(screen.queryByText(/Evidence ready/)).toBeNull();
  });
});
