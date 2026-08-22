/**
 * Phase 14 — Full Blotter (hi-fi 4c, WF 4c, ops dark).
 *
 * The blotter is the screen where every scale rule this cluster has is either
 * true or a lie, because it is the only one whose p95 is 10⁵–10⁷ rows. Three
 * decisions follow from that and are worth stating before the code:
 *
 *   1. **The status chips do not filter in the browser.** They report a filter
 *      change and the caller re-queries. A chip that filtered the loaded page
 *      would show nine rows of "FILLED" beside a footer reading "48,213 total"
 *      — two numbers describing different populations, presented as one.
 *   2. **Counts come from the server, both of them.** `selection` and `total`
 *      are separate fields, not one number the screen subtracts from.
 *   3. **Numerics are never abbreviated.** Not the quantity, not the price, not
 *      the fee. `0.0400` is a size and `60,890.00` is a price, and a blotter
 *      that rounds either is a blotter nobody can reconcile against a venue
 *      statement — which is the one job it has.
 *
 * The funnel is the contract's four stages, not the hi-fi's five hops; see
 * `FUNNEL_LABELS` for why, and BR-EX-25 for what would close the difference.
 */
import type { ReactNode } from "react";

import {
  BLOTTER_BUCKET,
  type BlotterFilter,
  type Envelope,
  type KeysetPage,
  type OrderStatus,
  type PanelStatus,
} from "../contracts";
import type { FunnelStageName, OrderFunnel } from "../analytics";
import { AuthorityBadge, OrderStatusChip } from "../components/badges";
import { KeysetTable, type Column } from "../components/table";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";

/**
 * Fills shown per funnel stage before capping.
 *
 * The hi-fi draws three. A large order on a thin book produces thousands, and
 * rendering them all turns one expanded row into a page of its own. Twelve is
 * what still reads as the drawn design; past that the list caps and says so.
 */
const FILL_BUDGET = 12;

/**
 * One blotter row.
 *
 * Every numeric is a string. The reason is the same one that governs capital:
 * `0.0080` and `0.008` are the same number and different sizes — one states the
 * venue's lot precision and the other has thrown it away — and a JSON number
 * cannot hold the difference.
 */
export interface BlotterRow {
  orderId: string;
  /** ISO-8601 with milliseconds. The hi-fi's first column, to the millisecond. */
  at: string;
  deployment: string;
  venue: string;
  symbol: string;
  orderType: "LIMIT" | "MARKET" | "STOP";
  side: "BUY" | "SELL";
  quantity: string;
  /** Null for a market order that has no limit price to state. */
  price: string | null;
  status: OrderStatus;
  /** Present on a partial fill. Rendered beside the quantity, never instead. */
  filledQuantity?: string | null;
  fee: string | null;
  /** Fees are in the venue's currency and are never converted here. */
  feeCurrency: string | null;
  /** Why the risk authority refused. Rendered inline on the row (§4c). */
  rejectReason?: string | null;
}

export const BLOTTER_FILTERS: readonly BlotterFilter[] = [
  "ALL", "FILLED", "PARTIAL", "REJECTED", "OPEN",
];

const FILTER_LABEL: Record<BlotterFilter, string> = {
  ALL: "All",
  FILLED: "Filled",
  PARTIAL: "Partial",
  REJECTED: "Rejected",
  OPEN: "Open",
};

/**
 * The four stages the server publishes, with the hi-fi's words where they map.
 *
 * The hi-fi draws five hops — signal, intent, risk grant, order ACK, fill — and
 * the contract publishes four: SUBMIT, SOURCE_ACK, BROKER_ACK, FILL. The two
 * are not a renaming. `signal` and `intent` are internal steps upstream of the
 * order, and the funnel endpoint does not carry them.
 *
 * So the four are rendered and the difference is stated rather than papered
 * over. Inventing a `signal` card from a `SUBMIT` stage would put a hop on
 * screen that no source vouches for — on the screen whose whole purpose is
 * saying which facts we hold.
 */
const FUNNEL_LABELS: Record<FunnelStageName, string> = {
  SUBMIT: "submit",
  SOURCE_ACK: "risk grant",
  BROKER_ACK: "order ACK",
  FILL: "fill",
};

/** A status in no bucket is still reachable through `ALL` (see `BLOTTER_UNBUCKETED`). */
export function bucketOf(status: OrderStatus): BlotterFilter | null {
  for (const [bucket, members] of Object.entries(BLOTTER_BUCKET)) {
    if (members.includes(status)) return bucket as BlotterFilter;
  }
  return null;
}

/**
 * Milliseconds between two hops.
 *
 * Derived, and shown next to both timestamps it was derived from — which is
 * what makes a derived number honest rather than an assertion. Returns null
 * rather than a zero when either side is missing: "+0ms" claims two events
 * were simultaneous, which is a much stronger statement than not knowing.
 */
export function hopDelta(previous: string | null, current: string | null): number | null {
  if (!previous || !current) return null;
  const a = Date.parse(previous);
  const b = Date.parse(current);
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
}

