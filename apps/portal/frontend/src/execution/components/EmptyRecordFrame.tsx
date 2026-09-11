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
  const why = reason ?? "This record cannot be shown.";
  if (!framesAbsence(status)) {
    return (
      <>
        <PanelState status={status} reason={why} />
        <p className="exec-disabled-reason">{why}</p>
      </>
    );
  }
  return (
    <>
      <PanelState status={status} reason={why} />
      {controls}
      {/* The one sentence, and only the part `PanelState` does not already
          say. `absenceReason` prefixes the contract's own code, which the
          panel above has just printed — repeating it here made the reason
          appear twice on every empty screen, which is the exact shape of
          boilerplate this phase exists to remove. */}
      <p className="exec-disabled-reason">{producerSentence(spec.recordKind)}</p>
      <div className="exec-inc2-grid">
        {spec.panels.map((panel) => (
          <section className="exec-pf2-panel" key={panel.title} aria-label={panel.title}>
            <header className="exec-pf2-head"><span className="exec-pf2-title">{panel.title}</span></header>
            <PanelState
              status="empty"
              reason={
                panel.relation
                  ? `No record is published here, so this panel is empty. It holds ${panel.holds}, read from ${panel.relation}.`
                  : `No record is published here, so this panel is empty. It holds ${panel.holds}.`
              }
            />
          </section>
        ))}
      </div>
    </>
  );
}
