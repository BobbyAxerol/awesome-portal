# C2 custody preflight and concurrent capacity — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED.** Branch `docs/research-loop-plan`, base
`2faa8968fddbde59b2e59525e334ba3d83886144`, plus shared uncommitted WIP.
No runtime, source authority, credentials, production database, grant, command
or Live state was changed.

The candidate checks independent custody availability and reserved outcome
capacity before creating an original. Request bytes and actor/session identity
are copied before the asynchronous check, so a caller cannot silently alter what
the issuer signs while the preflight is pending. A known-full or unavailable
custody therefore fails before creating a new lease.

Preflight is **not an atomic capacity reservation**: simultaneous requests can
both pass it. The independent serializable append remains the authority for
capacity. The losing request does not receive a bearer and is reported pending
with its existing original lease; recovery must use that same original, not a
new attempt. The test demonstrates recovery after increasing capacity in the
disposable cell, not an approved production capacity change or a guarantee that
an operator can intervene before expiry.

## Verification

- `bash scripts/test-elp2-independent-custody-pg.sh`: exit 0, **4/4** with
  two disposable PostgreSQL clusters and test-only loopback mTLS. Covers
  unavailable/full preflight without a new lease, request/session mutation,
  simultaneous capacity contention, pending original and same-lease resume,
  and existing ENTER/UNKNOWN/terminal response-loss scenarios. The test runner
  cleans its own cell. These are isolated tests, not connected acceptance.
- Focused strict TypeScript check of `c2-custodied-issuer-candidate.ts` and
  `c2-human-issuer-composition.ts`: exit 0. This is not the normal full hook.

| File | SHA-256 |
| --- | --- |
| `c2-custodied-issuer-candidate.ts` | `09d6d5c331e4aa979a20edb1a004bd14c77484a0403479099478a902301b14ef` |
| `restore-independent-custody-candidate.ts` | `f382b4e44b9f436433581964cc17933fbb9b2b62cec06c3d38d9f6bfa35dbc66` |
| `restore-independent-custody-candidate-pg.spec.ts` | `4d46db60060f6bc96a0f197d19329d42f4ef2f00350a888b4b76eaf875171553` |

These hashes supersede matching inputs in the preceding custody receipt.

## Still open

The candidate is not mounted; end-to-end HTTP delivery is not yet fenced with
the independent checkpoint. The independent failure domain, old-holder fence,
complete post-snapshot terminal/ACK census and restored cutover are not proved.
P7 owner acceptance and source-revocation fencing, listener/source trust and
genuine connected A2 remain uncommissioned. B2 stays unsigned until both A2
acceptance and `C2_SEALED`. Final integration, normal hook and landing remain.
