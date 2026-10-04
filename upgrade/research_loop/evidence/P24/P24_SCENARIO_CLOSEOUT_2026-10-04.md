# P24 §16.6 — isolated candidate scenario closeout

Date: 2026-10-04 UTC. Owner: Codex scenario lane. Scope: a single Chromium worker
against the owned `portal-research-p23-ol12` clone at `http://127.0.0.1:8096`.
This packet does not authorize production rollout, change engine facts, approve
an owner exception, or mark all of P24 complete.

## 1. Oracle and protected boundaries

Harness: `scripts/research-preview/p24-scenario-closeout.mjs`; focused guard tests:
`scripts/research-preview/p24-scenario-closeout.test.mjs` (5/5 PASS).

Every main scenario-sweep receipt preserves all **24** mandatory rows from Guide §16.6. Focused additive lanes below retain their exact named branch scope without shrinking that aggregate denominator. `PASS`,
`SCOPED_PASS`, `FAIL`, and `NEEDS_RUN` are distinct. A technical fixture is
explicitly labelled `TECHNICAL_FIXTURE_BROWSER`; it is never a QuantBT/HMD run
receipt. Unexercised branches remain named and cannot silently disappear.

The harness rejects shared preview `:8095`, remote/prod origins, an existing
human identity, changed Origin, an unknown scenario id, and a non-private
credential file. It uses the ephemeral QA identity prepared by the lead.
Credentials/cookies remain private and are not written to this packet or logs.
All product deep links carry the exact workspace. Direct API probes replay the
same real session explicitly because Playwright's API transport otherwise drops
Secure cookies on HTTP loopback; production cookie configuration is unchanged.

Read scenarios abort and record every non-GET browser API request. Before/after
read-only custody checks compare row counts and deterministic row fingerprints
for 12 Research tables: alphas, alpha versions, attempts, runs, jobs, selection,
artifacts, current-source seals, immutable report manifests, RC packs,
publications, and promotion picks. Operational SQL is a test oracle, not a
browser data source. No worker is started and no accepted run is submitted.

Explicit negative probes are limited to parse/gates telemetry, stale-receipt
registration refusal, and preflight metadata. Browser S14 can parse and run
gates, but valid registration, activation, and create-run are never allowed.
Images, bundle, source dirty state, response hashes, requests, typed refusals,
screenshots, and custody fingerprints are retained privately.

## 2. Initial failures are retained, not rewritten as PASS

Bootstrap output: private `20261004/p24-scenarios/`; the API transport did not
send its Secure cookie. A real Chromium same-origin check proved the login
was valid. This was a harness issue, fixed without weakening app authentication.

First full probe attempt: private
`/home/bobby/.local/state/portal-research-p23/20261004/p24-scenarios-r02/p24-scenario-receipt.json`.
SHA-256: `72f11e23ca98423f471f8537955aef652ddd3276fbaaef00a7a14e351220a442`.
Checkout HEAD: `b7e0b867235df31e98e1d168d0646015520b171c`; `source_dirty=true`
is recorded, not represented as a clean release candidate.

Initial images and bundle:

| Service | Exact identity |
|---|---|
| Control API | `sha256:9a0487e8b6615f72a0c1d7e56568a286153c97b061d1d42b82e3d91f7451ef13` |
| Python API | `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738` |
| stopped worker image, never started | `sha256:7d68b990005ef504176128c83513fce7103c31b8db725979cfc30dcc75ac9700` |
| web bundle | `/assets/index-wQ8LN9Iq.js` |

The initial attempt had 8 failed assertions, 6 scoped passes, 10 unrun rows,
138 captured requests, and zero browser page errors. It is **not** a passing
P24 receipt. Important distinctions:

- SC-01/05 exposed a real backend failure: a valid historical 400-trial seal
  returned `503 RESEARCH_CURRENT_SOURCE_UNAVAILABLE` when a current writer flag
  made the reader use its 64-row bound. The lead identified intact retained
  rows and repaired the historical reader; no missing bytes were fabricated.
- SC-04 exposed a real intake gap: conflicting top-level `optuna_trials` and
  native `optimization_config.n_trials` was accepted with HTTP 201. The lead
  repaired alias consistency/refusal; this initial failure remains recorded.
- The initial browser URLs omitted workspace. The corrected retake below then
  exposed a separate product issue: S04–S08 dropped that explicit workspace
  before making their named reads. Preserve both facts, not a claim that the
  initial failures proved missing backend panels.
- SC-02 API stale bytes/old receipt was actually refused with HTTP 409
  `RESEARCH_ALPHA_IMPORT_GATES_REQUIRED`, with all 12 custody fingerprints
  unchanged. Its browser mirror/edit half was not run in this attempt.
- SC-03 actual declared pin preflight returned 201 and outside-range pin
  returned 409 `RESEARCH_PREFLIGHT_INVALID`, custody unchanged. The producer
  still returned `may_create_run=false`; no new-intent execution is claimed.
- SC-14 proved only two Compare absence mappings using canonical technical
  fixtures: zero variance and no overlapping raw-return window. No-loss,
  benchmark absence and categorical permutation are not inferred from this.

## 3. Exact retake

The lead rebuilt only the changed Control/Web services. The harness now
forwards workspace on every deep link, keeps one-based public fold F2 distinct
from zero-based source fold 1, and includes real S14 parse/edit/readonly mirror
checks. A unique output directory must be used; prior JSON is never overwritten.

