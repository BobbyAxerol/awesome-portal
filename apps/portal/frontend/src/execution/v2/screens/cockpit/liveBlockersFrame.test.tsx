/** The Live-gate evidence frame prints a blocker line only from the gate's own snapshot block (R-B); otherwise the generic state stands. */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readLiveParentV2 } from "../../readers/governanceParents";
import { loadCanonical } from "../../testkit/loadCanonical";
import { EvidenceFrame, type EvidenceState } from "./EvidenceFrame";

afterEach(cleanup);

const fixture = loadCanonical<Record<string, any>>("execution-positive-parent.synthetic");
/** The canonical fixture parent is already `evidence_complete: false`. */
const parentOf = (name: string) => readLiveParentV2(fixture[name])!;
const ready = (name: string): EvidenceState => ({ status: "ready", partial: false, data: { kind: "livev2", parent: parentOf(name) }, warnings: [] });
const mount = (evidence: EvidenceState) =>
  render(
    <MemoryRouter>
      <EvidenceFrame kind="live" header={{ id: parentOf("live").approval.approvalId, title: "Live gate", context: null, gate: "LIVE_GATE" }} evidence={evidence} />
    </MemoryRouter>,
  );
const text = () => document.body.textContent ?? "";

describe("Live evidence banner and the snapshot blocker block", () => {
  it("an authorized block adds one line with its count and summary under 'Evidence incomplete'", () => {
    mount(ready("live_blockers"));
    expect(text()).toMatch(/Evidence incomplete/);
    expect(text()).toContain("Blockers: 2 blockers · TEST_ONLY: two stored blockers");
  });

  it.each([
    ["no block (purpose not authorized / older server)", "live"],
    ["a declared absence", "live_blockers_absent"],
    ["zero blockers with a null summary", "live_blockers_zero"],
  ])("%s keeps the generic incomplete state and prints no blocker line", (_n, name) => {
    mount(ready(name));
    expect(text()).toMatch(/Evidence incomplete/);
    expect(text()).not.toMatch(/Blockers:/);
    expect(text()).not.toMatch(/no blockers|0 blockers/i);
  });

  it("an inconsistent block refuses the gate body at the reader, so no verdict is built from it", () => {
    const body = structuredClone(fixture.live_blockers);
    body.blockers.approval_version = 99;
    expect(readLiveParentV2(body)).toBeNull();
  });

  it("the gate read was denied: no blocker text is shown", () => {
    mount({ status: "failed", panel: "denied", reason: "Your session may not read this gate." });
    expect(text()).not.toMatch(/Blockers:|stored blockers/);
    expect(screen.queryByText(/Evidence ready/)).toBeNull();
  });
});
