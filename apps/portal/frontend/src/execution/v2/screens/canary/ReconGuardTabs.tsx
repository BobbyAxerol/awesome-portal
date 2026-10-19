/**
 * Reconciliation and Guard rule tabs.
 *
 * Reconciliation is the Triad. Its rows (equity, gross notional, position,
 * open orders) are not typed on the wire (`source_panels.*.data` is a free object,
 * FE-072), so every cell is `Not available` and the Difference is never
 * subtracted here. A source panel the server marked `suppressed` withholds the
 * Broker and Difference columns outright ("Hidden while the figures disagree").
 *
 * Guard rule is the asymmetry the screen exists to show: a stale broker snapshot
 * blocks scale-up, not protective actions. It is read from the two action groups'
 * own `broker_sync_blocks` flags, an unreadable flag reading "blocks".
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { SectionPanel, Triad, type TriadRow, type TriadSide } from "../../blocks";
import { readAsOf } from "../../boundary";
import type { CanaryView, PanelFact } from "./readCanary";
import { guardRows, guardSentence, panelLine, type GuardCell, type GuardRow } from "./model";
import { RowsNotPublished } from "./parts";

const ROWS: readonly TriadRow[] = [{ key: "figures", label: "Figures" }];

/** A side whose source panel is missing or unavailable is `null` (every cell `Not available`); otherwise it carries its own as-of. */
function sideOf(panel: PanelFact | null): TriadSide | null {
  if (panel === null || panel.state === "unavailable" || panel.state === "denied" || panel.state === "terminal") return null;
  return { asOf: panel.asOfMs === null ? null : readAsOf(panel.asOfMs) };
}

export function ReconciliationTab({ view }: { view: CanaryView }) {
  const suppressed = view.broker?.state === "suppressed" || view.difference?.state === "suppressed";
  const sources: readonly [string, PanelFact | null][] = [
    ["Internal", view.internal],
    ["Broker", view.broker],
    ["Difference", view.difference],
  ];
  return (
    <SectionPanel level={2} title="Reconciliation" aside="Internal, Broker, Difference">
      <Triad rows={ROWS} internal={sideOf(view.internal)} broker={sideOf(view.broker)} suppressed={suppressed} />
      <p className="exec-cny-foot">
        <RowsNotPublished what="Reconciliation rows (equity, gross notional, position, open orders)" />
      </p>
      <ul className="exec-cny-sources" aria-label="Source panels">
        {sources.map(([name, panel]) => (
          <li key={name}>
            <span className="exec-cny-source-name">{name}</span> <span className="exec-blk-na">{panelLine(panel)}</span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function CellFlag({ cell }: { cell: GuardCell }) {
  return <Flag kind={cell.flag} label={cell.label} size="sm" />;
}

const GUARD_COLUMNS: readonly CardsColumn<GuardRow>[] = [
  { key: "condition", label: "Condition", render: (r) => r.condition },
  { key: "scale", label: "Scale-up", render: (r) => <CellFlag cell={r.scaleUp} /> },
  { key: "protective", label: "Protective actions", render: (r) => <CellFlag cell={r.protective} /> },
  { key: "now", label: "Now", render: (r) => <CellFlag cell={r.now} /> },
];

export function GuardRuleTab({ view }: { view: CanaryView }) {
  return (
    <SectionPanel level={2} title="Guard rule" aside="Scale-up only">
      <CardsTable columns={GUARD_COLUMNS} rows={guardRows(view)} rowKey={(r) => r.condition} label="Canary guard rule" />
      <p className="exec-cny-foot">{guardSentence(view)}</p>
    </SectionPanel>
  );
}
