/**
 * Blotter (UXM-07 S2, flag key `blotter`): orders and fills, exact.
 *
 * Reads `GET /screens/blotter` through the ExecutionApi port: 50 orders per
 * keyset page, Newer and Older, newest first. Beside the orders the same read
 * carries the fills, the conditional groups and their legs, which expand in
 * place under the row; the order path comes from the order funnel read and the
 * structure of a group from the conditional-groups read.
 *
 * What the screen will not do: shorten a number, sum across currencies, show a
 * count the server did not state, or filter by something the server cannot
 * filter by and pretend the totals still apply. The status chips and the
 * symbol, venue and side controls go to the server (they are `BlotterQuery`
 * fields), and so do the deployment, account, alpha and environment (stage)
 * scopes that arrive from other screens: the server narrows BEFORE paging, so a
 * scoped page prints the scope's own "Showing N of M", chips and rows. Only an
 * order or fill link stays on the screen (it opens that row once its page is
 * loaded). A stage the server refuses (`N22_BLOTTER_STAGE_NOT_AVAILABLE`) is
 * said in words.
 *
 * Scale and degradation (evidence/UXM07/README.md 2b):
 *
 * | cardinality | break point | degradation | server contract | invariant | perf budget |
 * |---|---|---|---|---|---|
 * | 10^5 to 10^7 orders; 50 per page, up to 100 fills and 200 legs beside it | 200 rows in the DOM | keyset Newer/Older, one page in the DOM; scope applied by the server before paging; column chooser | `BlotterQuery` keyset cursors, the four filters and `stage` / `deployment_id` / `account_id` / `alpha_id`; `exact_total`, `filtered_total`, `aggregates.status` | exact digits; counts only as stated (null is never 0); fills "on this page" not "all"; no cross-currency sum | one read per page, re-read on a realtime notification (never counted as an event); one funnel read per expanded row |
 *
 * URL: `status` (bucket), `symbol`, `venue`, `side`, and the scopes `deployment`,
 * `account`, `alpha`, `order`, `fill`. Defaults omitted. V1 wrote the bucket as
 * `filter` (ALL, FILLED, PARTIAL, REJECTED, OPEN: the same five words), so a link
 * with `?filter=` is read as `status` and rewritten once; a word that is not one
 * of them is dropped with a sentence, never quietly.
 *
 * Links to the chart are router links that keep `env` and `workspace_id` and say
 * where they came from (`from=blotter`); the destination builds its Back from it.
 */
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import type { ConditionalGroupRead } from "../../../derivedReads";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { useProfileRealtime } from "../../../profileRealtime";
import { GapWhy, NaWhy } from "../../blocks";
import { CardsTable } from "../../cardsTable";
import { Flag } from "../../Flag";
import { useMediaQuery } from "../../useMediaQuery";
import { withOrigin } from "../../backTo";
import { withContext } from "../../urlState";
import { ClosedFlag } from "./ClosedFlag";
import { ExactText, OrderDetail, type FunnelRead } from "./OrderDetail";
import {
  CHIPS, COLUMNS, DEFAULT_COLUMNS, GROUP_CAP, MID_HIDDEN, MID_QUERY, NOT_IN_READ, NARROW_PAGE_LIMIT, NO_SCOPE, PAGE_LIMIT, applyScope, blotterCsv, blotterCsvName, blotterQuery, chipCounts, filtersKey, isStageRefusal, serverScopeActive, unchippedStatusCounts,
  fillsFor, trimExact, humanize, isBucket, pageFunnel, legsFor, scopeActive, shortUtc, statusView, type BlotterOrder, type ColumnId, type Scope, type ServerFilters,
} from "./blotterModel";
import { useBlotterRead } from "./useBlotterRead";

import "../../css/blocks.css";
import { PaperProfileBar, readProfilesOf } from "../../../paperProfile";
import "../../css/blotter.css";
import "../../css/cards.css";

export const BLOTTER_SCREEN_KEY = "blotter" as const;

export interface BlotterScreenProps {
  api: ExecutionApi;
  /** Where "My access" lives, for the denied state. */
  accessHref?: string;
  /** The chart deep link for an order. Defaults to the V1 Trade Replay link; return null for none. */
  chartHref?: (order: BlotterOrder) => string | null;
}

/**
 * A panel that folds (hi-fi `details.panel`): the head is the summary, with a
 * triangle that turns when open. The funnel is open by default; groups open
 * when the page carries some, so a reader who comes for the table does not
 * scroll past them.
 */
function FoldPanel({ title, aside, defaultOpen = false, children }: { title: string; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="exec-blk-panel exec-blt2-fold" open={defaultOpen}>
      <summary className="exec-blk-ph">
        <h3 className="exec-blk-ph-title">{title}</h3>
        {aside ? <span className="exec-blk-ph-aside">{aside}</span> : null}
      </summary>
      <div className="exec-blk-panel-body">{children}</div>
    </details>
  );
}

/** Saves text as a file from the browser; nothing is sent anywhere. */
function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The row itself states a true zero filled quantity: there is nothing to average and no fee to charge (a published fact, not a guess). */
function noFill(order: BlotterOrder): boolean {
  return order.filledQuantity.kind === "value" && /^0(\.0+)?$/.test(order.filledQuantity.text);
}

/** The `from` value a link out of the Blotter carries; the destination owns what Back does with it. */
export const FROM_BLOTTER = "blotter";

/**
 * The V1 Trade Replay link for an order, with the origin: `from=blotter` and `back=<the Blotter's own filters>`
 * (backTo's allow-list: q, status, side, symbol, venue, sort), so Replay's Back lands on the same filtered list.
 */
function defaultChartHref(order: BlotterOrder, origin: URLSearchParams): string | null {
  if (!order.alphaId) return null;
  return withOrigin(`/deployments/alphas/${encodeURIComponent(order.alphaId)}?tab=Trade%20Replay&focus=order:${encodeURIComponent(order.orderId)}`, { kind: "blotter" }, origin);
}

