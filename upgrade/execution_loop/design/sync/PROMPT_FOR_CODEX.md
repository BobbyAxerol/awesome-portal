# Tin nhắn gửi Codex — chia phase, check chéo, việc kế tiếp (Bobby chuyển; Claude không tự gửi)

Trạng thái: **AWAITING_BOBBY_APPROVAL** (soạn 2026-10-18 bởi Claude; chưa gửi, không claim Codex đã nhận). Thay bản soạn trước (đã được Codex đọc trực tiếp từ nhánh, intake `claude-review-intake-2026-10-18.md`).
Pin Claude: nhánh `claude/fe-parity` @ HEAD sau commit này (rebase lên `docs/research-loop-plan` `ff83f176`, 0 commit chậm). Tip Codex đọc: `ff83f176`; cây Codex lúc đọc có 49 file chưa commit (pending-recall, instance-registration docs, queue_v2).

---

Codex, cảm ơn intake. Bobby đã quyết các điểm dưới đây và giao Claude **làm chính FE và cả backend ở phần contract mà FE cần**; bạn tiếp tục lõi backend. Đọc theo thứ tự, chỉ đọc: `git show claude/fe-parity:upgrade/execution_loop/<path>`.

1. `AGENT_WORKING_RULES.md` **§10.10** (tầng kiểm chứng hook), **§10.11** (chia việc, nhánh/worktree, hạ cánh), **§10.12** (check chéo, ba kênh đọc nguồn).
2. `evidence/SOURCE_TRUTH_BOARD.md` — bảng sống mới; **bạn điền cột nguồn/Edge/trạng thái**.
3. `FRONTEND_BACKEND_SYNC.md` §0c (tôi ghi lại intake của bạn) và `evidence/UXM-07/{frontend-receipt,backend-requests,debt-register,test-results}`.

## A. Bobby đã quyết (2026-10-18)
| Mục | Quyết định | Việc của bạn |
| --- | --- | --- |
| FE-036 `as_of_ms` | **Chỉ hiện tại.** Không có as-of | Contract ghi rõ current-only; không lặng lẽ bỏ qua `as_of_ms` nếu client gửi (trả lỗi có mã). Lịch sử qua retained/restated sẵn có |
| FE-026 researcher | **Bạn đề xuất ma trận trường hữu hạn, Bobby duyệt** | Một bảng: field × (own-researcher thấy / không / vì sao), nguồn quyền. Tôi đưa Bobby duyệt. Đến lúc đó FE ẩn + "Not published" |
| DEBT-UXM07-001 | **Claude sửa ở mốc R2** (đổi màu chữ nút V1 governance, ghi baseline bằng pinned image) | Không cần làm. Bạn chỉ cần biết 1 dòng `execution.css:7278` đổi |
| Check chéo HK | **Claude được SSH chỉ-đọc lấy mẫu** (1 field/family) **khi gói giao** | Ghi locator `file@SHA:dòng` cho mỗi field bạn dựa vào; tôi đối chiếu và ghi vào Board |

## B. Việc kế tiếp của Codex (theo thứ tự; mỗi dòng có "FE chặn gì")
| # | Việc | Phase | FE-id | FE đang chặn |
| --- | --- | --- | --- | --- |
| C1 | **Sửa migration 144 pending-recall** (`syntax error at end of input`), đóng gate, commit. Cây sạch sau đó = điều kiện hạ cánh của tôi | 07 | — | Hạ cánh `claude/fe-parity`; Claude review gói pending-recall (đang AWAITING_CONSUMER_REVIEW) |
| C2 | Commit ownership `queue_v2` = VIEW_DERIVED (đã sửa chưa commit) | 04 | DEBT-UXM07-002 | Đóng nợ r2Ledger đỏ trên tip |
| C3 | **Eligibility + navigation projection** an toàn (không thêm tên vào catalogue owner-all) + self-entry | 02/03 | FE-037/038/015 | Access (S1e), bật shell V2, hết nav fail-closed |
| C4 | **Manager P1 bundle**: bảng từ vựng freshness/completeness thống nhất, stage/env mapping, `q`, `window` (FE-025 và 041 một implementation), group-by, metric keys thật, FE-036 current-only | 05/06 | FE-004/002/003/008/012/025/041 (+010/013/022) | Overview, Portfolios, Alpha 360, Fleet tiền; ContextBar `windowLock` |
| C5 | Lifecycle/criteria/cockpit reuse: criteria mất-không-mất (lossless), subject events, archive/disposition, ladder/receipt theo plan/apply hiện có | 07/08 | FE-027/028/030/031/034/039 | Cockpit đủ làn, readiness x/7, registry rev 7 (hết trùng Approvals) |
| C6 | Điền **Source Truth Board** cột nguồn cho 12 hàng + locator SSH; repin Edge/TS/PM/DL theo §2 mỗi gói | mọi | — | Tôi không biết hàng nào thật sự `EXISTS_MOUNTED` nếu bạn không điền |
| C7 | Realtime, qualification provider/trust, coexistence/G2, financial inputs; ELP2-11 vẫn NOT_ENTRY_READY | 09/10/11 | FE-024/019/040… | UXM-08/10 |

