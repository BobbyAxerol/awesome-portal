/**
 * N29-FE-01 §10 — the controlled same-origin BFF test double.
 *
 * Runs in Playwright's Node context and answers `/api/v1/execution/**` with
 * RAW contract payloads: the canonical JSON fixtures in
 * `packages/contracts/fixtures/` plus the raw fixture modules the unit suite
 * already drift-checks against them. The browser under test runs the real
 * product HTTP client and parsers — never `createFixtureApi` — so what these
 * runs prove is the product path: fetch, CSRF, typed problems, readers.
 *
 * An endpoint this table does not know is answered 501 with its path in the
 * body, so a forgotten route fails loudly instead of rendering a silently
 * empty screen.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { answerOperationsV2 } from "./bffDoubleV2";
import { answerAccount } from "./bffDoubleAccount";
import { simulate, simulatedRunResult } from "./bffSimulated";
import { answerAlpha } from "./bffDoubleAlpha";
import { answerGovernance } from "./bffDoubleGovernance";
import { answerManager } from "./bffDoubleManager";
import { answerReviewManager } from "../../fixture-bff/review-manager";
import { answerOverview } from "./bffDoubleOverview";
import { answerPortfolios } from "./bffDoublePortfolios";
import { answerStage, isStageDeployment, withStageQuality } from "./bffDoubleStage";
import { addDecimal, scaled, sumByCurrency, type AlphaSpec } from "./bffScale";
import { isPositiveMode } from "./bffPositiveMode";
import { NATIVE_ALPHAS } from "./bffWorld";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): unknown => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8"));
const CC_SNAPSHOT_BUSY = canonical("execution-command-center.busy.valid.json") as Record<string, unknown>;
const PAPER_OVERVIEW_READY = canonical("execution-paper-overview.ready.valid.json") as Record<string, unknown>;
const SANDBOX_OVERVIEW_READY = canonical("execution-sandbox-overview.ready.valid.json") as Record<string, unknown>;
const LIVE_OVERVIEW_EMPTY = canonical("execution-live-overview.empty.valid.json") as Record<string, unknown>;
const FULL_BLOTTER_PARTIAL = canonical("execution-full-blotter.partial.valid.json") as Record<string, unknown>;
const PAPER_WORKBENCH_PARTIAL = canonical("execution-paper-workbench.partial.valid.json") as Record<string, unknown>;
const PAPER_WORKBENCH_VNM_PARTIAL = canonical("execution-paper-workbench-vnm.partial.valid.json") as Record<string, unknown>;
const QUERY_ANALYTICS_EMPTY = canonical("execution-query-analytics.empty.valid.json") as Record<string, unknown>;
const COMMAND_TASKS = canonical("execution-command-tasks.valid.json") as Record<string, unknown>;
const APPROVAL_CREATED = canonical("execution-governance.approval-create.valid.json") as Record<string, unknown>;
const COMMAND_OPERATION = canonical("execution-command-operation.valid.json") as Record<string, unknown>;
const ORDER_FUNNEL = canonical("execution-analytics.order-funnel.valid.json") as Record<string, unknown>;
const CAPITAL_PREVIEW = canonical("execution-analytics.capital-preview.valid.json") as Record<string, unknown>;
const INSIGHT_BATCH = canonical("execution-analytics.insight-batch.valid.json") as Record<string, unknown>;
const CORRELATION = canonical("execution-analytics.correlation.valid.json") as Record<string, unknown>;
const CAPITAL_LEDGER = canonical("execution-analytics.capital-ledger.valid.json") as Record<string, unknown>;
const BINDING_EXPOSURE = canonical("execution-analytics.binding-exposure.valid.json") as Record<string, unknown>;
const ALPHA_FLEET = canonical("execution-alpha-fleet-list.v2.valid.json") as Record<string, unknown>;
const PORTFOLIO_LIST = canonical("execution-portfolio-list.valid.json") as Record<string, unknown>;
const BINDINGS_LIST = canonical("execution-bindings-list.valid.json") as Record<string, unknown>;
const BINDING_DETAIL = canonical("execution-binding-detail.valid.json") as Record<string, unknown>;
const SANDBOX_NOTE_CAPTURE = canonical("execution-governance.review-capture.sandbox-note.valid.json") as Record<string, unknown>;
const LIVE_REVIEW = canonical("governance-live-review.valid.json") as Record<string, unknown>;
const ACCOUNT_BROKER_READY = canonical("execution-account-broker-360.ready.valid.json") as Record<string, unknown>;

import {
  APPROVAL_ROWS,
  CONDITION_FIXTURES,
  EXIT_DETAIL,
  R2_DETAIL,
  matchesView,
} from "../src/execution/api/fixtureData";
import {
  CANARY_ROOM_FIXTURE,
  LIVE_FULL_FIXTURE,
  SANDBOX_CERTIFICATION_FIXTURE,
} from "../src/execution/certification.fixtures";
import {
  INCIDENT_OPEN_FIXTURE,
  OPERATIONS_QUEUE_FIXTURE,
  OPERATION_WORKFLOW_FIXTURE,
} from "../src/execution/operations.fixtures";
import { COMMAND_CATALOGUE_FIXTURE, COMMAND_PLAN_FIXTURE } from "../src/execution/adminCatalog.fixtures";
import {
  ACTIVATION_CAPABILITIES,
  APPROVAL_HISTORY,
  SOURCE_HEALTH_READ,
} from "../src/execution/derivedReads.fixtures";
import { CROSS_EQUITY, RUNTIME_MANIFEST } from "../src/execution/analytics.presentation.fixtures";
import { SCREEN_CONTRACTS_PUBLISHED } from "./bffDoubleCatalogue";
import { approvalHistoryEnvelope, approvalInboxEnvelope, conditionsRegisterEnvelope, r1ReviewEnvelope } from "./bffDoubleApprovalEnvelopes";
import { scopedResourceV2 } from "./bffDoubleScopedResource";

interface Answer {
  status: number;
  body: unknown;
  contentType?: string;
}

const ok = (body: unknown): Answer => ({ status: 200, body });

function problem(status: number, code: string, message: string): Answer {
  return { status, body: { error: { code, message } } };
}

/** The unit double's rows, plus the generated ones when the standalone server runs at a larger scale. */
const approvalRows = (): Record<string, unknown>[] => {
  const extra = scaled().approvals;
  return extra.length === 0 ? APPROVAL_ROWS : [...APPROVAL_ROWS, ...extra];
};

/** Raw inbox page — the same rows and view semantics the unit double uses. */
function approvalsPage(search: URLSearchParams): Answer {
  const rows = approvalRows();
  const view = search.get("filter") ?? search.get("view") ?? "ALL";
  const inView = rows.filter((r) => matchesView(r, view));
  const limit = Number(search.get("limit") ?? 50);
  const after = search.get("after");
  const start = after ? inView.findIndex((r) => String(r.approval_id) === after) + 1 : 0;
  const slice = inView.slice(start, start + limit);
  const sla = (r: Record<string, unknown>) => (r.sla ?? {}) as Record<string, unknown>;
  const overdue = rows.filter(
    (r) => typeof sla(r).age_minutes === "number" && typeof sla(r).budget_minutes === "number" && (sla(r).age_minutes as number) > (sla(r).budget_minutes as number),
  ).length;
  return ok(approvalInboxEnvelope({
    rows: slice,
    total_count: rows.length,
    filtered_count: inView.length,
    next_cursor: start + limit < inView.length && slice.length > 0 ? String(slice[slice.length - 1].approval_id) : null,
    prev_cursor: start > 0 && slice.length > 0 ? String(slice[0].approval_id) : null,
    has_more: start + limit < inView.length,
    has_previous: start > 0,
  }, { pending: rows.length, overdue, due_soon: 1 }, search.get("workspace_id") ?? "ws_fixture_governance"));
}

function waiversPage(search: URLSearchParams): Answer {
  const state = search.get("state");
  const filtered = CONDITION_FIXTURES.filter((c) => !state || c.state === state);
  const ids = filtered.map((c) => String(c.condition_id));
  const limit = Number(search.get("limit") ?? 50);
  const after = search.get("after");
  const before = search.get("before");
  let start = 0;
  let end = filtered.length;
  if (after) start = ids.indexOf(after) + 1;
  if (before) {
    end = ids.indexOf(before);
    start = Math.max(0, end - limit);
  }
  const window = filtered.slice(start, Math.min(end, start + limit));
  return ok(conditionsRegisterEnvelope({
    schema_version: "governance.conditions-register.v1",
    record_authority: "PORTAL_CONTROL",
    delivery_profile: "portal",
    read_at: "2026-08-31T12:00:00.000Z",
    actor: { user_id: "usr_bobby", username: "bobby", roles: ["ADMIN"] },
    page: {
      rows: window,
      total_count: CONDITION_FIXTURES.length,
      filtered_count: filtered.length,
      next_cursor: start + window.length < filtered.length ? String(window[window.length - 1]?.condition_id ?? "") || null : null,
      prev_cursor: start > 0 ? String(window[0]?.condition_id ?? "") || null : null,
      has_more: start + window.length < filtered.length,
      has_previous: start > 0,
    },
  }, state));
}

function liveReview(approvalId: string): Answer {
  const backbone = LIVE_REVIEW.governance_backbone as Record<string, unknown>;
  const data = backbone.data as Record<string, unknown>;
  const approval = data.approval as Record<string, unknown>;
  return ok({
    ...LIVE_REVIEW,
    approval_id: approvalId,
    governance_backbone: {
      ...backbone,
      data: { ...data, approval: { ...approval, approval_id: approvalId } },
    },
  });
}

