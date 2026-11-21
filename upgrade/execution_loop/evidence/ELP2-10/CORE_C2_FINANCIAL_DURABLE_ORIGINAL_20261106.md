# C2 financial — durable original correlation candidate

**SOURCE/TEST WIP ONLY; NOT MOUNTED.** On `docs/research-loop-plan@2faa8968fddb`
with shared uncommitted changes. This is not a numbered migration, qualified
source, production role or permission, Edge receipt, runtime activation or a
completed ELP2 phase.

## Change and boundaries

The unmounted candidate prepares an unguessable context whose digest and exact
subject/session, workspace, workload, receiver, binding, request digest and
expiry are retained in a separate candidate table. The existing P7/custodied
issuer optionally locks that exact preparation, inserts the lease, and links the
lease to the preparation in the **same database transaction**. Expiry is
rechecked at binding. A trigger rejects deletion, replacement and a link to a
lease with different subject, session, workspace, workload, request or missing
C2/P7 custody fields. A restarted *helper instance* can locate the linked lease;
the existing issuer must separately revalidate the actual owner, session, P7,
trust and independent candidate custody before it returns the same assertion.
The context is not itself authority. No bearer or context secret is persisted.

After forced custody-head contention, the isolated test observed an existing
pending lease, reconstructed the locator and issuer instances, located and
resumed the same lease, repeated the resume idempotently and observed exactly
one lease and one custodied original. Wrong workspace, changed request, unknown
context, a forged link to a different request and delete all refuse.

**Still open:** this locator is not wired into the actual financial authority or
HTTP delivery; locator lookup and issuer revalidation are separate operations,
not yet a locked end-to-end context fence. The test reconstructs objects in the
same OS process, not a financial process restart. The table has a hard retained
capacity with no automatic deletion; lost prepare responses and safe bounded
retention/cleanup need a qualified protocol. Its DB roles, DDL/ACL, revocation,
cross-process old-holder fencing and independent anti-rollback authority are not
qualified. A database owner or otherwise overprivileged role remains outside
the tested trigger boundary. Genuine source terminal/ACK and Edge binding are
not present. Keep C2 runtime and V2 restore fail-closed.

## Validation and cleanup

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  on two disposable PostgreSQL instances with synthetic source/P7/custody.
  The last retake includes the forged-link and changed-context negatives above.
  An initial invocation failed before running any test because the new test
  reused an existing variable name; it was renamed before both passing runs.
- Financial assertion/transport/composition: **3 files / 154 PASS**, exit 0,
  synthetic/loopback. These results overlap earlier financial receipts.
- Focused strict TypeScript source check for the candidate locator and issuer:
  **exit 0** with 768 MiB Node old-space; not a full-project or test-inclusive
  typecheck, normal hook or build.
- Test scripts removed their ephemeral resources; read-only filtered checks
  found no `elp2-c2-p7` containers or networks. `/home/bobby` had 248 GiB free;
  peak resources were not measured. No persistent runtime/DB or UI changed.

