# Broad backend request reconciliation before P23 — 2026-10-03

Status: **SCOPED_CODE_ACCEPTED**, gated by the one normal grouped commit
hook before landing. This is not preview/product/browser acceptance.
Baseline `d1e0b839`, backend lane
`codex/be-gaps`; no remote push or dev/main/production change.

## 1. Read scope and reconciliation rule

Read Unified §13 board/addenda, Research A13, the backend/frontend queues,
the three Claude P01–P10/P11–P15/P13–P16 request ledgers, the P01–P21 debt
audit, P21 current audits and W1–W5 return, and the immediate P21–P24
packets. For touched domains, reread the P09/P17/P19/P22 source, contract
and handoff chain. Actual generated schemas and services take precedence
over a stale historical OPEN row only when a later accepted receipt proves
the exact request. Original audit entries are preserved.

Read-only Markdown target checks found zero missing local file links across
Unified, the backend/frontend queues and the three request ledgers. This
does not validate anchors, private paths, browsers or external artifacts.

## 2. Confirmed missed mappings

| ID | Exact scope | Source/authority invariant |
| --- | --- | --- |
| BR-TXT-01 / Atlas | Stable public absence codes, separate from the private engine manifest | Original reason/source and release facts remain unchanged; known absent slots are not certification claims. Wider server-copy inventory is not automatically closed. |
| BR-S08-02 | Window bounds/counts in both Replay lanes | Fixed declared windows and retained fold segments keep different bounds/count semantics; overlapping fold sums are not unique bars. Holdout remains withheld. |
| BR-S08-03 | Exact Replay alpha IDs; Report mapping disposition | Report already exposes exact `identity.alpha` / `identity.alpha_version`; do not rewrite frozen Report bytes just to add aliases. |
| BR-S11-01 | P19 PromotionPick fold/approval disclosure | Source-attested P22 receipt and exact workspace/run/RC custody; no fold is inferred from a global trial ID. |
| BR-F3-03 | Logical-attempt presentation label | Full same-workspace/Alpha created_at+ID order; never a worker retry ordinal or page-local count. Opaque attempt ID remains identity. |

Public presentation changes must not invalidate immutable source, cursor,
Report or RC pins. Atlas uses its own presentation ETag revision; Replay
uses an additive presentation revision/digest, distinct from the frozen
source revision, on its existing no-store routes. Generated contracts lead
frontend consumption. No frontend, engine package, source artifact, seal,
manifest, source database or historical data is edited.

## 3. Other requests found while reading broadly

- **Legacy export consumer:** backend guard is already delivered at
  `fc76a1a9`. `features/quantbt/QuantBTModule.tsx` and
  `features/audit/AuditView.tsx` still contain direct GET export links.
  Claude must use ADMIN/workspace-scoped POST prepare followed by read-only
  GET, or hide the affordance; never weaken the backend guard.
- **BR-F3-02:** `trainTestDisjoint` proves retained UTC ranges do not
  overlap and checks that temporal guard conventions are published. It does
  not prove applied purge/embargo windows or their boundary count. Do not
  map its PASS to `purge_applied` / `embargo_respected`. The separate
  applied-window contract/proof remains a backend item to reconcile from
  exact retained source facts, with NOT_CHECKABLE for old/missing facts.
- **BR-F3-04:** the old tab-subtitle request is superseded by accepted W4B:
  `evidenceFlow.f3s04.test.tsx` explicitly expects stage state only, not an
  inferred holdout seal. Existing summary cards retain their own exact facts;
  do not reintroduce a second subtitle aggregation from stale prose.
- **BR-F3-05:** an engine manifest's actual artifact population is not the
  HiFi sample count. P11 progress already exposes actual digest/size inventory
  and the Claim tab consumes it. Worker publishes five identity/journal files
  plus only the source sidecars actually produced; old runs can have fewer.
  Never fabricate ten artifacts to satisfy a mockup.
- **BR-S04-WIN:** fixed IS analytics/curves are already published in
  `enriched_analysis.by_window.is` and consumed by `IsWindowPanel`. WFO
  selected-candidate IS account remains source-bound absent; WFO holdout is
  NOT_APPLICABLE and fixed holdout lacks unlock/seal authority. The old
  blanket OOS-only description is stale, not a request to fake these windows.
- **BR-F3-01:** the later dataset declaration specification supersedes this
  old row. Portal admission profiles, not the engine catalogue's fixed
  adapter declaration, own executable trial/seed limits.

