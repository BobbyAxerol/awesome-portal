/**
 * Positions and Orders tab (hi-fi: two tables, "Orders below").
 *
 * The contract's rows are free objects whose field names are not published (FE-072), so the hi-fi's typed
 * columns (Entry, Mark, Unrealised PnL, Leverage, Ack latency) are `Not published (FE-072)`. A V1 body that
 * does carry rows is drawn under the source's own field names (`readers/publishedRows.ts`): exact text, no
 * unit, no sign colour, no sum. When a reader publishes typed rows the tables print at most 200 of them and
 * say "N of total": the cap is stated, never silent, and an unknown total is stated too.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { SectionPanel } from "../../blocks";
import { formatAsOf, readAsOf } from "../../boundary";
import type { PublishedRow, PublishedRows } from "../../readers/publishedRows";
import { cellText } from "../../readers/publishedRows";
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

/** The source's own members as columns. The cell is the exact text the server wrote; an absent member says so. */
function publishedColumns(table: PublishedRows): readonly CardsColumn<PublishedRow>[] {
  return table.columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    render: (row: PublishedRow) => {
      const text = cellText(row.cells[index]);
      return text === null ? null : <span className="exec-blk-num" title={text}>{text}</span>;
    },
  }));
}

function PublishedRowsTable({ table, label, rowsLabel }: { table: PublishedRows; label: string; rowsLabel: string }) {
  return (
    <>
      <CardsTable columns={publishedColumns(table)} rows={table.rows} rowKey={(row) => row.key} label={label} empty="The source reported none." />
      <p className="exec-cny-rowsnote">
        Columns are the source's own field names.{table.hiddenColumns > 0 ? ` ${table.hiddenColumns} more field${table.hiddenColumns === 1 ? " is" : "s are"} not drawn.` : ""}{" "}
        <RowsNotPublished what={`Typed ${rowsLabel.toLowerCase()}`} />
      </p>
    </>
  );
}

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
  const published = rows === null ? fact.published : null;
  return (
    <SectionPanel
      title={title}
      aside={rows !== null ? countLine(rows.length, fact.total, ROW_CAP) : published !== null ? countLine(published.rows.length, published.total, ROW_CAP) : undefined}
    >
      {published !== null ? (
        <>
          <p className="exec-cny-rowsnote"><span className="exec-blk-na">{panelLine(fact.panel)}.</span></p>
          <PublishedRowsTable table={published} label={label} rowsLabel={rowsLabel} />
        </>
      ) : rows === null ? (
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
