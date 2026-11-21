# Selected backend branch reconciliation — 2026-11-06

**PARTIAL INTEGRATION REVIEW.** This is not a full WIP or branch audit, a
candidate freeze, runtime installation, source qualification or normal hook.
Checkout `docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`
also has shared uncommitted work; the source paths below were inspected in that
worktree. Nothing was merged, overwritten, deleted or pushed.

## Decisions on selected historically divergent slices

`git rev-list` reports 19 commits in `chore/complete-fixture-review-20261023`
outside HEAD by ancestry. That does **not** mean that all 19 changes are missing.
The following decisions are based on the named equivalent HEAD ancestors plus
selected path comparisons, not on ancestry alone:

| Old source | Current evidence and disposition |
| --- | --- |
| `8822d58f2` visit digest | Matching subject `fe5a98ba3` is a HEAD ancestor. Controller, store and service match the old source at HEAD. Do not reapply blindly; review its integration/authorization as part of the final candidate. |
| `ace3547ca` contributor continuation | Matching subject `0a839af87` is a HEAD ancestor; `manager-model.ts` has substantial subsequent changes and the selected group-controller test matches. Preserve the later implementation; this is not an acceptance of every later change or of qualified financial data. |
| `37bbecf92` portfolio labels/finance fixture | Matching subject `0f2d9d59e` is a HEAD ancestor. The selected scoped-names helper and fixture module match; the test has later fixture-lineage changes. Preserve both later changes. |
| `4ecef0f89` lifecycle and `7591dca0d` stage facts | Matching-subject commits `7ab7f3a82` and `2997abdbe` are HEAD ancestors, with further descendants. Selected manager lifecycle and stage-facts files are present; current stage schema has been expanded. Do not overwrite it with the old schema. |
| `611942613`, `1ac72a26b`, `8199d6efe`, `6484c5951` | Matching-subject HEAD ancestors `0dd5a47bf`, `cb58afe87`, `aa69e80c6`, `13927a9ab` exist. The selected positions-by-side source/test match the old tree; deployment-identity source matches with a later test adaptation, and the alpha-resource schema has later additions. This is selected-file evidence, not a full comparison of these commits. |
| `734353113`, `9d88e40a9` Core009 | Not equivalent by patch-id in the checked branches. The selected native business client matches `9d88e40a9` at HEAD; its test differs only in the reviewed Socket→Duplex type adaptation. The selected Core009 preparation, revoke and validator files match `734353113`; the selected acceptance-session file has an additional session-end hint. Other files in those commits, their runtime/config, and later WIP **still require review**. |

`git log --cherry-pick` also showed no unmatched non-merge commits for the
selected branches `claude/be-gaps-2`, `claude/be-gaps-2-bep1`,
`claude/be-p16-financial-publication`, `claude/ft-be`, `claude/ft2-be`,
`claude/paper-history-qual-20261023`, and
`chore/elp210-served-contracts-frozen`. Patch-id equivalence can miss merge
semantics and does not establish runtime/receipt compatibility. Other branches,
the remaining files of each listed commit and the current untracked WIP are
not dispositioned by this slice. Preserve the branches until a broader review.

## Focused regression

From `apps/control-api`, on the current shared worktree:

```
./node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism \
  test/elp210-native-business-read-client.spec.ts \
  test/scoped-portfolio-names.spec.ts test/manager-group-controller.spec.ts \
  test/visit-digest-service.spec.ts test/be-p4-manager-lifecycle.spec.ts
```

**5 files / 114 tests PASS**, exit 0. The native-client tests use synthetic
loopback TLS; the others exercise the selected implementation/fixtures. This
is not PostgreSQL migration, real Edge/financial data, browser or full hook.
The earlier isolated P7 owner-intent suite also completed **9/9**, exit 0, on
the current WIP; its source/authority and keys are synthetic. Tests ran with
one worker; no service, persistent DB, credentials or runtime were changed.
Peak resource usage was not measured.

Selected direct working-file SHA-256 pins (not a transitive dependency hash):

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/native-business-read-client.ts` | `65d3d8ff1585e6e1d6bdb11528a307bd0d23f6fa3044f1edc8367ef18ee3a15f` |
| `apps/control-api/src/execution-v2/manager-lifecycle.ts` | `6872c2d12cf07f1ad873e92e70d9b809d81b241d93a31b6d69ba1e6a4c02ab8f` |
| `apps/control-api/src/execution-v2/manager-model.ts` | `e67f90d52e5db643da6b191bd612a1feb472a7b7beb247481fdf6433167c2db3` |
| `apps/control-api/src/resource-read/scoped-portfolio-names.ts` | `98e92238f33ace999b8bf76e472fd8bc1a5df35ddd1a19d9dd61d77293105d2c` |
| `apps/control-api/src/command-center/visit-digest.service.ts` | `d2249cad0bce6cac04153e670ea05d74e090c8eabfa5602aacab3a091f50ce33` |
| `apps/control-api/test/elp210-native-business-read-client.spec.ts` | `9ecd25b1b1649cdb3d83313b7cb4812f8ddec6d955387d8986bfe0dd56060e73` |
| `apps/control-api/test/scoped-portfolio-names.spec.ts` | `c8a48425a84ef7fbe92ca5a55fd1950e8a3dacc1b4744d5294c470c4720d426e` |
| `apps/control-api/test/manager-group-controller.spec.ts` | `8c176814be50f0035c94921cffdfe729089edab7270be05055f77b832395629f` |
| `apps/control-api/test/visit-digest-service.spec.ts` | `100c3f67b165c269e3b1b5aea5379a652f636087b85dcb3d66691123c6bef7b8` |
| `apps/control-api/test/be-p4-manager-lifecycle.spec.ts` | `8d9ed3f33edab6afa43729b5d558a06f8d1ec88b302d609b86d8e7b31a187964` |

## Remaining / consumer

Review the remaining WIP and unmatched branches, including each source/config
dependency; freeze and run the normal hook once after the candidate is stable.
P7 independent owner authority, V2 anti-rollback/old-holder and terminal/ACK
reconciliation, genuine Edge source/ACK, financial qualification and ELP2-10/11
remain open. This review changes no public contract or frontend; Claude need not
reapply the older selected slices. Rollback is to leave runtime and the retained
branches unchanged; no Git or database rollback was performed.
