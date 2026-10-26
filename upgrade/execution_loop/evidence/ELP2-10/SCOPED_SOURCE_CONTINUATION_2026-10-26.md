# ELP2-10 scoped-source continuation — 26 Oct 2026

## Entry / task ownership

Bobby assigned continued source qualification, metadata, scoped notices and
connected/browser acceptance. Primary owns shared contracts/docs/integration and
all resource scheduling. No frontend edit, push, shared-preview replacement,
stable/dev/main/provider28445, command SUBMIT/Live or denied source-code upload.

Core candidate `/home/bobby/portal-backend-residuals-20261025`, branch
`chore/backend-residuals-20261025`, entry `89d5e7a6d`, clean. Canonical
`685bc1915db51c7869254c1fdfa68991d7e4aae4` / Claude
`00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`, both clean and unchanged.
Owned Edge `86178d694abf156453cdf450553fa80bdd9becab`, clean; peer Edge
`8727e5303b1815d54bc2bdcb927a55457ff4da5b`, three existing WIP docs preserved;
PM `6f474c72088f000a198a73324ad3083236f2bf5c`, existing WIP preserved.
Financial PM implementation is a **separate owned candidate**:
`/home/bobby/.worktrees/pm-core-financial-assembly-20261024`, branch
`feat/core-financial-assembly-20261024`,
`fad5e3fd876460f3aecfcf8ebd57a66610b6069c`, clean. Receiver/ACK source there
must not be attributed to peer PM6f474c or to an installed runtime.
No new committed Claude requests since the preceding pinned round.

| Task | Owner / boundaries | Acceptance |
| --- | --- | --- |
| Financial/economic/health source intake | Reuse financial reviewer, read-only Core/Edge/PM source and owner requests; no remote mutation, secrets, test/build or commits | Concrete next production wiring gap or source-ready input with exact locator; do not repeat already delivered owner-context module |
| Metadata source transport | Reuse source reviewer, read-only first; primary grants disjoint write paths only after findings | Exact callable metadata source vs missing authority; smallest integrated patch, no duplicate stubs |
| Scoped Manager notices | Primary reads the durable journal/source contracts and existing authority/replay machinery | Implement actual source-seam coverage and negatives where independently possible; no narrow-scope global observation leakage or CURRENT→STREAM inheritance |

Focused validation only for impacted modules; one disposable SQL/Rust/Docker
heavy lane at a time within the approved budget. Reuse unaffected receipts.
R1 source implementation, source qualification, runtime install and consumer
browser acceptance remain distinct. No automatically armed source/window.
Results, review dispositions, tests/cleanup, next owners and Claude handoff
are appended here and linked from Unified before round completion.

## 1. Result — three concrete Core repairs, not source qualification

Code `c0466d59d84f76f21b1c43840474b74251f130b3`, source tree
`3a9ca45435f2b4a0c60bdb70379c0d013a53a84a`: **18 files, +710/−32**.
Breakdown: production5files,+49/−21; tests7files,+336/−3;
contract/generated/fixture/snapshot6files,+325/−8. Documentation is separate.
Status **IMPLEMENTED_R1**, not installed, landed or connected-accepted.

| Repair | Production change | Verification |
| --- | --- | --- |
| Metadata silently dropped | `record-detail.ts` now iterates the existing canonical 25-member detail vocabulary instead of an obsolete 11-member literal. The strict scoped adapter schema and generated `ScopedRecordFields` now admit the same 14 already-authorized optional detail fields. Both profile-adapter and subject-record serving paths retain them. | Real scope/mapper tests, OpenAPI/Zod parity and disposable SQL retained-row round-trip. Restricted fields, credentials, absent/inherited/malformed values remain excluded. |
| Health failure ownership | `OperationalHealthPublicationRepository.publish` and `retire` reuse the existing `withTransaction`. Failed rollback no longer replaces the original BEGIN/body/COMMIT error, and an unusable client is discarded. Plain BEGIN, source custody through COMMIT, exact original receipt and no automatic retry are unchanged. | 18 fault-path unit cases; existing real PostgreSQL ingress/retry/retire/queue tests. Lost COMMIT response is not manufactured success/APPLIED/ACK. |
| Notice lineage race | Both existing Portal notice adapters re-read scalar head metadata after awaiting nonempty journal/revision I/O, before returning a batch. Source/generation/catalogue replacement, disappearance, rollback and same-ordinal rewrite are refused. A same-lineage append preserves the original baseline and returns `caught_up:false`. | Mid-I/O replacement/append/abort unit regressions, real Fleet SQL race tests, existing Hub authority/reconnect/revoke suites. |

