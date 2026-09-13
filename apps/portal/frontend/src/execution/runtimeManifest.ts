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

/**
 * R3-2 · what the server independently qualified, per profile.
 *
 * A global flag is deliberately not a qualification result: the ledger's own
 * words are "a Paper proof cannot enable Sandbox or Live". Before this, every
 * profile's market panels printed one client sentence, so an operator could
 * not tell apart the two genuinely different situations the server now
 * distinguishes:
 *
 *  - Paper: `PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION` /
 *    `MANAGER_V2_SOURCE_CONTRACT_REJECTED` — the route exists and was reached
 *    over mTLS with a valid assertion; the running Manager image is older than
 *    the handler, so the contract was rejected. This is expected to requalify.
 *  - Sandbox and Live: `PROFILE_NOT_QUALIFIED` /
 *    `NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION` — nobody has
 *    qualified it at all. Nothing is pending.
 *
 * "Try again later" and "this was never proved for your profile" are different
 * facts, and only the server can tell them apart.
 */
export interface ProfileQualification {
  environment: string;
  currentPageRead: string;
  marketContext: string;
  marketContextReason: string | null;
}

export interface RuntimeManifest {
  workspaceId: string;
  readAtMs: number;
  bounds: PageBounds;
  /** Semantics the source refuses to assert; a screen must not claim them either. */
  semantics: Readonly<Record<string, string>>;
  /** Requirements the owner still has to close, named by the server. */
  externalGates: readonly { requirementId: string; status: string }[];
  /** R3-2 per-profile qualification; empty when the server published none. */
  profileQualification: readonly ProfileQualification[];
  /** The ledger digest, so evidence can be tied to an exact server build. */
  profileQualificationDigest: string | null;
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
  const qualification = obj(body.r3_profile_qualification);
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
    // Absent on a server older than R3-2. An empty list means "the server said
    // nothing", which screens must treat as "no verdict", never as "qualified".
    profileQualification: (Array.isArray(qualification?.profiles) ? qualification.profiles : []).flatMap((entry) => {
      const row = obj(entry);
      const environment = row && str(row.environment);
      const currentPageRead = row && str(row.current_page_read);
      const marketContext = row && str(row.market_context);
      return environment && currentPageRead && marketContext
        ? [{ environment, currentPageRead, marketContext, marketContextReason: str(row.market_context_reason) }]
        : [];
    }),
    profileQualificationDigest: qualification ? str(qualification.ledger_sha256) : null,
  };
}

/**
 * The sentence a market panel shows, built only from what the server stated.
 *
 * Returns `null` when the server published no verdict for this environment —
 * in which case the panel keeps whatever reason its own read gave it. Silence
 * from the manifest is not a verdict, and must never be rendered as one.
 */
export function marketContextVerdict(
  manifest: RuntimeManifest | null,
  environment: string | null | undefined,
): { state: string; reason: string; pending: boolean } | null {
  if (!manifest || !environment) return null;
  const row = manifest.profileQualification.find((entry) => entry.environment === environment.toLowerCase());
  if (!row) return null;
  const pending = row.marketContext === "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION";
  // The reason code is the server's, and it is kept verbatim: an operator who
  // reports it must be quoting the same string the backend ledger holds.
  const code = row.marketContextReason ?? row.marketContext;
  return {
    state: row.marketContext,
    pending,
    reason: pending
      ? `${code} — the source route was reached and the running Manager image rejected the contract, so this is pending requalification, not a missing feature.`
      : `${code} — market context has not been independently qualified for ${environment.toUpperCase()}; a proof on another profile does not enable this one.`,
  };
}

/** Where a bound came from — the word a caption needs. */
export type BoundsSource = "SERVER_DECLARED" | "FRONTEND_DEFAULT";

export function boundsOf(manifest: RuntimeManifest | null): { bounds: PageBounds; source: BoundsSource } {
  return manifest
    ? { bounds: manifest.bounds, source: "SERVER_DECLARED" }
    : { bounds: DEFAULT_PAGE_BOUNDS, source: "FRONTEND_DEFAULT" };
}
