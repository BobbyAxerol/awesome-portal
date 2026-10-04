# P24 current-candidate continuation — 2026-10-04

Status: **AFFECTED_READS_AND_IMPORTED_EXECUTION_ACCEPTED; FULL_PRODUCT_OPEN**.
Portal release target is **v2.0.0**; the normal QuantBT runtime remains **1.1.1**.
The isolated 1.1.0 compatibility proof is not a Portal version downgrade.

## Scope and preserved work

Parent `b7e0b867` already retains Claude's `3fdd3349` and §32 repair. Work is
on `codex/be-gaps`, with fast-forward landing to `docs/research-loop-plan` only
after verification. No push, dev/main merge, production release or restart of
shared preview `8095` is implied. No stylesheet, layout, typography, visual
baseline, protected kernel, Execution schema or historical seal is changed.

Independent lanes and actual evidence:

- [Exact engine transition](./P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md): real
  old in-flight 1.1.0, new 1.1.1 and exact old-input reproduction; 3/3 completed,
  9/9 retained files verified. Local-only qualification, default111 unchanged.
- [Consumer completion](./P24_CONSUMER_FINISH_2026-10-04.md): existing workspace
  and named metadata binding, audit applicability, nullable publication time.
- [Scenario closeout](./P24_SCENARIO_CLOSEOUT_2026-10-04.md): all 24 scenario IDs
  remain; actual/scoped/fixture/not-run outcomes are distinct.
- [Imported DRAFT execution and browser](./P24_IMPORTED_DRAFT_API_AND_BROWSER_2026-10-04.md):
  one new actual child, seven named API reads200 and three real browser pages.

## Newly discovered actual backend defects — repaired

### Historical Search incorrectly depended on new-job admission

The first owned8096 read returned 503
`RESEARCH_CURRENT_SOURCE_UNAVAILABLE`, "Retained search relation exceeds its
sealed bound." WFO022/023 each had an intact immutable census of 400 trials,
but the reader allowed only 64 when the *new long-job admission* flag was off.
This was not `P22_CURRENT_SOURCE_CHANGED`, artifact corruption or an engine gap.

`current-source.repository.ts` now uses the sealed trial census, retaining the
absolute 400-row SQL bound. `assertSeal` and new-job admission remain flag-gated.
Regression proves existing400 read, new400 refusal and existing401 refusal,
with no INSERT/UPDATE/DELETE. No cap was increased and no rows were altered.

### Contradictory study fields accepted by preflight

The real SC04 crafted request previously returned 201 for a native `n_trials`
override conflicting with top-level `optuna_trials`. Intake now rejects
conflicting `n_trials`, `seed` and `early_stopping_rounds` at their exact typed
field paths. Identical native values and absent overrides remain valid;
`optuna_trials`/`random_seed` are rejected as non-native override keys.

The published OpenAPI documents this semantic check. P02's frozen structural
schemas are unchanged: cross-property equality is enforced by intake, not
pretended to be enforced by JSON Schema alone. Focused Control tests **26/26**
and the Control build passed. The frozen-schema contract check passed; a new
Freeze test initially used an inline schema instead of its actual `$ref` and
was corrected before the grouped normal hook.

## Actual affected GET retake

Owned project `portal-research-p23-ol12`, loopback8096, worker stopped. Fresh QA
`p23-reader-95` authenticated normally, exact existing workspace memberships;
no Bobby password/activation reset or authorization bypass.

`p24-candidate-read-receipt.mjs measure ... final-01`: **56/56 checks, 38 exact
API responses PASS**, covering WFO022/023/027, P04-022 and the retained imported
DRAFT run. Search400 is readable with new long-job admission disabled. Compare
preserves preflight manifest scope and names its distinct source-artifact
digest; current-source revisions distinguish source from presentation; Report
states captured revision scope; publication clocks are stable across GETs;
Report/RC explicit audit applicability agrees. Jobs, selections, artifacts,
source seals, Reports, RC packs and publication intents are unchanged.

| Private receipt | Raw file SHA-256 | Outcome |
| --- | --- | --- |
| `p24-candidate-read-receipt.json` | `b84dd449cf441dcd8053e61dc057b23eda7bd7db09a5cdff3c6556102f16a0a9` | initial historical Search503, preserved |
| `p24-candidate-read-receipt-final-01.json` | `b5dc22c8c8a343e997695f0ab2726af6ac679bb69f38161c5c375bb1dd17c6c4` | 56/56, 38 responses, unchanged custody |

