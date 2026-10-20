/**
 * Small pieces of Live operations that more than one tab prints: a model `Cell`, a keyed two-column
 * table, the guard-rule table, the capped keyset panel table and the chart slot.
 */
import { Link, useSearchParams } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { GapLine, MetricText, NO_VALUE_COPY, NaWhy, NotPublished, SectionPanel, type GapItem } from "../../blocks";
import { ChartTools, EquityPanel } from "../../charts";
import type { SeriesPoint as ChartPoint } from "../../charts/types";
import { readAsOf } from "../../boundary";
import { ExactCell } from "../canary/parts";
import { formatAsOf } from "../../boundary";
import { withContext } from "../../urlState";
import type { LiveSourcePanelV2, LiveSourceRecordV2 } from "../../readers/liveSourceOperations";
import type { TypedOrderRow, TypedPositionRow } from "../../../stageFacts";
import { PanelState } from "../../../components/states";
import { cellText, lossNote, lossText, type PublishedRow } from "../../readers/publishedRows";
import {
  OPERATIONS_PATH,
  ROW_CAP,
  capCaption,
  panelCell,
  panelColumns,
  panelNoun,
  panelReason,
  panelTitle,
  safeInternalHref,
  type Cell,
  type ChartSlotModel,
  type PanelColumn,
  type V1RowsPanel,
} from "./model";
import type { PanelPage } from "./useLiveReads";

/** A model cell: published text, a flag, a list, `Not published (FE-xxx)` or `Not available`. */
export function CellView({ cell }: { cell: Cell }) {
  switch (cell.t) {
    case "text":
      return <>{cell.text}</>;
    case "flag":
      return <Flag kind={cell.kind} label={cell.label} size="sm" />;
    case "list":
      return (
        <span className="exec-liv-list">
          {cell.items.map((item) => (
            <span key={item} className="exec-liv-chip">{item}</span>
          ))}
        </span>
      );
    case "np":
      return (
        <NotPublished id={cell.fe} titleReason={cell.reason}>
          {cell.what}
        </NotPublished>
      );
    case "na":
      return <NaWhy reason={cell.reason} text={NO_VALUE_COPY} />;
  }
}

/** An in-app link carrying the page context, or the plain words when the server's link is not an in-app path. */
export function ContextLink({ to, children }: { to: string | null; children: string }) {
  const [params] = useSearchParams();
  const href = safeInternalHref(to);
  if (href === null) return null;
  return <Link className="exec-blk-link" to={withContext(href, params)}>{children}</Link>;
}

/* ── the slot above the tabs ─────────────────────────────────────────────── */

/**
 * Where the Live net PnL chart goes. A mismatch or a gap REPLACES the chart with one sentence and one
 * link (hi-fi `.slot.bad`): a line drawn from figures that disagree, or from a feed with a hole, is the
 * wrong thing to show. With neither, the series is not published (the schema carries no points), so the
 * slot says that and names the request.
 */
export function ChartSlot({ slot }: { slot: ChartSlotModel }) {
  switch (slot.kind) {
    case "mismatch":
      return (
        <section className="exec-liv-slot" data-state="mismatch" role="alert" aria-label="Live net PnL">
          <Flag kind="attention" label="Mismatch" />
          <p className="exec-liv-slot-text">Internal and broker figures disagree. Chart hidden until reconciled.</p>
          <p className="exec-liv-slot-links">
            <ContextLink to={slot.findingHref}>Open finding</ContextLink>
            <ContextLink to={slot.reconcileHref}>Open dry-run reconcile</ContextLink>
          </p>
        </section>
      );
    case "gap":
      return (
        <section className="exec-liv-slot" data-state="gap" role="alert" aria-label="Live net PnL">
          <Flag kind="partial" label="Gap" />
          <p className="exec-liv-slot-text">Updates are missing. Chart hidden until the gap is filled.</p>
          <p className="exec-liv-slot-meta">
            Gap window <CellView cell={slot.window} />
          </p>
          <p className="exec-liv-slot-links">
            <ContextLink to={OPERATIONS_PATH}>Open operation</ContextLink>
          </p>
        </section>
      );
    case "series": {
      const points: ChartPoint[] = [];
      for (const p of slot.points) {
        const at = readAsOf(Date.parse(p.t));
        if (at !== null) points.push({ t: at, v: p.value });
      }
      return (
        <SectionPanel level={2} title="Deployment series">
          <div title={slot.methodologyRef === null ? undefined : `Methodology ${slot.methodologyRef}`}>
            <ChartTools label="Deployment series" columns={points.length === 0 ? [] : [{ key: "series", label: "Deployment series", points, unit: "money", currency: slot.unit ?? undefined, signed: true }]}>
              <EquityPanel label="Deployment series" points={points} unit="money" currency={slot.unit ?? undefined} signed height={200} />
            </ChartTools>
          </div>
        </SectionPanel>
      );
    }
    case "unavailable":
      return (
        <SectionPanel level={2} title="Live net PnL" aside="Since activation">
          <GapLine items={[{ label: "Live net PnL series", id: "FE-013" }]} />
        </SectionPanel>
      );
  }
}

