/**
 * Portfolio 360 model, pure: what the resource, the capital derivation, the
 * ledger, the chart and the correlation say, turned into what the tabs print.
 * Includes the L1 state matrix of the capital derivation and the L3 negatives
 * for the readers this screen depends on.
 */
import { describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../../e2e/bffDoublePortfolios";
import { readCapitalLedger, readCorrelation, type Correlation } from "../../../../analytics";
import { readPortfolioCapital } from "../../../../api/derivations";
import { readFinancialChart } from "../../../../api/financialChart";
import { readProfileEnvelope, type ProfileEnvelope } from "../../../../api/profileRead";
import { readUtcEpochMs } from "../../../../screenDataContract";
import type { SeriesPoint } from "../../../charts";
import { cartesian, dimension, dimensionOf, type Draft } from "../../../testkit/matrix";
import { loadCanonical } from "../../../testkit/loadCanonical";
import { decimalCases, enumCases, leaked, mutated, rootCases, stringCases } from "../../../testkit/negative";
import {
  capitalRows, chartState, contributionByCurrency, correlationView, derivationStatus, environmentDomain, environmentsOf, equitySeries, groupAlphas,
  ledgerIsEmpty, ledgerRows, readAccounts, unreadEntries, readDeployments, readIdentity, serverEnvelope, withGaps,
} from "./model";

const ask = (path: string, query = "") => answerPortfolios("GET", path, query)!.body;
const resource = (id: string): ProfileEnvelope => readProfileEnvelope(ask(`/resources/portfolios/${id}`))!;
const t = (ms: number) => readUtcEpochMs(ms)!;

describe("identity", () => {
  it("reads the identity the resource published and keeps the allocation as the server summed it", () => {
    expect(readIdentity(resource(PF.core), PF.core)).toEqual({
      portfolioId: PF.core, name: "Core", owner: "M. Tran", baseCurrency: "USDT", state: "ACTIVE", stateKind: "ok", stateLabel: "Active",
      holdingsCount: 5, allocationByCurrency: [{ currency: "USDT", value: "540000.00" }],
    });
  });

  it("is null when the resource carries no portfolio object, never a made-up one", () => {
    expect(readIdentity(resource("pf_somebody_else"), "pf_somebody_else")).toBeNull();
  });

  it("treats an UNKNOWN base currency as not published, and any state but ACTIVE as not ok", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.portfolio.base_currency = "UNKNOWN";
    raw.data.portfolio.state = "PAUSED";
    const identity = readIdentity(readProfileEnvelope(raw)!, PF.core)!;
    expect(identity.baseCurrency).toBeNull();
    expect(identity.stateKind).toBe("paused");
    raw.data.portfolio.state = "ARCHIVING";
    expect(readIdentity(readProfileEnvelope(raw)!, PF.core)!.stateKind).toBe("neutral");
    delete raw.data.portfolio.state;
    expect(readIdentity(readProfileEnvelope(raw)!, PF.core)!).toMatchObject({ state: null, stateKind: "unknown" });
  });

  it("drops an allocation entry that is not a currency and a string, instead of reading it as zero", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.portfolio.allocation_by_currency = [{ currency: "USDT", value: 540000 }, { currency: "", value: "1" }, { value: "2" }, { currency: "JPY", value: "7" }];
    expect(readIdentity(readProfileEnvelope(raw)!, PF.core)!.allocationByCurrency).toEqual([{ currency: "JPY", value: "7" }]);
  });
});

describe("environments and domains", () => {
  it("lists the books the portfolio has, live first, from coverage and from its deployments", () => {
    const core = resource(PF.core);
    expect(environmentsOf(core, readDeployments(core))).toEqual(["live", "paper"]);
    const yen = resource(PF.yen);
    expect(environmentsOf(yen, readDeployments(yen))).toEqual(["paper"]);
  });

  it("falls back to the selected environment, and to nothing, rather than to a default book", () => {
    const bare = resource("pf_somebody_else");
    expect(environmentsOf({ ...bare, selectedEnvironment: null }, [])).toEqual([]);
    expect(environmentsOf({ ...bare, selectedEnvironment: "sandbox" }, [])).toEqual(["sandbox"]);
  });

  it("calls live Real-funded and paper and sandbox Simulated, and nothing else", () => {
    expect(environmentDomain("live")).toBe("real");
    expect(environmentDomain("paper")).toBe("simulated");
    expect(environmentDomain("sandbox")).toBe("simulated");
  });
});

