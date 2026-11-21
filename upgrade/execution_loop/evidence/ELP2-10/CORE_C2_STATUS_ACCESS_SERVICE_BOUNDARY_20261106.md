# STATUS Core access-service assembly boundary — 2026-11-06

**UNMOUNTED CANDIDATE / local WIP.** The P7 STATUS inner-assembly test had
passed a duck-typed object implementing only `usesPool`. That demonstrated
composition of individual components but did not establish that its authority
received an actual Core access-service instance. It also meant the assembly
would accept such an object in place of the intended service.

The candidate now requires the exact `ExecutionAccessService` prototype and
unshadowed `usesPool`, `readContext` and `confirmReadContext` methods both
before and after asynchronous issuer key validation. `usesPool` now compares
the live pool with a module-private constructor-time pool brand, rejecting an
object made with `Object.create` as well as a genuine service whose pool was
reassigned. The P7 cell now assembles with a real `ExecutionAccessService` and
real `AuthService` object, but the trust provider remains unqualified and the
direct adapter test does **not** call actual STATUS preparation.

These checks are not a source qualification or protection from all
in-process compromise or method mutation after assembly. Actual current-human
trust, authenticated principal/workspace, real STATUS preparation, HTTP custody,
Edge terminal/ACK and restart/restore still require their respective tests.
The live shared service, listener and database were not changed.

## Evidence

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  after the final pool-brand change. The disposable two-PG suite rejected
  duck-typed service, forged prototype, changed pool, shadowed read method,
  and an async assembly race. It continued to exercise the existing synthetic
  P7 and adapter paths. The preceding intermediate run was also 9/9 before
  adding the brand. No source or human was commissioned by these tests.
- `npm test -- test/elp2-access-policy.spec.ts
  test/command-status-composition.spec.ts`: **97/97 PASS**, exit 0, 768 MiB
  Node heap limit. Focused strict source TypeScript check: exit 0.
  `git diff --check`: exit 0. Full hook and final integration were not run.
- Test cell aggregate configured limit is 2 CPU / 1.5 GiB; actual peak was not
  measured. Read-only Docker checks found no `elp2-c2-p7-` container or
  network after cleanup. No frontend changes or new consumer fields.

## Working-file pins

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/access.service.ts` | `e25594b5ba410829107ce823ce10102c24f7888ec4f43a3932a3f5231d19ee24` |
| `apps/control-api/src/execution-v2/c2-command-status-inner-candidate.ts` | `fa9339014c166b1630d1b43a4c1277d94bdac957977ddf53e8e4884512d9e5b9` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `52dbffd127f5bcf2bc45407e050928099bdfa5420594d36fad8097ccf7ec36df` |

Next: combine actual preparation and authority with P7 and physical HTTP
custody in a disposable cell; then qualify the real provider and sender/reader
roles. Full A2, genuine Edge ACK, V2 restore, candidate freeze and normal gate
remain OPEN. This source has not been committed or installed.
