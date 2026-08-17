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
      "Digest khớp và manifest hợp lệ. Alpha đang nằm trong quarantine, chưa đăng ký vào runtime — chưa chạy được cho tới khi có slice certification.",
    tone: "degraded",
    persisted: true,
  },
  DIGEST_MISMATCH: {
    label: "Digest mismatch",
    meaning:
      "Artifact nhận được không khớp digest mà manifest công bố. Import bị giữ lại; không có gì được đăng ký.",
    tone: "denied",
    persisted: true,
  },
  INVALID_MANIFEST: {
    label: "Invalid manifest",
    meaning:
      "Manifest không đạt schema alpha-manifest.v1. Bị từ chối ngay khi nhận, không có gì được ghi.",
    tone: "denied",
    persisted: false,
  },
  ALREADY_REGISTERED: {
    label: "Already registered",
    meaning:
      "Alpha version này đã có trong registry bất biến hoặc đã có import trước đó. Registry không bị ghi đè.",
    tone: "unavailable",
    persisted: false,
  },
  PENDING_DIGEST: {
    label: "Pending digest",
    meaning:
      "Đang chờ verify digest. Contract khai báo state này nhưng pipeline hiện tại chưa sinh ra nó.",
    tone: "stale",
    persisted: false,
  },
};

export function importStatePresentation(state: ImportState): ImportStatePresentation {
  return (
    PRESENTATION[state] ?? {
      label: state,
      meaning: "State không có trong contract frontend đang biết — không suy diễn ý nghĩa.",
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