## Direct working-file SHA-256

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-original-candidate.ts` | `3fb34d2df3ffb769fc327ad37cc002764d43b742525f32de044bf0eede555442` |
| `apps/control-api/src/execution-v2/c2-financial-original-candidate.sql` | `263564ecb6c8d2e8d343dc51de5c46622eb4bfd6bcd4936296f80ce21a81ce4f` |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `b67c289f658d1dbe47a65d8d64fe141422ad0b67caf9cce33df210f1789c1148` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `b71ae8c1ec7e5f796f4410b1c01460b8b91941bd71663ff74bec77df1b211a98` |

These are working-file pins, not a frozen candidate/image or transitive hash.
Next: integrate exact correlation with the financial authority and recovery
transaction, enforce role/retention bounds and test process loss; separately
complete P7 owner authority, restore fencing and real Edge terminal/ACK.
No frontend contract changes; Claude has no action for this slice. Rollback is
to leave the candidate unmounted and continue refusing C2 runtime/V2 restore.

## Follow-through — issuer lock and internal recovery composition

The source-only candidate now marks the financial context digest on the lease in
the same ISSUE transaction; a separate candidate trigger refuses marker
mutation. A marked lease cannot be resumed or revalidated through the generic
path without its exact financial context. Resume/revalidation check the exact
context, actor/session, receiver, workspace, workload, request and expiry while
holding the preparation row in the issuer's authority transaction. The new
unmounted recovery composition connects the original store to the existing
P7/custodied issuer and recovers an existing lease, never a replacement.

Two isolated PostgreSQL runs of the changed fence passed **9/9** each; the last
run exercises the new composition after a custody-pending error, generic resume
and revalidation refusals, altered receiver and immutable-marker negatives, and
same-lease idempotent recovery. Four focused issuer/financial test files passed
**171/171** and focused strict source TypeScript passed. An earlier separate
four-file command reported **154 PASS / 110 SKIP**, since its generic PG suite
was not provisioned; the skips are not passes. These results overlap earlier
receipts. Filtered read-only Docker checks found no `elp2-c2-p7` test containers
or networks after cleanup; actual resource peaks were not measured.

The context marker/SQL is a **candidate-only schema change**, not a numbered or
installed migration. It is not yet wired into `FinancialSourceAssertionAuthority`
or its HTTP custody path. The test reconstructs objects, not an OS process;
authority/key custody, role/retention policy, real Edge terminal/ACK,
independent restore fencing and connected qualification remain open. Other
generic C2 requests keep their existing behavior when the candidate marker is
absent. No production/runtime/UI change or phase completion is claimed.

Updated direct working-file hashes, superseding corresponding pins above:

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-original-recovery-candidate.ts` | `49169d05ee2bf4970bbe96ef448c08b60c1940a838b0e399b12c03376d9c297d` |
| `apps/control-api/src/execution-v2/c2-financial-original-candidate.sql` | `a8826b26573466e28762224e3566d4d36e5b2dc9eb94d2fa8a2a4af889dbfd2c` |
| `apps/control-api/src/execution-v2/c2-custodied-issuer-candidate.ts` | `f2c508829fab789e2554e1ba6f8c60bf0a19a9705fe27259a37c80e38c1382ac` |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `c70e3d3564d2a7ef41de24048d8ec0de755f72d23d16a26de2a013ba151c1b6a` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `43546e1eedd0c8eb53179811b1fb5ea137df14e21eda2603f88879e739b9cef8` |

## Follow-through — separate-process candidate reassembly

The disposable two-PG test now forks a separate OS process. With only the
synthetic test input delivered over private IPC, the child reconstructs its own
P7 fence, issuer, financial original store and independent candidate custody;
it locates the persisted context and returns the same lease and assertion digest.
The parent retained its own objects and was not killed, so this demonstrates
separate-process reassembly, **not a crash/old-holder fence or full restart of
`FinancialSourceAssertionAuthority`**. The shared fixture also executes the
previous STATUS child path in the same run. No assertion, test key or context
was printed in logs.

`bash scripts/test-elp2-c2-p7-pg.sh owner-intent` passed **9/9**, exit 0;
`node --check` of the child helper and `git diff --check` passed. The test used
two disposable PG instances and synthetic identity/keys, and its resources were
removed; filtered read-only Docker checks found no matching test containers or
networks. Peak resources were not measured. No real source, permission, Edge
ACK, runtime, migration, browser or final hook was exercised.

| Updated test path | SHA-256 |
| --- | --- |
| `apps/control-api/test/fixtures/c2-status-p7-restart-child.cjs` | `105a2e48cda5a9884679052656b8b9072cdc2b55eeaed8d0e72e62530ddf496f` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `fabcec843d98c440bac1f0a11e6ef6c6beab090c6012bfe8f7143f080645a522` |

Next Core work is still to persist the actual authority's registration and its
multi-delivery/ACK state, connect the candidate without reducing its supported
sequence semantics, and test process loss and retained-context fencing. This
remains independent of, and does not replace, actual source/Edge qualification.

