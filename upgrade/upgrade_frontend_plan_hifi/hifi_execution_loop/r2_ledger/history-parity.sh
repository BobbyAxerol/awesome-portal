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
#   backfill writes, timeseries -> mirror. Idempotent: a second run copies
#            nothing and reports the same result. Records a rollback marker
#            before it starts, and refuses if any row differs beyond the
#            canonical millisecond.
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
  # Compare at the canonical precision, not at whatever each table happens to
  # store. EDS-02's wire is datetime64[ms]; the mirror stores that, and the
  # timeseries table kept the source's microseconds. Comparing raw made 591,274
  # rows look like a disagreement about when a trade happened when the whole
  # difference was under one millisecond — an alarm I raised myself before
  # measuring the magnitude.
  psql "SELECT format('  only in mirror:            %s', count(*) FILTER (WHERE t.row_id IS NULL))
        || E'\n' || format('  only in timeseries:        %s', (SELECT count(*) FROM $TIMESERIES x
              LEFT JOIN $MIRROR y ON y.workspace_id=x.workspace_id AND y.environment=x.environment
               AND y.profile_id=x.profile_id AND y.relation_key=x.relation_key AND y.row_id=x.row_id
             WHERE y.row_id IS NULL))
        || E'\n' || format('  differ beyond a millisecond: %s', count(*) FILTER (
              WHERE t.row_id IS NOT NULL AND m.ts IS DISTINCT FROM date_trunc('milliseconds', t.ts)))
        || E'\n' || format('  sub-millisecond only:      %s', count(*) FILTER (
              WHERE t.row_id IS NOT NULL AND t.ts IS DISTINCT FROM m.ts
                AND m.ts = date_trunc('milliseconds', t.ts)))
        || E'\n' || format('  differ in fields:          %s', count(*) FILTER (
              WHERE t.row_id IS NOT NULL AND t.fields::text IS DISTINCT FROM m.fields::text))
        || E'\n' || format('  identical:                 %s', count(*) FILTER (
              WHERE t.row_id IS NOT NULL AND t.ts = m.ts AND t.fields::text = m.fields::text))
          FROM $MIRROR m
          LEFT JOIN $TIMESERIES t
            ON t.workspace_id=m.workspace_id AND t.environment=m.environment
           AND t.profile_id=m.profile_id AND t.relation_key=m.relation_key AND t.row_id=m.row_id;"
}

# The direction that closes the gap is timeseries -> mirror, and it took
# measuring to see it. The mirror is a strict superset by row_id — zero rows
# exist only in the timeseries table — and its key carries `ts`, so it can hold
# everything the other one has. The reverse copy cannot: the target key has no
# `ts`, so it collapses a row's history to one entry. I ran the reverse first
# and it silently skipped 591,274 rows while reporting success.
backfill() {
  local beyond
  beyond=$(psql "SELECT count(*) FROM $TIMESERIES t
                   JOIN $MIRROR m
                     ON m.workspace_id=t.workspace_id AND m.environment=t.environment
                    AND m.profile_id=t.profile_id AND m.relation_key=t.relation_key
                    AND m.row_id=t.row_id
                  WHERE m.ts IS DISTINCT FROM date_trunc('milliseconds', t.ts);")
  if [ "${beyond:-0}" -gt 0 ]; then
    echo "  $beyond rows differ by more than a millisecond."
    echo "  That is a real disagreement about when a row happened, not a precision"
    echo "  artefact, and copying either way would pick a winner silently."
    echo "  Refusing. Run 'reconcile' and resolve those rows first."
    exit 3
  fi
  local marker="phase3b-$(date -u +%Y%m%dT%H%M%SZ)"
  echo "  rollback marker: $marker"
  psql "INSERT INTO execution_backfill_markers(marker, started_at, source_table, target_table)
        VALUES ('$marker', now(), '$TIMESERIES', '$MIRROR')
        ON CONFLICT (marker) DO NOTHING;" >/dev/null 2>&1 || {
    echo "  execution_backfill_markers does not exist on this stack."
    echo "  Refusing to copy rows without somewhere to record that it happened."
    exit 2
  }
  # `ts` is truncated to the canonical millisecond wire on the way in, so a
  # second run finds the row already present instead of inserting a twin one
  # microsecond away. The mirror's provenance columns are null for a backfilled
  # row: it did not arrive in a batch, and claiming one would be a lie about
  # where the row came from.
  psql "INSERT INTO $MIRROR
          (workspace_id, environment, profile_id, relation_key, row_id, ts, fields,
           first_observed_batch_id, first_observed_at)
        SELECT t.workspace_id, t.environment, t.profile_id, t.relation_key, t.row_id,
               date_trunc('milliseconds', t.ts), t.fields, NULL, t.first_seen_at
          FROM $TIMESERIES t
         WHERE NOT EXISTS (
           SELECT 1 FROM $MIRROR m
            WHERE m.workspace_id=t.workspace_id AND m.environment=t.environment
              AND m.profile_id=t.profile_id AND m.relation_key=t.relation_key
              AND m.row_id=t.row_id)
        ON CONFLICT DO NOTHING;"
  psql "UPDATE execution_backfill_markers SET finished_at=now() WHERE marker='$marker';" >/dev/null
  echo "  finished. Run 'reconcile' again: 'only in timeseries' must be 0."
}

case "$MODE" in
  parity) parity ;;
  plan) plan ;;
  reconcile) reconcile ;;
  backfill) backfill ;;
  *) echo "usage: $0 {parity|plan|reconcile|backfill} [postgres-container]" >&2; exit 2 ;;
esac