describe("deployments, alphas, contribution", () => {
  const core = resource(PF.core);
  const deployments = readDeployments(core);

  it("joins each deployment to its alpha's label, version and owner", () => {
    const d = deployments.find((x) => x.deploymentId === "live-0192")!;
    expect(d).toMatchObject({ alphaLabel: "BTC-Trend", version: "v3", owner: "asmith", stage: "LIVE", environment: "live", domain: "real", accountId: "Binance-02", currency: "USDT", allocation: "120000.00", positionPnl: "3300.00", exposure: "114100.00", healthKind: "ok", healthLabel: "Ready" });
    expect(deployments.find((x) => x.deploymentId === "pap-0301")).toMatchObject({ domain: "simulated", environment: "paper", positionPnl: "-410.00" });
  });

  it("maps health words without turning an unknown one into ok", () => {
    const byId = Object.fromEntries(deployments.map((d) => [d.deploymentId, d]));
    expect(byId["live-0193"]).toMatchObject({ healthKind: "attention", healthLabel: "Needs attention" });
    expect(byId["live-0210"]).toMatchObject({ healthKind: "partial", healthLabel: "Finding open" });
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.deployments[0].health = "SOMETHING_NEW";
    delete raw.data.deployments[1].health;
    const read = readDeployments(readProfileEnvelope(raw)!);
    expect(read.find((d) => d.deploymentId === "live-0192")).toMatchObject({ healthKind: "unknown", healthLabel: "Something new" });
    expect(read.find((d) => d.deploymentId === "live-0193")).toMatchObject({ healthKind: "unknown", healthLabel: "Health not published" });
  });

  it("falls back to the strategy id when the strategy row is missing, and says the alpha is not published when both are", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.strategies = [];
    delete raw.data.deployments[1].strategy_id;
    const read = readDeployments(readProfileEnvelope(raw)!);
    expect(read.find((d) => d.deploymentId === "live-0192")!.alphaLabel).toBe("strat_btc");
    expect(read.find((d) => d.deploymentId === "live-0193")!.alphaLabel).toBe("Alpha not published");
  });

  it("sorts by alpha then deployment and groups into four alphas without any money", () => {
    const groups = groupAlphas(deployments);
    expect(groups.map((g) => g.label)).toEqual(["BTC-Trend", "ETH-Mean", "Funding-Carry", "SOL-Breakout"]);
    expect(groups[0].deployments.map((d) => d.deploymentId)).toEqual(["live-0192", "live-0193"]);
    expect(Object.keys(groups[0])).toEqual(["key", "strategyId", "label", "version", "owner", "deployments"]);
  });

  it("builds contribution per currency with each deployment's own string, never a total", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.deployments[4].currency = "JPY";
    const groups = contributionByCurrency(readDeployments(readProfileEnvelope(raw)!));
    expect(groups.map((g) => g.currency)).toEqual(["JPY", "USDT"]);
    expect(groups[1].rows.map((r) => r.value)).toEqual(["3300.00", "2120.10", "3890.12", "410.00"]);
    expect(groups[0].rows).toEqual([{ id: "pap-0301", label: "Funding-Carry · pap-0301", value: "-410.00" }]);
    expect(JSON.stringify(groups)).not.toMatch(/9720|total/i);
  });

  it("leaves a deployment with no currency out of contribution instead of guessing one", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    delete raw.data.deployments[0].currency;
    const ids = contributionByCurrency(readDeployments(readProfileEnvelope(raw)!)).flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).not.toContain("live-0192");
  });
});

