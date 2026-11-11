# C2 P7 restricted login: necessary negative checks — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT SUFFICIENT FOR STARTUP.** Added a separate
read-only check for the selected P7 database/login and complete required P7
relations. It denies reachable superuser, CREATEROLE, CREATEDB, replication or
BYPASSRLS roles; a reachable owner of the database, P7 namespace, relation or
function; CREATE in the P7 namespace; DELETE/TRUNCATE/TRIGGER on P7 tables;
and table- or column-level UPDATE on append-only records, owner intents and
intent revocations. It also requires P7 schema USAGE. It examines transitive
memberships, not only the session's directly assigned role.

`bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **3/3 PASS**, exit 0,
on a disposable PostgreSQL cluster. A separate restricted test login passes
these *necessary* negatives, while the superuser fails. The test explicitly
rejects inherited table UPDATE, column UPDATE, DELETE, namespace CREATE and
inherited CREATEROLE; grant/revoke changes to the observation fingerprint are
also checked. The test harness destroyed its isolated containers/network. It
uses a fixture grant on `pg_control_system()` for target identification; that
is not a production privilege recommendation. `git diff --check` passed. No
full typecheck, hook, runtime installation or source acceptance was performed.

Uncommitted checkout SHA256: source
`0dc913680d44da7cd55a7e0573762e1e52de3933a83251812caf4a9284cf464d`, test
`fc5c471ab43529cc34ba66c0038d5cbd4a8f5f25758e16086dd0120f84781d86`, harness
`daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da`.

These negatives are necessary but not a complete least-privilege allowlist:
notably they do not qualify INSERT writers, registration UPDATE, public-schema
identity dependencies, all definer ownership/ACLs or source/owner authority.
The query is an observation in a transaction, not a durable lock against
subsequent privilege changes. A separately trusted installation registry and
concurrency/DDL fence remain required; no unsafe fingerprint may be accepted as
the baseline merely because it was observed. The check is not wired into
startup, and the existing P7 issuer/startup fence remains closed. Recovery V2,
real A2/B2, migration and integrated hook remain open. No frontend contract,
UI, grant, remote push, command or Live state changed.
