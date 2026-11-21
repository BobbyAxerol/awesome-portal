# P23 mixed-load and coherent restore checkpoint

Date: 2026-09-27 · Codex · branch `docs/research-loop-plan`.
Application candidate: `b2e8b868b54937175d79c216eedaa60a3fa60ecd`.
This continues the original eight-group goal; it is not full P23/P24 acceptance.
No push, dev/main merge, Production, shared preview 8095 or AWS-HK/TS change.

## Sources and ownership

Read the full private goal objective, root AGENTS, Research A13.1–4,
Unified §13.4.1/P23/P24, Guide P23/P24 and §16, P23's preceding three
checkpoint packets and cleanup C4.1–5. The application changes are already
committed at `b2e8b868`; this slice changes only qualification tools and docs.
No frontend component, visual baseline, application contract or migration is
changed by the restore/image-index harness slice.

## Clean candidate build and measured mixed load

Actual `cell.mjs build` and `up` completed with exit 0 from the clean
application checkout. Twenty distinct authenticated readers issued 120 GETs
while one real QuantBT WFO HEAVY was active and four distinct HEAVY intents
were queued. Primary `rrun_90578b81460c44f1a2729b717b3c2c8b` completed with
READY materialization. Viewer job count remained **20 → 20**. Queued-only
intents were cancelled afterward through the public API; history was retained.

| Named read | Warm p95 ms | Target ms | Actual result |
|---|---:|---:|---|
| Library | 490 | 500 | PASS |
| Progress | 243 | 500 | PASS |
| Evidence | 279 | 500 | PASS |
| Search | 140 | 750 | PASS |
| Report | 89 | 500 | PASS |
| Replay | 259 | 1000 | PASS |

Peak aggregate `memory.current`, including page cache, was **618209280 bytes**.
All 120 reads returned 200. No pool/cap/SLO expansion or implicit viewer
compute was used. The previous clean `4e343fe9` Library **789 ms FAIL** and
all earlier failed/diagnostic receipts remain preserved, not relabelled PASS.

Cold twenty-principal reads also PASS; Library p95 was 639 ms against 1500 ms.
Cold scope is a new Control API process/pool/prepared plans, **not** a host,
filesystem or HMD cache flush. No `drop_caches` or shared service restart.

## Image-index failure found by the restore drill

The first restore attempt exposed a real Docker/containerd provenance issue:
a build replaced a manifest-list tag, while Compose retained containers whose
underlying image configuration was unchanged. Their previous index IDs were
no longer available to `docker image inspect/run`. The attempted utility
failed before an artifact backup; pinned-image original recovery also failed.
The failed receipt/log remain intact. Normal owned Compose `up` then restored
the original volumes and actual clean-build image set; no database deletion.

The guard now retains each exact active image index under a namespaced tag
**before** build export, verifies runnable indexes **before** stopping writers,
and targets only actual-versus-desired image drift on `up`. Owned gateway DNS
refresh remains conditional on Control API replacement. No image pruning.

Mixed-load evidence binds the new Control API and clean source candidate;
the retained Python/roadmap index mismatch during that measurement is recorded
explicitly, not erased from its identity. Subsequent recovery inventory binds
all application indexes to the actual clean-build export log. Only harness
paths changed since that build. The updated inventory records instrumentation
checkout dirtiness separately from the clean application build identity.
This packaging correction is not a signed-release or full immutable-product GO.

## Actual coherent DB + artifact restore

The final drill `coherent-b2e8b868-third` completed at
`2026-09-27T19:16:47.531Z`, exit 0, with `passed:true`.

- Quiesce owned writers; dump the database, role definitions without role
  passwords, and the read-only artifact volume as one coherent backup.
- Restore only into exact newly created empty, namespaced DB/artifact volumes.
  Runtime images are pinned; utility memory/swap cap is 350000000 bytes,
  sequential, network-none. No migration/bootstrap/reseal on restored state.
- Compare streamed row hashes for **139 tables**, plus roles, grants,
  ownership/ACL/RLS flags, indexes, sequences, functions/security-definer
  configuration and all scoped constraints.
- Verify **9 SEALED artifacts, 54 parts and 337 files** using the actual
  `ResearchArtifactStore` verifier and database manifest/part pins. Entire
  artifact tree digest and bytes match; originals are not modified.
- With worker **off**, actual authenticated Progress/Evidence/Search/Report/
  Replay GETs all return 200. Resume the original image/volume stack afterward;
  `original_stack_restored:true`, seven runtime services available.

