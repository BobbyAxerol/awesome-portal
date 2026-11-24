# G3 — Ordinary authority, delegation and qualified producer

## Assignment and frozen baseline

- Owner: Codex; Bobby approved implementation on 24 November 2026.
- Source: `integrate/v13-candidate-20261122`, predecessor `a888f67b588144923f3d81f20334234a005a0104`.
- G2 source `e89b223996d5ebc191460ca44944230ea7ca80cb` remains valid for unchanged offline Access and Observed OFF behavior.
- Scope: source, additive migration and isolated tests. No runtime install, permission issuance, remote push, deployment, command/Live activation or UI design changes.

## Ownership and implementation order

1. Authority agent: new ordinary authority contracts, transactional writer/CAS, immutable lineage, bounded delegation, current read confirmation and tests.
2. Producer agent: authenticated normalized envelope verifier, exact physical seals and evidence; existing projection consumer integration. Legacy bounded pages are not qualified exports.
3. Profile agent: bounded private registry, explicit concrete-profile selection, runtime/model/controller isolation. Existing three-environment ALL v1 stays backward compatible; it is not an all-installed-profile union.
4. Root: migration 159, read-scope/private composition wiring, shared schemas/generated contracts, integrated tests and handoff.

Ordinary head/events/grants are separate from legacy policy tables. Installing ordinary rights must not set legacy `policy_seen`, change native successor limits, or implicitly grant STREAM/HISTORY/command. Root-to-administrator-to-employee READ chains must fit one live parent and the owner ceiling. Grant revocation, actor/session changes and DENYs are checked again at release.

## Source qualification boundary

The current source exports bounded row projections, not the required normalized Fleet publication with complete membership/ownership proof. G3 implements a signed normalized producer boundary; it must not label current legacy pages, S1/M0 census, fixtures or an owner grant as qualified TS data. Runtime commissioning needs accepted source signer/audience, current profile/seals and genuine receipt bytes. Live's missing profile artifact remains a source input, not a manufactured hash.

## Validation and closeout

Status: CORE_SOURCE_VERIFIED / PRODUCER_QUALIFICATION_OPEN / NOT_ACTIVATED. The final source return below supersedes the initial verification status; full G3, runtime readiness and the real-producer gate remain OPEN.

Focused tests will cover CAS/replay/rollback, delegation and parent revoke, protected owner, two-Paper isolation, negative source proofs, late authority checks and unchanged native/legacy behavior. Heavy checks use `primus-build`; one normal hook follows a frozen integrated candidate. Final source SHA, test results, resource cleanup, Claude contract handoff and remaining connected gates will be appended after verification.

Backend can implement the independent authority and producer modules now. Claude can continue existing fixture/UI work; do not consume an uncommitted shape or enable ordinary access before the verified handoff.

## Implementation map

| Requirement | Delivered source | Verification boundary |
| --- | --- | --- |
| Official writer / DB CAS | `ordinary-profile-authority.ts`, private root-pinned intake; migration159; original pool/coordinator provenance | Real disposable PG/coordinator tests, not installed permissions |
| Delegation / revoke | One current root parent, exact physical profile seals and time ceiling; immutable events; CAS/replay; owner protection; own-password ACCESS_ADMIN step-up | Child cannot delegate; revoke ancestors invalidates child; READ only |
| Late ordinary read authority | `read-scope.ts` rechecks publication and all decisions together at final DTO cut | Not native physical-send custody and not a STREAM/HISTORY grant |
| Profile isolation | Explicit `profile_id`, registry exact tuple/default, aggregate document/row/byte/time/task budget | Four partitions require explicit private registry/budget; ALLv1 unchanged |
| Qualified source boundary | `ordinary-manager-source.ts`: Ed25519 nonce-bound compact bytes, issuer/audience/seals, receipt hashes, correlated full census, current source and committed-head ACK | Proposed carrier, not an accepted Edge wire or commissioned real producer |
| Canonical contract | OpenAPI/zod/generated/synthetic vectors for ordinary admin operations; Manager model/series optional profile field | No root installation endpoint; no runtime/qualification truth inferred from fixture |