/* ── a two-column keyed table (continuity, guard rules, predecessor) ─────── */

export interface KeyedRow {
  key: string;
  cells: readonly Cell[];
}

export function KeyedTable({ label, columns, rows }: { label: string; columns: readonly { key: string; label: string; numeric?: boolean }[]; rows: readonly { key: string; cells: readonly Cell[] }[] }) {
  const cols: CardsColumn<(typeof rows)[number]>[] = columns.map((c, index) => ({
    key: c.key,
    label: c.label,
    numeric: c.numeric,
    render: (row) => <CellView cell={row.cells[index] ?? { t: "na" }} />,
  }));
  return <CardsTable columns={cols} rows={rows} rowKey={(row) => row.key} label={label} />;
}

/* ── a V2 retained-observation panel: capped table + keyset Load more ───── */

function CellOf({ column, record }: { column: PanelColumn; record: LiveSourceRecordV2 }) {
  const cell = panelCell(column.field, record.values[column.field]);
  switch (cell.kind) {
    case "absent":
      return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
    case "text":
      return <span className={column.numeric ? undefined : "exec-blk-id"}>{cell.text}</span>;
    case "side":
      return <Flag kind="neutral" label={cell.label} size="sm" />;
    case "metric":
      return <MetricText metric={cell.metric} suffix={cell.suffix} />;
    case "instant":
      return <span className="exec-blk-id">{cell.label}</span>;
  }
}

/**
 * `positions` / `orders` of a V1 body. A table is the source's own members under its own names with the exact text it wrote
 * (no unit, no rounding, no sign colour); the typed hi-fi columns stay `Not published (FE-072)`. A panel that holds no rows says
 * why, then names the request.
 */
function unpublishedColumn<R>(key: string, label: string, reasons: Readonly<Record<string, string>>): CardsColumn<R> {
  return { key, label, numeric: true, render: () => <NotPublished id="FE-072" titleReason={reasons[key] ?? null} compact /> };
}

const POSITION_COLUMNS = (reasons: Readonly<Record<string, string>>): readonly CardsColumn<TypedPositionRow>[] => [
  { key: "symbol", label: "Symbol", render: (r) => r.symbol },
  { key: "side", label: "Side", render: (r) => (r.side === null ? null : <Flag kind={r.side === "long" ? "ok" : "attention"} label={r.side === "long" ? "Long" : "Short"} size="sm" />) },
  { key: "quantity", label: "Quantity", numeric: true, render: (r) => <ExactCell value={r.quantity} unit="qty" /> },
  { key: "entry", label: "Entry", numeric: true, render: (r) => <ExactCell value={r.entry} unit="money" /> },
  { key: "mark", label: "Mark", numeric: true, render: (r) => <ExactCell value={r.mark} unit="money" /> },
  { key: "unrealised", label: "Unrealised PnL", numeric: true, render: (r) => <ExactCell value={r.unrealised} unit="money" signed /> },
  unpublishedColumn("leverage", "Leverage", reasons),
];

