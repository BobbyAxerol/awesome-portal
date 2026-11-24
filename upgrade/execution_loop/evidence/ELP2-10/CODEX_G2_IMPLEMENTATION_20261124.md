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

## Final source return — 2026-11-24 15:13 UTC

**G2_OFFLINE_SOURCE_EXIT_MET / NOT_ACTIVATED. Verification: R2.**
This addendum supersedes the earlier CHANGES_REQUESTED/IN_PROGRESS for the
named G2 source fixes, not the separate G3/connected/consumer gates.

- Source commit `e89b223996d5ebc191460ca44944230ea7ca80cb`, tree
  `b372677f957fb0c3942b817a57648fbeacecbfac`, parent
  `3338f576b897c905528281bb041ec3d415d3e87e`, on
  `integrate/v13-candidate-20261122` in the worktree above.
- **57 files, +8,042/−19**: preserved Claude source plus Codex fixes/tests,
  generated contracts/fixtures and tracking, not 8,042 newly authored business
  lines. No frontend component, migration, runtime or installed grant changed.
- After the early route-registration abort above, one **full** normal hook
  completed exit0 through the resource launcher. Contracts: **114 files /
  1,978 PASS**; Core: **641 files PASS / 32 files SKIP**, **12,947 PASS /
  1 expected-fail / 166 SKIP**. Core duration **3,238.98s**, start14:18:32Z.
  Build, generated-type verification, PostgreSQL preservation/restore,
  execution tracking and monorepo verification PASS. The 266/27 focused results
  overlap this suite and are not added to its coverage.
- All ten new Core specs ran: **134 new test cases PASS**, including real-PG
  Observed **3/3** (unchanged retained view; late source change; query-failure
  rollback/release), HTTP filter4, lossless integer2 and private-file race2.
  Synthetic scope adapters remain TEST_ONLY, not real-session/Edge evidence.
- Exact command was `primus-build --wait -- bash -c` with `set -euo pipefail`,
  normal `git commit` and a tee to the task's `normal-hook.log`. No code hook
  bypass, second concurrent build, changed test threshold or reduced corpus.

### Disposition by original ID

| ID | Final G2 disposition / evidence |
| --- | --- |
| G2-A1 | ACCEPTED_SOURCE: exact principal/workspace and owner ceiling; artifact30 / operator19 in full suite |
| G2-A2 | ACCEPTED_SOURCE: fixed public CLI failures, no submitted path/action/sentinel echo; operator19 |
| G2-A3 | ACCEPTED_SOURCE: bounded regular/no-follow intake, nonblocking FIFO-race protection; operator19 / private-file2 / affected existing callers |
| G2-A4 | ACCEPTED_SOURCE: independent target SHA + provenance; structural dry-run still reports runtime target NOT_VERIFIED |
| Offline lifecycle | ACCEPTED_SOURCE: BOOTSTRAP/RENEW/HOT_ADD23, exact predecessor/interval/scope invariants; installed renewal/hot-add and delegation remain G3 |
| G2-O1 | ACCEPTED_SOURCE: same-MVCC raw/census/retained capture and late revision/authority fences; service23 / real-PG3 |
| G2-O2 | ACCEPTED_SOURCE: independent account/currency census and explicit missing contributors; figures23 / service23 |
| G2-O3/O4 | ACCEPTED_SOURCE: per-figure/grid freshness, retained PARTIAL/STALE and missing coverage policy refusal; production Return/DD calibration remains OPEN |
| G2-O5 | ACCEPTED_SOURCE: lossless numeric ordering incl. unsafe-number refusal; integer2 plus reducer/caller regressions |
| G2-O6 | ACCEPTED_SOURCE: canonical OpenAPI/schema/type, positive/negative fixtures, full/named generation and checks; contracts16 within 1,978 plus Core contract5 |

Rows reference overlapping specs, not independent coverage totals. Independent
source reviewers accepted Access/Observed; **Claude consumer ACK is pending**.
Nothing here is OWNER_ACCEPTED, TS-qualified, installed, browser-accepted,
a release or full ELP2-10/11 closeout.

### Public source/dependency pins

