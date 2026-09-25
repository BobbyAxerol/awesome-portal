# P22 backend packet — Publication and existing R1 mirror

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE · PRODUCT_BROWSER_AND_REAL_PREVIEW_PENDING**.

P22 adds a server-side, actor-bound Research publication saga. It does not add
an approval decision, alternate R1/R2 workflow, Execution command, or a
Trading/QuantBT write path. The immutable P21 pack remains `SEALED_LOCAL`;
publication and approval are distinct source-backed facts.

## Operations and authority

| Generated operation | Route | Behavior |
| --- | --- | --- |
| `researchReleaseCandidatePublicationGetV1` | `GET /api/v1/research/release-candidates/{releaseCandidateId}/publication` | Private/no-store state and authorized read-only R1 mirror. |
| `researchReleaseCandidatePublishV1` | `POST /api/v1/research/release-candidates/{releaseCandidateId}/publish` | Same-origin CSRF-checked, strict request. Persist actor-bound intent before calling the unchanged R1 create service. |

Both operations are generated from
`packages/contracts/openapi/research-release-candidate-publication.openapi.json`
into `ResearchReleaseCandidatePublicationResponse` and
`ResearchReleaseCandidatePublishRequest` in
`packages/contracts/generated/research-release-candidate-publication.d.ts`.
The P21 compose action now offers a navigation/action affordance only for a
current local seal; **`may_publish` from the P22 GET is the final server-side
eligibility hint**. Neither value grants authority. The R1 service still
enforces create permission and exact source eligibility on POST.

## Exact source mapping

- The final-audit `run_id` and active `alpha_id`/`alpha_version_id` must agree
  across the frozen P21 pack, current P21 composition, and RunSync-backed
  Governance evidence. Local-only or unseeded runs return a typed blocked state.
- The P21 `pack_digest`, RunSync `legacy_artifact_sha256`, and R1
  `evidence_set_hash` are **three distinct hashes**. The R1 payload is parsed
  against unchanged `governance.approval-create-request.v1`; no `rc_id` or
  Research-only field is injected downstream.
- The internal `expectedArtifactSha256` guard protects the R1 create against
  a RunSync artifact changing between readiness and creation. A replay is
  attached only after checking requester, R1 subject/run, artifact hash,
  schema, server pin, and evidence-set hash.
- `PENDING`/`UNKNOWN` retain one immutable actor, request key, downstream
  payload and source pin. An ambiguous timeout never becomes `DELIVERED` until
  the R1 create replay and pin verification succeed. Another actor or payload
  cannot adopt the same RC intent.
- The mirror reads existing R1 detail only with that caller's read authority.
  It preserves raw status, SLA, expiry, limitations, and read time. A denied,
  missing or unavailable read remains typed; the immutable delivery receipt
  is not mistaken for an approval decision.

## Evidence and remaining gate

See [phase-report](./phase-report.md) for test commands and results. The
disposable PostgreSQL migration, targeted service/controller/contract,
Governance/RunSync regressions and ledger pass. These are backend proofs, not
the guide's `V11-P22-DR/BR` real preview/browser receipts. A real final Delta
run through the isolated preview and Claude's S11 product browser acceptance
remain separate gates; this packet does **not** claim phase/product activation
or a production write.

Rollback: keep the P21 feature dark to stop new intake; retain immutable
packs, publication intents, verified receipts and R1 approvals. Never delete
or revoke an approval as a rollback shortcut. See [rollback](./rollback.md).

## Backend gap audit — 2026-09-25

- The unchanged R1 service now checks workspace membership before a replay or
  evidence read. Its SERIALIZABLE create transaction locks the membership row
  before inserting the approval. The Research controller check alone could not
  close the revoke-between-intent-and-R1 race.
- A reversible 403, serialization conflict, timeout or rate limit leaves the
  original actor-bound intent UNKNOWN for an authorized retry; it never marks
  DELIVERED or substitutes a service account.
- Read-only preview census: 43 run-producer rows and 35 terminal
  materializations, but **zero** sealed RC packs; migration 0063/publication
  table is not deployed in that preview image. It cannot yield an actual P22
  publish receipt until a real final-audit pack and this candidate build are
  installed in an isolated cell. No shared preview runtime was changed.