### First exact-candidate retake (r03)

Private receipt: `20261004/p24-scenarios-r03/p24-scenario-receipt.json`.
SHA-256: `f0f16c26193c5e2dfab6b3ca48a816413d85d5d869ef6f551893f4a394df61b2`.
Initial/final images and bundle are identical (`candidate_images_stable=true`).
Control API: `sha256:108c7d604b67ad34f201bbb0c485ad1770e0db7cecab3042900ab80e94cc07c0`;
Python and stopped worker remained the values in §2; bundle:
`/assets/index-D0l-ohjM.js`. Actual inspection, not an expected label, supplies
the stopped worker identity. It is not proof that that worker executed anything.

| Scope | Observed result |
|---|---|
| SC-02 complete stale-receipt scenario | **PASS**: API old gates/new bytes register409; actual S14 parse201, seven gates200, readonly mirror, source edit clears the UI's old PASS gates and disables Register with a valid alpha id; all 12 custody fingerprints unchanged |
| SC-04 crafted alias conflict | **SCOPED_PASS**: now400; UI synchronization and effective-child equality remain separate branches |
| SC-03 bound pin | **SCOPED_PASS**: actual declared pin201, invalid pin409, `may_create_run=false`, zero job/core mutations |
| SC-05 current source study/budget scope | **SCOPED_PASS**: exact source global/per-fold schedule, studies and counters; no inferred universal folds×trials denominator |
| SC-14 Compare absence mapping | **SCOPED_PASS**, technical fixture only: zero variance and no common window map to typed null/absence, not rho=0 or NaN |
| SC-01/09/11/16/17/18 browser consumer | **FAIL**: scoped URLs still produced unscoped S04–S08 named requests and `Run not available`; direct identical API reads with workspace returned200 |
| SC-15/20/21 read/navigation scopes | Initial scoped results exist; affected S04–S08 mount proof will be retaken with a populated frozen table, not accepted merely because an unavailable page mounted |

Counts at r03: 1 full PASS, 7 scoped passes, 6 failed rows, 10 unrun rows.
Zero browser page errors. These counts do **not** close all of P24.

The product defect is independently located in `SearchRoute.tsx`: it read no
`workspace_id` and called `useSearch(runId, target)` and
`useRetainedRunFacts(runId, undefined, ledger)`. The lead assigned a comprehensive
S04–S08 route/hook/link audit to the consumer agent. The harness does not alter
intercepted requests to manufacture correct scoping. Affected browser assertions
were retaken against that final corrected web bundle, as recorded in §7.

Until the remaining branches below have their own proof, disposition remains
**IN_PROGRESS**, not full Product GO or P24-T12 PASS.

## 4. Cleanup ownership

Each browser lane logs out its own real session and closes Chromium. The lead
must disable/revoke the ephemeral QA identity after all coordinated lanes;
that revokes bootstrap/diagnostic sessions too. Raw private receipts are retained
under the approved P23 state root. No shared/prod container, volume, codebase,
stable database, business data, or human identity is stopped/deleted by this lane.

## 5. Remaining branch ledger and exact retained proof scope

This is a branch ledger, not a second denominator. The mandatory denominator
stays SC-01…SC-24 (24). A read-only visit is not a source/engine/write/DR drill.

