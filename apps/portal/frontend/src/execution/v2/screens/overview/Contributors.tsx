/**
 * The Contributors panel body (FE-CAT-5): the server's alpha groups of the fund dataset, one line per economic partition.
 * See `contributorsModel.ts` for what is selected and what is refused. Nothing is summed, re-sorted or joined here.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import { GapWhy, gapTitle } from "../../blocks";
import { MetricValue } from "../manager/MetricValue";
import { partitionLabel } from "../portfolios/PartitionFigures";
import { scaledOf } from "../portfolios/capitalModel";
import { truncateDecimal } from "../portfolios/registerMetrics";
import { FE_CONTRIBUTORS } from "./overviewModel";
import type { ContributorGroup, ContributorLine, ContributorsPopulation, ContributorsView } from "./contributorsModel";

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

/** Bar length for one amount: its share of the largest absolute amount of the SAME partition (a drawing, never printed as a figure). */
function barWidths(groups: readonly ContributorGroup[]): ReadonlyMap<string, number> {
  const key = (line: ContributorLine) => `${line.partition.economicDomain}|${line.partition.currency}|${line.partition.basis}`;
  const largest = new Map<string, bigint>();
  for (const group of groups) for (const line of group.lines) {
    const v = line.amount !== null && line.amount.kind === "value" ? scaledOf(line.amount.exact) : null;
    if (v === null) continue;
    const a = v < 0n ? -v : v;
    if (a > (largest.get(key(line)) ?? 0n)) largest.set(key(line), a);
  }
  const out = new Map<string, number>();
  (groups).forEach((group, gi) => group.lines.forEach((line, li) => {
    const v = line.amount !== null && line.amount.kind === "value" ? scaledOf(line.amount.exact) : null;
    const top = largest.get(key(line)) ?? 0n;
    if (v === null || top === 0n) return;
    out.set(`${gi}|${li}`, Number(((v < 0n ? -v : v) * 100n) / top));
  }));
  return out;
}

function Population({ population }: { population: ContributorsPopulation }) {
  return (
    <p className="exec-ov-note" data-testid="contributors-population" data-capped={population.atGroupCap ? "true" : undefined}>
      {population.statement}
    </p>
  );
}

/** Groups drawn before "Show all": the hi-fi lists a handful of bars; the server's order is kept, and the cut is said. */
export const CONTRIBUTORS_SHOWN = 8;

export function ContributorsBody({ view, linkOf }: { view: ContributorsView; /** Where an alpha or portfolio id leads (QA1 OV-08); `null` keeps plain text. */ linkOf?: (field: "alpha_id" | "portfolio_id", id: string) => string | null }) {
  const [showAll, setShowAll] = useState(false);
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
  const shownGroups = showAll ? view.groups : view.groups.slice(0, CONTRIBUTORS_SHOWN);
  const widths = barWidths(shownGroups);
  const word = view.field === "portfolio_id" ? "Portfolio" : "Alpha";
  const cell = (line: ContributorLine, pick: "amount" | "ret" | "score") => {
    const metric = line[pick];
    // A score is a figure of two places, truncated like the register's (the exact string rides the title); never a bare "0".
    if (pick === "score" && metric !== null && metric.kind === "value") return <span className="exec-mgr-num" title={metric.exact} data-zero={metric.zero ? "true" : undefined}>{truncateDecimal(metric.exact)}</span>;
    return <MetricValue metric={metric} signed={pick !== "score"} />;
  };
  const field = view.field === "portfolio_id" ? "portfolio_id" : "alpha_id";
  return (
    <>
      <div className="exec-ov-contrib-wrap"><table className="exec-ov-contrib" aria-label={`Contributors by ${word.toLowerCase()}`}>
        <thead>
          <tr>
            <th scope="col">{word}</th>
            <th scope="col">Partition</th>
            <th scope="col" className="exec-ov-contrib-num" title="unique_row_count of the group">Rows</th>
            <th scope="col" className="exec-ov-contrib-num">Amount</th>
            {view.showReturn ? <th scope="col" className="exec-ov-contrib-num">Return</th> : null}
            {view.showScore ? <th scope="col" className="exec-ov-contrib-num">Score</th> : null}
          </tr>
        </thead>
        <tbody>
          {shownGroups.flatMap((group, groupIndex) => {
            const lines = group.lines.length === 0 ? [null] : group.lines;
            return lines.map((line, lineIndex) => (
              <tr key={`${groupIndex}|${lineIndex}`} data-group={groupIndex} data-first={lineIndex === 0 ? "true" : undefined}>
                {lineIndex === 0 ? <th scope="row" rowSpan={lines.length} title={group.alphaId ?? undefined}>{group.alphaId === null ? <span className="exec-ov-na">{word} not stated</span> : linkOf?.(field, group.alphaId) ? <Link className="exec-ov-link" to={linkOf(field, group.alphaId)!}>{group.alphaId}</Link> : group.alphaId}</th> : null}
                {line === null ? (
                  <td colSpan={3 + (view.showReturn ? 1 : 0) + (view.showScore ? 1 : 0)}><span className="exec-ov-na">No economic partition published</span></td>
                ) : (
                  <>
                    <td className="exec-ov-contrib-part" title={`${line.partition.basis} · ${line.partition.nativeProfileRef}`}>{partitionLabel(line.partition)}</td>
                    <td className="exec-ov-contrib-num">{lineIndex === 0 ? group.uniqueRowCount : null}</td>
                    <td className="exec-ov-contrib-num">
                      {cell(line, "amount")}
                      {widths.has(`${groupIndex}|${lineIndex}`) ? (
                        <span className="exec-ov-bar-track" aria-hidden="true"><span className="exec-ov-bar" data-neg={line.amount?.kind === "value" && line.amount.exact.startsWith("-") ? "true" : undefined} style={{ width: `${widths.get(`${groupIndex}|${lineIndex}`)}%` }} /></span>
                      ) : null}
                    </td>
                    {view.showReturn ? <td className="exec-ov-contrib-num">{cell(line, "ret")}</td> : null}
                    {view.showScore ? <td className="exec-ov-contrib-num">{cell(line, "score")}</td> : null}
                  </>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table></div>
      {view.groups.length > CONTRIBUTORS_SHOWN ? (
        <p className="exec-ov-note">
          {showAll ? `All ${view.groups.length} groups are shown.` : `The first ${CONTRIBUTORS_SHOWN} of ${view.groups.length} groups, in the server's order.`}{" "}
          <button type="button" className="exec-ov-linkbtn" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : "Show all"}</button>
        </p>
      ) : null}
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
