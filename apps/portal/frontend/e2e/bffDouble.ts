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
const BINDINGS_LIST = canonical("execution-bindings-list.valid.json") as Record<string, unknown>;
const BINDING_DETAIL = canonical("execution-binding-detail.valid.json") as Record<string, unknown>;
const LIVE_REVIEW = canonical("governance-live-review.valid.json") as Record<string, unknown>;


import {
  APPROVAL_ROWS,
  CONDITION_FIXTURES,
  EXIT_DETAIL,
  R1_DETAIL,
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

interface Answer {
  status: number;
  body: unknown;
}

const ok = (body: unknown): Answer => ({ status: 200, body });

function problem(status: number, code: string, message: string): Answer {
  return { status, body: { error: { code, message } } };
}

/** Raw inbox page — the same rows and view semantics the unit double uses. */
function approvalsPage(search: URLSearchParams): Answer {
  const view = search.get("filter") ?? search.get("view") ?? "ALL";
  const inView = APPROVAL_ROWS.filter((r) => matchesView(r, view));
  const limit = Number(search.get("limit") ?? 50);
  const after = search.get("after");
  const start = after ? inView.findIndex((r) => String(r.approval_id) === after) + 1 : 0;
  const slice = inView.slice(start, start + limit);
  const sla = (r: Record<string, unknown>) => (r.sla ?? {}) as Record<string, unknown>;
  const overdue = APPROVAL_ROWS.filter(
    (r) => typeof sla(r).age_minutes === "number" && typeof sla(r).budget_minutes === "number" && (sla(r).age_minutes as number) > (sla(r).budget_minutes as number),
  ).length;
  return ok({
    rows: slice,
    total_count: APPROVAL_ROWS.length,
    filtered_count: inView.length,
    next_cursor: start + limit < inView.length && slice.length > 0 ? String(slice[slice.length - 1].approval_id) : null,
    prev_cursor: start > 0 && slice.length > 0 ? String(slice[0].approval_id) : null,
    has_more: start + limit < inView.length,
    counts: { pending: APPROVAL_ROWS.length, overdue, due_soon: 1 },
  });
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
  return ok({
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
      applied_filters: [],
      applied_sort: [],
    },
  });
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

export function answerExecutionBff(method: string, pathname: string, search: URLSearchParams): Answer {
  const path = pathname.replace(/^\/api\/v1\/execution/, "") || "/";
  const seg = path.split("/").filter(Boolean);

  if (method === "GET") {
    if (path === "/command-center") return ok(CC_SNAPSHOT_BUSY);
    if (path === "/screens/paper") return ok(PAPER_OVERVIEW_READY);
    if (path === "/screens/sandbox") return ok(SANDBOX_OVERVIEW_READY);
    if (path === "/screens/live") return ok(LIVE_OVERVIEW_EMPTY);
    if (path === "/screens/blotter") return ok(FULL_BLOTTER_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "paper" && seg.length === 4 && seg[3] === "vn-market") return ok(PAPER_WORKBENCH_VNM_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "paper" && seg.length === 3) return ok(PAPER_WORKBENCH_PARTIAL);
    if (seg[0] === "screens" && seg[1] === "accounts")
      return problem(503, "N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED", "The full exposure population is not published; the account 360 stays typed unavailable.");
    if ((seg[0] === "alphas" || seg[0] === "portfolios") && seg[2] === "query-analytics") return ok(QUERY_ANALYTICS_EMPTY);
    if (path === "/commands/tasks") return ok(COMMAND_TASKS);
    if (path === "/commands/catalog") return ok(COMMAND_CATALOGUE_FIXTURE);
    if (path === "/alphas") return ok(ALPHA_FLEET);
    if (path === "/broker-bindings") return ok(BINDINGS_LIST);
    if (seg[0] === "broker-bindings" && seg.length === 2) {
      return ok({ ...BINDING_DETAIL, item: { ...((BINDING_DETAIL.item as object) ?? {}), binding_id: seg[1] } });
    }
    if (path === "/governance/approvals") return approvalsPage(search);
    if (seg[0] === "governance" && seg[1] === "approvals" && seg[3] === "r1")
      return ok({ ...R1_DETAIL, approval: { ...(R1_DETAIL.approval as object), approval_id: seg[2] } });
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
    if (seg[0] === "broker-bindings" && seg[2] === "exposure") return ok(BINDING_EXPOSURE);
  }

  if (method === "POST") {
    if (path === "/governance/approvals") return { status: 201, body: APPROVAL_CREATED };
    if (path === "/commands/plans") return ok(COMMAND_PLAN_FIXTURE);
    if (seg[0] === "approvals" && seg[2] === "capital-preview") return ok(CAPITAL_PREVIEW);
    if (seg[0] === "alphas" && seg[2] === "insight-previews") return ok(INSIGHT_BATCH);
    if (seg[0] === "operations" && (seg[2] === "acknowledge" || seg[2] === "resolve")) return ok(OPERATION_WORKFLOW_FIXTURE);
    if (seg[0] === "operations" && seg[2] === "apply") return { status: 202, body: COMMAND_OPERATION };
  }

  return { status: 501, body: { error: { code: "bff_double_gap", message: `the e2e BFF double has no answer for ${method} ${pathname}` } } };
}

/** Register the double on a page. Same-origin only — nothing else is stubbed here. */
export async function stubExecutionBff(page: Page): Promise<void> {
  await page.route("**/api/v1/execution/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { status, body } = answerExecutionBff(request.method(), url.pathname, url.searchParams);
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}
