/**
 * JourneySpine (hi-fi modules/spine.js): R1 gate, R2 gate, Paper, Sandbox,
 * Canary, Live for one alpha version.
 *
 * Vocabulary (design/README D2): Paper and Sandbox are simulated; Canary and
 * Live together are the Real-funded domain, and "Live" is one stage inside it,
 * never a synonym for the domain.
 *
 * What the spine will not do: infer. The hi-fi sample derived "done" for every
 * stage before the current one and invented who approved it. Here the current
 * stage is only what the caller passes, a stage is `done` only when the source
 * says so, and days, criteria and decider are printed only when the lifecycle
 * read (FE-027) and the criteria shape (FE-028) published them; when any card
 * lacks them the one note under the list says so. With no current stage at all, every stage is
 * Unknown and the spine says the lifecycle is not published.
 */
import type { ReactNode } from "react";

import { formatExact } from "../../formatExact";
import { Flag } from "../Flag";
import { useKeyboardScroll } from "../useKeyboardScroll";
import type { FlagKind } from "../flagKinds";
import { NotPublished } from "./notPublished";
import "../css/blocks.css";

export const SPINE_STAGE_IDS = ["r1", "r2", "paper", "sandbox", "canary", "live"] as const;
export type SpineStageId = (typeof SPINE_STAGE_IDS)[number];

export type SpineDomain = "gate" | "simulated" | "real-funded";

export interface SpineStageSpec {
  /** The word on the node and in the accessible name. */
  label: string;
  /** The short word of the compact variant. */
  short: string;
  /** R1 and R2 are review gates, not running stages. */
  gate: boolean;
  /** Where the stage sits: Real-funded is the domain that holds Canary and Live. */
  domain: SpineDomain;
}

export const SPINE_STAGES: Readonly<Record<SpineStageId, SpineStageSpec>> = {
  r1: { label: "R1 gate", short: "R1", gate: true, domain: "gate" },
  r2: { label: "R2 gate", short: "R2", gate: true, domain: "gate" },
  paper: { label: "Paper", short: "Paper", gate: false, domain: "simulated" },
  sandbox: { label: "Sandbox", short: "Sandbox", gate: false, domain: "simulated" },
  canary: { label: "Canary", short: "Canary", gate: false, domain: "real-funded" },
  live: { label: "Live", short: "Live", gate: false, domain: "real-funded" },
};

const DOMAIN_WORD: Readonly<Record<SpineDomain, string>> = {
  gate: "Review gate",
  simulated: "Simulated",
  "real-funded": "Real-funded domain",
};

/** What the spine shows for a node. */
export type SpineNodeState = "done" | "cur" | "blk" | "ahead" | "unknown";

const STATE_FLAG: Readonly<Record<SpineNodeState, { kind: FlagKind; label: string }>> = {
  done: { kind: "ok", label: "Done" },
  cur: { kind: "operation", label: "Now" },
  blk: { kind: "attention", label: "Blocked" },
  ahead: { kind: "na", label: "Later" },
  unknown: { kind: "unknown", label: "Unknown" },
};

export interface SpineCriteria {
  /** Criteria met. */
  met: number;
  /** Criteria required. */
  total: number;
}

/** Everything the lifecycle read may publish about one stage. All optional on purpose. */
export interface SpineStageFacts {
  /** Set to `"done"` only when the source says the stage was completed. Absent = history not published. */
  outcome?: "done";
  /** Whole days in the stage. */
  daysInStage?: number | null;
  /** Gate criteria met of required. */
  criteria?: SpineCriteria | null;
  /** The role that decides the exit ("Manager"). */
  decider?: string | null;
  /** Who decided a completed stage. */
  decidedBy?: string | null;
  /** A date or one line about the stage ("Approved 16 Sep 15:00Z"). */
  line?: string | null;
  /** Why the stage is blocked, as published. */
  blockedReason?: string | null;
}

export type SpineVariant = "full" | "compact" | "mini";

