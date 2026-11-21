# P7 / STATUS candidate focused integration retake — 2026-11-05

**SOURCE/TEST ONLY; NOT FINAL INTEGRATION OR COMMISSIONING.** Base
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`, plus
shared uncommitted WIP. This is a test alignment and a bounded current-source
retake, not an installed schema, image, Edge gateway, owner approval or A2.

## Finding and correction

An eleven-suite focused run found that three direct-controller tests still
expected the older unsigned `confirm`, `resume` and `resume-by-key` routes to
call the review writer. The current candidate deliberately validates their
inputs and returns `C2_P7_OWNER_ATTESTATION_REQUIRED` instead. Changing the
controller to satisfy those tests would reintroduce the unsigned bypass.

Updated those tests to assert 503 and **no writer call** after valid input,
while preserving their origin, CSRF, idempotency and malformed-input negatives.
The no-secret-reflection check now exercises the permitted preview error path;
the emergency-reduction test still checks its independent no-idempotency path.
Service-level tests remain separate and are not HTTP authorization. The
signed-owner candidate and issuer remain unmounted/uncommissioned.

## Actual runs

- Initial selected run: **142 passed, 3 failed, 3 skipped**, eleven files;
  the three failures were the stale expectations above. No part of this run
  is represented as an all-pass result.
- After correction, the same eleven selected P7 auth, proof, controller,
  composition, runtime, app wiring, STATUS assertion and checkpoint suites
  passed **148/148**. The three public-B1 codec cases previously skipped ran
  with the exact pinned public B1 input (`409542f4…`) and synthetic source
  signing keys. No live owner/session or Edge response was used.
- `git diff --check` passed. This was not project-wide typecheck, a normal
  hook, an independently authenticated owner, browser acceptance, Edge ACK,
  migration, restore, or real source qualification. No disposable container
  or external service was created by this selected local run. Resource peaks
  were not measured; Vitest used one worker.

| Selected input | SHA-256 |
| --- | --- |
| `test/c2-p7-review-candidate.spec.ts` | `f720d014a2270e755c8b6b31a33527903933d9e3fb587f3e03bd9062c550348e` |
| `src/execution-v2/c2-p7-review-candidate.controller.ts` | `8085d6f00c58c3eb6f3d5e5b061e79faaad9f4fe84ca208f18f574a362aa759a` |
| `src/execution-v2/c2-p7-owner-witness-custody-candidate.ts` | `7e8031832ffe2cd67b5d9f3c0f0f95004d12665e91b03b8f51cafc7602920982` |

## Follow-through

The remaining owner-auth provider, signer and installation role boundary are
not commissioned; the issuer and P7 bootstrap remain fail-closed. Full
candidate review, full compiler/hook, recovery V2 fences/restore and actual
connected acceptance remain required. No contract or frontend action changed;
Claude can continue fixture work without interpreting these tests as live
evidence. No runtime or UI changes were made. Rollback is to retain the
current unmounted fail-closed configuration, not to reopen unsigned routes.

## Financial / Approval / STATUS selected retake

The subsequent bounded run selected 15 files: `binding-financial-batch`,
`approval-evidence` and its two HTTP suites, `financial-source-assertion`
and its transport, bootstrap, commissioning, composition, recovery and
runtime suites, and `command-status` bootstrap/composition/runtime plus
`edge-command-status-transport`. All names are `test/*.spec.ts`.

- The first, sandboxed run was **369 passed / 75 failed**. The financial and
  STATUS transport listeners could not bind `127.0.0.1` (`listen EPERM`);
  one dependent composition case reported its typed unavailable error. This
  run is not a pass and does not by itself prove each failure's root cause.
- The same selection rerun with authorized loopback access was **444/444
  passed**, 15/15 files, one worker. Its endpoints and credentials were
  test-only; it did not contact Edge or establish real financial/Approval
  authority. No peak resources measured; tests own and close their local
  listeners. Full compiler, normal hook and connected/browser acceptance remain
  open. A repeat must also check every transitive source, test, fixture and
  configuration pin, not only the representative hashes below.

| Representative current input | SHA-256 |
| --- | --- |
| `financial-source-composition.ts` | `179831625c5df7b5638ede25933c8c3636de23a6f5d9a7275f0e3dcb4c906b7c` |
| `financial-source-assertion-transport.ts` | `7f9270c45e937d9fae2698fb6243da7ef001f345544e395a4c65d157091e4238` |
| `command-status-preparations.ts` | `86da77c528fc60ac17888c59378c5735d9e1c2c00333ac64d8fd75c64be287ee` |
| `binding-financial-batch.ts` | `d4a34f8f727c7d47b1515a40e07100516b86f86f54eb9277b694e73f34830204` |
| `approval-evidence.service.ts` | `734d220459b4aafcfcd2a966f622669ebd569dffa5a135ff3085917e343152f9` |
| `edge-command-status-transport.spec.ts` | `420317d4c6bd93e4779362b89adbae8eafd2519156d6d0bb6dd430ef2a3fa105` |
