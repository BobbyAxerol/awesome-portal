# C2 delivery — durable pre-egress claim candidate

**UNMOUNTED TEST-ONLY CANDIDATE, NOT A COMPLETE RUNTIME FENCE OR EDGE ACK.**
`docs/research-loop-plan@2faa8968fddb` plus shared uncommitted WIP. This
follows the [process-loss counterexample](CORE_C2_DELIVERY_PROCESS_LOSS_COUNTEREXAMPLE_20261106.md),
whose original working-file pins are superseded by the pins below.

## Change and scope

The disposable HTTP helper now commits `RESERVED → SENDING` before writing
bytes. It then begins a separate transaction and calls `HOLD`, which rechecks
current scope/lease and holds the existing authority lock through HTTP finish.
The sending claim is bound to the PostgreSQL backend PID and a random
session-only value whose SHA-256 is stored with the claim. A different backend
or session value cannot take over the claim; the test helper destroys its DB
connection after a reserved attempt instead of returning it to the pool.

In the process-kill test, the loopback client received the complete synthetic
payload; the child was killed before its `HOLD` transaction committed. The
durable row and events still showed `SENDING`, not `RESERVED`. A separate
restricted connection could neither start `SENDING` again nor `HOLD` that
claim. Reconciliation to `UNKNOWN` kept the same original and zero ACKs. A
separate race test commits a claim, revokes the P7 intent before `HOLD`, and
observes `HOLD` refused and the original retained as `UNKNOWN`. The existing
in-flight lock/revoke test still runs.

These facts **do not** establish a production-grade or independently enforced
pre-egress protocol. The SQL function cannot force the caller to commit
`SENDING` before transmitting; a different or miswired caller could invoke it
inside a transaction and reproduce the old failure. The random session value,
connection-pool/session affinity, secret/log handling, same-process misuse,
database restart/PID reuse, old-holder and restore fencing, privileges, actual
owner/field authority, production HTTP writer and Edge terminal/ACK still
need design and qualification. The candidate procedure and HTTP helper are
explicitly disposable-only and remain unmounted. No new original, real ACK,
Edge acceptance, runtime installation, Live or command activation is claimed.
The added columns are in candidate creation SQL; an additive upgrade for an
already installed candidate is **not** supplied by this test.

## Tests and cleanup

- Disposable PostgreSQL/HTTP `c2-delivery-procedure`: final **5/5 PASS**,
  including real child-process kill and revoke-before-HOLD. First attempt was
  **2/5**, not a pass: a restricted security-definer role could not read its
  session's `pg_stat_activity.backend_start`; session-bound randomness
  replaced that proposal without granting statistics access. The intermediate
  5/5 passed before the extra revoke-before-HOLD assertion; final 5/5 includes it.
- Disposable obligation/negative suite `c2-delivery`: **5/5 PASS** after
  updating its direct-DML test fixture to supply the new sender binding.
- Two-PostgreSQL P7 `owner-intent`: **9/9 PASS** on these SQL/helper sources;
  its test-only source is unchanged by the subsequent extra test assertion.
- Historical preview backup clone rehearsal: **2/2 PASS** with selected
  migration/ACL/row-preservation coverage. This does not test an additive
  upgrade of an existing delivery-candidate table, operational rollback or
  independent V2 restore.
- Focused strict helper `tsc --noEmit`, `node --check` and tracked
  `git diff --check`: exit 0; no test-inclusive typecheck or normal hook.
  Untracked files are not covered by `git diff --check`.
- Tests used bounded disposable cells; configured limits are in the scripts,
  actual resource peaks were **not measured**. Exact container/network name
  checks after completion found none for these cells. The clone script removes
  its anonymous volume with the test container; its volume identifier was not
  independently captured. Existing preview/runtime/DB were not changed.

## Source pins

| WIP path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-delivery-obligation-candidate.sql` | `76df2d04fe7873af934d4fd3faa7689e82aa88bf3ae3bc500f554b5c85c6e258` |
| `apps/control-api/src/execution-v2/c2-delivery-procedure-acl-candidate.sql` | `2eaa4ac38c97024a29bbc84f2f69e2d1ff243f795c6ef4b677cbed5fb5ec7020` |
| `apps/control-api/src/execution-v2/c2-p7-http-delivery-candidate.ts` | `b81cf0cc703f029d9c499300aadcf2d752b555898a2920caccc39c1879cc64db` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `04bffcc41e70804af3c40f2f951170fe002bad556528453e645a8a2cf4fab125` |
| `apps/control-api/test/c2-delivery-obligation-pg.spec.ts` | `47a3f360dd9583a7f57328694cc441b34e80c1cd5c190aef498c09c583e61280` |
| `apps/control-api/test/fixtures/c2-delivery-kill-child.cjs` | `ce6a5969dccc2a816ee3ab642768b3ef816b053e6bf4a44813efe07dfccf80f6` |

Next Core action: turn the pre-egress rule into an enforceable, reviewed
runtime boundary with qualified source/field authority and independent restore
fencing; cover crash-before-commit, connection loss, commit uncertainty and
revocation under that real composition. Coordinate genuine same-original
terminal and ACK through Edge separately. Claude has no new frontend contract
or action in this slice. Rollback is to keep the candidate unmounted and the
V2 restore guard fail-closed.
