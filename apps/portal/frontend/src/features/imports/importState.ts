/**
 * Alpha import states (U14, strategy import contract §5/§6).
 *
 * The pipeline is fail-closed: an import lands in quarantine and blocks
 * everything until a certification slice promotes it. So the honest reading of
 * every state here is "not runnable", and the screen must never let a
 * quarantined alpha look approved.
 *
 * Only two of the five declared states are ever *stored*: the service writes a
 * record for `QUARANTINED` and `DIGEST_MISMATCH`, and returns the other three
 * as a rejection response without persisting them. All five are still handled,
 * because the contract declares all five — a state we do not render would be a
 * blank row the day the backend starts writing it.
 */
import type { AlphaImportRecord } from "../../portal/contracts";

export type ImportState = AlphaImportRecord["state"];

export interface ImportStatePresentation {
  label: string;
  /** What actually happened, in the operator's terms. */
  meaning: string;
  /** Maps onto the shared availability tones, so the badge reads like the rest of the shell. */
  tone: "denied" | "degraded" | "unavailable" | "stale";
  /** Whether a record in this state is written to the inbox at all. */
  persisted: boolean;
}

const PRESENTATION: Record<ImportState, ImportStatePresentation> = {
  QUARANTINED: {
    label: "Quarantined",
    meaning:
      "The digest matches and the manifest is valid. The alpha sits in quarantine, unregistered in the runtime, and cannot run until the certification slice lands.",
    tone: "degraded",
    persisted: true,
  },
  DIGEST_MISMATCH: {
    label: "Digest mismatch",
    meaning:
      "The artifact received does not match the digest the manifest publishes. The import is held; nothing was registered.",
    tone: "denied",
    persisted: true,
  },
  INVALID_MANIFEST: {
    label: "Invalid manifest",
    meaning:
      "The manifest does not satisfy the alpha-manifest.v1 schema. Rejected on receipt; nothing was written.",
    tone: "denied",
    persisted: false,
  },
  ALREADY_REGISTERED: {
    label: "Already registered",
    meaning:
      "This alpha version already exists in the immutable registry, or a previous import claimed it. The registry is never overwritten.",
    tone: "unavailable",
    persisted: false,
  },
  PENDING_DIGEST: {
    label: "Pending digest",
    meaning:
      "Waiting on digest verification. The contract declares this state, but the current pipeline does not produce it.",
    tone: "stale",
    persisted: false,
  },
};

export function importStatePresentation(state: ImportState): ImportStatePresentation {
  return (
    PRESENTATION[state] ?? {
      label: state,
      meaning: "A state absent from the contract this frontend knows — no meaning is inferred for it.",
      tone: "unavailable",
      persisted: false,
    }
  );
}

/** Every state the contract declares, in the order the screen documents them. */
export const IMPORT_STATES: ImportState[] = [
  "QUARANTINED",
  "DIGEST_MISMATCH",
  "PENDING_DIGEST",
  "INVALID_MANIFEST",
  "ALREADY_REGISTERED",
];

/**
 * No import state means "runnable".
 *
 * Quarantine is the whole point of the pipeline: even a clean digest only earns
 * the alpha a place in the queue. This exists so a caller cannot accidentally
 * treat `digest_ok` as approval.
 */
export function isRunnable(): false {
  return false;
}

export interface ImportCounts {
  total: number;
  byState: Partial<Record<ImportState, number>>;
}

export function importCounts(records: readonly AlphaImportRecord[]): ImportCounts {
  const byState: Partial<Record<ImportState, number>> = {};
  for (const record of records) {
    byState[record.state] = (byState[record.state] ?? 0) + 1;
  }
  return { total: records.length, byState };
}

/**
 * Sorts newest first, matching the order the service returns.
 *
 * Re-sorting here rather than trusting the response keeps the screen stable if
 * a caller merges records from more than one page later.
 */
export function newestFirst(records: readonly AlphaImportRecord[]): AlphaImportRecord[] {
  return [...records].sort((left, right) => right.received_at.localeCompare(left.received_at));
}
