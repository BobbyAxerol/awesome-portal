/**
 * Model: the published rows in, view models out. The canonical broker-360 body
 * and the Accounts double go through the real readers, then through the model,
 * so a drift in either is caught here and not on screen. L1 (state matrix) and
 * L3 (negative payloads) run through the shared testkit.
 */
import { describe, expect, it } from "vitest";

import { answerAccount } from "../../../../../e2e/bffDoubleAccount";
import type { BindingExposure } from "../../../analytics";
import { readFinancialChart } from "../../../api/financialChart";
import { readBindingExposure } from "../../../analytics";
import { readProfileEnvelope, type BindingItem } from "../../../api/profileRead";
import { readSubjectActivity } from "../../../api/subjectActivity";
import { readUtcEpochMs } from "../../../screenDataContract";
import { V2_ROLE_PRESETS, holds } from "../../shell/roleNav";
import { ABSENT, cartesian, dimension, dimensionOf, pairwise } from "../../testkit/matrix";
import { decimalCases, leaked, pollutionCases, requiredCases } from "../../testkit/negative";
import { loadCanonical } from "../../testkit/loadCanonical";
import {
  ACCOUNT_NEEDS, FE, PAGE_LIMIT, ROW_CAP, absentCodeFor, accountHref, activityRows, ageAtRead, updatedAgo, balanceFacts, bindingQuery, branchOf, brokerFacts,
  capitalRows, chooseCurrency, countMetric, coverageFlag, credentialView, deploymentHref, diffFacts, equityModel, freshnessFlag, headroomFacts,
  isNegative, ledgerPnl, marginFacts, matchesCredential, mergeBindings, metricOf, notPublished, notPublishedReason, populationOf, readAccountView,
  readCredentialFilter, readTab, readViewMode, resourceReason, resourceStatus, sleeveRows, stateView, syncView, timeOf, toBindingRow, triadModel,
  inScope, type AccountView,
} from "./model";

const ask = (path: string, query: Record<string, string> = {}) => answerAccount("GET", path, new URLSearchParams(query))!.body;
const profile = (id: string) => readProfileEnvelope(ask(`/resources/accounts/${id}`))!;
const canonicalProfile = () => readProfileEnvelope(loadCanonical("execution-account-broker-360.ready"))!;

describe("credential and state words", () => {
  it.each([
    ["SYNC_SYNCED", "ok", false],
    ["SYNC_STALE", "stale", true],
    ["EXPIRED", "attention", true],
    ["REVOKED", "attention", true],
    ["NOT_PUBLISHED", "unknown", false],
  ] as const)("%s is %s (issue %s)", (word, kind, issue) => {
    expect(credentialView(word)).toMatchObject({ kind, issue });
  });

  it("keeps ok, stale and bad credential three different flags", () => {
    const kinds = ["SYNC_SYNCED", "SYNC_STALE", "EXPIRED"].map((word) => credentialView(word).kind);
    expect(new Set(kinds).size).toBe(3);
  });

  it("does not pattern-match: a new word stays unknown with the source's spelling", () => {
    expect(credentialView("SYNC_ALL_GOOD")).toEqual({ kind: "unknown", label: "Sync all good", issue: false });
    expect(credentialView("sync_synced").kind).toBe("ok");
    expect(credentialView(null)).toMatchObject({ kind: "unknown", label: "Not available" });
    expect(credentialView("__proto__").kind).toBe("unknown");
    expect(stateView("ACTIVE").kind).toBe("ok");
    expect(stateView("SUSPENDED")).toMatchObject({ kind: "paused", issue: true });
    expect(stateView("constructor").kind).toBe("unknown");
  });

  it("maps sync words and freshness without borrowing the tick for a not-yet-good state", () => {
    expect(syncView("SYNCED").kind).toBe("applied");
    expect(syncView("PENDING").kind).toBe("pending");
    expect(syncView("STALE").kind).toBe("stale");
    expect(syncView("FAILED").kind).toBe("rejected");
    expect(syncView("??").kind).toBe("unknown");
    expect(freshnessFlag("STALE")).toEqual({ kind: "stale", label: "Stale" });
    expect(freshnessFlag("AGING").kind).toBe("partial");
    expect(freshnessFlag(null).kind).toBe("unknown");
  });
});

