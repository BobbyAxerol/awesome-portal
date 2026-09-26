# W7 · P21 composes a Delta WFO run from its retained lane — Claude, 2026-09-25/26

Status: **P21_RETAINED_LANE_DELIVERED · WFO_RUN_LOCALLY_SEALABLE (service + disposable PG) · PREVIEW_NOT_REBUILT (read-only) · S11_HANDOFF_ONLY (integrated P22/P23 screen owns rendering).**

Worktree `.claude/worktrees/agent-a05ec4910d0b4d949`, branch `worktree-agent-a05ec4910d0b4d949`, base
`origin/docs/research-loop-plan` @ `c66836bf`. Commits in §8; nothing pushed.

## 1. Problem (real preview, read-only, image rev c66836bf)

Run `rrun_e1fa9e5cae3bcef8f8e38311905a17d5` (sealed Delta signal-notional WFO). Screen 11 composed it from the
P04 hub lane: `3 COMPLETE · 0 DEGRADED · 2 INPUT · 7 MISSING`, `availability PARTIAL / P21_REFERENCED_SOURCE_INTEGRITY_FAILED`,
YAML `null` for final_audit_run_id, manifest_digest (P21_MANIFEST_IDENTITY_MISMATCH), parameter_bundle_digest,
evidence_revision. Root cause: the composer had one lane. For a WFO run the P13/P14/selection-record hubs never exist,
and the manifest check compared the preflight manifest (`run_producers`, 3966d997…) with the report v2 copy of the
retained manifest (b7125979…) — two different identities.

## 2. Read (file @ c66836bf)

W5c S11 record (`P21/W5C_S11_CLAUDE_2026-09-25.md`), W6a (`P18/W6A_P18_P20_CLAUDE_2026-09-25.md`, report v2 from the
retained lane), W3b (`RF-06/W3B_WFO_LANE_SCREENS_CLAUDE_2026-09-24.md`), W5a (`P16/W5A_A10_CLAUDE_2026-09-25.md`);
`release-candidate.service/repository/contract.ts`, `current-source.service/repository/payload.ts`,
`report.service.ts`, `report-core-v2.ts`, `freeze.service.ts`, `fold-ordering.ts`, `delta-wfo.profile.ts`, the P21
migration `1723680000055` and `research.release_candidates` (`selection_id` is nullable, so no migration is needed).

## 3. Design

- **Lane = the run's P10 execution profile** (`run_producers.execution_profile_id = p10.delta-signal-notional-wfo.v1`).
  Any other profile (P04 fixed, and the P16 what-if diagnostics) runs the unchanged P04 composer. The repository
  returns `wfo: null` for them; the source fingerprint gains `retained_lane` only when the lane is present, so a P04
  fingerprint (and every stored P04 draft fence) is byte-identical.
- **Retained facts, one REPEATABLE READ snapshot**: the newest RS-02 seal (adapter/profile pair, spec and dataset digests,
  table rows, summary), the SEALED `research.artifacts` row at the seal's revision naming the seal's manifest, its
  `artifact_parts` digests (at most 512), the batch receipts (import digest recomputed, never the stored copy), the FOLD
  rows (at most 256, W5b child audit), and the progress claim (state and hand-off params digest).
- **Each digest against its own authority**: dataset = run, P10 producer, seal, report v2; manifest = seal, sealed
  P05 artifact, report v2 (the preflight manifest is never compared); import = seal vs recomputed receipts; params =
  retained selection (P14 rule) vs hand-off cursor; seal spec digests vs run; profile digest vs the locked WFO profile;
  seal lane pair vs the profile's RS-02 pair. A disagreement is `P21_REFERENCED_SOURCE_INTEGRITY_FAILED`; an absence is
  MISSING with a retained-lane reason; a run whose retained source is still pending is MISSING
  `P21_RETAINED_CURRENT_SOURCE_NOT_SEALED`, not an integrity failure.
- Revisions are the ones Screens 04–08 serve: `currentSourceSealDigest` is exported from the current-source service and
  reused (`rs02_KIND_DIGEST`).
- Contract shape unchanged (no OpenAPI edit, no regeneration; `snapshot.py --check` 213 files). Two canonical compose
  fixtures are added under `packages/contracts/fixtures/` (not snapshot-tracked, like the W6a report fixtures).

## 4. Rows and lines — before, after (real run), source fact

