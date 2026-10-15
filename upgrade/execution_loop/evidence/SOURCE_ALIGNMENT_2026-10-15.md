# Execution V2 onboarding — read-only source alignment

Observation date: 2026-10-15 UTC; final metadata check approximately16:42–16:44Z
(23:42–23:44 Asia/Saigon). Scope: local Git/files + SSH Git/files on AWS HK.
No Docker/runtime inspect, DB query, source API, credential read, load/test,
build, migration, service change, remote file write, fetch/push or merge.
This is not full ELP2-00/EPG10-00 acceptance or current deployment attestation.

## 1. Source identities actually inspected

| Target | Worktree / branch | Full SHA / working state |
| --- | --- | --- |
| Portal integration | `/home/bobby/portal-research` · `docs/research-loop-plan` | `5f3f23327367438b8fe3ab048a7ad3ce5ae9a728`; no tracked changes at entry; only user-provided `upgrade/execution_loop/` untracked |
| Portal main/dev local refs | shared repo, not checked out or changed | `533162635f56584d630e3d971d77d50860595f15`; main is ancestor of inspected Research HEAD (`merge-base --is-ancestor`, rc0); no remote freshness claim |
| Stable historical tag | `v1.1.1^{commit}` | `e4fd93658de1ff0614126a85d70e59a23c25a01f`; annotated tag object differs; not observed running image |
| Research BE lane | `/home/bobby/portal-research-be` · `codex/be-gaps` | `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`; not selected merely because it is a backend branch |
| AWS HK TS upgrade | `/home/bobby/.worktrees/trading-system-next-upgrade` · `feat/v2-rust-first-okx-demo` | `4e9c5f29313019714bd82aa1b7b491d2689630ca`; tracked clean; untracked PM guide copy remains |
| AWS HK PM | `/home/bobby/.worktrees/trading-system-pm-v1_1` · `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763`; clean |
| AWS HK DL upgrade | `/home/bobby/.worktrees/data-layer-p184-closure` · `fix/p184-dl-closure` | `864774d5df6b9cfe8c9163272847619c20ff3b9f`; clean |
| AWS HK DL canonical | `/home/bobby/data_layer` · `main` | `5bf5cd540498b82959342c7cfb2ebeaac3007426`; owner-modified `DATA_LAYER_UNIFIED_IMPLEMENTATION_PLAN.md`, preserved |

SSH target verified: `bobby@16.163.212.33`, hostname `ip-172-31-16-126`.
Canonical `/home/bobby/trading_system` at historical668e1032 is **not** the
active TS upgrade target. No deployment inference from worktree names.
Remote `rg` is absent: read-only `find`, `grep`, `sed` used instead.

The shared Portal branch reported ahead429 of its local origin tracking ref;
no fetch was performed, so this is not an assertion about current remote HEAD.

## 2. Guide custody and missing inputs

All five supplied local Markdown files were read in full, including score
appendix code. Their original contents were not edited. SHA-256 at inspection:

| File (relative to `upgrade/execution_loop/`) | SHA-256 |
| --- | --- |
| `EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md` | `0858d989350a8fef34599609ab6585a28f263715ca862cb29bdc352680e464a2` |
| `EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md` | `9047f765f7878f7284363bc6322ff14f3feb5fff4913cc7d4b9a328afd591985` |
| `EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` | `af6d53725d58aca4dfefb0fb212272c2df281b7d605a1f7bca5e54ced9b2eeb0` |
| `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` | `0a266334f26d02bc4be858017d44e980e4ab5a4a5a4a007dad6827f565f06b86` |
| `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` | `d77a05fc0c6b481114c0d4055a2ff0c09f6b7a3cc0ca1447f691d92f139adbad` |

User attachment read: `/home/bobby/.codex/attachments/01d2938e-0cba-4c59-8c3e-ba132f03fe38/Pasted text.txt`.
Contains Prompt B (Portal), C (Claude design), D (FE implementation). Preserve
the distinction from the absent complete parallel-agent prompt companion.

Not found in delivered directory / targeted `upgrade` filename search:
feasibility review, full parallel prompt file, score hardening receipt/script;
no lowfi image assets exist in the five-file delivered directory. This does
not prove they do not exist elsewhere. Their content/verification is UNKNOWN.
The final score guide reports47/47 historical numerical tests; no new run
was executed here, and that number is not current integration coverage.

PM current guide path on HK:
`/home/bobby/.worktrees/trading-system-pm-v1_1/upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`.
Header confirms `OWNER_APPROVED_DESIGN_R2`. Current authority/status/budget
sections read; this was not a full audit of every PM implementation file.
Guide SHA-256 `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945`.
The same-named untracked copy in TS upgrade has SHA-256
`1ac56bff4e5728650cdb91df0544a8f3e17c5103d56ad49d3549f4b7e864b6e3`:
**different bytes; do not overwrite current PM R2 from that copy.**