describe("the bindings list model", () => {
  const items: BindingItem[] = [
    { bindingId: "a@X", accountId: "a", venue: "X", state: "ACTIVE", credentialState: "SYNC_SYNCED", updatedAt: "2026-10-17T09:00:00.000Z" },
    { bindingId: "b@X", accountId: "b", venue: "X", state: "ACTIVE", credentialState: "SYNC_STALE", updatedAt: "2026-10-17T08:00:00.000Z" },
    { bindingId: "c@Y", accountId: "c", venue: "Y", state: "SUSPENDED", credentialState: "SYNC_SYNCED", updatedAt: "2026-10-17T07:00:00.000Z" },
  ];
  const rows = items.map(toBindingRow);

  it("marks a row an issue when the credential OR the state is one the source calls wrong", () => {
    expect(rows.map((r) => r.issue)).toEqual([false, true, true]);
    expect(rows.filter((r) => inScope(r, true)).map((r) => r.bindingId)).toEqual(["b@X", "c@Y"]);
    expect(rows.filter((r) => inScope(r, false))).toHaveLength(3);
  });

  it("the credential filter splits synced from the rest", () => {
    expect(rows.filter((r) => matchesCredential(r, "ok")).map((r) => r.bindingId)).toEqual(["a@X", "c@Y"]);
    expect(rows.filter((r) => matchesCredential(r, "attention")).map((r) => r.bindingId)).toEqual(["b@X"]);
    expect(rows.filter((r) => matchesCredential(r, null))).toHaveLength(3);
    expect(readCredentialFilter("attention")).toBe("attention");
    expect(readCredentialFilter("bogus")).toBeNull();
    expect(readCredentialFilter(null)).toBeNull();
  });

  it("a later page never repeats a row", () => {
    expect(mergeBindings(items.slice(0, 2), items.slice(1)).map((r) => r.bindingId)).toEqual(["a@X", "b@X", "c@Y"]);
  });

  it("the query forwards only what the server can apply, with the page limit and the cursor", () => {
    expect(bindingQuery({ env: "live", q: null, venue: null })).toEqual({ environment: "live", search: undefined, venue: undefined, limit: PAGE_LIMIT, after: undefined });
    expect(bindingQuery({ env: "paper", q: "okx", venue: "OKX" }, "cur")).toEqual({ environment: "paper", search: "okx", venue: "OKX", limit: PAGE_LIMIT, after: "cur" });
  });

  it("reads the published instant and nothing else about time", () => {
    expect(rows[0]!.updatedAt).toBe(Date.parse("2026-10-17T09:00:00.000Z"));
    expect(timeOf({ t: "not a date" }, "t")).toBeNull();
    expect(timeOf({ t: null }, "t")).toBeNull();
    expect(timeOf({ t_ms: 1_788_000_000_000, t: "ignored" }, "t")).toBe(1_788_000_000_000);
  });
});

describe("the account view over the canonical broker-360 body", () => {
  const p = canonicalProfile();
  const view = readAccountView(p, "acc_1");

  it("reads identity, currencies and the one account's rows", () => {
    expect(view.identity).toMatchObject({ accountId: "acc_1", venue: "BINANCE", environment: "live", bindingId: null });
    expect(view.currencies).toEqual(["USDT"]);
    expect(view.sleeves.map((s) => s.accountId)).toEqual(["acc_1"]);
  });

  it("prints exact strings, never a re-computed number", () => {
    const bal = balanceFacts(p, "acc_1", "USDT")!;
    expect(bal.total).toMatchObject({ kind: "value", decimal: { full: "1000.10" } });
    expect(bal.free).toMatchObject({ kind: "value", decimal: { full: "800.10" } });
    expect(bal.locked).toMatchObject({ kind: "value", decimal: { full: "200.00" } });
    expect(marginFacts(p, "acc_1", "USDT")).toMatchObject({ perInstrumentOnly: false, initial: { decimal: { full: "100.00" } }, maintenance: { decimal: { full: "50.05" } } });
    expect(headroomFacts(p, "USDT")).toMatchObject({ verdict: "AVAILABLE", headroom: { decimal: { full: "750.05" } } });
    expect(diffFacts(p, "USDT")).toMatchObject({ delta: { decimal: { full: "0.20" } }, inSync: false });
  });

  it("is an allow-list: a planted physical reference, secret or credential never reaches a view", () => {
    const dirty = loadCanonical<Record<string, unknown>>("execution-account-broker-360.ready");
    const data = dirty.data as Record<string, Record<string, unknown>[]>;
    for (const rows of Object.values(data)) for (const row of rows) {
      row.external_account_ref = "LEAK_PHYSICAL_REF";
      row.credential_alias = "LEAK_ALIAS";
      row.api_secret = "LEAK_SECRET";
    }
    const dirtyProfile = readProfileEnvelope(dirty)!;
    const dirtyView = readAccountView(dirtyProfile, "acc_1");
    const text = JSON.stringify({
      dirtyView,
      triad: triadModel(dirtyProfile, "acc_1", "USDT", false),
      balance: balanceFacts(dirtyProfile, "acc_1", "USDT"),
      broker: brokerFacts(dirtyProfile, "USDT"),
      sleeves: sleeveRows(dirtyProfile, dirtyView, "USDT"),
    });
    for (const probe of ["LEAK_PHYSICAL_REF", "LEAK_ALIAS", "LEAK_SECRET", "external_account_ref"]) expect(text).not.toContain(probe);
  });
});

