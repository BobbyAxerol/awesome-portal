# G2 Access / Observed — implementation và bàn giao

Ngày 2026-11-24 UTC. Bobby giao trọn G2 sau review cùng ngày; trạng thái đầu
gói **IN_PROGRESS**, không phải receipt PASS hay quyền activation.

## Scope, pins và ownership

- Integrator: Codex, `/home/bobby/portal-t3-core-20261122`,
  `integrate/v13-candidate-20261122@3338f576b897c905528281bb041ec3d415d3e87e`.
  G1 source `14368c9c3` và normal hook được giữ nguyên; không làm lại G1.
- Access: `/home/bobby/portal/.claude/worktrees/agent-a70f0c149da09bdaf`,
  `feat/access-profiles-offline-20261123@cc861d38ec3d04761b28350d0c73e73444c2b1b8`,
  7 WIP files. Original public bytes đã bảo toàn bằng Git blobs + SHA256 tại
  `/home/bobby/.local/state/portal-integrations/20261124-g2-implementation/ACCESS_WIP_ORIGINAL.json`.
- Observed: `/home/bobby/portal/.claude/worktrees/agent-a32d32e549a677a8b`,
  `feat/observed-mode-20261123@b34eb158220b8f0226446e50c9038c1b0c9f6160`,
  clean lúc tiếp quản. Không có commit/request mới kể từ checkpoint review.
- Hai agent được tái dùng làm writer disjoint: Access A1–A4 + offline successor;
  Observed O1–O5 service/reducer/tests. Agent thứ ba review authority chỉ đọc.
  Root giữ OpenAPI/generated/canonical fixtures, contract, tracking và tích hợp.
  Reviewer thứ ba sau đó viết riêng offline lifecycle + CLI/test; không sửa
  shared authority/service hoặc G3 runtime. Hai reviewer kiểm chéo Access/Observed.
- Nguồn yêu cầu: [review từng ID](CODEX_G2_ACCESS_OBSERVED_REVIEW_20261124.md),
  owner access decision và Observed design/TS addendum trong Research packet.
  Các finding nhận **ACCEPTED_FOR_IMPLEMENTATION**, không ACK consumer giả.

## Requirement → implementation → gate

| ID | Implementation / expected gate | Trạng thái đầu |
| --- | --- | --- |
| G2-A1 | Exact user/workspace, duplicate/ceiling negatives | IN_PROGRESS |
| G2-A2 | CLI errors không echo input/path/synthetic sentinel | IN_PROGRESS |
| G2-A3 | Bounded regular-file intake; FIFO/device/symlink/oversize negatives | IN_PROGRESS |
| G2-A4 | Target digest/provenance independent, substituted bytes refused | IN_PROGRESS |
| Access renewable/hot-add/delegation | Preserve current vocabulary/owner ceiling, pin predecessor; no fake grant or weakened native limits | AUTHORITY_REVIEW |
| G2-O1 | Exact raw/retained/mirror snapshot fence, policy revalidation | IN_PROGRESS |
| G2-O2 | Same-snapshot expected account/currency census, no false COMPLETE | IN_PROGRESS |
| G2-O3/O4 | Figure and grid freshness, explicit insufficient coverage | IN_PROGRESS |
| G2-O5 | Lossless integer ID ordering, large IDs, order-independent ties | IN_PROGRESS |
| G2-O6 | OpenAPI/generated/fixtures + conformance negatives + generator registration | IN_PROGRESS |

## Validation và boundaries

Focused tests theo gói, Core typecheck, contracts/generator checks; PG/HTTP khi
diff tác động transaction hoặc delivery. Root lập lịch một job nặng mỗi lần qua
`primus-build`: 3 CPU, memory.high 6 GiB / max 8 GiB. Normal hook một lần trên
candidate tích hợp đã freeze; chỉ chạy lại gate thực sự bị ảnh hưởng.
Kết quả thực, pins, diff stats và cleanup sẽ append sau khi có exit.

Access vẫn offline, Observed flag OFF. Không UI/baseline, cài policy/grant,
runtime, schema migration, push, dev/main/stable hoặc command/Live. Không biến
isolated tests thành nguồn qualified, browser hoặc connected acceptance.
Rollback là revert source; không xóa audit/data. Không prune tài nguyên chung.

## Handoff / next

Claude giữ components/design và nhận generated contract/fixture khi root freeze;
trạng thái **AWAITING_CONSUMER_REVIEW**. G2 không tự mở G3 hoặc bật nguồn.
Phần authority chưa biểu diễn được phải có locator và giải pháp source rõ;
không coi typed NOT_IMPLEMENTED hay non-installable plan là feature đã hoàn tất.

