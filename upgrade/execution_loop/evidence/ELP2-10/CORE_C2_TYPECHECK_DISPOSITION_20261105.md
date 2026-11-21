# C2 candidate typecheck disposition — 2026-11-05

Scope: local, unmounted Core candidate in `/home/bobby/portal-research`, branch
`docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`,
with the existing uncommitted C2 worktree changes. This is not an image,
runtime, connected acceptance, or normal-hook receipt.

## Result

- A focused `tsc --noEmit --strict --skipLibCheck` invocation covering the ten
  P7 review, P5, issuer and recovery source roots, plus their transitive
  dependencies, exited **134** after Node exhausted its 1,152 MiB old-space
  limit. It did not finish and is **not PASS**. The memory limit was kept within
  the previously approved candidate cell; the limit was not increased.
- A separate `typescript.transpileModule` syntax/emit-diagnostic check for the
  same ten explicitly named roots exited **0**, with zero error diagnostics.
  This is **not semantic typechecking**, does not check transitive imports, and
  is not a replacement for the missing typecheck or normal integration hook.
- After separating the inexpensive leaf modules, two **semantic** checks
  passed independently with `tsc --noEmit --strict --skipLibCheck --target
  ES2022 --module commonjs --moduleResolution node --types node` and a 384 MiB
  Node old-space limit: `c2-p5-revision-outbox.ts` (SHA-256
  `2f68026a4eff8adf801746834e9f6a11f1213a45fcdd1fa56519379fc23bc744`) and
  `restore-inventory.ts` (SHA-256
  `45daec3a1ce2e458f68abe1c1b201d5aac620245aeda221a2e14b0ed6fc8f550`).
  These two checks do not establish semantic correctness of the other roots.
- A second semantic attempt for the other eight roots, explicitly restricting
  ambient types to `node` and the required Fastify cookie declaration, exited
  **134** after exhausting a 1,024 MiB Node old-space limit. It also did not
  finish and is **not PASS**. No further heavy retry was run in this cell; the
  final candidate still needs a properly sized or otherwise redesigned check.
- No core dump was found under the Control API worktree at depth two. No build,
  database, service, or credential was created or changed by these checks.

Source roots: `c2-p7-owner-intent-candidate.ts`,
`c2-p7-emergency-reduction-candidate.ts`, `c2-p7-review-candidate.service.ts`,
`c2-p7-review-candidate.controller.ts`, `c2-p7-review-candidate.composition.ts`,
`c2-p5-revision-outbox.ts`, `c2-human-issuer-composition.ts`,
`current-human-candidate.ts`, `restore-c2-original-recovery.ts`, and
`restore-inventory.ts`, all under `apps/control-api/src/execution-v2/`.

The previously recorded isolated PostgreSQL and mTLS tests retain only their
own stated scope; they do not turn this failed typecheck into PASS. An
appropriately bounded semantic typecheck and the normal hook remain required on
the final integrated candidate. A2, owner acceptance, connected recovery and B2
remain **NOT READY**; no source, listener or authority was commissioned here.
