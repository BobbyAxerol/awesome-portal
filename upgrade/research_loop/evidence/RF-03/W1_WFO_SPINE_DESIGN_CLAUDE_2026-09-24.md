# W1 — WFO signal-notional thật qua P10 → P06 → P05 (thiết kế, Claude)

Ngày 2026-09-24. Đóng `CG-P10-02` (phần Delta built-in), `CG-P05-01`, `CG-P06-03`,
một phần `CG-P06-02`/`CG-P10-04`, và mở profile literal RS-02. Nguồn sổ nợ:
[BACKEND_DEBT_P01_P21](../BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md) §2.1.
Nền do Codex dựng (commit `5bc77b9b`): `AdvancedWalkForwardRunner(target_mode="signal_notional")`,
profile `rs02.delta-signal-notional-wfo.v1`, adapter `rs02.quantbt-signal-notional-wfo.v1`,
và test real-HMD → local P05 seal. W1 nối nền đó vào đường sản phẩm.

Ngoài phạm vi W1: thực thi alpha import/DRAFT (cần seccomp hẹp, `CG-RF02-01`);
`fold_segment_observed` theo thời gian thật (không có timestamp đoạn — giữ NOT_PUBLISHED).

## 1. Hai giao diện đã khoá (TS ↔ Python)

### 1.1 Run execution profile

Không thêm executor binding mới: bảng `research.execution_adapter_bindings` có PK
`(workspace_id, alpha_version_id)` và literal `p04.delta-rsi.v1` đã ghim trong ~12
contract. Thêm **chiều profile** cho run:

| Profile id | Khi nào | Wire |
|---|---|---|
| `p04.fixed-qualification.v1` | Mặc định, hành vi hiện nay | Byte P04 giữ nguyên (golden test) |
| `p10.delta-signal-notional-wfo.v1` | WFO Delta built-in | Mới |

Object profile (canonical JSON: key sắp theo code-point, `separators=(",",":")`, ASCII):

```json
{
 "schema_version": "research.p10.delta-wfo-profile.v1",
 "profile_id": "p10.delta-signal-notional-wfo.v1",
 "adapter_id": "p04.delta-rsi.v1",
 "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
 "engine_release_id": "er_quantbt_111",
 "execution_route": "signal_notional",
 "protocol": "advanced",
 "frequency": "weekly",
 "window_mode": "expanding",
 "timeframe": "1h",
 "max_span_days": 92,
 "fold_bounds": {"min": 2, "max": 16},
 "optimization_mode": "mode_1_decay",
 "optimization_schedule": "global",
 "optuna_trials": 3,
 "random_seed": 42,
 "current_source": {"source_adapter_id": "rs02.quantbt-signal-notional-wfo.v1", "profile_id": "rs02.delta-signal-notional-wfo.v1"},
 "child_limits": {"cpu_seconds": 120, "wall_seconds": 240}
}
```

`DELTA_WFO_PROFILE_DIGEST = b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca`
— ghim hex ở test TS **và** Python.

Trials=3/seed=42 vì `signal_notional_current_source_admission()`
(`current_source_artifacts.py:231-252`) ghim đúng hình đó; nới ra cần receipt đo mới.

### 1.2 Wire ingest worker → Control API

Hai route nội bộ mới trong `progress-ingress.controller.ts`, dùng lại
`assertWorkerPrincipal` + `progress.resolveIngress` (fence lease hiện hành):

- `POST /internal/research/progress/artifacts/current-source/batches` → 200
  ```
  { ...ArtifactIngressIdentity (như artifacts/reserve|seal),
    schema_version: "research.current-source-batch.v1",
    artifact_id, artifact_revision, manifest_digest, source_transform_digest,
    table_kind: "OBSERVATION"|"FOLD"|"TRIAL"|"CANDIDATE"|"SELECTION",
    batch_ordinal, batch_digest,
    rows: [{ sourceOrdinal, sourceId, occurredAtUtcMs, payload }] (1..200) }
  ```
  Row key là **camelCase** — đúng thứ `iter_current_source_retention_batches()` sinh
  và TS `CurrentSourceRowInput` đã dùng (sửa lại sau khi triển khai; bản nháp ghi snake_case).
  ```
  ```
