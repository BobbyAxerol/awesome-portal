/**
 * Fills: executions as the profile publishes them, newest first, at most 200.
 * Fees are the source's `commission` with its own currency; nothing is summed.
 */
import type { CardsColumn } from "../../cardsTable";
import { At, Fig, Na } from "./cells";
import { humanize, type FillRow, type TableWindow } from "./model";
import { TablePanel } from "./TablePanel";

export function FillsTab({ table }: { table: TableWindow<FillRow> }) {
  const columns: CardsColumn<FillRow>[] = [
    { key: "when", label: "When (UTC)", render: (r) => <At ms={r.atMs} /> },
    { key: "order", label: "Client order", render: (r) => ((r.clientOrderId ?? r.orderId) === null ? null : <span className="exec-blk-id">{r.clientOrderId ?? r.orderId}</span>) },
    { key: "qty", label: "Quantity", numeric: true, render: (r) => <Fig value={r.quantity} /> },
    { key: "price", label: "Price", numeric: true, render: (r) => <Fig value={r.price} /> },
    { key: "fee", label: "Fee", numeric: true, render: (r) => <Fig value={r.fee} currency={r.feeCurrency} /> },
    ...(table.rows.some((r) => r.liquidity !== null) ? [{ key: "liquidity", label: "Liquidity", render: (r: FillRow) => (r.liquidity === null ? <Na /> : humanize(r.liquidity)) }] : []),
  ];
  return <TablePanel label="Fills" noun="fills" table={table} columns={columns} />;
}
