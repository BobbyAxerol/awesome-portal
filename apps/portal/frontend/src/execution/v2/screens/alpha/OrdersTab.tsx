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
import { GapWhy, Kpi, KpiStrip, NaWhy, SectionPanel } from "../../blocks";
import { usePhoneRows } from "../../usePhoneRows";
import { At, Dec, Na } from "./cells";
import { ROW_CAP, humanize, orderFlag, replayHref } from "./model";
import { BASIS_TEXT, NOT_IN_RECORD, timeReasonText } from "./recordReasons";
import { detailIndex, serves, type RecordDetail } from "./scopedBook";
import type { PagedRead, Read, SubjectBook } from "./useAlphaReads";
import type { SubjectActivityPage } from "../../../api/subjectActivity";

const count = (value: string | undefined) => (value === undefined ? undefined : readMetric({ state: "AVAILABLE", value }, { unit: "count" }));

function newestFirst<T>(rows: readonly T[], at: (row: T) => string | null): readonly T[] {
  return [...rows].sort((a, b) => (at(b) ?? "").localeCompare(at(a) ?? ""));
}

/** Cards a phone page holds, and what one Load more adds: an order card has up to eleven fields (about 250 px at 390), so three is about one screen. */
const PHONE_ROWS = 3;

/**
 * At 660px and narrower a table is cards: `rows` shows the first `phone.rows` (never fewer than reach the focused row),
 * and Load more first draws three more of the rows already loaded, then asks the server for its next page.
 */
function windowed<T>(rows: readonly T[], phone: { phone: boolean; rows: number }, must: number): readonly T[] {
  const capped = rows.slice(0, ROW_CAP);
  return phone.phone ? capped.slice(0, Math.max(phone.rows, must + 1)) : capped;
}

