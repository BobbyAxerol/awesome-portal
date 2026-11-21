#!/usr/bin/env bash
# Read-only Postgres size / bloat report for every running Postgres container of this host.
#
#   scripts/postgres-bloat-report.sh                 # report only
#   scripts/postgres-bloat-report.sh --fail-over-gb 5   # exit 1 when any single table exceeds 5 GB
#
# Why it exists (2026-10-09): one cache table (`execution_shared_read_cache`) held 81 GB of TOAST space while it contained 0 rows, in a
# Postgres nobody was watching. Autovacuum had run; a VACUUM marks space reusable but never shrinks the file. Nothing alerted on
# physical size. This report is the cheap guard: per table it prints total / heap / TOAST / index size next to the live-row count, so a
# big file under few rows (bloat) is visible at a glance. It never writes, never takes a lock stronger than a catalog read.
set -euo pipefail

LIMIT_GB=""
if [[ "${1:-}" == "--fail-over-gb" ]]; then LIMIT_GB="${2:?--fail-over-gb needs a number}"; fi

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); else echo "cannot reach Docker" >&2; exit 2; fi
fi

SQL=$(cat <<'SQL'
select current_database() as db, pg_size_pretty(pg_database_size(current_database())) as database;
select n.nspname || '.' || c.relname as "table",
       pg_size_pretty(pg_total_relation_size(c.oid))                                   as total,
       pg_size_pretty(pg_relation_size(c.oid))                                         as heap,
       pg_size_pretty(coalesce(pg_total_relation_size(nullif(c.reltoastrelid, 0)), 0)) as toast,
       pg_size_pretty(pg_indexes_size(c.oid))                                          as indexes,
       coalesce(s.n_live_tup, 0)                                                       as live_rows,
       coalesce(s.n_dead_tup, 0)                                                       as dead_rows,
       to_char(greatest(s.last_autovacuum, s.last_vacuum), 'YYYY-MM-DD HH24:MI')       as last_vacuum,
       pg_total_relation_size(c.oid)                                                   as bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
order by bytes desc limit 6;
SQL
)

status=0
for container in $("${DOCKER[@]}" ps --format '{{.Names}}' | grep -iE 'postgres|[-_]pg$' || true); do
  user=$("${DOCKER[@]}" exec "$container" printenv POSTGRES_USER 2>/dev/null || echo postgres)
  for db in $("${DOCKER[@]}" exec "$container" psql -U "$user" -d postgres -At -c "select datname from pg_database where datistemplate = false and datname <> 'postgres'" 2>/dev/null); do
    echo "=== $container / $db"
    "${DOCKER[@]}" exec -i "$container" psql -U "$user" -d "$db" -P pager=off -F ' | ' -A < <(printf '%s\n' "$SQL") 2>&1 | sed 's/^/  /' | cut -c1-170
    if [[ -n "$LIMIT_GB" ]]; then
      over=$("${DOCKER[@]}" exec "$container" psql -U "$user" -d "$db" -At -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema','pg_toast') and pg_total_relation_size(c.oid) > ${LIMIT_GB}::numeric * 1024^3")
      if [[ "$over" != "0" ]]; then echo "  !! $over table(s) over ${LIMIT_GB} GB in $container/$db"; status=1; fi
    fi
  done
done
exit "$status"
