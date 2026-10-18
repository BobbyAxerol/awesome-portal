/**
 * The reads behind Alpha 360 and Trade Replay, through the ExecutionApi port.
 *
 * `useRead` is one read with a key: it starts when `enabled` first turns true
 * for that key, keeps its answer when the tab is left and re-entered, and drops
 * it when the key (alpha, book) changes. `usePagedRead` is the same with a
 * keyset `Load more`: later pages append, a failed later page keeps what is
 * shown and reports itself. Nothing refreshes by itself; a re-visit of the
 * screen reads again.
 *
 * The three states a read can be in are kept apart, never folded into "empty":
 * not started (`idle`), in flight (`loading`), answered (`ready`) or refused
 * (`error` with the typed status and reason).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AlphaActivity } from "../../../api/derivations";
import type { FinancialChartPayload } from "../../../api/financialChart";
import type { MarketCandleInterval, MarketCandlesPayload } from "../../../api/marketCandles";
import type { MarketContextCandles } from "../../../api/marketContext";
import type { ObservedTimeline } from "../../../api/observedTimeline";
import type { ExecutionApi, Result } from "../../../api/ports";
import type { ProfileEnvelope } from "../../../api/profileRead";
import { readAlphaFleetItem, type AlphaFleetItem } from "../../../api/profileRead";
import type { SubjectActivityPage } from "../../../api/subjectActivity";
import type { PanelStatus } from "../../../contracts";
import { readReplayFills, readReplayOrders, type ReplayFill, type ReplayOrder } from "../../../components/tradeReplayModel";
import type { StageDrift } from "../../../hifiInsight";
import type { ExecEnv } from "../../urlState";

export type ReadFailure = { status: Exclude<PanelStatus, "ok" | "loading">; reason: string };

export type Read<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | ({ phase: "error" } & ReadFailure)
  | { phase: "ready"; value: T };

function failure(result: Extract<Result<unknown>, { ok: false }>): ReadFailure {
  return { status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason };
}

const IDLE = { phase: "idle" } as const;

/** One keyed read. */
export function useRead<T>(api: ExecutionApi, enabled: boolean, key: string, run: (scoped: ExecutionApi) => Promise<Result<T>>): Read<T> {
  const [read, setRead] = useState<{ key: string; api: ExecutionApi; value: Read<T> }>({ key, api, value: IDLE });
  const started = useRef<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const controller = useRef<AbortController | null>(null);

  // A new key or a new api is another question: forget the old answer.
  useEffect(() => {
    started.current = null;
    controller.current?.abort();
    setRead({ key, api, value: IDLE });
  }, [api, key]);

  useEffect(() => {
    if (!enabled || started.current === key) return;
    started.current = key;
    const abort = new AbortController();
    controller.current = abort;
    setRead({ key, api, value: { phase: "loading" } });
    const scoped = api.withReadSignal?.(abort.signal) ?? api;
    void runRef
      .current(scoped)
      .then((result) => {
        if (abort.signal.aborted) return;
        setRead({ key, api, value: result.ok ? { phase: "ready", value: result.value } : { phase: "error", ...failure(result) } });
      })
      .catch(() => {
        if (!abort.signal.aborted) setRead({ key, api, value: { phase: "error", status: "unavailable", reason: "The read failed before the Portal answered." } });
      });
  }, [api, enabled, key]);

  useEffect(() => () => controller.current?.abort(), []);

  // Hide an old answer for one frame after the subject changed.
  return read.key === key && read.api === api ? read.value : enabled ? { phase: "loading" } : IDLE;
}

export interface PagedRead<P> {
  read: Read<readonly P[]>;
  loadingMore: boolean;
  moreError: string | null;
  hasMore: boolean;
  loadMore(): void;
}

