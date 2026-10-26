# All local Portal branches and worktrees — 26 October 2026

## Scope, authority and pins

Snapshot: **2026-10-26 11:02:45 UTC**. This is an exhaustive read-only census of local
`refs/heads` and registered worktrees sharing `/home/bobby/portal/.git`, not a
request to merge every historical branch. Primary owns actual consolidation,
backups, shared trackers and final scope. Bobby's latest assignment permits
local consolidation into `docs/research-loop-plan` with unresolved frontend
gates documented; this report does not claim those gates have passed.

- Integration/candidate input: `chore/backend-residuals-20261025` at
  `a19112ecc245cfbaa256a56d8bd99096880409fb`, worktree
  `/home/bobby/portal-backend-residuals-20261025`.
- Canonical before consolidation: `docs/research-loop-plan` at
  `685bc1915db51c7869254c1fdfa68991d7e4aae4`, worktree `/home/bobby/portal-research`.
- Claude input: `claude/post-land-20261022` at
  `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`, clean and fully contained in candidate.
- Edge source lane: `chore/manager-scoped-notices-20261026` at
  `151f55afc3902443d391fac93c22de1ce926fb65`.
- Earlier same-day patch-equivalence audit compared all local heads against
  `2aae8cbafe46e30c61e301bb559300f858d7a9f0`. All **183** previously
  noncontained branch tips are unchanged in this refreshed census.
  Candidate advanced by the documentation-only commit `a19112ecc245cfbaa256a56d8bd99096880409fb`.
  Therefore the earlier exact code patch proof is reused, not reported as a new
  test run. The earlier audit's exact wall-clock time was not retained; its date
  and comparison pins were retained.

Read again for this round: root `AGENTS.md`, Execution README and campaign
rules §§7–8, 10.8, 10.10–10.10c and 10.13. No peer WIP, Git refs, index,
code, contracts, tests or shared tracker were edited by the census agent.
The sole allowed write is this report. No runtime/source qualification,
release, push, deployment or frontend consumer acceptance is inferred.

## Committed Claude preservation and WIP boundary

All 15 local `claude/*` heads are listed here and again in the exhaustive
table. Five are actual candidate ancestors; six other heads have strict
patch-equivalence proof, three have reworked counterpart traces, and one is
the now-preserved historical receipt lane. Preserve all original ref tips.
An ancestor check proves committed source reachability only: it never includes
a worktree's tracked modifications or untracked files.

| Claude branch | Full committed tip | Candidate ancestor | Classification |
| --- | --- | --- | --- |
| `claude/be-elp2-09-realtime-scoped` | `b62d906a8abb589c552fd167abfe9749b8c6467f` | NO | HISTORICAL_RECEIPT_PRESERVED |
| `claude/be-gaps-2` | `0975286c57f0b400bda1f7b503bb5c525a47da29` | NO | PATCH_EQUIVALENT |
| `claude/be-gaps-2-bep1` | `149daafc8887495e4e88d7cf6bc70e83e00165b1` | NO | PATCH_EQUIVALENT |
| `claude/be-gaps-2-p2` | `85f96011a3b692a5b1ce471ff378b3f4c5bc7df1` | NO | REWORKED_OR_SUPERSEDED |
| `claude/be-gaps-2-p3` | `802f09379447d6969d2135bd064927de33d88a57` | NO | REWORKED_OR_SUPERSEDED |
| `claude/be-integ` | `4972daec896ae993c46336df72655d1663772cc3` | YES | CONTAINED_CANDIDATE |
| `claude/be-p16-financial-publication` | `68344b2e9dbadc747974de2163aedb78b688661a` | NO | PATCH_EQUIVALENT |
| `claude/be-p4-lifecycle-series` | `3cf7d0bb6be6501e4c977a3119026e2bbfafd7be` | NO | REWORKED_OR_SUPERSEDED |
| `claude/fe-parity` | `d58361eafe071bbc9922a7e87c58f0a9d00b7ea2` | YES | CONTAINED_CANDIDATE |
| `claude/fe-parity-md5` | `642035b5c7c1a840943b92526edae7ce4c03e503` | NO | PATCH_EQUIVALENT |
| `claude/paper-history-qual-20261023` | `a92469bd91019c70474a035c98de316dc964ab46` | NO | PATCH_EQUIVALENT |
| `claude/post-freeze-20261021` | `3aaf24f4e66bca6c27962ddbbc2049cfb6505421` | YES | CONTAINED_CANDIDATE |
| `claude/post-land-20261022` | `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` | YES | CONTAINED_CANDIDATE |
| `claude/rv06-no-hover-reasons` | `eb23f8c16c2f89ffb29287f076acd3f9c2df8b59` | NO | PATCH_EQUIVALENT |
| `claude/uxm-f9` | `ed3c7cbdd3d75e359c4d56308e680d316fbbea4d` | YES | CONTAINED_CANDIDATE |

The active post-land worktree is clean; post-freeze's separate dirty state
(3 tracked / 8 untracked) remains preserved at its named worktree. The six
dirty Claude agent worktrees retain their own WIP locators in the worktree
and untracked-name tables. No statement that candidate contains a committed
Claude tip is a claim that it contains these uncommitted bundles.


## Counts and topology

| Census | Count |
| --- | ---: |
| Local heads | 440 |
| Distinct head tip SHAs | 302 |
| Registered worktrees | 46 |
| Clean / dirty worktrees at snapshot | 33 / 13 |
| Worktree HEADs contained / not contained in candidate | 27 / 19 |
| Heads contained / not contained in candidate | 257 / 183 |
| Heads contained / not contained in canonical | 246 / 194 |
| Tracked modifications / untracked status entries across worktrees | 79 / 277 |

Status totals count entries, not deduplicated physical files: the old root
checkout lists 17 nested Claude worktrees as untracked directories.
Its 259 untracked entries comprise 221 frontend dist files, 19 snapshot PNGs,
17 nested worktree directories, `.agents/rules/antigravity.md` and the D4
source handoff. Untracked contents were not opened.

This snapshot precedes creation of this report; the report itself adds one
untracked documentation path in the candidate worktree. Concurrent primary
consolidation may advance refs after this immutable snapshot.

```text
main = dev @ 533162635f56584d630e3d971d77d50860595f15
  +-- canonical @ 685bc191... (+1990 reachable commits from main)
  |     +-- candidate @ a19112ecc... (+212 from canonical)
  |          contains Claude @ 00e7f6cf... (110 commits behind candidate)
  +-- Edge source @ 151f55af... (+143 from main; separate source-only lane)
```

Canonical/Claude merge-base:
`2f9ca2dc8f6769ea91f7d123083c2f6d4805c730`; before consolidation Claude
is 163 ahead / 61 behind canonical. Candidate already contains both.
Canonical/Edge merge-base is the main/dev SHA above; Edge is 143 ahead /
1990 behind canonical and 143 ahead / 2202 behind candidate. A blanket merge
of an old-main-based source tree is not a substitute for scoped integration
and source-owner qualification.

## Classification and meaning

| Primary classification | Heads | Required disposition |
| --- | ---: | --- |
| CONTAINED_CANDIDATE | 257 | Already reachable; no rescue |
| REWORKED_OR_SUPERSEDED | 29 | Counterpart/replacement trace; no blanket merge |
| PATCH_EQUIVALENT | 140 | Exact patch proof reused; preserve ref |
| HISTORICAL_OUT_OF_SCOPE | 9 | Preserve historical ref; exclude current landing |
| EDGE_SOURCE_ONLY | 1 | Separate Edge owner/source qualification |
| HISTORICAL_RECEIPT_PRESERVED | 1 | Original bytes preserved by a19112ecc |
| SCREENSHOT_EVIDENCE_ONLY | 1 | Preserve 60 PNGs only; not stale tracker |
| FIXTURE_COMMITTED_WIP | 1 | Claude review of synthetic financial semantics |
| FRONTEND_SHARED_BLOCK_REVIEW | 1 | Historical frontend comparison; not backend fix |

There are 772 distinct nonmerge commits and three historical merge commits
reachable from noncontained local heads but not the earlier candidate.
Of the 772 nonmerge commits, **566 are strictly patch-equivalent** to an
earlier candidate commit by stable full-commit patch ID. The other 206 are:
143 Edge-source commits, seven historical/out-of-scope commits and 56 recent
Portal commits. The latter group is 46 rewritten same-subject counterparts,
three reworked native/Core009 integrations, three generated-ledger refreshes,
one frontend-only shared-block change and three preservation/WIP findings.
Same-subject traces are not labelled exact patch equivalence.

The 29 REWORKED_OR_SUPERSEDED heads below require no automatic rescue merge.
This class means the recorded counterpart/replacement trace was reviewed for
backend census purposes, not that every older frontend hunk has been
independently revalidated against current accepted design.

## Preservation findings and primary opportunities

### P01 — Original realtime receipt: preserved in current candidate

Source `b62d906a8abb589c552fd167abfe9749b8c6467f` used
`upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P16.md` for the
ELP2-09 `alpha_fleet_overview` snapshot/SSE receipt. Financial-series work
later used the same filename. The three implementation commits on that
four-commit source lane are patch-equivalent; the original receipt is not a
missing backend implementation.

Primary's `a19112ecc` has now preserved the original bytes at
[BE-P16-REALTIME-ORIGINAL_2026-10-20.md](../BE-CLAUDE-2026-10-20/BE-P16-REALTIME-ORIGINAL_2026-10-20.md).
Both source and preserved destination resolve to Git blob
`dc5a99e2c216184cecc9980cd568bb6f0a6b7045`, SHA256
`ffdaade28c950e30befd147f251d97cf84d77efc23480150cfe2ed08301cf128`,
12,816 bytes / 81 newline-terminated lines. RESOLVED_PRESERVED; do not replace
the current financial-series `BE-P16.md` or turn historical NOT_RUN into PASS.

### P02 — Historical screenshots: RESTORED_VERIFIED by primary

Primary follow-through:60exactPNGs restored and each byte compared successfully
against3fa008a37;7,525,929bytes and manifest below match. Existing32flat-named
PNGs were not replaced. Final commit/landing recorded separately in
[local consolidation](LOCAL_CONSOLIDATION_2026-10-26.md); tables stay pinned
to the earlier snapshot, not a moving HEAD.

Source `worktree-agent-a39169c38a3bbe0d4` at
`3fa008a37e86e91fa66065c8f75b56e97bc21a6e` contains 60 PNGs absent from
candidate under
`upgrade/execution_loop/evidence/UXM-07/debt048-2026-10-22/`.
No registered worktree exists for this ref.

| Directory | Paths | Bytes |
| --- | ---: | ---: |
| before/ | 30 | 3,773,813 |
| after/ | 30 | 3,752,116 |
| Total | 60 | 7,525,929 |

Each side has 1440/390 pairs for access, account-360, admin-actions,
alpha-360-orders, alpha-360-overview, blotter, canary, cockpit, compare, fleet,
live, portfolio-360, portfolios, sandbox and workbench-paper.
Ordered manifest SHA256 for `path<TAB>size<TAB>blob<LF>` in
`git ls-tree -r -l` order:
`73bb56d190a0bd83fff1828f2fe8d08ca21aebcb258b7114c6693609576c018e`.
Primary may preserve these immutable evidence bytes without restoring that
commit's stale `debt-register.json`. Preservation is not current screenshot
acceptance and does not change design.

### P03 — Committed financial fixture WIP: RESCUED_FOCUSED_TESTED by primary

Primary applied the committed0ef0d6e0fixture delta while preserving newer
incident-child wiring. `positiveWorld`, `reviewCapital`, `reviewManager` and
`wpcFixture` focused tests pass; added current-balance/window/budget regression.
This does not import/cover separate dirty`bffDoublePortfolios.ts` WIP below.

`worktree-agent-a5d9d960e9549ca00` at
`0ef0d6e0f036cc506c0b3d571f15a6d5b25c1633` changes only committed
`apps/portal/fixture-bff/review-manager.ts`, +25/−3: window-independent NAV,
young-book 90D=30D, budget above allocation and allocation=sum. Candidate lacks
`windowAfter()` and retained the90D5/2scaling at the census input. It was a real
unlanded synthetic-world change, not a patch-equivalent ref. Primary has now
rescued/reviewed/tested that narrow slice under Bobby's local consolidation
assignment; original ref remains preserved.

The same worktree has one further tracked, uncommitted file:
`apps/portal/frontend/e2e/bffDoublePortfolios.ts` (working blob
`b941cc25e15231c52fb4b69b7c66625bff327e1d`). Its world-backed deployment,
account, balance and exposure overlay is absent candidate. It is coupled
fixture WIP, not a tested backend artifact. Do not copy the complete worktree.

### P04 — Narrow non-design fixture-clock fix: primary review candidate

Worktree `/home/bobby/portal/.claude/worktrees/agent-ae27f31f1ad960119`
has a tracked seven-line addition in
`apps/portal/fixture-bff/time-rebase.ts` that shifts plausible epoch-ms
instants specifically in numeric `points: [[epoch_ms,value],...]` tuples.
Current rebasing shifts named *_ms/ISO fields but not these tuple positions.
Its matching tracked regression adds 13 lines in
`apps/portal/frontend/src/fixtureBff/timeRebase.test.ts`: tuple instants move,
values/nulls and unrelated arrays do not, and non-epoch 5 stays unchanged.

Working production blob `38b0169c95ee62c56e4373fc379bf71b483165b8`;
candidate production blob `a2e4fcceebf59bb09700b565f8ac6c63fa833e85`.
The narrow two-file patch was subsequently rescued by primary under Bobby's
quick non-design allowance; `timeRebase` and HTTP `worldClock` tests now PASS.
**NOT_RUN by census agent**; primary's actual validation is recorded in the
local-consolidation packet, not claimed as a new census-agent test run.
Do not include the worktree's unrelated account/blotter UI, labels/network
or simulated-world changes merely to obtain this fix.

### P05 — Other genuinely uncommitted fixture-world work

- `agent-a41bebe538f3a7aa8` modifies `review-manager.ts` to reject unknown
  positive-world alpha IDs with typed 404, and adds world-backed/fallback
  gross-exposure composition. The 404 hunk is separable for review; the
  simulated financial exposure policy needs the owning fixture slice and
  tests. No whole-file replacement of the current BFF.
- `agent-a540a08ee9939a9e4` changes `review-manager.ts`,
  `e2e/bffDoubleAccess.ts`, `e2e/bffSimulated.ts` and its simulated register
  to use one approval record and the world's roster. It depends on untracked
  `e2e/bffApprovalWorld.ts`, whose contents were not read. Preserve and obtain
  Claude's coherent artifact; do not import an incomplete dependency closure.