| Scenario | Remaining named proof / exact evidence that can be reused |
|---|---|
| SC-01 | Full actual browser PASS r05: scoped Search trial pick → Freeze/Report/RC → Back, selection/custody unchanged |
| SC-02 | Full PASS r03; no repeat necessary unless import consumer/schema changes |
| SC-03 | Actual narrow/new-intent execution and the S06/S07 widen links, beyond the retained bounds-only preflight proof |
| SC-04 | UI canonical fields → POST → effective worker equality; crafted alias-negative branch passed r03 |
| SC-05 | A schedule/mode/seed budget path with pruning/early-stop counters, beyond two actual completed source counter reads |
| SC-06 | Engine lane now supplies genuine Portal110→111 in-flight pin preservation and exact rollback reproduction in `P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md` (API hash `52ea40e5a30954d11e0dd5a495097db9495eb7aa982b4cdb82a667702463cde5`, 3 real runs/9 retained files). Reuse that exact isolated fixed scope, not a claim of generic multi-version scheduling or a new browser producer receipt |
| SC-07 | Real browser autosave/double-submit now accepted by the separate SC23/GUI receipt in [consumer finish](P24_CONSUMER_FINISH_2026-10-04.md); one new fixed run. Historical durable terminal recovery remains §6. Explicit worker crash/retry and its separate technical-retry counter are not inferred from a normal successful child |
| SC-08 | Canonical selected=None/no-raw-best substitution has focused technical PASS in §8; the complete four-screen source-selected=None journey remains separate. A fixed-profile absence is not an optimizer-selected=None receipt |
| SC-09 | Actual F2/study1 browser+source proof PASS r06, explicitly distinct from last-fold deployment; absent centroid and persisted-centroid/no-trial have canonical technical PASS in §8 |
| SC-10 | Exact R020 pinned child, zero optimizer and restart/restore proofs in §6 now join the real S11 local seal→ACK-loss→publication and current named graph reads in §10. Self-reuse keeps its separate accepted source scope. No fresh browser Create-linked-audit allocation is claimed or required to counterfeit a second child |
| SC-11 | Full actual metadata-only holdout browser PASS r05; no authorization/evaluation/unlock invented |
| SC-12 | Two-user scan/evaluation/exposure distinction and permitted sibling/version behavior; no blanket holdout ban |
| SC-13 | Exact numeric thresholds, zero-width/category/outside-range absence and category permutation have focused technical PASS in §8. The complete narrowed/pinned S06/S07/S09 browser journey is not inferred; a bound warning is not an optimization failure/deploy gate |
| SC-14 | Zero-variance/no-overlap Compare and categorical-label policy have technical PASS; no-loss/sentinel, benchmark and empty-histogram canonical source proof is reused at exact scope in §8. This does not claim a fresh synthetic source run or every screen branch |
| SC-15 | Populated-panel no-implicit-compute browser PASS r05; P23 `UTILITY_CHECKPOINT_2026-09-27.md` proves explicit 81 cells/63 unique real evaluations, one diagnostic job, retry identity and unchanged parent pins. Every seed-sensitive variant is not inferred |
| SC-16 | Actual source ordinals888→889→890→889 PASS r06; typed sequence-gap consumer PASS r05 is separately synthetic. Equal event timestamps/raw-event gaps are not manufactured from dense market-bar observations |
| SC-17 | Reveal remains ON through seek/fold change; active/future end-equity and tooltip/cost facts redacted, immutable custody: scoped PASS r05. No unsupported execution event is invented |
| SC-18 | Six fresh populated scoped links, conflicting alias notice/normalization, Back F3→F2 and unchanged frozen selection: scoped PASS r05 |
| SC-19 | **Real browser ACK-loss/retry branch CLOSED**, §10 r02: before ACK no effect/false published; after ACK exactly one DELIVERED intent and R1; retry is replayed with identical actor/payload/pack/R1/receipt. Approval stays PENDING; reviewer read remains DENIED. Original gateway source-timeout handling is the separate exact prior receipt, not a network abort relabelled PENDING/UNKNOWN |
| SC-20 | Existing lineage/RC read is safe; code-change GATES RESET and post-approval corruption cases require their own proof without reset/revoke/stop mutations |
| SC-21 | Atlas old-run informational half scoped; second release/new-route mapper refusal belongs to engine qualification lane |
| SC-22 | Retain exact P23 mixed-load backend proof from `MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md` (120/120, Library499/Progress403ms, peak738488320B), plus owner-reviewed restart scope. Final candidate reads are a compatibility check, not a new mixed heavy-job drill |
| SC-23 | **Actor/workspace draft isolation, same-actor CAS and stale preflight/create response branches CLOSED** by the real consumer receipt. Normal USER admission denial remains negative; one separate normally provisioned ADMIN GUI run completed. See [consumer finish](P24_CONSUMER_FINISH_2026-10-04.md), not this lane's GETs |
| SC-24 | **Post-child re-export/download + dry GC/reference + named graph branch CLOSED**, §10 r04; exact existing restored-child/graph proofs reused at §6 scope. No new GC deletion or restore of the freshly created test RC is claimed. Strict integrity remains83/86 under the exact three historical test-run exception, never fabricated100% |

No rejected/unsupported scenario is converted to N/A here. The lead owns the
aggregate source capability disposition, final engine receipt, accepted positive
imported journey, teardown, and Bobby review.

## 6. Exact prior-proof reuse — do not rerun unaffected passing branches

The following source comparison was performed against the current checkout
(including its pending changes), not inferred from an old board row. Each
listed scoped source block/file is byte-identical to its named receipt commit.
This preserves the original runnable-image scope; it does not pretend the
older images were the final candidate or extend a backend receipt into a
browser/write/engine scenario it did not exercise.

| Scenario subbranch | Reused real receipt / exact unchanged scope |
|---|---|
| SC-19 terminal publication retry/cardinality | `PUBLICATION_REPLAY_CHECKPOINT_2026-09-27.md`: three public POST retries, same R1, one publication and immutable row hash; receipt `a0aeaf8f88fdd2e5038583a190e2824c897f22ccd7049ad51acdc95208ba39ed`, source `19a8e813`. `publish` + `execute` methods are unchanged. Readiness/mirror/response have subsequently gained additive fields, so their newer refusal/copy checks remain separate. |
| SC-15 explicit what-if evaluation/replay and utility cost | `UTILITY_CHECKPOINT_2026-09-27.md`: real 81 cells / 63 unique evaluations, same diagnostic on retry, changed grid409, fixed parent pins, two explicit jobs; receipt `c6129b1178fdfeb51c076f262869ee43f43a1da1aa822bfed90b145ed49f2cc5`. `T02_T12_SOURCE_CLOSEOUT_2026-09-30.md` adds same-clean-`af18707a` primary/diagnostic/exports/verifies overlap, receipt `7a48c771de1ddb75cc334043a3c7d6342fe301cd4a301a5fd1498174e4c9de89`. Four diagnostic-specific files below remain unchanged; today's populated-panel no-implicit-compute browser check is the affected retake, not a reason to redo the expensive evaluation. |
| SC-10 reusable selected audit / pinned non-reusable child | Eligible WFO self-reuse receipt `29296a8c003c1d928ce8ae159f0ec685d651f104e8a4b255f3e33f9101b1ae73` at `af18707a` remains scoped to the selected original. The genuine non-reusable R-WFO-020 child is separately proven by `NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md`: `b26ccac6a63bcb6097241c186afff327aa63c9980fd1c179baadac3cfa9251b3`, 9 folds / 2484 bars / optimizer0. Do not confuse either with a fresh browser button-to-child allocation. |
| SC-12 source exposure writer and no duplicate on seal retry | `B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md`: actual rolling-v2 exposure plus authenticated exact retained-audit/exposure receipt `e9d43b6a17879ac6396bf483ee5876dc0dd220b89b25a3329f4943c710c04fe4`, candidate `c8b1641b`. `retained-exposure.ts` is unchanged. Source-attested `PORTAL_ADAPTER_ENGINE_CALL_COMPLETED` is not relabelled engine first-read or a two-user browser scan. |
| SC-24 existing coherent restore, original immutable graph and new audit recovery | Preserve restored30-route/28GET receipt `70ed23d72ccb671ab6cd7174af50363f8eaf1a1f8f1bc993d02f3c9e48a5fe54` and later new-child12GET restart/restore receipt `c6722fae0a9f60c78ade22e7e4a99b68ebfbc9f688ed6f056efecdcc389016f7`. The restore harness and content-addressed artifact store are unchanged from `4bc9cefe`; the later child has its own snapshot, not invented presence in the older backup. Post-child re-export/GC remains distinct. |
| SC-07 durable terminal recovery | The clean `761bc243` ENOSPC run ended FAILED/READY and a new recovered WFO ended COMPLETED/READY with no terminal rewrite (`T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md`, hashes `cdb7caa16b5f7761eaf1c7e121c64ffd7671895d770043726663f04332d404a5` and `9c1e370e3368298ca118816f59056a26fd9c19be499cf9feab2be6db60a751a0`). It is accepted historical recovery proof, not a fresh browser autosave/double-submit or a claim that every worker path is unchanged. |

