/**
 * The Accounts double (`e2e/bffDoubleAccount.ts`) must serve responses the REAL
 * readers accept, for every filter a spec can ask for, with the states the
 * screens must keep apart (ok / stale / bad credential, shared / unshared,
 * differences present / absent, margin present / absent, a sync gap, a second
 * page, one error) and with the physical broker reference stripped.
 */
import { describe, expect, it } from "vitest";

import { answerAccount } from "../../../../../e2e/bffDoubleAccount";
import { readBindingExposure } from "../../../analytics";
import { readFinancialChart } from "../../../api/financialChart";
import { readBindingDetail, readBindings, readProfileEnvelope } from "../../../api/profileRead";
import { readSubjectActivity } from "../../../api/subjectActivity";
import { loadCanonical } from "../../testkit/loadCanonical";
import { leaked } from "../../testkit/negative";
import { readAccountView } from "./model";

const ask = (path: string, query: Record<string, string> = {}) => answerAccount("GET", path, new URLSearchParams(query));

describe("routes", () => {
  it("answers only GET, and only its own routes", () => {
    expect(answerAccount("POST", "/broker-bindings", new URLSearchParams())).toBeNull();
    expect(answerAccount("GET", "/alphas", new URLSearchParams())).toBeNull();
    expect(answerAccount("GET", "/api/v1/execution/broker-bindings", new URLSearchParams())?.status).toBe(200);
    expect(answerAccount("GET", "/views/equity-chart", new URLSearchParams({ subject_kind: "alpha" }))).toBeNull();
  });
});

describe("GET /broker-bindings", () => {
  it("reads through readBindings: three live bindings, ok, stale and bad credential", () => {
    const answer = ask("/broker-bindings", { environment: "live" });
    expect(answer?.status).toBe(200);
    const list = readBindings(answer!.body)!;
    expect(list).not.toBeNull();
    expect(list.environment).toBe("live");
    expect(list.page.rows.map((r) => [r.bindingId, r.credentialState])).toEqual([
      ["bnc_main@BINANCE", "SYNC_SYNCED"],
      ["bnc_sub@BINANCE", "SYNC_STALE"],
      ["okx_main@OKX", "EXPIRED"],
    ]);
    expect(list.page.filteredCount).toBe(3);
  });

  it("defaults to live and serves the other environments one at a time", () => {
    expect(readBindings(ask("/broker-bindings")!.body)!.environment).toBe("live");
    expect(readBindings(ask("/broker-bindings", { environment: "paper" })!.body)!.page.rows.map((r) => r.bindingId)).toEqual(["pap_sim@BINANCE"]);
    expect(readBindings(ask("/broker-bindings", { environment: "sandbox" })!.body)!.page.rows[0]).toMatchObject({ state: "SUSPENDED", credentialState: "NOT_PUBLISHED" });
  });

  it("pages by keyset: a second page, no repeat, and a cursor tied to its filter", () => {
    const first = readBindings(ask("/broker-bindings", { environment: "live", limit: "2" })!.body)!;
    expect(first.page.rows).toHaveLength(2);
    expect(first.page.hasMore).toBe(true);
    const second = readBindings(ask("/broker-bindings", { environment: "live", limit: "2", after: first.page.nextCursor! })!.body)!;
    expect(second.page.rows.map((r) => r.bindingId)).toEqual(["okx_main@OKX"]);
    expect(second.page.hasMore).toBe(false);
    expect(second.page.nextCursor).toBeNull();
    const seen = [...first.page.rows, ...second.page.rows].map((r) => r.bindingId);
    expect(new Set(seen).size).toBe(3);
    expect(ask("/broker-bindings", { environment: "live", limit: "2", after: first.page.nextCursor!, venue: "OKX" })?.status).toBe(409);
    expect(ask("/broker-bindings", { environment: "live", after: "nonsense" })?.status).toBe(400);
  });

  it("filters by search and venue, and refuses what it cannot read", () => {
    expect(readBindings(ask("/broker-bindings", { environment: "live", search: "OKX" })!.body)!.page.rows.map((r) => r.bindingId)).toEqual(["okx_main@OKX"]);
    expect(readBindings(ask("/broker-bindings", { environment: "live", venue: "BINANCE" })!.body)!.page.filteredCount).toBe(2);
    expect(readBindings(ask("/broker-bindings", { environment: "live", search: "zzz" })!.body)!.page.rows).toEqual([]);
    expect(ask("/broker-bindings", { environment: "mars" })?.status).toBe(400);
    expect(ask("/broker-bindings", { limit: "0" })?.status).toBe(400);
    expect(ask("/broker-bindings", { limit: "51" })?.status).toBe(400);
  });

  it("keeps the canonical envelope fields the reader requires", () => {
    const canonical = loadCanonical("execution-bindings-list");
    const body = ask("/broker-bindings", { environment: "paper" })!.body as Record<string, unknown>;
    for (const key of ["schema_version", "record_authority", "source_authority", "workspace_id"]) expect(body[key]).toEqual(canonical[key]);
  });
});

