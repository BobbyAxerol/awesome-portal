# P7 bootstrap — integrated Control API source compile, 2026-11-06

**SOURCE ONLY / NOT COMMISSIONED.** Checkout `docs/research-loop-plan` at committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`, with shared tracked and untracked WIP. No image, database, runtime, frontend, external authority or Edge configuration changed.

## Finding and correction

The current source-wide build configuration reported two `TS2345` errors in `src/main.ts`: `p7Reference` and `reviewTarget` were considered possibly undefined in code following the deliberately non-returning `assertC2P7ReviewSchemaCommissioned()` fence. The fix captures both narrowed values inside the existing conditional **before** the fence. It does not remove, defer or condition the fence; it does not enable the P7 review endpoint or the issuer. No contract or schema changed.

This is a source integration repair, not a sufficient P7 authority check. The restricted writer, genuine owner authentication and independent signer/custody, actual P7 acceptance and runtime schema/ACL qualification remain necessary. The forged-review counterexample and fail-closed guard remain in force.

## Evidence

- `NODE_OPTIONS='--max-old-space-size=4096' timeout 300 ./node_modules/.bin/tsc -p tsconfig.build.json --noEmit --pretty false` in `apps/control-api`: **exit 2 before repair**, with the two named `TS2345` errors; retake **exit 0**. This is source build-config typechecking without emitted image/artifacts, not the test-inclusive `npm run typecheck`, cross-loop typecheck or normal hook. Peak CPU/RAM was not measured. The working tree was not a frozen Git commit.
- `npm test -- test/c2-p7-review-runtime.spec.ts test/c2-human-issuer-composition.spec.ts`: **20/20 PASS**, two files, including the explicit standalone startup refusal and candidate issuer fence. Synthetic fixtures, not authenticated owner acceptance or a connected receipt.
- `git diff --check`: exit 0 for tracked changes; it does not validate untracked files. The standard test harness removes its own generated temporary fixtures. No normal hook was run.
- At the read-only 2026-11-06 HK check, the Edge worktree was at `636d58a7c4368a617903734ab1d0ce933d2804ca`. Public STATUS still recorded static A2 structurally verified, not full A2/installed delegation. The initial remote status command could not use `rg` because HK lacks it; the read-only `grep` retake succeeded. This is not a runtime trust or source qualification.

| File on current working tree | SHA-256 |
| --- | --- |
| `apps/control-api/src/main.ts` | `543201313922c1d3d06bd8d747dd15508d5ae5bf995390af46951e7129e1e970` |
| `apps/control-api/src/execution-v2/c2-p7-review-runtime.ts` | `4497b2b06c20aaae3e30f5f6804dc3d4a00fe6b05d5d28c5004bab74e5290e73` |
| `apps/control-api/test/c2-p7-review-runtime.spec.ts` | `5675f0fd0db7187384fe9c3825d986e6683728c45917d06f15eebe686ee882a4` |
| `apps/control-api/test/c2-human-issuer-composition.spec.ts` | `3e5b1536933ce63e559a3d8ce9439a8e4e233e5af2387b6fa0dc5eb430719503` |

The post-test source inventory digest was obtained with `rg --files -0 apps/control-api/src -g '*.ts' -g '*.sql' | sort -z | xargs -0 sha256sum | sha256sum`: `827c84c45e70db96dc5f1971b48d145f52a17c767623299b0073f7d3332b4bdb`. It excludes transitive packages, tests, configs and runtime, so it does not pin a candidate or prove the files were unchanged throughout compilation. An initial inventory command omitted the NUL output option and failed; only the corrected digest is recorded.

## Next / handoff / rollback

Review and integrate the remaining WIP, commission independent P7 owner/writer and issuer authority, complete recovery fencing and source/ACK reconciliation, then retake affected integration, migration/restore and final normal gate against a frozen candidate. A2 remains not ready; B2 remains unsigned and ELP2-10/11 remain open. No new frontend field or consumer action is requested. Rollback is to leave the candidate unmounted; preserve the hard fence.
