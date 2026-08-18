/**
 * Artifact table state — one classifier for every `wfo/*` row endpoint.
 *
 * A backtest run does not produce the same artifacts every time. A
 * `three_window_decay` run writes `wfo/candidates.parquet`; an
 * `advanced_walk_forward` run with `optimization_mode: "none"` never does, and
 * the API answers `404 artifact wfo/candidates.parquet not found`. Both are
 * correct runs.
 *
 * Before this module, every view collapsed that distinction two ways at once:
 *
 *   - `if (candidates.isError) return <StateView kind="failed" …>` turned a run
 *     that legitimately has no candidate stage into a broken screen, hiding the
 *     trial charts that had loaded perfectly well; and
 *   - `candidates.data?.rows ?? []` turned an absent artifact into the number
 *     `0` in the selection funnel — the one thing the display rules forbid
 *     outright (never render 0 from null).
 *
 * `MALFORMED` is the third case and the reason this returns a state rather than
 * a boolean. Row endpoints publish a `RowEnvelope` (`total_rows` /
 * `returned_rows` / `rows`). An older deployment answers with a bare JSON array
 * instead, and `payload?.rows ?? []` reads that as an empty artifact: the charts
 * render blank, the provenance line says nothing is missing, and the screen is
 * confidently wrong. A shape the client cannot interpret is not empty data —
 * it is an unreadable response, and it says so.
 */
import type { UseQueryResult } from "@tanstack/react-query";

import { PortalApiError, type RowsPayload } from "../../lib/api";
import type { RowPopulation } from "./provenance";

export type ArtifactState =
  | "loading"
  | "ready"
  | "empty"
  | "absent"
  | "denied"
  | "malformed"
  | "failed";

export interface ArtifactTable {
  state: ArtifactState;
  /** Always an array, so callers never branch on undefined — but see `state`. */
  rows: Record<string, unknown>[];
  /**
   * Population of the artifact, or all-null when the artifact could not be
   * read. A null total is what stops a figure printing "0/0" for a run whose
   * artifact was never written.
   */
  population: RowPopulation;
  /** The server's words when it declined, otherwise our description. */
  reason: string | null;
}

const UNKNOWN_POPULATION: RowPopulation = { total: null, returned: null, truncated: false };

/** True when a payload carries the RowEnvelope this client is written against. */
function isRowEnvelope(payload: unknown): payload is RowsPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Partial<RowsPayload>;
  return (
    Array.isArray(candidate.rows) &&
    typeof candidate.total_rows === "number" &&
    typeof candidate.returned_rows === "number"
  );
}

/**
 * Classifies one row-table query.
 *
 * `absent` is reserved for 404: the run completed and the artifact is simply
 * not part of what this protocol produces. It is a fact about the run, not a
 * failure of the page, and it is the only branch a caller should render as an
 * explanation rather than an error.
 */
export function artifactTable(query: UseQueryResult<RowsPayload>): ArtifactTable {
  if (query.isPending) {
    return { state: "loading", rows: [], population: UNKNOWN_POPULATION, reason: null };
  }

  if (query.isError) {
    const error = query.error;
    const status = error instanceof PortalApiError ? error.status : null;
    const reason = error instanceof Error ? error.message : String(error);
    if (status === 404) {
      return { state: "absent", rows: [], population: UNKNOWN_POPULATION, reason };
    }
    if (status === 401 || status === 403) {
      return { state: "denied", rows: [], population: UNKNOWN_POPULATION, reason };
    }
    return { state: "failed", rows: [], population: UNKNOWN_POPULATION, reason };
  }

  const payload = query.data as unknown;
  if (!isRowEnvelope(payload)) {
    return {
      state: "malformed",
      rows: [],
      population: UNKNOWN_POPULATION,
      reason:
        "The response is not the row envelope this client reads " +
        "(total_rows / returned_rows / rows). Most often the API is running an " +
        "older build than the one this UI was compiled against.",
    };
  }

  const population: RowPopulation = {
    total: payload.total_rows,
    returned: payload.returned_rows,
    truncated: payload.returned_rows < payload.total_rows,
  };

  return {
    state: payload.rows.length === 0 ? "empty" : "ready",
    rows: payload.rows,
    population,
    reason: null,
  };
}

/** Human sentence for a state a figure or panel cannot draw. */
export function artifactExplanation(table: ArtifactTable, artifact: string): string {
  switch (table.state) {
    case "absent":
      return `This run did not produce ${artifact}. Nothing is missing — the protocol simply has no such stage.`;
    case "empty":
      return `${artifact} exists but holds no rows.`;
    case "denied":
      return table.reason ?? `You do not have access to ${artifact}.`;
    case "malformed":
      return table.reason ?? `${artifact} could not be interpreted.`;
    case "failed":
      return table.reason ?? `${artifact} could not be loaded.`;
    default:
      return "";
  }
}

/** The `StateView` kind that matches an unreadable artifact. */
export function artifactStateKind(
  state: Exclude<ArtifactState, "ready">,
): "loading" | "empty" | "unavailable" | "denied" | "failed" {
  switch (state) {
    case "loading":
      return "loading";
    case "empty":
      return "empty";
    case "absent":
      return "unavailable";
    case "denied":
      return "denied";
    default:
      return "failed";
  }
}
