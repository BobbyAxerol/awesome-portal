/**
 * Research Loop — run setup client (S02 linked-window setup, Screen 02).
 *
 * Two same-origin calls from the generated `research-run-setup` contract:
 *  - `GET  /api/v1/research/runs/setup-options`     what the current Portal executor will run for
 *    this Alpha version, dataset, symbol and timeframe (configuration facts, never run authorization);
 *  - `POST /api/v1/research/runs/window-suggestions` an explicit, editable indexed-bar hint for the
 *    windows. Read-only, but a POST: same-origin and CSRF like every other POST of this app.
 *
 * Neither creates a preflight token or a job. Messages are never parsed and profile ids are never
 * matched by name: what the screen needs is a typed field of the served body. A server that does not
 * have the routes answers 404/405/501 without a `RESEARCH_` code; that is remembered for the page's
 * life and the screen falls back to the Atlas profiles and the whole-coverage prefill.
 */

import type { components } from "@portal/contracts-research-run-setup";

import { PortalApiError } from "../lib/api";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { isMissingRoute } from "./datasetClient";

type Schemas = components["schemas"];

export type SetupContext = Schemas["Context"];
export type SetupOptions = Schemas["SetupOptions"];
export type SetupProfile = Schemas["Profile"];
export type SuggestionRequest = Schemas["SuggestionRequest"];
export type WindowSuggestion = Schemas["WindowSuggestion"];
export type WindowPatch = NonNullable<Schemas["SuggestionMetadata"]["patch"]>;
export type SetupProblem = Schemas["Problem"];

/** The five things that identify one setup read; `workspaceId` is optional on the wire but part of the key. */
export interface SetupQuery {
  workspaceId?: string;
  alphaId: string;
  alphaVersionId: string;
  datasetId: string;
  symbol: string;
  timeframe: string;
}

/** The refusal facts every failed call carries; the server's `message` is never rendered. */
export interface SetupRefusalFacts {
  status: number;
  code: string;
  fieldPath: readonly string[] | null;
  /** The axis reason the server named (`details.reason_code`), when it did. */
  reasonCode?: string | null;
  requestId: string | null;
}

/** The only code that says the options snapshot a suggestion was bound to is obsolete (any other 409 is a refusal). */
export const SETUP_OPTIONS_STALE = "RESEARCH_SETUP_OPTIONS_STALE";

/**
 * What a setup call answered, as states the screen can tell apart:
 *  - `served`        a 200 that is the expected body;
 *  - `refused`       a 400 or a 409 other than the stale one, with the server's own code, the field it names and its reason code;
 *  - `stale-options` (POST only) a 409 `RESEARCH_SETUP_OPTIONS_STALE`: the options snapshot is obsolete; read the options again. Nothing else is stale;
 *  - `absent`        the route is not there (older server), or a 200 that is not this body;
 *  - `client-error`  any other 4xx (401 ends the session; 403/404 are a denial), `server-error` a 5xx, `network` no answer.
 */
export type SetupResult<T> =
  | { state: "served"; body: T }
  | ({ state: "refused" } & SetupRefusalFacts)
  | { state: "stale-options"; code: string | null; requestId: string | null }
  | { state: "absent" }
  | { state: "client-error" | "server-error"; status: number; code: string | null; requestId: string | null }
  | { state: "network" };

export type SetupOptionsResult = SetupResult<SetupOptions>;
export type WindowSuggestionResult = SetupResult<WindowSuggestion>;

const OPTIONS_PATH = "/api/v1/research/runs/setup-options";
const SUGGESTION_PATH = "/api/v1/research/runs/window-suggestions";

const absentRoutes = new Set<"setup-options" | "window-suggestions">();

/** For tests: forget which routes were absent. */
export function resetSetupRouteMemory(): void {
  absentRoutes.clear();
}

type Bag = Readonly<Record<string, unknown>>;

function bag(value: unknown): Bag | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Bag) : null;
}

/** A served setup-options body: the right schema, a revision and a profile list. Anything else is not this route. */
export function isSetupOptions(raw: unknown): raw is SetupOptions {
  const body = bag(raw);
  return (
    body !== null
    && body.schema_version === "research.run-setup-options.v1"
    && typeof body.source_revision === "string"
    && body.source_revision !== ""
    && bag(body.context) !== null
    && Array.isArray(body.profiles)
  );
}

