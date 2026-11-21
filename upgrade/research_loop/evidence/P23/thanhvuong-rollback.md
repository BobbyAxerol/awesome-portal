# P23 — Thanhvuong rollback (resource, security, recovery, upgrade qualification)

Luật rollback P23:
- Guide P23 §Debt/rollback: *"Rollback applies Research versions/concurrency only, not execution config or approvals."*
- Unified `#rl-p23` Rollback/handoff: drill fault chỉ trên Research, drain/recover/release switch có kiểm, dọn stack cô lập.

Tài liệu này ghi những gì packet P23 contributor **thật sự** tạo ra và cách gỡ, không ghi điều mong muốn.

P23 là qualification phase. Bản contributor này không tạo runtime nào: không migration, không feature flag, không service, không đổi `src/` của product, không dữ liệu. Nó chỉ tạo một runner Playwright đã commit (fixture lane) và hồ sơ. Vì vậy hôm nay rollback = không merge, hoặc revert commit trên nhánh contributor. Không có drill Research nào chạy trên stack thật (BLOCKED, `CG-P23-01`), nên không có trạng thái runtime nào cần drain hay switch.

## 1. Packet đã tạo gì

| Loại | Đường dẫn | Runtime? |
|---|---|---|
| Runner config (committed) | `apps/portal/frontend/playwright.research-qualification.config.ts` (testMatch `**/research-qualification/_probe-p23-*.spec.ts`, bắt buộc có `RESEARCH_QUAL_BASE_URL` + `P23_SHOT_DIR`, không `webServer`, `workers: 1`) | Không. Chỉ chạy khi gọi rõ `-c` |
| Runner specs + helper (committed) | `apps/portal/frontend/e2e/research-qualification/**` (danh sách file và việc mỗi spec chứng minh: [receipt §3](./thanhvuong-frontend-receipt.md)) | Không |
| Hồ sơ | `upgrade/research_loop/evidence/P23/thanhvuong-{frontend-receipt.md,backend-requests.md,test-results.json,debt-register.json,rollback.md}`, `evidence/P23/frontend-handoff-claude.md`, Unified §13 dòng P23 + note `#p23-thanhvuong-qualification-note-2026-09-25` | Không |

Runner nằm ngoài visual baseline bất biến: `playwright.config.ts:81` có `testIgnore` `**/_probe*.spec.ts`, và `playwright.research-probe.config.ts:4` chỉ match `**/_probe-research-*.spec.ts`. Tiền tố `_probe-p23-` không khớp mẫu đó.

## 2. Revert commit (nhánh `feat/thanhvuong/research-p17-p21`, mới nhất trước)

Lệnh mẫu: `git revert --no-edit <sha>`. Sau khi revert code runner, kiểm lại trong `apps/portal/frontend`: `npx tsc -b --noEmit` (tsconfig chỉ include `src` + `vite.config.ts`, nên runner không ảnh hưởng tsc), `npx playwright test --list 2>/dev/null | grep -c research-qualification` phải = 0 cả trước lẫn sau.

| # | Commit | Nội dung | Ảnh hưởng khi revert |
|---|---|---|---|
| 0 | docs commit 2 (commit không tự ghi được SHA của chính nó; xem `git log`): docs(research): P23 §13 row, qualification note and contributor handoff | Unified §13 dòng P23 + note + `evidence/P23/frontend-handoff-claude.md` | Chỉ mất hồ sơ. Revert docs trước |
| 1 | docs commit 1 (chứa file này nên không ghi được SHA; xem `git log`): docs(research): P23 Thanhvuong qualification packet | 5 file `evidence/P23/thanhvuong-*` (gồm file này) | Chỉ mất hồ sơ |
| 2 | `35d0c861` test(research): P23 contributor qualification runner for the Research screens (fixture lane) | config + 5 spec + harness + stub + tsconfig của runner (9 file +2492/−0, cha `29feefb8`) | Mất lane qualification FE. Không đổi product, visual baseline hay suite nào khác |

