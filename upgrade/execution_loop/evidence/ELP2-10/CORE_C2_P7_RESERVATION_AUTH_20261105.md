# P7 reservation authentication and precheck — 2026-11-05

**SOURCE-ONLY; uncommitted, not installed, not P7/A2 acceptance or a restore
barrier.** The candidate reservation stored a plain request hash and intent
ID. A principal able to insert into its database could preplant an arbitrary
matching row. Immutability triggers do not authenticate inserted bytes.

The candidate now authenticates each reservation with an HMAC keyed by a
domain-separated key derived from the custody key. The MAC binds cluster
identifiers, custody and key IDs, signer pin, cycle, intent and request hash.
Existing reservation reads and witness retention verify it; wrong keys or
fabricated rows fail closed. Raw key material and attestations are not written
to the reservation row. Independently operated key custody and least-privilege
database roles are not established by this code.

Before creating an irreversible reservation, the candidate signer now reads
the current review and checks its digest against the separately authenticated
owner request. It rechecks attestation validity afterwards; normal locked
source/session/authority checks still occur during the actual write. A change
after the preview can still leave a reservation pending; absence of an intent
is not proof that a prior dispatch rolled back.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  with two disposable PostgreSQL clusters. Within the selected test, direct
  insertion of a forged reservation and a wrong vault key are refused, a
  signed stale review does not create a reservation, and same-original retry,
  concurrent reservation, pre-dispatch uncertainty and HTTP guard cases run.
  This is synthetic source/owner/keys and does not prove source acceptance.
- Strict focused TypeScript check of the signer and witness custody and their
  imported dependencies: **exit 0**; this is not a full or test-inclusive build.
- Temporary test containers were gone on inspection. No runtime or protected
  database was changed. This retake supersedes the changed source and PG-test
  pins in the previous reservation and unsigned-HTTP receipts, not unrelated
  historical gate results.

| Working-source input | SHA-256 |
| --- | --- |
| `c2-p7-owner-witness-custody-candidate.sql` | `3a0bbe6b7ee8b6c063ced3c840c0c85a8b5d9b2f30899195330cd4eac3c47a7c` |
| `c2-p7-owner-witness-custody-candidate.ts` | `4257cc4d940ca5957980aada0a42d383bd063410ba3aef074615b144aa1446c4` |
| `c2-p7-owner-confirm-signer-candidate.ts` | `6a87b10c4a2aa1ea50572fb7710dea783e93db79cc84e91c8711cf37bbb5b9d8` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `5e82ee9ddc48b76b51722680ae0d2c6bf7e4ce3ffd442e89a7e4663760e51a52` |

## Still required

MAC validation cannot detect deletion or a rollback to an older independent
store, or prevent a former holder from writing elsewhere. Complete separately
administered custody and writer/old-holder fencing, reservation settlement,
post-snapshot original/terminal/ACK reconciliation and a representative V2
restore. The test-only schema has changed and needs a reviewed forward
migration and existing-history treatment before installation. Full candidate
review, normal hook, actual owner/source authority, A2 and Edge acceptance
remain open. No frontend contract/action is introduced.