describe("currency", () => {
  const core = profile("acc_bnc_core");
  const view = readAccountView(core, "acc_bnc_core");

  it("uses the URL's currency when the account has it, else the base, else the first", () => {
    expect(chooseCurrency(view, "USDC")).toBe("USDC");
    expect(chooseCurrency(view, "EUR")).toBe("USDT");
    expect(chooseCurrency(view, null)).toBe("USDT");
    expect(chooseCurrency({ ...view, identity: { ...view.identity, baseCurrency: null } }, null)).toBe("USDC");
    expect(chooseCurrency({ ...view, currencies: [] }, "USDT")).toBeNull();
  });

  it("never sums across currencies: each currency reads its own row", () => {
    expect(balanceFacts(core, "acc_bnc_core", "USDT")!.total).toMatchObject({ decimal: { full: "88200.00" } });
    expect(balanceFacts(core, "acc_bnc_core", "USDC")!.total).toMatchObject({ decimal: { full: "5000.00" } });
    expect(balanceFacts(core, "acc_bnc_core", "EUR")).toBeNull();
  });
});

describe("the Triad rows", () => {
  it("prints the source's own delta where scopes match (unshared account with differences)", () => {
    const p = profile("acc_bnc_sub");
    const model = triadModel(p, "acc_bnc_sub", "USDT", false);
    const free = model.rows.find((r) => r.key === "free")!;
    expect(free.internal).toMatchObject({ decimal: { full: "118000.00" } });
    expect(free.broker).toMatchObject({ decimal: { full: "117800.00" } });
    expect(free.difference).toMatchObject({ decimal: { full: "0.20" } });
    // The margin source is gone: the internal side says so by being absent, never zero.
    expect(model.rows.find((r) => r.key === "initial")!.internal).toBeUndefined();
    expect(model.broker?.asOf).not.toBeNull();
  });

  it("says Not computed, with the reason, where the binding is shared and no difference was published", () => {
    const p = profile("acc_bnc_core");
    const model = triadModel(p, "acc_bnc_core", "USDT", true);
    for (const key of ["free", "total", "initial", "maintenance"]) {
      const row = model.rows.find((r) => r.key === key)!;
      expect(row.broker, key).toEqual({ kind: "not-computed", reason: "SHARED_BINDING" });
      expect(row.difference, key).toEqual({ kind: "not-computed", reason: "SHARED_BINDING" });
    }
    expect(model.rows.find((r) => r.key === "free")!.internal).toMatchObject({ decimal: { full: "80000.00" } });
    expect(model.rows.find((r) => r.key === "locked")!.broker).toBeUndefined();
  });

  it("leaves a missing broker report missing: not a zero, and not Not computed on an unshared account", () => {
    const p = profile("acc_okx_main");
    const model = triadModel(p, "acc_okx_main", "USDT", false);
    expect(model.broker).toBeNull();
    for (const row of model.rows) {
      expect(row.broker, row.key).toBeUndefined();
      expect(row.difference, row.key).toBeUndefined();
    }
  });

  it("a malformed published figure stays visibly malformed instead of being replaced by another source", () => {
    const raw = loadCanonical<Record<string, unknown>>("execution-account-broker-360.ready");
    const data = raw.data as Record<string, Record<string, unknown>[]>;
    data.differences![0]!.portal_free = 7654321.125;
    const p = readProfileEnvelope(raw)!;
    const free = triadModel(p, "acc_1", "USDT", false).rows.find((r) => r.key === "free")!;
    expect(free.internal).toBeNull();
  });
});

