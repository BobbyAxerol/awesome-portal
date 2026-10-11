/**
 * Gate frame — what R1, R2 (and, next, Live / Exit) share, so a reviewer learns one screen.
 *
 *  - `GateStepper`   where this gate sits on the loop: Report → RC → R1 → R2 → Paper → Sandbox → Canary → Live;
 *  - `GateVerdict`   the conclusion first, in a sentence, with the facts that carry it (counts the server's own marks; never a new verdict);
 *  - `GateAbsences`  every "not published" collapsed into one line that opens into typed reasons — one honest line, not four frames;
 *  - `GateDecisionActions` one primary action and a "Not yet" menu (request changes · deny · the alternative approval), reasons beside the buttons.
 *
 * Nothing here decides: every lock, reason and handler arrives as a prop from the screen that already derived it.
 */
import { useRef, type ReactNode } from "react";

export type GateStepId = "report" | "rc" | "r1" | "r2" | "paper" | "sandbox" | "canary" | "live";
const STEPS: readonly { id: GateStepId; label: string }[] = [
  { id: "report", label: "Report" },
  { id: "rc", label: "RC" },
  { id: "r1", label: "R1" },
  { id: "r2", label: "R2" },
  { id: "paper", label: "Paper" },
  { id: "sandbox", label: "Sandbox" },
  { id: "canary", label: "Canary" },
  { id: "live", label: "Live" },
];

/** `done` lists the steps the screen's own data says are behind this gate; nothing else is ticked. */
export function GateStepper({ current, done = [] }: { current: GateStepId; done?: readonly GateStepId[] }) {
  return (
    <ol className="exec-gf-steps" aria-label="Where this gate sits in the loop" data-current={current}>
      {STEPS.map((step) => (
        <li key={step.id} data-state={step.id === current ? "current" : done.includes(step.id) ? "done" : "ahead"} aria-current={step.id === current ? "step" : undefined}>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export type GateTone = "good" | "warn" | "bad" | "mute";

export function GateVerdict({ tone, headline, detail, facts, children }: { tone: GateTone; headline: string; detail?: string | null; facts?: readonly ReactNode[]; children?: ReactNode }) {
  return (
    <section className="exec-gf-verdict" data-tone={tone} role="status" aria-label="Verdict">
      <div className="exec-gf-verdict-head">
        <strong className="exec-gf-verdict-line">{headline}</strong>
        {detail ? <span className="exec-gf-verdict-detail">{detail}</span> : null}
      </div>
      {facts && facts.length > 0 ? (
        <ul className="exec-gf-facts">
          {facts.map((fact, index) => (
            <li key={index}>{fact}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </section>
  );
}

export interface AbsenceItem {
  label: string;
  /** The typed reason the screen already had; shown verbatim inside the disclosure. */
  reason: string;
}

/** One line for everything the source did not publish. Absence is stated, never drawn as an empty frame, never turned into a number. */
export function GateAbsences({ items }: { items: readonly AbsenceItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="exec-gf-absences" data-absences={items.length}>
      <summary>
        {items.length} {items.length === 1 ? "item" : "items"} not published yet: {items.map((item) => item.label).join(" · ")}
      </summary>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <strong>{item.label}</strong> — {item.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}

export interface GateAction {
  label: string;
  locked: boolean;
  /** Why a locked action is locked — printed as the tooltip and attached with aria-describedby by the screen's reasons block. */
  title?: string;
  onClick?: () => void;
}

/**
 * The "Not yet" menu holds the verbs that are not the recommended one. All verbs stay real buttons with their own names, so a screen reader and a
 * test reach `Deny` or `Request changes` exactly as before; the menu only changes what is on the surface.
 */
export function GateDecisionActions({
  approve,
  condition,
  deny,
  requestChanges,
  conditionCount,
}: {
  approve: GateAction;
  condition: GateAction;
  deny: GateAction;
  requestChanges: GateAction;
  conditionCount: number;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = (handler?: () => void) => () => {
    if (menu.current) menu.current.open = false;
    handler?.();
  };
  // Conditions attached → "Approve with condition" is the verb that carries them, so it is the primary; plain Approve moves into the menu.
  const withCondition = conditionCount > 0;
  const primary = withCondition ? condition : approve;
  const alternative = withCondition ? approve : condition;
  const button = (action: GateAction, className: string) => (
    <button type="button" className={`exec-role-control ${className}`} disabled={action.locked} title={action.title} onClick={close(action.onClick)}>
      {action.label}
    </button>
  );
  return (
    <div className="exec-gf-actions">
      <details className="exec-gf-more" ref={menu}>
        <summary className="exec-role-control exec-btn-ghost">Not yet ▾</summary>
        <div className="exec-gf-menu" role="group" aria-label="Other decisions">
          {button(requestChanges, "exec-btn-ghost")}
          {button(deny, "exec-btn-ghost")}
          {button(alternative, "exec-btn-ghost")}
        </div>
      </details>
      {button(primary, "exec-btn-apply")}
    </div>
  );
}
