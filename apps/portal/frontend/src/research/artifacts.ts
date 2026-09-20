/**
 * Research Loop — durable artifact consumer harness (P05 FE/consumer scope).
 *
 * P05 changes no browser route and publishes no DTO yet; P10/P11 will. What it
 * does freeze is the artifact state vocabulary and the rules a panel must obey
 * for each one, and those are what this module encodes so the screens built
 * later inherit them instead of re-deciding.
 *
 * Deliberately absent, because P05 forbids them: any filesystem path, database
 * locator, lease epoch, worker identity, HMAC key or raw relation cursor; any
 * direct data request; and any `READY` state — P05 has five states and `READY`
 * is not one of them.
 *
 * The rule most likely to be lost is the third one below: a candidate sealed on
 * disk is *not* a registered `SEALED` artifact. Offering a download from an
 * unregistered candidate hands the user bytes the authority has not accepted.
 */

/** The exact typed states. There is no `READY`. */
export type ResearchArtifactState = "WRITING" | "SEALED" | "CORRUPT" | "MISSING" | "ABORTED";

export const RESEARCH_ARTIFACT_STATES: readonly ResearchArtifactState[] = [
  "WRITING",
  "SEALED",
  "CORRUPT",
  "MISSING",
  "ABORTED",
] as const;

export interface ArtifactFacts {
  state: ResearchArtifactState;
  /**
   * Whether the authority has registered this artifact. A filesystem seal is
   * not a registration, so this is a separate fact from `state === "SEALED"`.
   */
  registered: boolean;
  /**
   * Whether the server has published a scoped export action for it. The
   * browser never decides this; absent means no action.
   */
  serverAdmittedExport: boolean;
  /** Server-provided explanation, when there is one. Never composed locally. */
  reason?: string | null;
}

export interface ArtifactPanel {
  state: ResearchArtifactState;
  /** The exact state label. Not a friendlier synonym. */
  label: ResearchArtifactState;
  /** The panel always stays; only its truth changes. */
  retainsPanel: true;
  /** A download or export control may be rendered. */
  showsExport: boolean;
  /** Why the export is absent, when it is. */
  exportWithheldBecause: string | null;
  /** True only while bytes are still being written. */
  inProgress: boolean;
  /** An integrity problem the user must not be able to act through. */
  integrityFailure: boolean;
  reason: string | null;
}

/**
 * Export requires three independent facts, not one. Any of them missing
 * removes the control — silence is the safe default when the authority has
 * not spoken.
 */
export function mayExport(facts: ArtifactFacts): boolean {
  return facts.state === "SEALED" && facts.registered && facts.serverAdmittedExport;
}

function withheldReason(facts: ArtifactFacts): string | null {
  if (mayExport(facts)) return null;
  if (facts.state !== "SEALED") return `Artifact is ${facts.state}, not sealed.`;
  if (!facts.registered) {
    // The distinction this sentence draws is the whole point of the rule.
    return "Sealed on disk but not registered by the authority.";
  }
  return "The server has not published an export action for this artifact.";
}

export function artifactPanel(facts: ArtifactFacts): ArtifactPanel {
  return {
    state: facts.state,
    label: facts.state,
    retainsPanel: true,
    showsExport: mayExport(facts),
    exportWithheldBecause: withheldReason(facts),
    inProgress: facts.state === "WRITING",
    integrityFailure: facts.state === "CORRUPT" || facts.state === "MISSING",
    reason: facts.reason ?? null,
  };
}

/* -------------------------------------------------------------------------
 * Exact values
 *
 * A decimal that arrives as a string stays a string. `Number("0.1")` is not
 * `0.1`, and a financial figure that survives the network only to be rounded
 * by the renderer is a wrong number displayed confidently.
 * ---------------------------------------------------------------------- */

/** Returns the decimal exactly as the server sent it, or null if absent. */
export function exactDecimal(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

/**
 * True when a string round-trips through the renderer unchanged. Used by tests
 * to prove no float conversion happened anywhere in the path.
 */
export function decimalRoundTrips(value: string): boolean {
  return exactDecimal(value) === value;
}

/** ISO-8601 UTC with milliseconds retained. Anything else is rejected, not coerced. */
const UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isUtcMillis(value: string): boolean {
  return UTC_MS.test(value);
}

/**
 * Keeps a timestamp exactly as received when it already carries UTC
 * milliseconds. A value in any other shape is returned as null rather than
 * reformatted, so a screen shows its state instead of a silently altered time.
 */
export function exactUtcMillis(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !isUtcMillis(value)) return null;
  return value;
}

/* -------------------------------------------------------------------------
 * Bounded reads
 * ---------------------------------------------------------------------- */

export interface ArtifactWindow {
  /** Rows the server returned for this page. */
  returnedRows: number;
  /** Rows the artifact holds in total, before any cap. */
  totalRows: number;
  /** Opaque server cursor. Never parsed, never constructed locally. */
  nextCursor: string | null;
}

/**
 * True when the caller is holding a page rather than the whole artifact.
 * A screen that has to load every row to compute a total has already lost the
 * bound the server was maintaining.
 */
export function isBoundedWindow(window: ArtifactWindow): boolean {
  return window.returnedRows <= window.totalRows && window.returnedRows >= 0;
}

/** The honest caption for a capped list: never `returned` alone. */
export function windowCaption(window: ArtifactWindow): string {
  return window.returnedRows === window.totalRows
    ? `${window.totalRows} rows`
    : `${window.returnedRows} of ${window.totalRows} rows`;
}
