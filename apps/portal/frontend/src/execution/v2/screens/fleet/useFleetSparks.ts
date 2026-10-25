/**
 * The Equity 30D sparkline of the Fleet table (guide 8.1): drawn from the Manager SERIES port (`getManagerSeries`, metric NAV, 30D), never from
 * client arithmetic. The published series has two subjects only, FUND and PORTFOLIO, so what a row can draw is the NAV series of the portfolio
 * it belongs to; the cell says so on its title. A series of the alpha version itself needs an ALPHA subject in the series contract (recorded in
 * ALPHA_FLEET_COMPLETION). One request per environment per four portfolios, at most `MAX_PORTFOLIOS` portfolios; an answer that is not an
 * AVAILABLE series for the asked subject is a typed absence for that portfolio, never a flat line.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { ManagerEnvironment, ManagerRow } from "../../readers/managerDataset";
import { useScopedCacheEviction } from "../../scopedEviction";

export const MAX_SPARK_PORTFOLIOS = 24;
const EMPTY: ReadonlyMap<string, SparkEntry> = new Map();

export type SparkEntry = { kind: "series"; values: readonly string[]; currency: string | null; basis: string } | { kind: "absent"; reason: string };
export const sparkKey = (environment: ManagerEnvironment, portfolioId: string): string => JSON.stringify([environment, portfolioId]);

export function useFleetSparks(
  api: ExecutionApi, enabled: boolean, rows: readonly ManagerRow[], datasetEnvironment: ManagerEnvironment | "ALL", workspaceId?: string,
  /** The owning dataset's lineage revision (its generation). A series read for another revision is never drawn beside these rows. */
  revision: string | null = null,
): ReadonlyMap<string, SparkEntry> {
  const wanted = useMemo(() => {
    const seen = new Map<string, { environment: ManagerEnvironment; portfolioId: string }>();
    for (const row of rows) {
      const environment = row.environment ?? (datasetEnvironment === "ALL" ? null : datasetEnvironment);
      if (environment === null) continue;
      const key = sparkKey(environment, row.portfolioId);
      if (!seen.has(key) && seen.size < MAX_SPARK_PORTFOLIOS) seen.set(key, { environment, portfolioId: row.portfolioId });
    }
    return [...seen.entries()];
  }, [rows, datasetEnvironment]);
  const signature = wanted.map(([key]) => key).join("|");
  const [read, setRead] = useState<{ revision: string | null; entries: ReadonlyMap<string, SparkEntry> }>({ revision, entries: new Map() });
  const done = useRef(new Set<string>());
  const flight = useRef<{ api: ExecutionApi; workspaceId: string | undefined; revision: string | null; controller: AbortController } | null>(null);

  // One controller per (port, workspace, dataset revision): another scope, or a dataset that moved to a new generation (the stream's refresh),
  // drops what was asked, cancels what is in flight (a late answer is refused: its signal is aborted) and forgets what was read.
  const drop = () => {
    flight.current?.controller.abort();
    flight.current = null;
    done.current = new Set();
    setRead({ revision, entries: new Map() });
  };
  useEffect(() => {
    if (flight.current !== null && (flight.current.api !== api || flight.current.workspaceId !== workspaceId || flight.current.revision !== revision)) drop();
    // The first revision of a dataset arrives after the hook mounted (null -> a revision): nothing was read for it yet.
    else setRead((current) => (current.revision === revision ? current : { revision, entries: new Map() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, workspaceId, revision]);
  // UXM-08: access to the scope ended: nothing read for it stays on screen and nothing in flight may answer.
  useScopedCacheEviction(() => { drop(); });
  useEffect(() => () => { flight.current?.controller.abort(); }, []);

  useEffect(() => {
    if (!enabled || typeof api.getManagerSeries !== "function") return;
    const todo = wanted.filter(([key]) => !done.current.has(key));
    if (todo.length === 0) return;
    if (flight.current === null) flight.current = { api, workspaceId, revision, controller: new AbortController() };
    const controller = flight.current.controller;
    const scoped = api.withReadSignal?.(controller.signal) ?? api;
    const byEnvironment = new Map<ManagerEnvironment, string[]>();
    for (const [, item] of todo) byEnvironment.set(item.environment, [...(byEnvironment.get(item.environment) ?? []), item.portfolioId]);
    for (const [key] of todo) done.current.add(key);
    for (const [environment, ids] of byEnvironment) {
      for (let at = 0; at < ids.length; at += 4) {
        const chunk = ids.slice(at, at + 4);
        void Promise.resolve(scoped.getManagerSeries({
          environment, metric: "NAV", window: "30D", subjects: chunk.map((subjectId) => ({ subjectType: "PORTFOLIO" as const, subjectId })),
          ...(workspaceId ? { workspaceId } : {}),
        })).then((result) => {
          if (controller.signal.aborted) return;
          const next = new Map<string, SparkEntry>();
          chunk.forEach((portfolioId, index) => {
            const entry = result.ok ? result.value.series[index] : undefined;
            next.set(sparkKey(environment, portfolioId), entry !== undefined && entry.state === "AVAILABLE"
              ? { kind: "series", values: entry.points.map((point) => point.exact), currency: entry.currency, basis: entry.basis }
              : { kind: "absent", reason: !result.ok ? result.reason : entry === undefined ? "NO_SERIES_ENTRY" : entry.reasonCode });
          });
          // A typed absence draws nothing (the scalar beside it carries the figure), so it needs no render; only a series does.
          if ([...next.values()].some((entry) => entry.kind === "series")) setRead((current) => (current.revision === revision ? { revision, entries: new Map([...current.entries, ...next]) } : current));
        }).catch(() => undefined);
      }
    }
    // `signature` is the identity of the wanted set; `wanted` itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, enabled, signature, workspaceId, revision]);

  // Rows of one revision never wear the sparkline read for another: until the effect above has dropped it, it is not returned.
  return read.revision === revision ? read.entries : EMPTY;
}
