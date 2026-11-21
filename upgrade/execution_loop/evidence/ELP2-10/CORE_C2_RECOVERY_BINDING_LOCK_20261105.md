# C2 recovery legacy binding under lock — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED; NOT A RESTORE CUTOVER.** Base
`2faa8968fddbde59b2e59525e334ba3d83886144`, branch
`docs/research-loop-plan` plus shared WIP; no runtime or live data changed.

The C2 custody routing check must not depend solely on an earlier unlocked
lookup. The legacy-only restore resolver now verifies under the actual lease
row's `FOR UPDATE` lock that its C2 assertion digest is explicitly null.
If the row has a C2 digest or its binding is absent, it refuses and cannot
fall through to legacy settlement. Normal C2 custody resolution remains on
its separate authenticated proof/journal path. This narrows the classification
race but is not an installed schema/ACL guarantee, physical fence or ACK.

## Verification

- Focused `restore-core-quiescence.spec.ts`: **6/6**, including a test-only
  changing legacy-to-C2 observation at row lock; not a real source receipt.
- `scripts/test-elp2-independent-custody-pg.sh`: **4/4**, two disposable
  PostgreSQL clusters with test mTLS; same-original C2 recovery remains
  functional. Its cell is cleaned by the runner.
- Focused strict TypeScript check of `restore-core-quiescence.ts` and imports:
  exit 0. Final integration hook has not run.

| Input | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `ff7e31e29d6e8ff51c6dac054a6554c9797334ebc5a49ab06cc50c0cfed65231` |
| `restore-core-quiescence.ts` | `e0ed255a2bba72f328136ad79da8577d2c1931f9fa1ca30105a6d52bb92a26aa` |
| `restore-core-quiescence.spec.ts` | `f4bbd6c5a333fcca0457224d1388c2af42b737dd3b29802ef87f5439f3818e14` |

These supersede matching hashes in `CORE_C2_RECOVERY_CUSTODY_PATH_20261105.md`.
Qualified independent authority, old-holder/HTTP fencing, terminal/ACK census,
P7 acceptance and connected A2 remain open; no B2 was signed.
