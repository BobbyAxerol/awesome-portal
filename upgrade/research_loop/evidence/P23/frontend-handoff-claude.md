# P23 frontend handoff — resource, security, recovery, upgrade qualification (contributor, outside D3)

**Trạng thái:** `QUALIFICATION-PARTIAL-CONTRIBUTOR (fixture + disposable-PG lanes) / thanhvuong / STACK_LANES_BLOCKED · REQUIRES_BOBBY_DECISION (B-P23-01)`.

Theo D3 (`0fa3c385`), P22+ là việc của Codex. Quyết định Bobby 2026-09-25 (baseline `1ff3f2d4`) không nhắc P23. Bản P23 này do Thanhvuong (Claude) làm theo yêu cầu của Vuong trên nhánh contributor `feat/thanhvuong/research-p17-p21`: runner commit `35d0c861` (test(research): P23 contributor qualification runner for the Research screens (fixture lane)) trên `29feefb8`, docs commit 1 `1498db1e` (5 file packet), rồi docs commit chứa file này. Chưa merge, không PR.

Baseline `primus-origin/docs/research-loop-plan` lúc đóng packet là `33c46b84`, không còn là `1ff3f2d4`: thêm 27 commit (W5a/W5b/W5c/W6a), trong đó có sửa `freezeClient.ts`, `reportClient.ts`, `runLibraryClient.ts`, `RunLibrary.tsx` và một `ReleaseCandidateDetail.tsx` riêng của baseline. Mọi số dưới đây đo trên `35d0c861`. Khi tích hợp (`B-P23-05`) phải chạy lại runner, và đo lại S01 cùng VD-P23-01/03 trên cây đã tích hợp.

P23 là qualification phase, nên không có product code, migration hay flag. Handoff này mô tả những gì **đang có** để chạy lại, và những gì P24 còn thiếu.

Hồ sơ: [receipt](./thanhvuong-frontend-receipt.md) · [backend requests](./thanhvuong-backend-requests.md) · [test results](./thanhvuong-test-results.json) · [debt](./thanhvuong-debt-register.json) · [rollback](./thanhvuong-rollback.md).

## Codex integration note (2026-09-25)

The P23 qualification runner and typed fixture builders are restored on the
shared `docs/research-loop-plan` branch. They remain a fixture/client-cost
qualification lane, not a production or real-source receipt. The builders are
checked against the current generated contracts (including P20 compare,
P19 lineage, P18 report v1 and the P21/P22 release-candidate normalised view).
The browser runner's known VD/host-baseline failures remain explicit in this
handoff; they are not converted into passes or used as a release claim.

## 1. Có gì

| Thành phần | Nơi | Lane | Chứng minh gì |
|---|---|---|---|
| Cell PostgreSQL dùng một lần (script có sẵn của repo, không sửa) | `scripts/control-api-test.sh` | `persistence-vs-api` | control-api build + toàn bộ spec (117 file / 834 test ở `29feefb8`) trên PG thật; migration fresh (gồm 063); spec auth/owner isolation; drill `pg_dump → pg_restore` so signature 56 relation |
| Runner FE qualification (committed) | `apps/portal/frontend/playwright.research-qualification.config.ts` + `apps/portal/frontend/e2e/research-qualification/_probe-p23-*.spec.ts` + helper stub | `visual-fixture` (chỉ client cost) | 5 spec, 78 test; xem bảng §2.2. B: 47/78, 31 FAIL đều đã quy trách nhiệm VD-P23-01..04, rerun giống hệt |
| Gate static/unit/build | contracts, control-api, FE, Planning (lệnh ở §2.3) | static/unit | xem [test results](./thanhvuong-test-results.json) `gates` |
| EXECUTION_REGRESSION + Planning e2e | `playwright.config.ts` projects `chromium` (flag off) / `chromium-preview` (flag on), Planning `playwright.config.ts`, chạy bằng temp config trỏ 4417 | EXECUTION_REGRESSION (preview contributor, không phải browser-real) | `chromium` flag off 220/248, `chromium-preview` flag on 79/100 (16 skip theo thiết kế). Mọi test không chụp ảnh PASS; 28 + 5 = 33 ô `toHaveScreenshot` FAIL so với baseline bất biến của Bobby (`S06-VISUAL-BASELINE-HOST-DRIFT`, `B-P23-06`), tất định, chưa chẩn đoán nguyên nhân. Planning build PASS, e2e 2/2 PASS. Research probe P09 82/82 PASS (fixture) |

