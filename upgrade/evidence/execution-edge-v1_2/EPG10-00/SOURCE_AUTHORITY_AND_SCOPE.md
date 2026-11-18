# EPG10-00 — source authority and scope freeze

Owner: Codex Edge; approval: Bobby, EPG10-00, 2026-10-15. Governing journal:
[unified plan §23.9](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#239-epg10-00-execution-journal--2026-10-15).
This is an inventory, not a release, runtime acceptance or authorization to mutate.
[Machine manifest](source-runtime-manifest.json) pins repositories, interface bytes,
guide revisions, observed runtime and seven separately scoped gate namespaces.
[Verification receipt](verification-receipt.json) records this phase's actual tests.

## Authority and placement

| Domain | Source of truth / writer | Edge / Research boundary |
|---|---|---|
| Economic facts, orders, fills, positions, capital and risk | TS existing execution/economics/admission owners | Read authorized published facts; never recompute money authority or write TS tables |
| PM membership, one alpha owner, assignment and budget | TS PM R2 current-at-commit authority | Verified user membership is independent of workload identity and Portal app roles |
| Human login and app session | Portal trust owner; TS maps verified issuer+subject to immutable user ID | No shared admin token/owner TEXT as effective business membership |
| Publication/capture | TS journal/publication owner, qualified writer and current permit | Reuse committed groups/epoch/filter/retention controls, not MAX(id)/timestamp |
| Projection/checkpoint | Each consumer owns its durable applied transaction | A transport ACK, report version or Portal observation revision is not a source cursor |
| Market data | DL provider-neutral Query/Stream authority; TS approved prices-used | No Redis/DB shortcut or shared TS credentials; separately admitted read routes |
| History, query fanout, score and Archive watch | Research derived read model/shared quant module | Edge minimal transport/read boundary; no heavy analytics in TS trading hot path |
| Workload TLS/JWT | Respective issuer/platform owners | Portal session, mTLS and delegated JWT remain distinct; no insecure fallback |
| Release/rollback and business-policy decisions | Bobby + exact service/domain operator | Inventory permission does not enable a service, native order or all-mode publication |

PM fixed root→portfolio→deployment/internal-account stays intact (no new Book).
Margin/risk budget, economic backing, exposure cap, reservations and collateral are
separate. No global 1× restriction. FUND/RETURN_CAPITAL is not a budget grant or
native transfer. Paper/Sandbox/Live are product design scopes, not interchangeable
evidence. Canary needs an explicitly declared profile; do not invent a fourth
environment enum or claim native qualification from Paper fixtures.

## Source/publication paths reused by the family census

All paths below are repo-relative. Full SHA + relevant file hashes are in the
machine manifest. `TS` = `ts_next`; `PM` = `ts_pm`; `EDGE` = `edge_upgrade`;
`DL` = `dl_closure`; `BE` = `research_be` on SGP. These names identify source pins,
not deployment directories.

| Ref | Actual reviewed implementation / admission | Cursor, lineage, retention and publication disposition |
|---|---|---|
| I | PM `services/portal_execution_owner/identity/human.py`; `services/portfolio_management/membership_repository.py` | Issuer+subject→TS UUID and current human/business revisions; installed current lease/export unknown. No certified source cursor. |
| L | TS `services/portfolio_management/repository.py`; PM `services/portfolio_management/instance_repository.py` | Legacy physical IDs preserved; PM aliases/instances have receipts/revisions/outbox. Source-bound legacy repository rejects uncovered mutations. Candidate revisions/outbox do not establish qualified publication. |
| B | PM `services/portfolio_management/binding_repository.py`, `profile_attempts.py` | Current physical/profile/fence proof callbacks, temporal binding/assignment revisions. Full current P09 registration validation exists; actual provider, atomic pre-send claim, native sender/readback still open. |
| C | PM `services/risk_pool/capital_repository.py` | Caller transaction locks membership/source/profile/capacity. `_record` explicitly `ISOLATED_CANDIDATE_NOT_CAPTURE_CERTIFIED`; capital revisions/receipt ≠ certified replay cursor. |
| K | PM `services/risk_pool/recall_repository.py`, `lock_reallocation_repository.py`, `admission_repository.py` | Exact pending/applied/cancel partitions, lock/trading revisions and current proof callbacks; admission decision alone creates no dispatch outbox. No publication proof. |
| O | TS `services/paper_execution/repository.py`, `domain/source_journal_coverage.py` | Explicit SourceScope only: order/fill/reservation capture in caller transaction. Missing scope is legacy compatibility, not certification. |
| E | TS `services/economics/repository.py`, `services/private_events/repository.py`, `domain/source_journal_coverage.py` | Immutable economic facts/postings and revision-specific positions; private observation/recovery/economic capture in explicit transaction group. Coverage descriptors do not activate a native/external stream. |
| J | TS `services/source_change_journal/{writer,read_source,publication_repository,consumer_repository}.py`; `rust/crates/trading-runtime/src/{logical_replication,publication}.rs` | pgoutput committed groups, durable sink before ACK, continuity epoch/filter/manifest/permit, current revoke lock, retention floor and complete group boundaries. Exact read port is `source_change_publication_paper_replay_v1` / `source_journal_paper_reader`. P16 source-isolated only; external N03 owner accepted=false, runtime_published=false. |
| M | TS `services/portal_execution_owner/manager_facade.py`; EDGE `crates/manager-v2-client` under `services/portal-execution-edge-rs` | Existing catalogue-bound Manager current-page read with `ts_portal_manager_read`, read-only repeatable-read per page, pool1–4, timeout100–5000ms. Per-page as_of/keyset ≠ cross-page historical snapshot or global event sequence. Existing all-profile containers observed, but upstream TLS leafs expired. |
| R | PM `services/portfolio_management/{operator_reports_repository,report_delivery,report_wire,operator_runtime}.py` | Immutable report version/hash/source-cut and bounded transport/HTTP exist, tested isolated historically. `delta_resume_cursor=null`, `consumer_applied_checkpoint=null`; stored transport not applied. Runtime factory explicitly unmounted. All12 report-catalogue entries UNAVAILABLE/NOT_RUN/no enabled environment. |
| D | DL `DATA_LAYER_SERVICE_ACCESS_GUIDE.md`; latest DL/TS journals | Provider→Rust core→Kafka→Query8200/Stream8210→admitted SDK→TS cache; ACK after apply. V1 8100 compatibility is separate. Latest production B14/rc22/stream-isolation rollout observed by journal; final stage100#2 running, not PASS. |
| P | EDGE `crates/{edge-service,authoritative-event-core,projection-store-pg,command-relay}` under `services/portal-execution-edge-rs`; BE `apps/control-api/src/{manager-lists,execution}` | Existing current-page projections/SWR/cursor ladder and source-dark snapshot-tail core. FE pagination bounds and local observation cursor do not prove full history. `edge-service` rejects command relay=true and Manager event ledger=true; flags alone cannot activate them. |
| Q | Pinned SCORE/BE guides in `upgrade/upgrade_v1.2` | Shared Research computation is design authority, not an existing certified exporter. qbts_prb_v1_1 fixed formula/weights/bands; calibration/runtime inputs still pending. Raw q, w*q, AlphaScore composition and direct PortfolioScore remain distinct; Regime is descriptive, not a multiplier. |

### Complete guide-family census (39/39)

`M?` means only existing catalogue-bound current data can be considered, after
re-deriving the mapping and restoring TLS; it never certifies the requested full
semantic/history contract. `J-dark` means source substrate exists but actual
accepted external publication is absent. `PM-U` means candidate components exist
but qualified export/current authority is unproven. `Q-U` is derived Research work.
All unknown retention durations require the owning producer's exact business
history/retention contract before replay acceptance; no durations are invented.
Every row inherits the current identity/ACL and archive rules, never all-table SQL.

| # / logical family | Writer/admission refs | Identity / lineage / history truth | Published read → intended consumer; affected owner |
|---|---|---|---|
| 01 User identity mapping | I | Stable TS user ID, issuer/subject lifecycle; current lease uninstalled | PM-U → Research authorized mirror; TS identity |
| 02 Portfolio registry | L/I | Portfolio/root ID, legacy vs PM revision explicitly separate | M?/PM-U → manager registry; TS registry |
| 03 Portfolio membership | I | User+portfolio+grant, effective/revoke/delegation revision, no owner TEXT | PM-U → scoped Research ACL; TS membership |
| 04 Alpha registry | L | Alpha ID/schema/aliases, active+archived; full continuation not proved | M?/PM-U → Research catalogue; TS registry |
| 05 Alpha ownership | I/L | Exactly one owner, temporal attribution; no historical rewrite | PM-U → Research ownership; TS PM |
| 06 Deployment registry | L/B | Instance/deployment ID, account/alpha/portfolio/mode/profile and revision | M?/PM-U → Research registry; TS registry |
| 07 Internal accounts | L/B | Account/currency/scope and lifecycle; do not conflate physical account | M?/PM-U → Research accounts; TS registry |
| 08 Venue physical account registry | B/L | Existing venue registry PK, redacted profile/verification refs; no credentials | M?/PM-U → authorized manager; TS venue owner |
| 09 Account binding | B | Binding/assignment/profile revisions and effective interval | M?/PM-U → temporal attribution; TS PM |
| 10 Root capital limit | C | Root cap/current authority revision; never infer from equity | PM-U → Research observation; TS capital |
| 11 Economic capital assignment | C/E | Exact FUND/RETURN_CAPITAL vs attribution; source-cut/correction required | PM-U/J-dark → Research ledger; TS economics/PM |
| 12 Budget entitlement | C | Grant/committed/free/deficit and parent availability; not backing | PM-U → Research budget read; TS admission |
| 13 Execution grant/reservation | O/K | Intent/order/reservation revision, remaining/unknown obligations | M?/J-dark → Research execution; TS risk |
| 14 Administrative locks | K | Lock scope/inheritance/create/release revisions; no implicit expiry | PM-U → manager lock view; TS lock authority |
| 15 Recall requests | K | Exact requested/applied/pending/cancelled with blocker lineage | PM-U → manager recall history; TS capital |
| 16 Trading state | K/O | Current+ancestor ACTIVE/REDUCING/HALTED authority revisions | PM-U/J-dark → operator observation; TS admission |
| 17 Order intents | O/E | Immutable intent/actor/scope/idempotency/disposition | M?/J-dark → Research execution history; TS execution |
| 18 Obligations/unknown execution outcomes | O/E/K | Unknown→resolved recovery lineage; timeout never releases authority | M?/J-dark → reconciliation/operator; TS risk/execution |
| 19 Orders/execution status | O/E | Native/client/order IDs and exact transition/correction provenance | M?/J-dark → Research blotter; TS connector/execution |
| 20 Fills | O/E | Canonical source fill ID, order/account, exact qty/fee/time/corrections | M?/J-dark → Research fill history; TS economics |
| 21 Positions/episodes | E | Revision-specific identity, economic scope/true-flat/episode finality | M?/J-dark → Research replay; TS economics |
| 22 Balances/collateral | E/B | Verified venue snapshots with observation time; sampled not exact history | M?/J-dark → manager balances; TS venue/risk |
| 23 Fees/funding | E | Effective+recorded timestamps and late adjustment/reversal linkage | M?/J-dark → Research economics; TS accounting |
| 24 Accounting postings/corrections | E | Immutable fact/posting legs/currency/correction; no overwrite | M?/J-dark → Research accounting; TS accounting |
| 25 Economic journal | E/J | Committed groups/source epoch, exact economic lineage not MAX(id) | J-dark → Research fact mirror; TS accounting/publication |
| 26 Valuation/prices used | E/D | Approved source price/time/FX policy; USD ≠ USDT | M?/J-dark/D admitted only → reports; TS valuation/DL |
| 27 Risk state/limits | K/O | Capacity/exposure/limit policy/current source version and stale reason | M?/PM-U → manager risk read; TS risk |
| 28 Reconciliation | E/B | Durable run/break/resolution/checkpoint refs; full coverage unknown | M?/J-dark → Research ops; TS reconciliation |
| 29 Command receipts | C/K/P | TS durable result/amount/CAS/idempotency, not network success | PM-U; Edge relay denied → authorized operator; TS command |
| 30 Operational audit | I/C/K/E/P | Action authority owns actor/auth revision/result, redact payload | M?/PM-U/J-dark → authorized audit; respective actor owner |
| 31 Publication catalogue/manifest | J | Immutable schema/catalogue/qualification/manifest, mutable access fence | J-dark → Edge/Research; TS publication |
| 32 Sync health/cursor/retention | J/P/D | Each hop owns source vs delivered vs applied checkpoint; exact retention floor | Existing ops metadata only; new replay unverified → operators; each hop |
| 33 Recovery/quality events | E/J/P/D | Gap/quarantine/restore/resync/finality/restatement provenance | Partial ops, full semantic publication unverified → Research; each owner |
| 34 Report snapshots | R/Q/P | PM report hash/version exists; Research rebuildable model ≠ money authority | PM-U/Q-U → three fixed views/Research; PM+Research |
| 35 QBTS per alpha | Q | Raw F(P/R/B), six metrics, sizing/cost/economic source set and binding | Q-U → Research module; analytics owner |
| 36 Manager AlphaScore | Q/C/I | sum(w*q), full economic denominator including missing q, ACL-safe | Q-U → Research manager; analytics+PM |
| 37 PortfolioScore | Q/E | Direct portfolio/unique consolidated NAV, own ledger/FX/cost/flow dedupe | Q-U → Research module; analytics+economics |
| 38 Regime fit | Q | Exact run/binding/reference/no-lookahead version; not score/probability | Q-U → Research descriptive output; analytics |
| 39 Archive paper-watch | Q/P | Archived alpha authorized paper run/watch policy, stop/gaps/decisions | Q-U, no live promotion → Research workflow; Research ops |

Additional discovered interfaces are not silently omitted: (a) PM report wire
codec + transport-stored receipt (R); (b) current P09 profile egress registration
and native-attempt preparation (B); (c) provider feed-health and source-local
recovery/readiness metrics (D). They retain independent authority and publication
gates; none adds an activated endpoint in EPG10-00.

The historical 96-relation pack is **not** current completeness proof. TS journal
records six source-file drifts in old ts-oc-03a mapping; re-derive semantic mappings
before rehash/acceptance (EPG10-02). Do not replace hashes to turn that red pack green.
Migration48's deferred membership is not fixed by assuming candidate PM tables applied.

## Permission manifest and actual observations

| Operation | This phase | Exact boundary / proof |
|---|---|---|
| Source Git/rules/config interface inspection | Allowed, read-only | Separate feature worktree, pinned peers; preserve dirty/untracked changes |
| HK Docker metadata/public cert inspection | Allowed, read-only escalation | Default sandbox sudo blocked; escalated metadata succeeded; never dumped environment/secrets |
| SGP source/runtime metadata | Allowed, existing strict pinned SSH | Existing private known_hosts/key unchanged; no host-key bypass or trust edit |
| DB target/applied-schema inspection | UNKNOWN / not exercised | No business rows or credential reads; current target metadata/ledger receipt required from TS/platform before DB-dependent acceptance |
| Workload auth/business membership | Separate; not provisioned/verified here | Existing mTLS/JWT read boundary ≠ current user/business lease; PM factory unmounted |
| Any source DB/Redis write, migration, native order, relay | Not authorized by EPG10-00 | No arbitrary SQL/table/Redis workaround; CLI wrapper not a business-authority bypass |
| Service restart, certificate rotation, release/cutover | Not authorized by EPG10-00 | Concrete TLS fault reported; existing service/image/config unchanged |
| Build/cargo/pytest/load/containers | Not run | Active foreign measurement lock; only low-cost metadata/offline standard-library assertions |
| Git push/merge | Not requested; not performed | Coherent local phase commit only |

Fresh public certificate metadata shows HK issuer-server and facade-server leafs
expired **2026-09-27T03:40:51Z**. They are mounted by all three Manager profiles;
the valid Edge/Proxy/SGP certificates do not repair those upstreams. No handshake,
upstream read, route qualification or certificate renewal is claimed. Healthy
Edge/Proxy processes are not business-path acceptance. Trust inventory is metadata
only, never copied private keys, JWT values or DB DSNs.

Current runtime is independent of current source: HK Edge OCI revision8814cd2…
under releasea9b10385…; SGP stable releasee4fd9365… while source main53316263… .
Exact full revisions/image IDs/config hashes/services are in the manifest. Runtime
Manager images lack an OCI revision label; do not guess their source commit from
their historical, now absent compose worktree. `docker inspect` still references
`/home/bobby/.worktrees/trading-system-portal-execution-owner-v2`, but that path no
longer exists. This is a reproducibility dependency for its runtime owner, not a
reason to recreate a historical deployment worktree. Current source work must use
canonical TS and immutable runtime release identity instead.

## Decisions and dependencies (DEC-E01…E15)

Detailed approved design and decision questions remain in [plan §23.6](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#236-decision-and-external-dependency-register).
Phase00 dispositions below freeze inventory, not deployment approval.

| ID | Phase00 disposition / owner | Affected gate and independent next work |
|---|---|---|
| E01 | Read/base + local/Demo evidence first; all-mode design retained. Bobby/release owner | No new Live activation; scoped 01/02 preparation possible after approval |
| E02 | Verified TS user/business lease absent; Portal and TS trust owners | New PM reads/mutations requiring membership unavailable; offline auth/contract fixtures possible |
| E03 | P16/N03 source-dark; PM export unqualified; TS/PM publisher | New authoritative feed not accepted; 02 derive catalogue from current sources |
| E04 | Reuse existing journal/pgoutput substrate, proof not inherited; TS+Edge | 03 commit-order/barrier/capture tests need exact isolated DB target |
| E05 | Minimal Edge, heavy Research; placement not measured; Edge/Research ops | 01 capacity worksheet/harness, no service move |
| E06 | No resource improvement measured; Edge+DL ops | 01/06 paired budgets, no numeric claim |
| E07 | Per-family duration/archival unknown; TS/PM+Research | No history deletion/full-history claim; 02 schema can encode honest unavailable |
| E08 | Current source/report/transport/applied revisions distinct; each hop | 02 contract and 01 cadence/revoke budget design |
| E09 | Runtime explicitly refuses command relay; TS command+Edge | 07 code/authority prerequisites, no flag-only enable |
| E10 | HK upstream issuer/facade leafs expired; runtime PKI owner | Blocks dependent real Manager transport; 08/operational repair requires exact approved change scope |
| E11 | PM economics unchanged; advanced report methods unavailable; PM+analytics | Math/oracle contracts independent of unqualified runtime outputs |
| E12 | No rollout/recovery performed; release operator | 10 needs exact approved release target and rollback package |
| E13 | Fixed qbts_prb_v1_1 design accepted; numeric calibration absent; analytics+Bobby | Numeric production pending, not independent absolute/economic reads |
| E14 | Archive catalogue/history distinct from scheduled watch; Research ops | No new watch job; 02 can define status/lineage |
| E15 | Latest N1/DL journal supersedes old F1 narrative; TS/DL+Edge | Stage100#2 RUNNING; no load during lock, no global block on unrelated offline contracts |

Actual peer changes in this audit: DL advanced f7ea809…→864774d…; Research FE/docs
92713bd…→5f3f233… . Re-read affected journal/contracts and pin end state, never
reset peers. Screenshot-only later FE dirty state is recorded independently and
does not certify or invalidate financial business logic without a relevant diff.
Five guides were uploaded concurrently to the SGP Research docs worktree. Four
match the approved Edge/BE/Review/Score byte pins; the formerly missing UX companion
is now discoverable there (`0858d989…`), but is newly untracked and was not read or
adopted as authority in this backend inventory. Its location and full digest are
recorded, not treated as a reviewed UX requirement or a reason to expand phase00.

## Exit and next permitted work

Inventory can close with **explicitly owned UNKNOWNs**, as the guide's phase00
exit permits. It cannot mark their dependent runtime gates PASS. Required returns:

| Owner | Required evidence | Blocks | Independent work |
|---|---|---|---|
| TS publisher | Owner-accepted exact dataset/profile/manifest/permit, endpoint identity and real read+retention receipt | External authoritative feed and replay | EPG10-02 schema/fixtures; source-as-is mapping |
| TS/platform | Actual target metadata + applied migration ledger; no candidate-SQL inference | DB-dependent capture/source qualification | Offline catalogue/migration inventory |
| PM/TS identity | Mounted current human/workload/grant providers + qualified report export and delivered/applied checkpoint | PM-dependent trust/export/commands | Fixed codecs/envelopes/negative fixtures |
| HK runtime PKI/release owner | Approved narrow renewal/roll/revoke/rollback package and real read proof | Manager real transport | Offline contracts; no insecure fallback |
| TS runtime release owner | Immutable Manager source/build provenance and deployable config outside absent historical worktree | Reproducible future Manager rollout | Current source review; do not recreate old worktree |
| Research owner | Current consumer mapping, applied receipt, approved restricted-field policy and companion revisions | Research integration/restricted release | 02 fixtures, 01 sizing/harness design |
| TS/DL measurement owner | Terminal stage100 receipt + clean shared-host window | Heavy tests/capacity/coexistence claims | Metadata/docs/low-cost assertions |
| Analytics owner | Immutable runtime calibration/input coverage/config approval | Numeric score/watch publication | Fixed formula/schema/oracle preparation |

EPG10-01 and EPG10-02 become eligible **only when Bobby approves each**. No new
runtime/product code was changed by phase00. This is not completion of the other
94 EPG10 cases, full DB, P lanes, XLC, HA or Sandbox/Live qualification.

No test containers, images, build cache, rows, ports, credentials or runtime state
created. Shared images/cache and all operational/rollback containers retained;
no pruning during the active foreign campaign. Existing historical rollback
directories are not declared qualified rollback releases merely because present.
