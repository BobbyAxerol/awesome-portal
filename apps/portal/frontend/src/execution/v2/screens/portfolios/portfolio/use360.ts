/**
 * The reads Portfolio 360 makes, each with its own state, so one failed read
 * puts one panel into its own state and leaves the rest of the page alone.
 *
 * | Read | Port method | When |
 * |---|---|---|
 * | the portfolio resource | `getPortfolio360Resource` | always |
 * | capital, per environment | `getPortfolioCapital` x3 | always (a separate book per environment, never folded) |
 * | equity series | `getFinancialChart` (portfolio, equity) | once the resource names its environment |
 * | contributors | `getManagerDataset` (PORTFOLIO, `group_by=alpha_id`, the page window, the selected environment) | once the portfolio dataset offers `alpha_id` |
 * | NAV series | `getManagerSeries` (one PORTFOLIO subject, metric NAV, the page window, the selected environment) | once the resource names its environment |
 * | Net PnL and Return series | `getManagerSeries` (same subject, window and environment, metric NET_PNL / RETURN) | once the NAV read says the series source is published (Performance card tabs) |
 * | capital flow, per environment | `getManagerDataset` x2 (PORTFOLIO, `group_by=portfolio_id` for the statements and `group_by=alpha_id` for the alpha nodes) | the Allocations tab has been opened and the portfolio has a book in that environment |
 * | capital ledger, per environment | `getCapitalLedger` | the Allocations tab has been opened; the selected environment's also from the start (the Overview's event ribbon sits on the equity) |
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
import type { ManagerDatasetQuery } from "../../../../api/managerDatasetQuery";
import { useManagerDataset } from "../../manager/useManagerDataset";
import { servesDataset } from "../PartitionFigures";
import { alphaGroupOffered } from "../../overview/contributorsModel";
import type { ManagerSeriesQuery } from "../../../readers/managerSeries";
import { useManagerSeries } from "../../series/useManagerSeries";

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

  // FE-013: the portfolio's NAV series (BE-P4), for the selected environment and the page's window, through the port.
  const navWindow = windowLabel === "7D" || windowLabel === "30D" || windowLabel === "90D" || windowLabel === "ALL" ? windowLabel : null;
  const navQuery = useMemo<ManagerSeriesQuery | null>(
    () => (navWindow === null ? null : { environment: selected, metric: "NAV", window: navWindow, subjects: [{ subjectType: "PORTFOLIO", subjectId: portfolioId }], ...(ready?.workspaceId ? { workspaceId: ready.workspaceId } : {}) }),
    [selected, navWindow, portfolioId, ready?.workspaceId],
  );
  const nav = useManagerSeries(api, enabled && ready !== null, navQuery);
  // Net PnL and Return of the same portfolio, once the NAV read says the series port serves it (WP-F1): the Performance card's tabs.
  const navBody = nav.phase === "ready" ? nav.value : nav.phase === "loading" || nav.phase === "error" ? nav.last : null;
  const served = navBody !== null && navBody.seriesSource.state === "PUBLISHED";
  const pnlQuery = useMemo<ManagerSeriesQuery | null>(() => (navQuery === null ? null : { ...navQuery, metric: "NET_PNL" }), [navQuery]);
  const returnQuery = useMemo<ManagerSeriesQuery | null>(() => (navQuery === null ? null : { ...navQuery, metric: "RETURN" }), [navQuery]);
  const pnl = useManagerSeries(api, enabled && ready !== null && served, pnlQuery);
  const ret = useManagerSeries(api, enabled && ready !== null && served, returnQuery);

  // The portfolio's Manager dataset (PORTFOLIO surface, grouped by portfolio so its own totals come as a group) for the selected
  // environment and the page window: capital statements and Net PnL per economic partition. Same port as everything else.
  const datasetQuery = useMemo<ManagerDatasetQuery | null>(
    () => (navWindow === null ? null : {
      surface: "PORTFOLIO", id: portfolioId, environment: selected, window: navWindow, groupBy: ["portfolio_id"], limit: 1,
      ...(ready?.workspaceId ? { workspaceId: ready.workspaceId } : {}),
    }),
    [selected, navWindow, portfolioId, ready?.workspaceId],
  );
  const dataset = useManagerDataset(api, enabled && ready !== null && servesDataset(api), datasetQuery);
  // Contributors: the same portfolio, environment and window grouped by alpha_id by the server (Net PnL, Return, Score per alpha).
  // Asked once the dataset above has said it offers alpha_id as a group field.
  const contributorsQuery = useMemo<ManagerDatasetQuery | null>(
    () => (datasetQuery === null ? null : { ...datasetQuery, groupBy: ["alpha_id"] }),
    [datasetQuery],
  );
  const datasetValue = dataset.phase === "ready" ? dataset.value : null;
  const contributors = useManagerDataset(api, enabled && ready !== null && servesDataset(api) && datasetValue !== null && alphaGroupOffered(datasetValue) === true, contributorsQuery);

  // The capital flow of the Allocations tab (WP-F1), one basis per environment: that environment's statements (group by portfolio, so the
  // portfolio's own totals come as a group) and its alpha groups. Asked once the tab has been opened and the portfolio has a book there.
  const flowQuery = (environment: Environment, groupBy: "portfolio_id" | "alpha_id"): ManagerDatasetQuery | null =>
    navWindow === null ? null : {
      surface: "PORTFOLIO", id: portfolioId, environment, window: navWindow, groupBy: [groupBy], limit: 1,
      ...(ready?.workspaceId ? { workspaceId: ready.workspaceId } : {}),
    };
  const flowOn = (environment: Environment): boolean => enabled && visited.allocations && ready !== null && servesDataset(api) && present.includes(environment);
  const flows = {
    live: { statements: useManagerDataset(api, flowOn("live"), flowQuery("live", "portfolio_id")), alphas: useManagerDataset(api, flowOn("live"), flowQuery("live", "alpha_id")) },
    paper: { statements: useManagerDataset(api, flowOn("paper"), flowQuery("paper", "portfolio_id")), alphas: useManagerDataset(api, flowOn("paper"), flowQuery("paper", "alpha_id")) },
    sandbox: { statements: useManagerDataset(api, flowOn("sandbox"), flowQuery("sandbox", "portfolio_id")), alphas: useManagerDataset(api, flowOn("sandbox"), flowQuery("sandbox", "alpha_id")) },
  };

  const ledgers = {
    live: useRead(api, enabled && (visited.allocations || selected === "live") && present.includes("live"), `ledger|${portfolioId}|live`, (scoped) => scoped.getCapitalLedger(portfolioId, "live")),
    paper: useRead(api, enabled && (visited.allocations || selected === "paper") && present.includes("paper"), `ledger|${portfolioId}|paper`, (scoped) => scoped.getCapitalLedger(portfolioId, "paper")),
    sandbox: useRead(api, enabled && (visited.allocations || selected === "sandbox") && present.includes("sandbox"), `ledger|${portfolioId}|sandbox`, (scoped) => scoped.getCapitalLedger(portfolioId, "sandbox")),
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

  return { resource, capital, chart, nav, pnl, ret, served, flows, dataset, contributors, ledgers, correlation, operations, selected, range, present };
}

export type PortfolioReads = ReturnType<typeof usePortfolioReads>;
