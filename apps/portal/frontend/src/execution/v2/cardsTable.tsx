/**
 * CardsTable — a real <table> that turns into stacked cards at 660px and below.
 *
 * The switch is CSS only (css/cards.css): every cell carries `data-l`, its
 * column label, and the stylesheet prints it before the value once the header
 * row is hidden. Above 660px, and in jsdom, it is an ordinary table.
 *
 * Numeric columns keep the V1 contract: `data-numeric="true"` on the th and
 * every td, so mono, tabular, right-aligned and never truncated.
 *
 * Sorting (P-B4, hi-fi `th.s`): a column that declares `sortKey`, in a table
 * given `onSort`, prints its header as a button with `aria-sort`; the table
 * only reports the click, the caller owns the order. Tables that pass neither
 * are unchanged. Below 660px the header row is hidden, so a caller that sorts
 * keeps its own control for the card layout.
 */
import type { KeyboardEvent, ReactNode } from "react";

import "./css/cards.css";

export interface CardsColumn<Row> {
  key: string;
  /** Header text, and the label printed on the card. */
  label: string;
  numeric?: boolean;
  /** Makes the header a sort control for this key (needs `onSort` on the table). */
  sortKey?: string;
  /** Why this header does not sort right now (its title when it is not a sort control). */
  sortOffReason?: string;
  /** Decoration before the header text (a series swatch); hidden from assistive tech. `label` stays the accessible name. */
  head?: ReactNode;
  render(row: Row): ReactNode;
}

export interface CardsSort {
  key: string;
  dir: "asc" | "desc";
}

export interface CardsTableProps<Row> {
  columns: readonly CardsColumn<Row>[];
  rows: readonly Row[];
  rowKey(row: Row): string;
  /** Accessible name of the table. */
  label: string;
  selectedKey?: string | null;
  /** Makes rows keyboard-reachable; the row opens a Drawer, it does not navigate. */
  onRowOpen?(row: Row): void;
  /** Shown in place of the body when there are no rows. */
  empty?: ReactNode;
  /** The order the caller applied; marks the matching `sortKey` header. */
  sort?: CardsSort | null;
  /** A sortable header was activated. The caller decides direction. */
  onSort?(key: string): void;
}

/** A cell that rendered nothing says so; it is never a dash and never 0. */
function present(content: ReactNode): boolean {
  return content !== null && content !== undefined && content !== false && content !== "";
}

export function CardsTable<Row>({ columns, rows, rowKey, label, selectedKey, onRowOpen, empty, sort, onSort }: CardsTableProps<Row>) {
  const open = (row: Row) => (event: KeyboardEvent) => {
    // Space is prevented so the page does not scroll from under the row.
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowOpen?.(row);
    }
  };
  return (
    <div className="exec-cards-wrap">
      <table className="exec-cards" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = onSort !== undefined && c.sortKey !== undefined;
              const active = sortable && sort?.key === c.sortKey ? (sort?.dir ?? null) : null;
              const head = c.head ? <span className="exec-cards-head" aria-hidden="true">{c.head}</span> : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  data-numeric={c.numeric ? "true" : undefined}
                  aria-sort={sortable ? (active === "asc" ? "ascending" : active === "desc" ? "descending" : "none") : undefined}
                  data-sortable={sortable ? "true" : undefined}
                  title={!sortable ? c.sortOffReason : undefined}
                >
                  {sortable ? (
                    <button type="button" className="exec-cards-sort" data-dir={active ?? undefined} onClick={() => onSort(c.sortKey!)}>
                      {head}{c.label}
                    </button>
                  ) : (
                    <>{head}{c.label}</>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr className="exec-cards-empty">
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                data-selected={key === selectedKey ? "true" : undefined}
                aria-current={key === selectedKey ? "true" : undefined}
                data-interactive={onRowOpen ? "true" : undefined}
                tabIndex={onRowOpen ? 0 : undefined}
                onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                onKeyDown={onRowOpen ? open(row) : undefined}
              >
                {columns.map((c) => {
                  const content = c.render(row);
                  return (
                    <td key={c.key} data-l={c.label} data-numeric={c.numeric ? "true" : undefined}>
                      <span className="exec-cards-v">
                        {present(content) ? content : <span className="exec-cards-na">Not available</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
