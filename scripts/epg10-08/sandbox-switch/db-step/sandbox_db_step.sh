#!/bin/bash
# Sandbox DB preparation (owner approved the Sandbox switch per docs/SANDBOX_SWITCH_PLAN_20261116.md D1-D12; THIS script needs its own exact-hash approval).
# status | inspect | login | grants | hba | indexes | verify | rollback-db      One step per call, stops at the first error.
# Touches ONLY: the cluster in container live_data_executor (a NEW login role, SELECT/CONNECT grants inside trading_system_sandbox, ONE pg_hba line for the new login,
# nine read indexes + 2 ledger rows in trading_system_sandbox) and the new private dir /home/bobby/secure/portal-manager-sandbox-20261116 (new DSN file, 0600).
# Never touches: the Paper database trading_system, the legacy live_data_executor database, any other role, any running Manager/Edge/worker container.
# The password is generated here (openssl rand), never printed, never in argv; it only reaches psql on stdin and the 0600 DSN file.
set -euo pipefail
PGC=live_data_executor
DB=trading_system_sandbox
LOGIN=ts_portal_manager_read_sandbox_facade
SEC=/home/bobby/secure/portal-manager-sandbox-20261116
DSNF=$SEC/facade-db.dsn
SRC=${SBX_SQL_SRC:-/home/bobby/.worktrees/edge-from-running-source-20261116/scripts/epg10-08/sandbox-switch}
SQLF=$SRC/sandbox_manager_roles_grants.DRAFT.sql
REPO=${SBX_TS_REPO:-/home/bobby/.worktrees/ts-manager-source-identity-20261116}          # installer 0238a113..., staged migration files 2c8ee292.../e786efd8...
TESTIMG=local/trading-system-test:laneb-native-b7b59839b5a6
HBA_LINE="hostssl  trading_system_sandbox  $LOGIN  172.18.0.0/16  scram-sha-256"
psql_adm() { docker exec -i $PGC psql -X -v ON_ERROR_STOP=1 -q -At -U bobby "$@"; }
h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
gate() {
  need $SQLF d436664c0d83e8ac10f5ef05001bd309171d553d09d5991a448141b52b9a6877
  need $REPO/scripts/t1_read_index_install.py 0238a113ba61a87a1a194af844940a70028cee79202d98bb3b397f4c157a3013
  [ "$(docker inspect $PGC --format '{{.State.Status}}')" = running ] || { echo "STOP: $PGC not running"; exit 3; }
  [ "$(psql_adm -d $DB -c 'select count(*) from public.schema_migration_ledger')" = "$EXPECT_LEDGER" ] || { echo "STOP: sandbox ledger is not $EXPECT_LEDGER"; exit 3; }
  [ "$(psql_adm -d postgres -c "select count(*) from pg_hba_file_rules where error is not null")" = 0 ] || { echo "STOP: pg_hba has errors before we start"; exit 3; }
}
EXPECT_LEDGER=${EXPECT_LEDGER:-122}
role_exists() { [ "$(psql_adm -d postgres -c "select count(*) from pg_roles where rolname='$LOGIN'")" = 1 ]; }
case "${1:-}" in
status) psql_adm -d $DB -c "select current_database(), (select count(*) from public.schema_migration_ledger)"; role_exists && echo "login exists" || echo "login absent"
  psql_adm -d postgres -c "select count(*) from pg_hba_file_rules where database::text like '%trading_system_sandbox%' and user_name::text like '%$LOGIN%'" | sed 's/^/hba lines for the login: /'; ls -l $SEC 2>&1 | head ;;
inspect) gate; echo "inspect ok (gate passed)";;
login)  gate; ! role_exists || { echo "STOP: login already exists"; exit 3; }
  [ ! -e $DSNF ] || { echo "STOP: $DSNF exists (never overwritten)"; exit 3; }
  umask 077; install -d -m 0700 $SEC
  PW=$(openssl rand -hex 32)
  { cat <<SQL
CREATE ROLE $LOGIN LOGIN NOINHERIT CONNECTION LIMIT 4 PASSWORD '$PW';
GRANT ts_portal_manager_read TO $LOGIN;
ALTER ROLE $LOGIN SET default_transaction_read_only = on;
ALTER ROLE $LOGIN SET statement_timeout = '5000ms';
ALTER ROLE $LOGIN SET lock_timeout = '1000ms';
ALTER ROLE $LOGIN SET idle_in_transaction_session_timeout = '10000ms';
SQL
  } | psql_adm -d postgres >/dev/null
  printf 'postgresql://%s:%s@live_data_executor:5432/%s?sslmode=verify-full&sslrootcert=%%2Frun%%2Fsecrets%%2Fts-postgres-ca.crt\n' "$LOGIN" "$PW" "$DB" > $DSNF; chmod 0600 $DSNF; unset PW
  echo "login created; DSN file written (0600, content not shown): $DSNF" ;;
grants) gate; role_exists || { echo "STOP: run login first"; exit 3; }
  { echo "BEGIN;"; sed -n '/^-- ===== Part B/,/^-- ===== Part C/p' $SQLF | grep -vE '^-- ===== Part C'; echo "COMMIT;"; } | psql_adm -d $DB >/dev/null
  echo "grants applied: $(psql_adm -d $DB -c "select count(*) from information_schema.role_table_grants where grantee='ts_portal_manager_read' and privilege_type='SELECT' and table_schema='public'") SELECT grants for the group role" ;;
