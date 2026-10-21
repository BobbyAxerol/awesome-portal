# Core009 R3 — contract validator review, 2026-10-21

Status: **SOURCE_ONLY / REVIEW_RETURN**, not installed and not an R3 PASS.

## Observation and ownership

- PM's `pm-core009-final-r3-1037` reported 1146 passing contracts and one
  20-second timeout in `packages/contracts/test/execution-positive-parent.spec.ts`
  at 10:43:23 UTC. Build watcher correctly returned `NOT_BUILT_R3_NOT_PASS`.
- The current PM-owned retry is `pm-core009-owned-r3-1052`; Core does not start a
  duplicate hook, edit its frozen inputs, or manufacture a successful receipt.
- Source review found the test's `validate(name, value)` compiled a fresh
  anonymous `$ref` schema on every assertion. The same canonical parent graph
  was compiled repeatedly. Cache the compiled validator per definition instead;
  retain every assertion, schema, timeout and runtime parser unchanged.

## Prepared candidate (not copied into the frozen PM checkout)

- Worktree: `/home/bobby/portal-contract-elp210`
- Branch/base: `chore/elp210-served-contracts` / `90f8464314d4d5d36f17f0b4a15e1ba43a722aa1`
- Changed file: `packages/contracts/test/execution-positive-parent.spec.ts`.
- Candidate SHA-256 before publication: `e20bfb2f448d186f6b46b8c7cea046e8f70e7dd1cb18eeb200f82e63727f6f96`.
- Diff: replace repeated `ajv.compile(...)` with one `Map<string, ValidateFunction>`
  lookup keyed by canonical definition name; compile only on first use.
- Initial local attempt could not load `zod` from the old shared contracts
  dependency tree. It executed zero tests in this file; this is **NOT_RUN**, not
  evidence of a passing fix. An isolated dependency tree is being prepared.

## Owner action

Do not interrupt a valid current R3 solely for this source-only review. If the
retry fails at this same compile hotspot, return its actual result, then apply
and test the small cache repair in the next owned source freeze. If it passes,
reuse that PASS for the unchanged Core runtime; do not rerun the full hook just
to adopt this test-only optimization. Core will publish the focused result and
final commit separately. This return grants no installation, new attempt,
credential, ACK, window extension or traffic authority.
