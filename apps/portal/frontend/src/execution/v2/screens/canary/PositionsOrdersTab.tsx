/**
 * Positions and Orders tab (hi-fi: two tables, "Orders below").
 *
 * The contract's rows are free objects (FE-072) and no reader types them, so
 * today both panels say what the source stated about the panel and
 * `Not published (FE-072)` for the rows. When a reader does publish typed rows
 * the tables print at most 200 of them and say "N of total": the cap is stated,
 * never silent, and an unknown total is stated too.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { SectionPanel } from "../../blocks";
import { formatAsOf, readAsOf } from "../../boundary";
import type { CanaryView, OrderRow, PositionRow, RowsFact } from "./readCanary";
import { ROW_CAP, panelLine } from "./model";
import { ExactCell, RowsNotPublished, countLine } from "./parts";

const POSITION_COLUMNS: readonly CardsColumn<PositionRow>[] = [
  { key: "symbol", label: "Symbol", render: (r) => r.symbol },
  {
    key: "side",
    label: "Side",
    render: (r) => (r.side === null ? null : <Flag kind={r.side === "long" ? "ok" : "attention"} label={r.side === "long" ? "Long" : "Short"} size="sm" />),
  },
  { key: "quantity", label: "Quantity", numeric: true, render: (r) => <ExactCell value={r.quantity} unit="qty" /> },
  { key: "entry", label: "Entry", numeric: true, render: (r) => <ExactCell value={r.entry} unit="money" /> },
  { key: "mark", label: "Mark", numeric: true, render: (r) => <ExactCell value={r.mark} unit="money" /> },
  { key: "unrealised", label: "Unrealised PnL", numeric: true, render: (r) => <ExactCell value={r.unrealised} unit="money" signed /> },
  { key: "leverage", label: "Leverage", numeric: true, render: (r) => <ExactCell value={r.leverage} unit="ratio" suffix="×" /> },
];

const ORDER_COLUMNS: readonly CardsColumn<OrderRow>[] = [
  { key: "symbol", label: "Symbol", render: (r) => r.symbol },
  { key: "type", label: "Type", render: (r) => r.type },
  { key: "side", label: "Side", render: (r) => (r.side === null ? null : r.side === "buy" ? "Buy" : "Sell") },
  { key: "quantity", label: "Quantity", numeric: true, render: (r) => <ExactCell value={r.quantity} unit="qty" /> },
  { key: "price", label: "Price", numeric: true, render: (r) => <ExactCell value={r.price} unit="money" /> },
  {
    key: "since",
    label: "Since",
    render: (r) => {
      const at = r.sinceMs === null ? null : readAsOf(r.sinceMs);
      return at === null ? null : formatAsOf(at);
    },
  },
  { key: "ack", label: "Ack latency", numeric: true, render: (r) => <ExactCell value={r.ackLatencyMs} unit="count" suffix=" ms" /> },
];

function RowsPanel<R>({
  title,
  label,
  fact,
  columns,
  rowKey,
  rowsLabel,
}: {
  title: string;
  label: string;
  fact: RowsFact<R>;
  columns: readonly CardsColumn<R>[];
  rowKey(row: R, index: number): string;
  rowsLabel: string;
}) {
  const rows = fact.rows;
  const visible = rows === null ? [] : rows.slice(0, ROW_CAP);
  const position = new Map(visible.map((row, index) => [row, index] as const));
  return (
    <SectionPanel title={title} aside={rows === null ? undefined : countLine(rows.length, fact.total, ROW_CAP)}>
      {rows === null ? (
        <p className="exec-cny-rowsnote">
          <span className="exec-blk-na">{panelLine(fact.panel)}.</span> <RowsNotPublished what={rowsLabel} />
        </p>
      ) : (
        <CardsTable
          columns={columns}
          rows={visible}
          rowKey={(row) => rowKey(row, position.get(row) ?? 0)}
          label={label}
          empty="The source reported none."
        />
      )}
    </SectionPanel>
  );
}

export function PositionsOrdersTab({ view }: { view: CanaryView }) {
  return (
    <div className="exec-cny-stack">
      <RowsPanel
        title="Positions"
        label="Canary positions"
        fact={view.positions}
        columns={POSITION_COLUMNS}
        rowKey={(row, index) => `${row.symbol}-${index}`}
        rowsLabel="Position rows"
      />
      <RowsPanel
        title="Open orders"
        label="Canary open orders"
        fact={view.orders}
        columns={ORDER_COLUMNS}
        rowKey={(row, index) => `${row.symbol}-${index}`}
        rowsLabel="Order rows"
      />
    </div>
  );
}
