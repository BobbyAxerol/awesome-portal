# P23 — owner historical disposition and real second-engine qualification

**Current 2026-10-05:** [actual Portal engine transition](../P24/P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md)
supersedes the direct-wheel-only OPEN conclusion below for T07/T13's exact
isolated fixed Delta/HMD profile. Historical 83/86 exception is owner accepted,
not byte recovery. [Reconciled current P23 matrix](./P23_QUALIFICATION_CLOSEOUT_2026-10-05.md)
is authoritative for current status; original experiment/results below remain.

## Owner decision and boundaries

Bobby's 2026-10-04 approval accepts the exact three old test-run exception
and selects published **QuantBT 1.1.0 → 1.1.1** for isolated qualification.
No other run, missing artifact, published reference or source defect is waived.
The strict result remains **83/86** (`full_store_integrity=false`); missing
original bytes are not recreated, resealed or labeled restored. Existing
metadata, immutable expected digests, seals and backups remain preserved.

| Historical test run | Missing artifact | Original expected SHA-256 |
|---|---|---|
| `rrun_1690a9830787332de93d93d457c8aa0e` | `rart_0a356b7ee5c8e6f85ebeeb9ca416c1a347229b0f` | `56c8b524678fadc63d9dd6c03b3c566197648a3a7699828fa75d00a3cdd17039` |
| `rrun_e2c3a4d31decb9f5d77b77fe49616fdb` | `rart_64469653604a37d46833ed048ba75c1d7e864b60` | `1a19fbcd9a32ebe38b1a87267060eb1441e59ba2dcfb1ecdb9f96fd3cd626866` |
| `rrun_c93896666b0f3f1647aaa4967ce8c792` | `rart_830fa0d721d3817db2c4881b54c1cd84fa3306a0` | `1bec68a3dee37597557a42fa10a0af5b258e09a516a7367dcd4e92363be47a53` |

Existing original-byte scans and restore accounting are reused from
[the historical exception receipt](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md)
and [the latest scoped consumer receipt](./WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md).
They are not rerun merely to record this approval. Historical scope status:
**OWNER_SCOPED_EXCEPTION_ACCEPTED**, not `STRICT_INTEGRITY_PASS`.

## Execution plan and exit gate

1. Verify published wheel hashes and runtime version; no vendor engine/source
   checkout, no 1.1.1 image relabeled 1.1.0. Keep production pins unchanged.
2. Qualify supported 1.1.0 profile on read-only historical data, then test an
   isolated 1.1.1 transition. Report any API/profile difference explicitly.
3. Test old in-flight job stays pinned, resolved defaults and old effective
   spec remain immutable, unsupported new mapper is refused, and rollback
   preserves history/readers. Bare Python capability is not Portal PASS.
4. Retain actual run/image/config/input and receipt hashes; run only affected
   tests plus required normal hooks once for the coherent change. Scoped C4
   cleanup preserves evidence/volumes and current/rollback images.

T07/T13/P24-T05: **PENDING_RUNTIME_RECEIPT**. Full P24 visual/action/owner and
signed-release evidence remain separate. Scope is isolated Research only;
no shared :8095, production engine/default, TS/Execution change or remote push.

## Actual second-wheel result

**PUBLIC_FIXED_ROUTE_QUALIFIED / PORTAL_UPGRADE_OPEN**, tested 2026-10-04
02:49:15–02:49:30 UTC (09:49 Asia/Saigon). Source base `7d18fe4e` with
the explicitly dirty test-only harness recorded; no deployable image rebuild.

Published wheel metadata is read from the official version-specific PyPI API.
The isolated derivative image replaces only the engine/native wheels, using
`--no-deps --require-hashes`; the Portal application still declares 1.1.1.
It is **qualification-only**, not a production/API/worker release image.

| Pin | QuantBT 1.1.0 | QuantBT 1.1.1 |
|---|---|---|
| Engine wheel SHA-256 | `c319b24325230df99ce1803ae03df09c15acabd834dd2f6ccd17b21e70363e62` | `9a1c7af724e543d8cba338206c0b2c64afe1fb3a621f21b2505454c4807b8587` |
| Actual native version | `0.4.1` | `0.4.2` |
| Image ID | `sha256:9a14f138a7feae74bcab88feaea63d495a5f8312b0d4ed989f9c252571abc717` | `sha256:7d68b990005ef504176128c83513fce7103c31b8db725979cfc30dcc75ac9700` |
| Fixed Delta bars / trades | `636 / 4` | `636 / 4` |
| Actual final equity | `20130.193634373325` | `20130.193634373325` |
| Current Portal gateway | **REFUSED**: installed adapter requires 1.1.1 | **ACCEPTED**, actual 1.1.1 |

