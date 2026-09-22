# RS-02 phase report — current-source retention and S04–S08 reads

Date: 2026-09-22  
Status: **BACKEND_COMPLETE; feature-dark; no browser, deployment or source-runtime activation claim.**

## 1. Delivered implementation

| Layer | Delivered | Boundary retained |
|---|---|---|
| QuantBT producer | `current_source_artifacts.py` versioned Advanced-WFO admission, factual P05 artifact extraction, seal-time exact derived values | Python is only the confined compute/serialization adapter; it is not a BFF/query authority |
| artifact reading | P05 data is read once before local retention; the existing Rust P05 reader remains independently conformance-tested | no artifact path, row group or source handle reaches a browser or GET |
| custody | append-only migration `0051`, one shared custody advisory lock, batch identity checks, bounded `jsonb_to_recordset` append, immutable seal/digest verification | no historical rewrite, no generic table endpoint and no source recompute |
| local reads | named evidence/series/split/search/freeze/replay service and controller methods | only session/workspace-scoped Portal PostgreSQL reads after a seal |
| contract | `research-current-source.openapi.json` and generated declaration with a package generation target | no hand-built consumer DTO, raw ordinal, relation selector, cursor decoder or source command |

The private importer enforces full per-profile output bounds before writing:
observations `1..2,000,000`, folds `2..256`, trials `2..64`, candidates
`1..64`, selection `exactly 1`. It chunks every retained relation at at most
200 rows and 1 MiB. A seal verifies all five relation counts, dense row
ordinals, contiguous batch ordinals and a canonical retained-import digest.
An idempotent retry must match the source adapter, profile, artifact identity,
requested/effective specification, dataset binding, counts and summary.
Raw P05 record metadata remains private: named screen DTOs emit only the
declared fold/candidate fields and a maximum 24 declared parameters per
trial/candidate/selection. This preserves the 1 MiB BFF limit under the
maximum admitted relation counts instead of failing a valid page late.

## 2. Product truth rather than a generic source envelope

S04 gets direct retained equity/returns/model-position data plus seal-time
monthly returns, rolling-20 returns and a bounded return distribution. S05
gets actual published fold windows only. S06 gets the full retained trials,
candidates and selection ledger. S07 gets local immutable manifest/count/batch
receipt verification only. S08 gets retrospective model observations/returns
with opaque relation-bound playheads. See the complete mapping in
[field-action-coverage-matrix.md](./field-action-coverage-matrix.md).

GET never reopens the P05 artifact, contacts QuantBT, starts an evaluation,
queries Trading System/Execution/database/Redis/broker/CLI, or makes a
historical result appear more complete. Cursor-bearing search/replay responses
are `private, no-store`; replay accepts only the minted opaque `at` playhead,
not a browser-provided source ordinal.

## 3. Tests actually run

| Gate | Command | Result |
|---|---|---|
| real confined Advanced-WFO adapter | `cd apps/portal/backend && ../.venv/bin/python -m pytest -q -c pyproject.toml tests/test_current_source_artifacts.py` | **6 passed** — factual extraction, bounded admission, exact summary, retained batch behaviour and raw-payload/parameter-boundary protection |
| Control API units | `cd apps/control-api && npm run build && npx vitest run --maxWorkers=1 --no-file-parallelism test/research-current-source.service.spec.ts test/research-current-source.controller.spec.ts test/research-current-source.repository.spec.ts` | **13 passed** — dark default, named DTOs, typed errors, opaque-playhead policy, custody lock/identity, one-statement batch write and maximum legal screen response below 1 MiB |
| P05 Rust reader | `cd apps/research-artifact-reader-rs && cargo test --locked -q` | **5 passed** |
| route ownership ledger | `cd apps/portal/frontend && npx vitest run --maxWorkers=1 --no-file-parallelism src/execution/r2Ledger.test.ts` | **22 passed** — six named current-source routes inventoried/owned |
| isolated PostgreSQL custody/migration/grants/immutability | `bash scripts/research-loop-v11/test-rs02-postgres.sh` | **2 passed** — schema/grants plus actual immutable-row and post-seal-append refusal; uniquely named tmpfs PostgreSQL 16 container left no matching container after its `EXIT` trap |
| shell safety | `bash -n scripts/research-loop-v11/test-rs02-postgres.sh` | **pass** |

The fresh PostgreSQL migration/grant/immutable-trigger proof passed in the
approved isolated Docker acceptance lane. It created no persistent volume and
the post-run exact-name container query was empty. Feature activation is still
not authorized: RS-03 browser/HiFi/product acceptance and an explicit scoped
runtime decision remain separate gates.

## 4. Compatibility, cleanup and rollback

The migration is additive. Fixed P04/P13–P17 v1 readers remain untouched, and
`FEATURE_RESEARCH_CURRENT_SOURCE` defaults to false. No database volume,
runtime container, service, image, secret, Execution pool setting or source
data was created or changed by this phase. See
[resource-cleanup.json](./resource-cleanup.json) and [rollback.md](./rollback.md).

## 5. Handoff / next gate

Claude owns RS-03 consumer composition and browser evidence. The backend
handoff is [frontend-handoff-claude.md](./frontend-handoff-claude.md). Any
missing source fact must return as one focused `CG-RS02-*` request including
the exact screen field, source locator and expected typed shape. It is not
permission to add a generic relation API, direct source access or a fake
frontend fallback.