/** A served window suggestion: the right schema and a metadata block with a state. */
export function isWindowSuggestion(raw: unknown): raw is WindowSuggestion {
  const body = bag(raw);
  const metadata = bag(body?.metadata);
  return (
    body !== null
    && body.schema_version === "research.window-suggestion.v1"
    && typeof body.options_revision === "string"
    && metadata !== null
    && (metadata.state === "AVAILABLE" || metadata.state === "NOT_PUBLISHED")
  );
}

interface FailureBody {
  code: string | null;
  requestId: string | null;
  fieldPath: readonly string[] | null;
  reasonCode: string | null;
  message: string;
}

async function failureOf(response: Response): Promise<FailureBody> {
  let code: string | null = null;
  let message = `${response.status} ${response.statusText}`;
  let requestId: string | null = response.headers.get("x-request-id");
  let fieldPath: readonly string[] | null = null;
  let reasonCode: string | null = null;
  try {
    const body = (await response.json()) as Partial<SetupProblem>;
    code = body?.error?.code ?? null;
    message = body?.error?.message ?? message;
    requestId = body?.request_id ?? requestId;
    fieldPath = body?.details?.field_path ?? body?.details?.field_paths?.[0] ?? null;
    reasonCode = (body?.details as { reason_code?: string } | undefined)?.reason_code ?? null;
  } catch {
    /* keep the status line */
  }
  return { code, requestId, fieldPath, reasonCode, message };
}

/** The query string of a setup read; `workspace_id` only when there is one. */
export function setupQueryString(query: SetupQuery): string {
  const params = new URLSearchParams({
    alpha_id: query.alphaId,
    alpha_version_id: query.alphaVersionId,
    dataset_id: query.datasetId,
    symbol: query.symbol,
    timeframe: query.timeframe,
  });
  if (query.workspaceId) params.set("workspace_id", query.workspaceId);
  return params.toString();
}

async function settle<T>(
  route: "setup-options" | "window-suggestions",
  response: Response,
  isBody: (raw: unknown) => raw is T,
  staleOn409: boolean,
): Promise<SetupResult<T>> {
  if (response.status === 401) reportSessionExpired();
  if (!response.ok) {
    const failure = await failureOf(response);
    const problem = new PortalApiError(failure.message, response.status, failure.code, failure.requestId);
    if (isMissingRoute(problem)) {
      absentRoutes.add(route);
      return { state: "absent" };
    }
    if (staleOn409 && response.status === 409 && failure.code === SETUP_OPTIONS_STALE) return { state: "stale-options", code: failure.code, requestId: failure.requestId };
    if ((response.status === 400 || response.status === 409) && failure.code) {
      return { state: "refused", status: response.status, code: failure.code, fieldPath: failure.fieldPath, reasonCode: failure.reasonCode, requestId: failure.requestId };
    }
    return { state: response.status >= 500 ? "server-error" : "client-error", status: response.status, code: failure.code, requestId: failure.requestId };
  }
  const body: unknown = await response.json();
  /* A 200 that is not this body is a server we cannot read: the same as no route. */
  return isBody(body) ? { state: "served", body } : { state: "absent" };
}

/**
 * `GET /api/v1/research/runs/setup-options` (`researchRunSetupOptionsGetV1`). Called when the
 * Alpha / version / workspace / dataset / symbol / timeframe context changes, never per keystroke.
 */
export async function getRunSetupOptions(query: SetupQuery, signal?: AbortSignal): Promise<SetupOptionsResult> {
  if (absentRoutes.has("setup-options")) return { state: "absent" };
  try {
    const response = await fetch(`${OPTIONS_PATH}?${setupQueryString(query)}`, { credentials: "same-origin", signal });
    return await settle("setup-options", response, isSetupOptions, false);
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "AbortError") throw error;
    return { state: "network" };
  }
}

/**
 * `POST /api/v1/research/runs/window-suggestions` (`researchRunWindowSuggestionPostV1`). Same-origin,
 * session cookie, `x-portal-csrf` from the CSRF cookie. Read-only: it creates no preflight token,
 * job or run authorization. Only a 409 `RESEARCH_SETUP_OPTIONS_STALE` means `options_revision` is obsolete.
 */
export async function postWindowSuggestion(request: SuggestionRequest, signal?: AbortSignal): Promise<WindowSuggestionResult> {
  if (absentRoutes.has("window-suggestions")) return { state: "absent" };
  const csrf = csrfTokenFromCookie();
  try {
    const response = await fetch(SUGGESTION_PATH, {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: { "content-type": "application/json", ...(csrf ? { [CSRF_HEADER]: csrf } : {}) },
      body: JSON.stringify(request),
    });
    return await settle("window-suggestions", response, isWindowSuggestion, true);
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "AbortError") throw error;
    return { state: "network" };
  }
}
