/**
 * The trial strip under the spine (hi-fi `.trial`): "Trial day 6 of 14", one tick
 * per day, and when the exit review opens.
 *
 * Day N of M only when both are published and consistent. Nothing is counted
 * down: the exit-review date and the start are `Not published (FE-071)`, and a
 * body that carries no day says "Trial day not stated", never "day 0".
 */
import { NotPublished } from "../../blocks";
import type { TrialFact } from "./model";
import { FE } from "./model";

export function TrialStrip({ trial }: { trial: TrialFact }) {
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
        Started <NotPublished id={FE.envelope} />
      </span>
      <span className="exec-cny-trial-fact">
        Exit review opens <NotPublished id={FE.envelope} />
      </span>
    </div>
  );
}
