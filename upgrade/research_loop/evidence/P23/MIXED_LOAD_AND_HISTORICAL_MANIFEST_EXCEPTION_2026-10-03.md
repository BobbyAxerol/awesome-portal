# P23 — mixed-load optimization and historical test-manifest accounting

Codex · Bobby approved 2026-10-03 · `codex/be-gaps`, landing branch
`docs/research-loop-plan`. **MIXED_LOAD_PASS / HISTORICAL_EXCEPTION_ACCOUNTED**
on clean candidate `b90a36a9`; C4 completed. **Full-store byte integrity is
still false**, not full P23/P24 GO. Sections 1–4 preserve implementation and
failed diagnostic history; the final delivery below supersedes their pending
acceptance wording.

## 1. Scope and baseline

Read root AGENTS, Research working rules A13, Unified P23, the full Guide
P23 matrix/§16.3 and the latest temporal candidate packet. Latest official
mixed-load baseline: Library **538 ms**, Progress **568 ms**, targets **500
ms**; far-seek, utility and outage have separate accepted receipts. Do not
repeat those drills just to increase test counts.

Only owned `portal-research-p23-ol12` / loopback :8096 is used. Original DB,
artifact volumes, backups and rollback images are retained. No frontend,
shared :8095, Execution/Trading System, production or remote mutation.

## 2. Actual performance diagnosis and repair

The first actual 20-principal diagnostic, dirty source explicitly recorded,
returned all 120 reads 200 and completed one real 92-day WFO with one heavy
slot/four queued intents. It **failed** latency: Library 811, Progress 605,
Evidence 602 ms. Peak 791,539,712 bytes. Preserve
`p23-tuned-diagnostic-workload.json`, `*-read.json`, `*-resource-series.json`
privately; this is not an official clean acceptance receipt.

A separate read-only stage probe found Library 585 ms total with one shared
SQL page (~100 ms) and aggregate (~36 ms). The remaining synchronous
per-viewer mapping/validation was the dominant cost. Progress's direct
repository burst was 244 ms; HTTP/other-read contention matters too. Query
timings are diagnostic, not a replacement for the authenticated full-body
latency sampler.

Repairs:

- Progress sets the same five transaction-local budgets/actor/workspace
  values in one round trip; runtime role, repeatable read and error mapping
  stay unchanged.
- Library validates identical DB-returned requested-spec/progress JSON
  once using weak object-identity keys, freezing source and parsed facts.
  A new object/string never inherits verification from a digest or run ID.
- Shared in-flight Library rows are immutable. Rows with different
  actor-owned RC drafts get different identities. Each actor still passes
  fresh membership/RLS checks in the original bounded read transaction.
- Library maps/validates one identical immutable card once. Mutable inputs,
  independent snapshots and changed Date values undergo normal validation.
  P19's mapRow remains the normal uncached validator. Facets, timestamps,
  page bounds, 4-active/16-queued lane and data/auth freshness are unchanged.

No persistent data, authorization or cross-request digest-keyed cache was
added. Weak keys disappear with the actual DB snapshot population.

## 3. Historical DR exception, not byte recovery

These exact old disposable-test losses retain their original revision 1,
expected manifest digests and ten part records each:

| Artifact | Run | Expected manifest SHA-256 |
| --- | --- | --- |
| `rart_0a356b7ee5c8e6f85ebeeb9ca416c1a347229b0f` | `rrun_1690a9830787332de93d93d457c8aa0e` | `56c8b524678fadc63d9dd6c03b3c566197648a3a7699828fa75d00a3cdd17039` |
| `rart_64469653604a37d46833ed048ba75c1d7e864b60` | `rrun_e2c3a4d31decb9f5d77b77fe49616fdb` | `1a19fbcd9a32ebe38b1a87267060eb1441e59ba2dcfb1ecdb9f96fd3cd626866` |
| `rart_830fa0d721d3817db2c4881b54c1cd84fa3306a0` | `rrun_c93896666b0f3f1647aaa4967ce8c792` | `1bec68a3dee37597557a42fa10a0af5b258e09a516a7367dcd4e92363be47a53` |

Actual readback refines the old "zero references" description: zero P05
retention pins, RC/publication/promotion/selection/exposure/audit links, but
**one retained DB seal and one frozen Report per run**. Those copies are
preserved/disclosed, not claimed as proof of lost artifact byte custody.

The explicit `--account-exact-historical-test-loss` mode requires partial
capture and an exact three-ID/run/workspace/revision/digest/part-count set.
It verifies all nine dependency counts and full DB/artifact parity before
accounting for the known losses. A changed count/digest, missing dependency
proof, duplicate/fourth loss, corrupt present part or foreign cell refuses.

Default strict integrity remains unchanged. Even accepted accounting leaves
`full_store_integrity_passed=false`, `byte_recovery_performed=false`, and the
restore CLI's `passed=false`/exit 1. No row deletion, reseal, hash rewrite or
synthetic byte recovery is performed. Distinguish coherent restoration of
the verified population from irrecoverable original test-byte loss.

