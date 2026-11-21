# C2 integration WIP inventory — 2026-11-06

**INVENTORY ONLY — NOT A REVIEW, BACKUP, CANDIDATE FREEZE OR GATE PASS.**
The generated adjacent JSON records SHA-256, size and mode of each changed
tracked or non-ignored untracked regular file and the exact Git HEAD. It is a
point-in-time comparison aid for the large shared Core WIP; it does not retain
file contents, ignored files, runtime state or credentials, and does not itself
protect any file from deletion. The JSON and this receipt are the only explicit
exclusions to avoid self-reference. Empty directories and Git index entries are
not versioned by this artifact. A staged change is refused rather than silently
omitted. Symlinks and non-UTF-8 paths are refused. The scanner reads the worktree
twice and refuses disagreement; it is not an atomic filesystem snapshot and
must be reverified immediately before any review conclusion, commit or gate.

Run from the checkout root with the exact canonical JSON path:

```sh
node scripts/research-udb/c2-integration-inventory.mjs verify upgrade/execution_loop/evidence/ELP2-10/CORE_C2_INTEGRATION_WIP_INVENTORY_20261106.json
```

Capture refuses to overwrite an existing artifact; after further work the old
JSON is historical evidence, not the final candidate manifest. Do not delete or
replace it merely to make verification pass. The tool does not authorize a
commit, migration, runtime installation, credential change or release.

## Receipt impact: initial triage, not full dependency review

| Receipt | Reuse decision on this WIP |
| --- | --- |
| `CORE_C2_ISSUER_UPGRADE_DDL_RACE_20261106.md` | 23/23 disposable owner/issuer and 2/2 selected historical clone attest their recorded inputs only. Function/role/privileged-DDL fences and final migration remain open; recompute transitive impact before reuse. Its targeted typecheck was interrupted. |
| `CORE_P7_INTEGRATED_SOURCE_COMPILE_20261106.md` | Source-only TypeScript and focused tests apply to its recorded inputs, not full test-inclusive compile or the current integration hook. Recheck dependencies before reuse. |
| `CORE_C2_RECOVERY_FRESH_WITNESS_20261106.md` | Isolated witness tests do not establish independent witness service, old-holder/source/ACK fence or restore authorization. |
| `CORE_C2_P7_STATUS_INTEGRATION_RETAKE_20261105.md` | Selected local suites are not actual owner acceptance, Edge ACK or complete integration. Recheck all relevant inputs before reusing. |

The entire changed code, test, contract and documentation set still requires
human/agent review and classification against its source pins and current Edge
inputs. P7 actual owner authority, connected source, V2 recovery, A2 and the
normal integration hook remain open. No frontend change or action is requested.

The frozen committed checkpoints `c61f60b8e4f77a0742893524b517c835ea46f0eb`
(Core/Claude candidate) and `c7429e1ed2f7f6444393cd359ea3c5599a15dc9f`
(Claude follow-through) are both ancestors of the recorded HEAD by
`git merge-base --is-ancestor`. This checks commit ancestry only; it does not
review later WIP or prove all other branches/worktrees have landed. The issuer
upgrade SQL and test currently match both hashes in the DDL-race receipt; the
fresh-witness source and its PG test match their hashes in the fresh-witness
receipt. These partial hash comparisons do not establish unchanged transitive
dependencies or qualify reuse of the entire receipt.

## Validation and cleanup

`node scripts/research-udb/c2-integration-inventory.test.mjs` passed its
disposable Git repository scenario after an initial sandbox failure to spawn a
child Node process. The authorized rerun tested tracked/untracked capture,
changed and deleted files, staged refusal, symlink refusal, non-overwrite and
HEAD change. The test removes its own exact `mkdtemp` repository in `finally`;
it does not delete user worktrees, images, volumes or data. This is a tooling
test, not a product gate. No full hook or runtime action was performed.

Capture and immediate verification matched **354 paths** (18 tracked and 336
untracked) at `2faa8968fddbde59b2e59525e334ba3d83886144`. The JSON SHA-256
is `7a8f906fd857caf3ae66f98aa5b01ef47cbef2c0013c2f634dccdab87e6e4110`.
Tool SHA-256 is `3bbb79e220cf7cc8d800a91818bb5aab8695da0c04887eaf8a6eef21fd57d8e1`;
test SHA-256 is `dfe0dd0d76adb9ad7d92a097b0d05edf2d8f458b551b66e91d6739f37b66d0c1`.
These hashes say nothing about the two excluded evidence files or ignored files.
`git diff --check` passed for tracked changes only. Capacity snapshot showed
270 GiB free on `/home/bobby`; no other resource cleanup was attempted.

**Later in the same day:** test-inclusive typechecking found type errors and
the P7/custody test sources were subsequently edited. The JSON above is now a
historical inventory, not the current worktree pin. Its verification must fail
after those edits; create a new separately named frozen-candidate inventory only
after integration review. Do not overwrite this evidence.

## Later inventory tool correction

The original tool accepted only the already occupied canonical filename, so it
could not actually create that later inventory without overwriting evidence.
The updated tool accepts a bounded dated suffix in the same evidence directory;
for a new manifest it excludes only that manifest, while recording the old JSON
and receipt like any other WIP input. The legacy path keeps its original
exclusions so the historical format is not silently reinterpreted. The target
directory must resolve exactly to the repository evidence directory and capture
still uses exclusive creation; no candidate inventory has been created yet.

The isolated Git-repository test passed **1/1**, including the new capture,
verification, historical-manifest inclusion, no-overwrite and noncanonical
path refusal. The test removes only its own temporary repository. Tool SHA-256
`0a59f8bfd354cc2cd45f047cec0d00c6fc4613cd842c1934adf7bb7e56f0d714`;
test SHA-256 `e0bb57fcd05367aa7d0206b82ee8000c0f46ec8be5af598f60772dee7feb9562`.
This repairs review tooling only; no full diff review, freeze or gate is implied.
