/**
 * Research Loop — research dataset catalog client (W4 CG-P08-04, Screen 02; B7).
 *
 * Same-origin reads. The catalog lists what the approved historical source
 * holds: datasets, timeframes and, where published, symbols with their
 * month-partition and per-timeframe coverage. It is a selection aid only: the
 * preflight is still the authority on whether the chosen bounded range has bars.
 *
 * Three named B7 routes sit beside the v1 catalog: `catalog-v2`, `{id}/symbols`
 * (keyset cursor) and `{id}/bar-metadata`. A server that does not have them
 * answers 404/405/501; that is remembered for the page's life, so a missing
 * route is asked once and every later read goes straight to what exists.
 */

import type { components } from "@portal/contracts-research-preflight";

import { PortalApiError } from "../lib/api";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import {
  type BarMetadata,
  type PreflightEstimate,
  type SymbolPage,
  normalizeCatalog,
  readBarMetadata as readBarMetadataBody,
  readDeclarationEstimate,
  readSymbolPage,
} from "./dataDeclarationV2";
import type { ResearchState } from "./state";

type Schemas = components["schemas"];

export type DatasetCatalog = Schemas["DatasetCatalog"];
export type CatalogDataset = DatasetCatalog["datasets"][number];
export type CatalogSymbol = CatalogDataset["symbols"]["items"][number];

const V1_CATALOG = "/api/v1/research/datasets";
const V2_CATALOG = "/api/v1/research/datasets/catalog-v2";
const ROUTE_ABSENT = new Set([404, 405, 501]);

/** Routes a server has answered "not here" for, so a missing route is never asked twice. */
const absentRoutes = new Set<"catalog-v2" | "symbols" | "bar-metadata" | "declaration-estimate">();

/** For tests: forget which routes were absent. */
export function resetDatasetRouteMemory(): void {
  absentRoutes.clear();
}

function workspaceQuery(workspaceId: string | undefined, extra: URLSearchParams = new URLSearchParams()): string {
  if (workspaceId) extra.set("workspace_id", workspaceId);
  const text = extra.toString();
  return text ? `?${text}` : "";
}

async function problemOf(response: Response): Promise<PortalApiError> {
  let message = `${response.status} ${response.statusText}`;
  let code: string | null = null;
  let requestId: string | null = response.headers.get("x-request-id");
  try {
    const body = (await response.json()) as Partial<Schemas["Problem"]>;
    if (body?.error?.message) message = body.error.message;
    code = body?.error?.code ?? null;
    requestId = body?.request_id ?? requestId;
  } catch {
    /* keep the status line */
  }
  return new PortalApiError(message, response.status, code, requestId);
}

/**
 * A 404 that carries a `RESEARCH_` code is a refusal of this request (the same
 * denial a 403 is), not a route the server lacks; a bare 404/405/501 is the route.
 */
function isMissingRoute(error: PortalApiError): boolean {
  return ROUTE_ABSENT.has(error.status) && !(error.status === 404 && error.code?.startsWith("RESEARCH_") === true);
}

async function readCatalogRoute(path: string, workspaceId: string | undefined, signal: AbortSignal | undefined): Promise<unknown> {
  const response = await fetch(`${path}${workspaceQuery(workspaceId)}`, { credentials: "same-origin", signal });
  if (!response.ok) throw await problemOf(response);
  return response.json();
}

/**
 * The catalog. v2 first (per-timeframe coverage, instrument absence, index
 * as-of); a server without the route, or one that answers something that is not
 * a v2 catalog, is read as v1, once, silently. Any other refusal is the answer.
 */
