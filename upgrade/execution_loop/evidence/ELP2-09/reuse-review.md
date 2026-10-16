# ELP2-09 — Independent reuse and security review

Task09-REUSE, source inspection only,2026-10-16UTC. Baseline
`daf434875e28aa131105d7f27d910b2f0ca05792`, branch
`docs/research-loop-plan`, repo `/home/bobby/portal-research`.
Only this review file is owned by this task. No implementation, migration,
generator, build, database/browser test, runtime or Git mutation was performed.
References below describe the entry source, not whatever implementation the
primary subsequently adds. Primary must independently check the final diff.

Read root `AGENTS.md`, campaign `AGENT_WORKING_RULES.md`, approved09 task map,
Portal guide§§5.3/6.3–6.6/13.4/15ELP2-09, and relevant04/06 packet/census.
Authority remains Portal identity/current policy, TS business facts, Edge
transport/projection. Historical PASS is not a new runtime qualification.

## 1. Recommendation and storage decision

**Reuse existing durable Manager document revisions and head for a narrowly
named projection-replacement replay. Do not add migration137 merely to copy
the same financial rows into another event ledger.** Migration135 already
provides an immutable revision chain and an atomically updated checkpoint.

This recommendation is conditional: it covers replay of those retained,
source-qualified Manager projection documents only, under their exact
workspace/environment/profile/epoch/generation. It does not make the legacy
current-page observation channel into authoritative TS event history. A full
document replacement can represent corrected/removed rows without arithmetic
amount deltas, but it is not an invented per-order lifecycle event.

If the final09 implementation promises durable arbitrary-source event IDs,
coverage receipts, consumer lease fencing or independently retained cursors
that migration135 cannot represent, either add the necessary narrowly scoped
storage with real transaction tests or leave that promise explicitly
unqualified. A parser accepting receipt strings is not a trusted verifier.
Placement/replica lease/retention tuning remain10 decisions; do not silently
call them implemented by reusing an unrelated table.

| Existing source | Safe reuse | Limit requiring explicit treatment |
| --- | --- | --- |
| `execution-v2/manager-model.store.ts:13`, `prepareManagerProjection` | Strict closed source-bound document, qualified publication, exact tuple/domain validation, detached prepared capability | WeakSet preparation is in-process provenance, not source cryptography; trusted publication verification must remain separate |
| Same file, `persistManagerProjection:61` | Advisory transaction lock, immutable revision digest, same-current duplicate, exact sequence successor and supersedes chain, head+document atomically stored | Historical A→B→A rejected; generation change needs explicit rebuild; no ACK callback, consumer fencing token, independent coverage receipt or paging replay method exists yet |
| `migrations/1723680000135_execution-manager-models.sql:4–36` | Revision identity unique by profile/epoch/generation/sequence; headFK and revision writes share containing transaction |1024 revision ceiling in writer is an explicit stop, not TTL, guaranteed replay horizon or permission to erase historical revisions |
| `execution/profile-projection.repository.ts:739–900` | Existing accepted projection transaction includes mirror, relation cursors, optional Manager document, snapshot and journal; `pg_notify` becomes visible after commit | Legacy observation journal says `PORTAL_OBSERVATION/BOUNDED_CURRENT_PAGE`; its raw/global counters and current-page completeness cannot be served as scoped authoritative history |
| Same file, `transaction:1157` | Return only after actual `COMMIT`; throw/rollback before returning on failed commit | Real-PG test must show rollback leaves head/document/checkpoint unchanged and zero sourceACK; ACK must be after this return, not inside transaction callback |

`ManagerModelRepository.head:103` and `document:107` are adequate building
blocks, not a complete replay API. A new bounded private chain read must verify
the pinned barrier/terminal head and each digest/supersedes link, reject a
retention miss/generation transition, and never count visible ordinal holes as
source loss. Capture a consistent head/document barrier or fence both sides
of reads. Do not infer a consistent multi-source transaction.

## 2. Current-authority boundary: reuse, do not approximate with TTL

`execution-v2/read-scope.ts:98–417` is the canonical authorization service.
Scopes are server-minted WeakMap capabilities, not reconstructible from JSON.
`authorize:151` snapshots request arguments before await; `mint:202` verifies
current actor/session/workspaces, exact action, qualified publication and
correlated resource tuples. It confirms publication after relation awaits and
confirms current DB authority after the last adapter await. Restricted rows
are filtered before totals, counts, sort/filter and digest construction.

