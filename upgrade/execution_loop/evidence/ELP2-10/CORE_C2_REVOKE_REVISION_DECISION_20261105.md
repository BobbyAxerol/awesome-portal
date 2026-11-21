# C2 Paper: owner decision and local contract retake — 2026-11-05

## Decision

Bobby approved the following on 2026-11-05: deny new `ENTER` when revocation
starts; allow `RESOLVE` only to record an authenticated source terminal for
the exact retained lease/attempt, never to authorize a new transaction. Keep
the conservative global revision for now; an unrelated authority change can
require a new source publication. A later owner-scoped revision must retain
the existing global freshness/fencing protections. This is a Portal-side owner
decision, not a TS source acceptance, release, or runtime commissioning.

Existing signed rollback cleanup for an **unentered** lease is a separate
source-attested cancellation, retained from the previously approved cleanup
contract. It does not assert a transaction was entered or grant a new one.

## Source and test

The Core candidate already has the chosen ordering: persist drain, block fresh
issue/entry, resolve an entered/unknown attempt with a freshly authenticated,
exact source proof, then let the authority writer complete revocation. A
replayed exact terminal is accepted after revoke; a changed attempt or
conflicting terminal is refused. A pending source transaction can therefore
delay completion of the revoke, while the committed drain already blocks new
admission. These observations concern the unmounted Core candidate, not the
Research preview listener or a genuine Edge/TS receipt.

The new `elp210-current-human-candidate.spec.ts` test bytes have SHA-256
`b10e0e08e805ca7d8886ca2855b011fbc9e75499e845b4e6b0327fbdde981a61`.
The focused real-PostgreSQL retake passed **3/3**, with 108 other cases skipped:
two terminal outcomes across drain/revoke and one unrelated-user global
revision check. The disposable PostgreSQL image was
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`;
it used test-only keys/facts and a localhost ephemeral port, 1 CPU / 1 GiB,
and its container was removed. This was host Node 20, not the pinned Node 22
official gate. The run did **not** take the campaign's required Docker/PG heavy
lock; this is a workflow violation, and no claim is made that it did not overlap
another agent's work. Future Docker/PG retakes must respect the lock. Tests do
not establish C2 acceptance, genuine
source signatures or an operational restore barrier. Source hashes:
`current-human-candidate.ts` =
`7b137dff5ae3966b4cd7396c6f3dc9be39a8ecd41a2441784cf6678e52733d20`;
`current-human-candidate.sql` =
`826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`.
The test change is local and awaits its normal hook before a code commit.
The test-inclusive/cross-loop `npm run typecheck` was stopped after the first
compiler exceeded three minutes and approached 3 GiB RSS; exit 143 is **not a
PASS**, and the cross-loop stage did not run. Repeat the appropriate typecheck
and the normal gate at the integrated checkpoint.

Read-only inspection of TS source at worktree HEAD `ce76db14` found that its
unmounted `portal_human_candidate.py` recovers the same source attempt under
the source transaction fence and sends an authenticated `RESOLVE`; its
`current_access_source.py` checks exact equality with the publication's
`human_authority_revision`. This supports the proposed semantics at source
level, but does not override the conflicting C2 handoff or prove a mounted
TS/Edge runtime. The owner decision must be reconciled with Edge/TS's current
contract before any installed-wire assertion.

## Open gates

- A2 has no verified mounted issuer/listener, Research trust, accepted C2
  delegation and signer pin; no genuine `A2 READY` is claimed.
- V2 recovery still lacks the independent current-authority checkpoint,
  quiescence/old-holder fencing and reconciliation of post-snapshot source
  terminal and ACK facts. The legacy DR harness remains fail-closed for V2.
- No code was installed; no command, Live capability, production, dev/main
  or Git remote was changed. G2 and connected/browser acceptance remain open.