const ORDER_COLUMNS = (reasons: Readonly<Record<string, string>>): readonly CardsColumn<TypedOrderRow>[] => [
  { key: "symbol", label: "Symbol", render: (r) => r.symbol },
  { key: "type", label: "Type", render: (r) => r.type },
  { key: "side", label: "Side", render: (r) => (r.side === null ? null : r.side === "buy" ? "Buy" : "Sell") },
  { key: "quantity", label: "Quantity", numeric: true, render: (r) => <ExactCell value={r.quantity} unit="qty" /> },
  { key: "price", label: "Price", numeric: true, render: (r) => <ExactCell value={r.price} unit="money" /> },
  { key: "status", label: "Status", render: (r) => r.status },
  {
    key: "since",
    label: "Since",
    render: (r) => {
      const at = r.since === null ? null : readAsOf(Date.parse(r.since));
      return at === null ? null : formatAsOf(at);
    },
  },
  unpublishedColumn("ack_latency_ms", "Ack latency", reasons),
];

/**
 * The gap a V1 rows panel reduces to, or `null` when the panel has rows (or a withheld claim of its own) to draw. A body that
 * publishes no rows for several panels says it ONCE (`GapLine`) instead of one panel of the same words per panel.
 */
export function v1RowsGap(rows: V1RowsPanel, what: string): GapItem | null {
  if (rows.kind === "typed-positions" || rows.kind === "typed-orders" || rows.kind === "table") return null;
  const gapReason = rows.kind === "withheld" && rows.text.startsWith("Not available · ") ? rows.text.slice("Not available · ".length) : null;
  if (rows.kind === "withheld" && gapReason === null) return null;
  return { label: what, id: "FE-072", reason: gapReason };
}

export function V1RowsSection({ title, aside, rows, what }: { title: string; aside?: string; rows: V1RowsPanel; what: string }) {
  if (rows.kind === "typed-positions" || rows.kind === "typed-orders") {
    // The server's typed rows (FE-072): exact text, no sum; the two columns the source relation lacks say so with the server's reason.
    const shown = rows.rows.slice(0, ROW_CAP);
    // A column no row fills (Leverage, Ack latency) is not drawn per row: its name is one `Not available` line under the table.
    // (The source relation carries neither, so no row can fill them.)
    const unfilled = true;
    const dropKey = rows.kind === "typed-positions" ? "leverage" : "ack_latency_ms";
    const dropLabel = rows.kind === "typed-positions" ? "Leverage" : "Ack latency";
    const keep = (column: { key: string }) => !(unfilled && shown.length > 0 && column.key === dropKey);
    return (
      <SectionPanel level={2} title={title} aside={aside}>
        {rows.line ? <p className="exec-liv-line"><span className="exec-blk-na">{rows.line}</span></p> : null}
        {rows.kind === "typed-positions" ? (
          <CardsTable columns={POSITION_COLUMNS(rows.reasons).filter(keep)} rows={shown as TypedPositionRow[]} rowKey={(row) => `${row.id ?? row.symbol}`} label={title} empty="The source reported none." />
        ) : (
          <CardsTable columns={ORDER_COLUMNS(rows.reasons).filter(keep)} rows={shown as TypedOrderRow[]} rowKey={(row) => `${row.id ?? row.symbol}`} label={title} empty="The source reported none." />
        )}
        <div className="exec-liv-more">
          <span className="exec-liv-cap">{rows.caption}</span>
        </div>
        {unfilled && shown.length > 0 ? <GapLine items={[{ label: dropLabel, id: "FE-072", reason: rows.reasons[dropKey] ?? null }]} /> : null}
      </SectionPanel>
    );
  }
  if (rows.kind !== "table") {
    // Withheld on purpose ("Hidden while the figures disagree") is its own claim and keeps its words; a plain gap is `Not available` and the reason goes in the title.
    const gapReason = rows.kind === "withheld" && rows.text.startsWith("Not available · ") ? rows.text.slice("Not available · ".length) : null;
    return (
      <SectionPanel level={2} title={title} aside={aside}>
        {rows.kind === "withheld" && gapReason === null ? <p className="exec-liv-line"><span className="exec-blk-na">{rows.text}</span></p> : null}
        <GapLine items={[{ label: what, id: "FE-072", reason: gapReason }]} />
      </SectionPanel>
    );
  }
  const { table } = rows;
  const shown = table.rows.slice(0, ROW_CAP);
  const cols: CardsColumn<PublishedRow>[] = table.columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    render: (row) => {
      const lost = row.lost[index];
      if (lost !== null && lost !== undefined) return <span className="exec-blk-na" data-lost={lost}>{lossText(lost)}</span>;
      const text = cellText(row.cells[index]);
      return text === null ? null : <span className="exec-blk-num" title={text}>{text}</span>;
    },
  }));
  return (
    <SectionPanel level={2} title={title} aside={aside}>
      {rows.line ? <p className="exec-liv-line"><span className="exec-blk-na">{rows.line}</span></p> : null}
      <div title="Columns are the source's own field names.">
        <CardsTable columns={cols} rows={shown} rowKey={(row) => row.key} label={title} empty="The source reported none." />
      </div>
      <div className="exec-liv-more">
        <span className="exec-liv-cap">{rows.caption}</span>
      </div>
      {table.hiddenColumns > 0 || lossNote(table) !== null ? (
        <p className="exec-liv-line">
          {table.hiddenColumns > 0 ? `${table.hiddenColumns} more field${table.hiddenColumns === 1 ? " is" : "s are"} not drawn.` : ""}
          {lossNote(table) === null ? "" : ` ${lossNote(table)}`}
        </p>
      ) : null}
      <GapLine items={[{ label: `Typed ${what.toLowerCase()}`, id: "FE-072" }]} />
    </SectionPanel>
  );
}