const COMMAND_OPERATION_ID = String(
  (COMMAND_OPERATION as Record<string, unknown>).operation_id ??
    ((COMMAND_OPERATION as Record<string, Record<string, unknown>>).operation ?? {}).operation_id ??
    "",
);

/**
 * `GET /alphas` over five distinct rows (UXM-07 S1a): different owners, every
 * stage, a row that needs attention, a row with several deployments and one
 * that is research only. The first row is the canonical fixture row, byte for
 * byte, so the V1 journeys that assert it do not change. Filters, sort and the
 * keyset cursor follow the real read: `search` contains on the label, `stage`
 * matches any stage the alpha is in, `owner` and `health` are exact, `after`
 * and `before` are alpha ids of the page edge.
 */
/**
 * The original single-row answer, kept for every consumer that is not a V2 screen: the V1 command
 * center and account journeys record baselines against it, so richer fixture data for the V2 Fleet
 * must never reach them (it grew the V1 pages by 170 px).
 */
function legacyAlphaFleet(search: URLSearchParams): Answer {
  const requested = search.get("search");
  if (!requested) return ok(ALPHA_FLEET);
  const page = ALPHA_FLEET.page as Record<string, unknown>;
  const rows = Array.isArray(page.rows) ? page.rows as Record<string, unknown>[] : [];
  return ok({
    ...ALPHA_FLEET,
    page: {
      ...page,
      rows: rows.map((row) => ({ ...row, alpha_id: requested, alpha_label: requested })),
    },
  });
}