`revalidate:401` and `deliver:409` fence cache HIT/FOLLOWER/MISS identically.
Use the same current-authority semantics for each replay/event delivery. The
canonical service already considers grant expiry/revocation, explicit DENY,
session generation, current owner/linkage, membership, field policy and dataset
binding; no secondary user-name/role-based stream permission is needed.

Important distinction: scope fingerprint currently includes the exact
`dataset.source_revision` and publication. A stream must not reuse one old
minted scope forever, nor drop the revision binding to keep it alive. For each
document, mint the exact current authority for its source/publication binding;
keep stable subscription/query/policy/session restrictions separately pinned.
If a required pin changes, emit safe reset/deny and require a new authorized
snapshot rather than widening the old continuation.

**Race that must be tested:** authorization completes, a queue awaits, policy
is revoked, then a send resumes. The final current-authority check must be
after the queue/data await and immediately before the actual write callback.
Do not call an async `deliver` callback that writes protected bytes and then
rely on `deliver`'s later post-callback check: bytes are already disclosed.
For streaming, authorize/read/serialize/queue and final write fencing need an
explicit order. Public reset/revoked frames carry no protected payload or
hidden target metadata. While authority cannot be verified, protected sends
must stop, not continue until a cached lease TTL.

The canonical access transaction at `access.service.ts:128` holds row/policy
locks for app changes, then repeats wall-clock expiry checks before commit.
`readContext:70` / `confirmReadContext:89` provide DB-after-adapter fences.
No asynchronous source/network wait should hold an app authorization lock.
Per-event fencing is not proof of a deployment propagation SLA: report the
actual local race traces/time, remote notification and distributed-runtime
propagation separately. A five-second monitor is not an approved SLA.

## 3. Legacy feed must remain uncommissioned for scopedV2

`read-scope.ts:144 assertLegacyStream` refuses whenever V2 policy exists or has
ever been installed. Retained review refuses stream/bootstrap separately.
Preserve both gates; do not make V2 ready by feeding it the old raw channel.

- `execution/realtime.controller.ts:187 profileStream`: local `send` directly
  writes synchronous events; independent lease/current-authority checks run
  every5000ms. This is not a current check for each emitted protected event.
- Same file`:282 commandCenter`: raw upstream bytes use `pipeline`, with the
  independent monitor from `bindRealtimeLifecycle:362`. It cannot redact or
  reauthorize each unknown raw event merely because the monitor runs.
- `execution/profile-realtime.service.ts:16–25,118`: profile-global raw epoch
  and sequence,1000 replay entries,16groups/256subscribers/32pending and one
 250ms shared local tail. These are useful historical bounded implementation
  patterns, not measurements, safe scoped cursor semantics or a09 fanoutSLO.

New09 contracts/components must not alter these legacy gates, re-enable
retained polling, add browser TS requests or commission a source/relay.
The acceptance harness can exercise the new bounded component in isolation
without mounting a product SSE endpoint before qualification.

## 4. Cursor, privacy and coverage

`query/cursor.ts:84–194` safely authenticates canonical HMAC keyset cursors,
checks expiry/workspace/query/direction and limits input size. However the
payload is **base64url, not encrypted**. Never place raw global source sequence,
hidden row count, private relation name or upstream continuation in it. Use a
separate authenticated opaque/encrypted token or server reference, with full
bindings and strict size/key/expiry checks. Scope-bound HMAC alone does not
hide an encoded offset.

`manager-model.ts:229–278` already hashes revision/snapshot with scope and
query rather than publishing raw model identity. Preserve that discipline.
`read-projection.ts:103 projectionRowVisible` is a correlated-tuple predicate;
`:146 redactProjectionFields` permits only closed authorized scalars. Reuse
them before replacement rendering, not after totals/ranking have been built.

For visible1/hidden2/visible3, validate trusted source continuity over all
three, apply current scope, publish only authorized replacements with opaque
continuation/coverage. Do not increment visible public counters from global
source offsets, expose hidden counts in heartbeat/reset metadata, or infer
false gaps from visible event numbering. Verify actual source gap, missing
visible event and coverage mismatch independently. A synthetic HMAC receipt
verified by a test-only key remains fixture proof, not runtime Edge proof.

## 5. Cache, export and queued/late-command facts