## Claude handoff

Delivery state: **AWAITING_CONSUMER_REVIEW**; source `d402a594e28984498b9d36efbe90599ac7d9c394`;
no ACK, browser acceptance or frontend modification by Codex in this slice.

1. Preserve current components, layouts, colours and baseline. Concrete Manager
   model and series requests may send scalar `profile_id` alongside the existing
   workspace/environment. Response parsers must accept the additive optional
   `profile_id` from generated `execution-manager-models.d.ts` and
   `execution-manager-series.d.ts`. Do not infer a profile from environment alone.
2. Omitted profile means the pinned deployment default. An explicit second Paper
   profile requires its exact private installation plus ordinary grant; a native
   Paper receipt is not that grant. Uninstalled/wrong-workspace choices refuse.
3. ALLv1 retains its existing three-environment-default coverage. Do not label
   it a union of four installed profiles or combine both Paper profiles client-side
   under one permission. A new ALL shape is a separate contract, not this delivery.
4. Private administrative operations, only if actually composed:
   `POST /api/admin/ordinary-profile-access/v1/step-up`, `/delegations`,
   `/revocations`; shared type `execution-ordinary-profile-authority.d.ts`.
   Use exact same-origin/CSRF and idempotency header. Delegate/revoke body
   operation_id equals header; expected head revision+digest must be current.
   Use the actor's own password for ACCESS_ADMIN, never owner's credential.
   Server chooses action/profile/environment/issuer from the parent, not client.
   This is not permission to build a new admin UI in this backend assignment.
5. Consume canonical synthetic ordinary vectors and existing Manager fixtures
   through the usual test adapter, without a new fixture banner. Never convert
   source-dark/error/absence into real AVAILABLE or infer STREAM/HISTORY/command.
6. Return consumer source SHA, parser tests, exact profile/workspace negatives
   and acknowledgement. Actual producer/browser acceptance needs commissioning
   below and is separate from fixture/contract acceptance.

## Remaining producer inputs / connected gate

Owner: Edge as the single source coordinator. Needs the accepted normalized
Manager document/publication carrier (or an agreed equivalent adapter), genuine
signer key-id/issuer/audience/SPKI pin, independent physical catalogue/profile/
field-policy seals and receipt bytes, complete correlated membership/ownership
census and current-source/rebuild semantics. Live's profile artifact is still
missing. The existing seven bounded row families are not this Fleet export;
S1/M0 census is not economic ownership or deletion/event-retention proof.

Until those inputs exist, leave source/runtime private composition uninstalled.
READ, separate STREAM/HISTORY, financial/Score, physical HTTP custody and final
connected/browser/ELP2-10/11 gates remain OPEN; none is closed by signing synthetic
test bytes. No request to Bobby to repeat an already approved source-code scope.

| Remaining gate | Owner / precise action | Done when |
| --- | --- | --- |
| Accepted source wire | Edge reviews `ordinaryManagerSignedEnvelope`, `ordinaryManagerSignedPayload` and `OrdinaryManagerSourceTransport` in `ordinary-manager-source.ts`, or supplies its authoritative compatible export for an adapter | Agreed real wire plus exact source scope/seals, epoch/cursor/rebuild semantics and complete correlated population, not seven unrelated bounded pages |
| Producer qualification | Edge supplies genuine signer/issuer/audience/SPKI, current independent commissioning receipt bytes and physical catalogue/profile/field-policy pins; Core verifies and binds them | Real current-source negative/positive receipts on those exact pins; fixture signatures and app READ grants are insufficient |
| Live profile | Edge/source owner publishes the missing physical Live profile artifact | A genuine independently pinned Live seal exists; no hash synthesized from a Paper artifact |
| Runtime installation | Core, only in a separately approved exact target/artifact package | Backup, migration159, pinned root intake/coordinator, isolated Execution pool and aggregate registry budget verified; no legacy workspace policy flip |
| Consumer acceptance | Claude consumes the pinned generated types/fixtures below | Exact consumer SHA and profile/workspace/revoke tests, then browser on the installed API/bundle when available |

