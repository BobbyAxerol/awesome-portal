/**
 * Correlation: what the portfolio's correlation read says, in three honest
 * shapes.
 *
 * - no data source (the usual answer today): the matrix is drawn as hatched
 *   cells under the alpha names with the words `Not available · No correlation
 *   data source`, and the server's reason code beside them. No coefficient is
 *   ever estimated here;
 * - a read that failed for another reason: the typed state and its reason;
 * - a published matrix or ranked pairs: the strongest pairs by magnitude as a
 *   table, each coefficient the published string, with the sample count when
 *   the source sends one. `top N / total` says how much is not drawn.
 */
import type { Correlation } from "../../../../analytics";
import { PanelState } from "../../../../components/states";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Absent } from "../format";
import type { TabCtx } from "./ctx";
import { correlationView, type CorrelationPairView } from "./model";

import "../../../css/portfolios.css";

const NAME_LIMIT = 6;

function NoSource({ names, reason }: { names: readonly string[]; reason: string | null }) {
  const shown = names.slice(0, NAME_LIMIT);
  return (
    <div className="exec-pf-corr">
      <div className="exec-pf-mx" role="img" aria-label="Correlation matrix, not available" style={{ ["--exec-pf-mx-n" as string]: shown.length + 1 }}>
        <span />
        {shown.map((name) => <span key={`c-${name}`} className="exec-pf-mx-h">{name}</span>)}
        {shown.map((row) => (
          <span key={`r-${row}`} className="exec-pf-mx-row">
            <span className="exec-pf-mx-h">{row}</span>
            {shown.map((column) => <span key={`${row}-${column}`} className="exec-pf-mx-cell" data-hatch="true" />)}
          </span>
        ))}
      </div>
      {names.length > shown.length ? <p className="exec-pf-note">{names.length - shown.length} more {names.length - shown.length === 1 ? "alpha" : "alphas"} not drawn.</p> : null}
      <p className="exec-pf-note"><Absent reason="No correlation data source" />{reason ? <span className="exec-pf-dim"> · {reason}</span> : null}</p>
    </div>
  );
}

const PAIR_COLUMNS: readonly CardsColumn<CorrelationPairView>[] = [
  { key: "left", label: "Alpha", render: (p) => p.left },
  { key: "right", label: "With", render: (p) => p.right },
  { key: "coefficient", label: "Coefficient", numeric: true, render: (p) => <span className="exec-pf-num" title={p.coefficient}>{p.coefficient}</span> },
  { key: "samples", label: "Samples", numeric: true, render: (p) => (p.samples === null ? <Absent reason="not published" /> : String(p.samples)) },
];

function Pairs({ correlation }: { correlation: Correlation }) {
  const view = correlationView(correlation);
  return (
    <div className="exec-pf-corr">
      <CardsTable label="Strongest correlations" columns={PAIR_COLUMNS} rows={view.pairs} rowKey={(p) => p.key} />
      <p className="exec-pf-note">Top {view.pairs.length} / {view.pairCount} pairs by magnitude, across {view.entities} entities. Coefficients are as published.</p>
    </div>
  );
}

export function CorrelationState({ ctx }: { ctx: TabCtx }) {
  const names = [...new Set(ctx.deployments.map((d) => d.alphaLabel))];
  const state = ctx.reads.correlation;
  switch (state.phase) {
    case "idle":
      return <p className="exec-pf-note">The correlation is read when this tab opens.</p>;
    case "loading":
      return state.last === null ? <PanelState status="loading" /> : correlationView(state.last.correlation).pairCount === 0 ? <NoSource names={names} reason="the source published no pair" /> : <Pairs correlation={state.last.correlation} />;
    case "error":
      // A refusal is a refusal; any other failure is the matrix's absence, with the server's code beside it.
      return state.status === "denied" ? <PanelState status="denied" reason={state.reason} /> : <NoSource names={names} reason={state.reason} />;
    case "ready":
      return correlationView(state.value.correlation).pairCount === 0 ? <NoSource names={names} reason="the source published no pair" /> : <Pairs correlation={state.value.correlation} />;
  }
}
