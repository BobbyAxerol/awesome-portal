# Portal → target owners: original01/06 roster and bounded measurement inputs

Date: 2026-10-21. Delegation: Claude C4, approved by Bobby; Codex coordinates,
PM/TS/DL/Research owners admit their targets, Edge owns its existing harness.
**Prepared state: NOT_SENT. Owner acknowledgement: NOT_ACKNOWLEDGED.** Actual
delivery is recorded separately in the receiving owner's Unified journal. No numeric
budget, physical target, measurement window or production SLO is approved here.

## Current source preparation

Read-only pins:

- Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
  `feat/execution-edge-upgrade-v1_2@276536c2039b85549b8b7b2ae6049d7370851a9c`.
- PM `/home/bobby/.worktrees/trading-system-pm-v1_1`,
  `feat/portfolio-account-v1_1-parallel@e2efd91bc147f53f08c750e165fee67ebdb4b57a`.
- PM baseline `contracts/baseline/portfolio-account-v1_1/`:
  `pma11-16-finite-pilot-resource-successor-proposal.json` SHA256
  `771955a5d8be3ee050aae677a8a25688c349f500badc4409dedd92d29dc9cfa0`,
  `execution_ready:false`. Proposed 3CPU/2560MiB remains **not approved**.
  `pma11-16-matched-measurement-preparation.json` observed SHA256
  `31164f54e48ac805b8a7befe254a3705f2816ded1406e52f67007bce36a63df9`
  is PM working-tree preparation, not an immutable delivered measurement result.
- Portal canonical `docs/research-loop-plan@7818d5631e0da37563bca5715fd46d40b66ef1de`;
  Claude implementation `7378d4232010de6033449e7f5323780eed5095ae`.

Existing target/observer and pilot preparation should be reused. No additional
framework is requested. Old isolated correctness/P184 test images do not prove
the named production writer or absolute coexistence capacity.

## Requested owner inputs, per target

1. Name the responsible owner and exact admitted service/image/config,
   physical DB, filesystem device/quota/durability/admission, storage references
   and measured baseline headroom. Do not infer ownership from a branch name.
2. Return numeric bounds with their **existing approval references** where
   available. If not yet approved, label the concrete proposal and measurements
   still needed; do not substitute test constants or request blanket permission.
3. Declare workload/burst/outage/resync, duration/repeats, instrumentation,
   independent restore/probes and stop/rollback. Provide a finite window for
   actual measurement, distinct from correctness builds and Core recovery.
4. Distinguish pilot20 operations/arm,1op/s,60s paired OFF/ON trials from
   B0/B1/B2 canonical6k/9k TRADE events/s,600s/two repeats/12cells. Paired shared
   load deltas are not absolute-SLO proof; do not lower the existing validator.
5. Return source/config/image closure and actual run/cleanup evidence only
   after execution. Target preparation can proceed independently of incomplete
   command or financial publication, within the already approved owner scope.

## Owning reply locators and completion

Use Edge's existing public directories:

- `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-01/`
- `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-06/RESOURCE_ENVELOPE_AND_HOT_PATH.md`

PM returns its roster/proposal in the existing baseline directory above and
links PM Unified §58.307/58.308 plus its current R2 guide. Each other target
owner replies in its original owning plan/receipt and links the exact artifact
from Edge01/06; Portal does not invent an owner or replicate their ledger.
ACK must identify which target and inputs are accepted or still missing;
delivery itself is not ACK, nor is a complete proposal an approved budget.

## Concurrent recovery and resource boundary

Do not duplicate or apply load to Core's original eight-admission cell while
Codex handles the one unresolved lease
`785387ba-ef57-455d-a7ba-f92663baae60` / attempt
`07becd72-1e11-4ab9-8a96-d5fd7339f1a0`. The current maintenance-only recovery
window is not a measurement window or renewed READ/STREAM authority. No
services, budgets, grants, DBs or containers were changed for this request;
no test/build/load was run, and no cleanup was necessary.