- `POST /internal/research/progress/artifacts/current-source/seal` → 200
  ```
  { ...ArtifactIngressIdentity,
    schema_version: "research.current-source-seal.v1",
    artifact_id, artifact_revision,
    source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1",
    profile_id: "rs02.delta-signal-notional-wfo.v1",
    manifest_digest, source_transform_digest, retained_import_digest,
    table_rows: {OBSERVATION,FOLD,TRIAL,CANDIDATE,SELECTION}, total_rows, summary }
  ```
- Thân mỗi request ≤ 1,000,000 byte (Fastify mặc định 1 MiB). Requested/effective/
  dataset digest lấy **từ `run_producers`**, không từ body. Batch lặp lại cùng
  byte → idempotent; khác byte → 409. Tên field row khớp đúng thứ
  `iter_current_source_retention_batches()` sinh ra — agent TS đọc
  `current_source_artifacts.py` để khớp, không đoán.

## 2. Thay đổi theo thứ tự phụ thuộc

| # | Nơi | Việc |
|---|---|---|
| A | `migrations/1723680000062_research-delta-wfo-profile-v1.sql` | `run_producers` + `execution_profile_id` (default P04, CHECK 2 giá trị) + `execution_profile_digest` (NULL ⇔ P04); trigger identity giữ bất biến cả hai; `current_source_seals_v1` CHECK cặp `(source_adapter_id, profile_id)` ∈ 2 cặp |
| B | `config.ts` | `FEATURE_RESEARCH_WFO_PROFILE` (default false) đòi RUN_PRODUCER, PROGRESS, RETAINED_ARTIFACTS, CURRENT_SOURCE |
| B | `delta-wfo.profile.ts` (mới) | object + digest §1.1 |
| B | `run-admission.service.ts` | `p04UnsupportedReason` → chọn profile; nhánh P04 y nguyên; nhánh WFO chỉ nhận đúng §1.1 (span ≤ 92 ngày, 2–16 fold theo topology manifest); mọi lệch → 409 `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` với câu chính xác |
| B | `run-create.service.ts`, `repository.ts` | WFO: `workDigest` schema `research.p10.delta-wfo-work.v1`, `legacyRequest.research.execution_profile_{id,digest}`, không `p04_parameters`, cost 4 GiB / 120 CPU-s / 128 MiB / 512 MiB, `resourceClass "p10-delta-wfo-v1"`. P04 byte-identical |
| C | `domain/research_run_producer.py` | DTO nhận profile; P04 như cũ; WFO: `p04_parameters is None`, digest khớp, protocol advanced |
| D | `services/research_run_producer.py` | Nhánh WFO: tape IS+OOS (không holdout), `supervisor.run_delta_wfo`, copy output ra `engine_root/.p10-wfo-source/<run_id>`; `research_evidence=None`, `research_split=None` |
| E | `services/research_supervisor.py` | `DELTA_WFO_CHILD_LIMITS` 120/240; tách `_launch`; P04 giữ 45/90 và byte receipt; `run_delta_wfo` kiểm output (không symlink, ≤ 64 file, ≤ 64 MiB) |
| F | `workers/research_child.py` | allowlist task `P04_DELTA_SMOKE` / `P10_DELTA_WFO`; WFO chạy runner với `target_mode="signal_notional"` vào `output_root` |
| G | `services/research_current_source_retention.py` (mới), `durable_worker.py` | reserve → export RS-02 → P05 seal → batches → current-source seal, **trước** `run_completed`; retry 3 lần cùng body; 409 → fail closed |
| G | P11 | `budget_tick` cap 120; `trial_completed` ×3, `fold_completed` ×n từ bảng đã retain; không `fold_segment_observed` |
| H | Control API ingest | `current-source-ingest.service.ts` mới; `assertSeal` nhận 2 cặp; `CURRENT_SOURCE_RUN_STATE_SQL` + `execution_profile_id`; `notApplicable` chỉ cho profile P04; contract provenance = union 2 cặp; `retainable_profile_id` enum 2 id nhưng P04 N/A vẫn phát id cũ (giữ byte) |
| H | Freeze/evidence/split P13/P14/P16 | Run WFO không đi qua các hub P04 đó: trả NOT_APPLICABLE theo profile (không để check digest chung cho qua) |

