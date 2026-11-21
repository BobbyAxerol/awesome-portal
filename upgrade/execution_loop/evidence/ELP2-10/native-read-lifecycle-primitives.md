# ELP2-10 — Exact source, app-domain and finite-egress primitives (NC-02)

## Entry and approved scope

2026-10-17 continuation of the assigned backend02–10 goal. Source entry
`c730729eaf5071bdcf151a40aebedc4a0f483019`, branch `docs/research-loop-plan`,
checkout `/home/bobby/portal-research`; clean after the NC-01 terminal hook.
Current batch **APPLIED_UNCOMMITTED / NOT_RUN / UNMOUNTED** at entry.
These are local prerequisites, not installed native/application authority.

Primary owns integration and this packet/Unified. Independent private proposals
were prepared under `NC02-INTEGRATION-SCOPE.md`; no parallel test/build/DB jobs,
repository/index writes or source changes occurred during NC-01 source freeze.
Owned code: access.contract/policy/repository, current-human-snapshot, additive
native codec helpers, selected-source wrapper and finite-egress primitive.
Owned new specs: manager-domain-access, native-selected-source, native-read-egress.
Forbidden: frontend/design/baselines, real grants/users/sessions/trust/credentials,
Core/PM installation, source service mutation, dev/main/push/sign/release/deploy.

## Review intake and requirement matrix

Claude review intake follows campaign§7.3. Execution UXM remains
`NOT_STARTED_BY_OWNER_DIRECTION`; no new Claude acknowledgement/review is
invented. The source-only independent findings below are not Claude receipts.
No public DTO/OpenAPI/generated type, route or new UI binding is introduced.

| Requirement / finding | Disposition and implementation | Done-when / affected proof |
|---|---|---|
| Exact selected transport, not shaped JSON | ACCEPTED_FOR_IMPLEMENTATION: private source/client WeakMaps, detached exact Base/action, full configured pins and actual reply-byte digest | Actual local TLS six-action round trip, cross-source/clone/getter/Proxy/wrong-pin negatives; no held permit inferred |
| Exact current app + reviewed field permission | ACCEPTED_FOR_IMPLEMENTATION: private owner-issued nondelegable Manager domain root intersected with exact current OWNER_VERIFIED seal; existing grant store and shared lock | Real PG positive/current revoke/generation/expiry/lock ordering; ordinary resource grants remain separate |
| NCD-01 final-await expiry | ACCEPTED_FOR_IMPLEMENTATION: final xid and DB clock obtained in one last query; session/grant/seal use fresh half-open clock | Real PG delayed final boundary crosses grant expiry and refuses; fixture preconditions must prove it was initially current |
| Genuine finite-response ownership and recovery | ACCEPTED_FOR_IMPLEMENTATION: reserve exact response/socket/private body before SENDING; one-use observations; admission retained until both physical close events | Actual local HTTP completion/abort/slow transport, unsent cancellation, immutable old UNKNOWN and new same-instance closure observation |
| EGR-01 synchronous expiry crossing | ACCEPTED_FOR_IMPLEMENTATION: recheck time after synchronous guard/binding and immediately before end | Actual HTTP no-body at crossed guard/header deadline; genuine finish with crossed second guard never FINISHED |
| EGR-02 replaced timer handle | ACCEPTED_FOR_IMPLEMENTATION: clear owned quiescence timer before every rearm | Genuine finish then actual peer FIN then physical closure cancels every owned timer and preserves FINISHED |

Source reviews accepted with integration limits after corrections, all tests
still NOT_RUN at this entry. Original findings and intermediate hashes retained.
Final private proposal pins (SHA256):

- Selected source patch `8ad4c7e87859e688dadad7c97074dd3da955e1d11c15deef149feac72114eaa0`;
 43-case test patch `0b48233213a1957dda4a9ed145b6047a612186970dd86fff51d415dcafb8163d`;
 source review `1c88b169db37ff7740b90286553672fbfcad4808db80344566644a5576754e6b`.
- Egress patch `57807b88c24bff46580a37f830c43aa3689ea462cb9dcde86a6bb2a571538bf3`;
 651-line test `31188c2a471ceada01932f825615193694f1e05f10829a436314466d4847426b`;
 independent review `7446d29b095d7d4a85bbfb4d6167b876698255e6c0fe9c12fa9c4ba4795756a5`.
