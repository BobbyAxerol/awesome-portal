# BE-P1 — Manager dataset validation gaps MD-1 … MD-8 (ELP2-04/06), 2026-10-20

Owner of this ledger: Claude (backend writer, assigned by Bobby 2026-10-20 from Codex's debt list).
Branch: `claude/be-gaps-2-bep1` from `792319bb` (see "Branch note"). Tier: **R3** (backend + contract); focused gates only,
ordinary hook **NOT_RUN** (Codex/lead runs it at the merge). No migration, no runtime, no source/HK/credential access.

## Status per request id

Vocabulary: `CONTRACT_DELIVERED_AT_COMMIT` = schema/OpenAPI/types/fixtures/producer rule committed and focused tests green;
`PENDING_GATE` = the ordinary R3 hook / PostgreSQL-backed specs have not run on this tree.

| Gap | Rule (smallest producer invariant) | Enforced where | Schema says | Canonical fixture | Status |
| --- | --- | --- | --- | --- | --- |
| MD-1 `returned_count` | `returned_count == items.length`, `<= limit`, `<= authorized_filtered_count`; a non-empty page with neither cursor is the whole filtered result | `manager-dataset-invariants.ts` inside `managerDatasetResponse` (`MANAGER_PAGE_*`) | the empty case exactly (no rows <=> count 0), plus `description` of the rest | negative `MD-1/*` (6 cases), empty fixture | CONTRACT_DELIVERED_AT_COMMIT (exact count is producer-only), PENDING_GATE |
| MD-2 currency of a metric in a partition | a metric that names a currency names its partition's currency, in `capital_statements`, row partitions and group partitions | same (`MANAGER_PARTITION_CURRENCY_MISMATCH`); source admission already refused MONEY-unit mismatches before storage | `description` (JSON Schema cannot compare two fields) | negative `MD-2/*`, positive partitions example | CONTRACT_DELIVERED_AT_COMMIT (producer-only), PENDING_GATE |
| MD-3 partition duplicates | a partition appears once per list; identity = domain, currency, basis, native_profile_ref (`domain_proof_ref` is evidence) | same (`MANAGER_PARTITION_DUPLICATE`) | `uniqueItems` on the three lists (exact repeat) + `description` | negative `MD-3/*` (2 cases) | CONTRACT_DELIVERED_AT_COMMIT (exact repeat in schema; identity repeat producer-only), PENDING_GATE |
| MD-4 NOT_PUBLISHED preset with a window | an unpublished preset carries no window. **This was a real producer behaviour**: `managerQueryOptions` emitted the would-be `resolved` window for an unpublished 7D/30D/90D whenever `as_of` was past the epoch; fixtures hid it because their `as_of` is tiny | producer helper now emits `resolved: null` unless the preset is `METRIC_SPECIFIC`; Zod `managerP1Options` refuses a violating body (`MANAGER_WINDOW_OPTION_INVALID`) | `resolved: null` in the NOT_PUBLISHED branch (finite conditional) | negative `MD-4/*`; actual-read test with `as_of = 1.8e12` | CONTRACT_DELIVERED_AT_COMMIT, PENDING_GATE; **behaviour change, needs Codex ACCEPTED** |
| MD-5 `-0` | **no rule implemented** (owner decision) | n/a | unchanged (admits `-0`) | none; a contract test pins "both validators still admit -0" | OWNER_DECISION_PENDING (options below) |
| MD-6 duplicate rows/groups | `row_key` unique within a body; a group appears once (identity = key) | same (`MANAGER_ROW_KEY_DUPLICATE`, `MANAGER_GROUP_DUPLICATE`) | `uniqueItems` on `items` and `groups` (exact repeat) + `description` | negative `MD-6/*` (3 cases) | CONTRACT_DELIVERED_AT_COMMIT (exact repeat in schema; shared key producer-only), PENDING_GATE |
| MD-7 group membership | a group key names a field once, a field the options offer (`query_options.group_fields`), and `unique_row_count <= authorized_filtered_count` | same (`MANAGER_GROUP_*`); the group key field is now `managerGroupField` (shared with the query's `group_by`) | `field` is the eight-value enum (was any text) and "a field twice in one key" as eight finite `not/contains/minContains:2` clauses | negative `MD-7/*` (3 cases) | CONTRACT_DELIVERED_AT_COMMIT (enum + once-per-key in schema; offered/count producer-only), PENDING_GATE |
| MD-8 headline currency | a row-level money figure that names a currency is the figure of exactly **one** partition listed on that row (the same metric), never a total | same (`MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE`) | `description` | negative `MD-8/*`, positive partitions example | CONTRACT_DELIVERED_AT_COMMIT (producer-only), PENDING_GATE; **deliberately not the reader's wording**, see "Reader and producer disagree" |

Failure mode: every rule runs in `managerDatasetResponse` (Zod `superRefine`), the parse that `queryManagerModel` returns through.
A violating body is never emitted; `ManagerModelService.read` maps the thrown parse error to `EXECUTION_READ_AUTHORITY_UNAVAILABLE`
(503), the existing typed vocabulary. No new problem code.

`schema_version` stays `portal.execution.manager-dataset.v1`: the change only refuses bodies the reader already refuses, no
screen consumes the route yet, and no key was added. If Codex prefers a version bump for the MD-4 behaviour change, say so.

## Files

Producer: `apps/control-api/src/execution-v2/manager-dataset-invariants.ts` (new), `manager-model.contract.ts` (import, chained
`superRefine`, `managerGroupField`), `manager-query-p1.contract.ts` (preset rule), `manager-query-p1.ts` (`resolved: null`
unless published).
Contracts: `packages/contracts/tooling/execution-manager-p1-semantics.mjs` (descriptions, `uniqueItems`, preset branch, empty-page
conditional, group-key clauses), `execution-manager-p1-fixtures.mjs` (positive example, negative cases, operations), and
`generate-execution-manager-models.mjs` (writes both fixtures; **proves every negative case is refused with its stated code
before writing**). Generated: `schemas/execution-manager-dataset.v1.schema.json`, `openapi/execution-manager-models.openapi.json`,
`generated/execution-manager-models.d.ts` (openapi-typescript, not hand edited). New fixtures:
`fixtures/execution-manager-dataset.partitions.synthetic.valid.json` (positive), `fixtures/execution-manager-dataset.invariants.synthetic.negative.json`
(17 cases, `refused_by` SCHEMA_AND_PRODUCER or PRODUCER_ONLY).
Tests: `apps/control-api/test/elp206-manager-dataset-invariants.spec.ts` (new), `elp206-manager-model.spec.ts` (+4 read-path tests),
`packages/contracts/test/execution-manager-models.spec.ts` (+26: Zod and Ajv judged side by side, fixtures).
FE (the one conformance file and the testbase, nothing else): `managerDataset.conformance.test.ts`, `managerDataset.testbase.ts`.
Shared file touched: `scripts/contracts-test.sh` (one line: stage `manager-dataset-invariants.ts` in the Docker workspace whitelist).

Commits on `claude/be-gaps-2-bep1`: `0189c2aa` producer + schema + fixtures + tests (MD-1..4, 6..8); `1120b01a` contracts-test staging line;
`5a5a28d4` FE conformance follows (flips); the ledger commit follows them.

## Tests and gates (focused)

| Gate | Result |
| --- | --- |
| control-api `elp206-manager-dataset-invariants` (new) | 23 / 23 |
| control-api `elp206-manager-model` | 82 / 82 (78 before; +4 read-path tests: realistic-`as_of` presets, pinned-partition headline, fail-closed currency, page counts) |
| control-api `elp206-manager-service`, `elp2-manager-reads`, `manager-lists-q`, `manager-lists-decimal-bound` | green (141 passed, 76 skipped incl. DB-backed) |
| control-api 15 more manager specs (score, regime, composition history, custody, restatement, consumer, commissioning, performance) | 12 files green (500 passed, 225 skipped); `elp206-policy-recalculation` hit a vitest worker `fetch` timeout under load (not an assertion), not re-run alone |
| `npx tsc -p apps/control-api/tsconfig.build.json --noEmit` | exit 0 |
| contracts workspace, host vitest | 78 files / 1,181 tests green |
| `scripts/contracts-test.sh` (Docker, through the wrapper, under the heavy lock) | **exit 0, 78 files / 1,182 tests**, all `--check` generators and d.ts diffs clean. First run failed (3 suites) because the script stages a whitelist of control-api files and did not know the new `manager-dataset-invariants.ts`; fixed in `scripts/contracts-test.sh` (one line, shared file) and re-run |
| FE `src/execution/v2/readers/managerDataset*` | 2,419 / 2,419 (5 are `it.fails` that must fail) |
| FE tsc (`tsc --noEmit -p apps/portal/frontend/tsconfig.json`) | exit 2, **0 errors in anything I touched**; 57 errors under `src/` are `charts/financial`, `research/*`, `execution/components/ReplayCandleChart.tsx` (missing chart modules in the borrowed `node_modules`), 96 more under `features/roadmap-task-board`; unrelated |
| FE whole `readers` directory | 27,007 / 27,252; the 245 failures are `accessSelf` (conformance 232, unit 12) plus one manager pin fixed afterwards; `accessSelf` imports nothing I changed |

NOT_RUN: `manager-lists.spec.ts` and the PostgreSQL-backed parts of `elp206-manager-store` (need 127.0.0.1:5432), the ordinary R3 hook,
the Docker control-api suite, `contracts-snapshot.json` and the EDS-12/N29 ledger regeneration (not committed here by instruction).
Pre-existing, not from this change: FE `accessSelf` tests fail on this base (reader refuses canonical access bodies).

## FE conformance: what flipped

Normal `it` now (schema refuses AND reader refuses): MD-3 (exact repeat), MD-4, MD-6 (exact repeat of a row or a group),
MD-7 (field enum, a field twice in a key), MD-1 (empty page only). Still `it.fails` (JSON Schema cannot state them; the producer
refuses them): MD-1 (exact count), MD-2, MD-6 (shared `row_key`), MD-7 (`unique_row_count`), MD-8. MD-5 is a normal pinned
test that says "no rule yet".

Reader-stricter-than-schema counts (the "schema-valid but reader-rejected" pins):
corpus 80 -> 68 (MD-S10 1 -> 0, MD-S11 11 -> 0: now schema-invalid; 1,469 cases, the schema refuses 1,377, the reader still never
accepts what the schema refuses); hand-pinned 27 -> 25 (MD-S9 and "a field twice in a group key" left, an exact "group twice" and
"partition twice" became "same identity, other content"); matrix P: reader refuses 26 states, **26 -> 17 of them schema-valid** (the nine
`usdt twice` layouts are now schema-invalid, so 45 -> 36 schema-valid states). So the 17 is the matrix-P count after the tightening;
the nine that left are exactly the repeated-partition layouts (MD-3). Reader groups MD-S1..S12 -> 11 (MD-S9 is a schema rule).
The remaining 17 + the 68 + 25 are reader rules on purpose: MD-S1 display safety, MD-S2 `-0`, MD-S3..S8, MD-S10 (shared `row_key`),
MD-S11 (offered field, count), MD-S12, and MD-1/2/8 above.
Needed one testbase guard: the testkit checker's `uniqueItems` JSON-stringifies items and threw on a BigInt negative; `datasetViolations`
now reports that as a violation (no testkit edit).

## Reader and producer disagree (FE follow-up, not done here: outside the allowed FE files)

1. **MD-S5 refuses a legitimate pinned-partition body.** When a query pins `economic_partition`, a row that also has facts in another
   currency lists both partitions and its headline is the pinned partition's figure. `noCrossCurrencyHeadline` compares the headline
   currency with *every* partition and refuses the whole dataset. The producer's real invariant is identity (headline == one partition's
   metric), proved by `MD-8` and by the read-path test `emits a pinned partition's headline ...`. Recommend: replace the reader rule with
   "the headline is deep-equal to the same-key metric of some partition on the row".
2. Partition identity: reader uses five fields (with `domain_proof_ref`), producer four. A repeat differing only in proof is the producer's
   refusal alone (pinned by the FE test with the negative fixture). Recommend the reader use the producer's four.
3. MD-S7 "no cursor either way => whole result" also refuses an empty past-the-end page (a valid `after` cursor on the last row). The
   producer rule here is only for non-empty pages. Practically unreachable (cursor is bound to the snapshot), recommend `returned_count > 0`.

## Open decisions

### MD-5 negative zero (`-0`, `-0.00`) — Bobby
Facts: `exactDecimal` admits `-0*`; the reducer's `sumExactDecimals` already prints `0` for any zero sum, so `-0` can only reach a body by
pass-through (a score or composition `value`, a `denominator`) or from a stored source value; `compareManagerDecimals` treats `-0 == 0`;
the reader refuses it (24 corpus cases).
- A. Leave it: both validators admit `-0`, readers normalise. Zero change; string equality, digests and sort ties can disagree between `-0` and `0`.
- B. Forbid on input and output: a canonical-zero pattern on the manager decimals (`^(?!-0(?:\.0+)?$)...`), fail closed on a `-0` source value.
  Strictest; one bad source representation becomes a 503 for the whole dataset.
- C. Canonical zero on emit: normalise `-0*` to `0*` where a metric is built (one function), forbid `-0` in the published schema for these keys.
  Numerically identical, no financial fact changed, no 503.
**Recommendation: C**, limited to the manager decimals (not the shared `exactDecimal`, which other families use). I did not implement it.

### Behaviour change MD-4
Consumers lose the *would-be* window of an unpublished preset (they still get it in `selected_window` when they request the preset).
That matches "typed absence with a reason, no invented window". Needs Codex ACCEPTED.

## Producer-receipt request to Codex

1. ACCEPTED / CHANGES_REQUESTED on: the eight rules, the MD-4 behaviour change, no `schema_version` bump, MD-5 left open.
2. Run the PostgreSQL-backed specs I cannot (`elp206-manager-store`, `manager-lists.spec`, `elp2-manager-reads` DB cases) and the ordinary R3 hook
   on the merged tree; regenerate `contracts-snapshot.json` and the EDS-12/N29 ledgers (not committed here by instruction).
3. Confirm the headline rule is identity (MD-8), not "same currency as every partition" (see FE follow-up 1).

## Branch note

Another writer committed `6cd24760` (FE-063) onto the same ref `claude/be-gaps-2` while this worktree was on it; to avoid moving that
ref or having mine moved, these commits are on `claude/be-gaps-2-bep1` (based on `792319bb`). They touch no file of that commit.