## 4. Genuine P23/P24 gates, not repeated implementation work

Latest candidate/load and entry packets still require a coherent candidate:
mixed-load SLO; original bytes for the exact three lost historical test
manifests; a genuinely second qualified engine for T07/T13; independent WFO
recomputation from exact spec/snapshot; remaining browser refusal cases;
and final DR/identity teardown/frontend acceptance. Existing retained parity
is not direct engine recomputation. A second container using the same wheel
is not a second engine. An HTML gateway failure is not a typed API refusal.

See [latest candidate packet](../P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md),
[engine-two requirement](../P23/T07_T13_P04_RELEASE_PIN_GAP_2026-09-30.md),
[retained parity limits](../P23/V11_WFO_RETAINED_PARITY_2026-09-30.md),
[browser refusal limits](../P23/F5_BROWSER_REFUSAL_RECEIPT_2026-09-30.md) and
[P24 entry assessment](../P24/ENTRY_ASSESSMENT_2026-10-02.md).
No replacement bytes, deleted historical claims or relaxed authority gates
are introduced to manufacture PASS. The self-audit/conditional linked-child
scope stays distinct from a full non-reusable AUDIT_OF_SELECTION child.

## 5. Focused acceptance and consumer handoff

| Scope | Result |
| --- | --- |
| Atlas public projection / current-historical/legacy/ETag | Control 25/25 first slice, final add-on 9/9; contracts 17/17; TypeScript build check PASS |
| Replay navigation, old fixture/source pin custody | Seven focused files 60/60; final single-bar navigation 6/6; published contract 3/3 PASS |
| Lineage label/approval/absence and canonical fixtures | Focused 36/36; canonical fixture 1/1 PASS |
| Actual disposable PostgreSQL lineage | 4/4 PASS; runtime role still cannot SELECT Governance; gate/subject/RC/digest negatives, cursor prefix, timestamp ties and workspace isolation |
| S05 inclusive source-bound correction | Four focused files 53/53 PASS; shared-bar FAIL, valid one-bar case, missing guards/windows remain NOT_CHECKABLE |

These groups overlap; do not sum them as distinct tests. Official full
contract generation completed with no unrelated generated drift; snapshot
and the normal hook gate the coherent commit. Find its exact delivery SHA:
`git log -1 -- upgrade/research_loop/evidence/P21/BROAD_REQUEST_RECONCILIATION_2026-10-03.md`.
Normal-hook output is retained privately at
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/broad-request-grouped-hook-retry-20261003.log`.
The first failed attempt is retained alongside it as
`broad-request-grouped-hook-20261003.log`; see §8 for its public-boundary
regression and correction. A failed hook is not acceptance.

Claude's generated handoff (synthetic examples, **not real API receipts**):

| Screen/read | Generated type/field | Example and consumer rule |
| --- | --- | --- |
| S12 Atlas | `research-foundation.d.ts`: `AtlasNotPublishedFact.reason_code`, `AtlasHistoricalIdentity.facts_reason_code`, `AtlasScheduleFact.oos_use_condition_code` | `ATLAS_CERT_CAP_NOT_PUBLISHED`; short slot copy, original reason/condition as tooltip. A code is not certification or new OOS authority. Public projection ETag v2, private manifest unchanged. |
| S08 fixed + retained Replay | Both generated Replay DTOs: `ReplayNavigationIdentity`, `ReplayNavigationWindow`, `presentation_revision`, `presentation_digest` | `identity={alpha_id:"alpha_exact",alpha_version_id:"av_exact",availability:{state:"AVAILABLE",reason_code:null},basis:"IMMUTABLE_REQUEST_ALPHA_BINDING"}`; use exact IDs, never display text. `basis` is a strict public fact-class enum, not a private locator. Fixed half-open bounds differ from inclusive retained fold segments; sums may overlap. |
| S09 frozen Report | Existing `identity[key="alpha"].value` / `identity[key="alpha_version"].value` | Exact IDs already mapped in `report-core-v2.ts`; no new alias or frozen-core rewrite is required. |
| P19 pick consumers | `research-attempt-lineage.d.ts`: `PromotionPick.approval_href/approval_availability`, `fold/fold_availability` | Exact receipt may return `/governance/approvals/apr_p19_exact/r1`; render only AVAILABLE. `fold=null` + `P19_P22_SELECTED_FOLD_NOT_PUBLISHED`, never derive fold from `t_214748`. |
| S10 logical attempt | `AttemptNode.display_label/display_label_basis/display_label_availability` | `att_03`, basis `PRESENTATION_ONLY_WORKSPACE_ALPHA_CREATED_AT_ID_V1`; opaque attempt_id remains identity. Missing older-page prefix is typed absent. |
| S05 retained guard | `research-current-source.d.ts`: `Split.guards.train_test_disjoint.basis` | New inclusive-bar V2, old V1 capture accepted; a shared bar returns FAIL. Source revision stays pinned; HTTP ETag alone versions the corrected representation. Not proof of applied purge/embargo. |

Retained Replay adds one existing immutable-request lookup and one bounded
FOLD read (max 256), reused for causal selections. No HMD scan, external
service or new storage plane. The 200-row page and cursor authority remain
unchanged. Replay presentation digest does not replace source/Report pins.

C4: the exact lineage test container was removed by its trap; no volumes or
shared runtime were touched. Capacity observation: root 191 GiB available,
memory 12,337 MiB available, runner active; exact lineage test container has
zero running/stopped matches. **NO_ACTION_NEEDED** for this phase's teardown;
shared cache/image pruning is deferred while tests/builds are active. Full
read-only Docker/capacity receipt is retained at
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/broad-request-c4-capacity-20261003.md`.
No new engine run, runtime image rebuild, :8095
mutation, frontend/baseline edit, remote push or product/browser proof is
claimed. No original artifact/seal/manifest/frozen Report is rewritten.
The mandatory hook may build its existing offline Source Proxy test image;
that is not a runtime deployment or an external source request.

