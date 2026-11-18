# PAPER T1 release package: 13 census-v2 relations on top of the live T2-five release (DRAFT, NOT APPROVED, NOTHING APPLIED)

Written 2026-11-16, offline. Nothing was started, stopped, recreated, built or written on the host (no `/home/bobby/secure`, no
`/home/bobby/.local/state` writes). Facts marked (checked) were read today; "(not checked)" was not. Package files are committed on
branch `feat/edge-from-running-source-20261116` under `scripts/epg10-08/t1-release/` (script, two overrides, `artifacts/`).

## 0. Read this first: the release is 67 relations, not 62

The request said 62 = the 49 v1 relations + the 13 T1 census-v2 relations. That set exists and is internally right (49 + 13 = 62), but
it is NOT a successor of what runs today. The live release is the T2-five release with 54 relations (checked: `t2-paper-20261116/manager-catalogue-release.json`,
sha256 `5508c5d0...`), which is the 49 plus `strategies`, `alphas`, `traders`, `portfolio_equity_snapshots`,
`portfolio_audit_current_state`. A 62-relation release would REMOVE those five relations from the Paper surface (Core's registry already
serves them) while adding 13 new ones. Checked with the committed fixtures: `T1 (62) minus T2 (54)` is the 13 T1 relations and
`T2 minus T1` is exactly the five (test `a_62_relation_listing_..._drops_the_t2_five`).

So this package prepares the superset, **67 = 54 live + 13 T1**. The 62 variant is documented below as an alternative only; the real
tool can no longer produce it (section 2) and it is not recommended. If the owner really wants 62, say so and I regenerate; the
runbook mechanics are identical.

## 1. The sets and their hashes (sha256 of file bytes; seal = `catalogue_sha256`)

| set | relations | returnable / denied cols | seal | catalogue | serving policy | profile selection | release file |
|---|---|---|---|---|---|---|---|
| live T2-five (control) | 54 | 907 / 0 | `df2c12facd8d37dd30a134b157703494340fd8a434d4e1ebffe137f1ff817108` | `9021084d...` | `0e3efe91...` | `e0470315...` | `5508c5d0...` |
| **T1 + T2-five (recommended)** | **67** | **1105 / 12** | `4f38c58fed81c7600aea3d5c57dbca64443fc6b47c8ffa54d60296d7cd83c811` | `0e34dc5214ecefaaa5416f4cd33710f1730eb1dbf8a420bdf5b0c6a4691d3c2e` | `272e32f1b352a7a1edfa4e6a3c64ec8ff184cdfb2907c495fd5e531292495509` | `fd8d62529fcf1a75e9137e3499216c9c95b08935ac6f20bb2aa731253675a8cc` | `57d52f66d06f098769da43114fcd036045524c1482559ccb4c86089bfba5e5cc` |
| alternative T1 only | 62 | 1057 / 12 | `7e01d4183ac2ddea563895113916a7218de08995e731b250e1031fd1524949af` | `66d94f241490823f8f242e083b2e069dc78c15d7af4984b2deb1be0bf6da813d` | `3c047a05...` (drafts `catalogue-max/t1/paper-binance/t1`) | `4648f875feda...` | `77144dcca82658ff391b8fefc2c516313d30b828164754000ce450e9ab9d35a1` |

(the control row's full hashes: seal as shown; catalogue `9021084d5ac7030cc7bba286ae7ef886990318a0c8e06c9f6ca22364ce7db178`, policy
`0e3efe9157e11c113b230127e7d1d5c25333719fcc2c004b7d7c0de8f9f2d38a`, profile `e0470315b953e4e2f32128f30910b569ee815647966622d21d323ea1a56ac93a`.)

