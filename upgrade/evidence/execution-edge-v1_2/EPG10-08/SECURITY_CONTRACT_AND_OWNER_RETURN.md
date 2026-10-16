# EPG10-08 — current scope, revocation and TLS

Authority: [main journal §23.17](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2317-epg10-08-execution-journal--2026-10-16),
[phase checklist](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#epg10-08-plan),
EDGE08 and BE§§3–5/9.2/14.2/ELP2-02/03/04/09. This is the single08
security/owner return, not another roadmap or permission to change a peer.

Final recorded status: **IN_PROGRESS / TLS_RUNTIME_QUALIFIED /
AUTHORITY_OWNER_DEFERRED_TO_PM_INTEGRATION**.
Final490automated PASS/0FAIL/ignored/skip; fmt/strict zero-warning Clippy PASS.
**Full08 exit NOT_MET**; actual current security is not production-certified.
Continuation:46repair tests PASS, actual6TLS +12positive/12denial PASS across
Paper/Sandbox/Live. Valid same-identity fallback loaded, expiry2026-11-15;
only6Manager restarted and3Proxy contexts reloaded. The original source-only
and expired-TLS statements below describe the earlier490-case snapshot and
are superseded for this exact repair by [TLS continuation](tls-continuation.json)
and the final main journal. No DB/image/JWT/grant/current-provider activation.
Initial false POST403 expectation caused bounded containment; all6Manager
restored, corrected effective POST405 policy qualified, failure retained honestly.
Use [verification](verification.json) and the final main journal for executed results.
No isolated fixture is an issuer, membership receipt, mounted provider or native
TS commit. Paper/sandbox/live are structural scopes; Canary is a live stage.

## Implemented boundaries

- `edge-auth`: local immutable pinned RS256/JWKS verifier; checked finite token
  lifetime, bounded token/keys/claims, conflicting key metadata rejected.
  Signature/issuer/audience/nbf/expiry/scope/resource checks remain mandatory.
  Roles/display names/request-body actors never create new v2 grants.
- `query-api::scoped::authority`: private, non-deserializable current-grant
  witness and provider adapter, composed with05 `ReadAuthorizer`. Calls the
  provider for every recheck; no permission TTL cache or network lookup in the
  adapter. Provider must resolve real current session/human/workload and app,
  field, membership/delegation and model revisions; missing facts deny.
  Digest changes fence every affected scope. Construction is NOT authentication
  or a TS commit lease. Default provider unavailable. No new issuer/wire/grant.
- Existing05 scoped page/history/cache/export/replay checks run before and after
  asynchronous work, before cache hits/continuations/final disclosure and at
  each SSE dequeue. An invalid scope never widens to all rows. Cache key binds
  principal/effective scope/policy/fields/model/query/source/cutoff/generation.
  Queued notices purge on denied current checks. Notifications are refetch
  hints, not financial events. No new file-download/public route was added.
- Selected-field publication rejects known credential-shaped nested keys,
  private-key PEM markers and Bearer values within finite depth/node bounds.
  This is defense over an approved allowlist, NOT general secret detection.
  Excluded fields are not inspected: hidden values cannot change error behavior.
  Errors are coarse codes; poller logs no longer format raw database errors.
- Legacy SSE expiry is checked before the initial queue and after awaited
  selection. Expiry purges pending data, releases subscription, sends one
  `auth.expiring`, then closes. This fixes expiry, NOT dynamic revocation of
  the legacy transport. No broad-admin fallback or signed-contract change.
- V1/Manager transport: HTTPS/TLS1.3 only, explicit finite CA bundle (including
  planned overlap), built-in public roots disabled, hostname/IP checks enabled,
  no proxy/redirect fallback. Manager still holds no JWT/DB/issuer secret.
-07 command relay is unchanged authority: separate current submit/status and
  service recovery.08 adds actual durable-PG pre-send revocation drills plus a
  clearly TEST_ONLY commit-side port fence. A post-CAS or post-send ambiguity
  never reopens the key for automatic send, reports applied or erases receipts.

## Revocation contract and least-privilege map

| Actor/boundary | Permitted | Never inferred |
|---|---|---|
| Portal session/policy issuer (Research owner) | Current verified stable user, session generation, scope/field grants and revisions | Business membership or TS effect from local rows/role |
| Manager all-business read | Full released business rows for exact authorized source/profile; protected security fields excluded | Export, capital, user administration, maintenance or command |
| Linked researcher | Only owner-approved fields and current verified eligible tuples; filters before paging/count/sort | Display-name linkage, historical-link rights, peer/totals/weights/counts, export/SSE by default |
| Edge current read adapter | Enforce supplied fresh current facts, fixed typed query, finite storage/cache/queues | Policy grant, identity issuer, generic SQL/Redis/body actor |
| TS/PM commit authority | Current human + workload/delegation/membership fences through TS COMMIT | Old token/preview/Edge check as the commit lease |
| Service recovery | Accepted historical intent/causal facts under current service authority | Human disclosure, resend, new capital authority |

Required owner sequence:

1. Authority commits revoke/new revision with its audit/invalidation mechanism.
   Research separates Portal-applied versus TS-pending/applied; it must not claim
   a local revoke has changed TS membership without a real TS receipt.
2. Fresh current provider rejects old session/scope/revisions immediately at its
   boundary. Permission-cache failure, unavailable authority or unknown mapping
   denies protected reads/new mutations. Do not keep streaming until JWT TTL.
3. Purge or make old cache entries unreachable; fence in-flight loaders, cursors,
   prepared exports/downloads, replay and every queued SSE write. Already emitted
   bytes cannot be recalled. Transport/framework buffers must be included in a
   real measured propagation window before certifying a runtime bound.
4. Reauthorize queued command before dispatch and at TS commit. TS provider must
   hold its actual current fences through COMMIT, not release at an earlier
   lookup. Reject after enqueue/revoke with no native effect; uncertain response
   remains unknown and queries the original key.
5. Continue consuming committed economic facts and service-authorized settlement/
   recovery even after a human is revoked. Revoke is not HALT, cancel, flatten,
   capital return, history deletion or rollback of a committed fact.

There is no invented production revocation SLA here. The isolated receipt records
UTC + monotonic check latency without a pass threshold. Runtime owners must
publish the risk-approved bound and measure authority-commit→last protected write
including invalidation, network/framework buffering and mixed-source delays.

## Certificate and issuer-key rotation runbook

This is a procedure for a future exact operational window, **not executed
production rotation**. Test keys/certificates exist only in the private disposable
target, are overwritten/unlinked, and are never copied into this evidence.

1. Pin actual service, release/image/config, issuer/audience, workload/SAN,
   public trust/keyset digests, certificate validity and named rollback owner.
   Check both-host locks and scope exactly which replicas/connections change.
2. Prepare private new keys via the existing PKI/secret store. Keep stable
   identity, audience, principal and business scope. Add only approved new CA/
   JWKS public keys for a finite overlap; reject wrong roots, SANs, algorithms,
   audiences and expired/future assertions before promotion.
3. Construct a **new** immutable client/verifier/server config. Existing clones,
   pooled TLS connections and resumed sessions do not become newly verified
   merely because an on-disk CA/JWKS file changed. Drain/fence old users and
   bound in-flight operations in the exact service window; new read disclosure
   still requires current policy, regardless of valid TLS/JWT.
4. Move issuer signer/client leaf to the new key, probe authorized identity and
   exact scope, plus wrong identity/retired key negatives. Preserve accepted
   commands/status/recovery through failure; never resend to test a lost reply.
5. Remove the retired key/root, replace remaining old clients/verifiers and
   explicitly terminate affected old sessions/connections when required by the
   approved revocation bound. Verify denial on fresh handshakes/assertions AND
   existing connection/disclosure paths. An overlap test alone is insufficient.
6. Roll back only to a still-authorized known-good config; never reinstate a
   revoked credential or insecure TLS. If neither set is safe, close the
   affected surface, keep independent authorized scopes/status/recovery, and
   reconcile uncertain commands by their original immutable key.

## Logging and evidence policy

Never log token/Authorization/Cookie, client private key, issuer key, DB URL/
credential, raw upstream error/body, restricted resource details or arbitrary
payloads. Use bounded coarse reason codes and non-secret version/hash/counter
metadata. Host-visible operational logs remain bounded. Error shapes do not
distinguish hidden from absent resource; metrics/labels never enumerate hidden
IDs, totals or secret values. Publication tests use unique TEST_ONLY sentinels;
the final evidence contains only sanitized metrics/hashes and source references.

## Actual dependencies, not new approvals/phases

Parallel source review11:43UTC: TS `434bf38d5e73dd77de4e47b6a416bc35a19c2b6f`,
PM `d16aa2b5f251596e469807f57e81fe14cdc7e763`,
DL `fe8c857cfa97405aaccef3ae45ad7e4f0f9a7c56`, Research
`e6620f416e43bc8c18a044339a598c436d8556ba` (ELP2-09 committed).
33/34 frozen source interfaces unchanged; PM binding repository +§58.64 add
receipt-bound worker recovery independently of a revoked historical human,
still source-only/unmounted. Research ELP2-10 is moving uncommitted consumer
work, not a stable publication. Current trust/read/realtime wiring hashes did
not change. Neither partner change grants Edge native authority.

Direct ADMIN inventory remains legacy-only: Research
`execution/realtime.controller.ts:100` diagnostics,
`execution/analytics.controller.ts:53` capital-preview,
`facade/facade.controller.ts:231/241` Research export/generic mutation facade
(workspace mirror check and Origin/CSRF still apply) and
`execution/current-source.proxy.ts:907/927` worker synthetic service role
(named-operation catalogue/exact relation or accepted-profile mapping required).
These are audit anchors, not permission to modify peer routes. New v2 diagnostics
authorize the exact technical profile before legacy handling; sticky v2 raw
legacy SSE is denied. ADMIN/display names never substitute for v2 current grants.

SGP→Edge three existing listeners8443/8444/8445 verify TLS1.3 chain/IP with
the actual Control API server CA. Their presented CN is shared
`portal-execution-edge.paper`; this network trust observation is not a
per-profile/human/workload policy proof. No HTTP/client credential/rotation.

**Fresh concrete TLS fault (2026-10-16 11:21–11:22 UTC):** all six loaded TS
Manager facade/issuer endpoints8023/8024,8123/8124,8223/8224 fail pinned CA +
hostname verification: leaf expiry `2026-09-27T03:40:51Z`. The shared Source
Proxy Manager client certificate expired at the same time; Manager CA remains
valid through2027-08-27. Source Proxy frontend TLS1.3 verifies normally. See
[safe public metadata](tls-observations.json). No authenticated current Manager
read is claimed healthy merely because its containers run.

**Exact repair proposal / TS-PKI runtime owner:** renew the shared facade,
issuer and proxy-client leaf certificates under the existing approved CA and
stable identities/SANs; retain private material in the current secure references.
No issuer JWT key, DB role/data/grants, image or business scope change is needed.
Actual loaded contexts require the six named Manager services to reload/restart
and three profile Source Proxies to reload their client certificate. This is an
exact nine-service operational/PKI window, NOT an Edge source-only change or
permission supplied by an isolated TLS fixture. It has not been executed under
08 approval. The owner must identify a still-valid rollback set or disable the
affected path; rolling back to expired credentials is not recovery. Then verify
all three profiles, wrong cert/hostname/retired credential denial and unaffected
runtime tuples without ever disabling certificate verification.

1. **TS/PM owner:** publish mounted current human/workload/delegation authority,
   business membership/revoke receipt, exact command wire and commit-lease proof.
   PM source has leases but runtime remains unmounted; N12 remains0/9 published.
   Bind source only to that actual contract. This blocks native T08-01, not read
   fixture implementation/tests. Existing07 owner packet remains authoritative.
2. **Research owner:** commission authenticated current read/policy/publication
   provider, approved researcher field matrix and actual identity mappings; wire
   cache/cursor/export/replay/SSE revocation to the real current authority.
   ELP2-09 candidate hub/AEAD/current-write guard is not a mounted runtime path.
   Default trust remains unqualified, so no real v2 field/grant activation is
   inferred. Direct ADMIN remnants remain named legacy routes, not v2 grants.
3. **Security/runtime owners:** bind reviewed workload/trust references and
   approve exact operational rotation scope when doing real rotation. Return a
   measured real propagation bound; isolated timings are not production claims.
   Existing deployed Manager/V1 retains its previous source/config; Manager
   application health is currently blocked by the explicit expired upstream
   certificates above, not retroactively EPG10-08 current-policy qualified.

Once those scoped artifacts exist, bind/qualify the dependent surface and rerun
**this same08** (plus its already-approved dependent phase), not a new08 subphase
or another generic owner-approval loop.09…11 are not started by this package.

## Final acceptance and reproducibility

The immutable final [qualification](qualification.json) covers85runner safety,
250Rust library,42actual Edge binary,10strict TLS and
22bootstrap/38scoped-read/8resource/11Manager/24command disposable-PG cases:
**490PASS,0FAIL/ignored/skip/filtered**. All11packages/all targets compile;
fmt and strict all-target Clippy pass without warnings/suppressions. Earlier
fixture/Clippy failures and their fixes remain in [attempt history](attempt-history.json).
Final426source +4helper hashes match tested local bytes; manifest
`7b8130d48037c0084fc3dffbb44954feecd49059915df4daafdc4f1637189197`.

| Family | Executed isolated proof | Actual runtime boundary |
|---|---|---|
| T08-01 | Durable prepare/claim revoke and TEST_ONLY commit-port fence: zero effects | Native TS lease through COMMIT/handler publication absent |
| T08-02 | Cache/cursor/export/inflight/SSE revoke and expiry deny; unaffected scope positive | Current provider, framework/network buffering and real propagation bound unqualified |
| T08-03 | Partial: no role elevation, unknown business policy denies | Stan/protected-owner actual business semantics and identity acceptance absent |
| T08-04 | JWT/signature/issuer/audience/expiry and strict mTLS negatives PASS | Edge/Proxy frontend TLS PASS; all6Manager TLS endpoints FAIL expired leafs; actual workload grants unqualified |
| T08-05 | Finite JWT key/CA/client-cert overlap/removal using new immutable clients PASS | No operational rotation; exact9service PKI window needed |
| T08-06 | Selected nested credential keys/PEM/Bearer/depth bounds deny through PG/cache/export; coarse errors | Not general DLP or real field-policy acceptance |
| T08-07 | Broad read does not grant command/capital/export/replay; hidden inputs excluded | Actual grants/command business authority unmounted |
| T08-08 | Current revision/generation/correction invalidations and unaffected-scope controls PASS | Research current cache/stream trust/provider not commissioned |
| T08-09 | Stable owner/manager/researcher fixture principals and restricted slice positive controls PASS | Actual Bobby/Stan/Thanhvuong mapping/field matrix still owner-accepted prerequisites |

Eight families have limited isolated proof and one is partial; **zero full
runtime families certified**. Final TEST_ONLY SSE check206µs with0restricted
notices after revoke at11:48:49UTC. This is not authority-commit→last protected
network write SLA, native TS proof, production capacity, HA or financial Live
qualification. Structural all-mode tests do not activate traffic.

Reproduce only in a new reviewed private `/tmp/epg10-08-*` source-only target,
with copied public monorepo compile inputs from the immutable manifest and the
four runner helpers. Check both-host measurement locks, own a bounded lock,
reuse pinned PG image, Rust1.85.1 and OpenSSL; do not supply operational secrets,
rows or PKI. Set `EPG10_TEST_PROFILE=08`, `EPG10_PORTAL_REVISION` to the source
baseline, `EPG10_EXPECT_BOOTSTRAP_TESTS=22`, `EPG10_EXPECT_READ_TESTS=38`,
`EPG10_EXPECT_RESOURCE_TESTS=8`, `EPG10_EXPECT_MANAGER_TESTS=11`,
`EPG10_EXPECT_COMMAND_TESTS=24`, `EPG10_EXPECT_TLS_TESTS=10`; run
`python3 /tmp/epg10-08-<new-owned-target>/run.py` from that prepared target.
The runner invokes its85safety cases, locked/offline compile/tests/fmt/strict
Clippy and final input hash comparison. Clean the exact private target afterward;
the completed08 target has already been removed. No HK heavy job is permitted
while its foreign measurement lock remains active.

Final peer round11:52–11:53 supersedes the historical11:43 pin above: PM now
`e2003bfe8a21124fb78dbdfdda1ad774cbecdfc2`, docs-only Edgev1.2 plan references;
full relevant guide delta reviewed, no math/runtime/authority widening. Latest
**32/34** frozen nonjournal files unchanged: changed PM guide and recovery
repository only; recovery remains unmounted and six prepared cases NOT_RUN.
TS/DL/Research HEADs above unchanged; all4Edge guide hashes unchanged. Research
selected15current security/wiring hashes unchanged, ELP2-10 staged work not a
commissioned runtime. Exact staged/unstaged/untracked digests and review limits
in [final reconciliation](final-reconciliation.json), not a claim of atomic peer freeze.

[Cleanup](cleanup-receipt.json):8,387,694,592allocated bytes (~8.388GB) removed
from exact owned private target; own container/lock/temp TLS keys0remaining.
SGP free159725641728→168109350912B (shared observational delta). No image,
BuildKit, volume, network or operational resource was created/pruned by08.
All17original +6additional Manager tuples unchanged; Manager historical facade
restart counts3/4/4 unchanged, not zeroed. Existing release/rollback resources
retained unmodified/unqualified, no expired certificate accepted as rollback.
Canonical source, stable release,23runtime image/config tuples and six active
worktrees are linked in final reconciliation; feature source is not deployed.
No push/merge/deploy. Unrelated untracked feasibility-review Markdown preserved.

**Runnable-now partition:** owned implementation/tests/preparation/cleanup left0.
Real provider binding, native commit qualification and connected security tests
stay dependent work inside this same08 once exact owner returns exist. The
four action items above are not permission to edit peer authority or rotate
services unannounced; do not open another phase for them or claim08 complete.

## Owner-approved continuation and deferred business acceptance

After the source-only commit, Bobby approved finishing the exact6Manager+
3SourceProxy leaf repair and requested remaining actual authority integration.
Subsequent clarification explicitly defers stable Portal↔TS mapping, researcher
field matrix and Stan/current-authority acceptance to the parallel Portfolio &
Account Management work because those inputs have not yet been implemented.
State: **OWNER_DEFERRED_TO_PM_INTEGRATION**, full08 exit still NOT_MET.
Do not alter a dirty peer checkout, mint a current policy from fixture/name/
ADMIN, or advertise command acceptance. Resume dependent binding/acceptance in
the same08 when real producer artifacts exist. TLS preparation is independent.

Read-only follow-up confirms concrete providers absent, not just deployment
flags: PM `operator_runtime.py:46` is unmounted; `identity/human.py:117` and
`operator_session.py:44` hold external leases through COMMIT but instantiate
no real lease providers. Research `main.ts:9` supplies no trust dependencies,
`access-trust.ts:20–22` stays unqualified; `auth/profile.contract.ts:23–26`
reports UNMAPPED and `publication-adapter.ts:49–51` rejects uncommissioned
SOURCE_VERIFIED. Research §4.8/ELP2-REQ-00-002 still requires actual field
selection. PM owner is actively changing the same trust/handoff boundary.

HK measurement lock `claude-burst-b16-a1parity` currently expires
2026-10-16T13:48:52Z (20:48:52ICT). Do not start/restart the six Manager
containers or run local heavy tests/builds until it is absent/expired and a
fresh lock check permits the exact operational window. No renewed certificate
or source test is a loaded-runtime acceptance before the contexts reload.

### Independent TLS continuation: execution contract

The first foreign lock was removed early; subsequent PM isolated/preflight
locks are also respected. Do not restart around a foreign window, remove a
peer lock, or turn its deadline into a repeated approval request. The existing
approval remains valid for this exact9service repair when a fresh atomic lock
acquisition succeeds.

Owned helper: [`renew_manager_tls.py`](../../../../scripts/epg10-08/renew_manager_tls.py),
tests: [`test_renew_manager_tls.py`](../../../../scripts/epg10-08/test_renew_manager_tls.py).
It uses the existing pinned Manager CA and existing leaf private keys; preserves
subjects/SAN/EKU/extensions, DB/JWT/image/configuration identities; stages two
independent30day leaf sets outside Git; revalidates both before publication.
Only4existing private files change (two server certs plus two copies of the
same Proxy client bundle), preserving ownership/modes. Existing6Manager
containers restart, existing3Proxy nginx contexts validate/reload; no compose
recreation against the removed historical owner worktree. Loaded leaf hashes,
chain/hostname/TLS1.3 and exact profile catalogue/capabilities/one-row records/
portfolio projection are checked; POST405/HEAD405/unknown404/no-mTLS denial
are separate negative cases. No response records or assertion tokens retained.

The helper acquires an exclusive1800s host lock, guards every operational
write/subprocess/probe against lease replacement/expiry, and bounds primary/
fallback/containment stages to600/600/180s. Failure uses the separately valid
same-identity set, never the expired originals; failed recovery attempts all
six Manager stops independently and requires actual stopped-state observation
before making any containment claim. A lost lock prevents further mutation.
Private originals are forensic only. Retain the named0700/root-only bundle
with0600files as bounded30day repair/recovery evidence; it is not a Git artifact
or a reason to keep disposable test caches/images.

Final46TEST_ONLY methods PASS on SGP (0FAIL/SKIP), including real temporary
PKI/file prepare+publish+fallback round-trips with Docker/HTTP mocked. Source
hashes match HK; the prior490source/PG security cases remain byte-pinned and
are not re-run or relabelled connected acceptance. Runtime outcome is recorded
separately in the main journal and the continuation receipt; neither suite
supplies the deferred PM/Research business authority.

Final outcome: TLS repair connected-qualified, all18HK+5SGP services running;
all immutable images/configs retained. Only6Manager start times/manual counters
changed; Edge/PG/Proxy containers and five SGP services did not restart.
Additional212,992B from two exact SGP test targets removed, no owned test keys/
containers/locks remain. Root-only private repair/recovery bundle explicitly
retained30days; all payload/secret values remain outside Git. Main08 remains
NOT_MET only for the exact real trust/business/revoke acceptance deferred by
Bobby, not an unfinished TLS task. Resume within08 after TS/PM +Research
return their actual providers/identity receipts/approved policy/native lease;
no phase09…11 activation or fabricated all-business grant follows.