- `local-query-analytics.service.ts:671–685` keys statistics cache by workspace,
  environment, profile, version, strategies and current scope fingerprint;
  final delivery must retain its scope fence. No broad row deletion is needed
  to revoke a non-hittable revision key. Do not cache a grant decision.
- `manager-lists/scoped-manager.reader.ts:102–158` binds query cursor to exact
  scopes/query/dispositions and checks current profile snapshot before return.
  `resource-read.service.ts:211–294` similarly nests current scopes before
  delivery. Use these as source-compatible patterns, not bypasses for a new
  stream whose event can be emitted later.
- The04 final route census explicitly found **no Execution export/download
  route** in the mounted112 baseline patterns. `report.export` is a policy
  action, not an implemented download. T09-06 can prove current denial and
  protected port behavior; do not count Research exports as Execution proof
  or invent a positive browser receipt.
- `command.service.ts:120–149` rechecks policy/versions/approval before durable
  claim and once more immediately before source send. `commandBoundary` checks
  expiry both at entry and commit. Reuse these semantics for a genuinely queued
  intent; never make the signed envelope a perpetual permission.
- `CommandStore.claim` itself is an internal storage primitive, not standalone
  authorization. No startup queue drain currently sends every PREPARED row.
  Test reauthorize-before-claim/send with the service boundary; do not write a
  new queue worker just to get a T09 label.
- `command.service.ts:171 recover` reconciles accepted intent via source lookup
  without new send/key or human impersonation. It can store a verified late
  committed outcome after the initiating user's revocation; public status still
  reauthorizes. Revoke must not drop immutable receipts, obligations or facts.

Replica warning: `profile-projection.repository.ts:202 tryAcquireLease` stores
owner+expiry only; `commit:739` does not check owner/expiry/fencing token inside
its commit. Do not describe that lease as proven split-brain fencing. New
source ingestion must have explicit actual fencing or remain uncommissioned
pending10 placement. Similarly `authoritative-event-ledger.repository.ts`
is a source-R5-specific, uncommissioned transport-free durable receiver; it
cannot be relabelled as arbitrary Edge replay truth.

## 6. T09-01…14 independent review expectations

All rows below are **required/recommended tests, NOT_RUN by this reviewer**.
The primary attaches actual component/PG/source/browser results separately.

| Gate | Minimal discriminating proof |
| --- | --- |
|T09-01|Head/document snapshot at barrierB; persistedB+1/B+2 strictly-after; insert between snapshot and subscribe; no missing/duplicate result; consistent final digest |
|T09-02|Duplicate sameID+digest no extra effect; sameID different bytes conflict; old row version cannot replace newer; replacement/tombstone idempotent; no browser arithmetic |
|T09-03|Source epoch and projection generation independently change; old continuation resets; legacy combined source_generation is not guessed into both |
|T09-04|Wrong actor/session/workspace/profile/query/resource/mode/policy/field-policy/model, expired/tampered/oversize/unknown-key cursors all safely fail; Last-Event-ID takes precedence without allowing ambiguous headers |
|T09-05|Revoke/expiry/unlink after cache HIT and follower joins and after event serialization/before write; zero protected bytes after final fence refusal; safe close/reset |
|T09-06|Replay after revoke cannot recover cached old scope; Execution export/download remains safely absent/uncommissioned; any future download gate must reauthorize actual bytes |
|T09-07|Revocation between preview/claim/send blocks new send; existing accepted source fact still durable/reconciled; no new idempotency key or hidden public status leak |
|T09-08|Bounded subscriber/group/pending rows and bytes, rate/quota/deadline/reconnect jitter; abort ignoring provider keeps owned slot; slow client closes/resets without unbounded extra writes |
|T09-09|Visible1/hidden2/visible3 continuous trusted interval, only two visible payloads; no hidden counts/global offsets/source IDs exposed, including decoding token payload |
|T09-10|True gap, dropped visible event, missing/mismatched scan proof cannot become COMPLETE/authorized-empty merely because filter returned nothing |
|T09-11|Revoke or scope revision during multi-page replay; fail before next protected write; cursor and coverage bound to same policy/model/generation; no denial-to-legacy fallback |
|T09-12|Canonical edge.v1 explicit epoch/generation/timestamp mapping; unsupported legacy order/precision/proof yields typed reset/unavailable, not fabricated ordering |
|T09-13|Field-policy or model schema revision changes invalidate old query/continuation; no hidden former-field values through replacement payload/digest/aggregate |
|T09-14|Linked researcher only own correlated tuples/shell, no peers/full totals/provisional denominator/physical balances; linkage revoke during replay; manager independent explicitDENY still honored |