These are separate dispositions. Missing producer inputs do not block publishing
the tested writer/delegation contracts for Claude; they do block calling the
producer commissioned or G3's complete connected exit met. No source ACK or
Claude acknowledgement is fabricated by this handoff.

## Rollback / next

Source rollback is a reviewed revert. Migration159 down refuses once ordinary
history exists; do not delete grants/events to force a rollback. No runtime was
changed, so there is no runtime rollback in this source slice. Root owns shared
contract/docs and integration; three disjoint agents wrote authority, producer
and profile routing, then reviewed integration without running parallel builds.
Code/gate results and final pins will be appended after the frozen normal hook.

## Actual verification ledger (not additive coverage)

| Command / scope | Actual result | Impact / remaining retake |
| --- | --- | --- |
| Focused producer/profile/read/native callers, seven files | 164 PASS / 17 PostgreSQL SKIP, exit0 | Skipped cases not counted as passed; later final PG/full hook required |
| Initial whole Core test-inclusive typecheck | exit2, nullable registry/fake head and duplicate fixture field | Corrected honest nullable repository interface, explicit success narrowing and fixture; not accepted as a PASS |
| Affected contract generation | First attempt refused75 (busy slot); second exit1 (missing local zod) | No job started in refused run; reused existing dependencies via NODE_PATH, no install or source widening |
| Three affected canonical families generated via installed scripts | exit0 | Final added problem/CSRF metadata must be regenerated and checked before freeze |
| `primus-build -- ./scripts/control-api-test.sh test/ordinary-profile-authority-pg.spec.ts test/ordinary-profile-authority.spec.ts test/ordinary-profile-authority-controller.spec.ts test/ordinary-manager-read-scope.spec.ts test/ordinary-manager-source.spec.ts test/manager-profile-registry.spec.ts` | Six files **132/132 PASS**, exit0; eight real-PG coordinator/CAS cases; build, migrations and preservation/restore drill PASS | Snapshot predates final ROOT guard, shared Series composition and accounting/async-release refinements; final gate exercises those changes |
| Final focused Core retake, seven authority/composition/read/profile/Series files | **203/203 PASS**, exit0 | Includes shared Series confirmation, asynchronous-validator refusal and private-composition provenance; no real source or runtime installation |
| Initial focused contract retake | exit1: Ajv strict-required condition; next retake **159 PASS / 1 FAIL**: new anonymous canonical schema collided in catalogue | Fixed generator conditions and added the receipt schema's unique canonical `$id`; full final contract gate must verify both fixes |
| Final whole Core test-inclusive typecheck (`tsc --noEmit && tsc -p tsconfig.cross-loop.json`) | **exit0** | Both configured projects completed; earlier two test-only typing errors were fixed, not bypassed |
| Initial normal-hook entry | exit1 before build/tests: static route ledger missing the three new private admin declarations | Regenerated the repository's static ledger (348→351, no removed routes), reviewed exact additions and passed `--live-routes`; this does not say routes are runtime mounted |
| Final normal hook on frozen index | **exit0**, source `d402a594e`; Core **13,101 PASS / 1 expected-fail / 166 SKIP**, contracts **1,995 PASS** | Build, migrations, generic PostgreSQL preservation/restore and tracking PASS; not real-source/browser/ordinary restore commissioning |

Reviews: authority/coordinator provenance, DB CAS, immutable grant history,
parent revoke, DENY intersection and explicit source/ordinary/native separation
were reviewed independently. Two integration gaps were fixed: whole-profile
accounting visibility now recognizes the ordinary correlated census (not economic
qualification), and Series confirms all subject purposes together. A new raw-SQL
guard protects unsettled native ROOT even after expiry or terminal-without-ACK.
No expired custody is deleted or marked settled by this implementation.

