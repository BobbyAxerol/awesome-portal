# P7 review lock writer wiring — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT INSTALLED, NOT CONNECTED, NOT AUTHORITY.** This
continues [the review-lock definer candidate](CORE_C2_P7_REVIEW_LOCK_DEFINER_20261105.md).
The P7 intent verifier and revoke, acceptance recovery, and emergency reduction
now acquire the selected original intent through the keyed row-lock functions
in their existing transaction. The caller continues to validate the owner,
workspace, current session, revision, decision and revocation as applicable;
the functions themselves do not authorize requests. A fresh revocation read
after the lock is retained so a transaction that waited for revoke does not
trust an earlier READ COMMITTED snapshot.

## Focused results and isolation

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **8/8 PASS**, exit 0,
  two disposable PostgreSQL instances. Covers composed owner preparation,
  restricted login/NOLOGIN definer locking, revoke race, same-intent lost-write
  recovery, synthetic HTTP session/CSRF, and a retained `UNKNOWN` delivery that
  keeps drain from clearing. This is not a real owner delegation or source ACK.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-emergency`: **2/2 PASS**,
  exit 0, disposable PostgreSQL. A separate restricted login uses the keyed
  definer without direct owner-intent UPDATE; a competing lock delays the
  emergency reduction, which then atomically records revoke and blocks new work.
- Seven focused P7 acceptance, intent, emergency and review unit/HTTP/
  composition/runtime suites: **53/53 PASS**, exit 0.
- Harnesses use uniquely named isolated containers and remove their own cell;
  neither test targets a shared or product database.

Two earlier retakes were not passes: the first was **3/7**, because later
tests expected a ready drain after an earlier test deliberately retained an
`UNKNOWN` delivery; the next was **7/8**, because the assertion matched the
internal error code against a deliberately generic public error message. The
test now retires only its synthetic unentered `ISSUED` lease, preserves the
uncertain delivery and explicitly asserts that drain stays blocked. The final
assertion checks the actual typed error `code`; no intent, custody, terminal or
ACK was fabricated or removed to make it pass.

## Current uncommitted source pins (SHA-256)

| Input | SHA-256 |
| --- | --- |
| `c2-p7-owner-intent-candidate.ts` | `e9be14400399bce45d129ce4214d91309f34c60815f8eca896348fef15e25084` |
| `c2-p7-acceptance.ts` | `f7bec338315f7af3e7b3725539ef55719bde392a421e98d1ee8a55b27e11e631` |
| `c2-p7-emergency-reduction-candidate.ts` | `9e0e3a6f0a607416f950438ae96674425e2a0197a3a94d846040e2db73a40d53` |
| `c2-p7-review-lock-candidate.sql` | `feea7cdd7bf219bcfbf094a6474ed82f816afa677698c023e94ba4ca1729d8fc` |
| `c2-p7-review-lock-definer-candidate.sql` | `26af999afc10c9af117d87103a15d854f30cb53af3c64949eae78cb4e8facfa0` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `6efe38a6c26374bd8f92c4f5e210f505271f10a88892e7167d44bd9a71351fe4` |
| `c2-p7-emergency-reduction-candidate-pg.spec.ts` | `4f30199d3bca068ce79785be78ab451ef2ad4e7ff1ecaea9c77d1161dd5543cc` |
| `scripts/test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `815d43aa9e031e7e19f37e2508728d635222e439cbe8807f0f5ab398f18d5d5b` |

## Remaining and handoff

The SQL functions and installer are still candidate material. Review the other
locked tables and exact grants, trusted schema/role allowlist, concurrent ACL
changes, and the full restricted-login service before selecting the schema.
The startup P7 schema fence remains closed; no issuer/listener was commissioned,
no authentic P7 acceptance was created and no frontend contract changed.
Independent checkpoint/old-holder fencing, late terminal/ACK reconciliation,
actual Edge source and ACK, migration/restore on a representative final
candidate, test-inclusive typecheck and normal integration hook remain open.
Prior receipts apply only to their pinned inputs, not automatically to this
modified tree. No runtime, product DB, stable/dev/main or Live state was changed.
