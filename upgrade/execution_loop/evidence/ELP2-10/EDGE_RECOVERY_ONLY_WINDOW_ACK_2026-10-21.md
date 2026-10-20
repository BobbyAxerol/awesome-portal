# Edge recovery-only window ACK — observed 21 October 2026

Core read the actual Edge owner journal at 05:47 UTC via approved read-only SSH.
The new **05:44 UTC recovery-only coordination ACK** accepts original source
28446 endpoint/SDK/custody availability from **05:50 to 06:20 UTC**. This is not
a renewed acceptance/grant/session/ISSUE/ENTER window. Frozen intake ended
05:45; status/cancel/resolve retain original custody until genuine terminal/ACK.

Source locator: `bobby@16.163.212.33:/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`, tail section headed `05:44UTC recovery-only coordination ACK`.

- Observed source HEAD: `dd82b6a7024018b832485d92db5e3861421d8c59`.
- Actual journal byte SHA256 at readback: `b94079308018554b2bbc917bb54ab0693cda5afdc9d9e0fa1159e8ce92fb17d1`.
- This ACK was incremental journal WIP during the owner's separate hook; it is not claimed committed at that SHA.
- Original source identity: `sha256:0dc8921f29b27e3de6fc55129f4cde69d6a4e67e0f94c76d20a44dff3dc55c7b`.
- Original lease: `785387ba-ef57-455d-a7ba-f92663baae60`.
- Original attempt: `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`.

Core alone continues the unchanged `d9e3c07d…` revoke artifact/idempotency key on
the reviewed fixed CLI. Edge will not duplicate cancel/retry. UNKNOWN after the
window retains custody, never force cleanup. This record is an observation of
the source owner's ACK, not a source terminal, Core ACK, installed fix or PASS.