The second failed attempt had exact table hashes but two CHECK definition
strings differed because PostgreSQL flattens associative AND nodes on reparse.
The harness now canonicalizes CHECKs with PostgreSQL's **own parser** on empty
temporary tables. It does not remove terms/parentheses in JavaScript, ignore
constraints or mutate persisted schema. Original flags, table/type/name and
all other definitions remain compared. The original failure is preserved.

An expired test session was refused before the final drill began. Refresh used
the existing private test passwords through normal login, not password/token
reset, expiry SQL edits or production accounts.

### Scope that remains open

The current cell's selection records, promotion-pick facts, P22 pick receipts
and RC publications contain **zero rows**. Their empty COPY hashes are not
proof that a nonempty final-audit/selection/publication/exposure graph survives
restore/GC. **T14 stays OPEN**: populate through the real authorized product
journey and then verify graph/pins. Do not fabricate those facts in SQL.

T01 has actual scoped mixed-load/SLO/cap proof; final qualification aggregation
must still bind the corrected immutable image inventory. T06 has actual
corruption/restore scope proof; T11 still needs slider/far-seek coverage.
Plateau, physical disk-full, tenant file/cache/export isolation, utility quotas,
storage scale, upgrade/rollback, remaining faults and browser/P24 remain open.
The goal still has five scoped proof groups, not eight completed groups.

## Evidence locators and byte hashes

Private root: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
JSON/backup/session files are 0600; no raw data, cookies, DSNs or backups in Git.

| File | SHA-256 |
|---|---|
| `candidate-b2e8b868-workload.json` | `d98bc0d28661750bd8368185c8e3e564906214bfd49a3d22b000d888a618c218` |
| `candidate-b2e8b868-read.json` | `d817bc6f102122dcdd5882302ab56ffe4d1266d398078d5fea13eac0f249bc11` |
| `candidate-b2e8b868-cold-read.json` | `752fc6a29bf703c95cb0fdc82a5fda7f7c7b9a5581acec41a95ace9a20316752` |
| `candidate-b2e8b868-resource-series.json` | `c6fbf93f2ba8afd35a5272b0276710946b45eb712b5d56760c0f6629daa833dd` |
| `restore-coherent-b2e8b868-third.json` | `0f6ac09a9b65797b91963fd36b5f3b200b98926b79fd2507f7891d6d97e8b6c0` |
| `image-recovery-original-stack.json` | `4416294d98415190c7a9450d6ca72fd27209277fbdce84b602faccf1c5678a55` |

Actual commands: `node scripts/research-p23/cell.mjs build|up --home=<private>`;
`node scripts/research-p23/mixed-workload.mjs --label=candidate-b2e8b868`;
`node scripts/research-p23/restore-receipt.mjs --label=coherent-b2e8b868-third`.
Private command logs are in sibling `checkpoint/`, including every failed
restore attempt and the successful `third-retake` log. Focused helper tests:
`node --test scripts/research-p23/{cell,restore-receipt}.test.mjs`, **10/10 PASS**.
Latest application full hook (`b2e8b868`) is **1331 backend PASS / one external
skip, 196 contracts PASS**. This tool/doc commit uses the unchanged mandatory
hook; its terminal log is `checkpoint/mixed-restore-commit-gate.log`. No hook
bypass and no second application rebuild merely for docs/harness changes.

## Cleanup and next action

At `2026-09-27T19:28:49Z`, root free **279107887104 bytes**, 59% used;
RAM available **22090 MiB**, swap **0**. Docker read-only inventory: 154 images
(29 active), 49 volumes (25 active), 74.22 GB build cache. No prune/deletion
was performed. Original DB/artifact volumes, rollback images, two successful
backup sets and exact `restore-coherent-b2e8b868-{second,third}-{db,artifacts}`
volumes are retained for review. The two owned migration/bootstrap containers
are exited 0; temporary utility containers are `--rm`.

Named cleanup follow-up: Codex, **at qualification end**, revoke all 22 test
identities/sessions, down only `portal-research-p23-ol12` without `-v`, inventory
the exact retained DR volumes/backups/images and apply C4 retention rules.
Do not prune during an active build, hook, fault drill or evidence capture.
Next independent work is real repeated complete/fail/cancel plateau and
tenant/file/export/utility tests; full goal and P23/P24 remain ACTIVE.
