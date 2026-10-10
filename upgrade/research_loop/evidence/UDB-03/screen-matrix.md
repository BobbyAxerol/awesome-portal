# UDB-03 operation → rich panel → scope → state/permission → browser matrix

All source reads use Core session+current access and the fixed retained
workspace; Paper/Sandbox/Live use their exact server-bound profiles. No public
source-selector/credential inputs. The alias registry covers54 current-data
operations; this matrix groups them by existing product need, not new routes.

| Product route / panel | Named BFF / local source | Scope / truthful state | Action / browser assertion |
|---|---|---|---|
| `/execution` | `execution/command-center` | Core workflow workspace, separately authorised retained source profiles; source stale/partial | GET only; workflow/catalog truth not source approval;1280/660 |
| `/deployments/alphas` | `execution/alphas`; equity-sparklines | All206 unique; Paper48 projection rows; exact list cursor/filter | Read; pagination stays scope-bound, stale badge;1280/660 |
| Alpha360 Overview | resources/alphas/{id}, query-analytics, stage-drift | source strategy/deployment/allocation/current rows + bounded legacy history | Read/query, no eligibility inferred;1280/660/deep link |
| Alpha360 Insight Charts | query-analytics; views/equity-chart | exact retained UTC/decimal/currency partitions; unavailable if not captured | Data/coverage inside approved chart, not whole-screen envelope |
| Alpha360 Trade Replay | resources/alphas/{id}/orders + fills; named current order/bracket/conditional aliases | observed current/history, not authoritative event replay; missing legs remain typed | No source cursor/execution mutation; tab navigation |
| Alpha360 Positions | resource current positions | captured Paper/Sandbox or unavailable profile fact | Real zero distinct absence |
| Alpha360 Orders & Fills | subject activity + named aliases | legacy orders977/fills435 retained total, subject-scoped paging | Exact counts/continuations, no total TS-history assertion |
| Alpha360 Risk | named sizing/risk aliases + decision/chart query | captured range or panel-local uncaptured | No approval/risk-live requalification |
| Alpha360 Sessions | execution-sessions alias | bounded2,000 current observations, not all historical sessions | Read; page size≤200 and response≤1MiB |
| Alpha360 Accounting | performance/equity fields | source decimal/currency, source clock nullable | No float coercion/missing→0 |
| Alpha360 Reconciliation | named reconciliation/broker sync aliases | captured earlier facts / missing typed | Stale/partial and static profile |
| Alpha360 Audit | command-journal / observed timeline | retained observations; no source event global ordering/ACK | No command button activated |
| `/deployments/portfolios` | execution/portfolios |2 retained list items with environment scope | Read;1280/660 |
| Portfolio360 Overview | resources/portfolios/{id}, query-analytics, equity-chart | allocation/current data + bounded portfolio range | Read/query; STALE chart preserves partial reason |
| Portfolio360 Structure & Correlation | correlation / cross-equity local BFF | DERIVED existing formula and exact input coverage; no FX/benchmark invention | Scope and source metadata preserved |
| Portfolio360 Capital Ledger | capital-ledger + static alias | unavailable when not captured, not fabricated empty | Read only; no source fallback |
| Portfolio360 Approvals/Incidents/Audit | existing Core/source composers | Core authority distinct source facts; no fake portfolio policy | No mutation; existing rich tabs preserved |
| `/deployments/accounts` / Binding detail | broker-bindings/list/detail; resource accounts | Paper139/Sandbox35/Live0 imported list; relation absence remains separate | Read; wrong binding/profile404, cursor400 |
| Paper overview/workbench | screens/paper + deployment projections | retained accounts/deployments/order/history panels | Six-panel v1/v2 compatibility, stale/partial |
| Sandbox overview/account | screens/sandbox/accounts | real accounts36/balances36/deployments36 + bounded current facts | No source rejection rewritten as acceptance |
| Live overview | screens/live | retained strategies206/portfolios2; transaction rows uncaptured | Typed absence rather than fake generic/unrelated unavailable |
| Canary | existing canary detail/composition | existing Core envelope authority only; no new approval/activation | Read-only policy, no claimed active Canary |
| `/deployments/blotter` | screens/blotter; subject order/fill activity | exact captured rows,200-row paging, provenance/1970 anomaly preserved | No sorting repairs of source clocks |
| `/execution/operations` | Core queue + operational compositions | source observation health attached only after read permission | No resolve/retry command execution |
| `/governance/approvals` / waivers | existing Core composers | Core membership/roles unchanged | No source workspace substitution |
| Research RC → `/governance/approvals/{id}/r1?workspace_id=…` | research publication + existing R1 | original Research/Core workspace on deep link and reload | No chained R2/Canary/Live conclusion |
| `/administration/actions` | commands/catalog/tasks + activation/capabilities | existing Core catalogue; source flags/mutation disabled | Read metadata is not execution authority |
| All54 static current aliases | manager/current/{checked-in alias} | PARTIAL retained rows or typed UNAVAILABLE, source_as_of nullable | Actor/operation/profile/revision/page-size/expiry-bound signed cursor |
| Review context | execution/retained-review (generated new DTO) | original refused source separate from earlier captured rows | **READ/GENERATED; new consumer pending Claude** |
| Realtime bootstrap/stream | existing profile and CC paths |204 no cursor, direct stream404 disabled | No EventSource/no heartbeat/upstream; context consumer pending |

Browser actual packet covers18 deep-link routes +16 resource tabs at two
widths =68 cells, including RC/R1 reload. A nonblank route is not proof every
new field is consumed. UDB-04 must freeze consumer coverage and exact candidate;
the new context/action controls and static-poll optimisation are in
[Claude's handoff](./handoff.md), not falsely declared verified here.