The 13 added relations (equal to the census-v2 `T1_RELATIONS`, test-enforced): `alpha_deadman_heartbeats`, `command_transport_bindings`,
`conditional_order_group_native_parents`, `economic_account_cash_balances`, `economic_account_fact_census`, `economic_account_scope_heads`,
`economic_facts`, `economic_performance_projections_v2`, `economic_reconciliation_cases`, `economic_tie_out_reports`,
`execution_algorithm_parents`, `risk_pool_state_projections`, `source_change_journal`. All 13 are TABLEs with a PRIMARY KEY, profile
columns `mode` + `venue`. 12 columns are denied (`SECRET_CELL_EXCLUDED`), all `jsonb`, in 9 of the 13 relations (`parent_payload`, `reducer_context`,
`fact_input`, `projection`, `expected_state`, `proposal`, `report`, `request`, `state`, `payload`). Policy `index_origin`: 9 relations
`ADDITIVE_MIGRATION` (need the read index), 4 `EXISTING` (`command_transport_bindings`, `economic_account_cash_balances`,
`economic_account_fact_census`, `economic_account_scope_heads`).

Not included, on purpose (T1 review): `private_event_inbox`, `private_order_child_links`, `private_order_spawned_algo_links` (their `environment`
marker column is the provider environment, not the profile's, so the Manager's profile filter would be wrong), `source_change_publication_paper_replay_v1`
(a view without key and with a `pg_lsn` column the value encoder does not know). The three SOURCE_IDENTITY_SCOPE_GAP relations
(`dnse_trading_tokens`, `venue_credentials`, `engine_authority_decisions`) are NOT in any release file (checked in the live 54 and the 67; test-enforced).
They are inside the v1/v2 census, so the Edge authority would accept them if a release file listed them: only the release file keeps them out.

## 2. Real-tool confirmation (not the Python replica)

Tool: `target_catalogue_candidate` built in `rust:1.85.1-slim-bookworm` from `edge-rust-catalogue-confirm-20261116` HEAD `e035cfee` (clean worktree, read-only mount,
`cargo build --release --locked --offline`, binary sha256 `a98ba90864a36b3a9c9270bff9312810aa383ebafa7e29cd63697959eb40235c`; 91 unit tests of the crate pass in the same run).
Input assembly is my script `catalogue-max/rust_t1_package.py` (the tool itself is unchanged); outputs compared byte for byte with the replica.
- Control, T2-five (54): the tool's catalogue, policy, profile and release are byte-identical to the live staged files (`9021084d...`, `0e3efe91...`, `e0470315...`, `5508c5d0...`). This proves the tool and the assembly reproduce what runs today.
- **T1 + T2-five (67): tool output byte-identical to the replica for catalogue, policy, profile and release** (hashes in section 1). Status `PARTIAL_CANDIDATE_NOT_INSTALLED`, `requires_s1_m0_adapter: true` (same as T2). Existing outputs were NOT reusable for 67 (it is a new set); the T2 and 62-set outputs were reused as controls.
- T1 only (62): the NEW tool (`e035cfee`) REFUSES the input (`prepare: InvalidSource`), because that revision selects the five T2 references and the 62 input leaves them as stubs. The OLDER tool build (`a299441e`, the first real-tool run) produced the 62 set byte-identical to the replica (catalogue `66d94f24...`, policy `3c047a05...`, profile `4648f875...`). So 62 is reproducible only with the old build. Another reason not to use it.

Files in `scripts/epg10-08/t1-release/artifacts/`: `relation-catalogue.json`, `serving-policy.json`, `profile-selection.json`, `manager-catalogue-release.json` (the 67 set, bytes as the tool wrote them) and `t2-live-manager-catalogue-release.json` (a copy of the live 54 release, for the test). They contain schema metadata only (names, types, keys, owner `bobby`), no rows, no credentials; the repo already commits the installed 49 tuple the same way.

## 3. Does the Edge accept it? (image `167e031a`, source `3055572e`, census v2)

Checked on the host (read-only): the Paper Edge `portal-execution-edge-execution-edge-1` runs image `sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054`, label revision
`3055572e...`, healthy, `EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS=0`, release env = the T2 release (`5508c5d0...`), no `EDGE_MANAGER_SOURCE_DB_PIN_*`. The top binary layer
(sha256 `ef540b6a02da781feb5f9411f83fbb899c603d4fcff587eb147d3aab8ad7cf5c`) contains the census v2 digest `cab031d8...`, the strings `manager-surface-census.v2`, `economic_facts`,
`source_change_journal` and the guard/memo variable names (strings only); the old binary layer underneath is the previous image's.

