/**
 * The Playwright double's portfolio answers must be responses the real readers
 * accept, stay inside the published schema where one exists, and be sparse the
 * way the real source is: nulls, an empty allocation, a truncated list, one
 * partial and one refused read.
 */
import { describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../e2e/bffDoublePortfolios";
import { readCapitalLedger, readCorrelation } from "../../../analytics";
import { readPortfolioCapital } from "../../../api/derivations";
import { readFinancialChart } from "../../../api/financialChart";
import { readPortfolioList, readProfileEnvelope } from "../../../api/profileRead";
import { readOperationalQueueV2 } from "../../readers/operationalQueue";
import { canonicalDigest, loadCanonical, loadSchema } from "../../testkit/loadCanonical";
import { validateAgainst } from "../../testkit/schema";
import { compareDecimal } from "../../charts/decimal";
import { readDeployments, readIdentity } from "./portfolio/model";

const LIST = "execution-portfolio-list.valid.json";
const digestBefore = canonicalDigest(LIST);

const ask = (path: string, query = "") => {
  const answer = answerPortfolios("GET", `/api/v1/execution${path}`, query);
  if (answer === null) throw new Error(`the double did not answer ${path}`);
  return answer;
};

describe("GET /portfolios", () => {
  const answer = ask("/portfolios");

  it("passes the published schema and the real reader", () => {
    expect(answer.status).toBe(200);
    const body = answer.body as { items: unknown[]; environments: Record<string, unknown> };
    // The testkit checker does not know `minProperties`, which the envelope's `environments` uses: the
    // envelope is checked for its required keys, and every item and branch against its own definition.
    const defs = loadSchema("execution-portfolio-list.v1").$defs as Record<string, { required: string[] }>;
    expect(defs.PortfolioListResponse.required.filter((key) => !(key in body))).toEqual([]);
    for (const item of body.items) expect(validateAgainst("execution-portfolio-list.v1", "/$defs/PortfolioListItem", item)).toEqual([]);
    for (const branch of Object.values(body.environments)) expect(validateAgainst("execution-portfolio-list.v1", "/$defs/EnvironmentBranch", branch)).toEqual([]);
    expect(readPortfolioList(answer.body)).not.toBeNull();
  });

  it("is a sparse profile: two currencies, one empty allocation, a truncated read with no cursor", () => {
    const list = readPortfolioList(answer.body)!;
    expect(list.items.length).toBeGreaterThanOrEqual(4);
    expect(list.items.length).toBeLessThanOrEqual(6);
    expect(new Set(list.items.map((i) => i.baseCurrency).filter((c) => c !== "UNKNOWN"))).toEqual(new Set(["USDT", "JPY"]));
    expect(list.items.some((i) => i.allocatedByCurrency.length === 0 && i.portfolioId !== PF.unallocated)).toBe(true);
    expect(list.items.some((i) => i.owner === null)).toBe(true);
    expect(list.truncated).toBe(true);
    expect(list.totalPortfolios).toBeGreaterThan(list.items.length);
    expect(list.items.some((i) => i.portfolioId === PF.unallocated)).toBe(true);
    expect(Object.values(list.environmentBranches).some((b) => b.state === "PARTIAL")).toBe(true);
  });

  it("holds a portfolio whose single allocation figure spans Real-funded and Simulated books", () => {
    const core = readPortfolioList(answer.body)!.items.find((i) => i.portfolioId === PF.core)!;
    expect(core.environments).toEqual(expect.arrayContaining(["live", "paper"]));
  });

  it("accepts a query string and the stripped path, and answers only GET", () => {
    expect(answerPortfolios("GET", "/portfolios", "")?.status).toBe(200);
    expect(answerPortfolios("GET", "/portfolios", new URLSearchParams())?.status).toBe(200);
    expect(answerPortfolios("POST", "/portfolios")).toBeNull();
    expect(answerPortfolios("GET", "/api/v1/execution/alphas")).toBeNull();
  });

  it("leaves the canonical fixture untouched", () => {
    expect(canonicalDigest(LIST)).toBe(digestBefore);
    expect(loadCanonical<{ items: unknown[] }>(LIST).items).toHaveLength(2);
  });
});

describe("GET /resources/portfolios/{id}", () => {
  const resource = (id: string) => readProfileEnvelope(ask(`/resources/portfolios/${id}`).body)!;

  it("serves a rich Core: 2 environments, 4 alphas, 5 deployments, a shared account", () => {
    const core = resource(PF.core);
    const deployments = readDeployments(core);
    expect(deployments).toHaveLength(5);
    expect(new Set(deployments.map((d) => d.strategyId)).size).toBe(4);
    expect(new Set(deployments.map((d) => d.environment))).toEqual(new Set(["live", "paper"]));
    const shared = deployments.filter((d) => d.accountId === "Binance-02");
    expect(shared).toHaveLength(2);
    expect(readIdentity(core, PF.core)).toMatchObject({ name: "Core", owner: "M. Tran", baseCurrency: "USDT", allocationByCurrency: [{ currency: "USDT", value: "540000.00" }] });
  });

  it("keeps the list's allocation and the resource's allocation as the same exact string", () => {
    const listed = readPortfolioList(ask("/portfolios").body)!.items.find((i) => i.portfolioId === PF.core)!;
    const identity = readIdentity(resource(PF.core), PF.core)!;
    expect(identity.allocationByCurrency).toEqual(listed.allocatedByCurrency);
  });

  it("serves an empty portfolio as identity with no allocation, a missing one as 404 and a broken one as 503", () => {
    const empty = readIdentity(resource(PF.empty), PF.empty)!;
    expect(empty.allocationByCurrency).toEqual([]);
    expect(empty.owner).toBeNull();
    expect(ask(`/resources/portfolios/${PF.missing}`).status).toBe(404);
    expect(ask(`/resources/portfolios/${PF.error}`).status).toBe(503);
  });

  it("serves a bare identity for an id it does not know, never a made-up book", () => {
    const bare = resource("pf_somebody_else");
    expect(readDeployments(bare)).toEqual([]);
    expect(bare.state).toBe("partial");
  });
});

describe("capital, ledger, correlation", () => {
  it("serves capital per environment in four states and every body reads", () => {
    const states = (["live", "paper", "sandbox"] as const).map((env) => readPortfolioCapital(ask(`/derivations/portfolios/${PF.core}/capital`, `environment=${env}`).body)!.state);
    expect(states).toEqual(["READY", "PARTIAL", "EMPTY"]);
    expect(readPortfolioCapital(ask(`/derivations/portfolios/${PF.yen}/capital`, "environment=paper").body)!.data.allocationByCurrency[0]?.currency).toBe("JPY");
    expect(ask(`/derivations/portfolios/${PF.core}/capital`, "").status).toBe(400);
  });

  it("serves a ledger with entries, a bounded one, and an empty one", () => {
    const live = readCapitalLedger(ask(`/portfolios/${PF.core}/capital-ledger`, "environment=live").body)!;
    expect(live.buckets[0]?.entries).toHaveLength(5);
    expect(live.bounded).toMatchObject({ total: 12, returned: 5, hasMore: true });
    const paper = readCapitalLedger(ask(`/portfolios/${PF.core}/capital-ledger`, "environment=paper").body)!;
    expect(paper.buckets).toEqual([]);
    expect(ask(`/portfolios/${PF.error}/capital-ledger`, "environment=live").status).toBe(503);
  });

  it("answers correlation with no data source, except one ranked or packed fixture", () => {
    expect(ask(`/portfolios/${PF.core}/correlation`, "environment=live").status).toBe(503);
    expect(readCorrelation(ask(`/portfolios/${PF.satellite}/correlation`).body)).not.toBeNull();
  });
});

describe("GET /views/equity-chart", () => {
  const chart = (id: string, extra = "") => readFinancialChart(ask("/views/equity-chart", `subject_kind=portfolio&subject_id=${id}&environment=live&metric=equity${extra}`).body)!;

  it("serves Core in USDT with a published gap, in strictly increasing time", () => {
    const payload = chart(PF.core);
    expect(payload.state).toBe("PARTIAL");
    expect(payload.series).toHaveLength(1);
    expect(payload.series[0].currency).toBe("USDT");
    const times = payload.series[0].points.map(([t]) => t);
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
    expect(payload.coverage.gaps).toHaveLength(1);
    const gap = payload.coverage.gaps[0];
    expect(times.some((t) => t > gap.fromMs && t < gap.toMs)).toBe(false);
    expect(payload.sampling).toMatchObject({ algorithm: "MIN_MAX_LAST_BUCKET_V1", preservesExtrema: true });
  });

  it("serves a second portfolio in another currency, and an honest UNAVAILABLE for the rest", () => {
    expect(chart(PF.yen).series[0].currency).toBe("JPY");
    const none = chart(PF.satellite);
    expect(none.state).toBe("UNAVAILABLE");
    expect(none.series).toEqual([]);
  });

  it("prints values as strings with a decimal point, never a float", () => {
    for (const [, v] of chart(PF.core).series[0].points) expect(v).toMatch(/^-?\d+\.\d{2}$/);
    const values = chart(PF.core).series[0].points.map(([, v]) => v as string);
    expect(values.every((v, i) => i === 0 || typeof compareDecimal(v, values[i - 1]) === "number")).toBe(true);
  });

  it("honours from_ms", () => {
    const all = chart(PF.core).series[0].points;
    const from = all[10][0];
    expect(chart(PF.core, `&from_ms=${from}`).series[0].points[0][0]).toBeGreaterThanOrEqual(from);
  });
});

describe("GET /operations", () => {
  it("is delegated for a portfolio target and ignored otherwise", () => {
    const answer = ask("/operations", `target_type=PORTFOLIO&target_id=${PF.core}`);
    const read = readOperationalQueueV2(answer.body);
    expect(read?.kind).toBe("queue");
    expect(answerPortfolios("GET", "/api/v1/execution/operations", "")).toBeNull();
  });
});
