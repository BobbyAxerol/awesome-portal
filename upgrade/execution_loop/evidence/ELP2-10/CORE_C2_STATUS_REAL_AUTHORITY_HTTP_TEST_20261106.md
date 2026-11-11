# C2 STATUS — Core/P7 and HTTP custody in one isolated cell

**TEST/SOURCE WIP ONLY. Not installed, not A2, not an Edge ACK, and not a V2 restore.**
Checkout `docs/research-loop-plan@2faa8968f` plus shared uncommitted WIP.

## Scope and result

The existing two-PostgreSQL P7 suite now joins the real Core access service,
status preparation/authority, P7 candidate and independent-custody candidate
to the **test-only** restricted reader/writer and loopback mTLS HTTP delivery.
The original, identity, source membership, owner witness and keys are synthetic.
The same context, assertion and lease are first recovered in a separate OS
process, then delivered by the reconstructed authority; no extra original is
created. A successful HTTP finish leaves an `UNKNOWN` delivery and **zero ACKs**.

The test proves completion before source terminal is rejected. It then uses a
synthetic, signed ENTER and COMMITTED via the loopback reverse listener and a
separate mTLS completion request to write one synthetic ACK; an identical ACK
retry returns the same result and creates no duplicate. The restricted reader
cannot directly select the STATUS context table. These are synthetic local
facts, not a commissioned source, real recipient ACK, installed service restart,
or production HTTP-custody qualification.

The two test-only SQL installers now additionally permit the existing
`portal_c2_p7_<8 hex>` disposable cell **only** when the installing session sets
the explicit test flag; both refuse that DB without the flag. The TypeScript
test delivery likewise requires the explicit P7 test environment flag for the
P7 database prefix. Existing `portal_restore_rls_<8 hex>` test behavior is
unchanged. The procedures and delivery composition remain unmounted and do not
authorize their deployment.

## Tests, failure and cleanup

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: initial **8/9**; the new
  HTTP case passed but correctly left an unentered lease, causing a later
  session mutation to refuse with `CURRENT_HUMAN_DRAIN_REQUIRED`. The test
  was corrected to exercise the full synthetic terminal/ACK lifecycle rather
  than retiring the pending lease or bypassing the fence. Retake **9/9**, then
  after adding premature-ACK and idempotent retry assertions final **9/9**,
  exit 0 (67.57 seconds reported by Vitest).
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  **4/4**, exit 0 on the existing disposable-RLS path.
- Strict `tsc --noEmit` on the selected delivery helper, 768 MiB heap: exit 0;
  `git diff --check`: exit 0. The large test-inclusive check was not rerun:
  its earlier 768/1100 MiB OOMs remain recorded in the previous receipt.
  Neither this check nor Vitest replaces the normal integration hook.
- Both scripts use bounded isolated cells and clean up their exact resources;
  read-only checks found no `elp2-c2-p7` or `elp2-restore-rls` test container or
  network afterwards. Configured P7 aggregate limit: 2 CPU / 1.5 GiB; actual
  peak **NOT_MEASURED**. No shared runtime, source DB, UI or credential changed.

## Working-file SHA-256

| File | SHA-256 |
| --- | --- |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `2fc246a20734caf43620cec06faf4ae34d1fc344b5024ed86e137e37caf8aeef` |
| `apps/control-api/src/execution-v2/c2-delivery-procedure-acl-candidate.sql` | `fa3f1ccec1ae39c1ee44bb8e4317091612f372a892be6e994e06089c71bc6305` |
| `apps/control-api/src/execution-v2/c2-status-reader-acl-candidate.sql` | `3b2c4e019adf31d2e3eba6f3590f1d30f1a64afa8b1ab5a5791856024da9a89d` |
| `apps/control-api/src/execution-v2/c2-status-http-delivery-test-candidate.ts` | `6f7a44fb5415d4f11d2f6c7fc5daac47d42b15f1bcb78cfcf3f705bafb754605` |

These working-file pins supersede the corresponding test pin in the previous
[OS-process receipt](CORE_C2_STATUS_P7_OS_PROCESS_RECOVERY_20261106.md); they
are not a frozen candidate, image or installed schema.

## Next / Claude / rollback

Core must replace this test-only composition with a reviewed runtime-grade
principal/field-authority and delivery boundary; cover process loss during the
actual delivery, independently held anti-rollback authority and restore fences,
and reconcile genuine Edge terminal/ACK for the same original. A2, qualified
READ/STREAM, financial publication, G2, integrated migration/rollback and final
hook remain open. Claude has no new frontend contract or action in this slice.
Rollback is to leave the new test composition unmounted and continue to refuse
V2 restore until its independent safeguards are qualified.