## 4. Tests, identity hygiene and required final receipt

First six focused Control suites: 56/56 PASS. The first build exposed a
generic Zod input/output inference error; the parser now explicitly accepts
unknown input with the schema's actual output, and the build passes. Added
projection-sharing/actor-draft/fresh-snapshot/Date regressions are being run
before the normal grouped hook. Node restore/exception/mixed/identity harness
files pass; negative fixtures never substitute for actual restoration.

Recreated isolated bootstrap left twenty retired readers ACTIVE with
must-change-password. Their old passwords therefore could not authenticate.
No logs or credential store were mined: normal owner activation/reissue and
password-change APIs recovered only these QA accounts, keeping tokens in
0600 state. Actual enable receipt records **20 QA activation reissues**;
never claim that no credentials changed. Bobby/Stan/Thanhvuong are untouched.
Final C4 must disable all 21 non-owner QA accounts, revoke sessions, preserve
the owner anchor and remove only owned cell containers/network, no volumes.

Next: commit the coherent implementation via normal hooks, name the clean
candidate/images, retake mixed-load without concurrent builds/faults, then
coherent restore/exception accounting on that same candidate. Record real
latency/resource/hash/restore outcomes and failures here before closeout.
P23 engine-two, independent WFO/browser and P24 remain separate.

## 5. Clean candidate and exact immutable image set

Code commit `b90a36a9b58920e72365e561e71ecb017395f7d4`: 15 owned files,
**+568 / −20**. The normal grouped commit hook passed before rebase onto
Claude's already-landed `23ef532e` and `a163af4b`. No conflict, frontend edit,
public contract change or migration. Only Control API and this cell's gateway
were recreated with `--no-deps`; no shared preview/production deployment.
Control build reused verified layers; the same output config is
`f061f0fa4a8356088e8c2b2403ab19a26cc77ce57c36f985fa3a203db043f9a1`.

| Service | Runnable immutable image SHA-256 |
| --- | --- |
| control-api | `edd2229815675e4d84364e0795c8b627024ac5b05a5ac0da32e3ff2981636828` |
| portal-api / quant-worker-py | `66cfd8cfd20f1a8fa156984ed1aad56f321dae0cedcb552b2c89fdb28a31b100` |
| portal-web | `ddc34114368c9f949eea26113a791f3854724461c2dee95be513d71b06e8c7ce` |
| portal-postgres | `cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| portal-nats | `b83efabe3e7def1e0a4a31ec6e078999bb17c80363f881df35edc70fcb6bb927` |
| roadmap-task-board-api | `3f7acd1518a866eca9c2bba6da2c2b8ea67d457ff9adf274842f3f2b283ad095` |

All seven have finite memory/no-swap limits and were retained by exact image
tags before restore/teardown. Unchanged worker/gateway images are pinned
existing images, not a claim that the new frontend was rebuilt or visually
accepted. An earlier diagnostic Control index `b345…` became unresolvable
after a tag replacement; its late preservation attempt failed. Do not claim
that exact diagnostic index was saved. The running diagnostic `da177…` and
the final clean runtime image set were pinned successfully; no production
or rollback image was deliberately deleted.

## 6. Actual affected mixed-load retake — PASS

2026-10-03 **07:47:24.586–07:48:36.015 UTC**, :8096; source clean,
`diagnostic_only=false`. Twenty different authenticated workspace members,
120 full bounded JSON GETs, all 200. No concurrent build/hook/fault drill.

| Named read | Prior official p95 ms | Clean retake p95 ms | Unchanged target ms |
| --- | --- | --- | --- |
| Library | 538 | **499** | 500 |
| Progress | 568 | **403** | 500 |
| Evidence | — | 462 | 500 |
| Search | — | 363 | 750 |
| Report | — | 218 | 500 |
| Replay | — | 429 | 1,000 |

Library passes with **only 1 ms headroom**; this receipt proves this measured
profile, not a generous capacity margin or an extended soak. Preserve this
qualification caveat; no threshold relaxation or favorable-run filtering.
The first failed diagnostic remains in §2 and private state.

Real run `rrun_c3bc2113431102c1715a9d6d28d7b2bf` completed READY using
`crypto-binance-1m`, BTCUSDT / 1h, expanding weekly WFO from
2026-06-01 to 2026-09-01 exclusive, split 2026-06-08, pinned QuantBT profile.
One heavy slot, four distinct queued public intents; all four cancelled via
the public API afterward. Viewer job census stayed **241 → 241**. Peak
measured cgroup usage **738,488,320 bytes**, below 5,000,000,000; no swap.
Far-seek, utility quota and outage were not rerun: their accepted receipts
remain separately applicable, not recertified by this slice.

## 7. Actual coherent DR and exact historical accounting

2026-10-03 **07:49:11.670–07:52:05.026 UTC**, same candidate/image set.
Dump/restore used new owned `historical-accounted-20261003` volumes, then
switched back to the intact original volumes. No migration/bootstrap/worker
was run on the restored target. Five Progress/Evidence/Search/Report/Replay
reads returned 200 while the restored worker was off.

- Exact before/after DB, auth/roles/RLS/schema/sequence/reference parity:
  **151 tables**, **86 sealed artifact records**, **886 part records**.
- File-tree/hash parity: **3,521 files**; **83 manifests/parts verified**.
- Missing set remains exactly the three §3 identities/digests; no fourth
  loss, corrupt extant part or changed dependency was exempted.
- `coherent_restore_passed=true`,
  `exception_accounting_passed=true`,
  `scoped_verified_population_passed=true`.
- **`full_store_integrity_passed=false`, `byte_recovery_performed=false`,
  strict `passed=false` / CLI exit 1.** This is the expected, preserved strict
  verdict for genuine lost bytes, not a silently waived full integrity gate.

No artifact/run/report/seal was deleted, resealed or assigned a new digest.
Retained DB seal/Report copies remain disclosed as copies, not recovered
artifact-byte custody. The history is now fully accounted for; it is not
fully byte-recovered.

## 8. Evidence locations, tests and C4

Raw private files remain 0600 under
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`. Do not commit
their bodies, cookies, backup data, source rows or activation credentials.

