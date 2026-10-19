/**
 * Orders & Fills: the retained window of this alpha's orders and fills in one
 * book, exactly as the Trading System published them.
 *
 * Counts in the strip are the server's exact population strings from the
 * activity rollup, not a count of the rows loaded; the tables say how many
 * rows are loaded, page by keyset `Load more`, and show at most `ROW_CAP`. A
 * status the screen does not know prints as Unknown with the source's word,
 * never as a guess. Each order links to its place in Trade Replay.
 */
import { Link } from "react-router-dom";

import type { AlphaActivity } from "../../../api/derivations";
import { PanelState } from "../../../components/states";
import type { ReplayFill, ReplayOrder } from "../../../components/tradeReplayModel";
import { readMetric } from "../../boundary";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { Kpi, KpiStrip, SectionPanel } from "../../blocks";
import { At, Dec, Na } from "./cells";
import { ROW_CAP, humanize, orderFlag, replayHref } from "./model";
import type { PagedRead, Read, SubjectBook } from "./useAlphaReads";
import type { SubjectActivityPage } from "../../../api/subjectActivity";

const count = (value: string | undefined) => (value === undefined ? undefined : readMetric({ state: "AVAILABLE", value }, { unit: "count" }));

function newestFirst<T>(rows: readonly T[], at: (row: T) => string | null): readonly T[] {
  return [...rows].sort((a, b) => (at(b) ?? "").localeCompare(at(a) ?? ""));
}

function MoreRow({ page, noun, loaded, shown }: { page: PagedRead<SubjectActivityPage>; noun: string; loaded: number; shown: number }) {
  return (
    <div className="exec-alp2-more">
      <span className="exec-alp2-cap">
        {shown < loaded ? `Top ${shown} of ${loaded} ${noun} loaded` : `${loaded} ${noun} loaded`}
        {page.hasMore ? ", more in the retained window" : ", the whole retained window"}
      </span>
      {page.hasMore ? (
        <button type="button" className="exec-blk-btn" aria-busy={page.loadingMore ? "true" : undefined} onClick={() => { if (!page.loadingMore) page.loadMore(); }}>
          {page.loadingMore ? "Loading more" : page.moreError ? "Try again" : "Load more"}
        </button>
      ) : null}
      {page.moreError ? <span className="exec-alp2-cap" role="alert">Could not load more {noun}. {page.moreError}</span> : null}
    </div>
  );
}

function sideType(side: string | null, type: string | null): string {
  const parts = [type ? humanize(type) : null, side ? humanize(side) : null].filter((x): x is string => x !== null);
  return parts.length === 0 ? "Not available" : parts.join(", ");
}

export interface OrdersTabProps {
  alphaId: string;
  book: SubjectBook;
  activity: Read<AlphaActivity>;
  focusOrder: string | null;
  linkTo: (href: string) => string;
}

