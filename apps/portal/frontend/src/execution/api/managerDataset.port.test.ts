/**
 * `ExecutionApi.getManagerDataset` through the real HTTP client (lane BFF_DOUBLE: `fetch` is stubbed and answers from the
 * PUBLISHED canonical fixtures, `lifecycle.live`, `partitions` and the `invariants` negative cases, or from the dataset double that
 * applies the query to a population; this proves the six routes, the exact OpenAPI encoding, the guard that a body answers THIS
 * question and the fail-closed mapping. It is not a live Edge and not a source acceptance).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { datasetViolations, DATASET_POINTER, OPENAPI, clone, fixtureValue, FIXTURE_ALL, FIXTURE_EMPTY, FIXTURE_LIFECYCLE_LIVE, FIXTURE_PARTITIONS, FIXTURE_INVARIANT_CASES, type Draft } from "../v2/readers/managerDataset.testbase";
import { loadCanonical } from "../v2/testkit/loadCanonical";
import { validateAgainst } from "../v2/testkit/schema";
import { alphasOf, datasetAnswer, newDatasetDouble, SNAPSHOT_B, wrapDatasetFetch, type DatasetVariant } from "../v2/screens/fleet/datasetDouble.testbase";
import type { DeliveryPolicy } from "../profile";
import { createFixtureApi } from "./fixtureApi";
import { createHttpApi } from "./httpApi";
import { datasetAnswersQuery, datasetQueryMismatch, encodeManagerDatasetQuery, type ManagerDatasetQuery } from "./managerDatasetQuery";
import { readManagerDataset } from "../v2/readers/managerDataset";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
const QUERY_POINTER = "/components/schemas/ManagerDatasetQuery";

afterEach(() => vi.unstubAllGlobals());

const api = () => createHttpApi({ policy: OPEN, readScope: {} });
const parsed = (url: string) => new URL(url, "http://portal.test");

/** `fetch` answering one fixed body (or status) for every URL, and recording the URLs. */
function serve(body: unknown, status = 200): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