One extra scalar head query per **nonempty coalesced batch**, no extra payload
scan, pool, timer, per-browser polling or cache. Batch cap remains <=200.
These notices remain `PORTAL_OBSERVATION` or
`PORTAL_PUBLICATION_REVISION_NOTICE`; they are **not** Edge Manager journal
events. No READ→STREAM or CURRENT→HISTORY/REPLAY authority inference.

### Review

Two existing agents reused with disjoint file ownership. Primary reviewed the
metadata and health implementations and integrated shared contract/generated
work. Independent source reviewer **ACCEPT** for both final-lineage fences,
bounded same-lineage drain, cancellation and privacy; no requested CHANGE.
Reviewer did not claim another test execution or runtime acceptance.

## 2. Contract and consumer handoff — Claude ACT_NOW

Use existing approved components/readers; no frontend path was edited here.
Canonical consumer artifacts:

- `packages/contracts/openapi/execution-scoped-records.openapi.json`.
- `packages/contracts/generated/execution-scoped-records.d.ts`:
  `components["schemas"]["ScopedRecordFields"]`, shared by
  `ScopedAdapterResponse` and `ScopedSubjectRecordsResponse`.
- `packages/contracts/fixtures/execution-scoped-records.synthetic.valid.json`:
  two **appended** cases, preserving previous cases/order. They exercise
  runtime/session/account metadata and order metadata/decimal/zero/false/null.

All 14 members are optional and nullable, not defaults or permission presets:

| Members | Wire type |
| --- | --- |
| `runtime_state` | `RUNNING / PAUSED / HALTED / STOPPED` |
| `runtime_state_since`, `runtime_state_changed_at`, `started_at`, `completed_at` | Normalized UTC ISO date-time strings, not epoch numbers |
| `execution_session_id`, `account_type`, `position_side`, `time_in_force` | Closed-boundary text |
| `reduce_only`, `post_only` | Boolean; preserve `false` |
| `filled_quantity`, `average_fill_price`, `trigger_price` | Exact decimal string; preserve `"0"`, never coerce money through Number |

Existing integer `*_ms`, `created_at`, `updated_at` stay UTC epoch milliseconds.
Omitted means not admitted or not stated; null is source-stated no value.
The unchanged reviewed field policy decides access before mapping.

Claude next steps:

1. Verify current readers preserve these generated fields rather than stripping
   them again; map into accepted metadata/session/order detail components.
2. Exercise the appended fixtures, plus a restricted scope with only
   `execution_session_id`/`reduce_only`, including false/null/absence and
   long identifiers at 1280/660. No component redesign or baseline update is
   required merely because a wire member became available.
3. Return an explicit consumer/fixture ACK with source SHA and browser receipt.
   **No ACK or source-backed browser acceptance is claimed by Core here.**
4. Do not present a generic DTO member as a qualified producer fact. Actual
   order source columns include side/TIF/trigger/reduce-only/post-only/session
   and submission clocks, but **not** order-level VWAP, filled aggregate or
   commission. Fills carry their own price/quantity/fee. Use separate qualified
   aggregate source only when it actually supplies `average_fill_price` or
   `filled_quantity`.

No public route, migration, role or business-field vocabulary changed.

## 3. Actual gates and resource receipt

