#!/usr/bin/env bash
set -euo pipefail
# Applied once to this new private volume only. Runtime is not the PG owner.
runtime_password="$(< /run/secrets/execution/runtime-password)"
psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_password="$runtime_password" <<'SQL'
REVOKE ALL ON DATABASE portal_execution FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('CREATE ROLE exec_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='exec_runtime') \gexec
-- An interrupted first init may be retried only on this new named store.
-- Never rotate an existing password or inherit elevated runtime privileges.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='exec_runtime' AND
    (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
  THEN RAISE EXCEPTION 'EXECUTION_RUNTIME_ROLE_PRIVILEGE_DRIFT'; END IF;
END $$;
GRANT CONNECT ON DATABASE portal_execution TO exec_runtime;
GRANT USAGE ON SCHEMA public TO exec_runtime;
SQL
unset runtime_password
