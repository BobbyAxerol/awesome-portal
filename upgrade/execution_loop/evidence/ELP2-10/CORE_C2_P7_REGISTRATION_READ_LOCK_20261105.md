# P7 registration read lock — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT INSTALLED OR AUTHORITY.** The issuer's locked
registration verifier used direct `SELECT ... FOR SHARE`, requiring UPDATE on
the registry for a reader. It now calls a bounded keyed row-lock function and
continues to validate signed source, owner, session, policy, authority revision,
registration contents, state and expiry inside the caller's transaction.
The function is not an authorization decision.

The separate candidate installer checks a restricted NOLOGIN function owner,
role membership, dangerous rights, exact function body, SQL language, return
type and search path before setting `SECURITY DEFINER`. It creates no roles or
grants. Startup remains fenced. The definer has the narrow UPDATE privilege PG
requires for row locking; the trigger/ACL and privileged-operator threat model
still require final schema qualification.

## Retakes

- Schema/role disposable PostgreSQL **6/6 PASS**, exit 0: selected registration
  lock blocks a real competing revoke until released; afterward revoke succeeds.
  The reader cannot directly update; unsafe body, privileged owner and
  assumable definer are rejected.
- Acceptance disposable PostgreSQL **6/6 PASS**, exit 0, including a revoker
  waiting while the acceptance writer holds the original lock.
- Owner/issuer two disposable PGs **8/8 PASS**, exit 0.
- Four focused registration/acceptance/review unit suites **40/40 PASS**.
- An initial acceptance retake was **5/6**, not a pass: the race test's probe
  still matched the old literal `FOR SHARE` query and did not wait. The probe
  now waits immediately after the new function call and still checks an actual
  blocked revoker before release. Test cells clean up their own resources.

## Current uncommitted source pins (SHA-256)

| Input | SHA-256 |
| --- | --- |
| `c2-p7-registration-read-lock-candidate.sql` | `0f445a7c51d9f9036bdb8b80f201422b5870b93cc055b82f3f1b4c9bf25f934b` |
| `c2-p7-registration-read-lock-definer-candidate.sql` | `dd434027f83b990a944243b1983f3a757a11328ec768991b068140a926f79720` |
| `c2-p7-locked-registration-candidate.ts` | `2a4290c44ab3bcc26d29d9e1250b1472a499738fa02dd4c9ec4b48970079ba3d` |
| `c2-p7-locked-registration-candidate.spec.ts` | `69421f84cdae9e897a9b0068d86617307b26d69515895a9baf9d94bd65a70722` |
| `c2-p7-schema-observation-pg.spec.ts` | `f622db092d2148e8ccaeb779c6f012b25b1447e16653c6936c57201a161a36e6` |
| `c2-p7-acceptance-pg.spec.ts` | `ce57365b76b1759b201faa463d087d37a312db010af23beb323b2557df070d51` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `edf8f0ec12d114b6da550235ed50e67a4073f9c4042f522f96327c20605c47a1` |

## Still open

This does not secure registration creation or prove the whole service with a
least-privilege login: the writer still has its own direct INSERT/UPDATE path
and must be separately qualified against forged registrations and unsafe
grants. Final role/schema allowlisting, concurrent ACL drift, HTTP custody,
genuine P7/source authority, independent restore barrier, representative
migration and full integration gate remain open. No product DB, runtime,
frontend, stable/dev/main, Live or signing state changed.