All heavy commands use one `primus-build` slot (3CPU/high6GiB/max8GiB), with
disposable PostgreSQL/Node cells only. First focused cell exited and its owned
containers/network/temp directory were removed by the existing trap. Local
contract generation temporarily reused an existing dependency tree; the exact
temporary link has been removed, preserving that shared tree. No runtime image, grant, session, private key,
source database or protected owner data was installed, changed or cleaned.

<a id="final-source-return"></a>

## Final source return — 2026-11-24 17:25 UTC

**CORE_SOURCE_VERIFIED / PRODUCER_QUALIFICATION_OPEN / NOT_ACTIVATED.**
This is source Verification: R2, not full G3 or ELP2-10/11 acceptance.

- Code repository/worktree: `/home/bobby/portal-t3-core-20261122`, common Git
  repository `/home/bobby/portal`; branch `integrate/v13-candidate-20261122`.
- Source commit: `d402a594e28984498b9d36efbe90599ac7d9c394`;
  predecessor `a888f67b588144923f3d81f20334234a005a0104`.
- Committed tree equals the frozen/tested tree exactly:
  `6930a1892e891ee54b6a63e53fc8885216185729`.
- Source package: **61 files, +5,546 / -49 lines**, including source, migration,
  generated contracts, tests and tracking; zero frontend implementation paths.
