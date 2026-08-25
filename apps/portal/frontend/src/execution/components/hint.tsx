/**
 * Hint — a mechanism note folded behind one word (handoff §7.2, audit F5/F6).
 *
 * "alert = state change of a typed object", "ack ≠ resolve", "never silently
 * summed" are rules the component already enforces; printing them on every
 * visit is noise for the operator who read them once. They stay in the DOM
 * (copyable, testable, findable by screen readers) but open on demand.
 */
import type { ReactNode } from "react";

export function Hint({ label = "How to read", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <details className={`exec-hint exec-role-meta${className ? ` ${className}` : ""}`}>
      <summary>{label}</summary>
      <div className="exec-hint-body">{children}</div>
    </details>
  );
}