Private root: `/home/bobby/.local/state/portal-research-p23/20261003/nonreuse-r020/`.
Raw-file hashes above are distinct from `JSON.stringify` response digests.

Control image `sha256:108c7d604b67ad34f201bbb0c485ad1770e0db7cecab3042900ab80e94cc07c0`;
Python image `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738`.
The read retake does not attest a later rebuilt browser image. Browser source
scope findings are recorded below and in the consumer receipt.

## Browser-discovered shared workspace defect

Scenario r03 proved browser Search requests omitted workspace and returned404 while
the same QA's explicitly scoped named API returns200. The grouped audit found
the same omission in Evidence, Split, Freeze, Execute and New Run subordinate
reads. They are corrected at the supported route/hook boundaries, not
by rewriting intercepted test requests or loosening server object authorization.
Prior failed r02/r03 browser traces remain preserved. The shell's cold-link
label reader and breadcrumb required one further scope fix, independently
retaken: Evidence9reads/23links and cold S05eight requests/10links PASS.
Filter-clear was an initial harness selector error, not an invented product
button; retake used the actual empty-result action. No design/golden changes.

## Genuine imported run, not a direct-engine substitute

`rrun_534c60ecb6337bb1503e48f8726142b7` ran through actual Portal parse/gates,
DRAFT registration, missing-pin refusal, exact-pin preflight, create202,
confined QuantBT1.1.1 child and P05 materialization. Job SUCCEEDED; Progress
COMPLETED/READY. Actual tape338bars/1trade; OOS ending equity20000. Seven
downstream GET200 and actual Progress→Report→RC browser3/3 PASS. API actor97
and ordinary USER/MEMBER browser reviewer99 are distinct; this is not a full
GUI-import or same-actor receipt. DRAFT remains inactive/unpublishable.

Raw API receipt `016dd44fc52348683effdefe3e5eb4e5c03d87e952904492d48e630e9d763db2`;
GET-only resume `b16d127c2c91ea321862ff2eca9b1c403d9f2567175c234d2a076ef671287659`.
Earlier HTML/API response matcher failures are preserved in the imported
packet. Exact API prefix/method/status/run matching is now regression-tested;
no producer/authorization change was made to disguise those harness failures.

## Additional read-truth repair found by the real child

The legacy registry-v1 `BENCHMARK_RETURN_FRACTION` had value:null and
origin/scope NOT_PUBLISHED, but inherited AVAILABLE from genuine analytics-v2.
The legacy metric now returns `NOT_PUBLISHED /
P13_LEGACY_BENCHMARK_USE_ANALYTICS_V2`; the actual v2 value and cleared benchmark
source gap remain AVAILABLE. No fake0, seal rewrite or v2 fact erasure.

One focused regression PASS (11 deliberately skipped), affected Control-only
build and one real GET on the already-authorized retained imported run PASS.
Jobs68→68. Final Control image
`sha256:7999e4ae2005b9beb25f3c3e5497c89fc228473f36de73fc30d0b45b2fec4fd0`;
raw receipt `a431d2a5ff9ac72e7625a0df4d4334f7a5aa788d10ab461a8b312e706ec31958`.
Old session401 required normal own-password reauthentication; QA95 did not
belong to the new QA97 workspace and its404 was respected. No membership grant
was added; the positive retake used its existing authorized run. This narrow
read amendment does not retroactively relabel earlier browser images.

## SC23 actual consumer defects, closed without a new backend phase

Independent source review reproduced global `sessionStorage` draft A being
restored with workspace B. Scope is now a versioned key/envelope of named
authenticated principalId plus explicit workspace. Different actor/workspace
returns no draft/chip; original A resumes. Missing scope disables persistence,
the form still works; legacy unscoped drafts are refused, not migrated. Clear
affects only that scope. Route actor/scope changes remount the state boundary.

An old create response could also repopulate the receipt after editing the
declaration. Generation/declaration/workspace fences now reject stale ACKs and
refusals; synchronous request lock prevents double-submit. Exact unchanged
intent may retry after a lost ACK. Mounted-state guard prevents late state
updates. No accepted server job is cancelled or rewritten.166/166 affected
tests and TypeScript PASS; final guard/tooltip retake43/43. These are focused
logic proofs, not a fresh multiuser/CAS browser or full SC07/23 verdict.

## QA expiry and compute custody

