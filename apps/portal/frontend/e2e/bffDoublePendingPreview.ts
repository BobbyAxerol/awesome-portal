/**
 * The fixture-lab answer for the pending-control PREVIEW (DEBT-048 item 9; FIXTURE_LAB / BFF_DOUBLE lane, NOT acceptance evidence).
 *
 * A separate file on purpose: `bffDoubleGovernance.ts` and `bffDouble.ts` belong to another writer, so nothing here edits them. It reuses
 * the governance double's discovery answerer and the canonical fixtures, and is wired by a spec (`stubPendingControlPreview`), never by the
 * shared `stubExecutionBff`, so no other spec, baseline or the standalone fixture BFF changes.
 *
 *   POST /api/v1/execution/pending-recalls/preview   portal.execution.pending-recall-preview.v1   (a ROLLBACK preview: nothing is applied)
 *
 * The answer is decided by the request, never stored:
 *   workspace_id not a `ws_TEST_ONLY...` workspace   403 ACCESS_DENIED
 *   expected_policy_revision != the reviewed one      409 POLICY_REVISION_CONFLICT
 *   reason starts "UNQUALIFIED"                       200 allowed:false, PENDING_CONTROL_NOT_QUALIFIED (the source is not qualified)
 *   reason starts "REFUSE"                            403 CURRENT_ACTOR_AUTHORITY_REQUIRED
 *   anything else                                     200 allowed:true (the canonical apply / cancel preview, echoing the recall asked)
 * There is no apply, reserve or submit answer at all: a request to one gets nothing from this module.
 *
 * Discovery (`stubLabDiscovery`): the queue double's PAPER deployment row `dep_btc_paper` has no recall in the governance double (that
 * holds recalls only on `TEST_ONLY:deployment`). The lab asks the governance answerer for `TEST_ONLY:deployment`, writes the asked id back
 * into the body and appends one UNKNOWN recall, so the row shows both a WAITING and an UNKNOWN recall. Any other question is the
 * governance double's own answer, untouched.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { answerPendingRecallDiscovery } from "./bffDoubleGovernance";

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const loadCanonicalFixture = (name: string): any => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")); // eslint-disable-line @typescript-eslint/no-explicit-any

export const PENDING_PREVIEW_PATH = "/api/v1/execution/pending-recalls/preview";
export const PENDING_RECALLS_PATH = "/api/v1/execution/pending-recalls";
export const LAB_DEPLOYMENT_ID = "dep_btc_paper";
export const LAB_POLICY_REVISION = "TEST_ONLY:portal-policy";
export const LAB_WORKSPACE = /^ws_TEST_ONLY(?:_[A-Za-z0-9._:-]*)?$/;

export interface LabAnswer {
  status: number;
  body: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

const problem = (status: number, code: string, message: string): LabAnswer => ({ status, body: { error: { code, message }, request_id: "req_lab_pending_preview" } });

/** The reviewed preview answer for one intent body, or `null` when the request is not a preview at all. */
export function answerPendingControlPreview(method: string, path: string, body: unknown): LabAnswer | null {
  if (method !== "POST" || path !== PENDING_PREVIEW_PATH) return null;
  const intent = body as Draft;
  const payload = intent?.business_payload;
  if (intent === null || typeof intent !== "object" || payload === null || typeof payload !== "object") {
    return problem(400, "PENDING_CONTROL_INPUT_INVALID", "The request is not an intent.");
  }
  if (typeof intent.workspace_id !== "string" || !LAB_WORKSPACE.test(intent.workspace_id)) return problem(403, "ACCESS_DENIED", "Not a fixture-lab workspace.");
  if (intent.expected_policy_revision !== LAB_POLICY_REVISION) return problem(409, "POLICY_REVISION_CONFLICT", "The policy changed.");
  if ((payload.operation !== "APPLY_PENDING" && payload.operation !== "CANCEL_REMAINING") || typeof payload.command_id !== "string") {
    return problem(400, "PENDING_CONTROL_INPUT_INVALID", "The operation or the recall is missing.");
  }
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  if (/^REFUSE/.test(reason)) return problem(403, "CURRENT_ACTOR_AUTHORITY_REQUIRED", "Not permitted.");
  const file = loadCanonicalFixture("execution-pending-control.synthetic.valid.json");
  const canonical: Draft = /^UNQUALIFIED/.test(reason) ? file.preview_blocked : payload.operation === "CANCEL_REMAINING" ? file.preview_cancel : file.preview_allowed;
  const answer = structuredClone(canonical);
  answer.operation = payload.operation;
  answer.original_recall_id = payload.command_id;
  return { status: 200, body: answer };
}

/** The lab discovery for the PAPER deployment row (see the module note), or `null` for any other question. */
export function labDiscovery(search: URLSearchParams): LabAnswer | null {
  if (search.get("resource_kind") !== "DEPLOYMENT" || search.get("resource_id") !== LAB_DEPLOYMENT_ID || search.get("environment") !== "paper") return null;
  const asked = new URLSearchParams(search);
  asked.set("resource_id", "TEST_ONLY:deployment");
  const answer = answerPendingRecallDiscovery("GET", "/pending-recalls", asked);
  if (answer === null || answer.status !== 200) return answer;
  const body = structuredClone(answer.body) as Draft;
  body.resource = { kind: "DEPLOYMENT", id: LAB_DEPLOYMENT_ID };
  const waiting = body.items[0];
  const open: Draft = loadCanonicalFixture("execution-pending-control-currency.synthetic.valid.json").discovery_open;
  const unknown = structuredClone(open.items[1]);
  unknown.recipient_account_id = waiting.recipient_account_id;
  body.items = [waiting, unknown];
  return { status: 200, body };
}

export interface LabTraffic {
  /** Every same-origin /api request: its method and path (no query). */
  all: { method: string; path: string }[];
  /** The preview intents the page sent. */
  previews: Draft[];
}

/**
 * Wire the lab on a page: the preview answer, the lab discovery, and a session token the preview client requires (the lab session has no
 * real cookie; the stand-in lives in the page only). Register AFTER `stubExecutionBff` so these routes win for exactly these two paths.
 */
export async function stubPendingControlPreview(page: Page, options: { previewStatus?: number } = {}): Promise<LabTraffic> {
  const traffic: LabTraffic = { all: [], previews: [] };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) traffic.all.push({ method: request.method(), path: url.pathname });
  });
  await page.addInitScript(() => {
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "__Host-portal_csrf=lab-session-token", set: () => undefined });
  });
  await page.route(/\/api\/v1\/execution\/pending-recalls(\?|$)/, (route) => {
    const answer = labDiscovery(new URL(route.request().url()).searchParams);
    if (answer === null) return route.fallback();
    return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  await page.route(/\/api\/v1\/execution\/pending-recalls\/preview$/, (route) => {
    const request = route.request();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    traffic.previews.push(body);
    if (options.previewStatus !== undefined) {
      return route.fulfill({ status: options.previewStatus, contentType: "application/json", body: JSON.stringify({ not: "answered" }) });
    }
    const answer = answerPendingControlPreview(request.method(), new URL(request.url()).pathname, body);
    if (answer === null) return route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  return traffic;
}
