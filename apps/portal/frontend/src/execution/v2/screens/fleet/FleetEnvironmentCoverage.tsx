/**
 * The environments of an ALL read (FE-CAT-3), one entry each, always all three: Paper, Sandbox, Real-funded.
 *
 * The All lens is navigation across separately labelled environments, never one consolidated book. This strip is where that is said
 * and where a missing environment is typed instead of silently absent: an INCLUDED environment prints its own count of authorized rows
 * (a counted `0 rows` is a statement) and, when it is not clean, its own freshness and completeness with the server's reasons behind
 * the disclosure; an UNAVAILABLE one prints `Not available` with the closed reason in words and the code behind it. Nothing here is
 * summed: the counts sit side by side and the only total on the screen is the dataset's own row count of the page line.
 */
import { GapWhy, NaWhy } from "../../blocks";
import { formatInstant } from "../../boundary";
import { Flag } from "../../Flag";
import type { ManagerEnvironmentCoverage } from "../../readers/managerDataset";
import { coverageViewOf } from "./fleetDatasetModel";

import "./partitionFigures.css";

const EPOCH_DAY_MS = 86_400_000;

export function FleetEnvironmentCoverage({ coverage }: { coverage: readonly ManagerEnvironmentCoverage[] }) {
  return (
    <section className="exec-fleet-envs" aria-label="Environments in this view" data-testid="env-coverage">
      <ul role="list" className="exec-fleet-envlist">
        {coverage.map((entry) => {
          const view = coverageViewOf(entry);
          return (
            <li key={view.environment} className="exec-fleet-envitem" data-environment={view.environment} data-availability={view.availability}>
              <span className="exec-fleet-env-name">{view.label}</span>
              {view.availability === "UNAVAILABLE"
                ? <NaWhy className="exec-fleet-np" text="Not available" reason={view.reasons.join(" · ")} />
                : <span className="exec-fleet-env-count" data-testid={`env-count-${view.environment}`}>{view.countText}</span>}
              {view.availability === "INCLUDED" && view.state ? <Flag kind={view.state.kind} label={view.state.label} size="sm" /> : null}
              {view.availability === "INCLUDED" && view.reasons.length > 0
                ? <GapWhy name={`Why ${view.label} is not clean`} rows={view.reasons} next={null} /> : null}
              {view.availability === "INCLUDED" && view.asOfMs !== null
                ? <span className="exec-fleet-env-asof">{view.asOfMs < EPOCH_DAY_MS ? "Source time not published" : `As of ${formatInstant(view.asOfMs)}`}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="exec-fleet-env-note">Each environment is separate: Real-funded, Paper and Sandbox figures are never added together or converted.</p>
    </section>
  );
}
