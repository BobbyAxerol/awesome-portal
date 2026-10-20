/**
 * The trial strip under the spine (hi-fi `.trial`): "Trial day 6 of 14", one tick
 * per day, and when the exit review opens.
 *
 * Day N of M only when both are published and consistent (`day_index` is pinned null today, so
 * "Trial day not stated"). The start and the exit-review date are the SERVER's (`lifecycle.trial`,
 * FE-071) and are printed as published, or `Not published (FE-071)` with the server's reason in the
 * title. Nothing is counted down or compared with the clock.
 */
import { NotPublished } from "../../blocks";
import type { Stamp, TrialCalendar, TrialFact } from "./model";
import { FE } from "./model";

function StampText({ stamp }: { stamp: Stamp }) {
  return stamp.kind === "time" ? <span className="exec-blk-num">{stamp.text}</span> : <NotPublished id={FE.envelope} titleReason={stamp.reasonCode} />;
}

export function TrialStrip({ trial, calendar }: { trial: TrialFact; calendar: TrialCalendar }) {
  return (
    <div className="exec-cny-trial" role="group" aria-label="Trial schedule">
      {trial.kind === "day" ? (
        <>
          <span className="exec-cny-trial-day">Trial day {trial.day} of {trial.total}</span>
          <span className="exec-cny-ticks" role="img" aria-label={`Day ${trial.day} of ${trial.total}`}>
            {Array.from({ length: trial.ticks }, (_, index) => (
              <i key={index} data-state={index + 1 < trial.tick ? "on" : index + 1 === trial.tick ? "now" : undefined} />
            ))}
          </span>
        </>
      ) : (
        <span className="exec-cny-trial-day">
          Trial day not stated
          {trial.durationDays !== null ? ` · ${trial.proposed ? "proposed " : ""}duration ${trial.durationDays} days` : ""}
        </span>
      )}
      <span className="exec-cny-trial-fact">
        Started <StampText stamp={calendar.started} />
      </span>
      <span className="exec-cny-trial-fact">
        Exit review opens <StampText stamp={calendar.exitReviewOpens} />
      </span>
    </div>
  );
}
