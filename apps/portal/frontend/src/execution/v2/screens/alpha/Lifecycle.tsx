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
import { useId } from "react";
import { Link } from "react-router-dom";

import { Flag } from "../../Flag";
import { JourneySpine, SectionPanel, SPINE_STAGES, type SpineStageId } from "../../blocks";
import { Dec } from "./cells";
import { stageWord, type DeploymentRow } from "./model";
import { Np } from "./np";

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
}

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
      {spec.gate ? (
        <p className="exec-alp2-line">
          Gate review: <Np id="FE-027/028">decision, decider and criteria</Np>
        </p>
      ) : stage === "live" ? (
        <p className="exec-alp2-line">No exit gate on Live. Capital actions start in Portfolio.</p>
      ) : (
        <p className="exec-alp2-line">
          Exit gate: <Np id="FE-028">criteria met of required</Np>
        </p>
      )}
      {!spec.gate ? (
        <p className="exec-alp2-line">
          Entered and days in stage: <Np id="FE-027">stage history</Np>
        </p>
      ) : null}
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
                {liveBookRow(row) ? <span className="exec-alp2-dim" title="Canary or Live is not stated by the scoped body">Stage not published</span> : null}
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

export function LifecyclePanel({ rows, current, selected, onSelect, linkTo, currentNote = null, withheld = null }: LifecyclePanelProps) {
  const headingId = useId();
  const shown = selected ?? current;
  return (
    <SectionPanel title="Lifecycle" aside={current === null ? undefined : `Now in ${stageWord(current)}`}>
      <JourneySpine variant="full" current={current} selected={selected} onSelect={onSelect} label="Alpha lifecycle" />
      <div id={headingId} className="exec-alp2-stage-wrap" aria-live="polite">
        {shown === null ? (
          <p className="exec-alp2-line">
            The source names no current stage. <Np id="FE-027/028">Stage history and gate criteria</Np>
            {currentNote ? <span className="exec-alp2-why">{currentNote}</span> : null}
          </p>
        ) : (
          <StageDetail stage={shown} current={current} rows={rows} linkTo={linkTo} withheld={withheld} />
        )}
      </div>
    </SectionPanel>
  );
}
