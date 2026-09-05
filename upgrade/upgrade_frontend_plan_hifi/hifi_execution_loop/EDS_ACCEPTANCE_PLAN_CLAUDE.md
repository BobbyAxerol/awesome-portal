# Kế hoạch nghiệm thu EDS — của Claude (consumer-side), từng phase một

Lập: 2026-09-04 · Chủ: Claude · Đầu vào từ codex · Chữ ký cuối: Bobby.
File chị em: `EDS_FRONTEND_DATA_CONTRACT_TRACKER.md` (ma trận màn §2, DR, OR).
Mỗi phase dưới đây là MỘT PHIẾU cùng khuôn: Input → Bước chấm → Tiêu chí
ĐẠT → Link → Trạng thái. Chữ ký nghiệm thu ghi vào bảng §A0 và cột §4 tracker.

---

## A0. Bảng tổng — nhìn một phát biết đến đâu

| Phiếu | Chấm cái gì | Kích hoạt khi | Trạng thái 04-09 |
|---|---|---|---|
| **L1** | Contract đầu vào (E7 pack ↔ ma trận màn) | pack tồn tại | ✅ **ĐÃ CHẤM** — 126/126 dòng, 5 bucket (tracker §7) |
| A-01 | EDS-01 vertical đầu (named op deployment) | codex giao op+fixture | ⬜ chờ giao |
| A-02 | EDS-02 generated contracts | types+enum-map giao | ⬜ chờ giao |
| A-03 | EDS-03 ba màn stage | từng màn một | ⬜ chờ giao |
| A-04 | EDS-04 bốn màn resource | từng màn một | ⬜ chờ giao |
| A-05 | EDS-05 derivations+governance | từng op một | ⬜ chờ giao |
| A-06 | EDS-06 mirror/index cutover | dual-read bật | ⬜ chờ giao |
| A-07 | EDS-07 chart DTO | DTO đầu tiên | ⬜ chờ giao (FE-side: chartTheme.ts tôi tự khởi công — xem A-07b) |
| A-08 | EDS-08 asks packet | packet hợp nhất | ⬜ (hạ blocker theo OR-1) |
| A-09 | EDS-09 observation-lane | reducer đầu ra đầu tiên | ⬜ chờ codex commit WIP |
| A-10 | EDS-10 replay/candles | contract chấp nhận | ⬜ xa |
| A-11 | EDS-11 SSE + action graph | kênh SSE v2 | ⬜ xa |
| A-12 | EDS-12 release | gói release | ⬜ xa |

**ĐANG Ở ĐÂY →** L1 xong; harness sẵn sàng; phiếu kế tiếp là **A-01, SLA: tôi
chấm trong ≤1 ngày kể từ khi codex giao**. Không phiếu nào chấm gộp; mỗi
phiếu ký xong mới tính phase DONE (OR-2).

## A1. Bộ đồ nghề chấm (đã dựng và đã chứng minh 03-09)

1. **Probe session**: user `claude-probe` (USER role) đăng nhập thật → curl
   từng route đúng như browser (đã bắt 30D/2-ngày, cap-200, 5.9MB).
2. **Bộ lệnh chuẩn mỗi phiếu**: `curl route → jq` kiểm shape; đếm byte
   (`%{size_download}`); đối chiếu giá trị money string-exact với SQL mirror;
   screenshot Playwright-docker khi phiếu có yếu tố visual.
3. **Sổ ghi**: kết quả từng phiếu ghi NGAY vào phiếu đó ở file này + lật ô
   ma trận tracker §2 tương ứng + (nếu trượt) mở DR mới.

## A2. Các phiếu chi tiết

### Phiếu A-01 — EDS-01: named op đầu tiên (`maximumDataDeploymentPageV1`)
- **Input từ codex**: route BFF + fixture + field-map cũ→mới cho Paper list.
- **Bước chấm (đúng thứ tự)**: (1) fixture decode qua generated type không lỗi;
  (2) probe route thật 3 profile × {empty/populated/partial}; (3) so từng
  field với field-map — không field nào READY+null; (4) negative: sai
  audience/profile → 4xx đúng mã; cursor Portal không chứa source cursor
  (base64-decode kiểm); (5) 1/10 request song song → upstream không khuếch
  đại (đếm qua log edge); (6) byte ≤ ngân sách khai báo.
- **ĐẠT khi**: 6/6 xanh + ô `deployments` các màn liên quan ở tracker §2 lật ●-qua-named-op.
- **Link**: bucket A (§7 tracker) · DR-11 vế lane-FE · OR-2.
- **Trạng thái**: ⬜ chờ codex giao. [Kết quả chấm: —]

### Phiếu A-02 — EDS-02: generated contracts
- **Input**: OpenAPI/types vào `packages/contracts/generated` + bảng map enum
  panel-state ↔ U02 + envelope tách serving/population (DR-04).
- **Bước chấm**: (1) `npm run generate` tái lập digest khớp; (2) enum map phủ
  đủ 7 state U02, không state mồ côi; (3) DR-04: fixture PARTIAL-population
  nhưng serving-COMPLETE render chrome `ready` + caption truncated; (4) FE
  build+test xanh sau khi thay 1 shape tay đầu tiên.
- **ĐẠT khi**: 4/4 + DR-04 đóng.
- **Trạng thái**: ⬜. [Kết quả: —]

