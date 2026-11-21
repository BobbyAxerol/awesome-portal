# P23 — Thanhvuong backend request receipt (resource, security, recovery, upgrade qualification)

Receipt này gom mọi việc P23 cần từ backend (@codex) và từ Bobby (provisioning).

- Receipt chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md). Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json), [thanhvuong-debt-register.json](./thanhvuong-debt-register.json). Rollback: [thanhvuong-rollback.md](./thanhvuong-rollback.md). Handoff P24: [frontend-handoff-claude.md](./frontend-handoff-claude.md).
- **P23 là qualification phase:** deliverable là evidence đo được + runner đã commit, không phải product code. Không có migration, flag, service hay file `src/` nào đổi trong P23. Vì vậy receipt này chỉ có request (§1) và bảng lane bị chặn (§2). Không có mục "backend đã làm" cần Bobby review như P22.
- **Ngoài D3:** theo D3 (`0fa3c385`), P22+ là việc của Codex. Quyết định Bobby 2026-09-25 (`DECISIONS_BOBBY_2026-09-25.md` trên baseline `1ff3f2d4`) không nhắc D3 cho P22+ và không nhắc P23. P23 bản này do Thanhvuong (Claude) làm theo chỉ đạo của Vuong ("tiếp tục làm P23 theo các rules cũ"), nên mọi artefact P23 là `REQUIRES_BOBBY_DECISION` (`B-P23-01`).

**Ngày kiểm:** 2026-09-25. Nơi kiểm: nhánh `feat/thanhvuong/research-p17-p21`, head đo lane cell/static `29feefb8` (A2); head đo lane browser = commit runner `35d0c861` (B). Numstat ghi ở [receipt §2](./thanhvuong-frontend-receipt.md). Baseline `primus-origin/docs/research-loop-plan` = `1ff3f2d4` lúc plan, `33c46b84` lúc đóng packet; merge-base `a5455848`.

Kết quả kiểm baseline (lúc plan):
- Từ lúc đóng packet P22, baseline đi `85c1b113 → ad7491cf` (P06 worker seccomp/AppArmor, `CG-RF02-01`) `→ 1ff3f2d4` (`DECISIONS_BOBBY_2026-09-25.md`). Hai commit này không chạm P23, release-candidate, contracts hay `evidence/P21|P22` của nhánh này. Không có `evidence/P23` ở đâu.
- Baseline vẫn ghi P21/P22 là packet của Codex. P21 + P22 của nhánh này vẫn chưa merge.
- Baseline quan sát sau `git fetch` lúc đóng packet (C2): `33c46b84`, tức 27 commit sau `1ff3f2d4` (W5a/W5b/W5c/W6a: Screen 07/08/09/11/13, P16/P17/P18/P20; 196 file +22922/−1011). Unified trên baseline không đổi (dòng P23 vẫn `PLANNED / unassigned / —`), vẫn không có `evidence/P23`. Baseline có thêm `evidence/P21/W5C_S11_CLAUDE_2026-09-25.md` và sửa vài file là locator của VD/debt P23 (`freezeClient.ts`, `reportClient.ts`, `runLibraryClient.ts`, `RunLibrary.tsx`, cùng `ReleaseCandidateDetail.tsx` / `releaseCandidateClient.ts` riêng của baseline). Mọi số P23 đo trên `35d0c861`. Phải đo lại S01 và VD-P23-01/03 trên cây đã tích hợp (`B-P23-05`). Không có request backend mới từ thay đổi này.

Luật ghi (CLAUDE.md §5): mỗi request có locator, actual, expected, đề xuất nhỏ nhất, test khi có, fallback đang chạy. Đề xuất chỉ là đề xuất; Codex quyết. Request provisioning do Bobby quyết.

## 1. `CG-P23-*` — cần từ backend (@codex) / Bobby provisioning

### CG-P23-01 — stack Research qualification cô lập cho contributor

