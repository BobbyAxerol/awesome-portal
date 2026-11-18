# Prompt — Core consumes the completed Edge source handoff

Bạn đang làm Portal Core/Research tại SGP:
`/home/bobby/portal-research`, nhánh `docs/research-loop-plan`.
Đừng chuyển về pin cũ, đừng đụng checkout Claude hay stable/dev/provider28445.

Đọc rules/Unified hiện hành của Core trước, rồi đọc đúng mailbox:

1. `upgrade/execution_loop/evidence/ELP2-10/EDGE_CORE_READY_TO_CONSUME_2026-10-28.md`
   — chỉ mục CLI, closed config types, nguồn/wire và phân công thực tế.
2. `upgrade/execution_loop/evidence/ELP2-10/EDGE_TO_CORE_CONNECTED_SOURCE_RETURN_2026-10-28.md`
   — đầy đủ E1–E5/pins/evidence; SHA256
   `a6779077f4a5cf9753346489efcd5c5b64c98be93027b3d2f8abfa336deb1666`.
3. `upgrade/execution_loop/evidence/ELP2-10/EDGE_TO_SOURCE_OWNERS_CONNECTED_INPUTS_2026-10-28.md`
   — Edge đã chuyển trực tiếp PM/DL; không yêu cầu Bobby đi lấy lại contract.

Làm ngay từng phần Core không phụ thuộc source commissioning: chuẩn bị consumer
discovery theo exact7fields và loader hiện có; input E2 READ/STREAM tách purpose;
financial schema/decimal/ownership/census/null semantics; input genuine existing
original cho STATUS; calendar SOURCE_DARK và đề xuất workload/numeric bounds.
Code Edge discovery/financial/STATUS đã có entrypoint check/serve cụ thể. Core
có thể SSH đọc đúng HK checkouts/pins trong handoff; không chờ bundle/framework
mới, không biến TEST_ONLY config/original thành production.

Cửa sổ discovery09:00–09:20UTC đã lỡ cutoff08:50UTC: CHANGE, không dùng lại.
Reader binding đã HẾT HẠN28Oct09:30UTC; cần binding mới được chọn/validate thật.
Discovery không cần membership để prepare,
nhưng serve thật vẫn cần final secure DB transport/credential, đúng trust và
binding hữu hiệu. Official protected-root/native original là đầu vào source
riêng; không tự INSERT root, mượn stable credential hoặc hạ TLS/HBA.

Trả ngay từng mục vào
`upgrade/execution_loop/evidence/ELP2-10/CORE_TO_EDGE_CONSUMPTION_ACK_2026-10-28.md`,
mirror sang HK:
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/`.
Ghi pin thực sự đã đọc, READY/NOT_READY/CHANGE, exact contract mismatch nếu có,
private reference/hash/expiry (không giá trị secret), owner/action, người chạy
từng specimen và cleanup. Link vào Unified Core. Không đợi đủ5mục; mỗi input
thật đủ mở phần ghép tương ứng. Edge là đầu mối PM/TS/DL, Core là bên cấp
current grant/session và chạy consumer; không gọi trùng nguồn.

Không coi READ là STREAM, requester STATUS là unattended recovery, fixture là
source thật, STALE/PARTIAL là FRESH hoặc delivery là ACK/connected PASS.
Full08/read09/ELP2-10 vẫn NOT_MET đến khi có receipt nghiệm thu thực tế.
