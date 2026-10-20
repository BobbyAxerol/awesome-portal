/**
 * Test harness for the Portfolios, Portfolio 360 and Compare suites: an
 * ExecutionApi whose reads go through the REAL readers, fed by the Playwright
 * double (`e2e/bffDoublePortfolios.ts`) or by an override. Tests only: product
 * code never imports a `*.fixtures` file.
 */
import { answerPortfolios, type BffAnswerPortfolios } from "../../../../../e2e/bffDoublePortfolios";
import { readAnalyticsFailure, analyticsFailureReason } from "../../../analyticsProblem";
import { readAnalyticsEnvelope, readCapitalLedger, readCorrelation } from "../../../analytics";
import { readPortfolioCapital } from "../../../api/derivations";
import { financialChartPath, readFinancialChart } from "../../../api/financialChart";
import type { ExecutionApi, Result } from "../../../api/ports";
import { readPortfolioList, readProfileEnvelope } from "../../../api/profileRead";
import { readOperationalQueueV2 } from "../../readers/operationalQueue";
import { encodeManagerSeriesQuery, readManagerSeries, seriesAnswersQuery } from "../../readers/managerSeries";
import { seriesBodyFor } from "../series/seriesDouble.testbase";

export type Override = (method: string, path: string, search: URLSearchParams) => BffAnswerPortfolios | null | undefined;

export interface Harness {
  api: ExecutionApi;
  /** `GET /path?query` for every read made, in order. */
  calls: string[];
  /** The query of every read of one path, parsed. */
  queriesOf(path: string): URLSearchParams[];
}

function unreadable<T>(what: string): Result<T> {
  return { ok: false, status: "unavailable", reason: `${what} response could not be read.` };
}

function transport<T>(answer: BffAnswerPortfolios, what: string): Result<T> | null {
  if (answer.status === 200) return null;
  return { ok: false, status: answer.status === 403 ? "denied" : "unavailable", reason: `${what}: HTTP ${answer.status}` };
}

function analyticsFailed<T>(answer: BffAnswerPortfolios): Result<T> | null {
  if (answer.status === 200) return null;
  const failure = readAnalyticsFailure(answer.body, answer.status);
  return { ok: false, status: failure.panelStatus, reason: analyticsFailureReason(failure) };
}

export function makeApi(override?: Override): Harness {
  const calls: string[] = [];
  const queries: { path: string; search: URLSearchParams }[] = [];
  const ask = (path: string, search = new URLSearchParams()): BffAnswerPortfolios => {
    calls.push(`GET ${path}${search.toString() ? `?${search.toString()}` : ""}`);
    queries.push({ path, search });
    return override?.("GET", path, search) ?? answerPortfolios("GET", path, search) ?? { status: 501, body: { error: { code: "NOT_IN_DOUBLE", path } } };
  };
  const api = {
    async listPortfolios() {
      const answer = ask("/portfolios");
      const failed = transport<ReturnType<typeof readPortfolioList> & object>(answer, "The portfolio register");
      if (failed) return failed;
      const value = readPortfolioList(answer.body);
      return value ? { ok: true as const, value } : unreadable("The portfolio register");
    },
    async getPortfolio360Resource(portfolioId: string) {
      const answer = ask(`/resources/portfolios/${encodeURIComponent(portfolioId)}`);
      const failed = transport<NonNullable<ReturnType<typeof readProfileEnvelope>>>(answer, "The portfolio resource");
      if (failed) return failed;
      const value = readProfileEnvelope(answer.body);
      return value ? { ok: true as const, value } : unreadable("The portfolio resource");
    },
    async getPortfolioCapital(portfolioId: string, environment: string) {
      const answer = ask(`/derivations/portfolios/${encodeURIComponent(portfolioId)}/capital`, new URLSearchParams({ environment }));
      const failed = transport<NonNullable<ReturnType<typeof readPortfolioCapital>>>(answer, "The capital derivation");
      if (failed) return failed;
      const value = readPortfolioCapital(answer.body);
      return value ? { ok: true as const, value } : unreadable("The capital derivation");
    },
    async getFinancialChart(query: Parameters<ExecutionApi["getFinancialChart"]>[0]) {
      const [path, qs] = financialChartPath(query).split("?");
      const answer = ask(path, new URLSearchParams(qs));
      const failed = transport<NonNullable<ReturnType<typeof readFinancialChart>>>(answer, "The equity chart");
      if (failed) return failed;
      const value = readFinancialChart(answer.body);
      return value ? { ok: true as const, value } : unreadable("The equity chart");
    },
    async getCapitalLedger(portfolioId: string, environment?: string) {
      const answer = ask(`/portfolios/${encodeURIComponent(portfolioId)}/capital-ledger`, new URLSearchParams(environment ? { environment } : {}));
      const failed = analyticsFailed<{ ledger: NonNullable<ReturnType<typeof readCapitalLedger>>; envelope: NonNullable<ReturnType<typeof readAnalyticsEnvelope>> }>(answer);
      if (failed) return failed;
      const ledger = readCapitalLedger(answer.body);
      const envelope = readAnalyticsEnvelope(answer.body);
      return ledger && envelope ? { ok: true as const, value: { ledger, envelope } } : unreadable("The capital ledger");
    },
    async getCorrelation(portfolioId: string, environment?: string) {
      const answer = ask(`/portfolios/${encodeURIComponent(portfolioId)}/correlation`, new URLSearchParams(environment ? { environment } : {}));
      const failed = analyticsFailed<{ correlation: NonNullable<ReturnType<typeof readCorrelation>>; envelope: NonNullable<ReturnType<typeof readAnalyticsEnvelope>> }>(answer);
      if (failed) return failed;
      const correlation = readCorrelation(answer.body);
      const envelope = readAnalyticsEnvelope(answer.body);
      return correlation && envelope ? { ok: true as const, value: { correlation, envelope } } : unreadable("The correlation");
    },
    /** FE-013: the series route is in the double. Unless a test overrides it the backend answers as it does today: no series source is published. */
    async getManagerSeries(query: Parameters<ExecutionApi["getManagerSeries"]>[0]) {
      const search = new URLSearchParams(encodeManagerSeriesQuery(query) ?? {});
      const answer = override?.("GET", "/manager/series", search) ?? { status: 200, body: seriesBodyFor(search, "unavailable") };
      calls.push(`GET /manager/series?${search.toString()}`);
      queries.push({ path: "/manager/series", search });
      const failed = transport<NonNullable<ReturnType<typeof readManagerSeries>>>(answer, "The Manager series");
      if (failed) return failed;
      const read = readManagerSeries(answer.body);
      return read !== null && read.kind === "series" && seriesAnswersQuery(read.series, query) ? { ok: true as const, value: read.series } : unreadable("The Manager series");
    },
    async listOperationalQueueV2(query: Parameters<ExecutionApi["listOperationalQueueV2"]>[0]) {
      const search = new URLSearchParams();
      if (query.targetType) search.set("target_type", query.targetType);
      if (query.targetId) search.set("target_id", query.targetId);
      if (query.limit) search.set("limit", String(query.limit));
      const answer = ask("/operations", search);
      const failed = transport<NonNullable<ReturnType<typeof readOperationalQueueV2>>>(answer, "The operations queue");
      if (failed) return failed;
      const value = readOperationalQueueV2(answer.body);
      return value ? { ok: true as const, value } : unreadable("The operations queue");
    },
  } as unknown as ExecutionApi;
  return {
    api,
    calls,
    queriesOf: (path) => queries.filter((q) => q.path === path).map((q) => q.search),
  };
}
