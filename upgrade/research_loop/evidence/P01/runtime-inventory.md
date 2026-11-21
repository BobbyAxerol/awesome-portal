# P01 runtime and source inventory

Capture: `2026-09-19T00:00:00Z`; scope: versioned local workspace source plus local host metadata. This file contains no runtime secret, connection string, deployed flag value, database row or browser screenshot.

## Boundary result

- P01 is source/discovery only. No Docker, deployment helper, SSH, external database, Execution Edge, Source Proxy, Trading System, broker or CLI call was run.
- Repository compose/environment examples are declarations, not deployed proof.
- The protected strategy kernel hash is checked by the P01 verifier; it is never edited by this phase.

## Static service topology

| Kind | Source | Authority | Role observed in source |
| --- | --- | --- | --- |
| python-api | `apps/portal/backend/src/portal_api/main.py` | CURRENT_REPOSITORY_SOURCE | Portal API composition root |
| python-api | `apps/portal/backend/src/portal_api/api/routes_runs.py` | CURRENT_REPOSITORY_SOURCE | Run read/create boundary |
| python-api | `apps/portal/backend/src/portal_api/api/routes_data.py` | CURRENT_REPOSITORY_SOURCE | Snapshot read boundary |
| python-worker | `apps/portal/backend/src/portal_api/workers/run_worker.py` | CURRENT_REPOSITORY_SOURCE | Bounded process runner |
| python-adapter | `apps/portal/backend/src/portal_api/adapters/market_data.py` | CURRENT_REPOSITORY_SOURCE | Historical data reader contract |
| python-storage | `apps/portal/backend/src/portal_api/services/data_catalog.py` | CURRENT_REPOSITORY_SOURCE | Snapshot store and query boundary |
| control-api | `apps/control-api/src/main.ts` | CURRENT_REPOSITORY_SOURCE | Control API composition root |
| control-api | `apps/control-api/src/facade/facade.controller.ts` | CURRENT_REPOSITORY_SOURCE | Existing facade boundary |
| control-api | `apps/control-api/src/facade/proxy.service.ts` | CURRENT_REPOSITORY_SOURCE | Existing facade transport |
| control-api | `apps/control-api/src/facade/run-sync.service.ts` | CURRENT_REPOSITORY_SOURCE | RunSync compatibility boundary |
| control-api | `apps/control-api/src/governance/contracts.ts` | CURRENT_REPOSITORY_SOURCE | Governance DTO/source boundary |
| control-api | `apps/control-api/src/governance/governance.service.ts` | CURRENT_REPOSITORY_SOURCE | Governance service boundary |
| rust-service | `services/portal-execution-edge-rs/Cargo.toml` | CURRENT_REPOSITORY_SOURCE | Execution-owned Rust service; out of P01 mutation scope |
| deployment-source | `deploy/compose.production.yaml` | CURRENT_REPOSITORY_SOURCE | Repository default, not deployed evidence |
| deployment-source | `deploy/.env.development.example` | CURRENT_REPOSITORY_SOURCE | Redacted repository defaults, not runtime values |

## Static route ownership

- Parsed route/controller entries: **180**; exact method/path collisions: **0**.
- Ownership is source-path + locator only. Dynamic route composition remains an explicit P02 compatibility concern.
- Full table: [route-inventory.csv](./route-inventory.csv).

## Frontend/browser discovery

- Frontend declares React `^18.3.1`, TanStack Query `^5.51.1` and ECharts `^6.1.0`.
- Playwright defines production-true fixture port `4174` and preview fixture port `4175`; its own comments state endpoints are stubbed.
- Browser status is **DISCOVERY_ONLY**: no asset-rendered screenshot, browser trace, real source or visual acceptance is claimed.
- The offline package contains no `doc-page.js` or font/chart binary artifact. Report HTML dependency therefore remains a source finding for P09/P18, not a rendered baseline.

## Local resource snapshot

| Measurement | Value | Unit | Status | Source |
| --- | --- | --- | --- |
| cpu_logical_cores | 8 | cores | MEASURED_LOCAL | `node:os.cpus` |
| memory_host_total_kib | 32862520 | KiB | MEASURED_LOCAL | `/proc/meminfo:MemTotal` |
| workspace_filesystem_total_bytes | 665811062784 | bytes | MEASURED_LOCAL | `node:fs.statfsSync(workspace)` |
| workspace_filesystem_available_bytes | 342555299840 | bytes | MEASURED_LOCAL | `node:fs.statfsSync(workspace)` |
| kernel_release | 5.15.0-185-generic | string | MEASURED_LOCAL | `node:os.release` |

## Intentionally unknown — never interpreted as a measurement

| Subject | Close phase | Reason |
| --- | --- | --- |
| Research dev deployment host/mount type | P23 | No authorized Research runtime deployment probe in P01. |
| Deployed DB schema, runtime feature flags and live service allocation | P23 | P01 inventories repository declarations only; no secret-bearing runtime access. |
| Historical reader snapshot identity and read authorization | P04 | Reader contract is source-mapped; authorized immutable fixture/snapshot receipt is not provisioned. |
| Local Portal backend pytest environment | P02 | apps/portal/.venv is absent in this worktree; P01 did not create or install an environment. |
| Local process cgroup memory limit | P23 | No cgroup memory limit file is visible to this local workspace process. |

## P01 frontend handoff for Claude

No UI code is requested in P01. If Claude reviews in parallel, the bounded task is to verify the **semantics and visual grouping** of the 15 rows in `screen-field-matrix.csv`/`screen-action-matrix.csv` against each HTML + spec, annotate discrepancies in a new P01 handoff note, and **not** modify the Execution Carbon shell, global routing or any Research screen implementation. Browser screenshots remain non-PASS until a later approved visual harness has real assets and a trace.