### Phiếu A-03 — EDS-03: Paper/Sandbox/Live stage screens (chấm TỪNG MÀN)
- **Input mỗi màn**: named ops + field-map + fixtures.
- **Bước chấm mỗi màn**: (1) probe route: đủ mọi panel §2 của màn đó có
  data/typed-reason; (2) so ô ma trận: ô ✗ của màn phải hết (Paper Overview:
  chart hero full-range thay cap-200 — nếu codex tới trước DR-09 của tôi);
  (3) Live: bảng rỗng phải `EMPTY·COMPLETE` không phải unavailable; (4) byte
  budget từng route; (5) screenshot đối chiếu hi-fi (bố cục không đổi).
- **ĐẠT khi**: cả 3 màn ký riêng; ma trận §2.1–2.3+2.9–2.10 hết ✗.
- **Trạng thái**: ⬜ ×3. [Paper: — | Sandbox: — | Live: —]

### Phiếu A-04 — EDS-04: Alpha/Portfolio/Account/Binding (TỪNG MÀN)
- **Bước chấm thêm đặc thù**: khóa định danh đúng §1 tracker (không heuristic
  — thử deployment nằm NGOÀI trang đầu vẫn mở được 360); tên hiển thị từ
  entity-registry; mixed-currency fail-closed.
- **ĐẠT khi**: 4 màn ký; §2.5–2.8 hết ✗/⏳ phần local.
- **Trạng thái**: ⬜ ×4.

### Phiếu A-05 — EDS-05: 5 derivations + governance/ops
- **Bước chấm**: golden vectors từng formula (tôi tự tính lại bằng exact
  decimal độc lập); partial/stale lan truyền đúng; redaction dead-letter
  (bucket D) không lộ raw; mọi route governance/ops probe xanh.
- **ĐẠT khi**: 5 formula + 8 màn governance/ops ký.
- **Trạng thái**: ⬜.

### Phiếu A-06 — EDS-06: mirror/index cutover
- **Bước chấm**: (1) DR-01 phải có tuyên bố absorb/replace TRƯỚC khi chấm;
  (2) dual-read parity: old vs new cùng câu hỏi — diff = 0 trên mẫu tôi chọn
  (mẫu giấu trước); (3) cắt từng màn: sau cắt, probe lại toàn bộ phiếu A-03/04
  của màn đó PASS y nguyên; (4) rollback thử 1 màn: quay lại đường cũ không
  mất dữ liệu.
- **ĐẠT khi**: parity 0-diff + A-03/04 re-pass + rollback chứng minh.
- **Trạng thái**: ⬜ (mirror hiện tại của tôi là baseline so sánh).

### Phiếu A-07 — EDS-07: chart DTO  ·  A-07b — việc FE tôi tự chạy
- **A-07 chấm**: DTO đúng MỘT từ vựng downsample (DR-05); extrema/gap/first/
  last bảo toàn (tôi seed mẫu có bẫy — đường đơn điệu vs zig-zag như bài học
  fixture 03-09); `scale_mode` tôn trọng (không client clamp); budget điểm
  theo viewport; alpha/portfolio/stage chart routes probe + screenshot.
- **A-07b (không chờ codex)**: `chartTheme.ts` + `PrimusFinancialChart`
  component theo OR-3, ăn tạm serving hiện có; khi DTO tới chỉ đổi adapter.
- **ĐẠT khi**: mọi ô chart §2 lật ●; artifact-look tái hiện trên portal thật.
- **Trạng thái**: A-07 ⬜ · A-07b ⬜ tôi khởi công sau DR-09.

### Phiếu A-08 — EDS-08 (đã hạ blocker theo OR-1)
- **Chấm duy nhất**: packet asks hợp nhất = đúng BR-EX-79 A–E, một kênh
  (DR-07); không phase nào tuyên bố chờ nó.
- **Trạng thái**: ⬜.

### Phiếu A-09 — EDS-09 observation-lane (theo OR-1)
- **Bước chấm**: (1) đầu vào là observation (mirror/drain) — KHÔNG chờ
  source journal; (2) nhãn `PORTAL_OBSERVATION` đúng chỗ, không giả danh
  source event; (3) reducer output đối chiếu SQL trực tiếp trên mirror (tôi
  chạy độc lập); (4) mất/dedupe: bơm trùng + đứt quãng qua restart worker —
  không mất, không double.
- **ĐẠT khi**: 4/4 + một màn thật tiêu thụ output qua lane FE.
- **Trạng thái**: ⬜ — chờ codex commit WIP (+264/−21) để có cái mà chấm.

### Phiếu A-10/11/12 — replay+candles / SSE+actions / release
- A-10: candle DTO + renderer OR-3 (⚖ attribution); replay xấp xỉ OR-1b có
  nhãn typed đúng ô thiếu. A-11: SSE resume/gap/100-client + revision-tick
  cho motion (DR-06) — tôi giả lập đứt mạng/chậm client; action graph đi đủ
  mọi nút. A-12: tôi nộp Bobby gói bằng chứng browser-matrix toàn màn.
- **Trạng thái**: ⬜ ×3.

## A3. Luật vận hành kế hoạch này

1. Mỗi phiếu chấm trong ≤1 ngày từ lúc codex giao; trượt → DR mới + codex sửa
   trong phase đó, không nợ sang phase sau.
2. Kết quả (PASS/FAIL + bằng chứng) ghi vào đúng phiếu ở file này — Bobby đọc
   MỘT file biết toàn cục; tracker §2/§4 lật ô tương ứng cùng commit.
3. Thứ tự chấm = thứ tự codex giao; không chấm chay khi chưa có vật giao —
   trừ L1 (đã xong) và A-07b (việc FE độc lập).
