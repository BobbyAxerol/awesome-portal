# Execution Loop Portal V2 — entry point

Ngày ghi: 2026-10-15 (Asia/Saigon). **Current return2026-10-16:**01–04 đã land;
04 ở `2ec5924d`, normal hook contracts574/API3,306 PASS,3 existing API skips,
build và scoped PostgreSQL restore PASS. Các cell D/failed attempts giữ trong
packet lịch sử, không còn là current pending bug.

Bobby đã giao riêng [ELP2-05](evidence/ELP2-05/README.md): pin catalogue/publication,
42 logical families/31 fields, giữ54 named legacy current operations riêng,
siết rows/bytes/clock/cursor và publish handoff. [Unified current journal](../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-05-current-return)
phân biệt technical delivery với selected-source runtime gate còn thiếu.
Không bật goal, không tự mở06+, không push/deploy hoặc sửa frontend/Edge/TS.
Frontend vẫn NOT_STARTED_BY_OWNER_DIRECTION; handoff AWAITING_CONSUMER_REVIEW.
Các đoạn onboarding/PLAN_ONLY bên dưới giữ lịch sử, không ghi đè current return.

**Subsequent assignment2026-10-16:** Bobby assigned [ELP2-06](evidence/ELP2-06/README.md)
separately on `c4109ef3`. Named Fund/Fleet/360 contracts, scoped exact query,
atomic bounded Manager revision/checkpoint store and pure score reference are
delivered with [handoff](evidence/ELP2-06/coverage-and-handoff.md). Full06 source/
config/consumer exit remains NOT_MET; no numeric production score, ALL financial
aggregate or qualified-source recompute worker is claimed. Normal hook is the
landing gate. Frontend remains on hold; no goal,07+, push or runtime activation.
This supersedes only the earlier “06 not assigned” status, not source evidence.

**Subsequent assignment2026-10-16:** Bobby assigned [ELP2-07](evidence/ELP2-07/README.md)
on `42c39079`. Four named capital command/status APIs, immutable transport
correlation and lookup-only recovery have a source-dark technical implementation;
[exact operation coverage / Claude handoff / open gates](evidence/ELP2-07/coverage-and-handoff.md).
No source command, runtime, frontend, push or08 assignment follows. Full07 exit
still requires qualified PM/Edge command/status receipts and consumer acceptance.

**Subsequent assignment2026-10-16:** Bobby assigned [ELP2-08](evidence/ELP2-08/README.md)
on `3d537127`. Generated workflow states, canonical fixtures and pure projections
cover create/capital/lifecycle/read/navigation/score stories;
[text-state spec, advertised-action inventory, walkthrough and Claude handoff](evidence/ELP2-08/coverage-and-handoff.md).
Focused API76/contracts56 PASS; normal hook is landing gate. No workflow API,
source adapter, UI or runtime was activated. Full08 still needs source/design/
browser acceptance; frontend remains on owner hold.09 next only after assignment.
This supersedes only the earlier “08 not assigned” statements, not source gates.

**Subsequent assignment2026-10-16:** Bobby assigned [ELP2-09](evidence/ELP2-09/README.md)
on `daf43487`. Exact notification-only scoped notice contracts, encrypted
snapshot-bound cursors, current per-write authority fence, bounded fanout/
pending admission and post-durable-commit local ACK are delivered as unmounted
backend components; [Claude handoff / source gaps](evidence/ELP2-09/coverage-and-handoff.md)
and [runbook](evidence/ELP2-09/replay-runbook.md) accompany14gate disposition.
Focused contract25/pure68 and isolated PG206 PASS at their recorded freezes;
final normal hook is landing gate. Full09 still needs qualified source coverage,
trust/TLS/propagation and browser acceptance; retained preview stays no-stream.
Frontend remains NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.
10 next-ready only after separate assignment; no goal/push/dev/main/activation.

[ELP2-00 packet](evidence/ELP2-00/README.md) có baseline manifest mới nhất,
112-route census,14family/11XLC/15decision map,8audit checks và backend/Claude
handoff. Pins cũ dưới đây giữ lịch sử, không ghi đè runtime/source snapshot mới.
Backend tiếp theo ELP2-01; Claude UXM-00 có thể giao song song. Cả hai chờ Bobby
giao riêng hoặc trong batch được duyệt, không tự mở từ việc hoàn tất inventory.

**Bobby sequencing request2026-10-16:** [Unified §14.9](../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-backend-batch-01-04)
chuẩn bị goal backend01→02→03→04; PLAN_ONLY, chưa duyệt triển khai batch.
Frontend chưa bắt đầu theo chỉ đạo hiện tại. Journal/tests/commit/handoff vẫn
riêng từng phase; không tự cấp pending rights hoặc claim TS/runtime acceptance.
Batch có checkpoint chuyển bước, scope/test budget, pending decisions và prompt
giao việc ở §14.9; mỗi phase dùng [packet template](PHASE_PACKET_TEMPLATE.md).
Preparation note không là implementation receipt; schema/DB/API tests còn NOT_RUN.

**Subsequent active batch return2026-10-16:** Bobby's goal now assigns backend
01→04 under §14.9 scope/budget. [ELP2-01](evidence/ELP2-01/README.md) delivers
additive contracts/generated types/FX-01…25 and40/40 focused tests, source
typecheck and generation checks PASS. External authority/consumer/runtime gates
remain OPEN; no route enabled. Backend02 next under the assigned batch,03/04
queued. Frontend NOT_STARTED_BY_OWNER_DIRECTION; no push/dev/main/runtime changes.
Earlier PLAN_ONLY paragraphs above are retained historical preparation entries.

## 1. Đọc và áp dụng