```text
Provisioning request (Bobby; @codex biết) — 2026-09-25
- Endpoint/field cần: không phải endpoint. Cần một stack Research cô lập (compose project riêng:
  portal-api + control-api + PostgreSQL + NATS + MinIO + quant-worker-py), cấp loopback port,
  env file host-bound ngoài checkout, image build receipt, và một cgroup scope để đo aggregate
  5,000,000,000 bytes (gồm DB/queue/query/native/pagecache)
- Lý do: P23-T01/T03/T04/T07/T08/T12/T13 và nửa stack của T02/T11/T15, V11-P23-DR, các lane
  delta-real-data / direct-vs-portal / api-vs-ui / browser-real đều cần stack Research thật
- Ảnh hưởng hiện tại: các test đó BLOCKED (typed), không NOT_APPLICABLE, không mô phỏng
- Đề xuất: Bobby dựng stack cho contributor, hoặc Bobby tự chạy các lane bị chặn bằng runner đã
  commit + scripts/control-api-test.sh (B-P23-02)
```

| Mục | Nội dung |
|---|---|
| Locator | `scripts/research-preview/preview.sh` + `deploy/research-preview/*` chỉ có trên baseline `1ff3f2d4`, không có trên nhánh này. Stack cần `sudo apparmor_parser`, env file có secret nằm ngoài checkout, 4 image build và một loopback port |
| Actual | Luật contributor cấm sudo, cổng mới, restart shared service và `/home/bobby`. Không được nạp preview của Bobby ở 4317–4320. Contributor chỉ chạy được cell PostgreSQL dùng một lần (`scripts/control-api-test.sh`) và fixture lane trên preview riêng 4417 |
| Expected | Một stack chạy được cả workload W01–W10 (Guide §16.2) với cgroup riêng để đo tổng memory, disk/FD/I/O và queue theo §16.3 |
| Test khi có | P23-T01…T04, T07, T08, T11 (aggregate), T12, T13, T15 (cold cache), V11-P23-DR, W01–W10 |
| Fallback | Test `BLOCKED` kèm lý do. Evidence hiện có: cell PG thật (persistence-vs-api) + fixture lane (visual-fixture, chỉ client cost) |
| Owner / state | Bobby (provisioning) / OPEN |

### CG-P23-02 — kiểm cô lập export / file / artifact (nửa sau P23-T05)

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: test cô lập IDOR/cache/file/export trên artifact store (MinIO) và đường export,
  chạy trên stack của CG-P23-01
- Lý do: P23-T05 đòi "IDOR/cache/files/exports tenant isolation"; cell chỉ chứng minh phía DB/API
- Ảnh hưởng hiện tại: P23-T05 PARTIAL — phía DB/API đạt trên PG thật, phía file/export/artifact chưa kiểm
- Đề xuất: spec cross-workspace cho đường tải artifact/export và cache key (codex quyết chỗ đặt)
```

| Mục | Nội dung |
|---|---|
| Actual | Trong cell, trên PG thật, đều PASS: `auth.spec.ts` 16, `mutation-security.spec.ts` 7, `governance-token.spec.ts` 3, `a4-owner-access.spec.ts` 33, `local-read-authority.spec.ts` 4, `research-bounded-read.spec.ts` 3, và 13 research controller spec (34 test, non-member 404; A2 §2 là nguồn chuẩn). Bằng chứng: `cell.log` `1a8633f3b15c8ac2`, `cell-files.md` `52e759bfa378b61c` |
| Expected | Không đọc/ghi được file, export hay artifact của workspace khác. Cache key không lẫn giữa các tenant |
| Test khi có | P23-T05 nửa file/export |
| Fallback | PARTIAL, ghi rõ nửa nào đã chạy |
| Owner / state | Codex (+ stack CG-P23-01) / OPEN |

### CG-P23-03 — drill corrupt part + restore artifact (nửa artifact của P23-T06 / T14)

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: drill làm hỏng part + restore artifact có kiểm hash, và kiểm giữ pin sau restore
  (exposure, final-audit child target, selection/null-trial, publication source pins)
- Lý do: Guide exit gate "Restore proves every published referenced artifact is present/verified"
- Ảnh hưởng hiện tại: P23-T06 / T14 PARTIAL — chỉ có signature đếm relation của DB
- Đề xuất: mở rộng drill để in digest của signature + manifest hash artifact trước/sau (chỉ đề xuất)
```

