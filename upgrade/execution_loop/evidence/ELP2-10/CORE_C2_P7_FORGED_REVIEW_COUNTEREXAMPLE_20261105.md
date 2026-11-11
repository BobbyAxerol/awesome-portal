# P7 forged-review counterexample — 2026-11-05

**SECURITY COUNTEREXAMPLE, SOURCE-ONLY. P7 ISSUER MUST REMAIN FENCED.**
This updates the narrower observation in
[the preceding receipt](CORE_C2_P7_RESTRICTED_COMPOSITION_AND_COLUMN_PRIVILEGES_20261105.md):
we have now tested more than an untrusted registry INSERT. Committed checkout
HEAD is `2faa8968fddbde59b2e59525e334ba3d83886144`; these files are WIP.

## Reproduction and scope

In the disposable PostgreSQL test, a separately authenticated test login has
direct INSERT on owner intents, records and registrations, plus access to the
existing test owner/session/source facts. It first executes a legitimate
synthetic review. Then, **without calling `confirm` for the second cycle**, it
constructs another intent and record with internally consistent but fabricated
review/confirmation digests, using the existing synthetic signed source and
owner/session. `C2P7IssuerFenceCandidate.checkLocked` returns
`P7_PREPARATION_CURRENT_NOT_AUTHORIZED` for this second cycle. The entire
forged sequence is rolled back; a follow-up query verifies the synthetic record
and forged registry row are absent. This proves that current digest and row
locks are integrity checks, not independent proof of the owner's confirmation
against a DB writer with those privileges.

This is **not** a production exploit, a real owner acceptance, a live-issued
assertion or an Edge/TS authorization. The candidate startup/issuer remains
fenced. The test neither proves the signer was reached nor creates a real
source grant. Its test-only role has broader privileges than a qualified role;
the earlier same-login necessary-negative check rejects it. That check is not
yet connected as a sufficient startup or provenance verifier.

## Focused test

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  two disposable PG clusters. Here PASS includes *reproducing the unsafe
  candidate behavior*: it is not a security qualification. An earlier attempt
  failed because the test constructed a noncanonical binding; it was corrected
  to use the same strict binding schema, then rerun. The harness tears down its
  own cells. No normal hook, runtime installation or production DB was used.

| Input | SHA-256 |
| --- | --- |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `b19a241a0bee8b14baed373aea138ed2718446dac9b5a6da4bc563b84499b339` |
| `c2-p7-issuer-fence-candidate.ts` | `99af0cf69446b6ea2311a1468d70f8928f316fde8d59a6d51ca4add691a683c6` |
| `c2-p7-review-candidate.service.ts` | `c18ebd1acab20e467cc5e11453394a659e57cbe7ea0c2b41f576f88ec72f3f4d` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Required Core follow-through

Enforce a separately protected owner-confirmation provenance and writer
boundary tied to the exact reviewed cycle, source, owner, session and current
authority, with revocation and recovery under the same fences. Verify it on
issuance and resume; direct DB grants or a definer function with caller-chosen
inputs alone are not sufficient provenance. Retain this counterexample as a
negative regression once the boundary exists, and test permitted real review,
stale/revoked/wrong-principal and same-original recovery. Independently qualify
role ownership, permissions, transport, lifecycle and startup before enabling.
No frontend contract or Edge action is requested by this diagnostic.