describe("margin, headroom, broker and absent branches", () => {
  it("reports a margin source gap with the source's own code", () => {
    const p = profile("acc_bnc_sub");
    expect(branchOf(p, "margin_balances")).toEqual({ state: "UNAVAILABLE", reasonCode: "MARGIN_SOURCE_GAP" });
    expect(absentCodeFor(p, "margin_balances")).toBe("MARGIN_SOURCE_GAP");
    expect(marginFacts(p, "acc_bnc_sub", "USDT")).toBeNull();
    expect(absentCodeFor(p, "account_balances")).toBeUndefined();
    expect(readAccountView(p, "acc_bnc_sub").gaps).toEqual([{ relation: "margin_balances", code: "MARGIN_SOURCE_GAP" }]);
  });

  it("finds the broker sync capability under its relation name", () => {
    expect(absentCodeFor(profile("acc_okx_main"), "broker_sync")).toBe("BROKER_SYNC_UNAVAILABLE");
  });

  it("publishes no account margin total when only per-instrument rows exist", () => {
    const raw = loadCanonical<Record<string, unknown>>("execution-account-broker-360.ready");
    const data = raw.data as Record<string, Record<string, unknown>[]>;
    data.margin_balances = [
      { account_id: "acc_1", instrument_id: "BTCUSDT", currency: "USDT", initial: "60.00", maintenance: "30.00" },
      { account_id: "acc_1", instrument_id: "ETHUSDT", currency: "USDT", initial: "40.00", maintenance: "20.05" },
    ];
    expect(marginFacts(readProfileEnvelope(raw)!, "acc_1", "USDT")).toEqual({ initial: undefined, maintenance: undefined, perInstrumentOnly: true });
  });

  it("the headroom verdict is the source's word", () => {
    expect(headroomFacts(profile("acc_okx_main"), "USDT")).toMatchObject({ verdict: "BREACHED" });
    expect(coverageFlag("BREACHED")).toEqual({ kind: "attention", label: "Not covered" });
    expect(coverageFlag("AVAILABLE")).toEqual({ kind: "ok", label: "Covered" });
    expect(coverageFlag("UNKNOWN").kind).toBe("unknown");
    expect(headroomFacts(profile("acc_pap_sim"), "USDT")).toBeNull();
  });

  it("picks the newest broker report", () => {
    expect(brokerFacts(profile("acc_bnc_core"), "USDT")).toMatchObject({ status: "SYNCED", buyingPower: { decimal: { full: "301100.00" } } });
    expect(brokerFacts(profile("acc_pap_sim"), "USDT")).toBeNull();
  });

  it("the ledger row's own fees and funding are current facts", () => {
    expect(ledgerPnl(profile("acc_bnc_core"), "acc_bnc_core", "USDT")).toMatchObject({ fees: { decimal: { full: "388.20" } }, funding: { decimal: { full: "224.20" } }, unrealized: { decimal: { full: "579.50" } } });
    expect(ledgerPnl(profile("acc_pap_sim"), "acc_pap_sim", "USDT")).toBeNull();
  });
});

describe("sleeves and the shared binding", () => {
  const core = profile("acc_bnc_core");
  const view: AccountView = readAccountView(core, "acc_bnc_core");

  it("names the three sleeves with their own internal balance and portfolio", () => {
    const rows = sleeveRows(core, view, "USDT");
    expect(rows.map((r) => [r.accountId, r.current])).toEqual([["acc_bnc_core", true], ["acc_bnc_sat", false], ["acc_bnc_can", false]]);
    expect(rows[0]).toMatchObject({ portfolio: "pf_core", internal: { decimal: { full: "88200.00" } } });
    expect(rows[1]).toMatchObject({ internal: { decimal: { full: "61400.00" } } });
    expect(rows[2]).toMatchObject({ internal: { decimal: { full: "47900.00" } } });
  });

  it("a sleeve with no row in the chosen currency has no figure, not a zero", () => {
    expect(sleeveRows(core, view, "USDC").slice(1).map((r) => r.internal)).toEqual([undefined, undefined]);
  });

  it("population: shared by the rows, partial by the exposure read", () => {
    const exposure = readBindingExposure(ask("/broker-bindings/bnc_main%40BINANCE/exposure"))!;
    expect(populationOf(view, exposure)).toEqual({ shared: true, published: 3, expected: 3, partial: false });
    const partialView = { ...view, sleeves: view.sleeves.slice(0, 2) };
    expect(populationOf(partialView, exposure)).toEqual({ shared: true, published: 2, expected: 3, partial: true });
    const alone = readAccountView(profile("acc_bnc_sub"), "acc_bnc_sub");
    expect(populationOf(alone, null)).toEqual({ shared: false, published: 1, expected: null, partial: false });
    expect(populationOf(alone, { ...exposure, expectedAccountCount: 4 } as BindingExposure).shared).toBe(true);
  });

  it("the capital invariant rows carry the published headroom and its sign", () => {
    const exposure = readBindingExposure(ask("/broker-bindings/okx_main%40OKX/exposure"))!;
    const rows = capitalRows(exposure);
    expect(rows[0]).toMatchObject({ currency: "USDT", withinPhysical: false, headroom: { decimal: { full: "-7400.00" } } });
    const ok = capitalRows(readBindingExposure(ask("/broker-bindings/bnc_main%40BINANCE/exposure"))!);
    expect(ok.map((r) => r.withinPhysical)).toEqual([true, true]);
    expect(capitalRows(null)).toEqual([]);
    expect(isNegative("-1")).toBe(true);
    expect(isNegative("1")).toBe(false);
    expect(isNegative(null)).toBe(false);
  });
});

