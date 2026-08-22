/**
 * Mechanism M1 — the keyset table.
 *
 * Every list on the Execution surface is this component: Approval Inbox,
 * Operations Queue, Full Blotter, the linked-accounts tables inside the 360°
 * screens. It exists once because seventeen screens inventing seventeen variants
 * is how the rules below get quietly dropped one screen at a time.
 *
 * The rules it enforces, and where each comes from:
 *
 *   - **No page numbers.** Keyset pagination cannot seek to page *n*
 *     (master plan §7.2). A page-number control would advertise a capability the
 *     contract does not have, so this component does not render one and cannot
 *     be configured to.
 *   - **Counts come from the server.** `totalCount` and `filteredCount` are read
 *     from the page envelope, never from `rows.length` (mechanism M7). A count
 *     computed from loaded rows stays correct until the day the list paginates
 *     and then becomes confidently wrong.
 *   - **Bidirectional.** `after`/`before` are mutually exclusive (BR-EX-17), so
 *     a reader who scrolled past the residency budget can come back without
 *     restarting at row one.
 *   - **Numerics never ellipsis** (mechanism M6, DS §3). A truncated ID or
 *     amount is worse than a scrollbar.
 *   - **Horizontal overflow scrolls inside the panel**, never the page (DS §8).
 *
 * Row height is fixed and shared with the virtualizer. If a caller needs a
 * taller row, the answer is a drawer, not a variable row: the owner already
 * chose a drawer for the blotter funnel precisely because variable-height rows
 * make virtualization at 182,000 rows unworkable.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { KeysetPage, PanelStatus } from "../contracts";
import { emptyMeansEmpty, RetentionNotice, retentionReason } from "./retention";
import { PanelState } from "./states";

/** DS §8: 7px vertical padding, ~16px line, 1px hairline. */
export const ROW_HEIGHT = 32;

/** Mechanism M1: below this, virtualizing costs more than it saves. */
export const VIRTUALIZE_ABOVE = 200;

/** Scale doc §3.2: the browser holds at most this many rows of any list. */
export const RESIDENCY_CAP = 2000;

/** Rows rendered beyond the viewport so a fast scroll does not show blanks. */
const OVERSCAN = 8;

/**
 * Used when the container reports no height — jsdom, a hidden tab, the first
 * paint before layout. Rendering nothing would be worse than rendering a
 * reasonable window, and the window corrects itself on the first real measure.
 */
const UNMEASURED_ROWS = 24;

export interface Column<T> {
  key: string;
  /** Rendered as a micro-label; the hi-fi writes them lowercase. */
  header: string;
  /**
   * Numeric columns are mono, tabular, right-aligned and **never truncated**.
   * Width must come from instrument precision metadata (BR-EX-12) so the widest
   * legal value fits, because the alternative is an ellipsised amount.
   */
  numeric?: boolean;
  /** Prose only. Truncates with a title attribute. Never set with `numeric`. */
  truncate?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
  /** Tooltip for truncated prose. */
  title?: (row: T) => string;
}

export interface KeysetTableProps<T> {
  /** Accessible name — every table on this surface says what it lists. */
  label: string;
  columns: readonly Column<T>[];
  page: KeysetPage<T>;
  rowKey: (row: T) => string;
  /** Non-`ok` renders the panel state instead of an empty table body. */
  status?: PanelStatus;
  reason?: string;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** Per-row emphasis, e.g. an overdue queue item. Rendered as a data attribute. */
  rowEmphasis?: (row: T) => string | undefined;
  /** DS §8 keeps a minimum width so columns do not collapse; the panel scrolls. */
  minWidth?: number;
  /** Test seam and escape hatch for environments that report no height. */
  viewportRows?: number;
  /** Cross-filter strip, cap notices — anything that qualifies the whole list. */
  notice?: ReactNode;
  /**
   * Refuse to virtualize, and say so if the list outgrows the threshold.
   *
   * The Approval Inbox's pending queue asks for this. Its scale-refine cell is
   * explicit: a work queue past 200 rows is an operational problem, not a
   * rendering one, and paginating it away hides the thing somebody needs to act
   * on. So the rows all render and the footer states the overflow.
   */
  neverVirtualize?: boolean;
  /** What to say when a `neverVirtualize` list is over the threshold. */
  overflowNotice?: string;
}

