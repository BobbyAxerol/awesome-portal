/**
 * The Contributors panel body (FE-CAT-5): the server's alpha groups of the fund dataset, one line per economic partition.
 * See `contributorsModel.ts` for what is selected and what is refused. Nothing is summed, re-sorted or joined here.
 */
import { GapWhy, gapTitle } from "../../blocks";
import { MetricValue } from "../manager/MetricValue";
import { partitionLabel } from "../portfolios/PartitionFigures";
import { FE_CONTRIBUTORS } from "./overviewModel";
import type { ContributorLine, ContributorsPopulation, ContributorsView } from "./contributorsModel";

/** `Not published (FE-025)` with the typed code behind a disclosure, and the reason in words. */
function Absence({ code, reason }: { code: string; reason: string }) {
  return (
    <>
      <p className="exec-ov-na">
        <span className="exec-blk-np">
          <GapWhy className="exec-blk-np-word" gap={FE_CONTRIBUTORS} text="Not published" name="Not published, reason" rows={[gapTitle(FE_CONTRIBUTORS, null, code), reason]} />
          <span className="exec-blk-sr"> ({FE_CONTRIBUTORS})</span>
        </span>
      </p>
      <p className="exec-ov-note" data-contributors-absence={code}>Per-alpha contribution over a window is not shown: {reason}</p>
    </>
  );
}

function Population({ population }: { population: ContributorsPopulation }) {
  return (
    <p className="exec-ov-note" data-testid="contributors-population" data-capped={population.atGroupCap ? "true" : undefined}>
      {population.statement}
    </p>
  );
}

export function ContributorsBody({ view }: { view: ContributorsView }) {
  if (view.kind === "loading") return <p className="exec-ov-note" role="status">Reading contributors</p>;
  if (view.kind === "absent") return <Absence code={view.code} reason={view.reason} />;
  if (view.kind === "empty") {
    return (
      <>
        <p className="exec-ov-na">No alpha is in this population.</p>
        <Population population={view.population} />
      </>
    );
  }
  const cell = (line: ContributorLine, pick: "amount" | "ret" | "score") => (
    <MetricValue metric={line[pick]} signed={pick !== "score"} />
  );
  return (
    <>
      <table className="exec-ov-contrib" aria-label="Contributors by alpha">
        <thead>
          <tr>
            <th scope="col">Alpha</th>
            <th scope="col">Partition</th>
            <th scope="col" className="exec-ov-contrib-num" title="unique_row_count of the group">Rows</th>
            <th scope="col" className="exec-ov-contrib-num">Amount</th>
            {view.showReturn ? <th scope="col" className="exec-ov-contrib-num">Return</th> : null}
            {view.showScore ? <th scope="col" className="exec-ov-contrib-num">Score</th> : null}
          </tr>
        </thead>
        <tbody>
          {view.groups.flatMap((group, groupIndex) => {
            const lines = group.lines.length === 0 ? [null] : group.lines;
            return lines.map((line, lineIndex) => (
              <tr key={`${groupIndex}|${lineIndex}`} data-group={groupIndex} data-first={lineIndex === 0 ? "true" : undefined}>
                {lineIndex === 0 ? <th scope="row" rowSpan={lines.length} title={group.alphaId ?? undefined}>{group.alphaId ?? <span className="exec-ov-na">Alpha not stated</span>}</th> : null}
                {line === null ? (
                  <td colSpan={3 + (view.showReturn ? 1 : 0) + (view.showScore ? 1 : 0)}><span className="exec-ov-na">No economic partition published</span></td>
                ) : (
                  <>
                    <td title={`${line.partition.basis} · ${line.partition.nativeProfileRef}`}>{partitionLabel(line.partition)}</td>
                    <td className="exec-ov-contrib-num">{lineIndex === 0 ? group.uniqueRowCount : null}</td>
                    <td className="exec-ov-contrib-num">{cell(line, "amount")}</td>
                    {view.showReturn ? <td className="exec-ov-contrib-num">{cell(line, "ret")}</td> : null}
                    {view.showScore ? <td className="exec-ov-contrib-num">{cell(line, "score")}</td> : null}
                  </>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>
      <Population population={view.population} />
      {!view.showReturn || !view.showScore ? (
        <p className="exec-ov-note">
          Not published by the groups: {[view.showReturn ? null : "Return", view.showScore ? null : "Score"].filter(Boolean).join(", ")}
          <GapWhy name="Why Return and Score are not shown" rows={[gapTitle(FE_CONTRIBUTORS, null, "No group publishes the key"), "A column appears when a group publishes its metric key."]} />
        </p>
      ) : null}
    </>
  );
}
