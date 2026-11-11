# C2 generic reverse listener fence — 2026-11-06

**SOURCE WIP ONLY. NOT a runtime install, P7 approval, real Edge ACK, recovery
barrier, A2 readiness or ELP2-10/11 PASS.** Checkout `docs/research-loop-plan`
at committed HEAD `2faa8968fddb` plus existing shared WIP.

## Finding and change

The generic reverse-listener factory accepted a C2-mode `CurrentHumanCandidate`
and invoked its plain `enter`/`resolve` methods. Those methods have additional
per-lease guards, but the factory did not require the C2 listener that first
retains the authenticated source proof in the independent custody candidate.
That makes an accidental wrong composition possible; no runtime bypass or
actual source ACK was demonstrated.

The generic factory now refuses a genuine C2-mode candidate before creating
its HTTPS server. It calls the captured class method against a constructed
candidate with a private configuration field, and rejects a prototype-only
forgery and an instance method override. The ordinary legacy path continues for
an actual non-C2 candidate. The existing separate C2-custodied listener is
unchanged. Financial composition also rejects the C2 flag before constructing
its legacy listeners, matching the existing STATUS composition refusal.

This is a construction-time integration guard, **not** proof that every socket
or other code path is fenced: the C2 composition and its delivery mechanism
remain unmounted, and an independently controlled authority, old-holder fence,
actual Edge terminal/ACK and restore procedure remain unqualified. No public
contract, frontend, DB, credential, service, or runtime was changed.

## Verification

- `vitest run test/elp210-current-human-transport.spec.ts
  test/financial-source-composition.spec.ts
  test/command-status-composition.spec.ts --maxWorkers=1`: **90/90 PASS**,
  exit 0, with real loopback TLS in test processes and synthetic candidate
  keys/operations. Regression includes real constructed C2 candidate, hidden
  method override, prototype-only forgery and early financial rejection.
- First sandboxed run: **66 PASS / 24 FAIL**; the new assertion incorrectly
  compared the public error message with the internal error code, and loopback
  listeners were denied `EPERM`. The assertion was corrected to inspect
  `code`; the complete three-file retake above ran with the loopback permission.
  The failed run is not counted as additional coverage.
- Strict source-only `tsc --noEmit` for both modified source roots, 768 MiB
  Node old-space: exit 0. Not a test-inclusive project typecheck or normal hook.
- `git diff --check` and `scripts/execution-tracking-test.sh`: exit 0; the
  latter was run after the earlier Edge status update. No database, image,
  container or persistent test resource was created by these focused tests.

| WIP input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-transport.ts` | `e96bb9f65e56272873acf83fe056f60dda2513859b2688c24b9e4b0002a7d97c` |
| `apps/control-api/src/execution-v2/financial-source-composition.ts` | `1584cacf1411d25aea2d8c24083e575261458d9bda67da1a64f3dd5ad80b1ede` |
| `apps/control-api/test/elp210-current-human-transport.spec.ts` | `ea4c8320fbc56ede48aff64e6f702d48d08e617e9128911e3f7100a543637083` |
| `apps/control-api/test/financial-source-composition.spec.ts` | `725896f31a57cf4aff17900691c1890bcff6317416612fed7e31f2ac980e1f25` |

Next: complete C2-only HTTP custody/authority and independent recovery,
review/freeze the complete WIP and run the normal integration gate once on
the frozen candidate. Edge still supplies genuine source/recipient evidence.
There is no frontend contract change or consumer request. Rollback is to leave
C2 disabled; never substitute the generic listener for the C2 listener.