## 3. Không được đổi

Digest adapter P04, `legacy_request`/`workDigest` P04, byte receipt child P04,
`ResearchChildLimits()` mặc định, byte NOT_APPLICABLE P04, literal P13/P14;
`apps/portal/strategy/**` chỉ import; mọi cờ mới mặc định false.

## 4. Test và receipt

- TS: ma trận admission (P04 golden + từng field lệch + cờ + import/DRAFT), digest
  ghim, run-create WFO, `assertSeal` cặp, ingest (403/503/409 lease/409 profile
  P04/409 artifact chưa seal/400 digest/>200 row/>1 MiB, idempotent, conflict),
  service sealed → provenance signal-notional.
- Python: DTO, allowlist child, supervisor child thật với limit WFO, client
  retention với `http.server` cục bộ, worker (3 `trial_completed`, retain trước
  `run_completed`, cờ tắt → từ chối).
- PostgreSQL: 062 trên 061, cặp sai bị chặn, trigger chặn đổi profile, luồng
  producer → P05 seal → append → seal → `sealForRead`.
- Real HMD opt-in (`PORTAL_RUN_HMD_REAL_SMOKE=1`): BTCUSDT 1h 2026-06-01..07-15,
  child thật qua unshare supervisor, ≥ 2 fold, 3 trial, CPU/wall ≤ 50% cap → đóng
  `CG-P06-03` bằng số đo.
- Preview: `seed-run.mjs --profile=wfo`, bật cờ trong `preview.sh`, 5 read
  current-source đều 200 SEALED; P04 vẫn NOT_APPLICABLE; receipt lưu ở thư mục này.

## 5. Kết quả triển khai — 2026-09-24

| Hạng mục | Kết quả |
|---|---|
| Real HMD (BTCUSDT 1h, 2026-06-01..07-15, OOS đầu 07-01, weekly/expanding) qua supervisor + child thật | 2 fold, 3 trial, 1056 bar; CPU 4.83–5.33 s / cap 120 (~4%), wall 5.00–5.43 s / cap 240, RSS ~300 MiB; export RS-02: 1056 obs, 2 fold, 3 trial, 1 candidate, 1 selection → 10 batch, body lớn nhất 67,132 B |
| Python backend | 583 passed, 6 skipped (opt-in), 1 deselected (`test_m0_freeze`, đỏ sẵn trên HEAD — sửa riêng) |
| Control API | build xanh; W1 + progress 83/83; research unit 273 pass (9 fail = cần DB, chạy lại qua lane: 20/20) |
| PostgreSQL | RS-02 8/8, P10 5/5, P11 11/11, P13–P16 PASS; lane bắt lỗi thật: CHECK `digest = '<hex>'` để lọt NULL → thêm `IS NOT NULL` |
| Contracts | snapshot 203/203, `verify-generated.sh` xanh, contracts vitest 182/182; frontend `tsc` xanh |
| Golden P04 | runId, workDigest, legacyRequest, NOT_APPLICABLE body — tính từ code HEAD, không đổi |

Quyết định khi làm: trần `cpu_seconds` trong schema progress nâng lên 120 (schema không
phân biệt profile), còn ingest tự chặn P04 > 45 và WFO > 120 trước khi ghi. P16/P15 với
run WFO trả absence typed (`P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE`);
P13/P14 từ chối sidecar P04 cho run WFO nên tự trả "not published".

Còn lại để đóng W1: receipt preview real-API (bật cờ, `seed-run --profile=wfo`, 5 read
SEALED, P04 vẫn NOT_APPLICABLE). Rủi ro ghi nhận: digest batch TS sắp key bằng
`localeCompare`, Python theo code-point — trùng với mọi key hiện có; tên tham số tương lai
trộn `_` và chữ hoa có thể lệch (không đổi bây giờ vì sẽ đổi digest RS-02 cũ).
