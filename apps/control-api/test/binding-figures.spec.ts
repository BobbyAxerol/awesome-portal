import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it, vi } from "vitest";
import { bindingCounts, mapBindingFigures, type CountSnapshot } from "../src/manager-lists/binding-figures";
import { bindingsResource, mapBindingRow, type BindingRow } from "../src/manager-lists/contracts";

// FE-CAT-4. In-process only: no database, no source. The projection column `list_figures` does not exist yet, so these
// tests establish the mapping and the authorization/count rules that apply the day Edge supplies it.

const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const schema = JSON.parse(readFileSync(resolve(contractsRoot, "schemas/execution-manager-lists.v1.schema.json"), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const validItem = ajv.getSchema(`${schema.$id}#/$defs/BindingItem`)!;
const validCounts = ajv.getSchema(`${schema.$id}#/$defs/BindingCounts`)!;

const at = "2026-10-23T09:59:58Z";
const usdt = (value: string, coverage = "COMPLETE") => ({ currency: "USDT", value, observed_at: at, coverage });

const row = (extra: Record<string, unknown> = {}): BindingRow => ({
  scope_id: "ws_primary:paper", binding_id: "bnc_main@BINANCE", account_id: "bnc_main", venue: "BINANCE",
  state: "ACTIVE", credential_state: "SYNC_SYNCED", updated_at: new Date("2026-10-23T10:00:00Z"), ...extra,
});

describe("bindings-list figures mapping", () => {
  it("publishes exactly the L0 row shape when the projection row carries no figures", () => {
    expect(mapBindingRow(row())).toEqual({
      binding_id: "bnc_main@BINANCE", account_id: "bnc_main", venue: "BINANCE",
      state: "ACTIVE", credential_state: "SYNC_SYNCED", updated_at: "2026-10-23T10:00:00.000Z",
    });
    expect(Object.hasOwn(mapBindingRow(row({ list_figures: undefined })), "figures")).toBe(false);
    expect(Object.hasOwn(mapBindingRow(row({ list_figures: "junk" })), "figures")).toBe(false);
    expect(Object.hasOwn(mapBindingRow(row({ list_figures: {} })), "figures")).toBe(false);
  });

  it("does not select the figures column: no migration, no database change", () => {
    expect(bindingsResource().selectColumns).not.toContain("list_figures");
    expect(bindingsResource().selectColumns).toEqual(
      ["scope_id", "binding_id", "account_id", "venue", "state", "credential_state", "updated_at"]);
  });

  it("maps native equity, headroom and sleeves; an unrelated wallet balance is never copied", () => {
    const item = mapBindingRow(row({
      list_figures: {
        native_equity: [usdt("412880.25")], virtual_used: [usdt("197500.00")], virtual_headroom: [usdt("215380.25")],
        sleeve_count: { count: 3, observed_at: at, coverage: "COMPLETE" },
        wallet_balance: [usdt("999999.99")],
      },
    }));
    expect(item.figures).toEqual({
      native_equity: [{ ...usdt("412880.25"), observed_at: "2026-10-23T09:59:58.000Z" }],
      virtual_used: [{ ...usdt("197500.00"), observed_at: "2026-10-23T09:59:58.000Z" }],
      virtual_headroom: [{ ...usdt("215380.25"), observed_at: "2026-10-23T09:59:58.000Z" }],
      sleeve_count: { count: 3, observed_at: "2026-10-23T09:59:58.000Z", coverage: "COMPLETE" },
    });
    expect(JSON.stringify(item)).not.toContain("999999.99");
    expect(validItem(item), JSON.stringify(validItem.errors)).toBe(true);
  });

  it("keeps omitted, typed null and zero distinct", () => {
    const figures = mapBindingFigures({
      native_equity: null,
      virtual_used: [usdt("0")],
      sleeve_count: { count: 0, observed_at: at, coverage: "COMPLETE" },
    })!;
    expect(figures.native_equity).toBeNull();
    expect(figures.virtual_used![0]!.value).toBe("0");
    expect(figures.sleeve_count!.count).toBe(0);
    expect(Object.hasOwn(figures, "virtual_headroom")).toBe(false); // omitted: no owning source
  });

  it("publishes a mixed-currency binding as one entry per currency, never a sum", () => {
    const figures = mapBindingFigures({
      native_equity: [
        { currency: "USDT", value: "7000.00", observed_at: at, coverage: "COMPLETE" },
        { currency: "USDC", value: "5000.10", observed_at: at, coverage: "COMPLETE" },
      ],
    })!;
    expect(figures.native_equity!.map((entry) => [entry.currency, entry.value])).toEqual([["USDC", "5000.10"], ["USDT", "7000.00"]]);
    expect(JSON.stringify(figures)).not.toContain("12000.10");
  });

  it("turns anything it cannot vouch for into a typed null, never a repaired or numeric value", () => {
    const bad = [
      [{ currency: "USDT", value: 412880.25, observed_at: at, coverage: "COMPLETE" }], // float
      [usdt("1e3")], [usdt("1,000.5")], [usdt("")], [usdt(" 1")],
      [{ ...usdt("1"), observed_at: "not a time" }], [{ ...usdt("1"), coverage: "FULL" }],
      [{ value: "1", observed_at: at, coverage: "COMPLETE" }], // no currency
      [usdt("1"), usdt("2")], // two entries for one currency: ambiguous, not merged
      [], "412880.25", 412880.25, {},
    ];
    for (const value of bad) expect(mapBindingFigures({ native_equity: value })).toEqual({ native_equity: null });
    for (const value of [-1, 1.5, "3", null, { count: -1, observed_at: at, coverage: "COMPLETE" }, { count: 2, observed_at: at }])
      expect(mapBindingFigures({ sleeve_count: value })).toEqual({ sleeve_count: null });
    expect(mapBindingFigures({ native_equity: [usdt("-0.5")] })!.native_equity![0]!.value).toBe("-0.5");
  });
});

describe("bindings-list counts: authorize, then count", () => {
  interface Candidate { id: string; visible: boolean; issue: boolean | null }
  const snapshot = (rows: Candidate[], extra: Partial<CountSnapshot<Candidate>> = {}): CountSnapshot<Candidate> =>
    ({ rows, observedAt: new Date("2026-10-23T10:00:00Z"), complete: true, ...extra });
  const c = (id: string, visible: boolean, issue: boolean | null = false): Candidate => ({ id, visible, issue });

  it("never counts a hidden row, nor classifies it", () => {
    const isIssue = vi.fn((candidate: Candidate) => candidate.issue);
    const counts = bindingCounts({
      snapshots: {
        paper: snapshot([c("a", true), c("secret", false, true), c("b", true, true)]),
        sandbox: snapshot([c("hidden-only", false, true)]),
        live: snapshot([c("l", true)]),
      },
      authorize: (candidate) => candidate.visible,
      isIssue,
    })!;
    expect(counts.by_environment).toEqual({ paper: 2, sandbox: 0, live: 1 });
    expect(counts.all).toBe(3);
    expect(counts.issues).toBe(1);
    expect(isIssue.mock.calls.map(([candidate]) => candidate.id)).not.toContain("secret");
    expect(isIssue.mock.calls.map(([candidate]) => candidate.id)).not.toContain("hidden-only");
    expect(validCounts(counts), JSON.stringify(validCounts.errors)).toBe(true);
  });

  it("keeps a counted zero distinct from not computable", () => {
    const counts = bindingCounts({
      snapshots: { paper: snapshot([c("a", true)]), sandbox: snapshot([]), live: null },
      authorize: (candidate) => candidate.visible,
      isIssue: (candidate) => candidate.issue,
    })!;
    expect(counts.by_environment).toEqual({ paper: 1, sandbox: 0, live: null });
    expect(counts.all).toBeNull(); // a partial sum would read as a total
    expect(counts.issues).toBeNull();
    expect(counts.coverage).toBe("PARTIAL");
    expect(validCounts(counts), JSON.stringify(validCounts.errors)).toBe(true);
  });

  it("publishes a null issue count when the owning facts do not decide it, not an under-count", () => {
    const counts = bindingCounts({
      snapshots: { paper: snapshot([c("a", true, true), c("b", true, null)]), sandbox: snapshot([]), live: snapshot([]) },
      authorize: (candidate) => candidate.visible,
      isIssue: (candidate) => candidate.issue,
    })!;
    expect(counts.all).toBe(2);
    expect(counts.issues).toBeNull();
  });

  it("omits counts when nothing is computable or no snapshot published an observation instant", () => {
    const input = { authorize: () => true, isIssue: () => false };
    expect(bindingCounts({ ...input, snapshots: {} })).toBeUndefined();
    expect(bindingCounts({ ...input, snapshots: { paper: snapshot([], { observedAt: null }) } })).toBeUndefined();
  });

  it("states the oldest observation and degrades coverage on an incomplete snapshot", () => {
    const counts = bindingCounts({
      snapshots: {
        paper: snapshot([], { observedAt: new Date("2026-10-23T10:00:00Z") }),
        sandbox: snapshot([], { observedAt: new Date("2026-10-23T09:00:00Z"), complete: false }),
        live: snapshot([], { observedAt: new Date("2026-10-23T09:30:00Z") }),
      },
      authorize: () => true,
      isIssue: () => false,
    })!;
    expect(counts.observed_at).toBe("2026-10-23T09:00:00.000Z");
    expect(counts.coverage).toBe("PARTIAL");
    expect(counts.all).toBe(0);
  });

  it("does not re-key pagination: figures ride on rows, the sort and cursor fields are unchanged", () => {
    const resource = bindingsResource();
    expect(Object.keys(resource.sorts)).toEqual(["updated_at", "venue", "state", "binding_id"]);
    expect(resource.idSortField).toBe("binding_id");
  });
});
