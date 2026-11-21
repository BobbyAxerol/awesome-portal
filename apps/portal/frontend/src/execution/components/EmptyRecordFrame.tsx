/**
 * PHASE 8 (round 2) · the reviewed panel hierarchy, kept when the record is not.
 *
 * `IncidentDetail` already answered an absent incident this way and it reads
 * well: five named panels, the controls left in place and disabled, and one
 * sentence saying who opens an incident. This generalises that branch so the
 * five gate/canary/certification screens answer the same way, rather than each
 * inventing a different shape of blank.
 *
 * Two rules the shape enforces, both from the BE-R2 handoff §3:
 *
 * ONE SENTENCE, AT SCREEN LEVEL. The actor/next-source explanation is rendered
 * exactly once, above the panels. Phase 5 attached it to every panel instead
 * and Incident Detail printed it six times; 2 166 green tests did not notice
 * and a screenshot did. `panels` therefore carries no producer text at all —
 * the repetition is not discouraged here, it is unrepresentable.
 *
 * `denied` IS NOT ABSENCE. A permission refusal draws no frame: naming eight
 * panels someone may not see, then telling them they may not see them, is
 * worse than the refusal alone. The handoff scopes this phase to "a permitted
 * record [that] is absent", and this is where that scope is enforced.
 */
import type { PanelStatus } from "../contracts";
import type { ReactNode } from "react";

import { EMPTY_COMPOSITION, type EmptyRecordScreen } from "./emptyComposition";
import { producerSentence } from "./recordProducer";
import { PanelState } from "./states";
import { QuietEmpty } from "./quietEmpty";

/** `PanelState` draws every status except `ok`, and a frame is only drawn
 *  when the screen could not draw itself, so `ok` cannot reach here. */
export type AbsentStatus = Exclude<PanelStatus, "ok">;

/**
 * Absence keeps the frame; a refusal does not, and neither does a read still
 * in flight — a skeleton says "wait", while a frame of empty panels says
 * "there is nothing here", which during a read is not yet known.
 */
export function framesAbsence(status: AbsentStatus): boolean {
  return status !== "denied" && status !== "loading";
}

/** The contract codes a reader actually meets, in plain words; the code stays after it for the person who quotes it. */
const PLAIN: Readonly<Record<string, string>> = {
  WORKSPACE_NOT_FOUND: "This record is not in the workspace named in the link",
  APPROVAL_NOT_FOUND: "No approval with this id is visible to you",
  EXIT_REVIEW_NOT_FOUND: "No exit review with this id is visible to you",
  INCIDENT_NOT_FOUND: "No incident with this id is visible to you",
};
export function plainReason(reason: string): string {
  const match = /^([A-Z][A-Z0-9_]{5,}):\s*(.*)$/.exec(reason);
  const sentence = match ? PLAIN[match[1]!] : undefined;
  return match && sentence ? `${sentence} (${match[1]}${match[2] ? `: ${match[2]}` : ""})` : reason;
}

const BACK: Readonly<Partial<Record<EmptyRecordScreen, { href: string; label: string }>>> = {
  "gate-r1": { href: "/governance/approvals", label: "Back to the Inbox" },
  "gate-r2": { href: "/governance/approvals", label: "Back to the Inbox" },
  "gate-live": { href: "/governance/approvals", label: "Back to the Inbox" },
  "paper-exit-review": { href: "/governance/approvals", label: "Back to the Inbox" },
};

export function EmptyRecordFrame({
  screen,
  status,
  reason,
  controls,
}: {
  screen: EmptyRecordScreen;
  status: AbsentStatus;
  /** The contract's own code. Kept first — it is the part an operator quotes. */
  reason?: string | null;
  /** Screen-specific controls, already disabled and titled by the caller. */
  controls?: ReactNode;
}) {
  const spec = EMPTY_COMPOSITION[screen];
  const why = plainReason(reason ?? "This record cannot be shown.");
  if (!framesAbsence(status)) {
    // `PanelState` already prints the reason. The first version printed it
    // again underneath, so a refusal said the same sentence twice — the exact
    // duplication this phase exists to remove, committed inside the component
    // that removes it. Caught by an existing Paper Workbench test, not by me.
    return <PanelState status={status} reason={why} />;
  }
  const noun: Partial<Record<EmptyRecordScreen, string>> = {
    "gate-r1": "R1 review", "gate-r2": "R2 review", "gate-live": "live-gate review", "canary-control-room": "canary record",
    "sandbox-certification": "certification", incident: "incident", "paper-exit-review": "exit review",
    "live-full-operations": "live operations record", "paper-workbench": "deployment",
  };
  const back = BACK[screen];
  return (
    <>
      {/* One card says the record is not there, in one sentence; who writes such a record and what the screen would hold are folded under "Why?" (Research states an absence once). */}
      <QuietEmpty
        icon="doc"
        label={`${noun[screen] ?? "record"} not available`}
        title={`No ${noun[screen] ?? "record"} to show`}
        line={why}
        actions={back ? <a className="exec-btn-ghost exec-gov-cta" href={back.href}>{back.label}</a> : null}
        more={
          <>
            <p className="exec-disabled-reason">{producerSentence(spec.recordKind)}</p>
            <p className="exec-qe-would">This screen shows: {spec.panels.map((panel) => panel.title).join(" · ")}.</p>
            <div className="exec-inc2-grid exec-empty-frame" hidden>
              {spec.panels.map((panel) => (
                <section className="exec-pf2-panel" key={panel.title} aria-label={panel.title}>
                  <header className="exec-pf2-head"><span className="exec-pf2-title">{panel.title}</span></header>
                  <PanelState
                    status="empty"
                    title={panel.missing}
                    reason={panel.relation ? `Holds ${panel.holds}, read from ${panel.relation}.` : `Holds ${panel.holds}.`}
                  />
                </section>
              ))}
            </div>
          </>
        }
      />
      {controls}
    </>
  );
}
