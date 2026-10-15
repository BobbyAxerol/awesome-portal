# Phase packet template — Execution Loop V2

Template, **không là receipt đã thực hiện**. Copy vào
`evidence/<phase-id>/README.md` khi Bobby giao phase; receipt lớn tách file/link.
Phase nhỏ không cần nhiều file boilerplate. Tuân thủ
[rules §7–8](AGENT_WORKING_RULES.md#7-phase-approval-và-bàn-giao-hai-chiều-bắt-buộc)
và [Unified §14](../UNIFIED_IMPLEMENTATION_PLAN.md#execution-loop-v2).
Khi copy, sửa relative links theo thư mục đích.

## 1. Scope / entry gate

- Phase/owner/date Asia/Saigon, approval reference, goal/requirement IDs.
- Nếu batch: approval liệt kê phase nào, phase hiện tại/thứ tự, dependency gate
  chuyển bước; giữ riêng packet/exit/journal từng phase, không blanket COMPLETE.
- Guide/spec/HiFi sections/revisions; repo/worktree/branch/full SHA/dirty paths.
- Source vs deployed image/schema/config; external source pins/measurement locks.
- Dependency verdict; reuse/change/new; owned/forbidden files/exclusions.
- Target/resource ceiling/test plan; risks/rollback.
- Nếu dùng agents: task/owner/path allowlist/dependency/output/test budget;
  một writer cho shared paths và một integration coordinator.

## 2. Requirement và evidence matrix

| Requirement/gate | Reuse/change/new | Code/schema/fixture locator | Test/receipt + dependency pin | Actual result | Gap/owner |
| --- | --- | --- | --- | --- | --- |
| Điền khi thực hiện | — | — | NOT_RUN | NOT_RUN | — |

Ghi command/exit code/duration/scope; receipt reuse có impact analysis. Fixture,
source presence, DB/runtime/browser là proof khác nhau. N/A cần reason.

## 3. Delivery và resource closeout

- Commits/working-diff hash, landed state, push/deploy approval nếu có.
- File/line stats so baseline: implementation/generated/tests/docs riêng.
- Contract compatibility/migration/generation command và version.
- Measurements hoặc NOT_MEASURED; resources tạo/dọn/giữ/lý do; rollback.

## 4. Contract / consumer handoff

| Requirement → screen/action | Operation/type/version | Semantics/permission/absence | Fixture/real example + provenance | Consumer task / acceptance | Delivery / acknowledgement |
| --- | --- | --- | --- | --- | --- |
| Điền hoặc N/A(reason) | — | — | — | — | AWAITING_CONSUMER_REVIEW nếu chưa nhận |

Ghi readiness design/fixture/real read/command và môi trường; errors, pagination,
UTC/exact decimals/disabled states/dependencies. Không secrets trong examples.
Prompt/path cụ thể; không viết “đã gửi Claude” nếu chưa thật sự gửi.
Frontend chưa được owner giao: `NOT_STARTED_BY_OWNER_DIRECTION`;
handoff `AWAITING_CONSUMER_REVIEW`, không dùng FE acceptance làm dependency
giả cho backend độc lập và không gọi full integration complete.

## 5. Request và debt ledger

| ID | Sender → receiver/owner | Locator, observed vs expected | Impact/priority | Done-when/test | Status/blocker/destination | Delivered commit/type/example | Consumer verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Điền hoặc ghi không phát sinh sau đối chiếu | — | — | — | — | — | — | — |

Canonical record ở phase phát sinh; phase phụ thuộc chỉ link. Không đóng bằng
compile nếu done-when cần runtime/consumer. Deferred cần approval; giữ history.

## 6. Exit và next-step report — bắt buộc

- **Backend verdict:** gates đạt/chưa đạt, exact delivered scope.
- **Frontend/integration verdict:** fixture/real/browser/owner acceptance riêng.
- **Backend tiếp tục được:** phase/slice, dependency evidence, approval state.
- **Còn nợ:** IDs/owners/affected screens/next action/destination.
- **Claude tiếp tục được:** UXM/screens, wiring cần làm, pinned handoff.
- **Request hai chiều:** new/delivered/awaiting acknowledgement/closed hoặc none.
- **Cần Bobby quyết:** chỉ quyết định chưa duyệt, không hỏi lại approved scope.
- **Recommended next assignment:** một gói cụ thể; không tự chạy phase chưa duyệt.

READY_FOR_REVIEW không là OWNER_ACCEPTED; contract delivery không là product
complete. Cập nhật link/status/next step tại Unified trong cùng gói.
