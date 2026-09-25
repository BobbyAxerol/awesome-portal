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

/** The panel state of a failed catalog read; the form keeps working without it. */
export function catalogFailureState(error: unknown): ResearchState {
  if (!(error instanceof PortalApiError)) {
    return { state: "failed-retryable", reason: "The dataset catalog request did not reach the server.", mayRetry: true, retainsContent: false };
  }
  if (error.status === 401) reportSessionExpired();
  if (error.status === 401 || error.status === 403) {
    return { state: "denied", reason: error.message, mayRetry: false, retainsContent: false };
  }
  if (error.status === 404 && !error.code?.startsWith("RESEARCH_")) {
    // An older server without the CG-P08-04 read: say so, and keep the free field.
    return {
      state: "unavailable",
      reason: "this server does not publish the dataset catalog yet — type the dataset id; preflight checks it.",
      mayRetry: false,
      retainsContent: false,
    };
  }
  return {
    state: error.status >= 500 ? "unavailable" : "terminal",
    reason: error.message,
    mayRetry: error.status >= 500,
    retainsContent: false,
  };
}

/** `2020-01 → 2026-09 · 81 months`, or null when the source published none. */
export function coverageLabel(symbol: CatalogSymbol): string | null {
  const coverage = symbol.coverage;
  if (!coverage) return null;
  return `${coverage.first_month} → ${coverage.last_month} · ${coverage.months} month${coverage.months === 1 ? "" : "s"}`;
}
