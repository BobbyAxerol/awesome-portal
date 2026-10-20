/**
 * Positions: the columns the profile publishes (symbol, side, quantity, entry, mark, unrealised PnL). Long, Short and Gross
 * are the SERVER's `positions_by_side` (S3-U4): exact quantity per instrument, gross as the server wrote it, no total across
 * instruments, and NOTIONAL by side stays the typed unavailable (E5: no currency or mark lineage), never derived here. A
 * profile without the block names the three columns as not published (FE-051), instead of deriving them from the rows
 * (S3 plan D13d).
 */
import type { CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { GapLine } from "../../blocks";
import type { PositionsBySide, PositionsBySideRow } from "../../../stageFacts";
import { Fig, Na } from "./cells";
import { PAGE_CAP, figure, humanize, type PositionRow, type PositionSide, type PositionsModel } from "./model";
import { CardsTable as SideTable } from "../../cardsTable";
import { TablePanel } from "./TablePanel";

const SIDE: Readonly<Record<PositionSide, string | null>> = { long: "Long", short: "Short", flat: "Flat", unknown: null };

/** A flat position holds nothing, so it has no entry price. */
const NO_ENTRY = "Flat: no entry price";


const SIDE_COLUMNS: readonly CardsColumn<PositionsBySideRow>[] = [
  { key: "instrument", label: "Instrument", render: (r) => <span className="exec-blk-id">{r.instrumentId}</span> },
  { key: "long", label: "Long", numeric: true, render: (r) => <Fig value={figure(r.longQuantity, "qty")} /> },
  { key: "short", label: "Short", numeric: true, render: (r) => <Fig value={figure(r.shortQuantity, "qty")} /> },
  { key: "gross", label: "Gross", numeric: true, render: (r) => <Fig value={figure(r.grossQuantity, "qty")} /> },
  { key: "count", label: "Positions", numeric: true, render: (r) => <span className="exec-blk-num">{r.positionCount.toLocaleString("en-US")}</span> },
];

function excludedLine(sides: PositionsBySide): string | null {
  const e = sides.excluded;
  const parts = [
    e.flatRows > 0 ? `${e.flatRows.toLocaleString("en-US")} flat` : null,
    e.closedRows > 0 ? `${e.closedRows.toLocaleString("en-US")} closed` : null,
    e.unclassifiedRows > 0 ? `${e.unclassifiedRows.toLocaleString("en-US")} not classified` : null,
    e.noInstrumentRows > 0 ? `${e.noInstrumentRows.toLocaleString("en-US")} without an instrument` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : `Not counted: ${parts.join(", ")}.`;
}

/** Long, Short and Gross by instrument, exactly as the server published them. */
function SidesBlock({ sides }: { sides: PositionsBySide }) {
  const excluded = excludedLine(sides);
  if (sides.state === "UNAVAILABLE") {
    return (
      <section className="exec-wb-sides" aria-label="Long, Short and Gross by instrument" data-state={sides.state}>
        <GapLine items={[{ label: "Long, Short, Gross by instrument", id: "FE-051", reason: sides.reasonCode }]} />
      </section>
    );
  }
  return (
    <section className="exec-wb-sides" aria-label="Long, Short and Gross by instrument" data-state={sides.state}>
      <h3 className="exec-wb-cap">
        By instrument {sides.state === "PARTIAL" ? <Flag kind="partial" label="Partial" size="sm" /> : null}
      </h3>
      {sides.rows.length === 0 ? (
        <p className="exec-wb-empty">No open position to split by side.</p>
      ) : (
        <SideTable columns={SIDE_COLUMNS} rows={sides.rows.slice(0, PAGE_CAP)} rowKey={(r) => r.instrumentId} label="Long, Short and Gross by instrument" />
      )}
      {sides.state === "PARTIAL" && sides.reasonCode !== null ? <p className="exec-wb-cap"><Na why={humanize(sides.reasonCode)} visible /></p> : null}
      {excluded === null ? null : <p className="exec-wb-cap">{excluded}</p>}
      <GapLine items={[{ label: "Notional by side", id: "FE-051", reason: `${sides.notionalReasonCode}. There is no total across instruments.` }]} />
    </section>
  );
}

export function PositionsTab({ positions, sides = null }: { positions: PositionsModel; sides?: PositionsBySide | null }) {
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
      {sides === null ? <GapLine items={[{ label: "Long, Short, Gross by instrument", id: "FE-051" }]} /> : <SidesBlock sides={sides} />}
    </>
  );
}