/** A keyset-paged read: `load(scoped, after)` returns one page; `cursorOf` is the server's `next_cursor`. */
export function usePagedRead<P>(
  api: ExecutionApi,
  enabled: boolean,
  key: string,
  load: (scoped: ExecutionApi, after: string | null) => Promise<Result<P>>,
  cursorOf: (page: P) => string | null,
): PagedRead<P> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const first = useRead<P>(api, enabled, key, (scoped) => loadRef.current(scoped, null));
  const [more, setMore] = useState<{ key: string; pages: readonly P[]; loading: boolean; error: string | null }>({ key, pages: [], loading: false, error: null });
  const own = more.key === key ? more : { key, pages: [] as readonly P[], loading: false, error: null };
  const pages = useMemo(() => (first.phase === "ready" ? [first.value, ...own.pages] : []), [first, own.pages]);
  const last = pages[pages.length - 1];
  const next = last === undefined ? null : cursorOf(last);
  const nextRef = useRef(next);
  nextRef.current = next;
  const busy = useRef(false);

  const loadMore = useCallback(() => {
    const after = nextRef.current;
    if (after === null || busy.current) return;
    busy.current = true;
    setMore((m) => ({ ...(m.key === key ? m : { key, pages: [], loading: false, error: null }), loading: true, error: null }));
    void loadRef
      .current(api, after)
      .then((result) => {
        busy.current = false;
        setMore((m) => {
          const base = m.key === key ? m : { key, pages: [] as readonly P[], loading: false, error: null };
          return result.ok
            ? { ...base, pages: [...base.pages, result.value], loading: false, error: null }
            : { ...base, loading: false, error: result.reason };
        });
      })
      .catch(() => {
        busy.current = false;
        setMore((m) => ({ ...(m.key === key ? m : { key, pages: [], loading: false, error: null }), loading: false, error: "The page could not be read." }));
      });
  }, [api, key]);

  const read: Read<readonly P[]> = first.phase === "ready" ? { phase: "ready", value: pages } : first;
  return { read, loadingMore: own.loading, moreError: own.error, hasMore: next !== null, loadMore };
}

/* ── named reads ──────────────────────────────────────────────────────────── */

export interface AlphaResource {
  envelope: ProfileEnvelope;
  /** The alpha row, or `null` when the resource carries none (empty or unreadable). */
  item: AlphaFleetItem | null;
}

export function useAlphaResource(api: ExecutionApi, alphaId: string): Read<AlphaResource> {
  return useRead<AlphaResource>(api, true, `resource:${alphaId}`, async (scoped) => {
    const result = await scoped.getAlpha360Resource(alphaId);
    if (!result.ok) return result;
    return { ok: true, value: { envelope: result.value, item: readAlphaFleetItem(result.value.objects.alpha) } };
  });
}

export const useStageDrift = (api: ExecutionApi, alphaId: string, enabled: boolean): Read<StageDrift> =>
  useRead(api, enabled, `drift:${alphaId}`, (scoped) => scoped.getStageDrift(alphaId));

export function useEquityChart(api: ExecutionApi, alphaId: string, env: ExecEnv, workspaceId: string | null, enabled: boolean): Read<FinancialChartPayload> {
  return useRead(api, enabled, `equity:${alphaId}:${env}`, (scoped) =>
    scoped.getFinancialChart({
      environment: env,
      subjectKind: "alpha",
      subjectId: alphaId,
      metric: "equity",
      viewportPx: typeof window === "undefined" ? undefined : window.innerWidth,
      workspaceId,
    }),
  );
}

export const useActivityRollup = (api: ExecutionApi, alphaId: string, env: ExecEnv, enabled: boolean): Read<AlphaActivity> =>
  useRead(api, enabled, `activity:${alphaId}:${env}`, (scoped) => scoped.getAlphaActivity(alphaId, env));

/** The observed timeline: first page, then the Portal's own continuation, passed back unchanged. */
export const useObservedFeed = (api: ExecutionApi, alphaId: string, env: ExecEnv, enabled: boolean): PagedRead<ObservedTimeline> =>
  usePagedRead<ObservedTimeline>(
    api,
    enabled,
    `timeline:${alphaId}:${env}`,
    (scoped, after) => scoped.getObservedTimeline({ environment: env, subjectKind: "alpha", subjectId: alphaId, limit: 100, after }),
    (page) => (page.page.hasMore ? page.page.nextCursor : null),
  );