| Private file | SHA-256 |
| --- | --- |
| identity-p23-tuned-clean.json | `ca1bede1dd0bfda304ab40f3c7c127d848c77f5b6e3954a00b66bf45b2c4d979` |
| p23-tuned-clean-workload.json | `4ee71a1af993aba5621c1dff2eb9af4fe5130446de4372bfcd63e95664c91f50` |
| p23-tuned-clean-read.json | `bf2555d3fb86dfb668415ef40b252dcf336099afa3ba4e3412980f523e08a1ea` |
| p23-tuned-clean-resource-series.json | `21a62bf174ddf612a27d3a11b965b9fa3bc6948ca1dc6ed5a68ae996c789b5d5` |
| restore-historical-accounted-20261003.json | `2984374b730fe7d6b2bf4693f3c7c03cc072c54a390dc2b56bb11127dbc9f24a` |
| p23-tuned-clean-cleanup.json | `9f4f438d08c19f6f6fc4217f8e9b224ece65e3890f287b2c14f7529ab93ca5fb` |
| p23-read-dr-code-hook-20261003.log | `5e4c2b34873a89c822ab2c3c0f15730c754b82c45247e5fe155f07fa9fa844be` |

DB backup SHA-256 `efe044d84148705eb1cbc1738d4befc9c59157dee2fc5762fd6f5a2b061715f6`
(11,356,771 bytes); globals
`7eff706ad7f018377b0ea90c296bec9b0352e45bc1fc4d861fa0147896453f22`
(879 bytes); artifact archive
`116ba2ac2dc9b3631289a4d9e25f590a8b3f0ed72b110987661d2f5596202ed5`
(45,926,400 bytes). Restored tree digest
`f720f701d34c1b4a7fd9109df1e808b880c3939edf15badf3881c26f84e647a0`.

Final focused Control suites **53/53 PASS** and build PASS. Four Node harness
test files PASS. Normal code hook: Control **1,841 PASS / 1 intentional
skip**, packages/contract Vitest **260 PASS**; full verifier exit 0. No manual
extra frontend/browser rebuild or unrelated drill was added. The final
docs receipt commit uses the ordinary mandatory hook too, not a bypass.

C4 completed after restore: **21 non-owner QA accounts disabled**, owner
anchor retained, **0 active QA sessions**, **0 nonterminal jobs**, **0 owned
containers / 0 owned networks**. Original/restore volumes, backups and exact
runnable images are retained; no broad prune or volume deletion. Read-only
capacity: **200,489,037,824 bytes disk available (~30%)**, RAM available
**12,991,012,864 bytes**, swap 0. **NO_ACTION_NEEDED** for cache deletion.
Bobby/Stan/Thanhvuong identities, production and :8095 are unchanged.

## 9. Next boundary / Claude handoff

The two owner-approved outcomes are delivered: affected measured performance
PASS and transparent exact historical-loss accounting. No public DTO change
or new frontend data-binding is required. Claude's landed frontend commits
remain in the branch; their visual/browser work is not claimed here.

Still separate: full historical byte recovery (not achieved), engine-two
T07/T13, independent WFO recomputation, frontend/browser product acceptance,
and P24. Do not turn this scoped PASS into full P23/Research release GO.
No origin/primus-origin push, dev/main merge or production activation.

**Continuation delivered 2026-10-03:** independent WFO recomputation is now
[SCOPED_PASS](./WFO_DIRECT_ENGINE_RECOMPUTATION_2026-10-03.md), not still pending
for this admitted profile. [P24 acceptance packet](../P24/V1_ACCEPTANCE.md)
adds the actual read-preserving producer rollback, old-reader incompatibility
proof, complete 15-ID / 20-FND disposition tables and cleanup. Full-product,
second-engine, historical byte recovery and signed release remain separate;
no repeat of this already accepted load/restore slice was required.
