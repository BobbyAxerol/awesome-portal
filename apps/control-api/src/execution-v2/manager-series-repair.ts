/**
 * BE-P16 CR-02: the revision-scoped retry budget of the bounded series repair, as a pure state machine (no I/O; the store persists it in
 * `execution_manager_series_checkpoints.repair_attempts`, migration 148).
 *
 * The budget of a revision is the number of repair attempts ALREADY refused for that revision. It is keyed by revision and independent of the
 * single mutable `last_error_*` diagnostic, so a later or interleaved failure for another revision can neither reset nor consume it.
 *  - `refuse`: a repair of `revision` was refused. attempt = spent + 1. While attempt < SERIES_REPAIR_ATTEMPTS the revision keeps an entry
 *    (retry on a later tick); the last attempt EXHAUSTS the budget: the entry is removed and the caller states the gap and moves the cursor on.
 *  - `settle`: the revision was repaired / recorded live / became a gap: only ITS entry is removed.
 * At most SERIES_REPAIR_MAX_TRACKED entries exist; when a new revision would exceed the cap the oldest entry is evicted. Eviction can only
 * restart the evicted revision's budget, and the repair works one revision at a time, so the cap is a hard storage bound, not an operating regime.
 */
export const SERIES_REPAIR_ATTEMPTS = 3;
export const SERIES_REPAIR_MAX_TRACKED = 16;
export interface RepairEntry { revision: string; attempts: number; }
export interface RepairRefusal { attempt: number; exhausted: boolean; entries: RepairEntry[]; }

/** Tolerant reader of the stored array: anything not shaped {revision: non-empty string, attempts: 1..ATTEMPTS-1} is dropped; a duplicate keeps the last. */
export function parseRepairEntries(raw: unknown): RepairEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RepairEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { revision, attempts } = item as { revision?: unknown; attempts?: unknown };
    if (typeof revision !== "string" || !revision || typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 1 || attempts >= SERIES_REPAIR_ATTEMPTS) continue;
    const at = out.findIndex(e => e.revision === revision);
    if (at >= 0) out.splice(at, 1);
    out.push({ revision, attempts });
  }
  return out.slice(-SERIES_REPAIR_MAX_TRACKED);
}

export const spentAttempts = (entries: readonly RepairEntry[], revision: string): number => entries.find(e => e.revision === revision)?.attempts ?? 0;

/** A repair of `revision` was refused: the next attempt number, whether the budget is now exhausted (the gap must be stated) and the new entries. */
export function refuse(entries: readonly RepairEntry[], revision: string): RepairRefusal {
  const attempt = spentAttempts(entries, revision) + 1, rest = entries.filter(e => e.revision !== revision);
  if (attempt >= SERIES_REPAIR_ATTEMPTS) return { attempt, exhausted: true, entries: rest };
  return { attempt, exhausted: false, entries: [...rest, { revision, attempts: attempt }].slice(-SERIES_REPAIR_MAX_TRACKED) };
}

/** The revision is no longer being repaired (repaired, recorded live, or a stated gap): only its own entry goes. */
export const settle = (entries: readonly RepairEntry[], revision: string): RepairEntry[] => entries.filter(e => e.revision !== revision);