```text
core_package_lock_sha256=a0d5c4ea56a8c421ba3ca9e1dd1d76388740bfed72b82ae340209b32c9d42750
contracts_package_lock_sha256=e20b366ecbc7bf76c5dd6e21f763cbe1277dadc42e725ab7688f550db6454eff
observed_generated_type_sha256=b7c03ae4084eac10fd13354cebea4432d64b2014fd06b871ea034a78c921daba
observed_json_schema_sha256=d245fab38abf9a53dffb362220cf2b93b4108fef63e0bffed7fe3a7518c2b41a
core_cell_script_sha256=9df2ad8574619cdcbfcb92771d0277a9c74776e9b48155b8d2cfe83b62c31f47
```

Locked TypeScript5.9.3 / Vitest4.1.11 / OpenAPI TypeScript7.13.0.
Test-cell Node image `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`,
PostgreSQL image `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
These are disposable validation pins, **not a new deployed Portal image**.

### Preservation, cleanup and rollback

Task state directory above now contains two verified nonsecret backups:

- `ACCESS_WIP_ORIGINAL.tar.gz`: SHA256
  `1374559856a66f4cd43a006c3130fb7e61acd9ba4eb8371e80335930a415c6fb`;
  all7 original file bytes match the pre-edit manifest, independently of Git GC.
- `G2_SOURCE_e89b22399.bundle`: SHA256
  `8bf5ad9adbbbfc1f113f8d1dbf52d78fa2bb949996e9941db9d60171a0807a69`;
  `git bundle verify` PASS, exact source commit with prerequisite3338f576b.

Post-exit: no owned cell/container/network suffix `32803842224431010`, no owned
temporary image `portal-source-proxy-d4-offline:tmp.0tUQ0kOYLp`, no cell bind
directory `/tmp/tmp.p24z6VH57U`, no temporary dependency links. PG had no
anonymous-volume mount. Archive-index temp directory was removed by its trap.
Task state is bounded **1.2MiB**, intentionally retained for source rollback,
test evidence and the small incremental typecheck cache. No shared image/cache,
worktree, runtime bind, data, audit or backup was pruned. Free disk140GiB,
available memory9,584MiB after exit; these are point observations, not peak/SLO.

Source rollback is revert of the source commit, no DB downgrade/data deletion.
Access remains offline and Observed OFF. Original writer lanes remain intact;
future work branches from this source SHA, not an automatic whole-lane merge.
Research receives an explicit receipt/index mirror, not a historical-code merge.
Its pre-existing3-line WIP remains excluded and byte-identical (SHA256
`1a655f6c335151a5249a68d943fd47afcf7266f67fc6b523a41130ba57da0c35`).

### Next owner/action and consumer handoff

- **Claude:** consume the exact generated type and synthetic paper/unavailable/
  retained cases named above through a separate Observed reader/adapter. Keep
  approved components/design, no new fixture banner. Respect per-currency census,
  source clocks, absence versus zero, literal unqualified trust and SCOPED_V2
  typed409 without legacy fallback. Return reader/fixture tests and consumer ACK;
  browser acceptance needs the separately activated exact API/bundle.
- **Codex G3, next separately assigned:** ordinary authority writer/DB CAS for
  renewable/hot-addable permissions and bounded Stan delegation, preserving
  installed DENY/other policy families and native fences; then qualified producer
  per environment+profile including the two separate Paper profiles. The missing
  Live source pin, coverage calibration and activation are explicit gates, not
  invented defaults or a reason to reopen answered Paper/OKX PnL semantics.
- **Owner/source gates:** approved production coverage inputs and qualified
  publication/trust remain separate; no policy install, workspace transition,
  STREAM, command/Live, push, preview swap or dev/main/stable action is authorized
  or performed by this source return.

Recording this result and mirroring indexes is **Verification: R0**, Markdown
only under campaign§10.10d after diff/link/tracking checks. No second full hook
solely to record the first one's result.
Local R0 checks: diff whitespace PASS, five newly added local index links PASS,
`scripts/execution-tracking-test.sh` PASS. Explicit six-Markdown staging only;
no source/dependency change after the successful source gate.
