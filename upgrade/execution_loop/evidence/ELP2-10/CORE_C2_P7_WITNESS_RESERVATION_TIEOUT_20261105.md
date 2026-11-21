# P7 witness/reservation tie-out — 2026-11-05

**SOURCE-ONLY, uncommitted and unmounted.** This is not owner acceptance,
an installed issuer, A2 readiness, a source ACK, or a V2 restore barrier.

## Finding and change

The candidate `reserveIntent` authenticated an existing witness but returned
its intent without examining the independent reservation. The caller could
therefore reach same-original recovery using a different request digest, a
forged reservation, or a witness with no request-bound reservation. Other
checks still applied; this observation is not proof that a production action
or a second intent was accepted.

The candidate now checks the reservation MAC and exact request digest even
when a witness is present, and requires witness and reservation to identify
the same intent. A legacy witness without a reservation is refused: it needs
an independently reviewed reconciliation, not an inferred request or a new
intent. No schema, public API, UI or runtime configuration was changed.

## Evidence

- Before the fix, `bash scripts/test-elp2-c2-p7-pg.sh owner-intent` **failed**:
  the new no-reservation assertion received an intent instead of a refusal.
  Three later tests also failed after the setup test aborted; none is counted
  as an independent regression.
- After the fix, the same harness ran against two disposable PostgreSQL
  clusters: **9/9 tests PASS, exit 0**. Added checks cover no reservation,
  different request hash and a tampered MAC despite an existing witness;
  same-original restart recovery is also retested. Synthetic identities and
  source do not prove the Edge or owner boundary.
- The initial sandboxed harness attempt lacked Docker permission; the
  bounded harness was rerun with the permitted Docker access. Harness-owned
  containers were absent in the subsequent read-only name check. No runtime
  or protected data was changed.
- The first focused `tsc` command omitted `--strict` and failed with Zod
  inference errors in imported modules (exit 2); it is not a passing check.
  Retaking the same source-inclusive check with `--strict --skipLibCheck`
  passed (exit 0). Neither run is the full project compiler or normal hook.
- `git diff --check` exited 0 for tracked changes; the test and candidate are
  untracked and must be included explicitly in final candidate review.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-p7-owner-witness-custody-candidate.ts` | `8a380d5af8eb39fbee263862960d1d02cd15cf2de3ee010098264d4faada7595` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `c5bf408de26d8d9792858e07dec24bb470d395ee9b3a89fbdb4695ef6b39760e` |

## Next and remaining

Core must still qualify independent owner/signer and storage authority,
database roles and actual runtime composition; review legacy witness
reconciliation and forward migration before any installation. MAC verification
does not detect deletion or rollback of the authority store, fence old holders,
or reconcile post-snapshot terminal/ACK facts. Recovery V2, real A2/Edge
acceptance, the final integrated typecheck/hook and ELP2-10/11 remain open.
No new frontend contract or action is requested from Claude in this slice.