Machine-readable dispositions and hashes:
[test-results](SCOPED_SOURCE_CONTINUATION_2026-10-26.test-results.json).

| Lane | Actual result / scope |
| --- | --- |
| Backend unit/source suites | 4 files, **136/136 PASS** |
| Serving/related readers | First attempt **198 PASS / 1 FAIL**: the new restricted-scope test omitted required `timestamp_ms`. Corrected only the synthetic field policy, not production authority. Exact affected-file retake **138/138 PASS**; other 4 files unchanged, 61/61 reused. Unique combined backend union **335 PASS**, not 473 from adding the retake twice. |
| Contract | **39/39 PASS**; generated OpenAPI/Zod/fixtures; exact generator `--check` and snapshot 709 files PASS |
| Disposable PostgreSQL | **42/42 PASS** across health30/Fleet10/detail2; health includes9 pure input-schema cases, so **33 SQL cases**, not42 independent SQL/source proofs. Includes real stored JSON→scoped reader metadata and source-head change during revision read. |
| Production TypeScript | `NODE_OPTIONS=--max-old-space-size=3072 npx --no-install tsc --noEmit -p tsconfig.build.json`: exit0 |
| Exact old-source control | New tests against production blobs at entry `89d5e7a6d`: **242 control cases PASS / 32 intended new regressions FAIL**. Not another product acceptance lane. Original snapshot extracted into fresh temporary staging; no checkout rewritten. |
| Integrity / documentation | Release-integrity `--check`, tracking reconciliation and `git diff --check` PASS. Snapshot CLI initially rejected unsupported `--write`; corrected documented default writer then `--check` PASS. |