## Follow-through — expired unbound reservation capacity

The statement above that candidate retention has no automatic cleanup is now
superseded **only for expired, never-bound reservations**. Candidate `prepare`
and ISSUE serialize on the same authority row: under that lock, prepare removes
expired rows whose `lease_id` is NULL before enforcing capacity. The trigger
still rejects deleting a live reservation or any linked original; no lease or
custody fact is deleted. This avoids a lost prepare response permanently using
the candidate's bounded slots. Linked-original retention, role/DDL qualification,
and the broader financial multi-delivery/restart work remain open; do not mount
this candidate as a production garbage collector.

The disposable two-PG suite passed **9/9**, including an expired unbound row
blocking a one-slot store before cleanup, refusal to delete a live reservation,
and the existing linked-original and separate-process checks. Focused strict
source typecheck and `git diff --check` passed. Filtered read-only Docker checks
found no matching containers or networks after the test; no material production
or user data was removed. This is not a source, role, Edge ACK or runtime gate.

| Updated direct working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-original-candidate.ts` | `3d886603aafecea7bf7a6bbeeb5940bbea24198325c8720144b931c93845f34e` |
| `apps/control-api/src/execution-v2/c2-financial-original-candidate.sql` | `bbcd8a37136e17c42fe6fefd43581c2b58658fa21b436fac8c9ba63716ee32d1` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `e0594e08796781823d32e9cbd262f978eacd7996185a5e0a1d0db6aa02d75405` |

## Follow-through — idempotent original reservation

The unmounted original store and recovery helper can now re-reserve an
already-held opaque context against the **same exact** actor/session,
workspace, workload, receiver, binding, request and expiry. The authority row
and original are locked; an existing matching reservation is returned before
capacity is applied, and a bound reservation returns its original lease ID.
Changed identity or request is refused. A concurrent exact retry returns the
same unbound row; it does not issue a lease or authenticate the caller. New
reservations retain the bounded expired-unbound cleanup. The helper captures
and verifies the store's original method identity, preserving its candidate
anti-substitution boundary.

This is a durable **per-delivery locator primitive only**. It is not wired into
`FinancialSourceAssertionAuthority`, which still keeps registration, sequence
and ACK in memory. It neither implements multi-delivery restart nor proves an
Edge ACK or current authority. The caller must retain an unguessable context,
authenticate itself, enforce successor/terminal and P7/custody checks, and
never treat possession of the context as a grant. Old-holder fencing, retention
of linked originals and independent restore authority remain open.

- Disposable two-PG P7 suite: **9/9 PASS**, including two concurrent exact
  reservations at one-slot capacity, changed subject/request refusal, and
  lookup of the original lease after an ambiguous custody-pending ISSUE. The
  previously covered separate-process test reconstructs the candidate; it is
  not a crash/restart of the financial authority itself.
- Focused strict source typecheck: final exit **0** with project decorator
  flags and 768 MiB Node old-space. The initial command omitted those flags and
  exited **2** on four decorator diagnostics in imported repositories; it was
  corrected and retaken. This is not a full project build or hook.
- The disposable PG containers and network were checked absent after cleanup;
  no live data or runtime was modified. Actual peak usage was not measured.

| Updated direct working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-original-candidate.ts` | `9d70673f477716547c0c1fe1a2907fa392e144be791def7abe441bea1b258978` |
| `apps/control-api/src/execution-v2/c2-financial-original-recovery-candidate.ts` | `b5ee666a0630a17929ba8d9b22191b37a1e6b84ee95a025a2e8d7d71ce69faaa` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `dd15360190b7bfd31186718e660e1fa8003e0c188eceb998de85b76c0642fb75` |

Next is persistence and authority integration of the registration and complete
multi-delivery/ACK state, including old-process fencing and exact authenticated
terminal settlement. No frontend contract/action. Do not mount this candidate
or enable A2/B2 or V2 restore based on this receipt.

