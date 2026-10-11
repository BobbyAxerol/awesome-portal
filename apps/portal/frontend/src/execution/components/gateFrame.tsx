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
import { useEffect, useRef, type ReactNode } from "react";

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
 * One primary action and a "Not yet" menu for every other verb. All verbs stay real buttons with their own names, so a screen reader and a
 * test reach `Deny` or `Request changes` exactly as before; the menu only changes what is on the surface.
 */
export function GatePrimaryWithMenu({ primary, others, menuLabel = "Not yet ▾" }: { primary: GateAction; others: readonly GateAction[]; menuLabel?: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  // A menu that stays open until its own button is pressed again covers the decision dock: Escape, a click elsewhere or tabbing away closes it.
  useEffect(() => {
    const el = menu.current;
    if (!el) return undefined;
    const shut = () => { el.open = false; };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && el.open) { shut(); el.querySelector("summary")?.focus(); } };
    const onPointer = (e: Event) => { if (el.open && !el.contains(e.target as Node)) shut(); };
    const onFocusOut = (e: FocusEvent) => { if (el.open && e.relatedTarget instanceof Node && !el.contains(e.relatedTarget)) shut(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  const close = (handler?: () => void) => () => {
    if (menu.current) menu.current.open = false;
    handler?.();
  };
  const button = (action: GateAction, className: string) => (
    <button key={action.label} type="button" className={`exec-role-control ${className}`} disabled={action.locked} title={action.title} onClick={close(action.onClick)}>
      {action.label}
    </button>
  );
  return (
    <div className="exec-gf-actions">
      <details className="exec-gf-more" ref={menu}>
        <summary className="exec-role-control exec-btn-ghost">{menuLabel}</summary>
        <div className="exec-gf-menu" role="group" aria-label="Other decisions">
          {others.map((action) => button(action, "exec-btn-ghost"))}
        </div>
      </details>
      {button(primary, "exec-btn-apply")}
    </div>
  );
}

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
  // Conditions attached → "Approve with condition" is the verb that carries them, so it is the primary; plain Approve moves into the menu.
  const withCondition = conditionCount > 0;
  return <GatePrimaryWithMenu primary={withCondition ? condition : approve} others={[requestChanges, deny, withCondition ? approve : condition]} />;
}

export type CheckMark = "pass" | "watch" | "insufficient" | "fail";
const MARK_WORD: Record<CheckMark, string> = { pass: "passed", watch: "warning", insufficient: "insufficient", fail: "blocking" };

/** The server's own marks as one strip, a segment per check: the reader sees the shape of the evidence before reading any of it. */
export function CheckStrip({ checks }: { checks: readonly { label: string; outcome: CheckMark }[] }) {
  if (checks.length === 0) return null;
  const passed = checks.filter((c) => c.outcome === "pass").length;
  return (
    <div className="exec-gf-strip" role="img" aria-label={`${passed} of ${checks.length} checks passed`}>
      <span className="exec-gf-strip-count"><b>{passed}</b>/{checks.length}</span>
      <span className="exec-gf-strip-bar" aria-hidden="true">
        {checks.map((c, i) => (
          <i key={i} data-mark={c.outcome} title={`${c.label} — ${MARK_WORD[c.outcome]}`} />
        ))}
      </span>
    </div>
  );
}

export interface ChainNode {
  label: string;
  value: string;
  /** What the server said about verifying it; `null` = it said nothing, which is stated, not ticked. */
  verification?: string | null;
  note?: string | null;
}

/** The artifact passport as a provenance chain: each fact a node, in the order the server gave, each saying whether it was verified. */
export function ProvenanceChain({ nodes }: { nodes: readonly ChainNode[] }) {
  return (
    <ol className="exec-gf-chain" data-provenance>
      {nodes.map((node) => (
        <li key={node.label} data-verified={node.verification ? "true" : "false"}>
          <span className="exec-gate-chainlabel">{node.label}</span>
          <span className="exec-gf-chain-value">{node.value}</span>
          <span className="exec-gf-chain-state">
            <span>{node.verification ?? "not verified"}</span>
            {node.note ? <span> {node.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

const LOOP_GATES: readonly { id: string; label: string }[] = [
  { id: "R1", label: "R1" },
  { id: "R2", label: "R2" },
  { id: "PAPER", label: "Paper" },
  { id: "SANDBOX", label: "Sandbox" },
  { id: "LIVE", label: "Live" },
];

/** Where a request sits on the five-gate loop, from the gate it is asking to pass; gates behind it are implied by the workflow (R2 opens only from an approved R1). */
export function GateTrack({ at }: { at: "R1" | "R2" | "PAPER" | "SANDBOX" | "LIVE" }) {
  const index = LOOP_GATES.findIndex((g) => g.id === at);
  return (
    <span className="exec-gf-track" aria-label={`Gate ${LOOP_GATES[index]?.label ?? at} of the loop`} role="img">
      {LOOP_GATES.map((gate, i) => (
        <i key={gate.id} data-state={i < index ? "done" : i === index ? "current" : "ahead"} title={gate.label} />
      ))}
    </span>
  );
}
