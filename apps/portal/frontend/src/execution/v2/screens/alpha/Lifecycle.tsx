/**
 * The lifecycle panel: the JourneySpine in full, and under it what is published
 * about the selected stage.
 *
 * The current stage is the one the alpha row names. Nothing else on the spine
 * is inferred: no "done", no days in stage, no criteria, no decider. Those are
 * the lifecycle read (FE-027) and the criteria shape (FE-028), and until they
 * exist the spine prints them as `Not published`. What the screen does know
 * about a stage, the deployments it runs there, is listed beneath.
 *
 * SCOPED_V2 (R-3): the body names no alpha-level stage and no deployment's stage inside the Live book (Canary or Live), only the
 * book it was read from. The panel then says that, and lists a Live-book deployment under both Canary and Live with the words
 * `stage not published`; it never picks one.
 */
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Flag } from "../../Flag";
import { JourneySpine, SectionPanel, SPINE_STAGES, type SpineStageId } from "../../blocks";
import type { ManagerDataset } from "../../readers/managerDataset";
import { Dec } from "./cells";
import { lifecycleFacts, lifecycleFactsOfRead } from "./lifecycleModel";
import type { AlphaLifecycle } from "../../readers/alphaLifecycle";
import { stageWord, type DeploymentRow } from "./model";
import { Np, WhyMark } from "./np";

export interface LifecyclePanelProps {
  rows: readonly DeploymentRow[];
  current: SpineStageId | null;
  selected: SpineStageId | null;
  onSelect: (stage: SpineStageId) => void;
  /** Link to a deployment (context params carried by the caller). */
  linkTo: (href: string) => string;
  /** Why the body names no current stage (SCOPED_V2 only). */
  currentNote?: string | null;
  /** Set when the response is the bounded shape: the deployment rows are not in it. */
  withheld?: string | null;
  /** The alpha's Manager dataset: days in stage, criteria, exit dates and decider per stage when it publishes them (WP-C keys `life_*`). */
  dataset?: ManagerDataset | null;
  /** The published lifecycle read (WP-K): its stage rows win over the dataset's open keys when published. */
  lifecycle?: AlphaLifecycle | null;
}

type StatePick = "live" | "sandbox" | "blocked";
const STATE_PICKS: readonly { id: StatePick; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "sandbox", label: "In Sandbox" },
  { id: "blocked", label: "Blocked" },
];

/** A Live-book row whose Canary-or-Live stage the body does not state. */
const liveBookRow = (row: DeploymentRow): boolean => row.stage === null && row.env === "live";

function StageDetail({
  stage, current, rows, linkTo, withheld,
}: { stage: SpineStageId; current: SpineStageId | null; rows: readonly DeploymentRow[]; linkTo: (href: string) => string; withheld: string | null }) {
  const spec = SPINE_STAGES[stage];
  const here = rows.filter((r) => r.stage === stage || ((stage === "canary" || stage === "live") && liveBookRow(r)));
  return (
    <SectionPanel title={`${spec.label} · ${current === stage ? "Now" : "Selected"}`} level={4}>
    <div className="exec-alp2-stage-detail" data-stage={stage}>
      {/* Days in stage, gate criteria and the decider are the spine's one "not published" line above; repeating them here said it twice more. */}
      {spec.gate ? (
        <p className="exec-alp2-line">
          Gate review: <Np id="FE-027/028">decision, decider and criteria</Np>
        </p>
      ) : null}
      {stage === "live" ? <p className="exec-alp2-line">No exit gate on Live. Capital actions start in Portfolio.</p> : null}
      {!spec.gate ? (
        withheld ? (
          <p className="exec-alp2-line">The deployments of this alpha are not in this response (<span className="exec-blk-id">{withheld}</span>).</p>
        ) : here.length === 0 ? (
          <p className="exec-alp2-line">No deployment of this alpha runs in {stageWord(stage)} now.</p>
        ) : (
          <ul className="exec-alp2-stage-deps" aria-label={`Deployments in ${spec.label}`}>
            {here.map((row) => (
              <li key={`${row.env ?? row.stage}:${row.id}`}>
                <Link className="exec-blk-link" to={linkTo(row.href)}>{row.id}</Link>
                <Flag kind={row.runtime.kind} label={row.runtime.label} size="sm" />
                <span className="exec-alp2-dim">{row.venue ?? "Venue not stated"}</span>
                {liveBookRow(row) ? <span className="exec-alp2-dim">Stage not published<WhyMark name="Stage, reason" reason="Canary or Live is not stated by the scoped body" /></span> : null}
                {row.allocation !== null ? (
                  <span>
                    <span className="exec-alp2-dim">Allocated, current </span>
                    <Dec value={row.allocation} currency={row.currency} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
    </SectionPanel>
  );
}

export function LifecyclePanel({ rows, current, selected, onSelect, linkTo, currentNote = null, withheld = null, dataset = null, lifecycle = null }: LifecyclePanelProps) {
  const headingId = useId();
  const [preview, setPreview] = useState<StatePick | null>(null);
  // The spine's own stage first; the three-state toggle appears only when the dataset published the lifecycle it would draw.
  const own: StatePick | null = current === "sandbox" ? "sandbox" : current === "live" || current === "canary" ? "live" : null;
  const pick = preview ?? own;
  const shownCurrent: SpineStageId | null = pick === "sandbox" ? "sandbox" : current ?? (pick === "live" ? "live" : null);
  const life = useMemo(() => lifecycleFactsOfRead(lifecycle, shownCurrent) ?? lifecycleFacts(dataset, shownCurrent), [dataset, lifecycle, shownCurrent]);
  const blocked = pick === "blocked" && life !== null;
  const stages = useMemo(() => {
    if (life === null) return undefined;
    if (!blocked || shownCurrent === null) return life.stages;
    return { ...life.stages, [shownCurrent]: { ...life.stages[shownCurrent], blockedReason: life.blockedReason } };
  }, [life, blocked, shownCurrent]);
  const shown = selected ?? shownCurrent;
  const previewing = life !== null && preview !== null && preview !== own;
  const toggle = life === null ? null : (
    <span className="exec-alp2-seg" role="group" aria-label="Stage state">
      {STATE_PICKS.map((option) => (
        <button key={option.id} type="button" className="exec-alp2-segbtn" aria-pressed={pick === option.id} onClick={() => setPreview(option.id === own ? null : option.id)}>{option.label}</button>
      ))}
    </span>
  );
  return (
    <SectionPanel title="Lifecycle" aside={toggle ?? (current === null ? undefined : `Now in ${stageWord(current)}`)}>
      <JourneySpine variant="full" current={shownCurrent} blocked={blocked} stages={stages} selected={selected} onSelect={onSelect} label="Alpha lifecycle" />
      {previewing ? <p className="exec-alp2-line exec-alp2-dim" role="status">Preview of how the spine reads in this state. This alpha is {current === null ? "at a stage the source does not name" : `in ${stageWord(current)}`}.</p> : null}
      <div id={headingId} className="exec-alp2-stage-wrap" aria-live="polite">
        {shown === null ? (
          <p className="exec-alp2-line">
            The source names no current stage. <Np id="FE-027/028">Stage history and gate criteria</Np>
            {currentNote ? <span className="exec-alp2-why">{currentNote}</span> : null}
          </p>
        ) : (
          <StageDetail stage={shown} current={shownCurrent} rows={rows} linkTo={linkTo} withheld={withheld} />
        )}
      </div>
    </SectionPanel>
  );
}
