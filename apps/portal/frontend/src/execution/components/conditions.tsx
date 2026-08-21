/**
 * ConditionList — typed conditions attached to a governance decision.
 *
 * The last of the eleven components DS §4 promotes, and the one used by the
 * most screens: R1, R2, passports and every exit review. It was missing while
 * those screens were built, which is why "approve with condition" existed as a
 * button with nothing behind it.
 *
 * A condition is a typed object, never prose. DS §4 gives the five fields —
 * text · owner · deadline · expiry · blocking flag — and the reason they are
 * fields is that a condition written as a sentence cannot be tracked: nobody
 * can query "which conditions expire this month" or "which blocking conditions
 * are unmet" against a paragraph. The hi-fi renders it as one dense mono row,
 * which is exactly what a typed record looks like when it is displayed rather
 * than described.
 *
 * Anatomy transcribed from the Gate R2 hi-fi's condition row: hairline box on
 * the sunken fill, mono 11px, the word CONDITION in full ink, owner in full
 * ink, everything else in soft ink, and the severity token last.
 */
import type { ReactNode } from "react";

export interface TypedCondition {
  /** What must hold, e.g. `capacity cap 50,000.00 until evidence extended`. */
  text: string;
  /** Who owes it. A condition with no owner is a wish. */
  owner: string | null;
  /** When it must be met by, ISO-8601 or a stated absence. */
  deadline?: string | null;
  /** When the condition itself lapses. */
  expiry?: string | null;
  /**
   * Blocking conditions stop the thing they are attached to; non-blocking ones
   * are carried forward and watched. The distinction is the whole reason to
   * type them, so it renders as its own token rather than as tone alone.
   */
  blocking: boolean;
  /** Set when the condition came from an earlier gate rather than this one. */
  carried?: boolean;
}

function Segment({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="exec-condition-seg">
      <span className="exec-condition-label">{label}</span> {value}
    </span>
  );
}

export function ConditionRow({ condition }: { condition: TypedCondition }) {
  return (
    <div className="exec-condition" data-blocking={condition.blocking ? "true" : undefined}>
      <strong className="exec-condition-kind">
        {condition.carried ? "CONDITION (carried)" : "CONDITION"}
      </strong>
      <span className="exec-condition-text">{condition.text}</span>
      {/* An unowned condition is stated rather than omitted: it is the field
          most likely to be left empty and the one that makes the condition
          actionable. */}
      <Segment
        label="owner"
        value={
          condition.owner ? (
            <strong>{condition.owner}</strong>
          ) : (
            <span className="exec-condition-missing">unassigned</span>
          )
        }
      />
      {condition.deadline ? <Segment label="due" value={condition.deadline} /> : null}
      {condition.expiry ? <Segment label="expires" value={condition.expiry} /> : null}
      <span className="exec-condition-flag">{condition.blocking ? "BLOCKING" : "NON-BLOCKING"}</span>
    </div>
  );
}

export function ConditionList({
  conditions,
  emptyNote = "No conditions attached.",
}: {
  conditions: readonly TypedCondition[];
  emptyNote?: string;
}) {
  if (conditions.length === 0) {
    return <div className="exec-condition-empty">{emptyNote}</div>;
  }
  return (
    <div className="exec-condition-list" role="list">
      {conditions.map((c) => (
        <div role="listitem" key={`${c.text}-${c.owner ?? "unassigned"}`}>
          <ConditionRow condition={c} />
        </div>
      ))}
    </div>
  );
}

/**
 * How many of these block. Exposed rather than left to each caller, because
 * three screens need the same count and three implementations of "which of
 * these stop the decision" is three chances to disagree.
 */
export function blockingCount(conditions: readonly TypedCondition[]): number {
  return conditions.filter((c) => c.blocking).length;
}
