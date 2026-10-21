# Codex review and owner follow-through — 21 October2026

## C6: source review returned to Claude

Read cut: Claude `4ebc4d9e8d911354c32eda9473302b95af27b2dd`;
canonical remains `7818d5631e0da37563bca5715fd46d40b66ef1de`.
No new canonical code merge or remote push in this round.

**ACCEPT source**, independently reviewed, for all four requested corrections:

- `apps/control-api/src/query/postgres.ts:509–524,606–608`: total transaction
  deadline checked after timeout arming and after the final callback, before
  COMMIT; both gaps have regression cases. Pool acquisition is explicitly
  outside this transaction-work budget. It is not an HTTP latency claim.
- Predecessor `64244222` restores byte-preserving original custody and keeps
  display-safety validation on emitted responses only
  (`manager-model.contract.ts:16–19,184`).
- `manager-dataset-invariants.ts:100–115`: node/depth exhaustion emits
  `MANAGER_TEXT_WALK_BUDGET_EXCEEDED`, not silent success. Regressions cover
  node/depth bounds and the eight-issue early stop.
- Historical B1 plans JSON is byte-identical to observed `343f5bbb` evidence:
 142-migration/index148 observation preserved, current143/index149 explained
  separately. Index bytes remain
  `f306ecc973f2ea878c70bc26c000f888801c39d88274589562c3ca96b22d3c7b`.
  No repeated million-row benchmark solely for renumbering.

This is source acceptance, not the current-chain PostgreSQL/milestone gate
or connected runtime acceptance. Historical R2 failures remain failed.
Claude's commit also includes `CODEX_DEBT030_042_DISPOSITION_2026-10-21.md`;
distinguish existing APIs, missing consumers and uncommissioned executors.

The current request audit found no additional Codex implementation assignment
beyond C1–C7/FE073–074 under campaign§10.13. Two follow-ups for Claude:

- **ACCEPT S3-U2/BE-P14 SS-7** tightening: successful scoped reads have at
  least one profile disposition; publish `minItems:1` through the owning
  generator/schema and regenerate. State the exact runtime page invariants
  (`returned_count == items.length`, `returned_count <= limit`, and
  `has_more` agrees with a usable next cursor), with mutation tests. Do not
  claim portable JSON Schema enforces arbitrary cross-field array/count
  equality when the actual guard is Zod/producer logic; label both layers.
- **Paper history cardinality** remains a source/performance follow-up:
  preserve retained rows, measure bounded byte/cardinality behavior and align
  the FE validator. The FE073 candidate separates history from snapshot's200
  limit; it does not create a fake new hard cap or a performance receipt.

FE026 remains Bobby's pending finite-policy decision; FE039's nav replacement
is already implemented. New DEBT043–046 stay Claude-owned. Older OPEN labels
are not fresh instructions to duplicate that work.

## FE-073/074: source ready, not delivered yet

Owned lane `/home/bobby/portal-contract-elp210`,
`chore/elp210-served-contracts-r2`, based on the exact Claude SHA above.
Implemented Paper clocks/panels/lineage/history metadata and Governance's
optional authenticated workspace/typed duplicate Problem, generated types,
three synthetic canonical fixtures and producer assertions. No frontend edit.

Actually executed host-focused checks:294/294 contract cases and25/25 Paper
producer cases PASS. Host Node20 diagnostics are not the pinned Node22/PG
gate; new Governance producer cases still need that gate. Snapshot now tracks
the publication tool, new fixtures and Governance schema; generated checking
includes its drift verifier. Paper history is not a200-row snapshot; target
2000 is not a hard ceiling or a measured response-byte qualification.

**SOURCE_READY / NOT_COMMITTED / NOT_LANDED / NOT_RUNTIME_QUALIFIED**.
Claude may inspect this candidate but closes its conformance exceptions only
after the exact committed handoff. Do not parse error strings for approval ID.

## C1: actual gate failure and owner correction

PM-owned `pm-core009-owned-r3-1052` ended EXIT143 at11:18:17UTC;
watcher says `NOT_BUILT_R3_NOT_PASS`. Random `tmp.*` hostnames violated native
tests' numeric-only disposable-DB guard. Setup failures are not valid skips.
No image was built. PM cleanup observation11:18:48 records no live owned
group members and the exact Node/PG/network absent:

`/home/bobby/.local/state/portal-execution-elp210/20261021/pm-core009-owned-r3-1052/numeric-namespace-stop-after.json`

SHA256 `7f263004953487c094e3dc8b13bf41bf84fb66bfa599cb0665723219da91b510`.

Current numeric PID/random suffix correction is source-only at this cut,
runner SHA256 `fc6e3fabace93475357f5124d1c4f354a7f82ab2f92e2d16d86b395529c859d8`.
Keep guards/assertions/deadlines. Owning PM returns a new frozen source/index
and actual controller/terminal; do not relabel failed1052. Core starts no
duplicate full hook or build while that owner operates.

## C2: recovery candidates stay SOURCE_ONLY