| # | Row | Before (preview) | After (W7) | Digest / source fact |
|---|---|---|---|---|
| 1 | Alpha Version passport | COMPLETE | COMPLETE (unchanged path) | alpha code digest 34dc1847… |
| 2 | Engine/capability/backend | COMPLETE | COMPLETE (unchanged path) | adapter contract 9ade757b… + er_quantbt_111 |
| 3 | Dataset & universe snapshots | MISSING `P21_DATASET_BINDING_IDENTITY_MISMATCH` | COMPLETE | e6394a52… = run = P10 producer = retained seal = report v2; manifest b7125979… names the SEALED research_bundle |
| 4 | Methodology claim | MISSING `P21_METHODOLOGY_CLAIM_NOT_PUBLISHED` | **DEGRADED** `P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED` | digest of QuantBT claims (walk_forward_oos, not_causal_multi_fold_global_calibration, OOS used for selection) + claim state NOT_ISSUED + certificate NOT_PUBLISHED; the certification axis stays NOT_PUBLISHED |
| 5 | Selected params lineage | MISSING `P21_SELECTION_PARAMETER_BUNDLE_NOT_PUBLISHED` | COMPLETE | 6c836418… = sha256 of the retained selection (trial 0) parameters = progress hand-off cursor |
| 6 | Final audit replay | MISSING `P21_FINAL_AUDIT_RUN_NOT_PUBLISHED` | COMPLETE | retained replay (1056 bars, W5b ledger) + per-fold OOS generation child = frozen candidate 2671e27b… (2/2 MATCH, audit ordinals 10 and 11, equal to what S07 served) |
| 7 | Metrics semantics | MISSING `P21_METRICS_PROJECTION_NOT_COMPLETE` | COMPLETE | report v2 frozen core 5ec01107… sealed from rs02_evidence_3d5622f8… (registry research.current-source-metrics.v1) |
| 8 | Execution assumptions | COMPLETE | COMPLETE (unchanged path) | declared route + adapter |
| 9 | Robustness/param stability | MISSING `P21_EVIDENCE_REVISION_NOT_PUBLISHED` | DEGRADED `P21_SOURCE_DEGRADED_EVIDENCE` | retained seal digest 3d5622f8… (evidence/split/search revisions); no stability certificate |
| 10 | Known limitations | INPUT | INPUT | researcher declaration |
| 11 | Reproducibility checksums | MISSING `P21_REPRODUCIBILITY_CHECKSUMS_INCOMPLETE` | COMPLETE | retained import f40807a8… recomputed = sealed; manifest b7125979…; transform 5c226a94…; sealed P05 part digests |
| 12 | Proposed use restrictions | INPUT | INPUT | researcher declaration |

Counter 3·0·2·7 becomes 8·2·2·0. Availability PARTIAL becomes AVAILABLE. The seal gate
`P21_REFERENCED_SOURCE_INTEGRITY_FAILED` becomes `P21_RESEARCHER_DECLARATIONS_REQUIRED`, then `may_seal: true` once both
declarations are saved. YAML: final_audit_run_id / final_audit_attempt_id = the run / its attempt; manifest_digest =
b7125979… (retained); parameter_bundle_digest = 6c836418…; evidence_revision = rs02_evidence_3d5622f8…; only
release_candidate_id is `null` until the seal. Rail selected_params = 6c836418… with detail "retained trial 0 · global".
Seal pins: RUN, ALPHA_VERSION, REPORT, EVIDENCE (rs02_evidence_…), SPLIT (rs02_split_…), SELECTION (rs02_search_…, params
digest), CURRENT_SOURCE (import digest), ARTIFACT (sealed manifest); `release_candidates.selection_id` is NULL.

## 5. Proof the WFO run is locally sealable

The preview is read-only, so no seal was written to it. Two proofs instead:

