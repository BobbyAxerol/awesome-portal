/**
 * Stage-progression components: the guard band that marks live money, the rail
 * that shows how a deployment got here, and the progress bars that decide
 * whether it may leave.
 *
 * Guard treatment is decision D2: canary and live share one red, and the
 * difference is a double border plus the words `LIVE · CANARY`. No new hue, no
 * `mode=canary`. The reason is that a signal which exists only as a colour
 * disappears in a screenshot, a print-out, or a colour-blind reader's view —
 * and this particular signal is "real money is at risk".
 */
import { ShieldAlert } from "lucide-react";

import {
  STAGE_ORDER,
  STAGE_SHORT,
  type IdChip,
  type Progress,
  type PromotionStage,
} from "../contracts";

/* -------------------------------------------------------------------------
 * GuardBand
 * ---------------------------------------------------------------------- */

export function GuardBand({
  stage,
  note,
}: {
  stage: PromotionStage;
  /** Short operational qualifier, e.g. `capital 5,000 / 5,000 at cap`. */
  note?: string;
}) {
  if (stage !== "LIVE_CANARY" && stage !== "LIVE_FULL") return null;
  const guard = stage === "LIVE_CANARY" ? "canary" : "live";
  const label = stage === "LIVE_CANARY" ? "LIVE · CANARY" : "LIVE";

  return (
    <div className="exec-guard" data-guard={guard} role="note" aria-label={`${label} — live capital`}>
      <ShieldAlert size={14} aria-hidden="true" />
      <span className="exec-guard-label">{label}</span>
      {note ? <span className="exec-guard-note">{note}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * LifecycleRail
 * ---------------------------------------------------------------------- */

export interface RailStep {
  /** `R1`, `R2`, or a promotion stage. */
  name: string;
  state: "done" | "current" | "pending";
  /** Progress or evidence under the name, e.g. `12/30 days`. */
  detail?: string;
  /** Approvals are links: a completed gate must be reachable from the rail. */
  link?: IdChip;
}

/**
 * `R1 ✓ → R2 ✓ → PAPER ● → SANDBOX — → CANARY — → LIVE —`.
 *
 * Screen-level on workbenches only. On Alpha 360° and Portfolio 360° the
 * lifecycle is per-deployment and lives in the deployment map instead (DS §9
 * note 1) — a screen-level rail there would imply the alpha has one stage,
 * when the whole point of those screens is that it has several at once.
 */
export function LifecycleRail({ steps }: { steps: readonly RailStep[] }) {
  return (
    <div className="exec-rail" role="list" aria-label="Promotion lifecycle">
      {steps.map((step) => (
        <div className="exec-rail-step" data-state={step.state} role="listitem" key={step.name}>
          <span className="exec-rail-name">
            {step.state === "done" ? "✓ " : step.state === "current" ? "● " : "— "}
            {step.name}
          </span>
          {step.detail || step.link ? (
            <span className="exec-rail-detail">
              {step.link ? (
                <a className="exec-rail-link" href={step.link.href} title={step.link.title}>
                  {step.link.label}
                </a>
              ) : null}
              {step.link && step.detail ? " · " : null}
              {step.detail}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Builds the standard six-step rail from a deployment's current stage.
 *
 * Gates before Paper are part of the rail because the lineage strip must reach
 * back to the decisions that authorised the deployment (guide §4): a screen
 * that starts at PAPER cannot answer "who approved this".
 */
export function stageRail({
  stage,
  r1,
  r2,
  detail,
}: {
  stage: PromotionStage;
  r1?: IdChip;
  r2?: IdChip;
  /** Detail for the current stage only, e.g. `12/30 days · 184/300 trades`. */
  detail?: string;
}): RailStep[] {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const gates: RailStep[] = [
    { name: "R1", state: "done", link: r1 },
    { name: "R2", state: "done", link: r2 },
  ];
  const stages: RailStep[] = STAGE_ORDER.map((candidate, index) => ({
    name: STAGE_SHORT[candidate],
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "pending",
    detail: index === currentIndex ? detail : undefined,
  }));
  return [...gates, ...stages];
}

/* -------------------------------------------------------------------------
 * ObservationProgress
 * ---------------------------------------------------------------------- */

/**
 * `n / m` bars that gate the exit-review CTA.
 *
 * `met` is passed in, never inferred from `current >= target`: the gate rule
 * can require several conditions at once and the server evaluates it (spec
 * §10.5). A client that recomputed the gate would eventually disagree with the
 * server about whether a deployment may be promoted, and the server would win
 * while the button said otherwise.
 */
export function ObservationProgress({
  items,
  rule,
  met,
}: {
  items: readonly (Progress & { label: string })[];
  /** The gate sentence, e.g. `30 days AND 300 trades, both required`. */
  rule?: string;
  met: boolean;
}) {
  return (
    <div className="exec-progress" data-met={met}>
      {items.map((item) => {
        const pct = item.target > 0 ? Math.min(100, (item.current / item.target) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="exec-progress-head">
              <span>{item.label}</span>
              <span className="exec-progress-value">
                {item.current}/{item.target} {item.unit}
              </span>
            </div>
            <div
              className="exec-progress-track"
              role="progressbar"
              aria-valuenow={item.current}
              aria-valuemin={0}
              aria-valuemax={item.target}
              aria-label={`${item.label}: ${item.current} of ${item.target} ${item.unit}`}
            >
              <div className="exec-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {rule ? <div className="exec-progress-rule">{rule}</div> : null}
    </div>
  );
}