QA95/97/98/99 independently read back DISABLED with active sessions0. QA95/99
private passwords were removed, browser contexts closed and worker stopped.
New imported job SUCCEEDED; historical fixture
`rrun_5e1185f847dddd418bdbd1f9f32b87c7` remains QUEUED/PENDING with null worker
attempt. It is intentionally preserved, not dispatched/deleted or described
as zero outstanding jobs. Pre-teardown custody raw hash
`319cd277b4645a8f0f74deeda1cd865ef6f30461b75f5ca1fb50deb5c3118723`.

Exact C4: seven owned containers removed, owned containers/network0 and ports
8096/8097 free. Three cloned DB/artifact/NATS volumes, backups, immutable bytes
and rollback images remain. No broad prune, business deletion, production or
shared8095 operation. Raw cleanup receipt
`4b7805b73417fc3e4f0a5b8fefd22466fc999db1f20f14204ac2dd45f4dfbc0e`.

## Final unsigned source candidate and evidence scopes

[Candidate v6](./current-source-candidate-manifest.v6.json) retains v1–v5 and
all prior failures, explicit Portal2.0.0 target and normal QuantBT111. Final
Web image `sha256:a8ab07cfb8151235b5a64913b174c783e708f1a1f2be2bcc3b7ef8bb145a1618`,
bundle `/assets/index-Dnh6trS5.js`, SHA-256
`fecdee87d6efb13c0b4d02efd7739913ea6e8f64a30c338282298d41e075e7a5`.
Final Web build/static HTML+bundle200 smoke raw hash
`d03a6311a1fa241d5d79509433088e2c3383dccdb087103fddbd48eac936feef`.

This last build contains the narrowly tested SC23 draft/create fences. Its
static transport smoke is not authenticated product acceptance; earlier
passing real browser cells keep their actual image pins. Source base
`b7e0b867235df31e98e1d168d0646015520b171c`, dirty-at-build, 74 changed runtime
inputs sorted as `{path,sha256}` and JSON-hashed:
`df22c700f6ca2537c3adb72adc96d4958e758785c547e9b40a99484081f4bb90`.
No frontend broad suite, full visual baseline/load/DR or HMD rerun was needed
for the final guard/tooltip/metadata updates.

## Verification and closure constraints

Only changed Control/Web dependencies are rebuilt; the frozen Python image is
reused. Unchanged load, restore, HMD recomputation and signed-release gates are
not rerun merely for docs. One coherent commit uses the mandatory normal full
hook without bypass; its successful normal Git commit is the commit-bound
gate receipt, not a claim that an unperformed release workflow passed.

The first normal commit attempt stopped at contract tests267PASS/1FAIL: the
new finite-engine assertion expected an unparenthesized generated union,
while the actual generator correctly emits `(110 | 111) | null`. Only the
test's exact finite-union formatting assertion was corrected; OpenAPI,
generated type, product source and frozen images were unchanged. The failed
hook log is retained privately; normal hook must pass on retry. No browser,
HMD/engine run, full frontend suite or image rebuild is repeated for this fix.
First hook raw log SHA-256:
`793b56aaf757ca6d1b4662b7677e7f28801ef41becdb1742222a2dd6b0ecff93`.

Second hook attempt passed all268 contracts, then caught a dependent generated
Dataset Index copy still carrying the old RequestedSpec description. Canonical
index/type/snapshot are synchronized; `generate:research-preflight` now chains
its dependent index target so future single-target regeneration cannot leave
this drift. JSON comparison proves exactly one description path changed;
generated declarations are byte-identical after comments are removed (SHA-256
`20e9968912b199c6287d7fa1edd5124c3b8b6776c35fb5f5a02afd183494fa41`).
No runtime schema/type shape, bundle, source fact, image or browser proof changed;
no new rebuild/recompute is warranted. Failed second hook raw log hash
`61f5136366d8c72467838594e7a476e7f39fd76fa982dd6e342184a146d3c6ac`.

Historical strict integrity stays **83/86**. Bobby approved an exception for
exactly three old test runs; no original bytes are synthesized, seal rewritten
or 86/86 claim made. Full P24 mandatory scenarios, owner visual acceptance and
signed release remain distinct from these scoped results. The remaining
mandatory scenario branches are GUI producer→worker round-trip, draft/multiuser
CAS/late-response edges, publication timeout before/after ACK, and post-child
re-export/GC. Their existing backend proofs are reused only in unchanged
source scopes, not promoted to unperformed browser/full-scenario PASS.

## Additive write-edge continuation — actual defects, not additional phases

The third normal hook was deliberately stopped before commit when an
independent consumer review found a real in-flight preflight defect. Exit143
is not a failed product test or a successful commit. Its preserved raw log
SHA-256 is `23561451b7fab3dec322d2ad113dc2050616ccf3c3aa1323b098b683f6727aac`.
No hook bypass or repeated engine/load/restore run was used.

