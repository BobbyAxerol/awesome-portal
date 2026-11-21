# P21 phase report — Release Candidate composer and immutable evidence pack

## Scope and result

P21 backend/typed-contract work is complete and feature-dark. It is a
Portal-local Research composition lane, not a Trading System, Execution,
Governance, worker, or artifact-store integration. The local seal boundary is
intentionally smaller than the S11 HiFi publication story; P22 owns that later
story.

## Implementation inventory

| Area | Delivery |
| --- | --- |
| Schema | Migration `1723680000055_research-release-candidate-v1.sql`: actor-local drafts, immutable packs, delivery states and retention pins with trigger and privilege boundaries. |
| Source reader | Scoped repeatable-read snapshot of existing P04/P11/P13/P14/P18/RS-02 persisted projections only. |
| Composer | 17 exact ordered fields, mirrored YAML list, 12 exact ordered pack items, availability/freshness/source fingerprint, rail, taxonomy, local-seal and typed action gate. |
| Mutation | Source fingerprint + draft revision CAS; sealed pack creation is idempotent and carries only Portal-local identity. |
| Contract | Zod boundary plus generated `research-release-candidate.openapi.json` type; same-origin endpoint errors are typed. |
| Operations | Feature profile/deploy examples and a dark/rollback runbook. No container, runtime flag, worker or deployment was activated. |

## Mandatory test matrix

| ID | Proof | Result |
| --- | --- | --- |
| P21-T01 | Bound READY audit emits exactly 17 fields/12 rows and no compute call | pass |
| P21-T02 | Required missing source fact is a typed `MISSING`, not a waiver | pass |
| P21-T03 | `DEGRADED` row survives intact and does not masquerade as `COMPLETE` | pass |
| P21-T04 | Scratch/unbound and inactive binding cannot local-seal | pass |
| P21-T05 | Draft/source CAS returns 409 on a stale fence | pass in disposable PostgreSQL proof |
| P21-T06 | Corrupt/malformed source evidence fails closed | pass |
| P21-T07 | Source report/manifest/dataset/transform identities are non-circular and exact | pass |
| P21-T08 | Frozen pack contains the local `rc_` identity, rejects mutation and retains pins | pass |
| P21-T09 | Controller, config, generated OpenAPI and Zod contracts agree | pass |
| P21-T10 | Only exact `READY AUDIT_OF_SELECTION` with matching target selection is final audit | pass |
| P21-T11 | Centroid/composite selections need their own digest; no trial is fabricated | pass |
| P21-T12 | Composer/local-seal never invokes optimizer/QuantBT | pass by dependency surface + service proof |
| P21-T13 | Local seal retains `NOT_DELIVERED` / `NOT_APPROVED`, not a publication/approval | pass |
| P21-T14 | Integrity warning cannot change approval/runtime state | pass in immutable-state proof |

## Deliberate state distinctions

1. `UNSEALED` means no Portal-local evidence pack exists.
2. `SEALED_LOCAL` means the immutable pack is stored and pinned. It says
   nothing about an external or governance outcome.
3. `NOT_DELIVERED` and `NOT_APPROVED` are retained separate lifecycle facts,
   never values inside the frozen evidence core.
4. `published_comparison` is `NOT_PUBLISHED` until P22 supplies an actual
   published predecessor. Current hashes are not evidence of `CHANGED` or
   `UNCHANGED` versus a predecessor.
5. `certification_axes.methodology_claim` only carries a source-issued grade;
   `engine_execution_contract` stays `NOT_PUBLISHED` unless a source fact
   exists. They cannot be collapsed into one synthetic chip.

## Known next gates, not debt hidden inside P21

| Gate | Owner | Why it remains open |
| --- | --- | --- |
| `V11-P21-BR` | Claude / frontend | Mount rich Screen 11 on the product route and verify generated same-origin client behavior at 1280px and 660px. |
| `V11-P21-DR` | Research runtime owner | Enable only after profile admission review; P21 stays dark. |
| P22 publication and approval mirror | Later backend phase | Requires an unchanged compatible Governance publication path; it cannot be approximated by local seal. |

No direct DB/Redis/broker/CLI/Execution connection is introduced by P21. No
source owner request is needed to close P21 backend scope.
