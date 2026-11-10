/**
 * Positions and Orders tab (hi-fi: two tables, "Orders below").
 *
 * The typed rows (`positions.typed`, `blotter.typed`, FE-072) are drawn when the server says AVAILABLE: exact text, no sum,
 * and the two columns the source relation does not carry (Leverage, Ack latency) are `Not published (FE-072)` with the
 * server's reason code in the title. When the typed block is NOT_PUBLISHED, or the body has none, a V1 body that carries
 * free rows is drawn under the source's own field names (`readers/publishedRows.ts`): exact text, no unit, no sign
 * colour, no sum. At most 200 rows print and the line says "N of total"; an unknown total is stated too.
 */
import { Link, useSearchParams } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { withContext } from "../../urlState";
import { withPaddedQuantity } from "../stage/padDecimals";
import { QtyCell } from "../stage/QtyCell";
import { sentenceWord } from "../stage/words";
import { Flag } from "../../Flag";
import { GapLine, NotPublished, SectionPanel } from "../../blocks";
import { formatAsOf, readAsOf } from "../../boundary";
import type { PublishedRow, PublishedRows } from "../../readers/publishedRows";
import { cellText, lossNote, lossText } from "../../readers/publishedRows";
import type { CanaryView, OrderRow, PositionRow, RowsFact } from "./readCanary";
import { FE, ROW_CAP, panelLine } from "./model";
import { ExactCell, countLine } from "./parts";

const POSITION_COLUMNS = (reasons: Readonly<Record<string, string>>): readonly CardsColumn<PositionRow>[] => [
  { key: "symbol", label: "Symbol", render: (r) => r.symbol },
  {
    key: "side",
    label: "Side",
    render: (r) => (r.side === null ? null : <Flag kind={r.side === "long" ? "ok" : "attention"} label={r.side === "long" ? "Long" : "Short"} size="sm" />),
  },
  { key: "quantity", label: "Quantity", numeric: true, render: (r) => <QtyCell value={r.quantity} /> },
  { key: "entry", label: "Entry", numeric: true, render: (r) => <ExactCell value={r.entry} unit="money" /> },
  { key: "mark", label: "Mark", numeric: true, render: (r) => <ExactCell value={r.mark} unit="money" /> },
  { key: "unrealised", label: "Unrealised PnL", numeric: true, render: (r) => <ExactCell value={r.unrealised} unit="money" signed /> },
  // The published schema pins `leverage` null (not a column of the source relation): a view that carries a value prints it, otherwise the gap is named.
  { key: "leverage", label: "Leverage", numeric: true, render: (r) => (r.leverage === null ? <NotPublished id={FE.rows} titleReason={reasons.leverage ?? null} compact /> : <ExactCell value={r.leverage} unit="ratio" suffix="×" />) },
];