Real-PG durability cases additionally need commit failure/rollback, restart
reader from committed head, duplicate replay and checkpoint/ACK ordering. One
runtime without a second writer is not split-brain proof. Local test timing
must not be promoted to remote revocation/retentionSLA. Keep failed attempts
and don't sum nested focused/full suites as new distinct test coverage.

## 7. Reviewed input pins and handoff

SHA256 at entry source (before primary edits):

| Path | SHA256 |
| --- | --- |
|`execution-v2/read-scope.ts`|`1fa1b57baf301efd28682feb1f184809fda796f135c6af9fa38f791237266f2a`|
|`execution-v2/manager-model.store.ts`|`dd0185008d8413cf8c27acf540169b0a7656be6c2e2862bf9c43dde9f3736c9c`|
|`execution/realtime.controller.ts`|`2d5837fbf557eac3ddbbcf9b168c6f5e68b72a7e17f1fede03b62549d0f59e2f`|
|`execution-v2/command.service.ts`|`e4c3b791f784f1135bd984ff8bc73b3c0cd4bb7a0161e59ae076a49f90d72d89`|
|`query/cursor.ts`|`be5babd01eac9cc3c37c912a1c868ed838afe0673060781cfcb9324ac363cf0c`|

Backend09 can proceed with narrowly scoped replacement replay, per-send
authority, opaque cursors and real-PG commit tests using existing135 storage.
The primary owns any justified additive migration, contract/generator and
final code review. Claude consumer remains AWAITING_CONSUMER_REVIEW under
owner frontend hold; UI should expose retained/no-stream, replay/resync,
revoked/denied/expiry and explicit freshness without inferring source truth.
ELP2-10 placement/performance and actual source relay/replay commissioning are
separate named dependencies, not permission to activate them here.

## 8. Draft implementation follow-up review

Primary requested a second read-only review of `realtime.ts`,
`realtime.contract.ts`, `realtime-commit.ts` and the delivery-boundary diff in
`read-scope.ts` / `access.service.ts`. No tests were run by this reviewer and
this paragraph is not a final source freeze or PASS receipt.

The implementation intentionally narrows to Edge **NOTIFICATION_ONLY** notices
and current named-snapshot revalidation, not the document-replacement proposal
above and not financial event replay. That is a valid narrower source mapping
when advertised honestly. Unqualified private source-port implementations must
remain unmounted; an interface/comment is not source coverage qualification.

Positive observations: AES-GCM/domain separation; fixed-size randomized padded
tokens hide source cursor bytes, equality and length; terminal frames remove
protected scope/source/quality; per-write business-scope resolution plus exact
`stream.subscribe`; synchronous send under app policy/session locks; existing
legacy/retained gates left intact. A valid batch continuation may be beyond the
last visible notice because hidden trailing rows were scanned; comparing those
tokens for equality would be incorrect and has been removed in the draft.

Concrete draft findings sent promptly to the primary for repair and regression:

1. `validateLimits` validated only present values; missing required keys passed
   through `undefined` comparisons and could disable caps. Caller mutation of
   stored limits could change bounds after construction. Require a complete,
   closed, detached/frozen numeric limits record.
2. `commitManagerProjectionThenAcknowledge` held a pooled DB connection while
   awaiting external ACK after COMMIT. Release the client after the transaction
   and before ACK; a stalled ACK must not starve unrelated database readers.
3. `stop()` did not latch shutdown: an in-flight subscription could finish its
   authority await and register after teardown. Reject subscription both before
   and after the await once stopped; new polls cannot revive a stopped hub.
4. Concurrent subscription attempts did not reserve pending-admission slots.
   The final client count was bounded, but unbounded pending authorization work
   could run during a reconnect storm. Reserve a bounded pending slot before
   authorization and release it on all success/failure paths.
5. Minor contract consistency: reject an inverted/equal window as the canonical
   read binding does; finite public frame actions/reasons should match the
   advertised event rather than allowing contradictory UI combinations.

The primary owns fixes, source pins, focused regression results and disposition;
this review does not assert those fixes landed merely because messages were
sent. Remote TS linkage/membership is still a separately revision/expiry-bound
authority: Portal DB locking linearizes **app** revoke and session changes, not
a distributed transaction with source topology. No distributed revocationSLA,
runtime source qualification or browser receipt is inferred.