## Follow-through — per-delivery locator in the actual in-memory authority

The `FinancialSourceAssertionAuthority` can now select an explicitly provided
internal adapter implementing all three delivery-aware ISSUE, resume and
revalidation operations; a partial adapter configuration is refused. Its
existing generic adapters retain their old behavior. The new unmounted C2
adapter checks the exact owner, selected scope/request, receiver and binding;
it derives a domain-separated, per-ordinal locator from the authority's
private original context. It calls the durable reservation, then either issues
with that financial original or rejoins its existing lease through the same
P7/custody issuer. Resume/revalidation use a read-only locator lookup, so an
incorrect ordinal cannot create a new reservation. Revalidation includes the
same financial context in the issuer's authority transaction.

The actual authority is exercised in the synthetic two-PG test. An exact retry
and a separately reconstructed adapter find the same lease/assertion, wrong
receiver or ordinal refuses, no extra original is created on revalidation,
and a successor without completion is rejected. This is not a process crash:
the authority's registration and its completed-delivery/ACK state remain in
memory. The adapter does **not** supply terminal-successor proof, so it does
not currently enable a second delivery even after a terminal/ACK. Direct calls
to the internal adapter also lack the authority's sequencing gate. It must not
be mounted or represented as finished multi-delivery recovery. Parent context,
sequence, exact authenticated Edge ACK, real source terminal, old-holder
fencing and independent restore authority all remain unimplemented/open.

- Disposable two-PG suite: **9/9 PASS**, exit 0. This includes real candidate
  objects with synthetic source/key/owner; it is not a real Edge acceptance.
- Financial authority and loopback TLS transport: **116/116 PASS**, exit 0.
  The first sandboxed attempt exited **1** with 50 `listen EPERM` failures;
  it was retaken with authorized loopback access. That earlier output is not a
  product failure or a pass. Focused strict source typecheck passed, exit 0;
  no full build or hook was run.
- The two disposable PGs, Node container and network were checked absent after
  cleanup. No live data, runtime, UI, grant or remote changed. Peak resources
  were not measured.

| Updated direct working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `7e159456630e40162bde7158c6136828e2b1cd005d6e0166b34a8d18e0fdba7c` |
| `apps/control-api/src/execution-v2/c2-financial-durable-inner-candidate.ts` | `05bdc6e5e967c7b7ab0ddb352463b0565370bde5215acfa24160905e87e05c4a` |
| `apps/control-api/src/execution-v2/c2-financial-original-recovery-candidate.ts` | `93949805cc45d4f8100e295c7dcaddd2c59f26e496a82faedc9178091cf34512` |
| `apps/control-api/src/execution-v2/c2-financial-authority-adapter.ts` | `5adb90106e0abda1f6bef50080748bb530488b3961ed2ce9107cf64cf388ee00` |
| `apps/control-api/src/execution-v2/c2-custodied-issuer-candidate.ts` | `9f02e049c84cedd8ad5fbca4936715a38826396c37dfa613e21bd546f57eff37` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `b75ec356be165ccdcad56f48fa176781906073ff806af9f0373b367b91fcb958` |

No frontend contract/action. Next: durable authority registration and per-
delivery/ACK state, with authenticated terminal proof and concurrency/old-
process fencing; then restart tests and real Edge qualification. Rollback is
to leave the candidate unmounted, preserving the existing fail-closed path.

## Follow-through — same-original retained terminal, not an ACK

The unmounted financial candidate now offers a **read-only**
`VERIFIED_NOT_ACK` operation for the exact marked delivery. It checks the
signed assertion against its lease, financial context/receiver/request,
current owner and session, P7 and registration under the Core authority lock;
it then checks the authenticated custody journal's original and retained
signed source terminal, including source trust, attempt and terminal digest.
The terminal event must match the verified retained event, and the journal
head must remain unchanged across the inspection. P7 and the relevant clocks
are checked again after custody I/O. The operation does not write an ACK,
authorize a successor, expose a listener or affect source RESOLVE after revoke.