### Late preflight response and restored declaration

`usePreflight` now fences resolve/reject by declaration, workspace, generation
and mounted state, including requests begun before any token exists. Duplicate
request locking and held-token workspace invalidation preserve server facts.
Affected preflight/create/NewRun batch: **139/139 PASS**, typecheck PASS.

The first normal-login harness assumed200, while the actual login returns201;
it stopped before product writes. The preserved r02 browser then proved
actor-local draft/CAS, but discovered restored S02 parameters erased when the
registry arrived late: adoption was marked complete before a matching version
declaration existed. It sent no preflight/create to the server. The actual
consumer now waits for that exact entry and re-applies only same-version,
actor/workspace-scoped overrides; explicit clone/fork pins remain authoritative.
Focused QA02b/W2a **65/65 PASS**. No request interception rewrite, substitute
sample, admission weakening or UI design change is used.

### Archived Report versus optional companion representation

The first finite publication/export attempt saved one ordinary USER's two
truthful RC declarations, then refused sealing: `P21_REQUIRED_EVIDENCE_MISSING`
with `P21_RETAINED_REPORT_NOT_SEALED`. It produced no RC pack, publication, R1,
export or compute job. Immutable parent/child custody remained unchanged.

Independent SELECT proof SHA-256
`137ac95f0dffc9312fdfd6c75dfc641ef6c00bbbf2c5c07d3b0001dcc69252d6`
shows the captured Report Evidence revision equals the compiled stable source
revision and all five source digests match the current retained seal. Only the
companion-enriched presentation revision differs. P21 previously rejected this
valid archived Report because it compared only the current read representation.

Compatibility now admits either the exact current representation or the exact
stable base-seal revision, **only with a verified sealed Report and all five
non-null manifest/transform/requested/effective/dataset pins still matching**.
It refuses arbitrary historical presentation hashes, missing/changed pins,
other-run and forged seals. Report bytes and archived revision are never
rewritten. Retained/companion regression **37/37 PASS**, Control build PASS.
One initial focused test exposed the helper's intentionally optional-null
semantics; the new required-report-pin check fixes that before runtime retake.

Fresh write-edge QA accounts are USER/MEMBER only in the exact test workspaces;
no ADMIN/OWNER/R1 authority is granted. Worker stays stopped until the one
bounded GUI intake is verified and the publication lane has finished. Fresh
write receipts, final image pins and final account/C4 cleanup will be appended
below; previous cleanup/build/browser scopes remain historical, not current.

### Real write-state, producer and export outcomes

On the final owned candidate Control
`sha256:47a6cd0241358bc6249538d483809eba02ec21ae33ba120a523e5d1cddcc2ce3`,
Web `sha256:08f4df00dc80e4b3f708e57e141ee3c2881db32c1f9524474e4509ea0ac175ae`
and unchanged Python/worker `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738`:

- SC23 real draft isolation across actor/workspace, delayed real preflight
  response and two-tab actor-local CAS PASS. The stale write returned409;
  actor B's separate draft did not overwrite actor A. USER create refusal is
  `RESEARCH_RUN_CREATE_FORBIDDEN`, not an unsupported engine/profile.
- A distinct temporary QA ADMIN, required by existing P10 admission, performed
  the actual GUI continuation. No human account, RBAC or existing USER was
  elevated. Exactly one preflight and one fixed pinned job;
  `rrun_144e04e13c07b5d65ca5a915b6e4e743` SUCCEEDED/COMPLETED/READY. Double-click
  allocated once; editing before ACK preserved the edited form. Requested,
  effective and persisted producer/preflight values and digests agree. Raw
  browser receipt `8bd763ae1b5826582cc04f55e558214b625955a003f2b0fb9ccb912ca6eb9bad`.
- SC19 actual browser ACK loss before forwarding created no intent/R1. ACK
  loss after server commit plus exact payload retry created one publication
  and one R1, with a replayed response and unchanged effect. Candidate
  `rc_06GGD779ZN6WBGY4Z947J9H9X0`; no approval decision, promotion or Trading
  operation. Original ordinary publisher's full R1 mirror stays honestly
  DENIED. Its publication receipt remains readable.
