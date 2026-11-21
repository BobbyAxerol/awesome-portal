# P23 T12 utility execution: worker flag parity and actual retake

Date: 2026-09-27 · Codex · `docs/research-loop-plan` · base `02736e99`.
This continues Bobby's original eight-group goal. **Full T12, P23 and P24
remain OPEN**; a utility subset does not replace audit/quota qualification.
Only project `portal-research-p23-ol12`, loopback 8096, was changed. No shared
8095, frontend, <=P21 service source, Production, dev/main, push or AWS-HK/TS.

## Sources and owned change

Read the private goal objective, Research A13.1–4, Unified §13.4.1 ownership,
Guide P23 and §16 workloads/SLO/fault matrix, cleanup C4.1–5, current P23
packets, worker/producer what-if fences and published export format contract.
The previous goal turn was a requested report, not implementation progress.

The new confined utility harness calls named public operations using actual
authenticated principals and a real retained WFO parent. It does not mutate
membership, source, terminal or lease SQL. It explicitly binds the parent
workspace on every reader report/export call, selects four real members with
no existing parent exports, and checks formats against the published enum.
It queues eight exports before admitting expensive primary work so a bad
route/scope is refused before creating compute. Exactly two compute intents
are explicit; slider/GET does not submit. The finite official export CLI runs
`--limit=8` inside the already-capped Control API cgroup, not a new service.

## Failed observations preserved

1. The first instrument used presentation names `JSON`/`CSV`, but the actual
   contract requires `REPORT_JSON`/`REPORT_CSV`: 400, no export. Its two newly
   admitted jobs were cancelled via API. This is a harness error, not a server
   defect; regression now compares the actual producer enum.
2. The next instrument omitted `workspace_id` on a member's export. A member's
   personal default workspace is not the parent's workspace: 409. Explicit
   scoped Report GET proves the sealed report is present. No membership/role
   change or writer fix was required. The two new jobs were cancelled by API.
3. The correctly scoped run completed the primary, eight exports and six
   verifies, but diagnostic `rrun_ea593a1d9932efd03f708cbf7bce66cc` failed
   `LEASE_EXPIRED` with source sequence 0. Actual worker environment omitted
   `PORTAL_FEATURE_RESEARCH_WHATIF`; Control API had its corresponding flag.
   The worker's existing fence refused the diagnostic before journal/child.
   It is a P23-owned overlay mismatch, not a QuantBT upgrade/source gap.

The activation overlay now sets **only** that missing worker flag. Recreate
was gated on zero active compute and zero pending exports. Exactly one worker
container changed; image ID, memory/swap caps, enforced AppArmor and mounts
match. All six other container IDs/start times match. Hash of 78 original
user/membership/sealed-artifact rows matches before/after. No old failed job
was relaunched, no NATS purge and no lease/terminal reset.

Application identity remains clean Control API `19a8e813` with six unchanged
per-image source pins. Private identity records the changed worker container
and overlay SHA explicitly, plus tool checkout `02736e99`/dirty. It does not
claim all application images were rebuilt from the uncommitted harness.
Overlay SHA-256: `2a3027d3fdfe61e4abf97c07d917b82114e9711308cda6d972248745fa3aaa2c`.

## Actual corrected run — scoped PASS

Parent `rrun_90578b81460c44f1a2729b717b3c2c8b`; real BTCUSDT 1h HMD,
June 1–September 1 2026 half-open WFO windows, weekly expanding schedule,
first OOS June 8, mode_1/global, three trials, seed 42. The diagnostic evaluates
the parent's published grid; no interpolated objective or invented cell.

