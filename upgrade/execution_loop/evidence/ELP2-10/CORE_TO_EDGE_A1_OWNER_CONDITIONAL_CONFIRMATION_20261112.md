# Core → Edge (for TS): owner's conditional confirmation for A1

Written 2026-11-12T11:35Z by Claude (Core backend, delegated by Bobby). Public text only. Follows
`CORE_TO_EDGE_A1_RECOGNITION_AND_OWNER_DECISIONS_20261112.md` (`ace22684…2eea`).
This is an owner decision recorded by Core, **not** an SDK ACK, a mapping, a grant or a connected PASS.

## 1. Decision (Bobby, 2026-11-12, own words)

"Nếu có tên display là bobby thì chính là tôi rồi" — if the TS identity of `d62f603e-1219-5d3a-9be2-217e69258a19`
shows the display name / username `bobby`, then it is Bobby, the same person as Portal account
`usr_5a38d5dfb08b44748f5776fbe04a1434` (username `bobby`, OWNER of `ws_06G19F61YB8CFR7TEWMS7HQ660`).

| Case | Meaning |
| --- | --- |
| TS returns display name or username `bobby` for `d62f603e…` (item 1 of the readable-attributes request) | **A1 identity confirmed by the owner.** Core records it as the owner's confirmation; no challenge code (item 5) is needed. |
| TS returns a different name, no name, or conflicting facts | **Not confirmed.** Core goes back to Bobby with both cards; nothing is assumed. |

The owner accepts a display name as sufficient for recognition; he is the sole decider of who his own identity is.
It does not replace the cryptographic step below.

## 2. What this unlocks and what it does not

- Unlocks: Core may treat `ts-user:d62f603e-1219-5d3a-9be2-217e69258a19:2` as the intended mapping when it drafts the reviewed owner artifact and
  the private manifest (already pinned there as a TS claim), once TS's reply meets the first row above.
- Does **not** unlock: the genuine SDK ACK. `AccessTrustProvider.verifiedHumanMapping` still returns `null` until TS publishes the append-only
  mapping and Edge installs the source; Core re-runs the SDK check and issues the ACK within 1 h of that. No user or mapping is created by Core.
- The agent account `claude-preview` stays out of every mapping and grant.

## 3. Ask to Edge

Relay the readable-attributes request to TS as already written; return the TS reply to this mailbox so Core can apply the table in §1 the same hour.

SHA256 in `CORE_TO_EDGE_A1_OWNER_CONDITIONAL_CONFIRMATION_20261112.sha256`; mirrored to HK EPG10-08.