Exact unchanged-source SHA-256 anchors:

| Source block / file | SHA-256 |
|---|---|
| `release-candidate-publication.service.ts`: `publish` + `execute`, `19a8e813` | `4cfe48363a381f55a58c057ccbb0502b6dbe3a6d6c3f46e99a6f7b98124541e8` |
| `whatif.service.ts`, `af18707a` | `b7b7ac18b69968a5817efe114ca9994ff2fdc1b9ed8ff3a9470ce7bd6396fc26` |
| `whatif.repository.ts`, `af18707a` | `d4c5a317db4c2fa7b8dedec1b5f704b24b25377ec456096942b1941c86bfffcb` |
| `research_whatif_profile.py`, `af18707a` | `4dc3d9b70c656d02bcc1cc959ace3592319cd03fdfe1d9c06e21bfbced5b2c93` |
| `research_whatif_retention.py`, `af18707a` | `47facf20b046add0d11eb368bce659b24469ad7adaca015528074aa90d9fe0c0` |
| `retained-exposure.ts`, `c8b1641b` | `be4c871d3e8a89049d1c31ceb69b0af35bfe9b501956dd92d51c92c24740b390` |
| `restore-receipt.mjs`, `4bc9cefe` | `d43f24ee3f19b8a2c63a53479d5115bdd6826560838346f89d1189cd9682ba26` |
| `artifact_store.py`, `4bc9cefe` | `fa0b519a62957a66ab8fddf775d2412f21c3fa5edb29d5d63e0b155711220163` |

### Remaining work is specific, not a restart of all 24 scenarios

1. Affected browser reads/cursor/Reveal after the final workspace-forwarding
   bundle (SC-01/09/11/15/16/17/18) are now accepted within the exact scopes
   in §7. Do not rerun them because predecessor attempts failed.
2. Genuine accepted producer journey (SC-03/04); engine lane owns the new
   imported fixed child. Old→new pin/reproduction is now actually accepted
   in its isolated fixed-profile scope (SC-06), so do not reopen that engine
   drill; Atlas/new-route browser/refusal remains distinct (SC-21).
3. Browser/state edges not established by a backend replay: draft double-submit
   (SC-07), two-user scan/CAS/late response (SC-12/23), publication timeout before
   and after ACK (SC-19), and post-child re-export/GC (SC-24).
4. Named typed input/absence branches have focused technical coverage in §8:
   selected=None/centroid (SC-08/09), boundary categories (SC-13), and undefined
   metrics/category-label policy (SC-14). These no longer need another generic
   fixture suite. Their broader source/browser scenarios still require the
   exact supported-capability disposition, never fabricated source facts.
5. Final aggregate image/source pin, QA revocation, owner visual/action review
   and signed release remain lead/owner responsibilities. Existing passing
   backend retry/utility/exposure/restore proofs above are not reopened.

## 7. Final affected-branch aggregate — real reads accepted, failures preserved

Both final receipts independently prove identical initial/final four-image
pins and `/assets/index-DJk17BDR.js`:

| Service | Actual image SHA-256 |
|---|---|
| Control | `108c7d604b67ad34f201bbb0c485ad1770e0db7cecab3042900ab80e94cc07c0` |
| Python API | `c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738` |
| created/stopped worker, never executed | `c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738` |
| Web | `f7500cdf503b6f94d9edeaa330436af265ef37302382e5761b12c8accfb5827e` |

Private outputs are immutable separate attempts, not overwritten JSON:

| Attempt | Receipt SHA-256 / honest result |
|---|---|
| r04 | `284f99fba0194e63dfa74bb831b3f2952b31676871a5246818c349cd1e12797f`: harness Web-identity helper refused before scenarios because shared fault helper excludes Web; fixed only this harness with exact project+service label checks, shared allowlist unchanged |
| r05 | `6e1281cd50bbc438137acb799275921cf96ab99fc334ab7c0ab81aefd5ba79fa`: two full passes, three scoped passes, two harness-oracle failures, 17 unrun rows; 249 captured requests / zero page errors |
| r06 | `a21e6cbf8bc2f4dc1467fe7b64892dfcc7e6ce420ce1f9c263dc458a46973d23`: corrected SC-09 and actual SC-16 stepping scopes pass; repeated synthetic gap probe fails because same-path hash navigation reused the loaded window; 73 requests / zero page errors. Prior identical synthetic case already passed r05 and is reused, not a false successful r06 exit |

Exact branch acceptance, always keeping the mandatory 24-row denominator:

| Scenario | Actual accepted scope | Evidence |
|---|---|---|
| SC-01 | **Full PASS**: real non-selected trial inspection → Freeze/Report/RC → Back; original selection/pack/local seal unchanged | r05, 11,516ms |
| SC-09 | **Scoped PASS**: public F2 inspects source fold1/study1 (`INNER_VALIDATION_OUTER_STUDY`, 3 actual matched rows); UI active F2. Top-level selected deployment remains explicitly `LAST_FOLD_DEPLOYMENT`, never substituted for the inspected study; RC trial scope stays `STUDY_LOCAL` | r06, 10,055ms |
| SC-11 | **Full PASS**: real fixed holdout says `NOT_EXPOSED_TO_CHILD_TAPE`, `NOT_EVALUATED`, no unlock href; actual readonly disabled card | r05, 6,953ms |
| SC-15 | **Scoped PASS**: populated frozen table, mount/available slider/cursor/reload do not launch any job | r05, 8,072ms; explicit evaluation stays the unchanged earlier backend proof in §6 |
| SC-16 | **Scoped PASS, real**: next/next/back source ordinals `888→889→890→889`, public one-based seq matches; no timestamp interpolation | r06, 7,313ms |
| SC-16 technical subcase | **Synthetic transport-negative PASS, not engine/source proof**: canonical typed `RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP`503 removes readout, shows unavailable/Retry, never fabricates a row | r05, 7,561ms; injected response SHA `db1e95004853ad2c55074b46f2a6b2a3337ea43aef32e6d093f17ff23e37dc20` |
| SC-17 | **Scoped PASS**: Reveal remains ON across seek and next-fold; active/future fold equity absent, tooltip has no future Sharpe/equity/transition result, retrospective cost hidden; current source fold2 redacted | r05, 7,389ms |
| SC-18 | **Scoped PASS**: six fresh links render actual trial/table/playhead content with explicit workspace; conflicting aliases typed/normalized; F3→BackF2; frozen selection unchanged | r05, 13,597ms |

Every accepted real scope has **zero attempted non-GET browser API calls**,
identical before/after counts/fingerprints across all 12 custody tables, and
zero browser page errors. Parent concurrently ran GET-only probes; no worker
started and no accepted mutation/job occurred. The two r05 harness failures
were corrected using the published DTO and existing `step back` aria label,
not by changing source/consumer behavior. Their failure evidence remains.

The final harness now explicitly reloads the document for a repeated synthetic
transport probe; a fragment-only navigation must not be mistaken for a new
HTTP request. That control-flow repair is syntax-checked; it is **not** called
a newly executed negative proof. No third real-scope rerun was added.

Browser logout/close completed. The consumer agent was immediately notified
to begin its own lane, with no overlapping browser or write load. Root retains
responsibility for final whole-identity revocation after all coordinated lanes.
This aggregate accepts the affected real branches, not all remaining §16.6
write/multi-user/engine/DR/browser branches or `PRODUCT_ACTIVE`.

## 8. Residual typed branches — focused proof and exact prior-source reuse

No further browser, container rebuild, full hook, optimizer/HMD run or broad
suite was launched for these cases. One current Control API filter completed
in **6.25s: 8 PASS, 65 deliberately unselected**, four passing files and one
fully unselected file. The filter selected seven direct cases below plus the
existing spec04 parity case; skipped tests are not called passing. Command,
from `apps/control-api`:

```sh
node node_modules/vitest/vitest.mjs run \
  test/research-w3-current-source-facts.spec.ts \
  test/research-release-candidate.service.spec.ts \
  test/research-selected-trial-presentation.spec.ts \
  test/research-p16-binding-dr02.spec.ts \
  test/research-compare.service.spec.ts \
  --maxWorkers=1 --no-file-parallelism \
  -t 'no selection is never|centroid|NOT_APPLICABLE|thresholds|exactly|zero-variance|no-overlap|no trial'
```