export interface JourneySpineProps {
  /** `full` = six nodes with facts, `compact` = a stepper row, `mini` = a six-square glyph for a table cell. */
  variant?: SpineVariant;
  /** The current stage, as the source published it. `null`/absent = not published; nothing is guessed. */
  current?: SpineStageId | null;
  /** The current stage is blocked. */
  blocked?: boolean;
  /** Per-stage facts. A missing fact is not drawn; the note under the list names the gap once. */
  stages?: Partial<Record<SpineStageId, SpineStageFacts>>;
  /** Selected stage (full and compact). */
  selected?: SpineStageId | null;
  /** Makes nodes buttons. Not available on `mini`. */
  onSelect?: (stage: SpineStageId) => void;
  /** Accessible name; default "Lifecycle". */
  label?: string;
}

/** Resolve a node's state from props only. Exported for tests and for screens that need the same reading. */
export function spineNodeState(
  id: SpineStageId,
  current: SpineStageId | null | undefined,
  blocked: boolean,
  facts: SpineStageFacts | undefined,
): SpineNodeState {
  if (current === id) return blocked ? "blk" : "cur";
  if (facts?.outcome === "done") return "done";
  if (current === null || current === undefined) return "unknown";
  // Position is vocabulary, not history: a stage after the current one has not been reached.
  return SPINE_STAGE_IDS.indexOf(id) > SPINE_STAGE_IDS.indexOf(current) ? "ahead" : "unknown";
}

