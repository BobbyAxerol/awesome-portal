# P19 phase report — backend

## Scope completed

1. Added additive migration `1723680000053_research-attempt-lineage-v1.sql`: lookup indexes plus immutable `attempt_promotion_pick_facts_v1` with same-version attempt/run validation and Portal runtime `SELECT` authority only.
2. Added `research.attempt-lineage.v1` DTO, generated OpenAPI client and one SessionGuard-protected `GET` controller.
3. Added a two-active/eight-queued admission-controlled, repeatable-read repository using batched child/exposure reads, exact scoped membership and database budgets.
4. Added an allow-listed semantic-diff mapper, lifecycle/parent graph validation, failed/draft/abandoned/retry counts, exposure truth and typed current-source absences.
5. Added focused unit, controller, contract and disposable PostgreSQL migration tests; registered feature/config, deploy overlay, capability ledger, contract snapshot, runbook and test-cleanup dependency.

## Explicit non-goals / source gaps

- The current data plane has no source-attested DR03 promotion fact. The reader accurately returns `NOT_PUBLISHED`; this is an owner/source fact gap, **not** a Portal heuristic or a reason to delay Screen 10.
- P19 does not claim a semantic comparison where the P08/P10 preflight manifests were never persisted. It returns typed absence rather than inventing a historical diff.
- P19 does not create Clone, Reproduce or Upgrade operations. P10 currently admits only `NEW`; exposing an action the source cannot honour would be false authority.
- Screen 10 rich UI, virtualized probe presentation, accessibility, actual browser/network/HiFi evidence and product-route receipt are Claude-owned.

## Acceptance map

| Required P19 test | Backend evidence |
| --- | --- |
| T01 / T09 | logical attempts and worker retries are separately queried/counted; a retry never adds a graph node |
| T02 / T03 | persisted intent/version facts and server-normalized allow-list semantic diff |
| T04 | migration rejects invalid source-pick scope; service rejects cyclic/cross-Alpha graph corruption |
| T05 | failed/draft/abandoned are not filtered out of chronology or counts |
| T06 | repeatable-read scoped transaction plus finite admission; no mutable graph write surface |
| T07 / T11 | promotion is exclusively source-attested; no lifecycle/metric/recency fallback |
| T10 | explicit child `relationship_kind`, bounded 32-plus-sentinel query and typed truncation |
| T12 | `gates_reset` is a response fact; P19 exposes no mutation route |
| T13 | per-request membership, scoped IDs, raw-config suppression and persisted exposure facts |

## Handoff condition

Claude can start typed Screen 10 consumption now. P19 is backend-complete and feature-dark; it is not phase/product-close until Claude returns the HIFI browser receipt and source gaps are rendered exactly as typed.