The actual candidate composition exposes this only as `verifyBoundTerminal`,
not the generic successor predicate. Even after the synthetic signed terminal
verifies, the in-memory financial authority's completion and next delivery
continue to refuse without a qualified terminal/recipient-ACK protocol. This
is intentional: the current operation alone is neither current authority at
the HTTP write nor independently qualified custody, external source readback,
Edge ACK, durable parent sequence or anti-rollback. A simultaneous journal
head change is explicitly rejected in code, but a concurrency test for that
new check was not run; a coordinated rollback remains outside its guarantee.

- Disposable two-PG P7/financial suite after final code: **9/9 PASS**, exit 0.
  It verifies the same signed synthetic original and terminal, refuses before
  terminal and for changed token, owner, sequence and receiver, and proves
  that neither completion nor a successor is enabled. The prior 9/9 run was
  before the final head-consistency check and is not an additional gate.
- Financial and command assertion unit suites after final code: **143/143
  PASS**, exit 0; focused strict source typecheck of the imported durable
  adapter passed at 768 MiB heap. These counts overlap and are not source or
  browser acceptance. The earlier source-plus-large-PG-test typecheck OOM
  remains recorded in the purpose-fence receipt; no full gate ran here.
- The script's disposable PG/Node containers and network were absent on
  read-only inspection. Actual peak resource use was not measured. No
  production/runtime, Edge, grant, private credential or UI changed.

| Direct working path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `b932cc7fc58cce9bddf1497d85ca8ab581abd3a7ee960c42743bf638556bc1cc` |
| `apps/control-api/src/execution-v2/c2-custodied-issuer-candidate.ts` | `bf772392d07740e92a4a09077b89dde7f23b8254e6c234b4cffdb79e1cdb4bae` |
| `apps/control-api/src/execution-v2/c2-financial-original-recovery-candidate.ts` | `b1253d53c4ca8fd8df32d466301f067a21f44ab43a6ab23e09492bafc053cb9a` |
| `apps/control-api/src/execution-v2/c2-financial-durable-inner-candidate.ts` | `c78593d703eee9f62fd51a9dd3e86601e386b2055a36d7452faa4829aacd9832` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `99202a0f0f7b19d1f494da6a1dbdd0d44ac16e6cb484ac5fca3dd79fcc11e03d` |

These are working-file hashes, not an integrated candidate or installed image.
Next: persist authenticated recipient completion and parent sequence with exact
original/terminal correlation, qualify writer/HTTP custody and old-holder
fencing, then test process restart and actual Edge ACK. Owner-auth provenance,
independent anti-rollback, A2 and ELP2-10/11 remain OPEN. No frontend contract
or action; leave the candidate unmounted for rollback.

## Follow-through — bound source lock while custody is stalled

The unmounted `verifyC2FinancialTerminal` previously held the source authority
and session locks while it waited on the independent custody inventory. In the
isolated two-PostgreSQL test, an exclusive custody-table lock caused a competing
session lock to exceed 2.6 seconds. The verifier now opts into a 2-second
PostgreSQL idle-in-transaction limit; if custody stalls, the source transaction
is terminated, the session/authority locks are released and the verifier must
fail rather than return `VERIFIED_NOT_ACK`. The error event is handled while
the callback unwinds; the transaction helper still rejects and discards the
broken connection. Other transaction callers do not opt into this limit.

The final test holds the custody table and observes a competing `FOR UPDATE`
acquire the same session row after the source timeout. It rolls back the
competing lock and confirms that the stalled verifier fails. This is a lock
availability test, **not a committed revoke**: a preceding retake attempted a
direct session update and correctly received `CURRENT_HUMAN_DRAIN_REQUIRED`.
That retake failed 5/9 because the first shared-setup test stopped early; it
is not counted as a pass. The initial pre-fix run also failed 5/9, with the
first failure a statement timeout on the competing session update. The final
retake uses the lock-only assertion and passed **9/9**, exit 0, in two
disposable PostgreSQL clusters. Source-only strict typecheck passed, exit 0;
no test-inclusive typecheck, normal hook, live source or browser gate ran.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `6095f11f0bd2f469538723b88f3423a54b104347b1d4eb07c7b503d1148db4be` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `a5f00d2e951c7c053db72554ca54c398f7b576a2a72922528b761f38d73e3b47` |

