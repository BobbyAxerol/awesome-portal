# P21 frontend handoff — Screen 11 Release Candidate

**Backend state:** `BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK`.

Claude owns rich S11 composition and browser/HiFi acceptance. Preserve any
existing frontend WIP. Do not edit the P21 migration, Control API service,
feature profile or deployment files to make a visual fixture appear live.

## Read and record `READ`

1. `CLAUDE-FOR-thanhvuong.md`, P21 in `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`,
   [Screen 11 spec](../../release-v1.1/docs/screens/11_release_candidate.md)
   and [HiFi HTML](<../../release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html>)
   at **1280px and 660px**.
2. [P21 README](./README.md), [phase report](./phase-report.md), and
   [rollback boundary](./rollback.md).
3. Generated contract only:
   `packages/contracts/openapi/research-release-candidate.openapi.json` and
   `packages/contracts/generated/research-release-candidate.d.ts`.

Regenerate before consuming:

```bash
npm --prefix packages/contracts run generate:research-release-candidate
```

## Same-origin operations and presentation rules

```text
GET   /api/v1/quantbt/runs/{runId}/release-candidate
PATCH /api/v1/quantbt/runs/{runId}/release-candidate/draft
POST  /api/v1/quantbt/runs/{runId}/release-candidate/seal
GET   /api/v1/research/release-candidates/{releaseCandidateId}
```

- Browser supplies only route `runId`, session and normal same-origin CSRF
  mutation material. It never sees a source relation, cursor, worker/lease,
  storage path, credential, broker, CLI, approval payload or Execution input.
- Preserve all server UTC millisecond numbers and exact strings. Do not parse,
  truncate, sort, format-as-authority, recompute hashes, calculate a diff or
  derive a seal verdict in React.
- `401`/`403`: `denied`, disable affected P21 action and stop automatic retry.
  `400`/`404`/`422`: terminal panel-local typed state. `409`: refetch compose;
  retain unsent local typing. `502`/`503`/timeout: unavailable, preserve the
  last accepted composition but retry only by a bounded user action. Never
  replace the full route with a generic error page.

## Required S11 mapping

| HiFi/spec element | Generated source of truth | Consumer rule |
| --- | --- | --- |
| 5-node lineage rail | `rail[5]` | Render returned order/value/detail/tone; unbound node stays dashed. |
| 4-row taxonomy + verdict | `taxonomy`, `gate_verdict` | Render verbatim. `UNSET` is intentional until a real predecessor exists; do not label a current pin `CHANGED` or `UNCHANGED`. |
| Last-published caption | `published_comparison` | P21 currently returns `last_release_candidate_id:null` and typed `NOT_PUBLISHED`; render a truthful ghost caption, not a fake prior `rc_`. |
| 17-row YAML preview | `fields`, `yaml` | Render the returned ordered field list verbatim. `yaml` must be the exact same list; copy joins the server values only. |
| 12 evidence rows/counter | `pack`, `pack_counts` | Render all 12 rows/order/counts. `DEGRADED` remains visible yellow, `MISSING` red. Do not count status locally. |
| Claim / engine certification chips | `certification_axes` | Render separately. A `NOT_PUBLISHED` axis is a truthful designed ghost/absence, never a speculative certificate. |
| Local declarations | `draft`, `actions.may_edit_draft` | Only the two declaration inputs call PATCH with returned `expected_revision` and `expected_source_fingerprint`. |
| Local seal card | `local_seal`, `actions.may_seal`, `seal_blocked_reason` | Button wording must say **Local seal evidence pack**, never Publish. POST only after user action and use returned exact identity. |
| Publication / R1 mirror visual | `actions.publish`, `mirror` | Always a P22-not-commissioned ghost in P21. `publish.enabled=false`, `mirror=null`; do not fake `PUBLISHED`, SLA, R1 row, status poll, approval state or a success card. |

## Non-negotiable semantic boundary

The HiFi is a visual target, but P21 intentionally delivers only the local
half. Keep its hierarchy, carbon design language, rail, evidence table, YAML
and ghost publication panel. Adapt wording and behavior:

```text
P21 local seal ≠ P22 publish ≠ delivery ≠ approval ≠ Paper/Execution start
```

`SEALED_LOCAL` renders an immutable local pack and still displays
`NOT_DELIVERED` / `NOT_APPROVED`. It must not flip the main state chip to
`PUBLISHED`. Do not add a client-only last-RC comparison, a mirror fixture, an
engine certificate, a hidden P22 poll, or a generic “unavailable” envelope.

## Screen details that must stay rich

- Preserve all four visually distinct groups in the HiFi. Use the three
  authority states from backend, and render **Code anatomy** as a presentation
  substage only; do not create a fourth backend state.
- Keep the 960px minimum-width evidence table with horizontal scroll at 660px,
  bounded YAML overflow, responsive/wrapping rail, keyboard copy affordance,
  explanatory `aria-describedby` on disabled seal action, and the screen's
  designed color/tone grammar.
- Deep-link evidence screens in the same SPA context. Do not introduce a new
  tab or lose unsaved declaration context; handle an explicit save conflict.
- Render source `availability.reason_code` in the designed in-context panel.
  Do not leak an internal request, source relation or raw server stack.

## Mandatory browser / HiFi receipt

Use a real browser at **1280px and 660px**. Record:

`HiFi element / interaction → product component → generated field/operation → typed state → browser assertion`.

Cover S11 P21 subset:

1. bound draft rail/17 fields/12 pack items;
2. scratch/unbound and missing source rows without whole-screen collapse;
3. `DEGRADED` vs `MISSING` vs resolved/unresolved `INPUT` grammar;
4. declaration PATCH success + 409 refetch behavior;
5. local seal successful result and replayed/idempotent result;
6. missing/integrity/corrupt source refusal;
7. no synthetic taxonomy comparison/certification/mirror;
8. copy YAML exact server list; 660px scroll/focus/axe; no console warning/error.

P22-only spec tests (actual `PUBLISHING` → `PUBLISHED`, Approval Inbox mirror,
SLA poll, downstream 202/receipt) remain **PENDING_OWNER_PHASE**. Do not
re-record unrelated visual baselines or silently convert those cases to a
P21 fixture pass.

## Return packet

Return commits/files/counts, generated revision, tests and browser commands,
network/console evidence, screenshots at both viewports, HiFi delta decisions,
and only genuine `CG-P21-*` requests. If the P21 API is dark, use a controlled
same-origin test double for browser behavior and label it explicitly; do not
claim runtime activation.