- Domain patch `61e6e8485b3385e5c264ba524cfddd4217b886ddb9c08b04f1af6e0c2732f201`;
 249-line/25-case spec `e1c2ef245477576743e305e6671251bb9e0c71e88936d75bbd4ebbe0d30d46d4`;
 corrected review `c38e5cd44d14a23b167a5909717310c41d73f9e49de4cf93d25caa3f2b0770e8`.

## Semantics and compatibility limits

`SelectedNativeBusinessReadSource` privately captures immutable configuration,
constructs the actual TLS client and recognizes only actual-client correlated
results. Original UTC microseconds/offset remain immutable; acquiring actions
check freshness before and after I/O. Recovery retains the OLD exact Base after
expiry. Full human/native/source fingerprint pins must match; source lease may
expire earlier than Base and must cap the later lifecycle. No credentials/client
getter, signer, app permission, held source handle or terminal release is exposed.

Codec additions capture exact own-data Base/context/pins and action-specific
identity-signature preimage. Closed v1 routes/result semantics are unchanged.
Provider-delivery prefixed SHA and raw Manager/binding/source hashes are distinct.

Private `portal.manager-domain-grant.v1` facts use existing
`portal_access_grants_v2`, not a new authority ledger/public ResourceSelector.
Legacy and domain rows share the10000-row cap before filtering; present unknown
schema fails closed. Existing legacy readers get legacy grants only; zero-domain
fingerprint remains byte-compatible. One current owner root plus matching
reviewed field seal supplies the exact domain/environment; no union, role
shortcut or TS receipt grants app permission. Relevant ordinary resource DENY
conservatively blocks a domain read where entity disjointness is unproved.
This can over-deny an invalid-ancestor leaf and is explicitly not a claim of
ancestry-exact availability. Do not weaken it using unqualified entity relations.

`evaluateManagerDomainRead` is DB-only in the caller's short writable READ
COMMITTED transaction, same singleton/workspace/current actor/session/policy
locks and xid. Returned scope is not post-transaction authority. No approved
Manager grant/seal is installed and no operational domain issuance route is added.

`NativeReadEgress` owns one finite GET/HTTP1 response, not SSE. Same-instance
opaque reservations and observations cannot be cloned or reconstructed after
restart. The body is intrinsically copied before hashing. FINISHED means local
finish/empty queue/currentness, not browser ACK. Admission remains held until
both captured response/socket close and are destroyed. Later actual closure
creates a NEW observation; it never upgrades a prior UNKNOWN. Its structural
permit interface is trusted composition plumbing, not independently authenticated
authority; the lifecycle must supply genuine current source/app/Core fences.

## Current source impact — code-only, not qualification

Read-only PM observation20:32UTC pinned
`2747e91cd9b292cb44e60ca6d148ac19dd6e82e1` in the existing HK PM worktree;
provider WIP SHA256
`1e8e5074989202e1792a3b8cc51ff649d8e78fccf1dc9f078e39b4b2019c2528`.
Private receipt `source-repin-2032.md` SHA256
`d3040e22125f5dd8e65a4d9eeebc64a499e72599b1ee6946d4d3187052799896`.
Delta adds closed `pma.manager-read-intent.v2` scoped-notice/frame axes and
draining. Existing v1 five finite intents/six-route result DTO remain unchanged;
this batch preserves v1 and explicitly does not accept/qualify new v2 SSE input.
No source runtime, actual grants, trust, DB/API rows or operational credentials
were read/changed by that code observation. Older source pins remain historical.

## Validation, resources and cleanup

New proposed cases: source43, domain25, finite egress63. These counts are test
definitions, **not PASS or additive to prior peer receipts**. Run one focused
group with actual disposable PostgreSQL, actual local TLS and finite HTTP plus
unchanged custody/client/codec/current-human/access regressions. No new case may
be skipped for lack of its required DB. Affected API build is required; normal
hook once for the coherent landing. Keep failed attempts and exact source hashes.

