# Policy review for owner approval: bounded business READ, paper, 13 November 2026

Prepared 2026-11-12 by Claude (Core backend) for Bobby (owner). Public text only: no secret, no key, no token.
**This file is a review request, not an approval.** Nothing in it is installed, granted or signed. The SHA256 of
these exact bytes is the *policy digest* the owner artifact will carry; if one byte changes, the digest changes and
the approval must be repeated.

**Tóm tắt cho Bobby (tiếng Việt).** Bạn đang duyệt đúng một quyền: tài khoản `bobby` được ĐỌC (không ghi, không lệnh,
không STREAM) dữ liệu paper BINANCE của trading-system, trong workspace "Retained Execution review", từ 07:15Z đến
09:15Z ngày 13/11 (14:15–16:15 giờ VN), đúng 2 giờ. Sau đó quyền tự hết hạn; Core thu hồi lại lúc khoảng 09:20Z.
Đọc xong, nếu đồng ý thì chỉ cần nói rõ "duyệt" cho tài liệu có SHA256 ghi ở cuối; Core sẽ ghi lời duyệt đó thành file.

## 1. What exactly is being allowed

| Item | Value |
| --- | --- |
| Who may read | Portal account `usr_5a38d5dfb08b44748f5776fbe04a1434` (username `bobby`), the protected owner. No other account; `claude-preview` gets nothing |
| Where | workspace `ws_06G19F61YB8CFR7TEWMS7HQ660` ("Retained Execution review"), environment `paper` |
| What | action `business.read_all`, effect ALLOW, **one** grant, plan `READ_ONLY` |
| Which data | profile `PAPER_BINANCE_USDM` (venue BINANCE), 49 relations / 895 columns, parent-scoped (`account_balances` joined to `accounts` with `mode='paper'` and `venue='BINANCE'`), `portfolios` as shared database reference only |
| Catalogue seal | `aac7f93efaa415d222657ce65751302c597248c5a0362ae19ba2b79f9100b353` |
| Profile seal | `c8fb434421f2a03544142253d7172b2efafea37a80a83cd51e84a80644f2d7aa` |
| Field policy | `bee80b18f02444658e8bdc12a098bf3bffebf60fd993d64cc3779e4f922f7dbc` (reference `edge-m0-r2-parent-scope-20261112/binance/serving-policy.json`, bundle `SHA256SUMS` `0e8cb95ee51d47e8dfaeca26c5bb21ad9d02169db8cc3fab29d2aab7ef58d271`); these three seals are the ones TS ACCEPTED on 2026-11-12 |
| When | grant `2026-11-13T07:15:00Z` to `09:15:00Z` (`1794554100000`–`1794561300000`), exactly 7,200,000 ms; domain seal `07:00:00Z`–`09:15:00Z` |
| Identity of the policy | revision `policy-m0r2-read-20261113-01`; grant id `grant-m0r2-read-20261113-01`, revision `rev-1` |

## 2. What is NOT allowed (and stays off)

STREAM (no stream grant exists and none is created to satisfy a check); commands, orders, any write; Live; M1 and
absence authority (both off); any account other than the protected owner; any relation outside the 49; the 13 sibling
child relations (omitted until bound); reads before the native acceptance, current policy and a real session; any change
to stable, dev, provider 28445 or the v1 CA. The runner is bounded: 30 s total, at most 5 reads, 1 MiB per response,
stream probe off.

## 3. Bounds that make it finite

Grant ≤ 2 h (Plan B ceiling, enforced by Core code) and never beyond the renewed source trust (requested end 10:00Z).
Portal acceptance session 45 min, with at least 630 s left when the runner starts. Native lease and human JWT 60 s,
unchanged. Source: 5,000 ms, 32,768 B request, 32,768 B response, 1 in flight. Source leaves valid 06:30Z–10:00Z.

## 4. Who does what, and how it is undone

Bobby approves this file. The Core agent installs and rolls back on the SGP side; the TS host steps (signing, role,
listener) are run by the TS coordinator; Edge activates the epoch only at 07:15Z. To undo: revoke the READ grant and the
acceptance session (Core), disable the overlay (Core), Edge's own named rollback; the grant also expires by itself at 09:15Z.

## 5. What this review does not prove

It does not prove that J1–J4 or the first-populated-row checks pass; those are checked in the real rollout. It is not a
native acceptance, an SDK acknowledgement, a mapping, or a connected PASS. The subject mapping to a TS user does not exist
yet: it is created by the genuine identity step and read back by the SDK before any native acceptance.

## 6. Decision requested

Bobby: approve (or return changes to) exactly this document. On "approve", Core writes `OWNER_APPROVAL_M0R2_READ_20261113.md`
quoting the approval and this file's SHA256, and uses `approval_ref` = that file name plus its SHA256.
