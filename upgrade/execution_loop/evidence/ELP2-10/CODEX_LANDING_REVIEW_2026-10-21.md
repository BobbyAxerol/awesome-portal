# Codex — Core009 / Claude safe landing review, 2026-10-21

Status: **READ_ONLY_REVIEW / LANDING_NOT_EXECUTED**. Owner: Codex integrator;
lane: `landing_delta_review`. Bobby approved parallel Core009 commissioning,
independent producer review and integration preparation. This packet prepares
the third lane; it does not claim the second lane's semantic acceptance or the
first lane's installed/connected receipt.

Observed 2026-10-21 around 04:00 UTC (11:00 Asia/Saigon). Git commands pin the
full commits below; a later peer commit needs an incremental recheck. No source
file, branch, index, runtime, database, secret or remote was changed in this
review. Only this public packet is new; no tests/builds were run or needed for
the Git/document audit. No resources were allocated: cleanup `NO_ACTION_NEEDED`.

## 1. Pins and preservation boundary

| Lane | Branch and source | Working tree at audit |
| --- | --- | --- |
| Canonical `/home/bobby/portal-research` | `docs/research-loop-plan` at `7818d5631e0da37563bca5715fd46d40b66ef1de` | Six tracked Markdown files modified; nine existing untracked public packets before this review. No canonical source-code diff. |
| Claude `/home/bobby/portal-research-fe` | `claude/fe-parity` at `fe84ee69e1bbab0eb204f8c3414a7618bf372a77` | Unified and sync modified; one untracked priority handoff. Source changes are committed. |
| Core009 `/home/bobby/portal-core009-integration` | `chore/core009-connected-20261021` at `734353113d8bec85f78b35ab81c9c1a40e93a67e` | Clean. |

The common ancestor of all three is canonical `7818d563`. Canonical is an
ancestor of Claude, but **that does not make landing safe while canonical WIP
and latest-SHA gates remain outstanding**. Candidate and peer diverge: candidate
has one unique commit, peer has 393 unique commits. The candidate commit
contains integrated copies of many Claude source changes, not 5,032 lines of
additional independent work to add again.

### Diff accounting — exact endpoint trees, no double counting

| Comparison | Files | Added / removed text lines |
| --- | ---: | ---: |
| Canonical `7818d563` → Claude `fe84ee69` | 1,360, including 252 binary files | +223,286 / −6,829 |
| Canonical `7818d563` → Core009 `73435311` | 40 | +5,032 / −51 |
| Core-only diagnostic delta to carry onto Claude | 3 | +45 / −1 |

The two large comparisons **must not be added**. Breakdown of the Claude tree
delta: frontend 636 files (589 text, 47 binary), +113,638/−2,619; `upgrade/`
328 files (123 text, 205 binary), +17,519/−52; contracts 168 files,
+70,698/−3,817; control-api 181 files, +18,977/−295; other 47 text files,
+2,454/−46. Generated files, tests, evidence and images are included, not all
new product implementation. Counts exclude uncommitted WIP.

## 2. Core009 overlap: retain the peer, carry only the real missing fix

Of the candidate's 40 changed paths, **34 are byte-identical at Claude's pin**.
This includes AuthService, preparation/validation, the native runtime and
composition, owner commissioning/revoke, acceptance issuer/revoker, templates,
most focused tests, and `scripts/control-api-test.sh`. Replaying the whole
candidate diff is unnecessary and could roll back the peer's additive changes.

The six differing paths are:

| Path | Disposition |
| --- | --- |
| `apps/control-api/src/cli/execution-native-install.ts` | Carry candidate's import/call to `nativeInstallFailureCode`; keep the rest of the current peer CLI. Delta +2/−1. |
| `apps/control-api/src/execution-v2/native-install-error.ts` | Add candidate's 15-line safe diagnostic mapper; absent in peer. |
| `apps/control-api/test/elp210-core009-install-error.spec.ts` | Add candidate's 28-line, 12-case regression suite; absent in peer. |
| `apps/control-api/src/execution-v2/access.service.ts` | **Keep peer** additions: batch self-eligibility, self-context, family-bound step-up. Peer already contains the candidate's manager revoke implementation. Do not replace the file from candidate. Producer review still owns semantic ACCEPT/CHANGE. |
| `apps/control-api/test/be-p10-acceptance-session.spec.ts` | **Keep peer** explicit `AcceptanceTokenFiles` dependency annotation (+2/−1 versus candidate); not a lost Core fix. |
| `upgrade/execution_loop/evidence/ELP2-10/CORE009_INTEGRATION_RETURN_2026-10-21.md` | Preserve candidate's public receipt/provenance; absent in peer. Its candidate-image statements remain pinned to `73435311`, not the merged tree. |

