/**
 * The reads Portfolio 360 makes, each with its own state, so one failed read
 * puts one panel into its own state and leaves the rest of the page alone.
 *
 * | Read | Port method | When |
 * |---|---|---|
 * | the portfolio resource | `getPortfolio360Resource` | always |
 * | capital, per environment | `getPortfolioCapital` x3 | always (a separate book per environment, never folded) |
 * | equity series | `getFinancialChart` (portfolio, equity) | once the resource names its environment |
 * | capital ledger, per environment | `getCapitalLedger` | the Allocations tab has been opened |
 * | correlation | `getCorrelation` | the Risk tab has been opened |
 * | operations on this portfolio | `listOperationalQueueV2` | the People tab has been opened |
 *
 * Not read: `getCrossEquity` (the Cross-portfolio table is dropped,
 * V1_SUBSCREEN_DISPOSITION), `getQueryAnalytics` (its funnel and execution
 * quality are profile-wide, not this portfolio's) and the relation pages (the
 * equity chart route carries the series the V1 drain used to rebuild).
 */
import type { ExecutionApi } from "../../../../api/ports";
import type { FinancialEnvironment } from "../../../../api/financialChart";
import { useMemo } from "react";

import { environmentsOf, readDeployments, type Environment } from "./model";
import { useRead } from "../useRead";

const DAY_MS = 86_400_000;
const WINDOW_DAYS: Readonly<Record<string, number | null>> = { "7D": 7, "30D": 30, "90D": 90, ALL: null };

function useResource(api: ExecutionApi, portfolioId: string, enabled: boolean) {
  return useRead(api, enabled, `resource|${portfolioId}`, (scoped) => scoped.getPortfolio360Resource(portfolioId));
}

export interface Visited {
  allocations: boolean;
  risk: boolean;
  people: boolean;
}

export function usePortfolioReads(api: ExecutionApi, portfolioId: string, enabled: boolean, windowLabel: string, visited: Visited) {
  const resource = useResource(api, portfolioId, enabled);
  const ready = resource.phase === "ready" ? resource.value : null;
  const selected: FinancialEnvironment = ready?.selectedEnvironment ?? "live";
  const asOfMs = ready?.asOfMs ?? null;
  const present = useMemo(() => (ready ? environmentsOf(ready, readDeployments(ready)) : []), [ready]);
  const days = WINDOW_DAYS[windowLabel] ?? null;
  const range = days !== null && asOfMs !== null ? { fromMs: asOfMs - days * DAY_MS, toMs: asOfMs } : null;

  const capital = {
    live: useRead(api, enabled, `capital|${portfolioId}|live`, (scoped) => scoped.getPortfolioCapital(portfolioId, "live")),
    paper: useRead(api, enabled, `capital|${portfolioId}|paper`, (scoped) => scoped.getPortfolioCapital(portfolioId, "paper")),
    sandbox: useRead(api, enabled, `capital|${portfolioId}|sandbox`, (scoped) => scoped.getPortfolioCapital(portfolioId, "sandbox")),
  } satisfies Record<Environment, unknown>;

  const chart = useRead(
    api,
    enabled && ready !== null,
    `chart|${portfolioId}|${selected}|${range?.fromMs ?? "all"}`,
    (scoped) => scoped.getFinancialChart({
      environment: selected,
      subjectKind: "portfolio",
      subjectId: portfolioId,
      metric: "equity",
      viewportPx: typeof window !== "undefined" ? window.innerWidth : undefined,
      workspaceId: ready?.workspaceId ?? null,
      ...(range ? { fromMs: range.fromMs, toMs: range.toMs } : {}),
    }),
  );

  const ledgers = {
    live: useRead(api, enabled && visited.allocations && present.includes("live"), `ledger|${portfolioId}|live`, (scoped) => scoped.getCapitalLedger(portfolioId, "live")),
    paper: useRead(api, enabled && visited.allocations && present.includes("paper"), `ledger|${portfolioId}|paper`, (scoped) => scoped.getCapitalLedger(portfolioId, "paper")),
    sandbox: useRead(api, enabled && visited.allocations && present.includes("sandbox"), `ledger|${portfolioId}|sandbox`, (scoped) => scoped.getCapitalLedger(portfolioId, "sandbox")),
  } satisfies Record<Environment, unknown>;

  const correlation = useRead(
    api,
    enabled && visited.risk && ready !== null,
    `correlation|${portfolioId}|${selected}`,
    (scoped) => scoped.getCorrelation(portfolioId, selected),
  );

  const operations = useRead(
    api,
    enabled && visited.people,
    `operations|${portfolioId}`,
    (scoped) => scoped.listOperationalQueueV2({ targetType: "PORTFOLIO", targetId: portfolioId, limit: 10 }),
  );

  return { resource, capital, chart, ledgers, correlation, operations, selected, range, present };
}

export type PortfolioReads = ReturnType<typeof usePortfolioReads>;