function MoreRow({ page, noun, loaded, shown, undrawn, onDraw, population }: { page: PagedRead<SubjectActivityPage>; noun: string; loaded: number; shown: number; undrawn: boolean; onDraw: () => void; population?: number | null }) {
  // "The whole retained window" is said only when the rollup's population agrees with the rows; otherwise the caption states both numbers.
  const disagrees = !page.hasMore && population != null && population !== loaded;
  return (
    <div className="exec-alp2-more">
      <span className="exec-alp2-cap">
        {shown < loaded ? `Top ${shown} of ${loaded} ${noun} loaded` : `${loaded} ${noun} loaded`}
        {page.hasMore ? ", more in the retained window" : disagrees ? `, of ${population} in the rollup` : ", the whole retained window"}
      </span>
      {undrawn || page.hasMore ? (
        <button
          type="button"
          className="exec-blk-btn"
          aria-busy={page.loadingMore ? "true" : undefined}
          onClick={() => {
            if (page.loadingMore) return;
            onDraw();
            if (!undrawn) page.loadMore();
          }}
        >
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

const pagesOf = (state: Read<readonly SubjectActivityPage[]>): readonly SubjectActivityPage[] => (state.phase === "ready" ? state.value : []);

/** A scoped record's time: the instant when it states one, else the reason the page gives for having none. */
function Moment({ iso, detail }: { iso: string | null; detail: RecordDetail | undefined }) {
  if (iso !== null && detail?.timeReason == null) return <At iso={iso} />;
  return <NaWhy reason={timeReasonText(detail?.timeReason)} />;
}

/** A member a scoped record may or may not state: the value, or `Not available` with the one neutral reason. */
const stated = (value: string | null | undefined, detail: RecordDetail | undefined, scoped: boolean) =>
  value ? <span className="exec-blk-id">{value}</span> : scoped && detail !== undefined ? <NaWhy reason={NOT_IN_RECORD} /> : null;

/** `Take profit 2`: the leg a conditional order plays, from the record's own words; absent members are left out, never guessed. */
function legText(detail: RecordDetail | undefined): string | null {
  const role = detail?.values.leg_role;
  const sequence = detail?.values.leg_sequence;
  const parts = [typeof role === "string" && role !== "" ? humanize(role) : null, typeof sequence === "number" ? String(sequence) : null].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" ");
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

  const scoped = book.scoped;
  const orderDetail = detailIndex(pagesOf(book.ordersState), "order_id");
  const fillDetail = detailIndex(pagesOf(book.fillsState), "fill_id");
  const orderColumns: CardsColumn<ReplayOrder>[] = [
    { key: "at", label: "Time (UTC)", render: (o) => (scoped ? <Moment iso={o.submittedAt} detail={orderDetail.get(o.orderId)} /> : <At iso={o.submittedAt} />) },
    { key: "order", label: "Order", render: (o) => <span className="exec-blk-id">{o.orderId}</span> },
    { key: "client", label: "Client order", render: (o) => stated(o.clientOrderId, orderDetail.get(o.orderId), scoped) },
    { key: "symbol", label: "Symbol", render: (o) => o.symbol },
    { key: "kind", label: "Type", render: (o) => sideType(o.side, o.type) },
    { key: "leg", label: "Leg", render: (o) => legText(orderDetail.get(o.orderId)) ?? (orderDetail.has(o.orderId) ? <NaWhy reason={NOT_IN_RECORD} /> : null) },
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
    { key: "replay", label: "Replay", render: (o) => <Link className="exec-blk-link" to={linkTo(replayHref(alphaId, `order:${o.orderId}`))} aria-label={`Open ${o.orderId} in Trade Replay`}>Open</Link> },
  ];
  const fillColumns: CardsColumn<ReplayFill>[] = [
    { key: "at", label: "Time (UTC)", render: (f) => <At iso={f.tradeTime} /> },
    { key: "fill", label: "Fill", render: (f) => <span className="exec-blk-id">{f.fillId}</span> },
    { key: "client", label: "Client order", render: (f) => stated(f.clientOrderId, fillDetail.get(f.fillId), scoped) },
    { key: "symbol", label: "Symbol", render: (f) => f.symbol },
    { key: "side", label: "Side", render: (f) => (f.side ? humanize(f.side) : null) },
    { key: "qty", label: "Quantity", numeric: true, render: (f) => <Dec value={f.qty} unit="qty" /> },
    { key: "price", label: "Price", numeric: true, render: (f) => <Dec value={f.price} /> },
    { key: "fee", label: "Fee", numeric: true, render: (f) => (scoped && f.commission === null ? <NaWhy reason={NOT_IN_RECORD} /> : <Dec value={f.commission} currency={f.commissionCurrency} why="Fee not published" />) },
    { key: "liq", label: "Liquidity", render: (f) => (f.liquidity ? humanize(f.liquidity) : scoped ? <NaWhy reason={NOT_IN_RECORD} /> : null) },
  ];

  // SCOPED_V2: a column is drawn only when the page states that member for at least one record (an unserved column would read as
  // "this order has none"). A record that lacks it among the others says so with one neutral reason.
  const orderCols = scoped
    ? orderColumns.filter((c) => (c.key === "client" ? serves(orderDetail, "client_order_id") : c.key === "kind" ? serves(orderDetail, "order_type") : c.key === "leg" ? serves(orderDetail, "leg_role") : true))
    : orderColumns.filter((c) => c.key !== "leg");
  const fillCols = scoped
    ? fillColumns.filter((c) => (c.key === "client" ? serves(fillDetail, "client_order_id") : c.key === "fee" ? serves(fillDetail, "commission") : c.key === "liq" ? serves(fillDetail, "liquidity_side") : true))
    : fillColumns;
  const orders = newestFirst(book.orders, (o) => o.submittedAt);
  const fills = newestFirst(book.fills, (f) => f.tradeTime);
  const orderPhone = usePhoneRows(PHONE_ROWS);
  const fillPhone = usePhoneRows(PHONE_ROWS);
  const orderRows = windowed(orders, orderPhone, focusOrder === null ? -1 : orders.findIndex((o) => o.orderId === focusOrder));
  const fillRows = windowed(fills, fillPhone, -1);
  // Records the page declared that did not become a row (no id, no price or no time), so "empty" is not read as "none".
  const declared = (state: Read<readonly SubjectActivityPage[]>) => (state.phase === "ready" ? state.value.reduce((n, p) => n + (p.page.returnedCount ?? p.records.length), 0) : 0);
  const orderGap = scoped ? Math.max(0, declared(book.ordersState) - orders.length) : 0;
  const fillGap = scoped ? Math.max(0, declared(book.fillsState) - fills.length) : 0;
  // Why the fills that did not become a row have no time: the page's own reasons, once each.
  const shownFills = new Set(fills.map((f) => f.fillId));
  const fillWhy = [...new Set([...fillDetail].filter(([id]) => !shownFills.has(id)).flatMap(([, d]) => timeReasonText(d.timeReason) ?? []))];
  // The strip and the state chips are computed from the rows loaded, so they cannot contradict the table under them; the rollup's
  // population is named as "N of M" where it is larger or smaller than what is loaded.
  const ordersReady = book.ordersState.phase === "ready";
  const fillsReady = book.fillsState.phase === "ready";
  const rollupOrders = data?.orderPopulation != null && /^\d+$/.test(data.orderPopulation) ? Number(data.orderPopulation) : null;
  const rollupFills = data?.fillPopulation != null && /^\d+$/.test(data.fillPopulation) ? Number(data.fillPopulation) : null;
  const scopeOf = (loaded: number, rollup: number | null, more: boolean) =>
    rollup !== null && rollup !== loaded ? `${loaded} of ${rollup} in the rollup loaded` : more ? "Loaded so far, more in the window" : "Retained window";
  const stateCounts = new Map<string, number>();
  for (const o of orders) {
    const label = orderFlag(o.status).label;
    stateCounts.set(label, (stateCounts.get(label) ?? 0) + 1);
  }
  const rejectedLoaded = orders.filter((o) => orderFlag(o.status).kind === "rejected").length;
  const head = pagesOf(book.ordersState)[0] ?? pagesOf(book.fillsState)[0];
  const basis = head?.clock === undefined ? null : BASIS_TEXT[head.clock.observedAtBasis] ?? null;

  return (
    <div className="exec-alp2-stack">
      {scoped ? (
        <p className="exec-alp2-cap" role="note">
          <span>Scoped read: authorized rows of a retained window, not total history.{basis ? ` Paged by ${basis}.` : ""}</span>
        </p>
      ) : null}
      <KpiStrip label="Orders and fills" columns={4} phoneColumns={2}>
        <Kpi label="Orders" metric={ordersReady ? count(String(orders.length)) : count(data?.orderPopulation ?? undefined)} absentReason={absent} basis={ordersReady ? scopeOf(orders.length, rollupOrders, book.ordersMore.hasMore) : "Retained window"} />
        <Kpi label="Fills" metric={fillsReady ? count(String(fills.length)) : count(data?.fillPopulation ?? undefined)} absentReason={absent} basis={fillsReady ? scopeOf(fills.length, rollupFills, book.fillsMore.hasMore) : "Retained window"} />
        <Kpi
          label="Rejected"
          metric={ordersReady ? count(String(rejectedLoaded)) : count(data?.orderStatusCounts.REJECTED)}
          absentReason={absent ?? "The rollup lists no rejected bucket"}
          basis={ordersReady ? `Of ${orders.length} orders loaded` : data?.orderPopulation ? `Of ${data.orderPopulation} orders` : undefined}
        />
        <Kpi label="Latency" absentReason="Broker timestamps not published" />
      </KpiStrip>

      {stateCounts.size > 0 ? (
        <p className="exec-alp2-cap" aria-label="Orders by status">
          <span>Of the {orders.length} loaded:</span>{" "}
          {[...stateCounts].map(([label, n]) => <span key={label}>{label} {n}</span>)}
        </p>
      ) : null}

      <SectionPanel title="Orders" aside={book.ordersState.phase === "ready" ? `${orders.length} loaded` : undefined} flush>
        {book.ordersState.phase === "loading" || book.ordersState.phase === "idle" ? <PanelState status="loading" /> : null}
        {book.ordersState.phase === "error" ? <PanelState status={book.ordersState.status} reason={book.ordersState.reason} /> : null}
        {book.ordersState.phase === "ready" ? (
          <>
            <CardsTable
              columns={orderCols}
              rows={orderRows}
              rowKey={(o) => o.orderId}
              selectedKey={focusOrder}
              label="Orders of this alpha"
              className="exec-alp2-cardgrid"
              empty={<PanelState status="empty" reason="No order is present for this alpha in the retained projection window." />}
            />
            <MoreRow page={book.ordersMore} noun="orders" loaded={orders.length} shown={orderRows.length} undrawn={orderRows.length < Math.min(orders.length, ROW_CAP)} onDraw={orderPhone.grow} population={rollupOrders} />
            {orderGap > 0 ? <p className="exec-alp2-cap" role="note"><span>{orderGap} {orderGap === 1 ? "record was" : "records were"} returned and not shown: no order id.</span></p> : null}
          </>
        ) : null}
      </SectionPanel>

      <SectionPanel title="Fills" aside={book.fillsState.phase === "ready" ? `${fills.length} loaded` : undefined} flush>
        {book.fillsState.phase === "loading" || book.fillsState.phase === "idle" ? <PanelState status="loading" /> : null}
        {book.fillsState.phase === "error" ? <PanelState status={book.fillsState.status} reason={book.fillsState.reason} /> : null}
        {book.fillsState.phase === "ready" ? (
          <>
            <CardsTable
              columns={fillCols}
              rows={fillRows}
              rowKey={(f) => f.fillId}
              label="Fills of this alpha"
              className="exec-alp2-cardgrid"
              empty={<PanelState status="empty" reason="No fill is present for this alpha in the retained projection window." />}
            />
            <MoreRow page={book.fillsMore} noun="fills" loaded={fills.length} shown={fillRows.length} undrawn={fillRows.length < Math.min(fills.length, ROW_CAP)} onDraw={fillPhone.grow} population={rollupFills} />
            {fillGap > 0 ? (
              <p className="exec-alp2-cap" role="note">
                <span>{fillGap} {fillGap === 1 ? "record was" : "records were"} returned and not shown: no fill id, price or trade time.</span>
                {fillWhy.length > 0 ? <GapWhy name="Why trade time is missing" rows={fillWhy} /> : null}
              </p>
            ) : null}
          </>
        ) : null}
      </SectionPanel>
    </div>
  );
}