## 2. Chạy lại

### 2.1 Cell PostgreSQL (`persistence-vs-api`)

```bash
cd ~/awesome-primus-portal            # repo root
bash scripts/control-api-test.sh      # ~9 min lần đầu (pull 2 image ≈ 1 min), exit 0 khi PASS
```

Dòng cuối khi PASS: `Control API security/query/governance tests and PostgreSQL restore drill passed.`

Script cần:
- `docker` CLI nói chuyện **trực tiếp** được với daemon **rootless** (`docker info --format '{{json .SecurityOptions}}'` có `name=rootless`). Script có nhánh fallback `sudo -n docker`, nhưng contributor **không** dùng sudo. Nếu `docker info` trực tiếp lỗi thì dừng lại, không đi đường sudo.
- Registry với tới được lần đầu để pull theo digest `node@sha256:c610fcdf…3aa32` và `postgres@sha256:44c4ee98…eac6`. Hai image này ở lại trong rootless store và lần sau dùng lại (không `docker rmi`, không prune).
- Có sẵn trong checkout: `apps/control-api/{migrations,src,test,tooling,package.json,package-lock.json,tsconfig*.json,vitest.config.mts}`, `deploy/control-api/bootstrap-users.yaml`, `packages/contracts` (mount ro), `services/portal-execution-edge-rs/contracts/{maximum-data-return-v1/MANIFEST.sha256, eds08-source-continuity-v1/MANIFEST.sha256, manager-surface-census-v1/manager-surface-census.v1.json}`.
- Bộ nhớ: tmpfs PG tới 2 GiB, tmpfs node 512 MiB. Đo ở A2 (contributor host, không phải cgroup stack Research): node max 674.0 MiB, PG max 816.0 MiB.
- Không mở host port: network `--internal`, rootfs read-only.

Script tự tạo rồi tự gỡ (EXIT trap): container `control-api-test-{node,postgres}-<pid>`, network `control-api-test-net-<pid>`, thư mục `mktemp -d`. Muốn cố định tên để chẩn đoán thì đặt `CONTROL_API_TEST_RUN_SUFFIX`, `CONTROL_API_TEST_NETWORK`, `CONTROL_API_TEST_POSTGRES_CONTAINER` hoặc `CONTROL_API_TEST_NODE_CONTAINER`. Kiểm sau khi chạy: `docker ps -a` rỗng, `docker network ls` chỉ còn bridge/host/none.

Cách đo của A2 (tuỳ chọn, wrapper ngoài repo `~/tv-shots/p23/a2/run-cell.sh`, `8fd235d9abc33928`): `/usr/bin/time -v bash scripts/control-api-test.sh`, cộng một vòng `docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.CPUPerc}}" | grep control-api-test-` mỗi 10 s, kill sampler theo PID. `time -v` chỉ đo wrapper + docker CLI (44412 kB). Bộ nhớ của cell lấy từ `docker stats`.

### 2.2 Runner FE qualification (`visual-fixture`, client cost only)

```bash
cd ~/awesome-primus-portal/apps/portal/frontend
VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true VITE_EXECUTION_PREVIEW_ENABLED=false npm run build   # production-true build, flag off
npx vite preview --host 127.0.0.1 --port 4417 --strictPort &                                 # ghi PID cha + PID node con
RESEARCH_QUAL_BASE_URL=http://127.0.0.1:4417 \
P23_SHOT_DIR=$HOME/tv-shots/p23/final/shots \
  npx playwright test -c playwright.research-qualification.config.ts --workers=1
kill <pid node vite preview> <pid cha>                                                       # theo PID, không pkill -f
ss -ltnp | grep 4417                                                                        # phải rỗng
```