export function alphaFleet(search: URLSearchParams): Answer {
  const page = ALPHA_FLEET.page as Record<string, unknown>;
  const base = (Array.isArray(page.rows) ? page.rows as Record<string, unknown>[] : [])[0] ?? {};
  type Money = { currency: string; allocation: string; exposure: string; realized: string; unrealized: string };
  const dep = (id: string, stage: string, venue: string, account: string, portfolio: [string, string], health: string, state: string, active: boolean, updated: string, money?: Money) => ({
    deployment_id: id, stage, venue, account_id: account, portfolio_id: portfolio[0], portfolio_name: portfolio[1], currency: money?.currency ?? "USDT",
    allocation: money?.allocation ?? "10000", balance_total: money?.allocation ?? "10000",
    balance_free: money ? addDecimal(money.allocation, `-${money.exposure}`) : "10000", balance_locked: money?.exposure ?? "0", position_fact_count: 0,
    realized_pnl: money?.realized ?? "0", unrealized_pnl: money?.unrealized ?? "0", net_pnl: money ? addDecimal(money.realized, money.unrealized) : "0", exposure: money?.exposure ?? "0",
    state, active, health, updated_at: updated,
  });
  /** Per-currency totals of one deployment field; a currency is never added to another. */
  const totals = (deployments: Record<string, unknown>[], field: string) =>
    sumByCurrency(deployments.map((d) => ({ currency: d.currency as string, value: d[field] as string })));
  const PF_MAIN: [string, string] = ["pf_main", "Main"];
  const PF_SAT: [string, string] = ["pf_sat", "Satellite"];
  const row = (
    id: string, label: string, version: string, owner: string | null, stages: string[], health: string,
    attention: string[], deployments: Record<string, unknown>[], updated: string,
  ) => ({
    ...base,
    alpha_id: id, alpha_label: label, version, stage: stages[0], stages, owner,
    portfolios: [...new Map(deployments.map((d) => [d.portfolio_id as string, { portfolio_id: d.portfolio_id, name: d.portfolio_name, base_currency: d.currency }])).values()],
    deployments,
    allocations: totals(deployments, "allocation"),
    balances: totals(deployments, "balance_total").map(({ currency, value }) => ({
      currency, total: value,
      free: totals(deployments, "balance_free").find((x) => x.currency === currency)!.value,
      locked: totals(deployments, "balance_locked").find((x) => x.currency === currency)!.value,
    })),
    position_pnl: deployments.some((d) => d.realized_pnl !== "0")
      ? totals(deployments, "realized_pnl").map(({ currency, value }) => ({
        currency, realized: value,
        unrealized: totals(deployments, "unrealized_pnl").find((x) => x.currency === currency)!.value,
        net: totals(deployments, "net_pnl").find((x) => x.currency === currency)!.value,
      }))
      : [],
    exposure: totals(deployments, "exposure"),
    health, attention_reasons: attention, updated_at: updated,
  });
  const worldRow = (a: AlphaSpec): Record<string, unknown> => row(a.id, a.label, a.version, a.owner, a.stages, a.health, a.attention,
    a.deployments.map((d) => dep(d.id, d.stage, d.venue, d.accountId, [d.portfolioId, d.portfolioName], d.health, d.state, d.active, d.updatedAt,
      { currency: d.currency, allocation: d.allocation, exposure: d.exposure, realized: d.realized, unrealized: d.unrealized })), a.updatedAt);
  // WORLD (positive-like scenarios): the Alpha Fleet read counts the alphas, deployments and portfolios of the ONE world: the native books, the
  // research idea and the generated alphas; the hand-written five of the doubles stay for the specs.
  const worldFleet: Record<string, unknown>[] = isPositiveMode()
    ? [...NATIVE_ALPHAS.map(worldRow), row("alpha_e", "Idea E", "0.1", null, ["RESEARCH"], "RESEARCH_ONLY", [], [], "2026-09-01T12:00:00Z")]
    : [];
  const all: Record<string, unknown>[] = isPositiveMode() ? [...worldFleet, ...scaled().alphas.map(worldRow)] : [
    base,
    row("alpha_b", "Basis B", "1.4", "Lan-002", ["LIVE", "CANARY"], "READY", [], [
      dep("dep_b1", "LIVE", "BINANCE", "acc_b1", PF_MAIN, "READY", "ACTIVE", true, "2026-09-01T15:10:00Z"),
      dep("dep_b2", "LIVE", "OKX", "acc_b2", PF_SAT, "READY", "ACTIVE", true, "2026-09-01T15:09:00Z"),
      dep("dep_b3", "CANARY", "BINANCE", "acc_b3", PF_MAIN, "READY", "ACTIVE", true, "2026-09-01T15:08:00Z"),
    ], "2026-09-01T15:10:00Z"),
    row("alpha_c", "Momentum C", "2.0", "Minh-003", ["CANARY"], "ATTENTION", ["DEPLOYMENT_ATTENTION", "RECONCILIATION_OPEN"], [
      dep("dep_c1", "CANARY", "OKX", "acc_c1", PF_SAT, "ATTENTION", "HALTED", false, "2026-09-01T14:00:00Z"),
    ], "2026-09-01T14:00:00Z"),
    row("alpha_d", "Grid D", "0.9", "Bobby-001", ["SANDBOX", "PAPER"], "READY", [], [
      dep("dep_d1", "SANDBOX", "OKX", "acc_d1", PF_SAT, "READY", "ACTIVE", true, "2026-09-01T13:00:00Z"),
      dep("dep_d2", "PAPER", "BINANCE", "acc_d2", PF_SAT, "FINDING", "ACTIVE", true, "2026-09-01T12:59:00Z"),
    ], "2026-09-01T13:00:00Z"),
    row("alpha_e", "Idea E", "0.1", null, ["RESEARCH"], "RESEARCH_ONLY", [], [], "2026-09-01T12:00:00Z"),
    // Empty unless the standalone server runs at a larger scale (e2e/bffScale.ts).
    ...scaled().alphas.map((a) => row(a.id, a.label, a.version, a.owner, a.stages, a.health, a.attention,
      a.deployments.map((d) => dep(d.id, d.stage, d.venue, d.accountId, [d.portfolioId, d.portfolioName], d.health, d.state, d.active, d.updatedAt,
        { currency: d.currency, allocation: d.allocation, exposure: d.exposure, realized: d.realized, unrealized: d.unrealized })), a.updatedAt)),
  ];

  const text = (key: string) => (search.get(key) ?? "").trim();
  const needle = text("search").toLowerCase();
  const stageFilter = text("stage").toUpperCase();
  const owner = text("owner");
  const health = text("health");
  let rows = all.filter((item) =>
    (!needle || String(item.alpha_label).toLowerCase().includes(needle))
    && (!stageFilter || (item.stages as string[]).includes(stageFilter))
    && (!owner || item.owner === owner)
    && (!health || item.health === health));

  const rank: Record<string, number> = { RESEARCH: 0, PAPER: 1, SANDBOX: 2, CANARY: 3, LIVE: 4 };
  const keyOf = (item: Record<string, unknown>, field: string): string | number | null => {
    switch (field) {
      case "alpha_id": case "alpha_label": case "stage": case "health": case "updated_at": return String(item[field]);
      case "stage_rank": return rank[String(item.stage)] ?? -1;
      default: return null;
    }
  };
  const sortRaw = text("sort");
  const sorts = sortRaw === "" ? [] : sortRaw.split(",").map((token) => {
    const t = token.trim();
    const [field, dir = "asc"] = t.startsWith("-") ? [t.slice(1), "desc"] : t.startsWith("+") ? [t.slice(1), "asc"] : t.split(":");
    return { field, direction: dir };
  });
  if (sorts.some((s) => keyOf(base, s.field) === null || (s.direction !== "asc" && s.direction !== "desc"))) {
    return problem(400, "INVALID_SORT", "sort must name a published field with asc or desc.");
  }
  if (sorts.length > 0) {
    rows = [...rows].sort((left, right) => {
      for (const { field, direction } of [...sorts, { field: "alpha_id", direction: "asc" }]) {
        const a = keyOf(left, field)!; const b = keyOf(right, field)!;
        if (a !== b) return (a < b ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
  }

  const requestedLimit = text("limit") === "" ? 50 : Number(text("limit"));
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
    return problem(400, "INVALID_PAGE_LIMIT", "limit must be between 1 and 200.");
  }
  const after = text("after");
  const before = text("before");
  const edge = (cursor: string) => rows.findIndex((item) => item.alpha_id === cursor);
  let start = 0;
  let end = Math.min(rows.length, requestedLimit);
  if (after) {
    const at = edge(after);
    if (at < 0) return problem(400, "INVALID_CURSOR", "after is not a cursor of this query.");
    start = at + 1; end = Math.min(rows.length, start + requestedLimit);
  } else if (before) {
    const at = edge(before);
    if (at < 0) return problem(400, "INVALID_CURSOR", "before is not a cursor of this query.");
    end = at; start = Math.max(0, end - requestedLimit);
  }
  const window = rows.slice(start, end);

  const larger = scaled().alphas.length > 0;
  const sum = (items: Record<string, unknown>[], key: string) => {
    if (larger) {
      // Per currency, exact: a book that spans USDT and JPY publishes two totals, never one.
      const entries = items.flatMap((item) => item[key] as { currency: string; value: string }[]);
      return entries.length > 0 ? sumByCurrency(entries) : [{ currency: "USDT", value: "0" }];
    }
    const total = items.flatMap((item) => item[key] as Record<string, string>[]).reduce((acc, value) => acc + Number(value.value), 0);
    return [{ currency: "USDT", value: String(total) }];
  };
  const pnlTotals = () => {
    const entries = all.flatMap((item) => item.position_pnl as { currency: string; realized: string; unrealized: string; net: string }[]);
    return [...new Set(entries.map((e) => e.currency))].sort().map((currency) => {
      const mine = entries.filter((e) => e.currency === currency);
      const add = (field: "realized" | "unrealized" | "net") => mine.reduce((acc, e) => addDecimal(acc, e[field]), "0");
      return { currency, realized: add("realized"), unrealized: add("unrealized"), net: add("net") };
    });
  };
  const stageCounts = Object.fromEntries([...new Set(all.flatMap((item) => item.stages as string[]))].sort()
    .map((stage) => [stage, all.filter((item) => (item.stages as string[]).includes(stage)).length]));
  const summary = {
    ...(ALPHA_FLEET.summary as Record<string, unknown>),
    alpha_count: all.length,
    deployment_count: all.reduce((n, item) => n + (item.deployments as unknown[]).length, 0),
    portfolio_count: new Set(all.flatMap((item) => (item.portfolios as { portfolio_id: string }[]).map((p) => p.portfolio_id))).size,
    needs_attention_count: all.filter((item) => item.health === "ATTENTION").length,
    research_only_count: all.filter((item) => item.health === "RESEARCH_ONLY").length,
    stage_counts: stageCounts,
    allocation_by_currency: sum(all, "allocations"),
    exposure_by_currency: sum(all, "exposure"),
    ...(larger ? { current_position_pnl_by_currency: pnlTotals() } : {}),
  };
  const applied = [
    ["alpha_label", "contains", needle], ["stage", "contains", stageFilter], ["owner", "eq", owner], ["health", "eq", health],
  ].filter(([, , value]) => value).map(([field, op, value]) => ({ field, op, value }));
  return ok({
    ...ALPHA_FLEET,
    summary,
    page: {
      ...page,
      rows: window,
      total_count: all.length,
      filtered_count: rows.length,
      next_cursor: end < rows.length ? String(window[window.length - 1]?.alpha_id ?? "") || null : null,
      prev_cursor: start > 0 ? String(window[0]?.alpha_id ?? "") || null : null,
      has_more: end < rows.length,
      has_previous: start > 0,
      applied_filters: applied,
      ...(sorts.length > 0 ? { applied_sort: sorts } : {}),
    },
  });
}

function realtimeSnapshot(environment: string): Answer {
  const epoch = `e2e-${environment}`;
  return ok({
    schema_version: "portal.execution.profile-realtime.v1",
    event_type: "snapshot",
    terminal: false,
    reconnect_required: false,
    cursor: `${epoch}:1`,
    projection_epoch: epoch,
    projection_sequence: 1,
    payload: { environment },
  });
}

/**
 * Stable, wire-shaped EDS-05/EDS-07 fixtures for the browser's same-origin
 * contract double.  These are deliberately server envelopes, not client-side
 * mock objects: the real HTTP readers must parse every field below.  A new
 * rich panel therefore fails here if its named BFF operation was forgotten,
 * instead of looking empty because a generic catch-all silently answered it.
 */
const E2E_READ_AT = "2026-09-06T12:00:01.000Z";
const E2E_AS_OF = "2026-09-06T12:00:00.000Z";
const E2E_READ_AT_MS = Date.parse(E2E_READ_AT);
const E2E_AS_OF_MS = Date.parse(E2E_AS_OF);
const E2E_INPUT_DIGEST = `sha256:${"e".repeat(64)}`;

function e2eProfileId(environment: string): string {
  switch (environment) {
    case "paper": return "PAPER_BINANCE_USDM";
    case "sandbox": return "SANDBOX_BINANCE_USDM";
    case "live": return "LIVE_BINANCE_USDM";
    default: return "UNKNOWN_PROFILE";
  }
}

function validEnvironment(environment: string | null): environment is "paper" | "sandbox" | "live" {
  return environment === "paper" || environment === "sandbox" || environment === "live";
}

function derivationEnvelope(
  logicalOperationId: string,
  environment: "paper" | "sandbox" | "live",
  data: Record<string, unknown>,
  state: "READY" | "PARTIAL" | "EMPTY" = "READY",
  reasonCode: string | null = null,
): Record<string, unknown> {
  return {
    schema_version: "execution.derivation.v1",
    logical_operation_id: logicalOperationId,
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "workspace_execution_manager",
    environment,
    profile_id: e2eProfileId(environment),
    read_at: E2E_READ_AT,
    as_of: E2E_AS_OF,
    read_at_ms: E2E_READ_AT_MS,
    as_of_ms: E2E_AS_OF_MS,
    state,
    reason_code: reasonCode,
    freshness: "FRESH",
    completeness: state === "PARTIAL" ? "PARTIAL" : "COMPLETE",
    formula: {
      id: `${logicalOperationId}.fixture`,
      version: "v1",
      currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
      temporal_policy: "UTC_EPOCH_MS",
    },
    input_population: [{
      relation: "portal.e2e.current-observation",
      state: "AVAILABLE",
      reason_code: null,
      population: "1",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of_ms: E2E_AS_OF_MS,
    }],
    input_digest: E2E_INPUT_DIGEST,
    data,
  };
}

function sourceHealthEnvelope(environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return {
    ...derivationEnvelope("executionSourceHealthV1", environment, {}),
    schema_version: "execution.derivation.source-health.v1",
    requested_environment: environment,
    profiles: [{
      environment,
      profile_id: e2eProfileId(environment),
      state: "READY",
      reason_code: null,
      availability: "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of: E2E_AS_OF,
      read_at_ms: E2E_READ_AT_MS,
      global_sequence: null,
      retention_floor_ms: null,
      replay_eligible: false,
      projection_revision: { epoch: `e2e-${environment}`, sequence: "1" },
    }],
    source_side_effect_requested: false,
  };
}

function deploymentQualityEnvelope(deploymentId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return derivationEnvelope("executionDeploymentQualityV1", environment, {
    deployment_id: deploymentId,
    execution_session_population: "1",
    order_population: "2",
    fill_population: "1",
    submitted_count: "2",
    risk_rejected_count: "0",
    broker_rejected_count: "0",
    filled_count: "1",
    rejected_count: "0",
    reject_rate: { numerator: "0", denominator: "2" },
    latency_state: "UNAVAILABLE",
    latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
    current_observation_only: true,
  }, "PARTIAL", "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED");
}

function portfolioCapitalEnvelope(portfolioId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return derivationEnvelope("executionPortfolioCapitalV1", environment, {
    portfolio_id: portfolioId,
    portfolio: {
      name: "Primary execution portfolio",
      base_currency: "USDT",
      state: "ACTIVE",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: E2E_AS_OF,
    },
    allocation_by_currency: [{ currency: "USDT", population: "1", allocated_capital: "20000", max_capital: "50000" }],
    account_balance_by_currency: [{ currency: "USDT", population: "1", total: "20123.19605", free: "19123.19605", locked: "1000" }],
    currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
    unpublished_inputs: [],
    current_observation_only: true,
  });
}

function alphaActivityEnvelope(alphaId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return derivationEnvelope("executionAlphaActivityV1", environment, {
    alpha_id: alphaId,
    strategy_id: alphaId,
    deployment_population: "1",
    session_population: "1",
    order_population: "2",
    fill_population: "1",
    state_counts: { COMPLETED: "1" },
    order_status_counts: { FILLED: "1", NEW: "1" },
    latest_observed_at: E2E_AS_OF,
    retained_input_range_not_event_replay: true,
  });
}

/**
 * BR-EX-81's four exact named subject reads. The browser test double exposes
 * the same bounded retained-current semantics as the Portal controller: it
 * never presents a source lifecycle replay or an Edge relation selector.
 */
function subjectActivityEnvelope(
  subjectKind: "alpha" | "account",
  subjectId: string,
  relation: "orders" | "fills",
  search: URLSearchParams,
): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const strategyId = subjectKind === "alpha" ? subjectId : "adaptive_hma_cpp_00115m";
  const accountId = subjectKind === "account" ? subjectId : "paper-binance-adaptive_hma_cpp_00115m";
  const order = {
    order_id: `ord-${subjectKind}-${subjectId}-entry`,
    client_order_id: `${subjectId}-en1`,
    execution_session_id: `session-${subjectId}`,
    strategy_id: strategyId,
    account_id: accountId,
    instrument_id: "ETHUSDT.BINANCE",
    symbol: "ETHUSDT",
    side: "BUY",
    order_type: "MARKET",
    status: "FILLED",
    price: "1859.89",
    quantity: "0.08",
    submitted_at: "2026-09-06T11:45:00.000Z",
    updated_at: E2E_AS_OF,
    reduce_only: false,
    post_only: false,
    time_in_force: "GTC",
  };
  const fill = {
    fill_id: `fill-${subjectKind}-${subjectId}-entry`,
    client_order_id: order.client_order_id,
    execution_session_id: order.execution_session_id,
    strategy_id: strategyId,
    account_id: accountId,
    instrument_id: order.instrument_id,
    symbol: order.symbol,
    side: order.side,
    price: order.price,
    quantity: order.quantity,
    trade_time: "2026-09-06T11:45:01.000Z",
    realized_pnl: "0",
    commission: "0.02",
    commission_currency: "USDT",
    liquidity_side: "TAKER",
    trade_id: `trade-${subjectKind}-${subjectId}-entry`,
  };
  const records = relation === "orders"
    ? [{ record_id: order.order_id, values: order }]
    : [{ record_id: fill.fill_id, values: fill }];
  return {
    schema_version: "portal.execution.subject-records.v1",
    logical_operation_id: `execution${subjectKind === "alpha" ? "Alpha" : "Account"}${relation === "orders" ? "Orders" : "Fills"}V1`,
    authority: "PORTAL_SGP_RETAINED_CURRENT_WINDOW",
    source_authority: "TRADING_SYSTEM_CURRENT_SOURCE",
    history_semantics: "RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",
    environment,
    profile_id: e2eProfileId(environment),
    resource: {
      kind: subjectKind,
      id: subjectId,
      resolution: subjectKind === "account" ? "EXACT_ACCOUNT_ID" : "PUBLISHED_STRATEGY_ID",
    },
    timeframe: subjectKind === "alpha"
      ? { value: "15m", provenance: "DERIVED_STRATEGY_ID_SUFFIX", source_field: null }
      : { value: null, provenance: "UNAVAILABLE", source_field: null },
    source_health: { availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of_ms: E2E_AS_OF_MS },
    coverage: {
      retained_row_count: records.length,
      oldest_observed_at_ms: E2E_AS_OF_MS,
      newest_observed_at_ms: E2E_AS_OF_MS,
      source_completeness: "COMPLETE",
      source_window: "CURRENT_SOURCE_CURSOR_TRAVERSAL",
    },
    state: "AVAILABLE",
    page: { limit: Math.min(500, Math.max(1, Number(search.get("limit") ?? 200))), returned_count: records.length, has_more: false, next_cursor: null },
    records,
    projection: {
      epoch_id: `e2e-${environment}`,
      sequence: 1,
      source_as_of_ms: E2E_AS_OF_MS,
      last_successful_refresh_at_ms: E2E_READ_AT_MS,
      completeness: "COMPLETE",
    },
  };
}

/** A typed Market Context absence: no transport error and no fabricated bar. */
function unavailableMarketCandles(search: URLSearchParams): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const venue = search.get("venue") ?? "BINANCE";
  const market = search.get("market") ?? (venue === "OKX" ? "SWAP" : "USDM");
  const symbol = search.get("symbol") ?? "ETHUSDT";
  const interval = search.get("interval") ?? "1h";
  const from = Number(search.get("from_ms"));
  const to = Number(search.get("to_ms"));
  return {
    schema_version: "portal.execution.market-candles.v1",
    logical_operation_id: "executionMarketCandlesV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "VENUE_PUBLIC_MARKET_DATA",
    environment,
    profile_id: e2eProfileId(environment),
    source: {
      kind: "venue_public",
      venue,
      market,
      endpoint: null,
      instrument: symbol,
      note: "The E2E contract doubles a typed absence; it does not fabricate OHLCV.",
    },
    symbol,
    interval,
    interval_ms: interval === "15m" ? 900_000 : interval === "1m" ? 60_000 : interval === "5m" ? 300_000 : interval === "30m" ? 1_800_000 : interval === "4h" ? 14_400_000 : interval === "1d" ? 86_400_000 : 3_600_000,
    state: "UNAVAILABLE",
    reason_code: "E5_MARKET_CANDLES_NOT_PUBLISHED",
    retryable: false,
    fetched_at_ms: null,
    read_at_ms: E2E_READ_AT_MS,
    coverage: {
      from_ms: Number.isFinite(from) ? from : null,
      to_ms: Number.isFinite(to) ? to : null,
      requested_limit: Number(search.get("limit") ?? 500),
      returned_count: 0,
      truncated: false,
      pages: 0,
    },
    last_candle_closed: null,
    candles: [],
  };
}

/** EDS-09 observation only: current rows with explicit non-replay semantics. */
function observedTimelineEnvelope(search: URLSearchParams): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const subjectKind = search.get("subject_kind") ?? "alpha";
  const subjectId = search.get("subject_id") ?? "adaptive_hma_cpp_00115m";
  const accountId = subjectKind === "account" ? subjectId : "paper-binance-adaptive_hma_cpp_00115m";
  return {
    schema_version: "portal.execution.observed-timeline-bff.v1",
    logical_operation_id: "executionObservedTimelineV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM_CURRENT_STATE",
    observation_authority: "PORTAL_OBSERVATION",
    observation_semantics: "BOUNDED_CURRENT_PAGE",
    environment,
    profile_id: e2eProfileId(environment),
    resource: { kind: subjectKind.toUpperCase(), id: subjectId },
    projection: {
      epoch_id: `e2e-${environment}`,
      sequence: 1,
      source_as_of_ms: E2E_AS_OF_MS,
      received_at_ms: E2E_READ_AT_MS,
      last_successful_refresh_at_ms: E2E_READ_AT_MS,
      completeness: "COMPLETE",
    },
    observed_timeline: {
      state: "READY",
      reason_code: null,
      retryable: false,
      freshness: { as_of_ms: E2E_AS_OF_MS, read_at_ms: E2E_READ_AT_MS },
      source_history_semantics: "BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY",
      data: {
        label: "OBSERVED_TIMELINE",
        ordering_rule: "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1",
        entries: [{
          observed_at_ms: E2E_AS_OF_MS,
          source_clock: "ORDER_UPDATED_AT",
          observation_type: "ORDER_OBSERVED",
          source_record: { kind: "ORDER", id: `ord-${subjectId}` },
          resource: { strategy_id: subjectKind === "alpha" ? subjectId : "adaptive_hma_cpp_00115m", account_id: accountId, instrument_id: "ETHUSDT.BINANCE" },
          values: { price: "1859.89", quantity: "0.08", realized_pnl: null },
          rejected_exact_value_fields: [],
        }],
        unavailable_segments: [
          { segment: "BROKER_ACKNOWLEDGEMENT", state: "UNAVAILABLE", reason_code: "EDS10_BROKER_ACK_CLOCK_SOURCE_GAP_CONFIRMED" },
          { segment: "AUTHORITATIVE_CORRECTION_TOMBSTONE", state: "UNAVAILABLE", reason_code: "EDS10_CORRECTION_TOMBSTONE_SOURCE_GAP_CONFIRMED" },
          { segment: "GLOBAL_EVENT_SEQUENCE", state: "UNAVAILABLE", reason_code: "EDS10_GLOBAL_EVENT_SEQUENCE_SOURCE_GAP_CONFIRMED" },
        ],
      },
    },
    mark_context: {
      state: "READY",
      reason_code: null,
      data: {
        label: "DERIVED · mark-context",
        marks: [{ position_id: `pos-${subjectId}`, instrument_id: "ETHUSDT.BINANCE", mark_price: "1861.00", mark_price_at_ms: E2E_AS_OF_MS }],
        unavailable_market_context: { state: "UNAVAILABLE", reason_code: "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED" },
      },
    },
    page: { limit: Math.min(200, Math.max(1, Number(search.get("limit") ?? 100))), has_more: false, next_cursor: null },
  };
}

