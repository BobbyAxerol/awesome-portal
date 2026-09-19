# P02 identity map

| Field | Authority | P02 invariant |
| --- | --- | --- |
| `workspace_id` | authenticated Control API session/workspace membership | A supplied ID must resolve to the current member scope; it is never a client-side authority token. |
| `actor_user_id` | Control API authenticated session | Kept as a Research declaration/audit join only; the server remains authoritative. |
| Governance read authority | existing owner/capability policy | Creating an R1 request alone does not grant its creator the R1 read route; the actual readback needs the existing applicable Governance read authority. |
| `research_alpha_id` | future Research registry/version | Descriptive Research identity. It can differ from the execution strategy identifier. |
| `strategy_adapter_id` | current Research run request / existing facade read model | Must be the `strategy_id` carried through the unchanged 202 bridge. |
| `execution_subject_id` | Governance R1 | Must exactly equal `strategy_adapter_id` for current compatibility. |
| `evidence_run_id` | current run read model | Must be terminal, workspace-scoped, and carry the named methodology claim. |
| `methodology_claim_id` | frozen selected artifact | Must be present in the refreshed model; never inferred from display copy. |

The P02 harness returns a typed `EXECUTION_SUBJECT_STRATEGY_MISMATCH` before
the strict R1 payload is constructed. It does not infer aliases or map a
Research alpha name to an Execution subject silently.
