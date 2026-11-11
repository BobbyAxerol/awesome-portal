# P7 registry-only revoke split fence — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT INSTALLED OR COMMISSIONED.** The candidate
registration writer still exposed a normal `REVOKE` branch that directly
changed registry state, without invoking the authority-first procedure that
also fences new work. That branch could report a registry change while the
local `BLOCK_NEW` scope was not changed in the same transaction. The older
`emergencyRevoke` shortcut was already disabled, but did not cover this branch.

Both public `change` and internal `changeInTransaction` now fail closed for
`REVOKE` with `C2_P7_USE_EMERGENCY_REDUCTION`, before any DB access through
that branch. The independently composed emergency reduction remains the
candidate path for authenticated owner-initiated reduction; it records intent
revocation and calls the authority-first registry/scope procedure in one
transaction. This change does not automatically route a request, propagate a
source grant revocation or prove a real terminal/ACK. Registration behavior is
unchanged; this is a deliberate refusal of an unsafe source-only legacy path.

## Focused evidence

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-emergency`: **2/2 PASS**,
  exit 0, disposable PG and restricted login; tests real competing locks,
  rollback on mismatch and atomic revoke/`BLOCK_NEW` in the synthetic cell.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **8/8 PASS**, exit 0,
  two disposable PGs, with current writer source. Includes atomic intent and
  registration preparation and a revoke-race on synthetic identities.
- Four focused writer/emergency/review/intent suites: **32/32 PASS**, exit 0;
  direct and in-transaction REVOKE refusal are checked before DB use.
- Acceptance PG **6/6 PASS** was run before the final additional fail-fast at
  the outer `change` entry; it already included the inner REVOKE refusal, but
  is not a final-source acceptance receipt. No final integration hook or full
  typecheck ran. Isolated test harnesses remove their own cells.

## Current uncommitted source pins (SHA-256)

| Input | SHA-256 |
| --- | --- |
| `c2-p7-registration-writer-candidate.ts` | `2d33a7f7fca4b373adbe584a4c9bf6e0eb6902f239f4c9d92b3453f6c85be41d` |
| `c2-p7-registration-writer-candidate.spec.ts` | `774d8daa64f946e3619697aafcdb85c6ffc9d8631dc6add9994c0297b2845c64` |
| `c2-p7-acceptance-pg.spec.ts` | `e7c80d471a8f2daa46305c7a1d8c11940ebc549858d075852d40777a62125680` |
| `c2-p7-emergency-reduction-candidate.ts` | `9e0e3a6f0a607416f950438ae96674425e2a0197a3a94d846040e2db73a40d53` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `edf8f0ec12d114b6da550235ed50e67a4073f9c4042f522f96327c20605c47a1` |

## Remaining

Direct registry INSERT/UPDATE privileges and source authenticity are not
qualified by this change. The authenticated/CSRF reduction route, strict
role/schema policy, concurrent permission drift, HTTP custody and complete
restricted-service acceptance still need proof. The issuer and P7 startup
remain fenced. Independent V2 restore barrier, actual Edge source and ACK,
representative migration/rollback and final integration gate remain open. No
frontend contract, runtime, product DB, stable/dev/main or Live state changed.