Two new private helpers were prepared without operational execution. Review
requires three changes before use: fence **all** historical dispatch namespaces
(including original `cleanup-*` and kind `all`); require root-owned0600 swap
plan; bind the separate actual client-pause ACK into that reviewed plan.
No `.closed` receipt may be invented for an older helper that never wrote one.

Original lease/attempt, official stream→read→session cleanup, real source/Core
ACK, natural exit and post-quiescence backup remain mandatory. Failed1052
provenance pins intentionally cannot pass. The verifier's not-ready check
exits before Docker and produces no receipt. Re-pin only after genuine new
normal commit/build review. Recovery10:30–12:00UTC is availability, not new
authority or a client-pause ACK; obtain another window if readiness cannot fit.

## C3/C4: actual Manager PKI handoff and missing input

PM/Edge received `CORE009_MANAGER_PKI_OWNER_REQUEST_2026-10-21.md`, SHA256
`46a29cbc9db9144a1566180c6a9381be02edb57adbd7e68f573bd07b35686648`.
HK read cut11:18–11:20UTC: PM
`c43cfb2453b794cb9d8859fbcd0ede6807b75df9`, Edge
`d52f156d1ec68d3ff3b1671d9fa5b448460e4cb9`; WIP preserved.
No actual Research issuer reference/issued leaf or independent pause ACK was
found in inspected public owner mailboxes/journals.

Public files staged on HK at
`/home/bobby/secure/edge-core009-manager-data-public-20261021-c185ee3d/`:

| Public file | SHA256 |
| --- | --- |
|inactive-public-manifest.json|3702345b28b47cd65042f8709819202ed4c4b8261750c3c30c6787d7d04abd97|
|research-client.public.pem|5b42ebfcc008da59ad9eae3769f4aa047d17a20a9f706d4832e5ee896b66827a|
|research-client.csr.pem|41a94f899574d5bdf3e2dea139d23a5e2c4fcb1c467b2c5fdece14e3acea7f05|
|research-signer.jwks.json|a8b44aad42207d5a83dbe87230d05b6de2972a634b797c3bced869c0297eb50c|

No private key value transferred/printed. Native Ed25519/28446 and Manager
RS256/mTLS8443 differ. CSR/JWK staging does not activate trust; TLS/JWKS
reconciliation requires its own operational window, not the recovery window.

## Next work / exit

- Codex: finish FE073/074 pinned gate/commit when the heavy slot is free;
  review corrected Core normal/build pins, then exact original-key cleanup
  and the separately acknowledged image-only swap. No duplicate heavy queue.
- PM/Edge: corrected frozen normal/image receipt, recovery coordination,
  actual Research issuer/leaf. Whole-Fleet STREAM needs eligible source and
  its separate official grant; READ never grants STREAM.
- Claude: source fixes above accepted; continue UI/fixture and milestone
  gate. Consume delivered types after the exact committed handoff.
- C7: normal canonical Markdown commit, Claude freeze/ACK and exact green
  candidate precede ff-only landing. No squash over newer Claude backend.

ELP2-10 stays open: connected acceptance, financial mapping, approved
budget/calibration, coexistence/G2 and browser acceptance are not PASS here.
No dev/main promotion, release, command/Live activation or new push.

### Heavy-slot notice11:30UTC

Numeric namespace retake finished11:26:33UTC:85/85 cases and scoped PG
restore PASS; no full-normal/image claim. At11:29 read-only host inspection
found no active/queued commit or disposable test cell. Core started **one**
focused FE074 Governance producer cell under `/tmp/portal-heavy.lock`,
600-second outer bound, unchanged inner test deadlines. Log readpoint:
`/home/bobby/.local/state/portal-execution-elp210/20261021/fe073074-governance-focused-1130/controller.log`.
No further heavy job is queued; the contract source remains frozen. PM's
next normal gate must wait for actual lock release, not run in parallel.

### Actual follow-through11:38UTC — partial return, not READY

ACK the newly received
[Edge original08 acceptance handoff](EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF_2026-10-21.md)
(SHA256 `d5fd7ffbd9f7deb27ea1e572b9bf64cc2c0b6c5521366edb61772cf3d54c2a83`).
Its recovery/trust requests are separate; neither waits for financial mapping.
PM source readback11:37UTC is `2876bdafef9e326b41f70256ef8abb61c9f09786`;
Edge remains `d52f156d1ec68d3ff3b1671d9fa5b448460e4cb9`.

- FE074's actual focused Node22/PG gate ended11:33:23UTC, EXIT1,9PASS/1FAIL.
  The new test used Stan's session without workspace but evidence in Bobby's
  workspace.422 was correct isolation. Test source now checks explicit scope,
  refused cross-session evidence and a separate own-personal positive.
  Retake/normal commit remain pending; no producer authority was loosened.
  Full failure log SHA256
  `8dbc07b1b40d96676da6c30a3db6c2278ef28e2bf3a85232c68cd38babe143ca`.
  Its disposable cell was cleaned; no restore PASS claimed after the failure.
- PM owns a **new running** normal gate at
  `/home/bobby/.local/state/portal-execution-elp210/20261021/pm-core009-numeric-r3-1130/`.
  Normal controller/watcher are physically running, no terminal or image yet.
  Do not call this1052, repeat its unchanged native qualification, edit the
  frozen candidate, or queue another heavy gate behind it.
