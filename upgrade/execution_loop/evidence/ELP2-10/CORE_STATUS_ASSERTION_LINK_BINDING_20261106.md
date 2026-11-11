# STATUS assertion-to-lease binding — 2026-11-06

**SOURCE/TEST ONLY; not installed, no real Edge ACK and no restore or phase
qualification.** Checkout `docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; all code/test changes are in
the shared, unfrozen WIP.

## Finding and change

The locked live/restored STATUS ACK census compared link and lease identity,
request, chain and matching synthetic terminal/ACK, but did not compare a C2
lease's stored `human_assertion_digest` with the link's `assertion_digest`.
A deliberately inconsistent isolated row was counted as resolved and could
proceed to local consume. This is a **synthetic corruption/restore consistency
counterexample**, not a claim of an observed production incident. The census
now marks the row unresolved if the lease's non-null digest differs, or if a
lease still carries a C2 P7/custody marker but has a null assertion digest;
consume is consequently refused under the existing authority lock. An equal
digest continues to consume successfully. Historical generic leases have a
null lease-side digest and no C2 marker and retain their existing behavior.
This compatibility rule does **not** prove retention of an entire link or
detect a corrupted lease that has lost all C2 markers as well as its digest.
The candidate query requires the selected C2-upgraded columns; qualification
against a legacy installed schema must precede mounting it.

There is a separate, still-open functional gap: `issueCommandStatus` calls
the generic issuer, and C2-pinned configuration intentionally refuses that
path without P7 and custody. Positive STATUS C2 issuance, same-original
resume and safe delivery/ACK composition have **not** been implemented by this
change. The P7 suite now asserts the generic path remains denied. Do not bypass
the guard or treat a synthetic ACK as source authority.

## Tests and caveats

- Before the source fix `scripts/test-elp2-restore-checkpoint-pg.sh census`:
  **9 PASS / 1 FAIL**, exit 1; the new mismatched-digest census assertion
  failed before its consume assertion executed.
- A subsequent negative test for a C2-marked lease missing its digest produced
  **10 PASS / 1 FAIL** before the second fix; the first refusal assertion
  failed and its consume assertion did not execute. Final retake of the same
  bounded disposable PostgreSQL test: **11/11 PASS**, including both P7 and
  custody markers, mismatch refusal and equal-digest local consume.
- `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, including the
  new C2 generic-STATUS denial in the existing owner-intent test.
- `scripts/test-elp2-restore-inventory-rls.sh status-recovery`: first retake
  **2 PASS / 1 FAIL / 5 skipped**, exit 1. The post-ACK child preparation
  returned a different context after the test itself took 31.3 seconds; the
  context has a maximum 30-second lifetime. Expiry is plausible but was not
  timestamped in that failing run and is **not proven** as its cause. A test
  assertion now explicitly checks the old context has not expired before
  comparing exact values; the next retake finished that case in 20.4 seconds
  and was **3 PASS / 5 skipped**, exit 0. After the second census change, the
  selected test was retaken again: **3 PASS / 5 skipped**, exit 0. These use TEST_ONLY source proofs
  and loopback mTLS, not connected Edge receipts. This does not establish
  post-expiry behavior or production performance.
- Focused strict TypeScript check of the census test and imports: exit 0. No
  full hook or integrated candidate build was run.
- Test scripts use disposable, resource-bounded cells (up to 2 CPU / 1.5 GiB)
  and remove their own named containers/network; actual peaks not measured.

## WIP pins (SHA-256)

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/command-status-ack-census.ts` | `b259b91a4fe69b6fa231cc79e4edb811b213bc42c238768c500e76e9d45e5660` |
| `apps/control-api/src/execution-v2/command-status-preparations.ts` | `c2a92312230a621317cd12b83c28d0f638ad7873be4a146bae3d44d927bcdac2` |
| `apps/control-api/test/command-status-ack-census-pg.spec.ts` | `561a43ef09f512a4f1e186b98a5d3285ca3c2f83f5617a9e2f7e83becca1b34d` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `57f85d06f7a5b62207ac3a6df9c8f529c95fd2f7a3282f3f75320d75a82a1489` |
| `apps/control-api/test/command-source-assertion-pg.spec.ts` | `c3d8507fe3fe5d6cb41856ad144795d933b0ae43a96f8cd9009e7430837ca798` |

## Next, handoff and rollback

Core must implement and test the C2-specific STATUS P7/custody path, same
original and lease recovery, exact terminal/ACK handling, plus independent
monotonic restore authority and old-holder fencing. Edge remains the upstream
coordinator for qualified source, original and genuine ACK. No frontend
contract, component or Claude action changes in this slice. Reconcile this
WIP before freezing the integrated candidate; rerun affected gates then run
the normal hook once. Until then leave C2 issuer and V2 restore fail-closed;
rollback is to leave this source unmounted, not erase custody or ACKs.

## Follow-through: census on a historical-schema clone

`scripts/test-elp2-c2-historical-clone.sh` was bounded from 2.5 CPU / 2.5 GiB
to an aggregate 2 CPU / 1.5 GiB (PostgreSQL 0.5 CPU / 512 MiB, Node 1.5 CPU /
1 GiB). It reads the same explicitly pinned historical preview dump and
restores it into its own disposable PostgreSQL; it never mounts a live DB
volume. After the numbered migrations and before candidate write-fence
installation, the test adds a TEST_ONLY legacy terminal plus synthetic STATUS
link/ACK. It then applies the selected candidate upgrade, verifies existing
table fingerprints and security metadata as before, and executes the new
census against that pre-upgrade legacy row. The result is one resolved row;
all test data disappears with the disposable DB. This is schema compatibility,
not a real historical terminal, a genuine Edge ACK or permission to cut over.

- First added-test run: **1 PASS / 1 FAIL**. It attempted to seed the test row
  *after* installing the closed writer fence and received
  `V2_LOCAL_WRITE_FENCED`. The candidate fence worked; it was not disabled.
- Test setup was corrected to seed before installing the fence, without
  changing that fence. Final retake: **2/2 PASS** on the restored clone.
  Focused strict TypeScript check and `bash -n` of the runner: exit 0.
- Both runs' exact named test containers and network were cleaned. One
  unrelated `control-api-test-postgres-*` container was observed and left
  untouched. Actual peak resources were not measured.
- WIP pins: historical runner SHA-256
  `3c335c5af4b725f75905955891d6364044503454d47e05295044d63978fece86`;
  historical test SHA-256
  `be47f79d76fd2572a46f5208646ba1eb241b7055f797d1ad249dc505ea772d0b`;
  census source SHA-256
  `b259b91a4fe69b6fa231cc79e4edb811b213bc42c238768c500e76e9d45e5660`.

Final integration, qualified old-holder/independent authority, real source
terminal and ACK reconciliation, and representative actual DR remain open.
