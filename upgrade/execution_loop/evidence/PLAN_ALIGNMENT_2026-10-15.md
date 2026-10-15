# Execution V2 — planning addendum, feasibility và lowfi

Ngày 2026-10-15 (Asia/Saigon). Scope Bobby giao: đọc files mới, đối chiếu code,
đề xuất thứ tự và ghi phase index Unified; **documentation-only**.

## Inputs và pins

- Local `/home/bobby/portal-research`, branch `docs/research-loop-plan`, HEAD
  `be56efdf8a44b0fd8cd44202b04ada582293a1dd`; tracking ahead430 là local ref
  observation, không fetch remote hoặc gọi đó là deployed source.
- Trước chỉnh có tracked modifications `AGENTS.md`, `CLAUDE.md`, Unified và
  untracked `upgrade/execution_loop/` từ gói onboarding. Giữ nguyên chúng.
  Commit mới `be56efdf` là Claude visual baseline; không sửa code/baseline.
- HK audit giữ [receipt trước](SOURCE_ALIGNMENT_2026-10-15.md), không tự nâng
  reported runtime thành direct proof; phải repin latest journal/locks trước
  từng gói implementation. Lượt planning này không SSH/build/load lại.
- Đọc đủ feasibility 133 dòng; xem trực tiếp hai PNG qua image viewer.
  Không chạy reference numerical tests hay browser nghiệm thu sản phẩm.

| Input | SHA-256 |
| --- | --- |
| `SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md` | `109659d2f27159052ee684a43eafd130dd2540c4e7dd995a5f0dfe1647029ff9` |
| `ChatGPT Image Oct 15, 2026, 11_56_37 PM.png` | `ca21e679ffe214a79dbb69a584be403d42facc8def9b3dec24e3d9a920352c3d` |
| `ChatGPT Image Oct 15, 2026, 11_56_58 PM.png` | `dd46006ba96b213a284aa2f1a32157f0fa3658d3a10b171d816f16661f79409d` |

## Findings và interpretation

1. Feasibility: main risk là economic source/provenance/config, không arithmetic
   F. P/R/B đã chốt; do not reopen formula. Shared deterministic module có thể
   triển khai fixture sớm; numeric production cần source/config qualification.
2. Overview image là content lowfi: date, Initial/Added funds, PnL/DD/score,
   chart. Weighted Portfolio wording không override direct economic NAV spec.
   Initial/Added funds attribution không tự có vì layout chia hai cột.
3. Fleet image nêu row/columns/stage views/sorts; UX guide thêm Paper/Archive,
   detail/permissions. Giữ fields nhưng không ép Claude dựng Excel literal.
   Hai ảnh không phải HiFi cuối/visual baseline được duyệt.
4. Source confirmed: `apps/control-api/src/manager-lists/manager-lists.service.ts`
   `ensureSnapshot` retained/SWR/coalescing; `admin/owner-access.guard.ts` owner
   session/CSRF; `auth/owner-access.service.ts` capabilities/workspace scopes;
   Research retained analytics v2 schema. Những nền này không tự chứng minh
   V2 resource authority, TS membership hoặc P/R/B runtime.
5. Edge `services/portal-execution-edge-rs/crates/edge-service/src/main.rs`
   config rejects command relay enable. Vì vậy command bridge là implementation
   và integration gate, không “bật flag để có đủ”. Giữ previous Governance
   positive-lane limitations; read-only source inspection không đóng chúng.
6. Targeted search `qbts_prb_v1_1` trong control-api/services/packages không
   match; chưa gọi đó là exhaustive whole-repo algorithm audit. ELP2-00/Score
   P0 phải hoàn tất legacy calculator inventory trước chọn module.

## Plan delivered, không implementation delivered

[Unified §14.1–14.7](../../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-sequencing):
12 ELP2 phase entries (goal/dependency/to-do/FE/test/exit/rollback), 11 UXM
entries linked guide, Score P0…P3 mapping, Edge external dependencies, receipt
reuse discipline và next approval packages. Existing root agent rules unchanged
in this slice. README cập nhật missing-file status và link ảnh/plan.

Backend lead một contract slice, Claude audit/design song song. First proposed
assignment ELP2-00 + UXM-00, rồi ELP2-01 + UXM-01/02. Chưa phase nào PASS;
không sửa runtime/code/DB/users/grants, không merge/push/sign/deploy.

## Validation / resources / rollback

Documentation-only validation: 31 local links/anchors resolve, 12 ELP2 anchors
unique, zero trailing-whitespace findings; `git diff --check` rc0. Input hashes
được ghi ở trên; không sửa source guides hoặc ảnh. App/DB/browser/load tests
NOT_RUN (không implementation change); CPU/RAM workload NOT_MEASURED vì không
chạy workload. Không tạo container/volume/process nền cần cleanup.
Rollback chỉ revert đúng docs addendum nếu được yêu cầu, giữ guide/ảnh và
concurrent owner edits. Commit hook/build gate PENDING; không bypass hook.