export async function readDatasetCatalog(workspaceId?: string, signal?: AbortSignal): Promise<DatasetCatalog> {
  if (!absentRoutes.has("catalog-v2")) {
    try {
      const body = await readCatalogRoute(V2_CATALOG, workspaceId, signal);
      if ((body as { schema_version?: unknown } | null)?.schema_version === "research.dataset-catalog.v2") {
        return normalizeCatalog(body);
      }
      absentRoutes.add("catalog-v2");
    } catch (error) {
      if (!(error instanceof PortalApiError) || !isMissingRoute(error)) throw error;
      absentRoutes.add("catalog-v2");
    }
  }
  /* v2 publishes timeframes as objects; the rest of the screen reads names. A v1 body is returned as it was. */
  return normalizeCatalog(await readCatalogRoute(V1_CATALOG, workspaceId, signal));
}

/** What a server-side symbol search came back with. A route the server does not have is `absent`, never an error. */
export type SymbolSearchResult = { state: "page"; page: SymbolPage } | { state: "absent" } | { state: "failed" };

export interface SymbolSearch {
  q?: string;
  kind?: string;
  timeframe?: string;
  cursor?: string;
  limit?: number;
  /** Continuing a cursor needs the same workspace, filters and limit as the page that issued it. */
  workspaceId?: string;
}

/**
 * `GET /api/v1/research/datasets/{id}/symbols?q&kind&timeframe&cursor&limit`
 * (B7 `researchDatasetSymbolsGetV1`). Asked only when the catalog says more
 * symbols exist than it served. A missing route (older server), any other
 * refusal and a body that is not a page all leave the served list in place,
 * silently; a 401 still ends the session the way every other read does.
 */
export async function readDatasetSymbols(
  datasetId: string,
  search: SymbolSearch,
  signal?: AbortSignal,
): Promise<SymbolSearchResult> {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.kind) params.set("kind", search.kind);
  if (search.timeframe) params.set("timeframe", search.timeframe);
  if (search.cursor) params.set("cursor", search.cursor);
  params.set("limit", String(search.limit ?? 25));
  if (absentRoutes.has("symbols")) return { state: "absent" };
  try {
    const response = await fetch(`/api/v1/research/datasets/${encodeURIComponent(datasetId)}/symbols${workspaceQuery(search.workspaceId, params)}`, {
      credentials: "same-origin",
      signal,
    });
    if (response.status === 401) reportSessionExpired();
    if (!response.ok) {
      if (isMissingRoute(await problemOf(response))) {
        absentRoutes.add("symbols");
        return { state: "absent" };
      }
      return { state: "failed" };
    }
    const page = readSymbolPage(await response.json());
    return page === null ? { state: "failed" } : { state: "page", page };
  } catch {
    return { state: "failed" };
  }
}

/**
 * FG-08 (FE-A1-01): the catalog note is client copy chosen by status class.
 * The server's `error.message` stays on the error and is never rendered; only
 * typed facts (problem code, request id) follow the sentence. A 403 and a 404
 * that carries a `RESEARCH_` code are the same denial and read the same.
 */
export const CATALOG_FAILURE_COPY = {
  denied: "The dataset catalog is not readable for this session. Type the dataset id; preflight checks it.",
  unavailable: "The dataset catalog is unavailable right now. Type the dataset id; preflight checks it.",
  terminal: "The dataset catalog request was refused.",
} as const;

