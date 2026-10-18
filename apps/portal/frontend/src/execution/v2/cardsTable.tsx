/**
 * CardsTable — a real <table> that turns into stacked cards at 660px and below.
 *
 * The switch is CSS only (css/cards.css): every cell carries `data-l`, its
 * column label, and the stylesheet prints it before the value once the header
 * row is hidden. Above 660px, and in jsdom, it is an ordinary table.
 *
 * Numeric columns keep the V1 contract: `data-numeric="true"` on the th and
 * every td, so mono, tabular, right-aligned and never truncated.
 */
import type { KeyboardEvent, ReactNode } from "react";

import "./css/cards.css";

export interface CardsColumn<Row> {
  key: string;
  /** Header text, and the label printed on the card. */
  label: string;
  numeric?: boolean;
  render(row: Row): ReactNode;
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
}

/** A cell that rendered nothing says so; it is never a dash and never 0. */
function present(content: ReactNode): boolean {
  return content !== null && content !== undefined && content !== false && content !== "";
}

export function CardsTable<Row>({ columns, rows, rowKey, label, selectedKey, onRowOpen, empty }: CardsTableProps<Row>) {
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
            {columns.map((c) => (
              <th key={c.key} scope="col" data-numeric={c.numeric ? "true" : undefined}>
                {c.label}
              </th>
            ))}
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