- Two prepared exports completed, JSON109180bytes and CSV8590bytes. Actual
  private downloads match declared byte hashes
  `ee778d2dbf123b80a0a5da3aa084423026eb08a6d410f45572656e9d75da2176` and
  `c2a24822700701e30e74493ceb54ad631e37aaa83705b4ba070f16b1a010f2bf`.
  Final **26/26 checks PASS**, raw
  `5255c037306cbc6956b1ad20f798bb818033cdfa6d9c954df6b81f709ee2bb2c`.
  It proves same sealed Report/child/RC, named Alpha Lineage and GC exclusions,
  not a new restore or deletion. Immutable custody is unchanged.

The first successful publication/export run's test parser failed on ANSI Nest
startup logs **after** completing the two exports; r02 SHA-256
`826f1360efd1bd3a63b093d57a428a3b80ccb0dc83aa2f839c8d29161fd54ba7`.
The first GET-only continuation then hit an incorrect test-harness Lineage URL;
r03 hash `1bc7a61a26fe42e02fc60fb9ecf2dba56992785df516f5ee30f792050e2a9792`.
Both failures are preserved. The final continuation uses the canonical named
Alpha Lineage operation and original r02 checksum; **zero repeat job, export,
RC, publication, R1 or CLI effects**. Unrecorded original CLI stdout is declared
NOT_RECORDED, not assigned a fabricated hash.

The worker's optional `quant.run.succeeded` JetStream notification encountered
`NoStreamResponseError`. The existing non-authoritative notification guard
preserved durable success; P11 relay/HTTP read reached COMPLETED/READY.
This receipt does not claim successful delivery to that optional stream.
Worker was immediately stopped; the old undispatched fixture remains queued.

Final Web bundle `/assets/index-yatIkhOa.js` SHA-256
`1e3517a58cbd8ff4857a03374e5cee1d5a72ec2b0b065ef028080fa5ab6e93db`.
Changed build-input selection now covers91 source/generated/FE test files,
sorted `{path,sha256}` JSON hash
`a1be2fb555f175a6e1b6f6e3655291fdb59167d23a8f7bb6aa453e47357c9699`.
Selection is `apps/control-api/src`, `apps/portal/backend/src`,
`apps/portal/frontend`, `packages/contracts/generated`; it is explicit current
dirty-source provenance, not a signed image/release attestation. Earlier74-input
scope and earlier real image receipts are retained above.

### Independent actual-child bytes and final enforced QA/C4 cleanup

The GUI child's sealed `config/request.json` content-addressed blob equals its
actual browser request; requested/effective digests, imported version, seed42,
one trial and scale1000 agree. Actual child111,338bars,1trade,OOS20000,
holdout0. Five sealed documents and three retained-file hashes verify, and the
child receipt equals both retained and bundle copies. Independent raw proof
`ac033eada208a7d3a47f176ff11f00068917f411c9a4a3b474513456ccc2be15`.

At11:28:57UTC all four fresh actors (`p24-edge-a`, `p24-edge-b`,
`p24-edge-publish`, `p24-edge-producer`) were normally disabled, sessions0,
passwords/cookies removed from actor/combined private configs. Raw
`a54f707bc3ce00564998e033a96851571911f0021fd8ee4a038f64a1195ab1f8`.
The producer's15-minute deadline was an operator guard, not a falsely claimed
auth TTL; actual disable/revocation happened before it. All four earlier QA
identities remain disabled too. No human account/R1 authority was changed.

Final C4 removed exactly seven owned test containers and one network;
8096/8097 free. **All four mounted volumes retained**: three cloned DB/artifact/
NATS volumes plus the owned Roadmap SQLite volume. The first read-only cleanup
oracle expected only the three clone volumes; inventory identified the fourth,
and explicit four-name preservation was then verified. Nothing was deleted to
make the count pass. Backups, immutable bytes and rollback images remain;
no broad prune, shared8095 or production action. Final capacity174GiB free,
~15.2GiB available memory; no further cleanup needed. Raw final C4
`70ad858ac2b9516109b097279955ef286b5098187b7e32a08900e8e35df66ddb`.
Pre-teardown memory360292352bytes / six active services; worker already off.
Original undispatched test fixture remains QUEUED, never dispatched/deleted.

These close the named GUI/draft/CAS/late-response/ACK-loss/export branches.
Full24 mandatory scenario acceptance still distinguishes remaining scratch/
widen/budget variants, explicit fresh browser audit allocation and multiuser
holdout/post-approval corruption from scoped/canonical proof. Owner visual
review and a signed Portal2.0.0 release are not inferred. No additional backend
implementation blocker is discovered in the completed lanes; neither an old
false approval gate nor a fabricated all24 PASS replaces the remaining work.
