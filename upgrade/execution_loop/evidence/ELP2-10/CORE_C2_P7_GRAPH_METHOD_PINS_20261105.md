# C2 P7 — pin review, intent and registration graph methods

2026-11-05. **Source-only uncommitted candidate; not installed, not owner
acceptance, not A2 and not an enabled issuer.** Committed HEAD is
`2faa8968fddbde59b2e59525e334ba3d83886144`; the candidate tree is different.

## Change and boundary

The owner-intent and registration-writer candidates previously stored pool,
source and registration selection in TypeScript `private` properties, which
remain ordinary mutable JavaScript properties. They also looked up verifier
methods dynamically. The review graph held private object references but
looked up owner-intent, record and emergency methods dynamically. A mutable
in-process dependency could consequently change the selection after it was
composed. This is an in-process integration hardening issue; no claim is made
that a remote caller exploited it.

The candidates now retain selection in ECMAScript private fields and capture
the verifier/method references. A source verifier or intent verifier whose
method changes fails the composition check instead of silently selecting the
replacement. The review graph calls the captured methods and its mount check
requires the actual expected prototypes. The acceptance candidate also rejects
a changed verifier. Existing owner/session/step-up, scope, source and database
transaction checks are unchanged. This does not prove verifier internals,
source authority, trusted runtime installation or an HTTP delivery fence.

## Result

- Six focused unit/HTTP/composition suites: **54/54 PASS** on the final
  candidate selection.
- Isolated PostgreSQL owner-intent / atomic registration: **5/5 PASS** on the
  final selection, including HTTP session/CSRF, database locking and recovery
  of the same original. The separate acceptance PG suite ran **6/6 PASS** on
  the unchanged acceptance file before the last review-only method pin.
- Strict source typecheck rooted at `c2-p7-review-candidate.service.ts`:
  **exit 0**. A broader strict check including unit tests timed out at 120 s
  (**exit 124, not PASS**). Full candidate typecheck and normal hook remain
  open. The first unit run had one stale test expectation after making verifier
  replacement fail closed; the expectation was corrected and the final run
  passed. No synthetic test is a commissioned owner approval.
- Disposable PostgreSQL and node containers/networks were removed by the test
  script; a read-only check found no remaining named P7 containers. No runtime,
  database migration, key, UI, stable/dev/main or remote was changed.

## Working source SHA-256

| Input | SHA-256 |
| --- | --- |
| `c2-p7-owner-intent-candidate.ts` | `c01e6b5a844795e8b6bb48452255ebbc9a99b5540089ce34ca0c7f5b75e47791` |
| `c2-p7-registration-writer-candidate.ts` | `bba8a9315384fabe98f2077793bded0058fe6ae42f5acad97f191be4cc25bae0` |
| `c2-p7-acceptance.ts` | `5c79f81783458e37be58d176185546a3f0b71f7d36ef1f1d6377237b9ac9cf7c` |
| `c2-p7-review-candidate.service.ts` | `0d9c88443135162789cdfd536c752dcf36bf4628eca4d4828b0b4b4b7b4b2d9d` |
| `c2-p7-owner-intent-candidate.spec.ts` | `10072801acad3e90a6ee033c6f5f26b4050ef0dde6f0e1c84f8f762335242c0b` |
| `c2-p7-registration-writer-candidate.spec.ts` | `f7972e6eac7ebccb87913c6b650a1082192527a4b01045ec749892d1a030b914` |
| `c2-p7-acceptance.spec.ts` | `a599123ed93ef37b2eef5cc601cbcdfa85bc05dbf1349ab96af24f29024ac08c` |
| `c2-p7-review-candidate.spec.ts` | `f15de632301ebd8a6bcf11023cdf48c7ccc3b74376a47e279662a807376403df` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `2898cd6b3d2d3b5e1b55e5af446c9ea35a353bcf21a5d7dcec485120c930eab5` |
| `c2-p7-acceptance-pg.spec.ts` | `29cf18661a0d65f29a6f90a56759a44859cf77964e0ca46296514f8e2c352dd8` |

## Remaining / handoff

Owner acceptance/delegation and issuer remain hard-fenced until genuine owner
authority and its same-fence revoke/issuance semantics are qualified. Finish
recovery barrier, review and freeze the integrated candidate, retake impacted
tests against its dependency/schema hashes, perform representative restore and
the normal hook. There is no new frontend contract or consumer request.
