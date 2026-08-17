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
import { Chip } from "@/components/ui";
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
    <div className="phase-progress" title={`${done}/${total} task đã Done`}>
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
  onDelete,
}: {
  phase: RoadmapPhase;
  index: number;
  horizon: number;
  tasks: readonly TimelineTask[];
  phases: RoadmapPhase[];
  onEdit: () => void;
  onActivity: (() => void) | null;
  onDelete: () => void;
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
          <p className="phase-owner">{phase.owner || "Chưa gán owner"}</p>
        </div>
      </div>

      {/* The bar is positioned on a 1..horizon grid; the same element reads as
       * a plain labelled bar once the axis is hidden. */}
      <div className="phase-track" style={{ gridTemplateColumns: `repeat(${horizon}, 1fr)` }}>
        <div
          className="phase-bar"
          style={{ gridColumn: `${phase.start} / ${phase.end + 1}` }}
          title={`${phase.id}: W${phase.start}–W${phase.end} (${weeks} tuần)`}
        >
          <span className="phase-bar-label mono">
            W{phase.start}–W{phase.end}
          </span>
          {/* Milestone marker: the exit week is the decision point. */}
          <span className="phase-milestone" aria-hidden="true" />
        </div>
      </div>

      <div className="phase-detail">
        <p className="phase-outcome">{phase.outcome || "Chưa ghi exit outcome"}</p>

        <div className="phase-facts">
          <span className="mono phase-span">
            {weeks} tuần · W{phase.start}→W{phase.end}
          </span>
          {progress ? (
            <ProgressBar done={progress.done} total={progress.total} />
          ) : (
            <span className="phase-progress-absent">chưa có task gán vào phase này</span>
          )}
        </div>

        {concurrent.length > 0 && (
          <p className="phase-concurrent">
            Chạy song song: {concurrent.map((other) => other.id).join(", ")}
          </p>
        )}

        <div className="phase-actions">
          <Chip>{phase.tone}</Chip>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          {onActivity && (
            <button type="button" onClick={onActivity}>
              Activity
            </button>
          )}
          <button type="button" className="danger-text" onClick={onDelete}>
            Delete
          </button>
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
  onDelete,
}: {
  phases: RoadmapPhase[];
  tasks: readonly TimelineTask[];
  onEdit: (phase: RoadmapPhase) => void;
  onActivity: ((phase: RoadmapPhase) => void) | null;
  onDelete: (phase: RoadmapPhase) => void;
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
            onDelete={() => onDelete(phase)}
          />
        ))}
      </div>
    </div>
  );
}
