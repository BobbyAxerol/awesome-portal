# C2 checkpoint operation snapshot — 2026-11-05

Status: **SOURCE-ONLY, NOT INSTALLED, NOT A RECOVERY CUTOVER**. Baseline
`2faa8968fddbde59b2e59525e334ba3d83886144` plus uncommitted candidate work.

`RestoreCheckpointAuthority.append` now copies the four operation fields before
validation and before the first await. This keeps validation, event hash,
database write and same-operation replay tied to the same input even if a
caller mutates its object while a connection or transaction is pending.

## Pins and focused checks

- `restore-checkpoint-authority.ts`: SHA-256 `a145e7a1bc15fef0ed9facc973fb412f4fd78f07cf8e5e62870057493c672928`.
- `restore-checkpoint-authority.spec.ts`: SHA-256 `344dda0716a3ca6211b9b51cb42d682c4b09d810efa0137f812f7f87f83b9411`.
- `restore-checkpoint-authority-pg.spec.ts`: SHA-256 `cf2231177eeb608537f0d72d627c3b6ba7d300d9509d7588c8a516d146694e42`.
- `scripts/test-elp2-restore-checkpoint-pg.sh`: SHA-256 `37b4c824a46fc1bc6eff4392e277da20fed472a8c5353913639527998991c50e`.
- Focused unit: **5/5**, exit 0. An initial invocation failed before running
  tests because worker flags were supplied twice; the corrected invocation
  used the package defaults.
- Two disposable PostgreSQL clusters: **5/5**, exit 0; includes mutation during
  connection I/O, exact replay, concurrent writers, lost COMMIT response,
  different-cluster pin and corrupted history. The bounded runner tears down
  its own containers and internal network.

These tests do not prove independent administrative or failure domains, source
provenance, a fence on an old holder, terminal/ACK completeness, or permission
to resume a restored runtime. Those gates, genuine A2 and integrated hook
remain open. No runtime, source grant, signing or frontend was changed.