Core009's prior hook/image receipts remain valid **for that candidate only**.
A future common-tree image cannot inherit its image digest or pretend all
Claude migrations/modules were in that smaller image. Conversely the existing
candidate install does not require importing unrelated frontend work first.

## 3. Migration namespace / checksum review

No numbering or checksum collision found between these trees. Candidate adds
no migration; peer adds only the following three after the shared 144. All
historical migration paths have no diff between canonical and peer.

| Migration filename under `apps/control-api/migrations/` | SHA256 | Status in source |
| --- | --- | --- |
| `1723680000144_execution-pending-recall-control.sql` | `6021729cc8ab9ea87c293256fa1d22f0c4567f1e0abb6e11418784895432a7e1` | Identical in all three trees; not a fresh uncommitted fix. |
| `1723680000145_execution-incident-links-operation-lookup-index.sql` | `57a0e087bdee387f6d5deea0944b8752d0927f70aa3e9ff46864be553b406f06` | Peer-only additive file, +17. |
| `1723680000146_execution-f0-apply-attempts.sql` | `6d83cad1f2201260c698993c91088bf7ceca3291e81bf11f1344e7b373eb8454` | Peer-only additive file, +47. |
| `1723680000147_execution-manager-series-observations.sql` | `2093aed3c6e9aa4463d0bd130ca4883b5097a777df08c0709a98d6d471ff8454` | Peer-only additive file, +118. |

This is source/checksum review, **not applied-schema verification**, not an
authorization to run 145–147 during the narrower Core009 install. Keep existing
SQL checksums; future changes require additive migrations. Semantic/storage
review and actual target migration checks remain with their owning lane.

## 4. WIP and public receipts must survive landing

Canonical tracked WIP at the cut is append-only in `git diff --numstat`:
Unified +320; campaign rules +27; sync +138; Core008/009 return +5; Edge request
+718; ELP2-10 README +19. These are shared/owner-authored updates, **not all the
reviewer's work**. Peer WIP has Unified +13 and sync +13. The peer committed
tree also changes Unified/rules/sync relative to canonical, so those three
paths require explicit content-preserving reconciliation.

Nine canonical untracked packets are not tracked at the peer pin: all-backend
handoff, fullstack review, Core009 integrator return, PM transfer receipt,
prepared source/image return, installed008 return, connected acceptance priority
handoff, fresh trust/source preflight return, and renewed trust/seal return.
Do not `git clean`, stash the shared tree, replace the whole docs directory or
silently omit these records. The priority handoff exists untracked in both
worktrees and has identical SHA256
`e94b332f850699246624afd6cf8da9fc302eeaaf591edfcb3ec085ab0c0b493b`;
preserve one content-identical tracked copy when owners coordinate the commit.

Exact scope/provenance of each WIP addition must be acknowledged by the main
integrator before staging it. This review does not authorize committing another
agent's unfinished file just to make the checkout clean.

## 5. Latest Claude work / stale ledger dispositions

Read current `BE-CLAUDE-2026-10-20/F1_F9_CLOSURE_2026-10-21.md`,
`HOOK_RESULT_2026-10-20.md`, `HANDOFF_TO_CODEX.md`, BE-P13/P17, Bobby decisions,
and `UXM-07/v2-baselines-2026-10-21/README.md`. Old OPEN/NOT_RUN prose is kept as
history, but current summaries should point to the following newer evidence.

| Old row | Current defensible disposition / action |
| --- | --- |
| F6/F7 slice pager unavailable, timestamps mixed, 11 title-only reasons pending | Superseded by `a13b4fa6` (RV-06/timestamp), `5bc040f6` (scoped keyset pager), `97454777` (e2e expectations). **SOURCE/FIXTURE delivered**, not real-source cursor acceptance. Do not rebuild those features from scratch. |
| F4 / handoff “V2 baseline not recorded” | Superseded by `fe84ee69`: new bounded recorder, 46 V2 images; packet reports record 46 PASS and two consecutive compares 46/46 PASS. **FIXTURE_LAB/BFF_DOUBLE only**. This does not by itself turn the older whole-suite 580/37/16 into a new whole-suite PASS. |
| Handoff §10 “HOOK_RESULT does not exist / PENDING” | File exists; final second-wave section records `a896bd08` on source `9d15755f`, contracts 1,577 PASS, API 9,445 PASS/3 skip, route319. Preserve failures/history. Latest four code/test/visual commits came later; obtain a current landing-gate receipt before ff-merge. |
| Handoff RV-13 / BE-P13 “migration146 PG NOT_RUN” | F1–F9 and latest full-hook packet supersede the initial focused-only report: real PG execution now reported. Independent producer reviewer verifies the original receipt and result before ACCEPTED; do not count tests twice or rerun solely because an old paragraph is stale. |
| Handoff RV-11 “producer not implemented” | BE-P15 financial row/publication work now exists in peer, followed by BE-P16 writer and BE-P17 fleet realtime. This is implemented source, not actual qualified financial publication. |
| BE-P17 whole-fleet-only and BE-P16 Alpha/Deployment subject require Bobby choice | `BOBBY_DECISIONS_2026-10-21.md`: whole-fleet-only stream approved; Alpha/Deployment series **not opened**; keep typed absence, do not implement it as an outstanding promise. |
| Handoff “Codex only swaps image; Claude owns every config/session step” | Latest Bobby-approved three-lane assignment authorizes Codex Core009 configuration/validator/coordination/install/acceptance support. Keep Claude one-writer boundaries and source-owner authority; do not reopen the same generic approval. |
| Core009 trust expired / no built image | Historical. Use prepared image return and fresh trust/source preflight return in this packet directory. Candidate built; renewed trust transferred. This still does not assert installed009, new native acceptance or connected READ/STREAM. |

