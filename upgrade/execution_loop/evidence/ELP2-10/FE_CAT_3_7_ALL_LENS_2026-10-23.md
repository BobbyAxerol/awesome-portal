# FE-CAT-3 and FE-CAT-7: the Fleet All lens over the Manager dataset (2026-10-23)

Level: R0 note. Contract SOURCE_ONLY (additive, optional); control-api, Portal and fixture lane FIXTURE_VERIFIED. No real source is connected.
Closeout 2026-10-23 section 5. FE-CAT-3: "An All lens is navigation across separately labeled environment/economic partitions, not consolidated money. An additive backend fan-out/read may return authorized per-partition rows and cursors; no cross-environment financial sum or browser join pretending to be a source aggregate. Preserve separate actual/Paper/Sandbox." FE-CAT-7: "Allocation/balance facts must carry economic domain/profile/environment, currency, ownership, basis, coverage and provenance. Never label legacy all-environment currency sums ACTUAL, or shared account balances alpha-owned NAV."

## 1. Decision (smallest contract change)
No new route, no new schema. The SAME dataset (`portal.execution.manager-dataset.v1`, `GET /manager/fleet`) accepts one more value and returns one more optional block; every existing fixture is byte-for-byte unchanged.

| Name | Where | Meaning |
|---|---|---|
| `environment: ALL` | query (`ManagerDatasetQuery`) and response root | Fleet surface only; no `window` (a window resolves against one environment's cutoff); any stage word may narrow it; money sort/filter still needs a pinned `economic_partition` |
| `items[].environment` | row, optional | present exactly on ALL rows; `row_key` = `["<env>","<alpha>","<version>","<portfolio>"]` (one row of one environment) |
| `environment_coverage` | response, optional, exactly on ALL | one entry per environment in order paper, sandbox, live: `{environment, availability INCLUDED or UNAVAILABLE, reason_code, snapshot_id, as_of_ms, recorded_through_ms, facts_through_ms, quality, authorized_filtered_count, returned_count}` |
| reasons (closed) | `reason_code` | NOT_AVAILABLE_TO_VIEWER (merges "no grant" and "nothing visible", so a missing environment never reveals that rows exist), NOT_CONFIGURED, POLICY_PENDING, PUBLICATION_NOT_QUALIFIED, SOURCE_UNAVAILABLE, CHANGED_DURING_READ, SCOPE_LIMIT_EXCEEDED |

Rules held by the producer (stable codes `MANAGER_ALL_*`, also in the JSON Schema where it can say them): INCLUDED has every fact and no reason, UNAVAILABLE has a reason and nothing else (never a count, never zero); a counted zero is INCLUDED with 0; `page.authorized_filtered_count` and `page.returned_count` count ROWS and equal the sums of the INCLUDED entries (the only sum ALL makes); a body that lost an environment is never COMPLETE; each row's partitions are of its own environment's economic domain (live is ACTUAL); ALL carries `selected_window: null`; a single-environment body never carries an ALL key.

Combined envelope is conservative: oldest clock, worst quality, reasons prefixed by environment. There is NO combined money: a group lists each environment's partitions side by side, `capital_statements` is the concatenation of each environment's per-partition statements, `economic_aggregation` stays `PARTITIONED_ONLY`.

## 2. Server (control-api)
- `collectManagerRows` (extracted from `queryManagerModel`, behaviour unchanged, 135 existing tests green): everything one environment decides BEFORE paging, under that environment's own scope. Authorization precedes counting, grouping, statements, paging and cursor, per environment.
- `queryManagerModelAll`: a pure merge of what each scope already admitted. One keyset cursor, unchanged codec; the query fingerprint binds every included scope, source revision, generation, the typed outcome of every environment and the query, so a page of another snapshot (or a single-environment cursor) is refused. Refuses a collected read of another question, scope, environment or workspace (409).
- `ManagerModelService.read`: `ALL` fans out sequentially (the repository bounds flights); each environment's failure is that environment's typed reason, never the read's. No environment at all: 404 if every one is "not the viewer's", else 503.
- Strict reader mismatch guard (Portal): ALL asked is accepted only as an ALL-shaped body; one environment asked is never accepted as ALL.

## 3. Portal
- Reader/encoding: `environment ALL` (Fleet, no window), `ManagerRow.environment?`, `ManagerDataset.environmentCoverage?`; the reader re-checks every `MANAGER_ALL_*` rule, a hostile or half-shaped body voids the whole read.
- Fleet: the All lens and a stage selection across environments ask the dataset for ALL once (the existing publication probe). Published: dataset table with an Environment column, one strip that types every environment (count each, counted `0 rows`, degraded flag with the reasons behind a GapWhy, `Not available` with the reason in words and the code), Group by / Then / Sort / search / owner / health are the server's own over ALL, keyset paging "Showing N of M rows". Money columns stay per partition with the partition tag (domain and currency). Map: one partition at a time; rows of other environments are counted as belonging elsewhere, never drawn. Not published (any refusal, another environment's body, a non-ALL-shaped body): today's fleet read and typed absences, unchanged. The Fleet STREAM stays single-environment (off for ALL). Board stays on the fleet read.
- FE-CAT-7: the partition tag title names domain, currency, basis and profile; one GapWhy "Where the money columns come from" (also on single-environment tables) lists per partition: basis, profile, domain proof; per column how many loaded rows publish a figure and how many are complete, fresh and verified; ownership named as NOT published. The legacy fleet read's money is untouched and is never drawn as a dataset figure, so no legacy cross-environment sum can be labelled ACTUAL.