describe("accounts", () => {
  const core = resource(PF.core);
  const accounts = readAccounts(core, readDeployments(core));

  it("lists each account once, with how many of THIS portfolio's deployments it serves", () => {
    expect(accounts.map((a) => [a.accountId, a.servesHere])).toEqual([["Binance-02", 2], ["OKX-01", 1], ["Bybit-01", 1], ["Paper-Binance", 1]].sort(([a], [b]) => String(a).localeCompare(String(b))));
  });

  it("keeps a balance per account and currency as published, and the latest when it repeats", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.account_balances.push({ account_id: "Binance-02", currency: "USDT", total: "1.00", free: "1.00", locked: "0.00", updated_at: "2026-10-18T00:00:00Z" });
    raw.data.account_balances.push({ account_id: "Binance-02", currency: "BTC", total: "2", free: "2", locked: "0", updated_at: "2026-10-01T00:00:00Z" });
    const read = readAccounts(readProfileEnvelope(raw)!, readDeployments(readProfileEnvelope(raw)!));
    const binance = read.find((a) => a.accountId === "Binance-02")!;
    expect(binance.balances.map((b) => [b.currency, b.total])).toEqual([["BTC", "2"], ["USDT", "1.00"]]);
  });

  it("reads sync and findings: stale is stale, a relation not carried is unknown and not zero", () => {
    expect(accounts.find((a) => a.accountId === "Binance-02")).toMatchObject({ syncKind: "stale", syncLabel: "Stale", openFindings: 1 });
    expect(accounts.find((a) => a.accountId === "OKX-01")).toMatchObject({ syncKind: "ok", syncLabel: "Synced", openFindings: 0 });
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    delete raw.data.reconciliation;
    delete raw.data.account_sync;
    const read = readAccounts(readProfileEnvelope(raw)!, readDeployments(readProfileEnvelope(raw)!));
    expect(read.every((a) => a.openFindings === null)).toBe(true);
    expect(read.every((a) => a.syncKind === "unknown" && a.syncLabel === "Sync not published" && a.lastSyncedAt === null)).toBe(true);
  });

  it("does not call a failed sync ok", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.account_sync[1].status = "FAILED";
    const read = readAccounts(readProfileEnvelope(raw)!, readDeployments(readProfileEnvelope(raw)!));
    expect(read.filter((a) => a.syncLabel === "Failed").every((a) => a.syncKind === "rejected")).toBe(true);
  });

  it("adds an account only the deployments name, with nothing invented about it", () => {
    const raw = ask(`/resources/portfolios/${PF.core}`) as Draft;
    raw.data.accounts = [];
    raw.data.account_balances = [];
    const read = readAccounts(readProfileEnvelope(raw)!, readDeployments(readProfileEnvelope(raw)!));
    expect(read).toHaveLength(4);
    expect(read[0]).toMatchObject({ balances: [], profile: null, baseCurrency: null });
  });
});

describe("capital derivation · L1 state matrix", () => {
  const base = ask(`/derivations/portfolios/${PF.core}/capital`, "environment=live") as Draft;
  const states = ["READY", "PARTIAL", "EMPTY", "UNAVAILABLE", "DENIED", "SOMETHING_ELSE"];
  const axes = [
    dimension("state", ["state"], states),
    dimension("reason", ["reason_code"], [null, "MARGIN_BALANCES_NOT_PUBLISHED"]),
    dimensionOf("allocation", [
      { label: "usdt", apply: () => undefined },
      { label: "none", apply: (d: Draft) => { d.data.allocation_by_currency = []; } },
      { label: "value absent", apply: (d: Draft) => { delete d.data.allocation_by_currency[0].max_capital; } },
    ]),
    dimensionOf("balance", [
      { label: "usdt", apply: () => undefined },
      { label: "none", apply: (d: Draft) => { d.data.account_balance_by_currency = []; } },
      { label: "second currency", apply: (d: Draft) => { d.data.account_balance_by_currency.push({ currency: "JPY", population: "1", total: "7", free: "5", locked: "2" }); } },
    ]),
  ];
  const all = cartesian(base, axes);

  it("maps every derivation state to one panel status, and an unknown word is unavailable, never ok", () => {
    expect(all).toHaveLength(6 * 2 * 3 * 3);
    for (const { value } of all) {
      const read = readPortfolioCapital(value)!;
      const status = derivationStatus(read.state);
      expect(status === "ok").toBe(value.state === "READY");
      if (value.state === "SOMETHING_ELSE") expect(status).toBe("unavailable");
    }
  });

  it("carries one row per currency, each figure the published string or null, and never a sum", () => {
    for (const { name, value } of all) {
      const rows = capitalRows(readPortfolioCapital(value)!.data);
      const currencies = new Set([...value.data.allocation_by_currency, ...value.data.account_balance_by_currency].map((b: Draft) => b.currency));
      expect([name, rows.map((r) => r.currency).sort()]).toEqual([name, [...currencies].sort()]);
      for (const row of rows) {
        const a = value.data.allocation_by_currency.find((b: Draft) => b.currency === row.currency);
        const b = value.data.account_balance_by_currency.find((x: Draft) => x.currency === row.currency);
        expect(row.allocated).toBe(a?.allocated_capital ?? null);
        expect(row.max).toBe(a?.max_capital ?? null);
        expect(row.balanceTotal).toBe(b?.total ?? null);
        expect(row.balanceLocked).toBe(b?.locked ?? null);
      }
    }
  });
});

