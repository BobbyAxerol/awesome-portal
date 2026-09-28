# RESEARCH_DEV_ACTIVATION_REQUEST — FG slice 1 (FG-02, FG-03 và nửa real của FG-01/04/05/06/07)

**Trạng thái:** `BLOCKED_BY_RUNTIME` · **Người yêu cầu:** Thanhvuong (frontend, gói FG) · **Người quyết:** Bobby · **Ngày:** 2026-09-28 · **Candidate:** `feat/gap_frontend_thanhvuong` @ `8783461e` + code slice 1 đã commit (`b896d98d`, `f0f7cc3d`, `e4b9447e`; commit tài liệu này: xem `git log`).
**Căn cứ:** `upgrade/research_loop/CLAUDE-FOR-thanhvuong.md` A7.2 — chỉ deploy qua helper/CI/job Bobby đã cấp; thiếu helper thì gửi request này với exact requirements, patch proposal, rollback. Thiếu DNS/auth/permission là `BLOCKED_DEV_REVIEW`, không phải quyền mở port public hay tắt auth. Không dùng rootless container để vượt giới hạn.
**Nguồn khảo sát:** `~/tv-shots/fg/plan/R2-runtime.md` (recon chỉ đọc, 2026-09-28) và `~/tv-shots/fg/plan/RUNTIME-GRANT.draft.md`.

Request này không xin quyền sửa infra chung. Không đổi `portal.primusspark.com`, `dev-portal.primusspark.com`, nginx, cloudflared, `/etc`, systemd, firewall, DNS, shared Compose; không đụng cell/port/volume của người khác.

## 1. Lane hiện có và lane đang chặn

