# C2 P7 catalogue observation — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT AN INSTALLATION VERIFIER.** A bounded read-only,
repeatable-read observer now fingerprints P7 namespace functions, relations,
columns, ACLs, constraints, indexes, policies and triggers. It binds the
observation to the specified database, system identifier and current/session
role; missing required relations or a mismatched target fail. The public output
is a digest, object count and explicit `NOT_AUTHORITY` marker, not catalogue
contents, data or credentials.

`bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **2/2 PASS**, exit 0,
against a dedicated disposable PostgreSQL container. The test demonstrates
missing-schema and wrong-database refusal, digest stability, detection of a
disabled immutable trigger and detection of a PUBLIC table grant. Its harness
removes its own containers and network on exit; no shared database changed.
The initial sandbox attempt could not access Docker/sudo and exited 1; the
subsequent scoped escalated test was the successful run. `git diff --check`
passed. No full typecheck or hook was run for this slice.

This inventory alone does not check role membership, role ownership, effective
privileges, external dependencies/triggers, database owner, operator-trusted
installation provenance, schema stability after observation, source authority
or owner/session identity. An attacker-supplied digest is not an approved
baseline. Implement and test those checks and a reviewed installation registry
before allowing the startup schema fence to open. The observer is deliberately
not wired into startup, and neither this test nor a matching hash authorizes P7,
issuer, A2, B2 or restore.

Uncommitted checkout SHA256:

- `apps/control-api/src/execution-v2/c2-p7-schema-observation.ts`: `0b4d17e7136efc54a62f99bb393e31e1b81097828e985a8a09defdd9496475f0`.
- `apps/control-api/test/c2-p7-schema-observation-pg.spec.ts`: `04ba6972c798ac8b805aa57f556504d0891a553aaa90252b9792e17f50a92ec5`.
- `scripts/test-elp2-c2-p7-pg.sh`: `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da`.

Next Core: role/ACL and trusted-registry checks, real P7 bootstrap and issuer,
V2 recovery barrier and integrated migration/hook. Claude has no new frontend
contract to consume. No runtime, credentials, grants, Live, push or UI changed.
