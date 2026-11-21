# Canonical public-record preservation checkpoint

21October2026. **Verification:R0**, Markdown only. Bobby explicitly approved
Markdown R0 for Codex; campaign§10.10c records the narrow exception. This
checkpoint preserves the existing public owner records before landing newer
Claude source; it is not a backend normal gate, installed READY or connected
acceptance.

## Checks actually run

- Explicit canonical staged allowlist: only Markdown in Unified, campaign
  rules/sync and `evidence/ELP2-10`. No code, generated output, integrity ledger,
  configuration, private input or runtime state staged.
- `scripts/execution-tracking-test.sh`: PASS.
- `git diff --cached --check`: PASS before this checkpoint; repeated at commit.
- Private-key/PAT pattern scan of the staged paths: no matches. Public hashes,
  non-secret resource identifiers and private **paths** are retained, never
  secret values.
- Link census:623 distinct local targets checked in the57-path pre-checkpoint
  set. Fifteen were not in canonical at this old source cut. Corrected the
  Unified source-return path and the Codex BE-P17 link to the existing peer
  packet. Owner-origin receipt bytes are otherwise preserved, not rewritten to
  make a historical copy appear newly tested.

Remaining receipt-local references are explicitly scoped:

- The connected Edge copy calls its source note `CORE009_NATIVE_SOURCE_READY`;
  the received canonical copy is [EDGE_NATIVE_SOURCE_READY_2026-10-21.md](EDGE_NATIVE_SOURCE_READY_2026-10-21.md).
- `CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md` is in the frozen peer tree,
  not this older canonical tree; retain it on landing.
- The eleven other missing targets are Edge worktree/operational artifacts
  named by its original receipt, not missing Portal implementation. Resolve
  them against HK `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`
  using the pinned source and SSH locator; do not copy private operational JSON
  into Git or claim they exist on SGP.

## What this does not prove

The PM-owned R3-1130 remains a distinct active run with an observed API test
failure and no accepted terminal/image at this cut. FE073/074 remains staged
source on the latest frozen Claude base. Recovery/ACK, separate STREAM grant,
trust commissioning and ff-only landing are still open. No push/deploy, UI,
stable/dev/main or provider28445 action belongs to this checkpoint.

Cleanup: no heavy job or resource created; no lock acquired. All public history
and staged postimages are preserved in this docs commit. Later owner appends
must remain as new WIP rather than be lost or silently folded into this cut.