- Original cleanup metadata has two real EXIT75 `MANAGER_REVOKE_DRAIN_PENDING`
  results, not success. The new helper must explicitly recognize only this
  same-key continuation, pin the original artifact/custody and use fresh actual
  readback; no missing `.after`/`.closed` is synthesized. A genuine source ACK
  is the cancellation closeout, not a circular prerequisite to doing status →
  cancel-unentered. UNKNOWN/unrelated pending custody stays fenced.

**Window proposal, NOT ACK or authority:** if reviewed normal/build/cleanup
cannot finish before12:00UTC, match21October14:00–15:30UTC with Edge/PM for
recovery-only of the original identifiers. Preserve the expired original
session/grants and10:30–12:00 historical availability; do not extend them or
silently change helper clocks. Return explicit matching owner ACK before use.
Positive current READ/STREAM and all-mode PKI remain their own commissioning.

Installed image/config/schema pins in the earlier return have not changed.
Failed1052 provenance cannot be reused as a new gate. C1 commit/build, C2
recovery and C3 grant are not DELIVERED here. Source review/owner coordination
and scoped contract work are returned independently; C7 waits for actual
canonical commit plus exact Claude freeze/green gate and ff-only integration.

Cleanup candidate's final bounded correction is independently source-ACCEPTED:
SHA256 `882646fd3c42237b9026468e5b2659bf7843fbfbcb63bf908659e22ef799a726`.
Swap candidate stays `76fcdb4de54b245d46e66f2c4a313ea6358f5854d9e494bb66e8e48784fa64d8`.
`node --check` PASS. These are SOURCE_ONLY, not executable READY:1052 gate pins
remain deliberately invalid, new frozen normal/build receipt and matched
window/root-reviewed plan still required. No helper was operationally run.

## 12:10 UTC — actual gate failure, new Claude freeze and recovery preparation

This addendum supersedes the older source/window/helper preparation, not its
historical results. C1 is **not committed/built**: the PM-owned R3-1130 remains
physically active with its frozen ten files unchanged. Contracts1147PASS, but
the API log already contains one failure in
`elp204-explicit-portfolio-list.spec.ts`, clock-only `target-expiry` during the
later profile's final adapter wait (56030ms). Await its actual final stack and
cleanup; no competing gate or automatic image on a failed exit. The earlier
1052 exit143 remains a separate failed run.

Claude has now explicitly frozen `claude/fe-parity` at
`d58361eafe071bbc9922a7e87c58f0a9d00b7ea2` (last code `f394c0a1`). See its
`CLAUDE_FREEZE_HANDOFF_2026-10-21.md`; further peer work uses
`claude/post-freeze-20261021`. Canonical7818d563 is its ancestor,0/438 commits.
The six reviewed Core implementation/test/harness paths do not overlap the
six newer peer commits. FE073/074's22 owned code paths are staged in their
separate worktree; corrected Governance PG and normal commit still pending.
Do not qualify the new frozen source with old-Core test results, copy old
tracking files, change the peer checkout, or push any branch.

Private helper update is pin-only and independently **ACCEPT/source**:

| Candidate | SHA256 |
| --- | --- |
| cleanup-candidate.mjs | `50a0a3d72d7f03dbd3bd2b97014928382680a69c17bc3d4f2d817292a46051e6` |
| swap-candidate.mjs | `0c54ce991c6aad15275ad0ec4e5f982d687ea31f5bd9b579c6412a323e9e222d` |
| verify-build-provenance.mjs | `9e19b63d5a3cce2b7800f75a6bc743f88fe5cc96349203a6ad78762078b8d47d` |

All bind R3-1130 manifest
`e3609bad88033aaae07d6572ac11bdf721437b52202a9dc5d3d559b07f917828`,
the exact three controllers, genuine EXIT0/clean ten-file commit/completed image,
and unchanged schema/transport. Syntax checks PASS; no operational verb run.
The root0600 reviewed plan, actual matched Edge recovery ACK, historical
UNKNOWN fences, original same-operation continuation and separate client-pause
ACK for swap remain mandatory. A source pin update is not installation/READY.

The helpers deliberately retain the expired10:30–12:00UTC operator-use window;
14:00–15:30 remains **PROPOSED_NOT_ACKNOWLEDGED** at the latest actual read.
Edge/PM: return the same-original recovery-only availability ACK and independent
client-pause facts through the existing mailbox when genuinely available.
Never renew original session/grants or fabricate an ACK to fit this proposal.
Genuine Research PKI issuer/leaf remains a separate missing trust input; CSR,
JWK and historical retained snapshots are not commissioned Fleet READ/STREAM.

Next useful work: diagnose the actual failing gate with its owner, commit/build
the accepted correction, then fixed CLI against unchanged original runtime →
same-attempt terminal/CoreACK → official STREAM/READ/session cleanup. Only after
that consider natural exit/backup/image swap. No UI, stable/dev/main, provider28445,
new grant, runtime install, public-route change or remote Git push in this cut.
