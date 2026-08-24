# Governance chain — layout proposal đo bằng px (EL-V2-05, §14.5)

Ba màn dùng **một khung**: masthead → decision strip → tabs (canvas) → **sticky decision bar** ở đáy
viewport (verdict · reason · nút), rail phải = Next → Blockers có tên → Freshness/SLA → Provenance.
Quyết định không bao giờ rời viewport; nền không đổi (Carbon), "đang quyết định" = elevation của bar.

## Kích thước chung (1440×900: canvas 1144, main 780, rail 340; fold 828)

| Vùng | y | cao | vai chữ |
|---|---|---|---|
| Masthead | 40 | 76 | title 24 · id meta 11 · badges meta 11 · purpose body 13 |
| Decision strip 5 ô | 124 | 76 | th 11 + kpi 24 mono |
| Tabs + panel | 208 → | ≥ 400 | control 13 · data 12 / num 14 |
| **Sticky decision bar** | bottom 0 | 64 (1 dòng lý do) → 96 (details mở) | control 13 · body 13 · meta 11 |
| Rail | 40 → | theo nội dung | section 15 / body 13 / meta 11 |

## Approval Inbox (4a)

- Masthead: `Approval Inbox` · badges `7 PENDING` · `1 OVERDUE` (bad) · purpose *"What waits on you,
  and what breaches SLA?"*
- Strip: pending · overdue · due soon · needs you · not yours.
- Filter chips giữ nguyên (Mine disabled — BR-EX-32). Tab **Pending** (bảng 8 cột, cột age/SLA =
  **thanh compact + số**, không câu "overdue since…") · **Recently decided** (+ nút *Full history* disabled:
  endpoint chưa có — BR-EX-35).
- Rail: Next = dòng `needsYou` đầu tiên + Open · Blockers = các dòng OVERDUE và BLOCKED (tên request)
  · Freshness = sort rule + trạng thái queue · Provenance = policy version · actor · roles.
- Không có decision bar (Inbox không quyết định).

## Gate R1 (1a)

- Masthead: alpha · RC · `AP-201` · badges `GATE R1` · `PENDING 1/2` · `SoD OK|VIOLATION` · SLA.
- Strip: blocking · warnings · insufficient · quorum · conditions.
- Tabs: **Checklist** (EvidencePanel, mỗi mục 1 dòng + icon) · **Passport** (8 dòng immutable) ·
  **Evidence** (chart IS/OOS/holdout — chưa có series publish ⇒ trạng thái honest, BR-EX-34 §R1) ·
  **Limitations** (bảng 4 loại: lineage · warning · restriction · waiver, expiry là cột) ·
  **Conditions** (list 5 trường + composer).
- Sticky bar: verdict chip · reviewer note (reason của decision) · `Request changes` **disabled** (verb
  chưa publish — BR-EX-36) · Deny · Approve with condition · Approve · lý do khoá 1 dòng + details.
- Rail: Next = "Ready to decide"/"Approve blocked" · Blockers = checklist fail/watch/insufficient + locks
  · Freshness = SLA · Provenance = passport digest (head-6/tail-2 + Copy).

## Gate R2 (1b)

- Masthead: subject · `AP-352` · badges `GATE R2` · `R1 APPROVED · AP-201` (link) · `PENDING` · `SoD`.
- Strip: locks · capital breaches · quorum · conditions · R1 expiry.
- Tabs: **Capital preview** (bảng before/after mono, **một** chip `PREVIEW`, viền elevation — không đổi
  theme) · **Readiness** (2 nhóm dl) · **Observation policy** · **R1 reference** (decision · digest · expiry)
  · **Conditions**.
- Sticky bar như R1; câu *approve = grants authorization only* nằm ngay trong bar (T hợp lệ).

## Ma trận tương tác / trạng thái

| Lớp | Control |
|---|---|
| navigation | Inbox row → R1/R2/Exit theo gate; R2 → R1 reference; Exit → back giữ `from` |
| write (verb publish) | Approve / Approve with condition / Deny / Promote / Extend / Reject — plan→apply→poll |
| disabled+reason | Request changes (BR-EX-36) · Full history (BR-EX-35) · Mine (BR-EX-32) |
| role matrix | creator (SoD VIOLATION) · reviewer OK · denied (không eligibility) · expired · conflict 409 |