- `agent-ae27f31f1ad960119` also changes `e2e/bffSimulated.ts` for environment
  network labels, deployment/portfolio/alpha labels and positive binding
  issue counts. These remain separate from P04 and require consumer review.
- `worktree-agent-a5fd68ae8b663f717` /
  `1bf7489ed41c353eaf17bc5bab76f0d68d6f73f4` is an older frontend-only
  43-path shared-block/wording slice. All paths exist in candidate, 13 are
  byte-identical and 30 evolved. No production-backend rescue is identified;
  detailed current-design comparison belongs to Claude.

### P06 — Edge source campaign, not a foreign repository

The 143-commit source lane is in this same Portal monorepo, principally
`services/portal-execution-edge-rs/**` and
`upgrade/evidence/execution-edge-v1_2/**`. Its latest six commits are
`1fef487da`, `53eea251f`, `8981f3c38`, `31f7cc8a7`,
`91c31b993`, `151f55afc`: original-human notice replay, narrow membership
proof and tagged ownership. Latest receipt
`upgrade/evidence/execution-edge-v1_2/EPG10-08/MANAGER_TAGGED_OWNERSHIP_REPAIR_2026-10-26.md`
states SOURCE_ONLY / IMPLEMENTED_R1, not installed/source-qualified.
Actual Manager columns lack the accepted complete canonical five-tuple;
connected/consumer qualification remains OPEN. Primary coordinates the
separately owned source delta; merging source cannot supply missing authority
or turn old sealed proof into newly qualified narrow membership.

## Tracked backend WIP review

Only tracked diffs were inspected; untracked file contents were not opened.

| Worktree/path | Review conclusion |
| --- | --- |
| core009-revoke-denial: read-scope.ts | ACCESS_DENIED -> EXECUTION_READ_SCOPE_REQUIRED 403 already in candidate; current file has later unrelated evolution |
| core009-revoke-denial: native-manager-preparation.spec.ts | Working bytes exactly candidate; no rescue |
| elp204-fixture-repair: elp204-explicit-portfolio-list.spec.ts | Working bytes exactly candidate; no rescue |
| elp204-fixture-repair: scripts/control-api-test.sh | Focused pre-test migration bootstrap already candidate; candidate adds later qualified export/preservation checks |
| research-fe: be-p23-users-roster-keyset.pg.spec.ts | Positive disabled/archived/locked fixture repair already candidate, with exact row/count assertions; candidate uses locked user-012 rather than WIP user-016 |
| research-fe: Unified and sync appends | P22 factory assignment and Edge08 return request already in candidate; Unified contains historical R0 delivery verification too |
| contract-elp210: Unified append | Historical served-contract follow-through not copied verbatim to index; same source diff SHA/pending qualification is preserved in FE073_FE074_SERVED_CONTRACT_RETURN_2026-10-21.md; do not append stale pending gate as current |
| Fixture BFF/doubles | Distinct uncommitted work preserved; P03–P05 describe primary opportunities |

No unique production Core backend fix is required from these dirty legacy
worktrees. This conclusion does not authorize deleting/reverting them.

Working Git blob identifiers make the reviewed tracked bytes explicit:

| # | Worktree relative to /home/bobby | Tracked path | Compared with candidate bytes | Working blob |
| --- | --- | --- | --- | --- |
| 1 | `portal-contract-elp210` | `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` | DIFFERS | `ba801b8348f82a306ba50ae22c369b8f53c953cf` |
| 2 | `portal-core009-revoke-denial-20261022` | `apps/control-api/src/execution-v2/read-scope.ts` | DIFFERS | `310944096f189388ef61aae891b0eed41d8eaa9c` |
| 3 | `portal-core009-revoke-denial-20261022` | `apps/control-api/test/native-manager-preparation.spec.ts` | IDENTICAL | `a590aaaacb66668530a5b002d13df1ff40eaf70d` |
| 4 | `portal-elp204-fixture-repair` | `apps/control-api/test/elp204-explicit-portfolio-list.spec.ts` | IDENTICAL | `32938086e44faa01b72f4f88a95363477f5d0908` |
| 5 | `portal-elp204-fixture-repair` | `scripts/control-api-test.sh` | DIFFERS | `d50d6f88bb2fa2bce7095c7437fc156dfce4509d` |
| 6 | `portal-research-fe` | `apps/control-api/test/be-p23-users-roster-keyset.pg.spec.ts` | DIFFERS | `8aa0389dfb301d68735bbbc61add44292e7998a0` |
| 7 | `portal-research-fe` | `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` | DIFFERS | `008e04ee1c58ff7d6d0db8b6415de584a4e63562` |
| 8 | `portal-research-fe` | `upgrade/execution_loop/FRONTEND_BACKEND_SYNC.md` | DIFFERS | `a3419f33ee62c3d455afc7c62a376ee2f5fae3db` |
| 9 | `portal/.claude/worktrees/agent-a41bebe538f3a7aa8` | `apps/portal/fixture-bff/review-manager.ts` | DIFFERS | `077ca9a46e20eeb536683f074d328bad05eb2ffd` |
| 10 | `portal/.claude/worktrees/agent-a540a08ee9939a9e4` | `apps/portal/fixture-bff/review-manager.ts` | DIFFERS | `e2a63584dd9d8b1e08cda8f463679e6d0e17f410` |
| 11 | `portal/.claude/worktrees/agent-a540a08ee9939a9e4` | `apps/portal/frontend/e2e/bffDoubleAccess.ts` | DIFFERS | `2a78107e2e440a2cbedd37dea92c52030ab36bdd` |
| 12 | `portal/.claude/worktrees/agent-a540a08ee9939a9e4` | `apps/portal/frontend/e2e/bffSimulated.ts` | DIFFERS | `66176b385a602d5fad0336a24cd836665bf216df` |
| 13 | `portal/.claude/worktrees/agent-a540a08ee9939a9e4` | `upgrade/execution_loop/evidence/UXM-07/SIMULATED_DATA_REGISTER_2026-10-22.md` | DIFFERS | `fdf3d55aa6ab917108c22de9e93aa1356a326ba6` |
| 14 | `portal/.claude/worktrees/agent-a5d9d960e9549ca00` | `apps/portal/frontend/e2e/bffDoublePortfolios.ts` | DIFFERS | `b941cc25e15231c52fb4b69b7c66625bff327e1d` |
| 15 | `portal/.claude/worktrees/agent-ae27f31f1ad960119` | `apps/portal/fixture-bff/time-rebase.ts` | DIFFERS | `38b0169c95ee62c56e4373fc379bf71b483165b8` |
| 16 | `portal/.claude/worktrees/agent-ae27f31f1ad960119` | `apps/portal/frontend/e2e/bffSimulated.ts` | DIFFERS | `e4da0f9858dd63ef5a6e272af6994c64eae518f2` |

## Deliberately superseded paths and selected native traces

Eight absent paths in older WP-K stage-entry/digest fixtures/tests are
intentional replacements, not missing modules:
`c64d02e1a3436f96303f6760c97ee672d35efd43` explicitly drops the old
STAGE_TRANSITION_SOURCE_PUBLISHED slice for Codex snapshot timing
`82947ceb2`; `b17b110bf` drops the duplicate visit-digest sibling in favor
of the persisted service. Do not reintroduce the retired contracts/tests.

- `734353113d8bec85f78b35ab81c9c1a40e93a67e`: all 40 changed paths exist;
  30 match candidate bytes exactly, including the commissioning CLI/template
  family and integration-return receipt; other paths evolved.
- `9d88e40a963f4eb2245f8ec0343c2c511a98bd68`: native business-read client,
  explicit-portfolio/client regressions and D4/N17 resource scripts exactly
  match candidate; its other tracked paths evolved.
- `b87f73dbda3d119dbb09ed9f263b89738abbb874`: all 25 paths exist in
  candidate; native/realtime code has subsequent lineage fences, preparation
  caps, original-I/O settlement and lifecycle work.
- `chore/complete-fixture-review-20261023`: 15/19 commits exact-patch covered;
  remaining visit-digest/contributor/accounts/portfolio-label packages have
  rewritten counterparts `fe5a98ba3`, `0a839af87`, `293ab7c7c`,
  `0f2d9d59e`.
- `chore/elp210-served-contracts-frozen`: both commits exact-patch covered.

Recorded nonexact/ref trace index (exact covered nonmerge commits / total):

| Branch | Exact/total | Remaining old commits for locator |
| --- | ---: | --- |
| `backup/fe-parity-pre-rebase-2026-10-18` | 15/17 | `f0b17ec4e`, `d891b2a57` |
| `backup/fe-parity-pre-rebase-2026-10-18b` | 37/42 | `02d22ac32`, `517684b66`, `128e1cf4d`, `488b24573`, `fc67af2d6` |
| `backup/fe-parity-pre-rebase-2026-10-19` | 47/53 | `be6ca0d06`, `badb2edba`, `98942620d`, `a5d890b8e`, `2feb622c6`, `50d792e2d` |
| `backup/fe-parity-pre-rebase-2026-10-19c` | 22/23 | `f9306af80` |
| `chore/complete-fixture-review-20261023` | 15/19 | `37bbecf92`, `ace3547ca`, `b29145100`, `8822d58f2` |
| `chore/core009-connected-20261021` | 0/2 | `9d88e40a9`, `734353113` |
| `chore/elp204-target-expiry-fixture` | 0/1 | `734353113` |
| `claude/be-gaps-2-p2` | 5/6 | `7591dca0d` |
| `claude/be-gaps-2-p3` | 1/6 | `802f09379`, `8199d6efe`, `6484c5951`, `611942613`, `1ac72a26b` |
| `claude/be-p4-lifecycle-series` | 3/4 | `4ecef0f89` |
| `feat/execution-native-read-integration` | 0/1 | `b87f73dbd` |
| `worktree-agent-a08d9493bf6d7766b` | 5/6 | `58de77512` |
| `worktree-agent-a0eef2a17140ccef1` | 2/3 | `3ac4cd8ca` |
| `worktree-agent-a26017ffd0e88ca0b` | 3/4 | `dd3e22d32` |
| `worktree-agent-a47d00c1c7d79558e` | 0/1 | `03d942608` |
| `worktree-agent-a53e0986c2b953fb9` | 8/9 | `914af0f32` |
| `worktree-agent-a5b219770d7086344` | 14/17 | `ca3397bfd`, `99405cb3c`, `c21f5f013` |
| `worktree-agent-a5b27392ce6208dc6` | 1/2 | `60ad243b4` |
| `worktree-agent-a68d707e6cb5f1176` | 1/2 | `212ebc4cc` |
| `worktree-agent-a7472fea8c507405a` | 2/3 | `3326d23f8` |
| `worktree-agent-a82236cec18af83d9` | 14/16 | `d15ff24cb`, `35a1577a7` |
| `worktree-agent-a8d49670342a6d0b6` | 1/2 | `2e4b3b4ae` |
| `worktree-agent-a915b0a5feb40994b` | 1/2 | `b3813c7f2` |
| `worktree-agent-a9830660d79a3d9f8` | 0/1 | `855933335` |
| `worktree-agent-a9ae2645d62c1e59e` | 9/11 | `b3af49056`, `ee635709e` |
| `worktree-agent-ac5cd4a6a82ddc886` | 5/6 | `abecbfe39` |
| `worktree-agent-adb91dc3877d929d6` | 0/1 | `4be14a547` |
| `worktree-agent-aeb3d051a0b8cca9a` | 3/4 | `d01400a94` |
| `wpk-backup` | 0/3 | `40d09212e`, `c2620e3d5`, `823ff3b4a` |

## Every local head — 440 rows

A/B means tip-only commits (ahead) / baseline-only commits (behind).
Candidate-contained is ancestry, independent of patch equivalence.
Every local `refs/heads` entry has one primary classification; remote-tracking
refs and tags are intentionally not local-head rows.