## 4. DELIVERED vs ACCEPTED_FOR_IMPLEMENTATION
DELIVERED (FIXTURE_VERIFIED): contract (zod, schema, openapi, d.ts, fixtures `execution-manager-dataset.all-environments.synthetic.valid.json` and `.negative.json` with 12 cases), control-api, reader and guard, Fleet table, strip, Map, provenance disclosure, fixture lane (`fixture-bff/review-manager.ts`, populated profile only: one early-return hook plus `allAnswer`, about 85 added lines; Paper degraded, Sandbox NOT_CONFIGURED, a stage filter leaves the other environment a counted zero; layout-stress and any window answer 400).

ACCEPTED_FOR_IMPLEMENTATION, exact Edge/Core input (nothing invented):
| Figure | Exact input | Owner |
|---|---|---|
| Ownership of an allocation or balance (alpha-owned NAV versus a shared account's balance) | a published field per money metric or partition naming its ownership basis (the store already holds `ownership_partition_ref` and `economic_account_ref` on facts; they are not published on rows). Until then the Portal names ownership as NOT published and prints the figure as the named partition's only | Edge/Core, then Codex for the dataset row |
| Per-alpha allocation domain (BQ-FLEET-ALLOC) | `allocation` facts classified by economic domain/profile in the Manager facts (kind `allocation`), so each lands in its partition | Edge |
| Real ALL | none beyond the above: ALL is built from the three per-environment datasets, which need their own published heads (`alpha_fleet_overview` per environment). An environment without one is typed UNAVAILABLE | Core009 |
| Windowed ALL | refused by design (no common cutoff); if wanted, a Bobby/Codex decision | Bobby/Codex |

## 5. Effects before landing
- Pins: the old sha256 of the dataset schema, openapi, d.ts and generator appear only in `contracts-snapshot.json` (regenerated: 7 lines changed, 3 added: two fixtures and `tooling/execution-manager-all-fixtures.mjs`) and in a historical evidence note. N29 pins `br72_*` (manager-lists) hashes, not the dataset: NO N29 re-pin is needed for this slice; the gate's own table was not run.
- `scripts/contracts-test.sh` copies `manager-all-scope.ts` into the networkless cell (needed by `manager-model.contract.ts`).
- Two old assertions were deliberately changed because the semantics changed: the ALL query was refused as unknown (control-api service spec, contracts models spec).
- Fleet visual baselines will differ (All lens, new strip and Environment column, the disclosure line). Not recorded, not run.
- Generator needs `NODE_PATH=<control-api>/node_modules` in a bare worktree (zod).
