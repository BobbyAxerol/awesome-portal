# Financial parent locator — encrypted candidate, not runtime authority

**SOURCE/TEST ONLY; NOT INSTALLED.** Branch `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` plus shared WIP. This does not
close ELP2-05/10/11, authorize a recipient or perform an Edge ACK.

## Change

Previously the separate-process recovery test handed the private parent
context and lease through IPC, and the Core authority could not find its
locator after losing that memory. The unmounted candidate now:

1. Accepts a caller-chosen stable UUID before ISSUE, and stores an AES-256-GCM
   envelope for the private context in a separate candidate table. AAD binds
   the UUID, context digest, captured actor/selection digest, expiry and key
   ID. Plaintext context and assertion are not stored in the table.
2. Bounds retained records, serializes admission on the limits row and refuses
   updates/deletes/truncation in the candidate schema. An exact same-ref retry
   reopens and compares the retained envelope; changed context, principal,
   selection, key or expiry cannot be rebound. Expired rows are not deleted.
3. Adds a locator-only `locateBoundDelivery` to the unmounted inner candidate,
   using the exact actor, request and encrypted parent to find the existing
   original. Actual resume still independently checks P7/session/custody.
   A stored parent with no bound ISSUE cannot manufacture a lease.

The caller currently must enforce save-before-ISSUE and retain the stable
operation UUID. The test does this explicitly; no runtime composition is
wired to require it. Neither the encrypted locator nor possession of its UUID
is an owner grant, authorization to issue, proof of physical quiescence,
completion, source terminal or Edge recipient ACK.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**, exit
  0, using two disposable PostgreSQL clusters. The synthetic child saves the
  encrypted parent before ISSUE and is killed with `SIGKILL`; after confirmed
  death the test parent, which chose the operation UUID in advance, loads the
  parent and derives the existing lease without receiving context, lease or
  bearer over IPC. It recovers the same assertion digest, refuses a successor
  without completion and observes exactly one matching lease.
- The same test refuses wrong actor/selection, wrong key, modified ciphertext,
  update/delete, different request, changed context/expiry on same-ref retry,
  and locating a saved parent that has no ISSUE. Exact same-ref save retry
  succeeds. The direct ciphertext-tamper check uses a synthetic DB response;
  the update/delete trigger checks use the disposable PostgreSQL database.
- The earlier version of this same slice also passed 9/9 before adding the
  caller-chosen UUID and ambiguous-save retry. Only the final run supports the
  final hashes below. Financial + command unit suites **145/145 PASS**, exit 0;
  strict focused source typecheck, child syntax and `git diff --check` pass.
  Counts overlap and do not replace a full integration gate.

| Working path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-parent-candidate.ts` | `41294c45c64efa139cac1e9097dbf0d87f5c5cb9bcecead3d1b26c4093edd981` |
| `apps/control-api/src/execution-v2/c2-financial-parent-candidate.sql` | `f0b7da48865ccf1e67a8fb447a7e35d70f1eb4d08889b0ebdb3039d8784e8db8` |
| `apps/control-api/src/execution-v2/c2-financial-durable-inner-candidate.ts` | `259f84ce0aa561fc3056a8ceea275b5b89ef1d6b14415243935c22719ea96442` |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `21182f5963b8d97445a7982dc319b30e6f611dbbd06381ffc5813945302ba9b1` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `2e6343dd29ca27eb5fd6a0bfe966b5c8430957879a8233d8c20174a91bb1313c` |
| `apps/control-api/test/fixtures/c2-status-p7-restart-child.cjs` | `5506f926180572030469e9295babe45ac2776acc7a417c672827bee8c87a689b` |

These hashes are local working files, not a commit, image or applied schema.
The test script removed its containers and network; read-only Docker inventory
found no matching resources. Peak resource use was not measured. No UI,
production/dev/main, runtime, real grant, credential or Edge source changed.

## Still required

Qualify actual independently custodied key/store and DB role/DDL/retention;
persist the operation ref in the real server workflow; wire save-before-ISSUE
and HTTP custody under the same trusted composition; fence a still-live old
holder and rollback; reconcile source terminal and recipient ACK; recover the
full parent sequence and perform a genuine restore. The test coordinator holding
the operation ref is not proof that the actual coordinator survives a crash.
Until those gates and Edge authority are real, keep this candidate unmounted
and retain the existing V2 restore refusal. No frontend handoff/action in this
slice. Rollback is to leave candidate code and schema unmounted.