export interface PanelSectionProps {
  panel: LiveSourcePanelV2;
  page: PanelPage;
  onMore(): void;
}

/**
 * One retained panel. Counts are the page's, never a total: `exact_total` is null on every V2 panel, so the
 * caption says what is loaded and that the total is not published. At most `ROW_CAP` rows are drawn.
 */
export function PanelSection({ panel, page, onMore }: PanelSectionProps) {
  const title = panelTitle(panel.name);
  const noun = panelNoun(panel.name);
  const aside = panel.state === "PARTIAL" ? <Flag kind="partial" label="Partial" size="sm" /> : undefined;
  const columns = panelColumns(page.records);
  const shown = page.records.slice(0, ROW_CAP);
  // Past the cap Load more would only add rows nobody can see: say so and point at the Blotter.
  const atCap = page.hasMore && page.records.length >= ROW_CAP;
  const cols: CardsColumn<LiveSourceRecordV2>[] = columns.map((column) => ({
    key: column.field,
    label: column.label,
    numeric: column.numeric,
    render: (record) => <CellOf column={column} record={record} />,
  }));

  let body;
  if (panel.state === "NOT_PUBLISHED") {
    body = <p className="exec-liv-line"><NaWhy reason={panelReason(panel.reasonCode)} /></p>;
  } else if (page.records.length === 0) {
    body = <PanelState status="empty" reason={`No retained ${noun} on this page. ${panelReason(panel.reasonCode)}`} />;
  } else {
    body = (
      <>
        <CardsTable columns={cols} rows={shown} rowKey={(record) => record.observationId} label={title} />
        <div className="exec-liv-more">
          <span className="exec-liv-cap">
            {atCap
              ? `First ${shown.length} shown of ${page.records.length} loaded · more available; use Blotter for the full list`
              : capCaption({ shown: shown.length, loaded: page.records.length, total: null, hasMore: page.hasMore, noun })}
          </span>
          {page.hasMore && !atCap ? (
            <button type="button" className="exec-blk-btn" aria-busy={page.loading ? "true" : undefined} onClick={() => { if (!page.loading) onMore(); }}>
              {page.loading ? "Loading more" : page.error ? "Try again" : "Load more"}
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <SectionPanel level={2} title={title} aside={aside}>
      {page.notice ? <p className="exec-liv-notice" role="status">{page.notice}</p> : null}
      {body}
      {page.error ? <p className="exec-liv-fail" role="alert">Could not load more {noun}. {page.error}</p> : null}
    </SectionPanel>
  );
}