The body of BE-P17 still documents `revokeSession` as not wired to logout/revoke
and `edge_notice_source = NOT_COMMISSIONED`. These are not resolved by publishing
a fixture or granting READ. Main review/commissioning must preserve the explicit
STREAM grant and per-write authority fences and check live cutoff separately.

## 6. Proposed no-loss landing sequence — not executed

1. Main integrator and Claude agree a short source freeze and repin HEAD/WIP.
   Finish/commit only owner-confirmed canonical public packets and tracking
   updates under the applicable hook policy; peer likewise closes its owned
   WIP. Keep the above append-only content and receipt provenance. Never stash
   or overwrite the shared checkout to force this condition.
2. Carry the **three-path +45/−1 diagnostic fix** onto the peer/integration
   source with a dedicated provenance note to `73435311`, plus preserve its
   public candidate receipt. Do not cherry-pick the 40-file integration commit
   wholesale, and do not replace peer access/step-up code. Coordinate the writer
   before any patch; this audit has made no such change.
3. After canonical's owned-doc commit, Claude rebases its clean lane onto the
   exact current canonical tip under campaign §10.11, preserving both sides of
   Unified/sync/rules. Generated contracts/snapshots/ledgers use their repository
   generator when affected, never hand-resolve generated contents. No need to
   rewrite the isolated candidate/image history merely to make it an ancestor.
4. Independent producer review returns ACCEPT/CHANGE for touched backend;
   focused diagnostic tests cover the new carry-over. Run the required final
   R2/R3 gate once on the agreed frozen landing SHA (one heavy job), reusing
   unchanged evidence only with dependency/impact reasoning. Claude owns final
   visual acceptance and the approved V2 baseline.
5. Recheck canonical clean and ancestor, then **only the integrator** may use
   `merge --ff-only` according to the approved landing workflow. If either tip
   changed, repin/reconcile first; no ours/theirs blanket resolution. No push,
   dev/main merge or release follows from this review.
6. Post-land record exact resulting SHA, source/contract pins and preserved
   peer/Core deltas. Research runtime remains a distinct image/config/schema
   receipt; source landing alone does not install Core009 or activate streams.

Rollback for this audit is only removal/reversion of this new public Markdown
file after preserving its receipt if needed. No running service or data rollback
is involved.

## 7. Handoff / next independent work

- Codex can finish already-approved Core009 private configuration and source
  coordination independently of broad FE landing. The candidate source/image
  remains available without importing unrelated changes.
- Independent backend review can accept/request changes for B1/B2 and BE-P15–17
  while Claude completes UI/fixture work. No duplicate source implementation.
- Claude: keep the four new commits and updated V2 baseline; update stale
  summary rows using the evidence above, preserve exact-SHA gate limits, and
  receive the three-path diagnostic patch through the integrator before landing.
- ELP2-10 remains **NOT_MET** and ELP2-11 **NOT_ENTRY_READY**; outstanding source,
  connected, financial, budget/calibration, coexistence/G2 and consumer gates
  cannot be closed by this Git/document audit.

## 8. Landing closeout refresh — 21 October 2026, 05:21 UTC

This addendum supersedes the source counts and pending carry-over in §§1–2/6,
not the preserved earlier cut. Read-only Git/source/document inspection only;
this standalone packet is the sole file changed by this closeout refresh.

| Checkout / branch | Exact HEAD | Tracked / untracked WIP |
| --- | --- | --- |
| Canonical `docs/research-loop-plan` | `7818d5631e0da37563bca5715fd46d40b66ef1de` | 6 shared Markdown files, +1,688/−0; 21 untracked public packets at this cut; index empty |
| Peer `claude/fe-parity` | `ec228e53b9cf97b5e732024954d131e057d3f778` | Unified +13 and sync +13; 2 untracked handoffs; no backend source WIP |
| Candidate `chore/core009-connected-20261021` | `734353113d8bec85f78b35ab81c9c1a40e93a67e` | clean |

