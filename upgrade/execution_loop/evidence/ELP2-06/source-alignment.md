# ELP2-06 — source alignment and projection feasibility

Observation window: **2026-10-16 06:40:01–06:41:53 UTC**, read-only SSH to
`bobby@16.163.212.33` / `ip-172-31-16-126`. Local integration entry:
`docs/research-loop-plan@c4109ef350a58c1ae3840d9c3f4c2110b312a079`.
This subtask owns only this file. No remote edits, tests/builds, business DB
queries, source API requests, credentials, service/runtime inspection or load
were performed. Parallel observations are not an atomic source/runtime pin.

## Current source worktrees

| Track / path under `/home/bobby/.worktrees/` | Branch | Full source SHA | State at observation |
| --- | --- | --- | --- |
| TS `trading-system-next-upgrade` | `feat/v2-rust-first-okx-demo` | `ebc1252555d4fc7b986ced902ac67b1eba17077f` | Five modified market-data-writer Rust/test files; one untracked PM guide copy |
| PM `trading-system-pm-v1_1` | `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763` | Clean |
| DL `data-layer-p184-closure` | `fix/p184-dl-closure` | `7e40264ece699d886294dc9b3cdb6d5a06b22e09` | Modified `scripts/p184_g12_coordinator_load.py`; no untracked paths |
| Edge `portal-execution-edge-upgrade-v1_2` | `feat/execution-edge-upgrade-v1_2` | `0cfa510f1518c867a1fa261527dc5d4f0e7858de` | Active EPG10-06 source work; twelve modified files and two untracked dedicated tests |