function FunnelCard({
  stage,
  label,
  previousAt,
}: {
  stage: OrderFunnel["stages"][number];
  label: string;
  previousAt: string | null;
}) {
  const first = stage.events[0] ?? null;
  const delta = hopDelta(previousAt, first?.occurredAt ?? null);
  // The last fill is the one that closed the order, and a head-cap is exactly
  // the cap that would drop it. It is kept, along with anything the source
  // could not fully vouch for.
  const last = stage.events.at(-1) ?? null;
  const shownEvents = capPreserving(
    stage.events,
    FILL_BUDGET,
    (event) => event === last || event.completeness !== "COMPLETE",
  );
  const eventsNotice = capNotice(shownEvents, "fills");
  return (
    <li className="exec-funnel-card" data-state={stage.state}>
      <div className="exec-funnel-hop">{label}</div>
      {stage.state === "MISSING" ? (
        // Stated, not skipped. A hop we never observed is the finding.
        <div className="exec-funnel-missing">not observed</div>
      ) : (
        <>
          <div className="exec-funnel-id">
            {first ? first.sourceId : <span className="exec-funnel-missing">no source id</span>}
          </div>
          <div className="exec-funnel-meta">
            {first?.occurredAt ?? "time not stated"}
            {delta !== null ? <span className="exec-funnel-delta"> · +{delta}ms</span> : null}
          </div>
          {stage.state === "PARTIAL" ? (
            <div className="exec-funnel-partial">partial — the remainder has no terminal event</div>
          ) : null}
          {stage.events.length > 1 ? (
            <>
              <ol className="exec-funnel-fills">
                {shownEvents.shown.map((event) => (
                  <li key={event.sourceId}>
                    <span className="exec-num">{event.quantity ?? "—"}</span>
                    <span className="exec-funnel-meta">
                      {" "}
                      {event.occurredAt ?? "time not stated"}
                    </span>
                  </li>
                ))}
              </ol>
              {eventsNotice ? <div className="exec-funnel-meta">{eventsNotice}</div> : null}
            </>
          ) : null}
        </>
      )}
    </li>
  );
}

/**
 * The expanded funnel for one order.
 *
 * All four cards always render. The row was expanded to ask "what happened to
 * this order", and a funnel that drew only the hops it had would answer a
 * question nobody asked — "what happened, of the things that happened".
 */
export function OrderFunnelStrip({
  funnel,
  status,
  reason,
}: {
  funnel: OrderFunnel | null;
  status?: PanelStatus;
  reason?: string;
}) {
  if (!funnel || (status && status !== "ok" && status !== "partial")) {
    // `ok` and `partial` are the two that render the strip, so anything
    // reaching here is a non-ok state PanelState can name.
    const shown = status && status !== "ok" && status !== "partial" ? status : "loading";
    return <PanelState status={shown} reason={reason ?? "Loading the order funnel."} />;
  }
  let previousAt: string | null = null;
  return (
    <div className="exec-funnel">
      <ol className="exec-funnel-rail">
        {funnel.stages.map((stage) => {
          const card = (
            <FunnelCard
              key={stage.name}
              stage={stage}
              label={FUNNEL_LABELS[stage.name]}
              previousAt={previousAt}
            />
          );
          previousAt = stage.events[0]?.occurredAt ?? previousAt;
          return card;
        })}
      </ol>
      {funnel.incomplete ? (
        <p className="exec-funnel-note">
          One or more hops were not observed. A later stage does not imply an earlier one —
          a fill proves the order reached the venue, not that the acknowledgement was seen.
        </p>
      ) : null}
      <p className="exec-funnel-note">
        Four stages, as the source publishes them. The wireframe&apos;s <em>signal</em> and{" "}
        <em>intent</em> hops are upstream of the order and are not carried by this endpoint.
      </p>
    </div>
  );
}

export interface FullBlotterProps {
  envelope: Envelope;
  page: KeysetPage<BlotterRow>;
  /** Applied server-side. The chips report; they do not filter. */
  filter: BlotterFilter;
  onFilterChange?: (filter: BlotterFilter) => void;
  /**
   * The chart selection that narrowed this list, in the words the chart used.
   *
   * Only the label. Both counts live on `page` — `totalCount` and
   * `filteredCount` — and `KeysetTable` renders them. A second pair of props
   * here would be a second source for one number, which is how the footer and
   * the table come to disagree.
   */
  crossFilter?: string | null;
  onResetCrossFilter?: () => void;
  scope?: ReactNode;
  status?: PanelStatus;
  reason?: string;
  onLoadOlder?: () => void;
  loading?: boolean;
  /** The expanded row's funnel. Fetched per order, not with the page. */
  expandedOrderId?: string | null;
  funnel?: OrderFunnel | null;
  funnelStatus?: PanelStatus;
  funnelReason?: string;
  onExpand?: (row: BlotterRow) => void;
}