| # | Local branch | Full tip SHA | Candidate contained | Canonical A/B | Candidate A/B | Primary classification |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `backup/a4-before-main-sync-20260916` | `294a643ff6ef915d7ac48ffe33abca628d229cdb` | YES | 0/2073 | 0/2285 | CONTAINED_CANDIDATE |
| 2 | `backup/codex-research-ol-pre-bec-20260926` | `9a15a2b83a44675658746ad8d432d0a35b0f117f` | YES | 0/1666 | 0/1878 | CONTAINED_CANDIDATE |
| 3 | `backup/fe-parity-pre-rebase-2026-10-18` | `3b6dad1671e0a8ef2e479b3110dea9fddc2d0689` | NO | 17/1146 | 17/1358 | REWORKED_OR_SUPERSEDED |
| 4 | `backup/fe-parity-pre-rebase-2026-10-18b` | `33073136ea70282130c2f48a4fad8eec8a91328d` | NO | 42/1144 | 42/1356 | REWORKED_OR_SUPERSEDED |
| 5 | `backup/fe-parity-pre-rebase-2026-10-19` | `be6ca0d06a34cb6fce9a00db953854d08913f942` | NO | 53/1143 | 53/1355 | REWORKED_OR_SUPERSEDED |
| 6 | `backup/fe-parity-pre-rebase-2026-10-19b` | `c913201e15db97d1b8441b4d623ab32d0f009e32` | NO | 15/1088 | 15/1300 | PATCH_EQUIVALENT |
| 7 | `backup/fe-parity-pre-rebase-2026-10-19c` | `b580d37fdd699d9d256de210d6a878414242d12c` | NO | 23/1087 | 23/1299 | REWORKED_OR_SUPERSEDED |
| 8 | `backup/pre-dev-unify-20260829-backend` | `35b3a73ad4c7f4e53c4da35f22c875c361f5e746` | YES | 0/2753 | 0/2965 | CONTAINED_CANDIDATE |
| 9 | `backup/pre-dev-unify-20260829-frontend` | `c88b532cf15d45b23908e62fc561c22cb1319549` | YES | 0/2747 | 0/2959 | CONTAINED_CANDIDATE |
| 10 | `backup/pre-dev-unify-20260829-lark` | `120b636820770dcc3170c5b5029a526f645fd3ea` | YES | 0/2855 | 0/3067 | CONTAINED_CANDIDATE |
| 11 | `backup/r5-empty-commit-20260906` | `86d168106d9c5f6ebbef1eea6cf49a91f1f8c5e2` | NO | 1/2389 | 1/2601 | HISTORICAL_OUT_OF_SCOPE |
| 12 | `backup/research-loop-before-p22-p23-complete-20260926` | `177df754a8dad5f85dd17ddc5846a9ae9b761308` | YES | 0/1678 | 0/1890 | CONTAINED_CANDIDATE |
| 13 | `backup/research-loop-before-tv-code-20260925` | `fddea8e5fbc32c86e0d608fa81813b27076b83fa` | YES | 0/1706 | 0/1918 | CONTAINED_CANDIDATE |
| 14 | `backup/research-loop-before-tv-complete-20260926` | `080baf5d85733effcc847c4946e857f6b2f8ac20` | YES | 0/1669 | 0/1881 | CONTAINED_CANDIDATE |
| 15 | `backup/research-loop-before-tv-p22-full-20260925` | `f9a0d799af095c05331de1ba2139d745c3d1d0c0` | YES | 0/1696 | 0/1908 | CONTAINED_CANDIDATE |
| 16 | `backup/research-loop-before-tv-selective-20260925` | `d335e0e53d8f3786a5c966fc592ad7a11b02d070` | YES | 0/1707 | 0/1919 | CONTAINED_CANDIDATE |
| 17 | `backup/rl-0930/claude` | `d7db1cb38249421695333faf0a850a3c02755b96` | NO | 3/1625 | 3/1837 | HISTORICAL_OUT_OF_SCOPE |
| 18 | `backup/rl-0930/codex` | `c2ec144354f618f89de4853732b7a1b42707d092` | YES | 0/1499 | 0/1711 | CONTAINED_CANDIDATE |
| 19 | `backup/rl-0930/g2` | `ed33db0d73902be9dc9a60f0bcb285e195cbf527` | NO | 1/1625 | 1/1837 | HISTORICAL_OUT_OF_SCOPE |
| 20 | `chore/backend-residuals-20261025` | `a19112ecc245cfbaa256a56d8bd99096880409fb` | YES | 212/0 | 0/0 | CONTAINED_CANDIDATE |
| 21 | `chore/complete-fixture-review-20261023` | `af51059b1a9b790fc089fbba2f0370c4061af8b9` | NO | 59/61 | 19/233 | REWORKED_OR_SUPERSEDED |
| 22 | `chore/consolidate-dev-main-20260919` | `cc0f0cc8192f2a19562545c938f566acbc0d1436` | YES | 0/1991 | 0/2203 | CONTAINED_CANDIDATE |
| 23 | `chore/contributor-safety` | `6b32213751228e258c25d44292f6be4dc21bd05e` | YES | 0/3208 | 0/3420 | CONTAINED_CANDIDATE |
| 24 | `chore/core-policy-integrated-20261023` | `31bedf3177162bce5df3c0f26d773b8494fd14cf` | YES | 0/27 | 0/239 | CONTAINED_CANDIDATE |
| 25 | `chore/core-policy-wire-20261024` | `56f4cf4b6a77b1d8dad58b94c29d964c3daa655e` | YES | 2/36 | 0/246 | CONTAINED_CANDIDATE |
| 26 | `chore/core-provider-assembly-20261025` | `81bfe402c1115dc460f840cbb955eeafcf11f5ba` | YES | 12/4 | 0/204 | CONTAINED_CANDIDATE |
| 27 | `chore/core009-approved-closeout-20261023` | `2a89e6d0d6bb221e87f24da6be1e3394f8f22f4d` | YES | 0/36 | 0/248 | CONTAINED_CANDIDATE |
| 28 | `chore/core009-connected-20261021` | `9d88e40a963f4eb2245f8ec0343c2c511a98bd68` | NO | 2/1084 | 2/1296 | REWORKED_OR_SUPERSEDED |
| 29 | `chore/core009-landing-20261022` | `4c7f809e9cb56746a2b9f83a586d3d8329e16008` | YES | 0/180 | 0/392 | CONTAINED_CANDIDATE |
| 30 | `chore/core009-revoke-denial-20261022` | `29f57e36375d62f6a22877e6015779cb2db36771` | YES | 0/584 | 0/796 | CONTAINED_CANDIDATE |
| 31 | `chore/core009-successor-20261021` | `3d4164bdf5723031e380a25cde68c495dddd0671` | YES | 0/593 | 0/805 | CONTAINED_CANDIDATE |
| 32 | `chore/edge-deploy-templates` | `be921002c6a7aa74adf37ed214a1028aefde5ffb` | YES | 0/3154 | 0/3366 | CONTAINED_CANDIDATE |
| 33 | `chore/elp204-target-expiry-fixture` | `734353113d8bec85f78b35ab81c9c1a40e93a67e` | NO | 1/1084 | 1/1296 | REWORKED_OR_SUPERSEDED |
| 34 | `chore/elp210-landing-rebase` | `218b94280e1994ce3c40cae3c08c261f7fc52c13` | YES | 0/614 | 0/826 | CONTAINED_CANDIDATE |
| 35 | `chore/elp210-served-contracts` | `90f8464314d4d5d36f17f0b4a15e1ba43a722aa1` | YES | 0/658 | 0/870 | CONTAINED_CANDIDATE |
| 36 | `chore/elp210-served-contracts-frozen` | `a5194757e5496ba88238507088ee66af0ba3d66f` | NO | 2/646 | 2/858 | PATCH_EQUIVALENT |
| 37 | `chore/elp210-served-contracts-r2` | `4ebc4d9e8d911354c32eda9473302b95af27b2dd` | YES | 0/652 | 0/864 | CONTAINED_CANDIDATE |
| 38 | `chore/host-hygiene-audit-20260919` | `31d7b565c509cf47d02d5f0aa53cfdb61cb89cce` | YES | 0/1995 | 0/2207 | CONTAINED_CANDIDATE |
| 39 | `chore/manager-scoped-notices-20261026` | `151f55afc3902443d391fac93c22de1ce926fb65` | NO | 143/1990 | 143/2202 | EDGE_SOURCE_ONLY |
| 40 | `chore/mirror-reconcile-primus-main` | `32acd3f3899345d94190a99d85f6aa4a787af8d8` | YES | 0/2001 | 0/2213 | CONTAINED_CANDIDATE |
| 41 | `chore/primus-origin-mirror-policy` | `e1f6e4b6db3b60178a5c97eea56c8347448876c4` | YES | 0/3215 | 0/3427 | CONTAINED_CANDIDATE |
| 42 | `chore/production-feature-profiles` | `90c1d7ade239cd3b81891a72fc8480c8558ebae9` | YES | 0/2088 | 0/2300 | CONTAINED_CANDIDATE |
| 43 | `chore/research-source-integration-20261025` | `7129943770e695e61825876bdf1936c191ccbf92` | YES | 189/0 | 0/23 | CONTAINED_CANDIDATE |
| 44 | `chore/v1-packaging` | `aab3712d95fdfc59d91770a0007c55010006d3ba` | YES | 0/3132 | 0/3344 | CONTAINED_CANDIDATE |
| 45 | `chore/v1.1-roadmap-taskboard` | `aa8c4d9013be6dca4367ca68c5bc57032f28e6a5` | YES | 0/3053 | 0/3265 | CONTAINED_CANDIDATE |
| 46 | `claude/be-elp2-09-realtime-scoped` | `b62d906a8abb589c552fd167abfe9749b8c6467f` | NO | 4/725 | 4/937 | HISTORICAL_RECEIPT_PRESERVED |
| 47 | `claude/be-gaps-2` | `0975286c57f0b400bda1f7b503bb5c525a47da29` | NO | 5/968 | 5/1180 | PATCH_EQUIVALENT |
| 48 | `claude/be-gaps-2-bep1` | `149daafc8887495e4e88d7cf6bc70e83e00165b1` | NO | 4/968 | 4/1180 | PATCH_EQUIVALENT |
| 49 | `claude/be-gaps-2-p2` | `85f96011a3b692a5b1ce471ff378b3f4c5bc7df1` | NO | 6/968 | 6/1180 | REWORKED_OR_SUPERSEDED |
| 50 | `claude/be-gaps-2-p3` | `802f09379447d6969d2135bd064927de33d88a57` | NO | 6/968 | 6/1180 | REWORKED_OR_SUPERSEDED |
| 51 | `claude/be-integ` | `4972daec896ae993c46336df72655d1663772cc3` | YES | 0/866 | 0/1078 | CONTAINED_CANDIDATE |
| 52 | `claude/be-p16-financial-publication` | `68344b2e9dbadc747974de2163aedb78b688661a` | NO | 1/725 | 1/937 | PATCH_EQUIVALENT |
| 53 | `claude/be-p4-lifecycle-series` | `3cf7d0bb6be6501e4c977a3119026e2bbfafd7be` | NO | 4/968 | 4/1180 | REWORKED_OR_SUPERSEDED |
| 54 | `claude/fe-parity` | `d58361eafe071bbc9922a7e87c58f0a9d00b7ea2` | YES | 0/646 | 0/858 | CONTAINED_CANDIDATE |
| 55 | `claude/fe-parity-md5` | `642035b5c7c1a840943b92526edae7ce4c03e503` | NO | 2/901 | 2/1113 | PATCH_EQUIVALENT |
| 56 | `claude/paper-history-qual-20261023` | `a92469bd91019c70474a035c98de316dc964ab46` | NO | 2/89 | 2/301 | PATCH_EQUIVALENT |
| 57 | `claude/post-freeze-20261021` | `3aaf24f4e66bca6c27962ddbbc2049cfb6505421` | YES | 0/565 | 0/777 | CONTAINED_CANDIDATE |
| 58 | `claude/post-land-20261022` | `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` | YES | 163/61 | 0/110 | CONTAINED_CANDIDATE |
| 59 | `claude/rv06-no-hover-reasons` | `eb23f8c16c2f89ffb29287f076acd3f9c2df8b59` | NO | 1/737 | 1/949 | PATCH_EQUIVALENT |
| 60 | `claude/uxm-f9` | `ed3c7cbdd3d75e359c4d56308e680d316fbbea4d` | YES | 0/963 | 0/1175 | CONTAINED_CANDIDATE |
| 61 | `codex/be-gaps` | `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1` | YES | 0/1201 | 0/1413 | CONTAINED_CANDIDATE |
| 62 | `codex/p22-wip-2026-09-24` | `442e9f6af286b47c3cde1f9d46658a7cbf33b172` | NO | 1/1769 | 1/1981 | HISTORICAL_OUT_OF_SCOPE |
| 63 | `codex/research-ol-p22-p24` | `73af8d21e2935a1176c3a7f576c436204e081dad` | YES | 0/1629 | 0/1841 | CONTAINED_CANDIDATE |
| 64 | `dev` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 65 | `docs/claude-frontend-handoff` | `58d6084ced65691861674d0fece547a18a0e502e` | YES | 0/3153 | 0/3365 | CONTAINED_CANDIDATE |
| 66 | `docs/consolidation-closeout-20260919` | `c43ee0317a439b4566decd5fddfc8be839db239e` | NO | 2/1990 | 2/2202 | HISTORICAL_OUT_OF_SCOPE |
| 67 | `docs/d3-live-acceptance` | `a36d56924f8dc9743f65f91503e2075f5ebe72ec` | YES | 0/2860 | 0/3072 | CONTAINED_CANDIDATE |
| 68 | `docs/manager-surface-expansion-campaign` | `8219133475c50dfda13e069c4653e269fcba59fc` | YES | 0/2632 | 0/2844 | CONTAINED_CANDIDATE |
| 69 | `docs/primus-mirror-state-20260918` | `fb2cd56787fb323a737dd78d865aa8aede55aa83` | YES | 0/2004 | 0/2216 | CONTAINED_CANDIDATE |
| 70 | `docs/research-loop-plan` | `685bc1915db51c7869254c1fdfa68991d7e4aae4` | YES | 0/0 | 0/212 | CONTAINED_CANDIDATE |
| 71 | `docs/unified-implementation-plan` | `a046b94c59e7ae31a3ad1d53d024c2b854a856d9` | YES | 0/3205 | 0/3417 | CONTAINED_CANDIDATE |
| 72 | `feat/close-v1-backend` | `2be3737ee4c52c3e7e384219994e7d68564acbb0` | YES | 0/3155 | 0/3367 | CONTAINED_CANDIDATE |
| 73 | `feat/eds-current-bff` | `5e00251700222601f99588a2028476961faa6644` | YES | 0/2338 | 0/2550 | CONTAINED_CANDIDATE |
| 74 | `feat/eds10-eds11-observation` | `50239f632c05460cc593bf8da564169b10b9373f` | YES | 0/2392 | 0/2604 | CONTAINED_CANDIDATE |
| 75 | `feat/eds11r-r4-r5-activation` | `118406ccc6bb78cdebb82088d9985b4b4507afc9` | YES | 0/2387 | 0/2599 | CONTAINED_CANDIDATE |
| 76 | `feat/eds12-deployed-evidence-closeout` | `ae0413cfa58fc0854fb1220a45398331872e41a3` | YES | 0/2303 | 0/2515 | CONTAINED_CANDIDATE |
| 77 | `feat/eds12-failure-dr-release` | `8a7bd6fe17a9fc20fb61dd850f3a77a5258bb1e5` | YES | 0/2429 | 0/2641 | CONTAINED_CANDIDATE |
| 78 | `feat/execution-active-source-adapters` | `074ff164efcc74ec904d01ad46861f3cbb20fc94` | YES | 0/2337 | 0/2549 | CONTAINED_CANDIDATE |
| 79 | `feat/execution-data-activation` | `dcc4eda1ab68797cc56d8ab5fa2d45bce89eab8c` | YES | 0/2424 | 0/2636 | CONTAINED_CANDIDATE |
| 80 | `feat/execution-incremental-source-contract` | `98cf5f3613ceb2ee539b4d9b68b1ffc07b9b8660` | YES | 0/2784 | 0/2996 | CONTAINED_CANDIDATE |
| 81 | `feat/execution-integration` | `447ba3967aeb42768e68425196fbee6664c250b9` | YES | 0/2221 | 0/2433 | CONTAINED_CANDIDATE |
| 82 | `feat/execution-loop-backend-n13b-n17b` | `5a70f93db2119d9b0640cb9d5b5221db2a928dfd` | YES | 0/2633 | 0/2845 | CONTAINED_CANDIDATE |
| 83 | `feat/execution-loop-next` | `0463066d62c5781a64335a4d2f5330e2c882ea5c` | YES | 0/2060 | 0/2272 | CONTAINED_CANDIDATE |
| 84 | `feat/execution-loop-polish` | `658f69573bf2942576d0fe2761bb58885937c6c6` | YES | 0/2746 | 0/2958 | CONTAINED_CANDIDATE |
| 85 | `feat/execution-loop-product-recomposition` | `c5dbbe85da299d9f8a68233945ebaa167ff5d5c3` | YES | 0/2560 | 0/2772 | CONTAINED_CANDIDATE |
| 86 | `feat/execution-loop-uiux-continuation` | `537ccf137c78cf31d42d58e16b839fb3790f6615` | YES | 0/2608 | 0/2820 | CONTAINED_CANDIDATE |
| 87 | `feat/execution-manager-campaign` | `fd039ac18b0b2605943060a01d61dd19b36baa68` | YES | 0/2572 | 0/2784 | CONTAINED_CANDIDATE |
| 88 | `feat/execution-manager-n18-census` | `6e8d8608e48f81c75831818ad37965d1608c75e1` | YES | 0/2598 | 0/2810 | CONTAINED_CANDIDATE |
| 89 | `feat/execution-manager-n19-rust-authority` | `5d275b10d36ccb055cdd24e919a0be5a4b4b900c` | YES | 0/2596 | 0/2808 | CONTAINED_CANDIDATE |
| 90 | `feat/execution-n03-owner-implementation-gate` | `e03d0229dc426f137b8aa5e1b7d2d5a9361b59cf` | YES | 0/2783 | 0/2995 | CONTAINED_CANDIDATE |
| 91 | `feat/execution-n04-lease-aware-consumer` | `898fdde343bc4d71fefa5142f4f8ef84b8d4c1d0` | YES | 0/2782 | 0/2994 | CONTAINED_CANDIDATE |
| 92 | `feat/execution-n05-retention-recovery` | `ed348579f278a9ab66f6549ea7b14e844a60bb1b` | YES | 0/2781 | 0/2993 | CONTAINED_CANDIDATE |
| 93 | `feat/execution-n06-real-source-qualification` | `aa59d3116290ea9e29ac2d6cca90ffc61ebe63d3` | YES | 0/2779 | 0/2991 | CONTAINED_CANDIDATE |
| 94 | `feat/execution-n07-shadow-screen-apis` | `51ec512f0a29b13f013cdb5083d03654f423d895` | YES | 0/2778 | 0/2990 | CONTAINED_CANDIDATE |
| 95 | `feat/execution-n08-sse-activation` | `c0db00e8b6234547bac9cf9c85b72d9da42a2f1c` | YES | 0/2745 | 0/2957 | CONTAINED_CANDIDATE |
| 96 | `feat/execution-native-read-integration` | `b87f73dbda3d119dbb09ed9f263b89738abbb874` | NO | 1/1142 | 1/1354 | REWORKED_OR_SUPERSEDED |
| 97 | `feat/execution-source-qualification` | `3b88ad5b57d54e91d3b33f1d78d5806e48fad272` | YES | 0/2797 | 0/3009 | CONTAINED_CANDIDATE |
| 98 | `feat/execution-visual-rerecord` | `d5e634a671e96df2884a9949a2c8ddcc78d7d2e1` | YES | 0/2086 | 0/2298 | CONTAINED_CANDIDATE |
| 99 | `feat/execution_loop` | `74e27d47efa54daded834cf1b2f2d6a9b4709f3a` | YES | 0/2805 | 0/3017 | CONTAINED_CANDIDATE |
| 100 | `feat/gap_frontend_thanhvuong` | `8783461e0ca1415e5490c96bd238a895550ce1f6` | YES | 0/1578 | 0/1790 | CONTAINED_CANDIDATE |
| 101 | `feat/manager-v2-paper-read` | `04b21bc3498722415600c0bae3dd0731cc43b924` | YES | 0/2775 | 0/2987 | CONTAINED_CANDIDATE |
| 102 | `feat/portal-monorepo-foundation` | `d6bd92d99c6cc570c97566bea83ba6638545dbf5` | YES | 0/3225 | 0/3437 | CONTAINED_CANDIDATE |
| 103 | `feat/roadmap-lark-webhook` | `e61ed080264628eba38538e1328cba9779c991f6` | YES | 0/3129 | 0/3341 | CONTAINED_CANDIDATE |
| 104 | `feat/roadmap-task-board-integration` | `6b84b993169c6b0b77bb0d3d9a9afc32d95d38fd` | YES | 0/3297 | 0/3509 | CONTAINED_CANDIDATE |
| 105 | `feat/roadmap-task-board-release` | `3af907d9452f3cdd7e1c1a1aeee90c5612f352d3` | YES | 0/3294 | 0/3506 | CONTAINED_CANDIDATE |
| 106 | `feat/self-hosted-ci-publish-runner` | `915c210dc967db5e15f9ab401927f44421e062d1` | YES | 0/2041 | 0/2253 | CONTAINED_CANDIDATE |
| 107 | `feat/self-hosted-deploy-runner` | `597bf4abfc19ea7e093e85b1962bade93ad9f151` | YES | 0/2078 | 0/2290 | CONTAINED_CANDIDATE |
| 108 | `feat/thanhvuong/research-p17-p21` | `30fb9f21473bfa4cd1bd6baecb4b927f2ad8d196` | YES | 0/1918 | 0/2130 | CONTAINED_CANDIDATE |
| 109 | `feat/trade-replay-signature` | `f04dad8dbcb6c6c0b989b83278cb72ba1f919818` | YES | 0/2416 | 0/2628 | CONTAINED_CANDIDATE |
| 110 | `feat/u01-be-historical-data` | `83e24b539c3b19347c930176220f18555b9c1b22` | YES | 0/3159 | 0/3371 | CONTAINED_CANDIDATE |
| 111 | `feat/u02-u05-portal-shell` | `7924767103fcae929823b342a51165ad89a5194f` | YES | 0/3150 | 0/3362 | CONTAINED_CANDIDATE |
| 112 | `feat/v1.1-next` | `d0d50a60295717957f9161925391d818046a4d6a` | YES | 0/3045 | 0/3257 | CONTAINED_CANDIDATE |
| 113 | `feat/vercel-temporary-preview` | `f0ffaba4c1fd5ecc7207f130408abd0e73b1a172` | YES | 0/3216 | 0/3428 | CONTAINED_CANDIDATE |
| 114 | `fix/cache-sweeper-default-and-preflight` | `5180776736b9274024f4e4f20718aba69518fd94` | YES | 0/2007 | 0/2219 | CONTAINED_CANDIDATE |
| 115 | `fix/codeql-private-sarif-fallback` | `3c5bdace6a877f4270a7603fd2004bd370bd0a6d` | YES | 0/2095 | 0/2307 | CONTAINED_CANDIDATE |
| 116 | `fix/control-api-migration-order` | `9c67aa9c6ffa605893755aaf7145a90be264f363` | YES | 0/2307 | 0/2519 | CONTAINED_CANDIDATE |
| 117 | `fix/d3-gateway-identity-lock` | `66e60489a19ad34be60a753b5bcb224b5f40b6cb` | YES | 0/2865 | 0/3077 | CONTAINED_CANDIDATE |
| 118 | `fix/d3-nbf-validation` | `1cc4cadca31bcdf385e4173352399660838ff50f` | YES | 0/2863 | 0/3075 | CONTAINED_CANDIDATE |
| 119 | `fix/durable-mirror-write-only-stage` | `736e250abb0c99d70db764903513762746d52bdb` | YES | 0/2083 | 0/2295 | CONTAINED_CANDIDATE |
| 120 | `fix/eds12-current-source-partials` | `082e98863e5f37772407874e044b9283d07c2a1c` | YES | 0/2300 | 0/2512 | CONTAINED_CANDIDATE |
| 121 | `fix/eds12-runtime-activation-evidence` | `c0f6220494b6261175a61209bee9437e7d4adf89` | YES | 0/2293 | 0/2505 | CONTAINED_CANDIDATE |
| 122 | `fix/execution-d4-dormant-closeout` | `e7d360b13a6518a0690937ab021ad89b2994c86d` | YES | 0/2785 | 0/2997 | CONTAINED_CANDIDATE |
| 123 | `fix/execution-rust-ci-bound` | `e18d21f223ea1a25e485801fad30265306b144d6` | YES | 0/2309 | 0/2521 | CONTAINED_CANDIDATE |
| 124 | `fix/frontend-audit-gate-082e988` | `8814cd2a5f66aeac0828812dbb8340c4f0a4adbb` | YES | 0/2298 | 0/2510 | CONTAINED_CANDIDATE |
| 125 | `fix/native-semantic-roundtrip-20261025` | `56f4cf4b6a77b1d8dad58b94c29d964c3daa655e` | YES | 2/36 | 0/246 | CONTAINED_CANDIDATE |
| 126 | `fix/pr35-ci` | `36d4231160d9c083061801bc30355db2216cb0a0` | YES | 0/3046 | 0/3258 | CONTAINED_CANDIDATE |
| 127 | `fix/production-feature-profile-image-pins` | `43c88c3077fe42c1c426509778fbce0492506a67` | YES | 0/2086 | 0/2298 | CONTAINED_CANDIDATE |
| 128 | `fix/refresh-m0-freeze-recovery` | `09d5879fe111b9f7ee32966303aee0d81424553a` | YES | 0/2305 | 0/2517 | CONTAINED_CANDIDATE |
| 129 | `fix/security-codeql-permissions` | `ddb8bd59f5bb79d5ecce7599d17dfad546ef5e6a` | YES | 0/2097 | 0/2309 | CONTAINED_CANDIDATE |
| 130 | `fix/stable-execution-ui-build` | `c716f9d3e5fcc4a953ecdde21f14e7152f5cc354` | YES | 0/2092 | 0/2304 | CONTAINED_CANDIDATE |
| 131 | `fix/stable-release-takeover-transition` | `4291c5da10b3c35e26e8fd8e7eaf86d9ea61dced` | YES | 0/2282 | 0/2494 | CONTAINED_CANDIDATE |
| 132 | `fix/stable-spa-asset-cache` | `9bac881173dcf564cf2496349039a748e9dbe626` | YES | 0/2100 | 0/2312 | CONTAINED_CANDIDATE |
| 133 | `fix/stan-context-password-change-origin` | `87d9d98c3a80400a72de759e63dfc50af70e0436` | YES | 0/2861 | 0/3073 | CONTAINED_CANDIDATE |
| 134 | `fix/u10-sse-error-close` | `a74d15e160572e9da1c9b0392037d3d3123fe6dd` | YES | 0/2866 | 0/3078 | CONTAINED_CANDIDATE |
| 135 | `fix/v1.0.1-bobby-activation` | `239e42fbcd80d4661a43d7114125fafb17631fd0` | YES | 0/2857 | 0/3069 | CONTAINED_CANDIDATE |
| 136 | `fix/v1.0.1-hmd-reader-permissions` | `114631cdb20ca0014e73159e3dc191bf99278bab` | YES | 0/3044 | 0/3256 | CONTAINED_CANDIDATE |
| 137 | `fix/v1.0.1-lark-org-user-id` | `120b636820770dcc3170c5b5029a526f645fd3ea` | YES | 0/2855 | 0/3067 | CONTAINED_CANDIDATE |
| 138 | `fix/v1.0.1-lark-stable` | `ffdd87ff0d9b20416eb5783dd264d0e54231cc6d` | YES | 0/2858 | 0/3070 | CONTAINED_CANDIDATE |
| 139 | `fix/visual-ci-npm-retry` | `1ba071c31b180ebadc9153f1776eb3af7d113e19` | YES | 0/2081 | 0/2293 | CONTAINED_CANDIDATE |
| 140 | `integrate/dev-20260829-unified` | `9c71d9da74bc129bb2a101a478b16ddde6770170` | NO | 5/2691 | 5/2903 | HISTORICAL_OUT_OF_SCOPE |
| 141 | `integrate/dev-20260829-unified-v2` | `06c658fad04aedfbb121a994e5a8ba08bf32806d` | YES | 0/2647 | 0/2859 | CONTAINED_CANDIDATE |
| 142 | `integrate/dev-20260830-uiux-backend` | `95040d6a69d957542a827bc775dac1d7393e3552` | YES | 0/2599 | 0/2811 | CONTAINED_CANDIDATE |
| 143 | `integrate/execution-product-active` | `6c10fa1084fc17e01419f3f72fd7f604f9b8f0e1` | YES | 0/2313 | 0/2525 | CONTAINED_CANDIDATE |
| 144 | `integrate/execution-product-active-preflight` | `4f94f28a847b50f878b2fcf52c3b83ab8f9fd415` | YES | 0/2310 | 0/2522 | CONTAINED_CANDIDATE |
| 145 | `main` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 146 | `release/v1-candidate` | `6ad7636221033c9ef6b6eeed892bec03711faeae` | YES | 0/3139 | 0/3351 | CONTAINED_CANDIDATE |
| 147 | `retired/agent-a4a687fe69ac798bf` | `d263900abe47919a520346ff50fcafe8a146f9dc` | NO | 1/1389 | 1/1601 | HISTORICAL_OUT_OF_SCOPE |
| 148 | `retired/agent-a7ba69da02d66721b` | `b33947025935a31de976d532e8cae591b05004f0` | NO | 1/1388 | 1/1600 | PATCH_EQUIVALENT |
| 149 | `retired/agent-a852f7e14bb63ceec` | `b33947025935a31de976d532e8cae591b05004f0` | NO | 1/1388 | 1/1600 | PATCH_EQUIVALENT |
| 150 | `retired/agent-ac9765ffb9cbb7cef` | `b33947025935a31de976d532e8cae591b05004f0` | NO | 1/1388 | 1/1600 | PATCH_EQUIVALENT |
| 151 | `retired/agent-addd23c4095cf2ba9` | `d263900abe47919a520346ff50fcafe8a146f9dc` | NO | 1/1389 | 1/1601 | HISTORICAL_OUT_OF_SCOPE |
| 152 | `retired/p24-AA` | `d0569d49b6b6102b927f0663b789fce24832086a` | NO | 1/1337 | 1/1549 | PATCH_EQUIVALENT |
| 153 | `retired/p24-AB` | `d0569d49b6b6102b927f0663b789fce24832086a` | NO | 1/1337 | 1/1549 | PATCH_EQUIVALENT |
| 154 | `retired/p24-AC` | `d0569d49b6b6102b927f0663b789fce24832086a` | NO | 1/1337 | 1/1549 | PATCH_EQUIVALENT |
| 155 | `retired/w5y-K` | `3d5f469633f7b05936442c412eb5587ac33a877c` | NO | 1/1360 | 1/1572 | PATCH_EQUIVALENT |
| 156 | `retired/w5y-L` | `3d5f469633f7b05936442c412eb5587ac33a877c` | NO | 1/1360 | 1/1572 | PATCH_EQUIVALENT |
| 157 | `retired/w9-Y` | `4c443cec13ab5dce56f8980b1f4a6f5c60903f75` | NO | 1/1340 | 1/1552 | PATCH_EQUIVALENT |
| 158 | `showcase/execution-uiux-frozen` | `cb60d1336b8fbef8b3ec70fc23a8236480fa007c` | YES | 0/2616 | 0/2828 | CONTAINED_CANDIDATE |
| 159 | `verify/codex-preview` | `de914c782932002bb1ec51098fc4322b875d6b13` | NO | 1/2864 | 1/3076 | HISTORICAL_OUT_OF_SCOPE |
| 160 | `worktree-agent-a0011e7919ea2a450` | `5722b094027256ada3d8181a7ce4b56c8e61acda` | NO | 1/823 | 1/1035 | PATCH_EQUIVALENT |
| 161 | `worktree-agent-a0138ebca1968d948` | `df76b7151516958945cd5024daffd2c16eff797a` | NO | 2/629 | 2/841 | PATCH_EQUIVALENT |
| 162 | `worktree-agent-a047872ba400a7c1f` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 163 | `worktree-agent-a059d6acb3ffd7865` | `16f7c34cbe5c3ddc666e694fd2a3fff588ad1e39` | NO | 69/61 | 1/205 | PATCH_EQUIVALENT |
| 164 | `worktree-agent-a05b2b3ac2c59ccb2` | `ebae1da6c81e60d8fa51c162e43355efa86dd8fb` | NO | 3/775 | 3/987 | PATCH_EQUIVALENT |
| 165 | `worktree-agent-a067a9812fefa2bac` | `595c13ec22da0a7d582c6e434e106d589f41d3d7` | NO | 1/1032 | 1/1244 | PATCH_EQUIVALENT |
| 166 | `worktree-agent-a0717abb1a435928a` | `500fd7ed8a474048931b4013ee099be91ba48738` | NO | 2/1017 | 2/1229 | PATCH_EQUIVALENT |
| 167 | `worktree-agent-a0835a78910892924` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 168 | `worktree-agent-a08d9493bf6d7766b` | `58de77512fc340937b474ddc20c62d5ee2a76d34` | NO | 6/680 | 6/892 | REWORKED_OR_SUPERSEDED |
| 169 | `worktree-agent-a09d28716be4d0c1f` | `792319bb92a6691b4d2e9f829aba2aec23fdd279` | YES | 0/968 | 0/1180 | CONTAINED_CANDIDATE |
| 170 | `worktree-agent-a0a6e2ca7b3854df4` | `89a7541d6a92619edf35c61e43536ac7335870d0` | NO | 1/1032 | 1/1244 | PATCH_EQUIVALENT |
| 171 | `worktree-agent-a0b3aea4522c09a59` | `d236c800a03b3e897ab8e7e6f23b7b7d72ee6c8f` | NO | 1/680 | 1/892 | PATCH_EQUIVALENT |
| 172 | `worktree-agent-a0b5b1ad216c9b3e5` | `03fa715cef0451b215c5d77b0c2c660240c00983` | NO | 1/76 | 1/288 | PATCH_EQUIVALENT |
| 173 | `worktree-agent-a0d9371ddac24da37` | `b4f839f6671f15d7b016b09cdb08798a8f6815d1` | NO | 1/693 | 1/905 | PATCH_EQUIVALENT |
| 174 | `worktree-agent-a0e424cfac1b6c511` | `5b8a62316a49495224d44004f99e3d71134b309d` | NO | 1/737 | 1/949 | PATCH_EQUIVALENT |
| 175 | `worktree-agent-a0e9b2eced3399e93` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 176 | `worktree-agent-a0eef2a17140ccef1` | `3ac4cd8ca2cad21b3d45006f54f8b44bf95f3554` | NO | 3/775 | 3/987 | REWORKED_OR_SUPERSEDED |
| 177 | `worktree-agent-a11aeccee36596488` | `751c8bde7bcb367933462f7f2acd1e6bc026b8d6` | NO | 4/644 | 4/856 | PATCH_EQUIVALENT |
| 178 | `worktree-agent-a13bcbfd43693e2f4` | `2ee42cd74c5efff0116281461130ffadfdd0d304` | NO | 8/840 | 8/1052 | PATCH_EQUIVALENT |
| 179 | `worktree-agent-a13e74e462abe6ee9` | `56986dbfbcaed73a744b246db2ac8cad800b8bff` | NO | 1/831 | 1/1043 | PATCH_EQUIVALENT |
| 180 | `worktree-agent-a144126d17b045e45` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 181 | `worktree-agent-a15ac482f0006cdda` | `d390fa1ed59269f60f04f5d0f6f4e39471a519d7` | NO | 1/652 | 1/864 | PATCH_EQUIVALENT |
| 182 | `worktree-agent-a1605e65d79e5945f` | `58b70280cb4eb0157d8b3177c90dfd238b839b7a` | NO | 4/831 | 4/1043 | PATCH_EQUIVALENT |
| 183 | `worktree-agent-a1b9f330092821638` | `a00285b71a04b2e8bebf922e8f7e0176bdbfce8a` | NO | 1/688 | 1/900 | PATCH_EQUIVALENT |
| 184 | `worktree-agent-a1f2721f7abd62c21` | `cd7497148ca252853e7178172025100924340d40` | NO | 5/831 | 5/1043 | PATCH_EQUIVALENT |
| 185 | `worktree-agent-a1f3f67c82323245a` | `6d4a9001b20df6a1a6e9881eedb95ffb70858518` | NO | 161/61 | 1/113 | PATCH_EQUIVALENT |
| 186 | `worktree-agent-a1faf5d04249de1a0` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 187 | `worktree-agent-a21064635494c9ac6` | `a1c7863bb5f551ce49f3ac88e6a0102dbd0b0baa` | NO | 4/747 | 4/959 | PATCH_EQUIVALENT |
| 188 | `worktree-agent-a210cddf03eed4d1e` | `eead665c1793775930f5f192e0fde7a145d5ca3f` | NO | 3/691 | 3/903 | PATCH_EQUIVALENT |
| 189 | `worktree-agent-a223e118d3366e0ce` | `6d87825b8754251089a3191c75929e53f2b7a091` | YES | 0/725 | 0/937 | CONTAINED_CANDIDATE |
| 190 | `worktree-agent-a22ec4685e17592f2` | `43acbfc01e2eb8bd75f3363c367b47d20f025c18` | NO | 3/775 | 3/987 | PATCH_EQUIVALENT |
| 191 | `worktree-agent-a25b27079f48d6238` | `ed151f47d6ae266db8181e67acdffa19ea9bb8e1` | NO | 1/609 | 1/821 | PATCH_EQUIVALENT |
| 192 | `worktree-agent-a26017ffd0e88ca0b` | `a061feb5827427ac57dcf53800a0aaf5346a9848` | NO | 4/894 | 4/1106 | REWORKED_OR_SUPERSEDED |
| 193 | `worktree-agent-a279bfe2117f1ff0c` | `1a43f6c9f67ec2bfb800f3ac1b1c535cf50d7d4e` | NO | 1/737 | 1/949 | PATCH_EQUIVALENT |
| 194 | `worktree-agent-a28b16eedab87515c` | `47f37dd78453f404dd48dd4b67728511ad99821c` | NO | 5/921 | 5/1133 | PATCH_EQUIVALENT |
| 195 | `worktree-agent-a2acbdb0686502ba8` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 196 | `worktree-agent-a2c8a0be9d855232f` | `d909770660f2dc91455d08b2cdb31db19bd5d580` | NO | 2/751 | 2/963 | PATCH_EQUIVALENT |
| 197 | `worktree-agent-a2e52135ed1879335` | `ca8729f3fa26a32eff10abecf7c3a23b5e044a7d` | NO | 1/652 | 1/864 | PATCH_EQUIVALENT |
| 198 | `worktree-agent-a2eaba80f52c57dd1` | `ed9c744328345cfedc8cc7dfecd6fb0dc269d634` | NO | 2/1042 | 2/1254 | PATCH_EQUIVALENT |
| 199 | `worktree-agent-a2fe160925c655dcd` | `82ce0bc83f6a48b652cf0e43c9beee3fff41ec18` | NO | 1/1016 | 1/1228 | PATCH_EQUIVALENT |
| 200 | `worktree-agent-a3066c72fdc6a4b48` | `11003f602bc07a18863e0b50cd6cb165980c2367` | NO | 4/619 | 4/831 | PATCH_EQUIVALENT |
| 201 | `worktree-agent-a37c951bae7ea1b77` | `c92f44f66195050a83c73baefed5a618fd17efe2` | NO | 10/1062 | 10/1274 | PATCH_EQUIVALENT |
| 202 | `worktree-agent-a3812d622935898da` | `5b7ea66d9215d89dffcbf8b70f0bfd4b5cc7d840` | NO | 6/817 | 6/1029 | PATCH_EQUIVALENT |
| 203 | `worktree-agent-a39169c38a3bbe0d4` | `3fa008a37e86e91fa66065c8f75b56e97bc21a6e` | NO | 7/593 | 7/805 | SCREENSHOT_EVIDENCE_ONLY |
| 204 | `worktree-agent-a3965389c36a192f6` | `a21ccd5901191eb003f1f652d6096432d910092f` | NO | 3/894 | 3/1106 | PATCH_EQUIVALENT |
| 205 | `worktree-agent-a3ba40ca438ad6234` | `0c9adfcfe7660414bd65063b8474e63df00b00a9` | NO | 3/901 | 3/1113 | PATCH_EQUIVALENT |
| 206 | `worktree-agent-a3c811d3bd0ad206a` | `38fbe0aff797248a02fd264bf5c08aa04ec98925` | NO | 1/1062 | 1/1274 | PATCH_EQUIVALENT |
| 207 | `worktree-agent-a3caa41755adaff7f` | `da7c8cbb29a0d65ef135631408b581be7514161a` | NO | 1/652 | 1/864 | PATCH_EQUIVALENT |
| 208 | `worktree-agent-a3cbd355aea87959e` | `48b9976d40f20e895c7d81997b5898d3885880a3` | NO | 1/609 | 1/821 | PATCH_EQUIVALENT |
| 209 | `worktree-agent-a3d355f76dfb6a573` | `02a3c8b694ea9675aa64e7f6b27e4d3fa7ad1eb5` | NO | 1/747 | 1/959 | PATCH_EQUIVALENT |
| 210 | `worktree-agent-a41bebe538f3a7aa8` | `56e4ebb2b493a243b6cbae5d26f35e07fe50360b` | YES | 160/61 | 0/113 | CONTAINED_CANDIDATE |
| 211 | `worktree-agent-a4262dac76100084a` | `9d0bf129c8ec253623b6c9749bb4e549c08b4493` | NO | 4/775 | 4/987 | PATCH_EQUIVALENT |
| 212 | `worktree-agent-a42be4c8123a045a6` | `f615c3de50efe0dbe96222b2681fb933bc25fb7b` | NO | 137/61 | 6/142 | PATCH_EQUIVALENT |
| 213 | `worktree-agent-a434af4d2a70dddf9` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 214 | `worktree-agent-a4521603c425848a8` | `58459481b6ffd15dc71cb1f6b44db15e1ffedd80` | NO | 7/894 | 7/1106 | PATCH_EQUIVALENT |
| 215 | `worktree-agent-a457164d11b642327` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 216 | `worktree-agent-a47d00c1c7d79558e` | `03d942608008a746e9ebdbbc3f129b899caf5215` | NO | 1/1033 | 1/1245 | REWORKED_OR_SUPERSEDED |
| 217 | `worktree-agent-a4a687fe69ac798bf` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 218 | `worktree-agent-a4b238c59709c8893` | `2292bdd1e650587bcf821c6ef1a383653cc91333` | NO | 2/70 | 2/282 | PATCH_EQUIVALENT |
| 219 | `worktree-agent-a4b653b300c544dc0` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 220 | `worktree-agent-a4fa13a4a6b931604` | `e3d50329fbb3d5cc8ad1c9a66859770f28fc35ef` | NO | 1/625 | 1/837 | PATCH_EQUIVALENT |
| 221 | `worktree-agent-a502116f0cd535367` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 222 | `worktree-agent-a5073029457904d4d` | `46d8892b79083887b824e21f74657a472f8bf4dc` | NO | 4/988 | 4/1200 | PATCH_EQUIVALENT |
| 223 | `worktree-agent-a53e0986c2b953fb9` | `90d102fe843bbb5783a29ac000210d32fa838fd3` | NO | 9/593 | 9/805 | REWORKED_OR_SUPERSEDED |
| 224 | `worktree-agent-a53ea6e856ad76daf` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 225 | `worktree-agent-a540a08ee9939a9e4` | `56e4ebb2b493a243b6cbae5d26f35e07fe50360b` | YES | 160/61 | 0/113 | CONTAINED_CANDIDATE |
| 226 | `worktree-agent-a57f62f78519c048e` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 227 | `worktree-agent-a58a5fc5feb3a0d88` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 228 | `worktree-agent-a5aadf263d87b4e38` | `3f73cddd98805a97f13b1cc4d6b19dfbb5cfc00d` | NO | 1/737 | 1/949 | PATCH_EQUIVALENT |
| 229 | `worktree-agent-a5b219770d7086344` | `2a48770f12852f6dec73bb28b6d80a7d437cedcd` | NO | 17/822 | 17/1034 | REWORKED_OR_SUPERSEDED |
| 230 | `worktree-agent-a5b27392ce6208dc6` | `a12f86c14fcb6afa8f4b124012af0cdb5367e909` | NO | 2/714 | 2/926 | REWORKED_OR_SUPERSEDED |
| 231 | `worktree-agent-a5cb4f038fd1471bc` | `bd6d3ae6c7f871b40a7df8841ee00014665aaf40` | NO | 1/1032 | 1/1244 | PATCH_EQUIVALENT |
| 232 | `worktree-agent-a5d9d960e9549ca00` | `0ef0d6e0f036cc506c0b3d571f15a6d5b25c1633` | NO | 161/61 | 1/113 | FIXTURE_COMMITTED_WIP |
| 233 | `worktree-agent-a5decdff8ad3901e4` | `25501665c2c4291051901d951a919171e73f0d17` | NO | 1/1033 | 1/1245 | PATCH_EQUIVALENT |
| 234 | `worktree-agent-a5e25dfe8e4d28557` | `2aa4828928f6007c5bfa316e006cb3727f74e508` | NO | 8/1017 | 8/1229 | PATCH_EQUIVALENT |
| 235 | `worktree-agent-a5eb06fd9110d2deb` | `85d2f7269d6e76aa7ba338570481bb8b380aead1` | NO | 5/988 | 5/1200 | PATCH_EQUIVALENT |
| 236 | `worktree-agent-a5fbbe822077f8963` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 237 | `worktree-agent-a5fd68ae8b663f717` | `1bf7489ed41c353eaf17bc5bab76f0d68d6f73f4` | NO | 1/706 | 1/918 | FRONTEND_SHARED_BLOCK_REVIEW |
| 238 | `worktree-agent-a61bc3ba5dc91d539` | `f8b5dbbb661dfbfd091f8759a44bdf30c2db0aae` | NO | 3/775 | 3/987 | PATCH_EQUIVALENT |
| 239 | `worktree-agent-a65cca4dfd8644a0f` | `f33e7b2fcdd019f681ac65c5c0d7c0d406b92e8d` | NO | 4/866 | 4/1078 | PATCH_EQUIVALENT |
| 240 | `worktree-agent-a66f31fce07ed1e0c` | `12ccd5753a123817cc6c3d921dca0e3a553a5e06` | NO | 1/1041 | 1/1253 | PATCH_EQUIVALENT |
| 241 | `worktree-agent-a68d707e6cb5f1176` | `212ebc4cc66470c61eee0566a0f0f6cf938c32c3` | NO | 2/725 | 2/937 | REWORKED_OR_SUPERSEDED |
| 242 | `worktree-agent-a6981004dbe8343fe` | `cab7cd9d88ee6fc06d9e2de37c91535692a00dc1` | NO | 2/970 | 2/1182 | PATCH_EQUIVALENT |
| 243 | `worktree-agent-a69f5a72f2f668e90` | `4596a6eab266e2090717b5bc42afda1280b636ef` | NO | 1/1033 | 1/1245 | PATCH_EQUIVALENT |
| 244 | `worktree-agent-a6b3341dd56d5f705` | `b32326a6f1ecaccd880a9a1bf912a99c776419e7` | NO | 1/1032 | 1/1244 | PATCH_EQUIVALENT |
| 245 | `worktree-agent-a6b74cbb4de1b6d06` | `40bcab3a2391318d785a6c48c34fcb3a299b0d60` | NO | 69/61 | 1/205 | PATCH_EQUIVALENT |
| 246 | `worktree-agent-a6c3f2711a4932aa5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 247 | `worktree-agent-a6cb1777e400d32c7` | `1d316cc20a6fdc538da872c5c16709305b108a4b` | YES | 0/152 | 0/364 | CONTAINED_CANDIDATE |
| 248 | `worktree-agent-a6fbf2de3a1b282fb` | `bfb0b6129b52d8ae2a1f830b5ddf32705c8f3410` | NO | 4/831 | 4/1043 | PATCH_EQUIVALENT |
| 249 | `worktree-agent-a70f13fa59bfdf899` | `72b87cca07d901cfe1b46656265240a329fe268f` | NO | 15/921 | 15/1133 | PATCH_EQUIVALENT |
| 250 | `worktree-agent-a7129d15c1c1b2260` | `a7b13da2534c14a096186fe4d7b54c00c9ed41c8` | NO | 2/963 | 2/1175 | PATCH_EQUIVALENT |
| 251 | `worktree-agent-a72c661b488ca361c` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 252 | `worktree-agent-a73475d5584facff0` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 253 | `worktree-agent-a7472fea8c507405a` | `0acb432bd5eb8a2a30fc48df43afc8a2a1fd34d5` | NO | 3/970 | 3/1182 | REWORKED_OR_SUPERSEDED |
| 254 | `worktree-agent-a7624d999273b1f89` | `f503eb1134f6726e4314e609f30618fc11bdde83` | NO | 1/1022 | 1/1234 | PATCH_EQUIVALENT |
| 255 | `worktree-agent-a781e69f1870b78d6` | `fbb52acbcfa5439525840e26db438e299cc752b1` | NO | 3/706 | 3/918 | PATCH_EQUIVALENT |
| 256 | `worktree-agent-a78e2a7f477890873` | `ae7b06e120608b0ba7f3192d719481e77f3895ed` | NO | 1/1017 | 1/1229 | PATCH_EQUIVALENT |
| 257 | `worktree-agent-a7ba69da02d66721b` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 258 | `worktree-agent-a7cd682f18ab4de6e` | `d8f0f9944411217ba82fbf1491047fa187748569` | YES | 0/101 | 0/313 | CONTAINED_CANDIDATE |
| 259 | `worktree-agent-a7e07f6c47a94fe5c` | `a2e53372d189b0b1eced647c1527049d1f0f8e94` | NO | 9/853 | 9/1065 | PATCH_EQUIVALENT |
| 260 | `worktree-agent-a7e7c64a8d32ee713` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 261 | `worktree-agent-a7f615c8067574220` | `527ee53caaeca193957a0bc43a8680338a99ccdb` | NO | 1/73 | 1/285 | PATCH_EQUIVALENT |
| 262 | `worktree-agent-a808196248dda9c0f` | `dc533cea2552a30b036143bbd588bbf7309f580b` | NO | 3/644 | 3/856 | PATCH_EQUIVALENT |
| 263 | `worktree-agent-a815042eaea0d7394` | `e90e6259e6effe3c510dfe7422c7533233349327` | NO | 1/90 | 1/302 | PATCH_EQUIVALENT |
| 264 | `worktree-agent-a82236cec18af83d9` | `c476b5853f4b58e9af6b4f14e8ef3c37617ca7ca` | NO | 16/680 | 16/892 | REWORKED_OR_SUPERSEDED |
| 265 | `worktree-agent-a833ac2c7ebc5f4eb` | `7aec9adad963945c3f7d8128baab9bddff1fcaa3` | NO | 1/688 | 1/900 | PATCH_EQUIVALENT |
| 266 | `worktree-agent-a852f7e14bb63ceec` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 267 | `worktree-agent-a854eba9fae017702` | `792319bb92a6691b4d2e9f829aba2aec23fdd279` | YES | 0/968 | 0/1180 | CONTAINED_CANDIDATE |
| 268 | `worktree-agent-a85b8a5cedcebd711` | `c4c2744b8a92d1d7ac507132d261316942b339bb` | NO | 2/73 | 2/285 | PATCH_EQUIVALENT |
| 269 | `worktree-agent-a85c32dc5e5bd9afb` | `715a29609ec1a4966ad3a7bda2c86c4cc22b3797` | NO | 2/638 | 2/850 | PATCH_EQUIVALENT |
| 270 | `worktree-agent-a86607d41f084330e` | `6b09c622eb84d7742daed2b71f65c83cfe2878db` | NO | 1/609 | 1/821 | PATCH_EQUIVALENT |
| 271 | `worktree-agent-a89635538694927df` | `606feb9bd6d34b629c9104d6947f0351d5d09f96` | NO | 1/1022 | 1/1234 | PATCH_EQUIVALENT |
| 272 | `worktree-agent-a8d49670342a6d0b6` | `2e4b3b4ae900354d21b43cc62afd5475faa35c9d` | NO | 2/658 | 2/870 | REWORKED_OR_SUPERSEDED |
| 273 | `worktree-agent-a8d62006cf2db0d2b` | `792319bb92a6691b4d2e9f829aba2aec23fdd279` | YES | 0/968 | 0/1180 | CONTAINED_CANDIDATE |
| 274 | `worktree-agent-a8db8fee1fb56df5a` | `3a69da35256b597418c293cb4c855f0170fe53aa` | NO | 4/988 | 4/1200 | PATCH_EQUIVALENT |
| 275 | `worktree-agent-a8e9ae0eb2f8a0ec3` | `78a46dcd2b2b68a1e9a09deb10b8ad91c325d0d5` | NO | 1/652 | 1/864 | PATCH_EQUIVALENT |
| 276 | `worktree-agent-a915b0a5feb40994b` | `b07aefbbf242c048ce758389695d87fd42475830` | NO | 2/70 | 2/282 | REWORKED_OR_SUPERSEDED |
| 277 | `worktree-agent-a919b28215150545f` | `ffce23f314e0419b1af679173aa3a2a3f1e3b5f3` | NO | 1/693 | 1/905 | PATCH_EQUIVALENT |
| 278 | `worktree-agent-a92a07d54a2eca488` | `5648c486788e6356daa502459725d38e2e294cad` | NO | 4/970 | 4/1182 | PATCH_EQUIVALENT |
| 279 | `worktree-agent-a9479bc47ac9b006f` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 280 | `worktree-agent-a9584db73d310afe1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 281 | `worktree-agent-a9600c85274d3eda0` | `135a6b5b5a82ce979e150212210233b387d76a33` | NO | 69/61 | 1/205 | PATCH_EQUIVALENT |
| 282 | `worktree-agent-a97af82ccd2f8cb91` | `1aac7e25d43fab0f93d226d036b6ff33b6cdf6ac` | NO | 4/894 | 4/1106 | PATCH_EQUIVALENT |
| 283 | `worktree-agent-a9830660d79a3d9f8` | `855933335916241602722f3c0fa1fcf1f4fb09b0` | NO | 1/737 | 1/949 | REWORKED_OR_SUPERSEDED |
| 284 | `worktree-agent-a9ae2645d62c1e59e` | `5eb4b268f3d41282ce2975283d3b345f9c876c41` | NO | 11/1017 | 11/1229 | REWORKED_OR_SUPERSEDED |
| 285 | `worktree-agent-a9b399ae79d28c7ef` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 286 | `worktree-agent-a9d5f6d8c2c9a5534` | `341be78bb9525af7b565df468711be489a9e0f0d` | NO | 2/1042 | 2/1254 | PATCH_EQUIVALENT |
| 287 | `worktree-agent-a9eacf3e2bde81ba6` | `19306b21beac9bbbef7593bb1ac1261752ad5c75` | YES | 159/61 | 0/114 | CONTAINED_CANDIDATE |
| 288 | `worktree-agent-a9f17662baab0b4d8` | `7bbf458b0e730136032aa3ae77331851744009db` | NO | 1/625 | 1/837 | PATCH_EQUIVALENT |
| 289 | `worktree-agent-aa0de4123f268732e` | `930c5b41279545dfb1ed88ac1deb01a3ecc7c027` | NO | 1/1042 | 1/1254 | PATCH_EQUIVALENT |
| 290 | `worktree-agent-aa2731577bc07a836` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 291 | `worktree-agent-aa4d2d301c368ca65` | `a691d41e62a83942cfec8350c80da184382fb85f` | NO | 1/695 | 1/907 | PATCH_EQUIVALENT |
| 292 | `worktree-agent-aa5a501ce5e25a160` | `d4f10dab5061b2e3879803321b1cf26933607edc` | NO | 3/970 | 3/1182 | PATCH_EQUIVALENT |
| 293 | `worktree-agent-aab81d9b0b4ea1757` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 294 | `worktree-agent-aac96ea627043272c` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 295 | `worktree-agent-aae072ba58efde4b8` | `6f021bc8c5ba5d04045011e8de4f2a260e13815c` | NO | 4/921 | 4/1133 | PATCH_EQUIVALENT |
| 296 | `worktree-agent-aaea6e3ed8a697997` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 297 | `worktree-agent-ab1b526ab851efa48` | `4ab1911ffd7101420e63599e568884a8a153fad0` | NO | 4/921 | 4/1133 | PATCH_EQUIVALENT |
| 298 | `worktree-agent-ab1ee03627110a5fd` | `66b501f24770bfa3599da73db07addd37d0a6f83` | NO | 2/688 | 2/900 | PATCH_EQUIVALENT |
| 299 | `worktree-agent-ab331a1cfccca824b` | `8c91d2bc60988372967bb3ce3be77f7d1ebae8f0` | NO | 69/61 | 1/205 | PATCH_EQUIVALENT |
| 300 | `worktree-agent-ab6c0896703e1cf0d` | `19306b21beac9bbbef7593bb1ac1261752ad5c75` | YES | 159/61 | 0/114 | CONTAINED_CANDIDATE |
| 301 | `worktree-agent-ab7ebe12d3ad72926` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 302 | `worktree-agent-aba938f7f5cf7ee41` | `80ea57bb9e05e82f131b16ffd54dab733a25ad1e` | YES | 0/109 | 0/321 | CONTAINED_CANDIDATE |
| 303 | `worktree-agent-abbd9cc7e4392f981` | `e26b38ee4f30eadc31701860774f71a76446ea43` | NO | 9/776 | 9/988 | PATCH_EQUIVALENT |
| 304 | `worktree-agent-abec7110f45353f54` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 305 | `worktree-agent-abf0b5cfd0dffa172` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 306 | `worktree-agent-ac1ae096b4800ed25` | `dea26078c3f65de125c3c1e4e5c0145b3407b8a1` | NO | 1/688 | 1/900 | PATCH_EQUIVALENT |
| 307 | `worktree-agent-ac2c9afcdda71b22b` | `8ba3eb454be2a41a3bd5960c56a4438b455ffd77` | NO | 2/891 | 2/1103 | PATCH_EQUIVALENT |
| 308 | `worktree-agent-ac3840241f87e3b20` | `08384a55309c5c3187731d42919bf9adf6b0ae30` | YES | 0/154 | 0/366 | CONTAINED_CANDIDATE |
| 309 | `worktree-agent-ac3b82bccc624aa8b` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 310 | `worktree-agent-ac50bece13dbd42d3` | `a3743423c814360211ef867a87ef65574d676129` | NO | 1/73 | 1/285 | PATCH_EQUIVALENT |
| 311 | `worktree-agent-ac5cd4a6a82ddc886` | `abecbfe39f64e4acae2b1a93a9860c2482dcac9a` | NO | 6/609 | 6/821 | REWORKED_OR_SUPERSEDED |
| 312 | `worktree-agent-ac6cda2939262faa9` | `714636b92701a1998a5c21ad4c523bad0089f869` | NO | 2/629 | 2/841 | PATCH_EQUIVALENT |
| 313 | `worktree-agent-ac824eb34f270531e` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 314 | `worktree-agent-ac84b4349bcf8c4f0` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 315 | `worktree-agent-ac9765ffb9cbb7cef` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 316 | `worktree-agent-acafb9705bd5dc0cf` | `39bff65ec907c032000f8207e2ece4e48f6fd16e` | NO | 7/921 | 7/1133 | PATCH_EQUIVALENT |
| 317 | `worktree-agent-acb87a9459397c52a` | `0ce7a6434a69b9f9ae051758f9d0682d251140dc` | NO | 1/702 | 1/914 | PATCH_EQUIVALENT |
| 318 | `worktree-agent-acebd5700f42a842c` | `d1b9739dd003c86aeb007e9f299feaadace61094` | NO | 1/619 | 1/831 | PATCH_EQUIVALENT |
| 319 | `worktree-agent-ad1f4df07d0596263` | `260a3f9b036b996d3dda5951a9aef353b190f44b` | NO | 1/1032 | 1/1244 | PATCH_EQUIVALENT |
| 320 | `worktree-agent-ad205a31e136bbfbb` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 321 | `worktree-agent-ad30aa7bf3061b6f3` | `82be6d0679d57aca78bd5b1241883f0191831094` | NO | 2/658 | 2/870 | PATCH_EQUIVALENT |
| 322 | `worktree-agent-ad3ba5393e0f0020c` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 323 | `worktree-agent-ad5da6529a8c2977b` | `348f6f166dbee31b38772c81a08d95bd581d9ff3` | NO | 1/670 | 1/882 | PATCH_EQUIVALENT |
| 324 | `worktree-agent-ad7f1ca082be7af26` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 325 | `worktree-agent-adb15d46191da1ab2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 326 | `worktree-agent-adb91dc3877d929d6` | `4be14a54760bf78304faf4e9f99ab774c33976f8` | NO | 1/1035 | 1/1247 | REWORKED_OR_SUPERSEDED |
| 327 | `worktree-agent-adc989f704ce1bba5` | `d6e705f681cd6dff4ddc2c5e9d3eb7b508894ba7` | NO | 69/61 | 1/205 | PATCH_EQUIVALENT |
| 328 | `worktree-agent-addd23c4095cf2ba9` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 329 | `worktree-agent-ade1f9b40f7484c85` | `9fe530d6bc883f6a883d18a6caa28db1faa75963` | NO | 1/90 | 1/302 | PATCH_EQUIVALENT |
| 330 | `worktree-agent-ade63eefec1d12c3c` | `2f199c9f30d836e1d12abe4d8ee29a39bfcef622` | NO | 3/894 | 3/1106 | PATCH_EQUIVALENT |
| 331 | `worktree-agent-adf1b1dc52beb2299` | `55b414c521c4e73885be53a4224db86c9b20e823` | NO | 6/831 | 6/1043 | PATCH_EQUIVALENT |
| 332 | `worktree-agent-adfc7a22e882cfcbf` | `008603b443911db0b998a78bb7f7733e37231ba2` | NO | 1/720 | 1/932 | PATCH_EQUIVALENT |
| 333 | `worktree-agent-ae1eb070a9261d443` | `0cec6b7fc2420e29e96377f27d0a460bf7b1563d` | NO | 1/720 | 1/932 | PATCH_EQUIVALENT |
| 334 | `worktree-agent-ae27f31f1ad960119` | `56e4ebb2b493a243b6cbae5d26f35e07fe50360b` | YES | 160/61 | 0/113 | CONTAINED_CANDIDATE |
| 335 | `worktree-agent-ae3902ba4175f65bf` | `397ecfe788052ebcc53ad8f8270af88113cb842c` | NO | 1/1035 | 1/1247 | PATCH_EQUIVALENT |
| 336 | `worktree-agent-ae544b4b974c3d6e7` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 337 | `worktree-agent-ae8d83c80eb0502ec` | `004fc1d58ccf4146fd28e365f646954393810d93` | NO | 3/737 | 3/949 | PATCH_EQUIVALENT |
| 338 | `worktree-agent-ae942293603371353` | `e2629c3733ca8852f8351d4416300f1bc72908cc` | NO | 162/61 | 1/112 | PATCH_EQUIVALENT |
| 339 | `worktree-agent-ae9af9fc632ff772f` | `5f8b1302a1c32815db9408dd96a49f1651b32433` | NO | 2/619 | 2/831 | PATCH_EQUIVALENT |
| 340 | `worktree-agent-aea158b4955da89cb` | `51d8baccf5862fdd308e56d506dcdd28509adf1d` | NO | 1/695 | 1/907 | PATCH_EQUIVALENT |
| 341 | `worktree-agent-aea53e181037fabc0` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 342 | `worktree-agent-aea60c11bdd0c2268` | `e199a58ed5ffdcf72ef250b39991e5b540fdf250` | NO | 4/1062 | 4/1274 | PATCH_EQUIVALENT |
| 343 | `worktree-agent-aea90181c530e7a8f` | `ccfffd3ee8e834f5c7fa8f620c86555cb69f1c30` | NO | 1/1022 | 1/1234 | PATCH_EQUIVALENT |
| 344 | `worktree-agent-aead93768a1bedc9c` | `9432adec41d52e7c64a8e07edeefd1f2e9fb9910` | NO | 1/670 | 1/882 | PATCH_EQUIVALENT |
| 345 | `worktree-agent-aeb3d051a0b8cca9a` | `d01400a946c84e5a7d3ae685b3e42e62b37dddc7` | NO | 4/1062 | 4/1274 | REWORKED_OR_SUPERSEDED |
| 346 | `worktree-agent-aec75006dc22bf172` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 347 | `worktree-agent-aecf5cad91013f6d9` | `203ca17b575d3cf9ce7b41adb120d07ce5972c3a` | NO | 161/61 | 1/113 | PATCH_EQUIVALENT |
| 348 | `worktree-agent-af0d0362347f1a379` | `6d8c9bf3a66a2dffbec52dd555a4e817560de4f6` | NO | 52/61 | 1/222 | PATCH_EQUIVALENT |
| 349 | `worktree-agent-af1d342f40d7dc863` | `93a16916623e7268eaeb1920f6d18f3cbdde42a7` | NO | 1/680 | 1/892 | PATCH_EQUIVALENT |
| 350 | `worktree-agent-af28f290fcfee5d5b` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 351 | `worktree-agent-af394a94b6cd7c70a` | `657409d92be9397a8d8a77377c36713174ee99c7` | NO | 2/714 | 2/926 | PATCH_EQUIVALENT |
| 352 | `worktree-agent-af3ef9489c632d311` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 353 | `worktree-agent-af48003d7d331fdb4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 354 | `worktree-agent-af56e358bbe67b053` | `b2f12b99ecfd50fc3f293ac43fbc30986154d260` | NO | 1/645 | 1/857 | PATCH_EQUIVALENT |
| 355 | `worktree-agent-af589e75fef826b4d` | `e623917ef3e25742086eee235a4b7ff9a95b6753` | NO | 54/61 | 1/220 | PATCH_EQUIVALENT |
| 356 | `worktree-agent-af60a94c4d3f2d57f` | `a8c54461e84547624c37116f032ebe0711f6b87f` | NO | 1/609 | 1/821 | PATCH_EQUIVALENT |
| 357 | `worktree-agent-af6c4637657b33924` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 358 | `worktree-agent-af6d36db65ad9c8d5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 359 | `worktree-agent-af7b425bfed3ee5da` | `6d87825b8754251089a3191c75929e53f2b7a091` | YES | 0/725 | 0/937 | CONTAINED_CANDIDATE |
| 360 | `worktree-agent-af9a5067bf7198475` | `c12cd4ed05107809e01b0c168968184da3f45154` | NO | 1/680 | 1/892 | PATCH_EQUIVALENT |
| 361 | `worktree-agent-afaca14d56b4f8e71` | `e5e78023e1e235b46aed065a11ef580aed7780b6` | NO | 1/610 | 1/822 | PATCH_EQUIVALENT |
| 362 | `worktree-agent-afb747efc8a97bd4e` | `2f906d31780eec1db974c19fa5ed6338b6e9b0f5` | NO | 6/822 | 6/1034 | PATCH_EQUIVALENT |
| 363 | `worktree-agent-aff3b88024ea0474c` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 364 | `worktree-agent-aff5906b3a672bd00` | `ab3989a5574ac420ca644aa387d85485701a1171` | NO | 1/1062 | 1/1274 | PATCH_EQUIVALENT |
| 365 | `worktree-wf_013724e7-e72-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 366 | `worktree-wf_0bd98f96-5b6-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 367 | `worktree-wf_0bd98f96-5b6-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 368 | `worktree-wf_0bd98f96-5b6-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 369 | `worktree-wf_0bd98f96-5b6-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 370 | `worktree-wf_0bd98f96-5b6-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 371 | `worktree-wf_0bd98f96-5b6-6` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 372 | `worktree-wf_0bd98f96-5b6-7` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 373 | `worktree-wf_0bd98f96-5b6-8` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 374 | `worktree-wf_0bd98f96-5b6-9` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 375 | `worktree-wf_0c493b66-6c4-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 376 | `worktree-wf_0c493b66-6c4-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 377 | `worktree-wf_0c493b66-6c4-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 378 | `worktree-wf_0c493b66-6c4-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 379 | `worktree-wf_0c493b66-6c4-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 380 | `worktree-wf_0c493b66-6c4-6` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 381 | `worktree-wf_0c493b66-6c4-7` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 382 | `worktree-wf_0c493b66-6c4-8` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 383 | `worktree-wf_0c493b66-6c4-9` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 384 | `worktree-wf_0c8e5a91-3df-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 385 | `worktree-wf_4883795e-af4-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 386 | `worktree-wf_4883795e-af4-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 387 | `worktree-wf_4883795e-af4-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 388 | `worktree-wf_65b991ca-e31-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 389 | `worktree-wf_65b991ca-e31-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 390 | `worktree-wf_73b03689-63b-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 391 | `worktree-wf_73b03689-63b-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 392 | `worktree-wf_7ae60137-18d-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 393 | `worktree-wf_7ae60137-18d-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 394 | `worktree-wf_7ae60137-18d-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 395 | `worktree-wf_7ae60137-18d-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 396 | `worktree-wf_7ae60137-18d-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 397 | `worktree-wf_842e74fe-03a-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 398 | `worktree-wf_842e74fe-03a-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 399 | `worktree-wf_85e0c12d-03f-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 400 | `worktree-wf_9f1fa27f-1bb-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 401 | `worktree-wf_a365dfa8-14c-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 402 | `worktree-wf_a365dfa8-14c-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 403 | `worktree-wf_a365dfa8-14c-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 404 | `worktree-wf_a365dfa8-14c-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 405 | `worktree-wf_a365dfa8-14c-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 406 | `worktree-wf_a365dfa8-14c-6` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 407 | `worktree-wf_a365dfa8-14c-7` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 408 | `worktree-wf_a365dfa8-14c-8` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 409 | `worktree-wf_a6e6b281-368-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 410 | `worktree-wf_a6e6b281-368-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 411 | `worktree-wf_a6e6b281-368-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 412 | `worktree-wf_a6e6b281-368-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 413 | `worktree-wf_a6e6b281-368-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 414 | `worktree-wf_a6e6b281-368-6` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 415 | `worktree-wf_b077391c-84e-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 416 | `worktree-wf_b30fa77c-6d3-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 417 | `worktree-wf_b30fa77c-6d3-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 418 | `worktree-wf_b30fa77c-6d3-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 419 | `worktree-wf_b30fa77c-6d3-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 420 | `worktree-wf_b30fa77c-6d3-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 421 | `worktree-wf_b30fa77c-6d3-6` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 422 | `worktree-wf_b30fa77c-6d3-7` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 423 | `worktree-wf_b30fa77c-6d3-8` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 424 | `worktree-wf_bc998704-f7e-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 425 | `worktree-wf_bc998704-f7e-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 426 | `worktree-wf_bca7eb58-d11-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 427 | `worktree-wf_c2eb9556-88b-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 428 | `worktree-wf_c2eb9556-88b-2` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 429 | `worktree-wf_c2eb9556-88b-3` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 430 | `worktree-wf_c2eb9556-88b-4` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 431 | `worktree-wf_c2eb9556-88b-5` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 432 | `worktree-wf_c2eb9556-88b-6` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 433 | `worktree-wf_c2eb9556-88b-7` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 434 | `worktree-wf_c2eb9556-88b-8` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 435 | `worktree-wf_c2eb9556-88b-9` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 436 | `worktree-wf_cce646e9-5ff-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 437 | `worktree-wf_e687bbbc-df4-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 438 | `worktree-wf_e91f5ac1-0d9-1` | `533162635f56584d630e3d971d77d50860595f15` | YES | 0/1990 | 0/2202 | CONTAINED_CANDIDATE |
| 439 | `wpk-backup` | `40d09212e64bb44d2b1e7df1a33de15889b7c18f` | NO | 51/61 | 3/225 | REWORKED_OR_SUPERSEDED |
| 440 | `wpk-work` | `9f0cd7062045764a0039432a77d6fa43626845c4` | NO | 72/61 | 7/208 | PATCH_EQUIVALENT |

## Every registered worktree — 46 rows

Dirty is tracked/untracked status entry counts at the snapshot, before this
report was created. No worktree, including detached /tmp/preview-src, was
checked out, added, removed, cleaned or modified by the audit.

| # | Absolute worktree path | Branch or detached | Full HEAD | Dirty T/U | Candidate contained | Candidate A/B |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/home/bobby/portal` | `fix/stan-context-password-change-origin` | `87d9d98c3a80400a72de759e63dfc50af70e0436` | 0/259 | YES | 0/3073 |
| 2 | `/home/bobby/.worktrees/portal-execution-native-core-integration` | `feat/execution-native-read-integration` | `b87f73dbda3d119dbb09ed9f263b89738abbb874` | 0/0 | NO | 1/1354 |
| 3 | `/home/bobby/portal-backend-residuals-20261025` | `chore/backend-residuals-20261025` | `a19112ecc245cfbaa256a56d8bd99096880409fb` | 0/0 | YES | 0/0 |
| 4 | `/home/bobby/portal-contract-elp210` | `chore/elp210-served-contracts-frozen` | `a5194757e5496ba88238507088ee66af0ba3d66f` | 1/2 | NO | 2/858 |
| 5 | `/home/bobby/portal-core-policy-integrated` | `chore/core-policy-integrated-20261023` | `31bedf3177162bce5df3c0f26d773b8494fd14cf` | 0/0 | YES | 0/239 |
| 6 | `/home/bobby/portal-core-policy-wire` | `chore/core-policy-wire-20261024` | `56f4cf4b6a77b1d8dad58b94c29d964c3daa655e` | 0/0 | YES | 0/246 |
| 7 | `/home/bobby/portal-core-provider-assembly-20261025` | `chore/core-provider-assembly-20261025` | `81bfe402c1115dc460f840cbb955eeafcf11f5ba` | 0/0 | YES | 0/204 |
| 8 | `/home/bobby/portal-core009-integration` | `chore/core009-connected-20261021` | `9d88e40a963f4eb2245f8ec0343c2c511a98bd68` | 0/0 | NO | 2/1296 |
| 9 | `/home/bobby/portal-core009-landing-20261022` | `chore/core009-landing-20261022` | `4c7f809e9cb56746a2b9f83a586d3d8329e16008` | 0/0 | YES | 0/392 |
| 10 | `/home/bobby/portal-core009-revoke-denial-20261022` | `chore/core009-revoke-denial-20261022` | `29f57e36375d62f6a22877e6015779cb2db36771` | 2/0 | YES | 0/796 |
| 11 | `/home/bobby/portal-core009-successor` | `chore/core009-successor-20261021` | `3d4164bdf5723031e380a25cde68c495dddd0671` | 0/1 | YES | 0/805 |
| 12 | `/home/bobby/portal-dev-certified` | `dev` | `533162635f56584d630e3d971d77d50860595f15` | 0/0 | YES | 0/2202 |
| 13 | `/home/bobby/portal-edge-scoped-notices-20261026` | `chore/manager-scoped-notices-20261026` | `151f55afc3902443d391fac93c22de1ce926fb65` | 0/0 | NO | 143/2202 |
| 14 | `/home/bobby/portal-elp204-fixture-repair` | `chore/elp204-target-expiry-fixture` | `734353113d8bec85f78b35ab81c9c1a40e93a67e` | 2/0 | NO | 1/1296 |
| 15 | `/home/bobby/portal-elp210-landing` | `chore/elp210-landing-rebase` | `218b94280e1994ce3c40cae3c08c261f7fc52c13` | 0/0 | YES | 0/826 |
| 16 | `/home/bobby/portal-fixture-support` | `chore/complete-fixture-review-20261023` | `af51059b1a9b790fc089fbba2f0370c4061af8b9` | 0/0 | NO | 19/233 |
| 17 | `/home/bobby/portal-integration` | `docs/consolidation-closeout-20260919` | `c43ee0317a439b4566decd5fddfc8be839db239e` | 0/0 | NO | 2/2202 |
| 18 | `/home/bobby/portal-main-release` | `main` | `533162635f56584d630e3d971d77d50860595f15` | 0/0 | YES | 0/2202 |
| 19 | `/home/bobby/portal-native-semantic-review` | `fix/native-semantic-roundtrip-20261025` | `56f4cf4b6a77b1d8dad58b94c29d964c3daa655e` | 0/1 | YES | 0/246 |
| 20 | `/home/bobby/portal-research` | `docs/research-loop-plan` | `685bc1915db51c7869254c1fdfa68991d7e4aae4` | 0/0 | YES | 0/212 |
| 21 | `/home/bobby/portal-research-be` | `codex/be-gaps` | `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1` | 0/0 | YES | 0/1413 |
| 22 | `/home/bobby/portal-research-closeout` | `chore/core009-approved-closeout-20261023` | `2a89e6d0d6bb221e87f24da6be1e3394f8f22f4d` | 0/0 | YES | 0/248 |
| 23 | `/home/bobby/portal-research-fe` | `claude/post-freeze-20261021` | `3aaf24f4e66bca6c27962ddbbc2049cfb6505421` | 3/8 | YES | 0/777 |
| 24 | `/home/bobby/portal-research-fe2` | `claude/post-land-20261022` | `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` | 0/0 | YES | 0/110 |
| 25 | `/home/bobby/portal-research-integrate-20261025` | `chore/research-source-integration-20261025` | `7129943770e695e61825876bdf1936c191ccbf92` | 0/0 | YES | 0/23 |
| 26 | `/home/bobby/portal-research-ol-p22-p24` | `codex/research-ol-p22-p24` | `73af8d21e2935a1176c3a7f576c436204e081dad` | 0/0 | YES | 0/1841 |
| 27 | `/home/bobby/portal/.claude/worktrees/agent-a059d6acb3ffd7865` | `worktree-agent-a059d6acb3ffd7865` | `16f7c34cbe5c3ddc666e694fd2a3fff588ad1e39` | 0/0 | NO | 1/205 |
| 28 | `/home/bobby/portal/.claude/worktrees/agent-a1f3f67c82323245a` | `worktree-agent-a1f3f67c82323245a` | `6d4a9001b20df6a1a6e9881eedb95ffb70858518` | 0/0 | NO | 1/113 |
| 29 | `/home/bobby/portal/.claude/worktrees/agent-a41bebe538f3a7aa8` | `worktree-agent-a41bebe538f3a7aa8` | `56e4ebb2b493a243b6cbae5d26f35e07fe50360b` | 21/2 | YES | 0/113 |
| 30 | `/home/bobby/portal/.claude/worktrees/agent-a42be4c8123a045a6` | `worktree-agent-a42be4c8123a045a6` | `f615c3de50efe0dbe96222b2681fb933bc25fb7b` | 0/0 | NO | 6/142 |
| 31 | `/home/bobby/portal/.claude/worktrees/agent-a540a08ee9939a9e4` | `worktree-agent-a540a08ee9939a9e4` | `56e4ebb2b493a243b6cbae5d26f35e07fe50360b` | 18/1 | YES | 0/113 |
| 32 | `/home/bobby/portal/.claude/worktrees/agent-a5d9d960e9549ca00` | `worktree-agent-a5d9d960e9549ca00` | `0ef0d6e0f036cc506c0b3d571f15a6d5b25c1633` | 1/0 | NO | 1/113 |
| 33 | `/home/bobby/portal/.claude/worktrees/agent-a6b74cbb4de1b6d06` | `worktree-agent-a6b74cbb4de1b6d06` | `40bcab3a2391318d785a6c48c34fcb3a299b0d60` | 0/0 | NO | 1/205 |
| 34 | `/home/bobby/portal/.claude/worktrees/agent-a9600c85274d3eda0` | `worktree-agent-a9600c85274d3eda0` | `135a6b5b5a82ce979e150212210233b387d76a33` | 0/0 | NO | 1/205 |
| 35 | `/home/bobby/portal/.claude/worktrees/agent-a9eacf3e2bde81ba6` | `worktree-agent-a9eacf3e2bde81ba6` | `19306b21beac9bbbef7593bb1ac1261752ad5c75` | 7/2 | YES | 0/114 |
| 36 | `/home/bobby/portal/.claude/worktrees/agent-ab331a1cfccca824b` | `worktree-agent-ab331a1cfccca824b` | `8c91d2bc60988372967bb3ce3be77f7d1ebae8f0` | 0/0 | NO | 1/205 |
| 37 | `/home/bobby/portal/.claude/worktrees/agent-ab6c0896703e1cf0d` | `worktree-agent-ab6c0896703e1cf0d` | `19306b21beac9bbbef7593bb1ac1261752ad5c75` | 11/1 | YES | 0/114 |
| 38 | `/home/bobby/portal/.claude/worktrees/agent-adc989f704ce1bba5` | `worktree-agent-adc989f704ce1bba5` | `d6e705f681cd6dff4ddc2c5e9d3eb7b508894ba7` | 0/0 | NO | 1/205 |
| 39 | `/home/bobby/portal/.claude/worktrees/agent-ae27f31f1ad960119` | `worktree-agent-ae27f31f1ad960119` | `56e4ebb2b493a243b6cbae5d26f35e07fe50360b` | 13/0 | YES | 0/113 |
| 40 | `/home/bobby/portal/.claude/worktrees/agent-ae942293603371353` | `worktree-agent-ae942293603371353` | `e2629c3733ca8852f8351d4416300f1bc72908cc` | 0/0 | NO | 1/112 |
| 41 | `/home/bobby/portal/.claude/worktrees/agent-aecf5cad91013f6d9` | `worktree-agent-aecf5cad91013f6d9` | `203ca17b575d3cf9ce7b41adb120d07ce5972c3a` | 0/0 | NO | 1/113 |
| 42 | `/home/bobby/portal/.claude/worktrees/agent-af0d0362347f1a379` | `worktree-agent-af0d0362347f1a379` | `6d8c9bf3a66a2dffbec52dd555a4e817560de4f6` | 0/0 | NO | 1/222 |
| 43 | `/home/bobby/portal/.claude/worktrees/agent-af589e75fef826b4d` | `worktree-agent-af589e75fef826b4d` | `e623917ef3e25742086eee235a4b7ff9a95b6753` | 0/0 | NO | 1/220 |
| 44 | `/tmp/be-integ` | `claude/be-integ` | `4972daec896ae993c46336df72655d1663772cc3` | 0/0 | YES | 0/1078 |
| 45 | `/tmp/f9-integ` | `claude/uxm-f9` | `ed3c7cbdd3d75e359c4d56308e680d316fbbea4d` | 0/0 | YES | 0/1175 |
| 46 | `/tmp/preview-src` | `DETACHED` | `49324c4dab7d2c7111a405048371dfe324568814` | 0/0 | YES | 0/784 |

