# P7 owner-intent / registration atomicity gap — 2026-11-05

**OPEN: P7 remains preparation-only, issuer fail-closed.** The current
`confirm` commits an owner intent, then starts a separate registration
transaction. Its one-view proof is zeroed after that registration call. If
registration fails before committing, `resume` cannot reconstruct that proof;
it is deliberately unable to register from an intent ID or idempotency key.
The isolated PostgreSQL test `c2-p7-owner-intent-candidate-pg.spec.ts`, case
`recovers the same registered intent after a lost P7 write`, explicitly checks
that a prior intent alone does not create the missing registration. That is a
security refusal, not complete same-original recovery. It must not be changed
to treat an intent locator as a bearer or permission.

The implementation direction is to commit the authenticated intent and its
matching registration **in the same bounded database transaction**, keeping
the opaque proof process-local and zeroing it after use. A failure before
commit must leave neither row; an ambiguous response after commit may use the
existing same-session, same-review, same-source and current-authority recovery
path. Owner/step-up/session, authority revision and expiry must be rechecked
under the transaction's existing lock order; revocation must serialize with
both registration and recovery. Real SQL isolation, lost response, rollback,
concurrent revoke and no-extra-intent tests are required before use. Existing
preparation records and source validation remain `NOT_AUTHORIZED`; this is not
permission to mint an issuer token or create a delegation.

This is a source review of the currently uncommitted candidate, not a new test
run, live failure, qualified acceptance or runtime change. Do not claim this
gap closed until the atomic path and its negative/restart tests actually pass.
