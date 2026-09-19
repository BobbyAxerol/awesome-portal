# P06 scheduler policy v1

`research.durable-scheduler-policy.v1` is an internal Control-API contract.
It is not browser configuration and contains no network endpoint or secret.

| Subject | P06 policy |
|---|---|
| Logical identity | `(workspace_id, run_id, logical_work_key)` plus required SHA-256 `work_digest` and idempotent `command_id` |
| Cross-user reuse | authorised users may replay identical logical work; replay is audited and original requester retains fairness accounting |
| Non-merge rule | command/work key/digest mismatch, cost, kind, readiness, queue, limit or resource-class mismatch is `RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT` |
| Queue classes | `INTERACTIVE`, `HEAVY`, `BACKGROUND`; one `HEAVY` claim per workspace |
| Fairness | oldest `last_claimed_at` requester within priority class; no hidden source/data load at admission |
| Resource declaration | all memory/CPU/scratch/I/O dimensions required and bounded; P06 max lease 300s, outbox publisher lease 60s, retry limit 8 |
| Retry | same logical job; new worker-attempt ordinal/lease epoch; never another Research intent/run |
| Cancellation | cancellation CAS wins terminal race; queued work becomes `CANCELLED`, active work becomes `CANCEL_REQUESTED` |
| Readiness class | explicit `MANDATORY` or `OPTIONAL`; P11 owns aggregate gate interpretation |
| Outbox | transactional, ID-only, claim then publish then acknowledge; publisher crash/outage returns row after short lease |

`work_digest` is the future producer's canonical digest over target artifact,
effective config, objective, data role, seed and runtime; P06 validates and
preserves it but does not fabricate fields that P08/P10 own. Legacy P03 rows
have no digest and are deliberately not claimable by P06.

The policy is deliberately below P10's browser producer. A front-end must not
invent ETA, infer worker success from an outbox event, or treat a retry as a
new Research run.
