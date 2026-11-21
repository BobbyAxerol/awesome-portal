# Codex → Claude: Research Control API dark-route swap

2026-11-10. Bobby asks Claude to take this work. Scope is the Research preview
only; do not change dev/main/stable, Edge, credentials, command or Live.

## Source and expected behavior

The two routes are bootstrap dependency keys, not environment flags. Both
commits `1c6a13e1c0252c18eeb8ea56aa53e3487f28b157` and
`14f0cfdeb2b783266543473b60270219d0525990` are ancestors of canonical
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`. Consult
Claude's handoff at `f357bf3e9967110bd5d16ae4c963ef738e14e92d` in
`SLICE_CODEX_CONTRACT_CONSUMERS_2026-10-29.md`. The running Research process
has `EXECUTION_READ_PROFILE=retained_review_v1`, `PORTAL_ENV=local`,
`AUTH_MODE=dev`, command `node dist/main.js`. The two routes remain deny-all /
source-dark until authority is commissioned; do not turn on a source.

## Current observed runtime and stop conditions

- Running `portal-research-preview-control-api-1` uses image ID
  `sha256:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`.
  The `:rf02` tag instead points to `cf60a6044b8b`, which Claude reports lacks
  the equity bootstrap. Never blindly `compose up` against the mutable tag.
- Read-only Research DB check: authority revision 128, drain null, one lease
  `COMMITTED`, unresolved obligations 0; native-read table has 20 rows: 18
  `SERVED` / `resolve` and 2 `CANCELLED` / `cancel-unentered`, all source
  reconciled. Runbook G5 currently states zero native-read rows, so this is
  **not G5 PASS**. Determine whether a newer authorized terminal-history
  disposition applies; do not delete, force-close, reset, or assume expiry
  clears custody. If unresolved, stop and return the exact owner/action.
- One Research run `rrun_5e1185f847dddd418bdbd1f9f32b87c7` remains `QUEUED`
  with last update 2026-10-02 UTC. Determine whether worker/queue can still
  consume it and ensure no in-flight run is harmed by any restart. Do not
  modify the run merely to clear the check.
- Main checkout `/home/bobby/portal-research` contains extensive shared WIP.
  Do not overwrite, stage or incorporate it blindly. Prepare a clean,
  explicitly pinned source/build and preserve existing runtime/rollback image.

## Requested work

1. Review current applicable operator runbook G1–G12, including G5 custody,
   G8 backup and G10 rollback; establish whether it applies to this exact
   retained-review server and record any later authorized disposition. Check
   current source/runtime/schema and review prepared inputs; no claims from
   old or expired trust windows.
2. Build a uniquely tagged, revision-labelled image containing both bootstrap
   commits using an isolated pinned source. Verify both compiled bootstraps,
   entrypoint, migration/schema compatibility, and focused tests. Do not
   accidentally compile the shared unreviewed WIP into the image.
3. Only if applicable stop conditions, backup, rollback and custody checks
   pass: replace **only** Research `control-api`, preserving config and all
   data. If they do not, do not swap; report exact missing proof or input.
4. Record before/after image IDs and container start time, health/readiness,
   and authenticated/unauthenticated route outcomes, checking existing
   Research and Execution preview paths as appropriate. A 503 or typed
   absence is expected and must not be represented as a connected source.
5. Return receipt path, precise result and remaining gate; do not push. If
   Claude cannot operate this runtime, return the prepared source/image and
   exact checks to Codex without declaring the swap complete.

No secret values, tokens or cookies in the handoff, logs or Git.
