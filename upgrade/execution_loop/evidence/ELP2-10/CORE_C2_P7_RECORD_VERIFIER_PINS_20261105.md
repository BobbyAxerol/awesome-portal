# C2 P7 record and verifier binding — 2026-11-05

**SOURCE ONLY; P7 remains uncommissioned and issuance stays fail-closed.**
The current working checkout is `docs/research-loop-plan`, committed base
`2faa8968fddbde59b2e59525e334ba3d83886144`, with existing uncommitted WIP.

## Change

P7 preparation-record composition now keeps its pool, source, verifier,
registration and write path in ECMAScript private fields. The verifier function
is captured once and used for both the first proof check and the locked
registration check. The locked registration candidate likewise captures its
verifier rather than looking up a replaceable object property later.

Negative tests replace public properties and the verifier function after
construction; the preselected verifier and pool still govern validation and
the replaced write function is not called. This protects the specific
composition boundary; it is not a sandbox against arbitrary code execution,
does not prove key provenance and does not qualify a source verifier or record
as owner acceptance/delegation. `RECORDED_NOT_AUTHORIZED` and the hard issuer
fence remain unchanged. No frontend contract or deployed runtime is changed.

## Tests

- Focused unit/composition tests: 4 files, **36/36 PASS**.
- `bash scripts/test-elp2-c2-p7-pg.sh`: **6/6 PASS**, on the final selected
  source, using a disposable bounded PostgreSQL container. The previous PG
  invocation overlapped a source edit and is not the receipt for this result.
- Focused strict TypeScript for the two source files and their two unit tests,
  including decorator and interop flags: exit 0. This is not the complete
  Control API typecheck or normal hook.
- The disposable script cleaned up its own container/network; no production
  data, credential, runtime, image or remote ref was changed.

| Working file | SHA-256 |
| --- | --- |
| `c2-p7-acceptance.ts` | `609bda52418f809e68b3e8fccd86e0708d16db2db57eef4aba6e3a38c6069ff2` |
| `c2-p7-locked-registration-candidate.ts` | `82933da9fe3dbf3f06d0ada87c1135fcd582e622a7f4641a58f75b98a73523b8` |
| `c2-p7-acceptance.spec.ts` | `0df5642d219898580fc713de950c7bfcc78b5b43bfb46fe31d3be87b0c8a23b9` |
| `c2-p7-locked-registration-candidate.spec.ts` | `61cdd0d18caef58130ff9a62cb41f2ad1ab51ad4ad6774ef697d0653f83d0b81` |
| `c2-p7-acceptance-pg.spec.ts` | `29cf18661a0d65f29a6f90a56759a44859cf77964e0ca46296514f8e2c352dd8` |

## Remaining

Qualify the real immutable owner acceptance/delegation and source registration
under the same authority/revocation fence, then integrate the Research issuer
and listener without bypassing that fence. Complete independent recovery,
P8 custody, candidate review, migration/rollback rehearsal and the final
normal hook. A2 is not ready, B2 is not signed, and this result is not an Edge
or TS connected acceptance. Claude has no new frontend binding to consume.