The test script removed its disposable containers and network; read-only Docker
inventory found no matching P7 containers or networks. Peak resources were not
measured. No frontend action, runtime install, real grant, source ACK or remote
change. The timeout does not establish external authority, a complete drain or
cross-process fence, durable financial parent sequence/ACK, or V2 recovery.
Rollback is to leave the WIP candidate unmounted. Next backend work remains the
durable parent/sequence/recipient-ACK protocol and independent recovery fencing;
real Edge qualification and the final integrated gates remain open.

## Follow-through — concurrent exact-original reservation race

Two independent in-process financial adapters may reserve the same private
delivery locator while it is still unbound. The source authority lock prevents
two ISSUE commits, but the loser previously returned
`CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED` even after the winner had
bound the exact original. The unmounted inner candidate now catches **only**
that explicit issuer refusal, looks up the same immutable locator and exact
actor/request/receiver/binding/expiry, and resumes through the existing P7,
current-session and custody validation. If lookup fails, the original refusal
is preserved; other errors are never used to guess or mint an original. This
does not recover an unknown parent, authorize a successor or acknowledge Edge.

The regression queues two adapters behind a real source PostgreSQL authority
row lock, then releases it so both contend over the same initial reservation.
Before the change one call was rejected while the other succeeded; the shared
setup stopped early and the suite exited 1 with 5 failures / 4 passes, not a
gate pass. After the change both returned the identical synthetic lease and
assertion; the existing subsequent count verifies exactly one matching lease.
Final disposable two-PG P7/financial suite **9/9 PASS**, exit 0. This is two
adapters in one process, not a crash/restart or independent-process fence.
Financial and command assertion unit suites **143/143 PASS**, exit 0; focused
strict source typecheck of the changed inner candidate passed, exit 0. These
overlapping checks are not real Edge or product acceptance.

| Direct working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-durable-inner-candidate.ts` | `5cd1b628ab439446d51eb3ab1c6c24dd7362551bc621db6cc7d67a1f93e0010d` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `ba872973307ceb77d07ea60982b81ef5397b6bc4fd6bf79fdb5897c11d3a7b60` |

The test script removed its two disposable databases, Node container and
network; read-only inventory found no matching P7 test containers/networks.
Peak resources were not measured. No frontend contract/action, runtime install,
real Edge input, grant or remote changed. Previous test-file hashes are
superseded. Durable financial parent registration/sequence and authenticated
recipient ACK, old-holder fencing, independent owner authority and restore,
real Edge acceptance, final candidate review and normal hook remain OPEN.
Rollback: leave this candidate unmounted.

## Follow-through — first financial delivery after issuer process exits

The unmounted `FinancialSourceAssertionAuthority` now has a deliberately
restricted `recoverFirstDelivery` path. A trusted Core composition must supply
the same actor, selected binding, private parent context, expiration, exact
request and already-bound lease. The path reuses the durable original locator,
revalidates current P7/session/custody, bounds recovery against context/pending
capacity and refuses a released, expired, changed or mismatched context. It
does not create an ISSUE, recover a recipient ACK, authorize a second delivery,
or accept a candidate with successor/terminal authority. Release and shutdown
also retire pending in-process recovery.

The two-disposable-PostgreSQL suite constructs the actual financial authority
in a synthetic child process, issues delivery zero, passes its private locator
and lease only through test IPC, waits for the child to exit normally, and
reconstructs the authority in the parent. The same lease and assertion digest
are recovered; a same-request retry is identical, no second lease is created,
and a successor without completion is refused. Wrong actor and wrong lease are
also rejected by a separate reconstructed authority. The test-only issued
lease is explicitly retired in the disposable database.

Final `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0;
the expanded shared setup took 66.8 seconds. Two earlier runs exited 1 with
5 failures / 4 passes: first, the extra child delayed reuse of an earlier
30-second test lease; second, the expanded shared setup hit its old 60-second
test timeout and left later shared-setup tests unable to complete. The final
run moves the new test after reuse of the earlier lease and gives this test
120 seconds; runtime TTLs and admission fences were not relaxed. Financial and
command assertion unit suites **145/145 PASS**, exit 0; focused strict source
typecheck, child syntax check and `git diff --check` passed. Counts overlap and
are not full integration, browser or Edge acceptance.

