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

/* ---------------------------------------------------------------------------
 * Composer
 * ------------------------------------------------------------------------ */

/**
 * The typed-conditions composer.
 *
 * `IMPLEMENTATION_PHASES` §2 lists it among Gate R1's blocks and its "Must
 * work" line is "conditions attach to the decision object" — attach, not
 * describe. A screen that can display a condition but not compose one leaves
 * "Approve with condition" as a button with nothing behind it, which is what
 * this screen had until now.
 *
 * The five fields are the five DS §4 names, and they are separate inputs rather
 * than a free-text box for the reason the type exists: a condition written as a
 * sentence cannot be queried. Nobody can ask "which blocking conditions expire
 * this month" of a paragraph, and the month it matters is the month somebody
 * needs to.
 */
export interface ConditionDraft {
  text: string;
  owner: string;
  deadline: string;
  expiry: string;
  blocking: boolean;
}

export const EMPTY_DRAFT: ConditionDraft = {
  text: "",
  owner: "",
  deadline: "",
  expiry: "",
  blocking: false,
};

/**
 * What stops this draft being attached.
 *
 * Text and owner are required; the rest are not. An unowned condition is a
 * wish, and an unstated condition is nothing at all — but a condition with no
 * deadline is a legitimate standing constraint, so demanding one would force
 * reviewers to invent dates.
 */
export function draftBlockers(draft: ConditionDraft): readonly string[] {
  const blockers: string[] = [];
  if (draft.text.trim().length === 0) blockers.push("a condition needs text");
  if (draft.owner.trim().length === 0) blockers.push("a condition needs an owner");
  if (draft.deadline && draft.expiry && draft.expiry < draft.deadline) {
    // A condition that lapses before it is due can never be met, and nobody
    // would notice: it would simply expire unmet and unremarked.
    blockers.push("the expiry falls before the deadline");
  }
  return blockers;
}

export function toCondition(draft: ConditionDraft): TypedCondition {
  return {
    text: draft.text.trim(),
    owner: draft.owner.trim() || null,
    deadline: draft.deadline || null,
    expiry: draft.expiry || null,
    blocking: draft.blocking,
  };
}

export function ConditionComposer({
  draft,
  onChange,
  onAttach,
  disabled = false,
  disabledReason,
}: {
  draft: ConditionDraft;
  onChange: (next: ConditionDraft) => void;
  onAttach: (condition: TypedCondition) => void;
  /** Mirrors the decision controls: a composer for a decision you cannot make
   *  is a form that wastes the reviewer's time. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const blockers = draftBlockers(draft);
  const blocked = disabled || blockers.length > 0;

  return (
    <div className="exec-composer">
      <div className="exec-composer-grid">
        <label className="exec-composer-field exec-composer-wide">
          <span>condition</span>
          <input
            className="input"
            value={draft.text}
            disabled={disabled}
            placeholder="what must hold, e.g. capacity cap 50,000.00 until evidence extended"
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
          />
        </label>
        <label className="exec-composer-field">
          <span>owner</span>
          <input
            className="input"
            value={draft.owner}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, owner: e.target.value })}
          />
        </label>
        <label className="exec-composer-field">
          <span>deadline</span>
          <input
            className="input"
            type="date"
            value={draft.deadline}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, deadline: e.target.value })}
          />
        </label>
        <label className="exec-composer-field">
          <span>expires</span>
          <input
            className="input"
            type="date"
            value={draft.expiry}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, expiry: e.target.value })}
          />
        </label>
        <label className="exec-composer-field exec-composer-check">
          <input
            type="checkbox"
            checked={draft.blocking}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, blocking: e.target.checked })}
          />
          {/* Named for what it does, not for its severity. "Blocking" is a
              behaviour the reader can check against the decision bar; "high"
              would be a judgement they cannot. */}
          <span>blocking — stops the decision until met</span>
        </label>
      </div>

      <div className="exec-composer-actions">
        <button
          type="button"
          className="exec-btn-ghost"
          disabled={blocked}
          onClick={() => onAttach(toCondition(draft))}
        >
          Attach condition
        </button>
        {disabled && disabledReason ? (
          <span className="exec-disabled-reason">{disabledReason}</span>
        ) : blockers.length > 0 ? (
          <span className="exec-disabled-reason">Cannot attach: {blockers.join("; ")}.</span>
        ) : null}
      </div>
    </div>
  );
}
