/**
 * `GET /api/v1/execution/runtime-manifest` — the server's own statement of its
 * limits (EDS-01 · phase 3).
 *
 * Until now the frontend wrote those limits down itself: a page ladder that
 * started at 200 because 200 was what the server happened to accept when the
 * ladder was written, and a contract validator that rejected any payload whose
 * bounds were not exactly 200 / 1 048 576 / 4 096 — so a server that RAISED a
 * limit would have had its whole contract thrown away by the screen it was
 * trying to serve better.
 *
 * This module reads the bounds instead. What it deliberately does not do is
 * treat a missing manifest as permission to guess silently: the fallback is
 * named (`DEFAULT_PAGE_BOUNDS`) and `source` says which of the two a caller is
 * looking at, so a caption can tell the reader whether a limit is the server's
 * word or ours.
 */

export interface PageBounds {
  maximumPageRows: number;
  maximumResponseBytes: number;
  maximumCursorBytes: number;
}

export interface RuntimeManifest {
  workspaceId: string;
  readAtMs: number;
  bounds: PageBounds;
  /** Semantics the source refuses to assert; a screen must not claim them either. */
  semantics: Readonly<Record<string, string>>;
  /** Requirements the owner still has to close, named by the server. */
  externalGates: readonly { requirementId: string; status: string }[];
}

/**
 * The bounds the frontend used to hard-code. They stay, as a **labelled**
 * fallback: a manifest that cannot be read must not stop a screen from
 * drawing, and must not be able to pass itself off as the server's word.
 */
export const DEFAULT_PAGE_BOUNDS: PageBounds = {
  maximumPageRows: 200,
  maximumResponseBytes: 1_048_576,
  maximumCursorBytes: 4_096,
};

const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const obj = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export function readRuntimeManifest(raw: unknown): RuntimeManifest | null {
  const body = obj(raw);
  if (!body || body.schema_version !== "portal.execution.runtime-manifest.v1") return null;
  const workspaceId = str(body.workspace_id);
  const readAtMs = int(body.read_at_ms);
  const bounds = obj(body.bounds);
  if (!workspaceId || readAtMs === null || !bounds) return null;
  const maximumPageRows = int(bounds.maximum_page_rows);
  const maximumResponseBytes = int(bounds.maximum_response_bytes);
  const maximumCursorBytes = int(bounds.maximum_cursor_bytes);
  // A bound that is absent or not a positive integer is not a bound. Falling
  // back to the default here would hide the server's silence behind our guess.
  if (maximumPageRows === null || maximumResponseBytes === null || maximumCursorBytes === null) return null;
  const semantics = obj(body.source_semantics) ?? {};
  const gates = Array.isArray(body.external_gates) ? body.external_gates : [];
  return {
    workspaceId,
    readAtMs,
    bounds: { maximumPageRows, maximumResponseBytes, maximumCursorBytes },
    semantics: Object.fromEntries(
      Object.entries(semantics).flatMap(([key, value]) => {
        const text = str(value);
        return text ? [[key, text] as const] : [];
      }),
    ),
    externalGates: gates.flatMap((entry) => {
      const gate = obj(entry);
      const requirementId = gate && str(gate.requirement_id);
      const status = gate && str(gate.status);
      return requirementId && status ? [{ requirementId, status }] : [];
    }),
  };
}

/** Where a bound came from — the word a caption needs. */
export type BoundsSource = "SERVER_DECLARED" | "FRONTEND_DEFAULT";

export function boundsOf(manifest: RuntimeManifest | null): { bounds: PageBounds; source: BoundsSource } {
  return manifest
    ? { bounds: manifest.bounds, source: "SERVER_DECLARED" }
    : { bounds: DEFAULT_PAGE_BOUNDS, source: "FRONTEND_DEFAULT" };
}