/** `RESEARCH_X · request req_1` — the typed facts of a refusal, or null when it carried none. */
export function catalogFailureFacts(error: PortalApiError, withCode = true): string | null {
  const parts = [withCode ? error.code : null, error.requestId ? `request ${error.requestId}` : null].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Splits a catalog note into the client sentence and its trailing facts, so
 * the data step can print the facts in mono. A note that does not start with
 * one of the fixed sentences is returned whole as the sentence.
 */
export function splitCatalogReason(reason: string): { sentence: string; facts: string | null } {
  for (const sentence of Object.values(CATALOG_FAILURE_COPY)) {
    if (reason.startsWith(`${sentence} `)) return { sentence, facts: reason.slice(sentence.length + 1) };
  }
  return { sentence: reason, facts: null };
}

function withFacts(sentence: string, error: PortalApiError, withCode = true): string {
  const facts = catalogFailureFacts(error, withCode);
  return facts ? `${sentence} ${facts}` : sentence;
}

/** The panel state of a failed catalog read; the form keeps working without it. */
export function catalogFailureState(error: unknown): ResearchState {
  if (!(error instanceof PortalApiError)) {
    return { state: "failed-retryable", reason: "The dataset catalog request did not reach the server.", mayRetry: true, retainsContent: false };
  }
  if (error.status === 401) reportSessionExpired();
  const researchCoded = error.code?.startsWith("RESEARCH_") === true;
  if (error.status === 401 || error.status === 403 || (error.status === 404 && researchCoded)) {
    return {
      state: "denied",
      /* A denial prints the request id only: the code would tell a 403 from a 404. */
      reason: withFacts(CATALOG_FAILURE_COPY.denied, error, false),
      detail: catalogFailureFacts(error, false),
      mayRetry: false,
      retainsContent: false,
    };
  }
  if (error.status === 404) {
    // An older server without the CG-P08-04 read: say so, and keep the free field.
    return {
      state: "unavailable",
      reason: "this server does not publish the dataset catalog yet — type the dataset id; preflight checks it.",
      mayRetry: false,
      retainsContent: false,
    };
  }
  const unavailable = error.status >= 500;
  return {
    state: unavailable ? "unavailable" : "terminal",
    reason: withFacts(unavailable ? CATALOG_FAILURE_COPY.unavailable : CATALOG_FAILURE_COPY.terminal, error),
    detail: catalogFailureFacts(error),
    mayRetry: unavailable,
    retainsContent: false,
  };
}

/** `2020-01 → 2026-09 · 81 months`, or null when the source published none. */
export function coverageLabel(symbol: CatalogSymbol): string | null {
  const coverage = symbol.coverage;
  if (!coverage) return null;
  return `${coverage.first_month} → ${coverage.last_month} · ${coverage.months} month${coverage.months === 1 ? "" : "s"}`;
}

/* ------------------------------------------------- declaration estimate */

/**
 * What the declaration-estimate route answered, as states the screen can tell apart:
 *  - `estimate`  a 200 that is an estimate;
 *  - `refused`   a 400 with the server's own code, and the requested-spec field it names;
 *  - `absent`    the route is not there (404/405/501 without a RESEARCH_ code): the per-window bar metadata is the fallback;
 *  - `client-error` any other 4xx (401 ends the session; 403/404 are a denial), `server-error` a 5xx, `network` no answer.
 * The last three carry the served code and request id and may be retried; none of them reads as "not published".
 */
export type DeclarationEstimateResult =
  | { state: "estimate"; estimate: PreflightEstimate }
  | { state: "refused"; status: number; code: string; fieldPath: readonly string[] | null; message: string; requestId: string | null }
  | { state: "absent" }
  | { state: "client-error" | "server-error"; status: number; code: string | null; requestId: string | null }
  | { state: "network" };

const ESTIMATE_PATH = "/api/v1/research/datasets/declaration-estimates";

/**
 * `POST /api/v1/research/datasets/declaration-estimates` (`researchDeclarationEstimatePostV1`).
 * Same-origin, session cookie, `x-portal-csrf` from the CSRF cookie like every other POST of this
 * app. It creates nothing: no preflight token, no run authorization. The body is the requested spec
 * the form already serializes; the server derives the digest.
 */
export async function postDeclarationEstimate(
  requestedSpec: unknown,
  workspaceId?: string,
  signal?: AbortSignal,
): Promise<DeclarationEstimateResult> {
  if (absentRoutes.has("declaration-estimate")) return { state: "absent" };
  const csrf = csrfTokenFromCookie();
  try {
    const response = await fetch(ESTIMATE_PATH, {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: { "content-type": "application/json", ...(csrf ? { [CSRF_HEADER]: csrf } : {}) },
      body: JSON.stringify({ ...(workspaceId ? { workspace_id: workspaceId } : {}), requested_spec: requestedSpec }),
    });
    if (response.status === 401) reportSessionExpired();
    if (!response.ok) {
      let details: { field_path?: string[]; field_paths?: string[][] } | undefined;
      let code: string | null = null;
      let message = `${response.status} ${response.statusText}`;
      let requestId: string | null = response.headers.get("x-request-id");
      try {
        const body = (await response.json()) as Partial<Schemas["Problem"]> & { details?: typeof details };
        code = body?.error?.code ?? null;
        message = body?.error?.message ?? message;
        requestId = body?.request_id ?? requestId;
        details = body?.details;
      } catch {
        /* keep the status line */
      }
      const problem = new PortalApiError(message, response.status, code, requestId);
      if (isMissingRoute(problem)) {
        absentRoutes.add("declaration-estimate");
        return { state: "absent" };
      }
      if (response.status === 400 && code) {
        return { state: "refused", status: 400, code, message, requestId, fieldPath: details?.field_path ?? details?.field_paths?.[0] ?? null };
      }
      return { state: response.status >= 500 ? "server-error" : "client-error", status: response.status, code, requestId };
    }
    const estimate = readDeclarationEstimate(await response.json());
    /* A 200 that is not an estimate is a server we cannot read: the same as no route. */
    return estimate === null ? { state: "absent" } : { state: "estimate", estimate };
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "AbortError") throw error;
    return { state: "network" };
  }
}

