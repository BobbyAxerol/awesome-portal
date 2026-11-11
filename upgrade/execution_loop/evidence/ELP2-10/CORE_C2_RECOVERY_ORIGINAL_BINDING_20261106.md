# C2 recovery — original custody binding, 2026-11-06

**SOURCE/TEST CANDIDATE ONLY. This does not authorize restore, qualify an
independent authority, prove a source ACK or close ELP2-10/11.**

## Finding and fix

The unmounted exact-original recovery observer checked a retained source-signed
terminal against Core's lease and source trust, but selected the custody object
from its caller without checking that its binding matched the custody binding
persisted on that lease. It also did not compare the retained initial event's
assertion digest with Core's persisted assertion digest. Consequently, the
diagnostic result could conflate observations from a different custody store
or a different retained assertion. This was a code-review finding, not proof
that any connected source or runtime accepted a wrong result.

The candidate now reads both persisted digests in the same Core repeatable-read
snapshot as the terminal and drain census. When using retained custody it
refuses a different or absent selected custody binding, including a legacy
NULL, with `V2_RESTORE_RECOVERY_CUSTODY_BINDING_CHANGED`. The terminal
comparator also requires the stored human assertion digest to be present,
well-formed and equal to the one in the retained initial event; otherwise it
returns the existing mismatch disposition. It does not synthesize a digest or
make legacy data look authenticated. The no-custody phase-only observation
remains unchanged. Existing exact-original settlement and its ACK remain
separate from this observer and are not discarded by this change.

## Verification and pins

- `npm test -- test/restore-c2-original-recovery.spec.ts`: **4/4**, including
  correct retained proof and mismatched/missing assertion digest negatives.
- `bash scripts/test-elp2-independent-custody-pg.sh`: final **6/6**, two
  disposable PG clusters and test-only pinned mTLS mock. Same custody ties
  the terminal to the exact original; selecting a different custody store is
  refused. This mock is not an Edge/TS source or actual recipient ACK.
- An initial PG run overlapped a final comparator edit; although it returned
  6/6, it was not used as the final pin. The completed retake above ran after
  the source edit. Focused strict TypeScript check for this module and its
  unit test exited **0**; tracked `git diff --check` passed. This is not a
  full typecheck or normal integration hook.

| Local WIP input | SHA-256 |
| --- | --- |
| `restore-c2-original-recovery.ts` | `08089198e88a5e9826f37eccd74a93caa46df51e62a89a71d2312ce91affed53` |
| `restore-c2-original-recovery.spec.ts` | `56132ee245c44a7d78e85802a881b41ffaa70793e961398a7eb3484299593ffe` |
| `restore-independent-custody-candidate-pg.spec.ts` | `cb7c2e14efa7b4e1451f3217772de35df1ebddc3a8c72ce2722cab8a0af7b1` |
| `scripts/test-elp2-independent-custody-pg.sh` | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |

## Remaining work and handoff

The observer remains `CORE_ONLY_NO_CUTOVER`. Correct local binding is not proof
of independent key custody, monotonic head, complete source/ACK census,
old-holder/HTTP fencing or restore safety. Core must complete those barriers,
integrate and review the shared candidate, rehearse on a representative copy
and run the final hook. Edge remains responsible for relaying actual qualified
source/ACK evidence; no connected receipt is claimed. This change introduces
no frontend contract. No runtime, source database, command or Live setting was
changed; rollback is to leave this unmounted candidate unused. The isolated
runner cleans its own containers/network; resource peaks were not measured.
