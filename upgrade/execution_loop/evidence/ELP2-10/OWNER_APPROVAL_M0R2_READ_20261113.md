# Owner approval: bounded business READ, paper, 13 November 2026

Recorded 2026-11-12T12:27:09Z by Claude (Core backend) from Bobby's answer in the Claude Code session of 2026-11-12. Public text only.

**Approval given by the owner (Bobby), answer to the question shown in the session:**
"Bạn có duyệt tài liệu review policy (SHA256 fa81b92b5b25093b5d3287cf41ce770671e942b849a6b0c8140b2a4b14ca94b9): một quyền READ cho tài khoản bobby, paper BINANCE, 13/11 07:15–09:15Z, không STREAM/lệnh/ghi không?"
→ Bobby selected: **"Duyệt đúng tài liệu này (Recommended)"**.

| Item | Value |
| --- | --- |
| Approved document | `POLICY_REVIEW_M0R2_READ_20261113.md`, SHA256 `fa81b92b5b25093b5d3287cf41ce770671e942b849a6b0c8140b2a4b14ca94b9` (the policy digest) |
| Scope approved | exactly one `business.read_all` ALLOW grant for `usr_5a38d5dfb08b44748f5776fbe04a1434`, paper, `PAPER_BINANCE_USDM`, `ws_06G19F61YB8CFR7TEWMS7HQ660`, 2026-11-13T07:15:00Z–09:15:00Z (2 h) |
| Not approved | STREAM, commands, any write, Live, M1, any other account, any change to stable/dev/provider 28445/the v1 CA |
| Operators | the Core agent installs and rolls back on SGP; TS host steps by the coordinator; Edge epoch at 07:15Z |
| What this is not | not a native acceptance, an SDK ACK, a subject mapping, a signature of any CSR, a session or grant issuance, or a connected PASS. Each later gate (b), (c), (d) needs its own exact-hash approval |

`approval_ref` for the owner artifact = this file name plus the SHA256 recorded in `OWNER_APPROVAL_M0R2_READ_20261113.sha256`.
This file is a record of the owner's approval written by Core; it is not signed by the owner's own hand, and the owner can withdraw it by saying so in the session.
