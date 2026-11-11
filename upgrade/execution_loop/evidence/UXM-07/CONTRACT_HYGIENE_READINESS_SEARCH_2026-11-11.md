# Contract hygiene, /readiness and /search (11 Nov 2026)

Branch `claude/slice-followthrough`, commits `51babbca4` (contract hygiene) and `5966787c7` (readiness and search). Bobby approved items 7, 8, 9 and 14 of `BACKEND_REMAINING_WORK_2026-11-11.md` through the question tool. Contract changes below need Codex to accept them at landing.

## 1. Contract hygiene (item 14)

| Finding | Root cause | Change |
| --- | --- | --- |
| `AlphaLifecycleProblem` has no 400 code | its 400 response referenced the problem but the enum lacked `EXECUTION_READ_QUERY_INVALID` | added to `generate-execution-alpha-lifecycle.mjs`, regenerated (openapi + `.d.ts`, 4 lines) |
| `research-preflight.response` rejected under `/effective_spec/topology/sealed_holdout` and then `/snapshot/warmup` | **the schema was wrong, not the fixture**: `SealedHoldout` and `Warmup` were `allOf` of `UtcRange` (closed) and a second closed object, so no body could satisfy them. The producer (`apps/control-api/src/research/preflight.contract.ts`, `UtcRangeSchema.extend({...}).strict()`) and the fixture agree | both flattened into one closed object in `openapi/research-preflight.openapi.json`; `research-dataset-index` is derived from it and was regenerated; `.d.ts` regenerated. Two tests added to `test/research-preflight.spec.ts`: the pinned response validates against `ResearchPreflightV1`, and no schema composes a `$ref` with a closed branch |
| `research-run-create.reproduction` "missing run_id" | **not a defect**: the fixture is a request and validates against `RunCreateRequest`; the earlier finding paired it with the wrong schema | none |

## 2. GET /readiness (item 7)

`items` becomes an optional section (`T.sec`, same as every other optional figure): omitted or null = no owning source. The typed-absence answer omits it, because an empty list would claim "no alpha", which no source said. The environment must be named (like `/blotter/summary`): without it the answer is the published 404, with an invalid value 400. New fixtures `no_source` and `items_null`, negatives `items-not-an-array` and `environment-missing`. The frontend reader is generated from the same definition and needed no hand edit.

## 3. GET /search (item 8)

Each group may carry `state: NOT_COMMISSIONED` (optional, so every existing body stays valid). A group in that state has `total_matched: null` and `rows: []` (schema `if/then`). That is not "no match": the shell prints "entity search does not cover this kind yet" instead of "count not published", and still asks the kind's own list read (portfolios, approvals, accounts per environment). The route validates `q` (1..128, no control characters), `kinds` (unique subset, default all six), `limit` (1..50, default 8) and echoes them only when valid; any unknown key is a 400; an unreadable workspace gets the same 404 as every other read and never learns the query was accepted. New fixture `not-commissioned`, three negatives. Frontend: `readers/entitySearch.ts` (rule ES-4) and `shell/entitySearch.ts`.

Both routes mount only through `typedAbsence` on `EXECUTION_READ_PROFILE=retained_review_v1`, like the other ten typed-absence reads. Twelve in all.

## 4. Evidence

- Contracts cell (`scripts/contracts-test.sh`, whole suite): 113 files, 1,952 tests passed. Snapshot 722 tracked files (three new fixtures added to `TRACKED` in `tooling/snapshot.py`).
- control-api cell: `test/typed-absence-http.spec.ts` 38 of 38 (readiness joins the scoped table; a new describe covers search: valid body, kinds order and limit echo, 14 refusal shapes, 401, 404 without leaking the query).
- Frontend: readers and search 52 files, 66,994 tests passed (5 expected fail unchanged); `tsc --noEmit` clean in `apps/portal/frontend` and `apps/control-api`.
- Route inventory (`p01-baseline.mjs --write-live-routes`): 339 to 341, exactly the two new routes. Release-integrity ledgers (`refresh-release-integrity-ledgers.sh --check`): current.
- Errors found and fixed on the way: Ajv strict mode rejected `if: {required:['state']}` (state not declared in the `if`); two assertions in my own new tests were too broad or wrong (accounts are looked up in three environments).
- Not run: the full pre-commit hook on these commits, Playwright and pixel suites (no visual change: the shell text only appears when the server answers NOT_COMMISSIONED, which no fixture lane does).

## 5. What Codex must accept at landing

`items` optional in `portal.execution.alpha-readiness.v1`; optional group `state` in `portal.execution.entity-search.v1`; the flattened preflight `SealedHoldout` and `Warmup`; the extra problem code. All additive for readers. Still unserved: `GET /commands/{operation_id}/receipt`.