Reviewed `native-lifecycle-primitives-gate.py` derives from the hash-checked
bounded reader controller: shared measurement lock,4CPU/4GiB/8GiB transient,
one owned Node/PG/internal network, no host ports; scoped restore/four access-row
digests; eight protected runtime tuples; exact teardown and lease release.
Current actual results/resources: NOT_RUN / NOT_MEASURED. Correctness ceilings
are not approved production budgets, latency/capacity or coexistence evidence.

### Focus attempt 1 — build refusal preserved

`native-lifecycle-primitives-focus-204958` ended20:53:13UTC with exit2 before
the test runner: TypeScript TS2564 on constructor definite assignment of the
validated egress limits. No test is counted as PASS. Log SHA256
`717ad51557619d379f1dc4eb44ca77812498ea444c01377bbb65d3d12e8a0b4d`.
All frozen source/index/eight protected runtime tuples were unchanged and all
three owned container/network resources were absent after controller teardown.
Correction: the constructor assigns a validated, frozen return from `limitsFrom`
unconditionally; invalid configuration still throws the same typed refusal. No
definite-assignment suppression or validation bypass was introduced. A new
focused attempt must pass before landing; the failed record remains immutable.

<a id="focused-terminal-20261017-210005"></a>
### Focus attempt 2 — actual terminal21:00:05UTC

`native-lifecycle-primitives-focus-205441` is **PASS**: API build;
**15files/727tests PASS,0fail/skip** (runner123.78s), including all new
source43/domain25/egress63 cases. The7domain PG cases used actual disposable
PostgreSQL, six source actions used actual local TLS, and egress used real local
HTTP/socket events. These are local synthetic authority fixtures, not actual PM
business grants or an installed source service. Do not add subset counts to727.

Scoped restore and all four access-row digests passed. Frozen source/index and
eight protected runtime tuples were unchanged. Owned Node
`control-api-test-node-2334526`, PG`control-api-test-postgres-2334526` and network
`control-api-test-net-2334526` were all absent after teardown; the exact measurement
lease was released. Controller ceilings4CPU/4GiB/8GiB remain TEST_ONLY, not measured
production capacity. No service was restarted and no operational authority changed.

Log SHA256`13ef964dfa10ba8ee6739db85eac7938209aeb5e16c6c50a1d16152626dc4681`;
controller SHA256`6553a99181cda82239a7f2efd58c3331e5c5fe05c1d3f101bea2dee623efe9a9`;
tested egress source SHA256`16e282b5e5d2b79ea3bbba8ad8ca0538dc361324dedd6fe53f19aae29021dad5`.
Normal-hook landing remains pending. No additional runtime/browser/calibration
gate is promoted by this result; the build-refusal record above remains retained.

<a id="domain-temporal-review-20261017"></a>
### Independent temporal review and interrupted first landing

The first own normal-hook attempt `native-lifecycle-primitives-land-210438`
was deliberately interrupted before a commit when an independent actual-PG
regression exposed a missing fixed validity boundary. Controller terminal
21:05:38UTC is **FAIL_OR_INCOMPLETE / INTERRUPTED_FOR_AUTHORITY_FIX**, not a
normal-hook PASS. HEAD remained `c730729e`; source/index and eight protected
runtime tuples were unchanged; no owned resources remained and its lease was
released. The controller SHA256 is
`19493f60adf8dbc6c9ac097561becc4a5bddfda0de0e625d98d863682e59362d`.
Its recorded log digest preceded the last shutdown output; the retained final
log SHA256 is `280d86e59b667159e77b2f199d35603ce75d94781eb4b5faffbeccbb78fbdd62`.
Neither log is rewritten as successful qualification.

NDT-01 is **ACCEPTED_FOR_IMPLEMENTATION / IN_PROGRESS**: a current Manager
decision previously ended only at session/chosen grant/chosen seal expiry.
Already stored future DENY, legacy ancestor/receipt and field-seal boundaries
can occur earlier without a write or fingerprint revision. The amendment caps
the decision at the earliest strictly future fixed timestamp across captured
same-workspace grant/receipt/seal facts. No sliding now+TTL, source query,
permission union or new await is introduced; current selection and ordinary
zero-domain authority bytes stay unchanged. This intentionally conservative
workspace-wide clamp can require early re-evaluation for unrelated actions,
subjects or environments; it does not claim target-exact availability.

