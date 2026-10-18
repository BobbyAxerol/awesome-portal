/**
 * The lifecycle panel: the JourneySpine in full, and under it what is published
 * about the selected stage.
 *
 * The current stage is the one the alpha row names. Nothing else on the spine
 * is inferred: no "done", no days in stage, no criteria, no decider. Those are
 * the lifecycle read (FE-027) and the criteria shape (FE-028), and until they
 * exist the spine prints them as `Not published`. What the screen does know
 * about a stage, the deployments it runs there, is listed beneath.
 */
import { useId } from "react";

import { Flag } from "../../Flag";
import { JourneySpine, SectionPanel, SPINE_STAGES, type SpineStageId } from "../../blocks";
import { Dec } from "./cells";
import { deploymentRows, stageWord, type DeploymentRow } from "./model";
import { Np } from "./np";
import type { AlphaFleetItem } from "../../../api/profileRead";

export interface LifecyclePanelProps {
  item: AlphaFleetItem | null;
  current: SpineStageId | null;
  selected: SpineStageId | null;
  onSelect: (stage: SpineStageId) => void;
  /** Link to a deployment (context params carried by the caller). */
  linkTo: (href: string) => string;
}

function StageDetail({ stage, current, rows, linkTo }: { stage: SpineStageId; current: SpineStageId | null; rows: readonly DeploymentRow[]; linkTo: (href: string) => string }) {
  const spec = SPINE_STAGES[stage];
  const here = rows.filter((r) => r.stage === stage);
  return (
    <div className="exec-alp2-stage-detail" data-stage={stage}>
      <h4 className="exec-alp2-stage-title">
        {spec.label}
        {current === stage ? <Flag kind="operation" label="Current" size="sm" /> : null}
      </h4>
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
        here.length === 0 ? (
          <p className="exec-alp2-line">No deployment of this alpha runs in {stageWord(stage)} now.</p>
        ) : (
          <ul className="exec-alp2-stage-deps" aria-label={`Deployments in ${spec.label}`}>
            {here.map((row) => (
              <li key={row.id}>
                <a className="exec-blk-link" href={linkTo(row.href)}>{row.id}</a>
                <Flag kind={row.runtime.kind} label={row.runtime.label} size="sm" />
                <span className="exec-alp2-dim">{row.venue}</span>
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
  );
}

export function LifecyclePanel({ item, current, selected, onSelect, linkTo }: LifecyclePanelProps) {
  const rows = deploymentRows(item);
  const headingId = useId();
  const shown = selected ?? current;
  return (
    <SectionPanel title="Lifecycle" aside={current === null ? undefined : `Now in ${stageWord(current)}`}>
      <JourneySpine variant="full" current={current} selected={selected} onSelect={onSelect} label="Alpha lifecycle" />
      <div id={headingId} className="exec-alp2-stage-wrap" aria-live="polite">
        {shown === null ? (
          <p className="exec-alp2-line">
            The source names no current stage. <Np id="FE-027/028">Stage history and gate criteria</Np>
          </p>
        ) : (
          <StageDetail stage={shown} current={current} rows={rows} linkTo={linkTo} />
        )}
      </div>
    </SectionPanel>
  );
}