| Lane | Trạng thái | Ghi chú |
|---|---|---|
| `COMPONENT_FIXTURE_BROWSER_RECEIPT` | chạy được | `vite preview` của chính thanhvuong ở 127.0.0.1:4417, node_modules và Chromium 1234 trên host |
| `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) | chạy được | cùng preview 4417; không phải data thật |
| Unit (vitest) | chạy được | slice 1: FG-04a, FG-05 unit lane PASS |
| `REAL_API_E2E_RECEIPT` | **`BLOCKED_BY_RUNTIME`** | không có cell riêng build từ HEAD (G1–G5) |
| axe (4 probe + `axeBlocking()`) | **không chạy** | `@axe-core/playwright`, `axe-core` thiếu trong node_modules cũ (G6) |
| Visual pinned image | **không chạy** | image chưa có trong store rootless; chính sách chưa xác nhận (G7) |

## 2. Trạng thái theo FG

| FG | Việc | Nửa fixture / unit (slice 1) | Nửa real | Chặn bởi |
|---|---|---|---|---|
| FG-01 | audit S00–S14 | A1/A2/A3 accepted, fixture lane (FG-01-screen-audit-matrix.md) | `BLOCKED_BY_RUNTIME` — chưa có quan sát real cho hàng nào | G1, G4 (+ G6 cho axe) |
| FG-02 | real-API lane 54/54 + P22 | không áp dụng (chỉ phần fixture của cell) | `BLOCKED_BY_RUNTIME` | G1, G2, G3, G4 |
| FG-03 | S02 create/preflight, S14 parse→gates→register→activate | fixture test phải giữ xanh; không phải receipt | `BLOCKED_BY_RUNTIME` | G1–G5 |
| FG-04 | S13 ladder (a), S08 caption (b), S09 print (c) | (a) unit lane PASS; `VERIFIED — COMPONENT_FIXTURE_BROWSER_RECEIPT` (B G1; 3+1 ở 1280 khớp HiFi 13, giữ nguyên theo quyết định D-1); resolver S13 sửa trong slice, `VERIFIED — fixture lane` · (b)(c) PASS fixture lane 11/11 (A5), chạy lại B G6 dưới tên spec mới: 11 passed / 0 failed (`g6-fg04.log` `a7c9500458129de8`) | `BLOCKED_BY_RUNTIME` | G1, G4; visual G7 |
| FG-05 | P22 consumer S01/S02/S10/S11 | unit lane PASS; `VERIFIED — fixture lane` cho S01 (B G3 20/20), S02 (B G4 24/24), S11 (B G5 PASS mọi tiêu chí product: 38 test, 35 pass, 3 chỉ bị bộ lọc console của harness đánh fail vì thiếu 422); S10 không đổi code (A6 G4 MATCH, `VD-FG-05-05`) | `BLOCKED_BY_RUNTIME` | G1 (cờ P22 publication như overlay `p22-publication.sh`), G4 |
| FG-06 | D1-O1 `display_label` | packet `CG-FG-D1-O1`; typed absence giữ nguyên | chờ Codex giao contract, sau đó `BLOCKED_BY_RUNTIME` | Codex, rồi G1 |
| FG-07 | visual baseline + P23 runner | P23 runner trên 4417 B G7a 14 passed / 64 failed — cả 64 là ENOENT journey-v2 ở `e2e/fixtures.ts:262` (fixture đã xoá ở `8d5dd579`); không fail nào do slice; tín hiệu yếu; findings T1–T17 (FG-01 §6) | visual pinned và real `BLOCKED_BY_RUNTIME` | G7; G1 |

## 3. Yêu cầu chính xác

| # | Cần | Bằng chứng thiếu (locator) | Loại | Ai |
|---|---|---|---|---|
| G1 | Một research cell build từ `8783461e` (hoặc commit slice 1 khi Bobby merge), port loopback riêng — không 8080/8081/8090/8095/8096/18081/4317–4320/55432; ứng viên 8097 hoặc 8098 (mặc định của overlay p22/e17, hiện trống) — migration head 076, cờ P22 publication, DB/volume/project name riêng | `scripts/research-preview/preview.sh` mặc định 8095 (`:50`); `scripts/research-p23/cell.mjs:10-11` hard-code 8096 và `:31` state dưới `/home/bobby` (`validateHome` `:33-40`); thanhvuong không thuộc group `docker` | (a) Bobby quyết; (c) infra | Bobby build, hoặc cấp helper hẹp cho contributor |
| G2 | HMD wheel cho cell | `vendor/hmd-reader` chỉ có README; `preview.sh`/`p22-publication.sh:78-79` cần wheel | (c) source | Bobby |
| G3 | AppArmor profile `portal-research-child` (nạp bằng sudo) hoặc phương án thay đã duyệt | daemon rootless của thanhvuong có `seccomp, rootless, cgroupns`, không apparmor; contributor không sudo | (a) Bobby quyết; (c) infra | Bobby |
| G4 | Identity test (actor researcher, và ADMIN nếu cần cho S14 activate) + credential một lần trong thư mục 0600 của thanhvuong; run P04/WFO đã seed | spec `e2e/_preview-research-real-api.spec.ts:17-21`, `:152` đọc `~/.config/portal-research-preview/{claude-preview.password,seeded-run.json,seeded-wfo-run.json}` — thanhvuong không có | (a) Bobby quyết | Bobby |
| G5 | Stack **writable isolated** cho FG-03 + quyền cleanup/thu hồi identity sau lane | preview hiện read-only (Unified F5 :3809); lane "real-API" cũ stub ghi S11/S14 bằng `page.route` (spec :447, :455, :460, :539–541, :947) nên không tính là write receipt | (a) Bobby quyết | Bobby |
| G6 | Cho phép `npm ci` trong `apps/portal/frontend` theo lockfile HEAD | lockfile HEAD thêm `@axe-core/playwright` 4.13.0 và `axe-core`; node_modules cài 2026-09-23 thiếu cả hai | (a) Bobby quyết; (b) agent chạy được khi được phép | Bobby OK, Thanhvuong chạy |
| G7 | Xác nhận contributor được chạy `./scripts/portal-web-visual.sh` bằng docker rootless và pull `mcr.microsoft.com/playwright:v1.62.1-noble` (ghim tag, chưa có trong store) | handoff FG-07 yêu cầu script; rules A1/A7.2 cấm dùng rootless để vượt giới hạn — cần Bobby nói rõ đây không phải vượt giới hạn; script không publish host port, bind rw repo | (a) Bobby quyết; (b) agent chạy được khi được phép | Bobby OK, Thanhvuong chạy |

## 4. Phân loại

**(a) Bobby quyết**
- Cấp cell riêng hay cấp helper (G1); port nào.
- AppArmor profile hay phương án thay (G3).
- Identity/credential test và seeded runs (G4); stack writable + cleanup (G5).
- `npm ci` cho axe (G6); rootless visual + pull image (G7).
- Có cần hostname dev-review theo A7.3 không. Request này không xin DNS; nếu Bobby muốn review qua hostname thì dùng mẫu A7.3 do Bobby điền tunnel UUID/origin — thiếu thì là `BLOCKED_DEV_REVIEW`.

**(b) Agent làm được trong phạm vi, không cần grant**
- Fixture/unit lane trên 4417 (đã chạy: gói B, `~/tv-shots/fg/final/B-report.md` `a8a5b3f59739fd0d`).
- P23 runner trên 4417 với `RESEARCH_QUAL_BASE_URL=http://127.0.0.1:4417`.
- `scripts/control-api-test.sh` (PG cell dùng một lần, image ghim digest đã có, mạng internal, không host port) — chỉ là test API/DB, không phải browser write stack.
- Print Letter/A4 bằng `page.pdf` trong fixture lane (FG-04c).
- Sau khi có G6/G7: chạy axe và visual pinned; sau khi có G1/G4/G5: chạy real lane và viết receipt A7.4.