describe("positions, allocations and sync history", () => {
  const view = readAccountView(profile("acc_bnc_core"), "acc_bnc_core");

  it("lists positions as published, each with its own notional, and sums nothing", () => {
    expect(view.positions.map((p) => [p.symbol, p.side])).toEqual([["BTCUSDT", "LONG"], ["ETHUSDT", "SHORT"]]);
    expect(view.positions[0]!.notional).toMatchObject({ decimal: { full: "61300.00" } });
    expect(Object.keys(view.positions[0]!)).not.toContain("gross");
  });

  it("reads allocations with their own currency", () => {
    expect(view.allocations).toEqual([expect.objectContaining({ alpha: "btc_trend", deployment: "dep_btc_live", portfolio: "pf_core", currency: "USDT" })]);
  });

  it("sorts sync newest first, the row with no time last, and keeps unknown words unknown", () => {
    const times = view.sync.map((e) => e.at);
    expect(times[times.length - 1]).toBeNull();
    const known = times.filter((t): t is NonNullable<typeof t> => t !== null);
    expect([...known].sort((a, b) => b - a)).toEqual(known);
    expect(view.sync.map((e) => e.status.kind)).toContain("stale");
  });

  it("caps rows at the DOM budget", () => {
    const raw = loadCanonical<Record<string, unknown>>("execution-account-broker-360.ready");
    const data = raw.data as Record<string, Record<string, unknown>[]>;
    data.positions = Array.from({ length: ROW_CAP + 40 }, (_, i) => ({ position_id: `p${i}`, account_id: "acc_1", instrument_id: `S${i}`, notional: "1.00" }));
    data.broker_sync = Array.from({ length: ROW_CAP + 40 }, (_, i) => ({ sync_id: `s${i}`, status: "SYNCED", synced_at_ms: 1_788_000_000_000 + i }));
    const v = readAccountView(readProfileEnvelope(raw)!, "acc_1");
    expect(v.positions).toHaveLength(ROW_CAP);
    expect(v.sync).toHaveLength(ROW_CAP);
  });
});

describe("activity rows", () => {
  const orders = readSubjectActivity(ask("/resources/accounts/acc_bnc_core/orders", { environment: "live" }))!;
  const fills = readSubjectActivity(ask("/resources/accounts/acc_bnc_core/fills", { environment: "live" }))!;

  it("keeps the source's order and words each row from published fields only", () => {
    const { rows, withoutTime } = activityRows(orders, "orders");
    expect(withoutTime).toBe(0);
    expect(rows.map((r) => r.id)).toEqual(["ord_3", "ord_2", "ord_1"]);
    expect(rows.map((r) => r.kind)).toEqual(["applied", "pending", "rejected"]);
    expect(rows[0]).toMatchObject({ target: "BTCUSDT", kindLabel: "Filled" });
    expect(rows[0]!.outcome).toContain("BUY");
  });

  it("fills are applied fills", () => {
    expect(activityRows(fills, "fills").rows[0]).toMatchObject({ kind: "applied", kindLabel: "Fill" });
  });

  it("counts, and does not guess, a row whose time is unreadable", () => {
    const broken = { ...orders, records: [...orders.records, { recordId: "x", values: { order_id: "x", status: "OPEN" } }] };
    const { rows, withoutTime } = activityRows(broken, "orders");
    expect(rows).toHaveLength(3);
    expect(withoutTime).toBe(1);
  });
});