export function FullBlotter({
  envelope,
  page,
  filter,
  onFilterChange,
  crossFilter = null,
  onResetCrossFilter,
  scope,
  status = "ok",
  reason,
  onLoadOlder,
  loading,
  expandedOrderId = null,
  funnel = null,
  funnelStatus,
  funnelReason,
  onExpand,
}: FullBlotterProps) {
  const columns: readonly Column<BlotterRow>[] = [
    {
      key: "at",
      header: "time (UTC)",
      width: "12rem",
      render: (row) => <span className="exec-num">{row.at}</span>,
    },
    {
      key: "where",
      header: "deployment · venue",
      width: "13rem",
      render: (row) => `${row.deployment} · ${row.venue}`,
    },
    { key: "symbol", header: "symbol", width: "9rem", render: (row) => row.symbol },
    {
      key: "type",
      header: "type / side",
      width: "9rem",
      render: (row) => `${row.orderType} ${row.side}`,
    },
    {
      key: "qty",
      header: "qty",
      width: "9rem",
      render: (row) =>
        row.filledQuantity ? (
          // Both figures, never one. "0.9000/1.2000" is the fill; "0.9000"
          // alone would read as the order.
          <span className="exec-num">
            {row.filledQuantity}/{row.quantity}
          </span>
        ) : (
          <span className="exec-num">{row.quantity}</span>
        ),
    },
    {
      key: "price",
      header: "price",
      width: "9rem",
      render: (row) =>
        row.price ? (
          <span className="exec-num">{row.price}</span>
        ) : (
          <span className="exec-gate-unverified">no limit price</span>
        ),
    },
    {
      key: "status",
      header: "status",
      width: "14rem",
      render: (row) => (
        <>
          <OrderStatusChip status={row.status} />
          {row.rejectReason ? (
            <span className="exec-blotter-reason"> {row.rejectReason}</span>
          ) : null}
        </>
      ),
    },
    {
      key: "fee",
      header: "fee",
      width: "8rem",
      render: (row) =>
        row.fee ? (
          <span className="exec-num">
            {row.fee}
            {row.feeCurrency ? <span className="exec-blotter-ccy"> {row.feeCurrency}</span> : null}
          </span>
        ) : (
          // A dash, because the hi-fi uses one and a rejected order genuinely
          // incurred no fee. Distinct from a fee we failed to read, which would
          // be a stated gap.
          <span className="exec-num">—</span>
        ),
    },
    { key: "orderId", header: "order_id", width: "9rem", render: (row) => row.orderId },
  ];

  return (
    <ExecutionSurface kind="deployments" className="exec-blotter">
      {/* Reuses the inbox/gate header pair rather than adding a third. */}
      <header className="exec-inbox-head">
        <div className="exec-tile-title">Orders &amp; fills — full blotter</div>
        <div className="exec-inbox-counts">
          <AuthorityBadge envelope={envelope} />
        </div>
      </header>

      {scope ? <div className="exec-blotter-scope">{scope}</div> : null}

      {/* The inbox's chips, same class and same `data-active` convention. */}
      <div className="exec-inbox-filters" role="group" aria-label="Order status">
        {BLOTTER_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className="exec-inbox-filter"
            data-active={filter === option ? "true" : undefined}
            aria-pressed={filter === option}
            onClick={() => onFilterChange?.(option)}
          >
            {FILTER_LABEL[option]}
          </button>
        ))}
        <span className="exec-blotter-note">
          applied by the server — the chips re-query, they do not hide loaded rows
        </span>
      </div>

      <KeysetTable
        label="Orders and fills"
        columns={columns}
        page={page}
        rowKey={(row) => row.orderId}
        status={status}
        reason={reason}
        onLoadOlder={onLoadOlder}
        loading={loading}
        minWidth={980}
        selectedKey={expandedOrderId}
        onRowClick={onExpand}
        rowEmphasis={(row) => (row.status === "REJECTED" || row.status === "DENIED" ? "bad" : undefined)}
        notice={
          crossFilter ? (
            <div className="exec-blotter-cross">
              <span className="exec-chip" data-tone="warn">
                Cross-filter · {crossFilter}
                <button
                  type="button"
                  className="exec-chip-reset"
                  onClick={onResetCrossFilter}
                  aria-label={`Reset the cross-filter ${crossFilter}`}
                >
                  ✕ reset
                </button>
              </span>
              <span className="exec-blotter-note">
                set by clicking a series in any chart — the table and its counts follow the selection
              </span>
            </div>
          ) : undefined
        }
      />

      {/* The counts, the cursor and the virtualization note are the table's,
          not this screen's. Restating them here would be a second source for
          one number. */}
      <footer className="exec-blotter-foot">
        <span className="exec-blotter-note">
          click a row for its funnel · fees in venue currency, exact values, never abbreviated
        </span>
      </footer>

      {expandedOrderId ? (
        <section className="exec-blotter-funnel" aria-label={`Funnel for ${expandedOrderId}`}>
          <div className="exec-tile-title">{expandedOrderId} — order funnel</div>
          <OrderFunnelStrip funnel={funnel} status={funnelStatus} reason={funnelReason} />
        </section>
      ) : null}
    </ExecutionSurface>
  );
}
