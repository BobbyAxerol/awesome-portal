# FE-W1–W5 — Thanhvuong frontend rollback

Chỉ đụng frontend (và ảnh baseline). Không đổi contract, backend, migration, data hay feature flag; FE W1–W5 không thêm cờ. Seal, publish, approval phía server (kể cả R-WFO-027 `rc_06GG2K1TN6QQNJJN3RJ5AS5XC1`) không bị rollback FE xoá.

Lệnh mẫu: `git revert --no-edit <sha>`, rồi trong `apps/portal/frontend`: `npx tsc -b --noEmit && npm run build && npx vitest run`. Revert mới nhất trước.

## 1. Từng commit (mới nhất trước)

| SHA | Revert gì | Lưu ý |
|---|---|---|
| `f0346ef8` | export legacy prepare-then-download (`RunExportAction.tsx`, `api.ts`, Audit, QuantBT) | quay về link GET trực tiếp; kéo theo `c5795c71` |
| `c5795c71` | 4 baseline run-audit | revert cùng `f0346ef8` |
| `a226d1d9` | S08 IS summary, bảng nến sau Data, S09 month readout, replay reload | độc lập |
| `51ea3507` | tooltip cert Lineage | độc lập |
| `1f6d8392` `1ca9d4ec` | baseline legacy 95 / Research 16 | chỉ ảnh; cần cùng token (§3) |
| `201eed31` `be1ce126` `a163af4b` | fix gate W5 | revert làm gate W5 đỏ trở lại |
| `23ef532e` | token xám | xem §3 |
| `340dddfe` `14740755` `e7414e1f` | guard causal, gate, spec W5 | gate/test là chính |
| `c4d84d1a` | W5 code | cần revert các fix `a163af4b…` trước |
| `51dbe35d` `d1e0b839` | bind read contract, đóng request W1/W2 | FE quay về chờ field |
| `e92f74ca` | W4 ít chữ (143 file) | kéo theo baseline `f6701e77` `c1276a7d` và copy lane `93acaeb2` `6a9a97cc` |
| `bfbf5ca4` `c77d4aa7` `02e16865` | W3, W2, W1 | thứ tự W3 → W2 → W1; W1 là lõi `runStatus`/`runLinks`, nhiều màn phụ thuộc |

## 2. Preview

| Bước | Nội dung |
|---|---|
| Image | `docker inspect` image đang chạy; so ID với tag, không tin exit code của deploy |
| Rollback | redeploy image/bundle trước (bundle trước `index-C6w4OUAn.js`), đối chiếu bundle trên host công khai |
| Dữ liệu | không đổi; chạy lại lane real-API sau rollback |

## 3. Token xám (`23ef532e`) và baseline

Revert token đổi pixel ở shell nên **di chuyển baseline**: 95 ô legacy và các ô Research phải ghi lại. Baseline do Bobby chạy CLI (`--update` bị classifier chặn với Claude). Revert token mà giữ baseline mới sẽ làm visual đỏ.