describe("equity series", () => {
  const body = (subject: string, env = "live") => readFinancialChart(ask("/views/equity-chart", { environment: env, subject_kind: "account", subject_id: subject }))!;

  it("draws the chosen currency's series untouched, gap included", () => {
    const model = equityModel(body("acc_bnc_core"), "USDT");
    expect(model.state.kind).toBe("ready");
    expect(model.points).toHaveLength(6);
    expect(model.points.filter((p) => p.v === null)).toHaveLength(1);
    expect(model.points[0]!.v).toBe("87500.00");
  });

  it("another currency has no series: unavailable, never the USDT line relabelled", () => {
    const model = equityModel(body("acc_bnc_core"), "USDC");
    expect(model.points).toEqual([]);
    expect(model.state.kind).toBe("unavailable");
  });

  it("an empty panel and a missing read are unavailable with a reason", () => {
    expect(equityModel(body("acc_pap_sim", "paper"), "USDT").state).toMatchObject({ kind: "unavailable", reason: "No series is published for this account." });
    expect(equityModel(null, "USDT").state.kind).toBe("unavailable");
  });
});

describe("tabs, views, links, copy", () => {
  it("resolves tabs and explains an unknown one", () => {
    expect(readTab(null)).toEqual({ tab: "ov", notice: null });
    expect(readTab("REC")).toEqual({ tab: "rec", notice: null });
    expect(readTab("risk").notice).toContain("risk");
    expect(readTab("risk").tab).toBe("ov");
    expect(readViewMode("physical")).toBe("physical");
    expect(readViewMode("nonsense")).toBe("sleeve");
  });

  it("builds V1 routes and encodes ids", () => {
    expect(accountHref("a b")).toBe("/deployments/accounts/a%20b");
    expect(deploymentHref("d1", "paper")).toBe("/deployments/paper/d1");
    expect(deploymentHref("d1", "live")).toBe("/deployments/live/d1");
    expect(deploymentHref("d1", null)).toBe("/deployments/live/d1");
  });

  it("every Not published sentence carries its request id", () => {
    expect(notPublished(FE.budget)).toBe("Not published (FE-017)");
    expect(notPublishedReason(FE.command, "None.")).toBe("Not published (FE-020). None.");
    for (const fact of Object.values(FE)) expect(notPublished(fact)).toMatch(/^Not published \((FE|A360|ELP2-REQ-FE)-[\w-]+\)$/);
  });

  it("ages come from two published instants, not from a clock", () => {
    const at = (iso: string) => readUtcEpochMs(Date.parse(iso));
    expect(ageAtRead(at("2026-10-17T09:00:00Z"), at("2026-10-17T09:14:00Z"))).toBe("14 min");
    expect(ageAtRead(at("2026-10-17T09:00:00Z"), at("2026-10-17T09:00:30Z"))).toBe("under 1 min");
    expect(ageAtRead(at("2026-10-17T05:00:00Z"), at("2026-10-17T09:00:00Z"))).toBe("4 h");
    expect(ageAtRead(null, at("2026-10-17T09:00:00Z"))).toBeNull();
    expect(ageAtRead(at("2026-10-17T10:00:00Z"), at("2026-10-17T09:00:00Z"))).toBeNull();
  });

  it("a row's update reads as an age against the read, stale from 30 minutes (ACC-B1)", () => {
    const at = (iso: string) => readUtcEpochMs(Date.parse(iso));
    const read = at("2026-10-17T09:00:00Z");
    expect(updatedAgo(at("2026-10-17T08:46:00Z"), read)).toEqual({ text: "14 min ago", stale: false });
    expect(updatedAgo(at("2026-10-17T08:30:00Z"), read)).toEqual({ text: "30 min ago", stale: true });
    // 170 minutes floors to 2 h (it used to round up to 3 h, older than the row is).
    expect(updatedAgo(at("2026-10-17T06:10:00Z"), read)).toEqual({ text: "2 h ago", stale: true });
    expect(updatedAgo(at("2026-10-17T08:59:40Z"), read)).toEqual({ text: "under 1 min ago", stale: false });
    // Hours floor, like ageAtRead: 119 minutes is "1 h", never rounded up to "2 h".
    expect(updatedAgo(at("2026-10-17T07:01:00Z"), read)).toEqual({ text: "1 h ago", stale: true });
    expect(updatedAgo(at("2026-10-17T07:00:00Z"), read)).toEqual({ text: "2 h ago", stale: true });
    // No age is invented: a missing instant or a row newer than the read prints the instant instead.
    expect(updatedAgo(null, read)).toBeNull();
    expect(updatedAgo(at("2026-10-17T09:05:00Z"), read)).toBeNull();
  });

  it("states of the resource map one to one", () => {
    expect(resourceStatus(profile("acc_bnc_core"))).toBe("stale");
    expect(resourceStatus(profile("acc_okx_main"))).toBe("partial");
    expect(resourceStatus(profile("acc_tn_bnc"))).toBe("empty");
    expect(resourceStatus(profile("acc_bnc_sub"))).toBe("ok");
    expect(resourceReason(profile("acc_okx_main"))).toContain("BROKER_SYNC_UNAVAILABLE");
    expect(resourceReason(profile("acc_pap_sim"))).toContain("SIMULATED_NO_VENUE");
  });
});