## 6. Correctness defect found during the broad audit

The original `trainTestDisjoint` helper assumed half-open retained fold
windows. The pinned QuantBT 1.1.1 wheel stores `train_index[0]/[-1]` and
`test_index[0]/[-1]` (`quantbt/walkforward.py:3046–3051`) and constructs
purge/embargo from actual index slices (`:3018–3033`). Both retained endpoints
therefore name inclusive observed bars. The old helper incorrectly accepted
train_end == test_start and rejected a valid single-bar window.

Correct the retained S05 helper only: inclusive overlap is FAIL; distinct
single-bar windows are valid. New public basis V2 names inclusive bar bounds;
V1 remains readable for old captured responses. Declared P08/fixed windows
stay half-open. Split's source revision and seal/Report/RC pins stay unchanged;
its independently versioned HTTP representation ETag prevents reusing an old
verdict. This narrow correction does not turn disjointness into proof of
applied purge/embargo (which can be legitimately clipped at the dataset tail).

## 7. Official-generation regression found and repaired

Full `npm run generate` exposed an order-dependent defect in
`generate-research-library-lineage-metrics.mjs`: the later Compare target
reset Lineage's source enum after its causal generation/type step. OpenAPI
lost `RS02_RETAINED_OUTER_FOLD_SELECTIONS` while runtime/generated types
still accepted it. The amender now retains that already-supported token;
published-contract regression checks both schema and type. This does not
introduce a new engine source or change its authority. Full official
generation and the amender's drift check gate the coherent commit, rather
than manually patching a generated file or dropping the causal source.

## 8. Existing public-boundary acceptance caught the new Replay locator

The first grouped normal hook completed Control API with 1,808 passed,
one failed and one skipped test. The existing independent RS-03 acceptance
rejects `source_locator` in public current-source responses. New Replay
navigation had included that field, even though its values were constant
logical locators, so the hook correctly refused the commit.

The repair does not weaken or rename arbitrary data around that assertion.
Replay identity/windows now use strict public `basis` enums describing the
fact class; no internal path/relation/host is emitted and unknown bases or
the old locator field are rejected. The original anti-leak acceptance
remains unchanged. Focused Replay/contract and independent RS-03 tests must
pass before the retry of the normal hook; no acceptance is inferred from
the earlier failed run. Immutable source/cursor/Report/RC pins stay intact.

Focused repair retake: **8 files / 65 tests PASS**, including the unchanged
independent real-PostgreSQL RS-03 acceptance **3/3** and navigation enum/
locator negatives **7/7**. Full published contracts **253/253 PASS**,
targeted official regeneration and both canonical amender drift checks PASS;
snapshot matches all **271** tracked files. Focused harness teardown removed
its exact disposable Node/PostgreSQL/network/dependency paths. The normal
hook retry still gates commit; none of these counts is browser acceptance.
