/**
 * The reads behind Accounts and Account 360, as small state hooks.
 *
 * Every hook makes its request through the `ExecutionApi` port (the screen
 * never builds a URL), scopes it to an AbortSignal, and answers one of four
 * phases: `idle` (not asked), `loading`, `error` (with the typed status and
 * reason the port gave) or `ready`. A new identity drops the old value, so a
 * different account never inherits the previous account's body; a refresh
 * keeps the last good value and reports why it could not renew.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { BindingExposure } from "../../../analytics";
import type { ExecutionApi, Result } from "../../../api/ports";
import type { BindingDetailRead, BindingItem, ManagerListEnvelope, ProfileEnvelope } from "../../../api/profileRead";
import type { FinancialChartPayload } from "../../../api/financialChart";
import type { SubjectActivityPage } from "../../../api/subjectActivity";
import type { PanelStatus } from "../../../contracts";
import { bindingQuery, mergeBindings, type BindingEnv } from "./model";

export type ReadState<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; value: T; stale: string | null };

const scoped = (api: ExecutionApi, signal: AbortSignal): ExecutionApi => api.withReadSignal?.(signal) ?? api;

function failure(result: Extract<Result<unknown>, { ok: false }>): ReadState<never> {
  return { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason };
}

/**
 * One read keyed by `key`. `enabled: false` makes no request. `reload` asks
 * again for the same key; a failed reload keeps the value and sets `stale`.
 */