- Normal hook completed exit0: contracts115 files/**1,995 PASS**; Core648 files
  PASS/32 files SKIP, **13,101 PASS / 1 expected-fail / 166 SKIP**. Skips and the
  expected-fail are not passes. Focused203 overlaps this run; do not add counts.
- Exact new Core suites passed: authority33, controller11, composition5,
  ordinary read-scope13, registry19, signed source52 and **real PostgreSQL13**.
  The PostgreSQL fixture mocks the private root-file input; it does not prove
  an installed root artifact, genuine source, or actual permission issuance.
- Whole Core test-inclusive typecheck completed exit0 for both configured
  projects. Build/migrations and the hook's generic legacy + versioned identity,
  session, command and custody preservation/restore drill passed. This is not
  a restore rehearsal with populated ordinary authority or a connected receipt.
- One preflight entry stopped before builds/tests for missing route declarations;
  the corrected full hook passed. Static inventory351/collisions0/kernel MATCH
  means declarations only, not three newly mounted runtime admin routes.

### Result by requirement and next owner

| Requirement | Source disposition | Remaining action / owner |
| --- | --- | --- |
| Authority writer / DB CAS | ACCEPTED_SOURCE: real coordinator, same-transaction CAS/rollback, replay, immutable lineage, target checks and native drain guards | Core installs only in an approved exact target package; no installed permissions are claimed |
| Delegation | ACCEPTED_SOURCE: owner ceiling, one live parent, child cannot delegate, parent revoke/subject/session/DENY/clock checks, own-password step-up | Claude may connect the published contracts; no new admin UI or automatic grant issuance is assigned |
| Profile routing | ACCEPTED_SOURCE: exact registry and aggregate initial-work budget; explicit second-Paper isolation; ALLv1 unchanged | Claude consumes exact profile identity; registry historical work remains refused pending separate aggregate accounting |
| Signed source boundary | ACCEPTED_SOURCE_IMPLEMENTATION, not an accepted Edge wire | Edge supplies/reviews the exact normalized export, signer, independent commissioning/seal/receipt and current/rebuild inputs in the table above; Core binds and qualifies real source |
| Producer qualified | **OPEN** | Genuine source/transport/field-policy receipts, correlated population and missing Live physical artifact; fixture signatures are not sufficient |
| Runtime / consumer / connected | **OPEN** | Coordinated parser rollout, exact private composition/backup/migration, source qualification and API/browser receipts; no STREAM/HISTORY/command inferred |

Ambiguous overlapping physical seals under the same profile ID deliberately
refuse a string-only selection; consumers must not pick the first match or
parse names to choose a physical source. A reviewed exact/non-overlapping
installation or distinct profile identity is required.

### Precise Claude consumer work — no component redesign

Start a fresh consumer lane from the source SHA in the **Portal common Git
repository above**; preserve existing worktrees/WIP and do not merge the entire
older Access/Observed branches again. Historical `/home/bobby/portal-research`
receives this receipt/index mirror only, not this source history.

1. `apps/portal/frontend/src/execution/v2/readers/managerDataset.ts`:
   `ROOT_OPTIONAL` and `readManagerDataset`; accept/expose optional scalar
   `profile_id` as `profileId`. Preserve validation of all existing fields.
2. `.../readers/managerSeries.ts`: split optional `profile_id` from `ROOT_KEYS`
   currently used by both `hasOnly` and `hasAll`; old bodies must still parse.
   Update `ManagerSeriesQuery`, encoder and `seriesAnswersQuery` together.
3. `.../api/managerDatasetQuery.ts`: query types/encoder and
   `datasetQueryMismatch`; thread scalar profile identity through `ports.ts`,
   `httpApi.ts` and `fixtureApi.ts`. Omitted profile remains the server's pinned
   default. Reject ALL+profile, malformed query values and explicitly requested
   profile versus response mismatches; never substitute a different profile.
4. Include workspace+environment+profile in request/cache identity, cursor
   use and stale-response cancellation (`screens/fleet/useFleetDataset.ts`,
   `screens/series/useManagerSeries.ts`). Test switching Paper A→B while A is
   pending; A must not draw as B. Keep two Paper partitions separate.
5. Reuse canonical `execution-manager-profile-selection.synthetic.valid.json`,
   `execution-manager-series-query.synthetic.valid.json` and
   `execution-ordinary-profile-authority.synthetic.valid.json`. Extend reader
   and `managerDataset.port.test.ts` / `managerSeries.port.test.ts` coverage for
   new/old bodies, wrong profile/workspace, ALL refusal, cursor isolation and
   revoke. Preserve components, layout, colours, typography and baselines;
   add no fixture banner and do not turn an absence into real AVAILABLE.
6. Return exact consumer SHA, focused test results and ACCEPTED/CHANGES_REQUESTED.
   No consumer ACK is inferred here. Browser acceptance needs the installed
   exact API/bundle and is separate from canonical fixture tests.

**Rollout dependency:** current closed frontend parsers reject the new field.
This source emits selected `profile_id` on concrete Manager responses, including
omitted-profile requests. Do not install that API for the current consumer
before the parser compatibility changes above are ACKed. No existing runtime
was changed, so this packet does not claim a current UI regression or fix it
by silently weakening parsers.

### Commissioning and restore boundary

The frozen diagnostic/C2 inventory in `restore-inventory.ts` /
`restore-c2-inventory.ts` does not enumerate the three new ordinary tables.
Its old MATCH cannot qualify ordinary authority restoration. Core must review
the extended authority inventory/checkpoint profile and rehearse populated
ordinary head/grant/event preservation and post-snapshot revocation before
ordinary runtime/DR commissioning. Do not silently widen the frozen C2 profile
or claim the generic hook drill closes this gate. Full G3 remains OPEN.

Backend next-ready work is the independent commissioning/restore preparation
and binding of an accepted genuine producer within G3, not automatic entry to
another phase. Claude can immediately do the consumer work above without
waiting for actual source commissioning. Edge is the only source coordinator;
no direct TS/PM authority or new user grant is inferred.

### Evidence pins, source preservation and cleanup

Local evidence directory:
`/home/bobby/.local/state/portal-integrations/20261124-g3-implementation/`.

| Artifact | SHA256 |
| --- | --- |
| `normal-hook-final.log` | `36485216373b18025a0a5a9c86711d07f86348f731b2bf80884fd9ecfe491ac5` |
| `core-focused.log` | `a6257334119324f2503722adf999e390d199281beafd5a8a800edb1441ab6a35` |
| `typecheck.log` | `a6543d5da92fbf5f5abbb49d3530d6310a5b933eb8652129b2cd50ed04c0536d` |
| `G3_SOURCE_d402a594e.bundle` | `22062557edb798f7860ef9ff2f85f00e71555d060aba4d2f8afe319cda48be8f` |

Bundle verify PASS; it contains the source ref with prerequisite `a888f67b5`,
not private inputs. Raw typecheck log records the command; its real exit0 was
captured by the execution tool, not invented from an empty error stream.

Post-exit: no owned cell/container/network suffix `3880530389419582`; no owned
test image `portal-source-proxy-d4-offline:tmp.*`; `/tmp/tmp.jQAk5BueE9` removed
by the runner trap; no PG anonymous-volume mount; temporary contracts dependency
link removed and the shared dependency tree preserved. State692KiB, disk free
140GiB and available host memory9,889MiB are point observations, not peaks/SLO.
During the gate Node754.5MiB and PG165.2MiB were point samples. All heavy checks
used the one `primus-build` slot (3CPU/high6GiB/max8GiB); no G2/load calibration
or coexistence claim follows from these samples. Source bundle/logs are retained
for rollback and evidence, not abandoned build cache. No shared resources pruned.

Source rollback is reviewed revert. Migration159 down preserves any ordinary
history by refusing removal; do not delete evidence to force downgrade. There
was no runtime change to roll back, no push, UI edit, permission issuance,
command/Live activation or dev/main/stable operation.

Recording this return and mirroring the five indices is **Verification: R0**
under campaign§10.10d: explicit Markdown only, diff/link/tracking checks, no
source/dependency change and no second full hook just to record the first.

Local R0 checks completed: diff whitespace PASS; ten local index links/anchors
PASS; `scripts/execution-tracking-test.sh` PASS. Exactly six Markdown paths
are selected for recording. Historical Research's unrelated tracked WIP remains
excluded and byte-identical (SHA256
`1a655f6c335151a5249a68d943fd47afcf7266f67fc6b523a41130ba57da0c35`).

## Ordinary restore follow-through — implementation round

Bobby assigned the remaining independently runnable G3 work and full Claude
handoff. Entry: `974b0435b01cde76a8296c081b937b34bcf64402`, clean v1.3
integration worktree. No installation, permission issuance, remote push or
frontend redesign is included. The existing source verification remains valid
for unchanged producer/authority contracts; it does not qualify populated
ordinary restore.

Ownership: root owns legacy restore-profile refusal, runner, integration and
five indices; authority agent owns a separate versioned ordinary restore
overlay and isolated tests; producer reviewer reads current local Edge inputs;
profile reviewer audits the precise consumer handoff. No parallel heavy tests.
The overlay must not silently widen the frozen C2 commitment or act as a
cutover permit. Qualification covers populated ordinary history/security and
post-snapshot revoke; real source, independent operational fencing and Claude
consumer ACK remain distinct. Focused PG/typecheck results and cleanup will be
recorded after execution, not inferred from this plan.

The [consolidated Claude return](CODEX_G3_FINAL_CLAUDE_HANDOFF_20261124.md)
clarifies source-as-is commissioning: no mandatory new TS signing mechanism,
no request to resend the three existing physical pin triples. Existing Core
metadata preservation and normalized producer mapping remain owned work, not
an external Edge-only blocker. The Live physical artifact is a separate input.
Consumer review also identified the Fleet publication probe's request identity,
not only the visible rows and Series parsers. No Claude ACK is inferred.

### Failed qualification retained — actual constraint deparse difference

Two real disposable PostgreSQL attempts exited1 during CHECK_COPY; neither
ran POST_SNAPSHOT/VERIFY_STALE or qualifies as a completed restore drill.
The second attempt isolated exactly one security component:
`elp210_candidate.leases`, `leases_human_issuer_check`. Data, other security
facts and routines matched. PostgreSQL's raw constraint deparse retains an
AND grouping that its own dump/reparse can flatten. The new, unpublished
ordinary profile now uses PostgreSQL's `pg_get_constraintdef(oid,true)` for
constraint text, keeping all constraint names and full predicates. No regex
normalization, dropped security hash or legacy-profile hash change is used.
The retake explicitly compares raw/pretty definitions and changes the actual
CHECK bound128→127 to require refusal, then restores128 and requires a match.

Retained local logs under
`/home/bobby/.local/state/portal-integrations/20261124-g3-implementation/`:

- `ordinary-restore-pg.log`: SHA256
  `e0486db31fb7c4aef6c476e86cede02913a2de8077f1d13c6fcf956550fc5ee3`.
- `ordinary-restore-diagnostic.log`: SHA256
  `5bb63ea906f9cbaf0f11c32ef9091d4f68b5db23d658d8cf5efa441e45c3f68f`.

The second attempt's real lock-contention negative passed: bounded lock
refusal and same-operation retry produced no extra checkpoint event. That is
not a substitute for the pending complete four-stage retake.

### Actual final focused qualification

| Scope | Actual result | Evidence / boundary |
| --- | --- | --- |
| Four-stage ordinary restore | **exit0, 7 unique tests PASS**: SEED1 / CHECK_COPY4 / POST_SNAPSHOT1 / VERIFY_STALE1 | Real migration159, ordinary install/delegate/revoke and dump/restore; two disposable clusters. Other phases' tests are filtered per invocation, not additive skipped coverage |
| Frozen legacy checkpoint authority | **exit0, 10/10 PASS** | Old profiles reject empty/populated/unknown ordinary tables and views; actual preordinary migration boundary is pinned158 |
| Final pure restore unit retake | **exit0, 21/21 PASS**, two files | No real-source or installed-runtime claim |
| First whole Core typecheck | **exit2**, five TS2564 diagnostics in new verifier constructor | Replaced early constructor `return fail(...)` with direct same-code throw; strict/compiler/nullability unchanged |
| Final whole Core typecheck | **exit0**, both configured projects completed | `tsc --noEmit && tsc -p tsconfig.cross-loop.json`; frozen final source, not inferred from the previous hook |

The CHECK_COPY probe proved the sole raw-deparse difference is
`leases_human_issuer_check`, with identical PostgreSQL pretty definitions.
Changing its actual bound128→127 makes the independent verifier refuse;
restoring the exact predicate returns MATCH. The journal remains at the same
generation after contention/retry; no extra event is invented.

POST_SNAPSHOT used the real ordinary owner writer to revoke the parent. Child
READ/confirmation then refuse on the source; independent checkpoint advances
to generation3. VERIFY_STALE uses the dump clone renamed to the **original
DB name**, same system identifier and role, preserving the original grant
target. The old ordinary reader/confirmation allow; the actual latest
independent journal makes the new verifier reject `ORDINARY_RESTORE_MISMATCH`.
This is stronger than a clone-name mismatch negative, but remains an UNMOUNTED
comparison, not an installed old-holder/HTTP/source-ACK/fresh-floor barrier.

No Portal schema migration or public contract changed in this follow-through.
The separate SQL file prepares only the independent journal's explicit new
capture kind; no installation or implicit rights upgrade occurred. Old
checkpoint hashes/kinds remain unchanged and old closed readers refuse the
new ordinary profile. Scripted empty C2 fixture relations are inventory
coverage only, not a real C2 quiescence/fencing/source reconciliation proof.

Retained logs in the directory above:

- `ordinary-restore-final.log`: SHA256
  `443ff1c32113beae36e3c9cf91e58a88b8c7cffa2fe8ad2123fbb68365fbfbbb`.
- `restore-legacy-final.log`: SHA256
  `58e0a9504957f8f90fd33ec43e115c122095ee07756e4c1291e40799195ce628`.
- `restore-pure-final.log`: SHA256
  `3b8c24cedfeeebe1dca21b6e0a222e78f12861bac82107604fc9f3f2c0e8112d`.
- Failed first `core-typecheck.log`: SHA256
  `570f00e7e35cd6184ac6c00120306728f155caa2183363d4bfb1f342658dee5a`.
- Final `core-typecheck-final.log`: SHA256
  `c3013b9a551f68a0b6c502aad2b2b6c6860fc7461c36629f231d6da06db38d13`.

**Verification tier: R1 source checkpoint, R2 landing pending**, under campaign
§10.10c. Focused PG/units/typecheck are the impacted gate; one full normal hook
belongs to the later reconciled Claude-consumer/restore candidate before
landing/install. The previous R2 tree is evidence only for unchanged code;
it is not claimed as coverage of this overlay. Source-only rollback is a
reviewed revert; do not remove ordinary authority/history or restore an old
checkpoint to force downgrade. Real producer qualification, Claude ACK and
the separate operational/connected gates remain OPEN.

Independent reviews ACCEPT the frozen implementation for **UNMOUNTED
MATCH_NOT_CUTOVER** only, and the revised source-as-is/Claude task wording.
Constructor typing, schema-qualification of guards, PostgreSQL-owned constraint
canonicalization, exact retry and bounded lock-order contention were reviewed.
No review is counted as execution or connected acceptance. Ambiguous source
timeout after an independent append still requires exact-operation recapture/
reconciliation; neither the receipt nor this verifier proves held-through-commit
source locks or a nonrollbackable operational authority floor.

Cleanup decision C4: **NO_ACTION_NEEDED** beyond the completed runner traps.
Read-only inventory after both PG gates found no `elp2-ckpt-*` containers or
networks. They used tmpfs, no persistent volume, image build, runtime port,
credential file or preview mount. Retain the small source/failed/success logs as
evidence, not abandoned cache. No shared image/cache/backup was pruned. Capacity
sample:145,521,396KiB disk available (78%used), MemAvailable9,884,356KiB; these
are point samples, not peak-resource, production-budget or G2 measurements.

### Ordinary follow-through source return — 2026-11-24 18:19 UTC

- Source commit: `be26f15bb6ca2ba091981c563b7832530dae0707`, predecessor
  `974b0435b01cde76a8296c081b937b34bcf64402`; committed tree equals the
  frozen index `043f0ce0a4288e2fc5b2a6f28fae5f3958385192`.
- **18 files, +1,165/-4**: source/tests/isolated runner and seven Markdown
  tracking/handoff files, zero frontend implementation. Branch remains
  `integrate/v13-candidate-20261122`; historical Research receives docs only.
- Verification **R1**: ordinary7 unique PG PASS, legacy10 PG PASS, pure21 PASS,
  both whole Core typecheck projects exit0, diff/link/tracking/shell checks
  PASS. Independent implementation and handoff reviews ACCEPT within the
  explicitly UNMOUNTED/NOT_CUTOVER scope. No new normal R2 hook or landing,
  runtime install, grant/session issuance, UI change, remote push or dev/main/
  stable operation is claimed.
- Local preservation bundle `g3-ordinary-restore-source.bundle` in the state
  directory above verifies with Git; requires predecessor974b0435b and carries
  sourcebe26f15bb. SHA256
  `10f658372cb1d7fa05446bc2b653e5478042785e3188ff7be6395992b7c27bde`.
- Full task and exact consumer files are in the
  [Claude handoff](CODEX_G3_FINAL_CLAUDE_HANDOFF_20261124.md). Delivery here is
  local mailbox publication, **not a Claude/Edge receipt or consumer ACK**.

**G3 remains OPEN:** Core metadata preservation/validation and confirmed
producer mapping, real-source qualification, and Claude compatibility ACK
have explicit owners/actions in that handoff. The ordinary comparison gate
above is independently qualified; complete operational V2/native restore,
source/terminal/ACK reconciliation and connected/browser gates are separate
and remain unproven. Do not reopen a new TS-signing requirement or demand
already supplied physical pin triples to excuse Core-owned mapping work.

This final-pin/index publication is **R0** under campaign§10.10d, Markdown only.
Its source/dependency bytes equal the focused-tested source. Keep the next
normal hook for the one reconciled Claude-consumer/restore landing candidate.
