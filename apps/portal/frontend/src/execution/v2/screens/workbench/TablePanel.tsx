/**
 * The frame the Orders, Fills and Positions tabs share: the table (a real
 * table, cards at 660px), the honest cap label under it ("Showing 200 of
 * 1,247 orders"), and the three ways a table can have no rows, kept apart:
 *
 *   - the profile did not carry the branch at all -> "Not available" and why;
 *   - the profile carried it and it is empty      -> "No orders" (a published none);
 *   - rows exist                                   -> the newest 200.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Na } from "./cells";
import type { TableWindow } from "./model";

export interface TablePanelProps<R extends { key: string }> {
  /** Accessible name of the table. */
  label: string;
  /** Plural noun for the empty sentence ("orders"). */
  noun: string;
  table: TableWindow<R>;
  columns: readonly CardsColumn<R>[];
}

export function TablePanel<R extends { key: string }>({ label, noun, table, columns }: TablePanelProps<R>) {
  if (!table.published) {
    return (
      <div className="exec-wb-tablewrap" data-table={label}>
        <p className="exec-wb-empty">
          <Na why={`The profile carries no ${noun} branch for this deployment.`} />
        </p>
      </div>
    );
  }
  return (
    <div className="exec-wb-tablewrap" data-table={label}>
      <CardsTable
        scrollHint
        columns={columns}
        rows={table.rows}
        rowKey={(row) => row.key}
        label={label}
        empty={<span className="exec-wb-empty">{`No ${noun}`}</span>}
      />
      <p className="exec-wb-cap" data-testid={`${label}-cap`}>{table.label}</p>
    </div>
  );
}