function count(value: number): string {
  return formatExact(String(value), "count").display;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

function Meter({ met, total }: SpineCriteria) {
  const cells = Math.min(total, 12);
  return (
    <>
      <span className="exec-blk-spine-meter" aria-hidden="true">
        {Array.from({ length: cells }, (_, i) => (
          <i key={i} data-on={i < met ? "true" : undefined} />
        ))}
      </span>
      <span className="exec-blk-spine-line">
        {count(met)} of {count(total)} criteria met
      </span>
    </>
  );
}

function Facts({ id, state, facts }: { id: SpineStageId; state: SpineNodeState; facts: SpineStageFacts | undefined }): ReactNode {
  const spec = SPINE_STAGES[id];
  if (state === "ahead") return <span className="exec-blk-spine-line">Not reached</span>;
  // An unknown stage is one quiet state: no chip, no per-card sentence. The spine's one note under the list says why, and there is
  // no stage-history target to link to, so nothing is drawn that looks like one.
  if (state === "unknown") return null;
  const days = isCount(facts?.daysInStage) ? facts.daysInStage : null;
  const criteria = facts?.criteria && isCount(facts.criteria.met) && isCount(facts.criteria.total) ? facts.criteria : null;
  const who = facts?.decider ?? null;
  // The card prints only what the lifecycle read published; the one note under the list says what it did not.
  if (state === "done") {
    const by = facts?.decidedBy ?? null;
    return (
      <>
        {spec.gate ? <span className="exec-blk-spine-big">Approved</span> : null}
        {facts?.line ? <span className="exec-blk-spine-line">{facts.line}</span> : null}
        {by ? <span className="exec-blk-spine-line">By {by}</span> : null}
      </>
    );
  }
  return (
    <>
      {days === null ? null : (
        <span className="exec-blk-spine-big">
          {count(days)}
          <small> days in stage</small>
        </span>
      )}
      {spec.gate || id === "live" || !criteria ? null : <Meter {...criteria} />}
      {id === "live" ? <span className="exec-blk-spine-line">No exit gate</span> : null}
      {state === "blk" && facts?.blockedReason ? <span className="exec-blk-spine-line">{facts.blockedReason}</span> : null}
      {who ? <span className="exec-blk-spine-line">Decides: {who}</span> : null}
    </>
  );
}

/** Does this card print a compact gap? Mirrors `Facts`, so the one note under the list appears exactly when a card needed it. */
function cardHasGap(state: SpineNodeState, id: SpineStageId, facts: SpineStageFacts | undefined): boolean {
  if (state === "ahead") return false;
  if (state === "unknown") return true;
  if (state === "done") return !facts?.decidedBy;
  const spec = SPINE_STAGES[id];
  const days = isCount(facts?.daysInStage);
  const criteria = !!facts?.criteria && isCount(facts.criteria.met) && isCount(facts.criteria.total);
  return !days || (!spec.gate && id !== "live" && !criteria) || !facts?.decider;
}

function accessibleName(id: SpineStageId, state: SpineNodeState): string {
  return `${SPINE_STAGES[id].label}, ${STATE_FLAG[state].label}`;
}

/** The lifecycle spine. */
export function JourneySpine({
  variant = "full",
  current,
  blocked = false,
  stages,
  selected,
  onSelect,
  label = "Lifecycle",
}: JourneySpineProps) {
  const states = SPINE_STAGE_IDS.map((id) => spineNodeState(id, current, blocked, stages?.[id]));
  // The compact stepper scrolls sideways in a narrow column; with no button in it (no `onSelect`) it needs to be reachable.
  const { ref: boxRef, props: scrollProps } = useKeyboardScroll<HTMLDivElement>(label, [variant, current, blocked, stages, onSelect]);

  if (variant === "mini") {
    const summary = SPINE_STAGE_IDS.map((id, i) => accessibleName(id, states[i])).join(", ");
    return (
      <span className="exec-blk-spine-mini" role="img" aria-label={`${label}: ${summary}`}>
        {SPINE_STAGE_IDS.map((id, i) => (
          <i key={id} data-s={states[i]} title={accessibleName(id, states[i])} />
        ))}
      </span>
    );
  }

  const missing = current === null || current === undefined;
  const note = missing ? (
    <p className="exec-blk-spine-note">
      <NotPublished id="FE-027/028">Current stage</NotPublished>
    </p>
  ) : null;

  const gapNote =
    variant === "full" && SPINE_STAGE_IDS.some((id, i) => cardHasGap(states[i], id, stages?.[id])) ? (
      <p className="exec-blk-spine-note">
        <NotPublished id="FE-027/028">Days in stage, gate criteria and decider</NotPublished>
      </p>
    ) : null;

  return (
    <div ref={boxRef} className="exec-blk-spine" data-variant={variant} {...scrollProps}>
      {note}
      <ol className="exec-blk-spine-list" aria-label={label}>
        {SPINE_STAGE_IDS.map((id, i) => {
          const spec = SPINE_STAGES[id];
          const state = states[i];
          const flag = STATE_FLAG[state];
          const isSel = selected === id;
          const inner =
            variant === "compact" ? (
              <>
                <span className="exec-blk-spine-q" aria-hidden="true">
                  {state === "done" ? "✓" : state === "cur" ? "●" : state === "blk" ? "✕" : ""}
                </span>
                <span className="exec-blk-spine-short">{spec.short}</span>
              </>
            ) : (
              <>
                <span className="exec-blk-spine-head">
                  <span className="exec-blk-spine-name">{spec.label}</span>
                  {state === "unknown" ? <span className="exec-blk-sr">{flag.label}</span> : <Flag kind={flag.kind} label={flag.label} size="sm" />}
                </span>
                <span className="exec-blk-spine-domain">{DOMAIN_WORD[spec.domain]}</span>
                <Facts id={id} state={state} facts={stages?.[id]} />
              </>
            );
          return (
            <li
              key={id}
              className="exec-blk-spine-node"
              data-stage={id}
              data-s={state}
              data-sel={isSel ? "true" : undefined}
              aria-current={state === "cur" || state === "blk" ? "step" : undefined}
            >
              {onSelect ? (
                <button
                  type="button"
                  className="exec-blk-spine-btn"
                  aria-pressed={isSel}
                  aria-label={variant === "compact" ? accessibleName(id, state) : undefined}
                  onClick={() => onSelect(id)}
                >
                  {inner}
                </button>
              ) : (
                <div className="exec-blk-spine-btn" role={variant === "compact" ? "img" : undefined} aria-label={variant === "compact" ? accessibleName(id, state) : undefined}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {gapNote}
    </div>
  );
}
