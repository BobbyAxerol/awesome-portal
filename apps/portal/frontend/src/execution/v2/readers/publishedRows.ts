/**
 * Rows the contract does not type, drawn as the source wrote them.
 *
 * The V1 Canary and Live Full bodies carry `positions`, `blotter` and `orders` as
 * `{ envelope, exact_total, returned_count, rows }` where a row is `{ type: object, maxProperties: 80 }`
 * and nothing more: the field names are not published (FE-072 asks for them). A screen therefore cannot
 * print a hi-fi `Entry` or `Mark` column from these rows without inventing which key means what.
 *
 * What it CAN do honestly is show each row's own members under the source's own field names: the columns
 * are the keys the rows carry (first-appearance order, at most 12), the heading is the key spoken as words,
 * and every cell is the exact text the server wrote. No cell is parsed, rounded, summed, coloured by sign or
 * given a unit: a decimal is a string and stays one. The typed hi-fi columns remain
 * `Not published (FE-072)`.
 *
 * Input is the V1 reader's `RowCollection` (certification.ts), which has already kept only scalar cells
 * (string up to 256 characters without control or bidi characters, boolean, null) and at most 200 rows.
 * A collection whose envelope is `unavailable`, `suppressed` or otherwise not a state that holds rows
 * yields `null`: its rows, if the body carried any, are not shown.
 */
import type { CellLoss, RowCell, RowCollection } from "../../certification";

export const PUBLISHED_ROW_CAP = 200;
export const PUBLISHED_COLUMN_CAP = 12;

export interface PublishedColumn {
  key: string;
  label: string;
}

export interface PublishedRow {
  key: string;
  /** Aligned with `columns`; `null` = this row does not carry the member (or the source said null). */
  cells: readonly RowCell[];
  /**
   * Aligned with `columns`: why this cell is not in `cells`, when the response carried it but the reader could not
   * keep it. `null` = nothing was lost here. A lost cell prints `Unreadable`, never `Not available`.
   */
  lost: readonly (CellLoss | null)[];
}

export interface PublishedRows {
  columns: readonly PublishedColumn[];
  rows: readonly PublishedRow[];
  /** The server's exact total; `null` = not published. */
  total: number | null;
  /** Columns the rows carry beyond the cap, not drawn. */
  hiddenColumns: number;
  /** Rows the response carried that the reader did not keep. */
  rowsDropped: number;
  /** Cells the response carried that have no column to sit in (unsafe key, past the per-row bound): "n cells not shown". */
  cellsNotShown: number;
  /** Of `rowsDropped`, the rows that had cells but none readable. */
  rowsUnreadable: number;
}

/** What a lost cell prints. A number is named because its exactness is the reason it is refused. */
export function lossText(loss: CellLoss): string {
  return loss === "number" ? "Unreadable (number not accepted)" : "Unreadable";
}

/** The sentence under a table for what the reader could not show, or `null` when it lost nothing. */
export function lossNote(table: PublishedRows): string | null {
  const parts: string[] = [];
  if (table.cellsNotShown > 0) parts.push(`${table.cellsNotShown} cell${table.cellsNotShown === 1 ? "" : "s"} not shown`);
  if (table.rowsUnreadable > 0) parts.push(`${table.rowsUnreadable} row${table.rowsUnreadable === 1 ? " has" : "s have"} no readable cell`);
  return parts.length === 0 ? null : `${parts.join("; ")}.`;
}

/** `entry_price` to `Entry price`. */
export function memberLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? key : words.charAt(0).toUpperCase() + words.slice(1);
}

/** Envelope states under which a collection's rows may be drawn. `unavailable`, `terminal` and the rest withhold them. */
const HOLDS_ROWS: ReadonlySet<string> = new Set(["ok", "empty", "partial", "stale"]);

export function publishedRowsOf(collection: RowCollection | null | undefined): PublishedRows | null {
  if (collection === null || collection === undefined || typeof collection !== "object") return null;
  const envelope = collection.envelope;
  if (envelope === null || typeof envelope !== "object" || envelope.suppressed === true || !HOLDS_ROWS.has(envelope.panelState)) return null;
  const source = Array.isArray(collection.rows) ? collection.rows.slice(0, PUBLISHED_ROW_CAP) : [];
  const losses = Array.isArray(collection.rowLosses) ? collection.rowLosses : [];
  const order: string[] = [];
  const seen = new Set<string>();
  const note = (key: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  };
  source.forEach((row, index) => {
    for (const key of Object.keys(row)) note(key);
    // A member the row carried but the reader could not keep still gets its column: a present figure is not absent.
    for (const key of Object.keys(losses[index]?.cells ?? {})) note(key);
  });
  const keys = order.slice(0, PUBLISHED_COLUMN_CAP);
  return {
    columns: keys.map((key) => ({ key, label: memberLabel(key) })),
    rows: source.map((row, index) => ({
      key: String(index),
      cells: keys.map((key) => (Object.hasOwn(row, key) ? row[key]! : null)),
      lost: keys.map((key) => (Object.hasOwn(row, key) ? null : (losses[index]?.cells[key] ?? null))),
    })),
    total: typeof collection.exactTotal === "number" && Number.isSafeInteger(collection.exactTotal) && collection.exactTotal >= 0 ? collection.exactTotal : null,
    hiddenColumns: order.length - keys.length,
    rowsDropped: typeof collection.rowsDropped === "number" ? collection.rowsDropped : 0,
    cellsNotShown: losses.slice(0, source.length).reduce((sum, loss) => sum + (loss?.notShown ?? 0), 0),
    rowsUnreadable: typeof collection.rowsUnreadable === "number" ? collection.rowsUnreadable : 0,
  };
}

/** One cell as text. `null` means the cell prints `Not available`, never a dash and never 0. */
export function cellText(cell: RowCell | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "boolean") return cell ? "Yes" : "No";
  return cell === "" ? null : cell;
}
