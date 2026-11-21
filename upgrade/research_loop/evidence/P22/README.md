# P22 backend packet — Publication and existing R1 mirror

Status: **BACKEND_REAL_PREVIEW_COMPLETE · PRODUCT_BROWSER_PENDING**.

P22 adds a server-side, actor-bound Research publication saga. It does not add
an approval decision, alternate R1/R2 workflow, Execution command, or a
Trading/QuantBT write path. The immutable P21 pack remains `SEALED_LOCAL`;
publication delivery, Governance decision and promotion selection remain
separate source-backed facts.

## Operations and authority

| Generated operation | Route | Behavior |
| --- | --- | --- |
| `researchReleaseCandidatePublicationGetV1` | `GET /api/v1/research/release-candidates/{releaseCandidateId}/publication` | Private/no-store publication, current RC relation, settled promotion fact and authorized read-only R1 mirror. |
| `researchReleaseCandidatePublishV1` | `POST /api/v1/research/release-candidates/{releaseCandidateId}/publish` | Same-origin CSRF-checked strict request. Persists actor-bound intent before the unchanged R1 create service. Replays the same intent after ambiguous outcomes; there is no separate reconcile route. |
| `researchAlphaVersionPublicationGetV1` | `GET /api/v1/research/alpha-versions/{alphaVersionId}/publication` | Named bounded lookup for S01/S02; returns the current RC/publication relation or typed absence without browser scans. |

All operations are generated from
`packages/contracts/openapi/research-release-candidate-publication.openapi.json`
into `packages/contracts/generated/research-release-candidate-publication.d.ts`.
The P21 compose action is only an affordance; the P22 POST and unchanged R1
service remain the authorization boundaries.

## Exact source and settlement mapping

- The final-audit `run_id`, active `alpha_id`/`alpha_version_id`, source
  fingerprint and pack digest must agree with the immutable P21 pack. The
  narrow migrations 070/072/073 materialise only that exact sealed run into
  the existing Governance read model and append one immutable bridge receipt.
- `pack_digest`, RunSync `legacy_artifact_sha256` and R1
  `evidence_set_hash` are distinct hashes. The unchanged
  `governance.approval-create-request.v1` receives no RC-only field.
- `PENDING`/`UNKNOWN` retain one immutable actor, request key, downstream
  payload and source pin. A timeout never becomes `DELIVERED` until replay and
  exact pin verification succeed. Another actor cannot adopt the intent.
- The original promotion receipt is immutable even when R1 changes later. A
  server-owned trigger/function appends `p22_approval_settlements_v1` keyed by
  exact approval version; only `APPROVED` or `APPROVED_WITH_CONDITION` writes
  the existing P19 promotion-fact relation. Replays are idempotent.
- The mirror maps Governance `data.decisions` canonically and keeps raw status,
  effective status, quorum, version, blockers, conditions, timestamps and RC
  relation. Governance does not publish an assignee pool, so the contract says
  `P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED`; it never invents a team name.

## Evidence and exit state

The focused contract/service/migration/privilege gates pass, and the isolated
P22 stack produced a real historical-data WFO → sealed P21 pack → publication
→ existing R1 → independent owner approval → promotion-fact receipt. See:

- [real-preview structured receipt](./real-preview-receipt.json)
- [OL-03→OL-13 closeout](./ol03-ol13-codex-receipt.md)
- [phase report](./phase-report.md)

The database contains one publication, one bridge, one immutable promotion
receipt, one P19 promotion fact, two settlement versions (`PENDING@1`,
`APPROVED@2`) and one Governance decision. Re-reading produces no duplicate.
Neither `RUN_NOT_MIRRORED` nor `P22_GOVERNANCE_SOURCE_UNAVAILABLE` occurs on
the accepted path.

This closes P22's backend and real-preview scope. Claude still owns the S11
browser/HiFi receipt and the S01/S02/S10/S11 consumer rendering; P23 resource/
DR qualification and P24 remain separate. No dev, Production, Execution or
Trading System runtime was changed.

Rollback is feature/intake-only: retain immutable packs, intents, receipts,
settlements, promotion facts and R1 decisions. Never delete or revoke an
approval as a rollback shortcut. See [rollback](./rollback.md).

## §31 stale-seal/publisher-read amendment — 2026-10-03

The [scoped packet](./STALE_SEAL_GUIDANCE_AND_APPROVAL_READ_2026-10-03.md)
unifies stale-seal reasons, publishes typed blocked navigation/native rail facts,
and explains publisher receipt versus R1 review rights. Old seal/receipt bytes
and Governance grants remain unchanged. Source gates are not a new deployed
preview/browser receipt.
