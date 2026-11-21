# P7 unsigned preparation route bypass — 2026-11-05

**SOURCE-ONLY; uncommitted and not installed.** Inspection of the candidate
controller found that `POST /confirm`, `/resume` and `/resume-by-key` could
call the preparation service directly. Those operations can create or complete
P7 records without going through the separate owner-attestation and
pre-dispatch-reservation candidate. The currently fenced bootstrap prevents
this from being a claim about a mounted product runtime.

These three routes now retain session, origin/CSRF, idempotency and strict
body validation but return `503 C2_P7_OWNER_ATTESTATION_REQUIRED` without
calling the preparation service. Read-only review and the independently
composed emergency reduction route are unchanged. This does **not** alter
the C2 rule that an already-entered source transaction can be resolved after
revocation. The separately guarded `confirm-signed` remains an unmounted
candidate; its positive synthetic response is not real owner acceptance.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  two disposable PostgreSQL clusters. The HTTP case verifies all three old
  routes refuse a valid session and do not increase the Core intent count;
  the separately mounted synthetic signed route still succeeds and retries
  the same original. Test roles, identities and source are synthetic.
- `npm test -- test/c2-p7-review-candidate-http.spec.ts`: **5/5 PASS**,
  exit 0. This verifies no service dispatch, negative origin/CSRF/body,
  no-store and separately available emergency reduction with test doubles.
- Focused strict TypeScript check of the controller and imported dependencies,
  with Fastify cookie types: **exit 0**. This is not the full-project or
  test-inclusive typecheck or the normal hook.

| Working-source input | SHA-256 |
| --- | --- |
| `c2-p7-review-candidate.controller.ts` | `8085d6f00c58c3eb6f3d5e5b061e79faaad9f4fe84ca208f18f574a362aa759a` |
| `c2-p7-review-candidate-http.spec.ts` | `ccc44de7387da9a0e03bbaad645e42b728eb2137e31a8ed75dd4a34957c6787f` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `edc2a8eeffa118d06f6e9ca8aea12f5a26c4806556ffa716f819d9b06542f424` |

The new PG test hash supersedes the test input pin in the earlier
[reservation receipt](CORE_C2_P7_PRECREATE_RESERVATION_20261105.md); the
same reservation scenarios were included in this retake. Runtime P7 writer
and signer isolation, authenticated provider, old-holder fencing and restore
reconciliation remain unqualified. The lower-level candidate service methods
are not made safe for arbitrary in-process callers by this HTTP guard. A2,
Edge ACK and V2 restore are not complete. No frontend action is requested.
