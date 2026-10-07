# S02 — BR-S02-06/09 refinement and frontend integration

## Approved scope and plan

Bobby approved this slice on 2026-10-07. Backend baseline `f33a0887`;
frontend heads `89097619` and `532a9c85` are accepted inputs, not code to
rewrite. Work in `codex/be-gaps`, land on `docs/research-loop-plan` only.

1. Publish a workspace/actor-fenced, read-only version compatibility operation
   before dataset selection. Reuse exact Alpha/adapter/flag/qualification rules;
   never turn binding compatibility into dataset or run authorization.
2. Add optional recipe presentation metadata to current setup. Keep labels/order
   separate from immutable execution descriptors, proofs and source seals.
3. Regenerate canonical OpenAPI/client/fixtures and route ownership. Test binding
   isolation, flags, caller/workspace refusal, schema bounds and old consumers.
4. Import both original frontend commits, retaining both histories and both
   request-ledger appendices. Run affected tests and one normal grouped hook.
5. Record exact results and native-consumer handoff; no remote push, dev/main,
   production activation or new engine run is needed for presentation metadata.

## Resource decision

Read-only capacity at entry: root free 110,437,982,208 of 665,811,062,784 bytes
(16.6%). No application rollout, preview rebuild or UI build is planned.
Focused host tests reuse cached dependencies; the mandatory bounded hook
builds its isolated validation image and tests in disposable cells. No cache
prune, volume deletion or overlap with deployment. The earlier named quiet C4
cache maintenance remains required before the next heavy build.

## Delivery and tests

Backend source/contract delivered; final normal grouped hook is the commit
gate. This is not a served-preview or browser acceptance claim.

- Named GET `/api/v1/research/runs/version-options`, operation
  `researchRunVersionOptionsGetV1`, generated `components.schemas.VersionOptions`.
  Query requires only `alpha_id`, `alpha_version_id`, optional `workspace_id`.
  Returns `declared_timeframes`, lifecycle and per-route `COMPATIBLE`/
  `UNAVAILABLE`, reason and exact compatible profile/timeframe/recipe keys.
  Uses shared version/adapter checks, caller/feature/release fences and byte
  bounds; no dataset/index read or implicit preflight/child/default write.
- Optional `Profile.recipe: RecipePresentation` plus presentation revision in
  existing setup. Family/key distinguish fixed, optimized, WFO, full-sample
  and native; rank is display order, never optimality or authorization.
- Synthetic canonical examples (explicitly not product evidence):
  `research-run-version-options.scalar.valid.json` and
  `research-run-setup-options.presented.valid.json`. Existing fixed fixture is
  unchanged; optional fields preserve old consumers and old-server fallback.
- Canonical OpenAPI1.1.0, generated TS, snapshot330 and capability/live route
  ownership updated. Source recipe table/generated descriptors, migrations,
  protected kernel, deployment and preview configuration have zero diff.

Focused gates: Control API setup/recipe **22/22**, contracts **8/8**, imported
frontend recipe/picker/account/declaration/NewRun **200/200**, additional
replay/route-ledger **61/61**. Control API build and frontend typecheck PASS;
generator/snapshot330 PASS; live routes263/0collisions/protected-kernel MATCH.
Initial targeted checks exposed two test-input/order mistakes and a return
type annotation mismatch; corrected before the normal commit gate. Failed
checks are not presented as PASS or original runtime proof.

## Frontend custody and Claude handoff

Original frontend commits `89097619` and `532a9c85` are both merge parents'
history, not selective file replacements. Claude concurrently rebased the same
two changes to `2e661fc5`/`f7a6c77f`; an exact `git diff` over
`apps/portal/frontend` is empty between those heads. Imported frontend files
also match original `532a9c85` byte-for-byte, including tests and docs packet.
Only ledger append conflict: keep §37 expansion AND Claude §39 trial request;
append §40 reconciliation. No `ours/theirs` whole-file overwrite.

Claude owns these follow-ups; work from the landed Research contract, keep
existing accepted layout/calendar/typography/baselines:

1. Read `researchRunVersionOptionsGetV1` on exact workspace/Alpha/AV change
   before Market data. Abort/discard obsolete responses; private no-store.
   Show immutable route/timeframe compatibility, not inferred supersession.
   Keep dataset-bound setup and fresh preflight/create as final authority;
   even `COMPATIBLE` here does not enable Run.
2. Consume optional `recipe.key/family/label/recommended_rank` when present;
   preserve legacy fallback, widest admitted range, exact profile_id and
   caller-edited values. Native fixed recipes are not optimizer studies.
3. Continue native input/result/clock/method mappings from the FULL06 handoff:
   AV1.0.9/1.0.10/1.0.11 are not scalar1.0.1/pct1.0.2 replacements. Respect
   next-open-intrabar versus next-close timing; costs absent ≠0, PRUNED ≠COMPLETE,
   equity samples ≠broker replay. Do not invent native WFO support.
4. Once source/consumer integration is ready, rebuild exactly that preview
   candidate and retake only affected real-API/browser1280/660 checks for
   early route disclosure, context changes, recipe selection, native result,
   refusals and bounded requests. No auto-create on mount or broad baseline
   update; no duplicate engine qualification run solely for presentation.

New native consumer remains uncommitted in Claude's FE worktree and is not
imported/staged by this slice. Backend metadata is available in source/types;
the running preview needs its later coordinated rebuild before calling the
new GET. No production/release claim or alteration of P23/P24 scoped evidence.

Commit locator: the integration commit adding this receipt; its exact SHA is
reported after canonical fast-forward. No origin/primus-origin push.

Normal grouped hook log (actual exit/result is authoritative):
`/home/bobby/.local/state/portal-research-p23/s02-refine-20261007-RtmQcF/commit-hook.log`.
One normal hook gates this coherent merge; no second manual full suite, engine
run, frontend build or broad visual baseline update is scheduled.