Nếu đã tích hợp vào baseline (`B-P23-05`, theo D1 Codex merge): revert tay đúng các đường dẫn ở §1. Không có migration hay data nào cần gỡ.

## 3. Cleanup record (RS-01 form; chi tiết máy đọc ở [test results](./thanhvuong-test-results.json) `resource_cleanup`)

### 3.1 Cell PostgreSQL dùng một lần (gói A2, `scripts/control-api-test.sh`, không sửa script)

| Tài nguyên | Tạo bởi | Sau khi chạy | Bằng chứng |
|---|---|---|---|
| container `control-api-test-node-2047887`, `control-api-test-postgres-2047887` | script (suffix = PID) | **đã gỡ** bởi EXIT trap (`docker rm -f`) | `cleanup-after.txt` `3e25f93476923680`: `docker ps -a` rỗng |
| network `control-api-test-net-2047887` (`--internal`, không host port) | script | **đã gỡ** (`docker network rm`) | `docker network ls` = bridge/host/none |
| container chuẩn bị `npm ci` (không tên, `--rm`, network bridge) | script | tự gỡ (`--rm`) | không còn trong `docker ps -a` |
| thư mục `mktemp -d` (deps + work copy) | script | **đã gỡ** (`rm -rf`) | `find /tmp -maxdepth 1 -name 'tmp.*' -user thanhvuong` rỗng. `ls /tmp \| grep -c tmp.` đi 43 → 42 → 44, phần tăng là thư mục của user khác (`bobby` 08:02:45, `root` 08:05:31) |
| data PostgreSQL | script | nằm trong tmpfs 2 GiB của container, mất khi gỡ container | script (`--tmpfs /var/lib/postgresql/data … size=2048m`) |
| image `postgres@sha256:44c4ee98…eac6` (420 MB), `node@sha256:c610fcdf…3aa32` (232 MB) | script pull theo digest | **RETAINED_IMAGES**: vẫn ở rootless store `/home/thanhvuong/.local/share/docker`. Script không gỡ image và lần chạy sau dùng lại. Không `docker rmi`, không prune | `env-after.txt` `777223902d15f3dc` |
| sampler `docker stats` của A2 | A2 wrapper `run-cell.sh` (`8fd235d9abc33928`, ngoài repo) | kill theo PID, không còn process sót | A2-report §2 |

Rootless Docker: SecurityOptions `["name=seccomp,profile=builtin","name=rootless","name=cgroupns"]`, root `/home/thanhvuong/.local/share/docker` (`env-before.txt` `e65110cfae331b77`). Nhánh fallback sudo của script không được dùng (lệnh `docker info` trực tiếp chạy được). Không ai dùng sudo.

### 3.2 Build output (A2)

`apps/control-api/dist`, `apps/portal/frontend/dist`, `features/roadmap-task-board/frontend/dist` (mới, 4.0M), `*.tsbuildinfo`: đều git-ignored, để nguyên. `git status --short` không đổi vì chúng.

### 3.3 Preview 4417 + temp config (gói B)

Chi tiết máy đọc ở [test results](./thanhvuong-test-results.json) `resource_cleanup.package_b`. Các giá trị lấy từ B-report (`6095bdf044542e4a`), không lấy từ lần chạy đầu của A1.