- Config: `playwright.research-qualification.config.ts`. Nó **bắt buộc** `RESEARCH_QUAL_BASE_URL` và `P23_SHOT_DIR` (thiếu biến nào cũng throw), không có `webServer`, không sở hữu port, `workers: 1`, `retries: 0`, timeout 180 s, reporter `list` + `json` → `$P23_SHOT_DIR/playwright-report.json`, output `$P23_SHOT_DIR/test-results`.
- Spec prefix `_probe-p23-` (testMatch `**/research-qualification/_probe-p23-*.spec.ts`). Nhờ `testIgnore` `**/_probe*.spec.ts` (`playwright.config.ts:81`), visual baseline bất biến không chạy chúng. `playwright.research-probe.config.ts` cũng không match (mẫu của nó là `**/_probe-research-*.spec.ts`). Kiểm: `npx playwright test --list 2>/dev/null | grep -c research-qualification` = 0.
| Spec (`apps/portal/frontend/e2e/research-qualification/`) | Test | Chứng minh gì (fixture lane) | Kết quả B trên `35d0c861` |
|---|---|---|---|
| `_probe-p23-matrix.spec.ts` | 60 | 15 màn × 4 state (healthy / denied 403 rồi 404 / unavailable 503 / expired 401) × 3 bề rộng (1280/1440/660) = 180 ô: không in prose server, có copy session-expired, 403 = 404, không placeholder trần, overflow ≤ 1 px, một `.portal-shell`, Tab đầu vào trong màn, deep link → back/forward/reload giữ vị trí, cursor giữ (04–08), console 0, writes 0 | FAIL (attributed VD-P23-01..03): 30/60, 123 dòng lỗi (81 / 30 / 12). Phần layout/history PASS (fixture) ở 180/180 ô |
| `_probe-p23-load.spec.ts` | 1 | 20 context đồng thời (identity `qual-user-01…20`) đi 01→03→04→06→08→09→11: render đủ, writes 0, số GET, heap, DOM, thời gian nav→settle (client cost) | PASS (fixture) 1/1: 140/140 render, writes 0, p95 5877–7074 ms (s04 34132 ms do 3 mẫu `no-finish-event`), heap max 38.2 MB, DOM max 1051 |
| `_probe-p23-interaction.spec.ts` | 7 | request budget theo code (file:line ở receipt §3) cho tab/cursor/history/seek/slider/mode trên 04/06/07/08/13 và poll của 03: writes 0, DOM ≤ +5 %, không GET trùng đang bay | PASS (fixture) 7/7, 15/15 dòng trong budget |
| `_probe-p23-cycles.spec.ts` | 1 | 30 chu kỳ 04→08→06 có GC trước mỗi mẫu: heap đầu-5 vs cuối-5 ≤ 25 %, DOM phẳng | PASS (fixture) 1/1: +14.2 % |
| `_probe-p23-stale.spec.ts` | 9 | 04/09/11: A chậm/B nhanh, B chậm/A nhanh, A settle rồi B giữ 3 s: không còn id/digest của run A trong màn của run B | FAIL (attributed VD-P23-04): 8/9, s04 "retained" giữ `R-WFO-118` / `p13r1_7d21ab` |
| `harness.ts`, `stubs.ts`, `tsconfig.json` | — | harness đo (request log, `upsertRow`, `no-finish-event`), builder stub typed `satisfies` theo `packages/contracts/generated/*.d.ts`, sentinel `zq_P23_SERVER_PROSE_SENTINEL`; tsconfig riêng để typecheck e2e | `npx tsc -p e2e/research-qualification/tsconfig.json` exit 0 (A1) |
- Mọi ảnh, JSON sample và report nằm dưới `$P23_SHOT_DIR`, **không commit**, chỉ ghi digest.
- Chỉ dùng cổng 4417 (preview riêng của workspace). Không nạp preview của Bobby 4317–4320.

### 2.3 Gate static/unit/build (không cần port)

```bash
cd packages/contracts && npm test && python3 tooling/snapshot.py --check
cd apps/control-api && npm run build && npm run typecheck        # typecheck: 80 lỗi test-only thừa kế, 0 trong src
cd apps/portal/frontend && npx tsc -b --noEmit && npm run build && npx vitest run
cd features/roadmap-task-board/frontend && npm run typecheck && npm test && npm run build
```

Không `npm ci` hay cài gì (dùng `node_modules` có sẵn). FE vitest hiện có 2 fail đã quy trách nhiệm (`r2Ledger` → `CG-P22-C`; `PortalShell` → `S01-RUNLIBRARY-PAGE-GUARD`). Test `PortalShell` chạy riêng thì PASS (`npx vitest run src/app/PortalShell.test.tsx`), nhưng chạy chung cả suite thì fail.