describe("capabilities (role variants through holds())", () => {
  const can = (preset: keyof typeof V2_ROLE_PRESETS, need: "read" | "manage") => holds(V2_ROLE_PRESETS[preset], ACCOUNT_NEEDS[need]);

  it("manager and operator read Accounts; researcher and reviewer do not", () => {
    expect(can("manager", "read")).toBe(true);
    expect(can("operator", "read")).toBe(true);
    expect(can("researcher", "read")).toBe(false);
    expect(can("reviewer", "read")).toBe(false);
  });

  it("nobody holds the binding-action capability today", () => {
    for (const preset of ["manager", "operator", "researcher", "reviewer"] as const) expect(can(preset, "manage")).toBe(false);
  });
});

describe("metricOf and countMetric", () => {
  it("separates nothing provided, an absence, a value and a malformed value", () => {
    expect(metricOf(undefined, "money")).toBeUndefined();
    expect(metricOf(null, "money")).toMatchObject({ kind: "absent", state: "UNAVAILABLE", reasonCode: "NOT_PUBLISHED" });
    expect(metricOf("12.50", "money")).toMatchObject({ kind: "value", publishedZero: false });
    expect(metricOf("0.00", "money")).toMatchObject({ kind: "value", publishedZero: true });
    expect(metricOf(12.5, "money")).toBeNull();
    expect(metricOf("1e5", "money")).toBeNull();
    expect(metricOf("-0", "money")).toBeNull();
    expect(metricOf(null, "money", "has spaces!")).toMatchObject({ reasonCode: "NOT_PUBLISHED" });
    expect(countMetric(3)).toMatchObject({ kind: "value", decimal: { full: "3" } });
  });
});

/* ── L1: the state matrix ────────────────────────────────────────────────── */