describe("ledger", () => {
  const ledger = readCapitalLedger(ask(`/portfolios/${PF.core}/capital-ledger`, "environment=live"))!;

  it("lists entries newest first with the movement and direction words, and keeps before and after as published", () => {
    const rows = ledgerRows(ledger);
    expect(rows.map((r) => r.entry.ledgerId)).toEqual(["ledger-12", "ledger-11", "ledger-10", "ledger-9", "ledger-8"]);
    expect(rows[0]).toMatchObject({ currency: "USDT", movement: "Withdraw", direction: "Decrease" });
    expect(rows[0].entry).toMatchObject({ amount: "20000.00", beforeAllocated: "140000.00", afterAllocated: "120000.00" });
    expect(rows[2].direction).toBe("Unchanged");
    expect(rows[4].movement).toBe("Initial allocation");
  });

  it("puts an entry with no instant after the dated ones and does not date it", () => {
    const raw = ask(`/portfolios/${PF.core}/capital-ledger`, "environment=live") as Draft;
    raw.analytics.data.buckets[0].entries[0].occurred_at = null;
    const rows = ledgerRows(readCapitalLedger(raw)!);
    expect(rows[rows.length - 1].entry.ledgerId).toBe("ledger-12");
    expect(rows[rows.length - 1].entry.occurredAt).toBeNull();
  });

  it("counts a returned entry the reader could not read, so a lost movement is said and not silent", () => {
    expect(unreadEntries(ledger)).toBe(0);
    const raw = ask(`/portfolios/${PF.core}/capital-ledger`, "environment=live") as Draft;
    raw.analytics.data.buckets[0].entries[0].movement_type = "SWEEP_TO_COLD";
    raw.analytics.data.buckets[0].entries[1].direction = "SIDEWAYS";
    const read = readCapitalLedger(raw)!;
    expect(ledgerRows(read).map((r) => r.entry.ledgerId)).toEqual(["ledger-10", "ledger-9", "ledger-8"]);
    expect(unreadEntries(read)).toBe(2);
    delete raw.analytics.data.returned_entry_count;
    expect(unreadEntries(readCapitalLedger(raw)!)).toBeNull();
  });

  it("keeps a second currency in its own rows, and an empty ledger is empty, not zero", () => {
    const raw = ask(`/portfolios/${PF.core}/capital-ledger`, "environment=live") as Draft;
    raw.analytics.data.buckets.push({ currency: "JPY", gross_increase: "5", gross_decrease: "0", entries: [{ ...raw.analytics.data.buckets[0].entries[0], ledger_id: "jpy-1", amount: "5" }] });
    const rows = ledgerRows(readCapitalLedger(raw)!);
    expect(rows.filter((r) => r.currency === "JPY")).toHaveLength(1);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    const empty = readCapitalLedger(ask(`/portfolios/${PF.core}/capital-ledger`, "environment=paper"))!;
    expect(ledgerIsEmpty(empty)).toBe(true);
    expect(ledgerRows(empty)).toEqual([]);
    expect(ledgerIsEmpty(ledger)).toBe(false);
  });
});