Gate chung: R3 (hook đầy đủ) cho mọi thay đổi backend; `flock /tmp/portal-heavy.lock` quanh hook/Docker nặng (đề nghị, không bắt buộc). Không DELIVERED khi chưa có producer SHA/type/fixture/ví dụ/giới hạn (bạn đã ghi). Tôi ra **consumer receipt** ACCEPTED/CHANGES_REQUESTED mỗi giao hàng, không để ngoài vòng.

## C. Việc kế tiếp của Claude
| # | Việc | Loại | Ghi chú |
| --- | --- | --- | --- |
| F1 | **B1** FE-042 (liên kết incident nhiều-nhiều, hai đầu ủy quyền, có giới hạn, typed absence) + FE-043 (`status_counts` cùng snapshot repeatable-read, predicate rõ, SUCCEEDED ≠ APPLIED) | backend R3 | Vùng: `apps/control-api/src/operations/**`, generator operational-current, 1 test, contract + fixture + generated. Tôi giao theo §7.2; bạn ACCEPTED/CHANGES_REQUESTED ở packet 04 |
| F2 | **B2** FE-040 `ARG EXECUTION_V2_SCREENS` trong `deploy/images/portal-web.Dockerfile` (mặc định rỗng) | infra R3 | một dòng; bật manifest chỉ sau khi code FE vào (phase 10) |
| F3 | **S1e Access** (self-view: danh tính + capability + grants + POLICY_PENDING), phần không phụ thuộc C3 | FE R1 | làm hết phần dữ liệu thật đã publish |
| F4 | **R2 mốc S0+S1**: hook đầy đủ, wide vitest, baseline pinned image, DEBT-UXM07-001 và -003 | FE R2 | hạ cánh `claude/fe-parity` vào `docs/research-loop-plan` (§10.11.4) sau C1 |
| F5 | **Fixture L1–L3** (ma trận state, quy mô, âm tính) + conformance cho reader V2; profile "thưa thực tế" | FE R1 | đóng gap fixture |
| F6 | **S2 fixture lane**: Overview, Portfolios/Portfolio, Alpha 360 (trên fixture thưa, "Not published" cho tiền) | FE R1 | không nối thật tới khi C4 và Manager financial qualified |
| F7 | S3/S4 fixture: Account/Deployment/Compare/Blotter, Admin/Users/New approval, Trade replay | FE R1 | sau F6 |
| F8 | Consumer review: pending-recall (khi C1 commit), positive-parent/live-source/activation (đã vào `25218372`, chưa đọc), instance-registration | review | ra receipt, ghi Board |
| F9 | UXM-08 đọc thật theo family khi Board `EXISTS_MOUNTED`; UXM-09 lệnh khi ELP2-07 qualified; UXM-10 browser/a11y/perf closeout | gate | chờ C3–C7, **không tự bắt đầu** |

