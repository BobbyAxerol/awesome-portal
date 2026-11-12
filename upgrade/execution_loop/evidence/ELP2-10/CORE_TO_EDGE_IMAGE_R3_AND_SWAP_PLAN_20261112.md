# Core → Edge: a new Core image is required before 13 November; R3 started; swap assigned

Written 2026-11-12T13:12:13Z by Claude (Core backend, delegated by Bobby). Public text only. Nothing here is installed, signed, granted or a connected PASS.

## 1. Finding (Core's own gap, found while preparing the local installer references)

The running Research control-api (container `portal-research-preview-control-api-1`, image `sha256:d15e8e21bdebacd9c972b9350ef38a7a07509c61a9231f157b898b3c2c78410a`,
source revision `2e31b74da`, started 2026-11-11T09:24:30Z, restarts 0) contains the one-shot CLIs (`execution-native-install`, `-revoke`, `-session`, `core009-validate`)
and the Plan B code, but **not** the READ-only install plan (Core commit `a5b66cf3f`) and **not** the ready-document producer (`4dce48c5a`, `954d5897f`): the file
`dist/execution-v2/connected-read-ready.js` does not exist in it, and 9 control-api commits separate that revision from the current tip. So the one-shot policy install
for the single READ grant cannot run on any image that exists today. Core's earlier "READ_ONLY plan done" statements referred to source and tests, not to a deployable image.

## 2. What Core is doing (no action needed from Edge or TS)

| Step | State at 2026-11-12T13:12:13Z |
| --- | --- |
| Normal R3 gate (`scripts/verify-workspace.sh`, the pre-commit hook's content) on the exact tip `f602a8740` (contains `a5b66cf3f`, `954d5897f`), run through the shared build slot in a clean worktree, no code edits during the run | **STARTED**, result NOT_READY; the full hook has never been run on these two code commits, which were committed with scoped gates only |
| Build one candidate image from an **exact committed Git archive** of the tip, verify offline (CLIs present, READ_ONLY plan present, producer present, labels match the commit) | NOT_STARTED, only after R3 is green |
| Install anywhere | NOT_STARTED; the image is a prerequisite for gate (b)/(c)/(d) steps on the Core side, not an input to TS |

Requested checkpoint: R3 result and image ID reported at **12Nov20:00Z** (the go/no-go time) if R3 is green; a red R3 is fixed at the root cause, not bypassed, and reported with its cause.
If R3 or the image slips beyond **13Nov04:00Z**, Core says so then, and the slot is re-coordinated; Core will not run the policy install on an image that lacks the READ-only plan.

## 3. The control-api swap is assigned (Bobby, 2026-11-12)

Bobby chose: the Core agent performs the swap (quiesce the identity-only bootstrap by its private IPC `shutdown`, never `docker stop`; start the native-review composition), under an **envelope Bobby
approves by exact hash beforehand**. The envelope needs the final image ID and manifest hash, so it is written after the image and the manifest exist; it is a separate approval, not part of
gate (a). Stop conditions follow the runbook: any non-zero or UNKNOWN custody keeps the old bootstrap running and nothing changes.

## 4. Integrity

SHA256 in `CORE_TO_EDGE_IMAGE_R3_AND_SWAP_PLAN_20261112.sha256`; mirrored to HK EPG10-08.
