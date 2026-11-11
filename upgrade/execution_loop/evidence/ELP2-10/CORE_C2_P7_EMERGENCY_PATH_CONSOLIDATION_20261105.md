# C2 P7 emergency-path consolidation — 2026-11-05

**SOURCE ONLY. P7 authority is not commissioned, A2 is NOT_READY and B2 is
NOT_SIGNED.** No runtime, DB, credential or Edge source was modified.

## Change

The older `C2P7RegistrationWriterCandidate.emergencyRevoke` directly updated
the registry. It did not itself prove `BLOCK_NEW`, used a policy-dependent
snapshot, and required raw registry UPDATE. It was an unmounted candidate,
not evidence of a production vulnerability. To prevent a stale internal
caller from bypassing the authority-first procedure, that method now refuses
before opening a connection with `C2_P7_USE_EMERGENCY_REDUCTION`. The
separate `C2P7EmergencyReductionCandidate` remains the emergency path: its
session/CSRF-protected composition calls the scoped procedure and reports
`AUTHORITY_PROPAGATION_PENDING`, not a source-side revocation.

This does not qualify the normal registration writer, create a genuine owner
acceptance, install database ACLs or make the issuer available. The separate
emergency route is also source-only until its own installation is qualified.

## Validation and pins

- Registration writer, emergency and review unit tests: **21/21 PASS**.
- P7 acceptance tests on disposable PostgreSQL: **6/6 PASS**, including
  refusing the old helper and preserving its row. The procedure-backed
  reduction is exercised separately, not inferred from this refusal.
- The first procedure-backed emergency PG run had **1 PASS / 1 FAIL**:
  its test used a superuser session and the new caller fence rejected it with
  `C2_PROC_UNSAFE_CALLER`. The harness now uses a real limited login, not
  `SET ROLE` from a superuser. Its retake is **2/2 PASS**: raw registry and
  scope UPDATE are denied; an owner intent lock serializes reduction; intent
  revocation, registry state and `BLOCK_NEW` commit together without relying
  on source, policy parsing or step-up. This is a synthetic isolated actor,
  not a live owner or a production ACL qualification.
- B2 dry-run, publication-preflight and custody unit tests: **18/18 PASS**
  with the pinned public `b1-r1` bytes SHA-256
  `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`.
  This runs the earlier skipped public-B1 test. The first invocation hung
  inside the restricted sandbox and was interrupted (exit 130); the retake
  completed outside that sandbox. Neither run signs a publication.
- The scripts clean up their test containers and network. A subsequent
  name-scoped container check was empty. An unrelated pre-existing container
  outside the exact test-cell naming pattern was not touched.
- Focused strict TypeScript for the changed source and three tests did not
  complete: the sandboxed invocation was interrupted (130), and a second
  invocation with a 1,200 MiB Node heap and 90-second bound timed out (124).
  Neither is a typecheck PASS or a diagnosis of a type error. Full typecheck
  and the normal hook remain required for the integrated final candidate.

SHA-256 of the four changed candidate/test files:

| File | SHA-256 |
| --- | --- |
| `c2-p7-registration-writer-candidate.ts` | `484edf6215d0a8324c6fa1b6acac599be00479d36ac654571f492c8f98c7a052` |
| `c2-p7-registration-writer-candidate.spec.ts` | `fb2a2fdc89fc5e07f57c51229444c2b66bebbea1dea8f340e5078589ea0c166b` |
| `c2-p7-acceptance-pg.spec.ts` | `29cf18661a0d65f29a6f90a56759a44859cf77964e0ca46296514f8e2c352dd8` |
| `c2-p7-emergency-reduction-candidate-pg.spec.ts` | `234542431ec6a9f0ffbafd48e09be3075935928ea1d0a924f1db3a4549af9276` |

Prior receipts are historical when any named or transitive file differs. The
final candidate still needs dependency review, full typecheck, normal hook,
representative migration/restore, real authority/source and connected tests.
No frontend contract or field changed.