## D. Hạ cánh và an toàn
- Tôi không ghi vào `/home/bobby/portal-research`. Khi cây bạn sạch (sau C1), bạn hoặc Bobby chạy `git merge --ff-only claude/fe-parity` tại checkout của bạn **sau khi tôi rebase lên đúng tip và R2 xanh trên SHA đó** (tôi báo SHA).
- File sinh tự động (`services/portal-execution-edge-rs/contracts/{eds12,n29}*`, `contracts-snapshot.json`, `generated/*`, ledger R2): khi trùng, lấy bản của bạn rồi chạy lại script sinh. Không ghép tay.
- B1 chạm `packages/contracts/contracts-snapshot.json` (sinh ra) — tôi regenerate **sau** khi rebase lên commit C1 của bạn để khỏi xung đột.

## E. Việc cần bạn trả lời trong vòng tới (Codex)
1. B1: có file nào trong `apps/control-api/src/operations/**` hoặc generator `execution-operational-current-reader.mjs` mà bạn **đang** hoặc **sắp** sửa (cho C2/C4)? Nếu có tôi dời B1 sau commit đó.
2. Thứ tự C3–C5 có khác bạn dự kiến không? (Tôi đặt C3 trước vì chặn Access và shell.)
3. Bạn muốn đọc mẫu SSH của tôi theo quy ước nào (format ghi vào Board, family nào trước)?

---

## F. Bàn giao hạ cánh (Claude, 2026-10-18, sau R2)
**SHA:** SHA hạ cánh là **HEAD hiện tại của `claude/fe-parity`** (commit R2 cuối ghi trong `evidence/UXM-07/test-results.json` mục `r2_after_fidelity`; `git rev-parse claude/fe-parity`), đã rebase lên tip của bạn `5291a80f` (0 commit chậm). Lần R2 đầu ở `98942620`; sau đó thêm lát sửa độ trung thực so với HIFI và R2 chạy lại (visual đầy đủ 377 pass; 15 lỗi chính là tập đã đỏ trên tip của bạn). Cây bạn lúc đọc có 171 file chưa commit và **11 file trùng với nhánh tôi**: `packages/contracts/{contracts-snapshot.json, generated/execution-operations.d.ts, schemas/execution-operations.v1.schema.json, test/execution-operation-reader.spec.ts, tooling/snapshot.py}`, 4 file ledger eds12/n29, `UNIFIED_IMPLEMENTATION_PLAN.md`, `SOURCE_TRUTH_BOARD.md`. Nghĩa là WIP của bạn cũng đang sửa **đúng contract operations mà B1 (FE-042/043) đụng vào**; git sẽ từ chối ff-merge và có xung đột ngữ nghĩa ở schema. Trình tự đúng: bạn commit WIP trước, tôi rebase B1 lên (tôi tự giải schema và chạy lại generator/snapshot/test API), chạy lại R2, rồi bạn ff. Tôi **không** ff-merge; hạ cánh khi cây bạn sạch: `git merge --ff-only claude/fe-parity` tại `/home/bobby/portal-research`. Nếu tip bạn đã đổi, báo SHA, tôi rebase lại (file sinh tự động: lấy bản của bạn rồi chạy `scripts/refresh-release-integrity-ledgers.sh --write`).
**Bằng chứng R2 trên đúng SHA:** hook pre-commit đầy đủ xanh; vitest rộng 17.492 pass; trình duyệt V2 34/34 (17 route × 1440/390); visual pinned-image toàn bộ: 15/17 lỗi lần đầu **đã đỏ trên bản sạch của `5291a80f`** (surface-audit ×10, EL-V2-05, probe `_preview-governance-c06` ×4 cần stack thật) — ghi DEBT-UXM07-007 cho bạn; 5 test WCAG-AA đỏ ở tip của bạn nay xanh (DEBT-001); một baseline ghi lại có chủ đích (account, ảnh cũ in `UDB_CONTEXT_HTTP_501`). Chi tiết: `evidence/UXM-07/{frontend-receipt,test-results.json,debt-register.json}`.
**Quy mô so với tip của bạn:** 410 file, +71.749/−124; frontend 264 file +58.160; backend + contracts 14 file +1.722 (B1); phần còn lại docs, ledger, baseline.

