# P24 — immutable run declarations and sampler source scope

Date: 2026-10-04 UTC. Source baseline: `de424fad`, backend lane
`codex/be-gaps`. Bobby-approved additive backend/consumer slice; no migration,
engine/vendor change, source seal rewrite, runtime activation or remote push.

## Public metadata boundary — final gate hardening

New public DTOs use `source_ref` with four exact literal codes, never arbitrary
`source_locator`/table/path/URL values. Exact internal lookup locations in this
packet remain implementation evidence only. The original RS-03 no-locator
assertion is unchanged; targeted real PostgreSQL retake is 11/11 PASS, including
strict-schema rejection of extra locator fields and unapproved ref values.
See [final closeout](./P24_CINEMA_CURRENT_SOURCE_CLOSEOUT_2026-10-04.md) and v7's
`post_gate_public_reference_hardening` for rebuilt Control/Web pins.

## Scope and status

`IMPLEMENTED_FOCUSED_TESTED`. Real named-API/image/browser readback is owned by
the root integration lane and must be linked separately; these tests are not
an execution receipt or Product GO. Existing completed engine qualification,
retention and GUI-run receipts are reused, not rerun.

1. `ProgressRead.run_declaration`, `EvidenceHub.run_declaration`,
   `SplitDetail.run_declaration`, and retained Evidence/Split/Search
   `Common.run_declaration` expose one generated, additive DTO.
2. `CurrentSource.Search.sampler_evidence` distinguishes explicit immutable
   requested configuration, existing retained trial observations and the
   unpublished sampler-internal trace. It does not infer TPE phase,
   likelihood/candidate-density, startup trials, warm-start, dedupe or actual
   effective sampler configuration from trial order, names or release defaults.
3. No Python retention change/new image or new run is required for declaration
   reads: producer, preflight manifest and the exact AlphaVersion already retain
   their immutable source. A newly configured run is not required merely to
   expose the stored request. Future source-published sampler internals require
   a separate actual-source retention contract, not a Portal guess.

## Declaration authority

Read-side repositories join the existing transaction-scoped producer/preflight
read to `research.alpha_versions` by **workspace + alpha ID + exact version ID**.
The retained reader additionally binds producer/preflight to the seal's exact
requested/effective/dataset digests. No mutable active-registry pointer is read.

`readRunDeclaration`:

- Parses the accepted requested-spec **v1/v2** union and verifies the digest of
  the original stored JSON before projecting any value.
- Checks the manifest's bound alpha/version against the producer binding.
- Uses the existing safe historical-version projection, including normalized
  P04 range shorthand, stored entrypoint agreement, bounded timeframes/columns,
  warmup, determinism and parameter declarations.
- Publishes the projected declaration digest and the explicitly requested
  pin/sweep overrides. These are declared/requested inputs, not an assertion
  that an optimizer actually evaluated every value.
- Returns typed `NOT_PUBLISHED` with reason/locator for missing, incompatible,
  digest-mismatched or foreign historical inputs. Scratch runs return
  `NOT_APPLICABLE / P24_SCRATCH_RUN_HAS_NO_ALPHA_VERSION_DECLARATION`.

Source facts remain immutable. Existing projection, seal and signed cursor
revisions are unchanged. Evidence/Split's existing semantic validator includes
the new read field; retained reads hash the declaration only into the exact
presentation revision/ETag. A regression verifies unchanged source revision,
seal digest and page cursors with a changed presentation validator.

## Actual QuantBT 1.1.1 sampler inspection

Read-only installed-wheel source inspection; package metadata states 1.1.1.
No sibling QuantBT checkout or engine execution was used.

| Source locator | Actual source fact | Public read consequence |
| --- | --- | --- |
| `quantbt.backends.native_wfo.NativeWfoOptimizationResultV2`, installed `native_wfo.py:357` | Public result contains schedule, study, parameter/score/objective mappings, audit matrix and metadata. | Existing retained trial/selection/search facts remain available with their published scope. They are not a serialized sampler-internal proposal trace. |
| `quantbt.backends.native_wfo.optimize_prepared`, installed `native_wfo.py:738` | This function creates a seeded `TPESampler` and `NopPruner`. | Capability/source-code observation only; not used to stamp a historical run as having TPE-internal provenance, or to infer startup sampling for trial N. |
| `quantbt.optimization.optimizer`, installed `optimizer.py:111–146` | Another generic optimizer path records warm-start/baseline metadata. | Does not prove that the admitted native WFO child used this different path or retained its diagnostics. No cross-path metadata substitution. |
| `current_source_artifacts.py:_source_facts`, line 1959; search block line 2016 | Retains real optimization mode/schedule/studies, trial scope, candidate metrics, objective terms and observed selections; no sampler-internal trace block. | Preserve existing available facts. Internal trace remains typed `QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE`, with an explicit source locator. |
| Immutable `preflight_manifests.requested_spec.optimization_config` | Exact explicitly requested flat config and seed, verified against the retained request digest. | `requested_configuration.scope = RUN_REQUESTED_SPEC`. Empty `{}` remains empty; no TPE defaults are invented. |

`observed_trials.scope` is
`RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE`; its count is the sealed
TRIAL row count, not a reconstructed sampler history. Existing Search ledger
already supplies source-bound parameters/objectives and per-study identity.

## Contract bridge and fixtures

Runtime schemas: `run-declaration.contract.ts`, `sampler-evidence.contract.ts`.
Projectors: `run-declaration.read.ts`, `sampler-evidence.read.ts`.

Persistent generator: `packages/contracts/tooling/generate-research-run-declaration.mjs`,
chained after existing generators in the four owning generation targets.
Canonical JSON Schemas retain `$defs` as schema metadata; OpenAPI inlines the
root and moves definitions to named components, so generated business DTOs do
**not** require a literal `$defs` property.

Generated component names: `RunDeclaration`, `SamplerEvidence`. Canonical
fixtures (explicitly fixture-only, not product receipts):

- `research-run-declaration.available.valid.json`
- `research-run-declaration.historical-absent.valid.json`
- `research-sampler-evidence.valid.json`

Consumer handoff sent to the frontend agent: use the optional generated field,
read-only declaration chips/parameter table and explicit requested/source-gap
sampler captions. Never fetch current registry data to fill a historical gap,
infer sampler execution from config, or cast away typed absence.

## Focused verification

- Control API `npm run typecheck`: PASS.
- Six affected backend modules: first pass 56/57; the one failure was this
  slice's malformed v2 **test fixture**, corrected to the published inner
  `split_frequency/window_mode/train_window` shape. No producer change.
- New immutable-declaration/sampler helper tests after correction: 8/8 PASS.
- Retained read/source-pin regression plus helper tests: 22/22 PASS (includes
  one new representation/source-pin case). Existing five affected modules
  passed in the initial grouped run; no full hook repeated here.
- Four contract modules, focused fixture/generated bridge: 20/20 PASS;
  final regenerated declaration tests: 7/7 PASS.
- Four owning OpenAPI/type generations completed. Generator idempotence is
  covered by the contract test; the root runs the single normal grouped hook.

Two test-only/generation issues were corrected before consumer acceptance:
invalid inner-WFO fixture field names, and OpenAPI external `$defs` incorrectly
materialized into a required response field. Neither was accepted as a source
fact or worked around with frontend casts.

## Runtime/resource boundary

This slice starts no stack, child, browser, utility, actor, export or evaluator.
Root integration owns the actual isolated candidate build/read receipts and C4
teardown. Source gaps are explicit, not debts hidden behind available values.
No current/previous production release, state volume, UI design or Execution
contract was modified by this authored backend slice.