| Tài nguyên | Tạo bởi | Sau khi chạy | Bằng chứng |
|---|---|---|---|
| `vite preview` 127.0.0.1:4417, 4 lần (flag off, flag on, Planning, research) | gói B | **đã kill theo PID**, không `pkill`: 2730172/2730171/2730092; 4181108/4181107/4181092; 18303/18302/18203; 20871/20870/20815. Cổng 4417 trống | `pids-*.txt` (4 file), `temp-configs.txt` `4be4de7f3153efd9` |
| temp config `apps/portal/frontend/playwright.p23-exec-off.config.ts`, `…p23-exec-on…`, `…p23-research-probe…`, `features/roadmap-task-board/frontend/playwright.p23-planning.config.ts` | gói B | chép `.copy` (digest khớp) rồi **đã xoá**; không commit | `.copy`: exec-off `4dbd206bead39fc8`, exec-on `8ab39907a3a63355`, research-probe `eaa92961d890ff97`, planning `27b4af8f40121776` |
| `apps/portal/frontend/dist-preview` (flag on, 9.8 MB, ignored) | gói B | **đã xoá** | B-report §7 |
| `apps/portal/frontend/dist` (flag off) và `dist` của Planning (ignored) | gói B | để nguyên, như build | — |
| sampler RSS (PID 34415) | gói B | tự thoát theo stop file | `browser-rss.csv` `e402c8326874ad2e` |
| `/tmp/p23b-list-unused/` (report của `--list`) | gói B | chuyển về `~/tv-shots/p23/final/list-qual-report.json`, thư mục đã xoá | B-report §7 |
| `/tmp/research-shots` (thuộc bobby) | — | không ghi gì (lần chạy 1 lỗi EACCES, lần 2 dùng `RESEARCH_SHOT_DIR`) | `pw-research-probe.log` `f8b685f1f0aea36a` |

Sau gói B: `git status --short` rỗng, `git stash list` rỗng, preview 4317–4320 vẫn nghe (không chạm). Manifest hash: `hashes.txt` `e7445206683dc877` (593 file, 328 PNG).

### 3.4 Không chạm

Preview của Bobby 4317–4320. Listener 8080/8081/8090/18081 và 55432. `/home/bobby`. Service dùng chung. Ledger `upgrade/upgrade_frontend_plan_hifi/**`. Snapshot visual baseline. A2 không mở listener nào: `ss-before.txt` `44c2856de67dbbb7` so với `ss-after.txt` `2092b0f8701f1ef0`, listener mới duy nhất là `127.0.0.1:4417` của gói A1.

## 4. Drill Research (không chạy)

Không có drill fault, restore artifact, drain hay release switch nào chạy trên stack Research, vì contributor không có stack (`CG-P23-01`, `B-P23-02`). Drill `pg_dump → pg_restore` trong cell chạy trên DB dùng một lần bên trong cell, không chạm DB nào khác. Khi Bobby dựng stack cô lập, rollback của drill phải theo luật Guide: chỉ đổi Research version/concurrency, dọn stack cô lập sau khi drill xong.

## 5. Không bao giờ làm (kể cả để "rollback" hay để đóng gate)

- `echo 3 > /proc/sys/vm/drop_caches` hay bất kỳ `drop_caches` nào trên host dùng chung (P23-T08 cold cache chỉ đo trên host/cgroup cô lập).
- Restart service dùng chung hoặc service của Bobby. Nạp hay dừng preview 4317–4320. Chạm `:8090`.
- Revoke, decide, reset hay expire approval. Đổi execution config, gate hay quyền. Guide: rollback chỉ áp cho Research version/concurrency.
- Xoá history, reset gate Execution, re-seal hay viết lại expected digest sau recovery.
- `docker system prune`, `docker rmi` image dùng chung, tạo container/network ngoài script của repo.
- `pkill -f`. Chỉ kill theo PID đã ghi.
- `sudo`, cài OS deps hay npm deps, sửa `package.json`/lock.
- Sửa snapshot visual baseline (`updateSnapshots` luôn `none`) để lane xanh.
- Push dev/main/tags, merge/rebase/force, `--no-verify`.
- Commit log, PNG, JSON sample hay secret. Chỉ commit digest.

## 6. Dữ liệu và artefact

- Không có secret, token, cookie hay session thật nào được lưu. Runner chỉ dùng identity stub của fixture lane, không dùng credential của ai.
- Log, ảnh và JSON sample nằm ở `~/tv-shots/p23/{a1,a2,final}/`, không ở trong repo. Digest ở [test results](./thanhvuong-test-results.json).