const SCOPE_KEYS = ["deployment", "account", "alpha", "order", "fill", "env"] as const;
type ScopeKey = (typeof SCOPE_KEYS)[number];
const SCOPE_LABEL: Readonly<Record<ScopeKey, string>> = { deployment: "Deployment", account: "Account", alpha: "Alpha", order: "Order", fill: "Fill", env: "Environment" };
/** Pages the Blotter walks on its own to find a scope the first page does not hold. */
const SEEK_PAGES = 12;
const ENV_WORD = { paper: "Paper", sandbox: "Sandbox", live: "Live" } as const;

type GroupRead =
  | { phase: "idle" }
  | { phase: "loading"; groupId: string }
  | { phase: "ready"; groupId: string; read: ConditionalGroupRead }
  | { phase: "error"; groupId: string; status: "denied" | "unavailable" | "empty" | "partial" | "stale" | "insufficient_data" | "terminal"; reason: string };

export default function BlotterScreen({ api, accessHref, chartHref: chartHrefProp }: BlotterScreenProps) {
  const [params, setParams] = useSearchParams();
  const chartHref = chartHrefProp ?? ((order: BlotterOrder) => defaultChartHref(order, params));
  const colMenuId = useId();
  const noteId = useId();
  // At phone width the cards make the page ~20,000px tall (BLT-B7): the pager then sits above them, once, in DOM order.
  const narrow = useMediaQuery("(max-width: 660px)");

  /* ── url -> filters and scope ─────────────────────────────────────── */
  const statusParam = params.get("status")?.trim().toUpperCase() ?? null;
  const sideParam = params.get("side");
  const filters: ServerFilters = useMemo(
    () => ({
      bucket: isBucket(statusParam) ? statusParam : "ALL",
      symbol: params.get("symbol")?.trim() ?? "",
      venue: params.get("venue")?.trim() ?? "",
      side: sideParam === "BUY" || sideParam === "SELL" ? sideParam : "",
    }),
    [statusParam, sideParam, params],
  );
  const scope: Scope = useMemo(() => {
    const read = (key: ScopeKey) => params.get(key)?.trim() || null;
    const envWord = params.get("env")?.trim().toLowerCase() ?? "";
    return { ...NO_SCOPE, deployment: read("deployment"), account: read("account"), alpha: read("alpha"), order: read("order"), fill: read("fill"), env: envWord === "paper" || envWord === "sandbox" || envWord === "live" ? envWord : null };
  }, [params]);
  const fk = filtersKey(filters, scope);

  // V1's `filter` is this screen's `status`; a word that is neither is said, not swallowed. One write, replace.
  const [urlNotices, setUrlNotices] = useState<readonly string[]>([]);
  useEffect(() => {
    const legacy = params.get("filter");
    const status = params.get("status")?.trim() ?? "";
    const notes: string[] = [];
    const next = new URLSearchParams(params);
    if (legacy !== null) {
      next.delete("filter");
      const word = legacy.trim().toUpperCase();
      if (word === "ALL" || isBucket(word)) {
        if (status === "") {
          if (word !== "ALL") next.set("status", word);
        } else if (status.toUpperCase() !== word) {
          notes.push(`The link also asked for filter ${legacy}; status ${status} is used.`);
        }
      } else {
        notes.push(`The link asked for filter \u201c${legacy}\u201d. The blotter filters by status (Open, Partial, Filled or Rejected), so the list is not narrowed by it.`);
      }
    }
    const upper = status.toUpperCase();
    if (status !== "" && upper !== "ALL" && !isBucket(upper)) {
      next.delete("status");
      notes.push(`Ignored status \u201c${status}\u201d: the blotter filters by Open, Partial, Filled or Rejected, so the list is not narrowed by it.`);
    }
    if (legacy === null && notes.length === 0) return;
    if (notes.length > 0) setUrlNotices((prev) => [...prev, ...notes.filter((text) => !prev.includes(text))]);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const setParam = useCallback(
    (name: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value === null || value === "") next.delete(name);
      else next.set(name, value);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  const clearScope = (keys: readonly ScopeKey[]) => {
    const next = new URLSearchParams(params);
    for (const key of keys) next.delete(key);
    setParams(next, { replace: true });
  };

  /* ── the page ─────────────────────────────────────────────────────── */
  const [cursor, setCursor] = useState<{ fk: string; dir: "after" | "before"; value: string } | null>(null);
  const live = cursor !== null && cursor.fk === fk ? cursor : null;
  const [reloadTick, setReloadTick] = useState(0);
  const realtime = useProfileRealtime("paper", "EXECUTION_FULL_BLOTTER_SCREEN");
  // Deployment, account, alpha and environment go to the server (before paging); an order or fill link is looked for page by page.
  const seeking = scope.order !== null || scope.fill !== null;
  const limit = narrow ? NARROW_PAGE_LIMIT : PAGE_LIMIT;
  const query = useMemo(() => blotterQuery(filters, live, limit, scope), [filters, live, limit, scope]);
  const state = useBlotterRead(api, query, `${fk}|${live ? `${live.dir}:${live.value}` : ""}|${limit}`, realtime.refreshKey, reloadTick);
  const read = state.phase === "ready" ? state.read : null;

  const [symbolText, setSymbolText] = useState(filters.symbol);
  useEffect(() => setSymbolText(filters.symbol), [filters.symbol]);

  /* ── columns ──────────────────────────────────────────────────────── */
  const mid = useMediaQuery(MID_QUERY);
  // The reader's own choice wins; until there is one, the default set for this width.
  const [chosen, setColumns0] = useState<ReadonlySet<ColumnId> | null>(null);
  const columns: ReadonlySet<ColumnId> = chosen ?? (mid ? new Set([...DEFAULT_COLUMNS].filter((id) => !MID_HIDDEN.includes(id))) : DEFAULT_COLUMNS);
  const setColumns = (update: (prev: ReadonlySet<ColumnId>) => ReadonlySet<ColumnId>) => setColumns0(update(columns));
  const [chooserOpen, setChooserOpen] = useState(false);
  const visibleColumns = COLUMNS.filter((c) => columns.has(c.id));

  /* ── expansion, funnel, groups ────────────────────────────────────── */
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [funnels, setFunnels] = useState<Readonly<Record<string, FunnelRead>>>({});
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const funnelAsked = useRef(new Set<string>());

  const askFunnel = useCallback(
    (orderId: string) => {
      if (funnelAsked.current.has(orderId)) return;
      funnelAsked.current.add(orderId);
      setFunnels((prev) => ({ ...prev, [orderId]: { phase: "loading" } }));
      api.getOrderFunnel(orderId).then(
        (result) => {
          setFunnels((prev) => ({
            ...prev,
            [orderId]: result.ok ? { phase: "ready", funnel: result.value.funnel } : { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason },
          }));
          if (!result.ok) funnelAsked.current.delete(orderId);
        },
        () => {
          funnelAsked.current.delete(orderId);
          setFunnels((prev) => ({ ...prev, [orderId]: { phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" } }));
        },
      );
    },
    [api],
  );
  const toggle = (orderId: string) => {
    const opening = !open.has(orderId);
    setOpen((prev) => {
      const next = new Set(prev);
      if (opening) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
    if (opening) {
      setLastOpened(orderId);
      askFunnel(orderId);
    }
  };

  const [groupRead, setGroupRead] = useState<GroupRead>({ phase: "idle" });
  const pickGroup = (groupId: string) => {
    if (groupRead.phase !== "idle" && groupRead.groupId === groupId) {
      setGroupRead({ phase: "idle" });
      return;
    }
    setGroupRead({ phase: "loading", groupId });
    api.getConditionalGroup(groupId, "paper").then(
      (result) => setGroupRead(result.ok ? { phase: "ready", groupId, read: result.value } : { phase: "error", groupId, status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason }),
      () => setGroupRead({ phase: "error", groupId, status: "unavailable", reason: "PORTAL_READ_FAILED" }),
    );
  };

  /* ── derived ──────────────────────────────────────────────────────── */
  const scoped = useMemo(
    // The server already narrowed the page to the scope's population; only the order / fill focus is screen-side.
    () => (read ? applyScope(read.orders, read.fills, { ...NO_SCOPE, order: scope.order, fill: scope.fill }) : null),
    [read, scope],
  );
  const rows = scoped ? scoped.rows : [];

  // The server cannot filter by deployment, account, alpha, order or fill, so a link that names one is looked for in the next older
  // pages until it is found or SEEK_PAGES pages were read; the page in the DOM is still one page. The sentence says so while it looks.
  const [hops, setHops] = useState(0);
  const seekKey = `${fk}|${scope.order}|${scope.fill}`;
  useEffect(() => setHops(0), [seekKey]);
  const missing = seeking && scoped !== null && scoped.focusMissing;
  const nextOlder = read?.nextCursor ?? null;
  useEffect(() => {
    if (!missing || nextOlder === null || hops >= SEEK_PAGES) return;
    setHops((n) => n + 1);
    setCursor({ fk, dir: "after", value: nextOlder });
  }, [missing, nextOlder, hops, fk]);
  const searching = missing && nextOlder !== null && hops < SEEK_PAGES;
  const counts = useMemo(() => (read ? chipCounts(read) : null), [read]);
  const unchipped = useMemo(() => (read ? unchippedStatusCounts(read) : []), [read]);
  // Scopes that can still be added: the distinct deployments, accounts and alphas on the loaded page (choosing one asks the server for that population).
  const scopeChoices = useMemo(() => (["deployment", "account", "alpha"] as const).flatMap((key) => {
    if (scope[key] !== null || !read) return [];
    const values = [...new Set(read.orders.flatMap((o) => { const v = key === "deployment" ? o.deploymentId : key === "account" ? o.accountId : o.alphaId; return v ? [v] : []; }))].sort();
    return values.length > 0 ? [{ key, values }] : [];
  }), [read, scope]);
  // With no environment in the link the chip says what the loaded orders themselves say (their own `mode`), never a fixed word.
  const readEnvironment = useMemo(() => {
    // The orders in scope (a deployment link names one deployment, so its own mode), else the loaded ones.
    const modes = [...new Set((scopeActive(scope) ? rows : read?.orders ?? []).flatMap((o) => (o.mode === null ? [] : [o.mode])))].sort();
    return modes.length === 0 ? (scopeActive(scope) ? "Not stated" : "Paper") : modes.map((m) => ENV_WORD[m as keyof typeof ENV_WORD]).join(" · ");
  }, [read, rows, scope]);
  const venues = useMemo(() => [...new Set([...(read?.orders.flatMap((o) => (o.venue ? [o.venue] : [])) ?? []), ...Object.keys(read?.venueCounts ?? {}), ...(filters.venue ? [filters.venue] : [])])].sort(), [read, filters.venue]);

  // A link that names an order or a fill opens that row once, when its page is loaded.
  const focusedOnce = useRef<string | null>(null);
  useEffect(() => {
    const id = scoped?.focusOrderId ?? null;
    if (id === null || focusedOnce.current === id) return;
    focusedOnce.current = id;
    setOpen((prev) => new Set(prev).add(id));
    setLastOpened(id);
    askFunnel(id);
  }, [scoped?.focusOrderId, askFunnel]);

  const staleReason = state.phase === "ready" ? state.stale : null;
  const incomplete = read !== null && ((read.completeness ?? "COMPLETE").toUpperCase() !== "COMPLETE" || read.state.toLowerCase() === "partial");
  const filtered = filters.bucket !== "ALL" || filters.symbol !== "" || filters.venue !== "" || filters.side !== "";
  const heading = "Blotter";

  const clearAll = () => {
    const next = new URLSearchParams(params);
    for (const key of ["status", "symbol", "venue", "side", ...SCOPE_KEYS]) next.delete(key);
    setParams(next, { replace: true });
  };

  const cell = (order: BlotterOrder, id: ColumnId) => {
    switch (id) {
      case "time": return order.submittedAt ? <span className="exec-blt2-num" title={order.submittedAt}>{shortUtc(order.submittedAt)}</span> : <span className="exec-blt2-na">Not available</span>;
      case "alpha": return order.alphaId ?? <span className="exec-blt2-na">Not available</span>;
      case "account": return order.accountId ?? <span className="exec-blt2-na">Not available</span>;
      case "deployment": return order.deploymentId !== null
        ? (
          <span className="exec-blt2-two">
            {order.deploymentName !== null ? <span>{order.deploymentName}<span className="exec-blt2-sr"> ({order.deploymentId})</span></span> : <span className="exec-blt2-id">{order.deploymentId}</span>}
            {order.venue ? <span className="exec-blt2-na">{order.venue}</span> : null}
          </span>
        )
        : <NaWhy reason="The orders read carries no deployment id." className="exec-blt2-na" />;
      case "avg": return order.averageFillPrice.kind === "absent"
        ? (noFill(order) ? <span className="exec-blt2-na" title="Nothing has traded on this order">No fill</span> : <NaWhy reason={order.fillsBasis?.note ?? "The orders read publishes no average fill price."} className="exec-blt2-na" />)
        : <span title={order.fillsBasis?.kind === "derived" ? `Volume-weighted over the order's fills, cut (not rounded) at 18 places. ${order.fillsBasis.note}` : undefined}><ExactText value={order.averageFillPrice} /></span>;
      case "fee": return order.fee.kind === "absent"
        ? (noFill(order) ? <span className="exec-blt2-na" title="Nothing has traded on this order">No fill</span> : <NaWhy reason={order.fillsBasis?.kind === "derived" ? "The fills of this order carry fees in more than one currency, or an unreadable fee; none is summed." : (order.fillsBasis?.note ?? "The orders read publishes no fee for this order.")} className="exec-blt2-na" />)
        : (
          <span className="exec-blt2-two exec-blt2-fee" title={order.fillsBasis?.kind === "derived" ? order.fillsBasis.note : undefined}>
            {/* Lossless like the prices: every significant digit, no trailing zeros; the exact published text is the title (and the CSV). */}
            <ExactText value={order.fee} />
            {order.feeCurrency ? <span className="exec-blt2-na"> {order.feeCurrency}</span> : null}
          </span>
        );
      case "venue": return order.venue ?? <span className="exec-blt2-na">Not available</span>;
      case "symbol": return order.symbol ?? <span className="exec-blt2-na">Not available</span>;
      // Side over type on every row, so every row is two lines tall like the deployment and fee cells (QA2 R4-12: no alternating heights).
      case "side": return <span className="exec-blt2-two"><span>{order.side ? humanize(order.side) : "Side not stated"}</span> <span className="exec-blt2-na">{order.orderType ? humanize(order.orderType) : ""}</span></span>;
      case "tif": return order.timeInForce ?? <span className="exec-blt2-na">Not available</span>;
      case "price": return <ExactText value={order.price} absent="At market" />;
      case "trigger": return <ExactText value={order.triggerPrice} absent="No trigger" />;
      case "fillqty": return (
        <span className="exec-blt2-fq"><ExactText value={order.filledQuantity} absent={order.fillsBasis?.kind === "partial" ? "Partial read" : "Not published"} /> <span className="exec-blt2-na">/</span> <ExactText value={order.quantity} /></span>
      );
      case "qty": return <ExactText value={order.quantity} />;
      case "filled": return order.filledQuantity.kind === "absent" && order.fillsBasis !== undefined
        ? <NaWhy reason={order.fillsBasis.note} className="exec-blt2-na" />
        : <ExactText value={order.filledQuantity} absent="Not published for this order" />;
      case "client": return order.clientOrderId ? <span className="exec-blt2-id">{order.clientOrderId}</span> : <span className="exec-blt2-na">Not available</span>;
      case "venueOrder": return order.venueOrderId ? <span className="exec-blt2-id">{order.venueOrderId}</span> : <span className="exec-blt2-na">Not sent</span>;
      case "session": return order.sessionId ? <span className="exec-blt2-id">{order.sessionId}</span> : <span className="exec-blt2-na">Not available</span>;
      case "risk": return order.riskGrantId ? <span className="exec-blt2-id">{order.riskGrantId}</span> : <span className="exec-blt2-na">Not available</span>;
      case "intent": return order.intent ? humanize(order.intent) : <span className="exec-blt2-na">Not available</span>;
      case "updated": return order.updatedAt ? <span className="exec-blt2-num" title={order.updatedAt}>{shortUtc(order.updatedAt)}</span> : <span className="exec-blt2-na">Not available</span>;
      case "status": {
        const view = statusView(order.status);
        return view.closed ? <ClosedFlag label={view.label} /> : <Flag kind={view.kind} label={view.label} size="sm" />;
      }
      case "order": return null;
    }
  };

  /* ── whole-page states ────────────────────────────────────────────── */
  if (state.phase === "loading") {
    return (
      <div className="exec-blt2-v2" data-screen="blotter-v2">
        <h1 className="exec-blt2-title">{heading}</h1>
        <PaperProfileBar delivered={null} allowed={[]} />
        <PanelSkeleton label="Loading orders" />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="exec-blt2-v2" data-screen="blotter-v2">
        <h1 className="exec-blt2-title">{heading}</h1>
        <PaperProfileBar delivered={null} allowed={[]} />
        {state.status === "denied" ? (
          <PanelState
            status="denied"
            title="You can't open this page"
            reason="The blotter is outside what your access allows."
            actions={accessHref ? <Link className="exec-blt2-link" to={withContext(accessHref, params)}>See what you can access</Link> : undefined}
          />
        ) : isStageRefusal(state.reason) ? (
          <PanelState
            status="unavailable"
            title="The blotter does not serve this stage"
            reason="This blotter lists Paper orders only. The server refused the stage in the link (Sandbox, Canary and Live orders are not available here), so no orders are shown. Remove the environment from the link to see the Paper blotter."
            actions={<button type="button" className="exec-blt2-btn" onClick={() => clearScope(["env"])}>Remove the environment</button>}
          />
        ) : (
          <PanelState status={state.status} reason={state.reason} actions={<button type="button" className="exec-blt2-btn" onClick={() => setReloadTick((n) => n + 1)}>Try again</button>} />
        )}
      </div>
    );
  }
  const page = state.read;
  const fresh = (page.freshness ?? "").toUpperCase();
  const emptyPage = page.orders.length === 0;
  // A fact the read does publish on some order is no longer "not in this read".
  const notInRead = NOT_IN_READ.filter((name) => !(
    (name === "Average price" && page.orders.some((o) => o.averageFillPrice.kind !== "absent"))
    || (name === "Fee per order" && page.orders.some((o) => o.fee.kind !== "absent"))
  ));
  const pager = (
    <div className="exec-blt2-pager">
      <span className="exec-blt2-pagerbtns">
        <button type="button" className="exec-blt2-btn" disabled={page.prevCursor === null} aria-describedby={page.prevCursor === null ? `${noteId}-pg` : undefined} onClick={() => page.prevCursor && setCursor({ fk, dir: "before", value: page.prevCursor })}>Newer</button>
        <button type="button" className="exec-blt2-btn" disabled={page.nextCursor === null} aria-describedby={page.nextCursor === null ? `${noteId}-pg` : undefined} onClick={() => page.nextCursor && setCursor({ fk, dir: "after", value: page.nextCursor })}>Older</button>
      </span>
      <span id={`${noteId}-pg`} className="exec-blt2-meta">
        {page.prevCursor === null ? "At the newest rows" : "Newer rows exist"}{page.nextCursor === null ? ", at the oldest rows" : ", older rows exist"}
      </span>
    </div>
  );

  return (
    <div className="exec-blt2-v2" data-screen="blotter-v2">
      <header className="exec-blt2-head">
        <div>
          <h1 className="exec-blt2-title">{heading}</h1>
          <p className="exec-blt2-sub">Orders and fills, newest first</p>
        </div>
        <div className="exec-blt2-fresh">
          {fresh === "FRESH" ? <Flag kind="ok" label="Fresh" size="sm" /> : <Flag kind={fresh === "STALE" ? "stale" : "unknown"} label={fresh === "STALE" ? "Stale" : page.freshness ? humanize(page.freshness) : "Freshness not stated"} size="sm" />}
          {page.asOf ? <span className="exec-blt2-meta">As of {shortUtc(page.asOf)}</span> : <span className="exec-blt2-meta">Source time not published</span>}
        </div>
      </header>
      <PaperProfileBar delivered={page.deliveryProfile} allowed={readProfilesOf(page.readProfiles)} />

      {urlNotices.map((text) => <div key={text} className="exec-blt2-banner" role="status" data-kind="info"><Flag kind="na" label="Not applied" size="sm" /><span>{text}</span></div>)}
      {staleReason ? <div className="exec-blt2-banner" role="status"><Flag kind="stale" label="Stale" size="sm" /><span>Showing the last good read</span><GapWhy name="Why the read is stale" rows={[`The last refresh failed (${staleReason}).`]} next={null} /></div> : null}
      {incomplete ? <div className="exec-blt2-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /><span>Some figures are missing</span><GapWhy name="Why figures are missing" rows={[`The read is ${humanize(page.completeness ?? page.state)}`]} next={null} /></div> : null}
      {page.skippedOrders > 0 ? <div className="exec-blt2-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /><span>{page.skippedOrders} {page.skippedOrders === 1 ? "row" : "rows"} on this page could not be read and {page.skippedOrders === 1 ? "is" : "are"} not shown.</span></div> : null}
      {scoped?.deploymentNotApplied ? <div className="exec-blt2-banner" role="status"><Flag kind="na" label="Not applied" size="sm" /><span>The deployment scope could not be applied: the orders read carries no deployment id.</span></div> : null}
      {scope.order !== null || scope.fill !== null ? (
        <div className="exec-blt2-banner" role="status" data-kind="info">
          {scoped?.focusOrderId ? (
            <span>Opened at {scope.fill !== null ? <>fill <span className="exec-blt2-id">{scope.fill}</span> of order</> : "order"} <span className="exec-blt2-id">{scoped.focusOrderId}</span>. The row is highlighted and open.</span>
          ) : (
            <span>{scope.fill !== null ? "That fill" : "That order"} is not on the loaded page. Use Older or Newer to look further.</span>
          )}
        </div>
      ) : null}

      <section className="exec-blt2-panel" aria-label="Filters">
        <div className="exec-blt2-scope">
          {scope.env !== null ? (
            <span className="exec-blt2-chip">
              <span className="exec-blt2-chip-k">environment</span>{ENV_WORD[scope.env]}
              <button type="button" className="exec-blt2-x" aria-label="Remove environment scope" onClick={() => clearScope(["env"])}>Remove</button>
            </span>
          ) : (
            <span className="exec-blt2-chip" data-lock="read" title="What the loaded orders say, not a setting of the context bar"><span className="exec-blt2-chip-k">environment</span>{readEnvironment}</span>
          )}
          {(["deployment", "account", "alpha"] as const).map((key) =>
            scope[key] !== null ? (
              <span className="exec-blt2-chip" key={key}>
                <span className="exec-blt2-chip-k">{SCOPE_LABEL[key].toLowerCase()}</span>{scope[key]}
                <button type="button" className="exec-blt2-x" aria-label={`Remove ${SCOPE_LABEL[key].toLowerCase()} scope`} onClick={() => clearScope([key])}>Remove</button>
              </span>
            ) : null,
          )}
          {scopeChoices.length > 0 ? (
            <label className="exec-blt2-field">
              <span className="exec-blt2-sr">Add scope</span>
              <select className="exec-blt2-input" value="" onChange={(event) => { const [key, ...rest] = event.target.value.split("|"); if (key) setParam(key, rest.join("|")); }}>
                <option value="">Add scope…</option>
                {scopeChoices.map((group) => (
                  <optgroup key={group.key} label={SCOPE_LABEL[group.key]}>
                    {group.values.map((value) => <option key={value} value={`${group.key}|${value}`}>{value}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : null}
          {scopeActive(scope) ? <button type="button" className="exec-blt2-btn" onClick={() => clearScope(["deployment", "account", "alpha", "order", "fill", "env"])}>Clear scope</button> : null}
        </div>
        {scopeActive(scope) ? (
          <p className="exec-blt2-note" id={noteId}>
            {serverScopeActive(scope)
              ? <>The server narrowed the blotter to this scope before paging: the counts, status chips and order path below are this scope&rsquo;s own orders.</>
              : <>An order or fill link opens that row when its page is loaded; it does not narrow the list.</>}
          </p>
        ) : null}

        {/* The chips above carry the short form; the full sentence stays for assistive tech (and in the chips' titles). */}
        <p className="exec-blt2-sr" id={`${noteId}-ctx`}>
          Environment and window come from this read, not from the context bar: the orders read has no environment or window filter yet. The environment highlighted in the context bar does not change these rows.
        </p>

        <div className="exec-blt2-tool">
          <label className="exec-blt2-field">
            <span className="exec-blt2-sr">Symbol</span>
            <input
              className="exec-blt2-input"
              type="search"
              placeholder="Symbol"
              value={symbolText}
              onChange={(event) => setSymbolText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") setParam("symbol", symbolText.trim()); }}
              onBlur={() => { if (symbolText.trim() !== filters.symbol) setParam("symbol", symbolText.trim()); }}
            />
          </label>
          <label className="exec-blt2-field">
            <span className="exec-blt2-sr">Venue</span>
            <select className="exec-blt2-input" value={filters.venue} onChange={(event) => setParam("venue", event.target.value)}>
              <option value="">Venue: all</option>
              {venues.map((venue) => <option key={venue} value={venue}>{venue}</option>)}
            </select>
          </label>
          <label className="exec-blt2-field">
            <span className="exec-blt2-sr">Side</span>
            <select className="exec-blt2-input" value={filters.side} onChange={(event) => setParam("side", event.target.value)}>
              <option value="">Side: both</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          {filtered || scopeActive(scope) ? <button type="button" className="exec-blt2-btn" onClick={clearAll}>Clear all</button> : null}
        </div>

        <div className="exec-blt2-rowbar">
          <div className="exec-blt2-seg" role="group" aria-label="Status">
            {CHIPS.map((chip) => {
              const count = counts ? counts[chip.id] : null;
              return (
                <button key={chip.id} type="button" className="exec-blt2-segbtn" aria-pressed={filters.bucket === chip.id} onClick={() => { setCursor(null); setParam("status", chip.id === "ALL" ? null : chip.id); }}>
                  {chip.label}
                  {count && count.count !== null ? <span className="exec-blt2-count" title={count.exact ? undefined : "Counted from the statuses the server listed; it does not cover every order"}> {count.exact ? "" : "~"}{count.count}</span> : null}
                </button>
              );
            })}
          </div>
          {unchipped.length > 0 ? (
            <span className="exec-blt2-na exec-blt2-unchipped">
              No chip: {unchipped.map((u) => `${u.label} ${u.count}`).join(", ")}
              <GapWhy name="Why there is no chip" rows={["The server has no status bucket for these, so the list cannot be filtered to them"]} next={null} />
            </span>
          ) : null}
          <div className="exec-blt2-tools">
            <span className="exec-blt2-menuwrap" onKeyDown={(event) => { if (event.key === "Escape" && chooserOpen) setChooserOpen(false); }}>
              <button type="button" className="exec-blt2-btn" aria-expanded={chooserOpen} aria-controls={colMenuId} onClick={() => setChooserOpen((v) => !v)}>Columns</button>
              {chooserOpen ? (
                <div className="exec-blt2-menu" id={colMenuId} role="group" aria-label="Choose columns">
                  {COLUMNS.map((c) => (
                    <label key={c.id} className="exec-blt2-check">
                      <input
                        type="checkbox"
                        checked={columns.has(c.id)}
                        disabled={c.fixed}
                        onChange={(event) => setColumns((prev) => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })}
                      />
                      {c.label}
                    </label>
                  ))}
                  <p className="exec-blt2-note">Order and Status always stay visible.</p>
                </div>
              ) : null}
            </span>
            {rows.length > 0 ? (
              <>
                <button type="button" className="exec-blt2-btn" aria-describedby={`${colMenuId}-export`} onClick={() => downloadCsv(blotterCsvName("Paper", page.asOf), blotterCsv(rows, visibleColumns))}>Export</button>
                <span id={`${colMenuId}-export`} className="exec-blt2-note">Exports the {rows.length} loaded {rows.length === 1 ? "row" : "rows"}</span>
              </>
            ) : null}
          </div>
        </div>

        {searching ? <p className="exec-blt2-note" role="status">Looking for this scope in older orders ({hops} of {SEEK_PAGES} pages read).</p> : null}
        <p className="exec-blt2-count-line" role="status" aria-live="polite">
          {emptyPage && page.ordersNotRead
            ? "Orders were not read"
            : emptyPage
            ? "No orders on this page"
            : <>Showing <b className="exec-blt2-num">{page.orders.length}</b> {page.filteredTotal !== null ? <>of <b className="exec-blt2-num">{page.filteredTotal}</b> {filtered ? "matching" : serverScopeActive(scope) ? "in this scope" : "authorized"}{filtered && page.exactTotal !== null ? <> · <span className="exec-blt2-num">{page.exactTotal}</span> {serverScopeActive(scope) ? "in this scope" : "authorized"}</> : null}</> : <>orders (the server did not state a total)</>} · newest first</>}
        </p>

        {narrow ? pager : null}
        {emptyPage && page.ordersNotRead ? (
          <div className="exec-blt2-empty" data-state={page.ordersNotRead.kind}>
            <PanelState
              status={page.ordersNotRead.kind}
              title={page.ordersNotRead.kind === "denied" ? "Orders are outside your access" : "Orders are unavailable"}
              reason={`The source did not deliver the orders${page.ordersNotRead.reason ? ` (${page.ordersNotRead.reason})` : ""}. This is not an empty blotter: whether orders exist is not known.`}
              actions={<button type="button" className="exec-blt2-btn" onClick={() => setReloadTick((n) => n + 1)}>Try again</button>}
            />
          </div>
        ) : emptyPage ? (
          <div className="exec-blt2-empty">
            {filtered || live ? <><p>No orders match these filters.</p><button type="button" className="exec-blt2-btn" onClick={() => { setCursor(null); clearAll(); }}>Clear all</button></> : <PanelState status="empty" reason={serverScopeActive(scope) ? "This scope has no orders in the blotter." : "No orders in this scope and window."} />}
          </div>
        ) : (
          <div className="exec-cards-wrap">
            <table className="exec-cards exec-blt2-table" aria-label="Orders">
              <thead>
                <tr>
                  {visibleColumns.map((c) => <th key={c.id} scope="col" data-col={c.id} data-numeric={c.numeric ? "true" : undefined}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="exec-cards-empty"><td colSpan={visibleColumns.length}><p className="exec-blt2-na">No loaded order matches this link. Use Older or Newer to look further.</p></td></tr>
                ) : null}
                {rows.map((order) => {
                  const isOpen = open.has(order.orderId);
                  const legs = legsFor(order, page.legs);
                  const fills = fillsFor(order, page.fills);
                  const focused = scoped?.focusOrderId === order.orderId;
                  const orderChart = chartHref(order);
                  return (
                    <Fragment key={order.orderId}>
                      <tr data-selected={focused ? "true" : undefined} aria-current={focused ? "true" : undefined}>
                        {visibleColumns.map((c) => (
                          <td key={c.id} data-l={c.label} data-col={c.id} data-numeric={c.numeric ? "true" : undefined}>
                            {c.id === "order" ? (
                              <span className="exec-blt2-ordercell">
                                <button type="button" className="exec-blt2-x" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} legs and fills for order ${order.orderId}`} onClick={() => toggle(order.orderId)}>{isOpen ? "\u2212" : "+"}</button>
                                {orderChart !== null ? (
                                  <Link className="exec-blt2-idlink" to={withContext(orderChart, params)} title="Open on chart">{order.orderId}</Link>
                                ) : (
                                  <span className="exec-blt2-id">{order.orderId}</span>
                                )}
                                {legs.some((leg) => (leg.state ?? "").toUpperCase() === "ARMED") ? <span className="exec-blt2-na" title="Bracket legs armed">{"\u25c7"}</span> : null}
                                {legs.length > 0 ? <span className="exec-blt2-na" title="Part of a bracket or conditional group" aria-hidden="true">{"\u25a3"}</span> : null}
                                {legs.length > 0 ? <span className="exec-blt2-sr"> bracket</span> : null}
                              </span>
                            ) : (
                              cell(order, c.id)
                            )}
                          </td>
                        ))}
                      </tr>
                      {isOpen ? (
                        <tr className="exec-blt2-kid">
                          <td colSpan={visibleColumns.length}>
                            <OrderDetail order={order} legs={legs} fills={fills} loadedFills={page.fills.length} asOf={page.asOf} funnel={funnels[order.orderId] ?? { phase: "loading" }} chartHref={orderChart} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {mid && chosen === null ? <p className="exec-blt2-note" data-testid="columns-hidden">To keep Price, Filled and Fee in view at this width, {MID_HIDDEN.map((id) => COLUMNS.find((c) => c.id === id)!.label).join(", ")} are hidden. Columns brings them back.</p> : null}
        {emptyPage ? null : <p className="exec-blt2-note exec-blt2-scrollhint">Scroll sideways for the other columns. The order and the status stay in view.</p>}
        {narrow ? null : pager}
        <details className="exec-blt2-how">
          <summary>How to read</summary>
          <p className="exec-blt2-note">
            Rows are newest first. Quantities and prices are exact and never shortened. A fee is in its venue currency and shown at one precision per currency; hover it for the exact value. Orders with bracket legs, fills and an order path expand in place. Not in this read: {notInRead.join(", ").toLowerCase()} (the source does not publish them yet).
          </p>
        </details>
      </section>

      <FoldPanel
        title="Order funnel"
        aside={lastOpened ? `Order ${lastOpened}` : "On the loaded orders"}
        defaultOpen
      >
        {emptyPage ? null : (
          <>
            <div className="exec-blt2-funnel" role="group" aria-label="Order path over the loaded orders">
              {pageFunnel(page.orders).map((step) => (
                <div key={step.id} className="exec-blt2-fstep">
                  <span className="exec-blt2-fk">{step.label}</span>
                  <span className="exec-blt2-fv">{step.count}</span>
                  <span className="exec-blt2-na">{step.percent !== null ? `${step.percent}%` : ""}{step.id === "submitted" ? " of the loaded orders" : " of submitted"}</span>
                </div>
              ))}
            </div>
            <p className="exec-blt2-note">Counted over the {page.orders.length} loaded orders; Filled is the order's own status. The server publishes no scope-level funnel yet; intent and signal steps happen before the order and are not carried here.</p>
          </>
        )}
        {lastOpened === null ? (
          <p className="exec-blt2-na" title="Expand an order to read its path: submitted, risk grant, venue acknowledged, fill.">Open an order to see its path</p>
        ) : (funnels[lastOpened]?.phase ?? "loading") === "loading" ? (
          <p className="exec-blt2-na" role="status">Reading the order funnel</p>
        ) : funnels[lastOpened]?.phase === "error" ? (
          <PanelState status={(funnels[lastOpened] as Extract<FunnelRead, { phase: "error" }>).status} reason={(funnels[lastOpened] as Extract<FunnelRead, { phase: "error" }>).reason} />
        ) : (
          <table className="exec-blt2-inner" aria-label="Order funnel" title="Intent and signal steps happen before the order and are not carried here.">
            <thead><tr><th>Stage</th><th>State</th><th data-numeric="true">Events</th><th data-numeric="true">Quantity</th></tr></thead>
            <tbody>
              {(funnels[lastOpened] as Extract<FunnelRead, { phase: "ready" }>).funnel.stages.map((stage) => (
                <tr key={stage.name}>
                  <td>{stage.name}</td>
                  <td><Flag kind={stage.state === "OBSERVED" ? "ok" : stage.state === "PARTIAL" ? "partial" : "na"} label={stage.state === "MISSING" ? "Not observed" : humanize(stage.state)} size="sm" /></td>
                  <td data-numeric="true">{stage.eventCount !== null ? stage.eventCount : <span className="exec-blt2-na">Not available</span>}</td>
                  <td data-numeric="true">{stage.events[0]?.quantity ? <span className="exec-blt2-num">{trimExact(stage.events[0].quantity)}</span> : <span className="exec-blt2-na">No quantity at this hop</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </FoldPanel>

      <FoldPanel title="Conditional groups" defaultOpen={page.groups.length > 0 && page.groups.length <= GROUP_CAP} aside={page.groups.length === 0 ? "None on this page" : `${Math.min(GROUP_CAP, page.groups.length)} of ${page.groups.length} on this page`}>
        {page.groups.length === 0 ? (
          <p className="exec-blt2-na">No conditional groups on this page</p>
        ) : (
          <CardsTable
            label="Conditional groups"
            rows={page.groups.slice(0, GROUP_CAP)}
            rowKey={(group) => group.groupId}
            selectedKey={groupRead.phase !== "idle" ? groupRead.groupId : null}
            columns={[
              { key: "group", label: "Group", render: (group) => <span className="exec-blt2-ordercell"><button type="button" className="exec-blt2-x" aria-pressed={groupRead.phase !== "idle" && groupRead.groupId === group.groupId} aria-label={`Read structure of group ${group.groupId}`} onClick={() => pickGroup(group.groupId)}>Read</button> <span className="exec-blt2-id">{group.groupId}</span></span> },
              { key: "symbol", label: "Symbol", render: (group) => group.symbol ?? <span className="exec-blt2-na">Not available</span> },
              { key: "type", label: "Type", render: (group) => (group.contingencyType ? (/^[A-Z]{3}$/.test(group.contingencyType) ? group.contingencyType : humanize(group.contingencyType)) : <span className="exec-blt2-na">Not stated</span>) },
              { key: "state", label: "State", render: (group) => (group.state ? humanize(group.state) : <span className="exec-blt2-na">Not stated</span>) },
              { key: "target", label: "Target", numeric: true, render: (group) => <ExactText value={group.targetQuantity} /> },
              { key: "filled", label: "Filled", numeric: true, render: (group) => <ExactText value={group.filledQuantity} /> },
              { key: "opened", label: "Opened (UTC)", render: (group) => (group.createdAt ? <span title={group.createdAt}>{shortUtc(group.createdAt)}</span> : <span className="exec-blt2-na">Not available</span>) },
            ]}
          />
        )}
        {groupRead.phase === "loading" ? <p className="exec-blt2-na" role="status">Reading the group structure</p> : null}
        {groupRead.phase === "error" ? <PanelState status={groupRead.status} reason={groupRead.reason} /> : null}
        {groupRead.phase === "ready" ? (
          <div className="exec-blt2-group" aria-label="Group structure">
            <p>
              <b>{groupRead.read.groupId}</b>: {groupRead.read.groupFound ? `${groupRead.read.legs.length} ${groupRead.read.legs.length === 1 ? "leg" : "legs"}` : `no such group (${groupRead.read.reasonCode ?? "reason not stated"})`}
              {groupRead.read.state ? `, ${humanize(groupRead.read.state)}` : ""}.
            </p>
            <ul>
              {groupRead.read.legs.map((leg) => <li key={leg.legId}><span className="exec-blt2-id">{leg.legId}</span> {leg.role ? humanize(leg.role) : "Role not stated"}{leg.state ? `, ${humanize(leg.state)}` : ""}</li>)}
            </ul>
            <p className="exec-blt2-note">
              {groupRead.read.currentStructureOnly ? "This is the group's structure now, not how it got here. " : ""}
              {groupRead.read.sourceSideEffectRequested ? "Reading it may have asked the Trading System to act." : "Reading it asked nothing of the Trading System."}
            </p>
          </div>
        ) : null}
        {page.groups.length > GROUP_CAP ? <p className="exec-blt2-note">Showing {GROUP_CAP} of {page.groups.length}</p> : null}
      </FoldPanel>

      <details className="exec-blt2-prov">
        <summary>Provenance</summary>
        <p className="exec-blt2-note">
          Source: orders and fills read model. Paging uses a keyset cursor, so rows do not shift while new orders arrive. Counts above are the server's ({page.countScope ?? "scope not stated"}; {page.exactQueryState ? humanize(page.exactQueryState) : "query state not stated"}; relation {page.relationCompleteness ? humanize(page.relationCompleteness) : "completeness not stated"}). Totals by currency are not published for this page yet.
          {page.unavailableBranches.length > 0 ? ` Branches not available: ${page.unavailableBranches.join(", ")}.` : ""}
        </p>
      </details>
    </div>
  );
}