1. **Service test over the run's real retained rows** (`research-w7-release-candidate-retained.spec.ts`, 6 tests): every
   identity is what the preview served (`research-w7-real-wfo-preview.fixture.json.gz`: compose, report v2 core,
   evidence/split/search/freeze reads, progress claim, P16 provenance); the seal summary and FOLD rows are the W5b
   real-HMD export, which, with this run's seal digests, reproduces its served rs02 revision exactly (asserted), so
   they are this run's retained rows. It composes 8·2·2·0 and seals SEALED_LOCAL · NOT_DELIVERED · NOT_APPROVED with the
   pins above; 10 disagreement cases each fail closed; pending retention, an issued certificate, a child-audit mismatch,
   a pre-W5b seal and a stale report are each typed. Stand-ins (named in the file): the artifact id (the run has exactly
   one SEALED research_bundle per its progress read), the run kind (not read by the lane), and the part list (the report
   serves the 4 single-part table digests; the 6 observation parts are pinned by the manifest only, so the note of the
   canonical fixture says "4 sealed P05 part digests" where the live run would count all 10).
2. **Disposable PostgreSQL** (`research-w7-release-candidate-migration.spec.ts`): seeds producer, seal, receipts,
   artifact, parts, FOLD rows, progress and report v2; reads through the real repository under
   `portal_research_runtime`, composes with no MISSING row, PATCHes the draft, seals, reads the pack, checks the 8 pins and
   `selection_id NULL`; then a receipt added behind the seal fails the next composition closed.

## 6. Tests (exact counts)

| Gate | Command | Result |
|---|---|---|
| P04 golden (written at c66836bf before any change) | `vitest run test/research-w7-release-candidate-p04-golden.spec.ts` | 1 passed; 12 variants byte-identical |
| Control API research suites on a disposable PostgreSQL 16 | `vitest run test/research-` with TEST_DATABASE_URL | **75 files passed, 1 skipped; 463 tests passed, 1 skipped** |
| of which W7 | retained spec, PG spec, golden | 6, 1, 1 passed |
| Control API compile | `tsc --noEmit -p tsconfig.build.json` | exit 0 |
| Hook on commit 19de188b | `.githooks/pre-commit` (verify-workspace) | exit 0; control-api 148 files / 1138 tests passed, 1 skipped; contracts 15 files / 188 tests |
| Contracts | `python3 tooling/snapshot.py --check` | 213 tracked files match (no contract change) |
| Frontend unit (before the revert) | `npx vitest run` | **191 files, 3638 passed, 3 skipped** (S11: 29 incl. U25/U26, since reverted) |
| Frontend build | `npm run build` | exit 0 |
| Real-API e2e through the Vite proxy to the preview :8095 (before the revert) | W7 and W5c S11 tests | **14 passed** |
| Real-API e2e, whole file | `playwright test -c playwright.research-preview.config.ts` | 50 passed, 4 failed: all four are `W6b S10 … lineage` ETag assertions (lineage, not touched here) |
| test_m0_freeze + test_compat_parity | pytest, host python | 18 passed, 1 failed (`test_environment_report_stable_subset_is_deterministic`: host package set; no Python changed) |
| Route / R2 ledgers | none | no route changed |

## 7. Screen 11 — what it must show for a WFO run (handoff onto the integrated P22/P23 S11)

Lead decision (2026-09-26): W7 stays on the P21 backend compose/seal path. The shared local branch integrates the
P22/P23 Screen 11 (new ReleaseCandidateDetail, client, mirror hook, tests), so the W7 frontend commit `8472a9b3` was
**reverted** on this branch (commit in §8) and nothing here edits Screen 11. What the integrated screen must render for
the WFO run is fixed by the server and published as two canonical bodies:

- `packages/contracts/fixtures/research-release-candidate.wfo-retained.valid.json` (virtual draft)
- `packages/contracts/fixtures/research-release-candidate.wfo-retained-declared.valid.json` (both declarations saved)

**Pack (12 rows, server order):** 1 COMPLETE · 2 COMPLETE · 3 COMPLETE · 4 **DEGRADED** reason
`P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED` · 5 COMPLETE · 6 COMPLETE · 7 COMPLETE · 8 COMPLETE · 9 DEGRADED reason
`P21_SOURCE_DEGRADED_EVIDENCE` · 10 INPUT · 11 COMPLETE · 12 INPUT. Counter "8 COMPLETE · 2 DEGRADED · 2 INPUT · 0 MISSING".
Row digests (whole, sha256): 3 e6394a52…, 4 cab7dce3…, 5 6c836418…, 6 38f2bed5…, 7 5ec01107…, 9 3d5622f8…, 11 f40807a8….
Row 4's note quotes the claim and its ceiling (walk_forward_oos; not_causal_multi_fold_global_calibration; OOS used for
selection: true; release claim NOT_ISSUED; no certificate).

