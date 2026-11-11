# STATUS preparation-to-chain binding — 2026-11-06

**UNCOMMITTED SOURCE / TEST ONLY.** This is not a genuine Edge ACK, a
complete post-snapshot census, independent recovery authority, a restore
permit, an installed image, or a phase closeout. Checkout
`docs/research-loop-plan` at `2faa8968fddbde59b2e59525e334ba3d83886144`;
the shared worktree was already dirty and was not frozen.

## Finding and change

The prior census checks that the restored lease chain is internally consistent.
That alone does not establish that the chain's immutable metadata matches the
reserved STATUS preparation. A disposable-PG regression constructed a coherent
two-link chain with individually matching synthetic ACKs, but metadata different
from the preparation: before the additional check the relevant suite was 7/8,
because the inconsistent preparation was consumed. This is a corruption/restore
counterexample, not a demonstrated production exploit.

For restored consumption, `PgCommandStatusPreparations.consume` now checks the
chain against the preparation under the same authority singleton lock used by
ISSUE. It rejects differences in nonce, original/call/binding, authority and
STATUS token/request digests, issue time, receiver, PM request digest and expiry.
It retains the earlier census and missing-lease/ACK fences. This is a local
consistency check, not authentication of the common value or proof that all
pre-snapshot and post-snapshot records exist.

The regression exercises eight coherent-but-wrong metadata variants; they are
assertions within one test, not eight separate test cases. The intact case
remains positive. No new public API, UI, migration or runtime configuration.

## Validation and resource scope

- `bash scripts/test-elp2-restore-checkpoint-pg.sh census`: **8/8 PASS** on
  isolated disposable PostgreSQL. Its synthetic test tables exercise the
  failure and matching-chain cases; they are not production authority.
- Added `status-recovery` selector to the existing bounded disposable-cell
  runner. `bash scripts/test-elp2-restore-inventory-rls.sh status-recovery`:
  **2 PASS, 6 skipped**. Real Core migrations, AuthService, store, PostgreSQL
  and pinned loopback mTLS exercise two competing preparations, retained ACK,
  consume and a new OS process; source identity/proofs and ACK are TEST_ONLY.
  The cell uses the suite's exact disposable database guard; no shared DB.
- Focused strict TypeScript check of the census test/imports: exit 0;
  `bash -n` on the runner and tracked `git diff --check`: exit 0.
- Each Docker cell was bounded to at most 2 CPU / 1.5 GiB and used its own
  internal network and tmpfs; actual peaks were not measured. Runner exit traps
  removed their resources. An unrelated `control-api-test-postgres-*` container
  remained in the later read-only census and was left untouched.
- The normal hook was **not run**: this is not a frozen final candidate. The
  final candidate requires impact review and one normal hook before landing.

| WIP input | SHA-256 |
| --- | --- |
| `command-status-preparations.ts` | `c91235973f374c58c3c4776434b68c69f8f84af06f2b28294543112762411935` |
| `command-status-ack-census.ts` | `9b02b785cee29fd5a406517441ee4bde8ef5b47eebdb50daeee9a9701befbaff` |
| `command-status-ack-census-pg.spec.ts` | `4bb22b9a3265c2ba8de0dbeaffd20d9119cd3c79eb258492623a70a6543d7bbb` |
| `command-source-assertion-pg.spec.ts` | `d0b03ae718a9aa319fbbaadfe57bfb55ec450774afd9711f430bf6ced5108586` |
| `test-elp2-restore-inventory-rls.sh` | `2cca4873509da3c6bc5523f6b4d873602937f8a9cf28ff5ec7e832c1c49f7b16` |
| `test-elp2-restore-checkpoint-pg.sh` | `45028c599dcd421f23ac9ff0d016feafbb536520e98d21fa5d26627b98c44a18` |

## Remaining and handoff

Core must still prove independent monotonic checkpoint/custody authority,
old-holder fencing and complete source terminal/ACK reconciliation after the
snapshot, then rehearse V2 restore. Genuine STATUS through Edge with the same
original remains unqualified. P7/A2 authority, financial/READ/STREAM,
qualification and final migration gates remain open. Keep V2 restore refused
and issuer fail-closed until the respective gates are actually satisfied.
Claude has no new field, contract or frontend action from this change. Rollback:
leave the WIP uninstalled and retain the existing restoration refusal; do not
invent, discard or rewrite source receipts or ACKs.
