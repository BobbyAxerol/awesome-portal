# Group 6 — observed FPT fixed product vertical

2026-10-02; BE lane `codex/be-gaps`; landing `docs/research-loop-plan`.
Status: **SCOPED_VN_FIXED_PRODUCT_QUALIFICATION_PASS**, not full Research acceptance.

## Scope and implementation

Reuse the source/index proofs in [P08 packet](../P08/B8_VN_OBSERVED_INDEX_AND_PROFILE_PARITY_2026-10-02.md).
Three agents implement disjoint source/P08, child/P05 and Control/contract paths;
root integrates, owns the additive migration, actual receipt, cleanup and commit.
No frontend, :8095 mutation, remote push, production or engine/kernel change.

- New immutable profile `p10.vn-stock-daily-observed-fixed.v1`, SHA-256
  `acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e`.
  Installed QuantBT 1.1.1, FPT/1d only, `signal_notional`, fixed three windows,
  requested-spec **v1 only**, one trial and the unchanged immutable Delta AV.
- Exactly 300 observed predecessors; source-local dates are midnight
  `Asia/Ho_Chi_Minh` / previous-day 17:00 UTC. Weekend/holiday empty tails
  are accepted only inside the verified index bound, never by inferred cadence.
- Source-aware opt-in composition, Atlas qualification, signed S02 index
  estimates, P08 snapshot and cross-document provenance binding. Flag-only
  enablement without verified source/index does not advertise availability.
- Exact work/profile/adapter/source custody through repository, worker,
  bounded isolated child and immutable P05 fixed replay. Generic numerical
  Research account, **not** a VN venue/currency/session authorization.
- Search/Freeze/Replay admit the exact new pair; the WFO current-source lane
  returns `NOT_APPLICABLE`, not pending retention for a fixed run. Display label
  is `R-VN-###`. Old fixed/global/causal profiles and AV/seals remain unchanged.
- Migration 090 adds the single profile/digest pair to existing constraints;
  no old row, table or seal is rewritten.
- Independently demonstrated existing repository races receive two narrow
  fixes: workspace transaction lock on HEAVY claim; dispatch ACK requires the
  current job/worker fence. No auto-dispatch, retry timer or future execution.

## Honest failed-attempt record

Real owned :8096 qualification found five integration gaps that mocked tests
did not cover. The first two failed before creating or executing a run:

1. Private P08 returned 200 and validated, but Control's old safety guard
   accepted only `CLOSED_BARS_ONLY`: public preflight returned 502. Repaired
   with exact FPT/source/flag/clock/index/300-bar checks; non-VN keeps the old
   guard. Added complete preflight service/store/response regression.
2. Preflight then passed; repository's runtime producer allowlist omitted VN:
   create returned typed 400. Repaired with exact profile/digest **and** Delta
   adapter/digest; added direct repository-validator negatives, not just a
   mocked repository test.
3. First admitted VN run `rrun_835595af783d08293bdadfbaa1ae117e` completed
   its QuantBT child in about 8 seconds; its private journal was COMPLETED,
   mandatory artifacts SEALED, with no child failure. Control's separate
   private terminal split schema omitted `VN_OBSERVED_AFTER_FIXED_PROFILE`:
   relay acknowledged sequence 32 but refused final sequence 33. Its Control
   lease expired and the public run became FAILED. Repaired the private enum
   and profile-bound label check; preserve this failed run and journal, never
   rewrite the old fence or relabel it PASS. The NATS notification exception
   was secondary, not a child/source failure. Post-fix proof uses a distinct
   named qualification `b8-vn-fixed-ingress-20261002` with the same fixed input.
4. That second run `rrun_62c6ab5a2f1b27ea4c930f2d347b09b9` exposed another
   terminal validator error: **107 observed OOS equity bars / 152 UTC daily
   returns** are separate populations. The existing distribution definition
   already names the engine's UTC-calendar-day returns; the validator wrongly
   capped that population by raw-bar count. Removed only that invalid
   cross-population comparison, preserving separate 2M limits, monthly raw-bar
   equality, histogram sum/shape/bytes and source day/bounds checks. No source
   row, weekend return, analytics policy or old seal was changed. The actual
   full private terminal body and exact profile guard now validate on the
   compiled candidate. Preserve both prior failed qualifications; final proof
   uses `b8-vn-fixed-final-20261002`.
5. Third run `rrun_30fd0891ef6cb74c441646c6a367dd35` was source-COMPLETED,
   terminal sequence 33 accepted, mandatory P05 artifacts READY, Evidence
   and Split source/projection persisted. Report core creation still failed:
   Hub required calendar missing-bar/gap counts even for explicitly
   observed-only VN quality. Those counts are **unknown**, not zero.
   The public run remains FAILED/READY and its lease/error evidence is kept.
   The next candidate adds an explicit observed-tape quality scope to the
   coverage contract rather than fabricating exchange completeness; its
   product qualification must use a new run and label.