function financialChartEnvelope(search: URLSearchParams): Record<string, unknown> {
  const environment = validEnvironment(search.get("environment")) ? search.get("environment")! : "paper";
  const subjectKind = search.get("subject_kind") ?? "alpha";
  const subjectId = search.get("subject_id") ?? "alpha_a";
  const metric = search.get("metric") ?? "equity";
  const fromMs = Number(search.get("from_ms") ?? E2E_AS_OF_MS - 3_600_000);
  const toMs = Number(search.get("to_ms") ?? E2E_AS_OF_MS);
  const start = Number.isSafeInteger(fromMs) ? fromMs : E2E_AS_OF_MS - 3_600_000;
  const end = Number.isSafeInteger(toMs) ? toMs : E2E_AS_OF_MS;
  return {
    schema_version: "execution.financial-chart.v1",
    logical_operation_id: "executionFinancialChartV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "DERIVED",
    workspace_id: search.get("workspace_id") ?? "workspace_execution_manager",
    environment,
    profile_id: e2eProfileId(environment),
    subject: { kind: subjectKind, id: subjectId },
    metric,
    panel: {
      state: "PARTIAL",
      reason_code: "E2E_CURRENT_OBSERVATION_RANGE",
      retryable: false,
      clocks: { as_of_ms: E2E_AS_OF_MS, read_at_ms: E2E_READ_AT_MS, source_published_at_ms: E2E_AS_OF_MS },
      coverage: {
        from_ms: start,
        to_ms: end,
        source_total: null,
        filtered_total: "3",
        returned_count: 3,
        truncated: false,
        downsampled: false,
        has_more: false,
        gaps: [],
      },
      formula: {
        formula_id: "e2e.current-observation-financial-chart.v1",
        formula_version: "v1",
        input_digest: E2E_INPUT_DIGEST,
        input_revision: `e2e-${environment}:1`,
      },
      data: {
        comparison_mode: "SINGLE_SUBJECT",
        scale_mode: "LINEAR",
        currency_policy: "PARTITIONED_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
        series: [{
          id: `${subjectKind}:${subjectId}:${metric}`,
          label: `${subjectId} ${metric}`,
          account_id: "acc_a",
          currency: "USDT",
          points: [[start, "20000.00000"], [Math.trunc((start + end) / 2), "20061.59802"], [end, "20123.19605"]],
        }],
        sampling: {
          algorithm: "IDENTITY_CURRENT_OBSERVATION_V1",
          source_rows: "3",
          numeric_rows: "3",
          rejected_rows: "0",
          returned_rows: 3,
          target_points: 256,
          bucket_seconds: null,
          preserves_extrema: true,
          preserves_first_last: true,
          preserves_gaps: true,
          gap_semantics: "NO_GAPS_IN_E2E_FIXTURE",
          marker_semantics: "NONE",
        },
        retention: {
          retention_floor_ms: null,
          retention_floor_state: "UNKNOWN",
          oldest_available_ms: start,
          newest_available_ms: end,
          history_semantics: "RETAINED_SNAPSHOT_RANGE_NOT_EVENT_REPLAY_OR_TOTAL_HISTORY",
        },
        benchmark: {
          requested: search.get("include_benchmark") === "true",
          state: "UNAVAILABLE",
          reason_code: "EDS11R4_MARKET_CONTEXT_NOT_ACTIVATED",
        },
      },
    },
  };
}

function objectRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => item !== null && typeof item === "object" && !Array.isArray(item)
      ? [item as Record<string, unknown>] : [])
    : [];
}

function withoutPhysicalBrokerRef(row: Record<string, unknown>): Record<string, unknown> {
  const { external_account_ref: _externalAccountRef, ...safe } = row;
  return safe;
}

/**
 * Raw endpoint fixture for the four EDS-04 resource routes. It deliberately
 * lives in this Node-only BFF double rather than importing Fixture Lab, whose
 * JSON module imports are browser-bundler semantics. Values are drawn from
 * the canonical fixtures already loaded above; the account branch also proves
 * the browser never receives the physical broker reference.
 */
function resourceEnvelope(kind: "alpha" | "portfolio" | "account" | "binding", id: string): unknown {
  const fleet = ALPHA_FLEET as Record<string, unknown>;
  const fleetPage = fleet.page as Record<string, unknown> | undefined;
  const fleetRow = objectRows(fleetPage?.rows)[0] ?? {};
  const rawDeployments = objectRows(fleetRow.deployments);
  const alphaId = kind === "alpha" ? id : String(fleetRow.alpha_id ?? "alpha_a");
  const accountId = kind === "account"
    ? id
    : kind === "binding"
      ? id.split("@")[0] || "acc_a"
      : String(rawDeployments[0]?.account_id ?? "acc_a");
  const deployments = rawDeployments.map((row) => ({
    ...row,
    strategy_id: alphaId,
    account_id: accountId,
    mode: typeof row.mode === "string" ? row.mode : "paper",
  }));
  const deployment: Record<string, unknown> = deployments[0] ?? {
    deployment_id: "dep_a", strategy_id: alphaId, account_id: accountId,
    mode: "paper", venue: "BINANCE", currency: "USDT",
  };
  const base = {
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM",
    workspace_id: "primary",
    selected_environment: "paper",
    read_at: "2026-09-02T06:00:01.000Z",
    as_of: "2026-09-02T06:00:00.000Z",
    read_at_ms: Date.parse("2026-09-02T06:00:01.000Z"),
    as_of_ms: Date.parse("2026-09-02T06:00:00.000Z"),
    freshness: "FRESH",
    completeness: "COMPLETE",
    capabilities: [],
    panels: {},
    unavailable_branches: [],
  };
  const common = {
    strategies: [{ strategy_id: alphaId, alpha_id: alphaId, label: String(fleetRow.alpha_label ?? alphaId), version: String(fleetRow.version ?? "not published"), trader_id: String(fleetRow.owner ?? "owner not published"), mode: "paper", updated_at: base.as_of }],
    deployments,
    accounts: [{ account_id: accountId, strategy_id: alphaId, mode: "paper", venue: "BINANCE", base_currency: "USDT", updated_at: base.as_of }],
    account_balances: [{ account_id: accountId, currency: "USDT", total: "20123.19605", free: "20123.19605", locked: "0", updated_at: base.as_of }],
    margin_balances: [{ account_id: accountId, currency: "USDT", initial: "100", maintenance: "50", updated_at: base.as_of }],
    account_sync: [{ sync_id: "sync_a", account_id: accountId, mode: "paper", venue: "BINANCE", source: "EXECUTION", status: "SYNCED", synced_at: base.as_of }],
    broker_sync: [{ sync_id: "broker_sync_a", mode: "paper", venue: "BINANCE", status: "SYNCED", currency: "USDT", buying_power: "20123.19605", synced_at: base.as_of }],
    venue_accounts: [{ binding_id: `${accountId}@BINANCE`, account_id: accountId, mode: "paper", venue: "BINANCE", state: "ACTIVE", updated_at: base.as_of }],
    positions: [{ position_id: "pos_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", quantity: "0.1", avg_px_open: "60000", mark_price: "61000", unrealized_pnl: "100", notional: "6100", currency: "USDT", updated_at: base.as_of }],
    orders: [{ order_id: "ord_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", instrument_id: "BTCUSDT", status: "FILLED", quantity: "0.1", price: "60000", submitted_at: "2026-09-02T05:00:00.000Z" }],
    fills: [],
    sessions: [{ execution_session_id: "ses_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", state: "COMPLETED", accounting_recovered_count: "1", reconciliation_deferred_count: "0", reconciliation_actionable_count: "0", updated_at: "2026-09-02T05:01:00.000Z" }],
    performance: [{ id: "perf_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", currency: "USDT", net_pnl: "123.19605", realized_pnl: "23.19605", fee_total: "0.5", equity: "20123.19605", ts: base.as_of }],
    account_equity: [{ id: "eq_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", currency: "USDT", equity: "20123.19605", total_notional: "6100", ts: base.as_of }],
    portfolio_allocations: [{ portfolio_id: "pf_main", portfolio_name: "Main", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", currency: "USDT", allocated_capital: "20000", updated_at: base.as_of }],
    reconciliation: [{ finding_id: "rec_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", finding_type: "POSITION", status: "RESOLVED", resolved_at: base.as_of }],
    journal: [{ command_id: "cmd_a", deployment_id: deployment.deployment_id, strategy_id: alphaId, account_id: accountId, mode: "paper", venue: "BINANCE", command_kind: "INSPECT", aggregate_key: alphaId, outcome_class: "SUCCESS", updated_at: base.as_of }],
  };
  if (kind === "alpha") {
    return { ...base, schema_version: "execution.alpha-resource.v1", state: "ready", data: { ...common, alpha: { ...fleetRow, alpha_id: id }, profile_coverage: { paper: { state: "FOUND" } } } };
  }
  if (kind === "portfolio") {
    const portfolio = {
      portfolio_id: id, name: id, owner: "bobby", base_currency: "USDT", state: "ACTIVE",
      deployments: deployments.map((row) => ({ ...row, portfolio_id: id })),
      allocations: common.portfolio_allocations.map((row) => ({ ...row, portfolio_id: id })),
      allocation_by_currency: [{ currency: "USDT", value: "20000" }], holdings_count: deployments.length, account_ids: [accountId],
    };
    return { ...base, schema_version: "execution.portfolio-resource.v1", state: "ready", data: { ...common, deployments: portfolio.deployments, portfolio_allocations: portfolio.allocations, portfolios: [{ portfolio_id: id, name: id, base_currency: "USDT", state: "ACTIVE" }], portfolio, profile_coverage: { paper: { state: "FOUND" } } } };
  }
  if (kind === "account") {
    const source = ACCOUNT_BROKER_READY as Record<string, unknown>;
    const sourceData = source.data as Record<string, unknown> | undefined;
    const sourceRows = (key: string) => objectRows(sourceData?.[key]).map(withoutPhysicalBrokerRef);
    const sourceAccount = sourceRows("accounts")[0] ?? {};
    const account = { ...sourceAccount, account_id: id, label: "BINANCE · execution account", deployments: [] };
    return {
      ...base,
      schema_version: "execution.account-resource.v1",
      state: "ready",
      selected_environment: "live",
      data: {
        ...common,
        accounts: [account],
        account_balances: sourceRows("account_balances").map((row) => ({ ...row, account_id: id })),
        margin_balances: sourceRows("margin_balances").map((row) => ({ ...row, account_id: id })),
        broker_sync: sourceRows("broker_sync"),
        deployments: [],
        account,
        differences: sourceRows("differences"),
        exposure_headroom: sourceRows("exposure_headroom"),
        profile_coverage: { live: { state: "FOUND" } },
      },
    };
  }
  const binding = { binding_id: id, account_id: accountId, venue: "BINANCE", state: "ACTIVE", credential_state: "SYNC_SYNCED", updated_at: base.as_of };
  return { ...base, schema_version: "execution.binding-resource.v1", state: "ready", data: { ...common, binding, profile_coverage: { paper: { state: "FOUND" } } } };
}

/**
 * The paper-workbench contract is resource-scoped.  Canonical fixtures retain
 * a deterministic deployment payload, while the route supplies the resource
 * identity; make that binding explicit in the test BFF instead of leaking
 * `dep_1` into every rich workbench journey.
 */
function paperWorkbenchEnvelope(deploymentId: string, variant: "standard" | "vn-market"): Record<string, unknown> {
  const fixture = variant === "vn-market" ? PAPER_WORKBENCH_VNM_PARTIAL : PAPER_WORKBENCH_PARTIAL;
  const data = (fixture.data as Record<string, unknown>) ?? {};
  const deployment = (data.deployment as Record<string, unknown>) ?? {};
  const deployments = objectRows(data.deployments).map((row) => ({ ...row, deployment_id: deploymentId }));

  return {
    ...fixture,
    resource: { ...((fixture.resource as Record<string, unknown>) ?? {}), id: deploymentId },
    data: {
      ...data,
      deployment: { ...deployment, deployment_id: deploymentId },
      deployments,
    },
  };
}

/**
 * The composition routes are their screen's one bounded read.  Keeping a
 * controlled raw answer here makes the browser exercise the exact
 * `getOperationalComposition()` path rather than quietly falling back to a
 * standalone fixture read.  Command authority remains explicitly fail-closed.
 */
function operationalCompositionEnvelope(
  surface: "command-center" | "operations" | "waivers" | "admin-action-drawer",
  search: URLSearchParams,
): Record<string, unknown> {
  const data = surface === "command-center"
    ? { command_center: CC_SNAPSHOT_BUSY }
    : surface === "operations"
      ? { operations_queue: OPERATIONS_QUEUE_FIXTURE }
      : surface === "waivers"
        ? { waivers_register: waiversPage(search).body }
        : {
          task_catalogue: COMMAND_TASKS,
          command_authority: {
            state: "FAIL_CLOSED",
            relay_active: false,
            source_side_effect_requested: false,
          },
        };
  return {
    schema_version: "execution.operational-composition.v1",
    logical_operation_id: `execution${surface.replace(/(^|-)\w/g, (part) => part.replace("-", "").toUpperCase()).replace(/\s/g, "")}V1`,
    record_authority: "PORTAL_CONTROL",
    source_authority: "PORTAL_CONTROL_PLUS_ACCEPTED_TRADING_SYSTEM_OBSERVATIONS",
    workspace_id: "workspace_execution_manager",
    read_at: E2E_READ_AT,
    read_at_ms: E2E_READ_AT_MS,
    composite_revision: `sha256:${surface.replace(/-/g, "").padEnd(64, "0")}`,
    source_health: SOURCE_HEALTH_READ,
    redacted_command_journal: {
      state: "AVAILABLE",
      reason_code: null,
      retention: "E2E_REDACTED_JOURNAL",
      entries: [],
    },
    canary_twin_comparison: {
      state: "UNAVAILABLE",
      reason_code: "E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED",
    },
    command_authority: {
      state: "UNCHANGED_FAIL_CLOSED",
      source_side_effect_requested: false,
    },
    data,
  };
}

/** One alpha's sparse current-stage series; not an implied historical replay. */
function stageDriftEnvelope(alphaId: string): Record<string, unknown> {
  return {
    calendar: ["2026-09-04", "2026-09-05", "2026-09-06"],
    window: { days: 3, daily_basis: "UTC close" },
    research_binding: { alpha_id: alphaId, reason_code: null },
    stages: {
      paper: { deployed: true, reason_code: null, series: [20000, 20061.59802, 20123.19605] },
      sandbox: { deployed: false, reason_code: "NO_DEPLOYMENT_IN_STAGE", series: [] },
      live: { deployed: false, reason_code: "NO_DEPLOYMENT_IN_STAGE", series: [] },
    },
  };
}

const MANAGER_CURRENT_ROUTES = new Set([
  "orders",
  "fills",
  "strategies",
  "strategy-deployments",
  "order-brackets",
  "order-bracket-legs",
  "conditional-order-groups",
  "conditional-order-group-legs",
  "portfolio-capital-ledger",
  "portfolio-equity-snapshots",
  "sizing-decisions",
  "execution-sessions",
  "command-journal",
  "broker-account-sync-current-state",
  "reconciliation-findings",
]);

/**
 * A page from the approved Manager-v2 relation catalogue.  This deliberately
 * keeps the continuation opaque and bounds the page; it never teaches a
 * product screen that a current relation page is authoritative replay.
 */
function managerCurrentRelationEnvelope(routeId: string, environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  const values: Record<string, string | number | boolean | null> = {
    relation_id: routeId,
    strategy_id: "adaptive_hma_cpp_00115m",
    account_id: "paper-binance-adaptive_hma_cpp_00115m",
    portfolio_id: "PF-CRYPTO",
    order_id: "ord-e2e-1",
    fill_id: "fill-e2e-1",
    status: "FILLED",
    venue: "BINANCE",
    symbol: "ETHUSDT",
    quantity: "0.08",
    price: "1859.89",
    updated_at: E2E_AS_OF_MS,
  };
  return {
    schema_version: "portal.execution.manager-relation-page.v1",
    logical_operation_id: `executionManager${routeId.replace(/(^|-)\w/g, (part) => part.replace("-", "").toUpperCase()).replace(/\s/g, "")}V1`,
    environment,
    profile_id: e2eProfileId(environment),
    state: "AVAILABLE",
    source_history_semantics: "CURRENT_CATALOGUE_BOUND_PAGE_NOT_AUTHORITATIVE_REPLAY",
    source_retention_semantics: "SOURCE_CURRENT_PAGESET_ONLY",
    source_health: {
      availability: "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of_ms: E2E_AS_OF_MS,
    },
    page: {
      next_cursor: null,
      has_more: false,
      total_unknown: true,
      maximum_page_rows: 200,
      truncated: false,
    },
    records: [{ resource_id: `${routeId}-e2e-1`, values }],
  };
}

function mirrorIntegrityEnvelope(environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  return {
    schema_version: "execution.durable-mirror-integrity.v1",
    environment,
    state: "UNAVAILABLE",
    reason_code: "EDS06_MIRROR_NEVER_MEASURED",
    measured_revision: null,
    measured_at_ms: null,
    read_at_ms: E2E_READ_AT_MS,
    gap_findings: null,
    conflict_findings: null,
    total_findings: null,
    findings: [],
  };
}

export interface BffDoubleOptions {
  /** UXM-07 S1c/S1d: answer the V2 operations queue and incident root. Off keeps the V1 shapes the existing journeys assert. */
  operationsV2?: boolean;
  /** UXM-07 S2: sparse-realistic answers for the V2 overview/blotter/admin/alpha/account/portfolio screens (they override the canonical ones the V1 journeys read). */
  screensV2?: boolean;
  /** The other five Manager dataset surfaces from the fixture-bff review answerer (populated profile). Off by default: the sparse default is unchanged. */
  reviewManager?: boolean;
  /**
   * SIMULATED fixture facts (FIXTURE_LAB, `bffSimulated.ts`) through the same routes and readers: queue status counts, account native
   * custody, budget, exposure, names and drawdown, blotter deployment, average price and fee. Implied by `reviewManager`; the fixture
   * BFF turns it on for its populated and layout-stress profiles. Off keeps the sparse default unchanged.
   */
  simulated?: boolean;
}

/**
 * `requestBody` is the parsed JSON of a write, for the one double that reads it
 * (`answerOverview`, the command-plan echo of `command_key`). The Playwright stub
 * passes none, which is how its answers have always been; the standalone server does.
 */
export function answerExecutionBff(method: string, pathname: string, search: URLSearchParams, options: BffDoubleOptions = {}, requestBody?: unknown): Answer {
  // ===== WP-E begin: a simulated connected read (bffSimulated `SIMULATED_CONNECTED_READS`) answers its local-projection receipt; any other task still 409s
  if (options.screensV2 === true && options.simulated === true && method.toUpperCase() === "POST") {
    const ran = /^\/api\/v1\/execution\/commands\/tasks\/([^/]+)\/run$/.exec(pathname);
    const receipt = ran === null ? null : simulatedRunResult(decodeURIComponent(ran[1]!));
    if (receipt !== null) return { status: 200, body: receipt } as Answer;
  }
  // ===== WP-E end
  const answer = answerExecutionBffBase(method, pathname, search, options, requestBody);
  if (options.screensV2 !== true || (options.simulated !== true && options.reviewManager !== true)) return answer;
  const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
  // The overview double answers the V2 queue too; the same V2 function answers it again with the counts the server would publish.
  if (method === "GET" && path === "/operations" && answer.status === 200 && (answer.body as { schema_version?: unknown } | null)?.schema_version === "portal.execution.operational-queue.v2") {
    return answerOperationsV2(method, path, search, true) ?? answer;
  }
  return simulate(method, path, search, answer as { status: number; body: unknown }) as Answer;
}

function answerExecutionBffBase(method: string, pathname: string, search: URLSearchParams, options: BffDoubleOptions = {}, requestBody?: unknown): Answer {
  const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
  const seg = path.split("/").filter(Boolean);

  if (options.screensV2) {
    // The S3 stage screens (Paper workbench, Sandbox, Canary, Live, New request): only their own deployments and writes.
    const stage = answerStage(method, path, seg, search, requestBody);
    if (stage !== null) return stage as Answer;
  }

  if (options.screensV2) {
    // The Manager series and Fleet dataset, and the three advisory governance reads: opt-in for the V2 lane, so the V1 stubs keep their 501.
    // Opt-in (`reviewManager`): the Manager dataset routes (fleet dataset and the five overview surfaces) come from the fixture-bff
    // review answerer (populated profile, small scale), so a visual cell that reads them is stubbed instead of 501/400. The sparse
    // default of the fixture BFF is unchanged. The series and realtime routes stay the sparse doubles.
    if (options.reviewManager === true) {
      const dataset = answerReviewDataset(method, path, search);
      if (dataset !== null) return dataset as Answer;
    }
    const published = answerManager(method, path, search) ?? answerGovernance(method, path, search, requestBody);
    if (published !== null) return published as Answer;
  }

  if (options.screensV2) {
    const search2 = search;
    const sparse =
      answerAlpha(method, path, search2) ??
      answerAccount(method, path, search2) ??
      answerPortfolios(method, path, search2) ??
      answerOverview(method, pathname, search2, requestBody);
    if (sparse !== null) return sparse as Answer;
  }

  if (options.operationsV2 && method === "GET") {
    const v2 = answerOperationsV2(method, path, search, options.simulated === true || options.reviewManager === true);
    if (v2 !== null) return v2;
  }

  if (method === "GET" && path === "/retained-review") {
    // UDB-03 (DEBT-UXM07-003): a normal stack has no retained review. The
    // honest answer is the server's typed "not configured" refusal, which the
    // consumer reads as status "absent"; serving a retained body would flip
    // every screen into read-only retained mode. Chromium still logs the 404,
    // so the specs allow exactly that URL and nothing else.
    return { status: 404, body: { error: { code: "UDB_RETAINED_REVIEW_NOT_CONFIGURED", message: "no retained review is configured for this stack" } } };
  }

  if (method === "GET") {
    /*
     * R3-3 · the Portal review capture BE-R2-8 published.
     *
     * The capabilities list must carry all six actions the contract names, and
     * the three source-owned ones stay UNAVAILABLE with their reason: this
     * double must not be the place a grant or promotion quietly becomes
     * offerable. The capture response is the canonical fixture, loaded.
     */
    if (path === "/governance/review-capture-capabilities") {
      return ok({
        schema_version: "governance.review-capture-capabilities.v1",
        authority: "PORTAL",
        source_side_effect_requested: false,
        actions: [
          { id: "SANDBOX_NOTE", state: "AVAILABLE", inputs: "certification_id,expected_workflow_version", path: "/api/v1/execution/governance/sandbox/capture-note" },
          { id: "R2_CREATE", state: "UNAVAILABLE", reason_code: "R2_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE" },
          { id: "PAPER_EXIT_CREATE", state: "UNAVAILABLE", reason_code: "PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE" },
          { id: "R2_EXECUTION_GRANT", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED_NOT_PORTAL_AUTHORED" },
          { id: "PAPER_EXIT_PROMOTE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED_NOT_PORTAL_AUTHORED" },
          { id: "SANDBOX_CERTIFY_SOURCE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED_NOT_PORTAL_AUTHORED" },
        ],
      });
    }
    if (path === "/runtime-manifest") return ok(RUNTIME_MANIFEST);
    if (path === "/screen-contracts") return ok(SCREEN_CONTRACTS_PUBLISHED);
    if (path === "/activation/capabilities") return ok(ACTIVATION_CAPABILITIES);
    if (path === "/governance/approvals/history") return ok(approvalHistoryEnvelope(APPROVAL_HISTORY));
    if (seg[0] === "durable-mirror" && seg[1] === "integrity" && seg.length === 2) {
      const environment = search.get("environment");
      if (!validEnvironment(environment)) return problem(400, "invalid_environment", "A profile environment is required.");
      return ok(mirrorIntegrityEnvelope(environment));
    }
    if (seg[0] === "compositions" && seg.length === 2) {
      const surface = seg[1];
      if (surface === "command-center" || surface === "operations" || surface === "waivers" || surface === "admin-action-drawer") {
        return ok(operationalCompositionEnvelope(surface, search));
      }
    }
    if (path === "/command-center") return ok(CC_SNAPSHOT_BUSY);
    if (path === "/command-center/realtime-snapshot") return realtimeSnapshot("command-center");
    if (path === "/command-center/stream") {
      const event = JSON.stringify({
        schema_version: "execution.command-center.stream.v1",
        event_type: "heartbeat",
        terminal: true,
        reconnect_required: false,
        cursor: "e2e-command-center:1",
        projection_epoch: "e2e-command-center",
        projection_sequence: 1,
      });
      return { status: 200, contentType: "text/event-stream", body: `event: heartbeat\ndata: ${event}\n\n` };
    }
    if (path === "/screens/paper") return ok(PAPER_OVERVIEW_READY);
    if (path === "/screens/sandbox") return ok(SANDBOX_OVERVIEW_READY);
    if (path === "/screens/live") return ok(LIVE_OVERVIEW_EMPTY);
    if (path === "/screens/blotter") return ok(FULL_BLOTTER_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "paper" && seg.length === 4 && seg[3] === "vn-market")
      return ok(paperWorkbenchEnvelope(seg[2], "vn-market"));
    if (seg[0] === "screens" && seg[1] === "paper" && seg.length === 3)
      return ok(paperWorkbenchEnvelope(seg[2], "standard"));
    if (seg[0] === "screens" && seg[1] === "accounts") {
      return ok({
        ...ACCOUNT_BROKER_READY,
        resource: { kind: "ACCOUNT", id: seg[2] },
        data: {
          ...(ACCOUNT_BROKER_READY.data as Record<string, unknown>),
          accounts: [
            {
              ...(((ACCOUNT_BROKER_READY.data as Record<string, unknown>).accounts as Record<string, unknown>[])[0] ?? {}),
              account_id: seg[2],
            },
          ],
        },
      });
    }
    if (
      seg[0] === "resources" && seg.length === 4 &&
      (seg[1] === "alphas" || seg[1] === "accounts") &&
      (seg[3] === "orders" || seg[3] === "fills")
    ) {
      return ok(subjectActivityEnvelope(seg[1] === "alphas" ? "alpha" : "account", seg[2]!, seg[3], search));
    }
    // EDS-04 rich detail screens use named resource BFFs.  The double serves
    // the same raw, wire-shaped fixture as Fixture Lab so browser journeys
    // exercise the real HTTP reader rather than a hidden client-side join.
    if (seg[0] === "resources" && seg.length === 3) {
      const [_, kind, id] = seg;
      if (kind === "alphas") return ok(resourceEnvelope("alpha", id));
      if (kind === "portfolios") return ok(resourceEnvelope("portfolio", id));
      if (kind === "accounts") return ok(resourceEnvelope("account", id));
      if (kind === "bindings") return ok(scopedResourceV2("BINDING", id, search) ?? resourceEnvelope("binding", id));
    }
    if (seg[0] === "profiles" && seg[2] === "realtime-snapshot") return realtimeSnapshot(seg[1]);
    if (seg[0] === "profiles" && seg[2] === "stream") {
      const epoch = `e2e-${seg[1]}`;
      const event = JSON.stringify({
        schema_version: "portal.execution.profile-realtime.v1",
        event_type: "heartbeat",
        terminal: true,
        reconnect_required: false,
        cursor: `${epoch}:1`,
        projection_epoch: epoch,
        projection_sequence: 1,
        payload: { reason_code: "E2E_STREAM_COMPLETE" },
      });
      return { status: 200, contentType: "text/event-stream", body: `event: heartbeat\ndata: ${event}\n\n` };
    }
    if (seg[0] === "derivations") {
      // This aggregate read is deliberately profile-wide. The three scoped
      // derivations below still require an environment, just like Control API.
      if (seg[1] === "source-health" && seg.length === 2 && !search.has("environment")) return ok(SOURCE_HEALTH_READ);
      const environment = search.get("environment");
      if (!validEnvironment(environment)) return problem(400, "invalid_environment", "A profile environment is required.");
      if (seg[1] === "source-health" && seg.length === 2) return ok(sourceHealthEnvelope(environment));
      if (seg[1] === "deployments" && seg[3] === "execution-quality" && seg.length === 4) {
        const quality = deploymentQualityEnvelope(seg[2], environment);
        return ok(options.screensV2 && isStageDeployment(seg[2]) ? withStageQuality(quality) : quality);
      }
      if (seg[1] === "portfolios" && seg[3] === "capital" && seg.length === 4)
        return ok(portfolioCapitalEnvelope(seg[2], environment));
      if (seg[1] === "alphas" && seg[3] === "activity" && seg.length === 4)
        return ok(alphaActivityEnvelope(seg[2], environment));
    }
    if (path === "/views/equity-chart") return ok(financialChartEnvelope(search));
    if (path === "/views/observed-timeline") return ok(observedTimelineEnvelope(search));
    if (path === "/market/venue-candles") return ok(unavailableMarketCandles(search));
    // The Trading System market-context candles: the canonical L0 body (source-bounded, AGING), not an invented series.
    // Only for the V2 screens: the V1 journeys record the 501 refusal in their baselines.
    if (options.screensV2 && path === "/market/candles") return ok(canonical("execution-market-context.candles.valid.json"));
    if (seg[0] === "manager" && seg[1] === "current" && seg.length === 3) {
      const environment = search.get("environment");
      if (!validEnvironment(environment)) return problem(400, "invalid_environment", "A profile environment is required.");
      if (MANAGER_CURRENT_ROUTES.has(seg[2])) return ok(managerCurrentRelationEnvelope(seg[2], environment));
    }
    if (path === "/alphas/equity-sparklines") {
      return ok({
        schema_version: "portal.execution.equity-sparklines.v1",
        series: {
          adaptive_hma_cpp_00115m: [20000, 20061.59802, 20123.19605],
          av_2041: [20000, 20061.59802, 20123.19605],
        },
      });
    }
    if (seg[0] === "alphas" && seg[2] === "stage-drift" && seg.length === 3) return ok(stageDriftEnvelope(seg[1]));
    if ((seg[0] === "alphas" || seg[0] === "portfolios") && seg[2] === "query-analytics") return ok(QUERY_ANALYTICS_EMPTY);
    if (path === "/commands/tasks") return ok(COMMAND_TASKS);
    if (path === "/commands/catalog") return ok(COMMAND_CATALOGUE_FIXTURE);
    if (path === "/alphas") return options.screensV2 ? alphaFleet(search) : legacyAlphaFleet(search);
    if (path === "/portfolios") return ok(PORTFOLIO_LIST);
    if (path === "/broker-bindings") return ok(BINDINGS_LIST);
    if (seg[0] === "broker-bindings" && seg.length === 2) {
      return ok({ ...BINDING_DETAIL, item: { ...((BINDING_DETAIL.item as object) ?? {}), binding_id: seg[1] } });
    }
    if (path === "/governance/approvals") return approvalsPage(search);
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "r1")
      return ok(r1ReviewEnvelope(seg[2]));
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "r2")
      return ok({ ...R2_DETAIL, approval: { ...(R2_DETAIL.approval as object), approval_id: seg[2] } });
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "live") return liveReview(seg[2]);
    if (seg[0] === "governance" && seg[1] === "exit-reviews" && seg.length === 3)
      return ok({ ...EXIT_DETAIL, review: { ...(EXIT_DETAIL.review as object), review_id: seg[2] } });
    if (path === "/governance/waivers") return waiversPage(search);
    if (path === "/operations") return ok(OPERATIONS_QUEUE_FIXTURE);
    if (seg[0] === "operations" && seg[1] === "incidents" && seg.length === 3) return ok(INCIDENT_OPEN_FIXTURE);
    if (seg[0] === "operations" && seg.length === 2)
      return ok(seg[1] === COMMAND_OPERATION_ID ? COMMAND_OPERATION : OPERATION_WORKFLOW_FIXTURE);
    if (seg[0] === "deployments" && seg[2] === "certification") return ok(SANDBOX_CERTIFICATION_FIXTURE);
    if (seg[0] === "deployments" && seg[2] === "canary") return ok(CANARY_ROOM_FIXTURE);
    if (seg[0] === "deployments" && seg[2] === "live") return ok(LIVE_FULL_FIXTURE);
    if (seg[0] === "orders" && seg[2] === "funnel") return ok(ORDER_FUNNEL);
    if (seg[0] === "portfolios" && seg[2] === "correlation") return ok(CORRELATION);
    if (seg[0] === "portfolios" && seg[2] === "capital-ledger") return ok(CAPITAL_LEDGER);
    if (seg[0] === "portfolios" && seg[2] === "cross-equity") return ok(CROSS_EQUITY);
    if (seg[0] === "broker-bindings" && seg[2] === "exposure") return ok(BINDING_EXPOSURE);
  }

  if (method === "POST") {
    if (path === "/governance/approvals") return { status: 201, body: APPROVAL_CREATED };
    // R3-3 · the canonical capture response, loaded rather than restated.
    if (path === "/governance/sandbox/capture-note") return { status: 201, body: SANDBOX_NOTE_CAPTURE };
    if (path === "/commands/plans") return ok(COMMAND_PLAN_FIXTURE);
    if (seg[0] === "approvals" && seg[2] === "capital-preview") return ok(CAPITAL_PREVIEW);
    if (seg[0] === "alphas" && seg[2] === "insight-previews") return ok(INSIGHT_BATCH);
    if (seg[0] === "operations" && (seg[2] === "acknowledge" || seg[2] === "resolve")) return ok(OPERATION_WORKFLOW_FIXTURE);
    if (seg[0] === "operations" && seg[2] === "apply") return { status: 202, body: COMMAND_OPERATION };
  }

  return { status: 501, body: { error: { code: "bff_double_gap", message: `the e2e BFF double has no answer for ${method} ${pathname}` } } };
}