Independent review read the exact59-line source proposal
`6548b4c9d9c4d8a5ff119812eab3c245ad93564a9eaf6ce325642b43fe5fd363`
and accepted it **SOURCE_ONLY_WITH_TESTS_PENDING**; full private review
`NC02-DOMAIN-TRANSITION-REVIEW.md` SHA256
`5ca2372a7b900e1dab5d4daef5e570354a9d8ab8c8ef94b8fb572dc4f6f6dea4`.
Done-when: six boundary classes on actual disposable PG, stable scope before a
transition, equality denial/old-scope refusal and original current-human/legacy
regressions, then one coherent normal-hook landing. The earlier727 PASS remains
valid only for its exact tested source/coverage; it did not cover this defect.

NDT-02 is **CHANGES_REQUESTED_WITH_REASON** on the peer test harness only:
two name/role negatives changed actors without updating fake active-principal
facts. Production correctly refused `CURRENT_ACTOR_AUTHORITY_REQUIRED` before
missing-grant denial. Correct the fixture, never weaken actor checks or infer
Bobby/Stan permission. Independent peer failure/repair receipts are historical
evidence, not a PASS for this canonical amendment. No Claude acknowledgement is
inferred from the independent source review.

Canonical regression definitions preserve the original25 and add21: the
private test proposal `83ae48fcb969cf35987361363dad2485f673336cf6ea4647c37a30a293d01851`
supplies six pure fixed-boundary repeats, two exact-DENY equality checks, valid
legacy ancestry, null/past timestamp behavior, six actual-PG boundaries and
separate explicit owner/nonowner facts. Primary additionally covers ordering/
duplicates, foreign-workspace exclusion vs conservative same-workspace bounds,
unsafe baseline refusal and an actual half-second benign transition with no
intervening write that rejects the old expected scope. All additions remain
NOT_RUN until the changed-domain gate. Unchanged TLS/HTTP source/tests reuse
the exact focused receipt above; the coherent normal hook remains mandatory.

<a id="domain-focused-terminal-20261017-211440"></a>
### Amended-domain focused terminal —21:14:40UTC

`native-lifecycle-primitives-focus-211049` is **PASS**: Control API build,
**4files/201tests PASS,0fail/skip**, runner38.63s. Included domain46 cases contain
15 actual disposable-PG tests; all six fixed-boundary classes and actual benign
time transition/old-scope rejection passed. Other files are access-policy63,
current-grant-relations72 and workspace-authority20. These subsets overlap prior
receipts; do not add201 to727 as independent coverage. No fixture value is an
installed source permission or production calibration.

Exact amended source SHA256: access-policy
`ac072eafe31e4da83e51f7a7cc6900653b7bffc58ca999bf82982a65b329534e`,
snapshot `cece7955df57ced17dd60407b4a8718d361e48418e873fcb71ad7ec75cd73feb`,
domain spec `4410899edc9827e33e1283995e019e7cdc15585581478150c646208269c2e4ae`.
Applied-source independent review accepted/tests-pending at review time; private
retake SHA256 `218c5861acd7816b2f0c63e682f76687b57e1d91cff9363247bc012c3cdab8b2`.
NDT-01 is locally VERIFIED by this gate; producer delivery remains pending the
normal-hook commit. NDT-02 changes no production actor semantics.

Scoped restore/four access-row digests, frozen source/index and eight protected
runtime tuples passed. Owned Node/PG/network2414906 are absent and the exact
measurement lease was released. One live sample, not peak: Node1.204GiB/3GiB,
PG69.69MiB/1GiB; ceilings4CPU/4GiB/8GiB remain correctness-only. No operational
identity/grant/trust/service changed. Log SHA256
`4d5b87d8a990b1ab423bad7d3510e86d348d684c9b87eb62ad17affdaec83c44`;
terminal controller SHA256
`5d175cfbfb6a0fd3a055e959529d7f51fa02bc7a64b4ec67753824d3aa6ff7b8`.

Normal hook runs once for this coherent amended batch. Preserve both earlier
failed/interrupted attempts. Existing TLS/HTTP source and tests are unchanged;
their focused source43/egress63 result is reused with the prior exact hashes,
not a claim that those tests exercised the new domain horizon.

## Remaining backend / Claude / exit / rollback

