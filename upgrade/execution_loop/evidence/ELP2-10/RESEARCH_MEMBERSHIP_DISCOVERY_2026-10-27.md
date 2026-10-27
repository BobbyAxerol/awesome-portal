# Research membership discovery — source and verification

**Status: SOURCE_ONLY, not connected. ELP2-10 OPEN.** This is an actual code
slice on the HK candidates, not a handoff-only proposal. It does not establish
that a Research membership exists, register a Core accepted original, or grant
READ/STREAM. No source data, source credentials, runtime, stable/dev/main,
provider28445, command or Live was changed.

## Inputs and commits

- Prior mapping source and boundaries: [identity discovery receipt](RESEARCH_IDENTITY_DISCOVERY_IMPLEMENTATION_2026-10-27.md).
- PM candidate `/home/bobby/.worktrees/pm-core-financial-assembly-20261024`,
  `feat/core-financial-assembly-20261024` at `0853ffe4157cdbcabff64e8e5a440967fe760f81`.
- Edge candidate `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`,
  `feat/core-current-policy-wire-20261024` at `68344dad9042860f561c11873096314b9a9b2f73`.
  The primary Edge worktree has unrelated dirty changes and was not altered.
- Core `docs/research-loop-plan` source commit
  `0f5fe5f56` contains the private client, runtime, operator and tests;
  integration/full-hook acceptance remains pending.
- The source-owner return on HK `EDGE_RESEARCH_READER_OWNER_RETURN_2026-10-27.md`
  says Research membership-reader references were not ready and older Research
  trust certificates expired on 23 October. It does not establish that source
  membership rows are absent. No protected credentials were read.

## Implementation

- PM `research_membership_discovery.py`: exact identity/workspace/workload and
  Paper binding; pinned DB login, role and cluster fingerprint; reject elevated
  roles; one owned read-only repeatable-read transaction, query/lock/overall
  deadlines and row/output limits. Read ACTIVE mapping, policy, at most eight
  current Paper membership heads, their current revision and bounded current
  parent closure. Require a unique matching `SET_MEMBERSHIP` receipt, load its
  declared historical evaluated-membership revisions, and reuse native `_leg`
  to check original state digests and current lineage. Missing receipt and
  invalid lineage are distinct typed states; ambiguity/overflow fail closed.
  The historical revision existence check is not a historical authorization
  certification, and the result `OBSERVED_NOT_AUTHORIZED` is not a held fence
  or a Core-accepted fact.
- PM `portal_human_recovery.py` and `identity_mapping_runtime.py`: independent
  private membership-discovery operation; explicitly configured, default off,
  exact configured subject and existing TLS peer checks; no listener on import.
- Edge gateway: separate owner-pinned `membership_discovery_scopes`, independent
  of identity-only mapping and registered originals. It enforces finite window,
  TLS, scope, input/output bounds, response correlation and closed evidence
  shapes. It does not install a grant or infer streaming authority.
- Core: `research-membership-discovery-client.ts` is an explicit private
  bounded mTLS client; it checks the pinned Paper identity, source certificate,
  expiry, nested duplicate-key wire, source correlation and receipt/lineage
  schema. `research-membership-discovery-runtime.ts` hydrates one pinned
  private manifest, verifies the independent expected binding and client
  certificate/key. `research-membership-discovery-operator.ts` and its CLI
  make one call and write a new exclusive 0600 observation artifact into an
  owner-only directory. They never create a Core accepted original or grant.
- No database migration, frontend or public browser API was changed.

## Verification and cleanup

| Check | Actual result |
|---|---|
| PM focused regression | 53 tests passed using existing PM image, QDL SDK and read-only candidate mounts; parser/socket doubles are not connected-source proof. |
| PostgreSQL | `scripts/research_membership_discovery_isolated_test.py` passed against isolated PostgreSQL 16 for positive receipt/current lineage, wrong identity/scope/fingerprint, elevated role, ambiguous/tampered/missing receipt, inactive mapping and head cap. Fixture DDL/data exist only in temporary isolated DB. |
| Edge tests | 22 passed, 1 genuine Core-codec test ignored; includes pinned loopback mTLS, separate discovery scope, source response correlation, missing mapping and native evidence-shaped response. Run on SGP byte-identical source; four HK candidate file hashes were compared. |
| Edge lint | `cargo clippy --offline --locked -p edge-service --lib -j 2 -- -D warnings` passed. An initial clippy run failed style checks and was fixed before this result. |
| Core focused | `elp210-existing-identity-mapping-client.spec.ts`: 98 tests passed including new private Core discovery mTLS/wire/runtime/operator/CLI checks; fixture only. The first discovery run failed 2 cases because the flat-only decoder rejected nested JSON; replaced by the existing strict nested native decoder, then retested. This is not a connected source receipt. |
| Core TypeScript | `tsc -p tsconfig.build.json --noEmit` passed using the project configuration. A previous manual reduced-flag invocation was invalid and is not a PASS. The focused test was rerun successfully with loopback access after sandbox-only `EPERM` on bind. |
| Resources | Isolated DB used internal Docker network, tmpfs, no exposed host port; PostgreSQL 1 CPU/512 MiB and test process 1 CPU/700 MiB; no peak usage measured. Test containers and network were cleaned up. |

## Remaining actual work

1. Commission the implemented Core client/runtime/operator and review the
   PM/Edge composition as an integrated source; component tests do not prove
   the actual Core→Edge→PM route.
2. Through Edge/source ownership, obtain or provision a properly authorized
   Research-only membership reader and current trust on the approved Research
   target. The currently identified source is a protected live database: do
   not read protected credentials or change its roles under the preview-only
   authorization. Create no synthetic real-source membership or receipt.
3. Observe actual scoped identity and original, then independently verify Core
   accepted fact, policy, source census and correspondence; only then register
   ROOT/CURRENT. Obtain STREAM separately and run real connected READ/STREAM,
   revoke/recovery and browser acceptance. If the original is absent or
   revoked, use the owning official authority/writer and report that result.

Rollback is to leave the source candidates uninstalled, or remove only future
Research candidate configuration/mounts and restore approved Research pins;
preserve identities, source rows, immutable receipts, custody and audit. Claude:
no consumer/UI change is requested for this private operation.