/* ---------------------------------------------------------- bar metadata */

export interface BarMetadataQuery {
  symbol: string;
  timeframe: string;
  startUtcMs: number;
  endExclusiveUtcMs: number;
  /** Bars the version needs before the start; 0 to 100,000. */
  warmupBars?: number;
  workspaceId?: string;
}

export type BarMetadataResult =
  | { state: "metadata"; metadata: BarMetadata }
  /** A 400 with the server's own problem code (a bound it could not align, say): shown as that code, no number. */
  | { state: "refused"; code: string }
  | { state: "absent" }
  | { state: "failed" };

/**
 * `GET /api/v1/research/datasets/{id}/bar-metadata` (B7 `researchDatasetBarMetadataGetV1`)
 * for one declared window: exact bars and warmup from the index, or a typed
 * `NOT_PUBLISHED` reason (a window outside the verified range answers
 * `WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE` with null facts). Never a preflight:
 * a missing route or a body that is not metadata leaves the screen with no
 * count, silently; a 400 carries the server's own code and is shown as it.
 */
export async function readBarMetadata(datasetId: string, query: BarMetadataQuery, signal?: AbortSignal): Promise<BarMetadataResult> {
  if (absentRoutes.has("bar-metadata")) return { state: "absent" };
  const params = new URLSearchParams({
    symbol: query.symbol,
    timeframe: query.timeframe,
    start_utc_ms: String(query.startUtcMs),
    end_exclusive_utc_ms: String(query.endExclusiveUtcMs),
  });
  if (query.warmupBars !== undefined) params.set("warmup_bars", String(query.warmupBars));
  try {
    const response = await fetch(`/api/v1/research/datasets/${encodeURIComponent(datasetId)}/bar-metadata${workspaceQuery(query.workspaceId, params)}`, {
      credentials: "same-origin",
      signal,
    });
    if (response.status === 401) reportSessionExpired();
    if (!response.ok) {
      const problem = await problemOf(response);
      if (isMissingRoute(problem)) {
        absentRoutes.add("bar-metadata");
        return { state: "absent" };
      }
      return problem.status === 400 && problem.code ? { state: "refused", code: problem.code } : { state: "failed" };
    }
    const metadata = readBarMetadataBody(await response.json());
    return metadata === null ? { state: "failed" } : { state: "metadata", metadata };
  } catch {
    return { state: "failed" };
  }
}