The final fix publishes `core.dataset_coverage.quality_scope` as
`OBSERVED_TAPE_INTEGRITY_ONLY` only from the strict accepted P08 observed
snapshot. Range, actual rows and columns are AVAILABLE; calendar counts stay
null. Existing crypto coverage constraints remain unchanged. The persisted
third-run Hub was checked entirely in-container: original schema FAIL,
candidate schema PASS. No failed row, receipt or worker fence was rewritten.

Cross-review also corrected the Python/Compose flag spelling, S02 selecting
the old crypto profile, false v2 advertisement and naive OOS UTC parsing.
These are concrete integration fixes, not changes to accepted UI or engine.
Private signed P08 diagnostic is retained at
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-vn-preflight-contract-diagnostic.json`.

## Focused tests

- Source/index/provider/P08/Atlas combined: 155/155; final flag regression
  lane 27/27. Earlier source-index final regression: 156 PASS / 1 opt-in SKIP.
- VN worker/fixed replay/private IS focused bundle: 60/60; corrected stale
  source-window mocks plus VN worker lane: 26/26. Full IS remains available;
  sampled IS remains typed absent. No source truth was weakened.
- Initial Control profile/work/read/custody/golden suite: 105/105; affected
  contracts 21/21. Exact old P04 work/request/run golden bytes unchanged.
- Complete preflight regression with old crypto and VN negatives: 27/27;
  migration constraints: 2/2. Real disposable PostgreSQL concurrency/fence
  proof: 3/3; its exact test container was removed without a volume.
- Real repository-validator regression and strict adapter/profile negatives:
  19/19. Private terminal ingress and profile-label isolation: 30/30.
- Actual 107/152-population distribution, forged-count/shape/grain/definition
  negatives and progress tests: 14/14; full captured terminal schema and
  profile guard PASS on compiled candidate (not a fixture-only claim).
- Observed-only Hub coverage and old crypto/absence negatives: 14/14;
  Evidence contract 4/4; official generated type and Control build PASS.
- Production Control build passed. Full legacy test-source typecheck has
  unrelated existing errors and is **not** reported green.
- The grouped mandatory commit gate covers the integrated proof, not one
  hook per agent or documentation hunk. Its first normal attempt caught a
  **test-package isolation defect**: Foundation's contract test imported
  Control source, unavailable in the contract-only container. The isolated
  suite had 232 passing tests but one failed suite, so the commit was refused.
  Keep canonical fixture/schema/type checks package-local; move actual
  admission/schema parity into the Control suite. No gate/mount weakening or
  hook bypass, and no product image/engine run repeats for this test-only fix.
  First failed log remains private at
  `/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-vn-product-commit-hook-20261002.log`.
  Packaging regression: contract suite 14/14, Control VN suite 20/20 PASS.
  Final normal retry log:
  `/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-vn-product-commit-hook-retry-20261002.log`.
  That retry passed contracts but correctly refused the stale DatasetIndex
  generated type: its imported final P08 observed-quality fields had not been
  regenerated. Official scoped generation twice is now byte-identical and
  `--check`/exact temp diff PASS; only the generated artifact changed, no
  pipeline/verifier weakening. Type SHA-256
  `89e54f406aef03076c81dfe64af50f21c12a124cb86c7b96bc8078577e4cf401`.
  Final normal integrated gate log:
  `/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-vn-product-commit-hook-final-20261002.log`.
  That attempt passed the contract/build stages but refused **six Control
  tests** (1,728 passed, one opt-in skipped): three fixture reads ignored the
  isolated cell's `PORTAL_CONTRACTS_DIR`, two expectations still counted four
  profiles, and malformed split ingress raised a TypeError. Consolidated
  repair honors the existing contracts mount, explicitly tests the fifth VN
  profile without dropping old assertions, and returns typed
  `RESEARCH_PROGRESS_INVALID` before persistence for null/empty/nested-missing
  split inputs. Four affected suites with the explicit contracts root:
  **67/67 PASS**. No mount/hook weakening, positive source semantics change,
  product image rebuild or another engine run.
  The final normal commit must return zero before landing; its consolidated
  log is
  `/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-vn-product-commit-hook-accepted-20261002.log`.

## Actual product proof and C4

Actual product run **`rrun_df77613b0f4ceb2dd069935f61ae75e2`** reached
**COMPLETED / READY** with named preflight/create/isolated child/retention.
No direct engine invocation or fixture substituted for the producer.

Initial product qualification:

```bash
node scripts/research-p23/vn-fixed-product-receipt.mjs \
  --home=/home/bobby/.local/state/portal-research-p23/20260927/runtime \
  --label=b8-vn-fixed-accepted-20261002