## 24 Nov implementation checkpoint — source frozen for integration gate

- A1–A4 đã sửa và nhận ACCEPTED qua independent source review: exact tuple
  user/workspace, owner ceiling, duplicate grant/digest; fixed CLI errors;
  bounded/no-follow/nonblocking input; independent target SHA/root0600 pin.
  Dry-run công bố `runtime_target=NOT_VERIFIED`, không giả kiểm database.
- Root review phát hiện regular→FIFO race ở private-file helper dùng chung.
  Thêm O_NONBLOCK, giữ nguyên root/mode/inode/hash gates; cập nhật đúng flags
  của các test caller hiện có, thêm descriptor-close/race regression.
- O1–O5 đã sửa và independent review ACCEPTED: raw+census+retained mirror cùng
  RR read-only transaction; authorize cả accounts và equity trước/sau capture;
  fresh retainedRevision/metadata + final authority fences. Census thiếu member
  không còn giả 1/1 COMPLETE; retained giữ PARTIAL/STALE. Lossless BigInt ties.
  Cumulative NET_PNL chỉ có semantics Paper OKX đã được trả lời, không suy rộng.
- O6 đã có canonical OpenAPI/schema/generated type, full/named generation và
  check registration, fixtures/negative parity; response byte bound UTF-8.
  Error responses của exact Observed GET cũng private/no-store trước controller.
- Offline BOOTSTRAP/RENEW/HOT_ADD có helper + CLI thực thi tạo artifact mới,
  predecessor SHA, fresh identities, included scope/owner coverage và term365d.
  Đây **không phải** grant renewal/hot-add đã được apply. Actual ordinary writer,
  DB CAS và Stan delegation thuộc G3; native Paper2h successor không thay đổi.
- Không có migration, runtime, UI/baseline, source qualification hay activation.

### Actual focused results

| Gate | Result |
| --- | --- |
| New canonical Observed contract parity | 16/16 PASS, exit0 |
| Initial combined Access/Observed | 128 PASS / 2 FAIL; fixture assertions corrected (latest timestamp boundary / independent census). Not counted as final PASS |
| Integrated focused Access/Observed/lifecycle/private-intake callers | 14 files, **266/266 PASS**, exit0 |
| Whole Core test-inclusive `tsc --noEmit` initial attempt | exit2: two existing warmup matcher-generic errors; corrected to typed `satisfies`, no runtime semantic change. Final retake pending |
| Real-PG Observed capture/late source/rollback tests | Added; NOT_RUN until isolated integration gate |
| Normal hook on final frozen index | NOT_RUN at this checkpoint |

All heavy commands ran sequentially via `primus-build` (3CPU, high6GiB/max8GiB).
Two temporary dependency links used existing packages and were removed; no npm
install, runtime mount, private key or database permission was used. Source WIP
backup remains recoverable via the manifest above. Normal-hook result/commit
will be appended separately, never inferred from these focused tests.

### Claude next / Codex next / owned remainder

Claude can consume `execution-observed-read.d.ts` and canonical synthetic cases
through a distinct Observed port, preserving the approved component/design.
No frontend consumer ACK/browser acceptance has occurred. Precise handoff is
in registry FRONTEND_HANDOFF and campaign sync. Do not enable the feature as a
side effect of consumer wiring; SCOPED_V2 has a typed409, no legacy fallback.

Codex next in this G2 package: final typecheck/normal hook, hash/cleanup receipt
and source commit. After G2 source exit, **G3** ordinary qualified authority and
producer is next separately assigned package; runtime grant lifecycle/delegation,
production coverage calibration, enablement and connected/browser acceptance
remain open and are not represented by offline artifact success.

### Pre-hook corrections — 14:08 UTC

Final test-inclusive Core typecheck PASS (exit0) after a TypeScript union-narrowing
correction in the new lifecycle helper. Separate typed seal/grant loops retain
all interval/scope checks; the two affected files retested **27/27 PASS**. These
tests overlap the 266-test set, not additional coverage.

The first normal-hook invocation stopped at the early static route inventory:
the additive Observed GET was not yet registered in the live route ledger.
No full contracts/Core test cell ran in that attempt. Regenerated the ledger
with the repository's `--write-live-routes` command: exactly one added GET,
347→348 routes, no removals/collisions and protected kernel MATCH. This is a
registration correction, not a bypass or a full-hook PASS; final gate follows.
