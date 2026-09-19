<!-- BEGIN RL-V1.1 HEADER -->
# RESEARCH LOOP — GUIDE V1.1 · DELTA RSI, BROWSER & CONTROLLED DELIVERY

> **Chỉ mục điều hành mới nhất — Bobby, 2026-09-19:** [Unified Plan §13](../UNIFIED_IMPLEMENTATION_PLAN.md#research-loop-v11)
> giữ trạng thái24phase, test/exit index và reconciliation với Execution đã phát hành;
> [CLAUDE-FOR-thanhvuong.md](./CLAUDE-FOR-thanhvuong.md#research-working-rules)
> là file rules đi kèm thực tế (các nhắc tới `CLAUDE.md` trong guide là nguồn lịch sử).
> Guide này tiếp tục giữ đầy đủ hướng dẫn/test chi tiết; không sao chép live status vào đây.

**Phiên bản hiệu lực: 1.1.** Đây là bản **chỉ bổ sung** vào V1 mới nhất đã hợp nhất findings HTML/spec, không phải bản V1 cũ trước review. **Giữ nguyên 24 phase, 15 màn và toàn bộ nội dung/test/FND/COR/DR của baseline.** Tiêu đề V1 phía dưới được giữ nguyên để bảo toàn văn bản nguồn.

**Baseline được bảo toàn:** `RESEARCH_LOOP_GUIDE_V1_24_PHASES_vi.md` · SHA-256 `5d81c5a57dcd494bf6809e1e0200eebc29a74e3aa4c7e52f128c4d8c5e91934b` · 3418 dòng. Các đoạn mới được đánh dấu `RL-V1.1`; loại bỏ đúng các đoạn này phải khôi phục nguyên bytes baseline. Bản gốc không bị ghi đè.

**Bổ sung owner yêu cầu:** Delta-RSI Polynomial Alpha sẵn có là chiến lược nghiệm thu bắt buộc; đối chiếu QuantBT → persistence → API → UI bằng kết quả thực; browser tests và bằng chứng visual/interaction; mỗi phase có checklist riêng. Quy trình contributor thanhvuong nằm trong `CLAUDE.md` đi kèm: báo cáo từng phase, không mang technical debt qua phase, PR sau mỗi hai phase, và rebuild/review trên `dev-portal-research.primusspark.com` khi đã có UI có thể kiểm tra.

**Không phải báo cáo đã chạy test.** Tài liệu này yêu cầu agent tạo kết quả và bằng chứng; không có số PnL, Sharpe, browser PASS hay deployment receipt được bịa trước. Việc phát hành tài liệu không tạo quyền sửa Execution, SSH vào tài khoản Bobby, lấy dữ liệu/secret chưa được cấp, tạo DNS, nâng quota hoặc mở port.

**Cách đọc phần mới:** đọc [§23 — Delta RSI acceptance](#v11-delta), [§24 — Browser và coverage](#v11-browser), [§25 — Đóng phase và bàn giao](#v11-phase-gates), [§26 — Dev review/DNS](#v11-dev-review). Mỗi P01–P24 có block `V1.1 — Delta RSI / Browser / Exit gate` ngay dưới heading. Nguồn chính xác ở [§27](#v11-sources).

**Hiệu lực quy tắc mới:** các phần `Debt/rollback` cũ vẫn được giữ để đối chiếu, nhưng không cấp cho thanhvuong quyền tự mang debt qua phase. Rule mới là **zero known unresolved in-scope technical debt trước phase tiếp theo**; không đánh đồng scope của phase tương lai với debt. Nếu owner muốn ngoại lệ, phải có quyết định sửa scope/rule cụ thể từ Bobby, không phải agent tự ghi waiver. Các quyền push/deploy dưới đây chỉ dành cho contributor đúng workspace, branch, remote và hạ tầng đã được Bobby cấp.

---
<!-- END RL-V1.1 HEADER -->

# RESEARCH LOOP — GUIDE V1 & KẾ HOẠCH TRIỂN KHAI 24 PHASE

**Portal:** `awesome-portal` · **Engine baseline:** `quantbt-engine==1.1.1` · **Phạm vi:** toàn bộ 15 màn Research và backend phục vụ chúng  
**Quy mô thiết kế:** 10–20 người dùng; tổng RAM Research cơ sở **5 GB**, mở rộng tối đa **8 GB**  
**Ngày:** 17-09-2026 · **Bản cập nhật:** V1 hợp nhất findings sau rà soát HTML/spec; giữ nguyên 24 phase và phạm vi 00–14.  
**Trạng thái tài liệu:** thiết kế triển khai để owner review; **không phải báo cáo đã implement, đã browser-test đầy đủ hoặc đã benchmark thành công**.  
**Baseline tài liệu trước cập nhật:** SHA-256 `35eec7369e56487b83622ac25a05a8298c3b6ac672f2d4c1426af0bfdc1081c2`.

> Research phải thích ứng với Execution Loop đã có. Không chỉnh implementation, schema, gate, policy, enum hay consumer của Execution để làm Research dễ triển khai hơn. QuantBT là authority tính toán; hi-fi và Markdown đính kèm là contract sản phẩm; storage và adapter phải đáp ứng contract đó trong ngân sách tài nguyên đã chốt.

## Cách sử dụng tài liệu

Đọc phần I–III trước khi sửa code. Sau đó thực hiện các phase theo dependency ở phần IV; dùng phần V để nghiệm thu. Agent phải đọc **cả tài liệu này và các spec/HTML gốc của từng màn**, không dùng một bản tóm tắt để thay thế ledger CSS, copy, interaction và test cases gốc.

Các câu **PHẢI/KHÔNG ĐƯỢC** là yêu cầu bắt buộc. **ĐỀ XUẤT KHỞI ĐIỂM** là cấu hình cần đo trong phase được chỉ định, không phải số đo trên server. **DISCOVERY GATE** là việc phải đóng bằng evidence trước khi triển khai phụ thuộc; không phải quyền để bỏ tính năng. **Ngoài phạm vi** không đồng nghĩa hệ thống kia chưa có tính năng.

Nguồn được ký hiệu `[Pxx]` cho source Portal, `[Dxx]` cho tài liệu chung redesign, `[S00]`–`[S14]` cho từng màn và `[Exx]` cho tài liệu kỹ thuật gốc. Registry cuối tài liệu ghi file, hash và vị trí. Các tên module, bảng và endpoint có nhãn **NEW** là thiết kế Research V1, không được mô tả như đã tồn tại.

**Cách đọc bản cập nhật:** findings và quyết định triển khai ở §3.2–3.3; domain chi tiết ở §5.5–5.7, §6.6–6.9; phép biến đổi/cảnh báo ở §9.3–9.4; capability ở §11.7; action/cursor/traceability ở §13.5–13.7. Tất cả được đưa vào contract từng màn và to-do/test/exit gate của phase liên quan, không phải phụ lục tùy chọn. Scenario xuyên màn ở §16.6 là bắt buộc bên cạnh source tests. `[R01]`–`[R08]` trỏ tới vị trí source của findings mới ở §22.4.

Yêu cầu owner bổ sung findings **không phải** phê duyệt một endpoint, role hoặc gate execution chưa tồn tại. Các mục `VERIFY_SOURCE` do agent đóng bằng code/test; mục `OWNER_SCOPE_REQUIRED` chỉ cần quyết định owner khi source không đủ để giải quyết phạm vi/ý nghĩa. Không đẩy mọi chi tiết kỹ thuật thành câu hỏi cho owner; không dùng blocker cục bộ để dừng phần độc lập hoặc âm thầm bỏ yêu cầu.

### Mục lục

- [I. Quyết định đã chốt và phạm vi](#part-i)
- [II. Kiến trúc, domain, storage và tài nguyên](#part-ii)
- [III. Contract QuantBT, execution và 15 màn](#part-iii)
- [IV. Kế hoạch triển khai 24 phase](#part-iv)
- [V. Nghiệm thu, technical debt, vận hành và bàn giao](#part-v)
- [VI. Nguồn, baseline và chỉ mục test gốc](#part-vi)

<a id="part-i"></a>
# I. QUYẾT ĐỊNH ĐÃ CHỐT VÀ PHẠM VI

## 1. Mục tiêu V1

Xây một Research Loop có thể dùng thật: import/bind strategy, chọn data và cấu hình, chạy QuantBT, quan sát quá trình, đọc toàn bộ evidence cần thiết, so sánh các lần nghiên cứu, tạo Release Candidate và publish qua interface execution/governance hiện có. Mọi con số quan trọng trên màn hình phải truy về đúng code, data, engine, spec, selection và artifact revision.

Đây là thiết kế theo chất lượng kỹ thuật của một hệ thống nghiên cứu tổ chức: correctness trước, kiểm soát tài nguyên, cách ly quyền, provenance, khả năng khôi phục và nâng version. Tài liệu không tự cấp nhãn pháp lý “được chứng nhận chuẩn quỹ”, không tuyên bố single-node là high availability, và không đặt thêm quy tắc investment committee.

### 1.1. Sổ quyết định — áp dụng ý kiến mới nhất của owner

| ID | Quyết định bắt buộc | Hệ quả triển khai |
|---|---|---|
| ADR-01 | Tên toàn bộ phạm vi mới là Research Loop | 15 màn và backend dùng chung domain; không chia một backend cho mỗi màn |
| ADR-02 | Execution là implementation được bảo vệ | Chỉ gọi/query contract có sẵn; không đổi R1/R2, policy, table, hash algorithm, enum hoặc runtime |
| ADR-03 | QuantBT là engine duy nhất | Không dựng portfolio/fill/PnL simulation thứ hai trong TS/Rust adapter |
| ADR-04 | Backend được tính dữ liệu dẫn xuất từ raw | Mỗi phép biến đổi có công thức/version/input lineage; không bịa một sự kiện chưa ghi |
| ADR-05 | Hi-fi + docs là contract sản phẩm | Giữ layout, copy, interaction và toàn bộ field bắt buộc, trừ correction ledger có căn cứ rõ |
| ADR-06 | 5–8 GB là tổng ngân sách Research | Không hiểu là mỗi worker; bao gồm service nền, metadata DB, query, export, file cache và overhead |
| ADR-07 | Disk-first từ phase đầu | PostgreSQL + Parquet/NVMe; run lịch sử không sống trong RAM của worker/API |
| ADR-08 | 10–20 user không phải 20 heavy workers | Admission control, fair queue, quota và ưu tiên đường đọc |
| ADR-09 | TS/Rust/Python mỗi lớp có trách nhiệm rõ | TS control/BFF; Rust projection/query; Python strategy + public QuantBT API trong sandbox |
| ADR-10 | Không chia agent cứng theo ngôn ngữ | Một agent có thể làm lát cắt backend–frontend; reviewer độc lập kiểm tra contract/evidence |
| ADR-11 | QuantBT nâng theo release đã kiểm chứng | Endpoint additive là giả định chính; không khóa vĩnh viễn 1.1.1, không xây framework đa engine không cần thiết |
| ADR-12 | ResearchAttempt khác WorkerAttempt | Lịch sử thử ý tưởng không bị trộn với crash/retry kỹ thuật; UI không phải thêm một màn mới |
| ADR-13 | AlphaVersion binding theo redesign | Bind tại submit; code immutable; params/ranges có thể đổi qua research attempt; scratch không retro-bind để publish |
| ADR-14 | Ưu tiên reuse thay vì mở rộng stack | Reuse PostgreSQL/NATS/storage hiện có theo quyền; không thêm Kafka/Redis/ClickHouse/Kubernetes chỉ để “scale” |
| ADR-15 | Không tạo gate/policy mới bằng suy luận | Mọi approval status, SLA, expiry, quyền và action lấy từ execution hiện hành |
| ADR-16 | Tối ưu không được đổi semantics | Không tự giảm trials, đổi seed/schedule, bỏ ledger bắt buộc hoặc ghép equity sai để vừa RAM |

### 1.2. Các đề xuất trước đây KHÔNG đưa vào V1

Không thêm “approved-use envelope” cho R1, không tự sửa điều kiện R2, không thiết kế lại expiry/quorum/supersede của approval, không dựng portfolio promotion từ hai run, không buộc execution subscribe topic/endpoint mới. Không coi một digest của selected artifact là digest toàn bộ RC pack. Không coi AST/import pass là chứng nhận không look-ahead. Không mặc định NVMe spill đã làm giảm RAM bên trong engine.

G1/G2 hoặc các gate execution đã có tiếp tục giữ nguyên. Request viết/triển khai Research không cấp quyền chạy mainnet/canary/vốn thật, sửa position hay tự promote deployment. Bài kiểm thử tích hợp chỉ dùng môi trường và identity được phép.

## 2. Baseline và quyền sửa code

### 2.1. Snapshot được kiểm tra

| Nguồn | SHA-256 archive | Vai trò |
|---|---|---|
| `awesome-portal-main.zip` | `29ba4a7ccda9c43892706ce355dd1a6cffd638a59128bee9d004236a85bf6415` | Baseline code Portal; execution contract phải được giữ nguyên |
| `Quantbt Backtest Flow Redesign (5).zip` | `ae6ab0474589610df85373601e6d80c3a962de54e976e3b913f7dd180271c358` | Root `release-v1.1`; 15 HTML và 15 spec màn 00–14 |
| QuantBT release 1.1.1 | Source provenance commit `2c811a7faaed3c274e93c60650e16207949f0a59` | Đối chiếu release; không đồng nhất `main` thay đổi theo thời gian với wheel này [E01] |

Snapshot ZIP không chứng minh feature flag, service, dữ liệu hay phần cứng trên server hiện đang giống hệt. P01 ghi nhận commit/runtime thật và diff với baseline; không chạy sửa chữa hoặc migration production trong bước discovery.

### 2.2. Allowlist và protected surface

**Research-owned, được bổ sung hoặc refactor có test:** `apps/portal/backend/src/portal_api/` tại module research đã xác định; new `apps/control-api/src/research/`; new `services/portal-research-rs/`; frontend research trong `apps/portal/frontend/src/features/`; migration của schema Research riêng; research tests và docs. Đường Python legacy `/api/runs` là producer compatibility surface: được nâng implementation phía Research nhưng phải giữ contract mà consumer execution đang dùng.

**Được thay đổi rất hạn chế:** bootstrap/router/root module dùng chung chỉ để đăng ký module Research hoặc lazy route mới; dependency lock chỉ phục vụ phần mới, không upgrade thư viện chung vô cớ; Compose/service declarations chỉ thêm Research dưới quyền owner. Mỗi thay đổi shared có diff giải thích và regression execution.

**Không được sửa:** `services/portal-execution-edge-rs/**`; implementation/schema/tests chuẩn của governance, execution, action/risk/accounting; `apps/control-api/src/facade/` consumer flow được dùng làm oracle; execution frontend và global behavior của shell; database execution hoặc migration của nó; protected strategy `apps/portal/strategy/main.py`; quyền cloud, secrets, auth policy hoặc topology production nếu chưa được owner cho phép.

`apps/control-api` chứa nhiều domain: không xem toàn bộ thư mục là Research-owned. P01 sinh manifest file-level `protected-surface.json`; CI so hash/diff. Không sửa golden fixture execution để khiến code Research pass. Nếu cần đăng ký root module chung, patch phải additive và nằm trong allowlist hẹp; không dùng đó để đổi method của consumer.

Tuân thủ `AGENTS.md` và `CONTRIBUTOR_AGENT_RULES.md` về branch, secret và quyền infra. Chỉ thay quy ước phân công agent theo yêu cầu mới nhất của owner; không suy ra quyền push/merge/SSH cao hơn. [P01]

## 3. Khoảng cách đã thấy trong source — phải đóng bằng evidence

| Gap | Quan sát source | Cách xử lý V1 / phase đóng |
|---|---|---|
| GAP-01 | Python dependency và adapter ghim 1.0.8 | Nâng producer Research lên 1.1.1, giữ provenance run cũ; P04 [P02] |
| GAP-02 | Direct POST chạy `RunManager`/ProcessPool; durable modules có nhưng không mặc định là đường HTTP | Một đường submit bền vững thực sự xuyên từ UI; P06/P10 [P03] |
| GAP-03 | `execute_run_in_process` của durable worker dùng `asyncio.to_thread` | Không tin tên hàm là isolation; thực thi trong child process/sandbox thật; P06 [P04] |
| GAP-04 | Data catalog có full bytes Parquet, export có pandas/full file paths, artifact có nhiều copy | Streaming/bounded writer, zero unnecessary copy, scratch lifecycle; P05 [P05] |
| GAP-05 | Import cũ là inbox artifact/quarantine, chưa phải `.py` → executable AlphaVersion mới | Adapter registry/sandbox/import workflow theo màn 14; P07 [P06] |
| GAP-06 | Legacy create `/api/runs` trả 202; facade chỉ seed read model trên 202 | Giữ 202 qua facade; sửa mô tả 201 ở create-run, không sửa facade; P02/P10 [P07] |
| GAP-07 | RunSync chỉ refresh run đã tồn tại và đúng workspace | Không bypass facade hoặc ghi SQL trực tiếp vào read model execution; P02/P10 [P08] |
| GAP-08 | RunSync hash toàn object `summary.selected_params`, đọc claim keys trong object | Producer xuất đúng frozen selection artifact; không trả bare θ, không nhầm full RC hash; P02/P22 [P08] |
| GAP-09 | Governance so `alpha_id` với `run_read_models.strategy_id` | Có mapping research alpha / registry strategy / execution subject trung thực, stable; spike trước UI lớn; P02 [P09] |
| GAP-10 | R1 create strict schema; enum/SLA khác hi-fi | Adapter publication + display mapping theo actual response; không sửa governance; P02/P22 [P10] |
| GAP-11 | Legacy progress đếm từ console; console đọc toàn text rồi tail | Structured progress riêng và bounded log reader; không dùng log parsing làm audit; P11 [P03] |
| GAP-12 | Writer audit 1.1.1 vẫn retain chunk sau export hook | Đo engine peak; bounded integration hoặc dependency additive công khai nếu cần; không monkeypatch; P04/P05 [E02] |
| GAP-13 | Three-window runner có đường thực sự đánh giá Holdout Live | Không gắn nhãn “sealed/unread” cho dữ liệu đã đọc; workflow mới theo spec, history giữ nghĩa cũ; P08/P14 [P11] |
| GAP-14 | FE hiện dùng TanStack Query, ECharts 6; một số spec minh họa RTK/khác version | Giữ installed stack, tái tạo behavior/visual; không thêm Redux hay downgrade global chỉ vì pseudocode; P09 [P12] |
| GAP-15 | Hi-fi route/cert/backend là bảng mô tả, không phải bằng chứng runtime | Manifest từ release và feature probes; never-claims riêng, không badge tự chứng nhận; P04/P09 [D04] |

### 3.1. Correction ledger áp dụng cho specification

Các điều chỉnh sau chỉ giải quyết mâu thuẫn đã thấy hoặc ý kiến owner. Agent ghi `correction_id` trong fixture/copy review; không sửa các copy khác tùy ý.

| ID | Điều chỉnh | Giữ gì nguyên |
|---|---|---|
| COR-01 | Create run đi legacy facade, HTTP 202 thay vì mặc định 201 | Các bước wizard, preflight và điều hướng progress |
| COR-02 | Thay RTK pseudocode bằng TanStack Query hiện có; ECharts dùng bản installed | Loading, caching, interactions, visual tokens và contract dữ liệu |
| COR-03 | Backend được tính analytics từ raw, kể cả correlation | FE không tự tính; nguồn `PORTAL_DERIVED`, formula/input revision; copy “engine-published” chỉ dùng khi đúng |
| COR-04 | Pool freeze không chứng minh selector chưa thấy OOS | Panel freeze vẫn có timeline/digest; verdict phải theo evidence/mode/schedule thật |
| COR-05 | Methodology A–D và engine L0–L4 là hai trục khác nhau | Không lấy `min()` giữa hai thang không cùng nghĩa; không tự tạo policy execution |
| COR-06 | `APPROVED_WITH_CONDITION`/`DENIED` của execution được mirror nguyên trạng | Có thể trình bày nhãn plural/rejected theo mapping; raw status vẫn hiện/truy được |
| COR-07 | Superseded RC là quan hệ Research, không giả lập approval outcome | Không tự expire/deny approval cũ; downstream quyết định độc lập |
| COR-08 | SLA/expiry lấy từ response execution, không hardcode ví dụ 5d/90d | Bố cục countdown/as-of/stale giữ nguyên |
| COR-09 | `intrabar_bracket` backend theo release contract/probe, không auto-Rust từ wheel presence | Route card/panels đầy đủ; route explicit Rust chỉ dùng khi public API hỗ trợ |
| COR-10 | Compare trong **một alpha** theo spec 13 chi tiết | Markets small multiples; pair ≤2 cùng key; không tạo portfolio/pair RC |
| COR-11 | “Pair promotes under weaker claim” là diễn giải so sánh trong UI | Không tạo action/gate hay sửa policy; dùng copy làm rõ phạm vi nếu gây hiểu sai |
| COR-12 | Đã compute xong ≠ artifact/UI evidence đã sẵn sàng | Progress giữ trạng thái finishing/sealing trung thực; terminal completion chỉ sau gate |
| COR-13 | Holdout đã dùng không được hiện sealed/unread; unlock không tự ban claim A | Giữ audited unlock/fork và evidence rules theo spec, không tự cấp chứng nhận |
| COR-14 | Route-specific order/fill/close timing lấy từ execution contract thật | Không dựng FILL chỉ từ target transition hoặc label close sai thời điểm |
| COR-15 | Library hiển thị QUEUED khi job còn hàng đợi dù type sample thiếu | Không gọi đó là RUNNING để làm thống nhất type |
| COR-16 | 15 màn thực tế, không dùng số 14 trong README cũ làm phạm vi | Screens 00–14 và nội dung original đều được truy vết |
| COR-17 | Màn 14 là contract mirror chỉ đọc; bỏ hướng hiểu “field editor” cho fields lấy từ `.py` | Upload/paste/parse/gates/register và metadata input được spec cho phép vẫn đầy đủ |
| COR-18 | Demo switchers/timer/mock verify không phải commands production | Giữ hành vi trình bày; kết quả runtime/verify phải từ backend thật |
| COR-19 | `pick`/inspection tách raw best, engine-selected, promotion pick và published RC | Scatter/ledger/hash đồng bộ cursor; không mutate θ* khi click |
| COR-20 | Field optimizer trùng nghĩa dùng một canonical draft value; khác semantics phải tách scope | Giữ controls/full config và sparse overrides; producer legacy compatibility không đổi |
| COR-21 | Final audit kiểm chứng selection đã freeze, không tự optimize hoặc chọn lại | Có thể reuse evidence đủ chuẩn hoặc tạo linked audit run theo §5.6 |
| COR-22 | Màn 05 chỉ đọc metadata seal; chưa xác minh authority thì không tự implement unlock | Giữ seal card, links và disclosure; DR-01 kiểm soát mutation, không thêm governance |
| COR-23 | Warning sát biên không chứng minh “not an optimum” hoặc bắt buộc widen trước deployment | Ngưỡng Search/Freeze cần DR-02; giữ cảnh báo đúng tên/nguồn, không thêm gate |
| COR-24 | Selected params không nhất thiết có trial number, ví dụ centroid | Param passport/θ* vẫn đầy đủ; `selected_trial_ref=null` có reason, không fake trial |
| COR-25 | `seq`/bar index/playback ordinal là các đại lượng khác nhau; giữ `trade`/`pick` deep links | Original IDs, stable ordering và all-panel sync không đổi; codec ở §13.6 |
| COR-26 | “GATES RESET”/promotion pick/integrity warning không cấp Research quyền sửa execution | Mirror/navigation theo source; không revoke, reset approval hoặc dừng runtime |
| COR-27 | Route card có thể đến từ release manifest nhưng runnable còn phụ thuộc adapter/form/evidence | Route mới hiện status/reason trung thực; không che implementation gap thành engine refusal |
| COR-28 | Causal reveal không là certificate; snapshot integrity scan không đồng nghĩa đã research-use holdout | Giữ danh tính data/evidence và tách các trạng thái sử dụng/quan sát |
| COR-29 | Clone sang release mới khác reproduce trên release cũ | Giữ thao tác UI trong scope; intent/effective-default diff được công khai |

<a id="review-findings"></a>
### 3.2. Findings sau review HTML/spec — phải truy vết tới phase

Đây là findings từ source/handler/type/copy; **chưa phải browser acceptance hoặc output QuantBT đã chạy**. Phần quan sát và quyết định triển khai được ghi riêng. Không copy thuật toán sinh mock/timeout vào production.

| ID | Finding / rủi ro cần đóng | Contract/giải pháp | Phase chịu trách nhiệm |
|---|---|---|---|
| FND-01 | HTML Freeze verify bằng timer; prototype có scenario controls và replay sinh dữ liệu mẫu [R01][R07] | Action manifest phân loại demo; verify/metrics/event dùng evidence thật | P01,P02,P09,P11,P16,P17,P24 |
| FND-02 | Search `pick` là inspection; raw best/θ*/promotion pick dễ bị dùng chung state [R04] | Selection namespaces, cursor readonly với artifact, scenario click-nonselected | P03,P09,P13,P15,P16,P21 |
| FND-03 | Spec Import cấm sửa parameter_space; P07 cũ dùng “field editor” [R02] | Mirror readonly; sửa source→new digest/version; New Run chỉ narrow/pin trong declared surface | P07,P08,P10 |
| FND-04 | Wizard có legacy trials/early-stop/seed và full optimization_config cùng ý nghĩa tiềm năng [R03] | Canonical-value + field-binding map; conflict refusal; actual endpoint mapping | P02,P04,P08,P10 |
| FND-05 | Budget trial dễ bị hiểu “toàn run” thay vì từng study/fold/seed | Topology plan/units và reserved resource; counters giữ status/role độc lập | P04,P06,P08,P10,P11,P15 |
| FND-06 | Sparse defaults có thể đổi semantics khi clone/reproduce qua engine release | Reproduction intent pin effective spec/environment; upgrade creates disclosed experiment | P04,P08,P10,P19,P23 |
| FND-07 | Draft/attempt/run/worker/audit counts dễ làm sai lineage [R08] | Persisted attempt registry + loại relation/job; counts có definition và breakdown | P03,P06,P10,P12,P19 |
| FND-08 | Final audit có thể bị làm thành optimize lần hai hoặc luôn duplicate full run | Frozen selection target + reuse checklist/linked audit; không best-of-retries | P04,P06,P16,P17,P18,P21,P22 |
| FND-09 | Type `thetaTrial:number` không biểu diễn selected centroid hợp lệ [R04] | Selected artifact identity độc lập trial ID; actual final evaluation không fake original trial | P03,P04,P15,P16,P21 |
| FND-10 | Split spec giải thích seal, source là governance store, không tự cấp unlock [R05] | Authority discovery DR-01; mutation boundary đóng trước action | P02,P08,P14,P19,P21 |
| FND-11 | “Unread” có thể nhầm snapshot scan, engine-use và user-view | Exposure facts/versioned scope, không re-seal qua clone; không tự cấm toàn workspace | P03,P08,P14,P18,P19 |
| FND-12 | Search và Freeze dùng ngưỡng sát biên khác; copy Freeze kết luận quá mạnh [R01][R04] | DR-02 + warning-definition version; warning không thành optimizer proof/gate | P02,P13,P15,P16,P18 |
| FND-13 | Undefined metrics/categorical importance/status denominators dễ bị điền 0 hoặc ordinal giả | Formula registry có sample type/population/edge cases; typed availability | P04,P13,P15,P18,P20 |
| FND-14 | Grid9×9 không luôn là 81 θ khác nhau; lookup không đồng nghĩa có đủ evaluation | Cell→effective θ mapping; explicit diagnostics; objective/data role đúng mode | P05,P06,P15,P16,P23 |
| FND-15 | Replay `seq`, bar, timestamp, ordinal và reveal có thể bị gộp [R07] | Event cursor có scope, stable order, checkpoint, reveal presentation-only | P05,P09,P13,P17,P18 |
| FND-16 | Grammar V1 cũ thiếu `pick`/`trade`, có alias `event_seq` [R04][R07] | Versioned cursor codec, direct deep-link and conflict rules | P02,P09,P15,P17,P24 |
| FND-17 | Lineage promotion pick / GATES RESET không phải quyền mutation [R08] | DR-03, verified source mapping, không chọn max Sharpe, không reset approval | P02,P19,P21,P22,P24 |
| FND-18 | Engine hỗ trợ không đồng nghĩa Portal đã tích hợp hoặc job đủ resources [R03] | Bốn trục capability, card có reason; runtime conditions kiểm tra preflight | P04,P08,P09,P10,P23 |
| FND-19 | Fixed params, run pins, θ digest và bundle digest không cùng phạm vi [R01] | Parameter identity manifest, giữ exact downstream canonicalization | P02,P03,P07,P10,P16,P21,P22 |
| FND-20 | “Guide đầy đủ” có thể bị hiểu đã field-map/browser-test đủ 15 màn | Ba ma trận field/action/scenario, coverage có denominator, không PASS bằng source grep | P01,P02,P09–P24 |

### 3.3. Decision register — không để agent tự phát minh nghiệp vụ

**Trạng thái:** `RULE_FIXED` = quy tắc triển khai trong V1 này; `VERIFY_SOURCE` = chốt bằng source/runtime contract và test; `OWNER_SCOPE_REQUIRED` = chỉ khi nguồn không giải quyết được ý nghĩa/phạm vi. Các ID dưới đây là quyết định thiết kế Research, **không phải gate approval R1/R2 mới**.

| ID | Nội dung phải chốt | Hướng V1 / ai đóng / điều kiện chặn |
|---|---|---|
| DR-01 | Holdout seal/unlock authority, route, actor, sibling semantics | `VERIFY_SOURCE` P02/P08. Màn05 readonly metadata. Nếu không có mutation contract phù hợp, `OWNER_SCOPE_REQUIRED`; chỉ chặn unlock/evaluation và claim phụ thuộc, không bịa workflow, không đánh dấu toàn chức năng đã xong |
| DR-02 | Cảnh báo sát biên của06/07: một definition hay hai diagnostics | `VERIFY_SOURCE` P02/P13; đề xuất một Research warning-definition chung, hoặc hai tên rõ khi semantics khác. Mâu thuẫn source chưa giải quyết→owner chọn copy/threshold trước P15/P16 acceptance; không chọn ngưỡng lén trong component |
| DR-03 | Nguồn `promotion_pick`, ý nghĩa “single promotable”, mapping version/attempt | `VERIFY_SOURCE` P02/P19 với unchanged governance. Nếu nguồn không có field/quan hệ đủ, owner chốt biểu diễn research-only phù hợp; không tự chọn best hoặc thêm uniqueness policy execution |
| DR-04 | Attempt được tạo lúc nào, draft có trong total nào | `RULE_FIXED` trong V1 tại §5.5: một persisted draft/intent, không mỗi keystroke; total phản ánh registry gồm draft khi spec yêu cầu, có breakdown executed/draft/failed/probe; P02/P03 đối chiếu legacy reader. Sai khác cần được ghi, không sửa counts quá khứ âm thầm |
| DR-05 | Reproduce, clone, upgrade, audit/replay là những intent nào | `RULE_FIXED` §5.6–5.7; P02/P04 map existing actions, không thêm nút/endpoint ngoài scope. Engine/audit cardinality `VERIFY_SOURCE`, không tự refit hay chọn θ |
| DR-06 | Canonical optimizer fields, conflict/default/seed scope | `VERIFY_SOURCE` P02/P04; frontend/server một logical value, actual alias map có fixture; chưa đóng thì chặn serializer dependent, không priority ngầm |
| DR-07 | Full RC → actual downstream pin/approval và reset/supersede | `RULE_FIXED` execution immutable; mapping `VERIFY_SOURCE` ở P02 trước P22. Không gộp parameter/legacy/RC/evidence-set digest |

Quyết định owner cần có `decision_id, question, source_conflict, options_in_scope, recommended_resolution, affected_fields/actions, decider, status, evidence_ref`. Agent không hỏi lại điều đã rõ trong user constraints/source, cũng không ghi một owner decision giả để pass. `BLOCKED` nêu chính xác action/capability/test bị chặn; các phần độc lập vẫn tiếp tục. Final V1 acceptance không được che một mandatory blocked item thành N/A.

<a id="part-ii"></a>
# II. KIẾN TRÚC, DOMAIN, STORAGE VÀ TÀI NGUYÊN

## 4. Topology và authority

```text
Browser Research (15 screens; React + TanStack Query + charts installed)
        │ authenticated commands / bounded reads / progress stream
        ▼
TS Research BFF + control modules
        ├── existing facade POST /api/runs ──► Research producer compatibility API
        ├── PostgreSQL Research metadata, queue intents, indexes, revisions
        ├── Rust query/projection ──► sealed Parquet + indexes trên NVMe
        ├── durable dispatch: NATS IDs/events nhỏ, không DataFrame
        │                         ▼
        │                 Supervisor + isolated Python job
        │                   strategy artifact + QuantBT/native
        │                         │ bounded batches / manifests
        │                         ▼
        │                staging → seal → registered evidence
        │
        └── Research publication adapter ──► EXISTING governance/execution APIs
                                                │
                                  Existing R1/R2/runtime: UNCHANGED
```

Không có đường browser → database, browser → worker process hay research → execution SQL. Không có Python callback qua mạng từng bar. Raw dataset không đi qua TS dưới dạng JSON. Một job giao nguyên ý định cho worker; QuantBT/native và strategy tương tác nội bộ runtime.

### 4.1. Trách nhiệm writer

TS control layer là writer của identity/lifecycle/commands trong schema Research. Worker báo tiến độ và đề xuất kết quả qua contract nội bộ; commit cuối phải có lease/fencing token. Rust ghi projection theo job được giao và revision xác định, không tự quyết định run terminal hoặc publishability. Metadata store là authority durable; message broker chỉ vận chuyển.

Không để Python, Rust và TS cùng có state machine riêng cập nhật trạng thái bằng last-write-wins. Cho phép một module persistence dùng chung hoặc repository contract, nhưng mỗi transition phải có expected state/version và permission.

### 4.2. Deployment nhỏ trước, mở rộng được sau

Ban đầu: một research compute node, một supervisor, một heavy compute slot ở cấu hình 5 GB; Rust query nhỏ có budget; metadata DB/hạ tầng sẵn có được dùng trong giới hạn quyền. Không tạo 15 service. Worker không luôn resident theo từng user.

Boundary mở rộng: job ID bất biến, artifact ref thay cho local path trong domain, lease/cancellation/fencing, object-store interface và schema version. Sau này thêm worker/node hoặc tách query không phải đổi RunSpec, RC hoặc UI. Mmap/rename local không được giả định hoạt động qua nhiều host; storage backend khác phải triển khai cùng durability/read contract.

Nếu DB/queue/MinIO dùng chung với execution, không retune thông số global hay áp cgroup ảnh hưởng execution. P01 xác nhận ownership; áp pool/quota cho Research hoặc instance tách biệt nhỏ nếu owner cho phép. Phần RAM tăng thêm và chi phí nền thực tế vẫn phải được báo cáo, không “giấu” ngoài ngân sách.

## 5. Mô hình danh tính và lifecycle

### 5.1. Định nghĩa bắt buộc

| Đối tượng | Ý nghĩa | Bất biến quan trọng |
|---|---|---|
| Alpha | Ý tưởng/strategy identity stable trong workspace | Không dùng best run thay identity |
| AlphaVersion | Code bytes, entrypoint và dependency artifact đã đăng ký | Code digest/entrypoint không sửa tại chỗ; trạng thái activation là metadata có audit |
| ResearchAttempt | Một ý định thử nghiệm, có parent/diff/lý do | Đổi data/spec/seed để nghiên cứu tạo attempt mới; abandoned vẫn có lịch sử |
| Run | Một thực thi logic của RunSpec, có artifact revisions | Không gắn lại AlphaVersion sau khi xem kết quả |
| Job | Đơn vị scheduler: primary, diagnostic, projection, export, verify | Job kind không tự làm thay đổi claim hoặc selection |
| WorkerAttempt | Một lần worker cố chạy một job, có lease/epoch | Retry kỹ thuật không tăng research-attempt count |
| Study/Trial/Evaluation/Fold | Lịch sử optimizer và đánh giá thực tế | Trial ID phải được scope theo study/run; evaluation không đồng nghĩa trial |
| SelectionArtifact | Quyết định chọn + θ + evidence lineage | Raw best, selected, per-fold selected và deployment/refit selection là khái niệm khác nhau |
| ArtifactRevision | Bộ references/digests được commit nhất quán | Màn liên quan không đọc lẫn các revision |
| ReleaseCandidate | Manifest Research đầy đủ, immutable sau publish/seal theo workflow | Delivery/approval mirror thay đổi nằm ngoài manifest frozen |
| PublicationReceipt | Request/ack/mapping tới approval hiện có | Không là approval authority mới |

Chữ `R1` còn có thể xuất hiện trong cấp runtime reactive của engine; trong code/type/docs phải ghi `engine_runtime=R1` khác `approval_gate=R1`. Không dùng một enum chung.

### 5.2. ResearchAttempt và WorkerAttempt — triển khai không làm rối UI

Ví dụ `att_04` có run A. Worker crash trước terminal commit; worker attempt thứ hai thực thi lại đúng intent. UI lineage vẫn một `att_04`; operational drawer ghi hai worker attempts và lỗi của lần đầu. Đổi seed/space/dataset để thử một hướng khác tạo `att_05` với diff rõ.

Mỗi worker attempt có staging riêng, nhưng dùng lại immutable input reference. Late worker mất lease không được công bố kết quả, dù ghi file thành công. Không nhân bản toàn dataset theo retry. Terminal FAILED không tự trở thành một research attempt mới bằng nền; “Run again” chủ động phải theo lineage UI.

Unseeded job không được hứa retry bitwise identical. Nếu người dùng đã xem partial results rồi điều chỉnh nghiên cứu, lưu exposure/provenance phù hợp; không xóa failed history để giảm số lần thử. Count research attempts phục vụ màn 10, **không tự bằng số hypothesis tests độc lập**.

### 5.3. AlphaVersion và scratch

Bind `alpha_version_id` tại submit cùng digest/entrypoint. Cùng version được chạy nhiều parameter spaces và data snapshots; không tạo code version cho từng parameter value. Đổi code hoặc packaging có ảnh hưởng runtime tạo version mới.

DRAFT version được research nếu spec cho phép, nhưng không được giả ACTIVE để RC pass. Activation là transaction có optimistic concurrency; không tự đổi version đã chọn trong một wizard đang mở của user khác. Scratch không bind vẫn được compute/evidence; giữ `NOT_PUBLISHABLE` vĩnh viễn cho run đó. Muốn publish phải có bound run mới với lineage tới scratch, không retroactive binding.

Import “gate 7 static no-lookahead scan PASS” chỉ là qua kiểm tra tĩnh, không chứng minh causality của toàn strategy. Source, sandbox validation và causal invariance tests là các lớp khác nhau.

### 5.4. State machine Research và projection tới legacy

Lifecycle nội bộ đề xuất: `DRAFT → PREFLIGHT_VALID → QUEUED → CLAIMED → RUNNING → COMPUTE_DONE → SEALING → READY`; nhánh `CANCEL_REQUESTED/CANCELLED`, `FAILED`, `RECOVERY_REQUIRED`. Tên là Research-only; P02 chốt type schema, không áp vào execution enum.

Legacy GET chỉ phản ánh `COMPLETED` sau khi selected artifact và summary bắt buộc đã sealed, durable và có thể refresh/pin nhất quán. Trước đó vẫn trạng thái chưa terminal tương thích; frontend có thêm substate finishing. Không trả COMPLETED để RunSync cache artifact rồi đổi selection sau đó.

UI Progress có states theo spec; `CANCELLED` được map thành failed/cancelled reason theo correction đã chốt, không mất operational source state. Cancel race với commit xử lý CAS: một transition thắng; không báo đã cancel trong khi artifact vẫn được publish trái ý định.

### 5.5. Inspection, selection và các loại “active” phải khác namespace

**Bất biến:** một click để xem không phải quyết định chọn θ. Dùng các fields/types riêng; không dùng `selectedId` chung cho toàn ứng dụng.

| Khái niệm | Authority / scope | Thay đổi bởi |
|---|---|---|
| `inspection_trial_ref` / `pick` | UI cursor có run/study/fold; chỉ xem | Click scatter/ledger, URL/back-forward |
| `raw_best_trial_ref` | Output engine, objective và evaluation scope | Kết quả computation được sealed; không user click |
| `selection_artifact_ref` | Engine selection record, có thể global/per-fold/composite | Một quá trình selection hợp lệ; immutable sau freeze |
| `active_alpha_version` | Registry metadata hiện hành, có audit/revision | Activation được phép; không đổi bound version của run cũ |
| `active_research_attempt` | Research lifecycle theo source | Intent/lifecycle explicit; không suy từ max metric |
| `promotion_pick` | Nguồn đã chứng minh ở DR-03 | Không tự tính ở frontend hoặc query rank |
| `published_rc_ref` | Sealed RC + actual publication mapping | Publish flow; không đồng nghĩa deployment đang chạy |

Query tùy `pick` chỉ đổi inspector/series selection có label; frozen params/passport/Report/RC luôn trỏ `selection_artifact_ref`. Cache key phải có inspection ref khi payload phụ thuộc inspection; không cache candidate detail dưới key summary chung rồi ghi đè θ*. Khi lựa chọn là centroid, trả actual params/artifact và `selected_trial_ref:null` với reason; UI vẫn hiện selected passport, không invent trial number.

**Attempt creation/counts:** browser draft chưa persist không tạo attempt mỗi lần gõ. Nếu existing workflow lưu draft/fork, tạo đúng một persisted attempt bằng client intent ID; edits trước submit tăng draft revision, không tăng count. Nếu không có save-draft action, lần submit durable đầu tiên atomically tạo intent/attempt/run. Không thêm button chỉ để đáp ứng cách lưu. Sau submit, material edit tạo intent mới; retry kỹ thuật giữ intent.

Lineage total từ registry bao gồm DRAFT theo spec, đồng thời có `draft_count`, `submitted_attempt_count`, `compute_failed_count`, `abandoned_count`, `probe_count`, `technical_retry_count` với definition/scope. Một attempt có nhiều job/evaluation không tự tăng research count. Filter hiển thị không xóa total. Worker lỗi rồi retry không thành “hai ý tưởng độc lập”; persisted drafts cũng không được gắn nhãn “đã backtest”. Không dùng count này như số hypothesis tests độc lập.

### 5.6. Final audit, replay diagnostic và reuse evidence

**Mục tiêu:** kiểm chứng đúng phương án đã chọn, không bí mật optimize lần nữa. Các tên dưới đây là domain labels Research, không phải public API QuantBT đã có.

1. Pin `source_selection_ref`, parameter/bundle digests, AlphaVersion, data bindings, effective engine config và `audit_target_kind` trước audit. Target có thể là `SINGLE_PARAMETER_SET`, `PER_FOLD_SELECTION_SEQUENCE` hoặc một policy/refit artifact mà engine thực sự xuất. Không tự tạo policy để lấp output còn thiếu.
2. Kiểm tra **reuse eligibility**: original execution đã có đủ required ledger/retention, đúng target/runtime/data/fees/funding/timing, verified manifests và numerical checks. Nếu đủ, `final_audit_run_id` có thể trỏ chính run đó theo contract; reuse không tạo một kết quả tính toán mới.
3. Nếu cần compute thêm, tạo linked audit run/job với `relationship=AUDIT_OF_SELECTION`; lưu input/output, không tạo optimizer search mới và không tự đổi selection. Child run có ID độc lập khi legacy publication cần evidence run ID; nó vẫn phải đi producer/facade registration contract ở §12, không insert execution SQL.
4. So audit output với search/selected evidence bằng tolerance phù hợp từng field/route, ghi intentional profile differences và nguyên nhân. Mismatch không được giải quyết bằng chọn output đẹp hơn, thay θ hoặc ghi đè run cũ. Core READY và audit eligibility phải phản ánh kết quả thật.
5. `selected=None` hợp lệ, audit unavailable và artifact corrupt là ba tình huống khác nhau. Search vẫn có thể completed hợp lệ khi engine không chọn được candidate; RC requiring selection bị chặn với reason, không biến best thành selected.

**Cardinality:** parent research intent có thể có primary run + linked audit + diagnostics + projection/export jobs. Schema quan hệ phải rõ; không dùng row count của jobs/runs thay attempt count. Diagnostic/final audit đã được người dùng xem được ghi exposure, nhưng không gọi là một independent research attempt chỉ vì có process mới. Khi người dùng dùng kết quả để thay tham số/space/seed/methodology, tạo research intent mới. Holdout-use theo sibling workflow riêng ở DR-01/§6.8.

**Reuse không áp dụng bừa cho stochastic compute:** byte-level input giống nhau chưa chứng minh hai lần unseeded execution giống nhau. Giữ random-state/seed/runtime provenance theo khả năng public API, không best-of-worker-retries. Audit khác profile có thể cần actual run; không hứa equivalence nếu engine chưa hỗ trợ.

### 5.7. Reproduce, clone và upgrade phải có intent rõ

| Intent | Engine/data/config | Lineage và UI |
|---|---|---|
| `REPRODUCE_EXISTING` | Pin release/image/dependencies, code, data snapshot, effective values và seed/state có sẵn theo contract | Original không sửa; reproduction mới linked. Thiếu archived inputs/environment thì báo limitation, không silently use current defaults |
| `CLONE_FOR_EXPERIMENT` | Prefill từ run gốc; thay đổi explicit được phép trong declarations | New draft/attempt theo §5.5; hiển thị material diff trước submit |
| `UPGRADE_ENGINE_EXPERIMENT` | New release được chọn có chủ đích; giữ giá trị cũ hoặc adopt defaults mới một cách công khai | Diff gồm defaults/resolved backend/capability/metric definition; không gọi là exact reproduction |
| `RENDER_OR_EXPORT_AGAIN` | Đọc immutable evidence, không compute strategy | Transform/presentation job, không tăng attempt; keep original report provenance |

Không cần thêm màn hay menu ngoài spec; existing clone/new-run/replay action phải được map tới một intent rõ. Sparse request vẫn áp dụng cho run mới; reproducibility dựa effective spec đã lưu, không dựa vào việc field có xuất hiện trong POST cũ hay không. Serializer reproduction chỉ truyền fields public endpoint chấp nhận; không gửi mù toàn bộ internal resolved object. Nếu defaults cũ không biểu diễn lại được, fail đúng incompatibility thay vì âm thầm đổi ý nghĩa.

## 6. Data contract và tính đúng nghiệp vụ

### 6.1. RequestedSpec, EffectiveSpec và preflight

Frontend chỉ gửi override người dùng thực sự thay đổi như spec. Backend lưu cả request nguyên nghĩa và effective spec sau khi resolve defaults theo engine release. Không đẩy default của frontend vào payload rồi làm mất khả năng phân biệt override.

Preflight xác định snapshot, input columns/types, symbol/timeframe, time bounds, warmup, calendars, gaps, fee/funding assumptions, route, optimization topology và authoritative fold plan. Preflight token/digest gắn với effective spec, input manifests, AlphaVersion và release. Mọi edit làm token hết hiệu lực; submit revalidate atomically. Snapshot đổi trong source không được âm thầm thay data của run.

Giữ timestamp source, normalization rule và units. Crypto UTC-naive được tiếp nhận là UTC theo data contract đã chốt; aware index convert UTC giữ cùng instant. Dữ liệu Việt Nam naive dùng Asia/Ho_Chi_Minh theo source, không áp UTC cho tất cả thị trường. Không tự cộng/trừ 7 giờ cho crypto.

Khoảng thời gian dùng quy ước nửa mở `[start,end)` và bar availability rõ. Wire UI dùng timestamp UTC chuẩn, độ chính xác milliseconds nếu contract consumer yêu cầu; sequence/giá trị int64 vượt JS-safe-range truyền string. Raw có thể giữ precision cao hơn, không làm tròn để dedupe nhầm hai sự kiện.

### 6.2. Ba khái niệm về thời gian dữ liệu

**Physical read:** byte được đọc/cache vào RAM lúc nào. **Decision access:** strategy/selector được dùng phần nào để quyết định. **Evaluation role:** data dùng chọn hay chỉ báo cáo.

Prefetch/mmap cả file không tự chứng minh leakage; nhưng truyền toàn future frame cho code không bị giới hạn cũng không được coi là causal chỉ vì UI gắn nhãn. Contract/sandbox/evaluator phải giới hạn decision access phù hợp. Test sửa dữ liệu tương lai và so output quá khứ; kiểm tra train scaler/feature fitting chỉ trên phạm vi cho phép. Warmup không tự được chấm vào returns.

Clock timeline tách monotonic duration và UTC timestamp; distributed wallclock một mình không chứng minh thứ tự causal. Event sequence/decision boundary trong cùng execution và data-window references là evidence chính.

### 6.3. Selection, OOS và claim

Raw best ≠ selected. Per-fold selected ≠ một global parameter set. Final/deployment selected params phải theo artifact/policy đã có trong methodology, không tự lấy fold cuối hoặc tối đa Sharpe. Nếu constrained optimization không có selector và engine trả selected=None, UI phải phản ánh chưa có selected artifact; không nâng best thành selected. [E03]

Mode/schedule là semantics, không chỉ nhãn. OOS dùng để selection phải hiển thị selection-input; retrospective không được gọi strict outer OOS. Mode 5 full-sample calibration không có OOS độc lập. Mode 2 IS-only bootstrap không phải bằng chứng OOS. Các tham số/phương trình default trong hi-fi chỉ hiển thị khi khớp installed release và effective config.

Pool freeze trước evaluation chỉ chứng minh pool cố định, không chứng minh selector chưa đọc OOS. Strict per-fold causal cần evidence đúng từng outer fold. Holdout đã được dùng không quay lại trạng thái unread; audited unlock ghi nhận fork/consumption, không tự nâng methodology claim bằng việc bấm nút.

Methodology A–D và engine cert L0–L4 giữ riêng. Capability ceiling cũng khác achieved certificate của một run. Backend có thể trình bày eligibility Research theo spec, nhưng execution/gate verdict cuối lấy nguyên nguồn existing.

### 6.4. Bốn loại field UI

| Loại | Cách tạo | Bằng chứng bắt buộc |
|---|---|---|
| `ENGINE_DIRECT` | Chuẩn hóa raw QuantBT output | Engine release, source table/field, units, scope |
| `PORTAL_DERIVED` | Rust/TS tính từ raw đủ dữ liệu | Transform version, formula, input digests, missing-data policy, test đối chiếu |
| `DIAGNOSTIC_RUN` | Cần đánh giá strategy mới | QuantBT job/run ID riêng, spec, input, budget và label không phải original run |
| `INSTRUMENTED_EVENT` | Ghi tại nơi sự kiện xảy ra | Event schema/sequence/source; không suy ngược từ equity/log thành “đã xảy ra” |

Không viết lại PnL/accounting engine để lấp thiếu original ledger. Có thể tính rolling statistics, chart distributions, aligned-return correlation và proxy importance; không tự tạo fills từ target path. Nếu route không emit một ledger có nghĩa, trả `NOT_APPLICABLE` kèm reason đúng route, không `MISSING` chung chung.


### 6.5. Units, instruments và calendar không được mất qua adapter

Account initial capital, margin, notional allocation, target units, equity fraction và leverage là các đại lượng khác nhau. Adapter phải có field mapping với dimension/unit, không nhân leverage hai lần hoặc biến tỷ trọng thành số hợp đồng. Chuẩn hóa fee one-way và slippage rate/bps tại đúng boundary; test round-trip từ form đến effective config. Không lấy cùng một con số từ field `slippage` legacy rồi gửi vào `slippage_bps` mà không đổi đơn vị có công thức. [P14][E10]

Instrument snapshot phải ghim symbol mapping, currency/settlement, multiplier, quantity/price constraints và metadata mà endpoint yêu cầu. Không tự mặc định mọi asset là linear USDT spot. Route không hỗ trợ loại instrument được chọn phải từ chối đúng reason thay vì xử lý bằng formula của một loại khác. Fields không có trong raw không được bịa chỉ để hoàn thiện passport. [E12]

Multi-symbol market cần common clock/observation policy được khai báo; hai arrays cùng length không đủ để xem timestamp đã aligned. Reuse public prepared-market/instrument APIs khi route hỗ trợ; tuyệt đối không generic forward-fill giá/bar còn thiếu để lách capability refusal. Lưu calendar policy, observation mask và snapshot refs trong evidence. [E11]

Raw precision được bảo toàn: giữ binary64 round-trip khi source là float, hoặc decimal/scaled integer khi source contract cung cấp; không đổi representation trong legacy selected artifact làm downstream hash khác. Frontend formatting chỉ là display. Engine-resolved metadata và adapter input là hai cột cần so sánh trong final audit.

### 6.6. Parameter authority: declared, swept, pinned và code-fixed

Nguồn declaration là `.py`/registered contract của AlphaVersion. Màn14 hiển thị **mirror readonly**; thay declaration/entrypoint/data contract phải thay source và validate lại, không PATCH mirror để giữ digest cũ. Màn02 chỉ narrow range, chọn sweep/pin và giá trị hợp lệ trong declared maximal surface. Không tự thêm/drop tham số vì muốn giảm dimensionality; pin giải phóng sweep dimension theo spec. [R02][R03]

Lưu rõ `declared_space_ref`, `run_search_space`, `pinned_values`, `code_fixed_values_ref` nếu thực tế có nguồn, và `effective_execution_config_ref`. Hai trường cùng tên không có nghĩa cùng phạm vi hash. Code-fixed có thể được bao phủ bởi code/bundle digest thay vì θ digest; không tự đưa vào legacy object để “đầy đủ hơn”. Parameters có canonical type: bool khác int; categorical không có thứ tự mặc định; step/grid phải phù hợp declared schema.

**Widen range:** trong declared bounds → new research draft/attempt cùng AlphaVersion; vượt declared bounds → sửa file/AlphaVersion mới. Giữ nguyên selected artifact của run cũ. Warning không tự phát lệnh widen, không trở thành điều kiện bắt buộc để execution deploy.

Đổi AlphaVersion/route ở wizard phải reconcile fields dependent: giữ các input còn hợp lệ, đánh dấu các input không còn phù hợp, invalidate preflight; không âm thầm reset toàn form, không mang old bounds/defaults qua schema mới. [S02]

### 6.7. Canonical optimizer binding và execution topology

P02/P04 tạo `optimizer-field-bindings.json`: từng control → canonical field → public QuantBT argument → legacy producer field nếu có → units/default/source/validation. Field-map là contract có version, không map theo tên đoán.

Spec có `optuna_trials/early_stopping/random_seed` và `optimization_config.n_trials/early_stopping_rounds/seed`. **Đầu tiên xác minh chúng có cùng nghĩa với installed release hay không**. Cùng nghĩa → một logical value, controls đồng bộ, preview và POST từ cùng serializer; nếu wire bắt buộc lặp alias thì assert equality. Khác nghĩa → scope/name riêng (ví dụ strategy seed và sampler seed), giải thích trong Review; tuyệt đối không ghi đè lẫn nhau. [R03]

Server từ chối conflict ở alias cùng nghĩa, với field paths/expected unit/reason; không có priority ngầm. `absent`, `null`, `0`, `false`, empty string là các trạng thái input khác nhau; normalize theo source type/contract trước preflight, không `value || default`. Untouched defaults không serialize như user override. Required legacy top-level fields vẫn có như §12; điều này không mâu thuẫn sparse `optimization_config`.

**Topology manifest:** lưu mode/schedule, outer/inner folds, studies, seed scopes, candidates, evaluation stages và budget semantics. Mỗi budget có `applies_to` (study/fold/seed/run hoặc scope engine định nghĩa), requested/upper-bound/actual, planned vs known. Early stopping/pruning và dynamic topology phải được ghi, không đưa upper bound thành exact ETA. Prepared data reuse, one-heavy-slot và bounded writer không được đổi topology/sampler order để vừa RAM.

Preflight dự trù primary search, candidate evaluations, required final audit và retention; what-if/export thêm về sau xin admission riêng. Không nhân vô điều kiện folds×trials×seeds nếu actual contract không thực thi như vậy. Optional diagnostic không khiến primary run treo ở SEALING; evidence bắt buộc có trong required profile thì phải hoàn tất đúng gate trước READY/RC readiness tương ứng.

### 6.8. Holdout: metadata, authority và exposure không được nhập làm một

**Màn05 là mặt đọc giải thích seal, không đọc holdout content.** Navigation tới Claim/hub không mở khóa dữ liệu. Source spec nói seal thuộc governance store nhưng không đủ để suy ra endpoint/quyền đang có; DR-01 phải ghi exact source/ref/schema/actor/route và scope được phép. Không thêm role approver, table approval hay một mutation endpoint của execution. [R05]

Tách các facts (fields mới Research nếu cần, không ép source có sẵn đổi schema): `snapshot_integrity_checked`, `evaluation_consumed`, `result_exposure_recorded`, `source_seal_state`, `source_as_of`, `evidence_scope`. Seal metadata/bars/digest có thể tồn tại từ snapshot ingestion mà không có evaluation. Nếu engine đã evaluate hoặc diagnostics đã dùng holdout thì không gọi là “unread” dù chưa mở report; nếu chỉ snapshot quality scan thì không tự kết luận đã dùng để chọn strategy.

Khi existing workflow cho phép unlock: explicit authorized intent, source acknowledgement, one-time logical operation theo source, linked sibling attempt/evaluation, idempotency và compute reservation trước khi chạy; không chạy request ngay khi mở card. Timeout/duplicate/retry giữ consumption evidence trung thực; không tự đánh giá nhiều lần rồi chọn kết quả tốt. Exact irreversible boundary và crash behavior do DR-01 source map xác nhận, không tự định nghĩa rule của governance.

Exposure ledger chỉ ghi những facts Portal/engine biết: dataset snapshot/range, source intent/run/evaluation/worker attempt, role của dữ liệu, principal khi có quyền ghi nhận, thời điểm và evidence reference. Không ghi “người dùng đã đọc hiểu” chỉ từ network response; không khẳng định chưa xem ở notebook ngoài Portal. Query chỉ dùng thông tin trong scope được phép, không leak private run/user metadata.

Clone/run mới không xóa recorded exposure trong cùng research lineage. Đổi snapshot digest nhưng khoảng dữ liệu chồng lấn vẫn cần disclosure khi có evidence overlap; digest khác không tự chứng minh holdout mới độc lập. Không suy thành một blacklist toàn workspace hay auto-downgrade mọi alpha. Phạm vi ảnh hưởng rộng hơn source contract phải được owner quyết định. Khi chưa biết exposure, ghi UNKNOWN, không “clean/unseen”.

### 6.9. Trial/evaluation population và selected state độc lập

Trial identity luôn scoped bởi study/run; evaluation có own ID, data-role, fold/seed và objective definition. `execution_status` (complete/pruned/failed theo engine) tách `feasibility`, `effective_duplicate`, `pool_membership`, `is_raw_best`, `selection_memberships`. Những flags có thể chồng lấn, không cộng thành một denominator giả.

Ledger hiển thị original statuses; selected badge không ghi đè COMPLETE. Mọi tỷ lệ có `population_definition_id`, count và actual source watermark. Trials/candidates/evaluations/worker retries không thay thế được nhau. Statistics cho sampled scatter phải ghi rõ là visual sample; totals/filter/histogram quan trọng dùng full intended population từ persisted evidence.

Nếu engine gộp/prune một effective duplicate, giữ original reason/canonical-ref khi có; không tự bịa evaluation score. Null objective là missing/error theo contract, không score0. Full-sample calibration, bootstrap IS, selection-input OOS và strict outer OOS có label/column unions đúng scope; không ép schema chung thành số OOS không có thật.

## 7. PostgreSQL Research — mô hình vật lý đề xuất

Đây là **schema logic NEW**, không phải migration vào bảng execution. P03 đối chiếu bảng Research đã có và reuse nếu đúng contract; không bắt buộc tạo bảng trùng chỉ vì tên dưới đây khác. Mọi relation người dùng truy cập phải có `workspace_id` và kiểm tra quyền từ identity hiện hành.

### 7.1. Nhóm bảng và trường chủ chốt

| Bảng logic | Trường chính tối thiểu | Ràng buộc/index quan trọng |
|---|---|---|
| `research.alphas` | workspace, alpha_id, name, owner, execution_subject_id, active_version_id, revision | PK(workspace,alpha); unique mapping có scope; activation CAS |
| `alpha_versions` | alpha/version IDs, code_digest, entrypoint, dependency/image refs, declared_contract, lifecycle, registered_by/at | FK workspace+alpha; code immutable; unique digest/entrypoint trong scope được phép |
| `import_sessions` | session_id, principal, source_file_ref, digest, validation_version, gate_results, expires_at | File ref opaque; ownership; no raw path from client; max payload |
| `attempts` | attempt_id, alpha_version_id nullable for scratch, parent_id, client_intent_id, draft_revision, intent_kind, reason, space_signature, state, exposure_summary_ref | No parent cycle; same scope; no duplicate autosave intent; raw exposure facts separate; no cascade erase history |
| `runs` | run_id, attempt_id, kind, parent_run_ref, relationship, target_selection_ref, request/effective_spec refs, engine_release_id, dataset_binding_digest, state, epoch, artifact_revision, timings | workspace+run PK; keyset index on created_at+run_id; state/revision CAS; linked audit/reproduction ≠ new intent tự động |
| `jobs` | job_id, run_id, kind, queue_class, cost_estimate, resource_class, state, cancel_version | queued order/fairness index; unique command id per scope |
| `worker_attempts` | worker_attempt_id, job_id, ordinal, worker_id, lease_epoch, expires_at, exit_reason, measured_usage, staging_ref | Unique job+ordinal; fencing epoch; bounded metadata, not embedded logs |
| `input_bindings` | binding_id, dataset/universe refs, snapshot digests, timezone/calendar, time ranges, quality summary | Immutable digest; no duplicate huge dataset per attempt |
| `studies` | run/study IDs, engine study key, purpose, fold_id nullable, sampler/config ref | Unique run+engine key; source stage/schedule preserved |
| `trial_index` | run/study/trial IDs, execution_status, feasibility, duplicate/pool/selection refs, params JSONB, objective summary, seed/scope, source, evidence_ref | Composite PK; filter indexes per workload; original status retained, orthogonal flags not summed as disjoint counts |
| `folds` | run/fold ID, outer/inner refs, interval boundaries, selection/evaluation role, quality | Stable ordinal, exact plan digest; not inferred from chart width |
| `selection_records` | selection_id, run/fold/study refs, selected_trial_ref, θ ref, rationale/refusal/fallback, source_digest | Selected-trial nullable when method outputs non-trial centroid; do not invent trial |
| `artifacts` | artifact_id, run/revision, table_kind, schema_version, manifest_digest, state, retention_class | Only sealed parts visible; unique source/version identity |
| `artifact_parts` | artifact/part IDs, blob digest, locator, bytes, row_count, min/max time/seq, partition stats | Digest/locator scoped; no absolute client-visible path; bounds indexes |
| `projections` | projection_id, input_manifest_digest, transform_version, definition_id, status, output_ref, usage | Unique input+transform+options+visibility; rebuildable separately |
| `run_events` | run_id, sequence, event_type, event_schema, timestamp, payload_ref/small payload | Unique run+sequence; cursor index; bounded row payload |
| `rc_drafts` | draft_id, base run/revision, declaration inputs, revision, eligibility | Mutable via If-Match; reference validated bound version |
| `releases` | rc_id, sealed manifest_ref/digest, final_audit_run_id, schema_version, supersedes_rc nullable | Immutable pack; mutable delivery/mirror not inside hash |
| `publication_receipts` | rc_id, request_key, payload_hash, approval_id, source_status, source_evidence_hash, sync_cursor/as_of, error | Unique intent; preserve all attempts/unknown outcome; no local approval authority |
| `command_dedup`, `outbox`, `inbox` | scoped key, request hash, durable response/ref, delivery/ack state | Transactional insert; inbox unique source+event; retry payload mismatch rejects |
| `audit_log` | actor, action, subject, reason, before/after refs, correlation_id, timestamp | Append-only permission; no credentials or full private frames |

Không dùng một trường `runs.result_json` chứa toàn bộ trials/paths/logs. JSONB chỉ cho config nhỏ, parameter object, bounded metadata hoặc discriminated payload có schema. Metric phổ biến được filter/sort phải có cột/typed projection, không scan JSON lớn mỗi request.

### 7.2. Ví dụ DDL minh họa — agent phải generate migration có kiểm tra

```sql
CREATE SCHEMA IF NOT EXISTS research;

-- Illustrative subset. Scope keys intentionally travel together.
CREATE TABLE research.run_index (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  attempt_id text NOT NULL,
  state text NOT NULL,
  state_version bigint NOT NULL DEFAULT 0,
  artifact_revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, run_id)
);
CREATE INDEX run_library_cursor_idx
  ON research.run_index (workspace_id, created_at DESC, run_id DESC);

CREATE TABLE research.trial_index (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  study_id text NOT NULL,
  trial_id text NOT NULL,
  trial_state text NOT NULL,
  params jsonb NOT NULL,
  objective_value double precision,
  objective_defined boolean NOT NULL,
  selected boolean NOT NULL DEFAULT false,
  source_artifact_id text NOT NULL,
  source_revision bigint NOT NULL,
  PRIMARY KEY (workspace_id, run_id, study_id, trial_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.run_index(workspace_id, run_id),
  CHECK (jsonb_typeof(params) = 'object'),
  CHECK (objective_defined = (objective_value IS NOT NULL))
);
CREATE INDEX trial_score_page_idx
  ON research.trial_index
  (workspace_id, run_id, study_id, trial_state, objective_value DESC, trial_id);
```

Production schema bổ sung FK study, objective vector/definition, finite-number validation, soft deletion/retention, revision consistency và index theo query plan đo thật. Ví dụ không định nghĩa một objective scalar thay cho mọi multi-objective mode. Multi-objective dùng bảng/typed bounded vector riêng và giữ direction per component; không tự trộn thành một score.

Không “ON DELETE CASCADE” xóa evidence đã publish khi user xóa một draft. DB role Research không có quyền UPDATE/ALTER execution schema. Có thể dùng RLS như defense-in-depth nếu phù hợp triển khai hiện tại; vẫn phải kiểm tra object authorization ở service. Không dùng `workspace_id=ws_unknown` khi thiếu context.

### 7.3. SQL index và Parquet không phải hai authority tính toán độc lập

Raw engine/evaluation evidence lưu trong artifact; SQL trial index là projection của batch nguồn cụ thể. Mỗi row biết `source_revision`/artifact. Batch append idempotent qua `batch_id`; nếu worker replay batch, index và ledger không nhân đôi. Chỉ ACK checkpoint sau khi phần cần cho recovery đã durable.

Có thể cho progress thấy subset đã commit khi đang chạy, nhưng phải có `is_partial`, watermark và counts chính xác. Terminal revision được công bố sau reconcile row counts/digests/source refs. Không đưa “512 trials” trong header trong khi ledger chỉ giữ top 50 mà không có cách đọc các trial còn lại.

Filter, sort và pagination dùng keyset/cursor ổn định với tie-breaker; offset chỉ cho tập rất nhỏ được chứng minh. Query có whitelist cột, predicate và giới hạn. Không cho browser gửi SQL tùy ý. Index thiết kế theo EXPLAIN thực tế, không tạo một index cho mọi possible JSON key.

### 7.4. Bổ sung schema để hỗ trợ findings, không nhân bản raw data

P03 bổ sung hoặc reuse các relation/columns sau; tên là logical NEW, phải tránh duplicate table nếu existing Research đã có:

| Surface | Trường/quan hệ cần có | Invariant |
|---|---|---|
| Run/job relationship | parent_ref, relationship kind (primary/audit/diagnostic/reproduction/export), target_selection_ref, effective_spec_digest | Audit job không tự tăng ResearchAttempt; không relation cross-workspace |
| Selection target | artifact_ref, target_kind, per-fold refs khi có, optional selected_trial_ref, parameter/bundle refs | Centroid/null-trial hợp lệ; composite không ép thành θ fold cuối |
| Optimizer bindings/topology | schema version, canonical config ref, budget scopes, seed/study plan, planned/actual counts | Conflict fields bị reject trước durable submit; planned không là actual |
| Trial projection | source execution status + orthogonal flags/references và population definition | Complete count không giảm khi đánh dấu selected; dedup ingestion không mất raw history |
| Exposure facts | source dataset/range + evaluation/actor/source-fact refs + role/as-of | Append facts, không re-seal bằng xóa row; authorization trên joins |
| Audit/verification receipt | target expected digest, checked source revision, verifier version, result/as-of | Không overwrite expected digest hoặc cấp execution authority |
| What-if grid | definition, cell→effective-config/evaluation-ref, objective/scope, state | 81cells không đòi81unique rows/jobs; verified evaluations được reuse theo exact input contract |
| Replay index | original stream/fold/sequence, stable tie-breaker, playback ordinal, snapshot/checkpoint refs | Ordinal không thay original event ID; gaps có reason |

Những index nhỏ dùng SQL; grid/path/trace lớn dùng Parquet manifests hiện có. Không tạo bản raw result trong memory session chỉ để giữ `pick` hoặc slider. Browser state/cursor không phải domain writer và không được lưu vào frozen RC digest. Phần diagnostics/repro/audit pin references dùng cùng retention/GC protocol; raw evidence không copy theo số màn.

## 8. Parquet, NVMe và transaction công bố artifact

### 8.1. Layout đề xuất

```text
research-store/
  inputs/<dataset-snapshot-digest>/...        # reuse immutable partitions
  runs/<workspace-id>/<run-id>/
    revision-000001/
      manifest.json
      trials/part-000001.parquet
      evaluations/part-000001.parquet
      selection/part-000001.parquet
      equity/part-000001.parquet
      returns/part-000001.parquet
      orders/part-000001.parquet
      fills/part-000001.parquet
      positions/part-000001.parquet
      replay-events/part-000001.parquet
  projections/<input-digest>/<transform-version>/<options-digest>/...
  scratch/<job-id>/<worker-attempt-id>/<random-staging-id>/...
```

Layout là gợi ý triển khai local; domain lưu storage locator opaque. Không tạo một file cho từng trial, từng frame hoặc mỗi event. Partition vật lý theo loại bảng và kích thước hợp lý; fold/study/symbol là cột hoặc index, chỉ partition thêm khi workload chứng minh hữu ích.

Schema Parquet phải có units, timestamp convention, route union version và column definition version trong manifest. Sequence trong replay có scope; không assume seq từ hai folds là một global seq. Null có reason; không đổi undefined metric thành 0. Schema evolution add-only khi có thể; readers phải reject missing required field, giữ unknown optional fields trong raw extension nếu cần.

### 8.2. Writer bounded và tránh small-file explosion

**ĐỀ XUẤT KHỞI ĐIỂM:** batch 4–16 MiB hoặc 16k–64k rows, ngưỡng byte thắng ngưỡng row; aggregate writer memory ≤64 MiB, tối đa 2 writers lớn đồng thời ở cấu hình 5 GB. Chỉ số này cần hiệu chỉnh P05, không phải bảo đảm mọi schema đạt cùng row count. Row group chưa flush vẫn dùng RAM; ArrowWriter hỗ trợ quan sát memory/flush nhưng row group quá nhỏ làm tăng overhead. [E06]

Không `DataFrame.to_parquet()` trả một `bytes` khổng lồ rồi copy sang file. Không `read_bytes()` toàn artifact chỉ để hash. Hash incrementally, encode/write batch, đóng footer, flush có backpressure. Nếu engine giữ nguyên reference sau export, exporter không được tuyên bố RAM đã được giải phóng; kiểm tra riêng ở P04/P05.

Compaction chỉ áp dụng scratch/rebuildable projection hoặc tạo revision mới trước freeze với lineage rõ. Không rewrite bytes của evidence đã bị RC/approval pin. Lịch compaction có quota thấp, pause khi query/compute pressure cao, không làm phát sinh peak disk gấp đôi ngoài reservation.

### 8.3. Protocol seal/commit — không giả định SQL transaction bao phủ filesystem

1. Worker claim epoch; tạo staging tên ngẫu nhiên theo worker attempt, không dùng chung `<digest>.tmp` giữa writers.
2. Ghi bounded parts; validate schema, row counts, finite values, time/sequence bounds. Đóng file/footer; fsync file và directory theo durability policy local.
3. Tính digest incremental, verify target nếu dedup hit; rename atomically trên cùng filesystem hoặc thực hiện equivalent protocol của storage backend.
4. Ghi metadata parts/manifest trong transaction Research với expected epoch/state. Chỉ tham chiếu file sealed tồn tại đã verify. Cập nhật watermark/revision cùng outbox.
5. Khi final required tables/projections hoàn tất, commit artifact revision và state READY. Legacy producer lúc đó mới được expose terminal COMPLETED.
6. Cleanup staging sau acknowledgement. Lease mất → không được commit; file unreferenced được quarantine/GC sau grace, không xóa file của worker còn hoạt động.

Nếu crash sau file seal trước SQL commit: orphan reconcile theo manifest/lease, không báo run hoàn chỉnh giả. Nếu SQL có reference mà file mất/corrupt: integrity state khác READY; block thao tác dựa trên evidence đó, phục hồi từ bản có digest đúng hoặc báo không khôi phục được. Không “recalculate hash” của nội dung sai rồi cấp PASS.

### 8.4. Manifest tối thiểu

```json
{
  "schema_version": "research.artifact-manifest.v1",
  "workspace_id": "<verified-workspace>",
  "run_id": "<run-id>",
  "revision": 1,
  "engine": {"release": "1.1.1", "build_ref": "<pinned-build>"},
  "inputs_digest": "<sha256>",
  "effective_spec_digest": "<sha256>",
  "tables": [{
    "kind": "evaluations", "schema_version": "research.evaluations.v1",
    "parts": [{"artifact_id": "<opaque-id>", "sha256": "<sha256>",
               "bytes": 123, "rows": 2, "sequence_min": "1", "sequence_max": "2"}]
  }],
  "retention": {"research": "full_trial_ledger", "financial": "<effective-profile>"},
  "completion": {"required_evidence_sealed": true}
}
```

Đây là schema example, không sample output giả để dùng production. Dùng canonicalization version riêng cho Research manifest; không giả định giống canonicalization legacy execution. Approval receipt, delivery timestamps hay current approval status không nằm trong immutable digest này để tránh hash cycle.

### 8.5. Retention và quota

Ba vùng có chính sách khác nhau: immutable inputs dùng lại; evidence cần lưu; scratch/cache có thể thu hồi. Cấu hình retention theo workspace và loại artifact, được owner phê duyệt; không lấy ví dụ 30/90 ngày làm policy mặc định cho dữ liệu đã publish.

RC/published evidence/reference đang được downstream dùng được pin retention. Delete request không được xóa blob có reference còn hiệu lực. GC phải kiểm tra DB references, active leases, tombstone và backup state; giải phóng cache/projection tái tạo được trước evidence. Không xóa abandoned/failed research history để làm report đẹp.

Quota xét actual bytes và reservation: input additions, output, intermediate spill, export và compaction overlap. Dùng refcounts có scope và kiểm soát quyền; shared blobs không để lộ user khác có cùng code/dataset qua “digest exists”. Disk-full là typed failure, không fallback giữ tất cả vào RAM.

Local MinIO trên cùng ổ chỉ là một storage interface, không tự thành backup ngoài node. Dùng existing storage backend phù hợp; tránh lưu cùng một file thành 3–4 bản lớn chỉ để qua các lớp abstraction.

## 9. Query/projection Rust và phục vụ UI

Rust là lớp đọc columnar và biến đổi dữ liệu lớn; có thể thực hiện rolling metrics, aligned returns, histogram, trial analytics, chart sampling, replay indexes. Mỗi projection có input digest + transform version + options + visibility scope. Tránh cache theo từng user/tab một bản full run.

PostgreSQL trả run list, statuses, trial filter/sort, small summaries. Rust đọc Parquet theo columns/predicate/row-group bounds hoặc seek index. Frontend không nhận raw dataset toàn bộ để filter. Với sort/aggregate lớn, chỉ thêm DataFusion **nhúng** nếu query plan cần và memory/spill được kiểm chứng; không tạo một analytics server mới. Memory pool và spill của query engine không làm QuantBT trở thành out-of-core. [E08]

### 9.1. Quy tắc đọc

- Summary và badges từ bounded persisted projections; không mở toàn bộ ledger mỗi lần.
- Trial ledger keyset paging; scatter ≤600 theo spec, luôn giữ selected/raw-best cần hiển thị và trả sampling metadata. Limit hiển thị không cắt lịch sử lưu trữ.
- Replay đọc time/seq window; chart downsampling chỉ cho display, không dùng series sampled để tính financial metrics.
- Export stream batches tới file tạm hoặc response có backpressure; không tạo một DataFrame/CSV/ZIP đầy đủ trong RAM.
- Cache ứng dụng ban đầu 32–64 MiB trong budget query; byte-based eviction, request coalescing/single-flight, TTL/revision invalidation, auth scope. Không cache optimizer mutable context global.
- Cancel query/export khi client bỏ nếu công việc không cần hoàn tất; tài nguyên được thu hồi. Một slow client không giữ vô hạn buffers/connections.

### 9.2. Dictionary các phép biến đổi cần cho hi-fi

| Projection | Input | Quy tắc nghiệm thu |
|---|---|---|
| Equity/underwater display | Full-resolution engine equity và definition của scope | Không tự stitch reset-flat folds thành account compounded; downsample không đổi metric |
| Rolling Sharpe 63 | Returns scope đúng, convention/annualization xác định | Missing/zero variance có reason; boundary warmup không lọt vào sample |
| Rolling beta 63 | Strategy/benchmark returns đã align cùng timestamp/snapshot | Join policy/overlap/min samples ghi rõ; không forward-fill tùy ý |
| Monthly returns | Account return series và calendar hợp lệ | Compound returns đúng definition; partial month có label |
| Histograms/payoff/holding | Actual trade/evaluation records phù hợp route | Partial fill/multi-leg không đếm thành trade hoàn tất nếu engine không định nghĩa vậy |
| Trial parameter frequency | Complete trial/candidate records có scope | Sample population và inclusion rule rõ; selected frequency không trộn worker retries |
| Spearman importance | Evaluated params/objective đủ samples | Ghi “Spearman proxy”; không gọi fANOVA/causal importance |
| Plateau/seed/baseline data | Actual engine selector/search diagnostics | Không tự đổi selected hoặc fallback bằng logic UI |
| MAE/MFE | Actual path và exposure interval đủ precision | Nếu chỉ OHLC bound, ghi limitation; không giả exact intrabar ordering |
| Pair correlation | Full returns aligned, comparable windows | `PORTAL_DERIVED` khi backend tính; không zero-fill missing; n/common window trả kèm |
| Fold PASS/WARN/DRAG | Versioned Research display rule theo spec | Không gọi là engine certificate/approval decision; source thresholds explicit |
| What-if grid | Existing evaluated artifact hoặc explicit QuantBT job | Slider lookup, không implicit resimulation/interpolation; outcome không thay frozen run |

Formula registry ghi field ID, units, sample scope, source engine field hoặc công thức, denominator/annualization, zero/NaN/missing policy, timezone/calendar và transform version. Nếu spec không xác định một display threshold, ghi decision owner-review ở P02/P13; không trình bày số ngẫu nhiên như quy tắc engine.

### 9.3. Metric definition registry — edge cases là contract, không là UI patch

Mỗi metric/diagnostic cần `definition_id/version`, raw source, value type/unit, population, data role/time window, return convention/annualization, trade boundary, inclusion/exclusion, missing/non-finite behavior, transform lineage và numerical test vector. Reuse engine-authoritative values/semantics; dữ liệu Portal-derived có nhãn riêng. Frontend chỉ format, không tạo một cách tính mới để khác backend.

Các cases bắt buộc: zero observations; một sample; zero variance; no-loss/no-win profit factor/payoff; partial fills/open positions; fees/funding included/excluded; partial calendar month; benchmark missing; no overlapping timestamps; zero-width parameter range; null objective; stale/partial projection. Không đẩy NaN/Infinity như JSON number, không tự clip hoặc biến thành0. Nếu source mang trạng thái infinite/undefined, trả typed value/reason hoặc representation được canonical contract cho phép; không sửa selected artifact downstream để tiện render.

**Categorical importance:** Spearman proxy chỉ cho dữ liệu có thứ tự phù hợp; không gán ordinal tùy ý cho tên category rồi gọi correlation đó là importance. Categorical dùng frequency/conditional distributions hoặc một diagnostic có định nghĩa phù hợp và input đủ; field “Spearman” phải báo N/A đúng semantic nếu không áp dụng. Bool/ordinal xử lý theo declared type và explicit convention. Missing do chưa implement khác N/A toán học.

**Cross-screen:** Hub, Library, Search, Report, Compare dùng cùng definition ID và artifact revision cho cùng metric/scope. Nếu cần common-window recomputation ở Compare, label là một derived scope mới; original run metric giữ nguyên. Downsample chỉ vẽ chart; không tính returns/Sharpe/β/correlation từ series đã rút gọn.

### 9.4. Bound warning, geometry và diagnostic không phải gate

Search spec dùng relative-position thresholds ≤6%/≥94% và near18%/82%; Freeze HTML dùng distance ≤one-step và near12%/88%. Đây là hai definitions khác nhau, **không sao chép cùng label sang hai màn mà không DR-02**. [R01][R04]

P02/P13 đưa ra `warning-definition.json` với reference-space (declared hay run-narrowed), numeric formula, inclusivity, treatment của categorical/pinned/zero-width, thresholds và copy version. Đề xuất dùng một relative definition chung để giữ nghĩa nhất quán; chỉ giữ one-step diagnostic riêng nếu tên/tooltip nói rõ. Ngưỡng cuối/copy correction phải được chốt trong DR-02, không là QuantBT policy hay execution policy.

Ở sát biên chỉ chứng minh vị trí của θ trong khoảng đã khai báo. Không đủ để khẳng định optimizer “stopped by declaration, not an optimum”; không tự yêu cầu widen trước deploy. Copy an toàn diễn đạt “Selected value is near a configured boundary; review sensitivity and declared bounds.” Widen action (nếu có trong spec) theo §6.6, không auto-submit hoặc sửa version. Screenshot exceptions chỉ ở các copy bị correction, không mở quyền redesign tùy tiện.

Quy tắc này cũng áp dụng PASS/WARN/DRAG, robustness summaries và trajectory prose: nguồn/facts/threshold phải rõ. Research display warning không được biến thành gate R1/R2 hoặc verdict khoa học chắc chắn.

## 10. Ngân sách 5–8 GB và scheduler

### 10.1. Ngân sách khởi điểm — GB/MB thập phân

| Nhóm | Base 5 GB | Extended 8 GB |
|---|---:|---:|
| TS/control, lightweight compatibility adapter, supervisor, queue/storage overhead được phân bổ | 550 MB | 650 MB |
| PostgreSQL metadata và connections phục vụ Research | 650 MB | 850 MB |
| Rust query, projection/response buffers, application cache | 450 MB | 650 MB |
| Tổng private working set của mọi compute job đang chạy | 2.400 MB | 4.400 MB |
| File cache, kernel/runtime overhead và headroom chưa phân bổ | 950 MB | 1.450 MB |
| **Tổng** | **5.000 MB** | **8.000 MB** |

Đây là target phân bổ để đo, không tuyên bố existing services đã vừa. Nếu MinIO/NATS/Python nền thực tế làm nhóm control vượt budget, giảm compute concurrency/budget hoặc tối giản topology được phép; không trừ chúng khỏi phép đo. Tránh tính trùng shared pages khi cộng process RSS; dùng measurement aggregate có scope rõ.

Cgroup v2 có accounting cho cả anonymous memory và file cache. Dùng `memory.current/peak/events/stat`, CPU/I/O pressure và per-job measurement; không chỉ nhìn Python heap. `memory.high` là ngưỡng điều tiết, `memory.max` là hàng rào cuối có thể OOM, không phải scheduler. [E05]

### 10.2. Admission control

Base: 1 heavy job; 20 users vẫn browse/submit vào durable queue. Extended: tối đa 2 heavy jobs chỉ khi peak đo được cộng lại + các service vẫn dưới cap. Small jobs có thể ghép nếu cost model cho phép. Mỗi workspace/user có fairness; ban đầu một active heavy intent per user, cho mượn slot rảnh theo chính sách có log, không tạo starvation.

Estimate theo bars, symbols, columns, warmup, folds, trials, route, financial/research retention, strategy class và baseline measurements. Reserve cả RAM, CPU, scratch/output và query headroom trước claim. Không nạp dataset khi job còn queue. Estimate thiếu tin cậy thì resource class bảo thủ hoặc preflight từ chối có reason; không giả cost=0.

Resource change không được đổi ý nghĩa nghiên cứu. Tăng job concurrency độc lập khác với đổi optimizer schedule, seed order hoặc parallel TPE sampling. `n_jobs=1` giữ theo release baseline; các native/runtime parallel paths chỉ khi public capability và tests cho phép, ghi rõ runtime config. [E03][E04]

### 10.3. Worker lifecycle

Supervisor nhỏ sống lâu; mỗi user-code job chạy child process/sandbox thật với CPU/memory/pids/file/network limits. Tên `execute_run_in_process` không đủ — source hiện dùng thread ở một đường durable [P04]. Worker không có broker secrets hoặc execution DB credentials.

Đóng native contexts trong `finally`, giải phóng FD, mmap, writer và child processes. Khi job kết thúc, worker process chết để thu hồi private state. Pool reuse chỉ được thêm sau khi measured leak/isolation tests pass và có recycle theo RSS/job count; không mặc định dùng pool cho arbitrary uploaded code.

Các prepared contexts run-local. Input bất biến có thể dùng mmap/read-only sharing nếu API tương thích; thao tác convert to pandas/NumPy/native vẫn có thể copy. Không dựa vào fork với parent đa luồng để chia sẻ data một cách không an toàn; reactive WFO có điều kiện riêng về fork/runtime, phải dùng đúng contract. [E04]

### 10.4. Engine memory gap xử lý thế nào

P04/P05 đo từng route/profile với strategy thật. `ResearchAuditWriterV1` của release 1.1.1 có export hook nhưng vẫn append retained chunks; hook không cam kết crash durability. Vì vậy ghi thêm Parquet không tự giảm peak inside engine. [E02]

Ưu tiên: loại copies ở adapter, chọn đúng retention theo UI, export bằng public surfaces, giải phóng producer-owned buffers. Nếu workload bắt buộc vẫn không vừa, ghi engine capability gap cụ thể và đề xuất additive public bounded-output API/test trong QuantBT theo quyền riêng. **Không sửa private `_tables`, không vendor engine vào Portal, không âm thầm đổi thuật toán, không báo feature hoàn thành khi chỉ chạy được ngoài RAM cap.**

P04 gate có thể BLOCKED cho route/profile chưa đáp ứng; agent tiếp tục các phần độc lập nhưng không cấp full V1 acceptance. Engine patch là dependency cần approval riêng nếu ngoài task quyền; guide không cấp quyền sửa một repo khác. Không đẩy vấn đề thành giả định “sau này mua RAM”.

### 10.5. DB, I/O và export

Pool connection tổng có giới hạn; khởi điểm 12–16 Research connections gồm query/control/jobs nếu budget cho phép. `work_mem` là per operation/session chứ không cap toàn PostgreSQL; dùng transaction-local settings, statement timeout và bounded concurrent heavy queries. Không retune global shared DB execution. [E07]

Scratch phải nằm trên filesystem NVMe được xác nhận, không tmpfs. Giới hạn I/O concurrency/export; reserve disk cho seal/compaction. Trước pressure cao, pause low-priority projection/export, không để report đọc chậm làm mất progress compute hoặc khiến execution starvation. Không chạy `drop_caches` trên host production dùng chung để benchmark cold cache.

### 10.6. Diagnostic/audit resource classes và chi phí tương tác

Áp cùng trần5–8GB cho final audit, what-if, verify, projection và export; không chạy chúng trong API process để né scheduler. Click/hover/seek/page mount chỉ tạo bounded reads, ngoại trừ commands explicit đã khai báo trong action manifest. Verify đọc streaming và có concurrency limit; không load tất cả artifacts vào RAM rồi sha256 một giant buffer.

`required_evidence_profile` quyết định thành phần nào cần trước READY/RC, thành phần nào optional lazy diagnostic. Primary compute hoàn tất không chờ vô hạn một diagnostic tùy chọn; UI thể hiện state riêng. Bắt buộc có trial ledger/replay của selected execution thì phải reserve/test đúng profile, không gọi đó optional để vừa RAM.

Grid9×9 dùng canonical effective config để gom points trùng; reserve theo **actual unique work** và dataset/runtime cost, cộng overhead conservative có đo. Không dedup hai stochastic evaluations chỉ vì numeric params giống nhau khi seed/state khác. Click lặp/refresh/two users cùng request chỉ reuse theo authorized exact inputs; giữ receipts và job lineage, không ghi token/auth vào cache key công khai.

<a id="part-iii"></a>
# III. CONTRACT QUANTBT, EXECUTION VÀ 15 MÀN

## 11. Adapter QuantBT và nâng release

### 11.1. Một lớp tích hợp, không một backend mới cho mỗi release

Adapter gọi public API của installed QuantBT. Không dựa vào notebook sample, nhánh main mới nhất hoặc presence của native wheel để kết luận capability. Baseline release 1.1.1 có source provenance tại commit đã ghi; P04 ghi package hashes, Python/native versions và environment image thực tế. [E01]

Adapter tạo `EngineReleaseDescriptor` và `RunCapabilities`: endpoint/route được hỗ trợ, schema input/output, supported mode×schedule, execution contract, resolved backend/reason, retention surfaces, instrumentation, validation limits và never-claims. Mọi capability có trạng thái `SUPPORTED`, `REFUSED_WITH_REASON`, `DEFERRED_BY_SPEC` hoặc `UNVERIFIED`; không map unverified thành supported.

Installed release, artifact schema, transform version và presentation version là các trục riêng. Run cũ giữ engine identity; UI mới đọc schema cũ qua reader compatibility. Không cần giữ process/engine cũ resident để xem report. Reproduction dùng archived package/image và input snapshots khi có quyền.

### 11.2. Route coverage bắt buộc

Bảng dưới là inventory sản phẩm từ `[D04]`; **khả năng gọi thực tế và backend phải được P04 xác nhận từ release**. Tên route trong Portal không nhất thiết là tên hàm Python 1:1. Agent phải lập mapping route→public entrypoint/config→output schema; không gọi hàm tự đoán tên.

| Route sản phẩm | Hướng adapter/validation | UI/evidence bắt buộc khi supported |
|---|---|---|
| `signal_notional` | Signal/target theo contract resolved | Equity/returns, timing/size semantics, orders/fills N/A nếu không có ledger |
| `pct_equity` | Vectorized legacy/compat theo release | Accounting engine, historical comparability; không thay route âm thầm |
| `intrabar_bracket` | Bracket evaluator, backend explicit/resolved | SL/TP, ambiguity, same-bar policy, original outputs |
| `dca_ladder` | Ladder/basket evaluator | Rungs, campaign/basket chain, fill assumptions |
| `reactive` | Event strategy runtime với capability riêng | Wake trace nếu recorded, budgets, runtime tier, reset-flat WFO semantics |
| `event_driven` | Public facade + lifecycle contract | research/optimize/audit profile và event source |
| `native_event_lifecycle` | Native lifecycle version đúng | OCO/parent groups, timing close/next-open theo contract |
| `orders` | Order tape validated | Tape span; không bịa signal-quality/optimization claim |
| `fill_replay` | Accounting từ fill tape | Accounting-only banner, input fill provenance |
| `basket` | Package multi-leg | Per-leg units, hedge ratio/refit semantics nếu có |
| `arbitrage` | Support matrix release | Supported specs callable; schema-only/refused giữ reason, không fake execute |
| `portfolio` | Native matrix/portfolio endpoint | Mode/sizing declared, per-asset exposure/margin/portfolio outputs |
| `nautilus_dca_grid` | Optional external validation adapter theo release | Experimental/validation label; không cấp L4 chỉ vì dependency có mặt |
| `options` | **DEFERRED bởi scope hiện tại** | Card/Atlas reason đúng; không build options parameter UI hoặc giả complete |

Bốn nhóm form sâu ưu tiên của spec là intrabar, portfolio, reactive và DCA; các route supported còn lại vẫn phải có schema/tape input và evidence phù hợp, không bị bỏ vì không có form ưu tiên. Route thực sự refused trong release phải hiện lý do; không chặn toàn màn bằng một disclaimer chung.

### 11.3. Optimization và WFO

Giữ đủ surface spec: trial budget, early-stopping floor, seed/unseeded intent, sampler, formal constraints, objective definitions/directions, warm starts, effective-parameter dedupe, selector, seed consensus, per-mode config, route-specific prepared evaluator và output trace. `n_jobs=1` khóa theo baseline hiện có. Random/grid/cmaes với formal constraints cần đúng post-filter mode; missing objective metric là lỗi, không 0. [D04][E03]

Grid với float space không bounded không được chạy giả một grid khác. Boolean không được nhận là integer. Sweep count chỉ tính SWEPT, không tính pinned; import tối đa 12 parameters và wizard tối đa 8 swept theo spec. Defaults đi từ release/effective config; không cố định các ví dụ λ, γ, block length hay số shards nếu owner override hợp lệ.

Search scores của stage A, selection objective stage B, per-fold selections và final audit có scope riêng. Robust plateau generic selector không được đánh đồng với WFO mode 3 chỉ vì cùng dùng chữ plateau. Warm-start baseline floor/search_regression phải được giữ nếu engine trả; không dùng best final Sharpe để tự đổi selection sau audit.

### 11.4. Retention được suy từ UI contract trước khi chạy

Chọn `research_retention` và `financial_retention` độc lập theo public release capability. Trial ledger đầy đủ cần cho màn 06/10 không có nghĩa full financial audit cho từng trial. Selected/final execution cần audit đủ màn 08/09/11. [E09]

Preflight có `required_evidence_profile` và estimated bytes. Không cho run một profile chỉ giữ score rồi tuyên bố có original replay. Nếu cần replay một candidate không giữ audit, explicit diagnostic job với lineage/label “new replay”, không giả là retained original.

Resume optimization chỉ khi public storage/checkpoint semantics cho phép và đã kiểm chứng. Có study database không tự chứng minh optimizer state được resume tương đương; không chọn best result giữa các failed worker attempts.

### 11.5. Upgrade gate

Release mới: tải package/image được pin và xác minh; chạy capability probe/schema tests; chạy golden corpus; phân loại output differences thành bug fix được chấp nhận, additive fields, semantics change hoặc regression; đo RAM/disk/query projection; kiểm tra legacy summary/publish fixture; sau đó owner đổi default cho run mới. Run đang chạy không đổi image.

Giữ stable engine endpoints là giả định chính, nên adapter là version-aware mapping gọn, không một framework đa engine. Additive fields phải được khai thác dần khi UI cần; unknown enum không được làm reader crash hoặc mở button unsafe. Sai khác đúng do engine fix không bị ép khớp bug cũ; report cần provenance và release note.

### 11.6. Danh mục tối ưu cần đánh giá trong adapter — không đổi semantics

| Cơ hội | Cách khai thác trong Research | Điều kiện chấp nhận |
|---|---|---|
| Public `QuantBTEndpoint` factory + run API | Adapter tạo endpoint theo validated route rồi gọi `backtest`/`simulate`; không chọn internal engine class | Effective config và output surface được pin/test theo release |
| Prepared signal/intrabar/portfolio evaluator | Chuẩn bị input dùng lại trong một run, tránh copy/feature preparation lặp trên từng trial | Mutable strategy state vẫn fresh; memory measured, không global unbounded cache |
| Prepared market/instrument | Reuse immutable canonical clock/registry cho supported multi-symbol workloads | Policy exact/intersection/union/primary-clock và observation semantics phải đúng khả năng kernel [E11][E12] |
| Opt-in prepared native WFO paths | Khai thác public path khi strategy/runtime nằm trong certified capability, thay vì Python↔Rust mỗi bar | Không đổi schedule, sampling contract, capital stitching hoặc selector để lấy speed |
| Reactive prepared execution | Dùng prepared setup, fresh candidate/fold accounts, explicit supported runtime và close/reset/cancel | Không thay callback strategy bằng approximate target tape; giữ reset-flat contract [E04] |
| Score→selected audit | Search giữ đúng research ledger, financial retention phù hợp; chạy final selected audit khi workflow yêu cầu | Rerun có ID/provenance và determinism check; không giả audit gốc cho candidate chưa retained |
| Public runtime budgets | Truyền enforceable engine budgets khi endpoint hỗ trợ, cộng với outer process limits | Budget error giữ code/reason; không trả partial score như một completed trial |
| Reduced context materialization | Dùng declared context requirements đúng strategy và public API | Không bỏ field strategy thực sự sử dụng; parity test quyết định/tín hiệu |

Bảng này là backlog tối ưu bắt buộc **đánh giá** P04/P05/P06, không bắt bật mọi native path. Một path chưa đạt correctness/speed/memory gate không được auto-promote. Build/JIT/dependency installation chạy trong CI/build environment được owner cho phép, có quota riêng và được báo cáo; không compile nặng bất ngờ trên shared execution host để né giới hạn runtime. [E10]

### 11.7. Capability phải có bốn trục, không một boolean `supported`

| Trục | Ý nghĩa | Người tạo bằng chứng |
|---|---|---|
| `engine_capability` | Release/public API thực sự hỗ trợ route × runtime × mode × schedule | Release descriptor + feature probes/golden tests |
| `integration_capability` | Portal có input validation/form/serializer/adapter và read schema tương thích | Adapter/UI conformance tests |
| `evidence_capability` | Profile của run này có output đủ cho màn/claim/action đang yêu cầu | Required-evidence matrix + actual manifest |
| `admission_capability` | Identity, data access, RAM/disk/CPU hiện tại cho phép chạy | Preflight/scheduler/auth hiện hành |

Card mới từ release manifest có thể xuất hiện để thông tin, nhưng không tự runnable khi form/adapter chưa biết schema. Unknown route/enum phải có safe display state; không hide mọi capability mới và không fallback sang một route “gần giống”. Engine supports + Portal chưa tích hợp phải ghi integration gap, không ghi “engine refuses”. QUEUED do thiếu tài nguyên không được hiển thị engine-unsupported.

Run lịch sử pin descriptor/actual backend đã chạy; Atlas current và Atlas của run cũ không trộn release. L0–L4 ceiling khác achieved run evidence; engine runtime R1/R2 khác approval R1/R2. Thay release default không bật feature chưa đi qua contract/evidence/memory gates.

## 12. Tích hợp execution bất biến — contract cụ thể

### 12.1. Authority và đường giao tiếp

Research sở hữu RC pack, declaration inputs, data/engine provenance và publication delivery state. Existing governance sở hữu R1/R2 decision, evidence pin, permissions, SLA/expiry và command outcomes. Execution runtime sở hữu deployment/orders/positions/risk/accounting.

Chỉ sử dụng những query/command hiện có được P02 xác nhận. Không thêm required execution topic consumer, không ghi vào execution database, không cập nhật runtime từ Research. Existing `/api/v1/execution/...` được giữ nguyên và serve cả UI execution hiện hành.

### 12.2. Legacy producer compatibility là hạng mục bắt buộc

Existing facade chỉ upsert run read model khi POST `/api/runs` nhận **202** và `run_id`. Nó lấy `strategy_id`, `dataset_id`, `protocol` từ request để seed. RunSync sau đó chỉ refresh run đã có trong read model và đúng workspace. Vì vậy NEW UI không được đi một POST201 khác rồi mong R1 tự nhìn thấy run. [P07][P08]

Thiết kế V1: giữ submit qua existing authenticated facade. Nâng producer Research chấp nhận **new discriminated Research request** nhưng vẫn giữ các top-level legacy fields mà facade đọc; old request format vẫn xử lý đúng. Thêm fields chỉ ở producer schema Research, không sửa facade schema/behavior. New field names chốt trong P02, được version hóa; không nhét tất cả vào unvalidated `kwargs`.

Ví dụ envelope định hướng, không thay public contract trước P02:

```json
{
  "strategy_id": "<stable-compatible-strategy-alias>",
  "dataset_id": "<authorized-snapshot-reference>",
  "protocol": "<existing-valid-protocol>",
  "research_contract_version": "research.run-request.v1",
  "research": {
    "client_intent_id": "<scope-unique-id>",
    "alpha_version_id": "<bound-version-or-null-for-scratch>",
    "preflight_token": "<server-issued-token>",
    "requested_spec": {"<validated-route-fields>": "<values>"}
  }
}
```

Producer must return `{run_id, status: "QUEUED"}` with 202 only after durable intent/dispatch record exists. New modern reads không cần kéo raw qua old Python pandas routes; nhưng `/api/runs/{id}` và `/summary` phải còn producer-compatible cho RunSync.

### 12.3. Alpha identity mapping

Current governance maps read model `strategy_id` thành alpha subject và so với `ApprovalCreateRequest.alpha_id`. [P09] Vì vậy phải định nghĩa ba cột riêng khi cần: canonical `research_alpha_id`, registry `strategy_adapter_id`, và `execution_subject_id` đã chứng minh khớp legacy read model.

Ưu tiên stable research registry alias theo alpha, dispatch nội bộ tới bound AlphaVersion; không biến `strategy_id` thành run ID hoặc version ID chỉ để né check. Built-in alias cũ giữ nguyên. Sau create-run, P02/P10 read back identity qua existing authorized path và assert mapping. Sai mapping là typed incompatibility, không sửa execution record bằng SQL.

Spec gọi subject là AlphaVersion không đủ để suy ra downstream lưu `alpha_version_id`; current schema có thể đặt subject_id theo alpha input. Research manifest vẫn giữ exact AlphaVersion và code digest, nhưng phải hiển thị đúng phạm vi downstream thực sự pin.

### 12.4. Bốn lớp digest và frozen summary

Current `/api/runs/{id}/summary` trả `selected_params` là toàn bộ `selection/selected_params.json`, **không chỉ numeric θ**. RunSync lấy `causality_claim`, `validation_claim` trong object, lấy artifact schema version và hash toàn object bằng canonicalization hiện hành. [P03][P08]

Phải phân biệt:

| Digest | Ý nghĩa | Authority |
|---|---|---|
| `parameter_digest` | Bộ θ/parameter artifact đúng schema Research | Research/engine selection artifact |
| `legacy_selected_artifact_sha256` | Toàn frozen object mà RunSync đang pin | Algorithm/reference execution hiện hành |
| `research_rc_manifest_digest` | Toàn RC pack Research, tất cả references theo schema V1 | Research |
| `execution_evidence_set_hash` | Bộ evidence mà governance thực sự tạo | Execution/governance response |

Không giả định bốn digest bằng nhau. Legacy canonicalization sử dụng recursive key ordering của code TS hiện hành; không thay bằng “RFC8785 tương đương” hoặc Python `sort_keys` khi chưa golden-test numeric/Unicode/null/arrays. Dùng exact reference algorithm làm oracle. Không thêm new keys vào selected object sau terminal để rồi làm hash đổi dưới approval.

Full RC evidence pack được Research lưu/pin; current governance create có thể chỉ pin một ALPHA_ARTIFACT từ evidence run. UI không được ghi “execution verified toàn bộ 12 items” nếu actual response không nói vậy. Original claim IDs phải là issued artifacts mà legacy summary thực sự công bố, không lấy A/B/C/D badge tùy ý gán vào methodology_claim_id.

### 12.5. R1 create payload hiện có — giữ nguyên

```json
{
  "schema_version": "governance.approval-create-request.v1",
  "workspace_id": "<resolved-workspace>",
  "request_key": "<existing-pattern-compliant-key>",
  "gate": "R1",
  "alpha_id": "<verified-execution-subject-id>",
  "evidence_run_id": "<compatible-final-audit-run-id>",
  "methodology_claim_id": "<claim-issued-in-frozen-summary>",
  "summary": "<8-to-2000-character-summary>"
}
```

Schema `.strict()`; không gửi full RC object, `rc_id`, arbitrary tags hoặc các input deployment UNSET vào payload này. `workspace_id` optional theo source nhưng vẫn phải khớp session; không tin workspace do browser tự chọn. `request_key` theo regex/length existing. Path hiện hành: `POST /api/v1/execution/governance/approvals`; reads tương ứng do existing controller cung cấp. [P10]

### 12.6. Publication flow — saga phía Research, không distributed rewrite

1. Read immutable final run revision; validate 12-item pack và eligibility theo spec. Verify active/bound AlphaVersion ở thời điểm phù hợp với existing contract. CAS draft revision.
2. Seal Research RC manifest và store `publication_intent` cùng payload hash/mapping trong transaction. Payload không chứa credentials.
3. Gọi existing create bằng authorized identity đúng actor qua auth path hiện có. Không impersonate reviewer hay đổi người tạo bằng service account để bypass separation of duties.
4. ACK response hợp lệ: store approval ID/raw state/source hashes/as-of; mirror chỉ state actual. UI báo published khi điều kiện public workflow thực sự hoàn tất.
5. Timeout/unknown: giữ trạng thái delivery chưa xác nhận; retry idempotently bằng existing request key. Không tạo approval thứ hai hoặc tự set APPROVED/PENDING giả. Query/reconcile chỉ qua authorized existing endpoints.
6. Auth hết hạn mà existing API không hỗ trợ delegated background token: giữ intent `AWAITING_REAUTH` và yêu cầu thao tác retry trong session hợp lệ; không lưu token dài hạn vào outbox. Đây là transport recovery, không phải gate mới.

Facade run-create cũng có idempotency riêng. P02 phải test pending/unknown-outcome behavior của code hiện hành. Nếu transport key cũ replay một pending response không đủ dữ liệu, recovery chỉ được dùng đường đã kiểm chứng: new transport attempt có cùng producer `client_intent_id`/payload hash, producer trả đúng run cũ và202 để seed read model. Không tự đổi facade, không tạo compute duplicate, không giả định recovery này pass trước test.

Một existing open-approval uniqueness conflict phải được xử lý theo response/source; không lấy approval của RC khác chỉ vì chung alpha. Đối chiếu run, actor/workspace, payload và pin trước khi attach mapping. Chưa thể reconcile thì thể hiện incompatibility, không workaround execution.

### 12.7. Approval mirror và frontend

| Source status | Display khả dụng | Không được suy ra |
|---|---|---|
| `PENDING` | Pending + source timestamps | Request gửi đi nhưng chưa ACK không tự là PENDING |
| `APPROVED` | Approved | Không tự start Paper |
| `APPROVED_WITH_CONDITION` | Approved with conditions; raw enum giữ singular | Không tự kết luận conditions đã thỏa |
| `DENIED` | Rejected/Denied theo copy mapping | Không sửa raw source thành enum mới |
| `CHANGES_REQUESTED` | Changes requested | Không sửa RC đã frozen tại chỗ |
| `EXPIRED` | Expired theo source | Không tự tính expiry từ ví dụ hi-fi |

`SUPERSEDED` của RC là Research relation/lifecycle, không phải source approval status. Current SLA/expiry luôn đọc response; không hardcode 5 ngày/90 ngày của mock. `as_of`, stale/error state và original IDs phải truy được. R2/detail/drawer sử dụng existing routes và permissions; Research không tạo mutation handler approve/reject mới.

### 12.8. Execution → Research feedback, chỉ trong contract hiện có

Khi existing execution queries có deployment/RC/run references, read-only correlate để hỗ trợ các liên kết UI đã có. Không bắt execution thêm publication journal hay schema trong V1 này. Forward evidence có observation window và source revision riêng, không sửa backtest report đã frozen. Nếu nguồn chưa trả field để correlate, trả explicit contract gap tại tính năng liên quan; không suy ra bằng tên strategy giống nhau.

### 12.9. Promotion pick, gate-reset copy và integrity không mở rộng quyền

Màn10 `promotion_pick` và chữ “single promotable” cần actual authoritative source/mapping ở DR-03. Nếu nguồn hiện hành chỉ trả approval/run reference, adapter chỉ được map theo một quy tắc đã kiểm chứng, không tạo unique winner bằng Sharpe, newest-run hoặc row ACTIVE. Missing source giữ reason/context phù hợp; không dựng fake banner, không bỏ mandatory source gap khỏi nghiệm thu. [R08]

`GATES RESET` khi đổi code là disclosure rằng evidence/approval cũ không mặc nhiên áp dụng cho artifact mới; **không là command reset approval cũ**. Giữ lịch sử, trỏ đúng version/run và existing R1/R2 surfaces. New AlphaVersion/RC không tự revoke hoặc đổi runtime đang hoạt động.

Integrity failure được ghi tại expected artifact/revision, không “repair” bằng update expected digest. Nó có thể chặn sử dụng evidence đó cho publication mới theo Research completeness rules, nhưng không tự gửi revoke/stop/flatten/modify sang execution. Query source approval vẫn mirror nguyên trạng với integrity warning riêng; không sửa APPROVED thành DENIED vì Research vừa phát hiện lỗi.

Receipt của RC phân biệt **sealed locally**, **delivery unconfirmed**, **acknowledged by existing API** và **actual approval state**. Không gọi local seal là successful handoff. Mandatory final-audit references phải đã đi qua compatibility path nếu downstream yêu cầu run read model; verified association không suy bằng tên strategy giống nhau.

## 13. Contract API/frontend chung

### 13.1. Endpoint ownership

`/api/runs` và legacy producer detail/summary là compatibility path. NEW read/diagnostic APIs dùng `/api/v1/quantbt/...` ở Research BFF, hoặc path spec đã có được map qua một route registry. Registry/Alpha Import dùng research-owned routes nếu `/api/v1/alphas` đang thuộc domain khác; không shadow existing execution controller. P02 xuất `endpoint-map.csv` cho tất cả endpoints, ghi public URL, owner, backing store và compat alias.

Không để `/api/runs/{id}/events` legacy progress SSE trùng nghĩa với replay historical events. Dùng `/api/v1/quantbt/runs/{id}/events` cho progress và `/api/v1/quantbt/runs/{id}/execute/events` cho historical replay.

### 13.2. Read envelope và errors

```ts
type EvidenceOrigin = "ENGINE_DIRECT" | "PORTAL_DERIVED" |
  "DIAGNOSTIC_RUN" | "INSTRUMENTED_EVENT";

type EvidenceEnvelope<T> = {
  schema_version: string;
  run_id: string;
  artifact_revision: number;
  engine_release_id: string;
  transform_version?: string;
  as_of: string;
  is_partial: boolean;
  data: T;
  next_cursor?: string | null;
  warnings: Array<{code: string; message: string; source_ref?: string}>;
};
```

`null` không bằng0; `MISSING` khác `NOT_APPLICABLE`; `WITHHELD` khác `FORBIDDEN`. API errors typed: unauthorized/notfound policy theo existing security; `STALE_PREFLIGHT`, `REVISION_CONFLICT`, `UNSUPPORTED_CAPABILITY`, `RESOURCE_CLASS_EXCEEDED`, `DISK_RESERVATION_FAILED`, `ARTIFACT_NOT_SEALED`, `INTEGRITY_FAILURE`, `SOURCE_STALE`, `PUBLICATION_INCOMPATIBLE`, `CANCEL_RACE`. UI renders clear actionable reason, không nuốt lỗi và giữ số cũ như số mới.

ETag cho evidence gồm run/revision/transform/options/visibility; mutable status và approval mirror có ETag/as-of riêng. Pagination cursor opaque và signed/validated, chứa sort/filter fingerprint/revision; stale cursor trả reset reason, không đọc sai trang từ dataset khác.

### 13.3. Progress stream và log

Structured events có run_id, global stream sequence, schema_version, event kind, timestamp, worker attempt ref và bounded payload. Snapshot trả last_seq; subscribe from cursor; duplicate dedup; gap thì snapshot/reconcile. Browser fallback poll5s khi stream lỗi theo spec; stream resume không đọc file log từ đầu. Events từ attempt cũ vẫn có audit nhưng không update state nếu epoch invalid.

Console giữ bounded UI ring 500 dòng, batch render100ms theo spec; backend giữ log theo retention và đọc tail bằng index/seek, không `read_text().splitlines()` toàn file. Log không là source of truth cho trial completed hoặc selection. ETA khi thiếu model là null/estimating, không fake percent/time.

### 13.4. UI foundation

Giữ React/TanStack Query/ECharts/lightweight-charts installed versions [P12]. Không chuyển hi-fi sang một static HTML site độc lập. Import design tokens scope Research: Newsreader/Inter/JetBrains, sidebar248/topbar56, content widths, card grammar và per-element CSS ledger gốc. Screen00/09 shell-free đúng spec. Không thay global CSS làm execution lệch layout.

Typed clients/runtime validators, central `SCREEN_ROUTES`, keyboard focus/aria, reduced motion, responsive1280/660 và bounded list/chart rendering. Không dùng source sample IDs/numbers trong production. Development fixtures phải được scope test/dev, production build không fallback mock.

Cursor hash/URL roundtrip giữ grammar/link gốc; internal cursor phân biệt `study`, `trial`, `pick`, `params`, `trade`, `seq`, `event_seq` và playback position theo §13.6. Không bỏ `pick`/`trade` để ép vào grammar rút gọn. Resolve aliases bằng versioned codec, validate IDs/scopes; study context bắt buộc khi trial number không duy nhất. Deep link không phụ thuộc tab trước đã load data. Back/forward chỉ khôi phục inspection state, không đổi selected artifact.

Copy/screenshot diff theo spec với exception COR ledger. Không pretend pixel validation đã chạy chỉ vì HTML được parse; final screenshots phải render fonts/assets/charts thật trong browser test, không placeholder Vue/CDN bindings.

### 13.5. Action manifest — mỗi control có semantics và quyền riêng

P01 inventory mọi control/handler; P02 chốt manifest machine-readable. Mỗi row có `action_id`, screen/source locator, category, input refs, principal/permission source, authoritative preconditions, allowed writes, forbidden side effects, endpoint owner, request/reply, idempotency/CAS, compute-cost class, audit event, navigation và tests. Không dùng UI disabled làm kiểm tra quyền duy nhất.

| Category | Ví dụ | Side effects được phép |
|---|---|---|
| `INSPECT_NAVIGATE` | Tab/fold/trial pick, drawer, back, link | Cursor/local display; optional bounded telemetry không đổi domain |
| `READ_OR_VERIFY` | Filter/page/seek, verify expected digest | Read; verification receipt riêng nếu có; không sửa evidence/selection |
| `DIAGNOSTIC_COMPUTE` | Explicit what-if batch | New job/output refs có provenance/admission; không auto-reselect |
| `NEW_RESEARCH_INTENT` | Clone/change spec/space/seed | Draft/attempt/run mới theo §5, không sửa run frozen |
| `DOMAIN_COMMAND` | Import/register/activate/publish | Chỉ mutation được spec + authority cho phép, có CAS/idempotency |
| `PROTOTYPE_ONLY` | Demo mode/scenario, complete-now, timer-success | Chỉ fixture/dev showcase; không public API/mutation production |

Verification animation có thể trình bày kết quả server nhưng không quyết định kết quả; unit test fake timers chỉ test UI scheduling. What-if/render/open-card không được ngầm submit job. Mode switcher trong immutable run không đổi mode; bản demo tách khỏi production và không dùng ID/sample metrics thật giả lẫn nhau. [R01][R04]

### 13.6. Cursor, event ordering và causal-reveal contract

Internal cursor V1 mở rộng có scope: `run_id`, `artifact_revision`, `stage`, `fold_ref`, `study_ref`, `inspection_trial_ref`, `selection_artifact_ref`, `trade_ref`, `stream_ref`, `event_seq`, `playback_ordinal`, `route`, `schedule`. Đây là logical model, không yêu cầu tất cả keys xuất hiện trên mọi URL.

**Wire compatibility:** giữ hash keys đã công bố từng màn. `pick` là inspection trial; `trial` có thể là trial context/deep link và phải resolve theo page schema; `params` là parameter/selection artifact, không tự đồng nhất `pick`. `seq` và `event_seq` map cùng original event key chỉ khi scope/schema xác nhận. `trade` không bị loại khỏi URL. Alias xung đột trả typed cursor error/reset reason, không âm thầm chọn một ID. Study/fold thiếu mà trial number ambiguous thì báo ambiguity hoặc resolve bằng index chứng minh duy nhất, không dùng study đầu tiên.

Canonical serializer có thứ tự key deterministic theo page codec, bảo toàn pass-through keys đã có trong contract và chỉ loại unknown unsafe fields. Các fields mới thêm có version/migration; `mode`/`schedule` từ link không được mutate frozen run. Không giả mọi historical sequence bắt đầu0/1 hoặc liền nhau. Int64 vượt JS-safe-range dùng string trên wire.

**Replay:** original event identity = run/revision/fold/stream/sequence và tie-breaker engine thật khi cần. Playback ordinal là index dẫn xuất để next/previous/speed hoạt động, không event ID mới. Order cùng timestamp dựa actual source order/sequence, không sort alphabetical theo event kind. Cross-stream không có total order chứng minh được thì giữ ambiguity/stream scope, không tự dựng causal chain. `seq+1` không có trong artifact không tự là event bị mất; phân biệt non-contiguous ID hợp lệ với gap source thực sự khai báo.

Seek dùng checkpoint/evidence index có revision; tất cả panel nghe cùng cursor. Chọn trade seek về entry/event phù hợp nhưng không lấy exit outcome làm current position; đổi fold pause/reset transport và accounting segment theo contract. Back/forward/direct link restore cursor không chạy engine/diagnostic.

**Causal reveal là presentation-only:** trong các panel được đánh dấu playhead-state, chỉ hiện evidence tới cursor; future exits/final-PnL/final MAE-MFE ẩn hoặc gắn nhãn retrospective riêng. Run-level final summary có thể hiện ngoài vùng state-at-playhead, nhưng không được lẫn. Bật reveal không cấp CAUSAL_PREFIX/certificate, không đổi selection hoặc evidence digests. Tests phải kiểm tra nội dung panel, không chỉ chart bị cắt. [R07]

### 13.7. Ba ma trận bắt buộc trước và trong implementation

| Artifact agent phải tạo | Columns tối thiểu | Gate |
|---|---|---|
| `screen-field-matrix.csv` | screen, source file/line/selector, field_id, semantic role, engine raw/table, transform/version, units/scope, storage/ref, endpoint, lifecycle/availability, permission, tests, status | P01 inventory đủ; P02 mapping quyết định; từng screen phase đóng exact fields |
| `screen-action-matrix.csv` | action_id, source handler, category §13.5, precondition, allowed-write/no-write, endpoint/actor, idempotency/CAS, error/recovery, cost, expected navigation, tests | No action tự suy quyền; prototype markers không lọt production |
| `cross-screen-scenarios.json` | scenario_id, immutable input refs, route/mode/profile, preconditions, steps, expected IDs/digests/metrics/state, forbidden effects, tests/evidence | §16.6 chạy từng phần sớm, cuối P24 chạy lại đầy đủ |

Field có raw đủ mà chưa transform = `IMPLEMENTATION_GAP`, không đổi thành engine missing. `SOURCE_CAPABILITY_GAP`, `NOT_APPLICABLE`, `WITHHELD`, `FORBIDDEN`, `PROTOTYPE_ONLY` là các trạng thái khác và phải có source/correction ID. Requirement thật không bị xóa khỏi denominator khi bị blocked/deferred. Copy/screenshot tests dùng COR IDs, không sửa cả golden screenshot để che sai interaction.

Coverage báo riêng **source inspected**, **contract mapped**, **API integrated**, **browser interaction verified**, **resource/correctness passed**. Reading15 HTML không đồng nghĩa15screens accepted. Khi CDN/fonts chưa tải trong test harness, ghi lỗi visual baseline; không dùng placeholder render làm bằng chứng pixel-perfect.

## 14. Contract triển khai từng màn — đầy đủ 00–14

Các endpoint NEW dưới đây là logical API đích; P02 đóng URL chính thức trong endpoint map để không va chạm controller existing. Mọi màn phải tuân thủ toàn bộ test/copy/CSS ledger ở source `[Sxx]`; phần này bổ sung backend/domain/storage chứ không thay thế spec gốc. Các field bắt buộc chưa có raw mapping phải được ghi là dependency có owner/test, không được cắt khỏi scope.

### 14.00. Journey Map — màn 00

**Source:** `[S00]`; phase P09. Đây là bản đồ hành trình sản phẩm 8 bước, **không phải 8 phase implementation**. Layout shell-free, các liên kết research/execution dùng route registry. Những bước future/SOON giữ đúng trạng thái, không build thêm Data Catalog hoặc execution gate mới.

**Backend/data:** nội dung instructional và routing có thể là static versioned registry, không cần gọi engine. Optional badge counts chỉ bật khi nguồn thật có sẵn; không thêm polling/network dependency cho bản đồ tĩnh. Nếu dùng GET `/api/v1/quantbt/journey`, payload nhỏ, versioned và cacheable; không chứa demo run IDs dẫn tới production.

**Frontend:** reproduce swimlanes/cards/copy, focus/keyboard và responsive. Link tới màn chưa có evidence mở đúng empty state hoặc library, không giả tồn tại run. Handoff lane chỉ link existing execution surfaces đúng quyền.

**Nghiệm thu:** tất cả links hợp lệ; shell không lồng hai lần; counts absent không thành0; screen still useful khi compute down; mọi test T của `[S00]`, screenshot1280/660 và axe. Không cần job, Parquet scan hay resident Python để mở màn này.

**Bổ sung sau review — FND-01/20:** Tất cả card/link có row trong action manifest. Future/SOON không tạo endpoint hoặc compute dependency mới; không invent demo run ID để link có vẻ hoạt động. Browser test mở link từ fresh session, xác nhận target/scope/quyền và không có domain write. Test harness prototype không nằm trong production router.

### 14.01. Run Library — màn 01

**Source:** `[S01]`; phase P12. URL `/research/quantbt/runs`; filter/sort/compare selection giữ trong URL. Group theo Alpha/Version đúng identity; scratch tách rõ; status QUEUED không giả RUNNING.

**Read contract:** GET `/api/v1/quantbt/runs` trả rows nhỏ với run/attempt/version IDs, status/substate, strategy/data key, mode/schedule, claim/cert, actual metrics scope, selected ref, created/completed, RC/mirror pointers. Keyset cursor; counts và aggregates do SQL query có index. Sparkline lấy persisted projection ≤24 points theo spec, không load full equity; tránh N+1 query cho mỗi row.

**Frontend:** stable row position trong refresh; poll running rows10s theo visibility, không reload mọi row hoàn tất. Filters restore khi back; row click khác action dropdown; compare bar chỉ cho đúng số run/key và same-alpha theo spec13. Hash full giữ ở action copy, display có thể rút gọn.

**Correctness:** “tốt nhất” không thay promotion/claim; completed không xuất hiện trước seal. Metric absent hiện reason, không0. Worker retries không tạo duplicate rows của research attempts. Deleted/forbidden references không leak metadata.

**Tests:** 20 users mở library trong lúc heavy run; query plans/index; cold/warm load; cursor ties và update; SSE/poll không đảo sort; full original `[S01]` test set.

**Bổ sung sau review — FND-06/07/20:** Row identity là logical run theo registry, không worker attempt; audit/reproduction children phải có type/link rõ nếu xuất hiện. `attempt_count` và `run_count` không được cộng lẫn. Clone/rerun action map explicit intent (§5.7), giữ engine/effective-spec diff. Metrics chọn để sort có definition/data-role, không xếp full-sample vào OOS label. Khi polling, inspection selection/compare IDs vẫn ổn định, không đổi theo thứ tự row mới.

### 14.02. New Run — màn 02

**Source:** `[S02]`; phase P10, phụ thuộc P07/P08/P09. Wizard 8 bước: Context, bound Strategy, Route, Data, Walk-forward, Parameters, Optimization, Review. Không tự thêm deployment account/venue/capital forms của execution.

**Data:** AlphaVersion registry, engine release manifest, data snapshot/preflight, declared parameter schema. Bind code digest tại submit; scratch/active/draft limitations hiển thị đúng. Route support matrix, mode×schedule rules và rich route-specific inputs typed; options DEFERRED. Tapes validated theo schema, không ép một optimization config vô nghĩa cho tape replay.

**Commands:** preflight qua producer-compatible path; submit qua existing facade POST `/api/runs`202. Lưu requested/effective spec, preflight token và client intent ID. Sparse overrides phải không serialize untouched default. Existing top-level legacy fields giữ để read-model seed hoạt động.

**Parameters/optimizer:** ≤12 declared parameters; ≤8 swept, pin frees dimension; bounds/step/categories, dynamic-float grid refusal; all optimizer surface `[D04]` có form/control phù hợp, không chỉ n_trials. Seed null là intentional khi contract cho phép; strategy yêu cầu seed thì validate. `n_jobs=1` không editable. Missing objective raises error, không silent fallback.

**Data/time:** authoritative server fold plan; calendar month không quy đổi tùy tiện30d; warmup/gaps/timezone provenance. Resource estimate RAM/scratch và queue class ở review; vượt budget báo trước submit. Không giảm trial budget không thông báo.

**Tests:** invalidates preflight trên mọi material edit; data changed after preview không thay snapshot; double-click202 cùng intent một run; DRAFT/scratch publish gate đúng; direct legacy client vẫn dùng được; toàn bộ test `[S02]` tests và compatibility seed→RunSync smoke.

**Bổ sung sau review — FND-03/04/05/06/18/19:** Form chính và advanced optimizer dùng canonical binding §6.7; request alias conflict bị từ chối ở server. Review hiển thị budget scope/topology, strategy seed khác sampler seed khi engine định nghĩa khác, defaults đã resolve và ceilings thực sự từ đâu. Reproduce pin old effective values; upgrade diff rõ. Version/route switch reconcile inputs còn hợp lệ, invalidate preflight; không silent reset hay vượt declared bounds. New route card chỉ runnable khi integration/evidence/admission tương ứng hợp lệ; engine supported chưa đủ.

### 14.03. Run Progress — màn 03

**Source:** `[S03]`; phase P11. Thể hiện 5 stages, fold Gantt có windowing, console, artifacts, resource usage và real progress. Không tạo percent hoặc timestamp audit bằng timer demo.

**API:** GET progress snapshot gồm seq/watermark, stage counters, queue reason, worker attempt, elapsed/ETA optional, memory/scratch measured, partial artifact states; SSE structured events resume by sequence; console after_seq/limit. Cùng schema phục vụ fallback poll5s.

**Storage:** metadata/events small persisted SQL; logs indexed disk; artifacts pending/writing/sealed/aborted. Chỉ part sealed được link; partial output có watermark, full audit chưa hoàn tất phải báo chưa sẵn sàng.

**Frontend:** console ring500 rows, batch100ms; folded logs vẫn đọc được theo cursor chứ không xóa lịch sử server. Fold rail không load vô hạn DOM. Claim FORECAST khác ISSUED; FAILED không mang badge đã chứng nhận. Finishing/sealing vẫn chờ, không terminal sớm.

**Failure semantics:** cancel CAS, worker retry cùng intent chỉ hiển thị operational attempt; stale worker events không thay current state. Reconnect kiểm tra missing sequence, snapshot repair; stream lỗi không tự báo run failed. Terminal lỗi không auto tạo research attempt mới.

**Tests:** kill worker, delayed event, duplicate/gap, disconnect/reconnect, disk full trước seal, cancel ở race commit, queue hàng chục intents không nạp dataset; toàn bộ test `[S03]` tests, report RAM/FD sau nhiều job cycles.

**Bổ sung sau review — FND-01/05/07:** Đếm studies/trials/evaluations theo scope; một trial có selected flag không thành status riêng, một worker retry không thêm “research trial”. Planned upper bound khác actual/early-stopped count. Stage demo controls/complete-now/timer-success không tạo production commands. Optional diagnostic có state riêng không khiến primary completion phụ thuộc vô hạn; mandatory evidence vẫn phải qua seal/readiness gate. Poll/SSE race không đổi current worker epoch.

### 14.04. Evidence Flow Hub — màn 04

**Source:** `[S04]`; phase P13. Tabs Summary, Split, Search, Freeze, Execute, Claim, Atlas; drill-down sâu giữ evidence cursor. Không copy logic tính claim/selection vào từng tab.

**API/read model:** GET run hub nhỏ với identity và artifact revision; charts/tables tải lazy theo scope. Claim strip trả validation, chronology, OOS role, holdout state, causality, execution contract, resolved backend+reason và engine certification riêng. Dataset drawer đọc pinned quality summary/snapshot; Data Catalog chưa xây vẫn SOON theo spec.

**Metrics:** exact full-resolution input → server projections: equity/underwater, rolling Sharpe/beta theo definition, monthly returns, win/payoff/holding/turnover/exposure, consecutive losses và fold summary. Chỉ render values có source đủ; limitation riêng cho route. Scope disclosure bắt buộc, đặc biệt mode 5 hoặc selection-adjusted OOS.

**Claim tab:** full evidence chain và manifest status `PRESENT`, `SEALED`, `DEGRADED`, `MISSING`, `NOT_APPLICABLE`, `WITHHELD`, `ABORTED`. Status dựa raw/instrumentation, không frontend count badge. A–D và L0–L4 không gộp một score. Downstream approval mirror dùng source riêng/as-of, không nằm trong immutable metrics hash.

**Tests:** cùng revision ở hub và detail; mutated cached projection không đổi source evidence; missing benchmark không giả beta0; complete metrics reconcile engine; downsampling không dùng cho metric (không dùng series rút gọn); toàn bộ test `[S04]` tests và atomic projection switch.

**Bổ sung sau review — FND-02/11/13/15/16:** Một điểm/trial đang inspect không được ghi đè selection/passport của hub. Các tab lấy đúng revision; inspection-dependent query có own key. Phân biệt retrospective final metric và playhead-state panel; reveal chỉ đổi presentation. Holdout disclosure dựa evaluation/exposure facts có scope, không dùng snapshot scan thay “research-used” hoặc page-view thay “human saw”. Cùng metric definition với Report/Compare.

### 14.05. S1 Split — màn 05

**Source:** `[S05]`; phase P14. Hiển thị authoritative split/fold plan, train/inner/outer/holdout boundaries, purge/embargo và quality evidence.

**API:** GET `/api/v1/quantbt/runs/{id}/split` từ effective plan + dataset manifest + actual evaluation references. Time intervals exact; compressed timeline là phép biến đổi hiển thị, không thay boundary. Gaps bao gồm source count, range, patched-bar disclosure; không phải “checked” nếu chưa scan.

**Holdout:** trạng thái sealed/unread chỉ khi engine chưa consume cửa sổ đó. Existing three-window history có evaluation holdout phải hiển thị đúng đã dùng. Workflow mới không truyền holdout vào decision/evaluation trước quyền sử dụng đã được chứng minh. Màn 05 chỉ đọc seal metadata; **không tự tạo nút/endpoint unlock**. Nguồn seal, quyền, interface và sibling-attempt semantics phải đóng ở DR-01/§6.8 trước khi triển khai bất kỳ mutation nào; nếu contract có sẵn cho phép thì ghi audited intent và linked sibling evaluation, không sửa run gốc. Không tự nâng claim A chỉ vì unlock.

**Frontend:** inner/outer layers, dynamic units và “not applicable” của tape/calibration đúng semantics. Lens/zoom và min width visual không làm gap/warmup thành trading data. Source copy examples purge24h/embargo72h không hardcode nếu config khác.

**Tests:** future perturbation; boundary overlap; fit transform only train; warmup excluded from scores; half-open edges; timezone regression; holdout consumption race; historical run không retro-label; toàn bộ test `[S05]` tests.

**Bổ sung sau review — FND-10/11:** Seal card chỉ render metadata và link theo source. Trước khi nối một mutation/evaluation liên quan holdout, phải có DR-01 resolved bằng actual authority/endpoint/actor và sibling semantics; không thêm button chỉ vì có câu mô tả unlock. Source chưa có→typed gap đúng action, không fake PASS/one-time read. Clone/version đổi không xóa recorded exposure; historical records incomplete là UNKNOWN, không “unseen”.

### 14.06. S2 Search — màn 06

**Source:** `[S06]`; phase P15. Ba vùng Stage A, pool/freeze, Stage B. Mode trong completed run bất biến; demo switches chỉ navigate fixtures hoặc tạo new draft, không sửa evidence đang xem.

**API:** bounded `/search?fold=`, `/studies/{id}/trials`, `/trials/{id}`, selection/search-diagnostic reads. Trial key luôn gồm study/fold khi cần; “jump to trial” resolve index/rank trong server để mở đúng page. Ledger giữ mọi completed/failed/pruned/effective-duplicate record và actual reason nếu engine cung cấp, không chỉ600 scatter points.

**Stage A:** parameter space, scatter≤600 có sample policy và selected/best inclusion; progression, prune distribution, frequency, 12-bin distributions theo field, Spearman importance và interactions khi raw đủ. Record warm-start, seed and baseline state; inactive branches dùng effective params đúng.

**Stage B:** actual candidate funnel, ranking/pool membership, objective components J1–J5 theo effective release config, chosen/medoid/centroid, per-fold selection, fallback reasons, seed consensus, search_regression. Không tự tính lại selector để ra một selected khác. Derive visualization được phép, reconstruct historical decision không có source thì không.

**Semantics:** mode 2 bootstrap IS-only; mode 5 calibration/no independent OOS; mode 4 và schedule không tự suy claim strict; OOS roles selection-input/retrospective/report-only/withheld/n/a rõ. Objective formulas hiển thị đúng các weight thực tế, không constants từ fixture. SelectedNone không thay bằng best.

**Tests:** finite/categorical/boolean params; cả 5 modes supported × valid schedules; objective missing; Pareto/selector-none; pruned denominator; study trial-ID collision; server pagination full trace; repeated worker batch dedup; source `[S06]` tests.

**Bổ sung sau review — FND-02/05/09/12/13/16:** `pick` điều khiển inspector/surface/ledger, không θ*. Selected centroid không có trial ID vẫn có artifact/params passport; no fake trial. Status/prune/feasibility/selection flags và denominator tách riêng. Categorical không gán integer tùy ý để tạo Spearman. Bound warnings dùng DR-02 definition; click widen trong declaration khác ngoài declaration. Deep link phải resolve study/fold; mode/schedule của completed run bất biến.

### 14.07. S3 Freeze — màn 07

**Source:** `[S07]`; phase P16. Freeze timeline, params passport, integrity verification và what-if phải có nguồn khác nhau rõ ràng.

**API:** GET freeze projection; POST verify là đọc/verify original bytes có budget; explicit diagnostic request nếu cần what-if mới. Timelines lưu wallclock/sequence và data-window references tách riêng. Candidate-pool freeze, selection commit và first outer evaluation là ba event khác nhau.

**Correctness:** không suy pool frozen→selection chưa thấy OOS. Per-fold causal verdict dựa data access và decision order đúng từng fold; per_fold_decay công bố selection-input. Changed digest → integrity failure, không “repair” bằng cách thay expected digest theo bytes mới.

**What-if:** grid9×9 từ existing evaluated results hoặc QuantBT diagnostic batch riêng; cache artifact theo full inputs. Slider chỉ lookup/snap, không nội suy hoặc spawn81 workers; cost/admission giống job bình thường. Nếu người dùng dùng preview để thay lựa chọn, tạo sibling draft/attempt với lineage, không mutate frozen selection. Không tự tạo capital policy/gate execution.

**Frontend:** pending/verify failure/mismatch được phân biệt; timestamp thiếu hiển thị unknown với reason, không suy từ filemtime. Raw selected ref và parameter digest full copy. No instant simulated checkmark.

**Tests:** clock skew, missing event, OOS selection path, corrupt bytes, verify race/retry, lookup9×9/edge snap, repeated slider no jobs, diagnostic distinct provenance; toàn bộ test `[S07]` tests.

**Bổ sung sau review — FND-08/09/12/14/19:** `Verify` đọc bytes và so expected digest; animation chỉ phản ánh response, không timer→PASS. Parameter digest, bundle fixed-config và selection artifact scope tách rõ. Passport support centroid/composite per-fold, không dùng pick hoặc fold cuối thay final target. What-if81cells map tới effective θ distinct; missing cells, objective/version và sample scope rõ. Existing result chỉ reuse khi exact evaluation inputs/seed/runtime phù hợp. Không tự submit diagnostic khi mount/drag, không dùng cảnh báo biên như policy deployment.

### 14.08. S4 Execute / Trade Replay — màn 08

**Source:** `[S08]`; phase P17. Đây là replay kết quả **backtest**, không command execution live. Route-specific panels phản ánh real engine contract, không một ledger giả chung cho mọi route.

**API/storage:** `/execute/summary`, `/execute/candles`, `/execute/trades`, `/execute/events`, detail by original IDs; indexed windows/time ranges, part bounds, bounded checkpoint references. Financial outputs nằm trong Parquet; full event history truy được bằng pages. Trade page25, events fetchwindow100/renderwindow nhỏ theo spec, chart khoảng360px; mọi con số sample chỉ là fixture.

**Domain:** preserve partial fills, order parents/OCO, funding, fees, positions, multi-leg và engine-defined trade boundaries. Target transitions không tự là original fills. Fill replay accounting-only không chứng minh signal edge. Native/reactive WFO reset-flat folds hiển thị segment và capital convention, không stitch thành một tài khoản compounded giả. [E04][E09]

**Derived detail:** MAE/MFE/exposure chỉ nếu input đủ; ghi approximation/availability theo route. State at seek dùng original snapshots hoặc replay đầy đủ events theo verified projection contract; không chạy lại strategy/engine khi kéo chart. Missing event history không tự synthesize orders để UI đẹp.

**Frontend:** local playback scheduler bounded, chart/store ngoài render loop khi phù hợp; fetch-window/reconnect/cursor restore. Chart không request backend mỗi animation frame. Original seq có scope run/stream/fold, không conflation. Validation badges từ existing evidence, không certify vì cài adapter Nautilus.

**Tests:** all route unions; same-close/next-close/next-open exact labels; partial fills/funding/multi-leg fixtures; seek direct versus sequential equivalence; gap refusal; long replay bounded RAM DOM/browser; toàn bộ test `[S08]` tests.

**Bổ sung sau review — FND-15/16:** Transport đi theo event ordinal đã index, không cộng raw sequence như số liên tục. Preserve source IDs/order/tie-breaker; cùng timestamp không cho phép xếp event tùy ý. URL giữ fold/stream/seq/trade aliases; invalid/ambiguous cursor có reason. Causal-reveal che future outcomes trong playhead panels; summary hồi cứu nếu hiện phải tách nhãn. Missing event/order theo route không được bù bằng prototype-generation code.

### 14.09. Run Report — màn 09

**Source:** `[S09]`; phase P18. Shell-free report/print, max width theo CSS ledger; không dựng một report khác tính toán độc lập.

**Read model:** identity/passport, method claim + never-claims, selected lineage, engine/build/data digests, metrics scope, per-fold checks, full evidence references, known limitations. Tái dùng sealed hub/detail projection cùng revision; print series≤600 theo spec chỉ cho hình, metrics full precision.

**Export:** browser print CSS là đường cơ sở; nếu spec cần server bundle thì job stream vào scratch có quota, signed authorized download/ref và cleanup. Export CSV/Parquet/manifest đúng tên/schema source khi public engine có; không giữ ZIP bytes toàn bộ trong process. Không cần always-on PDF service cho V1.

**Historical integrity:** report source không đổi khi engine default nâng. Mutable approval mirror chỉ là annotation có as-of/source tách khỏi core evidence. Refresh/re-export lưu transform/presentation revision; không sửa archived report để giả quá khứ có chứng nhận mới.

**Tests:** counts/numbers/digests khớp hub và raw; print page breaks/table headers,1280/660; locale/UTC/rounding đúng; export interrupted/cancel/disk-full; CSV injection protection cho untrusted labels; toàn bộ test `[S09]` tests.

**Bổ sung sau review — FND-06/08/11/13:** Report công bố target selection và loại final-audit provenance (reused original hay linked execution). Không thay conclusion khi mới click trial/verify/refresh. No-loss/zero-variance/missing-benchmark dùng registry type/reason; denominator và annualization khớp hub. Exposure/approval annotations có source-as-of riêng, không rewrite frozen report hoặc cấp chứng nhận mới qua re-export. Print không bật/đổi holdout-use hay chạy diagnostic.

### 14.10. Attempt Lineage — màn 10

**Source:** `[S10]`; phase P19. Root AlphaVersion, attempt graph/table, diff, active/superseded/abandoned/draft states đúng type. Không tạo thêm màn worker attempts; operational retries ở drawer khi cần.

**Data:** parent edges explicit; normalized effective spec diff, reason, space signature N params/k swept/m pinned, run references, evidence exposure, selected RC pointers. Dùng SQL indexes/closure queries có giới hạn; không suy parent bằng created_at gần nhau.

**Domain:** changed code→version mới; parameter/data/seed experiment→attempt mới; crash retry→worker attempt. Abandoned/failed giữ lịch sử. Counts trong header là actual metadata, không “52 attempts” từ demo. Storied-attempt classification theo source spec được version hóa, không ranking tốt nhất thay active intent.

**Frontend:** diff readable, navigation giữ scope/version; actual winning/published marker từ link đã có, không tự chọn maximum Sharpe. Missing historical fields được ghi legacy-unavailable thay vì giả recreate. Research attempt count không được quảng bá là independent multiple-testing correction.

**Tests:** graph cycles/cross-workspace parent rejected; concurrent fork/activation; technical retry count unchanged; changed seed counted; visited partial result tracked; lineage after cleanup/restore; toàn bộ test `[S10]` tests.

**Bổ sung sau review — FND-07/08/17:** Total gồm persisted drafts theo spec, có breakdown submitted/failed/probe và technical retries riêng; autosave không tăng nodes. Audit/projection/export relation không biến thành một strategy experiment mới. `promotion_pick` chỉ từ DR-03 source verified; không tự rank bằng Sharpe/newest/ACTIVE. GATES RESET là disclosure version/evidence, không RPC reset gate/approval. Parent/version boundary được ghi explicit, không suy bằng ngày hoặc tên.

### 14.11. Release Candidate — màn 11

**Source:** `[S11]`, `[D03]`; P21 tạo pack, P22 publish/mirror. Đây là RC Research, không màn sửa execution gate.

**Immutable record:** `release_candidate_id`, `alpha_id`, `alpha_version_id`, `alpha_artifact_digest`, `entrypoint`, `selected_parameter_artifact_id`, `parameter_digest`, `final_audit_run_id`, `run_spec_digest`, `quantbt_engine_release_id`, `engine_image_digest`, `dataset_snapshot_ids`, `universe_snapshot_id`, `methodology_claim_id`, `known_limitations`, `proposed_use_restrictions`, `created_at`. Mỗi field có actual source; target venue/account/capital của execution để UNSET theo spec.

**12-item pack theo thứ tự:** AlphaVersion passport; engine/capability/backend; dataset/universe; methodology claim; selected params lineage; final audit/replay; metric semantics; execution assumptions; robustness/stability/regime evidence; known limitations/waivers input; reproducibility/parity/checksums; proposed restrictions input.

**Statuses:** COMPLETE/DEGRADED/INPUT/MISSING theo rules spec. Required cryptographic/identity evidence absent không được gán DEGRADED để pass. Ngược lại, item robustness có DEGRADED hợp lệ không bị tự thêm policy cấm tất cả. Draft declaration inputs mutable với CAS, publish freeze; input empty/whitespace không được coi filled.

**Publication:** full pack giữ Research storage; adapter xuất payload strict hiện có ở §12. ACK/mirror actual source; contract mismatch explicit. Keep separate θ/legacy pin/full RC/evidence-set digests. Superseded relation không sửa approval cũ. Không có local approve/reject/override button hoặc 90-day policy tự tính.

**Tests:** toàn bộ 17 fields và 12 items lineage; digest change/revision race; double publish; timeout/reauth; exact original actor; alias mismatch; data corruption; pin scope disclosure; read-only approval; toàn bộ test `[S11]` tests plus existing governance tests unchanged.

**Bổ sung sau review — FND-08/09/17/19:** RC tham chiếu đúng selection target và final audit reuse/child contract (§5.6); không chạy optimizer khi compose/publish. Active version hiện tại không thay bound AlphaVersion của evidence, và prior approval không được tái gán cho code mới. `locally_sealed` khác confirmed delivery; mirror raw decision riêng với Research integrity warning. Selection-none hợp lệ nhưng không đủ RC phải có reason, không fake selected trial. Missing source pin/authority giải quyết P02, không sửa downstream schema.

### 14.12. Engine Atlas — màn 12

**Source:** `[S12]`; P04 capability source, P09 UI. Three tabs: modes/objectives, routes/contracts, claims/never-claims.

**Backend:** release descriptor có supported/refused/deferred reason, public endpoint mapping, default config schemas, formulas/metric IDs, backend resolution conditions và certification ceilings. Các probe chạy khi register release hoặc validation job, không import engine/calculate mỗi lần user mở Atlas.

**Frontend:** default current release selector, historical run links pin đúng release; disabled matrix combinations vẫn hiển thị reason, options deferred. Formula display uses effective version, not handwritten stale string. Reactive runtime tier khác approval R1/R2; “can achieve” khác run “has evidence”.

**Tests:** all14route inventory; invalid mode×schedule disabled reason; unknown future field/enum safely presented; historicalrelease1.0.8readability; no compute dependency for static Atlas; full inline T tests `[S12]`.

**Bổ sung sau review — FND-18:** Hiển thị bốn trục capability §11.7 bằng existing layout/details/reasons; không thêm sản phẩm quản trị release ngoài scope. New engine route có thể show informational card nhưng action disabled khi form/adapter/evidence mapping chưa tích hợp. Refusal ghi đúng engine/integration/profile/resource/auth source. Historical run links giữ release của run; unknown enum an toàn, không auto-enable hoặc route fallback.

### 14.13. Compare — màn 13

**Source:** `[S13]`; P20. Scope **one alpha**, three unions: attempts, markets, pair. Không mở thành portfolio research hoặc multi-alpha leaderboard.

**Backend:** server ComparisonContractKey `(symbol,timeframe,route,protocol)` là gate cho pair. Key match còn cần source scope/time/convention disclosures; intentional params/version differences vẫn được compare, không ép mọi config giống nhau. Pair≤2; mismatch return refusal không kèm hidden metrics/charts. Markets differentkeys→smallmultiples, nooverlay.

**Analytics:** claim ladder rank map theo spec, rồi metric trong cùng rank; correlation tính từ aligned full-resolution returns khi raw đủ, ghi `PORTAL_DERIVED`, common window/n/missing policy. Nếu raw đủ thì phải implement, không mặc định absent vì engine không trả field. Không có input đủ thì absent reason đúng, không0. Trajectory text từ deterministic server template/facts, không generative lời khẳng định không kiểm chứng.

**Frontend:** URL mode/alpha/runs, two distinct token colors/legend, refusal copy, responsive. “Weaker claim” chỉ là comparison disclosure, không actual pair promotion contract. Source label/copy sửa theo COR-03/11, các copy còn lại giữ.

**Tests:** cross-alpha/crosskey reject; attempts rank notbest Sharpe; timezone/alignment/overlap zero cases; no charts/metrics afterrefusal DOM; correlation verification; toàn bộ test `[S13]` tests. Export ngoài scope màn này giữ ngoài.

**Bổ sung sau review — FND-02/13/17:** Inspection selection không trở thành promotion pick khi đổi sort/rank. Comparison metrics dùng same defined window khi tính delta; original run metric còn nguyên nếu window khác. Correlation có n/time/zero-variance handling, no forward-filled giả; mode5 scope full-sample không nhét vào OOS metric slot. Rank/“weaker claim” theo display spec, không tạo pair artifact approve hoặc command execution.

### 14.14. Alpha Import — màn 14

**Source:** `[S14]`; P07. Single `.py` drop/paste, không zip/project IDE hay runtime dependency installer. User code là untrusted input ngay cả dry import.

**Commands:** parse → validate gates → register DRAFT → activate khi có quyền. File_ref opaque gắn workspace/principal/digest/expiry. Server AST/parser và manifest validation là authority; digest recheck lúc register để chống TOCTOU. Stable registry dispatch đúng bound entrypoint; không sửa protected strategy kernel.

**7 gates theo source:** contract complete; entrypoint importable trong sandbox; digest uniqueness đúng scope; parameter-space sane≤12; determinism declared; data contract known; static no-lookahead scan. Stop first fail, các gate sau SKIPPED; durations/logs là thật. Gate7 PASS không là causal certification.

**Isolation:** no network by default, no execution secrets, read-only minimal environment, restricted scratch, memory/CPU/pids/timeout/file-size limits. No arbitrary pip install, no symlink/path traversal hoặc `file_ref` của user khác. Validation logs scrub secrets. Determinism declarations được test khi chạy golden/repro, không chỉ tin metadata.

**Register/activate:** DRAFT insert atomic, uniqueness scoped không leak cross-user; active version CAS; tạo version mới không đổi running jobs hoặc wizard đã bind. Version note đầy đủ; source bytes/digest immutable. Schema/trusted dependency environment đã được owner chọn.

**Tests:** malicious top-level import, infinite allocation/process spawn/network/path reads; altered file after validate; duplicate/concurrent activation; missing seed/data/timeframe; toàn bộ test `[S14]` tests. Fixture strategy mock chỉ test adapter; acceptance có strategy thật được phép.

**Bổ sung sau review — FND-03/19:** Mirror parsed fields là readonly. Source đổi/bytes changed→invalidate parse/gates/file ref binding và validate lại; không sửa parameter_space/entrypoint qua form dưới digest cũ. New Run narrow/pin chỉ trong declaration. Phân biệt code-fixed/default/run pin trong manifest, giữ exact source code digest. Gate duration/status từ server; stagger visual được phép sau khi có result thật, không tạo PASS giả.

<a id="part-iv"></a>
# IV. KẾ HOẠCH TRIỂN KHAI 24 PHASE

## 15. Nguyên tắc thực hiện và dependency

Mỗi phase là một deliverable có thể nghiệm thu, không chỉ một commit. Foundation phase có contract fixture/UI harness; screen phase phải nối real persisted data, không được pass bằng mock. Test tích hợp/performance được làm từ sớm; P23 là stress tổng hợp, không phải lần đầu đo RAM.

| Phase | Deliverable | Depends on | Màn chính |
|---|---|---|---|
| [P01](#phase-p01) | Baseline, protected surfaces, inventory | — | Tất cả: source audit |
| [P02](#phase-p02) | Contract decisions và compatibility spike | P01 | 02/11, ranh giới execution |
| [P03](#phase-p03) | Research schema, identities, tenant/security foundation | P02 | Foundation |
| [P04](#phase-p04) | QuantBT1.1.1 adapter/capability/golden/resource baseline | P02 | Foundation/12 |
| [P05](#phase-p05) | Disk-first artifact store và bounded persistence | P03,P04 | Foundation |
| [P06](#phase-p06) | Durable scheduler, isolated worker, recovery | P03,P04,P05 | Foundation/03 |
| [P07](#phase-p07) | Alpha registry/import/binding | P03,P04,P06 | 14 |
| [P08](#phase-p08) | Data snapshots/effective spec/preflight | P03,P04,P05 | 02/05 foundation |
| [P09](#phase-p09) | Research design system, routes/cursor, Journey/Atlas | P02,P04 | 00/12 |
| [P10](#phase-p10) | New Run xuyên UI→durable run→legacy read model | P06,P07,P08,P09 | 02 |
| [P11](#phase-p11) | Structured progress/console/artifact readiness | P06,P09,P10 | 03 |
| [P12](#phase-p12) | Run Library có pagination/filter/index | P05,P09,P10,P11 | 01 |
| [P13](#phase-p13) | Evidence hub và metrics projections | P05,P09,P10,P11 | 04 |
| [P14](#phase-p14) | Split, causality và holdout transparency | P08,P10,P13 | 05 |
| [P15](#phase-p15) | Search/trials/objectives/selection ledger | P04,P05,P13,P14 | 06 |
| [P16](#phase-p16) | Freeze/integrity/what-if | P13,P14,P15 | 07 |
| [P17](#phase-p17) | Route-aware Execute/Replay | P05,P11,P13,P16 | 08 |
| [P18](#phase-p18) | Report/print/export reproducible | P13,P14,P15,P16,P17 | 09 |
| [P19](#phase-p19) | Attempt lineage/diffs/exposure | P07,P10,P12,P15 | 10 |
| [P20](#phase-p20) | Compare trong một alpha | P13,P15,P18,P19 | 13 |
| [P21](#phase-p21) | RC draft và immutable12-item evidence pack | P07,P16,P17,P18,P19 | 11 composer |
| [P22](#phase-p22) | Publish và mirror compatible existing R1/R2 | P02,P10,P21 | 11 handoff |
| [P23](#phase-p23) | 5 GB load/security/recovery/engine-upgrade regression | P11–P22 | Tất cả |
| [P24](#phase-p24) | End-to-end acceptance, debt closure, handoff/rollback | P23 | Toàn bộ15 màn |

P03/P04/P09 có thể làm song song ở phần độc lập sau P02; screen work được song song khi contracts đã freeze, không cùng sửa một shared schema tùy ý. Mỗi phase ghi upstream commit/artifact versions. Một upstream contract đổi phải chạy consumer tests của các phase phụ thuộc.

### 15.1. Hồ sơ bắt buộc của mọi phase

Lưu dưới `docs/research-loop-v1/evidence/Pxx/` hoặc artifact directory tương đương được repo cho phép: `phase-report.md`, `changes.json`, `test-results.json`, `contract-results.json`, `resource-results.json` khi có runtime, screenshots của màn, `debt.json`, `rollback.md`, protected-surface diff và delta của field/action/scenario matrices (§13.7). Báo cáo ghi FND/COR/DR đã đóng, source locator, tests mới và decision status còn mở. Các file này là output agent phải tạo trong implementation, không phải evidence đã tồn tại trong guide này.

`phase-report.md` phải có mục tiêu, scope thật đã làm, commit/builds, dataset/strategy refs, commands thực chạy, pass/fail/skip có lý do, actual latency/RAM/disk, nguồn kết quả và blocker. `SKIPPED` không tính PASS. Không ghi “24 phases completed” khi phase đang BLOCKED bởi capability hoặc missing required evidence.

<a id="phase-p01"></a>
## P01 — Baseline, source inventory và ranh giới được bảo vệ
<!-- BEGIN RL-V1.1 PHASE-P01 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P01

**Mục tiêu kiểm chứng:** Inventory và bootstrap, chưa tuyên bố compute đã đạt. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Ghim `delta-rsi-polynomial-alpha`, spec/version, tám tham số, adapter/registry, SHA kernel và fixture gốc; xác định reader/snapshot thật được cấp quyền. Lưu `delta-source-manifest.json` và `acceptance-environment.json`. Chưa có runtime1.1.1 ở P01 là dependency đúng P04, không tạo số kết quả để lấp.

**Browser / UI UX:** Đọc config Playwright gốc, nhận diện stubbed visual suite và port/build flags. Ghi browser baseline/prototype inventory đủ 15 màn; source inspection không là browser PASS. Chuẩn bị request quyền build/DNS/port một lần; không chạy deployment helper đang trỏ stack của Bobby.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P01-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P01-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P01-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Có baseline hash, tên chiến lược, quyền reader và kế hoạch fixture rõ; browser status là DISCOVERY_ONLY nếu chưa chạy. Không yêu cầu một UI chưa thuộc P01 để đóng phase.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P01 -->


**Mục tiêu / đầu vào:** Chốt đúng code và spec mà agent thực hiện; loại mọi giả định từ tên repo, screenshot demo hoặc cấu hình runtime chưa kiểm tra. Đọc `[P01]`, toàn `[D01–D04]`, tất cả `[S00–S14]` và registry nguồn.

**Backend/hạ tầng — to do:**
1. Record ZIP/source/branch/lockfile hashes và diff với checkout làm việc; xác định existing Python producer, facade, governance, storage, queue và Rust services. Không đổi branch/migrate production.
2. Sinh protected file manifest; ghi allowlist research và shared bootstrap exceptions. Xác minh hash protected strategy và permissions/schema ownership.
3. Inventory host được phép: RAM quota, available NVMe bytes/mount type, CPU, cgroup/kernel, existing services và chia sẻ với execution. Nếu chưa được vào server, ghi rõ local test target/unknowns; không dùng unknown làm số đo thật.
4. Audit existing DB schemas, resource configs, endpoint registration, feature flags bằng read-only access. Secret values không xuất vào report. Phân biệt repo defaults với deployed flags.

**Frontend — to do:** Index15 HTML/spec, routes, assets/fonts/charts/copy, screen test IDs; xác nhận React/TanStack/ECharts installed. Screenshot baseline phải render assets thật khi làm visual harness; file HTML offline placeholder không là accepted baseline.

**Output:** `baseline.json`, `protected-surface.json`, `source-map.csv`, `screen-requirements.csv`, `runtime-inventory.md` và initial gap register.

**Bổ sung bắt buộc sau review HTML/spec — FND-01–20:**

1. Inventory tất cả15 HTML/spec ở cấp field/control/handler/type/copy; ghi exact source selector/line và classify prototype-only so với real action. Không dùng grep số màn làm coverage hành vi.
2. Tạo ba matrices §13.7 và `findings-decision-register.json`; source nào chưa đọc/không render được ghi đúng status, không PASS visual vì parsed thành công.
3. Đưa concrete conflicts từ[R01]–[R08] vào inventory: mirror editor, optimizer aliases, holdout source, bound thresholds, thetaTrial nullable, seq/trade/pick, promotion pick.
4. Giữ source fixtures/hash cũ bất biến; baseline screenshots phải có fonts/charts/interactive states thật. Không sửa execution shell/CSS trong bước lập baseline.
**Đầu ra bổ sung:** `screen-field-matrix.csv`, `screen-action-matrix.csv`, scenario skeleton, `findings-decision-register.json`, prototype-controls inventory và source-vs-browser coverage report.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P01-T01` | Hash và số lượng source: đủ 15 HTML/spec, đúng archive và commit. |
| `P01-T02` | Protected-diff detector phát hiện được thay đổi giả lập trên bản test copy. |
| `P01-T03` | Secret scan: output inventory không chứa credentials. |
| `P01-T04` | Route/controller inventory phát hiện collision và chỉ rõ owner. |
| `P01-T05` | RAM/mount/hardware measurements ghi nguồn thật; unknown không được trình bày như measurement. |
| `P01-T06` | Mỗi HTML/spec00–14 có field/action inventory với locator; missing source được phát hiện, không dùng một row “screen implemented” thay coverage. |
| `P01-T07` | Prototype verify timer và synthetic replay được đánh dấu PROTOTYPE_ONLY; không nằm trong production-command schema đề xuất. |
| `P01-T08` | Report tách source inspected / contract mapped / browser verified; screenshot thiếu assets không thành visual PASS. |

**Exit gate:** Nguồn/spec và quyền sửa rõ; unknown runtime được định danh với phase phải đóng trước acceptance; không có sự mơ hồ execution-owned. Mỗi màn có source/copy/test registry.

**Exit gate bổ sung:** Nguồn của từng finding được chỉ rõ; matrices có denominator và initial status. P02 nhận conflicts thực, không một checklist trống.

**Debt/rollback:** Không cho debt về source identity/ownership. Runtime access chưa có có thể là blocker cho deployment measurements, không blocker cho đọc/spec work; phải đóng P23. Phase read-only nên rollback chỉ xóa generated local inventory, không sửa server.

<a id="phase-p02"></a>
## P02 — Contract freeze, correction ledger và execution compatibility spike
<!-- BEGIN RL-V1.1 PHASE-P02 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P02

**Mục tiêu kiểm chứng:** Compatibility trước khi xây UI lớn. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Dùng identity/spec Delta RSI thật và canonical fixtures hiện có cho spike producer→facade→R1 trong môi trường test. Nếu chạy engine baseline được phép, ghi đúng release thực tế; không gọi kết quả1.0.8 là1.1.1. Tạo contract fixture từ output thật khi có và giữ provenance. P04/P10 phải chạy lại với1.1.1, không coi fixture spike là final acceptance.

**Browser / UI UX:** Kiểm tra qua browser harness những surfaces đã có: workspace, request202, navigation, conflict/unknown state; các response fixture phải gắn lane CONTRACT_FIXTURE. Không tạo approval/command trong production. Chốt real-data browser config và nguồn expected độc lập trước khi lập assertion.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P02-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P02-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P02-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Identity/hash/strict schema/quyền được chứng minh theo source, không sửa execution. Kết quả chưa từ real pipeline không được gắn REAL_E2E; các future tests có dependency rõ, không skip required P02 tests.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P02 -->


**Mục tiêu:** Chứng minh Research có đường hợp lệ đi vào existing R1 trước khi xây toàn bộ UI. Không đổi một dòng consumer/gate execution. **Phụ thuộc:** P01.

**Backend — to do:**
1. Đóng endpoint ownership map, new request discriminator, domain IDs, legacy strategy/alpha mapping, claims và digest semantics theo §12.
2. Tạo isolated fixtures/small producer harness dùng existing facade/RunSync/governance code unchanged: POST202 seed run → terminal frozen summary → refresh → create R1 strict payload → read approval.
3. Test `.strict()` extra-fields, request_key replay, mismatched workspace/alpha/claim, terminal gating, payload hash conflicts và pending/unknown response recovery. Chứng minh full RC local khác downstream pinned evidence.
4. Chốt auth/delegation/internal producer trust từ code/network hiện có. Không public-trust `x-portal-user-id`; không thêm required auth header mà consumer chưa gửi. Nếu private boundary hiện tại không bảo đảm, ghi integration blocker, không waive security.
5. Viết machine-readable schemas cho common envelopes/errors/cursors và execution adapter conformance fixtures. Record COR ledger và ai phê duyệt thay đổi copy.

**Frontend — to do:** Wire contract harness cho wizard submission và RC mirror:202/navigation, unknown delivery, raw status mapping, digest disclosure. Chưa dùng fixture để tuyên bố màn production hoàn tất.

**Output:** `contracts/`, `execution-compat-matrix.md`, `endpoint-map.csv`, `identity-map.md`, `corrections.md`, golden request/response/digest fixtures.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/04/07/08/10/12/16/17/19/20:**

1. Đóng action taxonomy, namespace inspection/selection, attempt creation/count semantics và child audit identity; draft changes không phải execution actions.
2. Map optimizer fields cùng/khác nghĩa từ current producer+QuantBT public contract, không priority ngầm giữa form chính và advanced. Versioned cursor codec chứa cả pick/trade/study/event_seq.
3. DR-01: tìm actual seal/unlock authority và DR-03: actual promotion_pick source bằng read-only inspection. Có interface→fixture; không có→owner-scoped gap đúng action, không tạo role/gate/endpoint thay thế.
4. DR-02 ghi rõ hai công thức cảnh báo và recommended copy/definition; đóng copy exception trước phase phụ thuộc. Không dùng “bound” làm publish policy.
5. Chốt final-audit reuse/child contract, bốn digest, publication receipt và interpretation của GATES RESET. Scope operator/update permission giữ nguyên existing execution.
**Đầu ra bổ sung:** optimizer binding schema, cursor codec spec, action-side-effect matrix, final-audit relationship spec; DR register ghi VERIFIED/OWNER_SCOPE_REQUIRED cùng evidence, không tự giả owner decision.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P02-T01` | POST 202 qua existing facade tạo đúng một run read-model entry. |
| `P02-T02` | Fixture trả 201 không được xem là đã đáp ứng legacy seed contract. |
| `P02-T03` | Frozen selected-artifact wrapper được hash đầy đủ, không chỉ numeric params. |
| `P02-T04` | Golden canonicalization kiểm tra Unicode keys, số, null và arrays với source TS oracle. |
| `P02-T05` | Alpha/strategy/claim/workspace mismatch bị từ chối rõ. |
| `P02-T06` | Duplicate submit, pending response và timeout được recovery mà không sinh compute duplicate. |
| `P02-T07` | Existing governance fixtures/tests chạy nguyên trạng, protected code không đổi. |
| `P02-T08` | Auth và cross-tenant reads/commands bị từ chối khi không được cấp quyền. |
| `P02-T09` | Conflict optimizer aliases cùng nghĩa bị reject trong harness; khác seed scope có field names/validation riêng. |
| `P02-T10` | Click/inspect action contract không có allowed write tới selection/RC/approval. |
| `P02-T11` | Không có verified holdout authority thì mutation contract không được tạo; readonly seal display vẫn có test. |
| `P02-T12` | Promotion pick source/gates-reset semantics không tạo rank/reset/revoke implementation phía Research. |
| `P02-T13` | Existing source URLs chứa pick/trade/event_seq roundtrip; ambiguous study/alias conflict trả reason. |

**Exit gate:** Ít nhất một compatible run fixture tới R1 qua actual existing code trong isolated test; tất cả incompatibility được resolve phía Research hoặc explicit BLOCKED. Không chấp nhận một proposed API khác với source rồi trì hoãn đến P22.

**Exit gate bổ sung:** P02 freeze những semantics có đủ source; mọi owner-only gap ghi action/phase bị chặn. Consumer compatibility phải PASS; chưa có quyền unlock không ngăn đọc seal nhưng không được tuyên bố unlock đã implement.

**Debt/rollback:** Không defer identity/hash/auth/202 gaps. Deep report payloads có thể refine qua additive Research schema nhưng phải giữ consumer contract. Rollback harness/module Research mới; protected execution bytes phải unchanged.

**Lưu ý debt/phạm vi sau review:** Không defer canonical-value, selection namespace, source authority hoặc hash tới lúc tích hợp UI. Không “solve” DR bằng edit execution.

<a id="phase-p03"></a>
## P03 — Schema Research, identity và authorization foundation
<!-- BEGIN RL-V1.1 PHASE-P03 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P03

**Mục tiêu kiểm chứng:** Lưu và truy vết Delta identity. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Tạo Alpha/Version/attempt/run/study/trial records cho Delta trong DB test qua repository/service được phép; test FK/workspace isolation, retry không tăng research count và protected digest. Dữ liệu seed mô tả là metadata fixture cho đến khi P04 phát output thật; schema phải nhận được evidence refs thật sau đó.

**Browser / UI UX:** Browser auth/contract harness tách hai test workspaces; kiểm tra deep link sai workspace không lộ code, params, metric hay artifact locator. Không dùng localStorage làm authority identity.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P03-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P03-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P03-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Các uniqueness/auth checks PASS; scope tests nền không giả full run. Từ P04 trở đi giữ một end-to-end Delta record để reuse ở các màn; không dùng fixture metadata thay bằng chứng compute.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P03 -->


**Mục tiêu:** Metadata tồn tại bền vững, tenant-safe, có transactions/revisions; không phụ thuộc memory store. **Phụ thuộc:** P02.

**Backend — to do:**
1. Viết migration research-owned schema/repositories theo §7, reuse logical existing research tables nếu hợp lệ; giữ execution schema untouched. Tách actor/owner/workspace, AlphaVersion/Attempt/Run/WorkerAttempt identities.
2. Composite keys/FKs/unique idempotency, optimistic revision, index library/trials/queue; bounded config JSON validation. Version schemas và migration forward/backfill có kiểm tra.
3. DB role least privilege, object access checks cho reads/writes/artifact refs; connection pool budget, transaction-local query limits.
4. Audit log append-only, no secret payload; create/read/update fixture flows không dùng `ws_unknown` fallback.

**Frontend — to do:** Generated typed client/envelope runtime validation, common loading/empty/forbidden/conflict states, auth-scope query keys. Contract fixtures hai workspaces; không cần screen final nhưng harness có real DB API.

**Output:** Migrations, repositories, auth matrix, ER diagram/text, seed fixtures dành test, EXPLAIN baseline và DB restore smoke.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/07/08/09/11/19:**

1. Implement relations §7.4 và composite keys cho selection/evaluation/child runs; selected_trial_ref nullable không làm mất FK tới selection artifact.
2. Durable draft tạo một attempt theo client_intent_id; autosave tăng draft revision, không tạo node mới. Counters có definition và breakdown, không count worker rows thành research trials.
3. Persist exposure facts và verification receipts riêng; UI pick/cursor không ở frozen manifest. Child audit/repro trỏ cùng target input mà không copy raw blobs.
4. Trạng thái COMPLETE/PRUNED/FAILED tách selection/pool/feasibility flags. Restore/backfill giữ distinction legacy unknown thay fabricated fields.
**Đầu ra bổ sung:** ER relationship examples, constraints/test fixtures cho centroid, persisted draft, child audit, exposure và orthogonal trial flags.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P03-T01` | Migration trên DB mới, DB nâng cấp và chạy lặp có kết quả xác định. |
| `P03-T02` | Composite FK và API authorization chặn cross-workspace identity access. |
| `P03-T03` | Idempotency key cùng payload replay; khác payload bị conflict. |
| `P03-T04` | Concurrent updates sử dụng CAS, không last-write-wins âm thầm. |
| `P03-T05` | Research DB role không UPDATE/ALTER execution schema. |
| `P03-T06` | Xóa draft không cascade xóa pinned evidence. |
| `P03-T07` | Query plan và connection pool được đo trong ngân sách. |
| `P03-T08` | 10 autosaves + duplicate submit cùng intent tạo một persisted attempt và đúng logical run; retries có own rows. |
| `P03-T09` | Centroid selection có selected_trial_ref=null vẫn roundtrip; không fake trial cần satisfy FK. |
| `P03-T10` | Audit/export/diagnostic child relations không tự tăng attempt count; no cross-workspace target refs. |
| `P03-T11` | UPDATE inspection state không làm thay selection/bundle/RC digest; complete trial count giữ nguyên khi thêm selected membership. |

**Exit gate:** Restart API/DB retains metadata; all identity invariants enforced; protected schema diff0; live queries không giữ whole history in RAM.

**Exit gate bổ sung:** Schema encode được quan hệ/denominator mà không dựa vào UI convention; no new execution table/constraint. Counts qua restart/backfill được đối soát.

**Debt/rollback:** Index tuning có thể tiếp tục P12/P15 nhưng missing uniqueness/auth không defer. Rollback application/forward compatibility; destructive schema down chỉ trên test DB, production rollback không drop data.

<a id="phase-p04"></a>
## P04 — QuantBT 1.1.1 adapter, capability và memory baseline
<!-- BEGIN RL-V1.1 PHASE-P04 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P04

**Mục tiêu kiểm chứng:** Reference QuantBT 1.1.1 thực. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Chạy DR-SIGNAL và DR-DIRECT/DR-PORTAL theo §23 với Delta nguyên bản, snapshot thật và explicit effective spec. So signal/index/exit fields, then output route tương ứng; lập reference bundle, first-divergence diff và tolerance registry. Chạy warm/cold riêng, peak tổng và worker. Baseline golden1.0.8 chỉ là migration evidence, không expected ép lên1.1.1.

**Browser / UI UX:** Nếu chưa có UI mới, browser existing read/harness chỉ kiểm tra provenance/claim không bị relabel; không giả 15 màn đã kiểm tra. Khi có screen phục vụ engine data, rebuild và test real response trên screen ấy. Expected không lấy lại từ endpoint đang bị test.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P04-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P04-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P04-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Có direct-engine result thực lưu xuống disk và so với adapter, hoặc BLOCKED với lỗi cụ thể; không thay Delta bằng strategy đơn giản hơn để báo phase PASS. Source hash protected giữ nguyên.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P04 -->


**Mục tiêu:** Thay pin1.0.8 ở Research bằng1.1.1, gọi đúng public API và biết route nào thực sự đáp ứng contract/RAM. **Phụ thuộc:** P02.

**Backend — to do:**
1. Pin package/native/build hashes và environment; sửa Research adapter version checks/typing, không vendor sibling QuantBT. Giữ legacy history engine IDs.
2. Implement route→public endpoint mapping, optimizer/WFO configs, retention/validation descriptors; probe installed release once, persist manifest; unsupported reason rõ.
3. Golden corpus gồm available real approved strategies và small deterministic technical fixtures để kiểm tra route/accounting; fixture không thay real-alpha acceptance. Đối chiếu old/new khác biệt có explanation, không yêu cầu numerical parity với bug cũ.
4. Measure input/private/native/audit/result memory by stage trong resource class5 GB; ghi writer-retention gap thật. Evaluate zero-extra-copy export path, no private monkeypatch.
5. Capture stable summary/claim keys needed existing RunSync. Phân biệt selected=None hợp lệ theo contract với artifact bắt buộc bị mất: trường hợp đầu vẫn là kết quả nghiên cứu đúng nhưng không đủ điều kiện cho luồng yêu cầu selection; trường hợp sau fail integrity/completeness. Không giả best thành selected để publish.

**Frontend — to do:** Client types/capability read fixtures; route cards disabled-with-reason, effective defaults, engine version provenance; no automatic “Rust” badge.

**Output:** Adapter tests, release manifest, route coverage matrix14rows, golden outputs/differences, memory profile by workload và upstream capability gap ticket nếu cần.

**Bổ sung bắt buộc sau review HTML/spec — FND-04/05/06/08/09/13/18:**

1. Lập field-binding map và resolve effective values cho controls trùng; phân biệt strategy seed/sampler seed/seed consensus nếu API có scope khác nhau.
2. Emit actual topology/budget scope và source statuses, including zero-selected/multi-objective/centroid cases. Không synthesize Stage B/J terms không có đủ raw semantics.
3. Final-audit target mapping: global/per-fold/composite phải gọi đúng public path; checkpoint/reproduce hỗ trợ tới đâu nói tới đó. Reuse evidence eligibility được test, không bật mặc định vì run completed.
4. Capability descriptor tách engine/integration/evidence/admission; route mới chưa có mapper không auto-call và không bị gắn nhãn engine unsupported.
5. Golden cases cho empty/NaN/no-loss/zero-variance/seed/default change; preserve raw values/units và actual errors. Lưu kết quả additive release diff, không giả zero-copy/resume parity.
**Đầu ra bổ sung:** optimizer canonical bindings, topology schemas, selection-target corpus, audit reuse fixtures và four-axis capability tests.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P04-T01` | Public endpoint/config mapping đúng installed release, không dựa vào tên tự đoán. |
| `P04-T02` | Tất cả route unions available có positive/negative input fixture. |
| `P04-T03` | Valid và invalid mode×schedule được phân biệt theo capability. |
| `P04-T04` | Best khác selected, constraints và missing-objective có kết quả đúng. |
| `P04-T05` | Historical artifact reader giữ engine identity/version cũ. |
| `P04-T06` | Resolved backend và reason phản ánh metadata thực tế. |
| `P04-T07` | Đo aggregate memory theo minimal/score/audit profiles, không bỏ native retained buffers. |
| `P04-T08` | Raw schema và required evidence surface được map rõ vào artifact contract. |
| `P04-T09` | Canonical optimizer values dùng đúng endpoint arguments; request conflict/type errors bị phát hiện trước compute. |
| `P04-T10` | SelectedNone hợp lệ không bị đổi thành best hoặc đánh dấu artifact corruption; publication eligibility riêng. |
| `P04-T11` | Per-fold/centroid selection được giữ đúng target và trial refs; no fold-last fallback. |
| `P04-T12` | Engine-supported route thiếu Portal adapter có integration-gap reason; profile thiếu evidence không thành engine refusal. |
| `P04-T13` | Reproduction pin effective defaults cũ; engine-upgrade experiment có diff, không exact-reproduction label. |

**Exit gate:** Baseline release identified and primary supported routes callable with exact evidence; required gaps have concrete closure. Không PASS full capability nếu profile bắt buộc chỉ chạy ngoài cap. Independent UI foundations có thể tiếp tục khi một capability bị BLOCKED, không cấp final acceptance.

**Exit gate bổ sung:** Mỗi supported tuple có actual input/output/retention mapping, budgets có units và audit semantics. Không PASS “full release integration” từ wheel presence.

**Debt/rollback:** Only spec-deferred options được deferred mặc định. Upgrade rollback switch default release for new jobs; không relabel old runs; in-flight image unchanged. Engine patch ngoài repo cần approval riêng.

<a id="phase-p05"></a>
## P05 — Structured artifacts, Parquet và bounded export
<!-- BEGIN RL-V1.1 PHASE-P05 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P05

**Mục tiêu kiểm chứng:** Round-trip kết quả thực xuống PostgreSQL/Parquet. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Xuất Delta bundle của P04 theo batch, seal, đọc lại ở process mới sau khi compute worker đã dừng. So rows/IDs/nulls/units/metrics/selection/digests với engine result. Kiểm tra truncation, corrupt part và repeated batch trên bản copy test; không giữ toàn result trong API memory.

**Browser / UI UX:** Browser/API download probe trên surface hiện có lấy bundle thật, đọc nội dung/export kiểm checksum; không chỉ check HTTP200 hoặc file exists. View chỉ đọc run persisted, không resurrect worker.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P05-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P05-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P05-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Storage→API không mất trường bắt buộc; original/effective params và exact precision giữ đúng; tài nguyên được đo. Corruption test không đụng artifact/shared storage của Bobby.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P05 -->


**Mục tiêu:** Worker xuất evidence trực tiếp xuống storage có cấu trúc; API đọc lại sau khi worker chết; không giữ full result trong RAM cho UI. **Phụ thuộc:** P03, P04.

**Backend — to do:**
1. Implement chunked writers, table schemas, part statistics, manifests, digest streaming; SQL trial-index ingestion idempotent và full ledger retention.
2. Implement seal/fsync/rename/register protocol, random staging, fencing validation, orphan reconciliation; artifact refs opaque.
3. Replace/bypass Research hot paths full bytes/pandas/copy chain; preserve small legacy summary output. Instrument peak of native engine AND exporter separately.
4. Build Rust bounded reader/column projection/keyset/seek foundations, byte-based caches; optional embedded spill query only as needed.
5. Storage classes, quota reservations, pinned retention/refcounts, lease-aware scratch cleanup; no global execution storage changes.

**Frontend — to do:** Artifact state/component harness with real partial/sealed/missing/integrity states; controlled download; no clickable unsealed link. API contract for paginated tables and chart samples.

**Output:** Parquet schema registry, manifest schema, writer/reader library, failure-injection suite, storage inventory, cold/warm resource report.

**Bổ sung bắt buộc sau review HTML/spec — FND-07/08/11/14/15/19:**

1. Persist child audit/repro/diagnostic outputs bằng manifests/refs; không nhân bản dataset hoặc selected trace cho mỗi màn/user.
2. Build grid cell→unique evaluation mapping, replay original-ID→ordinal/part index và checksums; verification receipt ngoài expected manifest.
3. Exposure facts/GC pins không bị mất khi evict query cache; sealed holdout/raw artifacts tuân actual ACL, không qua generic download bỏ quyền.
4. SQL population indexes và Parquet source ở cùng revision; selected membership không rewrite execution_status, repeated batch không tăng totals.
**Đầu ra bổ sung:** storage fixtures có nullable trial, noncontiguous seq, duplicate grid cells, audit child refs; GC/exposure recovery checks.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P05-T01` | Raw output → Parquet → projection giữ nguyên dữ liệu/units/IDs cần thiết. |
| `P05-T02` | Writer batch/row-group memory thực sự bounded. |
| `P05-T03` | Crash tại các điểm trước/sau seal và DB commit được recovery đúng. |
| `P05-T04` | Hai writers cùng digest không tranh chấp một file staging chung. |
| `P05-T05` | Missing/corrupt part không được coi là READY. |
| `P05-T06` | Worker mất epoch không được commit. |
| `P05-T07` | Disk full và backpressure không làm memory queue tăng vô hạn. |
| `P05-T08` | Export lớn có peak memory bị giới hạn. |
| `P05-T09` | GC giữ toàn bộ active/pinned references. |
| `P05-T10` | Audit/reproduction child chỉ reference immutable inputs; measured disk không tăng theo full dataset mỗi child. |
| `P05-T11` | Grid81cells có thể map tới ít unique evaluated configs hơn; no duplicate records khi retry ingestion. |
| `P05-T12` | Seq không liên tục vẫn seek đúng theo index; no fabricated event cho ID trống. |
| `P05-T13` | Projection/cache eviction giữ selection refs, exposure facts, verification expected digest và pinned RC artifacts. |

**Exit gate:** Complete run readable with compute off; no producer-owned full result retained after commit; immutable refs valid; direct memory measurement includes engine-retained chunks. Whole required workload5 GB or explicit blocking gap, not hidden spilling claim.

**Exit gate bổ sung:** Layout/read index đáp ứng findings bằng bounded reads, không raw-in-memory session. Restore giữ cả metadata relationships lẫn referenced bytes.

**Debt/rollback:** Compaction tuning may defer toP23 if file count/query bounded; durability/digest/full history cannot. Rollback readers version-aware, keep sealed artifact bytes; never delete evidence to undo deploy.

<a id="phase-p06"></a>
## P06 — Durable scheduling, sandbox workers và retry correctness
<!-- BEGIN RL-V1.1 PHASE-P06 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P06

**Mục tiêu kiểm chứng:** Worker thực, fairness và retry. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Chạy Delta short profile có signal activity; submit trùng, kill child, lease expiry, late commit, cancel và restart theo test harness được phép. Reference giữ một logical intent; không chọn best result giữa attempts. Khi engine không hỗ trợ resume, restart được ghi rõ, không giả resume.

**Browser / UI UX:** Browser quan sát snapshot/SSE trên view đã có; double submit tạo một intent; reconnect không đổi run_id; bảng trạng thái phản ánh queued/running/sealing. Không dùng timer mô phỏng progress.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P06-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P06-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P06-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Tối thiểu một compute run Delta thực qua worker bền vững, fault tests đủ và resource cap đạt. Chỉ gây lỗi process/service test được cấp, không kill theo tên chung hoặc reboot host.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P06 -->


**Mục tiêu:** Một đường compute chịu crash/retry và không vượt tài nguyên; real child process thay misleading thread isolation. **Phụ thuộc:** P03, P04, P05.

**Backend — to do:**
1. Wire job intent/outbox→existing NATS→claim/lease; messages small IDs. PG lifecycle authority, inbox dedup, expiry/fencing, cancel CAS.
2. Supervisor spawns isolated Python jobs; no execution credentials/network access; pids/memory/CPU/filesystem/time limits, close native handles finally.
3. Admission RAM/CPU/scratch/I/O, baseline1heavy, fair workspace/user queue, reserved interactive capacity. Estimate/correct cost from observed job history.
4. Implement crash recovery, technical retries without changing research intent, resource-failure classification, partial evidence handling and safe cleanup. No success from a stale worker.
5. Existing direct submit path chuyển sang durable service internally; no second scheduler concurrently dispatching same run.

**Frontend — to do:** Common queue/resource/cancel reasons and operational attempts drawer data; no new research lineage node for retry. Display “waiting for resources” truthful, no ETA invented.

**Output:** Durable worker integration, sandbox configuration template, scheduler policy/config, race/recovery matrix, per-job usage evidence.

**Bổ sung bắt buộc sau review HTML/spec — FND-05/07/08/11/14:**

1. Job kinds primary/audit/diagnostic/verify/export có quota và cost model trong cùng aggregate budget; một heavy slot không bị bypass bằng task chạy trong API hoặc “utility worker”.
2. Create diagnostic chỉ từ explicit action; key dedupe gồm target artifact/effective config/objective/data role/seed/runtime, không params-only.
3. Final audit trước compute pin target và child-run relationship. Retry cùng logical job giữ audit target; không chọn best giữa worker attempts.
4. Mandatory evidence completion và optional diagnostic độc lập; pending what-if không giữ primary RUNNING/SEALING vô hạn. Outbox/epoch cancellation giữ nguồn exposure thực.
**Đầu ra bổ sung:** job-kind/resource matrix, diagnostic command contract, dedupe key tests, topology planned-vs-actual counters.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P06-T01` | 20 queued intents không nạp đồng thời 20 datasets. |
| `P06-T02` | Kill worker và duplicate broker delivery không nhân run/commit. |
| `P06-T03` | Late worker commit sau khi mất lease bị từ chối. |
| `P06-T04` | Cancel cạnh tranh với final commit có một kết quả xác định. |
| `P06-T05` | Kiểm tra PID/sandbox thật; thread không được nhận là process isolation. |
| `P06-T06` | Strategy cố chiếm RAM/CPU/process/file bị giới hạn. |
| `P06-T07` | Queue fairness không để một user làm các user khác starvation. |
| `P06-T08` | RAM/FD/native state được thu hồi sau các job cycles. |
| `P06-T09` | NATS/DB outage có recovery không làm mất intent đã durable. |
| `P06-T10` | Mount Search/Freeze/Replay, hover hoặc slider drag không tạo job; explicit diagnostic mới có durable intent. |
| `P06-T11` | Two users authorized request cùng deterministic diagnostic inputs được reuse/dedup đúng scope; khác seed/state không bị gộp. |
| `P06-T12` | Audit retries không đổi selection hoặc tăng research attempt count; late worker không replace good committed result. |
| `P06-T13` | Optional diagnostic queued/failed không block primary READY; mandatory audit/evidence vẫn chặn readiness tương ứng. |

**Exit gate:** Exactly one published effect per logical job via idempotency/fencing (không claim global exactly-once); retry transparency; no cross-job state leak; bounded aggregate memory/I/O in stress harness.

**Exit gate bổ sung:** Mọi compute/export/verify đi qua resource accounting thực; không có implicit expensive action. Logical work/worker attempt counts giữ đúng distinction.

**Debt/rollback:** Pool reuse optimization optional, not required; isolation/durability no defer. Rollback pause new claims, drain/cancel safely by policy, keep intents and outbox for recovery; no killing execution processes.

<a id="phase-p07"></a>
## P07 — Alpha Registry, Import và version binding UI
<!-- BEGIN RL-V1.1 PHASE-P07 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P07

**Mục tiêu kiểm chứng:** Built-in Delta và single-file Import. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Giữ built-in registry Delta. Để test upload .py, tạo test-entrypoint/manifest mỏng dùng package Delta có sẵn theo import contract đã xác minh; không upload nhầm file có relative imports rồi sửa kernel cho qua. Wrapper packaging có digest riêng, tham chiếu protected source digest, sinh output đối chiếu built-in; không giả wrapper là cùng bytes với kernel.

**Browser / UI UX:** Browser upload/paste→parse mirror readonly→7 gates→register DRAFT→activate theo quyền; duplicate file, edited bytes after validation, unknown dependency và wrong workspace. Test engine signature/output equality sau register khi chạy được; static gate không là no-leak certificate.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P07-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P07-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P07-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Màn14 có browser results và visuals thật; wrapper không reimplement strategy. Thiếu import representation thì BLOCKED đúng điểm; không bỏ màn14 vì Delta vốn đã built-in.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P07 -->


**Mục tiêu:** Single-file strategy onboarding theo màn 14, versioned và executable qua QuantBT adapter. **Phụ thuộc:** P03, P04, P06.

**Backend — to do:** Parse manifest/AST; seven ordered gates; sandbox dry import; scoped digest uniqueness; bounded param/data contract validation; file_ref ownership+TTL+TOCTOU check. Đăng ký DRAFT atomic, activate/supersede version metadata with expected revision; registry dispatch alias→exact bound version. Protected strategy remains untouched.

**Frontend — to do:** Build toàn bộ màn 14 drop/paste, **contract mirror chỉ đọc từ source đã parse** (không field editor cho parameter_space/entrypoint/data contract), gate results/logs, DRAFT registration/activation, copy/digest interactions and reset/dirty states. Chỉ các declaration/metadata inputs mà spec cho phép riêng mới editable. Server gate results not animated fake success; SKIPPED sau khi thất bại. Bind/select data exposed cho màn 02; no arbitrary dependency installer or source editor outside spec.

**Output:** Import API schemas, registry/version tables, sandbox gate runner, toàn bộ màn 14, malicious fixtures and screenshots.

**Bổ sung bắt buộc sau review HTML/spec — FND-03/19:**

1. Mirror fields trong14 readonly từ server parse; chỉ metadata/declarations mà spec cho phép có editor riêng. Không PATCH parameter_space hoặc entrypoint dưới file digest cũ.
2. Source changed→invalidate parse/gate receipt; register rechecks exact bytes/schema. Narrow/pin thuộc New Run, widen beyond declaration phải nộp file/version mới.
3. Manifest phân biệt declared params, run pin và code-fixed/config refs; không phát minh code-fixed fields nếu raw/code contract không cung cấp.
4. DRAFT activation transaction không đổi job/wizard binding hiện tại; warning/gate7 static PASS vẫn không phải certificate.
**Đầu ra bổ sung:** read-only mirror component tests, tampered-request fixtures, source→digest→bound-version trace.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P07-T01` | Import một strategy .py hợp lệ và chạy đúng artifact đã đăng ký. |
| `P07-T02` | Missing contract, parameter bounds hoặc quá số parameters bị từ chối. |
| `P07-T03` | Top-level network/filesystem/process/allocation attacks bị sandbox chặn. |
| `P07-T04` | Bytes đổi sau validation không được register dưới digest cũ. |
| `P07-T05` | File reference khác scope không đọc/đăng ký được. |
| `P07-T06` | Duplicate registration và concurrent activation không làm lệch active version. |
| `P07-T07` | Version của run đang chạy không đổi khi alpha được activate version mới. |
| `P07-T08` | Toàn bộ test [S14] và wording static-scan không tự cấp causality certificate. |
| `P07-T09` | UI không có editable control cho parameter_space/entrypoint parsed; crafted server request cũng không thay declared contract. |
| `P07-T10` | Sửa source sau gates PASS buộc parse/validate mới; register với receipt cũ bị từ chối. |
| `P07-T11` | Widen ngoài declaration dẫn đúng new-version workflow; within declaration narrow/pin không tạo code version giả. |
| `P07-T12` | Pin/code-fixed/default provenance roundtrip đúng manifest; downstream digest không được mở rộng tự ý. |

**Exit gate:** Import→DRAFT→ACTIVE đã được cấp quyền→strategy loading evidence uses same bytes/entrypoint; no execution secret access; alpha mapping compatible with P02; UI complete with real backend not mocks.

**Exit gate bổ sung:** Import toàn bộ supported flow không dùng field editor trái source. P07 cũ “field editor” không còn là yêu cầu; COR-17 bắt buộc visual/interaction review.

**Debt/rollback:** Full developer IDE/multifile import explicitly out of scope, not missing feature. Param code unsupported must have reason, not hidden coercion. Rollback disable new import command, retain registered versions/evidence; no revoke execution alpha or change active runtime.

<a id="phase-p08"></a>
## P08 — Data snapshots, effective spec và authoritative preflight
<!-- BEGIN RL-V1.1 PHASE-P08 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P08

**Mục tiêu kiểm chứng:** Dữ liệu/cấu hình thực của Delta. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Preflight trên real snapshot: timezone, [start, end), missing bars, warmup, bounds và fold topology; đồng nhất dữ liệu direct và portal. Thay source sau preview không đổi pinned input. Seed/trials aliases resolve một giá trị. Test future perturbation trên copy test giữ dữ liệu gốc read-only.

**Browser / UI UX:** Browser data/range/parameter edits làm invalidate token; UTC-naive crypto đúng, aware giữ instant; review thể hiện snapshot/effective spec. Ước lượng resource/trial budget có đơn vị, không âm thầm thu nhỏ workload.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P08-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P08-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P08-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Manifest browser submit và manifest worker đọc khớp; numeric/time roundtrip có report. Không để warning data quality giả hoặc masked gap biến thành input sạch.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P08 -->


**Mục tiêu:** Preflight và engine dùng cùng data/config; no leakage or full-frame copies created unnecessarily. **Phụ thuộc:** P03, P04, P05.

**Backend — to do:** Reuse authorized historical-data contract/snapshots; resolve symbol/timeframe/calendar/timezones, available columns, gap quality, closed-bar policy, funding inputs và warmup. Immutable input manifests + refs instead per-user copies. Resolve requested/effective spec and exact fold plan; checksum token invalidation; estimate RAM/disk/compute. Data descriptors không đưa future access vào strategy ngoài đúng evaluator boundary.

**Frontend — to do:** Data selector/preflight preview components cho màn 02/05, real quality counters, timezone/range labels, budget warnings/errors. Authoritative result server replaces approximate preview; changed input clears valid token. Avoid fetching all dataset history just to draw split preview.

**Output:** Dataset binding schema, preflight API/result/token, fold-plan schema, quality/index snapshots, timezone and boundary test fixtures.

**Bổ sung bắt buộc sau review HTML/spec — FND-04/05/06/10/11/18:**

1. Preflight dùng canonical optimizer values, engine release descriptor và authoritative topology; report scope trial/evaluation counts + early-stop uncertainty + required audit/storage estimate.
2. Reproduce dùng archived effective inputs; clone/upgrade resolve defaults theo intent và hiển thị diff. Đổi version/route reconcile stale fields nhưng không silent reset valid edits.
3. Seal metadata/quality scan khác engine evaluation/result exposure. Không đọc raw sealed holdout để vẽ preview, đếm chart hoặc chạy feature fit trái workflow.
4. Check engine/integration/evidence/admission riêng; queued/resource-bounded khác unsupported. Declared bounds/pin, categorical types và max parameter surface từ version thật.
**Đầu ra bổ sung:** budget topology payload, canonical field conflicts, reproduction/upgrade default diff, seal-metadata-only network/read trace.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P08-T01` | Source data thay đổi sau preflight nhưng bound run vẫn dùng snapshot đã ghim. |
| `P08-T02` | UTC-naive crypto, Vietnam-naive và aware timestamps giữ đúng instant. |
| `P08-T03` | Closed-bar, half-open interval và warmup rules đúng. |
| `P08-T04` | Missing funding/required columns/data contract bị từ chối rõ. |
| `P08-T05` | Transforms chỉ fit trên data boundary được phép. |
| `P08-T06` | Mọi material edit đều invalidate preflight token. |
| `P08-T07` | Resource estimate/admission xét cả memory, concurrency và disk. |
| `P08-T08` | History đã dùng holdout không bị hiển thị sealed/unread. |
| `P08-T09` | 400trials được ghi đúng per-study/fold/seed/run scope theo fixture actual topology, không unconditional product. |
| `P08-T10` | Preview effective spec == submitted effective spec và parent reproduction/upgrade intent semantics đúng. |
| `P08-T11` | Sealed holdout metadata preview không phát data read/evaluation; snapshot integrity fact không tạo “evaluated” flag. |
| `P08-T12` | Version/route change làm preflight stale và validate dependent fields; old bounds/defaults không đi lậu vào worker. |

**Exit gate:** Exact manifest passed to worker, no silent source reload; dataset listing/query bounded. No claim full statistical causality from checksum only. Required server data unavailable is explicit discovery blocker for real-data acceptance, not synthetic replacement mislabeled real.

**Exit gate bổ sung:** Preflight chứng minh resource/data/config contract, không chỉ UI validation. Holdout authority chưa có thì dependent mutation BLOCKED, không fabricate permission.

**Debt/rollback:** Full Data Catalog UI giữ trạng thái SOON as spec; necessary dataset discovery/preflight still complete. Rollback invalidates tokens for changed schema, retains inputs referenced by runs đã hoàn tất.

<a id="phase-p09"></a>
## P09 — Research frontend foundation, Journey và Engine Atlas
<!-- BEGIN RL-V1.1 PHASE-P09 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P09

**Mục tiêu kiểm chứng:** Shell/Atlas và browser foundation. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Dùng engine/strategy manifest từ Delta P04, không engine import mỗi lần mở Atlas. Capability distinction engine/adapter/evidence/admission đúng. Pin historical release khi mở link từ Delta run; không dùng manifest latest cho tất cả.

**Browser / UI UX:** Bắt đầu bắt buộc browser production-build và dev-host rebuild mỗi phase có UI, muộn nhất P09; đã có screen14 từ P07 thì áp từ P07. Journey/Atlas links, English copy, fonts/charts,1280/660 + source viewports, accessibility, shell isolation. Giữ original execution visual suite nguyên config và baselines.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P09-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P09-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P09-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Screens00/12 và Research primitives có screenshots/interaction evidence; deployed build SHA/digest đúng nếu UI review gate áp dụng. Local fixture visual và real-data lane được báo riêng.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P09 -->


**Mục tiêu:** UI chuẩn hi-fi tích hợp Portal mà không ảnh hưởng execution. **Phụ thuộc:** P02, P04.

**Backend — to do:** Serve persisted release/capability descriptors and optional small Journey registry; centralized endpoint schema/client generation; no runtime engine import for Atlas page view.

**Frontend — to do:** Research-scoped design tokens/components, existing fonts/chartlibs/TanStackQuery; route registry/deep links/evidence cursor; shell-free00/09 handling; accessible forms/tables/errors. Implement đầy đủ màn 00/12, including cả 14 routes and refused/deferredreasons. CSS exceptions localized; do not globally downgrade or patch execution components.

**Output:** Design system primitives, typed clients, route/cursor utility tests, source screenshot baseline and màn 00/12 screenshots at viewports bắt buộc.

**Bổ sung bắt buộc sau review HTML/spec — FND-01/02/15/16/18/20:**

1. Implement cursor codec §13.6: parse legacy keys/aliases, preserve pick/trade/study, detect conflicts và pin actual run revision. Nonselected pick không write selection context.
2. Action manifest được bind vào components/typed clients; prototype-only controls tách fixtures/dev route, production build không có complete-now/fake verify.
3. Atlas/Journey giữ layout spec; bốn capability axes thể hiện bằng existing panels/reasons, không auto-runnable engine route mới.
4. Browser harness render assets thật, test fresh-session deep links/back-forward/keyboard/focus; report source inspection khác browser acceptance.
**Đầu ra bổ sung:** versioned cursor codecs, fixture-only boundary checks, capability UI reason mapping và source-state screenshot inventory.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P09-T01` | Mọi route/link/shell nesting của Journey và Atlas đúng. |
| `P09-T02` | Evidence cursor roundtrip giữ study/fold/trial scope. |
| `P09-T03` | Copy diff chỉ có những exception thuộc COR ledger. |
| `P09-T04` | Engine runtime R1 không bị nhầm với approval gate R1. |
| `P09-T05` | Execution UI/route regression không đổi. |
| `P09-T06` | Responsive, keyboard, reduced motion và accessibility đạt spec. |
| `P09-T07` | Current và historical release descriptors hiển thị đúng. |
| `P09-T08` | Toàn bộ test [S00] và [S12] được chạy. |
| `P09-T09` | URL Search pick/trial/study và Replay trade/seq/event_seq roundtrip; ambiguity/conflict có typed outcome. |
| `P09-T10` | Back/forward thay inspector nhưng selection/RC digest không đổi; cross-run stale response không overwrite active context. |
| `P09-T11` | Production bundle/router không expose prototype domain commands; golden UI dùng real backend fixtures đúng scope. |
| `P09-T12` | Current Atlas route mới chỉ informational khi integration absent; historical run Atlas pin release cũ. |

**Exit gate:** Real fonts/assets/charts rendered in browser kiểm thử, no placeholder/trang lỗi CDN accepted; execution routes/layout unchanged; no production mock fallback.

**Exit gate bổ sung:** Shared UI/cursor foundation chứng minh no-write semantics và preserved deep links. Không chỉnh execution CSS/router behavior để pass screenshots.

**Debt/rollback:** Journey counters tùy chọn may remain off theo spec; các route chính/matrix không được trì hoãn. Rollback lazy routes/module only; preserve global shell and original execution frontend.

<a id="phase-p10"></a>
## P10 — New Run end-to-end, compatibility creation
<!-- BEGIN RL-V1.1 PHASE-P10 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P10

**Mục tiêu kiểm chứng:** Delta từ wizard đến durable run. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Chạy DR-PORTAL bằng browser New Run: bound AlphaVersion, real data, route đúng, explicit params; capture request thật, effective spec, seed, run_id và compare DR-DIRECT. Với tune profile giữ2–3 tham số meaningful/50 trials trong scope đã resolve; không sửa protected strategy.

**Browser / UI UX:** Đi đủ8 bước; pin/narrow, alias conflicts, submit202, double-click, invalid token, refresh/deep link; không backend-seed thay toàn bộ wizard happy path. Chờ trạng thái thật rồi đối chiếu UI/provenance.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P10-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P10-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P10-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Có browser-originated run thực và chain nguồn đủ. Same intent không tạo hai runs; quantitative diff PASS; UI hi-fi fields/actions đạt coverage của màn02.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P10 -->


**Mục tiêu:** Tạo bound run hợp lệ từ toàn bộ wizard và bảo đảm consumer R1 hiện có đọc được. **Phụ thuộc:** P06, P07, P08, P09.

**Backend — to do:** Finalize new discriminated producer request while định dạng cũ continues; validate snapshot/preflight/binding; durable write intent trước khi trả 202; maintain legacy strategy/dataset/protocol fields. Resolve alias readback without SQL writes to execution. Dedupe producer client intent; tested transportunknown recovery. Every route form maps schema QuantBT đã được kiểm chứng, no discarded field bắt buộc.

**Frontend — to do:** Hoàn thiện 8 bước wizard per `[S02]`, all optimizer/params/route state, sparse overrides, preflight/risk/resource review, trạng thái submit/doubleclick/errors/deeplink. Scratch/DRAFT limitations remain visible; no eligibility publish giả.

**Output:** Màn 02 hoàn chỉnh, API thật roundtrip fixtures, parameter/optimizer coverage checklist, requested/effective đã lưu specs and legacy read model proof.

**Bổ sung bắt buộc sau review HTML/spec — FND-03/04/05/06/07/18/19:**

1. Hoàn thiện canonical draft + serializer cho normal/advanced controls; review preview và POST cùng payload, no duplicate logical state. Null/empty/zero/false xử lý typed.
2. Budget label/topology/seed scopes rõ; limits lấy đúng source, không hardcode fixture ceiling thành engine truth. Invalid field hiển thị reason, không ẩn control.
3. Existing clone/reproduce/new-run actions map intent §5.7; first durable submit/draft idempotent theo §5.5, không count autosave thành attempts.
4. Bounds narrow/pin đúng declaration; đổi version giữ valid fields và flag invalid, không dùng hidden defaults; retain exact producer top-level fields for facade202.
**Đầu ra bổ sung:** golden payload cases conflicting aliases, explicit null seed, pin-all, upgrade defaults và double-click same intent; Review-to-worker trace.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P10-T01` | Bound AlphaVersion tạo run thật qua 202 và durable scheduler. |
| `P10-T02` | Double submit cùng intent chỉ có một run. |
| `P10-T03` | Stale preflight token bị typed rejection, không âm thầm resolve input mới. |
| `P10-T04` | Scratch không thể retro-bind để thành publishable. |
| `P10-T05` | Sweep/pin/seed/formal constraints/grid semantics đúng. |
| `P10-T06` | Invalid route hoặc schedule bị từ chối đúng reason. |
| `P10-T07` | Old client request format vẫn hoạt động qua compatibility path. |
| `P10-T08` | RunSync hiện hành tìm được run đã seed và đọc summary đúng shape. |
| `P10-T09` | Toàn bộ test [S02] và required wizard controls có real backend. |
| `P10-T10` | Sửa trial/seed tại form chính phản ánh advanced/control Review và endpoint actual đúng một value; conflict request bị reject. |
| `P10-T11` | Absent/null/0/false giữ đúng contract; không dùng falsy default khi serialize/preflight. |
| `P10-T12` | Autosave/reload/doubleclick không tạo duplicate attempt/run; new material intent mới tạo lineage node. |
| `P10-T13` | Reproduce release cũ không adopt defaults mới; upgrade experiment liệt kê effective diff. |
| `P10-T14` | Version change→stale bounds invalid có reason, valid edits giữ nguyên; beyond declared range từ chối ở server. |

**Exit gate:** Real smallstrategy job executes through durable path; no accidental directProcessPoolfallback; input/snapshot/engine/specIDs match UI. Backend fieldcoverage100%requiredwizard contract; no mocksuccess.

**Exit gate bổ sung:** Màn02 không chỉ “POST thành công” mà còn chứng minh ý định người dùng == effective execution. No silent alias priority/default drift.

**Debt/rollback:** Route missing required public capability blocks affected acceptance, not allow silentroutechange. Rollback feature flag của wizard mới, preserve định dạng producer cũ/jobs đang chạy/metadata; facade được bảo vệ unchanged.

<a id="phase-p11"></a>
## P11 — Progress, console và artifact readiness
<!-- BEGIN RL-V1.1 PHASE-P11 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P11

**Mục tiêu kiểm chứng:** Progress của run Delta đang chạy. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Một short Delta job mới để test transition; một queued job; fault variant được phép. Capture actual stage/trial counts/seq/resources/artifact readiness. Không dùng completed historical run để tuyên bố đã kiểm active progress.

**Browser / UI UX:** SSE reconnect/fallback, queue reason, cancel race, console ring, artifact pending/sealed, terminal reload; không page.clock giả processing trong real lane. Build deploy và test domain sau publish phase.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P11-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P11-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P11-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Run progress khớp persisted events, không reported COMPLETED trước seal. Có console/network/trace evidence đã redacted; screenshots không thay assertions.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P11 -->


**Mục tiêu:** màn 03 reflects real state and survives disconnection without growing RAM. **Phụ thuộc:** P06, P09, P10.

**Backend — to do:** Structuredstage/fold/trial/artifact events at actual hooks; sequence đã lưu/snapshot/resume; log tail bounded index; ETA nullable; resource events của worker sampledsmall. Keep operational log parsing display-only if any legacy path remains; never use it to issue evidence. Seal readiness linked to terminal compatibility status.

**Frontend — to do:** Màn 03 hoàn chỉnh with stage rail/Gantt windowing/console ring 500 dòng, batch 100 ms, artifactsdrawer, queue/cancel/retrystate, fallback poll 5 giây and reconnect cursor. Show counter source/partial watermark; no completion badge trước seal.

**Output:** Eventschemas, resumeprotocol, màn 03 hoàn chỉnh và screenshots, log index implementation and báo cáo stream soak.

**Bổ sung bắt buộc sau review HTML/spec — FND-01/05/07/08:**

1. Progress metrics phân biệt planned budget, actual completed/pruned/failed evaluations, studies và worker retries; selected flag không thay denominator.
2. Demo complete-now/stage/success handlers không map production. Completion do lifecycle+seal; animation không tạo events hoặc claim.
3. Khi worker retry, display attempt details/current epoch; partial evidence đã được expose giữ refs, không lẫn batches của hai attempts như một optimizer study.
4. Mandatory vs optional audit/diagnostic status riêng; không nói “run failed” khi SSE đứt hoặc “run complete” khi chỉ compute done.
**Đầu ra bổ sung:** counter definitions, planned/actual examples, retry/partial exposure trace và prototype-leak regression.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P11-T01` | Events duplicate/gap/out-of-order không tạo trạng thái sai. |
| `P11-T02` | Reconnect sau service restart resume bằng snapshot/sequence. |
| `P11-T03` | Nhiều tab/viewers có backpressure và bounded buffers. |
| `P11-T04` | Cancel race với commit hiển thị kết quả nguồn đúng. |
| `P11-T05` | FAILED không mang issued certification giả. |
| `P11-T06` | Storage seal chậm giữ trạng thái finishing, không complete sớm. |
| `P11-T07` | Tail log lớn không đọc toàn bộ file vào RAM. |
| `P11-T08` | Toàn bộ test [S03] được chạy. |
| `P11-T09` | Selected COMPLETE trial không bị đếm thêm; evaluations>trials và technical retries có labels đúng. |
| `P11-T10` | Early stop/pruned studies hiển thị actual count với scope, không tăng percent bằng timer. |
| `P11-T11` | Duplicate/stale SSE không revert epoch/state; đã xem partial evidence vẫn có provenance sau retry. |
| `P11-T12` | No complete-now production action; primary sealing/audit/optional diagnostic trạng thái không đánh tráo. |

**Exit gate:** Progress state equals persistedjobstate and engine hook records, not timestamps suy diễn. Nhiều người xem dùng projection nhỏ dùng chung, không mỗi người giữ toàn bộ lịch sử. Full evidence remains accessible beyond UI ring size.

**Exit gate bổ sung:** Mọi counter/badge/timestamp có source hoặc explicit estimate label. Browser state không trở thành authority progress.

**Debt/rollback:** Some fine-grain ETA unavailable allowedlabel, missing mandatoryauditinstrumentation not. Rollback SSE sang polling đã kiểm chứng for Research only; preserve event IDs/states, do not touch execution streaming.

<a id="phase-p12"></a>
## P12 — Run Library, search/filter và historical browsing
<!-- BEGIN RL-V1.1 PHASE-P12 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P12

**Mục tiêu kiểm chứng:** Library từ nhiều Delta attempts. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Dùng fixed, tuned, failed, cancelled, retried Delta runs đúng metadata; real-result rows cho metric checks. Dataset tăng cardinality synthetic chỉ để load test có label rõ. Row metric vs engine→SQL snapshot, filters/counts/paging exact.

**Browser / UI UX:** Group AlphaVersion/scratch, sort/filter/back/refresh, stable selected rows, compare eligibility, status transitions; actual DOM values vs API raw provenance. Lưu screenshot rows dài/hash/undefined metric states.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P12-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P12-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P12-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Không N+1/full-run load; no duplicated attempts from retries; field/action coverage của màn01 đầy đủ và rebuild dev-hash verified.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P12 -->


**Mục tiêu:** Screen01 fast on growing histories without loading oldruns into RAM. **Phụ thuộc:** P05, P09, P10, P11.

**Backend — to do:** SQL indexed list/filter/group/query, keyset cursors, counts and metric projections nhỏ; bounded sparkline24points; đọc theo batch không N+1. Historical1.0.8metadata readwithoutupgradingidentity. Separate mutableapprovalmirror/statusfromimmutablemetricrevision.

**Frontend — to do:** Toàn bộ màn 01filters/URL/backrestore/stablepollrows10 giây/QUEUED/errorstates/comparebar/contextmenus/groupheaders. Rowmetricscopeandlegacyunavailable labels; selectedrowsnotlostwhenpollrefreshes.

**Output:** Screen01, queryplans, pagination/permissionsfixtures, lịch sử lớn storage-only workload data clearly syntheticnotfinancialevidence.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/06/07/13:**

1. Run Library query trả row kind và relationship để không nhầm audit child/worker retry với một nghiên cứu mới; giữ layout grouping hiện có.
2. Counters/filter scope tách total attempts, logical runs và technical retries; draft chưa compute không có metric giả.
3. Clone/open/compare giữ exact run/revision; existing action semantics §5.7. List sparkline/sort dùng metric role thực, mode5 không giả OOS.
4. Refresh không reset picked rows hoặc chuyển user tới run khác do re-order; unknown legacy fields vẫn có unavailable source label.
**Đầu ra bổ sung:** mixed registry fixtures gồm draft/failed/audit/repro/scratch, counter reconciliation và intent navigation tests.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P12-T01` | Keyset pagination xử lý tie, update và filter fingerprint đúng. |
| `P12-T02` | User không suy ra metadata của workspace khác. |
| `P12-T03` | RAM nền không tăng theo số historical runs được lưu. |
| `P12-T04` | Polling running rows không đảo thứ tự ngoài sort contract. |
| `P12-T05` | Compare selection tuân thủ key/same-alpha restrictions. |
| `P12-T06` | Đo latency cold/warm khi compute đang chạy. |
| `P12-T07` | Toàn bộ test [S01] được chạy. |
| `P12-T08` | Library row count không tăng vì technical retry; child run có relation/type không giả alpha mới. |
| `P12-T09` | Filter/sort/poll giữ selected compare IDs/inspection context; no automatic promotion pick update. |
| `P12-T10` | Clone/reproduce navigation chuyển đúng intent và source IDs; full-sample metric không ở OOS field. |
| `P12-T11` | Draft/failed/legacy missing metrics hiển thị reason, không0 hay best-so-far thành final. |

**Exit gate:** Library works withworkers đã dừng, no quét toàn bộ Parquet forlist, requiredcolumnsandfilterscomplete. Synthetic scale records test storage only; các hàng kết quả tài chính thật validate source truth separately.

**Exit gate bổ sung:** Library và Lineage counts reconcile bằng definition, không phải bắt mọi count bằng nhau. Performance giữ bounded reads.

**Debt/rollback:** Additionalnice-to-haveindexes maytuneP23; giới hạn truy cập toàn bộ lịch sửandauthcorrectnesskhông được trì hoãn. Rollback queryendpointversion/featureflag, retainnewmetadata/oldreadercompat.

<a id="phase-p13"></a>
## P13 — Evidence Flow Hub và metric projections
<!-- BEGIN RL-V1.1 PHASE-P13 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P13

**Mục tiêu kiểm chứng:** Hub data-to-pixel. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Delta equity/returns/trade outputs theo route thật→projection formulas→API. Kiểm monthly/rolling/underwater/fold summary bằng reference raw, distinct metric scope. Không assert mỗi UI tab so với API same object mà bỏ engine reference.

**Browser / UI UX:** Màn04 đủ tabs/drawers, hover tooltip/data table từ real Delta; click drilldown giữ revision; null/reason thay0; chart hiển thị đường thật với bounded sample metadata. Pixel/visual và numerical asserts riêng.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P13-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P13-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P13-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Mọi required field của Delta-supported path có source/diff; required fields route khác có supplementary test profile, không gắn N/A vì adapter chưa viết.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P13 -->


**Mục tiêu:** màn 04 hiển thị evidence nhất quán và đủ dữ liệu, không dựng một report engine thứ hai. **Phụ thuộc:** P05, P09, P10, P11.

**Backend — to do:**
1. Build versioned run-evidence envelope và projections cho summary, claim strip, data drawer, equity/underwater, rolling metrics, monthly returns, distributions và fold summaries theo §9/14.04.
2. Viết metric-definition registry: scope, units, sample frequency, annualization, null rules, input/transform digests. Kiểm chứng engine-direct values và derived values riêng.
3. Implement atomic projection revision, ETag, partial/readiness states, immutable core tách mutable status/mirror. Detail fetch lazy, không read toàn bộ ledger khi mở hub.
4. Manifest item status và claim/cert chain có source rõ; không cấp certificate bằng quy tắc UI hoặc gộp A–D với L0–L4.

**Frontend — to do:** Đầy đủ 7 tab, claim strip, sticky context, drawers, charts, deep links/cursor, loading/error/integrity states. Giữ tabs nguồn ở cùng run/revision; datasets/SOON links đúng specification.

**Output:** màn 04, metric dictionary, derived projection tests, source-field coverage matrix, screenshots và query resource report.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/11/12/13/15/20:**

1. Đóng metric registry §9.3 trên full-resolution raw/source; edge-case JSON values typed, no metric fill0 chỉ để chart render.
2. DR-02 warning definitions/copy có version; same metric/diagnostic label dùng same rule, hoặc tên phân biệt rõ giữa panels. No new approval thresholds.
3. Inspection cursor tách summary selection; playhead-state/causal-reveal panels khác final summaries. Key snapshots/projections theo revision và scope.
4. Categorical/ordinal diagnostics có valid formula; Spearman không ordinal-encode category tùy ý. Holdout exposure/source labels không tạo certificate.
**Đầu ra bổ sung:** metric-definition examples/test vectors, warning-definition resolution, Hub cross-tab immutable-selection scenarios.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P13-T01` | Engine-direct metrics đối chiếu raw output chính xác. |
| `P13-T02` | Derived rolling/calendar/benchmark calculations có reference tests. |
| `P13-T03` | Downsample chỉ đổi hình, không đổi metric chính thức. |
| `P13-T04` | Zero variance và missing funding/benchmark có reason, không zero fallback. |
| `P13-T05` | Concurrent projection revision switch không trộn metrics/params. |
| `P13-T06` | Historical readers không relabel engine/certificate. |
| `P13-T07` | Toàn bộ test [S04] được chạy. |
| `P13-T08` | Required-field coverage đầy đủ; null giả không được dùng để pass. |
| `P13-T09` | No-loss/zero-variance/empty/missing benchmark được serialize/display đúng reason thay0/NaN invalid JSON. |
| `P13-T10` | Click nonselected trial rồi chuyển Freeze/Report giữ cùng selected params và digest. |
| `P13-T11` | Same warning labels across Search/Freeze dùng DR-02 resolved definition; categorical/zero-width có reason. |
| `P13-T12` | Causal-reveal không thay certificate/claim; current-state panel không lộ future exit/PnL khi mode active. |
| `P13-T13` | All-tab projection response cùng revision; stale response không trộn metrics/selection giữa runs. |

**Exit gate:** Mọi số trong Summary truy được về input/definition; scope/disclosures đúng mode/route; hub không tự làm compute nặng khi page load. Required projections hoàn tất trong budget đã đo.

**Exit gate bổ sung:** Metric/diagnostic definitions đóng với numerical fixtures; required transformed fields có raw đủ phải implemented. No false claim from presentation.

**Debt/rollback:** Display-only thresholds chưa chốt phải hiện rõ Research rule và owner decision; không tự nhận là engine policy. Rollback projection version và cache namespace; giữ raw artifacts để rebuild, không thay evidence gốc.

<a id="phase-p14"></a>
## P14 — Split, chronology và holdout workflow
<!-- BEGIN RL-V1.1 PHASE-P14 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P14

**Mục tiêu kiểm chứng:** Split/causal/holdout evidence. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Delta WFO đúng capability, at least nontrivial folds; verify authoritative intervals/decision-use, cutoff outputs via future perturbation. So changed future bars on test copies với past signals/fold decisions. Holdout authority dùng source hiện có; không gọi unlock mới chỉ để test happy path.

**Browser / UI UX:** Split timeline lens/tooltip exact endpoints, warmup not scored, OOS selection-input vs strict; legacy used-holdout không sealed giả; unauthorized unlock disabled/refused đúng DR01. Nếu authorized workflow có thì browser exercise đúng isolated service.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P14-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P14-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P14-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Causal assertion khớp evidence không chỉ sequence timestamp. Chưa authority thì không PASS action unlock; source-deferred not same missing required implementation. Rebuild screen05.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P14 -->


**Mục tiêu:** màn 05 trình bày đúng vai trò dữ liệu; không tạo “strict OOS” bằng metadata đẹp. **Phụ thuộc:** P08, P10, P13.

**Backend — to do:** Persist authoritative fold plan và actual evaluation-window references; support inner/outer/warmup/purge/embargo theo valid modes. Instrument decision access events cần thiết; phân biệt data-time và physical I/O. Implement holdout seal/exposure read model và quy tắc không đọc dữ liệu sealed theo spec; **mutation unlock/consumption chỉ được nối sau DR-01**, bằng interface/quyền hiện hành đã kiểm chứng. Không tạo governance store/approver/gate mới, không sửa execution. Legacy three-window runs giữ disclosure đã sử dụng holdout nếu đó là hành vi thật.

**Frontend — to do:** Full05 timeline, compact/windowed folds, quality drawer, scope highlights, holdout states và navigation tới nguồn seal đúng spec; action unlock chỉ nếu route hiện có, DR-01 và quyền thực tế cho phép. Correction copy không tự ban claim A. Visual compression không đổi underlying interval.

**Output:** màn 05, causal invariants tests, holdout consumption ledger, source-to-fold map, future-perturbation result artifacts.

**Bổ sung bắt buộc sau review HTML/spec — FND-10/11:**

1. Chốt source ownership/read envelope của seal bằng DR-01; màn05 giữ readonly metadata + existing navigation. Không triển khai unlock button chỉ vì prose nói “audited read”.
2. Tách snapshot integrity, evaluation consumption, result exposure và source seal state/as-of; bars/gaps đã biết từ snapshot không có nghĩa được query raw content tùy ý.
3. Nếu existing authorized workflow có mutation, test actor/idempotency/one-time logical evaluation/sibling semantics theo source. Không có→owner scope decision cho phần đó, không fake successful unlock, không đổi execution.
4. Exposure liên quan clone/overlap/same-lineage phải giữ record; không tự cấm mọi alpha/user hoặc khẳng định chưa xem notebook ngoài hệ thống.
**Đầu ra bổ sung:** seal-authority contract evidence, exposure schema/fixtures và precise supported/blocked action list.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P14-T01` | Thay future data không đổi past decisions ở đường causal được tuyên bố. |
| `P14-T02` | Selector strict không đọc outer OOS trước decision boundary. |
| `P14-T03` | Selection-input OOS được disclose đúng, không strict-pass. |
| `P14-T04` | Warmup không bị chấm vào evaluation returns. |
| `P14-T05` | Timezone/calendar/half-open edge cases đúng. |
| `P14-T06` | Holdout unlock kiểm tra duplicate, race và quyền. |
| `P14-T07` | Run lịch sử đã dùng holdout giữ đúng label. |
| `P14-T08` | Toàn bộ test [S05] được chạy. |
| `P14-T09` | Mở Split/seal link chỉ đọc metadata, không holdout evaluation hoặc unlock side effect. |
| `P14-T10` | Snapshot integrity PASS nhưng chưa evaluation không hiện used; đã evaluate dù chưa report-view không hiện unread. |
| `P14-T11` | Không actual unlock authority thì không tạo role/approval/endpoint thay thế; UI/read contract vẫn truthful. |
| `P14-T12` | Clone/new version giữ exposure liên quan cùng lineage; unknown history không chuyển clean/unseen. |
| `P14-T13` | Concurrent/retried authorized unlock nếu supported không sinh hai logical evaluations; reset/cache clear không re-seal. |

**Exit gate:** Claim language khớp data-use evidence của từng schedule. Chưa có event cần chứng minh thì không issue assertion tương ứng. Đường bootstrap/calibration/tape có N/A đúng, không ép strict fold plan.

**Exit gate bổ sung:** Readonly seal surface và chronology có evidence thật. Mutation chỉ nghiệm thu khi DR-01 source/owner resolution hợp lệ; unresolved mandatory scope không được waive như N/A.

**Debt/rollback:** Không cho debt về leakage, false sealed hoặc chronology. UI lens animation có thể giảm theo reduced motion, không bỏ required fields. Rollback action unlock mới nhưng giữ consumption history; không tái niêm phong một holdout đã quan sát.

**Lưu ý debt/phạm vi sau review:** Không dùng P14 làm cớ xây governance subsystem mới. Owner scope gaps phải chỉ rõ dependency, không mở rộng quyền agent.

<a id="phase-p15"></a>
## P15 — Search, full trial ledger và objective diagnostics
<!-- BEGIN RL-V1.1 PHASE-P15 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P15

**Mục tiêu kiểm chứng:** Search thực từ Delta tuning. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Chạy DR-TUNE và DR-WFO matrix hợp lệ; save all studies/trials/evals, params, objective components, seed/prune/failed/infeasible status và true selection. Completed, pruned, selected dimensions tách. Supplementary fixture cho centroid/non-trial nếu Delta run thực không tạo case ấy.

**Browser / UI UX:** Scatter→nonselected pick→ledger→detail→Freeze bảo toàn θ*. Pagination vượt sample cap, jump trial same number different study, formula scope, categorical/undefined refusal. Không mock optimizer progress/numbers ở real lane.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P15-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P15-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P15-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Complete trial ledger reconcile engine/storage, no selected-from-click. 50-trial budget scope được log; không chạy mọi scenario từ đầu khi exact immutable result reuse đủ.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P15 -->


**Mục tiêu:** màn 06 phục vụ đủ Stage A/Stage B, selection và full history trong bounded memory. **Phụ thuộc:** P04, P05, P13, P14.

**Backend — to do:**
1. Normalize study/trial/evaluation identities, complete SQL index từ source batches; ledger pagination, trial detail/jump, fold/study filters và exact totals.
2. Implement scatter sampling≤600 có selected/best inclusion; histograms, parameter frequency, progression, prune reasons, Spearman proxy và interaction projections khi raw đủ.
3. Map mode 1–5 objective components, selection traces, raw best/selected/medoid/centroid/fallback, seed consensus, warm-start/baseline floor và search-regression từ engine. Không chọn lại params trong query layer.
4. Scope every row by data role, sampler/runtime and effective config. Validate repeated trial IDs across studies; numeric null/finite and multi-objective directions.

**Frontend — to do:** Toàn bộ màn 06 three-column workspace, equations effective config, modes/read-only context, charts, candidate pool/funnel, study-aware ledger cursor, keyboard/details. Demo controls không mutate completed run. Evidence “not applicable” theo route/mode; không hide constraints.

**Output:** màn 06, trial/evaluation schemas and indexes, objective/candidate mapping, diagrams/copy screenshots, full-ledger export/read tests.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/05/09/12/13/14/16:**

1. Search cursor sử dụng scoped inspection ref; ledger/surface synchronized nhưng actual selected artifact immutable. Centroid/composite selected support không requiring trial number.
2. Population registry: execution status khác selected/pool/feasible/duplicate; totals từ full persisted source, sampled scatter không thay complete ledger.
3. Objective expressions/components theo actual mode/schedule/config; mode5 chỉ full-sample fields, no fabricated OOS; valid missing/none cases có union/reason.
4. Diagnostics phân biệt numeric/ordinal/categorical; bound warning DR-02; widen action giữ declared-space boundary. Trial raw đủ thì compute projection phù hợp, không dựng lại historical selection.
5. Existing evaluated points có thể reuse cho what-if chỉ qua exact evaluation identity; không gọi sparse sample là full grid.
**Đầu ra bổ sung:** nullable selected-trial UI fixtures, population definitions và observer-versus-selected cross-screen tests.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P15-T01` | Năm modes supported và các schedule hợp lệ có fixture đúng scope. |
| `P15-T02` | Selected=None không bị thay bằng raw best. |
| `P15-T03` | Missing objective metric là lỗi thật, không score0. |
| `P15-T04` | Formal constraints và post-filter sampler behavior đúng. |
| `P15-T05` | Semantic dedupe không bị diễn giải nhầm thành prune reason khác. |
| `P15-T06` | Trial number trùng ở study khác không collision. |
| `P15-T07` | Ledger truy được toàn bộ rows vượt scatter cap. |
| `P15-T08` | Sampler/seed/warm-start/baseline trace khớp evidence. |
| `P15-T09` | Toàn bộ test [S06] được chạy. |
| `P15-T10` | Pick trial không được chọn→inspector đổi, θ*/Report/RC không đổi; back-forward vẫn đúng. |
| `P15-T11` | Centroid selection có full params và no fake trial ID; jump-to-trial không dùng row đầu khi ambiguous. |
| `P15-T12` | Complete/selected/feasible/pruned/duplicate totals reconcile với declared population; flags không cộng sai. |
| `P15-T13` | Category permutation không thay “importance” bằng arbitrary integer ranking; valid diagnostic hoặc typed N/A. |
| `P15-T14` | Bound/widen behavior theo declaration+DR-02; mode5 objective/cell labels không chứa OOS giả. |

**Exit gate:** Sampled visualization và complete ledger có totals/references khớp; selection quyết định từ engine; cannot mistake selection-adjusted OOS for strict. Query stays inside memory envelope under large persisted study.

**Exit gate bổ sung:** Field/action matrix của06 đóng tới mỗi panel/control; không chỉ StageA scatter đẹp. Missing implementation không thành unsupported-by-engine.

**Debt/rollback:** Không defer full trial index hoặc selection provenance. Advanced optional diagnostic chỉ được absent khi source spec/capability cho phép, không vì backend chưa implement phép suy ra có đủ raw. Rollback reader/projection version; retained raw schema remains readable.

<a id="phase-p16"></a>
## P16 — Freeze, integrity verification và what-if diagnostics
<!-- BEGIN RL-V1.1 PHASE-P16 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P16

**Mục tiêu kiểm chứng:** Freeze/verify/what-if Delta. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Freeze actual selected artifact. Verify original bytes; test corrupt copy refusal; full params/legacy/bundle digests đúng. Grid từ evaluated values hoặc explicit diagnostic QuantBT; effective duplicates reuse; selected unchanged.

**Browser / UI UX:** Click verify chờ backend receipt không setTimeout PASS; sliders không submit compute; grid missing/queued/completed/invalid state; δJ theo đúng mode. Revisit original run/digest sau what-if và after reload.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P16-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P16-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P16-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Có real verification outcome và legitimate grid values hoặc explicit missing-cell state đúng contract. Không tạo một worker riêng cho mỗi cell; browser precomputed lookup không đổi research intent.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P16 -->


**Mục tiêu:** màn 07 chứng minh đúng phạm vi freeze và không thay kết quả đã khóa khi thử what-if. **Phụ thuộc:** P13, P14, P15.

**Backend — to do:** Build separate candidate-pool freeze, selection commit và first evaluation references; claim verdict theo data-use role chứ không chỉ timestamp. Digest verification reads original immutable artifacts, quarantine mismatch, recover only known-good bytes. What-if uses existing grid or explicit low-priority QuantBT diagnostic job; dedupe same request/input hash, budgets, cancellation, retained result provenance.

**Frontend — to do:** Toàn bộ màn 07 timing strips, params passport, integrity statuses/recheck, 9×9 slider snap/lookup, preview warnings và create-sibling-draft action. No automatic reselect or re-publish. Query hooks không submit job trên mỗi slider event.

**Output:** màn 07, integrity verifier, what-if job contract/cache, COR-04 tests and screenshot exceptions.

**Bổ sung bắt buộc sau review HTML/spec — FND-01/08/09/12/14/19:**

1. Verify so expected bytes/digest của source revision bằng bounded verifier; lưu receipt/as-of, không rewrite expected checksum. Timer chỉ render loading.
2. Selection passport dùng target artifact thật, nullable trial hoặc sequence per-fold; final-audit plan pin target trước schedule, reuse checklist §5.6.
3. What-if cell map có effective θ, exact inputs/runtime/seed/objective scope, evaluated/missing/queued state. Gom cell trùng do clamp/step, không coi81cells=81jobs; không nội suy.
4. Primary page open/sliders chỉ GET/lookup; explicit evaluate grid mới submit job. Objective ΔJ dùng đúng mode/definition và reference baseline; changed user decision tạo sibling draft/intent theo spec.
5. Bound warning/copy theo DR-02, code-fixed/bundle/param hashes theo §6.6/12.4; không thêm before-deploy gate.
**Đầu ra bổ sung:** verifier negative traces, audit reuse/child decision fixtures, grid mapping/objective schemas và no-implicit-compute network tests.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P16-T01` | Pool fixed nhưng selector đã thấy OOS không được strict-pass. |
| `P16-T02` | Per-fold causal boundary được kiểm tra riêng từng fold. |
| `P16-T03` | Corrupt data/metadata dẫn tới integrity failure. |
| `P16-T04` | Reverify không được thay expected digest theo bytes sai. |
| `P16-T05` | Missing/skewed clocks không tạo proof giả. |
| `P16-T06` | Grid9×9 lookup/snap đúng, không nội suy. |
| `P16-T07` | Diagnostic jobs có dedupe và resource budget. |
| `P16-T08` | Changed selection intent tạo attempt/draft mới có lineage. |
| `P16-T09` | Toàn bộ test [S07] được chạy. |
| `P16-T10` | Fake timer advance không làm verify PASS nếu server pending/fail; corrupted artifact giữ expected digest gốc. |
| `P16-T11` | Final-audit plan target bằng frozen selection; no optimize/reselect call, no fold-last default. |
| `P16-T12` | Grid clamped points có canonical mapping và số evaluations đúng unique deterministic configs; sparse cells không giả filled. |
| `P16-T13` | Slider/mount/refresh không spawn jobs; explicit grid compute có idempotency/cost/seed scope. |
| `P16-T14` | ΔJ đúng mode/objective/window; fixed params nằm đúng hash scope; out-of-declaration widen yêu cầu new code version. |

**Exit gate:** Integrity PASS means verified original expected bytes; what-if never changes frozen params; all claim text backed by actual event scope. Diagnostics use QuantBT, not a custom Rust scorer.

**Exit gate bổ sung:** Freeze chứng minh phạm vi integrity/selection đúng; diagnostic không đổi original run. Có source proof cho reuse trước khi dùng làm final audit.

**Debt/rollback:** Không chấp nhận causal proof or rebaseline-on-corruption debt. Rollback diagnostic creation while existing sealed grids remain readable; original run/artifact/claim unchanged.

<a id="phase-p17"></a>
## P17 — Route-aware execution replay
<!-- BEGIN RL-V1.1 PHASE-P17 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P17

**Mục tiêu kiểm chứng:** Replay Delta và bổ sung routes. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Chạy selected/final Delta audit bằng route có meaning chính xác; ledger khi engine có, preserve exits/stops/fees/funding/time. Không ép Delta thành reactive/basket. Supplementary real QuantBT fixtures cho OCO/partial fills/multi-leg absent ở Delta.

**Browser / UI UX:** Play/pause/step/seek/trade deep link, tooltip/candles/position state đồng bộ; same timestamp sequence và fold boundaries. DOM summary ledger vs raw; causal reveal không lộ future outcome trong cursor panel.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P17-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P17-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P17-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Full coverage route matrix vẫn bắt buộc. Delta common-path PASS không thành chứng nhận mọi14routes. Random seek bằng same data như sequential state; browser memory bounded.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P17 -->


**Mục tiêu:** Toàn bộ màn 08 replay đủ chi tiết và nhanh, không chạy lại engine khi người dùng seek. **Phụ thuộc:** P05, P11, P13, P16.

**Backend — to do:** Build route-discriminated summaries, order/fill/trade/position/event tables, seek indexes và bounded checkpoints từ actual evidence. Time/seq paging; preserve source precision/IDs. Build candle/trade windows và derived MAE/MFE only under sufficient input contract. Respect selected/final retention and reactive fold reset; no synthesize history from equity.

**Frontend — to do:** Toàn bộ màn 08 charts/SL-TP/multi-leg panels as applicable; local playback, seek, event/trade virtualization, detail drawers, candle/trace synchronization, state at cursor, source limitations và causal-reveal chỉ là presentation mode (§13.6). Non-applicable controls clearly disabled with reason; no decorative “fills” on route without fill ledger.

**Output:** Screen08, route evidence coverage matrix, replay seek/index schema, sequential-versus-random-seek tests, memory/browser resource results.

**Bổ sung bắt buộc sau review HTML/spec — FND-08/15/16:**

1. Xây transport ordinal trên source event order, preserve original seq/stream/fold; không giả events liên tục hoặc reorder same timestamp tùy ý.
2. Trade deep link resolve original entry/event refs; URL aliases và study/revision context không lệ thuộc tab trước. No source gaps silently synthesized from targets.
3. Reveal behavior kiểm tra tất cả playhead-state panels: future exits/final PnL/MAE-MFE không lẫn current state; retrospective panels có label riêng.
4. Audit child/reused-original source hiển thị đúng; no rerun on seek. Reset-flat folds pause/reset state, không compound thành account khác.
**Đầu ra bổ sung:** noncontiguous/same-time event fixtures, cursor codec integration, reveal DOM/source-order tests và audit provenance labels.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P17-T01` | Event/fill/target routes có đúng semantics, không fake ledger. |
| `P17-T02` | Partial fills/OCO/funding/multi-leg units giữ nguyên source. |
| `P17-T03` | Reset-flat fold segments không bị compounded giả. |
| `P17-T04` | Checkpoint/seek equivalence và gap refusal đúng. |
| `P17-T05` | Sequence scope collisions bị ngăn. |
| `P17-T06` | Long replay giữ DOM/browser/server memory bounded. |
| `P17-T07` | Seek/playback không tạo engine compute job. |
| `P17-T08` | Certificate badges chỉ từ actual evidence. |
| `P17-T09` | Toàn bộ test [S08] được chạy. |
| `P17-T10` | Event seq {10,12,90} playback next/prev đúng existing rows, không fake11; actual missing-record gap vẫn bị phát hiện. |
| `P17-T11` | Same-timestamp signal/order/fill chain giữ source order; thiếu total order không tự tạo causal proof. |
| `P17-T12` | Trade/seq/event_seq deep-link fresh tab và far-seek checkpoint cho state giống sequential reference. |
| `P17-T13` | Reveal ON che future outcomes trong state-at-playhead, không thay certificate hoặc run digest. |
| `P17-T14` | Fold switch và child-audit source giữ đúng capital convention/original IDs; no compute requests khi seek. |

**Exit gate:** Original engine accounting values reconcile; replay factual timeline không vượt evidence. Seeking a late window does not read every part into RAM. Required route panels implemented or actual engine-refusal reason proven; options remain deferred by spec.

**Exit gate bổ sung:** Replay vừa đúng sự kiện vừa đúng presentation time; no prototype data-generation code trên production result path.

**Debt/rollback:** No fabricated ledger or incorrect capital compounding allowed. Extra seek index tuning can continueP23 if hard memory and accuracy gates pass. Rollback reader version; raw immutable financial outputs retained.

<a id="phase-p18"></a>
## P18 — Report, print và export bundle
<!-- BEGIN RL-V1.1 PHASE-P18 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P18

**Mục tiêu kiểm chứng:** Report và export đọc lại. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Assemble report từ same Delta revision; compare metrics/params/build/snapshot/evidence with Hub/Freeze. Export stream rồi parse exported CSV/Parquet/manifest theo schema và reconcile row counts/checksums; worker stopped vẫn đọc được.

**Browser / UI UX:** Shell-free09, print layout/page break, download via auth, interrupted/retry, copy IDs/digests và readonly annotation freshness. Screenshot kiểm không clipping/thất lạc required sections, metric strings có rounding registry.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P18-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P18-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P18-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Export data content checked, không chỉ download event. No engine rerun để in report; browser dev URL trả đúng phase build.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P18 -->


**Mục tiêu:** Screen09 trở thành báo cáo reproducible từ cùng evidence với các màn khác. **Phụ thuộc:** P13, P14, P15, P16, P17.

**Backend — to do:** Report assembly from sealed manifests/projections, exact field definitions, full scope/never-claims và source digests. Export async/bounded jobs when needed; stream CSV/Parquet/archive parts, authorized download, scratch cleanup, manifest listing completeness. No rerun engine for report.

**Frontend — to do:** Shell-free report, print CSS/page breaks/headers, exact copy/passport/fold checks, links to detail/cursor. Show pending export, failure/reauth, file size/checksum. Mutable approval source timestamp distinct from frozen evidence.

**Output:** Screen09, report schema/bundle manifest, print screenshots, bounded export tests and artifact checksums.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/06/08/11/13:**

1. Report manifest công bố selected target, audit reuse/child relation và exact engine/effective inputs; không lấy currently inspected trial vào passport.
2. Numbers/prose dùng metric/warning registry; undefined/partial/selection-input/full-sample có scope. Holdout và approval annotations có source timestamp, không rewrite frozen proof.
3. Re-export là transform/presentation job và không engine rerun; tampered caches/reprint không thay selected/result digests. Print summary retrospective không lẫn playhead-state snapshots.
**Đầu ra bổ sung:** report equality fixtures sau click/verify/re-export/upgrade; audit lineage and metric-edge print fixtures.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P18-T01` | Report và hub/raw metrics/digests khớp. |
| `P18-T02` | Mode5 và selection-adjusted OOS được ghi scope đúng. |
| `P18-T03` | Print downsample chỉ ảnh hưởng display. |
| `P18-T04` | Export có thể đọc sau service restart. |
| `P18-T05` | Abort/disk-full/slow client không gây unbounded buffers. |
| `P18-T06` | Untrusted CSV/filename fields không dẫn tới injection. |
| `P18-T07` | Old engine artifacts vẫn được report đúng. |
| `P18-T08` | Toàn bộ test [S09] được chạy. |
| `P18-T09` | Pick/verify/slider trước khi mở Report không đổi θ, metrics scope hay RC parameter digest. |
| `P18-T10` | Report audit reused-original vs linked-child có source refs đúng và không được gọi optimize lần hai. |
| `P18-T11` | Re-export sau engine-default upgrade giữ historical evidence; only presentation revision đổi có disclosure. |
| `P18-T12` | Undefined metric/holdout-exposure/approval warnings giữ semantic labels cả print và downloadable bundle. |

**Exit gate:** User gets reproducible report without compute process; export doesn't load full dataset/archive in RAM. Không dùng source references point to unsealed/missing files; client authorization enforced for every download.

**Exit gate bổ sung:** Report và evidence screens khớp identity/scope, không chỉ khớp số formatted. Không persist fabricated “clean holdout” annotation.

**Debt/rollback:** A new always-on PDF renderer is not required; browser print meets declared base. Missing mandatory evidence is not waived for prettier report. Rollback render/transform version; never edit archived previous report bytes.

<a id="phase-p19"></a>
## P19 — Attempt lineage, semantic diffs và exposure history
<!-- BEGIN RL-V1.1 PHASE-P19 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P19

**Mục tiêu kiểm chứng:** Lineage từ experiments thật. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Từ Delta base tạo actual fork changed params/seed; repro giữ release/effective spec; injected technical retry không tạo hypothesis mới. DRAFT/abandoned metadata có action thật; final audit/diagnostic có relation đúng. Record authority promotion pick nếu có.

**Browser / UI UX:** Graph/table diff, counters, back navigation, selected attempt vs promotion pick, same-source version links. Rerun vs clone/upgrade có disclosed diff. Không click “GATES RESET” thành execution mutation.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P19-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P19-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P19-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Counts/parents/IDs persist sau restart; changes to research metadata không sửa existing approval. Pinned run outcomes không bị replacement silent.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P19 -->


**Mục tiêu:** màn 10 phản ánh lịch sử nghiên cứu thật, không nhầm retry hạ tầng hoặc che failed attempts. **Phụ thuộc:** P07, P10, P12, P15.

**Backend — to do:** Build explicit parent graph, normalized effective-spec diff, parameter-space signatures, version/attempt lifecycle and publication pointers; scope all edges. Record user-visible partial/holdout exposure when relevant. Classification and claim/metric summaries follow source spec, not self-selected best-return policy.

**Frontend — to do:** Toàn bộ màn 10 tree/table/cards/diff drawer, states/notes/fork links, same-version versus code-version separation, operational retry details secondary. Maintain focus/cursor when expand deep graph; bounded pagination for large histories.

**Output:** màn 10, lineage schema/queries, normalized diff specification, exposure metadata, invariants suite.

**Bổ sung bắt buộc sau review HTML/spec — FND-06/07/08/11/17:**

1. Implement attempt creation/count definitions §5.5; DRAFT trong total khi source yêu cầu, submitted/failed/abandoned/probe/retry breakdown rõ; no counter increment per keystroke.
2. Explicit relations cho primary/audit/diagnostic/reproduction/export; new user decision khác technical execution. Normalized effective diff bao gồm engine/default changes với intent đúng.
3. `promotion_pick` lấy verified source DR-03, không bestSharpe/newest/ACTIVE heuristic. Nếu authoritative source absent, reason và source gap không bịa winner.
4. Version-change chip GATES RESET chỉ disclosure/navigation; không reset/revoke approval. Exposure facts liên quan retained, no workspace blanket policy.
**Đầu ra bổ sung:** counts truth table, child relationship graph fixtures, source-backed promotion pick mapping và non-mutation evidence.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P19-T01` | Worker crash/retry không tăng research-attempt count. |
| `P19-T02` | New seed/space nghiên cứu tạo attempt mới. |
| `P19-T03` | Changed code tạo AlphaVersion mới. |
| `P19-T04` | Cross-workspace parents và graph cycles bị từ chối. |
| `P19-T05` | Abandoned/failed history vẫn tồn tại. |
| `P19-T06` | Concurrent fork/update có kết quả xác định. |
| `P19-T07` | Không tự chọn active/published attempt bằng maximum Sharpe. |
| `P19-T08` | Toàn bộ test [S10] được chạy. |
| `P19-T09` | Draft autosave/worker retry/projection/export không phình research total; submitted/draft counts đúng definition. |
| `P19-T10` | Final audit child và reproduction intent hiển thị quan hệ đúng, không suy từ thời gian/tên. |
| `P19-T11` | Promotion pick absent không được thay maxSharpe; source-backed pick giữ đúng run/version. |
| `P19-T12` | GATES RESET chip/navigation không phát execution mutation hoặc chỉnh approval cũ. |
| `P19-T13` | Clone/upgraded version không xóa exposure history; unauthorized lineage/exposure info không leak. |

**Exit gate:** Counts/edges survive restarts and storage GC; original failed/partial runs not silently excluded. Metrics lineage to exact run/revision/engine remains intact.

**Exit gate bổ sung:** Lineage thật theo nguồn và lifecycle, không có policy promotion do agent sáng tác. Counter meaning và display copy được reviewer kiểm chứng.

**Debt/rollback:** Statistical inference of independent trial count is not invented. Extra graph layout polish may tune without changing facts; required interactions/copy still pass. Rollback projection/UI only, don't delete branches/attempt records.

<a id="phase-p20"></a>
## P20 — Compare modes và derived correlation
<!-- BEGIN RL-V1.1 PHASE-P20 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P20

**Mục tiêu kiểm chứng:** Compare hai Delta kết quả thật. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Dùng hai attempts cùng alpha có configs khác; matched return window, actual metric delta/correlation independently checked. Reuse real run pair; thêm different-market/mismatch cases theo spec. Không chọn cặp theo correlation mong muốn.

**Browser / UI UX:** Attempts/markets/pair unions, refuse mismatched key without hidden metrics DOM, switch window/legend/tooltip; mode5 không thành OOS; zero overlap/zero variance có reason.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P20-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P20-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P20-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Compare đúng definition/common window và original values remain separate. Không cross-alpha hoặc portfolio/pair promotion; UI thể hiện đủ contract.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P20 -->


**Mục tiêu:** Toàn bộ màn 13 compares within one alpha, correct comparability, no new portfolio/governance semantics. **Phụ thuộc:** P13, P15, P18, P19.

**Backend — to do:** Three-mode union; server contract-key guard, claim-rank map, intentional config diffs, period/scope comparability disclosures. Compute aligned-return correlation from sufficient raw with versioned formula/missing policy; persist projection. Deterministic trajectory text from facts; no opaque generated judgment. Return refusal without unauthorized/mismatched metrics.

**Frontend — to do:** Attempts ladder, markets small multiples, pair overlay≤2 with distinct colors, delta table and clearly scoped weaker-claim note; URL state and deep links; correction copy for Portal-derived correlation.

**Output:** Screen13, comparability contracts, aligned-return test vectors, correlation source metadata and screenshots per mode/mismatch.

**Bổ sung bắt buộc sau review HTML/spec — FND-02/13/17:**

1. Common-window metrics nếu tính mới có definition/data-role riêng, không override original-run values; intentional configuration differences được disclose.
2. Inspection/ladders/sort không trở thành promotion pick. Categorical/missing/zero-variance series xử lý registry, no forward-fill/ordinal giả.
3. Same-alpha/contract-key guard và engine mode scope giữ nguyên; no pair artifact/promotion/reset side effects.
**Đầu ra bổ sung:** same metric name/different scope fixtures, comparison non-mutation traces và zero-overlap/undefined vectors.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P20-T01` | Same-alpha restriction được enforce ở server. |
| `P20-T02` | Mismatch pair không render hidden chart/metrics sau refusal. |
| `P20-T03` | Different market keys dùng small multiples, không overlay. |
| `P20-T04` | Claim rank đứng trước metric như spec. |
| `P20-T05` | Common-window/zero-variance/missing-return cases đúng. |
| `P20-T06` | Correlation đối chiếu independent numeric reference từ raw returns. |
| `P20-T07` | Compare không phát sinh execution publish/pair-promotion command. |
| `P20-T08` | Toàn bộ test [S13] được chạy. |
| `P20-T09` | Changing compare order/rank/inspection không đổi selected/promotion/RC mapping. |
| `P20-T10` | Full-sample run không được truyền vào slot OOS without scope; common-window deltas có same definition/window. |
| `P20-T11` | Zero variance/no overlap/categorical proxy case không thành0 hoặc fake correlation. |
| `P20-T12` | Pair refusal/selection không tạo job optimize, approval hoặc deployment command. |

**Exit gate:** All pair numbers same defined comparison window or clearly disclosed scope; no correlation0 placeholder; no invented pair RC. Query result bounded and cache isolated by visibility.

**Exit gate bổ sung:** Compare đúng phạm vi source và numerical meaning; display ranking không tăng quyền hay invent research selection.

**Debt/rollback:** Cross-alpha and exports stay outside this screen scope. Cannot defer derived correlation when raw/spec need it. Rollback projection version/cache; no engine reruns or evidence mutation.

<a id="phase-p21"></a>
## P21 — Release Candidate composer và immutable evidence pack
<!-- BEGIN RL-V1.1 PHASE-P21 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P21

**Mục tiêu kiểm chứng:** RC từ final audit Delta. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Build real Delta RC17fields/12 items từ persisted bound source. Verify final audit reuse/linked identity; canonical params may not have trial. Pin evidence; missing required blocks, degraded chỉ theo spec. Prepared data local acceptable only permissions granted.

**Browser / UI UX:** Full composer/screens11, declarations, draft revision conflict, full digest copy, mandatory missing states và downstream scope disclosure. Inspection elsewhere không đổi frozen RC. Không cần upstream mutation ở P21.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P21-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P21-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P21-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Evidence pack source mapping đầy đủ; UI không nói execution verified pack. Nếu selected audit/issued claim chưa đủ, BLOCKED không synthesize cert để finish phase.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P21 -->


**Mục tiêu:** Screen11 tạo đầy đủ RC theo redesign trước khi gửi existing gate, không giảm pack thành params hash. **Phụ thuộc:** P07, P16, P17, P18, P19.

**Backend — to do:** Assemble17 fields và12 items từ exact run/alpha/version/data/engine/revision. Draft CAS cho known limitations/proposed restrictions; validate inputs, item statuses and correct ACTIVE/scratch eligibility. Store sealed manifest/digests separate from delivery/approval state; retention-pin toàn bộ required refs. Keep alias mapping and legacy summary pin inspectable.

**Frontend — to do:** Toàn bộ màn 11 composer/evidence checklist/passport/digest copy/inputs, missing/degraded states, UNSET deployment fields, invalid/stale draft reasons. Preview exact publication subject/evidence run without inventing policy; read-only placeholder mirror only when source absent with label, not fake approval.

**Output:** RC schema, pack builder/validator, draft APIs, retention pinning, full screen11 composer screenshots, source mapping17×12.

**Bổ sung bắt buộc sau review HTML/spec — FND-08/09/17/19:**

1. Compose từ exact selection target; validate final audit reuse/child evidence không mutable. Centroid/per-fold target không requiring invented trial ID/global θ.
2. Những fields engine/build/data/config/fixed-param identities pin đủ theo source; giữ riêng legacy-selected hash và RC full pack. Không backfill missing required evidence bằng new best run.
3. RC draft input concurrency bảo toàn declarations; local seal/delivery/approval state tách. Không chạy optimizer khi compose/publish.
4. Promotion pick/current active version chỉ đọc semantics đã kiểm chứng; không đổi bound version hoặc thêm eligibility rule ngoài source. Integrity failure báo riêng, không revoke prior approval.
**Đầu ra bổ sung:** audit-target-to-RC trace, hash scope fixtures, local-seal-vs-delivery states và no-compute composer checks.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P21-T01` | Mọi17fields đều có actual source. |
| `P21-T02` | Thiếu một mandatory evidence item phải block publish. |
| `P21-T03` | DEGRADED hợp lệ theo spec không bị tự thêm policy cấm. |
| `P21-T04` | Scratch/DRAFT eligibility giữ đúng contract. |
| `P21-T05` | Concurrent draft updates không ghi đè declaration. |
| `P21-T06` | Corrupt referenced part bị phát hiện. |
| `P21-T07` | Receipt/mirror không tạo circular mutable digest. |
| `P21-T08` | Changed code/data/params không mutate RC frozen. |
| `P21-T09` | Các test composer/evidence pack [S11] được chạy. |
| `P21-T10` | RC selected artifact/dataset/engine == final audit target; mismatched child/reused evidence bị block đúng reason. |
| `P21-T11` | Centroid/per-fold provenance đầy đủ dù no selected trial number; no fold-last substitution. |
| `P21-T12` | Compose/publish không gọi optimizer hoặc change θ; existing valid selectedNone không fake publishable. |
| `P21-T13` | Local sealed pack chưa ACK không hiện delivered/approved; fixed-param changes alter appropriate bundle identity. |
| `P21-T14` | Integrity warning không modify actual approval state hoặc execution runtime. |

**Exit gate:** RC manifest immutable and full evidence references accessible under authorization; contents agree with Report/Freeze. Distinguish Research full pack from downstream pin scope visibly. No execution writes beyond allowed later publication command.

**Exit gate bổ sung:** 17fields/12items không chỉ populated mà đúng relationships. Full pack sealed không đồng nghĩa downstream đã pin tất cả; vẫn giữ scope disclosure.

**Debt/rollback:** No missing field hidden as waiver; no invented gate. Rollback composer command feature, retain sealed releases and pins; drafts may migrate additively under revision validation.

<a id="phase-p22"></a>
## P22 — Publication và approval mirror tương thích execution hiện hành
<!-- BEGIN RL-V1.1 PHASE-P22 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P22

**Mục tiêu kiểm chứng:** Publish Delta qua execution contract nguyên trạng. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Real final Delta run seeded via facade, frozen summary, actual strict request→existing governance in isolated authorized test instance. Record true actor, subject/run/pins, receipt; retry/timeouts/source conflict bằng permitted harness. Không credentials/live funds required; không gọi deployment commands.

**Browser / UI UX:** Browser publish→actual ACK→mirror/detail navigation; conditions/raw enum/stale/retry exactly source. Keep R2 existing navigation only; no new approve/reject handler. Network write allowlist excludes production endpoints.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P22-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P22-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P22-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Unchanged execution code/schema/config baseline; actual receipt not demo payload; one effect per intent. Upstream unavailable is BLOCKED for real integration, not paper/mainnet bypass.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P22 -->


**Mục tiêu:** Connect màn 11 hoàn chỉnh to existing R1/R2/read surfaces without modifying execution implementation. **Phụ thuộc:** P02, P10, P21.

**Backend — to do:**
1. Implement publication intent/request/receipt using exact P02 schemas and existing actor authorization. Confirm legacy terminal summary immutable, read model seeded and alpha mapping matches.
2. Hash/oracle validation; strict create request; store local RC→run→approval linkage and actual evidence-set hash. No extra fields to downstream payload.
3. Idempotency/conflict/timeout/unknown/reauth/reconciliation; don't assume ack equals applied beyond source semantics. No leaked credentials in outbox.
4. Read-only mirror states/SLA/expiry/conditions/as-of. Existing R2 links only; do not implement alternate R2 mutations. Forward links only from identifiers actually returned.
5. Keep source code/fixtures/schema protected; verify byte/diff manifest and run full existing relevant regressions.

**Frontend — to do:** Publish confirmation/loading, real receipt navigation, unknown delivery/incompatibility/retry, raw/translated status mapping, conditions/SLA from source, stale state. No inline approval authority and no automatic Paper start.

**Output:** End-to-end publication traces, golden actual-shaped requests/responses, hash evidence, receipts/recovery runbook, completed11 screenshots in every supported source state.

**Bổ sung bắt buộc sau review HTML/spec — FND-08/17/19:**

1. Final-audit child khi cần downstream run ID phải được register/seed bằng existing facade-compatible path, không tạo local-only run rồi giả governance đã biết.
2. Reconcile actual subject/run/claim/hash mapping; no shortcut attach approval cùng alpha mà khác evidence. Publication actor và request key giữ existing auth contract.
3. Source promotion pick/gate reset/integrity phản ánh readonly; mutation chỉ exact publish interface. Source approval vẫn nguyên khi Research warning thay đổi.
4. Unknown delivery/reauth/retry không tự APPROVED hoặc tạo repeated approval; existing uniqueness conflict không cho agent sửa consumer/schema.
**Đầu ra bổ sung:** child-audit registration fixture, approval-pin scope evidence và readonly warning/reset regression.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P22-T01` | Create202→freeze→publish→existing R1 dùng actual compatible path. |
| `P22-T02` | Payload extra fields bị strict-schema refusal. |
| `P22-T03` | Claims/alias/hash mismatch được phát hiện trước false success. |
| `P22-T04` | Concurrent duplicate publish tạo một approval phù hợp. |
| `P22-T05` | Timeout trước/sau downstream commit được reconcile đúng. |
| `P22-T06` | Open-approval conflict chỉ attach đúng subject/run/pin. |
| `P22-T07` | Expired session không bị bypass bằng impersonation. |
| `P22-T08` | Approval raw statuses và RC superseded được tách rõ. |
| `P22-T09` | Existing execution regression/protected hashes không đổi. |
| `P22-T10` | Toàn bộ remaining [S11] handoff/mirror tests được chạy. |
| `P22-T11` | Linked final-audit run seed/refresh/publish thành công qua unchanged facade; local-only ID bị phát hiện trước false success. |
| `P22-T12` | Approval cùng alpha nhưng khác target evidence không bị attach lại; full RC hash khác legacy hash được giữ rõ. |
| `P22-T13` | GATES RESET/supersede/integrity warning không gửi revoke/reset/stop/flatten commands. |
| `P22-T14` | Session expiry/unknown outcome recovery giữ original actor/payload; no service-account impersonation. |

**Exit gate:** Real authorized integration in isolated/demo environment uses unchanged existing execution/governance code; full localpack correct; UI never overstates downstream verification. Unresolvable existing-contract gap is BLOCKED with exact evidence, not a change request silently implemented in execution.

**Exit gate bổ sung:** Handoff thật tương thích exact target evidence và auth; no execution diff. Source states và Research diagnostic states không bị gộp.

**Debt/rollback:** No publication correctness/auth/hash debt permitted. Rollback disable new publish intake, retain durable receipts and allow authorized reconciliation; don't revoke existing approvals or manipulate deployment.

<a id="phase-p23"></a>
## P23 — Resource, security, recovery và version-upgrade certification
<!-- BEGIN RL-V1.1 PHASE-P23 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P23

**Mục tiêu kiểm chứng:** 20 users,5 GB và upgrade với Delta. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Real Delta heavy slot + queued intents, read/report/export/replay mixed load; overall5GB budget includes all research services/pagecache. Run cold/warm separately, fault/restore/scaling, new engine build only authorized. Reader results reconcile refs after restart/upgrade.

**Browser / UI UX:** At most allowed browser workers; simulate20contexts/users via authorized load runner and report client cost separately. Full key journeys new build; no identity reuse masquerading20users. Live dev host smoke after staging activation.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P23-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P23-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P23-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Memory/disk/latency/security and data/DOM matches all pass; build/test peak reported separately không lẩn tránh host quota. Never drop_caches/restart shared bobby services.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P23 -->


**Mục tiêu:** Chứng minh toàn Research hoạt động trong5 GB với tải nhiều user, failure cases và upgrade, không chỉ pass unit tests. **Phụ thuộc:** P11–P22.

**Backend/hạ tầng — to do:** Run workload matrix §16 trên hardware/inventory rõ; aggregate memory cap5,000,000,000bytes, measured disk/I/O/FD/CPU and queues; repeat at8 GB only optional capacity result. Include DB/queue/storage/query/export/pagecache, not just worker. Tune batch/index/concurrency within correctness invariants. Test backup+restore DB/artifact coherence and single-node loss recovery. Test engine additive fields/new build in isolated canary workers for research only, historical readers unchanged.

**Frontend — to do:** Simulate20 authenticated users across library/progress/search/replay/report/RC reads while jobs queued; measure interactive latency and browser memory/DOM. Exercise all responsive/a11y/deeplink states; execution smoke/visual regression unchanged.

**Output:** Raw benchmark samples, cgroup/resource graphs/data, query plans, workload manifests, security/fault reports, restore timestamps/checksums, upgrade diff and residual debt list.

**Bổ sung bắt buộc sau review HTML/spec — FND-05/06/08/11/14/15/18/20:**

1. Mixed-load gồm inspection-only sessions, one heavy primary, queued audit/what-if/export và bounded verify; measure aggregate memory/disk và user-interactive paths, không bỏ utility jobs khỏi cap.
2. Stress repeated click/mount/cursor/slider/back-forward chứng minh không engine recompute/unbounded buffers. Grid duplicate points và same authorized cache key không nhân work; khác stochastic seed vẫn separate.
3. Upgrade regression có canonical optimizer/default intent, new route informational/integration-gap, historical report/centroid/per-fold artifacts và source consumers unchanged.
4. Restore giữ exposure/selection/child-run/receipt/index relationships; no re-seal hoặc rewrite expected digest sau recovery. Synthetic scale chỉ test storage, không financial certification.
**Đầu ra bổ sung:** workload resource attribution theo action/job-kind, cross-version intent report, restore relationship checks và complete matrix statuses.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P23-T01` | Mixed load20users trong aggregate5GB. |
| `P23-T02` | Repeated jobs không tăng memory vô hạn sau warmup. |
| `P23-T03` | Disk high-water/full có behavior bounded. |
| `P23-T04` | Process/DB/NATS outages được recovery. |
| `P23-T05` | IDOR/cache/files/exports tenant isolation. |
| `P23-T06` | Corrupt part và restore có hash verification. |
| `P23-T07` | Engine upgrade/default rollback/in-flight pinning đúng. |
| `P23-T08` | Cold-cache measurement không ảnh hưởng shared execution host. |
| `P23-T09` | Research load không thay execution behavior hoặc quyền. |
| `P23-T10` | Toàn bộ required regression suites chạy và có raw results. |
| `P23-T11` | 20users inspection/slider/far-seek đồng thời không tạo implicit heavy jobs; aggregate5GB vẫn đo đúng. |
| `P23-T12` | Audit/what-if/verify/export cạnh primary đều qua quotas/backpressure; no API-process bypass. |
| `P23-T13` | Upgrade new route/default không auto-enable unsupported mapper hoặc làm reproduce đổi semantics. |
| `P23-T14` | Restore/GC giữ exposure, final-audit child target, selection/null-trial và publication source pins. |
| `P23-T15` | Browser reveal/cursor/deep-link tests pass cùng cold-cache workload; no future-state or cross-run leakage. |

**Exit gate:** §16 thresholds met or owner-approved updated targets based on evidence **without relaxing5 GB correctness/scope cap**. Zero hidden swap/tmpfs escape, false completion, duplicate approval or cross-tenant leak. Restore proves every published referenced artifact is present/verified; runtime target unknown cannot be marked certified.

**Exit gate bổ sung:** Resource/correctness/upgrade gates chứng minh các tương tác mới chứ không chỉ batch backtest. No hidden scope cuts to meet5GB.

**Debt/rollback:** Only documented non-critical optimization debt with measured bound and owner allowed; no P0/P1 correctness/security/durability/execution compatibility debt. Rollback applies Research versions/concurrency only, not execution config or approvals.

<a id="phase-p24"></a>
## P24 — Full acceptance, handoff và release rehearsal
<!-- BEGIN RL-V1.1 PHASE-P24 -->
### V1.1 — Delta RSI / Browser / Exit gate bổ sung cho P24

**Mục tiêu kiểm chứng:** Owner reproducible final walkthrough. Áp dụng [§23](#v11-delta) và [§24](#v11-browser); phần dưới **bổ sung**, không thay test/exit gate/FND/COR/DR vốn có.

**Delta RSI / dữ liệu:** Replay mandatory Delta sequence source→import/bind→real snapshot→run/tune→evidence→final audit→RC→existing approval. Reuse exact compatible artifacts for views; new execution only stages needing activity. Aggregate numeric diffs, route supplements,307original phase-tests/source/scenario results without inflated counts.

**Browser / UI UX:** Run browser suite against rebuilt committed artifact and dev hostname; all15screens fields/actions/screenshot references/print/deep links; Bobby can reproduce exact commit, inputs, commands. Network and artifact IDs linked.

| Test bổ sung | Evidence bắt buộc |
|---|---|
| `V11-P24-DR` | Thực hiện phần Delta/dữ liệu ở trên; ghi source/build/config/snapshot IDs, actual outcome và numerical diff khi có compute. |
| `V11-P24-BR` | Thực hiện browser/visual/action checks phù hợp phase; ghi lane, URL/build SHA, screenshots/trace và field/action assertions. P01–P06 chưa có màn mới không được gọi discovery/harness là full UI acceptance. |
| `V11-P24-GX` | Protected-source hash, no-debt check, phase report, resource/permission boundaries và rebuild/deploy receipt khi UI gate áp dụng. |

**Exit gate V1.1:** Zero unresolved in-scope debt, zero failed/skipped-required tests; PR12 P23–P24 requests Bobby; no self-merge or production activation. Owner build/review is not claimed until actual receipt.

**Báo cáo:** ghi riêng `delta-real-data`, `direct-vs-portal`, `persistence-vs-api`, `api-vs-ui`, `visual-fixture`, `browser-real`, `dev-host-review`; không gộp mock PASS vào real PASS. Nộp report trước khi đổi trạng thái phase. Handoff sau mỗi cặp phase theo `CLAUDE.md`, không tự sửa execution để đóng gate.
<!-- END RL-V1.1 PHASE-P24 -->


**Mục tiêu:** Bàn giao một Research Loop hoàn chỉnh và có thể kiểm toán, không chỉ collection of screens. **Phụ thuộc:** P23.

**To do backend–frontend:**
1. Execute real-strategy journeys: import/bind→preflight→run→progress→all evidence details→report→lineage/compare→RC→R1 hiện có mirror; include scratch/nonpublishable and failed/retry journey. Use approved real data/alphas discovered inP01, not only synthetic smoke strategies.
2. Run every source test ID from15 màn with correction ledger; full URLs/cursor/print/responsive/accessibility; verify figures across screens by revision and raw artifact refs.
3. Verify protected hashes, database privileges, old client/old run compatibility, engine provenance and resource budget. Close gap/debt register with evidence links, not “not applicable” without proof.
4. Rehearse Research-only rollout/drain/rollback on isolated environment; no production/mainnet/canary writes implied. Owner determines deployment timing and permissions separately.
5. Deliver runbooks, migrations, schema/API docs, fixtures, dashboards/config within budget, backup/restore evidence and one-page operating checklist.

**Output:** `V1_ACCEPTANCE.md`, source-test coverage matrix, 24 phase reports, runnable test commands, actual versions/hashes, deployment+rollback checklist, list of intentionally out-of-scope items and remaining owner-approved debt.

**Bổ sung bắt buộc sau review HTML/spec — FND-01–20:**

1. Chạy lại scenario matrix §16.6 bằng real approved alpha/data phù hợp và typed technical fixtures cho edge cases; scenario unsupported bởi actual capability phải có reason và source/owner-scoped disposition, không mislabeled PASS.
2. Reconcile original source tests + new phase tests + field/action/scenario matrices; các COR có exact copy/screenshot exceptions. Production UI không mock fallback/prototype mutation.
3. Verify lineage xuyên nonselected-pick→Freeze→Report→RC; canonical config→effective worker; final-audit reuse/child→actual downstream pin; holdout/exposure and promotion authority boundaries.
4. Báo cáo DR decisions có evidence và unresolved items; required gaps không được xóa denominator. Kết luận “24phase complete” chỉ khi mọi mandatory gate thực sự đạt.
**Đầu ra bổ sung:** consolidated FND/COR/DR closure report, three populated matrices, scenario raw traces và source-inspected-vs-browser-verified coverage.

**Tests bắt buộc:**

| Test ID | Điều cần kiểm chứng |
|---|---|
| `P24-T01` | Bound real-alpha journey đầy đủ từ import đến report/RC. |
| `P24-T02` | Scratch giữ nonpublishable sau mọi thao tác. |
| `P24-T03` | Worker retry vẫn cùng research attempt. |
| `P24-T04` | Future-data/selection claim evidence đúng. |
| `P24-T05` | Historical run đọc đúng sau engine upgrade. |
| `P24-T06` | Full Research RC map đúng existing approval. |
| `P24-T07` | Restore rồi browse được khi workers tắt. |
| `P24-T08` | Protected execution implementation/schema unchanged. |
| `P24-T09` | Toàn bộ15 screens visual/interaction/accessibility đạt spec. |
| `P24-T10` | 5GB mixed-load evidence có thể truy lại theo source/build/workload. |
| `P24-T11` | Từng FND-01–20 có implementation/test/evidence hoặc explicit unresolved disposition; no orphan finding. |
| `P24-T12` | Tất cả scenario §16.6 có actual result, input refs và forbidden-side-effect checks. |
| `P24-T13` | 15screens field/action coverage tách mapped/integrated/browser/resource; no one-row-per-screen substitute. |
| `P24-T14` | Protected execution unchanged và no unauthorized holdout/promotion/reset mutations qua toàn journey. |
| `P24-T15` | Guide/source test exceptions chỉ COR đã ghi, không rewrite golden fixtures để che regression. |

**Exit gate:** All mandatory phases/tests pass with artifacts. “Implemented”, “tested” and “deployed” reported separately. Missing required route/evidence/integration/data test prevents full acceptance, but completed independent work still reported accurately. No live funds/keys required merely to accept Research functionality; no simulated live certification presented as real.

**Exit gate bổ sung:** Không nhận hoàn thành chỉ từ số phase/test cases. Owner nhận evidence đầy đủ các decisions, correctness, resource bounds và compatibility; unresolved required scope được báo chính xác.

**Debt/rollback:** Outstanding permitted debt has owner, severity, measured impact, due phase/date or next version and workaround. Rollback runbook tested: pause intake, drain/mark recoverable jobs, keep schema readers and artifact refs, switch Research version, reconcile outbox/receipts. Never delete history or reset execution gates as rollback.

**Lưu ý debt/phạm vi sau review:** Không thêm phase25 để đẩy findings ra ngoài V1. Carryover chỉ noncritical debt đã được owner cho phép, không core domain/authority gaps.

<a id="part-v"></a>
# V. NGHIỆM THU, TECHNICAL DEBT, VẬN HÀNH VÀ BÀN GIAO

## 16. Test strategy và workload chuẩn

### 16.1. Tầng test

**Schema/contract tests:** typed schemas TS/Python/Rust, JSON/Parquet versions, existing execution request/response/digest fixtures. Test optional additions, required-field refusal, enum expansion, temporal precision và authority boundaries.

**Domain tests:** strategy/engine route semantics, data access, warmup, fee/funding/sizing units, raw-best/selected differences, objective/method scope, replay retention. Dùng QuantBT làm accounting oracle; không viết một simulator mới để “đối chiếu” rồi cho cả hai cùng sai.

**Storage/recovery tests:** append/dedup/seal/commit, part schema evolution, orphan cleanup, corruption detection, backup/restore và ready state consistency. Test thành công cả khi workers bị tắt.

**Frontend tests:** every original T case, interaction/cursor, typed error states, responsive/a11y, screenshots với font/chart thật. Unit fixtures không thay browser E2E real API.

**Performance/security/integration tests:** aggregate5 GB, concurrentusers, bounded IO/cache, tenant isolation, worker sandbox và execution unchanged. Tất cả outputs ghi version/hash/input manifest.

### 16.2. Workload matrix bắt buộc

Các kích thước sau là **profile đề xuất để agent hiện thực và ghi số đo**, không phải tuyên bố server/strategy nào hiện đã đạt. P01/P04 có thể thêm profile theo dữ liệu thật; không được thay toàn bộ bằng ví dụ10bars rồi gọi tối ưu.

| ID | Workload | Mục đích / gate |
|---|---|---|
| W00 | Technical fixture 2k–5k bars, deterministic signal + event/partial-fill fixture | Fast correctness, contract mapping, no financial-performance claim |
| W01 | Ít nhất một alpha thật được phép, data thật snapshot, 2–3 tham số có ý nghĩa, khoảng50 trials nếu phù hợp strategy | Integration/stability smoke có domain thực; không bóp space thành một chiều để tạo số đẹp |
| W02 | WFO actual valid mode/schedule, nhiều outer folds; profile20–40 folds bằng data thật khi có | Split/ledger/selection scope và windowing, budgeted trials không mặc định nhiều giờ sweep |
| W03 | Reactive/event strategy thật hoặc approved source fixture có state/fill dependencies, final audit | Runtime/retention/route correctness; no vectorization rewrite of semantics |
| W04 | Portfolio/package supported scenario, timestamp mismatch/missing observation/units variants | Multi-symbol input and artifact schema; unsupported variant fails with reason |
| W05 | Storage-only generated ledger: 100k trials/evaluation rows và 1M replay rows ban đầu, scale thêm khi có budget | Pagination/spill/storage memory; **synthetic scale test**, không evidence alpha/claim |
| W06 | 20 người dùng đã xác thực: library/report/search/replay/status reads; ≥4heavy intents queued, 1heavy active ở5 GB | Fair queue, read reserve, total memory/latency |
| W07 | Slow export client + long replay seek + active compute + projection | Backpressure/scratch/connection limits; no global browser/full file copies |
| W08 | Repeated complete/fail/cancel job cycles trên cùng services | RSS/native/FD growth và scratch leaks, cache eviction ổn định |
| W09 | Crash/storage faults/DB-NATS interruption + restore + historical read | Durability, integrity, exactly-one visible effect and rollback |
| W10 | Engine additive-field fixture + validated newer build khi available; old artifacts giữ nguyên | Upgrade ready/read compatibility, no auto-switch in-flight jobs |

Mỗi required route/mode có technical test nhỏ để giữ runtime test hợp lý; không bắt toàn bộ Cartesian product chạy hàng nghìn trials trong mỗi commit. Chọn coverage có thiết kế, log skipped expensive dimensions và chạy focused regression khi module liên quan đổi. Real-alpha acceptance không được thay bằng synthetic fixture; nếu nguồn thật chưa truy cập được, kết quả đó phải để NOT_RUN và gate liên quan chưa được cấp.

### 16.3. Ngân sách và SLO khởi điểm để nghiệm thu

| Chỉ tiêu | Target thiết kế | Cách đo / lưu ý |
|---|---|---|
| Tổng Research memory | ≤5.000.000.000bytes ở base profile | Aggregate scoped cgroup/measurement bao gồm page cache/hạ tầng; không dùng `5G` unit mơ hồ để được nhiều hơn |
| Extended capacity | ≤8.000.000.000bytes | Profile mở rộng tùy chọn, không thay base5 GB |
| Heavy compute đồng thời | Base1; extended tối đa2 khi measured-fit | Không mặc định20workers cho20 người dùng |
| List/summary API | p95≤500ms warm, ≤1.500ms cold trên W06 | Payload bounded; auth/DB/query included; record hardware/concurrency |
| Trial page/filter | p95≤750ms warm; ≤2s cold | Index source/revision exact, no full pandas load |
| Replay seek window | p95≤1s warm; ≤2s cold | Window đã nêu trong spec, không tính strategy rerun |
| Progress freshness | p95≤2s khi connected; fallback poll5s | Đo event source→browser, không timestamp bịa |
| Library refresh | Poll10s khi running/visible | Không polling toàn bộ historical artifacts |
| API buffers/caches | Có byte cap và measured peak per component | Response pages bounded, stream has backpressure |
| Memory growth sau cycles | Không có growth không giới hạn; post-warm plateau trong budget | Record time-series RSS/PSS/cgroup + cache bytes; không lấy một snapshot cuối |
| Disk/scratch | Không vượt quota/reservation; không leak orphan active state | Include export/compaction overlap; test highwater/full |
| Correctness/security | 0 false success, stale-worker commit, unauthorized read/write, fabricated evidence | Hard gate, không đổi sang “best effort” để passlatency |
| Source protection | 0 unauthorized execution/protected strategy diff | Hash manifest + semantic/test regression |

Các latency target là đề xuất kỹ thuật, chưa đo. P23 có thể trình owner một target điều chỉnh có evidence/hardware scope; **không được tự relax correctness, đầy đủ UI hoặc giới hạn RAM để báo đạt**. Phải tách queue wait, compute time, seal/projection time và API/render time; không gọi tất cả là “backtest time”.

Cold-cache test dùng isolated dataset/instance/cache scope được phép, không drop host caches gây ảnh hưởng execution. Native JIT/import startup report riêng với warm execution. Không khẳng định speedup nếu khác dataset/seed/profile/retention/hardware.

### 16.4. Fault-injection matrix

| Điểm gây lỗi | Expected behavior |
|---|---|
| Trước durable run insert | Không run, submit có thể retry cùng intent |
| Sau durable insert trước enqueue ACK | Outbox replay; không tạo run thứ hai |
| Worker chết đang ghi part | Partial part không visible; retry worker attempt mới, same research intent |
| Lease hết nhưng worker cũ vẫn chạy | Late commit bị fencing reject; files orphan xử lý sau |
| Sau fsync part trước SQL reference | Orphan reconcile; chưa báo complete |
| Sau SQL reference nhưng part mất/corrupt | Integrity failure; không release/publish dựa file đó |
| DB/NATS restart | Jobs/revisions được recover, UI source-stale/queued hợp lý |
| Disk full trước seal | Explicit failure/paused state; không fallback unboundedRAM |
| SSE reconnect gap | Snapshot+resume, no duplicate terminal transition |
| Publish timeout sau downstream commit | Reconcile existing idempotent request, không approval duplicate |
| Expired actor session trước retry | Await authorized retry, không impersonate |
| Cache/transform bug | Invalidate/rebuild projection, preserve original evidence |
| Backup restore thiếu artifact | Restore chưa đạt; đừng mark run READY vì DB row tồn tại |
| Research service mất hoàn toàn | Execution runtime/gates không bị Research tự sửa/dừng; read UI degraded đúng source |

### 16.5. Numerical và evidence test policy

ID/hash/row counts/timestamps/sequence/order/categorical semantics so exact khi contract yêu cầu. Floating values dùng tolerance theo engine parity contract hoặc explicit tolerance justified trong test; không một `rtol=1e-2` global để che lỗi. Bitwise reproduction không hứa cho unseeded/khác runtime path nếu engine không chứng nhận; vẫn phải giữ provenance/semantics và đọc đúng retained output.

Hash identity canonicalization và numerical approximation là hai việc khác nhau. Downstream pin phải match exact algorithm; không “gần bằng” hash. Derived formula tests dùng reference implementation nhỏ trên immutable returns/trades, không reimplement accounting/market fills. Compare raw-source values với display rounding hai bước riêng.

<a id="domain-scenarios"></a>
### 16.6. Scenario xuyên màn — bổ sung sau review, không thay thế source tests

Mỗi scenario cần input manifest/route/mode/profile/seed, actor/workspace, exact steps, source IDs, expected state/value/digest, network side-effect assertions và actual result. Kịch bản numeric dùng tolerance phù hợp source field; ID/digest/payload/state so exact. `NOT_RUN`, `BLOCKED`, `NOT_APPLICABLE` không cộng vào PASS; N/A cần actual capability/spec basis. Các prerequisite có thể dùng isolated fixtures sớm, nhưng cuối kỳ phải có real-alpha integration phù hợp (§16.2), không đổi fixture thành bằng chứng research efficacy.

| ID | Tiền đề và thao tác | Assertion bắt buộc / điều cấm | Phase chạy trước / chạy lại |
|---|---|---|---|
| SC-01 |06 click trial khác θ*→07→09→11→back | Inspector/cursor đổi, selection artifact/params/RC không đổi; no mutation request | P09,P13,P15,P16,P21 / P24 |
| SC-02 |14 parse+gates PASS→sửa source bytes→register bằng receipt cũ | Receipt stale bị từ chối; mirror readonly; source mới cần validate/digest mới | P07 / P24 |
| SC-03 |02 narrow/pin trong declaration, rồi thử widen ngoài;06/07 dùng widen link | Within-bound new intent cùng version; outside-bound cần source/version mới; không sửa run cũ | P07,P08,P10,P15,P16 / P24 |
| SC-04 |02 sửa main trials/seed và advanced cùng field; POST crafted conflict | UI canonical value đồng bộ; server reject aliases trái nhau; preview==POST==effective worker semantics | P02,P04,P08,P10 / P24 |
| SC-05 |02 mode/schedule với studies/folds/seeds khác; early stop/prune→03→06 | Budget có applies_to, actual counters đúng; không universal folds×trials, selected flag không đổi denominator | P04,P06,P08,P11,P15 / P23,P24 |
| SC-06 |01/10 clone run cũ: reproduce và experiment trên release mới→02→09 | Reproduce pin effective old values; upgrade có disclosed diff; old artifacts không relabel | P04,P08,P10,P18,P19 / P23,P24 |
| SC-07 |Autosave draft nhiều lần→double submit→worker crash/retry→01/10 | Một persisted attempt/intent; technical retry separate; total/draft/submitted/job counts theo definition | P03,P06,P10,P12,P19 / P24 |
| SC-08 |Engine selected=None hợp lệ→06/07/09/11 | Research output vẫn trung thực; no best fallback; RC lacking selection có đúng reason, không fake corruption | P04,P15,P16,P21 / P24 |
| SC-09 |Centroid không trùng trial hoặc per-fold sequence→06→07→08→11 | Params/artifact hợp lệ; null trial/ref đúng; no invented trial/global θ/fold-last substitution | P03,P04,P15,P16,P17,P21 / P24 |
| SC-10 |Audit reuse case và missing-retention cần linked audit child→publish | Reuse checklist proof; child target pinned, no optimizer call; evidence_run_id registered qua existing path | P04,P06,P16,P17,P21,P22 / P24 |
| SC-11 |05 mở sealed card khi chưa tìm thấy authorized unlock source | Chỉ metadata/read/navigation; không role/endpoint/evaluation mới; unresolved scope báo đúng, no false PASS | P02,P08,P14 / P24 |
| SC-12 |Snapshot scanned nhưng chưa evaluate; sau authorized evaluation clone/sibling/new version | Scan≠evaluation≠exposure; no re-seal/clean reset; no cross-user metadata leak hoặc blanket ban | P03,P08,P14,P19 / P23,P24 |
| SC-13 |Cùng θ ở biên, narrowed range/pinned/zero-width/categorical→06/07/09 | DR-02 rules/names đúng; no claim “not optimum”, no added deploy gate; copy exception có COR | P02,P13,P15,P16,P18 / P24 |
| SC-14 |No losses/zero variance/missing benchmark/no overlap/categorical labels permuted | Typed undefined/infinite/missing handling, no0/NaN JSON patch, no arbitrary category ordinal importance | P04,P13,P15,P18,P20 / P24 |
| SC-15 |07 mount/drag/refresh trước có grid; explicit evaluate grid có clamp/step duplicates | No implicit jobs/interpolation;81cells→actual unique configs; ΔJ đúng objective/scope, seed-sensitive dedupe | P05,P06,P16 / P23,P24 |
| SC-16 |08 events cùng timestamp, raw seq không liền, actual source gap fixture | Next/prev theo ordinal/source order; no synthetic gaps/causal chain; real gap refusal | P05,P17 / P24 |
| SC-17 |08 reveal ON trước exit→seek qua exit→đổi fold | Playhead panels không lộ future result; final summary tách nhãn; fold reset đúng; no certificate/digest change | P09,P13,P17,P18 / P24 |
| SC-18 |Fresh tab links có pick/trial/study/trade/seq/event_seq; conflicting aliases | Scope resolve đúng, ambiguous invalid trả reason; history/back không đổi frozen selection hay run mode | P02,P09,P15,P17 / P24 |
| SC-19 |11 local seal→timeout trước/sau R1 ACK→retry với actual actor | No false published/approved, no duplicate effect; actual selected/RC/evidence hashes giữ riêng | P02,P21,P22 / P24 |
| SC-20 |10 promotion_pick absent, code-change GATES RESET; corruption sau approval tồn tại | No maxSharpe pick/reset/revoke/stop; source approval mirror nguyên, Research warning riêng | P02,P19,P21,P22 / P24 |
| SC-21 |12/02 release có route mới chưa mapper; old run mở Atlas | Informational capability/reason đúng; no auto-enable/fallback; old release/backend evidence không đổi | P04,P08,P09,P10 / P23,P24 |
| SC-22 |20users đọc/cursor/what-if lookup, heavy compute+bounded verify/export; restart services | Aggregate5GB, no implicit compute/cache per-user raw copies; historical runs readable workers-off | P05,P06,P11–P18 / P23,P24 |
| SC-23 |Hai users đổi version/draft/context; stale network response đến sau | Bound old run không đổi; preflight invalidates; CAS declarations không overwrite; no cross-run projection mix | P03,P07–P10,P13,P21 / P24 |
| SC-24 |Re-export/GC/backup restore sau audit child/RC/exposure→01/09/10/11 | Metadata/ref graph/digests/counts readable; no re-seal, expected digest rewrite hoặc deleted pinned evidence | P05,P18,P19,P21,P22 / P23,P24 |

**Side-effect oracle:** kiểm tra HTTP/RPC calls, DB write set và scheduled jobs, không chỉ nhìn button disabled. Một read có thể ghi access/verification telemetry đã định nghĩa, nhưng không thay selection/approval/lifecycle ngoài quyền. Tests về no-execution-mutation chạy trên isolated existing services/fixtures được phép; không gửi lệnh thật để “kiểm tra bị chặn” trên production.

**Numerical oracle:** dùng source engine outputs và independent numeric reference phù hợp để test transformation; không viết simulator production thứ hai. Scope/J/params phải đối chiếu actual effective config. Source semantics chưa đủ thì test ghi gap có owner, không bịa expected score để test xanh.

## 17. Security và quyền nhiều người dùng

| Boundary | Quy tắc bắt buộc | Test tối thiểu |
|---|---|---|
| Browser→BFF | Existing auth/session, CSRF phù hợp hiện hành, object authorization | Same ID khác workspace; client-supplied actor/workspace rejected |
| BFF→legacy producer | Existing compatible trusted route, producer không public-trust arbitrary headers | Direct forged principal header từ untrusted origin refused |
| File upload→validation | Size/type/digest/ownership, sandbox thực thi | Path/symlink escape, top-level network/import allocation/pids |
| Worker→storage | Scratch scope riêng, no execute secrets/DB execution credentials | Attempt đọc workspace khác hay overwrite sealed artifact denied |
| Artifact read/export | Authorize mỗi object/reference; safe filenames/content handling | Guessdigest/download link/cache reuse không leak |
| Shared cache | Visibility scope in key or verified artifact ACL before return | Same digest different permissions |
| Research publish→governance | Exact actor/session/request schema, no privilege escalation | Background retry không đổi actor/waive permissions |
| DB migrations | Research role/schema only | UPDATE/ALTER execution denied; migration protected diff0 |
| Logs/audit | Redact secrets, cap fields/payload, actor/action/provenance retained | Token/credential fixture not in logs/export |

Không cần xây IAM/SSO mới nếu existing Portal đã làm. Guide không cấp quyền sửa Cloudflare/Google login/JWT policy của execution. Những phần shared auth muốn cải tiến ngoài phạm vi phải có yêu cầu riêng; không silently fork một security model cho Research.

## 18. Technical debt register và điều kiện cho phép mang qua phase

### 18.1. Phân loại

**P0:** sai accounting/selection/causality/identity; cross-tenant leak; mất hoặc sửa evidence đã pin; đổi execution trái scope. Dừng đường liên quan, không release.

**P1:** required screen/route không đúng hoặc không đủ dữ liệu; create/publish/retry không tương thích; exceeds5 GB required profile; false completion; không restore được published artifacts. Block phase acceptance tương ứng và toàn bộ V1.

**P2:** tối ưu chưa đạt target nhưng bounded và correctness đúng; thiếu index cho workload phụ; UX polish không làm sai required interaction. Chỉ defer khi owner thấy measured impact và có closureplan.

**P3:** documentation ergonomics/nice-to-have nằm ngoài mandatory spec. Có owner và backlog; không biến field bắt buộc thànhP3 vì khó.

### 18.2. Initial debt/gap closure map

| Debt ID | Scope | Severity mặc định | Phase đóng | Không được dùng làm workaround |
|---|---|---|---|---|
| TD-01 | Engine1.0.8 pin→1.1.1 adapter | P1 | P04 | Relabel history hoặc import sibling repo/vendor |
| TD-02 | HTTP direct path chưa thực sự durable | P1 | P06/P10 | Chỉ test worker riêng rồi bỏ nútRun |
| TD-03 | Thread được gọi “process” | P0/P1 theo isolation impact | P06 | Trust function name thay PID/sandbox evidence |
| TD-04 | Full bytes/pandas/copy chain | P1 nếu vượtcap | P05 | Tăng RAM hoặc hidden tmpfs |
| TD-05 | Engine retained audit buffers | P1 theo workload bắt buộc | P04/P05 | Private-state mutation, fake diskspill claim |
| TD-06 | Alpha/strategy/execution identity mismatch | P0 | P02/P10 | Đặt strategy_id thành unrelated run/versionID |
| TD-07 |202seed/terminal summary contract | P1 | P02/P10/P22 | Write execution SQL hoặc change facade |
| TD-08 | Digest scope/claim keys/canonicalization | P0 | P02/P16/P22 | Hashθ thay wrapper hoặc full RCclaim giả |
| TD-09 | Approval enum/SLA mismatch | P1 | P02/P22 | New execution enum/policy hoặc hardcode mock |
| TD-10 | Progress từ log/tailfullfile | P1 | P11 | Bịa audit timestamps từ logs/mtime |
| TD-11 | Holdout used nhưng labelsealed | P0 | P14 | Rewrite oldhistory hoặc auto claim A |
| TD-12 | Poolfreeze falsely implies strictselection | P0 | P14/P16 | Cert badge thay evidence |
| TD-13 | Missing complete trial/replay ledger | P1 | P15/P17 | Giữ scattertop600 thành toànhistory |
| TD-14 | Featurecopy/CSS/backend mismatch | P1 cho requiredbehavior | P09–P22 | HTMLmock fallback production |
| TD-15 | Backup/retention/GC correctness | P1 | P05/P23 | Object store trên cùng NVMe gọi là offnodebackup |
| TD-16 | Query latency/compaction tuning | P2 nếu đãbounded | P12/P15/P23 | Optimize bằng bỏ dữ liệu hoặc đổi metric |

Mỗi debt record có: `id`, `severity`, `source_requirement`, `observed_evidence`, `impact`, `owner`, `allowed_workaround`, `closure_test`, `target_phase`, `status`, `acceptance_decision`. Không đặt statusRESOLVED chỉ vì ticket đã tạo hoặc code được merge.

### 18.3. Debt và decision carryover cho findings sau review

| Loại | Cách xử lý | Không được làm |
|---|---|---|
| Sai selection identity, alias conflict, audit target drift | Block phase/action liên quan; fix source mapping + regression | Chọn “reasonable default” hoặc sửa θ để pass |
| Missing authority unlock/promotion source | DR-01/03 source proof; owner quyết định scope khi cần | Tạo governance mới, sửa execution, hoặc giả source hỗ trợ |
| Warning threshold/copy còn mâu thuẫn | DR-02 trước screen acceptance; rule/copy version | Dùng hai thresholds cùng tên không disclosure, thêm deploy gate |
| Field transform chưa implement nhưng raw đủ | Implementation backlog trong screen phase, có test/output cụ thể | Gắn NOT_APPLICABLE/engine unsupported để giảm scope |
| Field raw/route thực sự không có semantics | Evidence-backed availability/capability reason và COR khi cần | Bịa fills/events/selected trial/timestamps |
| Visual baseline thiếu fonts/CDN/chart runtime | Chạy lại harness/ghi artifact lỗi; không PASS visual | Dùng parsed HTML/screenshot placeholder làm pixel proof |
| New route integration chưa hoàn chỉnh | Engine/integration status riêng, contract task theo phase | Auto-enable sau upgrade hoặc giả engine từ chối |

Các bối cảnh `VERIFY_SOURCE` và `OWNER_SCOPE_REQUIRED` không phải giấy phép bỏ field hay infinite discovery. Report phải có reproduction, inspected symbols/endpoints, affected requirement IDs, action bị chặn và bước đóng. Không bổ sung phase mới để dời các blockers ra khỏi acceptance V1.

## 19. Agent workflow, test commands và báo cáo

### 19.1. Cách chia việc

Một agent sở hữu một vertical slice/phase contract: backend, schema, storage/projection và frontend liên quan. Agent reviewer độc lập chạy tests và inspect evidence, ưu tiên domain invariants/compatibility. Không gắn ngôn ngữ với tên agent như một quyền sửa execution.

Trước mỗi phase: đọc source list/test IDs, kiểm tra deps/gaps, ghi design delta nếu có. Sau mỗi phase: chạy focused tests và protected checks, tạo artifacts, báo pass/fail/debt. Không đợi cuối24 phases mới phát hiện producer không được R1 đọc.

Shared schema thay đổi phải có consumer test và changelog; parallel agents không tự sửa enum khác nhau. Có thể chia nhánh/worktree theo quy tắc repo; không merge/push protected branches nếu owner chưa cho phép. Không auto chạy production commands chỉ vì tài liệu đưa ví dụ.

### 19.1.a. Cách review từng lát cắt sau cập nhật

Trước code: đọc source HTML+Markdown của màn, global domain §§3/5/6/9/11–13 và phase tương ứng; cập nhật row fields/actions trước khi tạo endpoint. Khi thấy conflict, dùng FND/COR/DR có scope; agent tự đóng câu hỏi về code bằng test, chỉ escalates quyết định sản phẩm thật.

Trước PR: diff matrices và schemas cùng code; reviewer kiểm tra một scenario xuyên màn, không chỉ screenshot happy path. Mỗi field có actual raw/projection source và status; mỗi action có allowed/forbidden effects. New tests nối đúng FND/COR/SC ID và original source test. Source HTML demo handler không được xem là implementation authority.

Trước nghiệm thu: run full original relevant suite + new tests trong phase, attach raw outputs/screenshots/resource evidence. Nếu threshold/copy đổi, ghi exact COR/DR và expected visual delta; không mass-update golden fixtures. Source references/line locators thay do code mới phải có baseline diff. Các protected execution files/fixtures không đổi.

Không chia backend/frontend bằng ticket “API xong” và “UI mock xong” rồi cộng thành một phase. Chỉ PASS khi field/action contract được nối tới persisted real backend phù hợp mức phase và no-side-effect/numerical/resource tests đã chạy.

### 19.2. Command surface cần chuẩn hóa

Agent tạo wrapper **NEW** `scripts/research-loop-v1` nếu phù hợp repo; đây là yêu cầu tooling, không phải script đã có trong ZIP. Các subcommands nên có:

```text
scripts/research-loop-v1 verify-scope       # protected source/schema checks
scripts/research-loop-v1 test-contracts    # own schemas + unchanged execution fixtures
scripts/research-loop-v1 test-domain       # QuantBT/selection/time/data invariants
scripts/research-loop-v1 test-storage      # Parquet/recovery/GC/corruption
scripts/research-loop-v1 test-ui --screen 06
scripts/research-loop-v1 test-e2e --profile real-alpha
scripts/research-loop-v1 bench --profile ram-5gb --workload mixed-20-users
scripts/research-loop-v1 restore-check --manifest <verified-backup-manifest>
scripts/research-loop-v1 phase-report --phase P15
```

Wrapper phải gọi đúng test tooling/paths thực tế sau implementation, exitcode nonzero khi fail, pin seeds/workloads và ghi JSONresults. Không “echo PASS”. Các scripts có hành động restore/benchmark sandbox phải từ chối production target nếu thiếu explicit owner-authorized environment; không suy ra authorization từ flag tiện lợi.

Tooling hiện có như frontend Vitest/Playwright, control-api Vitest, Python pytest và Rust cargo tests được reuse; không thêm một framework trùng. Node/Python/Rust/toolchain pin theo package/lockfile; command báo version thật. Không nâng global dependencies execution để dùng test helper mới.

### 19.3. Phase report template

```markdown
# Pxx — <Tên phase>
Status: PASS | BLOCKED | PARTIAL | FAIL
Source baseline: <archive/commit hashes>
Implementation commits: <actual commits>
Allowed/protected diff: <paths, result>

## Scope delivered
<backend/frontend/data-contract items actually implemented>

## Tests actually executed
| Test ID | Command/profile | Input refs | Result | Evidence path |

## Resource evidence
<hardware, limit in bytes, peak aggregate memory, scratch/IO, latency percentiles>
<NOT_RUN with reason where not executed; never substitute estimate for measurement>

## Domain/compatibility findings
<actual QuantBT output reconciliation, source schema, execution request/response pins>

## Debt and blockers
<IDs, owners, closure tests, permitted scope of any partial acceptance>

## Rollback verification
<what was tested, retained data, impact on in-flight jobs>
```

## 20. Observability, backup và rollout

### 20.1. Quan sát có ích trong ngân sách nhỏ

Expose metrics thấp cardinality: queue depth/age theo class, active jobs, stage durations, memory peak/cgroup pressure, scratch bytes/reservations, writer backpressure, DB pool wait, query latency, artifactseal failures, retry counts và publication pending age. Không label Prometheus metrics bằng mọi run_id/trial_id; các ID chi tiết vào structured logs/traces/queryable metadata.

Reuse observability existing hoặc export metrics nhỏ; không bắt cài mới một stack dashboard lớn vào5 GB. Run/job/worker attempt/publication correlation IDs nối được logs, DB và file manifest. Logs có retention/quota; debug trace nặng chỉ bật bằng runtime profile có budget và không chứa secrets.

### 20.2. Backup/restore

Backup metadata và immutable artifacts theo consistent recovery manifest. Chọn off-node destination theo hạ tầng/permission owner; chưa có thì ghi single-node loss risk và không tuyên bố durable off-node. Record encryption/access policy thực tế, RPO/RTO mục tiêu đã được owner chốt và kết quả drill đo được.

Restore: import DB snapshot vào isolated target; resolve manifests/partrefs; verify all pinned artifacts hashes; rebuild disposable projections; replay pending outbox only under explicit authorized recovery context; do not resend production approval commands from a cloned test environment. Mark publishable only after integrity restored; old approval IDs là references read-only, không duplicatecreate.

### 20.3. Migration/rollout Research-only

1. Freeze code/spec baseline, run protected diffs và backup check.
2. Apply additive Research schema/readers trên staging; oldartifact reader smoke và regression execution hiện có.
3. Deploy boundedstorage/query modules; keep intake off until worker health/capacity tests pass.
4. Route new Research requests to durable producer while old in-flight jobs remain owned by their original supervisor/build. Không để hai dispatchers claim cùng intent.
5. Enable new UI/commands theo Research featureflags, preserve old reader compatibility until history parity accepted.
6. Verify metrics/RAM/queue/publishmirrors; stop intake on integrity/security/resource hard-failure.
7. Owner quyết định production deploy riêng; hướng dẫn không authorize live trading hoặc thao tác R2 ngoài existing workflow.

Rollback: disable new intake/publish initiation, drain jobs hoặc mark recoverable đúng policy, keep storage/schema backward readers, switch Research build/release default, reconcile authorized receipts. Không down migration xóa evidence, không reset approval, không flattenposition hoặc đổi runtime execution.

## 21. Điều kiện bàn giao V1 cuối cùng

- Có source→field→API→storage→transform→test map cho toàn15 màn và mọi required action; có exception COR ledger rõ.
- Có24 phase reports, actual commands/results, protected surface checks và source hashes; không có P0/P1 unresolved trong phạm vi mandatory.
- New bound/scratch/import/WFO/search/freeze/replay/report/compare/RC workflows chạy với data/strategy thật được phép; technical mocks chỉ ghi đúng vai trò test.
- RAM aggregate5 GB đã đo dưới mixeduserload, toàn bộ lịch sửstorage đọc được sau restart, disk/quota/GC/backup tested.
- Legacy202runseed, frozen selected artifact hash, alpha/claim mapping, strict R1 create và read-onlyR2/mirror đều tương thích code hiện có unchanged.
- Engine baseline1.1.1 và future additive upgrades có capability/golden/resource gates; history không relabel hoặc rewrite.
- Owner có tài liệu vận hành, migration/rollback, limitations thực tế và danh sách out-of-scope: thay đổi execution, options UI, multi-alpha/portfolioCompare, ủy quyền vốn thật, governance policy mới.

**Kết quả mong muốn:** Research Loop đầy đủ theo hi-fi/spec, xử lý dữ liệu có cấu trúc và bounded memory, mọi evidence có nguồn rõ, và publication làm việc với execution hiện có mà không thay đổi nó. Chỉ sau các gate trên mới được báo “đã nghiệm thu V1”; tài liệu thiết kế này tự nó không phải chứng nhận hệ thống đã đạt.

<a id="part-vi"></a>
# VI. NGUỒN, BASELINE VÀ CHỈ MỤC TEST GỐC

## 22. Cách kiểm tra nguồn

Các source references dưới đây là đường dẫn **bên trong đúng hai ZIP** và line numbers của text nguyên bản đã giải nén. Chúng không phải filecite giả và không ngụ ý đã truy cập runtime server. SHA-256 dùng để đối chiếu bytes. Nếu checkout agent khác baseline, ghi diff trước khi áp line reference; không tự thay nguồn bằng một file cùng tên ở version khác.

Tài liệu này được viết sau khi đọc source/spec và kiểm tra cấu trúc HTML. Việc render thử offline không tải đủ assets/CDN không được tính là visual acceptance. Chưa chạy implementation/backend benchmark/production certification trong quá trình soạn guide; toàn bộ phase evidence là output agent phải tạo khi thực hiện.

### 22.1. Portal source registry

<a id="src-p01"></a>
#### [P01] Quy tắc repo, quyền agent và strategy được bảo vệ

- `AGENTS.md` — 259 dòng; SHA-256 `ffb24583d30b51dc11b8c99fceb279fbb1bfd535a2ae34cc4614f86474322316`.
- `CONTRIBUTOR_AGENT_RULES.md` — 52 dòng; SHA-256 `d69ce8ed342cc3a48cc85054f30a20fa45800c657748417e14543b6fc475bb5e`.
- `apps/portal/strategy/PROTECTED_SHA256` — 1 dòng; SHA-256 `3d7f0520defd55acddcf21bfde2fcca34b7aabbf26e5413eb7cd5c4e90c684d9`.

<a id="src-p02"></a>
#### [P02] Engine dependency và adapter hiện tại

- `apps/portal/backend/pyproject.toml` — 42 dòng; SHA-256 `82975f70a727453e452de81f21ffd25f671d3cc047b7fcbf7be769e908a313db`.
- `constraints/portal.txt` — 12 dòng; SHA-256 `a16dcc4c1a3ded5c03a742ce38f351f8d13e738255518a6629da42ad65b900b2`.
- `apps/portal/backend/src/portal_api/adapters/quantbt.py` — 178 dòng; SHA-256 `1a9691a0ec245f97eab08f4025d5bc9e6901c6facabcc18ba8673f7950477bfd`.

<a id="src-p03"></a>
#### [P03] Producer run lifecycle, direct path và legacy summary/progress

- `apps/portal/backend/src/portal_api/main.py` — 246 dòng; SHA-256 `970cd6afe58d38da9637ae6259319a8d326637591a212fc19f92a95b10aba4a1`.
- `apps/portal/backend/src/portal_api/api/routes_runs.py` — 570 dòng; SHA-256 `689d3828ff6f3ac123b20cb71f897d5c96fd4e822cbef1761bcb739f06643fd4`.
- `apps/portal/backend/src/portal_api/services/run_service.py` — 200 dòng; SHA-256 `c8650b86efafe180a5cfebbb4bda8b145e730292fec26ab64fe2a7f802252daa`.

<a id="src-p04"></a>
#### [P04] Durable worker, lease, dispatch và isolation thực tế

- `apps/portal/backend/src/portal_api/workers/durable_worker.py` — 231 dòng; SHA-256 `0e006dd62b552bd44708f9b470ac8c550f545d7df2026b10fb4a833c92d39a72`.
- `apps/portal/backend/src/portal_api/services/durable_runs.py` — 273 dòng; SHA-256 `d8374d1db081beee1eac19a02fd715eaf17211951b5e7f8ad39d714ae4bf879d`.
- `apps/portal/backend/src/portal_api/services/job_broker.py` — 134 dòng; SHA-256 `decafca1f3b988c1427e501be15e8da429f50fd221b00879697f8cd6f22e04a8`.

<a id="src-p05"></a>
#### [P05] Data, artifact store và export hiện tại

- `apps/portal/backend/src/portal_api/services/data_catalog.py` — 416 dòng; SHA-256 `31eaca06e3c9481a1df6030f9996820d115f24b1d71145ee38169d543000a8bd`.
- `apps/portal/backend/src/portal_api/services/artifact_store.py` — 238 dòng; SHA-256 `fa0b519a62957a66ab8fddf775d2412f21c3fa5edb29d5d63e0b155711220163`.
- `apps/portal/backend/src/portal_api/services/export_service.py` — 76 dòng; SHA-256 `b4acef530ad9de8c401c82a439cedbec2d3bbe8801f90d6db8d9ad314a426037`.

<a id="src-p06"></a>
#### [P06] Strategy registry và import hiện tại

- `apps/portal/backend/src/portal_api/services/alpha_import.py` — 280 dòng; SHA-256 `96f3904582d95e88ead2ac2d96f24f57790ea59baac0af380fa917baeb9ab6f6`.
- `apps/portal/backend/src/portal_api/services/alpha_registry.py` — 321 dòng; SHA-256 `9cc611abee4319c8796262f95c4c2c20d53f060a337ca13d5a1ebd62e52d05ac`.
- `apps/portal/backend/src/portal_api/strategies/registry.py` — 21 dòng; SHA-256 `6e4e7c4c33aff1623a7b99154e9e67bb89d9a6edea3b77319d4e5aae80b0250d`.
- `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` — 119 dòng; SHA-256 `801b900a6d9cd936d0f6987cf766dedaeced9916e75213477daa3fb7e9313d11`.

<a id="src-p07"></a>
#### [P07] Facade consumer và điều kiện seed202

- `apps/control-api/src/facade/proxy.service.ts` — 406 dòng; SHA-256 `9ca58cfccf6107f7aaaf4ec1cdfdcece248788ba85f2f6bb8439cb458f0a9e52`.
- `apps/control-api/src/facade/facade.controller.ts` — 272 dòng; SHA-256 `2d84f6aa02e06958a55be2c8041f817a7282a682964f5539f09963693a05fb9b`.

<a id="src-p08"></a>
#### [P08] Run sync, selected artifact hash và claim extraction

- `apps/control-api/src/facade/run-sync.service.ts` — 138 dòng; SHA-256 `0221540a8b70dd998066d5e33573fa696451fd39d56e9b7d0c2a16761cd6c161`.

<a id="src-p09"></a>
#### [P09] Governance identity/read model và transaction

- `apps/control-api/src/governance/governance.repository.ts` — 1189 dòng; SHA-256 `8f4f8b5615e0a85ba37010b9a985ee685fa8966be424a17efa61f5bdc5d42c46`.

<a id="src-p10"></a>
#### [P10] Existing approval schemas, service và endpoints

- `apps/control-api/src/governance/contracts.ts` — 630 dòng; SHA-256 `06eb056ad3f249fa401e080809ec2f178dd85fd38d3fc3b14e021a1f0a764eab`.
- `apps/control-api/src/governance/governance.service.ts` — 902 dòng; SHA-256 `f9cdac944f2e4c65aea51e40897da433edb3c7ee0d0debe8c554d17843f05c35`.
- `apps/control-api/src/governance/governance.controller.ts` — 511 dòng; SHA-256 `6128ba332d8947a7de8e28889199cbaeb9cfcaa613b58d696af5d96515ce819a`.

<a id="src-p11"></a>
#### [P11] Three-window/WFO selected artifacts và holdout behavior

- `apps/portal/backend/src/portal_api/services/three_window_runner.py` — 593 dòng; SHA-256 `c7da6e2ccbdad73f08ee654413ae719efd544d6f35f6a90e50794b91d2b8f462`.
- `apps/portal/backend/src/portal_api/services/advanced_walkforward_runner.py` — 368 dòng; SHA-256 `480570cf605227d6c97cd62acd208ae44549ad6d01dee4335f2547338adbc73f`.

<a id="src-p12"></a>
#### [P12] Frontend và TS tooling hiện có

- `apps/portal/frontend/package.json` — 51 dòng; SHA-256 `9120f2903cb786dcfa120801a878aac76d64d560683486886d8f1c8789261f34`.
- `apps/control-api/package.json` — 37 dòng; SHA-256 `f3d07f919b8d515bb2f28120cbe9b8cb1f25234eaca72dd1becc6b557caafed4`.

<a id="src-p13"></a>
#### [P13] Execution/dual-cell background: read-only design input

- `upgrade/RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md` — 978 dòng; SHA-256 `7c7f6d28cfc6509fef4b66d90ed66baa2cce9d09d6fe936978e28f78df9f600d`.
- `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` — 7366 dòng; SHA-256 `6d5efebe2d0077c683eccf417226f2e081358f9a97820b5db3e6d1c43bb29e64`.
- `upgrade/EXECUTION_DURABLE_STREAMING_FROZEN_FRONTEND_INTEGRATION_AND_FINANCIAL_CHART_PLAN_v1.1.md` — 2752 dòng; SHA-256 `32db3dcda13fec74e6e6361d3bcf0017450acc4871c0fcb5ef2579e5ddec1c7b`.

<a id="src-p14"></a>
#### [P14] Producer request schemas và immutable validation

- `apps/portal/backend/src/portal_api/domain/requests.py` — 253 dòng; SHA-256 `3de5adf8334e52c483615813111529a2072dc6e15954869f1099cc36d9904719`.

### 22.2. Vị trí kiểm tra những contract nhạy cảm

| Nguồn | Literal/anchor | Dòng xuất hiện trong file |
|---|---|---|
| [P03] `routes_runs.py` | `@router.post("", status_code=202)` | 207 |
| [P03] `routes_runs.py` | `@router.get("/{run_id}/summary")` | 393 |
| [P03] `routes_runs.py` | `@router.get("/{run_id}/progress")` | 310 |
| [P04] `durable_worker.py` | `asyncio.to_thread` | 44, 201 |
| [P07] `proxy.service.ts` | `result.status === 202` | 338 |
| [P08] `run-sync.service.ts` | `summary?.selected_params` | 67 |
| [P08] `run-sync.service.ts` | `params.causality_claim` | 70 |
| [P08] `run-sync.service.ts` | `canonicalJson` | 26, 85, 129, 130, 134 |
| [P09] `governance.repository.ts` | `strategy_id` | 183, 453, 471, 539, 558 |
| [P10] `contracts.ts` | `ApprovalCreateRequestSchema` | 379 |
| [P10] `contracts.ts` | `APPROVED_WITH_CONDITION` | 11 |
| [P10] `governance.service.ts` | `createApproval(` | 243 |
| [P11] `three_window_runner.py` | `Holdout` | 5, 8, 9, 174 |

### 22.3. Redesign source registry

<a id="src-d01"></a>
#### [D01] IA/wiring và inventory

- `docs/00_README.md` — 18 dòng; SHA-256 `28e8c72c8bc647476ffc7948d2b25d51e3613a2ca4d67e3dd65e701009a37479`.
- `docs/01_IA_AND_WIRING.md` — 81 dòng; SHA-256 `1a26e3ea072af2fd219b3b33dcee5bc3865688ba4bc41f08fe882384cf6c0311`.
- `docs/SPEC_INDEX.md` — 80 dòng; SHA-256 `a86606b393dc5cff6e686667a65fd2011abfeeb066d8a96e28f778c3d672a722`.

<a id="src-d02"></a>
#### [D02] Screen summary và earlier lifecycle planning

- `docs/02_SCREEN_SPECS.md` — 106 dòng; SHA-256 `358044e50bc9e8043366a95fef9841abe30cdaebd2525dd95852efc26abab41a`.
- `docs/ALPHA_LIFECYCLE_ENGINE_EXPLOITATION_PLAN.md` — 128 dòng; SHA-256 `5ade1a2ed9db3429351fe38c78d8740852b1f75ea1189a4346e872100f8d149f`.

<a id="src-d03"></a>
#### [D03] Alpha/RC binding

- `docs/03_ALPHA_RC_BINDING.md` — 54 dòng; SHA-256 `797937db43438700c7a741b23210a617fb1f24f41ff0be9195c0c48aab2f8a40`.

<a id="src-d04"></a>
#### [D04] Route/mode/optimizer matrix

- `docs/04_ENGINE_ROUTE_MATRIX.md` — 82 dòng; SHA-256 `74ef5a6d3be8d132a1a8a2a3c4a7d842b241db186a63d369534f0da5681a41a3`.

<a id="src-s00"></a>
#### [S00] Màn 00 — QuantBT 00 Journey Map.dc.html

- `docs/screens/00_journey_map.md` — 500 dòng; SHA-256 `9d245d732fb33cb1eef3863c2e48b2f224c795e556c1c1f5325cf19681101800`.
- `QuantBT 00 Journey Map.dc.html` — 152 dòng; SHA-256 `525d0ef771a42d38b8defd84a88d02ab59f35248cb1dd41df0e0a9094bd3b2d3`.
- Acceptance source: **14 test IDs**, `T01–T14`, implement ở **P09**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s01"></a>
#### [S01] Màn 01 — QuantBT 01 Run Library.dc.html

- `docs/screens/01_run_library.md` — 504 dòng; SHA-256 `43795dccfdaa1d02064716fdea859a23d97d613cbf27ef4b023276e31e62320c`.
- `QuantBT 01 Run Library.dc.html` — 275 dòng; SHA-256 `0304f5334e9f50e57313de751388f0c697e778cc977ee3faa3e871f5a9d96353`.
- Acceptance source: **22 test IDs**, `T01–T22`, implement ở **P12**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s02"></a>
#### [S02] Màn 02 — QuantBT 02 New Run Preflight.dc.html

- `docs/screens/02_new_run.md` — 493 dòng; SHA-256 `994232129fa0c3945b2ca854b6c782ff4396d07fb0f070463dfb8b833bf2d700`.
- `QuantBT 02 New Run Preflight.dc.html` — 866 dòng; SHA-256 `224a0d09a549a78ee9625647e609ac2ae8ece0ea7a8b06637e18ef6d85e0ec29`.
- Acceptance source: **30 test IDs**, `T01–T30`, implement ở **P10**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s03"></a>
#### [S03] Màn 03 — QuantBT 03 Run Progress.dc.html

- `docs/screens/03_run_progress.md` — 502 dòng; SHA-256 `71225aabaa8a6b27fe3929cdf7d6532645de2e5d30a451e669b32c0128b795f1`.
- `QuantBT 03 Run Progress.dc.html` — 454 dòng; SHA-256 `769fa78c32b14d2364b6044fe69e06645c48f0b40e4b8792d114b8a2e4621bda`.
- Acceptance source: **18 test IDs**, `T01–T18`, implement ở **P11**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s04"></a>
#### [S04] Màn 04 — QuantBT 04 Evidence Flow.dc.html

- `docs/screens/04_evidence_flow.md` — 485 dòng; SHA-256 `1953f3f9679db2be5e823c60bc8d7df5bd2228a151db3a7a240cd80d1f1ff65b`.
- `QuantBT 04 Evidence Flow.dc.html` — 1616 dòng; SHA-256 `db2c6c2cc584a442b232f2b76951a6d783c3ff968068d321a93226b92b94d750`.
- Acceptance source: **18 test IDs**, `T01–T18`, implement ở **P13**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s05"></a>
#### [S05] Màn 05 — QuantBT 05 S1 Split.dc.html

- `docs/screens/05_s1_split.md` — 431 dòng; SHA-256 `e0d99ee3bde198156fdf2b6161885d95030fffa027c58489571cb7d0fd012621`.
- `QuantBT 05 S1 Split.dc.html` — 416 dòng; SHA-256 `b29b55fcff75169989d88caf541992b7e77d6facbc388a293acc13b613eb6440`.
- Acceptance source: **16 test IDs**, `T01–T16`, implement ở **P14**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s06"></a>
#### [S06] Màn 06 — QuantBT 06 S2 Search and Selection.dc.html

- `docs/screens/06_s2_search.md` — 363 dòng; SHA-256 `b198de53b06c8afcae4313d6eef43442ee16856854327f5a5746d6b8f76af246`.
- `QuantBT 06 S2 Search and Selection.dc.html` — 1033 dòng; SHA-256 `d7064a544addd7d9cb0b015b50708e73c5ff32491a04f0b448d14d846f5a3b30`.
- Acceptance source: **19 test IDs**, `T01–T19`, implement ở **P15**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s07"></a>
#### [S07] Màn 07 — QuantBT 07 S3 Freeze.dc.html

- `docs/screens/07_s3_freeze.md` — 266 dòng; SHA-256 `2cb3d4e30286d1c4c1fcbd7423113157908a4f79096ad985091a92fc77a090d2`.
- `QuantBT 07 S3 Freeze.dc.html` — 366 dòng; SHA-256 `305a02097714b92dd0bc5c92cbfd1e906532996218170b7525968e4ce8770e26`.
- Acceptance source: **16 test IDs**, `T01–T16`, implement ở **P16**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s08"></a>
#### [S08] Màn 08 — QuantBT 08 S4 Execute Replay.dc.html

- `docs/screens/08_s4_execute.md` — 227 dòng; SHA-256 `028b752e58f7c4363007589a078eaffcd3ff54c4dd74ef1474c33fe1ca438fa6`.
- `QuantBT 08 S4 Execute Replay.dc.html` — 823 dòng; SHA-256 `3f8a8ad71e213e32378b5f024091223a94c66098fbbc4d08d15f2cb8e1a3006f`.
- Acceptance source: **22 test IDs**, `T01–T22`, implement ở **P17**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s09"></a>
#### [S09] Màn 09 — QuantBT 09 Run Report.dc.html

- `docs/screens/09_run_report.md` — 273 dòng; SHA-256 `beacc921d42c650d6a92853156b6944a163c7a55d5db3cc4695c58b1d95c762f`.
- `QuantBT 09 Run Report.dc.html` — 251 dòng; SHA-256 `d49a797fa7e0c5e5c0364dfd7a58f1f673e957435a25b9d1820ff70ed47e5bfd`.
- Acceptance source: **10 test IDs**, `T01–T10`, implement ở **P18**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s10"></a>
#### [S10] Màn 10 — QuantBT 10 Attempt Lineage.dc.html

- `docs/screens/10_attempt_lineage.md` — 196 dòng; SHA-256 `b2924e448182b82c5ade9e5d1408018d0d3a5f8f00a3748c56739b9e8564fba5`.
- `QuantBT 10 Attempt Lineage.dc.html` — 345 dòng; SHA-256 `6f2adbfd85135a2a956399bc77b81b9e424c7cc1a831b7619701f0cc877748d6`.
- Acceptance source: **12 test IDs**, `T01–T12`, implement ở **P19**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s11"></a>
#### [S11] Màn 11 — QuantBT 11 Release Candidate and Publish.dc.html

- `docs/screens/11_release_candidate.md` — 269 dòng; SHA-256 `1665527e0e8c1ced70041eadca95c5330cf0a0f7ebf48cfa1153f933b2fb328d`.
- `QuantBT 11 Release Candidate and Publish.dc.html` — 304 dòng; SHA-256 `abc1b0ca446a93b3b988950753617d361f298328108cb584eea46f8babdba7a8`.
- Acceptance source: **14 test IDs**, `T01–T14`, implement ở **P21/P22**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s12"></a>
#### [S12] Màn 12 — QuantBT 12 Mode Atlas.dc.html

- `docs/screens/12_engine_atlas.md` — 82 dòng; SHA-256 `e3a41f399f7681e951baada349e185599b57f8ea8b7392298101ae88b2375c45`.
- `QuantBT 12 Mode Atlas.dc.html` — 383 dòng; SHA-256 `b63805b8f60ba79558b8770cd05f72c2b0d02b7a5c4d6b7f028f562213052435`.
- Acceptance source: **10 test IDs**, `T01–T10`, implement ở **P09**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s13"></a>
#### [S13] Màn 13 — QuantBT 13 Compare.dc.html

- `docs/screens/13_compare.md` — 88 dòng; SHA-256 `ab1274b4504db343cc9daf83d672df36e7ec61ed873cc4b2cac0b1d3af9946de`.
- `QuantBT 13 Compare.dc.html` — 399 dòng; SHA-256 `53bcc38386bd0ce3a2be4379982b95f3107f7eb5a6d2e21616511442f01e0d9e`.
- Acceptance source: **11 test IDs**, `T01–T11`, implement ở **P20**; correction exceptions được liệt kê trong COR ledger.

<a id="src-s14"></a>
#### [S14] Màn 14 — QuantBT 14 Alpha Import.dc.html

- `docs/screens/14_alpha_import.md` — 144 dòng; SHA-256 `e89cd8fbb615ee1532db488840a4e887671e59912d3dc6ae96ddad8a5081c7b9`.
- `QuantBT 14 Alpha Import.dc.html` — 293 dòng; SHA-256 `61f02a686bf1e9acd6c6ebeb75dbfa93ff7b675cd4ea495faee894c6ac1edd4a`.
- Acceptance source: **12 test IDs**, `T01–T12`, implement ở **P07**; correction exceptions được liệt kê trong COR ledger.

### 22.4. Vị trí nguồn cho findings bổ sung sau review

References `[R01]`–`[R08]` là các locator vào **cùng archive baseline** ở§2.1. Đây là bằng chứng source-text/prototype, không phải log chạy backend/browser. Những hướng triển khai của V1 được đánh dấu ở FND/COR/DR, không giả chúng đã tồn tại trong source.

<a id="src-r01"></a>
#### [R01] Freeze prototype verify, bound diagnostics và digest scope

- `QuantBT 07 S3 Freeze.dc.html` — dòng **164–175, 309–325, 354**; SHA-256 `305a02097714b92dd0bc5c92cbfd1e906532996218170b7525968e4ce8770e26`.

Verify handler mô phỏng timer; fixed_params có bundle scope riêng; one-step/12–88 bound logic và copy không đủ chứng minh optimum. COR-18/23/24 không xác nhận backend đã implement.

<a id="src-r02"></a>
#### [R02] Alpha Import mirror-only và gates

- `docs/screens/14_alpha_import.md` — dòng **18–25, 39–53, 61–82**; SHA-256 `e89cd8fbb615ee1532db488840a4e887671e59912d3dc6ae96ddad8a5081c7b9`.

Mirror fields parsed server; source spec cấm sửa parameter_space trong wizard. Stagger visual sau actual gate results không đồng nghĩa chạy validation ở frontend.

<a id="src-r03"></a>
#### [R03] New Run declared-space, duplicate logical optimizer fields và sparse serializer

- `docs/screens/02_new_run.md` — dòng **137, 153–175, 188–205, 435–456**; SHA-256 `994232129fa0c3945b2ca854b6c782ff4396d07fb0f070463dfb8b833bf2d700`.

Declared narrow/pin; main/advanced fields cần canonical mapping; payload field table và manifest-driven cards không tự chứng minh actual QuantBT/Portal capability.

<a id="src-r04"></a>
#### [R04] Search inspection, thetaTrial type và warning population

- `docs/screens/06_s2_search.md` — dòng **4–19, 38–44, 110–140, 148–165, 177–189**; SHA-256 `b198de53b06c8afcae4313d6eef43442ee16856854327f5a5746d6b8f76af246`.

pick là cursor, mode switcher chỉ demo; numeric thetaTrial mẫu không bao quát centroid. Relative thresholds trong source khác Freeze HTML.

<a id="src-r05"></a>
#### [R05] Split seal/read-only role và governance source

- `docs/screens/05_s1_split.md` — dòng **4, 50–59, 80–85, 113–120**; SHA-256 `e0d99ee3bde198156fdf2b6161885d95030fffa027c58489571cb7d0fd012621`.

Màn giải thích seal; metadata integrity khác content evaluation. Có prose audited unlock/sibling không chứng minh endpoint/quyền triển khai có sẵn.

<a id="src-r06"></a>
#### [R06] RC final audit, evidence items và immutable inputs

- `docs/screens/11_release_candidate.md` — dòng **35–49, 72, 99–105, 240–266**; SHA-256 `1665527e0e8c1ced70041eadca95c5330cf0a0f7ebf48cfa1153f933b2fb328d`.

Hi-fi có final_audit_run, 12-item pack và server-driven draft/publish; backend mapping phải giữ existing strict downstream contract, không gửi full record trực tiếp.

<a id="src-r07"></a>
#### [R07] Replay sequence/cursor và prototype causal-reveal

- `docs/screens/08_s4_execute.md` — dòng **18–19, 41–57, 86–118**; SHA-256 `028b752e58f7c4363007589a078eaffcd3ff54c4dd74ef1474c33fe1ca438fa6`.
- `QuantBT 08 S4 Execute Replay.dc.html` — dòng **353–365, 460–478, 521, 605–612**; SHA-256 `3f8a8ad71e213e32378b5f024091223a94c66098fbbc4d08d15f2cb8e1a3006f`.

Event transport, trade/seq keys và prototype event generation là các bề mặt khác nhau. Original ID/order không được thay bằng generated mock; reveal là display behavior.

<a id="src-r08"></a>
#### [R08] Lineage draft counts, promotion source và version-change copy

- `docs/screens/10_attempt_lineage.md` — dòng **24–46, 53–79, 160–172, 194**; SHA-256 `b2924e448182b82c5ade9e5d1408018d0d3a5f8f00a3748c56739b9e8564fba5`.

DRAFT nằm trong source lifecycle; promotion_pick do source/governance chỉ định, không FE metrics. GATES RESET là copy cần mapping, không quyền sửa existing gates.

## 23. Tài liệu kỹ thuật gốc

Các link engine dưới đây ghim source commit của release để tránh dùng `main` làm bằng chứng cho wheel cũ. Tài liệu hệ thống/library là tham chiếu cơ chế; không phải yêu cầu nâng PostgreSQL/Arrow/DataFusion của repo lên phiên bản website đang hiển thị. PostgreSQL trong baseline Compose giữ major hiện có, trừ một task upgrade riêng được owner cho phép.

<a id="src-e01"></a>
### [E01] QuantBT1.1.1 PyPI release, package metadata/provenance
Nguồn: [QuantBT1.1.1 PyPI release, package metadata/provenance](https://pypi.org/project/quantbt-engine/1.1.1/)

<a id="src-e02"></a>
### [E02] ResearchAuditWriterV1: export hook, retention và durability limitations
Nguồn: [ResearchAuditWriterV1: export hook, retention và durability limitations](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/src/quantbt/core/research_audit.py)

<a id="src-e03"></a>
### [E03] Optimization public contract của matching release
Nguồn: [Optimization public contract của matching release](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/docs/optimization.md)

<a id="src-e04"></a>
### [E04] Reactive WFO runtime/retention/fold-account contract
Nguồn: [Reactive WFO runtime/retention/fold-account contract](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/docs/reactive_wfo.md)

<a id="src-e05"></a>
### [E05] Linux cgroup v2 memory accounting/limits
Nguồn: [Linux cgroup v2 memory accounting/limits](https://docs.kernel.org/admin-guide/cgroup-v2.html)

<a id="src-e06"></a>
### [E06] Rust ArrowWriter memory/row-group flush
Nguồn: [Rust ArrowWriter memory/row-group flush](https://arrow.apache.org/rust/parquet/arrow/arrow_writer/struct.ArrowWriter.html)

<a id="src-e07"></a>
### [E07] PostgreSQL resource settings/work_mem
Nguồn: [PostgreSQL resource settings/work_mem](https://www.postgresql.org/docs/current/runtime-config-resource.html)

<a id="src-e08"></a>
### [E08] DataFusion configuration, memory pools/spill
Nguồn: [DataFusion configuration, memory pools/spill](https://datafusion.apache.org/user-guide/configs.html)

<a id="src-e09"></a>
### [E09] QuantBT research audit và financial/research retention
Nguồn: [QuantBT research audit và financial/research retention](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/docs/performance/perf_06_research_audit.md)

<a id="src-e10"></a>
### [E10] Public endpoint contract, profiles và runtime budget
Nguồn: [Public endpoint contract, profiles và runtime budget](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/docs/endpoint.md)

<a id="src-e11"></a>
### [E11] Canonical market/calendar V2
Nguồn: [Canonical market/calendar V2](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/docs/contracts/v1_1_market_calendar_v2.md)

<a id="src-e12"></a>
### [E12] Instrument registry V2
Nguồn: [Instrument registry V2](https://raw.githubusercontent.com/BobbyAxerol/quantbt/2c811a7faaed3c274e93c60650e16207949f0a59/docs/contracts/v1_1_instrument_registry_v2.md)

## 24. Chỉ mục source-test coverage — không thay thế test gốc

Tổng cộng **244 test IDs theo scope màn** được tìm trong15spec. `S02:T01` khác `S03:T01`; không đếm các tên giống nhau là một test. Đây là chỉ mục yêu cầu, **không phải kết quả đã chạy/pass**. Các phase bổ sung backend/domain/resource tests bên cạnh các case gốc.

P01 phải import từng test vào coverage matrix có result/evidence path. P24 yêu cầu tất cả case mandatory pass hoặc có correction được owner chấp nhận; không dùng việc đếm đủ ID để thay execution.

### S00 → P09

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S00:T01` | L369 | fresh load · mở /journey · đủ 8 phase, thứ tự P1→P8, không spinner |
| `S00:T02` | L370 | — · đếm card từng phase · P1=3 · P2=3 · P3=2 · P4=2 · P5=2 · P6=9 · P7=3 · P8=4 (khớp §2.1) |
| `S00:T03` | L371 | — · kiểm arrow · card cuối MỖI phase không có →; không arrow nào đứng đầu dòng khi wrap 400px |
| `S00:T04` | L372 | — · click card "Run Library — evidence cards" · điều hướng route 01 (SPA push, không reload) |
| `S00:T05` | L373 | — · cmd+click card bất kỳ · mở tab mới đúng href |
| `S00:T06` | L374 | flag 13-compare off · render P6 · card Compare disabled: opacity .55, badge SOON, không click |
| `S00:T07` | L375 | — · Tab liên tục · focus đi đúng thứ tự đọc; ring token đúng; không focus-trap |
| `S00:T08` | L376 | viewport 660px · resize · không scrollbar ngang; rail 150 giữ; card wrap |
| `S00:T09` | L377 | print preview · in · 3 kiểu card phân biệt được grayscale; không cắt card giữa trang (break-inside avoid) |
| `S00:T10` | L378 | — · console · 0 error/warning |
| `S00:T11` | L379 | link audit CI · chạy test duyệt href · 100% href ∈ SCREEN_ROUTES ∪ SHIPPED_WHITELIST |
| `S00:T12` | L380 | mapping card · so văn bản · 6 hàng, cột adds verbatim §2.3 |
| `S00:T13` | L381 | data đổi (thêm card P6 mới vào config) · rebuild · card mới xuất hiện, không sửa JSX nào (assert bằng review diff) |
| `S00:T14` | L382 | badge đếm bật, API 500 · load · map render đủ; badge ẩn; không error console (catch + log debug) |

### S01 → P12

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S01:T01` | L385 | 7 run fixture · load · 7 card, thứ tự created desc, counter "7 of 7 runs" |
| `S01:T02` | L386 | — · gõ "wfo-118" · 1 card; counter "1 of 7"; xoá → 7 |
| `S01:T03` | L387 | — · chip completed + mode_1 · giao đúng AND-giữa-nhóm; counter khớp |
| `S01:T04` | L388 | — · chip scratch only · chỉ SBB-021 + FULL-004 |
| `S01:T05` | L389 | — · bật group by alpha · 3 section: momentum(av_0_9_3 rồi av_0_9_2)… scratch cuối; header sub đúng câu |
| `S01:T06` | L390 | — · reload với URL đầy filter · khôi phục đúng; back/forward hoạt động |
| `S01:T07` | L391 | — · chọn 118 + 117 · compare ok (cùng key) → nút mở /compare?runs=… |
| `S01:T08` | L392 | — · chọn 118 + TT-002 · refused: viền đỏ, nút disabled, copy verbatim |
| `S01:T09` | L393 | 2 đã chọn · chọn run thứ 3 · thay run CŨ NHẤT trong sel (FIFO) |
| `S01:T10` | L394 | card RUNNING · đợi poll · stats đổi tại chỗ; không reorder; pulse chạy |
| `S01:T11` | L395 | run RUNNING → COMPLETED (mock) · poll kế · pill đổi, trail S2 done, link đổi "open evidence →" |
| `S01:T12` | L396 | rc DRAFT · click rc chip · điều hướng 11 |
| `S01:T13` | L397 | binding null · xem chip · dashed "scratch"; tooltip câu NOT_PUBLISHABLE đầy đủ |
| `S01:T14` | L398 | 1000 run fixture · cuộn nhanh · 60fps profiler; sparkline chỉ fetch card đã vào viewport |
| `S01:T15` | L399 | API 500 · load · error card + retry; filter bar vẫn hiện |
| `S01:T16` | L400 | filter về 0 · — · copy "0 of 7 runs match — loosen a filter." + nút clear |
| `S01:T17` | L401 | 660px · resize · hàng head wrap; claim xuống dòng; không tràn ngang |
| `S01:T18` | L402 | keyboard · Space trên checkbox · toggle; aria-label đúng "select R-WFO-118 for compare" |
| `S01:T19` | L403 | trail hover · hover S1 ô cap · tooltip verbatim "S1 Split — holdout sealed · cap ≤ B (binding)" |
| `S01:T20` | L404 | superseded run · xem card 118 · strip att_00 hiện đúng câu, opacity .7 |
| `S01:T21` | L405 | ledger strip · so tổng · tổng đoạn = số run COMPLETED có claim; caption đúng |
| `S01:T22` | L406 | axe-core · scan · 0 serious violation |

### S02 → P10

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S02:T01` | L307 | fresh · mở /runs/new · step Context; chip PUBLISHABLE · av_0_9_3; passport strip đủ 5 trường |
| `S02:T02` | L308 | bound · mở Strategy · mom_breakout_v3 badge "from av_"; 1 card PINNED OUT dashed; 1 BLOCKED đỏ; note pin vàng |
| `S02:T03` | L309 | — · bấm scratch · banner NOT_PUBLISHABLE; title chip đổi; Strategy hết pin (badge runnable) |
| `S02:T04` | L310 | — · chọn av_0_3_0 (DRAFT) · note vàng DRAFT; vẫn đi tiếp được |
| `S02:T05` | L311 | Route · chọn options · không chọn được; title lý do deferred |
| `S02:T06` | L312 | Route · chọn intrabar · form 3 field + cột intent; note link Execute Replay; review rail route đổi |
| `S02:T07` | L313 | Route · chọn fill_replay · summary tape; step Windows hiện note tape-span; review rail "tape-driven, single-pass" |
| `S02:T08` | L314 | Data · timeframe 15m với mom (declared 1h,4h) · lỗi "The strategy declares only 1h, 4h." + pill Data "!" |
| `S02:T09` | L315 | Windows 3W · sửa OOS start ≠ IS end · lỗi verbatim; pill "!" |
| `S02:T10` | L316 | Advanced · quarterly, 2022-01-01→2026-08-14 · badge ≈18; strip 18 cell; note thường |
| `S02:T11` | L317 | Advanced · monthly · badge vàng &gt;20; note budget |
| `S02:T12` | L318 | Advanced · frequency "weekly" · note xám "computable once…"; badge ≈0 không đỏ chặn |
| `S02:T13` | L319 | Params · pin risk_pct · counter swept 5 · pinned 1; status "pinned at 0.25 — fixed, out of sweep dims"; step "—" |
| `S02:T14` | L320 | Params · low window = 5 (declared 12) · refused đỏ; blocking; pill Parameters "!" |
| `S02:T15` | L321 | Params · pin cả 6 → sweep 0 · hợp lệ (calibration-style); ceiling không chặn 0 |
| `S02:T16` | L322 | Params giả 9 swept (fixture 9 params) · — · blocking "sweep dims 9 &gt; 8 — pin params or drop entries." |
| `S02:T17` | L323 | Optimization · trials 2500 · lỗi ceiling 2000 |
| `S02:T18` | L324 | Optimization · xoá seed (strategy seed_required) · lỗi determinism verbatim |
| `S02:T19` | L325 | Accordion · sửa n_startup_trials 120→200 · badge OVERRIDE; header "1 override"; review rail liệt kê key; payload chỉ chứa key đó |
| `S02:T20` | L326 | Accordion · sửa về 120 · override biến mất; "all defaults… nothing serialized" |
| `S02:T21` | L327 | Accordion · n_jobs · không input; badge LOCKED |
| `S02:T22` | L328 | mode×schedule · mode_2 chọn per_fold_causal · pill dashed strike; title lý do; không set được |
| `S02:T23` | L329 | mode 5 + global · xem forecast · claim NONE_FULL_SAMPLE_CALIBRATION; ceiling D đỏ |
| `S02:T24` | L330 | đủ hợp lệ · preflight · rows PASS; nút create enable |
| `S02:T25` | L331 | preflight xong, sửa 1 field · — · preflightRan=false; create disable lại |
| `S02:T26` | L332 | create · bấm · POST body == preview (deep equal); redirect /runs/R-…/progress |
| `S02:T27` | L333 | F5 giữa chừng · reload · draft khôi phục; step giữ (?step=) |
| `S02:T28` | L334 | manifest 500 · mở màn · error + retry; không mở wizard data giả |
| `S02:T29` | L335 | 660px · resize · rail xuống dưới; params/accordion cuộn ngang trong card; không tràn trang |
| `S02:T30` | L336 | axe · scan · mọi input có label; step pill aria-current="step"; 0 serious |

### S03 → P11

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S03:T01` | L192 | snapshot RUNNING 5 fold · load · đủ 7 block; pill RUNNING; dot pulse; S2 RUNNING mini-bar |
| `S03:T02` | L193 | SSE gửi trial_completed · — · console thêm dòng; tqdm line đổi; pct tăng |
| `S03:T03` | L194 | SSE drop (mock error) · — · dot xám; poll 5s hoạt động; không banner |
| `S03:T04` | L195 | event seq cũ đến sau · — · bị bỏ; state không lùi |
| `S03:T05` | L196 | fold_completed 07 · — · gantt fold 7 đủ đoạn; cursor không tự đổi nếu user đã pin |
| `S03:T06` | L197 | click fold 3 · — · stage-rail links mang #fold=3; console filter "fold 3" |
| `S03:T07` | L198 | artifact sealed trials.parquet · — · ô đổi sealed + digest; click → 06 |
| `S03:T08` | L199 | run_completed · — · claim dashed→solid 240ms; nút bàn giao href đúng cursor; SSE "final state" |
| `S03:T09` | L200 | run_failed budget · — · pill FAILED; console dòng đỏ mã RuntimeBudgetError verbatim; passport NOT ISSUED; artifacts writing→aborted |
| `S03:T10` | L201 | cancel · confirm · POST cancel; failed USER_CANCELLED |
| `S03:T11` | L202 | scale 32 fold · load · gantt compact cột; hover tooltip; click chọn được |
| `S03:T12` | L203 | console 5000 dòng server · cuộn lên đầu · "older lines dropped" + backfill nút "load older" theo after_seq |
| `S03:T13` | L204 | auto-scroll · user cuộn lên · OFF + nút ↓ latest; click → ON đáy |
| `S03:T14` | L205 | tab ẩn 2 phút · mở lại · snapshot refetch; stream nối lại; không dòng trùng (dedupe seq) |
| `S03:T15` | L206 | COMPLETED reload · — · #fold= khôi phục cursor; mọi block ở trạng thái cuối |
| `S03:T16` | L207 | 660px · resize · gantt/console cuộn trong card; không tràn trang |
| `S03:T17` | L208 | axe · scan · console role=log aria-live=polite (throttle); stage pend aria-disabled |
| `S03:T18` | L209 | reduce-motion OS · — · pulse/blink tắt (prefers-reduced-motion) |

### S04 → P13

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S04:T01` | L182 | mount không hash · — · stage=summary; cursor = θ* defaults; hash được ghi đủ key |
| `S04:T02` | L183 | hash #stage=execute&fold=4 · mount · tab execute; fold selector = fold_04; deep-dive href mang fold=4 |
| `S04:T03` | L184 | đổi tab search · — · hash stage=search; fold GIỮ; sub tab hiện "fold 4 · trial …" |
| `S04:T04` | L185 | click chip cert · — · nhảy tab claim; scroll top |
| `S04:T05` | L186 | click fold boundary trên equity · — · cursor fold đổi; verdict row highlight |
| `S04:T06` | L187 | verdict row DRAG (drag_target=execute) · click · tab execute + fold của hàng |
| `S04:T07` | L188 | fold selector ‹ › · click · prev/next; disabled ở biên |
| `S04:T08` | L189 | reset to θ* · click · cursor = defaults; hash cập nhật |
| `S04:T09` | L190 | dataset chip · click · drawer mở; Escape đóng; focus trả về chip |
| `S04:T10` | L191 | copy evidence link · click · clipboard chứa portal://…#đủ cursor; nút ✓ 1.5s |
| `S04:T11` | L192 | 32-fold run · mở summary · verdict windowed 10 + show all; fold dropdown nhóm 10 |
| `S04:T12` | L193 | manifest DEGRADED row · hover/inspect · note verbatim; màu đúng grammar |
| `S04:T13` | L194 | rc null · header · không chip rc; nút release candidate vẫn hiện (compose mới) |
| `S04:T14` | L195 | deep-dive → breadcrumb về · vòng tròn · hash nguyên vẹn (fold/trial/params không đổi) |
| `S04:T15` | L196 | ETag 304 · revisit · render từ cache; không flash |
| `S04:T16` | L197 | 660px · resize · claim strip wrap; bảng verdict cuộn ngang; drawer full-width |
| `S04:T17` | L198 | axe · scan · tab role=tablist/tab/tabpanel; drawer focus trap; 0 serious |
| `S04:T18` | L199 | equity chart · fold boundary click vùng touch 44px · hoạt động (hit area mở rộng) |

### S05 → P14

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S05:T01` | L154 | mount #fold=3 · — · hàng 3 viền xanh; inner panel fold 3; hash giữ |
| `S05:T02` | L155 | click fold 5 · — · cursor 5; hash fold=5; inner re-render |
| `S05:T03` | L156 | hover train fold 3 · — · tooltip span + bars đúng fixture |
| `S05:T04` | L157 | lens off (đủ rộng) · — · purge/embargo vẽ true-scale; không badge |
| `S05:T05` | L158 | viewport hẹp / purge &lt; 1px · — · lens tự ON + badge ×6 + caption |
| `S05:T06` | L159 | 32-fold · load · compact rows; virtual scroll; dropdown nhóm 10 |
| `S05:T07` | L160 | 32-fold · click hàng 17 · expand inline chi tiết fold 17 (đoạn + số) |
| `S05:T08` | L161 | SEALED chip · click · → hub #stage=claim (hash giữ fold) |
| `S05:T09` | L162 | next-stage · click · → 06 với hash nguyên vẹn |
| `S05:T10` | L163 | gap WATCH row · inspect · giờ UTC + độ dài đúng; verdict chip vàng |
| `S05:T11` | L164 | holdout card · đọc · 3 dòng luật verbatim; cap B nói "BINDING" |
| `S05:T12` | L165 | breadcrumb về hub · click · hub mở đúng fold hiện hành |
| `S05:T13` | L166 | 660px · resize · track co, label wrap; không tràn |
| `S05:T14` | L167 | axe · scan · hàng fold role=button aria-pressed; tooltip aria-describedby; 0 serious |
| `S05:T15` | L168 | ETag revisit · — · không flash |
| `S05:T16` | L169 | inner folds fixture lệch (test guard) · render · dev-warning console + clamp (không vẽ tràn) |

### S06 → P15

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S06:T01` | L148 | mode_1 pfc · load · freeze arrow "→"; OOS state chip "withheld"; ledger cột "S_OOS · withheld" |
| `S06:T02` | L149 | mode_1 per_fold_decay · switch · arrow "◀ OOS" pulse đỏ; oosState "selection input"; claim đổi |
| `S06:T03` | L150 | mode_2 · switch · backend "proxy (forced)" vàng; evidence histogram; không panel decay |
| `S06:T04` | L151 | mode_3 · — · bảng cluster; hàng C1 nền vàng; medoid note |
| `S06:T05` | L152 | mode_4 · — · heatmap 6×6; B/C 0.000 hiển thị |
| `S06:T06` | L153 | mode_5 · — · banner đỏ; grep "OOS" trong DOM = 0; cột S_full; journey none |
| `S06:T07` | L154 | click điểm surface · — · ring vàng; ledger window nhảy quanh trial; hash pick= |
| `S06:T08` | L155 | click hàng ledger · — · pick đổi; surface ring theo |
| `S06:T09` | L156 | axis picker đổi x=atr_mult · — · scatter re-plot; legend giữ |
| `S06:T10` | L157 | schedule invalid pill · click · no-op; title lý do đúng map |
| `S06:T11` | L158 | θ* sát biên (fixture edge) · — · tick đỏ + note "SÁT BIÊN" |
| `S06:T12` | L159 | journey absent (fixture degraded) · — · câu degraded verbatim; không chart rỗng |
| `S06:T13` | L160 | fold selector 32-fold · đổi fold · Stage A refetch fold đó; hash fold= |
| `S06:T14` | L161 | breadcrumb · click · 04 stage=search giữ fold/trial/pick |
| `S06:T15` | L162 | next-stage · click · 07 nhận hash |
| `S06:T16` | L163 | copy evidence link · click · clipboard portal://…mode&schedule&trial&params; ✓ 1.5s |
| `S06:T17` | L164 | KaTeX bị chặn (mock fail) · load · expr mono fallback; panel sống |
| `S06:T18` | L165 | 660px · resize · 3 cột dọc; freeze line ngang; bảng cuộn trong card |
| `S06:T19` | L166 | axe · scan · pill aria-pressed; surface điểm role=button aria-label "trial {id}…"; 0 serious |

### S07 → P16

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S07:T01` | L110 | clean fixture · load #fold=3 · ORDERING PASS; gap "2m59s"; chain INTACT; bảng fold 3 |
| `S07:T02` | L111 | drift tweak · load · mắt params đỏ; BLOCKED note verbatim; banner đỏ |
| `S07:T03` | L112 | BLOCKED · verify (mock fixed) · INTACT trở lại |
| `S07:T04` | L113 | — · đổi fold ‹ › · refetch; hash; Δ prev đúng |
| `S07:T05` | L114 | global fixture · đổi fold · bảng giữ; banner shared; ordering đổi |
| `S07:T06` | L115 | mode 5 fixture · load · chip full; 1 span; không Δ |
| `S07:T07` | L116 | slider entry_z +0.2 · kéo · ΔJ từ grid; badge preview 1 lần |
| `S07:T08` | L117 | ngoài node lưới · kéo lẻ · snap node gần nhất + "≈" |
| `S07:T09` | L118 | create sibling · click · điều hướng draft 02 (mock); màn không đổi state |
| `S07:T10` | L119 | θ* digest copy · click · clipboard prm_7c1a9e; ✓ |
| `S07:T11` | L120 | breadcrumb/next · click · 04/08 giữ hash |
| `S07:T12` | L121 | 32-fold · dropdown nhóm · chọn fold 17 ok |
| `S07:T13` | L122 | 660px · resize · 2 trục xếp dọc; chain wrap; không tràn |
| `S07:T14` | L123 | axe · scan · slider có aria-valuetext "{v} (ΔJ {d})"; verdict role=status; 0 serious |
| `S07:T15` | L124 | ETag revisit · — · không flash |
| `S07:T16` | L125 | reduced-motion · — · badge không nhấp nháy |

### S08 → P17

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S08:T01` | L134 | close_target fixture · load #fold=3 · banner route; tiles có na nghiêng; panel not_applicable card; ledger kinds đúng subset |
| `S08:T02` | L135 | play 16× · 2s · seq tăng đều; ledger window trượt; playhead 70% khung; không autoscale nhảy |
| `S08:T03` | L136 | click event FILL · — · chain drawer mở đúng seq; copy chain hoạt động |
| `S08:T04` | L137 | intrabar fixture · load · SL/TP pricelines; 7 marker ambiguous; bảng ambiguity; blotter cột ambig |
| `S08:T05` | L138 | lifecycle fixture · — · OCO tree; leg huỷ strikethrough + seq |
| `S08:T06` | L139 | reactive audit · — · wake strip 3 màu nguồn; đếm "214 of 552 (38%)" |
| `S08:T07` | L140 | reactive minimal · — · câu declared-away; không strip |
| `S08:T08` | L141 | dca fixture · — · ladder chain B0→S3 + avg line |
| `S08:T09` | L142 | validation on · — · tab hiện; PARITY PASS → cert L4 text |
| `S08:T10` | L143 | validation off · — · tab ẩn hoàn toàn |
| `S08:T11` | L144 | blotter sort pnl desc · click · server sort; page reset 1 |
| `S08:T12` | L145 | blotter row click · — · seek entry seq; markers highlight; hash trade= |
| `S08:T13` | L146 | scatter click điểm · — · trade row focus (page nhảy đúng) |
| `S08:T14` | L147 | stitched handoff chip hover · — · title digest trước→sau đúng canonical |
| `S08:T15` | L148 | đổi fold ‹ › · — · transport dừng; seq0 mới; hash fold |
| `S08:T16` | L149 | seek slider kéo xa · — · events fetch around; inline loading; không khoá |
| `S08:T17` | L150 | 32-fold · load · strip cuộn snap; fold nav ok |
| `S08:T18` | L151 | tab ẩn khi playing · — · pause + badge; quay lại resume thủ công |
| `S08:T19` | L152 | Space/←/→/Shift+→ · — · play/step/x10 đúng |
| `S08:T20` | L153 | 660px · resize · chain inline dưới ledger; blotter cuộn ngang; không tràn |
| `S08:T21` | L154 | axe · scan · transport buttons aria-label; ledger row button; slider aria-valuetext "bar {n} of {m}"; 0 serious |
| `S08:T22` | L155 | reduced-motion · — · playhead vẫn chạy (chức năng) nhưng highlight không pulse |

### S09 → P18

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S09:T01` | L82 | load · đủ 9 khối đúng thứ tự; no-print bar hiện trên màn |
| `S09:T02` | L83 | print preview · bar biến mất; passport không bị cắt giữa trang; thead repeat |
| `S09:T03` | L84 | fixture 32 fold · bảng flow nhiều trang; không overflow ngang |
| `S09:T04` | L85 | digest chéo màn · 7 digest khớp canonical (test import fixture chung) |
| `S09:T05` | L86 | scratch run fixture · identity: binding "scratch — NOT_PUBLISHABLE"; promotion state "no rc_ can be composed" |
| `S09:T06` | L87 | FAILED run · headline thay bằng "no claim — run failed at {stage}"; stage checks tới điểm fail; artifacts ABORTED in rõ |
| `S09:T07` | L88 | copy diff · mọi câu §2 verbatim |
| `S09:T08` | L89 | axe · landmark đúng; bảng th scope; 0 serious |
| `S09:T09` | L90 | 660px màn hình · một cột co; không tràn |
| `S09:T10` | L91 | equity series lỗi · khung + "series unavailable — numbers unaffected"; phần còn lại in được |

### S10 → P19

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S10:T01` | L85 | load · 2 band av (0_9_3 ACTIVE trước); 6 storied card; probes ẩn; counter "showing 6 of 52" |
| `S10:T02` | L86 | toggle probes · 46 row nhóm tuần; counter "52 of 52" |
| `S10:T03` | L87 | filter ABANDONED · chỉ card/row abandoned; counter đúng |
| `S10:T04` | L88 | click chip att_17 (probe, đang ẩn) · tự bật toggle + expand att_17 |
| `S10:T05` | L89 | diff av card · chip GATES RESET đỏ; không nằm trong diffs thường |
| `S10:T06` | L90 | promotion pick · banner đúng att_04; link 11 |
| `S10:T07` | L91 | rc chip att_04 · ● vàng; click → 11 |
| `S10:T08` | L92 | exercised/untried · untried link → 02 |
| `S10:T09` | L93 | deep-link ?av=av_0_9_2 · band đó mở đầu viewport (không scrollIntoView — dùng scrollTop container) |
| `S10:T10` | L94 | 100-attempt fixture · virtual list probe rows; band chips cuộn mượt |
| `S10:T11` | L95 | 660px · card wrap; spec line xuống dòng; không tràn |
| `S10:T12` | L96 | axe · chips role=button aria-label "attempt att_17 — ABANDONED"; 0 serious |

### S11 → P21/P22

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S11:T01` | L114 | draft bound · chip DRAFT; rail rc vàng draft; YAML rc "(assigned on publish)"; mirror ghost |
| `S11:T02` | L115 | publish click · PUBLISHING → PUBLISHED; rail xanh; mirror PENDING SLA; chip PUBLISHED |
| `S11:T03` | L116 | unbound · banner; node av/rc dashed; publish disabled đúng label; YAML av null đỏ |
| `S11:T04` | L117 | MISSING fixture · hàng đỏ; publish disabled "resolve MISSING rows first"; counter có 1 MISSING |
| `S11:T05` | L118 | DEGRADED hàng 9 · nền vàng; status title đúng; link →06 |
| `S11:T06` | L119 | INPUT edit (draft) · textarea; PATCH; YAML known_limitations cập nhật |
| `S11:T07` | L120 | INPUT sau publish · read-only |
| `S11:T08` | L121 | 409 race · banner đỏ; refetch pack |
| `S11:T09` | L122 | copy yaml · clipboard = join(k: v); ✓ 1.5s |
| `S11:T10` | L123 | taxonomy CHANGED · hàng đỏ; gate verdict "R1 + R2 must run…" |
| `S11:T11` | L124 | mirror poll SUPERSEDED · status đổi + note |
| `S11:T12` | L125 | 12 link nguồn · 10 link đúng màn; Alpha360° không link + title |
| `S11:T13` | L126 | 660px · rail wrap; bảng pack cuộn ngang min 960; YAML cuộn |
| `S11:T14` | L127 | axe · bảng th scope; nút publish aria-disabled kèm lý do (aria-describedby); 0 serious |

### S12 → P09

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S12:T01` | L37 | 3 tab render + hash |
| `S12:T02` | L37 | mode card KaTeX + fallback |
| `S12:T03` | L37 | deep-link 06 đúng mode/schedule |
| `S12:T04` | L37 | route DEFERRED disabled + reason |
| `S12:T05` | L37 | claims đủ 7 + footer |
| `S12:T06` | L37 | manifest thêm route thứ 15 (fixture) → hàng mới tự mọc |
| `S12:T07` | L37 | 660px bảng cuộn |
| `S12:T08` | L37 | axe 0 serious |
| `S12:T09` | L37 | reduced-motion pulse tắt |
| `S12:T10` | L37 | copy diff = 0 |

### S13 → P20

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S13:T01` | L32 | attempts ladder sort đúng bậc |
| `S13:T02` | L32 | trajectory card verbatim |
| `S13:T03` | L32 | markets không overlay + caption |
| `S13:T04` | L32 | pair match render overlay+delta |
| `S13:T05` | L32 | pair mismatch → refusal verbatim, không chart |
| `S13:T06` | L32 | correlation absent note |
| `S13:T07` | L32 | "promotes under weaker claim" đúng |
| `S13:T08` | L32 | deep-link ?runs= từ 01 |
| `S13:T09` | L32 | 660px |
| `S13:T10` | L32 | axe |
| `S13:T11` | L32 | copy diff 0 |

### S14 → P07

| Case | Vị trí đầu tiên trong spec | Nội dung ngắn để định vị |
|---|---:|---|
| `S14:T01` | L61 | upload clean .py · mirror đủ trường parsed; step 2 enable |
| `S14:T02` | L62 | thiếu warmup trong file · mirror missing đỏ; gate 1 FAIL; sau đó SKIPPED |
| `S14:T03` | L63 | failing fixture gate 3 · message digest-unique verbatim; step 3 disabled |
| `S14:T04` | L64 | clean gates · 7 PASS stagger 120ms; step 3 enable |
| `S14:T05` | L65 | register · av_0_3_0 DRAFT; supersedes note; registry strip cập nhật |
| `S14:T06` | L66 | activate · ACTIVE; note rc composable biến mất |
| `S14:T07` | L67 | new run with av_ · 02 Context prefill alpha+av; passport khớp |
| `S14:T08` | L68 | upload 2 file · lỗi single-file verbatim |
| `S14:T09` | L69 | reduced-motion · stagger tắt (render tức thì) |
| `S14:T10` | L70 | axe · dropzone label; gate rows role=list; 0 serious |
| `S14:T11` | L71 | copy diff · verbatim toàn bộ |
| `S14:T12` | L72 | 660px · bảng mirror cuộn; không tràn |

## 25. Danh sách file agent bàn giao khi hoàn tất implementation

Đây là output dự kiến của task implementation, không phải các file đã được tạo cùng guide:

| Nhóm | Nội dung bắt buộc |
|---|---|
| Source/code | Research modules, migrations và tests trong allowlist; dependency locks; protected diff |
| Contracts | Public Research schemas, endpoint map, execution compatibility fixtures, metric/transform registry |
| Storage | Parquet schemas, manifests, migration/backfill/GC/backup/restore runbooks |
| UI | 15 màn với real APIs, source/copy/interaction mappings, screenshots và a11y results |
| Evidence |24 phase reports, full source-test coverage, domain/compatibility/security/resource results |
| Operations | Resource profiles5/8GB, scheduler config, deployment/drain/rollback instructions và measured limitations |

### 25.1. Các đầu ra thêm sau review — nằm trong 24 phase hiện có

| Output | Phase khởi tạo / đóng | Nội dung kiểm tra |
|---|---|---|
| `findings-decision-register.json` | P01/P02; cập nhật mọi phase | FND/COR/DR status, source proof và owner-scope resolution thực |
| `screen-field-matrix.csv` | P01/P02; từng screen; P24 | Mọi field đến raw/transform/store/API/definition/test, availability có nguồn |
| `screen-action-matrix.csv` | P01/P02/P09; từng screen; P24 | Inspection/read/diagnostic/intent/command/prototype và allowed/forbidden effects |
| `cross-screen-scenarios.json` | P02; các phase ở§16.6; P24 | SC-01–SC-24 actual runs/assertions/no-side-effects |
| `optimizer-field-bindings.json` + topology schema | P02/P04/P08/P10 | Canonical values, aliases, units/defaults, budget scope và seed role |
| Selection/audit/intent/count contracts | P02/P03/P04/P16/P19/P21 | Nullable trial, per-fold target, reuse/child audit, reproduce/clone/default diff |
| `warning-definition.json` + metric registry | P02/P13/P15/P16/P20 | DR-02 resolution, categorical/undefined cases, diagnostic≠gate |
| Versioned cursor codecs và replay indexes | P02/P05/P09/P17 | pick/trade/study/seq aliases, original event order và reveal semantics |
| Four-axis capability manifest | P04/P08/P09/P23 | Engine/integration/evidence/admission, source reason và historical release |
| Final closure report | P24 | Old+new tests, matrices populated, actual browser evidence, protected diff và5GB benchmark |

Tên output là đề xuất tích hợp vào docs/contracts hiện có, không yêu cầu tạo service/repo mới. Không cần một “phase25” hoặc một addendum tách rời để làm các nội dung này. Mỗi mục đi cùng implementation/test/exit gate của phase liên quan.

### 25.2. Nhật ký cập nhật của bản V1 này

Giữ nguyên24phase, phase anchors và original test IDs; bổ sung20findings,29COR tổng cộng, DR register, domain contracts, paragraphs cho cả15màn,107test phase mới và24scenario xuyên màn. Sửa trực tiếp các câu cũ dễ hiểu sai: Import “field editor”, cursor thiếu keys, holdout mutation chưa có authority, valid selected=None và heading bốn lớp digest. Các source-test tables gốc vẫn giữ để agent chạy nguyên bản với correction exceptions có ghi nhận.

Không đổi execution ownership, stack, aggregate RAM5–8GB, nguồn authority QuantBT hay phạm vi hi-fi. Những source/authority/copy decisions chưa được source chứng minh vẫn có `VERIFY_SOURCE`/`OWNER_SCOPE_REQUIRED`; tài liệu không ngụ ý đã chạy browser/engine/integration benchmark trong lần cập nhật này.

---

**Điểm kết thúc của Guide V1:** một kế hoạch triển khai có căn cứ, scope rõ và gate có thể kiểm chứng. Kết luận về throughput,5GB capacity, visual fidelity hay production readiness chỉ được đưa ra sau khi agent thực hiện tests và lưu evidence tương ứng.

<!-- Reference definitions: source IDs are navigable shortcuts, not fabricated file citations. -->

[P01]: #src-p01
[P02]: #src-p02
[P03]: #src-p03
[P04]: #src-p04
[P05]: #src-p05
[P06]: #src-p06
[P07]: #src-p07
[P08]: #src-p08
[P09]: #src-p09
[P10]: #src-p10
[P11]: #src-p11
[P12]: #src-p12
[P13]: #src-p13
[P14]: #src-p14
[D01]: #src-d01
[D02]: #src-d02
[D03]: #src-d03
[D04]: #src-d04
[S00]: #src-s00
[S01]: #src-s01
[S02]: #src-s02
[S03]: #src-s03
[S04]: #src-s04
[S05]: #src-s05
[S06]: #src-s06
[S07]: #src-s07
[S08]: #src-s08
[S09]: #src-s09
[S10]: #src-s10
[S11]: #src-s11
[S12]: #src-s12
[S13]: #src-s13
[S14]: #src-s14
[E01]: #src-e01
[E02]: #src-e02
[E03]: #src-e03
[E04]: #src-e04
[E05]: #src-e05
[E06]: #src-e06
[E07]: #src-e07
[E08]: #src-e08
[E09]: #src-e09
[E10]: #src-e10
[E11]: #src-e11
[E12]: #src-e12

[R01]: #src-r01
[R02]: #src-r02
[R03]: #src-r03
[R04]: #src-r04
[R05]: #src-r05
[R06]: #src-r06
[R07]: #src-r07
[R08]: #src-r08
<!-- BEGIN RL-V1.1 GLOBAL-ADDENDUM -->
<a id="v11-delta"></a>
# VII. BỔ SUNG V1.1 — DELTA RSI LÀ CHIẾN LƯỢC NGHIỆM THU THỰC

## 23. Chiến lược tham chiếu, dữ liệu và tính chính xác

### 23.1. Không thay strategy thật bằng mock thuận tiện

Bobby yêu cầu dùng **Delta-RSI Polynomial Alpha đã có trong Portal** để kiểm tra Research Loop. ID được xác minh trong ZIP là `delta-rsi-polynomial-alpha`; spec version `1.0.0`, timeframe mặc định `1h`, input `open/high/low/close/volume`. **Strategy version1.0.0 khác engine release1.1.1, khác Guide1.1.**

Nguồn có sẵn, không đoán tên:

| Thành phần | Source bên trong `awesome-portal-main.zip` | Cách dùng |
|---|---|---|
| Spec | `apps/portal/strategy/specification.py` | Danh tính, structural contract, parameter ranges; đọc chứ không chép một spec khác |
| Kernel | `apps/portal/strategy/main.py` | Protected; không sửa để tạo kết quả đẹp hoặc vừa RAM |
| Kernel checksum | `apps/portal/strategy/PROTECTED_SHA256` | `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d` trong ZIP; verify checkout, không tự đổi expected |
| Public strategy wrapper | `apps/portal/strategy/delta_rsi.py` | `generate_signals`, `build_walkforward_signal`, `warm_up`; giữ semantics/time cutoff |
| Portal adapter | `apps/portal/backend/src/portal_api/strategies/delta_rsi.py` | `DeltaRsiStrategyAdapter`; signal output và parameter validation |
| Registry | `apps/portal/backend/src/portal_api/strategies/registry.py` | Built-in dispatch đúng ID và AlphaVersion binding |
| Tests có sẵn | `apps/portal/backend/tests/test_strategy_adapter.py`, `test_strategy_package.py` | Reuse input mutation/index/golden/lazy import checks; không thay fixtures cho dễ pass |
| Existing package smoke | `apps/portal/scripts/smoke_quantbt_pypi.sh` | Golden synthetic fixture và endpoint tests; **không phải real-market evidence** |

`generate_signals` trả các cột `pos_weight`, `exit_type`, `exit_price` theo contract strategy. `build_walkforward_signal` tạo tape cutoff theo `test_index[-1]`, chỉ trả signal series cho scoring path đó. Không tự kết luận hai đường có cùng exit/accounting semantics; map từng route tới đúng public QuantBT input và so với reference **cùng route/config**, không ép cross-route equity phải bằng nhau.

Kernel/generator vẫn là nguồn signal. QuantBT vẫn là nguồn accounting/optimization. Test oracle không được trở thành engine production thứ hai. Một test-only reference cho công thức derived hoặc một scenario nhỏ kiểm accounting invariant được phép, nhưng không thay raw QuantBT evidence.

### 23.2. Corpus bắt buộc, workload gọn và không cherry-pick PnL

| Profile | Mục đích | Nguồn và quy mô khởi điểm | Điều kiện sử dụng |
|---|---|---|---|
| `DR-SIGNAL` | Contract signal, index, exit surface, input immutable | Golden fixture đang có + một real snapshot được cấp | Golden là synthetic, ghi đúng label; real data có manifest riêng |
| `DR-DIRECT` | Reference thực bằng public QuantBT 1.1.1 ngoài Portal orchestration/projection | Delta nguyên bản, real snapshot, fixed effective params/config | Lưu raw result trực tiếp; không lấy expected từ API đang test |
| `DR-PORTAL` | Same spec chạy qua producer/worker/storage thật | Cùng code/data/route/config với DR-DIRECT | So theo semantic key, không ép run_id/timestamp vận hành giống nhau |
| `DR-TUNE` | Trial/selection/search UI và dữ liệu đầy đủ | 2–3 tham số có nghĩa; khoảng50 trials/study theo explicit topology | Scope budget ghi rõ; không đổi trial count giữa reference và actual |
| `DR-WFO` | Split/OOS/fold/selection/final audit | 3–5 folds khởi điểm nếu dataset/config hợp lệ; all valid requested modes/schedules được bao phủ theo corpus | Không gọi3folds là đủ mọi statistical claim; profile này kiểm integration/domain |
| `DR-AUDIT` | Selected financial output, replay, report, RC | Reuse selected audit đủ evidence hoặc linked QuantBT audit đúng freeze target | Không optimize lại; không tự lấy last-fold params |
| `DR-FAILURE` | Retry/cancel/late worker/disk failure | Bản sao storage và process test cô lập, Delta short run | Không sửa artifact đã publish; không gây lỗi execution hoặc shared infra |
| `DR-COMPARE` | Compare hai attempts thật | Cùng alpha, same comparison key, thay configs có provenance | Không tìm cặp có correlation/profit mong muốn |
| `DR-MULTIUSER` | Read/query/load và fairness | Delta active job + queued intents +20authorized user sessions, persisted evidence | Một heavy slot ở5 GB khởi điểm; không20heavyworkers |
| `DR-ROUTE-SUPPLEMENT` | Capability không được Delta bao phủ | Strategy/tape fixtures khác gọi QuantBT thật theo route | Bổ sung chứ không thay Delta; source synthetic phải ghi rõ |

**Real-market dataset:** ưu tiên snapshot crypto đã có và đã cấp quyền cho thanhvuong, ví dụ BTCUSDT1h nếu catalog thật có. Agent phải resolve qua reader/query contract hiện hành; không tự giả đường dẫn, không đọc `/home/bobby`, không copy archive toàn kho và không dùng Internet data thay reader hợp lệ. Nếu snapshot không được cấp, gửi Bobby một request dữ liệu có scope/time/columns/quota; `BLOCKED_DATA_ACCESS` không phải PASS. Dữ liệu mất/gap giữ nguyên, không forward-fill canonical gaps.

Khởi điểm smoke khoảng2.000–5.000 bars **bao gồm thông tin warmup chính xác** khi đủ strategy activity; nhiều hơn nếu cần để đạt minimum valid samples theo engine. Chọn tập có trades/entries/exits cần cho test, không chọn vì Sharpe cao. Ghi tiêu chí lựa chọn trước, lưu cả thử nghiệm có zero trades/loss/error. Không bắt Delta phải sinh lãi để nghiệm thu đúng logic.

**Fixed params tham chiếu từ test hiện có** (không phải recommendation đầu tư hoặc best params):

```json
{
  "window": 32,
  "rsi_l": 20,
  "signalLength": 9,
  "len_atr1": 10,
  "len_atr2": 42,
  "rvol": 1.6,
  "len_vol": 16,
  "slpercent": 1.3
}
```

Một search space kiểm integration đề xuất trong declaration hiện tại là `window=24..42 step2` (10 giá trị), `rsi_l=14..23 step1` (10), `signalLength=5..14 step1` (10): **1.000 tổ hợp có thể**, không phải yêu cầu chạy1.000 trials. Pin năm tham số còn lại theo fixed config; seed bằng giá trị explicit đã ghi trong test manifest. Khoảng50trials là số thực chạy cho study đã khai báo; WFO/multi-seed cần resolve số study/evaluation thật, không áp50vào từng cấp mà không dự toán. Nếu `optimization_config` khác theo release, dùng public schema đã kiểm tra, không hardcode field đoán.

Không chạy full corpus nặng sau mỗi sửa CSS. Reuse exact immutable Delta evidence khi code/data/engine/config/transform tương ứng chưa đổi. Tests cần active progress, retry, signal computation hoặc changed adapter phải chạy lại phần thực sự liên quan. Reuse phải ghi hash/run reference và invalidation dependency, không dùng output cũ để claim code mới đã compute.

### 23.3. Bốn tầng đối chiếu bắt buộc

**Tầng A — Strategy và direct engine.** Chạy Delta public generator và public QuantBT với manifest đã đóng. Kiểm input không bị mutation, index/timestamp alignment, signal/exit types, execution assumptions, fees/slippage units, valid objective/mode/schedule. Kiểm causal invariants theo input boundary bằng perturbation/truncation tests khi contract tuyên bố. Cùng một code path có thể lặp cùng lỗi, nên thêm structural invariants/negative tests; parity đơn thuần không chứng minh mọi lỗi domain đều không tồn tại.

**Tầng B — Engine → persisted artifact.** So raw result với PostgreSQL/Parquet sau serialize/readback ở process mới. Exact IDs, field availability, nulls, units, schema, per-fold/evaluation scope; không mất failed/pruned records khi đã có trong source. So row counts và selected references với completeness manifest. Logs không thay original ledger.

**Tầng C — Persisted artifact → API.** Query đúng version/revision/scope/cursor. Compare summary/trial/details/series/projections với immutable reference; validate bounds/pagination/filter và no cross-workspace leak. Defined Portal-derived metrics kiểm bằng công thức độc lập từ raw, không đọc chính projection đang bị test làm expected. Luôn giữ source direct metrics và derived metrics khác namespace khi ý nghĩa khác.

**Tầng D — API → browser thật.** API response correct chưa đủ. Assert text/labels/counts/tooltip/table/cursor/data series visible trên UI và layout/interaction đúng hi-fi. Thêm kiểm A→D cho các field quan trọng để tránh backend và FE cùng sai. Chart tests phải kiểm series thật đi vào renderer và thực sự có plot/legend/tooltip hợp lệ; không chỉ `canvas` tồn tại hay app để raw JSON ẩn dưới DOM.

**Numerical tolerance:** IDs/counts/enums/time boundaries/params hashes phải exact theo contract. Với binary64 engine↔storage roundtrip mong exact khi representation giữ nguyên; khác biệt tính toán direct↔adapter chỉ chấp nhận trong tolerance registry đóng **trước** kiểm kết quả, theo field/route. Dùng `abs(actual-expected) <= atol + rtol*abs(expected)` với nonfinite/null xử lý riêng. Không dùng một tolerance “1%” toàn bộ. Mỗi numeric test ghi expected/actual/max_abs/max_rel/first_divergence/time/field/source. Tolerance không áp cho đổi sign/scope/selection/timing hoặc missing rows. Display comparison dùng rounding/unit/locale đã chốt, không so string với raw float tùy tiện.

### 23.4. Traceability bundle và coverage denominator

Mỗi real Delta run dùng nghiệm thu cần manifest ít nhất:

```json
{
  "schema_version": "research.acceptance.delta.v1",
  "profile": "DR-PORTAL",
  "result_status": "NOT_RUN",
  "strategy_id": "delta-rsi-polynomial-alpha",
  "strategy_spec_version": "1.0.0",
  "alpha_version_id": null,
  "strategy_source_digest": null,
  "protected_kernel_digest": null,
  "portal_commit_sha": null,
  "quantbt_release": "1.1.1",
  "engine_package_or_image_digest": null,
  "resolved_backend": null,
  "dataset_snapshot_ref": null,
  "data_digest": null,
  "data_origin": "REAL_MARKET_REQUIRED",
  "effective_spec_digest": null,
  "reference_run_ref": null,
  "portal_run_id": null,
  "artifact_revision": null,
  "browser_build_sha": null,
  "browser_base_url": null,
  "comparison_report_ref": null
}
```

Đây là **template chưa chạy**, null phải được điền bằng thực tế trước PASS. IDs bí mật/private giữ trong authorized evidence store, report được redacted. Không ghi token/password/cookie vào manifest.

Field coverage row cần `screen_id,field_id,conditional_predicate,source_ref,formula_version,api_pointer,ui_locator,expected,actual,unit,scope,revision,test_id,outcome,evidence_ref`. Action coverage cần before/after IDs và forbidden side effects. Đếm riêng tổng required/conditional; **100% required của phase phải có test đã chạy**, conditional phải test đúng condition hoặc `NOT_APPLICABLE_PROVEN` theo capability thật. Một conditional screen chưa implement không được ra khỏi mẫu số bằng cách đổi predicate.

### 23.5. Delta là baseline bắt buộc, không là giấy chứng nhận mọi route

Delta có cấu trúc cụ thể (polynomial degree2, ATR/relative volume filter, hard stop, không trailing stop/take profit trong spec). Không ép nó thành reactive callbacks, options, multi-leg, portfolio, OCO hoặc partial-fill tape để claim coverage. Những màn/fields phụ thuộc routes đó tiếp tục cần supplementary QuantBT workloads đúng contract đã có trong V1.

Zero trades có thể là kết quả đúng, nhưng không đủ test detail drawer có trades. Bổ sung snapshot/case hợp lệ có activity, giữ tiêu chí chọn trung thực. Tương tự Delta không sinh centroid/pruned/invalid case trong lần chạy nhỏ không cho phép bỏ tests của các trạng thái đó; dùng controlled fixtures/test-only runs có label để kiểm UI/contract bên cạnh real Delta happy path. Không đưa synthetic financial numbers vào production hoặc gọi fixture là actual run.

### 23.6. Protected kernel, data access và warm-up

Không sửa `strategy/main.py`, không sửa `PROTECTED_SHA256`, không thay thuật toán để giảm RAM/đổi result. Research-owned adapter có thể tối ưu copies/storage dưới parity gate. Nếu protected kernel là nguồn bug/capability gap, gửi source locator, minimal reproducer và evidence cho Bobby; không patch riêng một bản “gần giống” rồi vẫn ghi cùng digest.

Numba warm-up có thể dùng small synthetic frame như source hiện có. Báo riêng cold start/compile và warm execution; không xóa compile cost khỏi user-perceived time hoặc memory accounting. Build/compiler/browser profile không được tự vượt hạn mức Linux của thanhvuong. Dữ liệu thật chỉ dùng mount/reader đã được Bobby cấp, readonly và không cùng writable runtime artifact với Bobby.

<a id="v11-browser"></a>
## 24. Browser tests bắt buộc — đúng dữ liệu, đủ màn, đúng hi-fi

### 24.1. Ba lane độc lập, không cộng nhầm kết quả

| Lane | Có mock/fixtures? | Dùng để chứng minh | Không chứng minh |
|---|---|---|---|
| `VISUAL_FIXTURE` | Có canonical source fixtures, rõ label | Layout/copy/responsive/error variants ổn định | Real QuantBT integration hoặc accurate PnL |
| `REAL_DELTA_E2E` | Không stub/rewrite first-party research responses | Browser→API→worker→QuantBT→storage→UI với actual Delta result | Mọi route/capability ngoài Delta |
| `EXECUTION_REGRESSION` | Giữ runner/fixtures/gates gốc | Protected execution UI/contract không regress | Quyền sửa execution hoặc chạy mainnet |

Source `apps/portal/frontend/playwright.config.ts` đang mô tả suite visual với Portal endpoints stubbed bằng fixtures; hai build ports4174/4175 và execution preview flags. **Giữ file/config/baselines hiện hành làm regression oracle; không đổi nó để biến mock suite thành real suite.** Tạo config/testDir Research-only mới trong allowlist, `workers:1`/`fullyParallel:false` khởi điểm nếu trong resource cap; chạy lanes tuần tự khi cần. Tên `playwright.research-real.config.ts` là đề xuất NEW, agent phải kiểm namespace trước khi tạo. Không dựa vào `reuseExistingServer:true` để attach nhầm server cùng port.

Real lane cấm `page.route(...fulfill...)`, HAR replay, service-worker mock, fallback seeded API hoặc response rewrite cho requests chứng minh actual result. Theo dõi network được phép; auth/network error injection chỉ trong negative tests gắn label riêng, không đổi expected financial result. Direct-engine reference được tạo ngoài route UI và có digest.

### 24.2. Browser run trên build thật, không chỉ source HTML

`npm run build`/production-equivalent artifact là build để review. Không dùng dev HMR server thay delivered build. Verify browser đang dùng commit/build manifest đúng; hard refresh/navigation không thấy asset từ phase cũ hoặc API trỏ prod. Không tắt auth để Playwright dễ chạy. Credentials test thuộc identity riêng được Bobby cấp; storageState/cookies/traces chứa secrets phải giữ ngoài Git với access/TTL phù hợp.

Viewports theo từng spec gốc; tối thiểu1280/660 và thêm1440 hoặc breakpoint được source yêu cầu. Fonts/assets loaded thật, chart không placeholder; English chrome/copy theo hi-fi, report/handoff tiếng Việt. Animation có thể tắt theo visual lane, nhưng real lane không giả clock điều khiển scheduler/TTL/expiry thành PASS.

Với real values thay đổi, expected DOM lấy từ frozen reference và formatting registry. Visual baseline dùng source state/fixture tương ứng; không cố ép actual market metric bằng số demo. Không mask cả card/chart/table để screenshot xanh. Dynamic-mask nhỏ có inventory/lý do; cập nhật screenshot baseline phải Bobby review, không `--update-snapshots` để chấp nhận regression không giải thích. Cài browser/OS deps thuộc môi trường được cấp; không dùng `--with-deps`/sudo dưới thanhvuong để tự cài hệ thống.

### 24.3. Bộ kiểm xuyên màn từ Delta

| Nhóm màn | Bài kiểm thực bắt buộc |
|---|---|
| 14→02 | Built-in/registered Delta identity, source digest, immutable declaration, new-run effective spec, actual bound version |
| 02→03 | Browser submit,202/run_id, queue/progress/SSE, reconnect, cancel, artifact seal; no fake timer |
| 01/04/09 | Same run/revision/metric scope; library summary→hub→report raw values/formatting đúng |
| 05/06/07 | Fold windows, study/trial IDs, selection/OOS roles, nonselected pick không đổiθ*, verify real |
| 07→08 | Selected/final audit reference đúng, replay state/timing/fees/stop-exit semantics khớp source |
| 10/13 | Attempts vs retries, semantic diff, comparison windows/correlation, source of promotion pick |
| 11 | Pack17fields/12 items, declared restrictions, missing states, unchanged execution publish contract/mirror |
| 00/12 | Navigation/capability manifest pin đúng release, disabled reasons, không sinh compute/mutation từ map/Atlas |

Ngoài happy path: empty/partial/stale/denied/unavailable/failure, invalid preflight, out-of-range params, no-trade/undefined metric, pruned/infeasible trial, missing/corrupt evidence, publication unknown outcome và responsive keyboard/focus. Negative controlled fixture cases không thay real Delta journey.

### 24.4. Assertions và bằng chứng để Bobby kiểm lại

Mỗi UI phase có tối thiểu:

1. **Numeric/domain:** expected/actual/tolerance cho metrics và counts đang hiển thị; direct→API→DOM chain; declared nonapplicable reason.
2. **Interaction:** trước/sau IDs, revision, network writes; click/filter/seek/inspect không mutate frozen data; form commands có validation.
3. **Visual:** screenshots đúngviewport/state cùng hi-fi source locator, copy/layout checklist, chart/overflow/accessibility findings.
4. **Runtime:** console errors/page errors/unexpected4xx/5xx/network/source mismatch, resource sample, browser version/build SHA.
5. **Delivery:** local result và dev-host smoke riêng; artifact/commit active, auth/asset/API checks, rollback target.

Raw Playwright report, trace, video/screenshots, Delta outputs và Parquet không commit vào Git. Lưu vào evidence store/CI artifacts được phép; repository chỉ chứa test code, canonical fixtures đã được phép, small redacted phase-report/checklists/manifest links/hash. Không sửa `.gitignore` hoặc hook để lách rule cấm generated artifact. Reference retention phải đủ cho Bobby review/rebuild; không xóa trace/run ngay sau PASS rồi chỉ để lại link hỏng.

Test report outcomes: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE_PROVEN`. `SKIPPED_REQUIRED` là gate fail; `NOT_APPLICABLE_PROVEN` chỉ khi scope/capability thật loại được test, có source và supplementary matrix giữ required product coverage. Nêu flake/retry history; một test fail rồi pass khi retry không bị xóa khỏi report.

### 24.5. Lệnh triển khai test — không giả script mới đã tồn tại

Commands gốc cần đọc trước: `apps/portal/scripts/test_backend.sh`, `smoke_quantbt_pypi.sh`, frontend npm scripts và `scripts/verify-contributor-workspace.sh`. Script smoke gốc dùng synthetic golden; phase acceptance phải có **runner bổ sung** cho real Delta.

Agent phải cung cấp một entrypoint test NEW, ví dụ `scripts/research-loop-v11/acceptance` hoặc module tương đương trong allowlist, với interfaces được ghi trong report: `reference`, `run`, `compare`, `browser`, `phase-check`, `bundle`. **Đây là deliverable phải viết, chưa phải executable đã có**. Bobby phải có một lệnh tái lập từ commit được bàn giao, không notebook thao tác tay chưa được ghi.

Lệnh browser mẫu chỉ chạy sau khi config mới tồn tại và các quyền/URL đã được cấp:

```bash
# Tại apps/portal/frontend trong workspace thanhvuong được cấp.
# BASE_URL trỏ DEV REVIEW, không production; auth qua cơ chế test được owner cấp.
BASE_URL=https://dev-portal-research.primusspark.com \
  npx playwright test --config=playwright.research-real.config.ts --workers=1
```

Không tự bind port4174/4175/8080 chỉ vì ví dụ gốc dùng chúng. Ports/processes phải do Bobby cấp và kiểm trước khi chạy. Test không được tự dùng Docker socket nếu thanhvuong không có quyền; thiếu môi trường chạy gate thì gửi infrastructure request, không skip hook/gate.

<a id="v11-phase-gates"></a>
## 25. Báo cáo phase, zero debt và review theo cặp

### 25.1. Hiệu lực bổ sung mới nhất

Đối với **thanhvuong**, yêu cầu mới của Bobby siết chặt mọi đoạn V1 cho phép để lại debt: chỉ sang phase mới khi exit gates của phase hiện tại đã PASS, required tests đã chạy, required UI build/browser/dev-host review-ready đã có, và **không còn known unresolved in-scope technical debt**. Không tự dùng mức P2/P3 hoặc chữ optional để carry một việc phase hiện tại chưa xong.

Một nhiệm vụ vốn thuộc phase tương lai, đã được ghi trong dependency plan và chưa được tuyên bố triển khai, không phải debt của phase hiện tại. Tuy nhiên một lỗi phát hiện trong scope đã claim, thiếu evidence bắt buộc, test bị skip hoặc workaround tạm đều chặn. Baseline execution defect được giữ nguyên source và báo Bobby; nếu chặn compatibility gate thì phase BLOCKED, không waiver. Không tự reclassify missing requirement thành future scope.

Plan có thể mô tả công việc song song; với contributor thanhvuong, không dùng đó để bắt đầu phase mới vượt gate. Được chia subtasks/agents **trong phase đang được giao** và cùng boundary/resource cap. Chuyển sang cặp phase tiếp theo sau handoff chờ Bobby review/cho phép; approval hợp lệ cho scope cụ thể không hỏi lại generic approval, nhưng không suy từ campaign direction thành quyền làm bất kỳ phase nào.

### 25.2. Báo cáo từng phase

Report đầy đủ phải có vị trí phase/slice; từng file và `+/-` từ Git thật; công việc thực; contract/QuantBT alignment; UI fields/actions/hi-fi matches; raw test commands/counts/outcomes; Delta run/reference/snapshot/digests; numeric diffs; visual/browser artifacts; resource profile; protected-execution/kernel checks; technical debt register; dev build/URL/SHA; remaining decisions; exact condition for next phase. Ghi trạng thái chưa chạy rõ ràng, không mô tả bằng thì quá khứ một task chưa thực hiện.

Báo cáo V1 gốc vẫn là yêu cầu; file `CLAUDE.md` đi kèm định dạng chi tiết và ma trận nguồn rules. Sau mỗi phase phải có report Markdown. Mỗi **hai** phase hoàn tất tạo/cập nhật PR bàn giao đúng cặp và request Bobby review: (P01, P02)…(P23, P24), tổng12cặp. PR không thay phase report, browser report không thay numeric oracle, owner chưa review không được ghi owner-approved.

### 25.3. Không “nhuộm xanh” kết quả

Cấm sửa golden/reference/expected screenshot/tolerance sau khi thấy actual sai chỉ để test pass; cấm disable assertion, set.only/skip, stub actual API hoặc giảm workload đã chốt rồi báo full acceptance. Có legitimate engine fix/new baseline thì report diff và owner approval theo upgrade workflow, giữ baseline cũ. Lỗi source strategy/engine phải phân biệt với lỗi adapter/storage/UI để sửa đúng scope.

<a id="v11-dev-review"></a>
## 26. Rebuild và dev review ở hostname riêng

### 26.1. Khi nào áp dụng

Ngay phase đầu tiên có UI có thể review (theo plan hiện tại màn14 ở P07; foundation00/12 ở P09), **sau mỗi phase có ảnh hưởng frontend hoặc API/dữ liệu UI**, phải rebuild delivered frontend cùng research services bị ảnh hưởng, publish vào dev environment được cấp, rồi browser-smoke tại `dev-portal-research.primusspark.com`. Không đợi cặp PR hoặc P24 mới có URL xem. Nếu một screen có sớm hơn thì áp dụng sớm hơn.

Các phase trước khi có screen mới vẫn chạy unit/integration/contract harness thích hợp; ghi `UI_NOT_YET_IN_SCOPE`, không tuyên bố screen/browser đã pass. Sau khi dev review gate đã kích hoạt, không có quyền bỏ rebuild vì “phase này chủ yếu backend” nếu dữ liệu UI bị thay đổi. Code không đổi frontend nhưng vẫn build/delivery manifest phải chỉ đúng commit đã review.

**Rebuild không đồng nghĩa quyền reboot/restart stack Portal chung.** Chỉ dùng isolated research-dev release project/namespaces/volumes/DB roles/queue subjects/cookies được Bobby cấp và approved deploy helper. `./scripts/portal` gốc có thể trỏ stack chung; đọc cấu hình, không chạy mù. Không overwrite `portal.primusspark.com` hoặc `dev-portal.primusspark.com`, không shared writable artifacts hoặc cookie domain để credentials dev ảnh hưởng prod.

### 26.2. DNS request chính xác gửi Bobby

ZIP có mẫu Cloudflare Tunnel ở `deploy/cloudflared/config.example.yml`, nhưng UUID thật/runtime topology chưa được cung cấp. **Cấu hình đề xuất dùng Tunnel đã được Bobby chọn**; không đoán UUID/IP:

| Trường | Giá trị gửi Bobby |
|---|---|
| Zone | `primusspark.com` |
| Type | `CNAME` |
| Name | `dev-portal-research` |
| Target | `<BOBBY_APPROVED_RESEARCH_TUNNEL_UUID>.cfargotunnel.com` |
| Proxy | Proxied |
| TTL | Auto |
| Published hostname | `dev-portal-research.primusspark.com` |
| Origin service | `<BOBBY_APPROVED_RESEARCH_DEV_ORIGIN>` reachable from selected connector, không existing execution/prod upstream |
| Authentication | Existing authorized Portal dev/session mechanism và Cloudflare Access nếu Bobby cấu hình; không mở anonymous access hoặc trust header spoof |

Với Cloudflare Tunnel, DNS CNAME trỏ tunnel target không chứa port hoặc URL scheme; published application/ingress mới quyết định origin service [W01]. Tạo DNS record **chưa đủ**: cần route hostname, origin reachable, TLS/auth/cookies, CSP/CORS phù hợp và kiểm browser.

Nếu Bobby dùng một route tunnel riêng, mẫu **owner action only** sau mô tả entry cần thêm vào cấu hình được duyệt, không phải lệnh cho thanhvuong tự chỉnh `/etc`:

```yaml
# Chỉ là entry minh họa; origin và auth config phải được Bobby resolve.
- hostname: dev-portal-research.primusspark.com
  service: <BOBBY_APPROVED_RESEARCH_DEV_ORIGIN>
  originRequest:
    httpHostHeader: dev-portal-research.primusspark.com
```

Không thay toàn bộ ingress hiện có; entry trước catch-all ở local config nếu đó là cách tunnel thật được quản lý. Không copy production Access audience hoặc credentials từ file mẫu. Không đặt `noTLSVerify: true` để chữa lỗi certificate. Origin HTTP chỉ cho private/loopback path do Bobby duyệt; remote origin phải có transport bảo vệ theo topology. Nếu không dùng Tunnel, Bobby cung cấp phương án ingress/IP thật trước khi soạn A/AAAA/CNAME thay thế; không đoán.

`CLAUDE.md` có request packet và quy tắc bootstrap. DNS/proxy/system service chỉ Bobby hoặc automation đã được Bobby cấp quyền rõ ràng thực hiện. Nếu DNS/auth/port chưa sẵn sàng, phase UI ở `BLOCKED_DEV_REVIEW`; gửi một packet hợp nhất rồi chờ dependency, không tự bypass hoặc báo completed.

### 26.3. Rebuild receipt cho mỗi phase

Lưu `dev-review-receipt.json`: phase, commit SHA, lockfile/build/image digests, migration version, dev hostname, activation timestamp, authorized deploy mechanism, health result, actual UI/API build identity, Delta run IDs, screenshot/report refs và rollback artifact. Secrets không nằm trong receipt.

Browser sau deploy kiểm TLS/login, asset404, SPA deep link, API origin/identity, Delta summary/fields, stream reconnect và data scope. Request tới production/execution runtime mutation từ dev test phải bị test harness/allowlist chặn. Handoff ghi URL màn cụ thể và thao tác Bobby cần kiểm, không chỉ trang login.

### 26.4. Hạn mức service khác quyền Linux user

Tổng research services5–8 GB **không tự nâng quota của thanhvuong**. User dev có thể còn giới hạn thấp hơn hoặc không được bind/connect port theo runbook cũ. Agent đọc quyền thực tế; không suy từ Guide ra sudo, Docker, network hay8GB/user. Build/tests/browser cần nguồn lực bổ sung thì xin Bobby cấp isolated runner/approved deployment path; báo riêng build/client/server resources, không chạy lén trên account khác.

<a id="v11-sources"></a>
## 27. Nguồn và kiểm tra việc bổ sung

Các source dưới đây được đọc từ ZIP đã cung cấp; chưa xác minh deployed server hoặc chạy QuantBT/browser trong quá trình soạn V1.1. Registry hashes tự động đính kèm bên dưới. `AGENT.md` số ít không xuất hiện trong archive; file thực tế là `AGENTS.md` ở root và `apps/portal/AGENTS.md`. Không dựng nội dung một file `AGENT.md` không tồn tại.

**Nguồn web kỹ thuật đã đối chiếu khi soạn — không là benchmark kết quả:**

- `[W01]` Cloudflare, DNS records for Cloudflare Tunnel: `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/` — CNAME tunnel target và quan hệ hostname/origin.
- `[W02]` Playwright, Mock APIs: `https://playwright.dev/docs/mock` — network mocking là một lane khác real-backend tests.
- `[W03]` Playwright, Visual comparisons: `https://playwright.dev/docs/test-snapshots` — screenshot comparisons, baseline review và environment sensitivity.
- `[W04]` GitHub CLI, `gh pr create`: `https://cli.github.com/manual/gh_pr_create` — explicit repo/base/head/reviewer; command không chứng minh quyền đã được cấp.

Toàn bộ original V1 fields/phases/source tests/COR/FND/DR được giữ; thêm72 test IDs phase (`V11-P01-DR`…`V11-P24-GX`) theo ba lớp mỗi phase. Conformance runner cần chuyển mô tả test thành assertions có inputs/expected; số lượng test ID là coverage planning, không phải test execution count. Các test nguyên bản ở V1 vẫn bắt buộc.

### 27.1. Registry source V1.1

| Source path trong ZIP | SHA-256 |
|---|---|
| `CLAUDE.md` | `f9af50096cf5e80d68520536ce685a8f996d998670ed47c4c99fc26bddae4740` |
| `AGENTS.md` | `ffb24583d30b51dc11b8c99fceb279fbb1bfd535a2ae34cc4614f86474322316` |
| `CONTRIBUTOR_AGENT_RULES.md` | `d69ce8ed342cc3a48cc85054f30a20fa45800c657748417e14543b6fc475bb5e` |
| `apps/portal/AGENTS.md` | `05d2e0f558e155ee4913fc8c0b114718a1ef65fe1add06789b2742669818ec3f` |
| `apps/portal/strategy/specification.py` | `3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730` |
| `apps/portal/strategy/delta_rsi.py` | `6b337a342d56a26db71a09c43bed72a8b9110d7561132f4d6eec08d9aadd8edf` |
| `apps/portal/strategy/PROTECTED_SHA256` | `3d7f0520defd55acddcf21bfde2fcca34b7aabbf26e5413eb7cd5c4e90c684d9` |
| `apps/portal/strategy/main.py` | `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d` |
| `apps/portal/backend/src/portal_api/strategies/delta_rsi.py` | `bc096381759429eb63dab887a6c37040a98e55754adf6bb07bb6336c23f9a731` |
| `apps/portal/backend/src/portal_api/strategies/registry.py` | `6e4e7c4c33aff1623a7b99154e9e67bb89d9a6edea3b77319d4e5aae80b0250d` |
| `apps/portal/frontend/playwright.config.ts` | `8157691d4e7611e0f8f8a7d285e9c3ef9e1fa1cdec6d6e6ebd2c5405ae6430db` |
| `apps/portal/frontend/package.json` | `9120f2903cb786dcfa120801a878aac76d64d560683486886d8f1c8789261f34` |
| `apps/portal/scripts/smoke_quantbt_pypi.sh` | `79bb54d7870fb23598c3cdb93d7bd83f34d0b2928b51b4dfcbf6c80573a1e6a7` |
| `apps/portal/backend/tests/test_strategy_adapter.py` | `336d736ded64301bab1a9e431039f648f136cab864b3efcec5d524b2f69ec1d8` |
| `apps/portal/backend/tests/test_strategy_package.py` | `81f945ff9970840e24da1853a1a411ccdcfacc909207b0eb836bf99588f0b361` |
| `scripts/verify-contributor-workspace.sh` | `9f87e8cc04c8559746b64cda73e86f46276138d7bd4f34d0c116f5a56d979bae` |
| `.githooks/lib/access-policy.sh` | `f2d9b68d9a6b62a129010b41951a9d17df85d9f3aea5c4fb9db8b9907e3ba1bf` |
| `deploy/cloudflared/config.example.yml` | `847438c44bb2c078f4b7e04ba747ff9f7220318d8c48b90e7e855fe3fa57101b` |
| `deploy/nginx/portal-loopback.conf` | `9c8ba6a4dcff8cbabac599574d60fd1160ab2532b09f99122b848f8a6fd8e5aa` |
<!-- END RL-V1.1 GLOBAL-ADDENDUM -->
