/**
 * The trial strip under the spine (hi-fi `.trial`): "Trial day 6 of 14", one tick
 * per day, and when the exit review opens.
 *
 * Day N of M only when both are published and consistent (`day_index` is pinned null today, so
 * the day is a gap). The start and the exit-review date are the SERVER's (`lifecycle.trial`,
 * FE-071) and are printed as published; the ones it did not publish are ONE `Not available` line
 * with FE-071 and the server's reason in its title. Nothing is counted down or compared with the clock.
 */
import { GapLine, type GapItem } from "../../blocks";
import type { Stamp, TrialCalendar, TrialFact } from "./model";
import { FE } from "./model";

const stampGap = (label: string, stamp: Stamp): GapItem[] => (stamp.kind === "time" ? [] : [{ label, id: FE.envelope, reason: stamp.reasonCode }]);

export function TrialStrip({ trial, calendar, endedAt = null }: { trial: TrialFact; calendar: TrialCalendar; /** When the runtime stopped: the trial is then read as finished, not as "day N of M". */ endedAt?: string | null }) {
  const gaps: GapItem[] = [
    ...(trial.kind === "day" ? [] : [{ label: "Trial day", id: FE.envelope }]),
    ...stampGap("Started", calendar.started),
    ...stampGap("Exit review opens", calendar.exitReviewOpens),
  ];
  return (
    <div className="exec-cny-trial" role="group" aria-label="Trial schedule">
      {endedAt !== null ? (
        <span className="exec-cny-trial-day" data-testid="trial-ended">
          Trial ended <span className="exec-blk-num">{endedAt}</span>
        </span>
      ) : trial.kind === "day" ? (
        <>
          <span className="exec-cny-trial-day">Trial day {trial.day} of {trial.total}</span>
          <span className="exec-cny-ticks" role="img" aria-label={`Day ${trial.day} of ${trial.total}`}>
            {Array.from({ length: trial.ticks }, (_, index) => (
              <i key={index} data-state={index + 1 < trial.tick ? "on" : index + 1 === trial.tick ? "now" : undefined} />
            ))}
          </span>
        </>
      ) : trial.durationDays !== null ? (
        <span className="exec-cny-trial-day">{trial.proposed ? "Proposed duration" : "Duration"} {trial.durationDays} days</span>
      ) : null}
      {calendar.started.kind === "time" ? (
        <span className="exec-cny-trial-fact">
          Started <span className="exec-blk-num">{calendar.started.text}</span>
        </span>
      ) : null}
      {calendar.exitReviewOpens.kind === "time" ? (
        <span className="exec-cny-trial-fact">
          Exit review opens <span className="exec-blk-num">{calendar.exitReviewOpens.text}</span>
        </span>
      ) : null}
      <GapLine items={gaps} />
    </div>
  );
}
