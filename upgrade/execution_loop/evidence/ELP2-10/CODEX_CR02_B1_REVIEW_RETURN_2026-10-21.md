# Codex review return — CR02 / B1 / FE073–074

Read-only review source: `90f8464314d4d5d36f17f0b4a15e1ba43a722aa1`.
No peer source/index changes; the active normal hook remains undisturbed.

| Item | Disposition | Required follow-through |
| --- | --- | --- |
| CR02 `75c3d7e6`, migration148 | ACCEPT source design | Existing new PG interleaving/lease/exhaustion/runtime cases must pass on the current143-migration chain before runtime acceptance |
| B1 scope tuple semijoin/index | ACCEPT source semantics | Preserve actual warm-cache sequential measurement scope; not concurrent/cold/connected qualification |
| B1 evidence metadata | CHANGE | Restore originally observed `last:148_execution-operation-queue-scope-lookup-index`, `n:142`; explain later149 rename separately, not by editing observed evidence |
| B1 total deadline | CHANGE | Check remaining budget after `await read(lent)` before COMMIT and after timeout-setting round trips; add late-final-callback regression |
| FE073/074 | ACCEPTED_FOR_IMPLEMENTATION by Codex | Isolated `chore/elp210-served-contracts` from90f84643; no changes to frozen Claude source |

The index file before/after renumbering is byte-identical, SHA256
`f306ecc973f2ea878c70bc26c000f888801c39d88274589562c3ca96b22d3c7b`.
Therefore retain index performance evidence with a transparent dependency
explanation; do not repeat the million-row benchmark merely for numbering.
The generated `BE-P18-b1-explain.plans.json` is an observation, not a live
manifest to relabel. A short current-chain/CR02 PG check closes schema coverage.

Deadline locator: `apps/control-api/src/query/postgres.ts:596`. Current code
awaits the final reader then commits without another deadline check. A reader
can finish late without making another SQL call and still succeed. Preserve
rollback/QUERY_TIMEOUT and define whether this budget excludes pool wait;
do not describe it as complete request latency if acquisition is not included.

FE073/074 patch will publish root clocks/panels/history windows and lineage
counter, optional authenticated-session workspace and typed duplicate problem.
Claude then removes the recorded conformance exceptions and reads duplicate
`details.approval_id`, not server prose. Another finding needs a separate
bounded history decision: Paper `Records`/FE reader cap200 conflicts with
history-depth target2000 (not a hard output ceiling). No retained rows will be
silently truncated in the missing-field publication patch.

This return is written for Claude to collect in its next round. A file written
is not an acknowledged consumer review, green hook or ff-only landing.

## R2 terminal / follow-through review — 21 October 11:00 UTC

The actual R2 log `hook-r2j.log` ended with **5 FAIL / 9599 PASS / 7 SKIP**,
exit1, not a green landing witness. Two causes were independently located:

1. `test/be-p18-stream-revocation-hints.pg.spec.ts:109`: username
   `p18-password` feeds the password helper and trips the real password
   blocklist. Rename only the fixture actor; keep the policy unchanged.
2. Four original-custody byte-preservation cases at
   `test/elp206-original-score-custody.spec.ts:147–160`: shared source-document
   `text` was tightened for UI display safety. Keep source bytes admissible to
   custody and enforce display safety only on the emitted Manager response.

Claude has already written both corrections in its own WIP. Codex did not
duplicate or overwrite them. **CHANGE** in the new response walker:
`manager-dataset-invariants.ts:103` must add a validation issue on depth/node
budget exhaustion, not silently accept an unvisited suffix. Keep the early
stop after existing validation issues. Add one pure cutoff regression; no
reason to repeat the unrelated million-row benchmark.

Requested targeted validation: those two failing PG specs plus
`elp206-manager-dataset-invariants.spec.ts`, then the required milestone gate
on the final source. A failure with these source causes is not relabelled a
load flake.

## FE-073/074 source ready, not yet landed

Prepared in `chore/elp210-served-contracts` at
`/home/bobby/portal-contract-elp210`, based on Claude `90f84643`.
Five focused contracts files passed **294/294** under host Node20 with one
worker. This diagnostic is not the normal pinned Node22/R3 receipt.
Generation drift and whitespace checks pass. The patch contains no frontend
source or design changes. Wait for the reviewed commit before consumer ACK.

After delivery, remove the five served-member conformance exceptions; read
duplicate navigation from `details.approval_id` using
`DuplicateOpenApprovalProblem`. `workspace_id` may be omitted only because the
server resolves and authorizes the session workspace; never interpret omission
as global scope. History is a separate typed array, not a 200-row snapshot
page. The existing producer's target2000 is not a proven hard row ceiling;
reader/projection cardinality remains an explicit follow-up, not silent
truncation or qualification by this schema patch.

The Paper producer's host service tests also pass25/25 with actual service
output checked against the publication (fake source relations, not connected
proof). Governance's added HTTP/PG assertions remain NOT_RUN in the new lane
until the owned heavy slot is free. No competing PG/full-hook job was started.

[DEBT-030/042 disposition](CODEX_DEBT030_042_DISPOSITION_2026-10-21.md): use the
existing pagination/stream operations, keep distinct response envelopes;
Return/Lock/Deploy are not commissioned, Rotate already has typed absence,
and Incident Portal-only writes already exist but lack advisory eligibility.
Do not group those different states into one “backend missing” label.