### 2.4 EXECUTION_REGRESSION + Planning e2e (tuần tự trên 4417)

Làm theo B-brief: temp config chép đúng project `chromium` / `chromium-preview` / Planning, `baseURL http://127.0.0.1:4417`, không `webServer`, `updateSnapshots: "none"`. Build flag-on dùng `npx vite build --outDir dist-preview` với `VITE_EXECUTION_PREVIEW_ENABLED=true`. Chạy xong thì chép temp config sang `.copy` rồi xoá khỏi tree. Digest `.copy` của B: exec-off `4dbd206bead39fc8`, exec-on `8ab39907a3a63355`, research-probe `eaa92961d890ff97`, planning `27b4af8f40121776`.

Kết quả B trên `35d0c861` (log ở `~/tv-shots/p23/final/`):

| Gate | Kết quả | Log |
|---|---|---|
| build flag off (`VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true VITE_EXECUTION_PREVIEW_ENABLED=false npm run build`) | PASS, dist `68ee0a01d1053b61` | `cd3990d0126c6f92` |
| `chromium` (flag off), 248 test / 5 file | FAIL (visual baseline mismatch on contributor host, deterministic, cause NOT diagnosed): 220 pass, 28 FAIL, 0 flaky, 12.0 min. Rerun 1 worker: 28/28 giống hệt | `d4fd43c2fd68a40e`, rerun `1c583f7fc5142dfb` |
| build flag on (`VITE_EXECUTION_PREVIEW_ENABLED=true … npx vite build --outDir dist-preview`) | PASS, 8.03 s | `dd1b057260270df3` |
| `chromium-preview` (flag on), 100 test / 3 file | FAIL (như trên): 79 pass, 5 FAIL, 16 skip (`EL_V2_SHOTS`), 4.3 min. Rerun 5/5 giống hệt | `c397389c0bc7d8eb`, rerun `58877e030117715e` |
| Planning build + e2e | PASS; 2/2 | `bf580155164fa8ee`, `541af0d285ba80d1` |
| research probe P09 | lần 1: 49/82, 33 lỗi EACCES trên `/tmp/research-shots` (thuộc bobby, lỗi môi trường); lần 2 với `RESEARCH_SHOT_DIR`: 82/82 PASS (fixture) | `f8b685f1f0aea36a`, `055254841fdae356` |

Cả 33 ô FAIL đều là `toHaveScreenshot` lệch so với baseline `*-linux.png` (đổi lần cuối ở `7441c572`, 2026-09-17). Tỉ lệ lệch 0.01–0.05; lớn nhất là `phase-2-gate-r1 @ laptop` (4205 → 4159 px). Chúng rơi cả vào suite mà nhánh này chưa từng chạm. Giả thuyết là font/rasteriser của host khác, nhưng chưa có bằng chứng. Contributor **không bao giờ** regenerate baseline. `B-P23-06`: Bobby chạy hai project này trên host baseline với `35d0c861`.

**Lưu ý cho contributor:** research probe P09 ghi ảnh vào `/tmp/research-shots` theo mặc định, mà thư mục này thuộc bobby. Luôn đặt `RESEARCH_SHOT_DIR=$HOME/tv-shots/<phase>/research-probe-shots` trước khi chạy `playwright.research-probe.config.ts`.

## 3. P24 cần gì từ Bobby

