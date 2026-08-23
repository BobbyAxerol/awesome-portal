#!/usr/bin/env bash
# First-boot-only PostgreSQL role/schema bootstrap. Secret values are read from
# Docker secret files and sent over stdin to psql; they never enter argv, logs
# or the image. The official postgres entrypoint runs this against its local
# temporary server before the D2 service becomes reachable.
set -euo pipefail

secret_dir=/run/secrets
read_secret() {
  local file="${secret_dir}/$1" value
  [[ -f "${file}" && ! -L "${file}" ]] || {
    printf 'Projection bootstrap secret is missing or unsafe.\n' >&2
    exit 1
  }
  IFS= read -r value < "${file}"
  [[ "${#value}" -ge 16 && "${#value}" -le 256 &&
     "${value}" =~ ^[A-Za-z0-9._~-]+$ ]] || {
    printf 'Projection bootstrap secret has an unsafe format.\n' >&2
    exit 1
  }
  printf '%s' "${value}"
}

database_name="${PROJECTION_DB_NAME:?set PROJECTION_DB_NAME}"
owner_user="${PROJECTION_DB_OWNER_USER:?set PROJECTION_DB_OWNER_USER}"
runtime_user="${PROJECTION_DB_RUNTIME_USER:?set PROJECTION_DB_RUNTIME_USER}"
[[ "${database_name}" =~ ^[a-z][a-z0-9_]{2,62}$ &&
   "${owner_user}" =~ ^[a-z][a-z0-9_]{2,62}$ &&
   "${runtime_user}" =~ ^[a-z][a-z0-9_]{2,62}$ &&
   "${owner_user}" != "${runtime_user}" ]] || {
  printf 'Projection bootstrap identifiers are invalid.\n' >&2
  exit 1
}

owner_password="$(read_secret projection-owner-password)"
runtime_password="$(read_secret projection-runtime-password)"
[[ "${owner_password}" != "${runtime_password}" ]] || {
  printf 'Projection roles must not reuse a password.\n' >&2
  exit 1
}

{
  printf '\\set owner_user %s\n' "${owner_user}"
  printf '\\set owner_password %s\n' "${owner_password}"
  printf '\\set runtime_user %s\n' "${runtime_user}"
  printf '\\set runtime_password %s\n' "${runtime_password}"
  cat <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'owner_user', :'owner_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_user') \gexec
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'runtime_user', :'runtime_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_user') \gexec
SQL
} | psql --set=ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres

if ! psql --username "${POSTGRES_USER}" --dbname postgres --tuples-only \
    --command "SELECT 1 FROM pg_database WHERE datname = '${database_name}'" |
    grep -q 1; then
  createdb --username "${POSTGRES_USER}" --owner "${owner_user}" "${database_name}"
fi

{
  printf '\\set owner_user %s\n' "${owner_user}"
  printf '\\set runtime_user %s\n' "${runtime_user}"
  cat <<'SQL'
CREATE SCHEMA IF NOT EXISTS portal_projection AUTHORIZATION :"owner_user";
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA portal_projection TO %I', :'runtime_user') \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA portal_projection GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'owner_user', :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA portal_projection GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  :'owner_user', :'runtime_user'
) \gexec
SQL
} | psql --set=ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${database_name}"

# The bootstrap server uses a local socket. Every network connection in the
# final service must be TLS plus SCRAM; no trust/md5 host rule survives.
sed -i -E 's/^host([[:space:]])/hostssl\1/' "${PGDATA}/pg_hba.conf"
grep -Eq '^hostssl[[:space:]]+all[[:space:]]+all[[:space:]]+all[[:space:]]+scram-sha-256' \
  "${PGDATA}/pg_hba.conf" || {
    printf 'Projection PostgreSQL hostssl/SCRAM policy was not established.\n' >&2
    exit 1
  }

unset owner_password runtime_password
