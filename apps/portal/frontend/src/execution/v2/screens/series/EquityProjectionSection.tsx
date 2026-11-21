/**
 * The equity projection panel (R-C, FIXTURE lane): the EXISTING `ChartTools` + `EquityPanel` fed from the strict reader's output, nothing new drawn.
 *
 * - Labelled "Fixture projection" in the head, in the chart's name and in the caption; the band is named "Illustrative band (fixture), not an
 *   approved band" and is drawn ONLY when the body carries a band joined to the series' run id and digest.
 * - `idle`, `loading` and `absent` print nothing: the screen keeps the typed absence it already has (the real API answers 404/501).
 * - `refused` prints the closed word in a line (denied, mismatch, unreadable, unsupported, invalid request), never a chart.
 */
import { SectionPanel } from "../../blocks";
import { ChartTools, EquityPanel } from "../../charts";
import { Flag } from "../../Flag";
import type { ProjectionFailure } from "../../readers/equityProjection";
import { FIXTURE_LABEL, FIXTURE_NOTE, projectionChart } from "./equityProjectionModel";
import type { ProjectionState } from "./useEquityProjection";

const REFUSAL_WORDS: Readonly<Partial<Record<ProjectionFailure, string>>> = {
  DENIED: "denied: this session may not read this deployment's projection",
  MISMATCH: "refused: the answer is for another deployment or window than the one asked",
  UNREADABLE: "refused: the answer is not a projection this build accepts",
  UNSUPPORTED_SHAPE: "refused: the answer is another contract version",
  INVALID_REQUEST: "refused: the request was not one the Portal accepts",
};

export function EquityProjectionSection({ state, heading = "Equity projection" }: { state: ProjectionState; heading?: string }) {
  if (state.phase === "refused") {
    return (
      <p className="exec-blk-nal" data-testid="equity-projection-refused" data-word={state.word} role="status">
        <span className="exec-blk-np-word">Not shown:</span> {FIXTURE_LABEL} ({heading.toLowerCase()}) {REFUSAL_WORDS[state.word] ?? "refused"}
        {state.refusal === null ? "" : ` [${state.refusal}]`}
      </p>
    );
  }
  if (state.phase !== "ready") return null;
  const chart = projectionChart(state.projection);
  const name = `${FIXTURE_LABEL}: equity`;
  return (
    <div data-testid="equity-projection" data-lane="fixture">
      <SectionPanel level={2} title={heading} aside={<Flag kind="neutral" label={FIXTURE_LABEL} size="sm" />}>
        <p className="exec-blk-nal" data-testid="equity-projection-note">{FIXTURE_NOTE}</p>
        <ChartTools label={name} columns={chart.state.kind === "unavailable" ? [] : [{ key: "equity", label: "Equity", points: chart.points, currency: chart.currency }]}>
          <EquityPanel
            label={name}
            seriesName="Equity"
            points={chart.points}
            currency={chart.currency}
            state={chart.state}
            intervalMs={chart.intervalMs}
            readAsOf={chart.readAsOf}
            band={chart.band ?? undefined}
            drawdown={chart.drawdown}
            height={220}
          />
        </ChartTools>
        <p className="exec-blk-nal" data-testid="equity-projection-caption">{chart.caption}</p>
      </SectionPanel>
    </div>
  );
}