Tests added on this branch (`manager-compat-authority/src/tests.rs`, both read the REAL release files with `include_bytes!`, the same bytes the Edge loads):
1. `the_real_paper_t2_and_t1_release_files_are_accepted_by_the_census_v2_loader`: `from_pinned_release` accepts both; counts 54 and 67; the 67 keeps all 54 and adds exactly the 13 T1; none of the three gap relations is listed; a Manager catalogue with exactly the 67 relations validates against the release digest, one relation short is `CatalogueDrift`; a page request is built for each of the 13 T1 relations and refused (`RelationNotApproved`) for each gap relation; the live T2 release rejects the 67-relation catalogue (so a Manager-only change without the Edge pin change is refused: the drift behaviour the runbook relies on).
2. `a_62_relation_listing_of_the_49_v1_plus_13_t1_relations_is_accepted_but_drops_the_t2_five`: a 62 listing is accepted by the loader, and replacing the live 54 by it drops exactly five relations.
Result (container, `--cpus 2 --memory 6g`, flock, lock absent, RUSTUP_TOOLCHAIN 1.85.1): `cargo test --locked -p manager-compat-authority` 23 passed, 0 failed (21 before + these 2); `cargo fmt --check` rc 0; `cargo clippy -D warnings --all-targets` rc 0. The earlier branch-wide results (12 crates, one pre-existing failing base test) are in `EDGE_IMAGE_BUILD_AND_ROLL_PLAN_20261116.md`.
What this does not prove: the whole HTTP path against a live Manager answering the 13 new relations (no recorded wire shapes exist for them; see the pre-swap acceptance in the image plan, which the Manager-side step needs here too).

## 4. Runbook (stage | manager | edge | verify | rollback-edge | rollback-manager)

Script: `scripts/epg10-08/t1-release/paper_t1_release.sh` (mode 0755, syntax checked with `bash -n`, NOT run; every pinned hash below was verified against the real files today).
It touches only service `portal_manager_read` of project `portal-manager-read-paper-v2` and only `execution-edge` of project `portal-execution-edge`, with `--no-deps --pull never`.

| # | Step | Command | Hashes the owner approves |
|---|---|---|---|
| 0 | stage (no service touched) | `paper_t1_release.sh stage` | script (see below), catalogue `0e34dc52...`, policy `272e32f1...`, release `57d52f66...`, profile `fd8d6252...`, `override-t1-catalogue.yaml` `91db479f39392592765b8b269e28a1a46a7002f9d0bc3226d77929912dcf045a`, `override-t1-edge-release.yaml` `cc9733425c4a8c04ef989db64b330a76d6f0ce2ce30b1b7615dce7150f697e5a` |
| 1 | Manager recreate | `paper_t1_release.sh manager` | same, run within one minute of step 2 |
| 2 | Edge recreate | `paper_t1_release.sh edge` | same |
| 3 | verify | `paper_t1_release.sh verify` (+ Core reads, section 5) | - |
| R | rollback | `rollback-edge` then `rollback-manager` | live files only |

The script's own hash (sha256 of `paper_t1_release.sh` as committed): `d4ab061666a50340e953b5de18edc26513a8c2e07d195ef756bb868b9e47a9b9`.