Commit graph: canonical…peer **0/402**; canonical…candidate **0/1**;
candidate…peer **1/402**. These are ancestry counts, not missing-code counts.
Canonical's cached `origin/docs/research-loop-plan` is `d3d99f26e531c0003415797b932cf2377215a478`
and reports ahead541; no fetch/push was performed, so this is not fresh remote
verification. Compared with the first peer pin `fe84ee69`, Claude added 9 commits.

Exact endpoint diffs, each counted once (do not add these overlapping scopes):

- Canonical → peer: **1,368 files, +224,150/−6,837**, including 252 binary files.
- Earlier peer `fe84ee69` → current peer: **45 files, +929/−73**, including
  15 binary files. These include UI/visual refinements, review ACK and fixes;
  the binary files do not have a meaningful line count.

### Core source is now preserved in Claude's lane

`1328d1b7718b384779eb7a24bc3ceeb800694d85` carried the three diagnostic paths
and original `CORE009_INTEGRATION_RETURN_2026-10-21.md` with provenance.
All four are byte-identical to candidate73435311. Of the candidate's 40 changed
paths, **38 are now byte-identical to peer**; only `access.service.ts` and
`be-p10-acceptance-session.spec.ts` differ, intentionally preserving Claude's
additional work identified in §2. There is no remaining missing diagnostic
patch to carry and no reason to cherry-pick the 40-file candidate commit.
Migrations remain only additive145/146/147; no new148 or historical checksum edit
exists at this cut.

### Review requests: ACK is not a repair receipt

| Item | Latest defensible disposition |
| --- | --- |
| Original CR01–04 | Explicit ACK committed as `fe1cfaf4521d32514afe7f79a4da535d951860c3`; ACK says it is not a repair result. |
| CR04 | **ACCEPT source/focused** at `63201e94bf8b63ddc3924f16b992b01d19124439`; independent 123/123 synthetic cases PASS, Node20, 19.28s. No duplicate coverage count. |
| Diagnostic carry / SQL permission | **ACCEPT source** at `1328d1b7`, `6da309df`, `9810f8ef`; two independent static gates PASS. Permission fix belongs to a future image, not installed image9cf5fffa. |
| CR03 | **ACCEPT source/synthetic** at `ec228e53`; independent 42/42 materializer cases PASS, Node20, 20.92s. Actual PG anchor-history query remains a separate gate. |
| CR02 | **CHANGE remains after ec228e53**: repair retry count shares mutable `last_error_*`; interleaved newer live failures reset the oldest revision's counter and can starve later repairs. Require durable non-clobbering revision-scoped retry state and PG interleave/restart/third-attempt/cursor/lease proof. Correction is delivered at the top of peer `CODEX_RETURN_CORE009_REVIEW_2026-10-21.md`, still untracked; no subsequent repair/ACK commit or source WIP observed. |
| CR01 | **ACKNOWLEDGED / NOT DELIVERED**: named Fleet stream/read lineage pairing remains unchanged; no cross-service repair receipt at this cut. |

See [incremental producer review](CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md)
for exact test provenance and the CR02 interleave. The above diagnostics were
already performed during their separate assigned reviews; no test, Docker,
build or runtime action was repeated for this landing refresh.

### Minimal next step, with no source loss

1. Claude finishes the two concrete changes CR01 and CR02, preserving accepted
   CR03/04, diagnostic carry and existing UI. Run only their focused gates first;
   do not rerun unaffected full suites while the finite operational window runs.
2. Owners close their public-document WIP without staging another owner's
   unfinished content. A minimal independent Codex docs commit may contain only
   `CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md` and this landing packet by explicit
   paths; operational receipts can form their own owner-confirmed commit.
   Shared Unified/sync/rules/Edge packet hunks still need coordinated reconciliation.
3. Freeze/repin, preserve both sides of docs, then perform the §6 clean rebase
   and one exact-SHA final gate before integrator-only ff landing. Source-only
   acceptance does not authorize merging now or rebuilding the running candidate.

No merge, rebase, commit, push, branch deletion or automatic source landing was
performed. Core operational installed/connected/cleanup truth belongs to the
newer owner returns, not the historical uninstalled wording in this first audit.

## 9. Incremental CR01 review — Claude `dd9609af` (2026-10-21)

