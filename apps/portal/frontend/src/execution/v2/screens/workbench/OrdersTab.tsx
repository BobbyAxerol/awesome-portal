/**
 * Orders: the deployment's orders as the profile publishes them, newest first,
 * at most 200 rows with the honest "Showing N of total" label. Each row opens
 * the same order in the Full Blotter. The state is the source's, through a
 * closed table: a state word this build does not know is "Unknown", never a
 * success.
 */
import { Link } from "react-router-dom";

import type { CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { At, Fig, Na } from "./cells";
import { humanize, type OrderRow, type TableWindow } from "./model";
import { TablePanel } from "./TablePanel";

const SIDE = { buy: "Buy", sell: "Sell" } as const;

export interface OrdersTabProps {
  table: TableWindow<OrderRow>;
  /** Link to the order in the Full Blotter, already carrying the URL context; null when the deployment id is unknown. */
  blotterHref: ((row: OrderRow) => string | null) | null;
}

export function OrdersTab({ table, blotterHref }: OrdersTabProps) {
  // Quiet columns, drawn only when the profile states the member for some row; a row without it says `Not available`.
  const withTime = table.rows.some((r) => r.atMs !== null);
  const withType = table.rows.some((r) => r.orderType !== null);
  const columns: CardsColumn<OrderRow>[] = [
    ...(withTime ? [{ key: "when", label: "Submitted (UTC)", render: (r: OrderRow) => <At ms={r.atMs} /> }] : []),
    { key: "client", label: "Client order", render: (r) => (r.clientOrderId ?? r.orderId) === null ? null : <span className="exec-blk-id">{r.clientOrderId ?? r.orderId}</span> },
    ...(withType ? [{ key: "type", label: "Type", render: (r: OrderRow) => (r.orderType === null ? <Na /> : humanize(r.orderType)) }] : []),
    { key: "side", label: "Side", render: (r) => (r.side === null ? null : SIDE[r.side]) },
    { key: "qty", label: "Quantity", numeric: true, render: (r) => <Fig value={r.quantity} /> },
    { key: "price", label: "Price", numeric: true, render: (r) => <Fig value={r.price} /> },
    { key: "state", label: "State", render: (r) => <Flag kind={r.state.kind} label={r.state.label} size="sm" /> },
    {
      key: "blotter",
      label: "Blotter",
      render: (r) => {
        const href = blotterHref?.(r) ?? null;
        const id = r.clientOrderId ?? r.orderId;
        return href === null || id === null ? <Na why="No order id" /> : <Link className="exec-blk-link" to={href} aria-label={`Open order ${id} in the Blotter`}>Blotter ↗</Link>;
      },
    },
  ];
  return <TablePanel label="Orders" noun="orders" table={table} columns={columns} />;
}