describe("equity chart", () => {
  const chart = (id: string, query = "") => readFinancialChart(ask("/views/equity-chart", `subject_kind=portfolio&subject_id=${id}&environment=live&metric=equity${query}`))!;
  const point = (ms: number, v: string | null): SeriesPoint => ({ t: t(ms), v });

  it("puts a null point inside a published gap and nowhere else", () => {
    const points = [point(1000, "1.00"), point(2000, "2.00"), point(9000, "3.00"), point(10_000, "4.00")];
    const out = withGaps(points, [{ fromMs: 2000, toMs: 9000 }]);
    expect(out.map((p) => [p.t, p.v])).toEqual([[1000, "1.00"], [2000, "2.00"], [5500, null], [9000, "3.00"], [10_000, "4.00"]]);
  });

  it("marks a gap between adjacent points, ignores one before the first point, and draws a repeated gap once", () => {
    const points = [point(1000, "1.00"), point(2000, "2.00"), point(3000, "3.00")];
    // Two adjacent published points with a declared gap between them: the gap is marked, not the points.
    expect(withGaps(points, [{ fromMs: 1000, toMs: 2000 }]).map((p) => p.v)).toEqual(["1.00", null, "2.00", "3.00"]);
    expect(withGaps(points, [{ fromMs: -5000, toMs: 500 }])).toEqual(points);
    const twice = withGaps(points, [{ fromMs: 1000, toMs: 2000 }, { fromMs: 1000, toMs: 2000 }]);
    expect(twice.filter((p) => p.v === null)).toHaveLength(1);
    expect(withGaps(points, [])).toBe(points);
  });

  it("reads Core into one USDT series with the gap as one null and strictly increasing time", () => {
    const [series] = equitySeries(chart(PF.core));
    expect(series.currency).toBe("USDT");
    expect(series.points.filter((p) => p.v === null)).toHaveLength(1);
    expect(series.points.every((p, i) => i === 0 || p.t > series.points[i - 1].t)).toBe(true);
    expect(series.unreadable).toBe(0);
    expect(series.points.filter((p) => p.v !== null).every((p) => /^-?\d+\.\d{2}$/.test(p.v!))).toBe(true);
  });

  it("counts a point it cannot read instead of drawing it as zero", () => {
    const raw = ask("/views/equity-chart", `subject_kind=portfolio&subject_id=${PF.core}&environment=live&metric=equity`) as Draft;
    const points = raw.panel.data.series[0].points;
    points[3][1] = "1e5";
    points[4][1] = "01";
    points[5][0] = 1.5;
    const [series] = equitySeries(readFinancialChart(raw)!);
    expect(series.unreadable).toBeGreaterThanOrEqual(2);
    expect(series.points.some((p) => p.v === "1e5" || p.v === "01")).toBe(false);
  });

  it("maps the chart's state to the chart's: only READY draws without a flag, and a refusal prints its reason code", () => {
    expect(chartState({ ...chart(PF.yen), state: "READY" })).toEqual({ kind: "ready" });
    expect(chartState(chart(PF.core))).toEqual({ kind: "partial", reason: "Retained snapshot gap" });
    expect(chartState({ ...chart(PF.core), state: "STALE", reasonCode: null })).toEqual({ kind: "stale", reason: "Stale series" });
    expect(chartState(chart(PF.satellite))).toEqual({ kind: "unavailable", copy: "Not available", reason: "No equity snapshots for subject" });
    expect(chartState({ ...chart(PF.core), state: "WHATEVER", reasonCode: null })).toMatchObject({ kind: "unavailable" });
  });

  it("repeats the server's own reduction, and says nothing when it sent none or contradicted itself", () => {
    expect(serverEnvelope(chart(PF.core))).toEqual({ sourceCount: 4592, shownCount: 40, method: "MIN_MAX_LAST_BUCKET_V1", keepsExtrema: true });
    expect(serverEnvelope(chart(PF.satellite))).toBeNull();
    const raw = chart(PF.core);
    expect(serverEnvelope({ ...raw, sampling: { ...raw.sampling!, preservesExtrema: null } })!.keepsExtrema).toBe(false);
    expect(serverEnvelope({ ...raw, sampling: { ...raw.sampling!, sourceRows: "5" } })).toBeNull();
    expect(serverEnvelope({ ...raw, sampling: { ...raw.sampling!, sourceRows: "many" } })).toBeNull();
  });
});