1. **`B-P23-01`**: nhận hay bỏ bản P23 contributor (ngoài D3) trước khi P24 dùng evidence này.
2. **`B-P23-02` / `CG-P23-01`**: một stack Research cô lập có cgroup scope (compose project, loopback port, env file ngoài checkout, image build receipt), hoặc Bobby tự chạy các lane bị chặn bằng runner + cell script ở trên. P24-T10 (5 GB mixed-load truy lại được theo source/build/workload), P24-T05, P24-T07 và V11-P24-DR đều cần nó.
3. **`CG-P23-02` / `CG-P23-03`** (@codex): cô lập file/export/artifact; drill corrupt part + restore artifact có hash và giữ pin. P24-T07 và rollback runbook P24 ("keep schema readers and artifact refs") cần hai việc này.
4. **`CG-P23-04`**: đo coupling Execution dưới tải trên host cô lập (`:8090` là của Bobby).
5. **`CG-P23-05`**: `.venv` + quantbt 1.1.1 cho `apps/portal/scripts/test_backend.sh`. Gate backend đầy đủ của P24 cần lane Python.
6. **`B-P23-03`**: xác nhận ngưỡng client tạm (8000 DOM nodes / 200 MB heap, lấy từ execution-journeys) hoặc đặt ngưỡng theo §16.3.
7. **`B-P23-04`**: sửa `S01-RUNLIBRARY-PAGE-GUARD` (file baseline) và VD-P23-01..05 (`S02-RESEARCH-REFUSAL-PROSE`, `S03-RESEARCH-401-SESSION-STATE`, `S04-F04-403-404-DISTINGUISHABLE`, `S05-EVIDENCE-HUB-RUN-KEY`). Sửa trong `fix/*` của contributor (cần quyền đụng snapshot baseline) hoặc giao Codex. Thứ tự đề xuất: 01+02 (một refusal mapper: status → state có kiểu + copy trung tính + `request_id`, bỏ message), rồi 03, rồi 04+05. **`CG-P22-C`**: ledger r2. Tất cả cần xong để FE vitest và runner về 0 fail, đúng exit gate P24 "zero failed/skipped-required tests".
8. **`B-P23-06`**: chạy `chromium` / `chromium-preview` trên host baseline với `35d0c861` để tách drift của host khỏi drift của nhánh (`S06-VISUAL-BASELINE-HOST-DRIFT`).
9. **`B-P23-05`**: tích hợp P21 + P22 + P23 vào baseline (D1: Codex merge). P24 chạy browser suite trên artifact committed đã rebuild và trên dev hostname.
10. Lane `browser-real` / dev-host trên build committed sau gateway thật. P23 chỉ có receipt fixture.

## 4. ID còn mở

- CG: `CG-P23-01…05` (OPEN), `CG-P22-C` (OPEN, mang từ P22).
- Debt mở: `S01-RUNLIBRARY-PAGE-GUARD`, `S02-RESEARCH-REFUSAL-PROSE`, `S03-RESEARCH-401-SESSION-STATE`, `S04-F04-403-404-DISTINGUISHABLE`, `S05-EVIDENCE-HUB-RUN-KEY`, `S06-VISUAL-BASELINE-HOST-DRIFT`. Debt/VD/CG của P22 giữ nguyên ở [P22 register](../P22/thanhvuong-debt-register.json).
- Đã đóng trong P23: `S11-P22-MIGRATION-056-UNPROVEN` (id chỉ file nay mang số 063; spec PASS trên PG fresh trong cell).
- VD: P23 không có màn riêng. Runner đo được `VD-P23-01` (P1, prose server), `VD-P23-02` (P1, 401 thành denied), `VD-P23-03` (P1, 403 ≠ 404; lệch với receipt P21 §A5), `VD-P23-04` (P2, hub giữ run A) và `VD-P23-05` (P3, ETag run A; chỉ quan sát code). Tất cả `REQUIRES_BOBBY_DECISION` (`B-P23-04`).
- Downstream gate: `P23-FE-DG-01…09` ở [debt register](./thanhvuong-debt-register.json).
- Bobby quyết: `B-P23-01…06`.

## 5. Không làm

Không `drop_caches`. Không restart service dùng chung hay service của Bobby. Không revoke approval, không đổi execution config. Không `docker system prune` / `rmi`. Không sudo, không cài deps. Không `pkill -f`. Không chạm 4317–4320, `:8090` hay `/home/bobby`. Không sửa snapshot baseline. Không gộp fixture PASS với real PASS. Không claim `VERIFIED` / `CERTIFIED`. Gate 5 GB **chưa đo**.

## 6. Chưa chạy

delta-real-data, direct-vs-portal, api-vs-ui, browser-real, live dev-host smoke, lane Python backend, P23-T03/T04/T07/T08/T12/T13/T14, nửa stack của T01/T02/T05/T06/T09/T11/T15, phép đo aggregate 5,000,000,000 bytes, axe. Chi tiết ở [test results](./thanhvuong-test-results.json) `not_run`.
