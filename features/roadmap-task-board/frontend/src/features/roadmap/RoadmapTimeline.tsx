/**
 * Program timeline.
 *
 * The previous roadmap was a 24-column table with a 1240px minimum width: it
 * scrolled sideways on anything smaller than a desktop and, once you had
 * scrolled, told you only the week span you already knew.
 *
 * This view keeps every field the schema carries and adds three readings the
 * data already supported but never showed:
 *
 *  - **delivery** — how many tasks in that phase are done, counted from real
 *    tasks. A phase with no tasks reports that, rather than reporting 0%.
 *  - **concurrency** — which other phases run inside this one, which is what
 *    actually makes a week expensive.
 *  - **milestone** — the exit week is marked on the bar, not buried in a cell.
 *
 * Layout is one component at every breakpoint: the shared week axis is shown
 * where there is room for it and the same rows read as self-describing cards
 * where there is not, so nothing is hidden on a narrow screen.
 */
import { workstreamVar } from "@/lib/workstream";

import {
  concurrentPhases,
  phaseProgress,
  phaseWeeks,
  programHorizon,
  type RoadmapPhase,
} from "./roadmap-model";

/** Quarter gridlines: 24 weeks read as 6 four-week blocks. */
const WEEKS_PER_BLOCK = 4;

/**
 * Smallest share of the timeline a bar must occupy to carry its own label.
 *
 * ~12% of a 24-week programme is three weeks, which is where "W12–W18" stops
 * fitting inside the bar at the narrow breakpoint.
 */
const LABEL_MIN_SPAN_RATIO = 0.12;

interface TimelineTask {
  phase: string;
  status: string;
}

function WeekAxis({ horizon }: { horizon: number }) {
  const blocks = Math.ceil(horizon / WEEKS_PER_BLOCK);
  return (
    <div className="timeline-axis" aria-hidden="true">
      {Array.from({ length: blocks }, (_, index) => (
        <span key={index} className="timeline-axis-block">
          W{index * WEEKS_PER_BLOCK + 1}
        </span>
      ))}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="phase-progress" title={`${done}/${total} tasks done`}>
      <div className="phase-progress-track">
        <div className="phase-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="phase-progress-label mono">
        {done}/{total}
      </span>
    </div>
  );
}

function PhaseRow({
  phase,
  index,
  horizon,
  tasks,
  phases,
  onEdit,
  onActivity,
}: {
  phase: RoadmapPhase;
  index: number;
  horizon: number;
  tasks: readonly TimelineTask[];
  phases: RoadmapPhase[];
  onEdit: () => void;
  onActivity: (() => void) | null;
}) {
  const hue = workstreamVar((index % 8) + 1);
  const progress = phaseProgress(phase.id, tasks);
  const concurrent = concurrentPhases(phase, phases);
  const weeks = phaseWeeks(phase);

  return (
    <article className="phase-row" data-testid={`roadmap-phase-${phase.id}`} style={{ "--phase-hue": hue } as React.CSSProperties}>
      <div className="phase-identity">
        <span className="phase-swatch" aria-hidden="true" />
        <div>
          <p className="phase-name">
            <span className="mono phase-code">{phase.id}</span> {phase.name}
          </p>
          <p className="phase-owner">{phase.owner || "No owner"}</p>
        </div>
      </div>

      {/* The bar is positioned on a 1..horizon grid; the same element reads as
       * a plain labelled bar once the axis is hidden. */}
      <div className="phase-track" style={{ gridTemplateColumns: `repeat(${horizon}, 1fr)` }}>
        <div
          className="phase-bar"
          style={{ gridColumn: `${phase.start} / ${phase.end + 1}` }}
          title={`${phase.id}: W${phase.start}–W${phase.end} (${weeks} weeks)`}
        >
          {/* A short phase has no room for its own label — a one-week phase is
           * 1/24 of the track, and the visual baseline showed "W1–W1" clipped
           * to "W…". Below the threshold the bar is a position marker only; the
           * week range is stated in full on the fact line either way, so
           * nothing is lost by dropping the label rather than truncating it. */}
          {weeks / horizon >= LABEL_MIN_SPAN_RATIO && (
            <span className="phase-bar-label mono">
              W{phase.start}–W{phase.end}
            </span>
          )}
          {/* Milestone marker: the exit week is the decision point. */}
          <span className="phase-milestone" aria-hidden="true" />
        </div>
      </div>

      <div className="phase-detail">
        <p className="phase-outcome">{phase.outcome || "No exit outcome recorded"}</p>

        <div className="phase-facts">
          <span className="mono phase-span">
            {weeks} weeks · W{phase.start}→W{phase.end}
          </span>
          {progress ? (
            <ProgressBar done={progress.done} total={progress.total} />
          ) : (
            <span className="phase-progress-absent">no task is assigned to this phase</span>
          )}
        </div>

        {concurrent.length > 0 && (
          <p className="phase-concurrent">
            Runs alongside: {concurrent.map((other) => other.id).join(", ")}
          </p>
        )}

        {/* The `tone` chip is gone. It printed a raw internal enum ("purple")
         * next to a swatch drawn from the workstream ramp, so on every seeded
         * phase the label contradicted the colour beside it — the visual
         * baseline caught all six. Phase identity is the swatch plus the phase
         * code; `tone` stays in the persisted schema and the editor, it just
         * has nothing to say to a reader.
         *
         * Delete is not here either: v0.5 §13 keeps a destructive action away
         * from ordinary row actions. It lives in the editor, where the phase is
         * open and named. */}
        <div className="phase-actions no-print">
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          {onActivity && (
            <button type="button" onClick={onActivity}>
              Activity
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function RoadmapTimeline({
  phases,
  tasks,
  onEdit,
  onActivity,
}: {
  phases: RoadmapPhase[];
  tasks: readonly TimelineTask[];
  onEdit: (phase: RoadmapPhase) => void;
  onActivity: ((phase: RoadmapPhase) => void) | null;
}) {
  const horizon = Math.max(programHorizon(phases), 1);

  return (
    <div className="roadmap-timeline" data-testid="roadmap-timeline">
      <div className="timeline-head">
        <span className="mono-label">Phase</span>
        <WeekAxis horizon={horizon} />
        <span className="mono-label">Exit outcome &amp; delivery</span>
      </div>

      <div className="timeline-rows">
        {phases.map((phase, index) => (
          <PhaseRow
            key={phase.id}
            phase={phase}
            index={index}
            horizon={horizon}
            tasks={tasks}
            phases={phases}
            onEdit={() => onEdit(phase)}
            onActivity={onActivity ? () => onActivity(phase) : null}
          />
        ))}
      </div>
    </div>
  );
}
