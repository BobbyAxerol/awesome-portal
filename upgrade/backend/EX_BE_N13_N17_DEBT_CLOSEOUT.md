# N13B–N17B Debt Closeout

**Date:** 2026-08-30  
**Decision:** `MERGE_READY / PRODUCT_RUNTIME_INACTIVE`  
**Accepted baseline:** `N17B_EXACT_CURRENT_SET_ACCEPTED / PAPER_PRIVATE_QUERY_QUALIFIED`  
**Runtime truth:** `SIGNED_PRODUCT_IMAGE_NOT_PUBLISHED / LIVE_MUTATION_INACTIVE`

## 1. Purpose

This closeout prevents N13B–N17B contract acceptance from being mistaken for
product activation. It is the single debt register for the source-as-is
campaign. A historical phase report remains evidence; it is not another active
backlog.

The review covered the canonical unified plan, backend index, architecture
tracking, shared frontend/backend tracker, N13B–N17B reports and executable
tracking gates. It also reconciled Claude's latest request, BR-EX-67, into the
canonical request ledger.

## 2. Classification rule

| Class | Merge rule | Runtime rule |
| --- | --- | --- |
| `MERGE_BLOCKER` | must be closed before this branch may enter `dev` | never waived by a feature flag |
| `ACTIVATION_BLOCKER` | may merge while the relevant profile/route/flag stays off | must close before the named capability becomes product-visible |
| `FUTURE_CONTRACT` | absence is an honest current-source limitation | keep typed unavailable until a versioned source/adapter exists |
| `DELIVERY_BACKLOG` | product work, not hidden technical debt | scheduled through BR-EX; no fixture may be presented as real |

No `MERGE_BLOCKER` remains open after this closeout. That statement does not
authorize a dev deployment, registry promotion, source flag, SSE profile,
Sandbox/Live read or command.

## 3. Debt closed in this change

| ID | Finding | Resolution | Status |
| --- | --- | --- | --- |
| `TD-CL-01` | BR-EX-67 existed only on Claude's planning branch | imported the full R1/R2 evidence and policy-verdict request into §7.2/§7.9 of the canonical unified plan; next request is BR-EX-68 | `CLOSED_IN_DOCS` |
| `TD-CL-02` | N13 status still said it was waiting for N14B after N14B–N17B had closed | replaced the stale dependency with `CURRENT_SOURCE_SET_PINNED / PROFILE_RUNTIME_DARK` in canonical tracking | `CLOSED_IN_DOCS` |
| `TD-CL-03` | the shared tracker still said “N17B is next” | replaced it with the exact accepted/read-qualified/runtime-dark boundary | `CLOSED_IN_DOCS` |
| `TD-CL-04` | product phase 18 looked globally blocked despite accepted private Paper transport | split accepted private-path evidence from remaining product activation/soak evidence | `CLOSED_IN_DOCS` |
| `TD-CL-05` | N01–N12 ideal-contract wording could be read as reopening N17B | recorded that those phases remain the future ideal-source lane and are not blockers for the exact current Paper set | `CLOSED_IN_DOCS` |
| `TD-CL-06` | N17B had no single residual-debt pointer | this register is linked from the N17B report, canonical plan, architecture guide, backend index and shared tracker | `CLOSED_IN_DOCS` |

## 4. Open activation debt

These items are intentionally open and fail closed. They do not block merging
the tested N13B–N17B implementation into `dev` because every corresponding
product/runtime switch remains off.