const ORDER_COLUMNS = (reasons: Readonly<Record<string, string>>): readonly CardsColumn<OrderRow>[] => [
  { key: "symbol", label: "Symbol", render: (r) => r.symbol },
  { key: "type", label: "Type", render: (r) => <span title={r.type ?? undefined}>{sentenceWord(r.type)}</span> },
  { key: "side", label: "Side", render: (r) => (r.side === null ? null : r.side === "buy" ? "Buy" : "Sell") },
  { key: "quantity", label: "Quantity", numeric: true, render: (r) => <QtyCell value={r.quantity} /> },
  { key: "price", label: "Price", numeric: true, render: (r) => <ExactCell value={r.price} unit="money" /> },
  { key: "status", label: "Status", render: (r) => <span title={r.status ?? undefined}>{sentenceWord(r.status)}</span> },
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
      <div title="Columns are the source's own field names.">
        <CardsTable scrollHint columns={publishedColumns(table)} rows={table.rows} rowKey={(row) => row.key} label={label} empty="The source reported none." />
      </div>
      {table.hiddenColumns > 0 || lossNote(table) !== null ? (
        <p className="exec-cny-rowsnote">
          {table.hiddenColumns > 0 ? `${table.hiddenColumns} more field${table.hiddenColumns === 1 ? " is" : "s are"} not drawn.` : ""}
          {lossNote(table) === null ? "" : ` ${lossNote(table)}`}
        </p>
      ) : null}
      <GapLine items={[{ label: `Typed ${rowsLabel.toLowerCase()}`, id: FE.rows, reason: reasonCode }]} />
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
  absent,
}: {
  title: string;
  label: string;
  fact: RowsFact<R>;
  columns: (reasons: Readonly<Record<string, string>>) => readonly CardsColumn<R>[];
  rowKey(row: R, index: number): string;
  rowsLabel: string;
  /** Per column key: is this row's cell unpublished? A column every row leaves out is not drawn. */
  absent?: Readonly<Record<string, { reason: string; is(row: R): boolean }>>;
}) {
  const rows = fact.rows;
  const visible = rows === null ? [] : rows.slice(0, ROW_CAP);
  const position = new Map(visible.map((row, index) => [row, index] as const));
  const published = rows === null ? fact.published : null;
  const reasons = Object.fromEntries((fact.notPublishedColumns ?? []).map((c) => [c.column, c.reasonCode]));
  // A column no row can fill (Leverage, Ack latency) is not drawn per row: its name is one `Not available` line under the table.
  const allColumns = columns(reasons);
  const dropped = rows === null || rows.length === 0 ? [] : allColumns.filter((column) => absent?.[column.key] !== undefined && rows.every((row) => absent[column.key]!.is(row)));
  const shownColumns = allColumns.filter((column) => !dropped.includes(column));
  return (
    <SectionPanel
      level={2}
      title={title}
      aside={rows !== null ? countLine(rows.length, fact.total, ROW_CAP) : published !== null ? countLine(published.rows.length, published.total, ROW_CAP) : undefined}
    >
      {published !== null ? (
        <PublishedRowsTable table={published} label={label} rowsLabel={rowsLabel} reasonCode={fact.typedReasonCode} />
      ) : rows === null ? (
        <GapLine items={[{ label: rowsLabel, id: FE.rows, reason: fact.typedReasonCode }]} because={panelLine(fact.panel)} />
      ) : (
        <CardsTable
          scrollHint
          columns={shownColumns}
          rows={visible}
          rowKey={(row) => rowKey(row, position.get(row) ?? 0)}
          label={label}
          empty="The source reported none."
        />
      )}
      {dropped.length > 0 ? <GapLine items={dropped.map((column) => ({ label: column.label, id: FE.rows, reason: reasons[absent?.[column.key]?.reason ?? column.key] ?? null }))} /> : null}
    </SectionPanel>
  );
}

/** One quantity column, one number of places (formatting only). */
const padded = <R extends { quantity: string | null }>(fact: RowsFact<R>): RowsFact<R> => (fact.rows === null ? fact : { ...fact, rows: withPaddedQuantity(fact.rows) });

export function PositionsOrdersTab({ view }: { view: CanaryView }) {
  const [params] = useSearchParams();
  return (
    <div className="exec-cny-stack">
      <RowsPanel
        title="Positions"
        label="Canary positions"
        fact={padded(view.positions)}
        columns={POSITION_COLUMNS}
        rowKey={(row, index) => `${row.symbol}-${index}`}
        rowsLabel="Position rows"
        absent={{ leverage: { reason: "leverage", is: (row) => row.leverage === null } }}
      />
      <RowsPanel
        title="Open orders"
        label="Canary open orders"
        fact={padded(view.orders)}
        columns={ORDER_COLUMNS}
        rowKey={(row, index) => `${row.symbol}-${index}`}
        rowsLabel="Order rows"
        absent={{ ack: { reason: "ack_latency_ms", is: (row) => row.ackLatencyMs === null } }}
      />
      {view.deploymentId === null ? null : (
        <p className="exec-cny-foot">
          <Link className="exec-blk-link" to={withContext(`/deployments/blotter?deployment=${encodeURIComponent(view.deploymentId)}&env=live`, params)}>Open the full blotter for this deployment</Link>
        </p>
      )}
    </div>
  );
}
