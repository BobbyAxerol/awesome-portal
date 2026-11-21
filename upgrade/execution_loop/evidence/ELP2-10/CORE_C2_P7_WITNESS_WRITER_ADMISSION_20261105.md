# P7 witness writer admission — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** The base is
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144` plus
shared uncommitted candidate WIP, not a built or installed runtime. No real
owner, grant, source, issuer, listener, credential, or runtime was changed.

## Change and boundary

The prior [read fence](CORE_C2_P7_RECOVER_RESERVATION_FENCE_20261105.md)
left `retain` able to create a signed orphan witness with no authenticated
reservation. Under the existing per-custody transaction/advisory lock, `retain`
now requires the MAC-authenticated reservation for the same cycle and intent
before insertion or retry. Capacity is reserved in the earlier
`reserveIntent` operation. The signed proof, pinned signer, exact bytes and
expiry checks remain in place. A missing, forged, or mismatched reservation
fails closed; it is not permission to create a replacement original.

Tests seed an **old-format synthetic orphan directly into an isolated test
database** to keep checking legacy refusal; this is not reconciliation or an
owner decision. Existing real legacy data must be independently inventoried
and reconciled, not silently deleted or accepted. No HTTP or frontend contract
and no migration were changed. Do not enable the P7 issuer on this basis.

## Validation

- First sandbox attempt could not start Docker (`sudo` no-new-privileges);
  the authorized isolated retake of `bash scripts/test-elp2-c2-p7-pg.sh
  owner-intent` passed **9/9** using two disposable PostgreSQL clusters.
  The test covers absent reservation/no inserted row, existing legacy orphan,
  forged MAC, wrong intent, bounded concurrent reservations, same-proof retry,
  recovery, revoke, isolated HTTP session/CSRF and issuer fence paths.
  Test identities, signing keys and owner attestations are synthetic.
- Focused strict source TypeScript check passed (exit 0); `git diff --check`
  passed. Full compiler and normal hook were **not** run.
- The script's cleanup completed; a privileged Docker readback found no
  matching P7 test containers. Peak resources were not measured; script caps
  the two PGs and test runner in aggregate at 2 CPU and 1.5 GiB.
- Read-only Edge STATUS inspection still showed the Nov 5 static package and
  TS structural verification, not an installed listener, actual P7 acceptance,
  full A2 or B2; the sandbox network attempt failed before an authorized read.

| Input | SHA-256 |
| --- | --- |
| `c2-p7-owner-witness-custody-candidate.ts` | `7e8031832ffe2cd67b5d9f3c0f0f95004d12665e91b03b8f51cafc7602920982` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `8a1c4675664f4e7c1abdbdf3ef587ce39f7b0049afe1b83d1d6f61e0d33f66e4` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Exit and next work

The local writer-path gap is repaired for these pinned candidate inputs, not
qualified for production: separately provision and qualify owner-auth and
signer roles/keys, current owner session and step-up, independent old-holder
and restore fencing, and reconcile legacy records. Review the whole candidate,
forward migration and ACLs, repeat affected tests, and run the normal hook on
the frozen selection. P7 issuer remains fail-closed; A2 is NOT_READY, B2 is
unsigned, V2 restore is refused, and connected/financial/G2/browser remain
open. Claude has no new frontend action from this internal change. Rollback is
to keep this unmounted candidate disabled; do not remove authority records.