/**
 * The parsed JSON of the three writes whose answer depends on what was sent (the New request create, the Sandbox note and the Paper exit request).
 * Every other request is answered without a body, exactly as the stub always has: `/commands/plans` would otherwise start
 * echoing its `command_key`, which the V1 journeys do not expect.
 */
function bodyOf(request: { method(): string; url(): string; postDataJSON?: () => unknown }): unknown {
  if (request.method() !== "POST" || typeof request.postDataJSON !== "function") return undefined;
  const path = new URL(request.url()).pathname.replace(/^\/api\/v1\/execution/, "");
  if (path !== "/governance/approvals" && path !== "/governance/sandbox/capture-note" && path !== "/governance/paper-exit/create") return undefined;
  try {
    return request.postDataJSON();
  } catch {
    return undefined;
  }
}

/** Register the double on a page. Same-origin only — nothing else is stubbed here. */
/**
 * The review answerer for the Manager dataset routes, for the visual lane only. The small-scale universe has the canonical template
 * rows, not this suite's ids (`pf_TEST_ONLY_core`, ...): a resource surface is answered from the FLEET dataset with the asked id
 * written into the rows, the group key and the surface, so the reader's scope/group checks hold and the simulated keys show.
 */
function answerReviewDataset(method: string, path: string, search: URLSearchParams): { status: number; body: unknown } | null {
  const match = /^(?:\/api\/v1\/execution)?\/manager\/(fund-overview|fleet|(portfolios|alphas|accounts|deployments)\/([^/]+)\/overview)$/.exec(path);
  if (match === null || method !== "GET") return null;
  const resource = match[2] as "portfolios" | "alphas" | "accounts" | "deployments" | undefined;
  const id = match[3] === undefined ? null : decodeURIComponent(match[3]);
  const asked = new URLSearchParams(search);
  const environment = asked.get("environment") ?? "paper";
  // A resource the review universe itself knows (this suite's alpha ids, portfolios Main/Satellite/Core, deployments) is answered by the
  // review answerer as it is: its own rows, ids and names, one single-book partition per row. Only an unknown id falls through to the relabel below.
  if (resource !== undefined && id !== null) {
    const direct = answerReviewManager("GET", path, asked, "populated");
    if (direct !== null && direct.status === 200) return direct;
  }
  let reply = answerReviewManager("GET", resource === undefined ? path : "/manager/fleet", asked, "populated");
  // The small template only has Paper rows; a Real-funded (live) or Sandbox question gets the same rows relabelled to the asked book,
  // so the lane shows data in every environment instead of an empty live dataset.
  const hollow = environment !== "paper" && reply !== null && reply.status === 200 && ((reply.body as { items?: unknown[] }).items ?? []).length === 0;
  const relabel = (body: any): void => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const domain = environment === "live" ? "ACTUAL" : "SANDBOX";
    const stage = environment === "live" ? "LIVE" : "SANDBOX";
    body.environment = environment;
    // Only the template's Paper partitions are relabelled: a Sandbox partition renamed Real-funded would repeat a currency under one book.
    const paperOnly = (list: any[]): any[] => list.filter((entry) => entry.partition.economic_domain === "PAPER"); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const row of body.items) row.economic_partitions = paperOnly(row.economic_partitions);
    body.capital_statements = paperOnly(body.capital_statements);
    for (const group of body.groups) group.economic_partitions = paperOnly(group.economic_partitions);
    for (const row of body.items) { row.stage_presence = [stage]; row.current_stage = stage; for (const child of row.children) child.stage = stage; for (const part of row.economic_partitions) part.partition.economic_domain = domain; }
    for (const part of body.capital_statements) part.partition.economic_domain = domain;
    for (const group of body.groups) for (const part of group.economic_partitions) part.partition.economic_domain = domain;
  };
  if (hollow) {
    const paper = new URLSearchParams(asked);
    paper.set("environment", "paper");
    reply = answerReviewManager("GET", resource === undefined ? path : "/manager/fleet", paper, "populated");
    if (reply !== null && reply.status === 200) { const copy = structuredClone(reply.body); relabel(copy); reply = { status: 200, body: copy }; }
  }
  // The portfolio list asks the FLEET dataset grouped by portfolio: one group per portfolio id of this suite (the template has its own ids).
  if (resource === undefined && reply !== null && reply.status === 200 && asked.get("group_by") === "portfolio_id") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = structuredClone(reply.body) as any;
    if (grouped.groups.length > 0) {
      const first = grouped.groups[0];
      grouped.groups = ["pf_TEST_ONLY_core", "pf_TEST_ONLY_satellite", "pf_TEST_ONLY_canary", "pf_TEST_ONLY_yen"].map((pid) => {
        const group = structuredClone(first);
        for (const part of group.key) if (part.field === "portfolio_id") part.value = pid;
        return group;
      });
      reply = { status: 200, body: grouped };
    }
  }
  if (reply === null || reply.status !== 200 || resource === undefined || id === null) return reply;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = structuredClone(reply.body) as any;
  body.surface = { portfolios: "PORTFOLIO", alphas: "ALPHA", accounts: "ACCOUNT", deployments: "DEPLOYMENT" }[resource];
  for (const row of body.items as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (resource === "portfolios") row.portfolio_id = id;
    if (resource === "alphas") row.alpha_id = id;
    if (resource === "accounts") for (const child of row.children) child.account_id = id;
    if (resource === "deployments") for (const child of row.children) child.deployment_id = id;
    row.row_key = JSON.stringify([row.alpha_id, row.alpha_version_id, row.portfolio_id]);
  }
  for (const group of body.groups as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (resource === "portfolios") for (const part of group.key) if (part.field === "portfolio_id") part.value = id;
    if (resource === "alphas") for (const part of group.key) if (part.field === "alpha_id") part.value = id;
  }
  return { status: 200, body };
}

export async function stubExecutionBff(page: Page, options: BffDoubleOptions = {}): Promise<void> {
  await page.route("**/api/v1/execution/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { status, body, contentType = "application/json" } = answerExecutionBff(request.method(), url.pathname, url.searchParams, options, bodyOf(request));
    return route.fulfill({
      status,
      contentType,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  });
}