SQL cell: pinned Node22
`sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
and PostgreSQL16
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
Hard aggregate **2CPU /1536MiB /300s**, SQL suite24.88s, no OOM.
One heavy lock; exact three specs only, read-only source/dependency mounts,
internal network and no published ports. Source verifier is TEST_ONLY even
though SQL is real. No financial/Edge/venue proof inferred.

Initial sandbox sudo denied before any container creation; the same approved
bounded cell ran successfully through the permission mechanism. Existing
official runner full-compilation memory failures from the preceding packet
are not hidden or rerun: host source typecheck + focused SQL is **not** its
combined full-build/restore receipt. Own two containers/network/staging and
old-source staging confirmed absent afterwards; no broad prune.

R1 commit uses scoped `--no-verify` under campaign §10.10c, after affected
gates. No full hook repeated for documentation. Prior integration
`7129943770e695e61825876bdf1936c191ccbf92` R2/visual RED remains separate;
this candidate is not ff-landed on that basis.

## 4. Source disposition — exact missing inputs, not duplicate adapters

| Surface | What exists / why not yet source-qualified | Next owner/action and done-when |
| --- | --- | --- |
| Financial publication | Existing financial runtime/trust; PM receiver/ACK implementation is on the separate owned candidate fad5e3fd8, not proof of peer PM installation. Core private owner-context entry from4ecaa23c4. | **Edge coordinator:** supply actual original, selected receiver/transaction group, financial-purpose trust/acceptance and source-ACK registration. **Core:** run commissioning with the same original/session held through settlement. Close only genuine receiver COMMIT→APPLIED→durable source ACK with matching original/cursor and source/image/config pins. |
| Economic / NET_PNL / Accounts figures | Dataset and series already share the economic runtime; Accounts refresh already calls batch before atomic replacement. PM return still `WIRE_MAPPING_OPEN`. | **Edge coordinator with PM source owner:** accepted producer namespace, `economic_account_ref` + `ownership_partition_ref`, census/leaves/cut/revision/currency and refresh binding. Do not substitute deployment/account ids, deduplicate by guessed names or derive equity/headroom from cash. |
| Operations health | Writer, cursor/receipt and queue view exist; this slice repairs error ownership. Queue rows come from `execution_command_plans_f0`, whereas trusted commands use `ecm_` ids. Edge command gateway's display projection is UNAVAILABLE. | **Edge coordinator with operation owner:** exact operation/target/workflow binding and authenticated delivery/display observations held through COMMIT. A queue SUCCEEDED/delivery response is not display success, financial APPLIED or venue acknowledgement. |
| Remaining metadata | Scoped response/copier loss is repaired. Source catalogue account policies contain more fields, but currently commissioned account publication intentionally filters them. | **Edge coordinator/source owner:** reviewed exact-grain publication/detail-policy mapping for account policy/margin/leverage/fees. DTO support is not permission to add unpublished source columns or credentials. |
| Manager scoped Edge notices | Durable sealed-cycle Manager journal EXISTS. `ScopedReplaySource` / `ScopedRealtimeHub` can be reused, but executable `ScopedBackend` hardcodes PostgreSQL replay at initial open, catch-up and coordinator; Manager CURRENT provider explicitly rejects Replay. | **Edge implementation owner:** one selected provider seam across all3 paths, original-human current policy, independent STREAM/Replay authority and per-frame fencing. Whole-profile coalesced hints require positively qualified whole-profile visibility; empty selectors alone are insufficient. Never forward global fact counts/state digests to a narrow user. **Core:** integrate matching served adapter once source selection is real; no cursor-lineage mixing with local mf1/observation notices. |
| Calendar | BFF seam and bounded blueprint/normalizer exist; authenticated provider does not. | **Edge provider owner:** deliver current-session-rules source binding; until then **SOURCE_DARK**, not fixture-derived AVAILABLE, no direct PM/TS/DL bypass. |
| Connected/browser | No new qualified source or runtime/image installed this round. | **Core+Edge:** freeze/install an approved compatible bundle, inspect real responses/revoke/recovery. **Claude:** source-backed browser ACK on that exact candidate. Source tests and fixtures do not replace it. |
| Full qualification | This focused cell is not the approved production budget/calibration artifact or coexistence/G2 run. | Reuse compatible prior receipts, identify impact on a frozen candidate, retain actual numeric-bound approval and source requirements; do not reset unrelated PASS gates or count fixture constants as production configuration. |

Key locators, pinned not assertions of deployed authority:

- Edge owned source `services/portal-execution-edge-rs/crates/edge-service/src/financial_runtime.rs:224–235`,
  `financial_runtime_trust.rs:54–77,100–158`; PM **owned candidate fad5e3fd8**
  `services/portfolio_management/report_publication_receiver.py:208,250–274`
  and `services/portfolio_management/report_publication_ack.py:96–111,155–170`
  (last affecting commit4d558ebd49aa1b00b96691f2a7e1ca195e44465d).
- Core `manager-model.service.ts:175–194`, `manager-series.service.ts:62–75`,
  `manager-lists.service.ts:559–574`; PM
  `upgrade/PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md`.
- Core `operations.repository.ts:272–280`, `command.store.ts:75–81`;
  Edge `command_gateway.rs:172–175`.
- Owned Edge `projection-store-pg/src/realtime.rs:89,130,195`,
  `realtime-sse/src/scoped.rs:65,328,392`,
  `query-api/src/scoped.rs:693–706,772,920–926`,
  `edge-service/src/manager_current_source.rs:214–224,355–361`.

ELP2-10 **OPEN / NOT_MET**; no new phase or release is claimed. ELP2-11
preparation is preserved, integrated acceptance still pending.

## 5. Rollback / handoff boundaries

Candidate-only additive DTO and source repairs: integration may omit/revert
this coherent source commit if review finds incompatibility; no migration,
retained data or custody deletion is necessary. Keep code/test/generated
members together. Canonical and Claude checkouts remain clean/unchanged.
No secret, credential value or private original is included in this packet.
Public sanitized return may be mirrored to Edge; that is not installed source,
private input delivery or Edge acceptance. Do not retry/circumvent the earlier
unapproved source-code upload under the guise of a public receipt.