export interface SubjectBook {
  orders: readonly ReplayOrder[];
  fills: readonly ReplayFill[];
  /** The raw order records, for the table columns the replay model drops. */
  ordersState: Read<readonly SubjectActivityPage[]>;
  fillsState: Read<readonly SubjectActivityPage[]>;
  timeframe: SubjectActivityPage["timeframe"];
  asOfMs: number | null;
  ordersMore: PagedRead<SubjectActivityPage>;
  fillsMore: PagedRead<SubjectActivityPage>;
}

const pageCursor = (page: SubjectActivityPage): string | null => (page.page.hasMore ? page.page.nextCursor : null);

/** Orders and fills of one alpha in one book, each with its own keyset `Load more`. */
export function useSubjectBook(api: ExecutionApi, alphaId: string, env: ExecEnv, enabled: boolean): SubjectBook {
  const loadFor = (relation: "orders" | "fills") => (scoped: ExecutionApi, after: string | null) =>
    scoped.getSubjectActivity({ environment: env, subjectKind: "alpha", subjectId: alphaId, relation, limit: 200, after });
  const ordersMore = usePagedRead<SubjectActivityPage>(api, enabled, `orders:${alphaId}:${env}`, loadFor("orders"), pageCursor);
  const fillsMore = usePagedRead<SubjectActivityPage>(api, enabled, `fills:${alphaId}:${env}`, loadFor("fills"), pageCursor);
  const orderPages = ordersMore.read.phase === "ready" ? ordersMore.read.value : [];
  const fillPages = fillsMore.read.phase === "ready" ? fillsMore.read.value : [];
  const orders = useMemo(() => readReplayOrders(orderPages.flatMap((p) => p.records.map((r) => r.values))), [orderPages]);
  const fills = useMemo(() => readReplayFills(fillPages.flatMap((p) => p.records.map((r) => r.values))), [fillPages]);
  const head = orderPages[0] ?? fillPages[0] ?? null;
  return {
    orders,
    fills,
    ordersState: ordersMore.read,
    fillsState: fillsMore.read,
    timeframe: head?.timeframe ?? null,
    asOfMs: head?.sourceHealth.asOfMs ?? null,
    ordersMore,
    fillsMore,
  };
}

export interface ReplayCandleReads {
  venue: Read<MarketCandlesPayload>;
  context: Read<MarketContextCandles>;
}

export interface ReplayCandleQuery {
  env: ExecEnv;
  symbol: string;
  venue: "BINANCE" | "OKX";
  interval: MarketCandleInterval;
  fromMs: number;
  toMs: number;
  limit: number;
}

/**
 * Venue public klines and the Trading System's own bars for one symbol. Two
 * sources, never merged: the replay names which one it drew.
 */
export function useReplayCandles(api: ExecutionApi, query: ReplayCandleQuery | null): ReplayCandleReads {
  const key = query === null ? "none" : `${query.env}:${query.venue}:${query.symbol}:${query.interval}:${query.fromMs}:${query.toMs}`;
  const venue = useRead<MarketCandlesPayload>(api, query !== null, `venue:${key}`, (scoped) =>
    query === null
      ? Promise.resolve({ ok: false, status: "unavailable", reason: "No symbol or range to read candles for." })
      : scoped.getMarketCandles({ environment: query.env, venue: query.venue, symbol: query.symbol, interval: query.interval, fromMs: query.fromMs, toMs: query.toMs, limit: query.limit }),
  );
  const context = useRead<MarketContextCandles>(api, query !== null, `context:${key}`, (scoped) =>
    query === null
      ? Promise.resolve({ ok: false, status: "unavailable", reason: "No symbol or range to read candles for." })
      : scoped.getMarketContextCandles({ environment: query.env, venue: query.venue, instrument: query.symbol, interval: query.interval, fromMs: query.fromMs, toMs: query.toMs, pointLimit: Math.min(2000, query.limit) }),
  );
  return { venue, context };
}