describe("correlation", () => {
  const packed = (values: string[], labels: string[]): Correlation => ({
    kind: "PACKED_MATRIX", portfolioId: "p", labels: labels.map((id) => ({ entityId: id, displayName: id.toUpperCase() })), clusters: [], dimension: labels.length,
    values: values as never, sampleCounts: null,
  });

  it("lists the strongest pairs of a packed matrix by magnitude, diagonal excluded, each once", () => {
    const view = correlationView(packed(["1", "0.2", "1", "-0.9", "0.1", "1"], ["a", "b", "c"]));
    expect(view.entities).toBe(3);
    expect(view.pairCount).toBe(3);
    expect(view.pairs.map((p) => [p.left, p.right, p.coefficient])).toEqual([["C", "A", "-0.9"], ["B", "A", "0.2"], ["C", "B", "0.1"]]);
  });

  it("caps the list and says how many pairs exist", () => {
    const n = 8;
    const values: string[] = [];
    for (let row = 0; row < n; row += 1) for (let col = 0; col <= row; col += 1) values.push(row === col ? "1" : `0.${row}${col}`);
    const view = correlationView(packed(values, Array.from({ length: n }, (_, i) => `e${i}`)), 5);
    expect(view.pairCount).toBe(28);
    expect(view.pairs).toHaveLength(5);
  });

  it("reads ranked pairs as published and the canonical fixture without change", () => {
    const canonical = readCorrelation(loadCanonical("execution-analytics.correlation"))!;
    const view = correlationView(canonical);
    expect(view.pairs.length).toBeGreaterThan(0);
    for (const pair of view.pairs) expect(pair.coefficient).toMatch(/^-?\d+(\.\d+)?$/);
  });

  it("carries a sample count only when the source sent one", () => {
    const matrix = { ...packed(["1", "0.3", "1"], ["a", "b"]), sampleCounts: [10, 7, 10] };
    expect(correlationView(matrix).pairs[0].samples).toBe(7);
    expect(correlationView(packed(["1", "0.3", "1"], ["a", "b"])).pairs[0].samples).toBeNull();
  });
});

describe("L3 · readers this screen depends on", () => {
  const LEDGER_AMOUNT = ["analytics", "data", "buckets", 0, "entries", 0, "amount"] as const;
  const ledger = ask(`/portfolios/${PF.core}/capital-ledger`, "environment=live");

  it("never throws on a ledger, a capital derivation, a chart or a resource it is given wrong", () => {
    const capital = ask(`/derivations/portfolios/${PF.core}/capital`, "environment=live");
    const chart = ask("/views/equity-chart", `subject_kind=portfolio&subject_id=${PF.core}&environment=live`);
    const bad = [
      ...decimalCases(ledger, LEDGER_AMOUNT).map((c) => c.value),
      ...stringCases(ledger, ["analytics", "data", "buckets", 0, "currency"]).map((c) => c.value),
      ...decimalCases(capital, ["data", "allocation_by_currency", 0, "allocated_capital"]).map((c) => c.value),
      ...enumCases(capital, ["state"], ["READY", "PARTIAL", "EMPTY"]).map((c) => c.value),
      ...decimalCases(chart, ["panel", "data", "series", 0, "points", 0, 1]).map((c) => c.value),
      ...stringCases(chart, ["panel", "state"]).map((c) => c.value),
      ...rootCases().map((c) => c.value),
    ];
    const threw: number[] = [];
    bad.forEach((value, i) => {
      try {
        readCapitalLedger(value);
        readPortfolioCapital(value);
        readFinancialChart(value);
        readProfileEnvelope(value);
        readCorrelation(value);
      } catch {
        threw.push(i);
      }
    });
    expect(bad.length).toBeGreaterThan(100);
    expect(threw).toEqual([]);
  });

  it("an amount the ledger reader refuses never reaches a row, and the probe never reaches the model", () => {
    const leaks: string[] = [];
    for (const c of decimalCases(ledger, LEDGER_AMOUNT)) {
      const read = readCapitalLedger(c.value);
      if (read === null) continue;
      const rows = ledgerRows(read);
      if (leaked(rows.map((r) => r.entry.amount), c.probe)) leaks.push(c.name);
    }
    expect(leaks).toEqual([]);
  });

  it("a ledger with a non-numeric amount drops that entry rather than the whole book", () => {
    const base = ledger as Draft;
    const read = readCapitalLedger(mutated(base, LEDGER_AMOUNT, "not a number"));
    expect(read === null || ledgerRows(read).length === 4).toBe(true);
  });

  it("a chart point with a float, an exponent or a leading zero is counted unreadable and never drawn", () => {
    const chart = ask("/views/equity-chart", `subject_kind=portfolio&subject_id=${PF.core}&environment=live`) as Draft;
    for (const value of ["1e5", "01", "-0", ".5", "1,000"]) {
      const out = mutated(chart, ["panel", "data", "series", 0, "points", 0, 1], value);
      const read = readFinancialChart(out);
      if (read === null) continue;
      const [series] = equitySeries(read);
      expect(series.points.map((p) => p.v)).not.toContain(value);
      expect(series.unreadable).toBeGreaterThanOrEqual(1);
    }
  });
});
