# C2 P7 restricted-role observation retake — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT AN INSTALLATION OR AUTHORIZATION.** Follow-up to
[role observation](CORE_C2_P7_ROLE_OBSERVATION_20261105.md). The new test uses
a distinct synthetic LOGIN and inherited NOLOGIN reader role on a disposable
PostgreSQL cluster. It grants the test login `pg_control_system()` EXECUTE for
the system-id check; this is a fixture privilege, not a recommendation to
grant the production app that privilege. The test then grants and revokes
`UPDATE` to the inherited role and verifies the effective-rights fingerprint
changes and restores.

`bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **3/3 PASS**, exit 0,
including missing-schema, wrong-database, trigger/ACL and role-membership
negatives. The harness destroyed its own isolated containers and network after
the run; no shared database changed. `git diff --check` passed. No full
typecheck, hook, runtime activation or source acceptance occurred.

Uncommitted source SHA256: observer
`968aa8da113792cf0f08f3d14e8d208a4e9baec21412cdc4faa86d509f0ffab7`, test
`58abfc942e2b860286766f67f64ccaada87502bc80dd12598ef9d82976e57ac8`, harness
`daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da`.

The test observes a controlled fixture rather than enforcing an approved
privilege policy. Operator-trusted registry, external dependencies and role
owners, concurrent drift/fencing, production system-id access, real P7 source
and owner remain open. The startup fence and issuer remain closed. Core still
owes recovery V2, P8/A2/B2, integrated migration and final hook. Claude has no
new frontend contract to consume.
