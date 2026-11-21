# ELP2-00 — Baseline coverage và quyết định

**Verdict: BASELINE_AUDIT_COMPLETE / READY_FOR_BOBBY_REVIEW.**
8/8 audit checks PASS trong phạm vi dưới đây; **owner acceptance PENDING**.
Đây không phải V2 implementation/runtime certification hoặc quyền mở phase01.

## 1. Goal, authority và approved scope

Bobby giao ELP2-00 ngày2026-10-16 Asia/Saigon: bám Unified/guide, đúng scope,
test phù hợp và báo cáo theo rules. Goal: chọn đúng source/runtime baseline,
kiểm coverage/authority và quyết định trước khi contract work bắt đầu.

- Integration: `/home/bobby/portal-research`, `docs/research-loop-plan`,
  `be56efdf8a44b0fd8cd44202b04ada582293a1dd`. Không đổi nhánh/worktree/ref.
- Entry đã có AGENTS/CLAUDE/Unified edits từ onboarding/planning và untracked
  guide directory. Giữ nguyên các edits đó, supplied guides/images và code Claude.
- Allowed: local source/docs và SSH read-only đúng HK; selected Docker metadata,
  host inventory; ghi packet/Unified local. Không read full env/credentials.
- Excluded: application/frontend/schema edits, authenticated business GET,
  DB query/write/test/build/migration/restart, source/command/SSE activation,
  credentials/TLS, remote writes/push/merge/dev/main/release/deploy.
- Risk: audit nhầm old journal/current source hoặc branch/runtime; mitigation
  bằng exact pins/dirty diff hashes/observation windows và UNKNOWN có owner.
- Rollback: docs/evidence revision bổ sung, giữ history; **không có runtime
  rollback** vì không đổi runtime. Không checkout/reset để bỏ edits người khác.

## 2. Inputs và deliverables

Read the applicable Portal guide §2/§7/§15 ELP2-00/§17, Edge/UX/Score/Review
bundle, feasibility, two supplied lowfi images, current PM R2 guide/journals
trong PM worktree, prior source/planning receipts và shared agent rules.
Guide/image hashes byte-identical trong source census. Full parallel prompt
companion và numerical receipt/script companion chưa được cung cấp; không
dùng historical numerical results làm current PASS. Không blocker cho audit.

| Artifact | Nội dung / authority |
| --- | --- |
| [baseline-manifest.json](baseline-manifest.json) | Exact local refs/dirty state, HK source/journal pins, observed image/profile identities, unknowns/owners, resources |
| [source-census.json](source-census.json) | Per-route controller/handler/guard/registration/OpenAPI map;96 legacy relations; source/guide digests |
| [audit-source.mjs](audit-source.mjs) | Repeatable read-only AST/JSON census; no application imports or writes |
| [coverage-and-route-map.md](coverage-and-route-map.md) | Existing/change/new route surfaces,14 business families, source/target/runtime separation and impacted-test handoff |
| [decisions-and-handoff.md](decisions-and-handoff.md) |11 XLC,15 decisions,5 canonical requests, exact backend/Claude next scope and acknowledgement state |
| [validation-results.json](validation-results.json) | Final focused packet verification; named audit gates, scope and limitations |
| [Phase template](../../PHASE_PACKET_TEMPLATE.md) | Requirement→contract/source→test/receipt→exit template for future approved phases |

## 3. Findings that affect the next implementation

1. **Research contains local main/dev history, but is not deployed stable.**
   Graph main/dev→Research:0 missing /795 ahead. Local origin tracking430
   ahead, no fetch or remote freshness assertion. Stable control/web OCI pin
   matches tagv1.1.1 (`e4fd9365`), despite legacy container namev1-0-1.
   Preview image IDs match saved identity045788b1 and asset
   `index-SniIVI8p.js`; this is not current be56HEAD source certification.
   Dev deployed source is UNKNOWN (image has no revision label).
2. **HK active upgrade source is not the running Edge artifact.** TS advanced
   6e0244d6→e8cd7b7c during the audit and remains dirty. PMd16aa2b5 and
   DL0ffdae26 separately pinned. Edge runs OCI8814cd2a; Manager image source
   remains UNKNOWN because its Compose-labelled worktree is absent on HK.
   Do not deploy from the label or call the absent directory clean.
3. **No blanket upstream readiness.** N1 final stage100#2 journal reports
   G2/G4/G7/G8 FAIL; source G7 fix has no replacement measurement inspected.
   PM human trust integration pending, fresh rehearsal/four PG probes are not
   deployed full-campaign proof. Don't launch loads on TS/DL under active repair.
4. **Existing reusable coverage is substantial, not a V2 contract.**112 routes
   (84GET/28POST),96 relations/54 named aliases,79 direct OpenAPI matches.
   33 unmatched includes2 intentionally retired raw-source routes. Detailed
   route/family gaps have owner and destination, not a generic request to TS.
5. **Policy and economic semantics need explicit contracts.** Current admin
   delegation rejects `administration.*`; Fleet grain, researcher owner mapping,
   cache field-policy revision and full authorized totals are not proven V2.
   Preserve old guards until scoped replacements are tested. Score formula is
   fixed; runtime calibration/config is not supplied. No invented0 or numbers.

## 4. Requirement → evidence → exit tests