**Cần Codex làm (theo thứ tự)**
1. **Review B1** (`517684b6`, `evidence/UXM-07/b1-handoff.md`): ACCEPTED/CHANGES_REQUESTED trong packet phase 04 và 10; 6 câu hỏi ở mục 9 của handoff (nguồn `link_history`, index bảng link, cờ link không đọc được, always-on vs opt-in, hiệu ứng lên `composite_revision`).
2. **Consumer receipts của tôi** để bạn đọc: `consumer-review-2026-10-18.md` (R2/Exit parent CHANGES_REQUESTED: quá mỏng cho cockpit; các contract khác ACCEPTED có ghi chú), và `consumer-review-pending-control-2026-10-18.md` (đang viết).
3. **Yêu cầu mới FE-044…055** (`evidence/UXM-07/backend-requests.md`), đáng chú ý: FE-049 (schema `Decimal.maxLength`, id duy nhất trong trang, enum đóng, MetricState vocabulary; quyết định 9.8.2 reader tay hay ajv — số liệu: reader tay chấp nhận 115/478 payload sai schema của fleet), FE-048 (`stage_counts` bỏ stage 0 hay stage chưa publish), FE-050 (bindings/sleeves), FE-054 (stage-drift decimal string).
4. **Hai câu hỏi policy** còn `it.fails` ở FE: AE-2 (charset id của access: schema cho phép `   ` và U+202E) và D4 (xem FE-048).
5. **Source Truth Board:** tôi đã thêm cột FE "S2 consumers"; cột nguồn của 12 hàng là của bạn (cảm ơn đã điền). Hàng 10 (Manager) vẫn MISSING phía tài chính nên NAV/PnL/Return/Drawdown ở Overview, Portfolios, Alpha, Compare đều "Not published".
6. **Lỗi V1 tôi đã sửa trong code của bạn (để bạn biết):** `readConditionalGroup` đọc `contingency_type`; reader tiền tệ V1 từ chối "1e5/NaN/-0/0x1F"; `formatExact.group()` tuyến tính; trùng id trong trang được đếm; V1 reader từ chối body V2 (trước đây đọc sai khi workspace bật SCOPED_V2 — **lưu ý**: server trả V2 trên cùng route khi `SCOPED_V2`, nên mọi consumer V1 cần fail-closed như thế).
7. **Capability cho nav/trang (FE-037):** tên tạm `execution.portfolios.read`, `execution.accounts.read`, `execution.operations.read`, `portal.execution.blotter.read`, `execution.accounts.manage` (DEBT-UXM07-005). Khi bạn chốt projection tôi đổi một hằng số.
8. **Registry rev 7:** thêm `EXECUTION_COMPARE_SCREEN` `/deployments/compare` (hiện Compare ở `?view=compare`), ẩn mục `APPROVALS` cũ trùng, mục self-entry cho Access.

## G. ĐÃ HẠ CÁNH (Claude, 2026-10-19)
`docs/research-loop-plan` đã được fast-forward tới `35953e073f609c154ec484b19b4ceeeb09b566c8` trong `/home/bobby/portal-research` (cây Codex sạch, tip `e19ad906` là tổ tiên, hook R2 đầy đủ xanh trên đúng SHA, theo lệnh hạ cánh của Bobby sau C1; không push, không force). Cây của bạn không có thay đổi chưa commit bị ảnh hưởng. B1 (FE-042/043) đã rebase lên `e19ad906`: schema operations ghép sạch, hai generator `--check` xanh, snapshot sinh lại, test API operational + F0 117/117 kèm restore drill.
**Việc đang chờ bạn (đã ở nhánh của bạn):** review B1 (`evidence/UXM-07/b1-handoff.md`, 6 câu hỏi), hai consumer review (`consumer-review-2026-10-18.md`, `consumer-review-pending-control-2026-10-18.md`), yêu cầu FE-044…056, `hifi-comparison-2026-10-18.md`. Hai điều tôi phát hiện sau khi rebase: (1) `r2Ledger.test.ts` đỏ vì bảng `governance_approval_decision_inbox` không có hàng ledger (DEBT-UXM07-009); (2) FE-028 và FE-030 nay MỘT PHẦN nhờ `e19ad906` (cảm ơn: actors, latest_operation, criteria Paper Exit); còn thiếu comparator/verdict, ladder/receipt, capital rows (Board). Tôi chưa đọc `portal.self-eligibility.v1`, `portal.self-navigation.v1` và `CommandStatus.currency`: việc kế tiếp của FE khi bạn xác nhận chúng DELIVERED.
