/**
 * Positions and Orders tab (hi-fi: two tables, "Orders below").
 *
 * The typed rows (`positions.typed`, `blotter.typed`, FE-072) are drawn when the server says AVAILABLE: exact text, no sum,
 * and the two columns the source relation does not carry (Leverage, Ack latency) are `Not published (FE-072)` with the
 * server's reason code in the title. When the typed block is NOT_PUBLISHED, or the body has none, a V1 body that carries
 * free rows is drawn under the source's own field names (`readers/publishedRows.ts`): exact text, no unit, no sign
 * colour, no sum. At most 200 rows print and the line says "N of total"; an unknown total is stated too.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { NotPublished, SectionPanel } from "../../blocks";
import { formatAsOf, readAsOf } from "../../boundary";
import type { PublishedRow, PublishedRows } from "../../readers/publishedRows";
import { cellText, lossNote, lossText } from "../../readers/publishedRows";
import type { CanaryView, OrderRow, PositionRow, RowsFact } from "./readCanary";
import { FE, ROW_CAP, panelLine } from "./model";
import { ExactCell, RowsNotPublished, countLine } from "./parts";

const POSITION_COLUMNS = (reasons: Readonly<Record<string, string>>): readonly CardsColumn<PositionRow>[] => [
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
  // The published schema pins `leverage` null (not a column of the source relation): a view that carries a value prints it, otherwise the gap is named.
  { key: "leverage", label: "Leverage", numeric: true, render: (r) => (r.leverage === null ? <NotPublished id={FE.rows} titleReason={reasons.leverage ?? null} compact /> : <ExactCell value={r.leverage} unit="ratio" suffix="×" />) },
];

const ORDER_COLUMNS = (reasons: Readonly<Record<string, string>>): readonly CardsColumn<OrderRow>[] => [
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
  { key: "ack", label: "Ack latency", numeric: true, render: (r) => (r.ackLatencyMs === null ? <NotPublished id={FE.rows} titleReason={reasons.ack_latency_ms ?? null} compact /> : <ExactCell value={r.ackLatencyMs} unit="count" suffix=" ms" />) },
];

/** The source's own members as columns. The cell is the exact text the server wrote; an absent member says so. */
function publishedColumns(table: PublishedRows): readonly CardsColumn<PublishedRow>[] {
  return table.columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    render: (row: PublishedRow) => {
      const lost = row.lost[index];
      if (lost !== null && lost !== undefined) return <span className="exec-blk-na" data-lost={lost}>{lossText(lost)}</span>;
      const text = cellText(row.cells[index]);
      return text === null ? null : <span className="exec-blk-num" title={text}>{text}</span>;
    },
  }));
}

function PublishedRowsTable({ table, label, rowsLabel, reasonCode }: { table: PublishedRows; label: string; rowsLabel: string; reasonCode?: string | null }) {
  return (
    <>
      <CardsTable columns={publishedColumns(table)} rows={table.rows} rowKey={(row) => row.key} label={label} empty="The source reported none." />
      <p className="exec-cny-rowsnote">
        Columns are the source's own field names.{table.hiddenColumns > 0 ? ` ${table.hiddenColumns} more field${table.hiddenColumns === 1 ? " is" : "s are"} not drawn.` : ""}{lossNote(table) === null ? "" : ` ${lossNote(table)}`}{" "}
        <RowsNotPublished what={`Typed ${rowsLabel.toLowerCase()}`} reasonCode={reasonCode} />
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
  columns: (reasons: Readonly<Record<string, string>>) => readonly CardsColumn<R>[];
  rowKey(row: R, index: number): string;
  rowsLabel: string;
}) {
  const rows = fact.rows;
  const visible = rows === null ? [] : rows.slice(0, ROW_CAP);
  const position = new Map(visible.map((row, index) => [row, index] as const));
  const published = rows === null ? fact.published : null;
  const reasons = Object.fromEntries((fact.notPublishedColumns ?? []).map((c) => [c.column, c.reasonCode]));
  return (
    <SectionPanel
      level={2}
      title={title}
      aside={rows !== null ? countLine(rows.length, fact.total, ROW_CAP) : published !== null ? countLine(published.rows.length, published.total, ROW_CAP) : undefined}
    >
      {published !== null ? (
        <>
          <p className="exec-cny-rowsnote"><span className="exec-blk-na">{panelLine(fact.panel)}.</span></p>
          <PublishedRowsTable table={published} label={label} rowsLabel={rowsLabel} reasonCode={fact.typedReasonCode} />
        </>
      ) : rows === null ? (
        <p className="exec-cny-rowsnote">
          <span className="exec-blk-na">{panelLine(fact.panel)}.</span> <RowsNotPublished what={rowsLabel} reasonCode={fact.typedReasonCode} />
        </p>
      ) : (
        <CardsTable
          columns={columns(reasons)}
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
