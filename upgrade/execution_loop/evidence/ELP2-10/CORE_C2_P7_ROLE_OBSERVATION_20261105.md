# C2 P7 role and effective-privilege observation — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT AUTHORITY OR STARTUP ADMISSION.** Extends the
[earlier catalogue observer](CORE_C2_P7_SCHEMA_OBSERVATION_20261105.md) with a
separate digest of the current login's transitive role memberships and role
flags, database ownership/ACL, and effective P7 schema, table and function
privileges. No role names, credentials or object rows are returned; the output
is a bounded count and digest. The recursive traversal uses UNION to terminate
on cycles. Neither digest is accepted as an operator-approved baseline.

`bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **2/2 PASS**, exit 0,
on a dedicated disposable PostgreSQL container. The prior schema/trigger/ACL
negatives were retaken. The test also grants and revokes an additional parent
role and checks that the role digest changes and restores even though the P7
catalogue digest is unchanged. This fixture connects as the test database's
superuser: it does **not** qualify a restricted production app role. The
harness removes its own containers/network; no shared database was touched.
`git diff --check` passed; no full typecheck or hook ran in this slice.

Remaining: validate the full approved effective-privilege policy with a real
restricted login, all external object/role owners and dependencies, safe
catalogue locking against concurrent DDL/privilege changes, and a separately
trusted installation registry. The observer is not called at startup; the
startup fence remains closed. A matching fingerprint does not prove source or
owner authority, prevent stale changes, permit issuer or make restore safe.

Uncommitted checkout SHA256:

- `apps/control-api/src/execution-v2/c2-p7-schema-observation.ts`: `968aa8da113792cf0f08f3d14e8d208a4e9baec21412cdc4faa86d509f0ffab7`.
- `apps/control-api/test/c2-p7-schema-observation-pg.spec.ts`: `f6353654091f8f59b13a9e1340c3ec3587af1af24f7ac6e0daa0245256bb5c56`.
- `scripts/test-elp2-c2-p7-pg.sh`: `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da`.

Next Core: restricted-login policy and trusted registry, then real P7 bootstrap,
issuer and recovery V2; integrated migration/hook remain open. No frontend
contract changed; Claude may continue independently. No runtime install, push,
grant or Live activation occurred.