## 9. Final source-pin correction and follow-up inspection

The preceding§8 paragraph about a final notice cursor differing from the scan
continuation was an **incorrect generalization for the exact inspected Edge
implementation**. It is preserved as review history, not current guidance.
The primary's concrete source inspection of
`ScopedReadService::notices` / scoped SSE `validate_batch` resolves this:
visible changes plus hidden trailing receipt groups are coalesced into one
notification whose cursor is the **end of that entire verified scan**.
Therefore a nonempty batch **must** have
`next_cursor == notices.last().resume_cursor` under this pinned port. That
equality is a cursor-binding check, not sparse visible-sequence gap detection.
The current Portal draft correctly restores it and rejects duplicate/self
notice cursors and a not-caught-up batch that makes no cursor progress. Hidden
only scans can still advance a continuation without creating a visible notice.
No hidden count or raw sequence is needed in any public explanation.

This follow-up read the latest source files; no tests/build/Git/runtime action
was performed. The four concrete§8 findings are now **CODE_CHANGE_OBSERVED**:

- All seven limits are required, own fields checked, and ordinary numeric
  configuration is copied and frozen rather than retaining the caller object.
- The ACK wrapper releases its PostgreSQL client in the transaction's finally
  block, before entering the external acknowledgement await.
- Shutdown is latched; subscription checks it before and after authorization,
  and poll cannot restart a stopped hub.
- Pending subscriptions reserve admission capacity before the authorization
  await and return it in finally, including refusal/shutdown/error paths.
- Equal/inverted windows are rejected and event/quality/terminal/next-action
  consistency is checked in the runtime frame schema.

The primary owns actual regression/PG results. Code inspection does not turn
these statuses into runtime-qualified or consumer-accepted. Four new real-PG
test definitions were separately delivered by this reviewer in
`test/elp206-manager-store.spec.ts`; they prove local commit/ACK ordering,
lost-ACK retry, failed-persist no-ACK and single-connection release when run in
the primary's isolated test cell. They do not prove source ACK or remote HA.

### Private source cursor capacity versus public encrypted wrapper

The Edge canonical cursor parser permits up to4096bytes. Portal's outer public
AEAD token also permits4096characters, but its encrypted **inner source cursor
is currently limited to2048ASCII bytes**. These are different capacities. The
fixed2816-byte plaintext padding and cryptographic/base64 overhead mean the
outer cap cannot honestly promise wrapping every legal4096-byte Edge token.

Recommendation for this bounded phase: publish exact compatibility with the
**inspected scoped `kc1` constructor**, whose claims use fixed-length scope and
query hashes, fixed scoped resource/environment, generation UUID, one random
UUID boundary and integer timestamps; those actual issued tokens are below
2048bytes according to the pinned source inspection. Keep the2048byte guard
and fail closed for a longer/different-family cursor. Include this explicit
capacity distinction in the handoff/readiness profile, and boundary tests for
2048accepted/2049rejected; do not claim generic4096inner-token support or source
runtime compatibility from a synthetic maximum-length string.

Supporting all future4096byte source tokens would instead require a larger
outer contract/token budget and fixed padded ciphertext with corresponding
frame/memory measurements, or an independently approved bounded server-side
reference store. Neither a new storage table nor a widened browser token is
needed merely to support the inspected current scoped constructor. Any future
source-token layout revision must be impact-reviewed against this exact pin.

Follow-up inspected file SHA256 values:

| Path under `apps/control-api/src/execution-v2/` | SHA256 |
| --- | --- |
|`realtime.ts`|`c84f22720b588289f6fe8a8e9c18ce83f23692832ceba051b771d1a603060624`|
|`realtime.contract.ts`|`79be182f33a01134a000cf5fa4413ddd355faca09fb8be0ea33316af745562f4`|
|`realtime-commit.ts`|`9dcd71dcc2e65e51391900ad51ef7edaa85558c206bf293cf44ef954962478f9`|
|`access.service.ts`|`ade195afd7f42436d75bfad0e46f68dfeb5c343ec945ef49cf4fbb716ec23176`|
|`read-scope.ts`|`f79cae3fac5dbe36f088ac3828262ef0e9edd986b073689f48ea41343d486056`|
