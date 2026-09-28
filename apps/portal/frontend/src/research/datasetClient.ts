/**
 * Research Loop — research dataset catalog client (W4 CG-P08-04, Screen 02).
 *
 * One same-origin read. The catalog lists what the approved historical source
 * holds — datasets, timeframes and, where published, symbols with their
 * month-partition coverage. It is a selection aid only: the preflight is still
 * the authority on whether the chosen bounded range has bars.
 */

import type { components } from "@portal/contracts-research-preflight";

import { PortalApiError } from "../lib/api";
import { reportSessionExpired } from "../auth/sessionExpiry";
import type { ResearchState } from "./state";

type Schemas = components["schemas"];

export type DatasetCatalog = Schemas["DatasetCatalog"];
export type CatalogDataset = DatasetCatalog["datasets"][number];
export type CatalogSymbol = CatalogDataset["symbols"]["items"][number];

export async function readDatasetCatalog(workspaceId?: string, signal?: AbortSignal): Promise<DatasetCatalog> {
  const query = workspaceId ? `?${new URLSearchParams({ workspace_id: workspaceId }).toString()}` : "";
  const response = await fetch(`/api/v1/research/datasets${query}`, { credentials: "same-origin", signal });
  if (!response.ok) {
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
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as DatasetCatalog;
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
