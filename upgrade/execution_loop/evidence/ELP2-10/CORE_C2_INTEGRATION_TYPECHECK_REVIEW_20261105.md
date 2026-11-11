# C2 candidate integration review and typecheck — 2026-11-05

**INCOMPLETE.** Checkout `docs/research-loop-plan` committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144` had shared tracked and untracked
WIP. This is a read-only review and a non-emitting compiler run, not a final
candidate, normal hook, installed image, P7 qualification or A2 acceptance.

## Review

- With a P7 review configuration reference present, `main.ts` calls
  `assertC2P7ReviewSchemaCommissioned()` before constructing the review
  dependency. The present implementation always refuses startup. It must not
  be replaced by a permissive check: an independently qualified P7 installation,
  role/ACL and owner authority are still required.
- `prepareC2IssuerPublicAndReverse` prepares public metadata and a guarded
  reverse transport, but `bind_custodied_issuer` intentionally refuses issue
  and resume with `C2_P7_AUTHORITY_NOT_COMMISSIONED`. The isolated
  [custody-before-return change](CORE_C2_ISSUER_INTERNAL_CUSTODY_20261105.md)
  does not qualify this composition or permit removing the fence.
- Current tracked changes include app bootstrap, source/transport and the
  legacy DR guard; untracked WIP includes C2 source, tests, scripts and
  evidence. An integration review must include both categories and ownership;
  neither `git diff` alone nor a passing narrow test proves the entire tree.

## Actual check and scope

`timeout 240s env NODE_OPTIONS=--max-old-space-size=3072 npm run typecheck`
in `apps/control-api` exited **124** with no diagnostics at the time limit.
The first `tsc --noEmit` had not completed, so the subsequent cross-loop
compiler was not demonstrated. This is **not PASS**, not a claim that the code
fails typechecking, and not a complete test of the candidate. An observation at
194 seconds showed the compiler still running, about 2.25 GiB RSS and active
CPU. Do not rerun it immediately against changing WIP merely to obtain a green
status; schedule an appropriately sized, measured run on the reviewed final
candidate and retain its exit status and input manifest. No full hook ran.

The following hashes locate key reviewed files only, not the whole mutable
tree, dependencies, image or database:

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/app.module.ts` | `ab6160fdd6dcdfbd36fe52b215dd6af95325620a5b11ec7b3719003ae51b985e` |
| `apps/control-api/src/main.ts` | `efeb1554cbe3b163041c80c74998b7b3af37e53deee7dea2741f6313bbdd2643` |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `33d736b0a60077abab03ebcb44396d96d0b60f0bbecd4619d9009e8a71a2f9fe` |
| `apps/control-api/src/execution-v2/c2-human-issuer-composition.ts` | `86f25464a31fa86bceb656b85ef96f6baa147fdc4d1d17028f03339e7b78a4e7` |
| `apps/control-api/src/execution-v2/c2-p7-review-runtime.ts` | `4497b2b06c20aaae3e30f5f6804dc3d4a00fe6b05d5d28c5004bab74e5290e73` |

Edge's public coordination status was read without changing HK runtime: its
latest recorded TS response confirms static structure, not full A2. B2 remains
unsigned. Core should continue independent P7 owner/writer and V2 recovery
work; genuine source/ACK, G2 and connected browser acceptance remain open.
No frontend contract or consumer action was added. No test containers or data
were created by this non-emitting compiler run; no broad cleanup was performed.