export function OrdersTab({ alphaId, book, activity, focusOrder, linkTo }: OrdersTabProps) {
  const data = activity.phase === "ready" ? activity.value.data : null;
  const absent = activity.phase === "error" ? activity.reason : activity.phase === "ready" ? undefined : "Reading the rollup";
  const statusCounts = data ? Object.entries(data.orderStatusCounts) : [];

  const orderColumns: CardsColumn<ReplayOrder>[] = [
    { key: "at", label: "Time (UTC)", render: (o) => <At iso={o.submittedAt} /> },
    { key: "order", label: "Order", render: (o) => <span className="exec-blk-id">{o.orderId}</span> },
    { key: "client", label: "Client order", render: (o) => (o.clientOrderId ? <span className="exec-blk-id">{o.clientOrderId}</span> : null) },
    { key: "symbol", label: "Symbol", render: (o) => o.symbol },
    { key: "kind", label: "Type", render: (o) => sideType(o.side, o.type) },
    { key: "qty", label: "Quantity", numeric: true, render: (o) => <Dec value={o.qty} unit="qty" /> },
    { key: "price", label: "Price or trigger", numeric: true, render: (o) => (o.price !== null ? <Dec value={o.price} /> : o.trigger !== null ? <Dec value={o.trigger} /> : <Na why="Market order" />) },
    {
      key: "state",
      label: "State",
      render: (o) => {
        const flag = orderFlag(o.status);
        return (
          <>
            <Flag kind={flag.kind} label={flag.label} size="sm" />
            {flag.kind === "unknown" && o.status ? <span className="exec-alp2-why">Source says {o.status}</span> : null}
            {flag.kind === "rejected" && (o.errorMessage ?? o.errorCode) ? <span className="exec-alp2-why">{o.errorMessage ?? o.errorCode}</span> : null}
          </>
        );
      },
    },
    { key: "replay", label: "Replay", render: (o) => <Link className="exec-blk-link" to={linkTo(replayHref(alphaId, `order:${o.orderId}`))}>Open</Link> },
  ];
  const fillColumns: CardsColumn<ReplayFill>[] = [
    { key: "at", label: "Time (UTC)", render: (f) => <At iso={f.tradeTime} /> },
    { key: "fill", label: "Fill", render: (f) => <span className="exec-blk-id">{f.fillId}</span> },
    { key: "client", label: "Client order", render: (f) => (f.clientOrderId ? <span className="exec-blk-id">{f.clientOrderId}</span> : null) },
    { key: "symbol", label: "Symbol", render: (f) => f.symbol },
    { key: "side", label: "Side", render: (f) => (f.side ? humanize(f.side) : null) },
    { key: "qty", label: "Quantity", numeric: true, render: (f) => <Dec value={f.qty} unit="qty" /> },
    { key: "price", label: "Price", numeric: true, render: (f) => <Dec value={f.price} /> },
    { key: "fee", label: "Fee", numeric: true, render: (f) => <Dec value={f.commission} currency={f.commissionCurrency} why="Fee not published" /> },
    { key: "liq", label: "Liquidity", render: (f) => (f.liquidity ? humanize(f.liquidity) : null) },
  ];

  const orders = newestFirst(book.orders, (o) => o.submittedAt);
  const fills = newestFirst(book.fills, (f) => f.tradeTime);

  return (
    <div className="exec-alp2-stack">
      <KpiStrip label="Orders and fills" columns={4}>
        <Kpi label="Orders" metric={count(data?.orderPopulation ?? undefined)} absentReason={absent} basis="Retained window" />
        <Kpi label="Fills" metric={count(data?.fillPopulation ?? undefined)} absentReason={absent} basis="Retained window" />
        <Kpi
          label="Rejected"
          metric={count(data?.orderStatusCounts.REJECTED)}
          absentReason={absent ?? "The rollup lists no rejected bucket"}
          basis={data?.orderPopulation ? `Of ${data.orderPopulation} orders` : undefined}
        />
        <Kpi label="Latency" absentReason="Broker timestamps not published" />
      </KpiStrip>

      {statusCounts.length > 0 ? (
        <p className="exec-alp2-cap" aria-label="Orders by status">
          {statusCounts.map(([status, n]) => <span key={status}>{orderFlag(status).label} {n}</span>)}
        </p>
      ) : null}

      <SectionPanel title="Orders" aside={book.ordersState.phase === "ready" ? `${orders.length} loaded` : undefined} flush>
        {book.ordersState.phase === "loading" || book.ordersState.phase === "idle" ? <PanelState status="loading" /> : null}
        {book.ordersState.phase === "error" ? <PanelState status={book.ordersState.status} reason={book.ordersState.reason} /> : null}
        {book.ordersState.phase === "ready" ? (
          <>
            <CardsTable
              columns={orderColumns}
              rows={orders.slice(0, ROW_CAP)}
              rowKey={(o) => o.orderId}
              selectedKey={focusOrder}
              label="Orders of this alpha"
              empty={<PanelState status="empty" reason="No order is present for this alpha in the retained projection window." />}
            />
            <MoreRow page={book.ordersMore} noun="orders" loaded={orders.length} shown={Math.min(orders.length, ROW_CAP)} />
          </>
        ) : null}
      </SectionPanel>

      <SectionPanel title="Fills" aside={book.fillsState.phase === "ready" ? `${fills.length} loaded` : undefined} flush>
        {book.fillsState.phase === "loading" || book.fillsState.phase === "idle" ? <PanelState status="loading" /> : null}
        {book.fillsState.phase === "error" ? <PanelState status={book.fillsState.status} reason={book.fillsState.reason} /> : null}
        {book.fillsState.phase === "ready" ? (
          <>
            <CardsTable
              columns={fillColumns}
              rows={fills.slice(0, ROW_CAP)}
              rowKey={(f) => f.fillId}
              label="Fills of this alpha"
              empty={<PanelState status="empty" reason="No fill is present for this alpha in the retained projection window." />}
            />
            <MoreRow page={book.fillsMore} noun="fills" loaded={fills.length} shown={Math.min(fills.length, ROW_CAP)} />
          </>
        ) : null}
      </SectionPanel>
    </div>
  );
}
