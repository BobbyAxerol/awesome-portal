# Biên nhận hai lần chạy visual cả suite, 2026-10-21

Phạm vi: DEBT-UXM07-037 mục "không có receipt" cho **hai lần chạy này**. Không phải receipt cho SHA hạ cánh (xem "Không chứng minh").

Lane: FIXTURE_LAB / BFF_DOUBLE. Lệnh trong log: `npm run e2e:visual` = `playwright test --workers=2` (cả ba project `chromium`, `chromium-preview`, `chromium-v2`) chạy trong image ghim `mcr.microsoft.com/playwright:v1.62.1-noble` qua `scripts/portal-web-visual.sh` (đường dẫn trong log là `/repo/apps/portal/frontend/...`, tức là mount của script đó). Chỉ chép dòng tổng kết và tên ca đỏ; không chép gì khác từ log (log gốc không có secret nhưng nhiều nhiễu WebServer).

Log gốc (ngoài repo, scratchpad của lead): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/visual.plain` (lần 1) và `.../visual2.plain` (lần 2). Cả hai kết thúc `exit=1`.

## Lần 1: SHA `03634f6e`

Log mtime 2026-10-20 18:53 (commit `03634f6e` lúc 18:47:30). `Running 633 tests using 2 workers`.

```
  37 failed
  16 skipped
  580 passed (45.4m)
```

37 ca đỏ, theo lỗi đầu tiên của từng ca trong log (cộng lại đúng 37):

- **1 lệch pixel thật**: `execution-fixtures › phase-3-gate-r2-review-states-only @ laptop` (`execution-phase-3-gate-r2-review-states-only-laptop.png`, 7058 px khác, tỉ lệ 0,01). Đây là lệch ảnh duy nhất của lần chạy.
- **4 ca `_preview-governance-c06`** (@1280 và @660, hai nhóm): cần workspace Research và file mật khẩu preview, không có trong container (`GOV_WORKSPACE ... is required`, `ENOENT` trên file credential). Biên nhận cần credential, không phải ca của suite visual.
- **10 ca `execution-surface-audit`**: 5 `nothing is clipped` (mobile, tablet, laptop, workstation, desktop-1440: bảng cuộn ngang thiếu `overflow-x: auto`) và 5 `locked type scale` (cỡ chữ ngoài thang §5.2). Cộng 2 ca laptop bị trình duyệt sập (`Target crashed`): `a truncated cell is prose`, `no id is used twice`.
- **2 ca `chromium-preview` hết 60 s**: `execution-journeys › EL-V2-05 governance chain`, `execution-preview › every product route`.
- **`chromium-v2`, 18 ca**: `alpha-scoped @1280` (`horizontal page overflow on Deployments`); `coexistence › budget` fleet và workbench-fills (trần số request khi đổi tab: `measured 5 ... ceiling 2`, `measured 1 ... ceiling 0`); `coexistence › idle` 9 ca (3 hết 60 s: portfolio-360, sandbox-v2body, canary; 4 `toBeVisible`: compare, alpha-360, alpha-replay, live-continuity; 2 sập: canary-guard `clock.runFor`, live `clock.install`); `coexistence › not-available disclosure` 2 ca (`toContainText`: Tab/Enter/Space/Escape và chạm); `execution-v2-s1` 3 ca (Paper workbench `toContainText`; Sandbox form và Live V2 body keyset `toBeVisible`); `execution-v2-scoped › slice @1280` bàn phím (`toBe`).

Cách đọc (từ `DEBT_RECONCILIATION_2026-10-21.md` mục 019/007 và các commit; đây là diễn giải, không phải đọc lại ảnh): ca pixel được ghi lại, các ca còn lại là kỳ vọng test hoặc môi trường, sửa ở `0356b0dc` (các ca không phải v2), `543b30b4` (chromium-v2 theo RV-06/RV-09/BE-P12) và `97454777`.

## Lần 2: tip trước `97454777`

Log mtime 2026-10-21 03:07, 38.9 phút, nên chạy bắt đầu khoảng 02:28. Lead ghi chạy ở "tip trước `97454777`"; cha của `97454777` trong lịch sử là `5bc040f6` (commit 02:55), nên bản được chạy là một cây làm việc nằm giữa `543b30b4` và `5bc040f6`. **Log không ghi SHA**; không suy ra được chính xác hơn. `Running 632 tests using 2 workers`.

```
  7 failed
  16 skipped
  609 passed (38.9m)
```

7 ca đỏ:

```
[chromium-preview] execution-journeys.spec.ts:349  structural: no enabled control on any preview route is a no-op
[chromium-preview] execution-journeys.spec.ts:686  EL-V2-08 analytical surfaces, shell-visible baseline, alpha-tiles, 1440x900
[chromium-v2] execution-v2-alpha-scoped.spec.ts:80   BFF_DOUBLE scoped alpha @1280
[chromium-v2] execution-v2-alpha-scoped.spec.ts:80   BFF_DOUBLE scoped alpha @660
[chromium-v2] execution-v2-alpha-scoped.spec.ts:242  BFF_DOUBLE scoped alpha @1280: denied, down, empty and bounded
[chromium-v2] execution-v2-paper-exit.spec.ts:137    a workspace where the server does not open the request ... one reason
[chromium-v2] execution-v2-s1.spec.ts:342            Sandbox: a workspace the server does not open the note for shuts the form
```

Không có ca nào trong 7 là lệch pixel (log lần 2 không có dòng `Screenshot comparison` hay `pixels ... are different`): `execution-journeys:349` là `page.goto: Page crashed`; `execution-journeys:686` (tên có chữ "baseline") là hết 60 s ở `page.waitForFunction` chờ font trong `settle` khi máy tải; 5 ca còn lại là `expect(locator)` (`toContainText`, `toBeVisible`, `toHaveCount`) hết 5 s, tức là kỳ vọng chữ/disclosure của e2e. Chúng được sửa ở `97454777` (`test(fe-uxm08): V2 e2e expectations follow the Not available line and the Server reason disclosure (RV-06)`) theo lời lead; hai ca sập/hết giờ là nhiễu tải, chưa chạy lại ở đây.

## Không chứng minh

- Không có lần chạy cả suite nào **sau** `97454777`: bảy ca đỏ của lần 2 được sửa mà chưa có chạy lại cả suite xác nhận. Cái "xanh" của chúng chỉ dựa vào lần chạy tập trung của lead lúc sửa, không có receipt nào ở đây.
- Cả hai lần chạy đều trước các commit baseline V2 (`fe84ee69`, `bc83e84b`, `2fb75539`) và trước các cell mới (New request, drawer, NaWhy, pager trang 2, dock) của `5b9e2d32` trở đi.
- Không phải gate trên SHA đóng băng của DEBT-UXM07-037: nó vẫn mở cho lần chạy cả suite trên SHA cuối. Receipt này chỉ khép phần "hai lần chạy ngày 2026-10-21 không có file".

## Run 3 trên SHA đóng băng d58361ea (15:03–15:34 UTC)
683 passed / 0 failed / 16 skipped, exit=0, một lệnh có khóa trong worktree sạch; log sha256 `4a1be04bb3aff8bcf48d6e422441ffee4535080a08f6a49576cbcb2e4e0d8422`. Đây là bằng chứng ảnh cho SHA đóng băng (xem `ELP2-10/CLAUDE_FROZEN_HOOK_RUN_2026-10-21.md`).