- **stage**: re-checks the live inputs, then creates `/home/bobby/.local/state/portal-execution-edge/releases/t1-paper-20261116` (0755: release file, profile selection, two overrides) and `/home/bobby/secure/portal-manager-t1-20261116` (0700: the two Manager files at 0600). It refuses to run if either directory exists (never overwrites). The owner operator must run it (this author does not write under `/home/bobby/secure`).
- **manager**: stack = `manager-candidate.rendered.json` (`cf826a6e...`) + `override-w2-image.yaml` (`c24fcc1e...`) + `override-t2-catalogue.yaml` (`acaf38a4...`) + `override-t1-catalogue.yaml`. Merge proven offline with `docker compose config` (selected keys only): image stays `localhost/portal-manager-read:w2-domain-events-20261115` (= `b0d2e90b...`, current), 11 mounts, exactly the two catalogue/policy sources change to `portal-manager-t1-20261116`. Stops if the Manager image is not `b0d2e90b...` or the Edge image is not `167e031a...`. Outage: Manager 8023 about 6-10 s, and until the Edge step the Edge answers `CatalogueDrift`.
- **edge**: refuses to run unless the Manager already mounts the T1 files. Stack = `edge-candidate.r3.rendered.json` (`8600b9f4...`) + `override-t2-edge-release.yaml` (`100aa0b5...`) + `override-t1-edge-release.yaml` + `override-edge-running-source-memo-off.yaml` (`4f0ab39c...`, image `167e031a`, memo TTL 0). Merge proven offline: image `167e031a...` unchanged, `EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS=0` kept, only the release bind source and the release SHA env change (`sha256:57d52f66...`), no guard pin variable set (guard stays off), same 5 services in the merged file. Waits up to 60 s for `healthy`. Outage: Edge 8443 about 15-45 s.
- **rollback**: to the T2-five state that runs today, NOT to pre-T2: `rollback-edge` recreates with the stack above WITHOUT the T1 override (T2 release `5508c5d0...`, image `167e031a`, memo off); `rollback-manager` recreates `mdc_t2` WITHOUT the T1 override (T2 catalogue + policy files, image `b0d2e90b`). Always roll back both; Edge first or together. The T1 directories stay on disk and nothing is deleted.
- Total window (manager + edge): about 1-2 minutes (estimate, not measured). Core's native chain must be paused for that window.

Files that do not change: Manager image, Edge image, issuer, DSN, certs, `facade-runtime.env`, `TS_PORTAL_MANAGER_S1_SOURCE_ID` (kept as in T2: the S1 code validates only its format; a recipe value for the new seal would need a new rendered compose file, not part of this package), memo setting, guard.

## 5. Verification after the swap, and what Core must watch

Read-only, by the operator (`paper_t1_release.sh verify` prints 1-3):
1. Manager container: image `sha256:b0d2e90b...`, running, RestartCount 0, mounts show `portal-manager-t1-20261116`; Edge container: image `sha256:167e031a...`, healthy within about 45 s, mount shows `t1-paper-20261116/manager-catalogue-release.json`, RestartCount 0.
2. Logs for 60 s: Edge `CATALOGUE_DRIFT` 0 and `SOURCE_DB_IDENTITY_MISMATCH` 0 (guard is off); Manager error lines 0.
3. Metadata preflight inside the Manager container (`scripts/epg10-08/facade_catalogue_preflight.py`, reads the DSN from its own mount, prints metadata only) with the T1 catalogue: expected `COMPATIBLE_METADATA_ONLY`, `catalogue_relations` 67, `returnable_columns_on_observed_relations` 1105, all drift counts 0 except the known `key_not_declared` below. (Not run.)
4. With Core's delegated token (not available to this author): the Edge catalogue answer lists 67 relations with `catalogue_revision = sha256:4f38c58f...`; one read per T1 relation answers; row counts as of 16 Nov 08:20Z: `source_change_journal` 16286, `command_transport_bindings` 24, `risk_pool_state_projections` 1, the other ten 0 (empty relations answer authoritative-empty); the five T2 relations still answer as before (strategies 1, alphas 1, traders 0, portfolio_equity_snapshots 0, portfolio_audit_current_state 6).
5. DB: the 9 additive read indexes of the T1 policy. The coordinator states they are present now with the schema ledger at 175; that was NOT re-read by this author. A read-only check (names differ from my draft, which is only a draft; the catalogue references no index by name): `select count(*) from schema_migration_ledger` = 175, and `select indexdef from pg_indexes where indexname like 'idx_mgrread_%'` shows `(mode, venue, <key terms>)` btree indexes on `alpha_deadman_heartbeats`, `conditional_order_group_native_parents`, `economic_facts`, `economic_performance_projections_v2`, `economic_reconciliation_cases`, `economic_tie_out_reports`, `execution_algorithm_parents`, `risk_pool_state_projections`, `source_change_journal`.

