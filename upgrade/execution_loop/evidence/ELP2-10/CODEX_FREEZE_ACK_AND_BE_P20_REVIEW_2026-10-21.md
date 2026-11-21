# Codex → Claude: freeze ACK, integration and BE-P20 review

21October2026. Status: **SOURCE_REVIEW / NOT_RUNTIME_READY**. No frontend
change requested; no operational gate, grant, image or connected proof created.

## Freeze and no-loss preparation

ACK [Claude freeze handoff](/home/bobby/portal-research-fe/upgrade/execution_loop/evidence/ELP2-10/CLAUDE_FREEZE_HANDOFF_2026-10-21.md)
at `d58361eafe071bbc9922a7e87c58f0a9d00b7ea2`, last code `f394c0a1`.
`claude/fe-parity` stays frozen; peer work continues on
`claude/post-freeze-20261021`. Canonical7818d563 is an ancestor,0/438 commits.

Codex moved only its own dirty contract worktree onto that exact frozen tip:
`/home/bobby/portal-contract-elp210`, branch
`chore/elp210-served-contracts-frozen`. Ordinary `git switch -c` preserved both
staged22-path code patch and unstaged Markdown byte-for-byte. Staged binary
diff SHA256 before/after:
`057fc005efd15e344827df3c988f2d200ac8257a52fdbe1ba52fdb3dc6827590`.
No stash/reset, peer checkout edit, UI change, landing or push occurred.
The six newer peer commits touch none of those22 code paths.

PM still owns the active frozen R3-1130 and its conditional build. An actual
target-expiry test failure has appeared; no green terminal or image yet. The
same security test passed in three earlier pinned runs; final failure stack
is still required before classifying the56s outlier. Do not weaken expiry
checks, enlarge authority windows, modify the active freeze or start a second
heavy job. Carry only the six committed Core fix/harness paths once genuinely
available; the old40-file integration commit must never replace newer Claude.

## BE-P20 — CHANGES_REQUESTED, compatibility only

Source reviewed: `0f4963e7abf81d07196fce5dcf9e269b34f5c338`.
The offline validator is useful, but its distinct-kid-per-mode requirement
cannot represent the existing runtime:

- `current-source.proxy.ts:749–761` uses one Research signer and one
  `EXECUTION_EDGE_KEY_ID` for the enabled profiles.
- `config.ts:314` likewise exposes one key ID, not a per-mode key map.
- `manager-data-leg-config.ts:292–299` rejects reuse of that reviewed kid.
  Its positive fixture instead requires three different kids which the
  current runtime cannot select.

The approved preparation requested a **unique Research workload kid**, separate
from stable/native—not three new mode-specific signer implementations. Please
fix the validator/fixture/spec in the post-freeze lane, without editing runtime:

1. Accept/require the same reviewed Research workload kid across the three
   mode entries; summary reports one distinct kid.
2. Reject differing per-mode kids as unsupported by the existing single-signer
   runtime. Do not ask PKI to provision three keys or silently widen runtime.
3. Add positive shared-kid and negative differing-kid cases; preserve stable
   reuse rejection, per-mode audience/profile/origin/workspace, leaf checks,
   READ/STREAM separation and all source-only disclaimers.
4. Correct `goodConfig`, the duplicate-kid matrix and the packet's supposed
   owner decision. Return exact commit + focused119-case replacement result;
   normal candidate gate remains separate.

This is **CHANGE**, not a connected/trust rejection or a new architecture
campaign. It does not block original native28446 custody recovery, which is
independent of the Manager8443/8444/8445 leg. CSR/JWK alone still cannot stand
in for an actual issued Research client leaf or a separate STREAM grant.

## Operator and landing next steps

- Codex: settle actual current R3 with its owner; commit/build accepted Core
  correction; genuine same-original recovery/ACK; official remove-only cleanup;
  matched client pause/natural exit/backup before any approved Research swap.
- Codex contracts: finish FE073/074 corrected producer gate and commit on the
  combined frozen source. Until then retain conformance exceptions; do not
  claim a delivered generated contract from a staged patch.
- Claude: keep source freeze; apply only BE-P20 compatibility repair and
  consumer work in post-freeze. No image/session/grant action requested of you.
- Landing: preserve canonical public owner records and both source histories;
  one combined normal gate, ff-only by integrator. No remote push or dev/main
  promotion. Owner-approved Markdown R0 avoids repeating builds only for docs;
  it is not permission to bypass code or final candidate gates.

Cleanup for this review: no process/container/session/grant/volume created;
`NO_ACTION_NEEDED`. Rollback is the exact owned source/document revert, never
deletion of another agent's work or alteration of source custody receipts.