| ID | Severity | Exact debt and current containment | Owner | Must close before | Status |
| --- | --- | --- | --- | --- | --- |
| `TD-EX-01` | P0 | N20 publishes 23 canonical workspace/resource-scoped screen contracts for BR-EX-41…71 and retires both raw browser current-source routes with typed HTTP 410. Manager relation selection remains server-only behind Rust compatibility authority. | Codex | closed before first product-visible Paper screen route | `CLOSED_N20` |
| `TD-EX-02` | P0 for multi-replica | N21 adds DB-clock, row-locked source/profile admission and expiring leases in both cells. SGP BFF uses Control PostgreSQL; AWS-HK Rust Edge uses projection PostgreSQL. Short cache/coalescing is workspace/principal/profile/adapter/request scoped and ambiguous dispatch is never retried. | Codex | closed before multi-replica source activation | `CLOSED_N21` |
| `TD-EX-03` | P1 | N19 added the digest-bound Rust Manager compatibility authority for all 96 N18 relations, five sealed GET primitives, exact profile/resource/revision binding, catalogue/key/cursor validation and adapter rollback. TypeScript now retains only narrow BFF/product policy. | Codex | closed before broader current-source expansion | `CLOSED_N19` |
| `TD-EX-04` | P0 | No signed Control API product image containing N17B has been published or deployed; registry and Paper product flags remain off. | Codex + Bobby | dev Paper activation window | `ACTIVATION_BLOCKER` |
| `TD-EX-05` | P1 | Closed by N24: the exact Manager-v2 current source now feeds a durable, fenced, replayable Paper/Sandbox/Live Portal projection with retained rollback and restore-qualified cleanup. N25 owns query/analytics exposure, not missing durability. | Codex | N24 | `CLOSED_2026-08-30` |
| `TD-EX-06` | P0 | The 25/25 private transport probe is not a post-deployment product SLO/load/fault/soak result. No production error budget is claimed. | Codex + Bobby | marking the selected product screen `PRODUCT_COMPLETE` | `ACTIVATION_BLOCKER` |
| `TD-EX-07` | P1 | Sandbox and Live profile code/templates exist, but only Paper is deployed and qualified for the exact N17B read set. An empty Live result is evidence of reachability, not product coverage. | Codex + Bobby | each Sandbox or Live read-profile activation | `ACTIVATION_BLOCKER` |
| `TD-EX-08` | P0 mutation | `live.emergency-close` is compatibility-accepted only. No public command route, command transport or Live mutation is active; Account/window/identity/approval and terminal verification remain separate gates. | Codex + Bobby + Trading System owner | first real command source call | `ACTIVATION_BLOCKER` |

## 5. Future-contract limitations

| ID | Current truth | Required replacement/extension | Status |
| --- | --- | --- | --- |
| `TD-FC-01` | No authoritative Trading System Event interface is accepted. | Publish a versioned owner event source, or expose snapshot changes only as `PORTAL_PROJECTION_DELTA`; never label them owner realtime events. | `FUTURE_CONTRACT` |
| `TD-FC-02` | No accepted owner Artifact reference source exists. | Add digest/schema/size/access/expiry-bound references behind the Artifact interface. | `FUTURE_CONTRACT` |
| `TD-FC-03` | Gateway market-latest and Historical/QDL adapters are mapped but not active; venue calendar is absent. | Qualify each source independently with declared authority and freshness; no cross-use of historical data as realtime trading truth. | `FUTURE_CONTRACT` |
| `TD-FC-04` | Five additional command primitives are supported-but-inactive and three N12 commands are source-absent. | Add only semantically equivalent, target-scoped adapters; unsupported commands remain absent/typed unavailable. | `FUTURE_CONTRACT` |
| `TD-FC-05` | N02–N08/N11 ideal v2 source, owner Event/Artifact and full catalogue work exceed the accepted current Paper set. | Adopt future owner revisions behind new adapter versions without changing stable Portal output contracts. | `FUTURE_CONTRACT` |

## 6. Delivery backlog is not technical debt

BR-EX-41…67 contains product payloads, analytics, screen APIs and governed
commands requested by the approved UI. Those rows are real delivery scope, but
they are not evidence that N17B failed. They must be deduplicated against
existing N09–N12 contracts and delivered in a new backend campaign from the
updated `dev` branch.

N19 closed `TD-EX-03`; N20 closed `TD-EX-01` with canonical
workspace/resource-scoped screen contracts and explicit typed-unavailable
branches. N21 closed `TD-EX-02` with dual-cell shared admission. Signed dev
publication and post-deploy `TD-EX-06` evidence remain later explicit gates
rather than N20 debt.

## 7. Merge and activation decision

### Merge to `dev`

Allowed after this closeout's tracking, link and workspace gates pass. The
merge carries code/contracts that remain fail-closed by default. Bobby retains
merge authority.

### Not authorized by this closeout

- merge or release to `main`/stable;
- registry `delivery_profile` or `data_mode` promotion;
- enabling current-source Paper/Sandbox/Live product flags;
- SSE/Event/Artifact publication;
- command relay or Live mutation;
- new AWS-HK or Trading System changes.

### Next backend campaign

Start a new branch from the updated `dev` after frontend/backend integration.
Deliver the resource-scoped Paper screen API, Edge-global admission policy and
canonical Rust compatibility route first. Product activation and post-deploy
soak are a separate bounded dev window, not an implicit effect of merge.