```

After the successful run, one **receipt-only** assertion incorrectly compared
the complete P08 query object (which also contains ISO labels) with the Hub's
two-field UTC-ms range. Corrected the assertion to compare the same two UTC-ms
fields. The original failed receipt remains retained. Infrastructure refused
a same-label retry; the safer explicit read-only resume below is guarded by a
prior COMPLETED/READY producer, exact immutable input and a **different proof
label**. It cannot install, preflight, create or execute another run.

```bash
node scripts/research-p23/vn-fixed-product-receipt.mjs \
  --home=/home/bobby/.local/state/portal-research-p23/20260927/runtime \
  --label=b8-vn-fixed-read-proof-20261002 \
  --resume-run-label=b8-vn-fixed-accepted-20261002
```

This actual final receipt PASS validates:

- S02 declaration estimates and immutable 1d/300-bar AV declaration;
  exact seven-field provenance plus source tuple in the ten-field work input;
  independent canonical work SHA-256.
- Hub, Report, Split, Search, Freeze and Replay: **6/6 HTTP 200**;
  Hub/Report enrichment agrees; observed coverage stays labelled with null
  gap counts. WFO retained-read lane is HTTP 200 **NOT_APPLICABLE** for fixed,
  never PENDING_RETENTION or a fabricated optimizer study.
- **107 OOS rows / 7 opaque pages**, requested 17-row limit, strictly ordered
  native FPT positions, invariant revision and exact admitted half-open range.
- Independent installed HMD 0.1.0rc3 reader: **568 snapshot rows = 300 actual
  predecessor bars + 268 analysis bars**, 28 bounded queries, every OHLCV and
  timestamp matches snapshot and retained Replay exactly. The wider source
  index's 661 observations are not confused with this run's 568-row tape.
- Wrong symbol VIC and wrong source-midnight clock: both actual typed
  **409 RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED**, no admitted run.

Actual images:

- Control `sha256:b3b5391a819b1a93b6b729628253a376c1c58b6152f0596bc26a8dd290e23c8d`.
- Portal API/worker `sha256:66cfd8cfd20f1a8fa156984ed1aad56f321dae0cedcb552b2c89fdb28a31b100`.

Source manifest `f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`;
snapshot byte SHA-256 `9312b415fde987178a78c84268565df08faaaf2ec9aa25c45ad5af4f9e2727dd`;
work SHA-256 `f0df5b25b4d620c37c6f5d1ff9922eba11e9b3b58e007edcfdec617f1f35e1a0`.
Retained replay Parquet: 5,277 bytes, SHA-256
`e279952c4dc83f89f0bc2829428fca0378b3f04b8565fa608393cd506aa860f1`;
companion manifest digest `c3da4a8e766882e43d0c44b55a5613385db9a06e27012c87afaf6bb4dd30d230`.
Exact declared IS 2025-04-01→2025-08-01, OOS 2025-08-01→2026-01-01,
holdout 2026-01-01→2026-05-01, all midnight `+07:00`; holdout results remain
sealed, not browsable merely because the snapshot contains source bars.

Final private receipt (0600, raw source rows never Git):
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-vn-fixed-read-proof-20261002-product-receipt.json`;
file-byte SHA-256
`72e6dc146035ad0ce6827710dea77c94d46b3ac84cf5d739dd052e5e811267ed`.
Read proof 19:06:56.941–19:07:03.109 UTC. The script's console hash is
canonical receipt serialization, **not** this file-byte hash.

C4: both owned VN flags restored false; test-session logout PASS;
0 ACTIVE test sessions, no nonterminal jobs; 21 test users remain DISABLED,
one owner anchor retained. Stop only `portal-research-p23-ol12` without
`--volumes`. Preserve source/index/DB/artifacts/receipts/backups, all original
rollback images and seven exact current image tags. No broad prune, shared
preview restart or frontend rebuild. Teardown confirmed 0 owned containers;
root free space 207,521,882,112 bytes, 69% used, NO_ACTION_NEEDED beyond the
completed exact teardown. Private cleanup receipt file-byte SHA-256
`e4bed0efad765b7eb689d3ae0a44148c38d15733b415b6716b6aec27999532a5`.

## Claude handoff

Regenerate/consume Foundation, DatasetIndex, Preflight, Evidence, Split, Search,
CurrentSource and FixedReplay generated types. Read profile five by exact
dataset/symbol/timeframe and `requested_spec_versions`, not first protocol match.
Use `OBSERVED_INDEXED_WARMUP_BARS_V1` and nullable observed-quality fields:
integrity PASS does **not** publish session/calendar completeness.
Hub `dataset_coverage.quality_scope` has the same distinction: null gap counts
are not zeros. This is an additive generated property, not an invented calendar.
Preserve `VN_OBSERVED_AFTER_FIXED_PROFILE`, source-local date labels and
`R-VN-###`; nominal 1d duration is not an exchange-session cadence claim.
Calendar, session-close, instrument precision/currency and optimizer study
absence remain typed; do not display null as zero or infer trading permission.
No browser qualification or frontend activation is claimed by this BE packet.