function grouped(n: number): string {
  return n.toLocaleString("en-US");
}

/** `c_ab34e91f…` — enough to compare two cursors, short enough for a footer. */
function shortCursor(cursor: string): string {
  return cursor.length <= 12 ? cursor : `${cursor.slice(0, 11)}…`;
}

export function KeysetTable<T>({
  label,
  columns,
  page,
  rowKey,
  status = "ok",
  reason,
  onLoadOlder,
  onLoadNewer,
  loading = false,
  onRowClick,
  selectedKey = null,
  rowEmphasis,
  minWidth = 880,
  viewportRows,
  notice,
  neverVirtualize = false,
  overflowNotice,
}: KeysetTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredRows, setMeasuredRows] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      setMeasuredRows(h > 0 ? Math.ceil(h / ROW_HEIGHT) : 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = page.rows;

  // A panel with nothing to show says which kind of nothing it is. `empty` and
  // `insufficient_data` are different claims and both are different from a
  // table that is merely still loading.
  //
  // `partial` and `stale` are not in that set: they describe rows we have. An
  // operator can act on a list they know is four minutes old, and a list
  // missing two of five linked facts still holds three that are complete.
  // Replacing either with a state box withholds work that can be done.
  if (status !== "ok" && status !== "partial" && status !== "stale") {
    return <PanelState status={status} reason={reason} />;
  }
  if (rows.length === 0) {
    // Zero rows because a filter matched nothing, and zero rows because the
    // range is archived, look identical and mean opposite things. The server
    // says which; absent is not "everything is online" (EX-BE-04b §3).
    if (!emptyMeansEmpty(page.retention)) {
      return (
        <PanelState
          status={page.retention ? "unavailable" : "empty"}
          reason={reason ?? retentionReason(page.retention) ?? undefined}
        />
      );
    }
    return <PanelState status="empty" reason={reason ?? "No rows match this filter."} />;
  }

  const virtualized = !neverVirtualize && rows.length > VIRTUALIZE_ABOVE;
  const overflowing = neverVirtualize && rows.length > VIRTUALIZE_ABOVE;
  const inView = viewportRows ?? (measuredRows > 0 ? measuredRows : UNMEASURED_ROWS);
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const end = virtualized ? Math.min(rows.length, start + inView + OVERSCAN * 2) : rows.length;
  const padTop = start * ROW_HEIGHT;
  const padBottom = (rows.length - end) * ROW_HEIGHT;

  const filtered = page.filteredCount ?? null;
  const isFiltered = filtered !== null && filtered !== page.totalCount;
  const overBudget = rows.length > RESIDENCY_CAP;

  return (
    <div className="exec-table" data-virtualized={virtualized ? "true" : "false"}>
      {notice ? <div className="exec-table-notice">{notice}</div> : null}
      {/* Rows AND a retention caveat: a partly-hot range has real rows and is
          still incomplete, so the notice sits above them rather than replacing
          them. */}
      {page.retention && page.retention.outcome !== "HOT" ? (
        <RetentionNotice retention={page.retention} />
      ) : null}

      <div
        className="exec-table-scroll"
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <table
          style={{ minWidth }}
          aria-label={label}
          aria-rowcount={page.totalCount ?? -1}
        >
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  data-numeric={c.numeric ? "true" : undefined}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden="true" className="exec-table-pad" style={{ height: padTop }}>
                <td colSpan={columns.length} />
              </tr>
            ) : null}

            {rows.slice(start, end).map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  data-selected={key === selectedKey ? "true" : undefined}
                  data-emphasis={rowEmphasis?.(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "exec-table-clickable" : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      data-numeric={c.numeric ? "true" : undefined}
                      // A numeric column never truncates, whatever the caller
                      // asked for. M6 is not negotiable per column.
                      data-truncate={!c.numeric && c.truncate ? "true" : undefined}
                      title={c.title ? c.title(row) : undefined}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {padBottom > 0 ? (
              <tr aria-hidden="true" className="exec-table-pad" style={{ height: padBottom }}>
                <td colSpan={columns.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <TableFooter
        page={page}
        resident={rows.length}
        virtualized={virtualized}
        overflowNotice={overflowing ? overflowNotice : undefined}
        overBudget={overBudget}
        isFiltered={isFiltered}
        filtered={filtered}
        loading={loading}
        onLoadOlder={onLoadOlder}
        onLoadNewer={onLoadNewer}
      />
    </div>
  );
}

/**
 * The footer carries the four claims a scalable list has to make: how much there
 * is, how much this filter selected, where the cursor is, and which directions
 * remain. It never says "page 3 of 20", because the contract cannot support it.
 */
function TableFooter<T>({
  page,
  resident,
  virtualized,
  overflowNotice,
  overBudget,
  isFiltered,
  filtered,
  loading,
  onLoadOlder,
  onLoadNewer,
}: {
  page: KeysetPage<T>;
  resident: number;
  virtualized: boolean;
  overflowNotice?: string;
  overBudget: boolean;
  isFiltered: boolean;
  filtered: number | null;
  loading: boolean;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
}) {
  const sort = page.appliedSort ?? [];
  const filters = page.appliedFilters ?? [];

  return (
    <div className="exec-table-foot">
      <div className="exec-table-counts">
        {isFiltered && filtered !== null ? (
          <>
            <strong>{grouped(filtered)}</strong> in selection ·{" "}
          </>
        ) : null}
        {page.totalCount !== null ? (
          <>
            <strong>{grouped(page.totalCount)}</strong> total
          </>
        ) : (
          // Stated, not zeroed. "0 total" beside a full page is the reading
          // this rule exists to prevent.
          <span className="exec-gate-unverified">count unavailable</span>
        )}
        <span className="exec-table-meta">
          {" · "}
          {grouped(resident)} resident
          {virtualized ? " · virtualized" : ""}
        </span>
      </div>

      {/* What the SERVER applied, not what the client asked for. If a filter was
          silently dropped by the allowlist, this is where it becomes visible. */}
      {filters.length > 0 || sort.length > 0 ? (
        <div className="exec-table-applied">
          {filters.length > 0
            ? `server filter: ${filters.map((f) => `${f.field} ${f.op} ${f.value}`).join(", ")}`
            : null}
          {filters.length > 0 && sort.length > 0 ? " · " : null}
          {sort.length > 0
            ? `sort: ${sort.map((s) => `${s.field} ${s.direction}`).join(", ")}`
            : null}
        </div>
      ) : null}

      {overflowNotice ? (
        <div className="exec-table-overbudget">{overflowNotice}</div>
      ) : null}

      {overBudget ? (
        <div className="exec-table-overbudget">
          {grouped(resident)} rows resident, over the {grouped(RESIDENCY_CAP)} budget — older
          pages should be released
        </div>
      ) : null}

      <div className="exec-table-nav">
        {page.hasPrevious ? (
          <button type="button" onClick={onLoadNewer} disabled={loading || !onLoadNewer}>
            ▲ load newer
          </button>
        ) : null}
        {page.hasMore ? (
          <button type="button" onClick={onLoadOlder} disabled={loading || !onLoadOlder}>
            ▼ load older
          </button>
        ) : null}
        {page.nextCursor ? (
          <span className="exec-table-cursor" title={page.nextCursor}>
            cursor {shortCursor(page.nextCursor)} — keyset, never OFFSET
          </span>
        ) : null}
      </div>
    </div>
  );
}