| Mục | Nội dung |
|---|---|
| Locator | `scripts/control-api-test.sh`: `CONTROL_SIGNATURE_SQL` (56 lệnh `count(*)`), `pg_dump --format=custom` → `createdb portal_control_restore` → `pg_restore --exit-on-error` → so sánh chuỗi signature |
| Actual | Drill PASS: dòng cuối `Control API security/query/governance tests and PostgreSQL restore drill passed.` + exit 0. Signature chỉ là số dòng của 56 relation (governance/execution). Script không in giá trị signature, không kiểm byte artifact, không kiểm quan hệ Research |
| Expected | Restore giữ đủ quan hệ exposure/selection/child-run/receipt/index. Không re-seal, không viết lại expected digest sau recovery. Mọi artifact được publish tham chiếu phải có mặt và đúng hash |
| Test khi có | P23-T06, P23-T14 nửa artifact; W09 phần NATS/artifact |
| Fallback | PARTIAL: "DB relation-count signature drill only". Không bao giờ gọi là "restore verified" cho artifact |
| Owner / state | Codex (+ stack CG-P23-01) / OPEN |

### CG-P23-04 — đo coupling tải Research ↔ Execution (nửa động của P23-T09)

```text
Backend request (@codex + Bobby) — 2026-09-25
- Endpoint/field cần: phép đo Execution behaviour/latency/quyền dưới tải Research trên host cô lập,
  cần stack (CG-P23-01) + execution probe; :8090 là của Bobby, contributor không chạm
- Lý do: P23-T09 "Research load không thay execution behavior hoặc quyền"
- Ảnh hưởng hiện tại: P23-T09 PARTIAL — chỉ có phần tĩnh
- Đề xuất: chạy EXECUTION_REGRESSION + probe execution trong lúc chạy W06 trên stack cô lập (codex quyết)
```

| Mục | Nội dung |
|---|---|
| Actual | Phần tĩnh: `git diff --stat a5455848 HEAD` trên `apps/control-api/src/{governance,facade,repos,execution,auth}`, `apps/portal/strategy`, `apps/portal/backend` rỗng (`gx-protected-diff.txt` `e3b0c44298fc1c14`). Kernel checksum khớp (`gx-kernel.txt` `d44dad89a66db88c`). EXECUTION_REGRESSION trên preview contributor 4417 (không phải browser-real): `chromium` flag off 220/248, `chromium-preview` flag on 79/100 (16 skip theo thiết kế). Mọi test không chụp ảnh đều PASS. 28 + 5 = 33 ô `toHaveScreenshot` FAIL so với baseline bất biến của Bobby (`S06-VISUAL-BASELINE-HOST-DRIFT`, `B-P23-06`), chưa chẩn đoán nguyên nhân. Không có phép đo nào dưới tải |
| Expected | Không đổi hành vi hay quyền Execution khi Research chạy tải |
| Expected (cold cache, P23-T08) | Đo cold cache trên host/cgroup cô lập, không ảnh hưởng host execution dùng chung |
| Owner / state | Codex + Bobby / OPEN |

### CG-P23-05 — lane regression Python backend

```text
Provisioning request (Bobby / @codex) — 2026-09-25
- Endpoint/field cần: apps/portal/.venv đã cài sẵn backend deps + quantbt 1.1.1 để chạy
  apps/portal/scripts/test_backend.sh
- Lý do: P23-T10 "toàn bộ required regression suites chạy và có raw results"; W00 phần engine/backend
- Ảnh hưởng hiện tại: NOT_RUN (contributor không tự cài deps); P23-T10 thiếu lane Python
- Đề xuất: cung cấp .venv, hoặc Bobby tự chạy lane này và nộp raw log
```

| Mục | Nội dung |
|---|---|
| Locator | `apps/portal/scripts/test_backend.sh`: cần `${ROOT_DIR}/.venv/bin/python` (hoặc `POOL_ALPHA_PYTHON`), nếu không có thì exit 1 với "Python environment not found" |
| Owner / state | Bobby (provisioning) / OPEN |