describe("L1 matrix: every state of the resource reads without throwing and without inventing a figure", () => {
  const base = JSON.parse(JSON.stringify(ask("/resources/accounts/acc_bnc_core"))) as Record<string, unknown>;
  const drop = (relation: string) => dimensionOf(relation, [
    { label: "present", apply: () => undefined },
    { label: "absent", apply: (draft) => { delete draft.data[relation]; } },
    { label: "empty", apply: (draft) => { draft.data[relation] = []; } },
  ]);
  const dims = [
    drop("account_balances"),
    drop("margin_balances"),
    drop("broker_sync"),
    drop("exposure_headroom"),
    drop("positions"),
    dimension("state", ["state"], ["ready", "stale", "partial", "empty", "unavailable", "weird"]),
    dimension("freshness", ["freshness"], ["FRESH", "AGING", "STALE", "UNKNOWN", ABSENT]),
    dimension("shared", ["__shared"], [true, false]),
  ];
  const states = pairwise(base, dims);

  it("covers a useful number of states", () => {
    expect(states.length).toBeGreaterThanOrEqual(12);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const raw = state.value as Record<string, unknown>;
    const shared = (raw as { __shared?: boolean }).__shared === true;
    const p = readProfileEnvelope(raw);
    expect(p).not.toBeNull();
    const view = readAccountView(p!, "acc_bnc_core");
    const currency = chooseCurrency(view, null);
    const model = triadModel(p!, "acc_bnc_core", currency, shared);
    expect(model.rows.map((r) => r.key)).toEqual(["free", "total", "locked", "initial", "maintenance", "positions"]);
    const picks = state.picks;
    const bal = balanceFacts(p!, "acc_bnc_core", currency);
    // A relation that is gone must produce no facts at all: never a value, never a zero.
    if (picks.account_balances !== "present") {
      expect(bal).toBeNull();
      expect(model.rows.find((r) => r.key === "total")!.internal).toBeUndefined();
    }
    if (picks.margin_balances !== "present") expect(marginFacts(p!, "acc_bnc_core", currency)).toBeNull();
    if (picks.broker_sync !== "present") {
      expect(model.broker).toBeNull();
      expect(brokerFacts(p!, currency)).toBeNull();
    }
    if (picks.exposure_headroom !== "present") expect(headroomFacts(p!, currency)).toBeNull();
    // Differences are never produced by the model: with none published, the cell is Not computed (shared) or missing.
    const diffRow = model.rows.find((r) => r.key === "free")!.difference;
    expect(diffRow).toEqual(shared ? { kind: "not-computed", reason: "SHARED_BINDING" } : undefined);
    // The status mapping is total.
    expect(["ok", "empty", "partial", "stale", "unavailable", "denied"]).toContain(resourceStatus(p!));
    expect(freshnessFlag(p!.freshness).label.length).toBeGreaterThan(0);
    const text = JSON.stringify({ view, model });
    expect(text).not.toMatch(/NaN|undefined|\[object/);
  });

  it("the full cartesian of the five relations (3^5) all read", () => {
    const relationDims = ["account_balances", "margin_balances", "broker_sync", "exposure_headroom", "positions"].map(drop);
    const all = cartesian(base, relationDims);
    expect(all).toHaveLength(243);
    for (const state of all) {
      const p = readProfileEnvelope(state.value);
      expect(() => triadModel(p!, "acc_bnc_core", "USDT", true), state.name).not.toThrow();
      expect(() => readAccountView(p!, "acc_bnc_core"), state.name).not.toThrow();
    }
  });
});

/* ── L3: negative payloads ───────────────────────────────────────────────── */

describe("L3 negative: bad published values never reach a view as a number", () => {
  const base = JSON.parse(JSON.stringify(ask("/resources/accounts/acc_bnc_sub"))) as Record<string, unknown>;
  const paths = [
    ["data", "account_balances", 0, "total"],
    ["data", "account_balances", 0, "free"],
    ["data", "differences", 0, "delta"],
    ["data", "differences", 0, "portal_free"],
    ["data", "exposure_headroom", 0, "headroom"],
  ] as const;

  for (const path of paths) {
    const cases = decimalCases(base, path).filter((c) => c.category !== "huge-string");
    it.each(cases.map((c) => [c.name, c] as const))(`${path.join(".")} · %s`, (_name, c) => {
      const p = readProfileEnvelope(c.value);
      // A body the envelope reader refuses is also a safe outcome.
      if (p === null) return;
      const view = readAccountView(p, "acc_bnc_sub");
      const model = triadModel(p, "acc_bnc_sub", "USDT", false);
      const bal = balanceFacts(p, "acc_bnc_sub", "USDT");
      const diff = diffFacts(p, "USDT");
      const head = headroomFacts(p, "USDT");
      const metrics = [bal?.total, bal?.free, diff?.delta, diff?.internal, head?.headroom, ...model.rows.flatMap((r) => [r.internal, r.broker, r.difference])];
      for (const m of metrics) {
        if (m && typeof m === "object" && "kind" in m && m.kind === "value") expect(m.decimal.full).toMatch(/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/);
      }
      expect(leaked({ view, model, bal, diff, head }, c.probe)).toBe(false);
    });
  }

  it("a missing or null required column is an absence the model reports, never a value", () => {
    const required = requiredCases(base, [["data", "account_balances", 0, "total"], ["data", "account_balances", 0, "currency"], ["data", "differences", 0, "delta"]]);
    for (const c of required) {
      const p = readProfileEnvelope(c.value);
      if (p === null) continue;
      expect(() => triadModel(p, "acc_bnc_sub", "USDT", false), c.name).not.toThrow();
    }
  });

  it("prototype keys planted in the rows do not leak into a view", () => {
    const planted = pollutionCases(base, [["data", "account_balances", 0], ["data", "differences", 0], ["data"], []]);
    for (const c of planted) {
      const p = readProfileEnvelope(c.value);
      if (p === null) continue;
      const view = readAccountView(p, "acc_bnc_sub");
      const model = triadModel(p, "acc_bnc_sub", "USDT", false);
      expect(leaked({ view, model }, c.probe), c.name).toBe(false);
    }
  });
});