SHA256 methods: unstaged=`git diff --no-ext-diff`; staged=`git diff --cached
--no-ext-diff`; untracked paths=`git ls-files --others --exclude-standard`
(Git's ordinary quoted path output, including newline). Empty output digest is
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
All four staged diffs were empty.

| Track | Unstaged diff SHA256 | Untracked-path-list SHA256 |
| --- | --- | --- |
| TS | `6b527d7852bec9097da8c0a245c84c92e572c4856734c1db9dfd60875de90416` | `b5b9433a17437c5e4c2525c2e29d67e64e957ce91ef34b94f56ad0a17f7eaae2` |
| PM | empty digest above | empty digest above |
| DL | `e4ca70671d4261dfe7a8baa8becaade4d3a1a6eaff0fe6dab09c2200014faee8` | empty digest above |
| Edge | `79add7005eec25b647592ea7999dfc34aa8e38c8a658cfd928f687a56293cfd2` | `2bfe1ae3a547c2f1ef92a1dbc40db5d06ddd5bd0d906052b490018b5db80096b` |

TS dirty paths: `rust/crates/market-data-writer/src/{health,native_io,session,
telemetry}.rs` and `rust/crates/market-data-writer/tests/session.rs`. Its
untracked `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`
has content hash `1ac56bff4e5728650cdb91df0544a8f3e17c5103d56ad49d3549f4b7e864b6e3`;
it is **not** the authoritative PM R2 guide.

Edge dirty paths: `scripts/epg10-04/{run,test_run}.py`, Rust `Cargo.lock`,
`crates/edge-service/src/manager_projection_command.rs`,
`crates/manager-projection/src/lib.rs`,
`crates/projection-store-pg/src/{bootstrap,lib,manager_projection,scoped_read}.rs`,
`crates/projection-store-pg/tests/epg10_05_scoped_read.rs`,
`crates/query-api/Cargo.toml`, and its Execution backend journal. Rust crate
paths above are under `services/portal-execution-edge-rs/`.
Untracked source tests there are
`crates/projection-store-pg/tests/epg10_06_manager.rs`
(`64a7db315f8a9f7ac2f2b7d5d198e0f1e94536fc6ee40ec9637d9f5c40967eff`)
and `epg10_06_resources.rs`
(`f99a8bb64a123d59ee44be0ff84d94a25b0310a2b971f87575702817db482579`).
These peer WIP files are preserved, not imported or qualified by this packet.

## Authoritative guide / journal pins

Paths are relative to the respective worktree above. Journal hashes represent
the observed bytes, not a claim that their reported operational results were
directly reverified.

| Source artifact | SHA256 |
| --- | --- |
| PM `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md` | `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945` |
| PM `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `96ee825d90a33f3cab614b8c7053408fc34b6ae965db867e6efc33ef769735fd` |
| TS `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `75d9c80350050dcaa9e2efc999029d25dea98c3c3762dc00eeff8a3a80708e79` |
| DL `DATA_LAYER_UNIFIED_IMPLEMENTATION_PLAN.md` | `3d81507ac6e8511ef5bec554fed89c8b57e9b8f05c5a775dda4b63f22c4efa4c` |
| Edge `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` | `ed13d074facf723e104c53a5ad192c510c773612091849ab6cacb5fc1627773b` |

PM guide remains **OWNER_APPROVED_DESIGN_R2**, unchanged from05. Its root →
portfolio → deployment/internal-account semantics and separate margin/risk
requirement, economic backing and exposure cap remain binding. No new `book_id`
entity, universal 1× cap, or allocation-as-custody-balance inference is allowed.

## Deltas and valid reuse of ELP2-05

[ELP2-05 source alignment](../ELP2-05/source-alignment.md) is historical input.
The three imported catalogue bytes were independently rehashed and remain exact:

| Edge contract under `services/portal-execution-edge-rs/contracts/execution-catalogue-v1/` | SHA256 |
| --- | --- |
| `registry.json` | `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67` |
| `field-dictionary.json` | `aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e` |
| `metric-dependencies.json` | `9c945880e821ecec4b5f56f85c5de15d506817cb07984300b824b4f5390c5a31` |

Consequently05's static39-family +3-view inventory,31field declarations,
formula-approved/runtime-config-pending distinction and all42new exports
unavailable still apply. Their embedded older source pins are not rewritten to
today's heads. Current Manager reads retain separate authority and **CURRENT_ONLY**
semantics; no new full history, event transport or numeric score is activated.

TS `git diff --name-only c2035b41700c27ce810406a59dffeb259c621ea0..HEAD`
lists market-health/session/apparatus/preregistration and journal changes, not
Manager/economic/PM publication code. DL advances its isolated load apparatus.
These changes require a fresh capacity/coexistence window if that gate is later
assigned; they do not supply missing financial publication evidence.

**New Edge delta:** EPG10-05 is now committed at `0cfa510f...`, not merely the
dirty draft observed during05. Its checked-in receipt reports191distinct
isolated automated PASS, with eight formal families mapped to those tests (not
eight more tests). Classification remains
`TEST_ONLY_SYNTHETIC_REAL_POSTGRESQL`, `runtime_activation:false`,
`source_requests:0`, and connected exit **NOT_MET_SOURCE_CONNECTED_DEPENDENCIES**.
This packet reads that receipt; it does not rerun or count its tests as Portal06
acceptance.

Edge artifact paths under `upgrade/evidence/execution-edge-v1_2/`:

| Artifact | SHA256 / disposition |
| --- | --- |
| `EPG10-03/verification.json` | `d6e8896e282116a87892ef329eba2a8bf2abe2bc02495db59d2dba2ca3ce99eb`; unchanged, source publisher-generation fence absent |
| `EPG10-04/verification.json` | `285cf529b1003f2bdec68e5f94c454a0c1e7ffc08595eea1ce8469427705a875`; unchanged isolated synthetic-input proof, connected exit not met |
| `EPG10-05/verification.json` | `3d70d03131299a932aa6af1c5c11cbc23d326b6d44ec40c93682e99f217a9697` |
| `EPG10-05/pg-receipt.json` | `2c06ce2dfbe0fc881ef57225ac5f4acbe83218f7cb0c7e35127d1c9579f24476` |
| `EPG10-05/QUERY_HISTORY_FANOUT_CONTRACT_AND_ACCEPTANCE.md` | `d155957bc73ed90f80bff5b9a3e948a9b26a302cb4ceb731782b020515497379` |

Source-dark scoped reads are bounded to200rows/1MiB; notification is
`NOTIFICATION_ONLY`, not broker/event replay. No new HTTP route is mounted by
that source delivery. EPG10-03's stale publisher counterexample still blocks
source-connected authoritative tail; partial/current snapshots cannot repair it.

**Active Edge06 journal §23.15:** the peer is fixing Manager content recurrence
A→B→A reusing a historical receipt/ingestion ID while current state is B before
claiming hot-path optimization. Source changes are still dirty. Do not assume
that path's idempotency/replay/correction acceptance from prior no-op tests;
repin its final receipt before integration. Its resource-envelope work is not a
Portal production budget or a reason to create another scheduler/source scan.

Journal §23.15 reports a foreign HK measurement lock through08:05:27Z;
the older05 source-runtime manifest reports a different earlier lock through
08:30:30Z. Neither is asserted as a directly observed current lock in this
source-only subtask. No load/build/DB/runtime probe was attempted, so no foreign
window was consumed or lock bypassed.

## Selected Manager publication: historical proof only

Under Edge `services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/`:

- `owner-publication/manager-v2-private-paper-publication.json` remains
  `2be9b46313e71f282891d88d0afca1eed2bf6c5df49f1fe8b610f6350d215da4`.
  It declares historical private Paper qualification, profile
  `PAPER_BINANCE_USDM`, five GET operations,200rows/1MiB, TLS1.3/mTLS and
  certificate-bound delegated JWT. Not new family history or Live authority.
- `owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json` remains
  `281f2b73094e423bd888e3562e861cab07137f4878c43fd62d7ce43abb565c60`:
  owner loopback qualified/cleaned up, `portal_reachable:false`.
- Actual deployed image, applied schema, effective profile, current TLS/trust,
  source API responses and live source population are **NOT_OBSERVED** here.
  Those historical receipts cannot close Portal06 real-source→projection→API.

## Source → projection feasibility / T06 impact

Source files below were read directly; no business rows were queried. These are
candidate source components, **not published per-family coverage proofs**.

| Input / source locator | Usable semantics / limit | T06 impact |
| --- | --- | --- |
| TS `services/performance/repository.py:518–580` | Portfolio/currency projection joins latest deployment/currency equity snapshots; candidate equity/PnL/cash/fees/funding/notional fields. Latest-row projection alone does not certify full-window cadence, exact ownership partition or complete NAV/return path. Do not sum physical custody with internal accounts. |01–04/08/11/13/18 need unique source/account ownership and authorized scope before reduction |
| PM `services/portfolio_management/operator_reports_contract.py:34–201` | Account rows carry source ID, source leaves, account/deployment/strategy, original/current owner, deploy actor, physical ref, currency/basis/cut/quality. Aggregator deduplicates by source ID and rejects overlapping leaves/conflicts; same cut/currency/basis/environment required. Missing census/valuation makes economics null/partial. Controls keep budget/risk/backing/exposure independent. |01–04/08/11/13; no full root total from an incomplete/restricted slice |
| PM same file:313–379 | FUND/RETURN_CAPITAL are economic flows; TOP_UP/DECREASE/RECALL_APPLIED are budget dimensions. Corrections use canonical fact revisions and effective/recorded cutoffs. Internal elimination requires exact paired source fact/time/amount, not equal amounts alone. Statement explicitly is not current NAV/budget. |05/06/18; sum equal distinct amounts, eliminate only proven internal pairs |
| PM `services/portfolio_management/durable_economics_contract.py:31–86,266–285` | Identity `(SourceScope,canonical_fact_id,revision)` and explicit supersedes/original attribution; source scope includes continuity. Delta contract binds partition/generation/schema/redaction; fixture return `APPLY_NEXT_ATOMICALLY` does not implement a durable DB transaction itself. |06/07/08/12/20; real projection+checkpoint transaction and connected source proof still required |
| TS `services/performance/repository.py:844–893`, `domain/economic_facts.py`; `init-db/05-trading-core-v2.sql` | Candidate fills/commission/funding and instrument metadata. Missing rows are not proof of zero applicable costs, no fills or complete interval notional. Instrument multiplier/FX/dedup/cost-coverage evidence remains necessary. |19; no stress return or score from point equity/assumed zero cost |
| TS `services/portal_execution_owner/manager_facade.py:131–135,600,740,962` | Explicit-zone RFC3339 source/record timestamps include Python microseconds; preserve raw source precision and derive public UTCms explicitly. Query clock is not event commit ordering or economic valuation cutoff. |06/08/10/20; do not relabel observation/projection time as source coverage |

PM report advanced return/Sharpe/drawdown still explicitly return
`UNAVAILABLE_METHOD_NOT_CERTIFIED`. Direct Portfolio/root score can be calculated
only from its own qualified consolidated economic path/config; it must not wait
on a Research run or all child raw-q scores. Conversely missing own NAV/cost/
flow/stress/continuity proof cannot be replaced with a weighted child score.
T06-14…20 may be implemented and tested against declared synthetic fixtures
without implying numeric production calibration or real financial certification.

### Economic source file pins

| Worktree / relative path | SHA256 |
| --- | --- |
| TS `services/portal_execution_owner/manager_facade.py` | `244315bf26c71ef74a131cac727f1d7d30e09ed25aa634f0f894f2de32a0d628` |
| TS `services/performance/repository.py` | `cb2bfa9a011097cb31c4d96562cbb871a49c9a78220d7323455747bc0e4d198a` |
| TS `services/performance/native_owner.py` | `2c1421f5973415d8a2b0ed0f17f442d7dafddff1a541c591eb3ccbef69d4441e` |
| TS `domain/economic_facts.py` | `9931d89c3adaddbec026f142fb7ff7681f354d1320dc23ba46d9e50a4e488b64` |
| TS `init-db/10-performance.sql` | `0af25755d11cfe4c976bad61ac92812342bf1ec737b6a2fc464ebeadf241f9e3` |
| TS `init-db/19-performance-pnl-ops.sql` | `4a066f8cd7887a3c3ab1606ab53d07f627731cc0010b9c4c1a884e43e461733f` |
| TS `init-db/05-trading-core-v2.sql` | `0788a9766623f39c5fcc1be2f1abdf864fbc33c7323e20777710bcbd6fd719f7` |
| PM `services/portfolio_management/operator_reports_contract.py` | `c034aa78dd1ef1d7b94710ed52dad62ca1584e33ed3155a75e5fcb730d721626` |
| PM `services/portfolio_management/durable_economics_contract.py` | `bb2a4d0b62ac8e12b5459b4d18f986caf9f9b51382d19c3392747c4e7797f88b` |
| PM `services/portfolio_management/binding_repository.py` | `f1c8eef0a73b43aecc38cc9e4ba63cf304043c63b517bee0cdff0aff903ca48a` |
| PM `services/portfolio_management/instance_repository.py` | `16fac06f8253c84e7a67729bd245681f7d5717744853bd440f87e080fb936f74` |

## Return / remaining dependencies

SOURCE_CONFIRMED: exact current worktree/guide/registry/source pins above.
HISTORICAL_EVIDENCE: Manager private Paper and external isolated03/04/05 receipts.
RUNTIME_VERIFIED: **none in this subtask**. Tests run: **none**; no duplicate
gate run or capacity claim. Resources created: none; cleanup `NO_ACTION_NEEDED`.

Reuse existing canonical request IDs from05/04/00 for source writer fence,
selected-family publication, current field/privacy/trust and production config;
do not mint duplicate debt merely because the Portal phase advanced. The newly
observed Edge recurrence issue is peer-owned active06 work, not an inferred
Portal defect. Primary can proceed with bounded local read-model/atomic-DB/
score fixtures, keeping real source tie-out, accepted economic field matrix,
runtime calibration and consumer/browser acceptance separate. No frontend,
ELP2-07, source activation, push, merge or release follows from this audit.