| Scenario branch | Exact canonical test / accepted scope |
|---|---|
| SC-08 absent selection | `research-w3-current-source-facts.spec.ts`, P15-T02/T03: selected trial/objective stay null; existing raw best remains separately named and is never promoted. This is a canonical retained-row fixture, not a new engine-selected=None run. |
| SC-09 absent centroid | Same file, P15-T11: decay selector is `NOT_APPLICABLE / QUANTBT_SELECTOR_HAS_NO_CENTROID`; plateau missing centroid is `NOT_PUBLISHED / QUANTBT_DID_NOT_PUBLISH_THE_PLATEAU_CENTROID`; neither invents a trial id/objective. |
| SC-09 centroid not a trial | `research-release-candidate.service.spec.ts`, P21-T01/T03/T11/T12: persisted centroid lineage is complete while trial number is null with `P21_TRIAL_ORDINAL_NOT_APPLICABLE`; no compute runs. |
| SC-13 exact boundary variants | `research-p16-binding-dr02.spec.ts`: inclusive 6/18/82/94% thresholds use exact decimal declared ranges; zero-width, category, outside-range and inexact values receive distinct typed absence; decimal position has no binary-float boundary drift. This filter did not run that file's separate shared-renderer/browser tests. |
| SC-14 undefined correlation | `research-compare.service.spec.ts`, P20-T05/T11: insufficient/zero-variance/no-overlap correlation stays null, not 0/NaN; no-common-window bounds and overlay remain absent. Real-browser technical response mapping was independently accepted r03. |

Only one genuinely missing focused assertion was added: categorical label
permutation in the owned harness test. Reordering `fast/slow/medium`, and using
numeric-looking labels `0/999/-1`, never creates a numeric bound position or an
ordinal-importance axis. The current `boundWarning` helper returns the same
typed categorical absence; the numeric-only declared-surface schema rejects
category rows. Imported fixed categorical chips remain their separate typed
lane. This is **schema/helper policy proof, not categorical engine optimization**.
All **5/5** owned guard tests pass in 274ms; the initial wrong-working-directory
Node invocation ran no tests and is not represented as a product defect.

Existing pinned Python suites already name the remaining undefined-metric
cases: `test_engine_sentinels_become_typed_absences_never_zero` (Sharpe zero-
variance, Sortino no downside, profit factor no losses, hit rate no exposure;
real zero CAGR stays available), `test_benchmark_absence_is_typed_when_close_is_not_aligned`
(missing benchmark stays absent), and `test_constant_and_empty_daily_samples_are_typed_not_zero_filled`
(empty/constant histogram has no invented bins). Prior passing suite records
are [BR-AN-01](../P13/BR-AN-01_backend_receipt_2026-09-30.md),
[BR-F6-01/02](../P13/BR_F6_ALL_TIME_DISTRIBUTIONS_2026-10-01.md), and
[B6](../P13/B6_ENRICH_ANALYSIS_2026-10-01.md). They retain their synthetic/pinned
Python scope; they do not become an actual HMD or this final browser receipt.

Read-only source comparison to accepted `d16058ee` proves the exact 14 existing
OOS helper blocks, including `engine_oos_metrics`, `oos_scoped_result`,
`_stats_sample` and `oos_analytics`, unchanged; the later IS helpers are additive
and are not reused as old OOS proof. The sentinel test itself is unchanged.
Portal analytics/distribution helpers and their test files are fully byte-
identical to that accepted commit. No unaffected Python suite was rerun.

| Exact source/fixture/test anchor | SHA-256 |
|---|---|
| Current W3 canonical test file | `f0a1b24ffa1deeae892415e3f6a35875a81047f11c03d78af5e6405fc3a8e44a` |
| Current RC service test file | `f8eb1371bfb9ccca8fe03ab19a2241d4c6b81d32d82c56ac2c9ffb7ab3d37a28` |
| Current DR-02 test file | `f930a5dd293e0e444e32a2390ab3e2cb3505e274780741612ab4c5b3a6e3ebac` |
| Current Compare service test file | `ae237452211a8647fc021d822461d03d9ce4b45b36122b63211685ce7f21b7b5` |
| Canonical numeric declared-surface fixture | `bec5c681972d3d7626aec8d6f83fd7d7b2e1c8de8c5890e995712655dace383d` |
| Canonical no-correlation Compare fixture | `4247e02a8b603c79927e43b95f795b92764bb026b35730346f6e5e662ba91748` |
| Current source `bound-warning.ts` | `c221f061ad9875a369b604a4cb190cd43514778b638ed958c2e43b5fa020e312` |
| Current source `current-source-surface.ts` | `1fbc32026e096e991d1d47f0fb1c5cde2c714dd7f7186896541fc9b9f4e1094a` |
| Exact 14 unchanged OOS helper blocks, joined with two newlines | `d8055c437fe1ac5ae9b72953d695c0386fe5a3eb8d34f88c65f4e26f43f71dc8` |
| Exact unchanged engine-sentinel test block | `24b57f0e0d6adbb1b160abce863d02877f079c86ab0ca8179bd1bc63cb996604` |
| Current/accepted Portal analytics helper | `ec13714454b5efba0ff8fef6a0793f8805e7d4506e489bd6b78003c45fff607a` |
| Current/accepted distribution helper | `7347cf0059c1e7ff257fcba64904f9a600714b3530f5fbaf09317b6e9d0001bf` |
| Owned five-case guard test file | `0f699791e3c679132f94f6ec632ea1a2fcc5d025bf932b3c833dc7d801fe084a` |

These technical subbranches can be consumed by the final aggregate now; their
existence is not a reason to restart all 24 scenarios or call untested broad
write/multi-user/browser branches PASS. No product module was edited by this
residual proof lane.

## 9. Publication ACK-loss / post-child export edge lane — initial attempt

The additional lane uses only the retained isolated `:8096` clone, an ordinary
temporary `USER`/workspace `MEMBER` named `p24-edge-publish`, and the already
verified R-WFO-020 child. It does not grant R1 read/decision permissions,
activate an Alpha version, start a Quant worker, rewrite a source seal or call
Trading System/Execution. Root owns identity revocation and clone teardown.