export function useRead<T>(
  api: ExecutionApi,
  key: string,
  enabled: boolean,
  load: (api: ExecutionApi) => Promise<Result<T>>,
): { state: ReadState<T>; reload(): void; refreshing: boolean } {
  const [state, setState] = useState<ReadState<T>>({ phase: enabled ? "loading" : "idle" });
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const loader = useRef(load);
  loader.current = load;
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastKey.current = null;
      setState({ phase: "idle" });
      setRefreshing(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const same = lastKey.current === key;
    lastKey.current = key;
    if (!same) setState({ phase: "loading" });
    setRefreshing(same);
    void loader.current(scoped(api, controller.signal)).then((result) => {
      if (cancelled) return;
      setRefreshing(false);
      if (result.ok) {
        setState({ phase: "ready", value: result.value, stale: null });
        return;
      }
      setState((prev) => (same && prev.phase === "ready" ? { ...prev, stale: result.reason } : failure(result)));
    }).catch(() => {
      if (cancelled) return;
      setRefreshing(false);
      setState((prev) => (same && prev.phase === "ready" ? { ...prev, stale: "PORTAL_READ_FAILED" } : { phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" }));
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, key, enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { state, reload, refreshing };
}

/* ── the account ─────────────────────────────────────────────────────────── */

export const useAccountResource = (api: ExecutionApi, accountId: string) =>
  useRead<ProfileEnvelope>(api, `account:${accountId}`, true, (scopedApi) => scopedApi.getAccount360Resource(accountId));

export const useBindingExposure = (api: ExecutionApi, bindingId: string | null) =>
  useRead<BindingExposure>(api, `exposure:${bindingId ?? ""}`, bindingId !== null, async (scopedApi) => {
    const result = await scopedApi.getBindingExposure(bindingId ?? "");
    return result.ok ? { ok: true as const, value: result.value.exposure } : result;
  });

/**
 * The binding detail is read per environment and a binding lives in one. When
 * the caller knows the environment it passes one; a deep link to a binding the
 * list did not load passes all three, tried in order, and the first that has it
 * wins. A refusal in every environment is the first refusal.
 */
export const useBindingDetail = (api: ExecutionApi, bindingId: string | null, environments: readonly BindingEnv[]) =>
  useRead<BindingDetailRead>(api, `binding:${bindingId ?? ""}:${environments.join(",")}`, bindingId !== null && environments.length > 0, async (scopedApi) => {
    let first: Result<BindingDetailRead> | null = null;
    for (const environment of environments) {
      const result = await scopedApi.getBindingDetail(bindingId ?? "", environment);
      if (result.ok) return result;
      first ??= result;
    }
    return first ?? { ok: false as const, status: "unavailable" as const, reason: "NO_ENVIRONMENT_TO_ASK" };
  });

export const useAccountEquity = (api: ExecutionApi, accountId: string, environment: "paper" | "sandbox" | "live" | null, workspaceId: string | null, enabled: boolean) =>
  useRead<FinancialChartPayload>(api, `equity:${accountId}:${environment ?? ""}:${workspaceId ?? ""}`, enabled && environment !== null, (scopedApi) =>
    scopedApi.getFinancialChart({ environment: environment ?? "live", subjectKind: "account", subjectId: accountId, metric: "equity", workspaceId }));

/* ── keyset-paged subject activity (one relation at a time) ──────────────── */

export interface ActivityPages {
  state: ReadState<{ pages: readonly SubjectActivityPage[] }>;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string | null;
  loadMore(): void;
}

export function useSubjectPages(
  api: ExecutionApi,
  accountId: string,
  environment: "paper" | "sandbox" | "live" | null,
  relation: "orders" | "fills",
  enabled: boolean,
): ActivityPages {
  const key = `activity:${accountId}:${environment ?? ""}:${relation}`;
  const first = useRead<SubjectActivityPage>(api, key, enabled && environment !== null, (scopedApi) =>
    scopedApi.getSubjectActivity({ environment: environment ?? "live", subjectKind: "account", subjectId: accountId, relation, limit: 100 }));
  const [more, setMore] = useState<{ key: string; pages: readonly SubjectActivityPage[] }>({ key, pages: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const generation = useRef(0);

  // A different account, environment or relation owns different pages.
  const pagesFor = more.key === key ? more.pages : [];
  useEffect(() => {
    generation.current += 1;
    setMore({ key, pages: [] });
    setLoadingMore(false);
    setMoreError(null);
  }, [key]);

  const head = first.state.phase === "ready" ? first.state.value : null;
  const tail = pagesFor.length > 0 ? pagesFor[pagesFor.length - 1]! : head;
  const hasMore = tail !== null && tail.page.hasMore && tail.page.nextCursor !== null;
  const cursor = hasMore ? tail.page.nextCursor : null;

  const loadMore = useCallback(() => {
    if (cursor === null || environment === null) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreError(null);
    void api.getSubjectActivity({ environment, subjectKind: "account", subjectId: accountId, relation, limit: 100, after: cursor }).then((result) => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      if (!result.ok) {
        setMoreError(result.reason);
        return;
      }
      setMore((prev) => ({ key: prev.key, pages: [...prev.pages, result.value] }));
    }).catch(() => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      setMoreError("PORTAL_READ_FAILED");
    });
  }, [api, accountId, environment, relation, cursor]);

  const state: ActivityPages["state"] = first.state.phase === "ready"
    ? { phase: "ready", value: { pages: [first.state.value, ...pagesFor] }, stale: first.state.stale }
    : first.state;
  return { state, hasMore, loadingMore, moreError, loadMore };
}

/* ── the bindings list ───────────────────────────────────────────────────── */

export interface BindingPages {
  state: ReadState<null>;
  items: readonly BindingItem[];
  envelope: ManagerListEnvelope<BindingItem> | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore(): void;
}

/** Keyset-paged `GET /broker-bindings`: the first page replaces, `loadMore` appends after the server's cursor. */
export function useBindingPages(
  api: ExecutionApi,
  filters: { env: BindingEnv; q: string | null; venue: string | null },
): BindingPages {
  const key = `${filters.env}|${filters.q ?? ""}|${filters.venue ?? ""}`;
  const [state, setState] = useState<ReadState<null>>({ phase: "loading" });
  const [items, setItems] = useState<readonly BindingItem[]>([]);
  const [envelope, setEnvelope] = useState<ManagerListEnvelope<BindingItem> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const build = useRef(filters);
  build.current = filters;
  const cursorRef = useRef<string | null>(null);
  const nextCursor = envelope?.page.hasMore ? envelope.page.nextCursor : null;
  cursorRef.current = nextCursor;
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setLoadingMore(false);
    setMoreError(null);
    const controller = new AbortController();
    let cancelled = false;
    setState({ phase: "loading" });
    setItems([]);
    setEnvelope(null);
    void scoped(api, controller.signal).getBindings(bindingQuery(build.current)).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState(failure(result));
        return;
      }
      setItems(result.value.page.rows);
      setEnvelope(result.value);
      setState({ phase: "ready", value: null, stale: null });
    }).catch(() => {
      if (!cancelled) setState({ phase: "error", status: "unavailable", reason: "PORTAL_READ_FAILED" });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, key]);

  const loadMore = useCallback(() => {
    const after = cursorRef.current;
    if (after === null) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreError(null);
    void api.getBindings(bindingQuery(build.current, after)).then((result) => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      if (!result.ok) {
        setMoreError(result.reason);
        return;
      }
      setItems((current) => mergeBindings(current, result.value.page.rows));
      setEnvelope(result.value);
    }).catch(() => {
      if (mine !== generation.current) return;
      setLoadingMore(false);
      setMoreError("PORTAL_READ_FAILED");
    });
  }, [api]);

  return { state, items, envelope, nextCursor, loadingMore, moreError, loadMore };
}
