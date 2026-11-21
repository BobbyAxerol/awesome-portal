# P7 confirm: ambiguous COMMIT recovery — 2026-11-05

**SOURCE ONLY; NOT INSTALLED, NOT AUTHORIZED.** On an error from the atomic
intent/registration transaction, the candidate confirmation now attempts to
locate the same original by its owner-bound idempotency key. A lookup is never a
grant or bearer: the existing `recordFromIntent` path revalidates the exact
owner, session, review binding, registered source, authority, expiry and
revocation while holding its locks. If the original cannot be proven, the
original error remains an error; a missing record is not treated as rollback.

Validation of this local candidate:

- Focused owner-intent, writer, review, HTTP, module and issuer suite:
  **54/54 passed**, exit 0. Includes failure without a committed original and
  refusal when original revalidation reports a revoked intent.
- Disposable PostgreSQL suite: **4/4 passed**, exit 0. The COMMIT-response-loss
  simulation now exercises `confirm` itself, verifies one intent and one
  registration, and confirms subsequent same-key resume returns the same
  preparation record. PostgreSQL cleanup left no `elp2-c2-p7` container.
- Bounded strict semantic TypeScript check of the review service and transitive
  source modules: exit 0. `git diff --check`: exit 0 for tracked diff.

Local uncommitted SHA256 pins:

- `c2-p7-review-candidate.service.ts`: `e2f7207687820de47343bf502c1c22bcda808472523f647bbcea0e040988bc66`
- `c2-p7-review-candidate.spec.ts`: `6a9ade4917453332bddcbd9453d40b6061097dcb3112620bf83e87f286bed4f0`
- `c2-p7-owner-intent-candidate-pg.spec.ts`: `f655e54f5827f3404bfa39116da004d9ad484854fd940a206ebb4f1b515ade75`

This updates the affected pins in
`CORE_C2_P7_INTENT_REGISTRATION_ATOMIC_20261105.md`. It is neither a full
AppModule typecheck nor a normal hook, real-owner/source acceptance, P7 grant,
source ACK, runtime installation, A2 or permission to issue/sign. The issuer
remains fail-closed; V2 DR cutover remains blocked.
