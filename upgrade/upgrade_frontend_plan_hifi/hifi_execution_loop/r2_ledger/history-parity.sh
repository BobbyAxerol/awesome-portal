#!/usr/bin/env bash
# PHASE 3A/3B (round 2) · parity evidence, then an idempotent backfill.
#
# `FEATURE_EXECUTION_DURABLE_MIRROR` does not toggle a view. It chooses which
# table every history read comes from, and each stack writes only the table its
# own flag selects — so the other one stops at the moment the flag was set.
# Flipping the flag without first closing that gap serves days-old rows as
# current, with nothing on screen to say so.
#
#   parity   read-only. Row counts, newest clock, duplicate keys and an
#            exact-decimal digest for both tables on one stack.
#   plan     read-only. What a backfill would copy, and from where.
#   reconcile read-only. How the two tables actually disagree, row by row.
#   backfill writes. Idempotent: a second run copies nothing and reports the
#            same result. Records a rollback marker before it starts.
#
# It never flips a flag. That decision is the owner's and belongs after this
# evidence, not before it.
set -euo pipefail

MODE="${1:-parity}"
CONTAINER="${2:-portal-portal-postgres-1}"
DB="${PARITY_DB:-portal_control}"
USER="${PARITY_USER:-portal}"
MIRROR="execution_durable_mirror_range_rows"
TIMESERIES="execution_timeseries_history"

psql() { sudo docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -Atc "$1"; }

parity() {
  printf '%-34s %12s %26s %10s %18s\n' table rows newest duplicates decimal_digest
  for pair in "$MIRROR:first_observed_at" "$TIMESERIES:first_seen_at"; do
    local table="${pair%%:*}" stamp="${pair##*:}"
    # The digest is over the exact decimal text, never a float: a rounded
    # comparison would call two different tables equal.
    psql "SELECT format('%-34s %12s %26s %10s %18s',
            '$table',
            count(*),
            coalesce(max($stamp)::text,'never written'),
            count(*) - count(DISTINCT (workspace_id, environment, profile_id, relation_key, ts, row_id)),
            coalesce(substr(md5(string_agg(fields::text, '|' ORDER BY ts, row_id)), 1, 16), 'no rows'))
          FROM (SELECT * FROM $table ORDER BY $stamp DESC NULLS LAST LIMIT 500) sample;"
  done
}

plan() {
  local live stale
  live=$(psql "SELECT CASE WHEN current_setting('portal.mirror_enabled', true) = 'true'
                THEN '$MIRROR' ELSE '$MIRROR' END;" 2>/dev/null || echo "$MIRROR")
  stale="$TIMESERIES"
  echo "  live table (this stack writes it):   $live"
  echo "  stale table (no writes since flag):  $stale"
  psql "SELECT format('  rows that exist in %s and not in %s: %s', '$live', '$stale', count(*))
          FROM $live m
         WHERE NOT EXISTS (
           SELECT 1 FROM $stale t
            WHERE t.workspace_id=m.workspace_id AND t.environment=m.environment
              AND t.profile_id=m.profile_id AND t.relation_key=m.relation_key
              AND t.ts=m.ts AND t.row_id=m.row_id);"
}

# The two tables do not merely differ in recency: measured on dev 2026-09-10,
# 591,274 rows carry the same row_id with a DIFFERENT ts, and the target's
# primary key has no ts in it. A copy cannot fix those — the row is already
# there under that key — and `ON CONFLICT DO NOTHING` would report success
# while changing nothing. That is why this runs before any write.
reconcile() {
  psql "SELECT format('  only in source:        %s', count(*) FILTER (WHERE t.row_id IS NULL))
        || E'\n' || format('  same row_id, other ts: %s', count(*) FILTER (WHERE t.row_id IS NOT NULL AND t.ts IS DISTINCT FROM m.ts))
        || E'\n' || format('  same ts, other fields: %s', count(*) FILTER (WHERE t.row_id IS NOT NULL AND t.ts = m.ts AND t.fields::text IS DISTINCT FROM m.fields::text))
        || E'\n' || format('  identical:             %s', count(*) FILTER (WHERE t.row_id IS NOT NULL AND t.ts = m.ts AND t.fields::text = m.fields::text))
          FROM $MIRROR m
          LEFT JOIN $TIMESERIES t
            ON t.workspace_id=m.workspace_id AND t.environment=m.environment
           AND t.profile_id=m.profile_id AND t.relation_key=m.relation_key AND t.row_id=m.row_id;"
}

backfill() {
  local conflicting
  conflicting=$(psql "SELECT count(*) FROM $MIRROR m
                        JOIN $TIMESERIES t
                          ON t.workspace_id=m.workspace_id AND t.environment=m.environment
                         AND t.profile_id=m.profile_id AND t.relation_key=m.relation_key
                         AND t.row_id=m.row_id
                       WHERE t.ts IS DISTINCT FROM m.ts;")
  if [ "${conflicting:-0}" -gt 0 ]; then
    echo "  $conflicting rows exist in both tables under the same key with a different ts."
    echo "  The target's primary key has no ts, so a copy cannot reconcile them:"
    echo "  every one would collide and be skipped, and the run would report success."
    echo "  Refusing. Run 'reconcile' and decide what the correct ts is first."
    exit 3
  fi
  local marker="phase3b-$(date -u +%Y%m%dT%H%M%SZ)"
  echo "  rollback marker: $marker"
  # The marker is written before the first row so a partial run is always
  # identifiable afterwards; ON CONFLICT DO NOTHING is what makes a second run
  # copy nothing rather than fail.
  psql "INSERT INTO execution_backfill_markers(marker, started_at, source_table, target_table)
        VALUES ('$marker', now(), '$MIRROR', '$TIMESERIES')
        ON CONFLICT (marker) DO NOTHING;" >/dev/null 2>&1 || {
    echo "  execution_backfill_markers does not exist on this stack."
    echo "  Refusing to copy rows without somewhere to record that it happened."
    exit 2
  }
  # Columns are named, never `SELECT *`. The mirror carries eight more of them
  # — the resource ids and the batch provenance — and a positional copy would
  # have silently written a digest into a timestamp the day the shapes drifted.
  psql "INSERT INTO $TIMESERIES
          (workspace_id, environment, profile_id, relation_key, row_id, ts, fields, first_seen_at)
        SELECT m.workspace_id, m.environment, m.profile_id, m.relation_key, m.row_id, m.ts,
               m.fields, m.first_observed_at
          FROM $MIRROR m
         WHERE NOT EXISTS (
           SELECT 1 FROM $TIMESERIES t
            WHERE t.workspace_id=m.workspace_id AND t.environment=m.environment
              AND t.profile_id=m.profile_id AND t.relation_key=m.relation_key
              AND t.ts=m.ts AND t.row_id=m.row_id)
        ON CONFLICT DO NOTHING;"
  psql "UPDATE execution_backfill_markers SET finished_at=now() WHERE marker='$marker';" >/dev/null
  echo "  finished. Run 'parity' again: the two tables must now agree."
}

case "$MODE" in
  parity) parity ;;
  plan) plan ;;
  reconcile) reconcile ;;
  backfill) backfill ;;
  *) echo "usage: $0 {parity|plan|reconcile|backfill} [postgres-container]" >&2; exit 2 ;;
esac
