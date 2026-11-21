# P7 preparation record: explicit owner-intent link — 2026-11-05

**SOURCE ONLY / NOT AUTHORIZED.** On `docs/research-loop-plan`, committed base
`2faa8968fddbde59b2e59525e334ba3d83886144`, with existing uncommitted WIP.
No live schema, permission, UI, runtime or remote ref was changed.

## What changed

The candidate preparation record now stores the exact original owner-intent ID
and confirmation digest together, and checks both again on replay. Candidate
SQL enforces paired nullability and one record per intent; the owner-intent
schema adds a foreign key once that table exists. The original intent is still
revalidated under the existing owner/session, registration, authority and
revocation locks before record creation. A direct diagnostic record has both
fields NULL and is not evidence of owner confirmation. There is no new API.

The new link permits precise audit and same-intent recovery without guessing
which confirmation produced a record. It does **not** make the record an
accepted delegation, authorize a bearer, qualify a verifier or activate the
issuer. Database constraints alone do not establish trusted writers or safe
restore. `RECORDED_NOT_AUTHORIZED` and the issuer's hard fence stay intact.

## Checks

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **5/5 PASS**, exit 0.
  The synthetic-owner PostgreSQL test checks the persisted join and matching
  review binding, same-intent recovery after a lost response, append-only
  protection, and refusal of reused, nonexistent or incomplete intent links.
- `bash scripts/test-elp2-c2-p7-pg.sh acceptance`: **6/6 PASS**, exit 0,
  including direct diagnostic records without an owner-intent link. Disposable
  test containers/network were cleaned by the scripts.
- Focused strict TypeScript on changed source: exit 0. A check including the
  large PG test exceeded its 60-second limit (exit 124) and is **not** a pass;
  full test-inclusive typecheck and the final hook remain open.

| Working input | SHA-256 |
| --- | --- |
| `c2-p7-acceptance.ts` | `2063f768ccddbefa73598706c79f344c9113bb928052a98bc73b445b16500eac` |
| `c2-p7-acceptance.sql` | `9e6aa7c4adb5807d4a8a6b19d63f035de2089384f078af474dcb3eff1ec5ae1d` |
| `c2-p7-owner-intent-candidate.sql` | `6c29c72cca26a802dd05188412579f6e06a8c5bbb0ebd796d9db466cee7e0734` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `2898cd6b3d2d3b5e1b55e5af446c9ea35a353bcf21a5d7dcec485120c930eab5` |
| `c2-p7-acceptance-pg.spec.ts` | `29cf18661a0d65f29a6f90a56759a44859cf77964e0ca46296514f8e2c352dd8` |

## Compatibility and next work

This edits disposable installer SQL, not a migration. An already installed
older candidate lacks the new columns and must remain fail-closed; do not
silently infer links for historical NULL/unlinked records. A future reviewed
forward migration must classify existing records, validate the FK, ownership,
ACL and rollback on a representative copy before any install.

Still needed: qualified immutable owner acceptance/delegation and revocation
coupled to issuance, configured real source and HTTP custody, independent V2
recovery/fence, P8/A2, candidate freeze and integration gate. No frontend
request follows from this preparation-only change.
