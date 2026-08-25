/**
 * Sticky decision bar — the one place a governance screen decides
 * (handoff EL-V2-05 supplement: "đang quyết định" is shown by a sticky bar
 * with verdict + reason + buttons and elevation, never by a light surface).
 *
 * It renders what it is given: a verdict chip, the lock reasons (first one
 * inline, the rest behind a disclosure), an optional reviewer note that
 * becomes the decision's reason, the action buttons and the decision trail.
 * It never decides anything itself.
 */
import type { ReactNode } from "react";
import { StatusChip } from "./badges";

export interface DecisionBarProps {
  /** e.g. "PENDING 1/2", "DECIDED", "BLOCKED" */
  verdict: string;
  tone: "good" | "warn" | "bad" | "mute";
  /** Why a control is disabled — every sentence the old screens printed. */
  reasons?: readonly string[];
  /** Reviewer note → decision reason. Absent = the screen offers no note. */
  note?: { value: string; onChange: (next: string) => void; placeholder?: string; disabled?: boolean };
  actions: ReactNode;
  /** DecisionTrail from the container, when a decision is in flight. */
  trail?: ReactNode;
  /** One sentence of model, e.g. "approve = grants authorization only". */
  footnote?: ReactNode;
  label: string;
}

export function ExecutionDecisionBar({ verdict, tone, reasons = [], note, actions, trail, footnote, label }: DecisionBarProps) {
  const [first, ...rest] = reasons;
  return (
    <div className="exec-decision-bar" role="region" aria-label={label} data-tone={tone}>
      <div className="exec-decision-bar-row">
        <StatusChip label={verdict} tone={tone} />
        {note ? (
          <label className="exec-decision-note-field">
            <span className="exec-role-th">reviewer note</span>
            <input
              className="exec-role-control"
              type="text"
              value={note.value}
              placeholder={note.placeholder ?? "reason recorded with the decision"}
              disabled={note.disabled}
              onChange={(e) => note.onChange(e.target.value)}
            />
          </label>
        ) : null}
        <div className="exec-decision-bar-actions">{actions}</div>
      </div>
      {first ? (
        <div className="exec-decision-bar-reasons exec-role-body">
          <span>{first}</span>
          {rest.length ? (
            <details>
              <summary>{rest.length} more {rest.length === 1 ? "reason" : "reasons"}</summary>
              <ul>
                {rest.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {footnote ? <div className="exec-decision-bar-foot exec-role-meta">{footnote}</div> : null}
      {trail}
    </div>
  );
}
