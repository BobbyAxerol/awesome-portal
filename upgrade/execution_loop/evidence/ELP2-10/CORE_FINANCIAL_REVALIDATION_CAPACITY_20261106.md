# Financial authority — cached-retry revalidation capacity

**Source WIP only; no runtime installation or real Edge/source acceptance.**
Baseline: `docs/research-loop-plan@2faa8968fddb` plus the shared uncommitted
worktree. This change does not alter a public contract or frontend.

## Finding and repair

Every cached financial assertion retry rechecks the current actor and lease,
but the revalidation promise was not included in the authority's shared
16-operation limit or its pending/context accounting. A stalled dependency
could therefore accumulate concurrent checks outside that bound and the
authority snapshot could report zero pending and discard the retired context
while checks were still running. Existing transport/composition in-flight
accounting remains an additional guard; no real exhaustion or data exposure
was observed.

Revalidation now reserves the same bounded pending slot as issuance and
terminal checks, retains the context until the real promise settles, releases
the slot on success or error, and still rechecks the context before returning
the assertion. A saturated retry is refused with the existing capacity code;
it does not issue a new lease. Shutdown still retires immediately, and a
check finishing afterwards cannot return an assertion.

## Evidence

- The new synthetic concurrent-retry regression first produced **1 FAIL /
  49 PASS**: sixteen held revalidations were reported as zero pending.
- The initial three-file sandbox run produced **94 PASS / 52 FAIL**: 50
  loopback listener tests and one composition listener were denied `EPERM`;
  the composition test also expected the former zero-pending count. The
  expectation was corrected to one while revalidation is held.
- With permitted loopback, these three files passed **146/146**, exit 0:
  `financial-source-assertion.spec.ts`,
  `financial-source-assertion-transport.spec.ts`, and
  `financial-source-composition.spec.ts`. This includes synthetic authority,
  local TLS transport and shutdown; it is not real-source qualification.
- Strict source-only `tsc --noEmit` for the changed authority and its imports
  exited 0 with a 768 MiB Node old-space cap. This is not a test-inclusive
  project typecheck or the final normal hook.
- `git diff --check` on the touched code and tests passed. Resource peaks were
  not measured. No database, container, secret, service or network outside
  loopback was changed by these tests.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `bc08ad2db06441da46b8eb5765350ea59e6d4ca838c8ed0d6b12cfba8e4f87eb` |
| `apps/control-api/test/financial-source-assertion.spec.ts` | `9f5cca91be29e7ccea2d579974c2f6f78a4ead86a72cead3d640f5360f4b0d2d` |
| `apps/control-api/test/financial-source-composition.spec.ts` | `1ad22a5585437e9ff9400c06b0d0d3a07d3cd6a20643591bfb9b0623d8dc955a` |
| `apps/control-api/test/financial-source-assertion-transport.spec.ts` | `a22b357454a1a3af1ee7ef419ce4bb7353166545c7ef1041074811465750d8a1` |

## Remaining

The existing financial composition explicitly refuses a C2 candidate: its
in-memory context does not establish durable context/original/lease binding,
independent owner authority or C2 HTTP custody. Do not remove that fence to
use this repair. Financial carrier/proof, COMMIT → APPLIED → genuine Edge ACK,
P7/A2, V2 recovery, real connected tests and full integration/hook remain open.
Review shared WIP before freeze. No frontend request is introduced. Rollback
is to leave the composition unmounted, not to weaken the C2 refusal.