## Untracked-name preservation

Names/counts only; no untracked contents were read. Generated dist/snapshot
lists and nested-worktree directory repetitions are summarized above.

- `/home/bobby/portal`: 0 tracked / 259 untracked; non-generated untracked names: `.agents/rules/antigravity.md`, `upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/D4_PORTAL_SOURCE_HANDOFF.md`.
- `/home/bobby/portal-contract-elp210`: 1 tracked / 2 untracked; non-generated untracked names: `upgrade/execution_loop/evidence/ELP2-10/CORE_EXPIRY_FIXTURE_SOURCE_RETURN_2026-10-21.md`, `upgrade/execution_loop/evidence/ELP2-10/CORE_R3_1130_FAILURE_OWNER_RETURN_2026-10-21.md`.
- `/home/bobby/portal-core009-revoke-denial-20261022`: 2 tracked / 0 untracked; no non-generated untracked names listed.
- `/home/bobby/portal-core009-successor`: 0 tracked / 1 untracked; non-generated untracked names: `apps/portal/frontend/e2e/quietGate.mjs`.
- `/home/bobby/portal-elp204-fixture-repair`: 2 tracked / 0 untracked; no non-generated untracked names listed.
- `/home/bobby/portal-native-semantic-review`: 0 tracked / 1 untracked; non-generated untracked names: `apps/control-api/test/elp210-native-correspondence-roundtrip.spec.ts`.
- `/home/bobby/portal-research-fe`: 3 tracked / 8 untracked; non-generated untracked names: `upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P22-FACTORY-EDGE08-OWNER-ACTION-2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CODEX_BE_P23_FINAL_FIXTURE_REVIEW_2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CODEX_TO_CLAUDE_LANDING_ACK_2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CORE009_08_ACTUAL_INTERNAL_READ_RETURN_2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CORE009_08_FULL_SUITE_DISPOSITION_2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CORE009_AFTER_REAL_READ_OWNER_ACTIONS_2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CORE009_P22_FACTORY_G2_INTEGRATION_2026-10-22.md`, `upgrade/execution_loop/evidence/ELP2-10/CORE_TO_CLAUDE_ACTIVE_REVOKE_DENIAL_REPAIR_2026-10-22.md`.
- `/home/bobby/portal/.claude/worktrees/agent-a41bebe538f3a7aa8`: 21 tracked / 2 untracked; non-generated untracked names: `apps/portal/frontend/src/execution/v2/screens/alpha/replay/replayLanes.test.tsx`, `apps/portal/frontend/src/execution/v2/screens/alpha/ticketIds.test.tsx`.
- `/home/bobby/portal/.claude/worktrees/agent-a540a08ee9939a9e4`: 18 tracked / 1 untracked; non-generated untracked names: `apps/portal/frontend/e2e/bffApprovalWorld.ts`.
- `/home/bobby/portal/.claude/worktrees/agent-a5d9d960e9549ca00`: 1 tracked / 0 untracked; no non-generated untracked names listed.
- `/home/bobby/portal/.claude/worktrees/agent-a9eacf3e2bde81ba6`: 7 tracked / 2 untracked; non-generated untracked names: `apps/portal/frontend/src/execution/v2/screens/ticketCodes.test.tsx`, `apps/portal/frontend/src/execution/v2/ticketText.ts`.
- `/home/bobby/portal/.claude/worktrees/agent-ab6c0896703e1cf0d`: 11 tracked / 1 untracked; non-generated untracked names: `apps/portal/frontend/src/execution/v2/shell/shellText.hygiene.test.tsx`.
- `/home/bobby/portal/.claude/worktrees/agent-ae27f31f1ad960119`: 13 tracked / 0 untracked; no non-generated untracked names listed.