| Observation | Actual result |
|---|---|
| Primary `rrun_000c2e0192a16de202b1e93ff8fc0c8a` | COMPLETED / READY, source sequence 44 |
| Diagnostic `rrun_520e8066582de45f2ee7cdcc6f716390` | COMPLETED / READY, source sequence 94 |
| Queued utility alongside source-running primary | Observed actual lease/job/source samples; not a claim of two parallel engine slots |
| Grid | 81/81 cells, 63/63 unique evaluations, sealed; no remaining work |
| Retry/changed grid | Same diagnostic ID and REPLAYED; changed key 409 `RESEARCH_WHATIF_GRID_CHANGED` |
| Exports | Four members × two formats: eight READY, 97,960/10,818 bytes; retries keep each job ID |
| Explicit artifact verification | Six public verify operations return MATCH |
| Parent pins and frozen selection | Exact before/after match |
| Compute cardinality | Exactly two explicit jobs and one additional diagnostic row |
| Aggregate resources | Ten strict samples, peak **656769024 bytes**, every runtime service capped |

`scoped_passed:true`; **`full_t12_passed:false`** is deliberate. A separate
queued audit capability and all negative quota boundaries still need their
real evidence. The prior RUNNING-only overlap expectation was wrong because
the durable primary may remain CLAIMED while its source is RUNNING; the tool
now requires its active lease plus actual positive source sequence and queued
utility. It does not fabricate simultaneous engines or rewrite the old FAIL.

## Private receipts and focused gate

0600 files under `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
No credentials, cookies, raw business responses or artifacts enter Git.

| File | SHA-256 |
|---|---|
| `utility-19a8e813.json` — format refusal | `d974c6c74a31851a3444da6b44b10b33670075e0ce5719a3ae95492582acb87b` |
| `utility-19a8e813-retake.json` — workspace refusal | `c6ee3ac14bf08283e39d4cc25f34e2b6784e7232343d6ba81268afe888d3c12c` |
| `utility-19a8e813-scoped.json` — missing worker flag FAIL | `e7b1ff67461e9b088d36422c7c0ed03692a6f54c50f9786708f1e321b9ac43e4` |
| `utility-diagnostic-failure-details.json` — actual job/attempt reason | `206bbfbe1bbef01ee575b2238f94488363d675eedf9eb50e28a84d9c5210cd45` |
| `utility-worker-parity-before.json` | `09d1b36becb8a138cafd5a97c9d89b75f3f73b0060e379b6912f5bddaffd93fe` |
| `utility-worker-parity-after.json` | `b4a4503c7c8f7fdfb5893edf6ccc30513d6fa1d9e29e25a9807cd40beae0463f` |
| `utility-whatif-parity.json` — actual scoped PASS | `c6129b1178fdfeb51c076f262869ee43f43a1da1aa822bfed90b145ed49f2cc5` |
| `utility-cleanup-capacity.json` | `123ae918a5f2710304100e9e5d7b7d9a6353890f465559bf315d9b2085997728` |

Command: `node scripts/research-p23/utility-receipt.mjs --parent=rrun_90578b81460c44f1a2729b717b3c2c8b --label=utility-whatif-parity`.
Focused `node --test scripts/research-p23/utility-receipt.test.mjs scripts/research-p23/cell.test.mjs`:
**12/12 PASS**, zero skips; they test bounds, exact scope, source pins, format,
workspace binding, parity and refusal to certify full T12 from a subset.
Whole-workspace mandatory commit hook is separate; no bypass or application
rebuild for this configuration/tool-only repair.

## Cleanup and next full-goal work

Actual end snapshot: **449130496 bytes**, active compute 0, pending exports 0.
The finite export worker exited and both new compute jobs reached READY;
there is no live utility handle to restart. No prune/scratch cleanup/volume
deletion. Original volumes, images and successful/failed receipts stay retained.
Named C4 follow-up at qualification end: revoke all 22 test identities/sessions,
stop only this project without `-v`, inventory retained evidence and capacity.

Continue T12 audit/quota boundaries, isolated disk/outage/security/upgrade/
far-seek and nonempty graph restore/GC. `CG-P23-T02-01` remains the shared
source-owner scratch repair; do not edit <=P21 services without handoff.
Full exact-candidate browser writes/consumers and P24 remain required. This
fix does not reduce the original goal or mark P23/Product/Production complete.