Đọc root `AGENTS.md`, `CLAUDE.md`, chỉ mục
[Unified §14](../UNIFIED_IMPLEMENTATION_PLAN.md#execution-loop-v2), rồi
[rules của campaign](AGENT_WORKING_RULES.md). Bộ guide chi tiết:

| Tài liệu | Authority / phần sở hữu |
| --- | --- |
| [Edge v1.2](EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md) | Producer/export, continuity, projection transport, recovery, coexistence; EPG10-00…11 |
| [Portal backend v1.2](EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md) | Identity, policy, BFF/read models, command bridge; ELP2-00…11 |
| [Manager UX v1.1](EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md) | Manager-first hierarchy, screens, journeys và Claude design; UXM-00…10 |
| [Score specification FINAL v1.1](SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md) | P/R/B, weights/bands đã chọn, raw/contribution/composition/direct NAV, Regime và acceptance |
| PM guide v1.1 **R2 hiện hành trên HK** | PM business authority; exact path/revision trong [source receipt](evidence/SOURCE_ALIGNMENT_2026-10-15.md), không lấy copy TS/Library thay thế |
| [Review decisions v1.2](REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md) | Source pins lịch sử, delta và quyết định đang mở; refresh trước implementation |
| [Score feasibility v1.0](SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md) | Đã nhận/đọc; dependency, numerical hardening và sequencing; không thay formula hoặc chứng minh runtime |

Thứ tự khi xung đột: **yêu cầu mới nhất đã duyệt của Bobby → authority contract
đang áp dụng → quyết định theo revision → guide hiện hành**. Authority từng
domain như bảng trên; không dùng thứ tự đọc để ghi đè semantics domain khác.
Dừng đúng tính năng mâu thuẫn, ghi hai locator/revision và phương án xử lý.

Prompt B/C/D Bobby bổ sung trong chat đã được đọc và chuyển thành rules bên
dưới. Không gọi đó là toàn bộ `PARALLEL_IMPLEMENTATION_AGENT_PROMPTS_v1.2_VI.md`:
file companion đầy đủ chưa có. Đã nhận và xem [lowfi Overview](<ChatGPT Image Oct 15, 2026, 11_56_37 PM.png>)
và [lowfi Fleet](<ChatGPT Image Oct 15, 2026, 11_56_58 PM.png>); đây là content/flow
inputs, không phải HiFi cuối đã duyệt. Receipt/script hardening companion chưa
có; historical PASS trong review không phải kết quả chạy của campaign.

## 2. Source, không phải deployment

[Receipt đối chiếu local/HK](evidence/SOURCE_ALIGNMENT_2026-10-15.md) ghi full
SHAs, dirty state, hashes của 5 guide, current PM R2 và journal mới. Đã đọc đủ
5 guide local, kể cả phụ lục numerical script; **không chạy lại script hoặc
đổi historical numerical PASS thành PASS của campaign**.

Nhánh tích hợp hiện được Bobby chỉ định: `docs/research-loop-plan` tại
`/home/bobby/portal-research`. Main/dev/stable là các baseline đối chiếu, không
phải target sửa hoặc tự merge. Chọn source baseline của từng module qua
ELP2-00, không lấy nhánh mới nhất làm chứng nhận Execution đang deploy.

## 3. Handoff cho Claude

Mỗi phase bắt buộc theo [rules §7–8](AGENT_WORKING_RULES.md#7-phase-approval-và-bàn-giao-hai-chiều-bắt-buộc),
[packet template](PHASE_PACKET_TEMPLATE.md) và
[Unified next-step map](../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-phase-handoff):
backend next/debt, Claude next, request hai chiều, consumer acknowledgement và
approval state. Subagents chỉ làm independent approved subtasks; primary quản
shared files, integration và resource/test scheduling. Không tự chạy phase sau.

Đọc toàn bộ UX guide, backend/score contracts và rules, rồi chuẩn bị theo gói
được Bobby giao: audit UI hiện có bằng browser → reuse/gap map → sitemap và
journeys theo quyền → lowfi mới → HiFi responsive → typed integration.
Sáng tạo trong bố cục/component/interaction; giữ economic grain, quyền, source
truth và deep links. Không bắt đầu implementation chỉ vì nhận bundle.

Từng screen phải map **guide requirement → component/state → field/operation
và fixture version → actual browser receipt**, với backend request riêng nếu
thiếu field. Unified là chỉ mục tiến độ; packet dưới `evidence/<phase-id>/`
giữ chi tiết và handoff, không nhân bản board lịch sử §12.

## 4. Thứ tự và chỉ mục phase

[Unified §14.1–14.7](../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-sequencing) chứa phase
index, dependency, goal/to-do/exit, mapping Claude, nguồn/test gates và phần
backend tái sử dụng. Đây là kế hoạch, chưa phải approval triển khai toàn bộ.

Backend đi trước **một contract slice**, Claude audit/design song song, rồi nối
read-only theo endpoint đã qualification. Không đợi toàn bộ backend xong mới
làm UI; không làm frontend đoán authority/facts. Score P0…P3 thuộc namespace
của score spec, không thay Research P01…P24. Numeric production và Regime có
gate riêng, không chặn screen độc lập hoặc authorized reduce-risk.

ELP2-00: inventory source/routes/authority + dependency/decision register;
đồng thời UXM-00 audit/reuse map khi được giao. Sau đó ELP2-01 khóa schema và
golden fixtures với Edge, đủ để Claude thiết kế mà không đoán API. Mỗi gói ghi
target/files/resources/validation/risk/rollback trước khi xin triển khai.
Nguồn chưa đủ chỉ chặn endpoint/action phụ thuộc, không chặn thiết kế fixture
hoặc read surface độc lập. Chưa tự mở ELP2-02…11, command hoặc live trading.
