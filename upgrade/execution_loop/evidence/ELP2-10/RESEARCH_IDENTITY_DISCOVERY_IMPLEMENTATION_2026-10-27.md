# Research-only identity discovery — implementation receipt

**Disposition: SOURCE_ONLY / ELP2-10 OPEN.** This slice removes the dependency
on an already registered original for *identity mapping observation*. It does
not discover or create a membership original, grant access, install a runtime,
or prove connected READ/STREAM. No production, stable, dev, main,
provider28445, command or Live mutation; no secret is included in this receipt.

## Candidate source and authority

- PM on HK: `/home/bobby/.worktrees/pm-core-financial-assembly-20261024`,
  `feat/core-financial-assembly-20261024` at
  `aed2122fba35bed165d7c9e50605412a1baaa1ba`.
  `1ff2d1edea9544c217c00b26e24149dca1d25334` adds the independent
  mapping-only listener; `fe12af4d68410bbc33c9687940c730658cfb8b26` adds
  pinned, explicit operator composition; `5f76ce4653a8c659a7cf6b281c26cc3230873fc3`
  rejects superuser/BYPASSRLS readers; `aed2122fba35bed165d7c9e50605412a1baaa1ba`
  preserves the isolated PostgreSQL test script.
- Edge on HK: `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`,
  `feat/core-current-policy-wire-20261024` at
  `b271e85939d7c051e1f4ebeca12290aa2c5ce0cb`. It is a separate candidate,
  not the dirty primary Edge worktree and not a deployed source.

PM pins exact human issuer, subject, workspace, workload and Paper; source
login/role/database/fingerprint and deadlines are checked on each lookup.
It returns a typed existing ACTIVE mapping or absence, never a grant. Edge
mounts the bounded mapping route only when explicitly configured, verifies the
mutual TLS peer and owner-approved exact scope, correlates source response, and
forwards it unchanged. Missing scope, wrong workspace/identity, invalid source
response, expiry and source failure fail closed. Existing policy/original and
READ/STREAM gates are not relaxed. No schema migration or UI change.

## Actual checks

| Check | Result and boundary |
|---|---|
| PM focused suite | 49 passed on the existing candidate image with source and QDL SDK mounted read-only; doubles and isolated tests, not source qualification. |
| Edge gateway suite | 20 passed, 1 ignored, on byte-identical source in the SGP workspace; includes loopback mutual-TLS test fixtures, not an actual Edge/PM session. |
| Edge clippy | `cargo clippy --offline --locked -p edge-service --lib -j 2 -- -D warnings` passed on the same SGP source. |
| PostgreSQL | `scripts/identity_mapping_postgres_isolated_test.py` at the PM pin passed FOUND, NOT_FOUND and wrong-fingerprint rejection against temporary PostgreSQL 16 with a separate non-superuser role. Dedicated internal Docker network and tmpfs DB; no host port or persistent business volume. Limits were 1 CPU/512 MiB for PostgreSQL and 1 CPU/700 MiB for the test; no peak measurement was taken. The test container, database container and network were cleaned up. This is a test fixture, not a Research source receipt. |

Initial test attempts exposed missing local Python dependencies/test mounts and
a mock response missing required cache headers; these were corrected before
the passing runs. Existing source data and user rights were not changed.

## Remaining commissioning, in order

1. Edge/source owner must provide or provision an **authorized Research-only
   reader** and current trust privately. The existing protected business source
   and credential directory cannot be assumed to be the membership reader;
   do not widen that role or substitute stable authority.
2. Install/configure candidates only within the approved Research cell; verify
   exact source fingerprint, peer/audience and expiry, then observe the actual
   identity through Core → Edge → PM. The current slice does not yet implement
   the bounded membership head/revision/immutable receipt/lineage discovery
   required to establish an original. Implement and validate that separate
   source read before claiming an original or using it to bind ROOT/CURRENT.
3. After verified original and current independent policy, register and verify
   ROOT/CURRENT; obtain separate STREAM authorization and run connected
   READ/STREAM, revoke and recovery. Financial qualification, budget/G2 and
   browser acceptance are independent remaining ELP2-10 gates.

Rollback before installation is to leave candidate commits unused; if installed
later, remove only candidate configuration/mounts and restore the approved
Research pins. Preserve source rows, identities, receipts, custody and audit.
Claude: no new UI field is published by this slice; do not treat fixture tests
as connected source or begin a browser acceptance against an uninstalled API.