The first actual attempt is preserved privately as
`p24-edge-publish-browser/p24-publication-export-edges.json`, SHA-256
`55040f842e65435fa76cd89c2aaa26247aa87481dd89a894a27b8548cf30e0b4`.
It proved the actor's normal membership, ACTIVE bound source, exact existing
VERIFIED child/manifest and zero optimizer re-invocation. One permitted
actor-draft PATCH recorded truthful test limitations/restrictions. The next
check refused `current_source_may_seal`; **no local seal or publish POST, R1
intake, engine job, export job or Governance decision occurred**. All 13
source/job/selection/Alpha/exposure/immutable artifact/decision custody table
fingerprints remained unchanged. This first failure is not a SC-19 or SC-24
PASS and must not be overwritten.

The sole missing mandatory pack row was `METRICS_SEMANTICS`, typed
`NOT_PUBLISHED / P21_RETAINED_REPORT_NOT_SEALED`. The captured Report exists,
but the reader compared its original Evidence presentation revision with a
later companion-enriched presentation revision. A separate read-only
diagnosis established that the original base source revision and all five
captured source digests still match the retained source. Root owns the
narrow immutable-compatible reader correction and regression; the diagnostic
does **not** authorize accepting an arbitrary old Report, dropping a digest
check or resealing historical bytes.

The harness now supports a separate explicit `EXPORT_ONLY` lane, with a new
private output directory, so a publication prerequisite cannot falsely block
post-child Report re-export/download and read-only GC reference eligibility.
It still requires this exact verified child and immutable source custody,
allows only the two bounded JSON/CSV export jobs on an otherwise empty export
queue, runs the finite existing export CLI, and verifies actual bytes/hash,
private cache policy and unchanged Report revision/core. GC is eligibility
inspection only; no sweeper, deletion or new restore is claimed. SC-19 is
explicitly `NOT_RUN_IN_LANE` there. A missing current RC makes only its RC
reference subassertion `NOT_APPLICABLE_NO_CURRENT_CANDIDATE`; parent/child
artifact exclusion remains mandatory.

Syntax check and four pure harness guard/oracle tests pass (105.96ms), including
rejection of an unapproved lane. These tests are not production/browser proof.
Actual export and ACK-loss retake results remain pending in this initial record.

## 10. Actual ACK-loss and completed-export continuation — accepted scopes

The lead executed these lanes; the scenario agent reviewed actual private
responses/custody and repaired only harness parsing/routing mistakes. The
immutable initial attempt above is superseded at the affected successful
scope, not deleted or relabelled.

All successful r02/r04 observations use the same exact candidate:

| Service | Content-addressed image |
|---|---|
| Control | `sha256:47a6cd0241358bc6249538d483809eba02ec21ae33ba120a523e5d1cddcc2ce3` |
| Python API / stopped worker | `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738` |
| Web | `sha256:08f4df00dc80e4b3f708e57e141ee3c2881db32c1f9524474e4509ea0ac175ae` |

Source HEAD is `b7e0b867235df31e98e1d168d0646015520b171c` with pending
authored changes; these images are not represented as an already committed,
signed or deployed production release. The owned clone DB volume is
`portal-research-p23-ol12-restore-nonreuse-r020-20261003-db`; the only RunSync
upstream remains `http://portal-api:8000`. The Quant worker was OFF during
each lane's initial/final safety checks. A separate imported-workspace GUI
job ran between continuation attempts under the lead's explicit coordination;
its worker completed and stopped before r04. It did not alter this source
workspace or repeat these publication/export effects.

### 10.1 SC-19: real browser before/after lost ACK and exact actor replay

Actual R020 source: `rrun_3258a4c450816129d2d285f25b801061`; verified child:
`rrun_b47b38cc8abc73eda542da734c827197`, manifest
`86d8bb2f7e7b529c659621d8d4ad90e4ba7c4b895287302cde843eacd88ec167`.
The already-saved truthful actor declarations were reused; no second draft
PATCH was sent. One local candidate was sealed:
`rc_06GGD779ZN6WBGY4Z947J9H9X0`, pack
`26e4b5b54ad23695952b954455f47417adb79ad033df5e31d4953b8a27bb57f7`.

1. The browser's confirmed publish was aborted before reaching the server:
   **zero intent/R1**, a visible unavailable outcome, SEALED (not PUBLISHED)
   header, and no published panel.
2. The second confirmed request reached the actual in-process clone R1 gateway.
   Its valid 200/DELIVERED response was dropped after commit: **one intent,
   one R1**, no APPROVED mirror or counterfeit approval.
3. The same actor confirmed the exact original source claim/payload again.
   The response had `replayed=true`; candidate/pack/R1/receipt and the persisted
   publication row were unchanged. The screen showed PUBLISHED only from
   actual DELIVERED receipt, while its approval mirror correctly remained
   `DENIED` for this non-reviewer publisher.

There were three browser publish attempts but only **two forwarded POSTs**
(one commit and one terminal replay). R1
`apr_06GGD77KPVZMKV4SPV0D5B8WW5` remains **PENDING**, intent `attempt_count=1`;
receipt `8b04febdad581b9cc568e11d2d64ea154257e0ab106722da5a630377bce4335b`.
No approve/reject, promotion, deployment, trading or source lifecycle action
was sent. The 13 immutable source/job/selection/Alpha/exposure/artifact/decision
custody fingerprints remained unchanged.

