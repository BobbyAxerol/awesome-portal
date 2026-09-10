/**
 * PHASE 1 (round 2) · the browser asks for the envelope that carries the rows
 * once.
 *
 * The server used to send every collection twice: `data.<panel>` and
 * `panels.<panel>.data.rows`, byte for byte the same. V2 sends only `panels`,
 * and everything that is not a panel — deployment, query, page window,
 * observation gate — moves under `screen_context`.
 *
 * The screens still read a `data` map, so this adapter derives it from
 * `panels`. That is a derivation from one source, not a fallback between two:
 * there is no `data ?? panels` anywhere, because a V2 body has no `data` to
 * fall back to. If the shape is not the one we asked for, this returns null and
 * the caller renders an unavailable panel carrying the code below — never a
 * blank screen, and never a quietly older shape.
 */

export const SCREEN_V2_MEDIA_TYPE = "application/vnd.portal.execution.screen.v2+json";

/** The reason a panel shows nothing when the envelope is not what we requested. */
export const SCREEN_CONTRACT_MISMATCH = "PORTAL_SCREEN_CONTRACT_MISMATCH";

interface PanelLike { readonly data?: { readonly rows?: readonly unknown[] } | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A V2 body names itself: the schema version ends in `.v2` and it carries panels. */
export function isScreenV2(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const version = body.schema_version;
  return typeof version === "string" && version.endsWith(".v2") && isRecord(body.panels);
}

/**
 * Rebuild the `data` map the screens read, from the panels that carry it.
 *
 * A panel with no rows has `data: null` on the wire — V1 rendered that as `[]`,
 * and the screens still distinguish "no rows" from "not available" through the
 * panel's own `state`, not through this map.
 */
export function legacyDataFromPanels(panels: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, panel] of Object.entries(panels)) {
    data[key] = (panel as PanelLike)?.data?.rows ?? [];
  }
  return data;
}

/**
 * Normalise a screen response for consumers that have not moved to reading
 * panels directly. Returns null when a body claims V2 but does not carry the
 * shape, so the caller fails closed instead of rendering half a screen.
 */
export function normaliseScreenBody(body: unknown): unknown {
  if (!isScreenV2(body)) return body;
  const envelope = body as Record<string, unknown>;
  const panels = envelope.panels;
  const context = envelope.screen_context;
  if (!isRecord(panels) || !isRecord(context)) return null;
  const { screen_context: _context, ...head } = envelope;
  return {
    ...head,
    schema_version: String(envelope.schema_version).replace(/\.v2$/, ".v1"),
    panels,
    data: legacyDataFromPanels(panels),
    ...context,
  };
}
