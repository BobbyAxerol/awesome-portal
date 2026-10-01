# CG-FG-S08-01 — Replay fold parameter identity

Status: backend accepted at `38c4a611`; S08 frontend binding remains Claude-owned.

`execution.fold_capital.segments[]` now publishes `params_digest` and `params_digest_reason_code`. The digest is computed from the sealed global-study selected parameter map with the same canonical SHA-256 function used by Freeze Stage 4. The real WFO preview run `rrun_3258a4c450816129d2d285f25b801061` previously showed the same digest in Progress fold selections and Freeze Stage 4 (`aeb7bab2d51cc6fce821c2cfa0458f30ed59db073390ce7223088d8582b9e54c`). This is an immutable identity projection; it does **not** assert that QuantBT's OOS-generation child replayed those parameters. That runtime fact remains LW-03, blocked by the source audit truncation.

For a retained seal with no selected parameter map, both fields remain typed: `params_digest: null`, `params_digest_reason_code: RS02_SEAL_DID_NOT_RETAIN_SELECTED_PARAMETERS`. A seal predating the replay ledger still has no fold segments. No extra HMD read or cross-service query is introduced on Replay GET.

Validation: Control API build; `research-w5b-replay.spec.ts` 21/21 (real QuantBT replay fixture, Zod/OpenAPI and missing-map regression); `research-rf05.spec.ts` 3/3; full pre-commit gate contract 202/202 and Control API 1,387 passed, 1 skipped. The published fold-0 fixture changes only the two new facts on its two segments; time-dependent opaque cursors are unchanged.

Exact-HEAD isolated preview at `38c4a611`, Control API image `sha256:5e73156c86db5285c59abc3e8d228d77bec9a77ebaa7666622de8abf8e9c7b0b`: authenticated GET of Progress, Freeze and Replay for the real WFO run all returned HTTP 200. Progress folds 1/2, Freeze `sealed_params_sha256` and Replay segments 0–8 all carried `aeb7bab2d51cc6fce821c2cfa0458f30ed59db073390ce7223088d8582b9e54c`; every Replay reason was null. No write/command/source request was used.

Frontend handoff: regenerate `research-current-source.d.ts`; bind the S08 fold strip to `execution.fold_capital.segments[].params_digest`, showing the typed reason if null. Do not label it a per-fold replay-runtime comparison or a Stage 4 MATCH. Leave S08 layout/styles untouched.