**YAML (17 lines):** release_candidate_id `null # P21_ASSIGNED_ON_LOCAL_SEAL` (gold); every other line AVAILABLE/ink:
final_audit_run_id = the run, final_audit_attempt_id = its attempt, manifest_digest b71259790d93… (retained, NOT the
preflight 3966d997…), parameter_bundle_digest 6c8364189d72…, evidence_revision rs02_evidence_3d5622f8…,
report_revision p18r1_5ec01107…, dataset e6394a52…, transform 5c226a94…, plus the unchanged alpha/spec/engine/adapter lines.

**Elsewhere:** availability AVAILABLE (no partial panel); rail selected_params = 6c8364189d72… detail
"retained trial 0 · global" (ink); certification axis methodology_claim stays NOT_PUBLISHED
`P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED`; source_absences.methodology_claim = PARTIAL
`P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED`; seal blocked `P21_RESEARCHER_DECLARATIONS_REQUIRED` (virtual) and
`may_seal: true` (declared); publish `P22_PUBLICATION_NOT_COMMISSIONED` from P21 (P22 owns its own gate).

**New reason codes the screen may meet** (sentence suggestions, code shown beside):
`P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED` "claim retained, no issued methodology certificate — travels as DEGRADED";
`P21_RETAINED_CURRENT_SOURCE_NOT_SEALED` "the run's retained current source is not sealed yet";
`P21_RETAINED_CLAIM_FACTS_NOT_PUBLISHED`; `P21_RETAINED_CHILD_AUDIT_MISMATCH`; `P21_RETAINED_PARAMETER_DIGEST_MISMATCH`;
`P21_RETAINED_REPORT_NOT_SEALED`.

**Layout finding for the integrated screen:** in the W5c S11 at 660px, the row-4 note's unbroken token
`not_causal_multi_fold_global_calibration` was clipped in its ~192px note cell (DOM read). The integrated S11 should let
note text wrap (`overflow-wrap: break-word`) or verify it does.

**Real-API check done before the revert** (Vite dev proxy to the read-only preview :8095, Origin
research-portal.primusspark.com, W5c screen): W7 and W5c S11 e2e 14 passed at 1440/660 for the P04 and WFO runs,
row status, whole digest and reason code equal to the API; the W7 composition INJECTED for the WFO run rendered
8·2·2·0, overflow 0, axe serious/critical 0 (receipts `~/.config/portal-research-preview/receipts/W7-S11-*`).
**Screenshots were not looked at by eye**: the image viewer hook timed out and the final attempt was declined; the page
was checked by reading its rendered DOM instead. These e2e additions were reverted with `8472a9b3` and should be
re-applied onto the integrated S11's selectors.

## 8. Commits

| Commit | Subject | Shortstat |
|---|---|---|
| `0cf1b8a2` | test(research): W7 freeze the P21 P04 lane as a byte-for-byte golden | 2 files, +159 |
| `19de188b` | feat(research): P21 composes a Delta WFO run from its retained current-source lane | 10 files, +2465 −11 |
| `8472a9b3` | feat(research): Screen 11 reads the retained-lane composition row by row | 4 files, +162 −2 (reverted) |
| `eef9ef05` | docs(research): W7 P21 retained-lane record | 1 file, +140 |
| (this) | Revert 8472a9b3; this record states the S11 handoff | see git |

Net W7 change: backend compose/seal path + its tests + two contract fixtures + this record. No frontend file differs
from `c66836bf`.

## 9. Unfinished and why

- **Screen 11 for WFO runs**: not implemented here by decision (§7); to be applied onto the integrated P22/P23 S11,
  which should load the two canonical fixtures in its unit tests and re-add the row-by-row real-API assertion.
- **Preview not rebuilt** (read-only for this lane): the live preview still answers 3·0·2·7 for the WFO run; after a
  rebuild of this branch it composes 8·2·2·0. No real seal was written.
- **Methodology certificate** stays NOT_ISSUED: QuantBT issues none for this run; the row is DEGRADED, not COMPLETE.
- **Screenshots not opened by eye** (§7).
- The W6b S10 ETag real-API failures (4) are lineage, outside this change.

## 10. Rollback

Revert per commit. Reverting `19de188b` returns WFO runs to the single P04 lane (7 MISSING); P04 is unaffected either
way (the golden). No migration, no data change, no flag change.