Raw r02 SHA-256:
`826f1360efd1bd3a63b093d57a428a3b80ccb0dc83aa2f839c8d29161fd54ba7`.
SC-19's actual oracles passed before the later export-output harness error;
the whole r02 process exit is not falsely called successful.

### 10.2 SC-24: no-reexecution continuation for already-completed exports

The same ordinary actor prepared exactly two exports, and the finite existing
Control CLI processed them. A harness `JSON.parse` mistakenly treated ANSI
Nest framework startup logs as JSON. The original CLI stdout was not recorded
before that failure; its hash remains **NOT_RECORDED**, not reconstructed.
The repaired parser accepts only recognized Nest framework log lines and
exact allowlisted terminal events for the two owned IDs, rejects unknown
records/job identities, and saves future raw text plus SHA before parsing.

The lead then used `GET_COMPLETED_EXPORTS`: checksum-bound original r02,
same image/actor/workspace/current candidate/Report core and exactly its two
existing READY jobs. It sent **no new export POST, CLI execution, RC/publish
write or engine job**. An intermediate GET continuation r03 passed both actual
downloads and GC checks, then exposed a harness-only nonexistent run-Lineage
route. Its 404 `REQUEST_REJECTED` is not represented as source corruption.
The named controller/client agree on Alpha Lineage; only the harness path
was corrected. Both failed raw receipts remain preserved.

| Existing actual export | Size | Actual downloaded SHA-256 |
|---|---:|---|
| JSON `rpex_06GGD77VY9WAK4BQQ2KS6S3D96` | 109,180 bytes | `ee778d2dbf123b80a0a5da3aa084423026eb08a6d410f45572656e9d75da2176` |
| CSV `rpex_06GGD77W1A92V97JNZ3BP384R6` | 8,590 bytes | `c2a24822700701e30e74493ceb54ad631e37aaa83705b4ba070f16b1a010f2bf` |

r04 **PASS**: 11 named GET observations, both private-cache downloads match
actual byte length/SHA and the original frozen Report revision/core. The
global export queue is empty. Parent and audit child artifacts remain SEALED
`RESEARCH_EVIDENCE`, excluded from the actual bounded GC-eligibility query.
The parent's newly created RC reference is permanent (`pinned_until=null`).
The child is retained by its Research evidence class and verified audit graph;
it is **not** falsely described as having a direct artifact-reference row
(actual reference count is zero). No GC collector/deletion ran.

Correct named Alpha Lineage returns the exact R020 parent node, its VERIFIED
child and exact manifest, the new DELIVERED candidate/PENDING R1, 49 returned
attempts, one child and COMPLETE coverage. Report, current RC and Library reads
also return successfully. All 13 immutable source custody hashes and the exact
publication/R1 rows remain unchanged; no new publish/export/engine write and
worker OFF/exact pins are confirmed at end. Browser page-error/request
listeners are active for the SC-19 publication portion, not this API/download
continuation; its empty page-error array is not a fresh all-screen console
acceptance. The consumer packet supplies the separate actual browser proof.

Raw final r04 SHA-256:
`5255c037306cbc6956b1ad20f798bb818033cdfa6d9c954df6b81f709ee2bb2c`;
intermediate r03 SHA-256:
`1bc7a61a26fe42e02fc60fb9ecf2dba56992785df516f5ee30f792050e2a9792`.
The exact previously accepted new-child restore receipt
`c6722fae0a9f60c78ade22e7e4a99b68ebfbc9f688ed6f056efecdcc389016f7`
is reused at §6 scope. This is not a newly executed restore after creating this
test RC, nor a new production backup/GC assertion.

### 10.3 Handoff and remaining scope

Owned publication/export harness final SHA:
`3a62fc82cb988bfeb3627c6b0ef3c6428998f1b28eaf6bd030f262ce2f4e9b23`;
seven focused pure guard/oracle tests pass (103.67ms), test-file SHA:
`8a9e0b490e041f812f9c146b86479d7a8a3d6fefe2281d074748c4c70f904327`.
There was no unaffected full-suite/rebuild in this harness-only repair.

SC-19 before/after-ACK browser proof and SC-24 post-child export/GC/read-graph
proof are **no longer open implementation/evidence gaps** at the stated scope.
SC-10's actual child→local pack→publication linkage is now evidenced rather
than assumed. Real SC23 actor/context/CAS and eligible fixed GUI producer
proofs are owned by [consumer finish](P24_CONSUMER_FINISH_2026-10-04.md).
Those accepted branches must not be re-requested as if still absent.

Unexercised broader §5 branches remain precisely scoped: S06/S07 widen-link
navigation; advanced main/native field UI synchronization; prune/early-stop
producer counter combinations; explicit worker-crash/same-intent retry;
complete source-selected=None multi-screen journey; two-user evaluation and
exposure; narrowed-bound multi-screen presentation; new unmapped-route
refusal; and post-approval corruption/gate-reset presentation. Their canonical
technical or prior real proofs in §6/§8 remain reusable, not discarded. This
record discovered **no further implementation defect** after the strict
retained Report compatibility repair and the consumer agent's scoped fixes;
it does not certify untested branches or replace Bobby's final acceptance.
Root owns normal QA disable/session revocation, final exact-cell teardown,
the aggregate 24-row disposition and any release decision. No remote push,
production change, staging or commit was performed by this scenario agent.