hba)    gate; role_exists || { echo "STOP: run login first"; exit 3; }
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  [ "$(psql_adm -d postgres -c "select count(*) from pg_hba_file_rules where user_name::text like '%$LOGIN%'")" = 0 ] || { echo "STOP: a line for the login already exists"; exit 3; }
  docker exec $PGC sh -c "cp -p \$PGDATA/pg_hba.conf \$PGDATA/pg_hba.conf.bak-sbx-$TS && awk -v L='$HBA_LINE' '/^host     trading_system_sandbox  all  all  reject/ && !d {print L; d=1} {print}' \$PGDATA/pg_hba.conf > /tmp/pg_hba.new && [ \$(grep -c '$LOGIN' /tmp/pg_hba.new) = 1 ] && cat /tmp/pg_hba.new > \$PGDATA/pg_hba.conf && rm -f /tmp/pg_hba.new"
  if [ "$(psql_adm -d postgres -c "select count(*) from pg_hba_file_rules where error is not null")" != 0 ]; then
     docker exec $PGC sh -c "cat \$PGDATA/pg_hba.conf.bak-sbx-$TS > \$PGDATA/pg_hba.conf"; echo "STOP: pg_hba errors after edit: restored the backup (not reloaded)"; exit 4; fi
  psql_adm -d postgres -c "select pg_reload_conf()" >/dev/null; echo "hba line added, backup pg_hba.conf.bak-sbx-$TS, reloaded; rules for the login: $(psql_adm -d postgres -c "select count(*) from pg_hba_file_rules where user_name::text like '%$LOGIN%'")" ;;
indexes) gate  # the approved installer (owner-socket route like the Paper run), sandbox database, ledger 122 -> 124
  EXPECT_LEDGER=122
  f=$(mktemp); printf 'postgresql:///%s?host=/proc/1/root/var/run/postgresql&user=bobby\n' "$DB" > $f; chmod 0600 $f
  T1S() { docker run --rm --pull=never --pid container:$PGC --cap-add SYS_PTRACE -u 0 --network none --cpus 1 --memory 512m --read-only --tmpfs /tmp:size=96m -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONPATH=/work -v "$REPO":/work:ro -v $f:/dsn:ro -w /work --entrypoint python $TESTIMG -B scripts/t1_read_index_install.py "$@"; }
  T1S dry-run --dsn-file /dsn --expect-database $DB --expect-ledger-rows 122 | grep -E '"(status|state|ledger_rows)"'
  T1S apply --dsn-file /dsn --execute --confirm APPLY_T1_READ_INDEXES_2c8ee292_e786efd8 --expect-database $DB --expect-ledger-rows 122 | grep -E '"(status|ledger_rows_after)"'
  T1S verify --dsn-file /dsn --expect-database $DB --expect-ledger-rows 124 | grep -E '"(status|state|ledger_rows)"'; rm -f $f ;;
verify) # read-only: privileges of the login on the 67 relations, identity inputs, activity
  role_exists || { echo "STOP: login absent"; exit 3; }
  psql_adm -d $DB -c "select count(*) filter (where has_table_privilege('$LOGIN', c.oid, 'SELECT')) as can_select, count(*) filter (where has_table_privilege('$LOGIN', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as can_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (select relname from pg_class where relkind in ('r','v') and has_table_privilege('ts_portal_manager_read', oid, 'SELECT') and relnamespace=(select oid from pg_namespace where nspname='public'))" | sed 's/^/select|write (group-role relations, login): /'
  psql_adm -d $DB -c "select current_database(), (select oid from pg_database where datname=current_database()), (select count(*) from public.schema_migration_ledger)" | sed 's/^/identity inputs (db|oid|ledger): /'
  psql_adm -d postgres -c "select datname, count(*) from pg_stat_activity where usename='$LOGIN' group by 1" | sed 's/^/sessions of the login: /'; echo "(end verify)" ;;
rollback-db) # reverse order; ledger rows of the two index files are NEVER deleted; indexes stay unless dropped by hand (9 DROP INDEX CONCURRENTLY)
  TSB=$(docker exec $PGC sh -c 'ls -1 $PGDATA/pg_hba.conf.bak-sbx-* 2>/dev/null | tail -1'); [ -n "$TSB" ] && docker exec $PGC sh -c "cat $TSB > \$PGDATA/pg_hba.conf" && psql_adm -d postgres -c "select pg_reload_conf()" >/dev/null && echo "pg_hba restored from $TSB"
  { echo "BEGIN;"; sed -n '/^-- ===== Part B/,/^-- ===== Part C/p' $SQLF | grep -E '^GRANT SELECT' | sed -E 's/^GRANT SELECT ON TABLE (.*) TO .*;/REVOKE SELECT ON TABLE \1 FROM ts_portal_manager_read;/'; echo "REVOKE CONNECT ON DATABASE $DB FROM ts_portal_manager_read, $LOGIN;"; echo "COMMIT;"; } | psql_adm -d $DB >/dev/null && echo "grants revoked"
  role_exists && psql_adm -d postgres -c "DROP ROLE $LOGIN" && echo "login dropped"; echo "DSN file left in place (delete by hand): $DSNF" ;;
*) echo "usage: sandbox_db_step.sh status|inspect|login|grants|hba|indexes|verify|rollback-db"; exit 64 ;;
esac