## Reproduction, verification and exit

Final read-only ref-preservation recheck at 2026-10-26 11:09:53 UTC: all 440
snapshot branch names still exist at the same full tips; no new/moved/deleted
heads were observed. All 302 distinct original tip objects resolve to commits.
No backup/ref mutation was performed by this agent; primary records its own
backup and resulting refs when it performs consolidation.

Read-only commands used (all Git commands add `--no-optional-locks`):

```bash
git -C /home/bobby/portal for-each-ref --format='%(refname:short)%09%(objectname)' refs/heads
git -C /home/bobby/portal worktree list --porcelain
git -C /home/bobby/portal rev-list --left-right --count BASE...TIP
git -C WORKTREE status --porcelain=v1 --untracked-files=all
git -C WORKTREE diff -- TRACKED_PATH
git -C /home/bobby/portal log --no-merges --pretty=medium --no-ext-diff -p REVISIONS
# Feed the preceding stream to:
git -C /home/bobby/portal patch-id --stable
git -C /home/bobby/portal ls-tree -r -l PIN -- PATH
git -C /home/bobby/portal show PIN:PATH
```

Patch IDs were computed across the union of local heads minus the earlier
candidate, and compared with candidate-reachable nonmerge commits; duplicate
patch IDs retained every source commit SHA. Reuse is limited to unchanged
input tips and the documentation-only candidate advance. Candidate file-byte
comparisons and relevant tracked WIP diffs were refreshed in this round.
Blob SHA256/bytes/newlines and PNG totals were computed from pinned Git blobs.

- Verification lane: R0 documentation/source census. Code/tests/build/browser/
  Docker/PostgreSQL/SSH/runtime gates **NOT_RUN** by this agent, per scope.
- File check: primary should run the scoped documentation checks at integration;
  this report's 440 branch rows / 46 worktree rows were mechanically counted.
- Resource cleanup: NO_ACTION_NEEDED; no processes, temp worktrees, test cells,
  images, volumes or runtime resources created.
- Backend next: primary may consolidate the approved candidate with gate debt
  honestly retained; inspect P04's narrow fix if desired. No new phase/release.
- Claude next: deliver coherent P03/P05 fixture slices and consumer receipts;
  no acceptance is inferred from producer delivery or this inventory.
- Requests: no external messages/source requests sent. Primary owns Edge/source
  coordination and all official ACKs. Unresolved current gates remain in their
  owning packets; historical archive preservation does not close them.
- Agent cost: one reused census agent, zero child agents spawned.