Next backend: integrate these primitives into SAME NC-01 obligations, not a peer
replacement ledger: mandatory domain admission, exact native JWT signer, genuine
ISSUE/ENTER persistence, reserve-before-SENDING with physical COMMIT ACK/pool
release, actual final-egress witness, immutable terminal, positive authenticated
same-attempt cancel/resolve ACK before releasing custody. Lost ACK/restart must
never invent a held handle, resend protected bytes or TTL-release UNKNOWN.
All source/signing/socket I/O remains outside Core locks. Actual dependency-closed
Core/source configuration/trust installation is a separate mandatory proof.

Independent source-only lifecycle review has been read in full: private
`NC03-LIFECYCLE-REVIEW.md`,193lines, SHA256
`42c6981d905d874879e7be4ae7c993a0e1898292e2480ad80a3e6b1ba6536ece`.
Its earlier PM source pin is historical; the20:32 observation above is newer.
Four findings are ACCEPTED_FOR_IMPLEMENTATION in the SAME next lifecycle work,
not a new phase or a Claude acknowledgement:

- NC03-P1: terminal/retired rows without positive source ACK must still block
  shared capacity, raw authority writers and drain. Done when actual PG tests
  prove only authenticated matching cancel/resolve ACK clears the obligation.
- NC03-P2: consume genuine selected-source WeakMap observations, never prototype,
  spy/DTO or promise resolution as release. Done when actual TLS wrong-action/
  source/clone/Proxy observations cannot write an ACK or obtain send authority.
- NC03-P3: preserve original microsecond/offset Base and cap send by earlier
  actual source expiry; integer JWT exp cannot extend independent authority.
  Done when real signer/TLS/PG round trips cover precision and expiry ceilings.
- NC03-P4: no recovery terminal from restart/retirement/destroyed booleans.
  Done when actual PG ACK-loss plus owning HTTP witness preserves ONE immutable
  receipt and no resend, while a new process without that witness stays pending.

All four findings remain **NOT_RUN / NOT_DELIVERED** for lifecycle integration.
The reviewer made no shared writes, tests or network calls. Reuse the peer's
bounded reservation concept, not its alternate ledger or unsafe release predicate.

Claude: no new public field or design request; existing six-operation fixture
handoffs remain `AWAITING_CONSUMER_REVIEW`, UXM owner-held. Any later reviewer
finding returns to this packet with locator, disposition and affected test.
Full10 budgets/calibration/coexistence/original P184 G2/browser remain OPEN;
11NOT_ENTRY_READY. Local primitives passing does not close native commissioning.
Rollback: keep unmounted/exclude candidate composition; never delete existing
obligations/audit/source bytes, operational data or grants.

<a id="normal-hook-terminal-20261017-214415"></a>
## Coherent normal-hook terminal —21:44:15UTC

Landed `43e877fd5801cf710df164184ef1c342bb52bcc8`,15files +2686/−12.
Controller `native-lifecycle-primitives-land-211636` exit0/PASS:67contract
files/791tests, API build,379API files/6192tests PASS;2existing skipped files/
3existing skipped tests. API duration1258.03s. New domain46/source43/egress63
are152 of6192, not additional coverage;727/201 focused receipts overlap them.
NDT-01 locally verified and delivered; historical failed/interrupted runs stay.

Scoped PostgreSQL restore/four access-row digests PASS, frozen source/index and
eight protected runtime tuples unchanged. Exact owned containers/network absent
and own lease released. Log SHA256
`5defcb842382bb33726c9ca7e7326a155338edb7e5b28dd612fb23fefe42fdab`;
terminal controller JSON
`9670e3ce1be70d8ac13718693da9c6c54e34a17e51487713a1c86a53d151e8ae`.
This supersedes pending local landing, not actual source/native authority.

Next accepted P1–P4 implementation and affected proof live in the SAME phase's
[NC-03 lifecycle packet](native-read-lifecycle-integration.md). At preparation
APPLIED_UNCOMMITTED/NOT_RUN, no real source installation or public/Claude field.
Cold ENTER reply loss without genuine HTTP witness remains pending, not a
fabricated abort. Native commissioning, budgets/calibration/coexistence/G2,
assigned browser proof and11 entry stay open. No runtime/push/deploy change.
