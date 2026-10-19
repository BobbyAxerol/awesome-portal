/**
 * Positions: the columns the profile publishes (symbol, side, quantity, entry,
 * mark, unrealised PnL). The hi-fi's Long, Short and Gross columns have no
 * source on a deployment; they are named below the table as not published
 * (FE-051) instead of being derived from the rows (S3 plan D13d).
 */
import type { CardsColumn } from "../../cardsTable";
import { Fig } from "./cells";
import type { PositionRow, PositionSide, PositionsModel } from "./model";
import { TablePanel } from "./TablePanel";

const SIDE: Readonly<Record<PositionSide, string | null>> = { long: "Long", short: "Short", flat: "Flat", unknown: null };

/** A flat position holds nothing, so it has no entry price. */
const NO_ENTRY = "Flat: no entry price";

export function PositionsTab({ positions }: { positions: PositionsModel }) {
  const columns: CardsColumn<PositionRow>[] = [
    { key: "symbol", label: "Symbol", render: (r) => (r.symbol === null ? null : <span className="exec-blk-id">{r.symbol}</span>) },
    { key: "side", label: "Side", render: (r) => SIDE[r.side] },
    { key: "qty", label: "Quantity", numeric: true, render: (r) => <Fig value={r.quantity} /> },
    { key: "entry", label: "Entry", numeric: true, render: (r) => <Fig value={r.entry} why={r.side === "flat" ? NO_ENTRY : undefined} /> },
    { key: "mark", label: "Mark", numeric: true, render: (r) => <Fig value={r.mark} /> },
    { key: "upnl", label: "Unrealised PnL", numeric: true, render: (r) => <Fig value={r.unrealized} signed /> },
  ];
  return (
    <>
      <TablePanel label="Positions" noun="positions" table={positions.table} columns={columns} />
      <p className="exec-wb-cap">Long, Short and Gross columns: Not published (FE-051)</p>
    </>
  );
}
