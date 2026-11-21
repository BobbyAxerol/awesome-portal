# P7 current working-source retake — 2026-11-05

**SOURCE ONLY; NOT AN AUTHORIZED P7, CONNECTED A2 OR RESTORE CUTOVER.** This
retake addresses the changed P7 test/source pins identified by
[qualification impact](CORE_C2_QUALIFICATION_IMPACT_20261105.md), not the
unqualified authority or missing HTTP-delivery fence.

## Results

- The grouped review/intent/registration/AppModule/HTTP/issuer unit command
  ran eight named spec files: **60 PASS, 3 SKIP** in seven passing files and
  one skipped file. The skipped file requires independently pinned public B1.
- The same skipped codec file was then run using the staged public B1 whose
  SHA-256 independently matched
  `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`:
  **3/3 PASS**. Its Ed25519 signing key and owner/session are synthetic;
  the B1 bytes are genuine public input, not evidence of accepted authority.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **5/5 PASS** on a
  disposable PostgreSQL cell, including same-original recovery after lost
  response and a real local HTTP/session/CSRF path with synthetic identities.
  A read-only check for matching P7 test-node containers was empty afterward.
- `git diff --check`: exit 0 for tracked diff; this does not validate untracked
  source or docs. Filesystem had 274 GiB available and was 56% used.

The grouped command was `npm test --` followed by `test/c2-human-issuer-composition.spec.ts`,
`test/c2-p7-app-module.spec.ts`, `test/c2-p7-registration-writer-candidate.spec.ts`,
`test/c2-p7-review-candidate-codec.spec.ts`, `test/c2-p7-review-candidate-composition.spec.ts`,
`test/c2-p7-owner-intent-candidate.spec.ts`, `test/c2-p7-review-candidate.spec.ts`,
and `test/c2-p7-review-candidate-http.spec.ts`. It did not run the PG test.

## Current source pins

| File | SHA-256 |
| --- | --- |
| `c2-p7-review-candidate.service.ts` | `e1ded483f0153d9fda059f231ec88d07ed96b0ca13681dd176351be6e5ed822f` |
| `c2-p7-owner-intent-candidate.ts` | `eee7acb1e9b28dbcff2e8bf1ff9f81f2aef113c9026663ecd69153d64808f133` |
| `c2-p7-registration-writer-candidate.ts` | `6eb9f6d4a1d5c2789934638ea5aaf3688b2a5b6c7bb56214379f6c0f292bb9cd` |
| `c2-human-issuer-composition.ts` | `2c9cb0456e271e864feabbedc72bd435fcadbab0aff86fb4cf8b290c043cc7dc` |
| `c2-p7-review-candidate.spec.ts` | `18058689ca2ab2d91722cee97c30f7d23d41490dac18e632ac6129d143782e3d` |
| `c2-p7-review-candidate-codec.spec.ts` | `a1729bc7f338de9707e225338d162042d2885c0ed1d995f2bc1c9e37b4ebcf4e` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `15360917e6e3ba15095730a149bad9cff79dd3aa694ecc92a289001179b516cf` |

These are selected file hashes, not an exhaustive dependency manifest or a
runtime/image pin. Reuse on a later candidate requires a complete impact check.
No source, runtime, private key, shared DB, UI, grant, command or Git remote was
changed by these test runs.

Full Control API `npm run typecheck` has **not** passed: its first bounded
1,536 MiB attempt hit JavaScript heap OOM (exit 134), and its second 3,072 MiB
attempt timed out after 300 seconds (exit 124) before completing the first
compiler. The second cross-loop compiler was therefore not run. Normal hook,
real P7, issuer-to-HTTP custody, Edge/TS qualification, independent restore
barrier and final candidate integration remain open. No frontend action or
source availability follows from this retake.
