# P22/P23 integration reconciliation — 2026-09-26

## Scope

This record reconciles the contributor branch
`primus-origin/feat/thanhvuong/research-p17-p21` at `25f4d031` with the
current `docs/research-loop-plan` baseline at `080baf5d`.

The contributor branch is based on an older merge-base (`a5455848`) and must
not be merged wholesale. The current baseline contains later X1/X2 work and
the Codex P22 backend authority.

## Kept from the current baseline

- Current Codex control-api, migrations, OpenAPI and generated contracts.
- Current X1/X2 frontend composition and publication hook
  (`useReleaseCandidatePublication`); the older Thanhvuong mirror hook is not
  reintroduced.
- Current P22/P23 README, phase report, rollback, handoff and packet files when
  they are newer or byte-identical to the contributor copy.
- Current P23 qualification runner/stubs where X2 contains the newer contract
  adaptation.

## Imported from the contributor branch

The five missing P21 contributor evidence files were added without changing
runtime code:

- `evidence/P21/thanhvuong-backend-requests.md`
- `evidence/P21/thanhvuong-debt-register.json`
- `evidence/P21/thanhvuong-frontend-receipt.md`
- `evidence/P21/thanhvuong-rollback.md`
- `evidence/P21/thanhvuong-test-results.json`

P22 and P23 contributor packets were already present in the current baseline.
P23 packet files are byte-identical to the contributor branch. P22 packet files
contain the later migration-063 and dark-flag fixes, so the current copies are
authoritative and were not overwritten by the older contributor versions.

## Backend conflict rule

The contributor P22 backend/contract commits (`51a944eb`, `93501c00`,
`fe9504e9`) are an alternate implementation against the older baseline. They
are not cherry-picked over the current Codex implementation. Any future
missing fact must be ported as a reviewed additive change, preserving the
current migrations, generated contracts and route semantics.

## Frontend conflict rule

The contributor P22 UI commit (`d55beca7`) and P23 runner (`35d0c861`) are
older than the current X2-adjusted files. They were compared, not blindly
overwritten. The current tree keeps the newer publication/current-source
composition and qualification stubs.

## Verification status

- No database, runtime, deployment or Trading System files were changed by
  this reconciliation.
- No `dev`/`main` merge and no remote push was performed.
- The five imported files are documentation/evidence only and still require
  the normal documentation/JSON validation gate before commit.
