# S02 §36 — precise refusal and engine-option disclosure

Status: **BACKEND_CONTRACT_TESTED / CLAUDE_CONSUMER_HANDOFF_READY**.
Baseline: shared `docs/research-loop-plan` at `5c0e5006`; backend lane
`codex/be-gaps`. Local landing only after the normal grouped commit hook.

## Request and evidence read

Read Unified S02 addendum, queue §35, Bobby's §36 request, P08/P10 packets,
[original setup handoff](./S02_LINKED_WINDOW_SETUP_2026-10-05.md),
[Claude's real-API receipt](./S02_FE_INTEGRATION_RECEIPT_2026-10-05.md), and
setup/declaration/admission/consumer code at `5c0e5006`.
The committed queue ended at §35; §36 records the request supplied in Bobby's
message. Existing frontend receipts remain tied to their original build.

## Delivered

| Need | Public contract | Behavior |
| --- | --- | --- |
| Independent context axes | `SetupOptions.profiles[].refusals[]`: `reason_code`, `field_path` | Caller/binding, dataset, symbol, indexed/declared timeframe and flag each keep their reason/path. Existing primary `reason_code` stays the first refusal; enabled rows have no refusals. |
| Engine choices not opened | `SetupOptions.engine_options`: `execution_routes`, `optimization_pairs`, `frequencies`, `window_modes` | Actual Atlas values/valid pairs only, with state/reason/path/profile IDs. No Portal recipe → DISABLED / `PROFILE_NOT_OPENED` / empty IDs. No Cartesian runnable claim, new profile or activation. |
| Precise Conditions | `DeclarationEstimate.conditions[].field_path` | Protocol, route, mode, schedule, executor version, timeframe, trials, seed, overrides, frequency, window mode, inner plan, range, folds, bars and warmup name their own field. |
| Consistent reasons | `profile`/`executor_version`; `seed`/`alpha_parameters`/`imported_executor` | Missing-recipe rows share the actual axis refusal. Declaration/imported checks reuse the exact preflight/admission predicate, without parsing prose. A proven refused axis cannot retain a PASS. |
| Stale revision only | POST suggestion 409 `RESEARCH_SETUP_OPTIONS_STALE` | `details.gate=setup_revision`, `field_path=["options_revision"]`; reload options only for this code. |
| Other refusals | 409 `RESEARCH_SETUP_PROFILE_REFUSED`; 400 `RESEARCH_SETUP_PREFERENCE_REFUSED` | Separate from stale; precise `details.field_path` and `details.reason_code`. No automatic stale/reload loop. |
| Canonical geometry | `research-declaration-estimate.v1.available.valid.json` | Two expanding `planned_folds.items` with ordered train/OOS edges and bars matching count/minima/range. Partial fixture has no items. Synthetic example, not execution evidence. |

Generated: `research-run-setup.d.ts` (`SetupRefusal`, `EngineOptions`,
`SetupOptions`, `Problem`) and `research-dataset-index.d.ts`
(`DeclarationCondition`, existing `DeclarationMetadata`). Additive optional
fields preserve older captures; the current producer emits them. P08 Problem
vocabulary is unchanged; the three setup codes are setup-only. Generation
verification now includes setup OpenAPI/types too.

Example axis refusal, not an execution receipt:

```json
{"key":"optimizer","state":"FAIL","reason_code":"PROFILE_SCHEDULE_NOT_ADMITTED","field_path":["optimization_schedule"],"observed":"mode_1_decay/per_fold_decay","required":"mode_1_decay/global"}
```

Example catalogue choice, not a runnable profile:

```json
{"optimization_mode":"mode_2_sbb","optimization_schedule":"global","state":"DISABLED","reason_code":"PROFILE_NOT_OPENED","field_path":["optimization_mode"],"profile_ids":[]}
```

## Tests and boundaries

- Control API: **seven affected suites, 130/130** including the existing
  source-qualified VN regression; imported/no-recipe and required-seed rows
  are also verified against their real predicates.
- Contracts **17/17**: operation IDs, state/reason rules, unopened axes, stale
  Problem, positive two-fold geometry and partial absence. Stale/invalid
  requests do not call the private suggestion adapter; workspace/CSRF stay fenced.
- Control TypeScript build PASS in owned temporary output. Generator `--check`,
  digest **296 tracked files** and `git diff --check` PASS.
- One normal grouped hook is required; the final commit output records its
  result. No bypass, full hook per tiny edit, Python change, HMD scan, engine
  run, migration, load/DR or visual-baseline rerun.

The first full hook found one regression: a non-qualified VN symbol could
inherit the FPT recipe ID after axis diagnostics were added. Its existing
expectation was retained; source-qualified symbol/timeframe matching is now
restored before protocol/mode/schedule selection, with precise source paths.
The focused seven-suite retake is130/130. The hook is retried normally, not
bypassed; only a completed passing attempt permits the commit/local landing.

Final hook/local landing/cleanup record:
`/home/bobby/.local/state/portal-research-s02/20261005/refusal-closeout.md`.
This is backend proof, **not a new product/browser or deployed receipt**.

## Claude follow-up — preserve the accepted design

1. Consume regenerated setup/index types; use `field_path`/`reason_code`, never
   server prose. Keep the older-server fallback for optional fields.
2. `engine_options` is disabled catalogue disclosure, not execution authority.
   Require a same-context enabled recipe and fresh P08/P10 authorization.
3. `setupClient.ts`: **only `RESEARCH_SETUP_OPTIONS_STALE`** becomes
   `stale-options`. Profile409 is a refusal, not a reload loop. Preserve bounded
   refresh, abort/context fences and the approved layout/baselines.
4. Map precise Conditions paths without coloring unrelated calendar edges.
   Use canonical `items` in fixture tests; retain typed absence on older reads.
5. Rebuild the affected Control API when integrating consumers, then retake
   the affected real-API/browser checks at1280/660: invalid mode×schedule,
   stale versus profile409, bounded calls and no implicit jobs. Bobby's FE12/12
   report predates this slice and is not claimed as a new Codex receipt.

No frontend files changed. Existing profiles, flags, caps, seed rules,
P08/create fences, runs/artifacts/users/volumes remain unchanged. No remote
push, dev/main merge, preview/Production rollout or signed release.
Cleanup removes only the owned temporary TypeScript output, not shared caches.
