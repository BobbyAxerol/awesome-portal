# E12 closeout — Journey descriptor revision 3

Status: `BACKEND_CONTRACT_COMPLETE` · Codex · 2026-09-27. Code, migration,
fixture and this receipt are one commit on `docs/research-loop-plan`.

## Delivered truth

The five Research product routes already mounted and accepted by their owner
phases are no longer advertised as future work:

- `execute-replay` → Screen 08;
- `attempt-lineage` → Screen 10;
- `compare` → Screen 13;
- `release-candidate` → Screen 11;
- `run-report` → Screen 09.

Descriptor revision 3 changes only those five cards from `PLANNED` to
`AVAILABLE`. It does not make Paper Trading, an Execution handoff, a mutation,
or any source capability available. The server remains the route/availability
authority; the browser consumes the generated DTO and does not promote cards
locally.

Migration `1723680000074_research-journey-descriptor-v3.sql` appends revision 3
with content SHA-256
`7f42203c4f6b4f326e28e020398a530c2fe6268c05352eb9aab5b918e5cd548d`.
Revisions 1 and 2 remain immutable and readable. Rollback selects an older
application descriptor; it never deletes or updates the registry evidence.

The compiled source is `journey.descriptor.v3.ts`; v1 remains historical. The
canonical fixture is `research-foundation.journey-v3.valid.json`; the contract
snapshot tracks v3 rather than retaining a misleading current-v2 fixture.

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Generated contract + canonical fixture | `npm --prefix packages/contracts test -- --run test/research-foundation.spec.ts` | PASS · 1 file · 8 tests |
| Registry migration, immutable history, service response | `bash scripts/research-loop-v11/test-p09-postgres.sh` | PASS · 1 file · 7 tests · disposable PostgreSQL removed |
| Generated parity | `packages/contracts/tooling/verify-generated.sh` | PASS · 16 files · 191 tests plus catalogue/generated checks |
| Contract snapshot | `python3 packages/contracts/tooling/snapshot.py --check` | PASS · 216 tracked files |
| Control API type gate | `apps/control-api/node_modules/.bin/tsc -p apps/control-api/tsconfig.build.json --noEmit` | PASS |
| Frontend generated-fixture import | `apps/portal/frontend/node_modules/.bin/tsc -b apps/portal/frontend/tsconfig.json --pretty false` | PASS |

The first isolated PostgreSQL run exposed a stale P09 assertion that still
classified `rolling` as `NOT_ADMITTED`. Atlas v2 already publishes rolling as
`ADMITTED` only with manifest-owned `walk_forward.train_window`; the fixture,
Python authority and preflight tests all agree. The assertion was corrected to
verify both the admission and the train-window rule, then the full P09 database
gate passed. No gate was skipped or loosened.

## Safety and handoff

- No runtime, preview, production service, auth state, source data or business
  record was changed.
- No old registry row is mutated or removed.
- The five links keep the existing product routes and frontend composition.
- No image rebuild is needed for this contract-only closeout; a later preview
  candidate will exercise S00 together with the remaining E-series work.

E12 is closed. The next backend data-truth slice is E11: map the retained WFO
authority into Run Library and Evidence Hub without `AVAILABLE + null`.
