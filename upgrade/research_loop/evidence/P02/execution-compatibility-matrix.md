# Unchanged Execution compatibility matrix

| Surface | Source fact inspected | P02 result | Change |
| --- | --- | --- | --- |
| Facade create | `PortalProxyService.handleWrite` only upserts a run on `POST`, `202`, and string `run_id` | Exercised by P02-T01/T02 | None |
| Read model | Existing `RunsRepository.upsert` writes strategy/dataset/protocol + `QUEUED` | Used as current bridge | None |
| Completion refresh | `ResearchRunSyncService` reads existing run/detail+summary and pins full `selected_params` | Exercised in P02-T01 | None |
| R1 create | `ApprovalCreateRequestSchema` is `.strict()` | Exact payload and extra-field refusal exercised | None |
| R1 readback | Existing Governance detail route emits `governance.r1-review.v1` with `data.approval` | Exercised after actual create | None |
| Execution API/runtime | No P02 call or edit | Out of scope | None |

Compatibility status is `CURRENT_SOURCE_SPIKE_PASS` only after the focused
gate is recorded. It must never be interpreted as authorization to deploy a
new Research producer or to edit Execution contracts.

The spike explicitly proves current RBAC: an R1 creator is not automatically a
R1 reader. Its isolated actor receives existing owner authority only inside the
disposable test database so that readback is tested without weakening the
production policy.
