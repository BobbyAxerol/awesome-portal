# UDB-02 → UDB-03 / Claude

Storage phase PASS; no frontend design/baseline/component changed. This is
**not** an instruction to begin UDB-03/04 before Bobby approves them.

## Proven data, not invented freshness

Domain DB contains the original source workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`; Core owner Bobby owns the audited review
workspace. Auto-login `claude-preview` is still a nonmember and correctly
denied. UDB-03 must use normal Core access provisioning and workspace
propagation, never rename a source workspace or copy source identities.

| Retained surface | Actual coverage |
|---|---|
| Fleet | All206 unique alphas; Paper48 projection rows;254 total, not254 unique alphas |
| Binding | Paper139, Sandbox35, Live0 (typed empty Manager list, not a claim that all source account relations are authoritatively empty) |
| Portfolio list |2; preserve environment/scope metadata |
| Current Paper | accounts139, balances138, deployments139, strategies206, portfolios2, allocations42, positions66, orders166, sessions2,000, command journal666, conditional groups1/legs3, reconciliation finding1 |
| Current Sandbox | accounts36, balances36, deployments36, strategies206, portfolios2, allocations35, positions6, broker sync2 |
| Current Live | strategies206, portfolios2; other relation absence stays typed |
| Legacy history, Paper | fills435, orders977, account equity20,000, performance20,000, portfolio equity7,464, sizing545 |

All current entities count4,136; source snapshot full **within this local
retained store**, not a complete Trading System catalogue/population proof.
Most observations are2026-09-27 or older. Paper orders were locally observed
2026-10-10 but source `as_of` is null; local observation time is not source
freshness. All three latest profile documents have null source_as_of/PARTIAL.

Latest Paper document:6,321 rows across6 accepted relations,15 relations
`MANAGER_V2_SOURCE_CONTRACT_REJECTED`; Sandbox15/Live17 refused relations
have0 item. Preserve those reasons. Older mirror entities are a **separately
labelled retained observation**, not permission to change source rejection
to AVAILABLE or fresh. Historical fills include malformed1970 timestamps;
flag provenance/coverage rather than silently rewrite.

Mirror history range0; one selected reader remains legacy history. Do not
flip mirror reads or replay/SSE flags because current entity tables have data.
Caches/leases/flights/upstream cursors were not imported.

## Implementation handoff

UDB-03 should introduce a versioned explicit retained-review read profile
independent of live source refresh, with original envelope metadata and
per-panel resource policy. Map available local current entities plus bounded
legacy ranges to named BFFs, not browser relation/SQL/DSN inputs. Query permits
must still resolve current Portal principal/workspace in Core. Approval,
command state and Research RC→R1 remain there, with existing restrictions.

Runtime role is SELECT-only for retained facts, limited DML for ephemeral
cache/query coordination; source/writer activation is not provided by this
phase. Any later refresh activation needs a separately scoped writer identity,
not promoting the current reader role to owner.

Claude keeps rich UI and approved chart/components; source-backed data changes
inside panels only. There is **no changed public DTO to regenerate in UDB-02**.
Typed backend screen contracts will be delivered in UDB-03 before consumer
changes. Empty/stale/unavailable panels must not replace the whole screen or
be represented as numeric0 unless the source actually publishes0.

See [phase report](./phase-report.md) / [storage ownership](./storage-manifest.md).
Private machine receipts include exact counts, metadata, file/table hashes,
final live/restore BFF responses and session revocation; no raw business data
or credentials in this handoff. UDB-04 must qualify combined P23 resources,
cross-loop auth/DR and browser acceptance; preview PASS is not release GO.
