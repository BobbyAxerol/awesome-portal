# Claude — nhận backend hiện có và đóng parity trước hạ cánh

## Pin và nơi đọc

Producer tại `/home/bobby/portal-backend-residuals-20261025`, nhánh
`chore/backend-residuals-20261025`; code `4e7deab1901539be64bfaf782746fc2d6dd53f5f`,
candidate đã kiểm ancestry `2aae8cbafe46e30c61e301bb559300f858d7a9f0`.
Commit tiếp theo của round này **chỉ Markdown/evidence**; đọc full SHA hiện hành
bằng `git rev-parse chore/backend-residuals-20261025` trước khi nhận.

Candidate đã chứa **toàn bộ** Claude
`00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` và canonical
`685bc1915db51c7869254c1fdfa68991d7e4aae4` làm ancestors. Không cherry-pick
lại lịch sử đã có. Nhánh chung và runtime **chưa nhận** candidate này.
Đây là nơi lấy producer để phát triển, không phải receipt API đã cài.

Đọc rules/sync/Unified §14 trên producer, rồi:

1. [Census, đường hạ cánh, mọi worktree/WIP và request mới](ACCOUNTS_CURRENT_AND_BACKEND_LANDING_CENSUS_2026-10-26.md).
2. [Bảy gói backend, fixture/generated contract và consumer cụ thể](BACKEND_RESIDUAL_IMPLEMENTATION_2026-10-25.md), đặc biệt §4.
3. [Các gate tích hợp đã chạy thật, không suy PASS](CORE_INTEGRATED_QUALIFICATION_2026-10-25.md).
4. [Accounts CURRENT độc lập và image/schema đã dựng](CURRENT_SOURCE_REUSE_AND_COMMISSIONING_BLOCKERS_2026-10-26.md).

## ACT_NOW — không chờ financial/Score hoặc API thật để sửa reader

| ID | Làm gì | Exit /receipt |
| --- | --- | --- |
| ELP2-REV-20261026-01 | Đồng bộ `alphaResourceScoped.ts` với các row definition của `execution-resource-scoped.v2.schema.json`: account type, margin, session identity/clocks, order attributes/booleans/exact amounts, fill/reconciliation session ID. Xem danh sách field chính xác ở census §4. | Closed reader vẫn từ chối key lạ/sai kiểu; nhận mọi member đã publish; giữ `false`, số 0 chính xác và null khác omission. Conformance schema↔field table và fixture dương tính đủ mọi field; không mở parser tùy ý để né mismatch. |
| ELP2-REV-20261026-02 | `liveSourceOperations.ts:readLiveStageFactsV2` đang từ chối runtime/since/sessions dương tính. Nhận `execution-live-source.synthetic.valid.json.with_observed_stage` theo schema đã publish. | Đọc được scoped observation, **không** suy activation/command/stream. `NO_OPEN_FINDINGS` và exact global counts vẫn bị cấm; session `source_complete` không true. Có test positive/absence/denied/malformed. |
| Fixture còn sót | Review `0ef0d6e0f036cc506c0b3d571f15a6d5b25c1633`, chỉ patch `apps/portal/fixture-bff/review-manager.ts` (+25/−3). | Chốt NAV không phụ thuộc window, PnL young-book, budget/allocation cùng graph. Không tự lấy file E2E đang dirty trong worktree agent. Trả ACCEPT/CHANGE và test có liên quan. |
| Evidence còn sót | 60 PNG before/after từ `3fa008a37e86e91fa66065c8f75b56e97bc21a6e`, prefix/manifest ở census §2. | Nhập nguyên bytes các ảnh còn thiếu, không nhập `debt-register.json` cũ và không biến ảnh review thành baseline mới. |
| Visual/fixture triage | Lần compare-only cũ có 213 FAIL: Fleet400, fixture501, quoted window, command assertions và pixel deltas. | Ghi exact request/response/root cause theo nhóm; sửa đúng consumer/double/backend. Không blanket re-record/flaky. Chạy lại nhóm bị ảnh hưởng trước khi primary chạy gate frozen cuối. |

Không sửa component/layout/token/baseline chỉ vì backend có field mới. Những
metadata chưa có nguồn thật vẫn typed absence; fixture đủ dùng để kiểm reader
và UX ngay. Với lỗi API thật, gửi locator+payload che nhạy cảm+expected semantics
cho primary; không hạ permission/final-send guard để test xanh.

## Quy trình nhận và trả — ít conflict

- Nếu lane hiện tại đang có WIP: giữ nguyên, pin/ghi nhận riêng; không reset/stash
  hay rebase hộ. Thống nhất lane sạch từ candidate producer với primary.
- Một writer mỗi vùng; Claude giữ reader/component/double. Primary giữ source
  commissioning, contracts dùng chung, integration và lịch gate nặng.
- Trả từng request ACCEPTED/CHANGES_REQUESTED với commit, test/fixture lane,
  file thay đổi và debt còn lại vào packet/sync. Không đợi cả phase để ACK reader.
- Sau khi hai bên đóng băng: primary nhập trên candidate bảo toàn hai lịch sử,
  kiểm contract/affected tests, official visual và normal R2 trên cut cuối;
  **chỉ khi đạt gate** mới ff-only vào `docs/research-loop-plan` sạch.
- Không push, dev/main/stable, command/Live hay tự thay preview thật. Source
  landing khác runtime installation và khác connected/browser acceptance.

Accounts CURRENT đi riêng: basic source đã có qualification lịch sử; còn exact
current source/authority/trust + installation/real API/browser. Không chờ
financial APPLIED/Score/Calendar. ELP2-10 vẫn NOT_MET; không mở ELP2-11.
