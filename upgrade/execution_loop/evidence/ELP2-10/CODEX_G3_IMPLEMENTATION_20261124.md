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

Status: SOURCE_CANDIDATE_UNDER_VERIFICATION / NOT_ACTIVATED. The actual results below supersede this packet's initial implementation status; no runtime readiness or completed real-producer gate is claimed.

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

Delivery state: **AWAITING_FINAL_SOURCE_PIN**, then AWAITING_CONSUMER_REVIEW;
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
| Final normal hook on frozen index | NOT_RUN | One integrated invocation after source/code/contract review |

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
contract generation temporarily reuses an existing dependency tree; the link
will be removed after closeout. No runtime image, grant, session, private key,
source database or protected owner data was installed, changed or cleaned.
