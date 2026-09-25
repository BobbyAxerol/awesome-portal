# P23 — Thanhvuong receipt (resource, security, recovery, upgrade qualification)

**Trạng thái:** `QUALIFICATION-PARTIAL-CONTRIBUTOR (fixture + disposable-PG lanes) / thanhvuong / STACK_LANES_BLOCKED · REQUIRES_BOBBY_DECISION (B-P23-01)`.

- Runner commit **`35d0c861`** (tree `5d5ffc88`), trên P22 docs head `29feefb8`, nhánh `feat/thanhvuong/research-p17-p21`. Đã push lên `primus-origin`; chưa PR, chưa merge.
- P23 là **qualification phase**. Deliverable là evidence đo được + một runner đã commit. Không có product code, migration, flag, service hay file `src/` nào đổi.
- Không gọi P23 là `VERIFIED` hay `CERTIFIED`. Fixture PASS không bao giờ cộng vào real PASS. Gate aggregate 5 GB **chưa đo**.
- Rule Bobby 2026-09-24 (note P19) áp dụng như P20–P22: frontend không tự chọn cách lệch. Mọi lỗi đo được ghi `VD-P23-NN` + `REQUIRES_BOBBY_DECISION` ở ba nơi: [§6](#6-hi-fi-check-và-visual-decisions), [handoff](./frontend-handoff-claude.md) và Unified.

Hồ sơ: [backend requests](./thanhvuong-backend-requests.md) · [test results](./thanhvuong-test-results.json) · [debt register](./thanhvuong-debt-register.json) · [rollback](./thanhvuong-rollback.md) · [handoff P24](./frontend-handoff-claude.md).

## 0. Phạm vi ngoài D3 (đọc trước)

| Mục | Nội dung |
|---|---|
| Quyết định Bobby D3 | `BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md` §6 (commit `0fa3c385`): "Claude làm tạm đến P21; P22+ của Codex" |
| Quyết định Bobby 2026-09-25 | `DECISIONS_BOBBY_2026-09-25.md` (baseline `1ff3f2d4`): CG-RF02-01, H1–H8, DR-02/Reveal/A10c. **Không** nhắc D3 cho P22+, **không** nhắc P23 |
| Chỉ đạo của user | Vuong: "tiếp tục làm P23 theo các rules cũ" |
| Nơi nằm | Nhánh contributor, chưa merge vào `docs/research-loop-plan`, dev hay main. Không PR, không tag, không deploy |
| Hệ quả | Mọi artefact P23 là `REQUIRES_BOBBY_DECISION` (`B-P23-01`). Discard = không merge 3 commit (1 runner + 2 docs). Không có gì cần dọn ở môi trường |
| Không đụng | `apps/control-api/src/{governance,facade,repos,execution,auth}`, `apps/portal/strategy/**`, `apps/portal/backend/**` (diff `a5455848..HEAD` rỗng, `e3b0c44298fc1c14`), `src/**` của FE, `package.json`/lock, ledger `upgrade/upgrade_frontend_plan_hifi/**`, snapshot visual baseline, preview 4317–4320 của Bobby, `:8090`, `/home/bobby`, dev/main/tags |

### 0.1 Contributor chạy được gì (PLAN §1, đã sửa số theo A2)

| Khả năng | Có? | Bằng chứng |
|---|---|---|
| Stack Research (portal-api + control-api + PostgreSQL + NATS + MinIO + quant-worker-py, Delta thật, snapshot thị trường thật) | **KHÔNG** | `scripts/research-preview/preview.sh` + `deploy/research-preview/*` chỉ có trên baseline. Stack cần `sudo apparmor_parser`, env file có secret ngoài checkout, 4 image build và một loopback port. Luật contributor cấm sudo, cổng mới, restart service dùng chung và `/home/bobby`. Không được nạp preview 4317–4320 |
| Cell PostgreSQL dùng một lần | **CÓ** | `scripts/control-api-test.sh` (đọc hết, không sửa): rootless Docker ở `/home/thanhvuong/.local/share/docker`, network `--internal`, **không host port**, rootfs read-only, tmpfs PG 2 GiB. Chạy `npm run build && npm test`: **117 spec file, trong đó 45 research** (PLAN ghi 122/47 vì đếm bằng `ls test`, gồm cả fixture/harness/validator). Sau đó chạy drill `pg_dump → pg_restore` so signature 56 relation. EXIT trap gỡ container/network/tmp |
| Test Python backend (`apps/portal/scripts/test_backend.sh`) | KHÔNG | cần `apps/portal/.venv` + quantbt 1.1.1; contributor không tự cài → NOT_RUN (`CG-P23-05`) |
| Fixture lane trên preview riêng 4417 | CÓ | Playwright 1.62.1 + chromium-1234; `stubPortalApi` của `e2e/fixtures.ts` + builder typed trong runner |
| Regression Execution/Planning | CÓ (tuần tự trên 4417) | project `chromium` (flag off) / `chromium-preview` (flag on) của `playwright.config.ts`; Planning chạy bằng temp config trỏ 4417 |
| Đo tài nguyên | một phần | `/usr/bin/time -v`, `docker stats` cho cell, sampler RSS `ps` cho browser. **Không có cgroup của stack Research** |

Vì vậy mọi test cần stack đều `BLOCKED`, kèm lý do có kiểu và request (`CG-P23-01…05`). Không test nào ghi `NOT_APPLICABLE` hay chạy mô phỏng.

## 1. Packet và những gì đã đọc

| Nguồn | Digest (sha256/16) |
|---|---|
| `~/tv-shots/p23-plan/PLAN.md` | `6eaa103d990f48b8` |
| `~/tv-shots/p23-plan/fable-notes-for-C.md` (authority cho id, trạng thái, wording) | `50d58fb5ae17b84d` |
| `~/tv-shots/p23/a1/A1-report.md` / `~/tv-shots/p23-plan/audit-A1.md` | `139cf0425895cb41` / `81b8a20a73995703` |
| `~/tv-shots/p23/a2/A2-report.md` / `~/tv-shots/p23-plan/audit-A2.md` | `7ca3c1b21b19b205` / `03a50ebcd3728ab4` |
| `~/tv-shots/p23/final/B-report.md` (số đo cuối, head `35d0c861`) | `6095bdf044542e4a` |
| `~/tv-shots/p23/c1/C1-report.md` + 6 bản nháp C1 | `555aa188ab82984f` |
| Guide `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` :2714–2790 (P23), §16.2 :2871–2881 (W00–W10), §16.3 budgets, P24 :2791–2844 | — |
| Unified `#rl-p23` (:5608–5622), `#rl-p24` (:5623–5635), note P22 (form mẫu) | — |
| Template `evidence/P22/thanhvuong-*`, `frontend-handoff-claude.md`, `evidence/RS-01/resource-cleanup.json` | — |

Thứ tự authority khi mâu thuẫn: fable-notes (id/trạng thái) → B-report (số cuối) → A2/A1 → PLAN. Chỗ PLAN sai số đã ghi ở `plan_count_corrections` của [test results](./thanhvuong-test-results.json).

## 2. Git

| Commit | Tree | Cha | Nội dung |
|---|---|---|---|
| `35d0c86176ca96dcb396e85329f9367d9600db17` | `5d5ffc889b5b…` | `29feefb8` (tree `ac354a27`) | test(research): P23 contributor qualification runner for the Research screens (fixture lane). Author Vuong, trailer `Co-Authored-By: Claude Fable 5.1` |
| docs commit 1 | — | `35d0c861` | docs(research): P23 Thanhvuong qualification packet (5 file, gồm receipt này; commit không tự ghi được SHA của chính nó, xem `git log`) |
| docs commit 2 | — | docs commit 1 | docs(research): P23 §13 row, qualification note and contributor handoff |

`git show --numstat 35d0c861` (mọi file đều mới, +N/−0):

| File | + |
|---|---|
| `apps/portal/frontend/playwright.research-qualification.config.ts` | 48 |
| `apps/portal/frontend/e2e/research-qualification/tsconfig.json` | 10 |
| `apps/portal/frontend/e2e/research-qualification/stubs.ts` | 1160 |
| `apps/portal/frontend/e2e/research-qualification/harness.ts` | 249 |
| `apps/portal/frontend/e2e/research-qualification/_probe-p23-matrix.spec.ts` | 251 |
| `apps/portal/frontend/e2e/research-qualification/_probe-p23-load.spec.ts` | 169 |
| `apps/portal/frontend/e2e/research-qualification/_probe-p23-interaction.spec.ts` | 311 |
| `apps/portal/frontend/e2e/research-qualification/_probe-p23-cycles.spec.ts` | 87 |
| `apps/portal/frontend/e2e/research-qualification/_probe-p23-stale.spec.ts` | 207 |
| **Tổng: 9 file** | **+2492 / −0** |

Diff riêng của nhánh so với merge-base (A2, `a5455848...29feefb8`): 45 file +12099/−147 (apps 28, packages 4, upgrade 13), 0 file dưới `apps/portal/backend` (`gx-branch-vs-baseline.txt` `bd424c2c2f08832a`).

**Baseline lúc đóng packet: lệch so với brief.** Sau `git fetch`, `primus-origin/docs/research-loop-plan` = **`33c46b84`**, trong khi brief C2 chờ `1ff3f2d4`.

- Khoảng `1ff3f2d4..33c46b84`: 27 commit (W5a/W5b/W5c/W6a: Screen 07/08/09/11/13, P16/P17/P18/P20), 196 file +22922/−1011. Tip: `merge(research): W6a — P18 report v2 on both lanes, P20 compare fields, Screens 09/13`.
- Unified trên baseline không đổi: dòng P23 vẫn `PLANNED / unassigned / —`. Không có `evidence/P23`. Baseline thêm `evidence/P21/W5C_S11_CLAUDE_2026-09-25.md`.
- Baseline sửa vài file là locator của VD/debt P23: `freezeClient.ts` (+52/−2), `reportClient.ts` (+54/−9), `runLibraryClient.ts` (+3/−2), `RunLibrary.tsx` (+11/−12). Nó cũng có `ReleaseCandidateDetail.tsx` (+1119) / `releaseCandidateClient.ts` (+348) riêng (W5c S11), khác với S11 P21/P22 của nhánh này. Fixture/probe e2e research cũng đổi.
- Merge-base vẫn là `a5455848`.
- Hệ quả: mọi số P23 đo trên `35d0c861` của nhánh, không đo trên baseline. VD-P23-01/03, S01 và stub của runner phải đo lại trên cây đã tích hợp (`B-P23-05`). Package C2 không chẩn đoán thêm.

## 3. Runner đã giao (commit `35d0c861`)

Config `playwright.research-qualification.config.ts`:
- testDir `./e2e/research-qualification`, testMatch `**/_probe-p23-*.spec.ts`.
- `workers: 1`, `fullyParallel: false`, `retries: 0`, timeout 180 s.
- Reporter list + json → `$P23_SHOT_DIR/playwright-report.json`, outputDir `$P23_SHOT_DIR/test-results`.
- Không `webServer`, không `toHaveScreenshot`. Config throw nếu thiếu `RESEARCH_QUAL_BASE_URL` hoặc `P23_SHOT_DIR`.
- Guide id chỉ xuất hiện dưới dạng annotation `{type:"guide"}` (`harness.ts:239`); title là tiếng Anh mô tả.
- Runner nằm ngoài visual baseline bất biến: `playwright.config.ts:81` `testIgnore` `**/_probe*.spec.ts`. `playwright.research-probe.config.ts:4` chỉ match `**/_probe-research-*.spec.ts`.
- `--list` (B gate 5): main 348 test / 8 file (0 p23), research-probe 82 / 2 (0 p23), qualification 78 / 5, không chồng nhau.

| Spec | Test | Chứng minh gì (fixture lane, chỉ client cost) |
|---|---|---|
| `_probe-p23-matrix.spec.ts` | 60 | 15 màn × 4 state × 3 bề rộng = 180 ô. State: healthy, denied (403 rồi 404), unavailable (503), expired (401). Bề rộng 1280/1440/660. Mỗi ô kiểm: không in prose server (sentinel `zq_P23_SERVER_PROSE_SENTINEL`), có copy session-expired, copy 403 = 404, không placeholder trần, overflow ≤ 1 px, đúng một `.portal-shell`, Tab đầu vào trong màn, deep link → back/forward/reload giữ vị trí, cursor giữ (04–08), console 0, fixture gap 0, writes 0 |
| `_probe-p23-load.spec.ts` | 1 | 20 context đồng thời (cookie `p23_qual_session`, identity `qual-user-01…20`) đi 01→03→04→06→08→09→11. Đo: render, writes, số GET, heap CDP, DOM, nav→settle |
| `_probe-p23-interaction.spec.ts` | 7 | request budget suy từ code (bảng dưới) cho 04/06/07/08/13 và poll của 03. Mỗi dòng kiểm: writes 0, DOM sau settle ≤ trước + 5 %, không có GET trùng đang bay, gap 0, console 0 |
| `_probe-p23-cycles.spec.ts` | 1 | 30 chu kỳ 04→08→06, GC trước mỗi mẫu. Heap 5 mẫu đầu so với 5 mẫu cuối ≤ 25 %, DOM phẳng |
| `_probe-p23-stale.spec.ts` | 9 | 04/09/11, mỗi màn 3 kịch bản: A chậm/B nhanh, B chậm/A nhanh, A settle rồi B giữ 3 s (lấy mẫu 1 s sau khi vào B). Kiểm: không còn id/digest của run A trong màn của run B |
| `harness.ts` | — | request log theo context, `quiet()` settle có giới hạn, `upsertRow()` ghi từng dòng ngay khi có, annotation `no-finish-event` / `document-replaced` |
| `stubs.ts` | — | builder typed `satisfies` theo `packages/contracts/generated/*.d.ts`; `refusePrimary` cho 403/404/401/503; tag riêng cho mỗi run (`reportTagFor`, `rcIdFor`) |
| `tsconfig.json` | — | tsconfig của project chỉ phủ `src` + `vite.config.ts`, nên cần file này để typecheck e2e: `npx tsc -p e2e/research-qualification/tsconfig.json` exit 0 (A1) |

Request budget (A1 §8, đường dẫn dưới `apps/portal/frontend/src/research/`):

| Budget | Code làm gì | File:line |
|---|---|---|
| 03 poll | `POLL_FLOOR_MS = 5000`; stream kết thúc thì poll bằng `setInterval`; terminal đóng cả hai → terminal = 0, running ≤ ⌈20/5⌉ + 1 | `progressClient.ts:113`; `useRunProgress.ts:274` |
| 11 mirror | `MIRROR_POLL_MS = 60_000`, dừng khi tab ẩn; không chạm tới trong cửa sổ I1 | `useReleaseCandidateMirror.ts:28` |
| 13 compare | một read mỗi lần đổi `[key, generation]`, read trước bị abort | `useCompare.ts:71–116` |
| 04 hub | một read mỗi `[generation, runId, workspaceId]`; tab và cursor không đọc lại | `useEvidence.ts:84–100` |
| 04 series / passport | lazy, chặn bằng set `asked`: tối đa một lần mỗi kind mỗi run | `useEvidence.ts:106ff` |
| 04 reset khi đổi run | xoá asked/series/passport, **không** xoá `hub` | `useEvidence.ts:176–182` |
| 08 replay | một read mỗi `[intent, generation, runId, workspaceId, limit]`; seek/drag/transport trong cửa sổ đã tải không fetch | `useReplay.ts:81–113` |
| 09 report | một read mỗi run/generation | `useReport.ts:70–110` |
| 06 / 07 detail | một read mỗi route/fold key | `useSearch.ts:47–61`, `useFreeze.ts:59–73` |
| 06/07 ledger | LedgerPanel hỏi một lần mỗi mount | `SearchDetail.tsx:255–256`, `FreezeDetail.tsx:592–593` |

Code không dedupe request. Mỗi hook đọc abort read cũ bằng `AbortController` trong cleanup của effect (vd `useEvidence.ts:84–100`). Vì vậy history của 06/07 có GET detail bị abort, nhưng không có GET trùng nào trong số GET đã hoàn tất.

Một chỗ lệch brief A1 (A1 §2): brief I1 đòi "40 rapid tab/inspect clicks" trên 06/07. Cả hai màn đều không có nút inspect chỉ-đọc, còn nút "verify" của 07 là write nên không bao giờ bấm. I1 dùng 40 lần nhảy stage-rail S2 ⇄ S3 cộng history fold-hash, và title của test ghi rõ điều đó.

## 4. Test-ID matrix (trạng thái đúng fable-notes; title in như Guide :2756–2770)

| ID | Title Guide | Lane | Trạng thái | Nửa đã chạy / chưa chạy |
|---|---|---|---|---|
| P23-T01 | Mixed load20users trong aggregate5GB. | visual-fixture (nửa client) | PARTIAL | Đã chạy: 20 context (`_probe-p23-load`), 140/140 render, writes 0. Chưa: API p95 và 5 GB (`CG-P23-01`) |
| P23-T02 | Repeated jobs không tăng memory vô hạn sau warmup. | visual-fixture (bản tương tự phía browser) | PARTIAL | Đã chạy: 30 chu kỳ, heap +14,2 %. Chưa: phía service (RSS/FD) |
| P23-T03 | Disk high-water/full có behavior bounded. | — | BLOCKED | stack (`CG-P23-01`) |
| P23-T04 | Process/DB/NATS outages được recovery. | — | BLOCKED | stack (`CG-P23-01`); `migration-recovery.spec.ts` PASS trong cell chỉ mang tính thông tin |
| P23-T05 | IDOR/cache/files/exports tenant isolation. | persistence-vs-api + visual-fixture | PARTIAL (FE half FAIL-attributed) | Nửa API/DB PASS: auth 16, mutation-security 7, governance-token 3, a4-owner-access 33, local-read-authority 4, research-bounded-read 3, 13 research controller spec (34 test). Nửa FE (ô denied/expired của matrix): writes 0 PASS; 403=404 FAIL (VD-P23-03); expired FAIL (VD-P23-02); prose FAIL (VD-P23-01). Chưa: files/exports/cache (`CG-P23-02`) |
| P23-T06 | Corrupt part và restore có hash verification. | persistence-vs-api | PARTIAL | Đã chạy: drill signature 56 relation của DB. Chưa: nửa artifact (`CG-P23-03`) |
| P23-T07 | Engine upgrade/default rollback/in-flight pinning đúng. | — | BLOCKED | stack (`CG-P23-01`) |
| P23-T08 | Cold-cache measurement không ảnh hưởng shared execution host. | — | BLOCKED | host execution (`:8090` là của Bobby) + stack (`CG-P23-04`) |
| P23-T09 | Research load không thay execution behavior hoặc quyền. | static + EXECUTION_REGRESSION (preview contributor) | PARTIAL: non-screenshot regression PASS flag-off/on; 33 screenshot cells FAIL (S06) | Đã chạy: static (protected diff rỗng, kernel khớp) + regression. Chưa: coupling động (`CG-P23-04`) |
| P23-T10 | Toàn bộ required regression suites chạy và có raw results. | static/unit + visual-fixture/EXECUTION_REGRESSION on contributor preview (NOT browser-real) | FAIL (2 attributed unit + 33 visual-baseline, S06) | 2 unit fail: `r2Ledger` (`CG-P22-C`) + `PortalShell` (`S01-RUNLIBRARY-PAGE-GUARD`); 33 ô ảnh (`S06`). Lane Python NOT_RUN (`CG-P23-05`) |
| P23-T11 | 20users inspection/slider/far-seek đồng thời không tạo implicit heavy jobs; aggregate5GB vẫn đo đúng. | visual-fixture | PARTIAL | Đã chạy: writes 0, GET có giới hạn (interaction 15/15, load writes 0). Chưa: 5 GB |
| P23-T12 | Audit/what-if/verify/export cạnh primary đều qua quotas/backpressure; no API-process bypass. | — | BLOCKED | stack; `research-bounded-read.spec.ts` chỉ là unit evidence |
| P23-T13 | Upgrade new route/default không auto-enable unsupported mapper hoặc làm reproduce đổi semantics. | — | BLOCKED | stack. Chỉ có tham chiếu REUSED_VERIFIED: unit test capability-reason S12 từ P09 (mang tính thông tin) |
| P23-T14 | Restore/GC giữ exposure, final-audit child target, selection/null-trial và publication source pins. | — | BLOCKED | drill DB là tiền đề, không phải kiểm pin (`CG-P23-03`) |
| P23-T15 | Browser reveal/cursor/deep-link tests pass cùng cold-cache workload; no future-state or cross-run leakage. | visual-fixture | PARTIAL/FAIL | Deep link/history/cursor PASS (fixture, 180/180 ô). Rò chéo run FAIL trên 04 (VD-P23-04; A1 3/3, B 2/2); 09/11 PASS. Chưa: cold cache |
| V11-P23-DR | — | delta-real-data | BLOCKED | không có stack |
| V11-P23-BR | — | visual-fixture | PASS (fixture receipt: lane visual-fixture, URL 127.0.0.1:4417, build 35d0c861, dist digest 68ee0a01d1053b61, 45 shots, assertions listed) | Không bao giờ ghi "browser-real PASS" |
| V11-P23-GX | — | static GX | PASS with open debt | gx-protected-diff `e3b0c44298fc1c14`, gx-kernel `d44dad89a66db88c`. No-debt check fail theo thiết kế vì còn debt mở |

Lanes:

| Lane | Trạng thái |
|---|---|
| delta-real-data | BLOCKED |
| direct-vs-portal | BLOCKED |
| persistence-vs-api | PASS (cell PG thật, 117/117 · 834/834) |
| api-vs-ui | BLOCKED (stub của fixture lane không phải api-vs-ui) |
| visual-fixture | FAIL (attributed VD-P23-01..04). Các nửa ghi riêng, không bù trừ nhau: research probe 82/82 PASS (fixture); nửa layout/history PASS (fixture) |
| browser-real | NOT_RUN |
| dev-host-review | NOT_RUN (lane Guide là smoke dev host live; không có, giống P22). Evidence GX nằm ở V11-P23-GX |

## 5. Workload matrix W00–W10 (Guide §16.2 :2871–2881)

| W | Workload Guide | Trạng thái | Lý do / evidence |
|---|---|---|---|
| W00 | technical fixture 2k–5k bars, deterministic signal | PARTIAL | lane engine/backend NOT_RUN (lane Python cần `.venv`, `CG-P23-05`). Màn FE trên fixture lane cho cùng shape contract PASS (fixture) |
| W01 | one real alpha, real data snapshot, ~50 trials | BLOCKED | cần stack Research (`CG-P23-01`) |
| W02 | WFO valid schedule, 20–40 folds real data | BLOCKED | stack |
| W03 | reactive/event strategy runtime/retention | BLOCKED | stack |
| W04 | portfolio/package multi-symbol variants | BLOCKED | stack |
| W05 | storage-only 100k trials / 1M replay rows | BLOCKED | stack + ledger đã seed |
| W06 | 20 authenticated users reads + heavy queue at 5 GB | PARTIAL | chỉ nửa client: 20 context trên fixture lane (`_probe-p23-load`); API p95/queue/5 GB chưa đo |
| W07 | slow export + long seek + compute + projection | PARTIAL | request budget của seek kiểm trên fixture lane (`_probe-p23-interaction`); backpressure export/compute chưa đo |
| W08 | repeated complete/fail/cancel cycles, RSS/FD growth | PARTIAL | chỉ mẫu heap 30 chu kỳ phía browser (`_probe-p23-cycles`); RSS/FD của service chưa đo |
| W09 | crash/storage/DB-NATS faults + restore + historical read | PARTIAL | drill signature 56 relation `pg_dump/pg_restore` trong cell dùng một lần; lỗi NATS/artifact chưa đo |
| W10 | engine additive-field fixture + newer build, old artifacts unchanged | BLOCKED | cần bản build engine mới đã validate + stack (`CG-P23-01`) |

## 6. Hi-fi check và visual decisions

P23 không có màn riêng (rule 9). Hi-fi check ở đây gồm hai phần: kiểm kê ảnh healthy của 15 màn đã giao (so với receipt các phase trước), và matrix state của runner. 45 ảnh healthy của B (`~/tv-shots/p23/final/shots/`, không commit; sha256/16):

| Màn | 1280 | 1440 | 660 |
|---|---|---|---|
| s00 journey map | `3a710d16f6ef3010` | `a10ea8ff7ca13ab0` | `57c5ef1f65029642` |
| s01 run library | `472d3e6d96d4b0ad` | `d36c3cdb553d99b7` | `a685f3ffc96f174d` |
| s02 new run | `3567b92cf0f6d8f5` | `e837c47213aa860b` | `9138f64832e80c73` |
| s03 run progress | `1b5dcb77fc6bf0d4` | `de41170cf79beacc` | `152b8f9058ff6289` |
| s04 evidence hub | `1a6f9787547dfc3d` | `a6013c4880e53c8a` | `981d66ed69570534` |
| s05 split | `1897f50160f2227a` | `821ec011d6fff5e2` | `862bf43807775041` |
| s06 search | `562f737f06db5696` | `432b00b05bdd5860` | `6f7b5a46ca7a0120` |
| s07 freeze | `1f4b1380b8671eaa` | `394a0a86a9abbd31` | `cba2daa9e7ae40c9` |
| s08 execute replay | `8716b4b4284f1799` | `7364626aea40e442` | `5358680058455c1c` |
| s09 run report | `a57606da704ac895` | `9388eb4dd7399a54` | `fee204ece3d5d0a1` |
| s10 attempt lineage | `ba04d875ec9ce673` | `7172628d7c3d5566` | `cd8846f66834c1c1` |
| s11 release candidate | `abfcfa5bffbd30fa` | `ca7ac2247ca0c9f5` | `d06f341feb3dd179` |
| s12 engine atlas | `5746f4f886863868` | `3564a2bd030516cb` | `d96eb9a694d25426` |
| s13 compare | `51b81cf5b01bd9c7` | `9bd0ed556e84d88a` | `73a7555d900675cb` |
| s14 alpha import | `58687e12876a8239` | `7cced84e54c31e94` | `1491189515efc017` |

Matrix state × màn (B, head `35d0c861`; giống hệt A1 sau khi sort, mỗi FAIL phủ cả 3 bề rộng):

| Màn | healthy | denied (403 rồi 404) | unavailable 503 | expired 401 |
|---|---|---|---|---|
| 00 journey | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 12 atlas | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 02 new run | pass | pass | pass | FAIL không có copy session |
| 14 alpha import | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 01 run library | pass | FAIL prose + 403≠404 | FAIL prose | FAIL prose + không có copy session |
| 03 run progress | pass | FAIL prose + 403≠404 | FAIL prose | FAIL prose + không có copy session |
| 04 evidence hub | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 05 split | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 06 search | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 07 freeze | pass | FAIL prose | FAIL prose | FAIL prose + không có copy session |
| 08 execute replay | pass | pass | pass | pass |
| 09 run report | pass | FAIL 403≠404 | pass | pass |
| 10 lineage | pass | pass | pass | pass |
| 11 release candidate | pass | FAIL 403≠404 | pass | pass |
| 13 compare | pass | pass | pass | pass |

Placeholder trần, overflow, shell, Tab đầu, history, cursor, console, gap và writes đều pass ở mọi ô (180/180). 123 dòng lỗi (`matrix-stale-errors.txt` `740ce3360848ebb0`) chia ra: VD-P23-01 81 dòng, VD-P23-02 30, VD-P23-03 12.

### 6.1 Visual decision ledger `VD-P23-01…05` (đo bằng runner; Fable đã kiểm trong source, audit-A1)

| id | Mức | Màn | Locator | Ghi chú |
|---|---|---|---|---|
| VD-P23-01: `error.message` của server hiện ra khi bị từ chối | P1 | 00,12,14,01,03,04,05,06,07 (81 ô matrix: 27 denied, 27 unavailable, 27 expired) | `foundationClient.ts:141`, `alphaImportClient.ts:72`, `runLibraryClient.ts:110`, `progressClient.ts:95`, `evidenceClient.ts:109` (+`:243`, `useEvidence.ts:187`), `splitClient.ts:62`, `searchClient.ts:72`, `freezeClient.ts:81` | **Đã biết từ P16** (`evidence/P16/thanhvuong-review-addendum.md` §4 item 9, dòng 174, "open question chưa có ID"), chưa sửa, nay đo được. s08/09/10/11/13 dùng copy cố định nên pass |
| VD-P23-02: 401 hiện thành denied, không có state session-expired | P1 | 00,12,02,14,01,03,04,05,06,07 | `evidenceClient.ts:240`, `state.ts:98` + cùng cách gộp ở các client khác | writes = 0 ở mọi ô expired |
| VD-P23-03: phân biệt được 403 và 404 (F-04) | P1 | 01,03 (badge ⊘ DENIED vs ∅ EMPTY), 09 (`reportClient.ts:237–238`), 11 (`ReleaseCandidateDetail.tsx:1101–1103` in `refusal.code` lấy từ `releaseCandidateClient.ts:399`) | **Lệch với receipt P21 §A5** (`evidence/P21/thanhvuong-frontend-receipt.md:497` dòng A5, và dòng F-04 G10 ở :266 claim F-04 cho S11): copy trung tính, nhưng `refusal.code` in ra (`RESEARCH_FORBIDDEN` vs `RESEARCH_NOT_FOUND`) làm lộ sự khác nhau |
| VD-P23-04: evidence hub giữ nội dung run A dưới URL run B trong lúc B đang tải | P2 | 04 | `EvidenceFlowRoute.tsx:17–20` không key theo runId; `useEvidence.ts:176–182` reset series/passport nhưng không reset `hub` | A1 3/3, B 2/2 (`_probe-p23-stale` "retained", giữ `R-WFO-118` / `p13r1_7d21ab`). Sau khi settle thì không còn rò. 09/11 sạch |
| VD-P23-05: read hub gửi ETag của run A ở lần đọc đầu của run B | P3 (quan sát code, chưa đo) | 04 | `useEvidence.ts:86` | đi cặp với VD-P23-04 |

**Quyết định: ghi lại, KHÔNG sửa trong P23.**
- P23 là qualification phase.
- Bản sửa trải trên 8 client + `state.ts` + 2 màn + unit test.
- Copy denied của các màn đã ship có thể nằm trong visual baseline bất biến của Bobby (`e2e/visual.spec.ts-snapshots/auth-access-denied-research-*.png`), mà contributor không được sửa.

→ `B-P23-04` `REQUIRES_BOBBY_DECISION`. Debt id: `S02-RESEARCH-REFUSAL-PROSE` (VD-01), `S03-RESEARCH-401-SESSION-STATE` (VD-02), `S04-F04-403-404-DISTINGUISHABLE` (VD-03), `S05-EVIDENCE-HUB-RUN-KEY` (VD-04+05). Tất cả đang mở; owner do Bobby quyết (Codex, hoặc nhánh `fix/*` của contributor).

Thứ tự sửa đề xuất trong một `fix/*` sau này:
1. VD-01+02: một refusal mapper (status → state có kiểu + copy trung tính + `request_id`, bỏ message).
2. VD-03: s11 thôi in `refusal.code`; s01/s03/s09 dùng cùng badge/copy cho 403/404.
3. VD-04+05: reset `hub` khi runId đổi, hoặc key route theo runId.

Hệ quả cho runner: 30/60 test matrix và 1/9 test stale sẽ fail tất định cho đến khi sửa. Đây là chủ ý, vì qualification phải báo lỗi. Ghi là `FAIL (attributed VD-P23-01..04)`, không ghi là flaky.

## 7. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `stubPortalApi(page, "healthy")`, fixture `e2e/research-foundation/*.json`, catch-all 501 `not_stubbed` | `apps/portal/frontend/e2e/fixtures.ts` (có sẵn) |
| Mẫu probe research + cách đo ảnh healthy theo màn/bề rộng | probe P09 `_probe-research-*.spec.ts` |
| Builder `replayWindow` | `src/research/executeReplay.test.tsx` (P17) |
| Builder `reportDetail(runId, tag)` | `reportDetail.test.tsx` (P18) |
| Builder `lineage()`, `compareAttempts` / `compareMarkets` / `comparePair` | probe receipt P20 |
| Builder `rcCompose` + `rcMirror` có `publication` / `mirror` | stub P22 (tvp22) |
| Mẫu đo heap CDP `JSHeapUsedSize` + đếm DOM, ngưỡng tạm 8000 DOM / 200 MB heap | `apps/portal/frontend/e2e/execution-journeys.spec.ts:771–772` |
| Kiểu từ contract sinh ra (`satisfies`) | `packages/contracts/generated/*.d.ts` |
| Cell PG + drill restore | `scripts/control-api-test.sh` (không sửa) |

Mới: `harness.ts` (request log, `quiet()`, `upsertRow()`, annotation `no-finish-event`), `stubs.ts` (`refusePrimary` + sentinel, tag riêng cho mỗi run), 5 spec `_probe-p23-*`, config riêng. Không thêm dependency, không sửa `src/`, không có asset hay màu raw, không `toHaveScreenshot`.

## 8. Test report

Log nằm ở `~/tv-shots/p23/a2/` (A2, head `29feefb8`) và `~/tv-shots/p23/final/` (B, head `35d0c861`), không commit. Digest = `sha256sum | cut -c1-16`. `hashes.txt` của B: `e7445206683dc877` (593 file, 328 PNG).

### 8.1 Gói A2 (không browser)

| Gate | Kết quả | Log |
|---|---|---|
| Cell `/usr/bin/time -v bash scripts/control-api-test.sh` | **PASS**, exit 0: 117/117 file, 834/834 test, vitest 442,21 s, wall 8:47.34. Dòng cuối: `Control API security/query/governance tests and PostgreSQL restore drill passed.` | `cell.log` `1a8633f3b15c8ac2`, `cell-files.md` `52e759bfa378b61c` |
| Migration 063 (`research-release-candidate-publication-migration.spec.ts`) trên PG fresh | **PASS** 1 test, 2171 ms → đóng `S11-P22-MIGRATION-056-UNPROVEN` | cùng log |
| Các migration spec khác (release-candidate 1, rs01 1, rs02 2, compare 2, lineage 2, report 3, migration-recovery 2) | PASS 13 | `52e759bfa378b61c` |
| Spec security/isolation trên PG thật | PASS: auth 16, mutation-security 7, governance-token 3, a4-owner-access 33, local-read-authority 4, research-bounded-read 3; 13 research controller spec (34 test) | `1a8633f3b15c8ac2` |
| Drill `pg_dump → createdb portal_control_restore → pg_restore --exit-on-error` | PASS, chỉ là signature đếm dòng 56 relation. Không kiểm byte artifact; script không in giá trị signature | `1a8633f3b15c8ac2` |
| contracts `npm test` / `snapshot.py --check` | 0: 14 file / 177 test; khớp 198 file | `c2773fa9232897ef` / `92e2c08c5a19bae5` |
| control-api `npm run build` | 0 | `c088c0dc82ea4305` |
| control-api `npm run typecheck` | FAIL_PREEXISTING, exit 2: 0 errors in src / 0 in branch-changed files; 80 inherited test-only errors incl. 9 in 2 baseline research specs | `1da219695bda6984` |
| FE `npx tsc -b --noEmit` / `npm run build` | 0 / 0 (cảnh báo 4 chunk > 500 kB có từ trước) | `93ff7811a209e2a8` / `ee1ce428991d77e7` |
| FE `npx vitest run` lần 1 / lần 2 | FAIL_KNOWN, exit 1: 173 file, 3153 pass / 2 fail / 1 skip ở cả hai lần. Hai fail là `r2Ledger` (`CG-P22-C`) và `PortalShell` (`S01-RUNLIBRARY-PAGE-GUARD`) | `419a6db02f42b441` / `6180b15ce04782e7` |
| FE `npx vitest run src/app/PortalShell.test.tsx` ×2 | PASS 18/18 mỗi lần | `4f81739ee783ac89`, `77ba56c7f51772a0` |
| Planning typecheck / test / build | 0 / 17 file · 99 test / 0 | `c732e4c362b45141` / `30f22d4767ebe8a7` / `b7219117581d6651` |
| GX protected diff / kernel / listener / rootless | rỗng / khớp `34dc1847…054d` / A2 không mở listener / rootless, không sudo | `e3b0c44298fc1c14` / `d44dad89a66db88c` / `44c2856de67dbbb7`→`2092b0f8701f1ef0` / `e65110cfae331b77` |

### 8.2 Gói B (browser, head `35d0c861`, preview riêng 127.0.0.1:4417)

| Gate | Kết quả | Log |
|---|---|---|
| B0 HEAD + tree sạch | PASS | `head.txt` `495bda976e3b44a8` |
| B1a build flag off (`VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true VITE_EXECUTION_PREVIEW_ENABLED=false npm run build`) | PASS, dist `68ee0a01d1053b61` | `cd3990d0126c6f92` |
| B1b EXECUTION_REGRESSION `chromium` (flag off), 248 test / 5 file | **FAIL (visual baseline mismatch on contributor host, deterministic, cause NOT diagnosed)**: 220 pass, 28 FAIL, 0 flaky, 12,0 phút | `d4fd43c2fd68a40e` |
| B1b rerun 28 fail (1 worker) | giống hệt 28/28, cùng số pixel | `1c583f7fc5142dfb` |
| B2a build flag on (`VITE_EXECUTION_PREVIEW_ENABLED=true VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true npx vite build --outDir dist-preview`) | PASS, 8,03 s, dist-preview `cd3006f4b7d4ba3f` | `dd1b057260270df3` |
| B2b EXECUTION_REGRESSION `chromium-preview` (flag on), 100 test / 3 file | **FAIL (như trên)**: 79 pass, 5 FAIL, 16 skip (`el-v2-evidence-shots` chỉ chạy khi `EL_V2_SHOTS=1`, theo thiết kế), 4,3 phút | `c397389c0bc7d8eb` |
| B2b rerun 5 fail | giống hệt 5/5 | `58877e030117715e` |
| B3a / B3b Planning build / e2e | PASS / 2/2 PASS | `bf580155164fa8ee` / `541af0d285ba80d1` |
| B4a research probe P09, lần 1 | 49/82: 33 EACCES khi ghi `/tmp/research-shots` (thuộc bobby; lỗi môi trường, không ghi gì vào đó) | `f8b685f1f0aea36a` |
| B4a research probe P09, lần 2 (`RESEARCH_SHOT_DIR=~/tv-shots/p23/final/research-probe-shots`) | **82/82 PASS (fixture)**: 8 fixture + 74 product, 1,2 phút (PLAN ghi 8 + 76; số đúng là 82) | `055254841fdae356` |
| B4b runner P23 (5 spec, `--workers=1`) | **FAIL (attributed VD-P23-01..04)**: 78 test, 47 pass, 31 FAIL, 0 flaky, 12,7 phút | `pw-p23.log` `25c18c7845ae945e`, report `cfc1e4a836fe19b8` |
| — matrix | `FAIL (attributed VD-P23-01..03)` 30/60; nửa layout/history PASS (fixture) 180/180 ô | |
| — stale | `8/9 PASS, 1 FAIL (VD-P23-04)` | `stale.json` `4b10bc90871e7297` |
| — load / interaction / cycles | PASS (fixture) 1/1 / 7/7 / 1/1 | `2a9bad27eda1c525` / `c7a603a5f58c65b8` / `a77bace5437ba7d9` |
| B4b rerun matrix | giống hệt: 30/60, cùng 123 dòng lỗi | `f1060e6aa772df8d`, report `b063568ffb620bf2` |
| B4b rerun stale | giống hệt: 8/9, `stale.json` giống từng byte | `fa031c2e3c8ef1e5`, report `c8d13487d5f80ec2` |
| B5 cô lập runner (`--list`) | PASS: main 348/8 (0 p23), probe 82/2, qualification 78/5 | `2901eb16cadd149c` / `204ef2832d43e4de` / `a1f1720020ebbb48` |
| B6 sampler RSS browser | đo, không phải gate (xem 8.5) | `browser-rss.csv` `e402c8326874ad2e` |
| B7 dọn | PASS: 4 temp config đã chép `.copy` rồi xoá, `dist-preview` đã xoá, tree sạch, 4417 trống | `temp-configs.txt` `4be4de7f3153efd9` |

33 ô EXECUTION_REGRESSION đều là `toHaveScreenshot` lệch so với baseline bất biến `*-chromium-linux.png` / `*-chromium-preview-linux.png` của Bobby (đổi lần cuối ở `7441c572`, 2026-09-17).
- Tỉ lệ lệch 0.01–0.05, vài ô lệch chiều cao 1–2 px. Lớn nhất là `phase-2-gate-r1 @ laptop` 973×4205 → 973×4159.
- Mọi test không chụp ảnh đều PASS (BFF double contract, journeys).
- Đây là lần đầu lane này chạy trên host contributor; không receipt P17–P22 nào chạy nó.
- Diff rơi cả vào suite nhánh chưa từng chạm (fixture execution, planning-reports). Font/rasteriser của host là giả thuyết, chưa phải bằng chứng.
- Snapshot không bị đụng (`updateSnapshots: none`).

→ `S06-VISUAL-BASELINE-HOST-DRIFT`, `B-P23-06`.

### 8.3 Client cost (B; fixture lane, host contributor đang có tải khác; không phải latency API, không so với cổng p95 §16.3)

| Màn | Render | p50 ms | p95 ms | Heap max MB | DOM max | GET | Writes |
|---|---|---|---|---|---|---|---|
| 01 | 20/20 | 6376 | 6490 | 7.6 | 510 | 240 | 0 |
| 03 | 20/20 | 6018 | 6315 | 12.8 | 421 | 162 | 0 |
| 04 | 20/20 | 5996 | 34132* | 16.8 | 413 | 167 | 0 |
| 06 | 20/20 | 5508 | 5877 | 20.6 | 466 | 161 | 0 |
| 08 | 20/20 | 6350 | 6505 | 29.9 | 1051 | 146 | 0 |
| 09 | 20/20 | 6127 | 7074 | 33.0 | 747 | 141 | 0 |
| 11 | 20/20 | 3431 | 6561 | 38.2 | 627 | 140 | 0 |

\* p95 của s04 bị đội lên bởi 3 mẫu `no-finish-event` (qual-user-01 32946 ms, -06 34158 ms, -03 34132 ms; harness chờ 30 s trên `GET /api/runs`). Bỏ 3 mẫu này thì mẫu thật lớn nhất là 7080 ms. So với lần chạy đầu của A1 (cùng kết luận): p50 của B cao hơn 1–1,7 s trên phần lớn màn (A1: 01 5688, 04 4272), vì host đang có tải; p95 của A1 ≤ 6,1 s.

Interaction: 15/15 dòng trong budget (vd 04: 40 lần bấm tab → hub 0, series ≤ 1 mỗi kind, passport ≤ 1; 08: seek/drag/transport → replay 0; 03 terminal → 0, running 20 s ≤ 5).

Cycles (B): baseline 5,6 MiB, trung bình 5 mẫu đầu 8,39, 5 mẫu cuối 9,59, max 10,23 → **+14,2 %** (`WITHIN_25_PERCENT`; A1 +14,0 %). Theo màn: s04 +19,3 %, s08 +12,0 %, s06 +11,9 %. DOM phẳng.

Stale (B): s04 "retained" FAIL (giữ `R-WFO-118` / `p13r1_7d21ab` 1 s sau khi vào `R-WFO-218`). Mọi kịch bản khác pass (aborted / delivered-and-ignored, không rò sau settle).

### 8.4 Lịch sử flake

- 0 flaky test ở mọi lane (A2 và B). Mọi fail đều tái hiện khi rerun: `rerun_identical` cho EXECUTION_REGRESSION 28/28 và 5/5, matrix (123 dòng, giống hệt A1 sau sort), stale.
- `PortalShell` (`mounts QuantBT under its canonical route with no nested topbar`):
  - P22 A2 ghi "flaky at baseline"; P22 B pass.
  - P23 A2: chạy cả suite FAIL 2/2, chạy riêng PASS 2/2 (18/18).
  - Gói B không chạy vitest.
  - Kết luận: không phải flake, mà là lỗi tất định khi chạy chung suite. Stub catch-all trả `[]`, còn `RunLibrary.tsx:784` đọc `response.page.filtered_rows` → TypeError → module unmount. Ghi thành `S01-RUNLIBRARY-PAGE-GUARD`.

### 8.5 Tài nguyên (mỗi số kèm phạm vi)

| Đo | Giá trị | Phạm vi |
|---|---|---|
| Cell: container node max | 674,0 MiB (07:44:44Z, pha tsc build), CPU max 202,2 % | contributor host; not the Research stack cgroup; 5 GB gate NOT measured (`cell-stats.csv` `79e2a89dc1d5951e`) |
| Cell: container PG max | 816,0 MiB (gồm tmpfs data ≤ 2 GiB tính vào cgroup container), CPU max 100,4 % | như trên |
| Cell wall | 8:47.34 | như trên |
| `time -v` peak RSS (kB), build | control-api 769728 · FE 1025912 · Planning 430032 | tiến trình đơn lớn nhất, không phải tổng; contributor host |
| `time -v` peak RSS (kB), static | control-api typecheck 820772 · FE tsc 1070436 · Planning typecheck 253904 · snapshot 15868 | như trên |
| `time -v` peak RSS (kB), test | contracts 163472 · FE vitest 462612 (rerun 416156) · Planning 204928 | như trên |
| `time -v` wrapper cell | 44412 kB | chỉ wrapper + docker CLI, không phải cell |
| RSS browser (B) | max 6124 MB (28 tiến trình) lúc load 20 context; plateau ≈ 1,0 GB (1010 / 996 / 996 MB) | one chromium, 20 contexts, summed RSS upper bound, contributor host |
| RSS harness từ load-samples | B 313 → 2033 → 5166 MB; A1 309 → 1980 → 4308 MB (trước / mở 20 context / sau khi đi hết) | như trên |
| Host `free -m` | A2: used/avail 12525/17926 → 14155/16288 MiB; B: available thấp nhất 14757 / 32092 MB | host dùng chung, 8 core, load avg 12–14 |
| `df /tmp` | 338G/283G → 339G/282G (55 %) | host |

Aggregate 5,000,000,000 bytes **chưa đo**: không có cgroup của stack Research.

### 8.6 Ghi chú harness

- Hai `waitForTimeout` ở `_probe-p23-stale.spec.ts:143,186` là mốc thời gian của giao thức stale (300 ms chuyển run, 1 s lấy mẫu giữa chừng), không phải chờ settle.
- `no-finish-event`: Playwright đôi khi không bao giờ phát `requestfinished`/`requestfailed` cho read của shell (`journey`, `atlas`, `/api/runs`, `/api/strategies`) khi điều hướng history. Harness đóng request đó sau timeout và ghi annotation. Ô có annotation vẫn chạy đủ check. B: 3 lần ở load (3 mẫu s04 bị đội) + 1 lần ở matrix.
- RSS là tổng của **một** chromium với 20 context trên host contributor, là cận trên, không phải gate.
- Luật placeholder: "—" chỉ tính là placeholder trần khi nó là toàn bộ text của element và không có lý do vắng mặt bên cạnh. N/A / undefined / null / NaN luôn tính. Không có finding nào theo luật cuối.
- Research probe P09 mặc định ghi `/tmp/research-shots` (thuộc bobby). Contributor phải đặt `RESEARCH_SHOT_DIR`.

## 9. Backend request

Chi tiết ở [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md). Tất cả OPEN:

| ID | Owner | Cần gì |
|---|---|---|
| `CG-P23-01` | Bobby (provisioning) | stack Research cô lập cho contributor (compose project, loopback port, env file, image build receipt, cgroup scope cho 5 GB) |
| `CG-P23-02` | @codex + stack | kiểm cô lập export/file/artifact (nửa sau T05) |
| `CG-P23-03` | @codex + stack | drill corrupt part + restore artifact có hash và giữ pin (nửa artifact T06/T14) |
| `CG-P23-04` | stack + probe execution; `:8090` của Bobby | coupling Execution + cold cache (T08, nửa động T09) |
| `CG-P23-05` | provisioning | `.venv` + quantbt 1.1.1 cho `apps/portal/scripts/test_backend.sh` |
| `CG-P22-C` | Bobby / Codex | ledger `capability-inventory.v1.json` thiếu 3 route P22 (`r2Ledger` fail); mang từ P22, không đổi |

Không mở request cho S01–S06: đó là lỗi FE/test hoặc câu hỏi về host của baseline ảnh; contract không thiếu gì.

## 10. Debt

Chi tiết ở [thanhvuong-debt-register.json](./thanhvuong-debt-register.json).

| ID | Trạng thái | Owner | Tóm tắt |
|---|---|---|---|
| `S11-P22-MIGRATION-056-UNPROVEN` | **RESOLVED** trong P23 | — | id chỉ file nay mang số 063; spec PASS 1 test trên PG fresh trong cell (`cell.log` `1a8633f3b15c8ac2`, `cell-files.md` `52e759bfa378b61c`). Chỉ là apply fresh, không phải upgrade trên DB có dữ liệu |
| `S01-RUNLIBRARY-PAGE-GUARD` | OPEN | Bobby / Codex (`B-P23-04`) | `RunLibrary.tsx:784` `response.page.filtered_rows`; chạy cả suite fail 2/2, chạy riêng pass 2/2 |
| `S02-RESEARCH-REFUSAL-PROSE` | OPEN (P1) | Bobby quyết (`B-P23-04`) | VD-P23-01; câu hỏi mở số 9 của P16 |
| `S03-RESEARCH-401-SESSION-STATE` | OPEN (P1) | Bobby quyết (`B-P23-04`) | VD-P23-02 |
| `S04-F04-403-404-DISTINGUISHABLE` | OPEN (P1) | Bobby quyết (`B-P23-04`) | VD-P23-03 |
| `S05-EVIDENCE-HUB-RUN-KEY` | OPEN (P2/P3) | Bobby quyết (`B-P23-04`) | VD-P23-04 + VD-P23-05 |
| `S06-VISUAL-BASELINE-HOST-DRIFT` | OPEN | Bobby (`B-P23-06`) | 33 ô `toHaveScreenshot` lệch trên host contributor, chưa chẩn đoán |

Debt/VD/CG của P22 giữ nguyên ở [P22 register](../P22/thanhvuong-debt-register.json). Downstream gate `P23-FE-DG-01…09` (mỗi id trích dòng Guide P24 hoặc bullet `#rl-p24` mà nó truy về) nằm trong `explicit_downstream_gates`.

## 11. Việc Bobby quyết

| ID | Câu hỏi |
|---|---|
| `B-P23-01` | Nhận hay bỏ bản P23 partial do contributor làm ngoài D3 |
| `B-P23-02` | Dựng stack cô lập (`CG-P23-01`), hay tự chạy các lane bị chặn bằng runner đã commit + `scripts/control-api-test.sh` |
| `B-P23-03` | Giữ ngưỡng client tạm (8000 DOM nodes / 200 MB heap, `apps/portal/frontend/e2e/execution-journeys.spec.ts:771–772`), hay thay bằng ngưỡng suy từ §16.3 |
| `B-P23-04` | FE defect `S01-RUNLIBRARY-PAGE-GUARD` + VD-P23-01..05 (`S02`–`S05`): sửa trong `fix/*` của contributor (cần quyền đụng snapshot baseline) hay giao Codex |
| `B-P23-05` | Tích hợp P21 + P22 + P23 vào baseline (D1: Codex merge). Baseline đã sang `33c46b84`, nên cần đo lại S01/VD-01/VD-03 trên cây đã tích hợp |
| `B-P23-06` | Chạy project `chromium` / `chromium-preview` trên host baseline với `35d0c861` để tách drift của host khỏi drift của nhánh |

## 12. Audit Fable

| Gói | Audit | Kết quả |
|---|---|---|
| A1 (runner + lần chạy đầu, head `29feefb8`) | `audit-A1.md` `81b8a20a73995703` trên `A1-report.md` `139cf0425895cb41` | **PASS**. Runner được nhận nguyên trạng và commit thành `35d0c861`. VD-P23-01..05 đã kiểm trong source. `waitForTimeout` ×2 chấp nhận được (mốc giao thức). Quyết định: ghi lại, không sửa trong P23 |
| A2 (cell + gate static/unit/build) | `audit-A2.md` `03a50ebcd3728ab4` trên `A2-report.md` `7ca3c1b21b19b205` | **PASS**, không cần rerun. PLAN sửa thành 117/45. `S11-P22-MIGRATION-056-UNPROVEN` → RESOLVED. Mở `S01-RUNLIBRARY-PAGE-GUARD`. Giữ 2 image, ghi là `RETAINED_IMAGES` |
| B (browser, head `35d0c861`) | số liệu được `fable-notes-for-C.md` `50d58fb5ae17b84d` nhận | thêm `S06-VISUAL-BASELINE-HOST-DRIFT` + `B-P23-06`; T09/T10 như §4 |

## 13. Kết luận có phạm vi

- **Đã chứng minh (trong phạm vi đã nêu):**
  - Trên PostgreSQL thật dùng một lần: toàn bộ 117 spec file / 834 test của control-api, spec migration 063 và spec isolation phía DB/API đều PASS; drill restore đếm dòng 56 relation PASS.
  - Protected diff rỗng, kernel khớp.
  - Trên fixture lane: layout/a11y/history/cursor/writes sạch ở 180/180 ô; 20 context không write; request budget đúng code; heap +14,2 % sau 30 chu kỳ.
  - Regression Execution và Planning không chụp ảnh đều PASS; research probe P09 82/82 PASS (fixture).
- **Đo được là lỗi (đã quy trách nhiệm, chưa sửa):**
  - VD-P23-01..04: 30 test matrix + 1 test stale.
  - 2 unit fail (`CG-P22-C`, `S01`).
  - 33 ô ảnh trên host contributor (`S06`).
- **Chưa đo hoặc bị chặn:**
  - mọi thứ cần stack Research (T03/T04/T07/T08/T12/T13/T14, V11-P23-DR, W01–W05/W10, nửa stack của T01/T02/T05/T06/T09/T11/T15);
  - lane Python backend;
  - browser-real;
  - dev-host-review;
  - gate aggregate 5 GB;
  - cold cache;
  - axe.
- **Không claim** `VERIFIED` hay `CERTIFIED`. Không có exit gate P23 nào của Guide được coi là đạt. Mọi kết quả chờ `B-P23-01`.
