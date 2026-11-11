# Recovery tie-out for source rollback before ENTER — 2026-11-05

**SOURCE-ONLY, uncommitted and unmounted.** The result is an observation,
not Edge ACK, fencing, restore authorization, or a connected qualification.

## Gap and implementation

TS can record an attempt before Core accepts ENTER and later resolve that
exact attempt as `ROLLED_BACK`. Core retains such a lease as `RETIRED` and
stores the verified terminal digest and attempt in a
`SOURCE_ROLLED_BACK_UNENTERED` event. The recovery census compared the signed
terminal only to terminal columns on the lease, so it incorrectly reported a
mismatch for this legitimate case.

The census now reads the relevant Core events in the **same repeatable-read
source snapshot** as the lease and accepts the unentered tie-out only for one
exact event with matching attempt and terminal digest, a `RETIRED` lease with
empty terminal columns, matching signed source trust and original binding, and
no contradictory ENTER event. Missing, duplicate or conflicting facts remain
non-tied. The event read is bounded by the selected number of originals and
fails closed if it exceeds that bound. If the Core event exists but the
independent signed terminal is absent, the census reports missing custody.
The output remains `TERMINAL_TIED_ACK_UNVERIFIED`, never an ACK or cutover.

## Tests

- First two-cluster run stopped at an existing capacity-race assertion before
  the new case; it is not a passing run. The next run reproduced the actual
  bug: the valid unentered rollback was classified
  `CORE_TERMINAL_MISSING_OR_DIFFERENT` instead of tied.
- After the implementation, `bash scripts/test-elp2-independent-custody-pg.sh`
  passed **5/5**; after adding the negative cases it passed **5/5** again.
  The added scenario uses synthetic signing keys/source on disposable DBs and
  checks a valid unentered rollback and missing event, wrong attempt, wrong
  digest, duplicate event and conflicting ENTER. The negative row mutations
  are test-only read proxies, not changes to a database.
- Harness-owned `elp2-custody-*` containers were absent on read-only check
  after completion. The initial query used an incorrect name filter; it was
  corrected before recording this result. No protected runtime was changed.
- The strict compiler check including the entire PG test was deliberately
  interrupted (exit 130), so is **not PASS**. The strict source-only compiler
  check of the changed custody module and its imports completed with exit 0;
  neither check is the full project typecheck or normal hook.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-independent-custody-candidate.ts` | `2a16cd9c77e5920505bacf475ca6ec48dda6fa66280c5855917fcc75b9a6a5c2` |
| `apps/control-api/test/restore-independent-custody-candidate-pg.spec.ts` | `416c68f0bffac8a3815d2bb05e6afbb30cb3216e7276df2b4439a7f2aeca4e41` |

## Next / scope

Core still needs independent operational custody and old-holder fencing,
complete source/recipient ACK reconciliation, and a representative V2 restore
on the final integrated candidate. A2, real Edge proof, G2 and final hook remain
open. Claude has no new frontend contract/action from this internal change.
