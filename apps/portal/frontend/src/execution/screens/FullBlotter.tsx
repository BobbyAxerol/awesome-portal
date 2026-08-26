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
import { Hint } from "../components/hint";

import {
  BLOTTER_BUCKET,
  type BlotterFilter,
  type Envelope,
  type KeysetPage,
  type OrderStatus,
  type PanelStatus,
} from "../contracts";
import type { FunnelStageName, OrderFunnel } from "../analytics";
import { OrderStatusChip } from "../components/badges";
import { KeysetTable, type Column } from "../components/table";
import { AggregatesFooter } from "../components/AggregatesFooter";
import type { CurrencyAggregate } from "../blotterAggregates";
import { useState } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";
import { ExecutionWorkspace } from "../components/workspace";
import { blotterSmoke, fmtBlotterAge, useBlotterTick, type Flag, type SmokeOrder } from "../blotter.smoke";

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
  // Two different truncations reach this card and they are not the same claim.
  //
  //   * The SERVER bounded the window: `returnedEventCount` of `eventCount`
  //     events came back, and `truncated` says so per stage.
  //   * The CLIENT then capped what it received to `FILL_BUDGET`.
  //
  // The cap notice describes the RENDER against what was DELIVERED; the line
  // below describes what was delivered against what EXISTS. Giving the cap the
  // population instead made both sentences carry the same figures for the same
  // cause — "showing 1 of 4,177" twice — which reads as one fact stated twice
  // rather than two facts, and loses the part that matters: those rows were
  // never sent, so no amount of scrolling reaches them.
  const delivered = stage.returnedEventCount ?? stage.events.length;
  const shownEvents = capPreserving(
    stage.events,
    FILL_BUDGET,
    (event) => event === last || event.completeness !== "COMPLETE",
    delivered,
  );
  const eventsNotice = capNotice(shownEvents, stage.truncated ? "fills received" : "fills");
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
                    {event.quantity !== null ? (
                      <span className="exec-num">{event.quantity}</span>
                    ) : (
                      // An acknowledgement carries no quantity by design; a
                      // fill that lost one is a defect. The reader cannot tell
                      // them apart, so neither may be printed as a dash that
                      // reads like a number.
                      <span className="exec-gate-unverified">no quantity</span>
                    )}
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
          {/* Outside the `events.length > 1` list, deliberately: a stage that
              returned ONE of nine hundred is the case most in need of this
              sentence, and it has no list to hang it under. */}
          {stage.truncated ? (
            <div className="exec-funnel-bounded">
              the source returned{" "}
              {(stage.returnedEventCount ?? stage.events.length).toLocaleString("en-US")} of{" "}
              {stage.eventCount?.toLocaleString("en-US") ?? "an unpublished number of"} events for
              this stage — the rest were not sent
            </div>
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
      {funnel.bounded.hasMore ? (
        <p className="exec-funnel-bounded">
          Bounded window — showing{" "}
          {(funnel.bounded.returned ?? 0).toLocaleString("en-US")} of{" "}
          {funnel.bounded.total?.toLocaleString("en-US") ?? "an unpublished number of"} events.
          {funnel.window === "LIFECYCLE_AND_LATEST"
            ? " The source sent lifecycle coverage plus the latest retained events — this is not a full chronological export."
            : funnel.window === "LATEST"
              ? " The source sent the latest retained events only."
              : null}
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
  onFilterChange: (filter: BlotterFilter) => void;
  /**
   * The chart selection that narrowed this list, in the words the chart used.
   *
   * Only the label. Both counts live on `page` — `totalCount` and
   * `filteredCount` — and `KeysetTable` renders them. A second pair of props
   * here would be a second source for one number, which is how the footer and
   * the table come to disagree.
   */
  crossFilter?: string | null;
  onResetCrossFilter: () => void;
  scope?: ReactNode;
  status?: PanelStatus;
  reason?: string;
  onLoadOlder: () => void;
  loading?: boolean;
  /** The expanded row's funnel. Fetched per order, not with the page. */
  expandedOrderId?: string | null;
  funnel?: OrderFunnel | null;
  funnelStatus?: PanelStatus;
  funnelReason?: string;
  onExpand: (row: BlotterRow) => void;
  /** M7 totals per currency — server-published, three counts kept apart. */
  aggregates?: readonly CurrencyAggregate[] | null;
}

const FLAG_TONE: Record<NonNullable<Flag["tone"]>, string> = { warn: "warn", bad: "bad", good: "good", paper: "paper" };

function Flags({ flags, plain }: { flags: Flag[]; plain?: string }) {
  if (plain) return <span className="exec-bl-plain">{plain}</span>;
  return (
    <span className="exec-bl-flags">
      {flags.map((f) => <span key={f.text} className="exec-bl-flag" data-tone={f.tone ? FLAG_TONE[f.tone] : undefined}>{f.text}</span>)}
    </span>
  );
}

/** Hi-fi 4c: a smoke order = one main row + one detail row (+ legs or fills when expanded). */
function SmokeRows({ order, cols, open, onToggle, elapsed, price, slice }: { order: SmokeOrder; cols: readonly string[]; open: boolean; onToggle: () => void; elapsed: number; price: number; slice: number }) {
  const expandable = Boolean(order.legs || order.fills);
  const chevron = expandable ? (open ? "▾" : "▸") : order.kind === "conditional" ? "◇" : "";
  const age = typeof order.ageSeconds === "number" ? fmtBlotterAge(order.ageSeconds + elapsed) : order.ageSeconds;
  const trig = order.triggerAt ? `−${Math.max(0, price - order.triggerAt).toLocaleString("en-US", { maximumFractionDigits: 0 })} to trigger` : null;
  const cell: Record<string, React.ReactNode> = {
    mark: <span className="exec-bl-mark" data-tone={expandable ? "accent" : undefined}>{chevron}</span>,
    at: <span className="exec-bl-time">{order.time}</span>,
    order: <><a href={order.href}>{order.id}</a><div className="exec-bl-sub">{order.sub}</div></>,
    where: <span className="exec-bl-dim">{order.deployment} · {order.venue}</span>,
    symbol: order.symbol,
    type: <Flags flags={order.flags} />,
    price: <span data-tone={order.priceTone}>{order.price}{trig ? <div className="exec-bl-trig">{trig}</div> : null}</span>,
    qty: <span data-tone={order.qtyTone}>{order.qty}{order.qtyBar ? <span className="exec-bl-bar"><span className="exec-bl-barfill" data-tone={order.qtyBar.tone} style={{ width: `${order.qtyBar.pct}%` }} /></span> : null}</span>,
    avg: <span>{order.avg}{order.slip ? <> <span data-tone={order.slip.tone}>{order.slip.text}</span></> : null}{order.avgSub ? <div className="exec-bl-sub">{order.avgSub}</div> : null}</span>,
    status: <span className="exec-bl-status" data-tone={order.status.tone} data-pulse={order.status.pulse ? "true" : undefined}>{order.status.label}</span>,
    age: <span className="exec-bl-dim">{age}</span>,
  };
  return (
    <>
      <tr className="exec-bl-row" data-kind={order.kind} onClick={expandable ? onToggle : undefined} role={expandable ? "button" : undefined} tabIndex={expandable ? 0 : undefined} onKeyDown={expandable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } : undefined} aria-expanded={expandable ? open : undefined}>
        {cols.map((k) => <td key={k} data-col={k} data-numeric={k === "price" || k === "qty" || k === "avg" || k === "age" ? "true" : undefined}>{cell[k]}</td>)}
      </tr>
      <tr className="exec-bl-detail" data-tone={order.detailTone}>
        <td colSpan={cols.length}>
          {order.detail}{order.detailLink ? <> <a href={order.detailLink.href}>{order.detailLink.label}</a> via bracket_group_id br_0088 (one cancels the other) · trigger source: mark price · protective leg of dep_88 canary envelope</> : null}
          {order.kind === "bracket" && open === false ? " (collapsed)" : null}
        </td>
      </tr>
      {open && order.legs ? order.legs.map((leg) => {
        const lc: Record<string, React.ReactNode> = {
          mark: "", at: <span className="exec-bl-dim">{leg.time}</span>,
          order: <span>└ {leg.href ? <a href={leg.href}>{leg.id}</a> : leg.id}</span>,
          where: <span className="exec-bl-mute">{leg.role}</span>, symbol: <span className="exec-bl-dim">{leg.symbol}</span>,
          type: <Flags flags={leg.flags} plain={leg.flagsPlain} />,
          price: <span data-tone={leg.priceTone}>{leg.price}</span>,
          qty: <span data-tone={leg.qtyTone}>{leg.qty}{leg.qtyBar ? <span className="exec-bl-bar exec-bl-bar-sm"><span className="exec-bl-barfill" data-tone="warn" style={{ width: `${slice}%` }} /></span> : null}</span>,
          avg: <span className="exec-bl-dim">{leg.avg}</span>,
          status: <span className="exec-bl-status exec-bl-status-sm" data-tone={leg.status.tone} data-pulse={leg.status.pulse ? "true" : undefined}>{leg.status.label}</span>,
          age: <span className="exec-bl-mute">{leg.age === "tick" ? fmtBlotterAge(600 + elapsed) : leg.age}</span>,
        };
        return <tr key={leg.id} className="exec-bl-leg">{cols.map((k) => <td key={k} data-col={k}>{lc[k]}</td>)}</tr>;
      }) : null}
      {open && order.fills ? (
        <>
          <tr className="exec-bl-leg"><td /><td colSpan={cols.length - 1} className="exec-bl-lineage"><span className="exec-bl-mute">LINEAGE</span> &nbsp; {order.fills.lineage}</td></tr>
          {order.fills.rows.map((f) => (
            <tr key={f.id} className="exec-bl-leg">
              <td /><td className="exec-bl-dim">{f.time}</td><td>└ <a href={`/deployments/blotter?fill=${encodeURIComponent(f.id)}`}>{f.id}</a></td><td colSpan={3} className="exec-bl-mute">{f.liquidity}</td>
              <td data-numeric="true" className="exec-bl-dim">{f.price}</td><td data-numeric="true" className="exec-bl-dim">{f.qty}</td><td data-numeric="true" className="exec-bl-dim">{f.fee}</td>
              <td colSpan={2}><span className="exec-bl-status exec-bl-status-sm" data-tone="good">{f.status}</span></td>
            </tr>
          ))}
        </>
      ) : null}
    </>
  );
}

const HIFI_FILTERS: { key: BlotterFilter | "CONDITIONAL" | "BRACKETS"; label: string; smokeOnly?: boolean }[] = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Working" },
  { key: "CONDITIONAL", label: "Conditional", smokeOnly: true },
  { key: "BRACKETS", label: "Brackets", smokeOnly: true },
  { key: "FILLED", label: "Filled" },
  { key: "PARTIAL", label: "Partial" },
  { key: "REJECTED", label: "Rejected" },
];

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
  aggregates,
}: FullBlotterProps) {
  const smoke = blotterSmoke();
  const tick = useBlotterTick(smoke?.basePrice ?? 0);
  const [view, setView] = useState<"CONDITIONAL" | "BRACKETS" | null>(null);
  const [openSmoke, setOpenSmoke] = useState<Record<string, boolean>>({ br_0092: true });
  const columns: readonly Column<BlotterRow>[] = [
    { key: "mark", header: "", width: "26px", render: () => "" },
    { key: "at", header: "time (UTC)", width: "8rem", render: (row) => <span className="exec-bl-time">{row.at}</span> },
    { key: "order", header: "order · client id", width: "11rem", render: (row) => <span>{row.orderId}<div className="exec-bl-sub">cl: not published</div></span> },
    { key: "where", header: "deployment · venue", width: "11rem", render: (row) => <span className="exec-bl-dim">{row.deployment} · {row.venue}</span> },
    { key: "symbol", header: "symbol", width: "7rem", render: (row) => row.symbol },
    { key: "type", header: "type · tif · flags", width: "12rem", render: (row) => <Flags flags={[{ text: row.orderType }, { text: row.side, tone: row.side === "BUY" ? "good" : "bad" }]} /> },
    { key: "price", header: "price / trigger", width: "9rem", numeric: true, render: (row) => (row.price ? <span><span className="exec-num">{row.price}</span><span className="exec-bl-mute"> / —</span></span> : <span className="exec-gate-unverified">no limit price</span>) },
    { key: "qty", header: "qty filled / total", width: "9rem", numeric: true, render: (row) => (row.filledQuantity ? <span className="exec-num">{row.filledQuantity}/{row.quantity}</span> : <span className="exec-num">{row.quantity}</span>) },
    { key: "avg", header: "avg px · slip · fee", width: "10rem", numeric: true, render: (row) => (row.fee ? <span>— · —<div className="exec-bl-sub">fee {row.fee}{row.feeCurrency ? ` ${row.feeCurrency}` : ""}</div></span> : <span className="exec-gate-unverified">not published</span>) },
    { key: "status", header: "status", width: "10rem", render: (row) => (<><OrderStatusChip status={row.status} />{row.rejectReason ? <span className="exec-blotter-reason"> {row.rejectReason}</span> : null}</>) },
    { key: "age", header: "age", width: "5rem", numeric: true, render: () => <span className="exec-bl-dim">—</span> },
  ];
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const visibleColumns = columns.filter((c) => !hidden.includes(c.key));
  const colKeys = visibleColumns.map((c) => c.key);
  const exportRows = () => {
    const header = visibleColumns.map((c) => c.key).join(",");
    const lines = page.rows.map((row) => visibleColumns.map((c) => JSON.stringify(String((row as unknown as Record<string, unknown>)[c.key] ?? ""))).join(","));
    void navigator.clipboard?.writeText([header, ...lines].join("\n"));
    setExported(`${page.rows.length} loaded rows copied as CSV — bounded to this page, not the ${page.totalCount ?? "unpublished"} total`);
  };
  const [exported, setExported] = useState<string | null>(null);
  const smokeOrders = smoke
    ? smoke.orders.filter((o) => {
        if (view === "CONDITIONAL") return o.kind === "conditional";
        if (view === "BRACKETS") return o.kind === "bracket";
        if (filter === "ALL") return true;
        if (filter === "OPEN") return o.kind === "conditional" || o.kind === "bracket" || o.kind === "partial";
        if (filter === "FILLED") return o.kind === "filled";
        if (filter === "PARTIAL") return o.kind === "partial";
        if (filter === "REJECTED") return o.kind === "rejected";
        return true;
      })
    : [];
  const counts = smoke ? { OPEN: 3, CONDITIONAL: 2, BRACKETS: 1 } : ({} as Record<string, number>);
  const up = tick.price >= tick.prev;
  const leading = smoke
    ? smokeOrders.map((o) => (
        <SmokeRows key={o.id} order={o} cols={colKeys} open={Boolean(openSmoke[o.id])} onToggle={() => setOpenSmoke((m) => ({ ...m, [o.id]: !m[o.id] }))} elapsed={tick.elapsed} price={tick.price} slice={tick.slice} />
      ))
    : null;
  const activeKey = view ?? filter;
  return (
    <ExecutionSurface kind="deployments" className="exec-blotter exec-bl" data-hifi-exact="blotter-4c">
      <ExecutionWorkspace layout="dense">
        <div className="exec-bl-page">
          <header className="exec-bl-masthead">
            <h1 className="exec-bl-h1">Blotter</h1>
            <span className="exec-bl-spacer" />
            {smoke ? (
              <>
                <span className="exec-bl-pricepill"><span className="exec-bl-livedot" aria-hidden="true" />{smoke.symbol} <b data-tone={up ? "good" : "bad"}>{tick.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> <span data-tone={up ? "good" : "bad"}>{up ? "▲" : "▼"}</span></span>
                <span className="exec-bl-lastfill">last fill <span className="exec-bl-good">{fmtBlotterAge(2 + tick.elapsed)}</span> ago</span>
              </>
            ) : null}
            <span className="exec-bl-source"><b>{envelope.authority}</b> · orders_v2 + fills_v2 · {envelope.freshness}</span>
          </header>
          {scope ? <div className="exec-blotter-scope">{scope}</div> : null}
          <div className="exec-bl-toolbar" role="group" aria-label="Scope">
            {["Alpha All ▾", "Deployment All ▾", "Venue All ▾", "24h ▾"].map((label) => (
              <button key={label} type="button" className="exec-bl-chip" disabled title="Scope filters are not published by the blotter contract (BR-EX-24) — the list is the full scope">{label}</button>
            ))}
            <span className="exec-bl-spacer" />
            <details className="exec-blotter-columns exec-bl-columns">
              <summary className="exec-bl-chip">Columns ▾</summary>
              <div className="exec-blotter-columnlist">
                {columns.filter((c) => c.header).map((c) => (
                  <label key={c.key} className="exec-role-meta">
                    <input type="checkbox" checked={!hidden.includes(c.key)} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((k) => k !== c.key) : [...h, c.key]))} />{" "}
                    {c.header}
                  </label>
                ))}
              </div>
            </details>
            <button type="button" className="exec-bl-chip" onClick={exportRows} aria-label="Export loaded rows" title="Copies the loaded rows as CSV — bounded to this page">Export</button>
            {exported ? <span className="exec-bl-note" role="status">{exported}</span> : null}
          </div>
          <div className="exec-bl-filters" role="group" aria-label="Order status">
            {HIFI_FILTERS.filter((f) => !f.smokeOnly || smoke).map((f) => {
              const n = counts[f.key as string];
              const active = activeKey === f.key;
              return (
                <button key={f.key} type="button" className="exec-bl-chip" data-active={active ? "true" : undefined} aria-pressed={active} onClick={() => { if (f.smokeOnly) { setView(f.key as "CONDITIONAL" | "BRACKETS"); } else { setView(null); onFilterChange(f.key as BlotterFilter); } }}>
                  {f.label}{n ? ` (${n})` : ""}
                </button>
              );
            })}
            <Hint>applied by the server — the chips re-query, they do not hide loaded rows</Hint>
          </div>
          {crossFilter ? (
            <div className="exec-bl-cross">
              <button type="button" className="exec-bl-crosschip" onClick={onResetCrossFilter} aria-label={`Reset the cross-filter ${crossFilter}`}>✕ {smoke ? smoke.crossFilter.label : crossFilter}</button>
              <span className="exec-bl-note">cross-filter active — <b>{smoke ? smoke.crossFilter.selection.toLocaleString("en-US") : (page.filteredCount ?? "—")} rows in selection</b> of {smoke ? smoke.crossFilter.total.toLocaleString("en-US") : (page.totalCount ?? "—")}</span>
            </div>
          ) : null}
          <div className="exec-bl-panel">
            <KeysetTable
              label="Orders and fills"
              columns={visibleColumns}
              page={page}
              rowKey={(row) => row.orderId}
              status={status}
              reason={reason}
              onLoadOlder={onLoadOlder}
              loading={loading}
              minWidth={1240}
              selectedKey={expandedOrderId}
              onRowClick={onExpand}
              rowEmphasis={(row) => (row.status === "REJECTED" || row.status === "DENIED" ? "bad" : undefined)}
              leadingRows={leading}
            />
            <footer className="exec-bl-foot">
              <span>{smoke && crossFilter ? `${smoke.crossFilter.selection.toLocaleString("en-US")} rows in selection · ${smoke.crossFilter.total.toLocaleString("en-US")} total` : `${page.totalCount ?? "—"} rows total`}</span>
              <span className="exec-bl-spacer" />
              <span>◇ conditional · ▸/▾ expandable (bracket legs, fills) · WORKING rows re-price live · every id navigates</span>
            </footer>
          </div>
          <footer className="exec-blotter-foot exec-bl-agg">
            <AggregatesFooter aggregates={aggregates} />
            <span className="exec-blotter-note">fees in venue currency, exact values, never abbreviated</span>
          </footer>
          {expandedOrderId ? (
            <section className="exec-blotter-funnel" aria-label={`Funnel for ${expandedOrderId}`}>
              <div className="exec-tile-title">{expandedOrderId} — order funnel</div>
              <OrderFunnelStrip funnel={funnel} status={funnelStatus} reason={funnelReason} />
            </section>
          ) : null}
          {smoke ? <p className="exec-bl-smoke">! {smoke.warning}</p> : null}
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
