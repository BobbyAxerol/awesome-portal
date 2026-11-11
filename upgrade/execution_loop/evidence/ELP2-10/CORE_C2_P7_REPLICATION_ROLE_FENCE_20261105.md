# P7 restricted role: replication-role privilege — 2026-11-05

**SOURCE/TEST ONLY; NOT INSTALLED.** Base `docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144` plus shared uncommitted work. P7 issuer and restore V2 stay fail-closed; A2 is not READY and B2 remains unsigned.

## Finding and change

PostgreSQL can grant `SET` on `session_replication_role` to a non-superuser, including via an inherited role. Such a login can suppress ordinary triggers with `replica`; the candidate P7 role check did not previously test this effective parameter privilege. The source-only necessary-negative check now rejects it. The separate effective-rights observation also includes the effective privilege so that this grant/revoke changes its fingerprint.

The test creates a dedicated restricted login and inherited parent role, demonstrates that the grant permits setting and resetting the parameter, checks that the role is rejected and the rights fingerprint changes, revokes the grant and verifies the previous observation and admissibility are restored. No real authority, identity, schema or runtime was modified.

## Validation

- Disposable PostgreSQL `schema-observation`: **6/6**, including the inherited-parameter-grant case.
- Disposable two-PostgreSQL `owner-intent`: **9/9**, including restricted-login, same-original recovery and isolated HTTP session cases.
- Strict focused TypeScript compilation of `c2-p7-schema-observation.ts`: **PASS**; `git diff --check`: **PASS**. Neither is a full project typecheck or normal hook.
- Test scripts remove their own cells; after completion, no container matching `elp2-c2-p7-` remained. Peak resource measurements were not captured.

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-p7-schema-observation.ts` | `0221430fb39668345e186aebf0c265e49f55c57e9e971f5070dc2ed32f647a4a` |
| `apps/control-api/test/c2-p7-schema-observation-pg.spec.ts` | `64c5a0950c58245484bf6999207b310e47f172530fe4961f0f7ee36d26f64d22` |
| `scripts/test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining boundary

The rights-observation fingerprint now contains one additional item; previously recorded rights hashes must not be treated as equivalent without a newly qualified baseline. This is a necessary check, not a complete installation or independent authority verifier: trusted owner/signer, database roles and definers, policy drift/races, old-holder and HTTP/source fences, post-snapshot terminal/ACK tie-out, actual Edge acceptance and recovery V2 still require qualification. No production contract or frontend action changes. Rollback is to retain the existing unmounted, fail-closed runtime, not to permit a privileged role.
