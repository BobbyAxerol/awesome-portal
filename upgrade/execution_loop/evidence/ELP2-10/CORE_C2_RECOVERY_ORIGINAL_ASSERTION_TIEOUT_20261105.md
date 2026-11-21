# Recovery original assertion tie-out — 2026-11-05

**SOURCE-ONLY, uncommitted and unmounted.** This strengthens an observation;
it does not commission custody, authenticate independent storage, prove an
Edge ACK or permit a restore/cutover.

## Gap and change

The candidate validated the exact original human assertion and its signing
key when appending to independent custody, but its later census compared only
the original's identity/session/scope/time expiry. A restored lease whose
signing-key digest, assertion digest or issuance time changed could therefore
be reported as otherwise tied despite different original provenance.

New original events retain **only the canonical assertion digest**, not the
bearer. The digest is included in the existing event hash chain. Census also
recomputes the pinned public signing-key digest and compares it, the assertion
digest and issuance time against the selected Core snapshot. A mismatch is
`CORE_BINDING_MISMATCH`.

Older candidate events lacking the added assertion commitment remain readable:
an exact original may replay through the existing source checks, but census
returns `CORE_ASSERTION_NOT_RECORDED` and does not report a tied original.
There is no automatic backfill or rewriting of historical events. The changed
event shape and this new internal state need compatibility review before any
installation or consumer integration. Event hashes alone cannot stop an
authority administrator from rewriting or rolling back the whole chain.

## Tests and pins

- Before the fix, the new altered-original negative reproduced the missing
  check: census returned `SOURCE_TERMINAL_NOT_RETAINED` rather than a binding
  mismatch. After implementation the first retake exposed a test fixture
  error: its synthetic legacy custody ID did not match the original lease.
  This was corrected with a test-only read proxy, not by rewriting a lease.
- Final `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS** on
  two disposable PostgreSQL clusters, including different key digest,
  assertion digest and issuance time, exact legacy replay and typed missing
  commitment. Also retests the previous unentered-rollback scenario. Synthetic
  source/keys and the legacy read proxy are not connected evidence.
- Strict focused source TypeScript check: exit 0. `git diff --check`: exit 0
  for tracked changes. Neither is a full project compile or normal hook.
  Harness-owned `elp2-custody-*` containers were absent after the run.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-independent-custody-candidate.ts` | `f74239d045aa70586463ff966e63a36ca75468f1041101a21f826dbe7e35128d` |
| `apps/control-api/test/restore-independent-custody-candidate-pg.spec.ts` | `10d4d502a9975d2c3dab7d57bbe5a26eae0953c1685029ecba3b9bee9a5f424f` |

These pins supersede the same two working-file pins in the earlier unentered
rollback receipt; its retested scenario remains distinct from full restore.

## Remaining / handoff

Core must qualify separately controlled storage, old-holder and in-flight
fencing, reconciliation of actual source terminal and recipient ACK, and
rehearse V2 restore on the integrated candidate. P7/A2, Edge-connected gates,
full typecheck and normal hook remain open. No frontend action is requested.