/** The query object a wire encodes, as the OpenAPI describes it (JSON parameters parsed, lists split): fed to the published schema. */
function decodedQuery(search: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of search) {
    if (["window", "filters", "sort", "economic_partition"].includes(key)) out[key] = JSON.parse(value);
    else if (key === "stage_filter" || key === "group_by") out[key] = value.split(",");
    else if (key === "limit") out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

const FULL: ManagerDatasetQuery = {
  surface: "FLEET", environment: "live", workspaceId: "ws 1", q: "carry", qMode: "CONTAINS", window: { fromMs: 10, toMs: 20 },
  stageFilter: ["CANARY", "LIVE"], lifecycleFilter: "ACTIVE",
  filters: [
    { field: "health", op: "IN", values: ["READY", "ATTENTION"] },
    { field: "owner_user_id", op: "EQ", value: "owner-1" },
    { field: "venue", op: "IS_NULL" },
    { field: "net_pnl", op: "GTE", value: "-0.5" },
    { field: "score", op: "IN", values: ["1", "2.25"] },
  ],
  sort: [{ field: "current_stage", direction: "desc" }, { field: "name", direction: "asc" }],
  groupBy: ["current_stage", "health"],
  economicPartition: { economicDomain: "ACTUAL", currency: "USDT", basis: "b", nativeProfileRef: "n", domainProofRef: "d" },
  limit: 50, after: "cursor-1",
};

describe("encoding, exactly as the OpenAPI says", () => {
  it("GETs the fleet route with only the environment when nothing else is asked", async () => {
    const calls = serve(fixtureValue(FIXTURE_EMPTY));
    const result = await api().getManagerDataset({ surface: "FLEET", environment: "paper" });
    if (!result.ok) throw new Error(result.reason);
    const url = parsed(calls[0]!);
    expect(url.pathname).toBe("/api/v1/execution/manager/fleet");
    expect(Object.fromEntries(url.searchParams)).toEqual({ environment: "paper" });
    expect(result.value.surface).toBe("FLEET");
  });

  it("encodes every parameter as the OpenAPI types it: plain, JSON in the value, or one comma list", async () => {
    const calls = serve(fixtureValue(FIXTURE_EMPTY));
    await api().getManagerDataset(FULL);
    // (the empty fixture answers another question; the request is what is judged here)
    const search = parsed(calls[0]!).searchParams;
    expect(Object.fromEntries(search)).toEqual({
      environment: "live", workspace_id: "ws 1", q: "carry", q_mode: "CONTAINS",
      window: JSON.stringify({ from_ms: 10, to_ms: 20 }),
      stage_filter: "CANARY,LIVE", lifecycle_filter: "ACTIVE",
      filters: JSON.stringify([
        { field: "health", op: "IN", values: ["READY", "ATTENTION"] },
        { field: "owner_user_id", op: "EQ", value: "owner-1" },
        { field: "venue", op: "IS_NULL" },
        { field: "net_pnl", op: "GTE", value: "-0.5" },
        { field: "score", op: "IN", values: ["1", "2.25"] },
      ]),
      sort: JSON.stringify([{ field: "current_stage", direction: "desc" }, { field: "name", direction: "asc" }]),
      group_by: "current_stage,health",
      economic_partition: JSON.stringify({ economic_domain: "ACTUAL", currency: "USDT", basis: "b", native_profile_ref: "n", domain_proof_ref: "d" }),
      limit: "50", after: "cursor-1",
    });
  });

  it("a preset window is a JSON string with its quotes", async () => {
    const calls = serve(fixtureValue(FIXTURE_ALL));
    await api().getManagerDataset({ surface: "FLEET", environment: "paper", window: "ALL" });
    expect(parsed(calls[0]!).searchParams.get("window")).toBe("\"ALL\"");
  });

  it("what it sends conforms to the published ManagerDatasetQuery schema (the schema is the oracle)", () => {
    const queries: ManagerDatasetQuery[] = [
      FULL,
      { surface: "FLEET", environment: "paper" },
      { surface: "FLEET", environment: "sandbox", stageFilter: ["SANDBOX"], filters: [{ field: "health", op: "IN", values: ["HEALTHY", "DEGRADED"] }] },
      { surface: "FUND", environment: "live", window: "30D", before: "b" },
      { surface: "FLEET", environment: "paper", filters: [{ field: "net_pnl", op: "IN", values: ["0", "100.0000000000000001"] }], economicPartition: { economicDomain: "PAPER", currency: "USDT", basis: "TEST_ONLY:net-ledger", nativeProfileRef: "TEST_ONLY:paper", domainProofRef: "TEST_ONLY:proof" } },
    ];
    for (const query of queries) {
      const request = encodeManagerDatasetQuery(query);
      expect(request, JSON.stringify(query)).not.toBeNull();
      expect(validateAgainst(OPENAPI, QUERY_POINTER, decodedQuery(new URLSearchParams(request!.wire)))).toEqual([]);
    }
  });

  it("the published IN examples (execution-manager-query-in) encode as published", () => {
    const file = loadCanonical<{ cases: { environment: "paper"; filters: { field: string; op: "IN"; values: string[] }[]; economic_partition?: Record<string, string> }[] }>("execution-manager-query-in.synthetic.valid.json");
    for (const published of file.cases) {
      const request = encodeManagerDatasetQuery({
        surface: "FLEET", environment: published.environment,
        filters: published.filters as never,
        ...(published.economic_partition ? { economicPartition: { economicDomain: published.economic_partition.economic_domain as never, currency: published.economic_partition.currency!, basis: published.economic_partition.basis!, nativeProfileRef: published.economic_partition.native_profile_ref!, domainProofRef: published.economic_partition.domain_proof_ref! } } : {}),
      });
      expect(request).not.toBeNull();
      expect(JSON.parse(request!.wire.filters!)).toEqual(published.filters);
      if (published.economic_partition) expect(JSON.parse(request!.wire.economic_partition!)).toEqual(published.economic_partition);
    }
  });

  it.each([
    [{ surface: "FUND" }, "/manager/fund-overview"],
    [{ surface: "FLEET" }, "/manager/fleet"],
    [{ surface: "PORTFOLIO", id: "TEST_ONLY:portfolio" }, "/manager/portfolios/TEST_ONLY%3Aportfolio/overview"],
    [{ surface: "ALPHA", id: "a/b" }, "/manager/alphas/a%2Fb/overview"],
    [{ surface: "ACCOUNT", id: "acct 1" }, "/manager/accounts/acct%201/overview"],
    [{ surface: "DEPLOYMENT", id: "d-1" }, "/manager/deployments/d-1/overview"],
  ] as const)("%j is the route %s", (scope, path) => {
    const request = encodeManagerDatasetQuery({ ...scope, environment: "paper" } as ManagerDatasetQuery);
    expect(request?.path).toBe(path);
  });
});

describe("a request the server would refuse makes no fetch", () => {
  const base = { surface: "FLEET", environment: "live" } as const;
  const rows = (n: number, field = "health") => Array.from({ length: n }, (_, i) => ({ field, op: "EQ", value: `v${i}` }));
  const cases: [string, unknown][] = [
    ["an unknown environment", { ...base, environment: "prod" }],
    ["a scoped surface without its id", { surface: "PORTFOLIO", environment: "paper" }],
    ["a scoped surface with a blank id", { surface: "ALPHA", id: "   ", environment: "paper" }],
    ["an unknown surface", { surface: "WORLD", environment: "paper" }],
    ["a q_mode without q", { ...base, qMode: "PREFIX" }],
    ["an unknown q_mode", { ...base, q: "a", qMode: "FUZZY" }],
    ["a q over 160 characters", { ...base, q: "x".repeat(161) }],
    ["a blank q", { ...base, q: "   " }],
    ["a backwards window", { ...base, window: { fromMs: 20, toMs: 10 } }],
    ["an unknown preset", { ...base, window: "1Y" }],
    ["a negative window bound", { ...base, window: { fromMs: -1, toMs: 10 } }],
    ["a stage the environment does not hold", { ...base, stageFilter: ["PAPER"] }],
    ["an unknown stage", { ...base, stageFilter: ["RESEARCH"] }],
    ["a blank lifecycle_filter", { ...base, lifecycleFilter: "" }],
    ["an unknown filter field", { ...base, filters: [{ field: "secret", op: "EQ", value: "x" }] }],
    ["an unknown operator", { ...base, filters: [{ field: "health", op: "LIKE", value: "x" }] }],
    ["IN with no values", { ...base, filters: [{ field: "health", op: "IN", values: [] }] }],
    ["IN with 33 values", { ...base, filters: [{ field: "health", op: "IN", values: Array.from({ length: 33 }, (_, i) => `v${i}`) }] }],
    ["IN with a repeated value", { ...base, filters: [{ field: "health", op: "IN", values: ["A", "A"] }] }],
    ["IN with a single value operand", { ...base, filters: [{ field: "health", op: "IN", values: ["A"], value: "A" }] }],
    ["EQ with values", { ...base, filters: [{ field: "health", op: "EQ", value: "A", values: ["A"] }] }],
    ["EQ without a value", { ...base, filters: [{ field: "health", op: "EQ" }] }],
    ["IS_NULL with a value", { ...base, filters: [{ field: "health", op: "IS_NULL", value: "A" }] }],
    ["a numeric field compared with text", { ...base, filters: [{ field: "net_pnl", op: "GTE", value: "ten" }] }],
    ["a numeric IN with an exponent", { ...base, filters: [{ field: "score", op: "IN", values: ["1e3"] }] }],
    ["17 filters", { ...base, filters: rows(17) }],
    ["a filter value over 256 characters", { ...base, filters: [{ field: "health", op: "EQ", value: "x".repeat(257) }] }],
    ["4 sort keys", { ...base, sort: [{ field: "name", direction: "asc" }, { field: "health", direction: "asc" }, { field: "venue", direction: "asc" }, { field: "lifecycle", direction: "asc" }] }],
    ["the same sort field twice", { ...base, sort: [{ field: "name", direction: "asc" }, { field: "name", direction: "desc" }] }],
    ["an unknown sort direction", { ...base, sort: [{ field: "name", direction: "up" }] }],
    ["an unknown sort field", { ...base, sort: [{ field: "secret", direction: "asc" }] }],
    ["3 group fields", { ...base, groupBy: ["health", "venue", "lifecycle"] }],
    ["the same group field twice", { ...base, groupBy: ["health", "health"] }],
    ["a field the dataset cannot group by", { ...base, groupBy: ["name"] }],
    ["a partition missing a field", { ...base, economicPartition: { economicDomain: "ACTUAL", currency: "USDT", basis: "b", nativeProfileRef: "n" } }],
    ["a partition of an unknown domain", { ...base, economicPartition: { economicDomain: "REAL", currency: "USDT", basis: "b", nativeProfileRef: "n", domainProofRef: "d" } }],
    ["limit 0", { ...base, limit: 0 }],
    ["limit 201", { ...base, limit: 201 }],
    ["limit 1.5", { ...base, limit: 1.5 }],
    ["after and before together", { ...base, after: "a", before: "b" }],
    ["an empty cursor", { ...base, after: "" }],
    ["a cursor over 4096 characters", { ...base, after: "x".repeat(4097) }],
  ];
  it.each(cases)("%s", async (_name, query) => {
    const calls = serve(fixtureValue(FIXTURE_EMPTY));
    const result = await api().getManagerDataset(query as ManagerDatasetQuery);
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    if (!result.ok) expect(result.reason).toContain("MANAGER_DATASET_QUERY_INVALID");
  });

  it("an empty list means 'not asked' and is not sent", () => {
    const request = encodeManagerDatasetQuery({ ...base, filters: [], sort: [], groupBy: [], stageFilter: [] });
    expect(Object.keys(request!.wire)).toEqual(["environment"]);
  });
});

describe("the body answers THIS question or it is unavailable", () => {
  const LIVE = (extra: Partial<ManagerDatasetQuery> = {}): ManagerDatasetQuery => ({ surface: "FLEET", environment: "live", ...extra } as ManagerDatasetQuery);

  function serveDouble(variant: DatasetVariant = "ok", population = alphasOf(6, [["LIVE"], ["CANARY", "LIVE"], ["CANARY"]], { healths: ["READY", "ATTENTION", null] })) {
    const state = newDatasetDouble({ live: population }, variant);
    vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
    return state;
  }

  it("reads a body the double built from the published lifecycle fixture, with the producer's lifecycle scalars", async () => {
    serveDouble();
    const result = await api().getManagerDataset(LIVE({ sort: [{ field: "current_stage", direction: "asc" }], groupBy: ["current_stage"], limit: 50 }));
    if (!result.ok) throw new Error(result.reason);
    const { items, groups, page, stageLifecycle } = result.value;
    expect(items.map((row) => row.currentStage)).toEqual(["CANARY", "CANARY", "LIVE", "LIVE", null, null]);
    expect(items.filter((row) => row.currentStage === null).every((row) => row.stageLifecycleReasons.currentStage === "MULTIPLE_ACTIVE_STAGES")).toBe(true);
    expect(items.every((row) => row.enteredAtMs === null && row.daysInStage === null)).toBe(true);
    expect(groups.map((g) => [g.key[0]!.value, g.uniqueRowCount])).toEqual([["CANARY", 2], ["LIVE", 2], [null, 2]]);
    expect(page).toMatchObject({ limit: 50, returnedCount: 6, authorizedFilteredCount: 6, nextCursor: null });
    expect(stageLifecycle.entryTime).toBe("STAGE_ENTRY_TIME_NOT_PUBLISHED");
  });

  it("reads the canonical lifecycle.live fixture as published when the query asks for what it states", async () => {
    serve(fixtureValue(FIXTURE_LIFECYCLE_LIVE));
    const result = await api().getManagerDataset(LIVE());
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.items.map((row) => [row.currentStage, row.stageLifecycleReasons.currentStage])).toEqual([["LIVE", null], [null, "MULTIPLE_ACTIVE_STAGES"]]);
  });

  it("reads the canonical partitions fixture (two currencies stay two partitions)", async () => {
    serve(fixtureValue(FIXTURE_PARTITIONS));
    // The fixture publishes one group by portfolio_id: asked without it, the body would answer another question.
    const result = await api().getManagerDataset({ surface: "FLEET", environment: "paper", groupBy: ["portfolio_id"] });
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.items.map((row) => row.economicPartitions.map((p) => p.partition.currency))).toEqual([["USDT"], ["USDT", "EUR"]]);
    expect(result.value.capitalStatements.map((entry) => entry.partition.currency)).toEqual(["USDT", "EUR"]);
  });

  it("paging: the cursor chain walks 130 rows in pages of 50 and the last page has no cursor", async () => {
    serveDouble("ok", alphasOf(130, [["LIVE"]]));
    const first = await api().getManagerDataset(LIVE({ limit: 50 }));
    if (!first.ok) throw new Error(first.reason);
    expect(first.value.items).toHaveLength(50);
    expect(first.value.hasMore).toBe(true);
    const second = await api().getManagerDataset(LIVE({ limit: 50, after: first.value.page.nextCursor! }));
    if (!second.ok) throw new Error(second.reason);
    const third = await api().getManagerDataset(LIVE({ limit: 50, after: second.value.page.nextCursor! }));
    if (!third.ok) throw new Error(third.reason);
    expect(third.value.items).toHaveLength(30);
    expect(third.value.hasMore).toBe(false);
    const keys = [first, second, third].flatMap((r) => (r.ok ? r.value.items.map((row) => row.rowKey) : []));
    expect(new Set(keys).size).toBe(130);
    expect(third.value.page.authorizedFilteredCount).toBe(130);
  });

  it("a 200-row page reads (the schema's largest page) and keeps the cap honest", async () => {
    serveDouble("ok", alphasOf(260, [["LIVE"], ["CANARY"]]));
    const result = await api().getManagerDataset(LIVE({ limit: 200 }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.items).toHaveLength(200);
    expect(result.value.page).toMatchObject({ returnedCount: 200, authorizedFilteredCount: 260 });
    expect(result.value.hasMore).toBe(true);
  });

  it("a cursor of another filter is the server's 409, a typed failure", async () => {
    serveDouble("ok", alphasOf(130, [["LIVE"]]));
    const first = await api().getManagerDataset(LIVE({ limit: 50 }));
    if (!first.ok) throw new Error(first.reason);
    const other = await api().getManagerDataset(LIVE({ limit: 50, q: "alpha", qMode: "CONTAINS", after: first.value.page.nextCursor! }));
    expect(other).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("a server filter (IN) is applied by the server and the body is judged against it", async () => {
    const state = serveDouble();
    const result = await api().getManagerDataset(LIVE({ filters: [{ field: "health", op: "IN", values: ["READY", "ATTENTION"] }], limit: 50 }));
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.items.map((row) => row.health).sort()).toEqual(["ATTENTION", "ATTENTION", "READY", "READY"]);
    expect(state.calls[0]!.filters).toEqual([{ field: "health", op: "IN", values: ["READY", "ATTENTION"] }]);
  });

  it.each<[DatasetVariant, ManagerDatasetQuery, string]>([
    ["wrong:environment", LIVE(), "environment"],
    ["wrong:surface", LIVE(), "surface"],
    ["wrong:workspace", LIVE({ workspaceId: "ws-1" }), "workspace"],
    ["wrong:window", LIVE({ window: "30D" }), "window"],
    ["wrong:window", LIVE(), "window"],
    ["wrong:limit", LIVE({ limit: 50 }), "limit"],
    ["wrong:group", LIVE({ groupBy: ["current_stage"] }), "group_by"],
    ["wrong:group", LIVE(), "group_by"],
    ["wrong:filter", LIVE({ filters: [{ field: "health", op: "EQ", value: "READY" }] }), "filters"],
    ["wrong:filter", LIVE({ filters: [{ field: "health", op: "IN", values: ["READY", "ATTENTION"] }] }), "filters"],
    ["wrong:stage", LIVE({ stageFilter: ["CANARY"] }), "stage_filter"],
    ["wrong:sort", LIVE({ sort: [{ field: "current_stage", direction: "asc" }] }), "sort"],
  ])("%s -> unavailable: another question (%#)", async (variant, query, mismatch) => {
    serveDouble(variant);
    const result = await api().getManagerDataset(query);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    if (!result.ok) {
      expect(result.reason).toContain("MANAGER_DATASET_ANSWERS_ANOTHER_QUERY");
      expect(result.reason).toContain(mismatch);
    }
  });

  it("a scoped surface must be about the scope asked: another portfolio's rows are refused", async () => {
    const state = newDatasetDouble({ live: alphasOf(3, [["LIVE"]]) });
    vi.stubGlobal("fetch", wrapDatasetFetch(null, state));
    const result = await api().getManagerDataset({ surface: "PORTFOLIO", id: "pf-OTHER", environment: "live" });
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    if (!result.ok) expect(result.reason).toContain("scope");
    const alpha = await api().getManagerDataset({ surface: "ALPHA", id: "a-001", environment: "live" });
    expect(alpha.ok).toBe(false);
    const mine = await api().getManagerDataset({ surface: "PORTFOLIO", id: "pf-1", environment: "live" });
    expect(mine.ok).toBe(true);
  });

  it("another schema is its own typed reason, not 'could not be read'", async () => {
    serveDouble("other-schema");
    const result = await api().getManagerDataset(LIVE());
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    if (!result.ok) expect(result.reason).toContain("UNSUPPORTED_SCHEMA portal.execution.manager-dataset.v0");
  });

  it.each<DatasetVariant>(["malformed", "garbage"])("%s keeps the reader's refusal", async (variant) => {
    serveDouble(variant);
    const result = await api().getManagerDataset(LIVE());
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    if (!result.ok) expect(result.reason).toMatch(/MANAGER_DATASET_REFUSED|could not be read/);
  });

  it.each([400, 401, 403, 404, 409, 422, 500, 503])("a %i is a typed failure, never rows", async (status) => {
    serve({ error: { code: "SOME_CODE", message: "refused" } }, status);
    const result = await api().getManagerDataset(LIVE());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("a network failure is unavailable", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    expect(await api().getManagerDataset(LIVE())).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("every published negative invariant (MD-1..MD-8) served as a 200 is unavailable", async () => {
    const file = loadCanonical<{ cases: { id: string; ops: Draft[] }[] }>(FIXTURE_INVARIANT_CASES);
    for (const c of file.cases) {
      const body = fixtureValue(FIXTURE_PARTITIONS);
      const at = (path: (string | number)[]): Draft => path.reduce((node: Draft, key) => node[key], body);
      for (const op of c.ops) {
        const parent = at(op.path.slice(0, -1));
        const key = op.path.at(-1);
        if (op.op === "set") parent[key] = clone(op.value);
        else if (op.op === "delete") delete parent[key];
        else if (op.op === "append") parent[key].push(clone(op.value));
        else if (op.op === "append_copy") parent[key].push(clone(at(op.from)));
        else if (op.op === "set_copy") parent[key] = clone(at(op.from));
        else throw new Error(`unknown operation ${op.op}`);
      }
      serve(body);
      const result = await api().getManagerDataset({ surface: "FLEET", environment: "paper" });
      expect(result.ok, c.id).toBe(false);
    }
  });

  it("the fixture api answers unavailable (the dataset is not part of the fixture set)", async () => {
    expect(await createFixtureApi().getManagerDataset({ surface: "FLEET", environment: "paper" })).toMatchObject({ ok: false, status: "unavailable" });
  });
});

describe("datasetQueryMismatch is the pure guard", () => {
  const body = (change?: (draft: Draft) => void) => {
    const draft = fixtureValue(FIXTURE_LIFECYCLE_LIVE);
    change?.(draft);
    const read = readManagerDataset(draft);
    if (read === null || read.kind !== "dataset") throw new Error("expected a dataset");
    return read.dataset;
  };

  it("accepts the lifecycle fixture for the question it states, refuses it for another environment, scope or stage", () => {
    const dataset = body();
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live" })).toBeNull();
    expect(datasetAnswersQuery(dataset, { surface: "FLEET", environment: "paper" })).toBe(false);
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live", stageFilter: ["LIVE"] })).toBe("stage_filter");
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live", stageFilter: ["CANARY", "LIVE"] })).toBeNull();
    expect(datasetQueryMismatch(dataset, { surface: "PORTFOLIO", id: "TEST_ONLY:portfolio", environment: "live" })).toBe("surface");
  });

  it("a custom window must be the window the server states it selected", () => {
    const dataset = body((draft) => {
      draft.selected_window = { requested: { from_ms: 1, to_ms: 9 }, resolved: { from_ms: 1, to_ms: 9 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
    });
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live", window: { fromMs: 1, toMs: 9 } })).toBeNull();
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live", window: { fromMs: 1, toMs: 10 } })).toBe("window");
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live", window: "7D" })).toBe("window");
    expect(datasetQueryMismatch(dataset, { surface: "FLEET", environment: "live" })).toBe("window");
  });

  it("the canonical dataset fixtures are valid ManagerDataset bodies (the oracle the double builds on)", () => {
    expect(datasetViolations(fixtureValue(FIXTURE_LIFECYCLE_LIVE))).toEqual([]);
    expect(validateAgainst(OPENAPI, DATASET_POINTER, datasetAnswer("/manager/fleet", new URLSearchParams({ environment: "live", limit: "10" }), newDatasetDouble({ live: alphasOf(3, [["LIVE"], ["CANARY", "LIVE"]]) })).body)).toEqual([]);
  });

  it("a snapshot id the double changes is still a dataset (the screen is the one that compares pages)", () => {
    const state = newDatasetDouble({ live: alphasOf(2, [["LIVE"]]) });
    state.snapshot = SNAPSHOT_B;
    const answer = datasetAnswer("/manager/fleet", new URLSearchParams({ environment: "live" }), state);
    expect((answer.body as { snapshot_id: string }).snapshot_id).toBe(SNAPSHOT_B);
  });
});
