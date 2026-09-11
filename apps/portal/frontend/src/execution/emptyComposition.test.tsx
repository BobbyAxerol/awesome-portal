/**
 * PHASE 8 (round 2) · the empty screen keeps its shape, and says one thing once.
 *
 * Three defects this file exists to catch, each of which a green suite has
 * already let through once:
 *
 *  - the screen collapsing to a single line, so the reader learns nothing
 *    about what a Gate R1 review holds (Gate R1/R2/Live, measured 2026-09-11);
 *  - the actor sentence repeating per panel, which printed it six times on
 *    Incident Detail while 2 166 tests stayed green;
 *  - a panel being labelled empty when the screen never asked for its data,
 *    which is a claim about a query that did not run.
 *
 * There is deliberately no assertion on how MUCH text a screen renders. The
 * first draft of this phase proposed "no detail screen under 400 characters"
 * and codex rejected it: a length gate is satisfied by padding, and padding is
 * the failure being prevented.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EMPTY_COMPOSITION, type EmptyRecordScreen } from "./components/emptyComposition";
import { RECORD_PRODUCERS } from "./components/recordProducer";
import { GateR1Review } from "./screens/GateR1Review";
import { GateR2Review } from "./screens/GateR2Review";
import { GateLiveReview } from "./screens/GateLiveReview";
import { CanaryControlRoomScreen } from "./screens/CanaryControlRoom";
import { SandboxCertificationScreen } from "./screens/SandboxCertification";

afterEach(cleanup);

const NOT_FOUND = "APPROVAL_NOT_FOUND: Approval not found.";

/** Each screen class, rendered with the record absent. */
const RENDERERS: Record<EmptyRecordScreen, (status: "unavailable" | "denied") => void> = {
  "gate-r1": (status) => {
    render(
      <GateR1Review
        approvalId="AP-201" alphaLabel="RSI v1.7" quorumMet={0} quorumRequired={2}
        policyVersion="approval.v3" creator="Minh" actor="Lan" passport={[]} checklist={[]}
        onRequestCondition={() => undefined} status={status} reason={NOT_FOUND}
      />,
    );
  },
  "gate-r2": (status) => {
    render(
      <GateR2Review
        approvalId="AP-352" subject="Carry v3.2" r1Id="AP-201" r1State="APPROVED"
        policyVersion="approval.v3" planAuthor="Minh" actor="Lan" quorumMet={0} quorumRequired={2}
        readiness={[]} capital={[]} onRequestCondition={() => undefined}
        status={status} reason={NOT_FOUND}
      />,
    );
  },
  "gate-live": (status) => {
    render(
      <GateLiveReview
        approvalId="AP-311" actor="Lan" policyVersion="approval.v3" quorumMet={0} quorumRequired={2}
        note="" onNoteChange={() => undefined} onApprove={() => undefined} onDeny={() => undefined}
        locked denyLocked status={status} reason={NOT_FOUND}
      />,
    );
  },
  "canary-control-room": (status) => {
    render(<CanaryControlRoomScreen room={null} status={status} reason={NOT_FOUND} />);
  },
  "sandbox-certification": (status) => {
    render(<SandboxCertificationScreen certification={null} status={status} reason={NOT_FOUND} />);
  },
};

const SCREENS = Object.keys(EMPTY_COMPOSITION) as EmptyRecordScreen[];

describe("the allowlist is internally coherent", () => {
  it.each(SCREENS)("%s names each panel once and never both allows and withholds one", (key) => {
    const spec = EMPTY_COMPOSITION[key];
    const shown = spec.panels.map((p) => p.title);
    const held = spec.withheld.map((w) => w.title);
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown.filter((t) => held.includes(t))).toEqual([]);
    // A withheld panel without a stated reason is a panel someone forgot.
    for (const w of spec.withheld) expect(w.because.length).toBeGreaterThan(40);
    // "holds" is the teaching part; an empty one makes the panel a label.
    for (const p of spec.panels) expect(p.holds.length).toBeGreaterThan(10);
  });
});

describe("an absent record keeps the reviewed hierarchy", () => {
  it.each(SCREENS)("%s draws every allowlisted panel", (key) => {
    RENDERERS[key]("unavailable");
    for (const panel of EMPTY_COMPOSITION[key].panels) {
      expect(screen.getByLabelText(panel.title)).toBeTruthy();
    }
  });

  it.each(SCREENS)("%s says who opens the record exactly once", (key) => {
    RENDERERS[key]("unavailable");
    const sentence = RECORD_PRODUCERS[EMPTY_COMPOSITION[key].recordKind].sentence;
    const text = document.body.textContent ?? "";
    expect(text.split(sentence).length - 1).toBe(1);
  });

  it.each(SCREENS)("%s never labels a withheld panel empty", (key) => {
    RENDERERS[key]("unavailable");
    for (const withheld of EMPTY_COMPOSITION[key].withheld) {
      expect(screen.queryByLabelText(withheld.title)).toBeNull();
    }
  });

  /* F10 — an operator must be able to tell "no findings" from "not consumed",
     and only the relation name does that. */
  it.each(SCREENS)("%s names the source relation where a panel reads one", (key) => {
    RENDERERS[key]("unavailable");
    const text = document.body.textContent ?? "";
    for (const panel of EMPTY_COMPOSITION[key].panels) {
      if (panel.relation) expect(text).toContain(panel.relation);
    }
  });
});

describe("a refusal is not an absence", () => {
  it.each(SCREENS)("%s draws no panel frame when denied", (key) => {
    RENDERERS[key]("denied");
    for (const panel of EMPTY_COMPOSITION[key].panels) {
      expect(screen.queryByLabelText(panel.title)).toBeNull();
    }
  });
});
