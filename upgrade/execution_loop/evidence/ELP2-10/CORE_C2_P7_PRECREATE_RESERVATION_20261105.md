# P7 pre-dispatch reservation candidate — 2026-11-05

**SOURCE ONLY; uncommitted, unmounted, not a restore barrier or A2.** This
continues the retained-witness fix. It does not commission independent owner
authority, change runtime, authorize issuance or enable V2 restore.

Before dispatching a newly authenticated owner confirmation to Core, the
candidate now commits an immutable reservation in the separate witness test
database, binding the selected cycle and owner/session/request digest to a
single random intent ID. A database advisory lock serializes capacity and
concurrent reservation across candidate instances. Only the invocation that
created the reservation may dispatch creation using that ID. Any retry,
including an ambiguous reservation commit, can only locate and revalidate
that exact original; it cannot dispatch creation again. The existing Core
record is checked against the reserved ID before attempting to complete it.
The signer rechecks attestation expiry after the reservation transaction.
Existing authenticated witnesses remain supported as locate-only originals.

If the process stops after committing the reservation but before dispatch,
the safe outcome is **pending**, not a fabricated rollback or a new intent.
The candidate intentionally has no automatic release of this uncertainty.
It requires a separately authenticated settlement and operational recovery
design; the reservation itself is neither owner authority nor proof that Core
accepted the request. The immutable table is an unnumbered test schema, not
a reviewed forward migration or a trusted independent operational store.

## Focused checks

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final retake **9/9**,
  exit 0, on two disposable PostgreSQL clusters. Within the existing PG test,
  two store instances race for one reservation and return the same ID with
  exactly one creator; mismatched request and over-capacity are refused;
  mutation is refused; a synthetic stop after reservation and before dispatch
  stays pending without creating any Core intent. Existing lost-original,
  same-original retry, session/CSRF and issuer cases also run. This simulates
  the boundary; it is not an OS kill or a representative backup restore.
- Strict focused TypeScript check of the signer and custody candidate,
  including dependencies and Fastify cookie type context: **exit 0**.
- Test harness containers and internal network are temporary; a post-test
  container-name check found none. No shared data, runtime or credentials
  were changed. `git diff --check` passed before this documentation update.

| Working-source input | SHA-256 |
| --- | --- |
| `c2-p7-owner-witness-custody-candidate.sql` | `2814a2cb78e4314547c391484ca987f7ffbc4f84762b3a17d7f11081b7e41431` |
| `c2-p7-owner-witness-custody-candidate.ts` | `c8c396110243419497f37b75f9e67044a56004fa1964354ff26b046a09bd55da` |
| `c2-p7-owner-intent-candidate.ts` | `bde0c849fe6db73b1112349092dd86b9fa13b425778e240ca5326ab2e0e10aa1` |
| `c2-p7-review-candidate.service.ts` | `a5a587c7d8367104e48a93d43eee748d1d74044d0dc3243f9030e55012cd105c` |
| `c2-p7-owner-confirm-signer-candidate.ts` | `f8dc34628b279d494e42dd90a6bade37972bcd3a283778ddef407891d9f49e9e` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `9d5c86808163006d10d55b61faeae527ee4ecb41191c5bc6faee26038ed99f9c` |
| `scripts/test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining before commissioning

Qualify the independent store/key and least-privilege ACL, protect all writer
paths against bypass including older holders, design safe reconciliation for
pending pre-dispatch reservations, and rehearse restore with post-snapshot
revocation and complete terminal/ACK census. Review migration compatibility,
all shared WIP and exact dependencies, then run full candidate checks/hook.
Actual P7 owner acceptance, A2, source trust, B2, connected acceptance and
G2/browser remain separate. No frontend contract or action is introduced.
