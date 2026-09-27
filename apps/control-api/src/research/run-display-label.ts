/**
 * D1 — the short run label every Research screen prints (`R-WFO-118`).
 *
 * The hi-fi names a run `R-WFO-118` in the page breadcrumb, the Screen-09
 * title, the Screen-10/11/13 cards and the shell topbar. The wire identity is
 * a 37-character `rrun_<32 hex>`, which breaks every one of those headers, so
 * the server publishes a short label beside it. `run_id` remains the identity:
 * nothing may be looked up, filtered or routed by the label.
 *
 * Two rules decide the shape:
 *
 *  - **The server derives it, never the browser.** Two readers numbering runs
 *    locally would disagree the moment their pages held different rows, and a
 *    label two people read differently is worse than no label at all.
 *  - **It needs no stored column.** The ordinal is a count of the logical runs
 *    of the same kind that this workspace created no later than this one,
 *    ordered by `created_at` with `run_id` as the tiebreak. `research.runs` is
 *    append-only and `created_at` is written once by the producer insert, so a
 *    run's ordinal is fixed at the moment it is accepted: later runs take
 *    later numbers and never renumber the ones already issued. Deleting a run,
 *    or back-dating one, would shift every ordinal after it — neither happens
 *    on this schema (there is no delete path, and `created_at` is covered by
 *    the run-producer immutability trigger).
 *
 * The kind is the run's execution profile, not its optimization mode: the
 * profile is a stored, CHECK-constrained column on `research.run_producers`
 * (migration 062), while the mode lives in the preflight manifest's JSONB and
 * is absent for a run whose manifest was not retained. A profile this map does
 * not know yields **no label** rather than an invented token — the screens
 * then fall back to the short id, which is honest, where `R-UNKNOWN-007`
 * would not be.
 */

/** Stored execution profile -> the kind token the hi-fi prints. */
export const RUN_DISPLAY_LABEL_KINDS: Readonly<Record<string, string>> = {
  "p10.delta-signal-notional-wfo.v1": "WFO",
  "p04.fixed-qualification.v1": "P04",
};

/** The hi-fi pads to three digits (`R-TT-002`, `R-WFO-118`). */
const ORDINAL_DIGITS = 3;

/**
 * The label for one run, or `null` when it cannot be derived.
 *
 * `null` is a real answer and must stay distinct from a label: a worker child,
 * a legacy 1.0.8 row and a run on an unmapped profile all have no ordinal of
 * their own, and the caller prints the short id instead.
 */
export function runDisplayLabel(
  executionProfileId: string | null | undefined,
  ordinal: number | null | undefined,
): string | null {
  if (typeof executionProfileId !== "string") return null;
  const kind = RUN_DISPLAY_LABEL_KINDS[executionProfileId];
  if (kind === undefined) return null;
  if (typeof ordinal !== "number" || !Number.isInteger(ordinal) || ordinal < 1) return null;
  return `R-${kind}-${String(ordinal).padStart(ORDINAL_DIGITS, "0")}`;
}

/**
 * The scalar subquery that counts a run's position among the logical runs of
 * its own kind in its own workspace.
 *
 * One definition, used by every read that publishes the label, because three
 * hand-written copies would be three chances for two screens to disagree about
 * the same run. `runAlias` must resolve to a `research.runs` row and
 * `producerAlias` to its `research.run_producers` row.
 *
 * Only `relationship_kind = 'PRIMARY'` rows are counted and only a PRIMARY row
 * is given an ordinal: an audit, reproduction or worker child is a child of a
 * logical run, not a run of its own, and numbering it would make the sequence
 * skip for everybody else.
 */
export function runDisplayOrdinalSql(runAlias: string, producerAlias: string): string {
  return `CASE WHEN ${runAlias}.relationship_kind = 'PRIMARY' THEN (
            SELECT count(*)
              FROM research.runs peer_run
              JOIN research.run_producers peer_producer
                ON peer_producer.workspace_id = peer_run.workspace_id
               AND peer_producer.run_id = peer_run.run_id
             WHERE peer_run.workspace_id = ${runAlias}.workspace_id
               AND peer_run.relationship_kind = 'PRIMARY'
               AND peer_producer.execution_profile_id = ${producerAlias}.execution_profile_id
               AND (peer_run.created_at, peer_run.run_id)
                   <= (${runAlias}.created_at, ${runAlias}.run_id)
          ) END`;
}

/** A `count(*)` arrives as a string or a bigint driver value; neither is a number. */
export function runDisplayOrdinal(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 ? value : null;
  if (typeof value === "bigint") return value >= 1n ? Number(value) : null;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed >= 1 ? parsed : null;
  }
  return null;
}