### CG-P22-C — ledger r2 thiếu 3 route P22 (mang sang, không đổi)

```text
Backend/ledger request (@codex + Bobby) — mang từ P22, vẫn OPEN
- Endpoint/field cần: upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/capability-inventory.v1.json thêm
  GET  /api/v1/research/release-candidates/:releaseCandidateId/mirror
  POST /api/v1/research/release-candidates/:releaseCandidateId/publish
  POST /api/v1/research/release-candidates/:releaseCandidateId/publish/reconcile
- Lý do: src/execution/r2Ledger.test.ts "covers exactly the routes the controllers publish" fail ở cả 2 lần
  full vitest của A2 (fe-vitest.log 419a6db02f42b441, fe-vitest-rerun.log 6180b15ce04782e7)
- Ảnh hưởng hiện tại: FE full vitest exit 1; P23-T10 FAIL (1 trong 2 lỗi đã quy trách nhiệm)
- Ghi chú: ledger dành cho Bobby; P23 không sửa ledger (upgrade/upgrade_frontend_plan_hifi/** untouched)
```

## 2. Lane bị chặn: test id → cần gì → ai

| Test / lane | Trạng thái hiện tại | Cần gì để chạy | Owner |
|---|---|---|---|
| P23-T01 (nửa API: p95 list/summary, 5 GB) | PARTIAL: chỉ client cost trên fixture lane (20 context, p95 5877–7074 ms, không so với cổng API) | Stack + cgroup (CG-P23-01), load runner được phép trên W06 | Bobby |
| P23-T02 (phía service) | PARTIAL: chỉ bản tương tự phía browser, 30 chu kỳ heap +14,2 % | Stack + cgroup, W08 chu kỳ complete/fail/cancel trên service thật | Bobby |
| P23-T03 disk high-water/full | BLOCKED | Stack + quota/scratch riêng (CG-P23-01) | Bobby |
| P23-T04 outage process/DB/NATS | BLOCKED | Stack có NATS/worker để dừng/khởi động lại trong phạm vi cô lập (CG-P23-01) | Bobby |
| P23-T05 (nửa file/export/artifact) | PARTIAL (nửa FE FAIL đã quy trách nhiệm: VD-P23-01/02/03) | MinIO/artifact store + spec cô lập (CG-P23-02) | Codex + stack |
| P23-T06 (nửa artifact) | PARTIAL: drill signature DB | Drill corrupt part + hash artifact (CG-P23-03) | Codex + stack |
| P23-T07 engine upgrade / in-flight pinning | BLOCKED | Canary worker cô lập + bản build engine mới đã validate (CG-P23-01) | Bobby + Codex |
| P23-T08 cold cache cô lập | BLOCKED | Host execution cô lập + stack (CG-P23-04); :8090 là của Bobby. Không bao giờ `drop_caches` trên host dùng chung | Bobby + Codex |
| P23-T09 (nửa động) | PARTIAL: regression không chụp ảnh PASS flag off/on; 33 ô ảnh FAIL (S06) | Stack + execution probe (CG-P23-04); :8090 của Bobby | Codex + Bobby |
| P23-T10 (lane Python) | NOT_RUN trong một T10 đang FAIL (2 unit đã quy trách nhiệm + 33 ô visual-baseline, S06) | `.venv` + quantbt 1.1.1 (CG-P23-05); ledger r2 (CG-P22-C); guard RunLibrary (`S01-RUNLIBRARY-PAGE-GUARD`); chạy lại visual trên host baseline (`B-P23-06`) | Bobby / Codex |
| P23-T11 (aggregate 5 GB) | PARTIAL: writes 0 + request budget 15/15 dòng trên fixture lane | Stack + cgroup (CG-P23-01) | Bobby |
| P23-T12 quota/backpressure | BLOCKED (`research-bounded-read.spec.ts` trong cell chỉ là unit evidence của RS-01 admission) | Stack với audit/what-if/verify/export chạy cạnh primary (CG-P23-01) | Bobby + Codex |
| P23-T13 upgrade route/default không tự bật mapper | BLOCKED (chỉ có tham chiếu REUSED_VERIFIED: unit test capability-reason S12 từ P09, mang tính thông tin) | Stack + route/default mới (CG-P23-01) | Bobby + Codex |
| P23-T14 giữ pin sau restore/GC | BLOCKED (drill signature DB là tiền đề, không phải kiểm nội dung pin) | CG-P23-03 | Codex + stack |
| P23-T15 (cold-cache workload) | PARTIAL/FAIL: deep link/history/cursor PASS (fixture, 180/180 ô); rò chéo run FAIL trên 04 (VD-P23-04); nửa cold cache BLOCKED | CG-P23-01 | Bobby |
| V11-P23-DR / `delta-real-data` | BLOCKED | Delta compute thật trên stack (CG-P23-01) | Bobby + Codex |
| `direct-vs-portal` | BLOCKED | Stack có storage thật để so direct với Portal | Bobby + Codex |
| `api-vs-ui` | BLOCKED (stub của fixture lane không phải api-vs-ui) | Stack + API thật sau gateway | Bobby |
| `browser-real` | NOT_RUN | Stack thật + build đã rebuild sau gateway; chỉ có receipt fixture (V11-P23-BR) | Bobby |
| `dev-host-review` | NOT_RUN | Dev host live sau khi kích hoạt staging; contributor không có (giống P22) | Bobby |