All results are **audit/static checks**, not new application/browser/load tests.
The final verifier also checks packet links, JSON, source hashes and diff scope.

| Guide test | Result | Method / evidence / limit |
| --- | --- | --- |
| ELP2-T00-01 | PASS | Git full SHA/status/ref graph + local/HK guide/diff hashes; manifest records dirty and non-atomic parallel-source observations |
| ELP2-T00-02 | PASS | AST census112 routes, DynamicModule registration, guards, uniqueness,79spec matches/33dispositions,96/54 classification partition; no missing parser warnings |
| ELP2-T00-03 | PASS |14/14 required business families mapped to source/target gap/reason/owner/next phase; **not14 runtime-qualified publications** |
| ELP2-T00-04 | PASS | Direct allowlisted Docker image/revision/profile metadata vs Git/tag/Compose path; actual DB schema/TLS explicitly UNKNOWN, not guessed |
| ELP2-T00-05 | PASS | Historical receipts separated from current audit/new runtime proof; no duplicated test totals or automatic V2 receipt reuse; future reuse requires dependency impact review |
| ELP2-T00-06 | PASS | No runtime/config/service/source/command changes; current Edge relay false/source code rejects true; retained preview observed; no implicit Live activation |
| ELP2-T00-07 | PASS | Namespaced capacity/recovery/runtime distinctions; **current N1 journal**, not stale F1 assertion; PM narrow fresh/test probes do not become full campaign/trust PASS |
| ELP2-T00-08 | PASS | Research branch ancestry plus separate stable/preview/HK artifact identities; no claim Research HEAD is deployed Execution baseline |

Initial audit-tool attempts failed for wrong registry path and incomplete
DynamicModule handling; both fixed in the audit script before final census.
One sandbox subprocess Git run returned EPERM; explicit read-only escalation
succeeded. Full identity-file read was disallowed by approval review; no bypass:
approved allowlisted provenance fields supplied required pins instead. No
secret/full environment dump is included in packet.

**Not run:** app unit/integration/DB/browser/engine/load/DR/calibration, build,
OpenAPI regeneration, ELP2-01…11/UXM tests. Not impacted by audit-only changes.
No old PASS is promoted to fresh PASS. Normal build/DB commit hook remains
PENDING under the scoped read/docs-only rules; no bypass and no commit claimed.

## 5. Exit, debt và readiness boundaries

- Baseline inventory/deliverables/test-template: COMPLETE within assigned audit.
- Scope/authority owner review: **PENDING_BOBBY_REVIEW**; no OWNER_ACCEPTED claim.
- Decisions: selected design invariants recorded; exact recovery, Stan ceiling,
  researcher fields, export/retention/resource profiles, command matrix and score
  runtime config remain pending with owners in decision register. A pending
  decision blocks only its activated dependent feature, not schema drafts.
- Contract/schema/generated DTO/fixture delivery: NONE in this phase. Existing
  source reused by inventory only; runtime qualification/FE acceptance NOT_EVALUATED.
- New requests: ELP2-REQ-00-001…005 OPEN; acknowledgement/verification pending.
  No existing Research/Governance request silently closed; none newly received
  FE→BE during this audit. No waived source gaps or runtime activation requested.

## 6. Parallel work, resources và cleanup

Primary read guides/rules first and owned all shared docs/scripts/integration.
Two bounded **read-only** agents: `elp2_routes` audited controller/spec/policy
reuse; `elp2_decisions` audited XLC/DEC/readiness. Both forbidden writes/builds/
runtime changes. Primary reviewed source locators and reran independent AST
census, which resolved wildcard and exact retained-controller route counts.
No duplicated test coverage counted; agents are finished.

One Portal-host inventory observation: root available169,411,964,928B (~25.4%),
RAM available12,614,066,176B; Docker reported build-cache195.9GB /62.97GB
reclaimable, image88.82GB /74.4GB reclaimable. These are Docker-reported
categories, **not additive disjoint savings or a load/capacity PASS**.
See manifest. No TS/DL load/probe/write or new local container/image/volume.
Audit CPU/RSS not separately measured; only short local parses/metadata reads.
Cleanup **NO_ACTION_NEEDED_FOR_PHASE**; no background job remains. Existing
`C4-GOV-CAPACITY-01` named cache inventory follow-up stays separate; no prune.

## 7. Closeout / next assignment

| Lane | What can proceed next | Approval / delivery level |
| --- | --- | --- |
| Backend | **ELP2-01** authority/resource/availability/PM/score schemas, compatibility and canonical FX fixtures with pending states | Dependency inventory ready; **not started, Bobby assignment required** |
| Claude | **UXM-00** current browser/components/deep links/retained role journeys and reuse map; then UXM-01/02 against01 contracts | Handoff request001, AWAITING_CONSUMER_REVIEW; audit not UI implementation approval |
| TS/Edge/ops | Requests003/004 immutable source→image/schema/trust/publication attestation | No remote change authorized by this packet |
| Analytics / policy | Requests002/005 prepare exact policy/config proposals | Runtime fields/actions remain disabled/pending until specific approval |

Files are local **UNCOMMITTED**; no push, merge, release or runtime transition.
Delivery statistics in [validation-results.json](validation-results.json) count
only this ELP2-00 packet and this turn's index/entry-point delta, not prior
onboarding guides/rules, user assets or Claude implementation.