Native 0.4.1 CPython-3.12/Linux wheel SHA-256:
`f26681ad154aea38d9d0fc8f9e828a6c480176cf7f20041cbb86f06e1dd38b3d`.
The same 684-row stored HMD snapshot is used, excluding holdout for both
636-row computations. Run `rrun_d8e174e6268aedbf868de56edd062b29`, snapshot
`dss_830094e5ae84e29b36d613cbb2ff30b2`; SHA-256
`42ccef20ff66a19d219ba1aeb9355923f1e60c04a7e09851fa96e32c022368b3`.
Original bundle manifest SHA-256
`1bacd23b0deac44445f46f30bc8e4bf4e5cc7ff1e63a6a363a2d34aa2ba6e441`.
Exact dataset/symbol/timeframe/windows/request/binding are in the private
receipt. Both engines exit 0; numeric differences equity/trades **0/0**;
original snapshot/manifest rehashes match after compute. This is an old-wheel
compatibility experiment, **not** a new retained run or exact-reproduction
claim for a run whose original request pins 1.1.1.

Reproduction commands:

```bash
sudo -n docker build -f scripts/research-p23/engine-110-qualification.Dockerfile \
  -t local/portal-research-p23-engine-110:qualification-20261004 .
node scripts/research-p23/second-engine-receipt.mjs --attempt=02
node scripts/research-p23/second-engine-receipt.test.mjs
```

The build requires the retained exact base image tag. Receipt attempt 02 now
exists: the runner refuses overwriting it; an authorized repeat uses a new
bounded attempt ID, never removes the original evidence.

## Concrete remaining Portal gate, not engine incapability

The runtime result verifies `QuantBTGateway._module()` deliberately rejects
1.1.0. P10 `run-admission.service.ts` binds installed P04/WFO/imported
profiles to `er_quantbt_111`; `research_supervisor.py` independently enforces
the 1.1.1 source adapter. No 1.1.0 Portal producer/profile/retention history
exists to exercise an actual **old Portal in-flight run → new default → old
reproduction/rollback**. Changing a version constant or relabeling a 1.1.1
job would manufacture that proof. This is a Portal version-dispatch coverage
gap, **not a QuantBT execution/source-data gap**.

T07/T13/P24-T05 therefore remain **OPEN for end-to-end two-version Portal
receipt**. The next implementation must provide a narrowly qualified 1.1.0
profile/runtime binding in an isolated lane before running that transition;
do not widen production admission/defaults or claim the direct oracle closes
the Portal gate. Existing current-P10 pin-rejection and actual 1.1.1 rollout/
reader proofs remain valid at their originally documented scope.

## Receipts, test and cleanup

Private directory:
`/home/bobby/.local/state/portal-research-p23/20261004/second-engine/`.

| File | SHA-256 / disposition |
|---|---|
| `second-engine-qualification-attempt02.json` | `b6668139398f02a5c968450881a0b87718b63d0ebe871eb77bc1a07834561e31`, two actual engines / bounded fixed-profile proof |
| `engine-1.1.0-command-attempt02.json` | `c806aace68815bbf520407ab56367a53bef27af9152804076e97cf203763b4c1`, exit 0 |
| `engine-1.1.1-command-attempt02.json` | `dfd8d854f703a0288e701035a117295c043f66203d91162b7c4ff79e912277d6`, exit 0 |
| `second-engine-qualification.json` | `c48af24e7087ffd761e289a632982f77c3ea26d35527e68d5c7e07333577259b`, first wrong-volume setup failure, never PASS |

First attempt used a newer clone lacking the exact old P04 bundle and failed
before compute. It remains preserved; corrected attempt uses the original
owned artifact volume **read-only**. No archive scan or original-byte search
was repeated. Focused assessment **4/4 PASS** with explicit version,
pin-drift, byte-rewrite, admission-claim and exact-owner-disposition negatives;
fixture tests are not runtime proof. Node syntax and whitespace checks pass.
The coherent commit uses the mandatory normal hook once; its log is
`/tmp/p23-second-engine-owner-commit-20261004.log`. No manual duplicate full
Control/contract/frontend/engine regression run is added. A successful commit
requires this hook to exit 0; no `--no-verify` or hook override.

Both actual compute containers are removed by exact name. Network `none`,
read-only root/artifact mount, uid 10001, dropped capabilities, CPU 2, memory
2 GiB/no swap and pids 128 enforced; these are configured caps, not claimed
peak-memory measurements. Final owned compose containers/networks **0**,
qualification containers **0**. All original volumes and exact runnable
current/qualification images remain; no prune. Disk free **192,940,208,128
bytes**, RAM available **12,791,267,328 bytes**, swap 0. No QA identity/session,
shared preview, production, dependency default, UI or business DB was changed.
