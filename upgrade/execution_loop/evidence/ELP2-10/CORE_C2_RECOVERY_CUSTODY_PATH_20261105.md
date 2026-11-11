# C2 recovery custody path — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED; NOT A RESTORE CUTOVER.** Candidate on
`docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`
plus shared uncommitted WIP. No runtime, credentials, database, grants or
production configuration were changed.

`CoreRestoreQuiescence.reconcileOriginal` previously called the legacy source
resolver directly, bypassing the independent C2 proof journal. For an original
with a C2 assertion digest it now requires a matching, explicitly composed
`C2CustodiedTerminalCandidate`: the signed source UNKNOWN/terminal is retained
before Core records the outcome. Missing or mismatched composition fails closed.
Malformed or absent binding values also fail; legacy rows with an explicit null
digest keep the legacy path and are not thereby qualified as C2 evidence.

## Tests

- `scripts/test-elp2-independent-custody-pg.sh`: exit 0, **4/4**, two
  disposable PostgreSQL clusters and test-only mTLS. An entered C2 original
  is refused by the legacy-only recovery path after drain. Another entered
  original recovers authenticated UNKNOWN through custody, and replay of the
  exact terminal is journal-idempotent. This does not prove a source ACK or
  complete census. The disposable cell was cleaned by the runner.
- `npm test -- test/restore-core-quiescence.spec.ts`: exit 0, **5/5**. Its
  fixture was brought up to date with the pinned reverse-source trust expected
  by the current resolver. Focused strict TypeScript check of the changed
  source and imports exited 0. Neither is the final integration hook.

| Input | SHA-256 |
| --- | --- |
| `restore-core-quiescence.ts` | `8eb8b3f8a982bdf08833248083354495cf2944a5e036a5406cc18d4a75bb9c77` |
| `restore-core-quiescence.spec.ts` | `f80b2b85741c3669f25238943476f9053d20efd776f70848fcc68c6e1e483f9b` |
| `restore-independent-custody-candidate-pg.spec.ts` | `c2896367c1fba6b288e9b7bbc360da4a277941f870750c259a8937dfd274c9ed` |

The test hash supersedes the corresponding hash in
`CORE_C2_CUSTODY_PREFLIGHT_RACE_20261105.md`.

## Remaining gates

The code is unmounted. It is not an independently qualified checkpoint, an
old-holder/HTTP fence, post-snapshot terminal and ACK census, or cutover
permission. Production schema/ACL integrity and immutable original bindings
must be qualified, including legacy and mixed-generation originals. Genuine
P7 acceptance, source trust/listener, connected A2, final integration and normal
hook remain open. B2 stays unsigned until A2 acceptance and `C2_SEALED`.
