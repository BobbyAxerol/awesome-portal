# P21 backend and typed-contract packet — Release Candidate composer

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S11_PRODUCT_BROWSER_PENDING_CLAUDE.**

P21 adds a bounded, same-origin Screen 11 composer over Portal-persisted
Research facts. It creates only an actor-scoped declaration draft and an
immutable, Portal-local evidence pack. A local seal is deliberately **not** a
publication, governance approval, Execution delivery, worker command,
QuantBT invocation, or source/artifact-byte read.

Read [phase-report.md](./phase-report.md),
[frontend-handoff-claude.md](./frontend-handoff-claude.md), and
[rollback.md](./rollback.md) before changing Screen 11 or its feature profile.

## Published operations

| Generated operation | Route | Exact authority |
| --- | --- | --- |
| `researchReleaseCandidateComposeGetV1` | `GET /api/v1/quantbt/runs/{runId}/release-candidate` | One bounded Screen-11 composition scoped to the authenticated workspace. |
| `researchReleaseCandidateDraftPatchV1` | `PATCH /api/v1/quantbt/runs/{runId}/release-candidate/draft` | Caller-local declaration draft, fenced by source fingerprint and revision CAS. |
| `researchReleaseCandidateLocalSealCreateV1` | `POST /api/v1/quantbt/runs/{runId}/release-candidate/seal` | Idempotent local immutable pack creation only. |
| `researchReleaseCandidatePackGetV1` | `GET /api/v1/research/release-candidates/{releaseCandidateId}` | Immutable frozen pack plus separately stored lifecycle facts. |

All reads are session/workspace scoped, private/no-store, bounded and
validated against `research.release-candidate-*.v1` contracts. Mutation routes
also require same-origin CSRF/origin checks. No relation name, source cursor,
lease/worker identity, credential, artifact path, broker input, raw source
bytes, downstream command, or approval payload is sent to the browser.

## What P21 proves

- Exactly **17 ordered source-built fields** and their identical YAML preview;
  the browser must not reassemble, normalize, compare or invent a field.
- Exactly **12 ordered evidence-pack items**. `DEGRADED` travels unchanged;
  `MISSING` and unresolved declaration `INPUT` rows block local seal.
- Scratch/unbound, inactive Alpha version, corrupt/missing artifact, malformed
  digest, mismatched report/source identities, and an invalid final-audit
  relationship all fail closed with a typed reason.
- A persisted `CENTROID` or `COMPOSITE_POLICY` selection with no selected trial
  remains valid only with its exact retained selection/parameter provenance.
- `release_candidate_packs_v1` is immutable after local seal and its retention
  pins protect exact run, Alpha version, report, evidence, split, selection,
  retained current-source and sealed artifact identities. Delivery and approval
  stay `NOT_DELIVERED` / `NOT_APPROVED`; neither belongs to the frozen core.
- Current facts are never misrepresented as a predecessor diff. P21 returns a
  typed unavailable `published_comparison` until P22 commissions publication.
  It exposes an issued methodology grade only when source fact exists, and
  keeps engine-execution certification typed unavailable rather than inferring
  it from an engine release ID.

## Intentional P22 boundary

The Screen 11 HiFi depicts a publication and Approval Inbox mirror. Those are
not P21 operations. The composer always returns:

```text
local_seal.state = UNSEALED | SEALED_LOCAL
actions.publish.enabled = false
actions.publish.blocked_reason = P22_PUBLICATION_NOT_COMMISSIONED
mirror = null
```

P22, not P21, may create a downstream publication intent, show a real mirror,
or update delivery/approval lifecycle. A client must retain the rich S11
layout but label that P22 section as a ghost / not commissioned state; it must
not fabricate `PUBLISHED`, an R1 row, SLA, approval, or a `CHANGED` taxonomy.

P22 addendum (2026-09-25): the `actions.publish` ghost above describes the
P21-only checkpoint. The P22 backend contract now offers a local-seal
affordance and a separate source-checked publication GET/POST; see [P22](../P22/README.md).
No browser or real-preview publication receipt is claimed here.

## Feature, bounds and rollback

- Default is dark: `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=false`.
  It fails closed unless Reports, Attempt Lineage and Release Candidates are
  all enabled in the same profile.
- Composer reads inside the existing bounded Research admission and a scoped
  repeatable-read snapshot. Pack values and source-linked display data are
  finite: 17 fields, 12 pack rows, no unbounded artifact/reference walk.
- PostgreSQL rows are not a cache: do not sweep, VACUUM FULL, truncate or
  delete drafts/packs/pins as rollout cleanup. Roll back only the feature flag;
  retain immutable sealed evidence and pins. See [the runbook](../../../../deploy/runbooks/research-p21-release-candidate-dark-and-rollback.md).

## Evidence actually run

| Check | Result |
| --- | --- |
| P21 focused service / contract / controller tests | pass — 11 tests |
| P21 fresh disposable PostgreSQL migration and repository proof | pass — validates new tables, runtime grants, source/draft CAS, idempotent local seal, pack immutability, pin retention and delivery/approval separation |
| Control API production-source compile | pass |
| Generated Release Candidate OpenAPI, snapshot and contract test | pass |
| Research capability inventory ledger | pass — 178 routes, focused ledger 22/22 |

This packet does **not** claim that Screen 11's browser/HiFi receipt, feature
activation, P22 publication/approval mirror, deployment, or `PRODUCT_ACTIVE`
has occurred. Those are separate gates.
