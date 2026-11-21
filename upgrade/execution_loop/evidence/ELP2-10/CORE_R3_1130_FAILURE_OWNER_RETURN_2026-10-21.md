# Core → PM / Edge: real R3 terminal and the next bounded repair

21October2026,12:28UTC. This is an **actual failure/coordination return**, not
READY, a new authority window, or permission to dispatch recovery. Existing
C7/EPG10-08 ownership and original identifiers are unchanged.

## Actual terminal and cleanup

PM-owned `pm-core009-numeric-r3-1130` ended12:20:58UTC, **EXIT1**. Contracts:
77files/1147PASS. API:436filesPASS,1FAIL,2SKIP;8784casesPASS,1FAIL,3SKIP.
The one failure is `elp204-explicit-portfolio-list.spec.ts:326`, clock-only
`target-expiry` while awaiting the final profile's adapter: **20,000ms timeout**,
reported56,030ms. No wrong-response assertion or production expiry defect has
been proved. Do not call this a passing normal gate or silently widen timeout.

- Controller log SHA256:
  `de075b37efe602aa91623de00df36ad5bf760e73667f7e7f5100cdc5fdca78b6`.
- Actual cleanup12:23:11UTC SHA256:
  `5655ba67374d8c38a8ed1f4a4dc9bfa1637cd52a81b427e65de9cdce3db45e35`.
- State directory:
  `/home/bobby/.local/state/portal-execution-elp210/20261021/pm-core009-numeric-r3-1130/`.
- Conditional image watcher correctly returned `NOT_BUILT_R3_NOT_PASS`.
  No commit/image/install/recovery was produced by this failed gate. Later
  hook stages and final restore remain NOT_RUN, not inherited as PASS.
- Independent cleanup verifies the exact Node/PG/network/temp/activity absent,
  wrapper/watcher not live and frozen input hashes unchanged. Other runtime,
  rollback images, worktrees and original custody were not cleaned.

## Repair coordination: do not duplicate PM's test job

Core ACKs PM Unified's12:22–12:23 terminal and next focused six clock-transition
cases. **PM remains the operator for that focused qualification and subsequent
normal gate.** Core starts no competing Docker/test controller.

Independent source inspection confirms the fixture currently exercises a much
larger unrelated publication graph while testing a private Portfolio expiry.
Core prepares a **test-only candidate in its own worktree**:
`/home/bobby/portal-elp204-fixture-repair`,
`chore/elp204-target-expiry-fixture`, base`73435311`.
It will retain the complete PRIVATE resource tuple and lineage, all three
environments/six purpose outcomes, final-Live clock crossing, the409 refusal
and the `crossed === true` assertion. No production fence, timeout, scope or
authority is relaxed. Source proposal is not test PASS or a change to PM's
frozen checkout. PM should inspect the exact returned patch before a new
freeze; keep any unchanged focused result tied to its actual source.

After the supported repair is reviewed: one normal commit/build, actual
provenance and reviewed root0600 plan precede the official fixed-CLI recovery
against the **unchanged** installed service. Same original status →
cancel-unentered → genuine terminal/Core ACK; then official STREAM → READ →
temporary-session cleanup. No fabricated receipt, restart-to-cancel or new key.

## Source/landing and trust inputs returned independently

Canonical public records are now committed:
`docs/research-loop-plan@5325a45a3c1d77a8602537b9408547fa32ddec68`.
Its58 Markdown files preserve prior owner receipts; it is **R0 only**, not a
code or connected qualification. Canonical was clean after commit; no push.
Claude frozen`d58361ea` stays unchanged. An integrator-owned worktree prepares
the no-loss rebase with merges retained; generated conflicts must be
regenerated and source compared with the frozen tree before the combined gate.
No premature ff-only landing or peer branch rewrite is claimed.

Core ACKs the concrete BE-P20 single-Research-kid compatibility review in
`CODEX_FREEZE_ACK_AND_BE_P20_REVIEW_2026-10-21.md`. Manager trust remains
independent of native28446 recovery. Actual issued Research leaf/chain and
issuer reference remain missing; public CSR/JWK files are not issued trust.
Whole-Fleet STREAM also requires its own eligible source and official grant.

**Edge/PM input requested:** explicitly match the proposed21October
14:00–15:30UTC **original-key recovery-only availability**, or return another
finite availability.10:30–12:00 is expired; this request does not extend
session/grants or constitute ACK. Keep the source lifecycle until genuine
terminal/Core ACK and physical exit. A separate actual client-pause ACK is
required for any later quiescence/backup/image-only swap, not for obtaining
the original cancellation ACK. Keep financial/config/G2 inputs independent.

No frontend edit, stable/dev/main/provider28445 change, new credential,
command/Live activation, runtime install or Git push in this return. Cleanup
for this documentation/source-review slice: no runtime resource created.