## 3. Không mở request

- `S01-RUNLIBRARY-PAGE-GUARD` (`PortalShell.test.tsx` / `RunLibrary.tsx:784` đọc `response.page.filtered_rows`) là debt FE/test, không phải request backend. Contract run-library không đổi. File thuộc baseline nên owner là Bobby/Codex (`B-P23-04`). Xem [debt register](./thanhvuong-debt-register.json).
- Chunk-size warning của FE build (4 chunk > 500 kB) và Planning build (1 chunk) có từ trước. Không phải việc backend.
- 80 lỗi typecheck test-only của control-api có từ trước (0 trong `src/`, 0 trong file nhánh này đổi, 9 nằm trong 2 research spec của baseline). Không mở request mới. Owner test file là baseline.
- `S02-RESEARCH-REFUSAL-PROSE`, `S03-RESEARCH-401-SESSION-STATE`, `S04-F04-403-404-DISTINGUISHABLE`, `S05-EVIDENCE-HUB-RUN-KEY` (VD-P23-01..05) là lỗi FE ở tầng map refusal/state. Contract refusal đã có status + code + `request_id`, nên không mở request backend. Bobby quyết cách sửa (`B-P23-04`).
- `S06-VISUAL-BASELINE-HOST-DRIFT` (33 ô ảnh lệch trên host contributor) là câu hỏi về host của baseline ảnh, không phải thiếu contract. Bobby quyết (`B-P23-06`).
- Không cần contract hay endpoint mới cho runner FE: runner dùng stub same-origin của fixture lane (khai báo rõ), không gọi API thật.

## 4. Trạng thái

| ID | Owner | State | Ghi chú |
|---|---|---|---|
| `CG-P23-01` | Bobby (provisioning) | OPEN | stack Research cô lập + cgroup 5 GB; chặn T01/T03/T04/T07/T08/T12/T13 |
| `CG-P23-02` | Codex + stack | OPEN | cô lập file/export/artifact (T05 nửa sau) |
| `CG-P23-03` | Codex + stack | OPEN | corrupt part + restore artifact (T06/T14 nửa artifact) |
| `CG-P23-04` | Codex + Bobby | OPEN | coupling tải Execution (T09 nửa động); :8090 của Bobby |
| `CG-P23-05` | Bobby (provisioning) | OPEN | `.venv` + quantbt 1.1.1 cho `test_backend.sh` |
| `CG-P22-C` | Codex + Bobby | OPEN | ledger r2 thêm 3 route P22 (mang từ P22) |
| B-P23-01…06 | Bobby | AWAITING_DECISION | [receipt §11](./thanhvuong-frontend-receipt.md#11-việc-bobby-quyết) |
