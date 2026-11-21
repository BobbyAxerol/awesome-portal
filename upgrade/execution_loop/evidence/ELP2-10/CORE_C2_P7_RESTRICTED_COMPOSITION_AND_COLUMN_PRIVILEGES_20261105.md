# P7 service-role composition and column privilege negatives — 2026-11-05

**SOURCE CANDIDATE ONLY. Not an installed role, startup qualification, owner
acceptance, production release or connected receipt.** Research checkout
`docs/research-loop-plan` has committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; this work is uncommitted alongside
existing WIP. No protected runtime, product DB, authority, or frontend changed.

## Findings and change

The isolated positive composition now runs review, confirmation, registration,
acceptance preparation, resume and issuer-fence read with an actual restricted
PostgreSQL login and independently owned NOLOGIN lock functions. It is **not**
a least-privilege policy: the test login deliberately has broad read/lock grants
and direct P7 INSERT and registry UPDATE. The same test demonstrates that this
login can insert a synthetic registration directly; that insertion is rolled
back in the disposable database. The test does **not** establish that an issuer
would accept that inserted row or that real production data is vulnerable.

The necessary-negative role check now rejects direct INSERT and any UPDATE on
the four P7 records, registrations, owner-intent and intent-revocation tables.
The positive service test also checks that **the same login** is rejected by
this observer. PostgreSQL can grant INSERT on individual columns, so detection
uses `has_any_column_privilege` rather than only table-level INSERT; the
effective-rights observation includes any-column INSERT and UPDATE. Tests
exercise inherited column grants and confirm the effective-rights digest
changes. This is a conservative negative, not an approved role allowlist.

The check is not mounted at startup. In particular the current writer needs
direct writes, so it cannot yet pass this negative. A separately protected,
authenticated owner writer or equivalently qualified transactional boundary is
still needed; a SECURITY DEFINER procedure accepting arbitrary actor/provenance
would not by itself solve that problem. The separate emergency-reduction path
also needs a safe privilege boundary for append-only intent revocations. Do not
enable issuer or infer full provenance from this diagnostic.

## Evidence

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  two disposable PostgreSQL clusters. Synthetic signed source, identity and
  owner only; same-login privilege refusal and transactional rollback included.
- `bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **6/6 PASS**, exit 0,
  disposable PostgreSQL. Includes inherited INSERT at table and column level,
  UPDATE and role drift negatives; the fingerprint changes for column INSERT.
- Harness tears down its own isolated cells. No full integration hook or final
  project typecheck is claimed. `git diff --check` and
  `bash scripts/execution-tracking-test.sh` passed after the ledger update;
  the former does not cover untracked files.

## Source pins

| File | SHA-256 |
| --- | --- |
| `c2-p7-schema-observation.ts` | `2569fd81d52e0d0bcfaaa0265f3d9f2eb21ce8dc03d9e3113cff46336afd16be` |
| `c2-p7-schema-observation-pg.spec.ts` | `dbfc2cac83306c7b23307fb66245b83e45c7d6039de42a7fab15fdb045186b64` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `92a45dbc8860905b96fcdcb200d6fec4cfb5c48ae87f4dfc5df172a4a1c0e680` |
| `c2-p7-registration-writer-candidate.ts` | `2d33a7f7fca4b373adbe584a4c9bf6e0eb6902f239f4c9d92b3453f6c85be41d` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Next work and handoff

Core: implement and test the separated writer/provenance boundary and revocation
path; qualify actual schema/ACL and concurrent drift; retain the startup fence.
Recovery still needs independent authority, old-holder/HTTP fencing and source
terminal/ACK reconciliation before V2 restore. A2, signer custody, B2, genuine
Edge source/ACK, final migration, candidate integration and qualification remain
open. No frontend contract changed; Claude may continue existing fixture work,
but this receipt is not a consumer or browser acceptance request.
