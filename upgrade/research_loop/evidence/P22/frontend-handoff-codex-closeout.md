# P22 current frontend handoff — Codex closeout

This file supersedes the historical contributor contract discussion in
`frontend-handoff-claude.md`. It does not erase that audit trail.

## Generated operations

1. `researchReleaseCandidatePublicationGetV1`
   - `GET /api/v1/research/release-candidates/{releaseCandidateId}/publication`
2. `researchReleaseCandidatePublishV1`
   - `POST /api/v1/research/release-candidates/{releaseCandidateId}/publish`
3. `researchAlphaVersionPublicationGetV1`
   - `GET /api/v1/research/alpha-versions/{alphaVersionId}/publication`

There is no `/mirror` route and no `/publish/reconcile` route. A retry posts
the same actor-bound intent to the same publish endpoint; the server performs
reconciliation. The browser never scans release candidates by alpha version.

## Screen mapping

| Screen | Use | Required states |
|---|---|---|
| S01 Run Library | Alpha-version lookup for RC/publication chip | typed absence, draft/current/superseded relation, delivered, approval status |
| S02 New Run | Alpha-version lookup for last published RC | typed absence, current RC, approval status and timestamp |
| S10 Attempt Lineage | `promotion_pick` from the publication/lineage read | `NOT_PUBLISHED` or source-backed `WRITTEN`; never best/newest inference |
| S11 Release Candidate | RC publication GET + explicit POST | sealed local, pending/unknown, delivered, approval unreadable/pending/terminal, conflict/refusal |

## Canonical facts

- `approval.status` is raw Governance status; `effective_status` is separately
  rendered. `DELIVERED` does not imply `APPROVED`.
- `decision_outcomes` comes from Governance `data.decisions` and is not parsed
  from prose.
- `condition_count` is the canonical count of typed Governance conditions.
- `assignee_pool_availability` is
  `P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED` today; do not render “Quant
  Reviewers” or any inferred team.
- `candidate_relation` / `rc_superseded` are server-derived.
- `conflicting_approval_href` and `details.downstream_code` are preserved.
- All timestamps and decimal/digest strings are display-only exact values; the
  browser must not recalculate authority or hash identity.

## Consumer acceptance

- Regenerate from the checked-in OpenAPI; no hand-written parallel type.
- 401/403 stop automatic retry and render the shared denied state.
- 400/404/409/502/503 retain typed code/request ID and do not invent success.
- A transient mirror failure after a good read may display the last fact only
  as visibly stale with its original `as_of`; it cannot become a new decision.
- One click sends at most one in-flight POST; reread the GET after the typed
  response. Never call Governance directly from the browser.
- Take real-API browser receipts for S01, S02, S10 and S11 against a build that
  contains the P22 backend closeout. Fixture receipts do not close product
  acceptance.

Backend real-preview evidence: [`real-preview-receipt.json`](./real-preview-receipt.json).
