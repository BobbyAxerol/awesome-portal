# C2 delivery — same-transaction claim fence candidate

**DISPOSABLE TEST CANDIDATE ONLY; NOT INSTALLED OR CONNECTED.**
Checkout `docs/research-loop-plan@2faa8968fddb` plus uncommitted WIP.
This supersedes the SQL/test pins in
[durable claim candidate](CORE_C2_DELIVERY_DURABLE_CLAIM_CANDIDATE_20261106.md).

## Change and evidence

The test-only restricted procedure now records PostgreSQL's top-level `xid8`
with the backend/session-bound SENDING claim. `HOLD` locks the exact claim,
checks the same backend/session binding and rejects a claim created in the
current top-level transaction with `C2_DELIVERY_CLAIM_NOT_COMMITTED`. A claim
from another uncommitted transaction is not visible under the required READ
COMMITTED isolation. The claim transaction ID is immutable once set.

The focused test explicitly issues SENDING then HOLD in the same transaction,
including a SAVEPOINT; HOLD is refused. After committing the claim, the
existing HTTP path works; revocation before HOLD denies sending. The child
process loss case still leaves the committed SENDING claim after complete
loopback HTTP delivery, refuses a new sender, and preserves zero ACKs until
same-original reconciliation. The local original, human, source and payload are
synthetic. No Edge message, production credential or real financial data was
used.

**Limit:** this prevents a caller from obtaining this procedure's HOLD for its
own uncommitted claim; it cannot prevent unrelated or unqualified code from
writing directly to a socket without calling HOLD. Runtime composition must
make the only egress path depend on the qualified claim and actual source/field
authority. Session-token secrecy/logging, least-privilege production roles,
connection-pool/session affinity, old-holder and restore fencing, source
terminal and genuine Edge ACK remain unqualified. Schema creation was changed;
there is no tested additive upgrade for a previously installed delivery table.
Do not mount this path or lift the V2 restore guard on these tests alone.

## Verification and cleanup

- Disposable PostgreSQL/HTTP delivery procedure: **5/5 PASS**, covering
  the same-transaction/SAVEPOINT negative, committed path, process kill and
  revoke-before-HOLD.
- Disposable obligation suite: **5/5 PASS**. Its direct-DML test fixture was
  updated to include the claim transaction ID; this grants no runtime DML.
- Two-PostgreSQL P7 owner-intent integration: **9/9 PASS**. A SQL comment was
  clarified while the test cell was active; executable SQL was unchanged.
- Historical preview-backup clone rehearsal: **2/2 PASS** for the selected
  candidate installation and preservation checks, not operational rollback or
  upgrade of a pre-existing delivery table.
- Tracked `git diff --check`: exit 0. The helper's focused strict typecheck
  passed in the previous receipt and its TypeScript source is unchanged; no
  test-inclusive typecheck or full normal hook was run in this slice.
- Script-created containers/networks were absent from read-only name checks
  after completion. Clone cleanup removes its attached anonymous volume; its
  identifier was not independently recorded. Actual resource peaks were not
  measured. No shared runtime, DB, Edge, frontend or credentials were changed.

## Current WIP pins

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-delivery-obligation-candidate.sql` | `98fc2bd2f7b8781bf697782e079b609ba49528eb2c1e9ffc70f3d20432a40777` |
| `apps/control-api/src/execution-v2/c2-delivery-procedure-acl-candidate.sql` | `afc6f6ab5845963f4c24f0091aeeb47170f04dc18fd1a087b00064284c8eb2b7` |
| `apps/control-api/src/execution-v2/c2-p7-http-delivery-candidate.ts` | `b81cf0cc703f029d9c499300aadcf2d752b555898a2920caccc39c1879cc64db` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `e4e74da6998091338d5e785f7f60b6925cc839ac2c604a131c7d6f7210a162cd` |
| `apps/control-api/test/c2-delivery-obligation-pg.spec.ts` | `f496f269727ab364075345491de5f12b4af77f5c27c2b101894d4716d19b4f90` |

Next Core work is runtime-only-egress composition and independent authority /
restore qualification, plus genuine Edge original/ACK and A2 commissioning.
No frontend contract or Claude action in this slice. Roll back by leaving the
candidate unmounted and retaining the fail-closed restore guard.