What Core must watch:
- `source_change_journal` is the one large relation (16,286 rows Paper, growing): 82 pages of 200 for a full read. Read it keyset-paged, not on every cycle; watch Manager rate limits (the Edge now maps a 429 to a typed rate-limit answer with `Retry-After`) and the Edge admission/shared-cache settings.
- Domain pins for Core's native acceptance revision (the same three the T2 step used): `catalogue_sha256 = 4f38c58fed81c7600aea3d5c57dbca64443fc6b47c8ffa54d60296d7cd83c811`, `profile_sha256 = fd8d62529fcf1a75e9137e3499216c9c95b08935ac6f20bb2aa731253675a8cc`, `field_policy_sha256 = 272e32f1b352a7a1edfa4e6a3c64ec8ff184cdfb2907c495fd5e531292495509` (mapping of the three to files follows the T2 runbook; not re-confirmed with Core).
- The 12 denied jsonb columns are not returned; Core's field sets for these 13 relations must be the RETURNABLE scalar sets (198 of 210 columns).
- Core's worker keeps getting `MANAGER_V2_RELATION_NOT_CATALOGUED` for the 13 relations until its registry is regenerated on census v2; the 54 already served are unaffected.

## 6. What else must be true before it can run

1. Core's acknowledgement of the package and the new domain triple; its registry regenerated on census v2 (it lists 96 relations today), and the owner decision on Core's side about the 36 extra fields (pending, not decided here).
2. The E5 publication pack and the TypeScript EDS-11R registry still describe the 96 relations of census v1 (the Edge's `maximum-data-adapter` is deliberately on v1). They are not cross-checked in code; the 13 T1 relations are readable through the Edge compat path but have no E5/registry entry, so Portal shows nothing for them until that slice lands. This does not block the release; it blocks use.
3. Preflight on the Manager (step 3 above) must be run by an operator before and after. About `key_not_declared`: the preflight counts a relation whose selected key has no columns. In the catalogue that is exactly 3 relations today and in the 67 set: `account_sync_effective` (VIEW), `broker_account_sync_effective` (VIEW) and `risk_profiles` (TABLE), all `PENDING_QUERY_KEY`, identical in the 54 and the 67 (checked in the generated catalogues). The reported "three views" is therefore two views and one table; **T1 adds no new `key_not_declared`**, because all 13 added relations are tables with primary keys taken from the live database metadata, so they cannot add `key_unproven` either (not run against the DB).
4. A host measurement lock must be absent, a window agreed with Core, and the owner's approval of the hashes in section 4 (including the script's own hash).
5. The wire-shape recording and offline differential described as "pre-swap acceptance" in `EDGE_IMAGE_BUILD_AND_ROLL_PLAN_20261116.md` section 3c should cover the 13 new relations on the Manager side first: the last release failed for exactly the relations no test had ever seen on the wire. A Manager answering 13 new relations is new wire; record one page per relation and run both old and new Edge code over it before the swap.
6. Guard (source identity pin) stays off; it needs a new Manager image and is a separate step (order: Edge first, Manager second, pin last).

## 7. Unverified, stated plainly
- The 62 variant with the current tool (refused) and the T1 relations on the wire (no recording).
- The 9 indexes and the ledger count 175 (coordinator's statement), the preflight results, row counts after 08:20Z, the window length, the Core mapping of the three domain pins.
- That the Manager's own name-deny leaves the expected number of served columns for the 13 relations (for T2 this was loaded through the real `ManagerCatalogue`; not repeated here).
- That the Manager accepts the 67 catalogue and policy files at startup (the Manager-side loader was not run against them; the S1 `M0` adapter requirement is the same as for T2).