| Direct working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `b0247ecf673ab197d9c31b3171736359eb08391951dae98bccda0a2cd70a0df0` |
| `apps/control-api/test/financial-source-assertion.spec.ts` | `dc4115669759f63ebdad5e6aa09c9f99098387ba2f78e0d84db137638436cc18` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `9988b0808272aeaf375a3fc5d888839bc9185d017878a37338ecb2b901a979f1` |
| `apps/control-api/test/fixtures/c2-status-p7-restart-child.cjs` | `c6875d76ccd1d22531c55164b6bf78281eca656042c88327d91ae3b48ff63a8f` |

The synthetic child exited normally; this is **not** an abrupt-crash or
old-holder-fencing proof. Parent context is supplied by a trusted test caller,
not persisted and independently authenticated as a complete parent sequence.
Runtime HTTP custody, writer/role qualification, authenticated Edge recipient
ACK, multi-delivery recovery, independent V2 restore and the full gate remain
OPEN. The script removed its disposable containers and network; read-only
Docker inventory found no matching test resources. Peak resource use was not
measured. No frontend action, runtime install, real grant, Edge input or remote
change. Rollback: leave this source-only candidate unmounted.

## Follow-through — abrupt issuer process loss

The preceding graceful-exit test is now supplemented by a synthetic abrupt
process-loss test. The child issues the exact first financial delivery, sends
only the private locator, lease and assertion digest over TEST_ONLY IPC, then
holds its Node process and PostgreSQL connections open. The parent sends
`SIGKILL` to **that child only**, confirms exit by `SIGKILL`, and only then
reconstructs the authority and checks the same lease/digest, exact retry, one
source lease, and refusal of a successor without completion. No bearer or
private test key is written to output or Git.

`bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0, in
two disposable PostgreSQL databases. The first shared case took 65.3 seconds;
the full suite took 99.3 seconds. `node --check` of the child and
`git diff --check` passed. The test changes supersede the two test-file hashes
in the preceding section; the earlier graceful-exit receipt remains evidence
for its own prior hashes and is not silently relabeled as a crash test.

| Direct working file | SHA-256 |
| --- | --- |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `51c6a8b6a154d89b53b2ad685e7d512667d17220d469e5ca861f82fa40d398c6` |
| `apps/control-api/test/fixtures/c2-status-p7-restart-child.cjs` | `150f870294e22dfe5b7f306859cc0b7654ecbcdfe8eef3eb805181ed3f199b36` |

This proves only recovery after a confirmed dead issuer with the exact locator
already available to the test parent. It does **not** persist the parent,
prove old-holder exclusion when the original process remains alive, protect
HTTP transmission from replay, recover multi-delivery/ACK, or establish
independent V2 restore and actual Edge source authority. Keep the candidate
unmounted. The script removed its temporary containers and network; read-only
Docker inventory found none matching the test. Peak resource use was not
measured. No runtime, frontend, real grant or private credential changed.

Separately, read-only SSH on 2026-11-06 observed Edge worktree source HEAD
`636d58a7c4368a617903734ab1d0ce933d2804ca` with concurrent WIP preserved. The
public TS status log's latest A2 entry observed was the 2026-11-05 static
structural verification and asks; this is not proof of installed trust, A2
acceptance or absence of a newer private input. No HK files were changed.