describe("GET /broker-bindings/{id}", () => {
  it("reads through readBindingDetail and names its environment", () => {
    const detail = readBindingDetail(ask("/broker-bindings/bnc_sub%40BINANCE", { environment: "live" })!.body)!;
    expect(detail.item).toMatchObject({ bindingId: "bnc_sub@BINANCE", accountId: "acc_bnc_sub", credentialState: "SYNC_STALE" });
    expect(detail.environment).toBe("live");
    expect(detail.freshness).toBe("STALE");
  });

  it("404s an unknown binding and a binding asked in the wrong environment", () => {
    expect(ask("/broker-bindings/nope")?.status).toBe(404);
    expect(ask("/broker-bindings/bnc_sub%40BINANCE", { environment: "paper" })?.status).toBe(404);
  });
});

describe("GET /broker-bindings/{id}/exposure", () => {
  it("reads through readBindingExposure: partial population on the shared binding", () => {
    const exposure = readBindingExposure(ask("/broker-bindings/bnc_main%40BINANCE/exposure")!.body)!;
    expect(exposure.accountCount).toBe(2);
    expect(exposure.expectedAccountCount).toBe(3);
    expect(exposure.completeness).not.toBe("COMPLETE");
    expect(exposure.buckets.map((b) => b.currency)).toEqual(["USDT", "USDC"]);
  });

  it("publishes a negative headroom for the bad-credential binding", () => {
    const exposure = readBindingExposure(ask("/broker-bindings/okx_main%40OKX/exposure")!.body)!;
    expect(String(exposure.buckets[0]!.headroom).startsWith("-")).toBe(true);
    expect(exposure.completeness).toBe("COMPLETE");
  });
});