**(c) Phụ thuộc source/infra**
- HMD wheel (G2) — source không có trong repo.
- AppArmor (G3), group docker / sudo (G1) — infra host.
- Contract Codex cho FG-06 (`CG-FG-D1-O1`) và các `CG-FG-*` khác (FG-backend-requests.md) — không chặn cell nhưng chặn exit gate real của màn liên quan.

## 5. Patch proposal (chỉ đề xuất — Bobby hoặc Codex quyết, Thanhvuong không sửa file nào dưới đây)

1. `scripts/research-p23/cell.mjs`: cho `PROJECT`, `BASE_URL` và `STATE_ROOT` đọc từ env có kiểm tra (port nằm ngoài danh sách cấm như `p22-publication.sh:16`, state root dưới `$HOME` của người chạy), mặc định giữ nguyên giá trị hiện tại để không đổi hành vi của Codex/Bobby.
2. Hoặc một wrapper mới `scripts/research-preview/contributor-cell.sh` theo đúng mẫu `p22-publication.sh`: project `portal-research-fg-thanhvuong`, port mặc định 8097, FORBIDDEN_PORTS giữ nguyên, env file 0600 dưới `$HOME/.config/portal-research-fg/`, sinh secret ngẫu nhiên, seed identity + run bằng `seed-run.mjs` trỏ vào thư mục đó.
3. `playwright.research-preview.config.ts`: đọc thư mục credential từ env (ví dụ `RESEARCH_PREVIEW_CONFIG_DIR`) thay vì cố định `~/.config/portal-research-preview/`, để spec real lane chạy được với identity của contributor mà không đọc file của Bobby.
4. Không đề xuất đổi nginx, cloudflared, DNS, systemd hay compose chung.

## 6. Receipt sẽ nộp khi được cấp

Mỗi lần activate: receipt `research.dev-review-receipt.v1` theo A7.4 (commit SHA, frontend/API build digest, lock digest, cơ chế deploy được cấp, run id, browser report ref, rollback ref). Cho tới lúc đó mọi ô real trong Unified §13 và FG-01 giữ `BLOCKED_BY_RUNTIME`; không ghi VERIFIED.

## 7. Rollback

- Cell riêng: dừng và xoá bằng chính helper đã cấp (project/volume/network mang tên riêng); không `docker compose down` ở root, không `prune`, không `rm -rf` ngoài state dir của cell.
- Identity test: Bobby thu hồi; credential file 0600 xoá khỏi home của thanhvuong.
- Image visual đã pull: xoá khỏi store rootless của thanhvuong nếu Bobby yêu cầu.
- node_modules sau `npm ci`: khôi phục bằng `npm ci` trên lockfile trước đó nếu cần; không commit gì từ node_modules.
- Không đụng cell/port/volume của người khác (8080, 8081, 8090, 8095, 8096, 18081, 4317–4320, 55432).