Independent read-only source review: **ACCEPT source**, not connected/runtime
acceptance. Pin `dd9609aff0b860ad509b06f581f74a6bc833a1ac` on
`claude/fe-parity`; commit delta **23 files, +383/−124**, counted once. Canonical
remains `7818d5631e0da37563bca5715fd46d40b66ef1de`, candidate remains
`734353113d8bec85f78b35ab81c9c1a40e93a67e`; canonical…peer is now **0/403**.
Claude's dirty paths remain only shared Unified/sync and the two untracked
handoffs listed in §8; no source WIP was edited or staged by this reviewer.

### What the change actually closes

- `manager-model.ts` exports one `managerLineageRevision(scope, source)`
  derivation and one `fleetReadRequirement(dataset)`. Both the real named Fleet
  read and realtime barrier now use the same `alpha.read` requirement,
  including explicit `requireWholePopulation:false`, and the same dataset/head
  binding. Public lineage remains the existing `accessDigest({scope,source})`.
- `ScopesFleetAuthority` keeps root `business.read_all` separate from the named
  read scope. The root path also authorizes the named scope and fences the read
  under both. The stream still requires explicit `stream.subscribe` through
  `deliverRealtime`; partial viewers still receive a typed unavailable stream.
  No grant, runtime flag, provider or commissioning decision changes here.
- `baseline.revision` stays the raw source head used by cursor/ordinal logic;
  `named_snapshot.lineage_revision` is now the exact scope-bound digest the
  named reader publishes. Actor/session/grants/visible-resource changes move
  the digest, and different source heads remain non-pairing. Existing scope
  revalidation and the two services' source-head guards remain in place.
- Producer schema, generated OpenAPI/schema/types and negative fixtures reject
  a raw head in the lineage field. The FE reader retires the incorrect
  raw-head-equals-lineage rule, but keeps exact digest pairing with the Fleet
  read. The fixture double derives both sides consistently; it remains fixture
  evidence, not a substitute for a real source or grant.

### Test evidence boundary and next step

The exact source of `apps/control-api/test/be-p17-fleet-pairing.spec.ts` contains
**four** `it` cases in one cross-service suite (the packet calls this “1 test”).
It invokes real Manager/Realtime/Scopes/access evaluation and doubles I/O:
same-source pairing; different session/actor/grants/visible resources;
head-change staleness; READ without STREAM and a cursor after STREAM removal.
Existing service, contract, FE conformance and fixture-BFF tests were updated;
one additional PG assertion is explicitly **NOT_RUN**.