DL canonical owner diff hash (Git diff bytes):
`b8adf709d8bff7d0fb745146592f9c118b3574efbde37568d9e26c9702d0ecb1`.
DL upgrade Unified file SHA-256:
`c93db136e6784133c2307a528d0b9f2488ab0e7ad7aca24bb20e914454e996d6`.
These are source custody, not runtime approval or immutable future state.

## 3. Cross-track findings: source/journal, not fresh runtime tests

1. **Guide pins have advanced.** TS6c5a1df3→4e9c5f29 and
   DLf8e5442→864774d5. PMd16aa2b5 still matches. Keep guide audit history and
   repin current manifests before each affected implementation; never assign
   historical line numbers/test PASS to the new SHA without impact analysis.
2. **N1 is not simply the old F1 blocker.** TS Unified current journal
   lines76461 onward records TEST core-kill convergence, later production
   rollback/incident and new candidates. Lines76576 onward distinguish TEST
   R2E exactness from apparatus defects; lines76777–76814 describe B14 proof
   and reported rollout. B14 and ingestor CPU change were reported deployed
   at15:59Z; final stage-100 still pending in that TS entry. Do not repeat old
   F1 status as current fact, or promote TEST recovery to production readiness.
3. **DL progressed during the parallel campaign.** Latest DL Unified tail at
   864774d5 records clean isolated multi-key A/B160503Z after discarding a
   tainted earlier run; then stream_kn_1/2 rollout16:18–16:20Z and final
   stage-100 #2 launched16:23:52Z. Measurement lock recorded until17:42:27Z.
   We only read journals; no measured capacity, service health or gate result
   is certified by this inspection. Do not launch Portal load on that host.
4. **PM integration gates remain real.** Current guide §3.1:
   P03 human trust pending; P04–P13 repositories tested isolated; P14 adapters
   unmounted/CLI library only; P15 fresh rehearsal not historical backfill;
   P16 `IN_PROGRESS_DEPENDENCIES_PENDING`. Read actual receipt headers:
   `contracts/baseline/portfolio-account-v1_1/pma11-15-rehearsal-evidence.json`
   (101 source +11 candidate SQL, fresh restore; not full campaign) and
   `pma11-16-four-probes-evidence.json` (4 isolated real-PG probes, TEST_ONLY
   authority, not full T16 acceptance). Do not add cumulative regression counts
   into new unique coverage or reuse these as Portal human trust proof.
5. **PM R2 semantics unchanged.** Guide §2.2, §5.1/5.2.1, §7.3.1/7.4:
   Portal identity versus TS effective business grants; backing + margin/risk
   budget + independent exposure cap, no universal1x; same-key receipt lookup;
   target/composite design already approved, not newly optionalized.
6. **Current Portal must be reused selectively.** Source inspected:
   `manager-lists.service.ts:343` retained reads bypass upstream refresh and
   missing imports refuse typed; normal path retains SWR/coalescing.
   `admin/owner-access.guard.ts:44` protects owner, not a proof of delegated
   manager administration. `governance.service.ts:659` retains R2 ADMIN plus
   scoped eligibility; do not blanket-remove safety guards to widen read rights.
   Edge `crates/edge-service/src/main.rs:576` still rejects
   `EDGE_COMMAND_RELAY_ENABLED=true`; a flag is not relay implementation.
7. **Claude changes are in the shared source.** Current governance consumer
   receipt in `research_loop/evidence/P22/GOVERNANCE_PORTAL_DECISION_CLAUDE_HANDOFF_2026-10-15.md`
   §5 records FE045788b1 landed; readonly preview evidence is for expired R1
   records and unknown R2/Live/Exit IDs, not positive integrated mutations.
   Preserve retained-mode guards and workspace navigation while designing V2.

## 4. Outcome and boundaries

Added guide entry point, scoped agent/Claude rules and Unified link; existing
five guides remain byte-identical. Only documentation checks are appropriate
for this package: file/link presence, diff whitespace, source hashes. No ELP2,
EPG10, UXM, mathematical, product, browser or load tests ran in this inspection.
No resources created to clean up. Rollback is removal/reversion of this
documentation-only addendum; it does not require a service or data rollback.

Documentation validation: `git diff --check` rc0;19 new-document/§14 local
links resolve; new-file trailing-whitespace scan reports0 errors; rehashed
all five supplied guides and confirmed the same hashes listed above.

Repository normal pre-commit invokes `verify-workspace.sh` with build/DB
work. This read/docs-only package does not expand into that workload: commit
gate remains PENDING, no hook bypass or remote push. ELP2-00/01 and UXM-00 are
next proposed assignments, not declared complete or runtime-approved.

## 5. Subsequent input arrival — planning addendum

After the inspection above, Bobby supplied feasibility review and both lowfi
images. They were fully read/viewed; hashes, source inspection at `be56efdf`
and planning outcomes are recorded in [planning receipt](PLAN_ALIGNMENT_2026-10-15.md).
The earlier missing-input finding is historical, not a current image/review
blocker. No numerical companion receipt/script was supplied or executed.
Unified §14 now has the linked phase index; implementation remains NOT_RUN.
