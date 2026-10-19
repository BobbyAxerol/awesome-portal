/**
 * Small pieces of Live operations that more than one tab prints: a model `Cell`, a keyed two-column
 * table, the guard-rule table, the capped keyset panel table and the chart slot.
 */
import { Link, useSearchParams } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { MetricText, NO_VALUE_COPY, NotPublished, SectionPanel } from "../../blocks";
import { withContext } from "../../urlState";
import type { LiveSourcePanelV2, LiveSourceRecordV2 } from "../../readers/liveSourceOperations";
import { PanelState } from "../../../components/states";
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
      return <NotPublished id={cell.fe}>{cell.what}</NotPublished>;
    case "na":
      return <span className="exec-blk-na">{cell.reason ? `${NO_VALUE_COPY} · ${cell.reason}` : NO_VALUE_COPY}</span>;
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
            The gap window is <NotPublished id="FE-072">Gap window</NotPublished>.
          </p>
          <p className="exec-liv-slot-links">
            <ContextLink to={OPERATIONS_PATH}>Open operation</ContextLink>
          </p>
        </section>
      );
    case "unavailable":
      return (
        <SectionPanel title="Live net PnL" aside="Since activation">
          <p className="exec-liv-line">
            <NotPublished id="FE-013">Live net PnL series</NotPublished>
          </p>
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
  const aside = panel.state === "PARTIAL" ? <Flag kind="partial" label="Partial" size="sm" /> : <Flag kind="na" label="Not published" size="sm" />;
  const columns = panelColumns(page.records);
  const shown = page.records.slice(0, ROW_CAP);
  const cols: CardsColumn<LiveSourceRecordV2>[] = columns.map((column) => ({
    key: column.field,
    label: column.label,
    numeric: column.numeric,
    render: (record) => <CellOf column={column} record={record} />,
  }));

  let body;
  if (panel.state === "NOT_PUBLISHED") {
    body = <p className="exec-liv-line"><span className="exec-blk-na">Not published · {panelReason(panel.reasonCode)}</span></p>;
  } else if (page.records.length === 0) {
    body = <PanelState status="empty" reason={`No retained ${noun} are published for this deployment on this page. ${panelReason(panel.reasonCode)}`} />;
  } else {
    body = (
      <>
        <CardsTable columns={cols} rows={shown} rowKey={(record) => record.observationId} label={title} />
        <div className="exec-liv-more">
          <span className="exec-liv-cap">{capCaption({ shown: shown.length, loaded: page.records.length, total: null, hasMore: page.hasMore, noun })}</span>
          {page.hasMore ? (
            <button type="button" className="exec-blk-btn" aria-busy={page.loading ? "true" : undefined} onClick={() => { if (!page.loading) onMore(); }}>
              {page.loading ? "Loading more" : page.error ? "Try again" : "Load more"}
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <SectionPanel title={title} aside={aside}>
      {page.notice ? <p className="exec-liv-notice" role="status">{page.notice}</p> : null}
      {body}
      {page.error ? <p className="exec-liv-fail" role="alert">Could not load more {noun}. {page.error}</p> : null}
    </SectionPanel>
  );
}