[BE-P17 §9](/home/bobby/portal-research-fe/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P17.md#9-receipt-cr-01-2026-10-21--baseline-ghép-đúng-với-fleet-read-thật)
records the implementation and generator checks, but does not record new test
execution counts, output or timing for this commit. Its earlier §5 gate counts
predate CR01 and cannot certify the changed paths. This reviewer ran **no tests,
PG, Docker, build or runtime operation** during the finite Core window.

Minimal follow-through: Claude adds the actual focused execution receipt for
the changed service/contract/FE leaf tests on this SHA; retain the PG gate as
pending until run. Do not repeat unaffected full suites. Source acceptance
supersedes §8's CR01 “not delivered” entry only; **CR02 remains CHANGE**, and
neither this repair nor fixture pairing closes connected native STREAM,
shutdown/recovery, browser or whole ELP2-10 acceptance. No automatic source
landing or image replacement was performed.

## 10. Ownership ACK refresh — Claude `799effc8` (2026-10-21)

Peer HEAD is `799effc8093d64f4d82d7524b2a356f28ef6c929`, one **docs-only**
commit after CR01: `BE-CLAUDE-2026-10-20/HANDOFF_TO_CODEX.md` §11,
**1 file, +16/−0**. Canonical…peer is **0/404**; canonical remains `7818d563`.
Peer WIP remains Unified +13 and sync +13 plus the same two untracked handoffs;
no peer source WIP. Candidate HEAD is still `73435311`, with only the primary's
two native transport paths staged (**+43/−3**) while its normal hook runs.
These pins describe this read-only cut, not the eventual commit result.

- **CR02:** no further implementation or receipt since `ec228e53`. The store
  still overwrites `last_error_*` on live failures and reads those fields for
  repair attempts. The interleaving/restart correction remains **CHANGE**.
- **CR01:** `dd9609af` remains **ACCEPT source**. No new focused execution
  results have been appended to BE-P17 §9; older hook counts cannot stand in
  for those changed tests. No tests were rerun by this refresh.
- **New operational coordination:** Claude §11 explicitly acknowledges Codex
  ownership of `native-business-read-client.ts` and its regression spec, as
  well as operational Core009/session/window cleanup. Claude will selectively
  carry those two paths only after the primary returns their committed SHA.
  The fixture overlay on 8095 remains Claude-owned; switching it to real data
  requires a coordinated consumer/route receipt, not this source carry.
- **Documentation correction still useful:** §11 says §10 has been updated,
  but the older §10 rows physically still say Core009 has zero installs,
  `HOOK_RESULT` does not exist and V2 baselines are unwritten. Preserve those
  historical rows and add a dated current-status table linking the newer
  operational, hook and 46-baseline receipts. Conversely, do not label CR02
  accepted merely because its first repair commit is present.

Next safe landing action: let the isolated native fix finish its hook/commit;
return its exact SHA and two-path delta to Claude, who can carry it while
preserving all other backend/frontend work. Independently finish CR02 and add
CR01's focused receipt. Then coordinate owner-only public-doc commits and a
source freeze before the existing clean rebase/exact-SHA gate/ff-only landing
sequence. No merge, copy, stage, test, runtime operation or peer edit was
performed by this refresh; only this standalone review packet was appended.

## 11. Fresh source-owner intake and delegated C4/C5 covers — 2026-10-21

Read completely: Claude's `ELP2-10/CLAUDE_TO_CODEX_DELEGATION_2026-10-21.md`
(24 lines) and `PORTAL_TO_OWNERS_COORDINATION_2026-10-20.md` (63 lines).
The covers below are **DRAFT_FOR_PRIMARY / NOT_SENT / NOT_ACKNOWLEDGED**.
This reviewer made only bounded read-only SSH calls, no remote writes, tests,
builds, credential reads, authority changes or owner messages. Primary owns
actual delivery and subsequent ACK/disposition in Unified/sync.

### Fresh pins and interpretation

Host `bobby@16.163.212.33` returned hostname `ip-172-31-16-126`.

| Source | Observed worktree / branch / HEAD | Current qualification fact |
| --- | --- | --- |
| Edge | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, `feat/execution-edge-upgrade-v1_2`, `276536c2039b85549b8b7b2ae6049d7370851a9c` | Journal and connected return have additional tracked WIP. Latest recovery ACK is not claimed committed at this HEAD. |
| PM | `/home/bobby/.worktrees/trading-system-pm-v1_1`, `feat/portfolio-account-v1_1-parallel`, `e2efd91bc147f53f08c750e165fee67ebdb4b57a` | §58.307 independently consumes real Core READ/SSE and original custody. §58.308 has PM-owned TS integration corrections in source WIP; not a delivered new provider. |
| TS-next | `/home/bobby/.worktrees/trading-system-next-upgrade`, `0cd356dab20dc385d9effbda408a0ea53280aa4b` | Original N03 manifest remains `OWNER_IMPLEMENTED_SOURCE_DARK_NOT_ACCEPTED`, `owner_accepted:false`, image null. |
| Claude | `/home/bobby/portal-research-fe`, `claude/fe-parity`, `7378d4232010de6033449e7f5323780eed5095ae` | New delegation is committed; shared Markdown WIP remains. This is not an installed consumer pin. |

Exact public artifact hashes, relative to PM's
`contracts/baseline/portfolio-account-v1_1/`:

- `pma11-14-edge-command-transport.json`:
  `83d251e847169571bdfd13839d9a2bcace7db3dda1e5be5b340650a56a6437ba`;
  nested qualified runtime cells and native targets remain empty.
- `pma11-14-edge-command-handoff.json`:
  `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b`.
- `pma11-14-current-recall-read-handoff.json`:
  `ea9f1fa90b34f483e8bdaf2d61b30e16237d39b76ec005788aa9bc59fd0edb7f`,
  `QUALIFIED_ISOLATED_SOURCE_NOT_INSTALLED` — do not request implementation
  from scratch or treat this as mounted current-remainder authority.
- `pma11-13-publisher-fence-additive-owner-handoff.json`:
  `d5c2efcc60b6b5436539b2abadaa140b290ff6b2c5d7fd1627ffaed33aa84c66`,
  `SOURCE_CANDIDATE_QUALIFIED_NOT_INSTALLED`; original migration59 retained.
- `pma11-16-finite-pilot-resource-successor-proposal.json`:
  `771955a5d8be3ee050aae677a8a25688c349f500badc4409dedd92d29dc9cfa0`,
  `execution_ready:false`; proposed 3CPU/2560MiB is not an approved budget.
- `pma11-16-matched-measurement-preparation.json`:
  `31164f54e48ac805b8a7befe254a3705f2816ded1406e52f67007bce36a63df9`
  in PM WIP, not an immutable delivered measurement receipt.
- TS-next N03 manifest:
  `f3a496034abbb9fc3e29789d147b8040825015ed700113725717dd460d414872`.

Core context for all four covers: original eight admissions, seven settled and
one original `785387ba-ef57-455d-a7ba-f92663baae60` /
`07becd72-1e11-4ab9-8a96-d5fd7339f1a0` unresolved at the independently observed
cut. Primary owns the existing transport repair and same-key recovery; these
requests must not duplicate session/grant/ISSUE/ENTER/revoke/cleanup or delay
that already-owned action. READ/SSE transport proof is not command authority,
fresh financial publication, browser acceptance or permission to grant Fleet
STREAM from the native-profile READ/STREAM scope.

### C4 cover 1 — PM command07 (ready for primary delivery)

Existing public owner directory verified:
`/home/bobby/.worktrees/trading-system-pm-v1_1/contracts/baseline/portfolio-account-v1_1/`.
Corresponding original Edge packet:
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-07/COMMAND_RELAY_AND_OWNER_RETURN.md`.

> PM owner: please consume the original EPG10-07 / RG03/RG04/RG16/RG17 request
> against PM `e2efd91b`, transport `83d251e8` and handoff `7b62d7e1`, preserving
> existing lifecycle/held-COMMIT implementation and its isolated receipts.
> Return the first genuinely commissioned operation × environment × native
> target/profile cell, with authenticated submit/status endpoints as private
> references; current human/session/workload/delegation and policy revisions;
> held authority through outer COMMIT; original/latest complete outcome,
> same-key conflict/UNKNOWN/recovery/one-effect and authoritative retention.
> Current qualified target/cell lists are empty; do not enable all structural
> capital operations merely to fill them. Also disposition current-recall
> read `ea9f1fa9`: exact original recall ID and five CAS fields versus historical
> status/receipt, and its installed consumer binding, not a second writer.
> Return source/image/config pins and exact accepted scope in the existing
> PM/Edge07 packet; mark unavailable cells explicitly. No new runtime/command
> authority is granted by this coordination request. ACK requested, not assumed.

PM guide/journal locators: current R2
`upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`;
`TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` §58.307 (line84878) and
§58.308 (line84904). Do not overwrite the latter's concurrent source corrections.

### C4 cover 2 — TS publisher03 (ready for primary delivery)

Existing public owner directories verified:
`/home/bobby/.worktrees/trading-system-next-upgrade/contracts/portal-execution-owner/ts-oc-02/n03-source-implementation/`
and Edge `upgrade/evidence/execution-edge-v1_2/EPG10-03/`.
Original Edge packet: `CAPTURE_CONTRACT_AND_OWNER_RETURN.md`.
TS journal: `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` and active
`TRADING_SYSTEM_STABLE_CONTRACT_POLYGLOT_CORE_UPGRADE_PLAN.md` in TS-next;
use the current PM R2 guide and additive handoff for the shared fence, not an
older copied guide or rewritten migration59.

> TS publisher owner: N03 `f3a49603` at TS-next `0cd356da` remains source-dark,
> while PM additive fence `d5c2efcc` and atomic startup/idle-renewal exist as
> isolated-qualified source. Please return the admitted model/binding/source
> cell, original role, physical DB, source epoch/slot and expected generation;
> exact first-hook quiescence/drain of pre-hook publisher transactions; additive
> installation preserving original59 checksum/function security; and a genuine
> paused-old-writer/no-ACK proof under same-transaction publisher authority.
> For each actually offered dataset, include writer/export/correction/delete
> coverage, complete transaction groups, continuity/barrier/retention/resync,
> authenticated receiver and applied checkpoint semantics. Return installed
> source/image/config and bounded receipt pins to existing EPG10-03/TS packets.
> Scope can be a narrower correct dataset, not an invented full census. Research
> READ commissioning is not TS install authority or source financial acceptance.
> No duplicate fence implementation or new approval question is requested;
> disposition the existing exact operational admission separately. ACK pending.

### C4 cover 3 — targets01/06 (ready for primary delivery)

Existing Edge public directories verified:
`upgrade/evidence/execution-edge-v1_2/EPG10-01/` and `EPG10-06/`;
original latter packet `RESOURCE_ENVELOPE_AND_HOT_PATH.md`.
PM preparation lives in its existing `contracts/baseline/portfolio-account-v1_1/`.

> PM/TS/DL/Research target owners: please return a named owner and exact admitted
> target roster, immutable service/image/config/physical-DB/storage references,
> filesystem device/quota/durability/admission, baseline headroom, workload and
> stop/rollback conditions. Attach already approved numeric-bound references
> where they exist; otherwise label values as a proposal with measurements needed,
> not a production default. PM successor `771955a5` and current matched
> preparation `31164f54` remain not execution-ready. Return the finite measured
> window, duration/repeats, instrumentation and independent restore/probe plan.
> Pilot20 operations/arm and paired shared-load deltas remain different from
> B0/B1/B2 canonical capacity/coexistence and absolute-SLO evidence. Reuse the
> existing observer/harness; no framework or simultaneous duplicate load job.
> Reply per target in original01/06 packets; no need to wait for unrelated
> financial/command commissioning to prepare owned target inputs. ACK pending;
> this request itself neither approves 3CPU/2560MiB nor starts measurement.

### C5 — NET_PNL shared-account semantics question (ready for primary delivery)

Send with the PM cover in the existing PM baseline/owner packet; source-authority
answer may require TS economics owner. Portal locator:
`apps/control-api/src/execution-v2/manager-model.ts` `dedupeManagerFacts` /
`economicFacts` / `managerPartitionTotals`, and Claude BE-P16 §3 row11.
Source currently dedupes by fact identity first; NAV/balance snapshots additionally
dedupe by economic partition + kind + economic account + ownership partition.
`net_pnl` does not use that snapshot dedupe. This is a question, not a proposed
silent financial rewrite.

> For two source `net_pnl` facts that identify the same physical/economic account,
> currency, valuation basis and time window, but appear under different
> deployment/portfolio tuples or different fact IDs: are these repeated views of
> one cumulative account PnL, disjoint allocated contributions, or distinct
> economic events? Please publish the authoritative grain and unique key,
> meaning of `economic_account_ref` / `ownership_partition_ref`, whether shared
> account populations are disjoint or overlapping, and exact window/origin,
> methodology, economic/cashflow revisions, included cost layers and correction/
> supersedes semantics. Return examples for true duplicate, valid distinct
> allocation and conflicting duplicate, including expected fund and portfolio
> totals. Which source field proves allocation exclusivity or ownership weights?
> Missing or conflicting attribution must remain typed unavailable until the
> owner rule is explicit; Portal must not choose account-only dedupe or sum by
> different fact ID as an economic policy. Claude implements the approved rule
> once answered, with regression/contract fixtures. No authority decision made.

### Recovery ACK pin correction (primary owns the shared receipt)

Latest actual Edge owning return is
`EPG10-08/EDGE_CORE009_CONNECTED_READ_SSE_2026-10-21.md` §`Separate later recovery-only window ACK —05:56UTC`
(line193), SHA256
`04a89ed66679374275fdf6fc672586085d76d670278bb08bb35eee9e3ff70b17`.
It ACKs **06:45–07:15UTC**, replacing the unexecuted05:50–06:20 maintenance
proposal only. Journal line28033 corroborates, observed SHA256
`0ae58e8940860ef7d385efe622e8dff45bf13036a5990b92cadbcccc0aedaeae`.
Both include live WIP after EdgeHEAD276536c2; repin again before execution.
There is no separate `EDGE_RECOVERY_ONLY_WINDOW_ACK_2026-10-21.md` on HK.
Canonical SGP's same-named receipt SHA256
`8cae951c176117da82859280da89720476e4c27306c7f2a396cc3ba7036e268c`
still records the earlier window and needs a primary-owned dated addendum.
The new scheduling ACK does not extend acquisition, human session, grant or
source acceptance; original custody remains until actual terminal/ACK.

### C7 — actual hook availability and least-repetition landing order

Both checked-out `.githooks/pre-commit` files are byte-identical:
`b556b874edf69a65c6168d22e0bab779610a2e64063dcdb154c41b394ccc7608`.
They unconditionally call the maintainer `verify-workspace.sh`; neither has an
implemented docs-only tier selector. Canonical verifier is
`c51dc1439f7e3f5082e1961b7b83ff07867bc4a4a6683bd0e7309facfe9ad985`, peer verifier
`ccc89fd65f2d748f7c576b14756648230dbaaf238e60dd8ff623998004d595eb`.
Canonical campaign §10.10.4 confines R0/R1 bypass to unpublished
`claude/fe-parity`, not canonical/candidate. Peer adds §10.10a focused work and
one integrator milestone; that is not an automatically installed hook selector
or permission for this reviewer to bypass the canonical hook.

Therefore batch canonical owner-confirmed public Markdown once, with explicit
paths and staged diff/link/tracker checks, preserving all Edge/Claude shared
hunks. Its current normal hook still runs unless a separately approved
implementation/rule changes that behavior. Do not add a guessed skip variable,
change hooks during the running gate or copy the peer verifier as a shortcut.
After primary returns the native transport commit and Claude selectively carries
it, finish CR02 and the missing CR01 focused receipt; have Claude commit its
owned WIP, clean-rebase onto the resulting canonical tip, regenerate shared
artifacts, freeze and run the required final R2/R3 once on that exact SHA.
Integrator alone then ff-merges with canonical clean. No dev/main, push or
runtime cutover follows implicitly. This review executed no gate or landing.