describe("GET /resources/accounts/{id}", () => {
  const profile = (id: string) => readProfileEnvelope(ask(`/resources/accounts/${id}`)!.body)!;

  it("serves every named account through readProfileEnvelope", () => {
    for (const id of ["acc_bnc_core", "acc_bnc_sub", "acc_okx_main", "acc_pap_sim", "acc_tn_bnc", "acc_bnc_sat", "acc_bnc_can"]) {
      expect(profile(id), id).not.toBeNull();
    }
  });

  it("the shared account has three sleeves, margin, no differences, two currencies, and is stale", () => {
    const p = profile("acc_bnc_core");
    const view = readAccountView(p, "acc_bnc_core");
    expect(view.sleeves.map((s) => s.accountId)).toEqual(["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can"]);
    expect(p.data.margin_balances).toHaveLength(1);
    expect(p.data.differences).toBeUndefined();
    expect(view.currencies).toEqual(["USDC", "USDT"]);
    expect(p.state).toBe("stale");
    expect(p.freshness).toBe("STALE");
    expect(p.readAtMs! - p.asOfMs!).toBe(14 * 60_000);
  });

  it("the unshared account has differences and no margin, and says why", () => {
    const p = profile("acc_bnc_sub");
    expect(p.data.differences).toHaveLength(1);
    expect(p.data.margin_balances).toBeUndefined();
    expect(p.capabilities.find((c) => c.capabilityId === "source.margin_balances")).toMatchObject({ state: "UNAVAILABLE", reasonCode: "MARGIN_SOURCE_GAP" });
  });

  it("the broker sync history has a gap: a row with no time and a six hour hole", () => {
    const sync = readAccountView(profile("acc_bnc_core"), "acc_bnc_core").sync.filter((entry) => entry.source === "BROKER");
    expect(sync).toHaveLength(6);
    expect(sync.some((entry) => entry.at === null)).toBe(true);
    const times = sync.flatMap((entry) => (entry.at === null ? [] : [entry.at]));
    const holes = times.slice(1).map((t, i) => times[i]! - t);
    expect(Math.max(...holes)).toBeGreaterThanOrEqual(6 * 3_600_000);
  });

  it("the partial and the empty accounts differ", () => {
    expect(profile("acc_okx_main").state).toBe("partial");
    expect(profile("acc_okx_main").unavailableBranches).toContain("BROKER_SYNC_UNAVAILABLE");
    expect(profile("acc_tn_bnc").state).toBe("empty");
  });

  it("503s the error account and 404s an unknown one", () => {
    expect(ask("/resources/accounts/acc_err")?.status).toBe(503);
    expect(ask("/resources/accounts/acc_nowhere")?.status).toBe(404);
  });

  it("NEVER carries the physical broker reference, even though the fixture does", () => {
    const canonical = loadCanonical("execution-account-broker-360.ready");
    expect(JSON.stringify(canonical)).toContain("external_account_ref");
    for (const id of ["acc_bnc_core", "acc_bnc_sub", "acc_okx_main", "acc_pap_sim", "acc_tn_bnc", "acc_bnc_sat"]) {
      const text = JSON.stringify(ask(`/resources/accounts/${id}`)!.body);
      expect(text, id).not.toContain("external_account_ref");
      expect(text, id).not.toContain("external_1");
      expect(text, id).not.toContain("external_okx");
    }
    expect(leaked(JSON.stringify(readAccountView(profile("acc_bnc_core"), "acc_bnc_core")), "external_")).toBe(false);
  });
});

describe("GET /resources/accounts/{id}/orders|fills", () => {
  it("reads through readSubjectActivity and pages by keyset", () => {
    const first = readSubjectActivity(ask("/resources/accounts/acc_bnc_core/orders", { environment: "live", limit: "2" })!.body)!;
    expect(first.records.map((r) => r.recordId)).toEqual(["ord_3", "ord_2"]);
    expect(first.page.hasMore).toBe(true);
    const second = readSubjectActivity(ask("/resources/accounts/acc_bnc_core/orders", { environment: "live", limit: "2", after: first.page.nextCursor! })!.body)!;
    expect(second.records.map((r) => r.recordId)).toEqual(["ord_1"]);
    expect(second.page.hasMore).toBe(false);
  });

  it("serves fills, an empty account, and refuses a bad limit, a bad cursor and a wrong environment", () => {
    expect(readSubjectActivity(ask("/resources/accounts/acc_bnc_core/fills", { environment: "live" })!.body)!.records).toHaveLength(1);
    expect(readSubjectActivity(ask("/resources/accounts/acc_pap_sim/orders", { environment: "paper" })!.body)!.records).toEqual([]);
    expect(ask("/resources/accounts/acc_bnc_core/orders", { environment: "live", limit: "0" })?.status).toBe(400);
    expect(ask("/resources/accounts/acc_bnc_core/orders", { environment: "live", after: "x" })?.status).toBe(400);
    expect(ask("/resources/accounts/acc_bnc_core/orders", { environment: "paper" })?.status).toBe(404);
  });
});

describe("GET /views/equity-chart", () => {
  it("serves a USDT series with a gap for the shared account and an EMPTY panel for the others", () => {
    const chart = readFinancialChart(ask("/views/equity-chart", { environment: "live", subject_kind: "account", subject_id: "acc_bnc_core", metric: "equity" })!.body)!;
    expect(chart.state).toBe("READY");
    expect(chart.series[0]!.currency).toBe("USDT");
    expect(chart.series[0]!.points.some(([, v]) => v === null)).toBe(true);
    const empty = readFinancialChart(ask("/views/equity-chart", { environment: "paper", subject_kind: "account", subject_id: "acc_pap_sim" })!.body)!;
    expect(empty.state).toBe("EMPTY");
    expect(empty.series).toEqual([]);
  });
});
