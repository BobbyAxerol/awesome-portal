# P13 contract amendment — Hub-owned run identity and bounded fold navigation

**Status:** `CODEX_BACKEND_COMPLETE_PENDING_CLAUDE_CONSUMER` · 2026-09-22  
**Closes:** `CG-P13-01`, `CG-P13-02`  
**Contract:** `research-evidence.openapi.json` → generated
`research-evidence.d.ts`

## Decision

Screen 04 must not compose its header from Screen 01 or ask the P14/RS-02
split reader merely to bound a selector.  Those are independent BFF reads and
can differ in source revision, profile, freshness or availability.  The Hub
now publishes both facts from its one workspace/run-scoped repeatable-read
snapshot; no new route, browser selector, Execution call, QuantBT call,
artifact read, database migration or source callback was added.

## Additive typed fields

`EvidenceHub.core` now emits these additive fields on every new Control API
responder. They are optional in OpenAPI only to support a bounded rolling
deployment, so a consumer must tolerate their absence from an older responder
without inventing a value.

### `core.run_identity`

| Field | Durable source | Rule |
|---|---|---|
| `status` | `research.runs.state` | Exact Portal run lifecycle; never infer it from `job.state` or a claim. |
| `binding` | `run_producers` + `alphas` | Emits all of `alpha_id`, `alpha_name`, `alpha_version_id` only if the immutable producer binding reconciles with parsed P02 requested spec. |
| `created_at_utc_ms` | `research.runs.created_at` | UTC milliseconds, never browser-local time. |
| `mode`, `schedule`, `route.id`, `config_digest`, `seed` | Parsed `ResearchRequestedSpecSchema` in immutable P08 preflight | No raw JSON field lookup or client-side parse. |
| `route.contract` | Current P02 contract | Always `null` + `NOT_PUBLISHED/P13_ROUTE_CONTRACT_NOT_PUBLISHED`; a selected route id is not falsely upgraded into a route-contract assertion. |

`seed.value = null` with `NOT_APPLICABLE/P02_RANDOM_SEED_NOT_SELECTED` is a
real selected null, not missing data.  A broken/missing requested spec remains
`NOT_PUBLISHED/P13_REQUESTED_SPEC_INCOMPATIBLE`; do not fall back to another
endpoint.

### `core.fold_navigation`

| Field | Meaning |
|---|---|
| `observed_folds` | Strictly ascending, bounded (`<=256`) fold numbers from the current P11 progress snapshot. |
| `published_fold_count` | Exactly `observed_folds.length` when available. |
| `availability` | `AVAILABLE` only for a non-empty valid observed set; otherwise exact pending/not-published/incompatible state. |

This is deliberately a **published observed set**, not a promise of the
complete source fold plan or its boundaries. It is safe to disable previous /
next and populate Screen 04's dropdown only within this set. It must not be
labelled “all planned folds”, used to synthesize P14 windows, or replaced by a
call to `researchCurrentSourceSplitGetV1`.

## Cache and revision rule

`EvidenceHub.revision` remains the immutable `p13r1_*` evidence revision and
continues to bind lazy series exactly as `seriesMatchesHub()` already does.

The Hub's HTTP `etag` is now `W/"p13h1_<sha256>"`: a weak semantic validator
over every displayed Hub fact except observation timestamp. It changes when
run identity, P11 progress/fold navigation, or evidence content changes. Keep
and resend it verbatim for `If-None-Match`; never derive it from `revision`.
Series retain their quoted strong `p13r1_*` ETag.

## Claude implementation handoff

1. Run `npm --prefix packages/contracts run generate:research-evidence`.
2. Consume only `hub.core.run_identity` and `hub.core.fold_navigation` from
   `researchEvidenceHubGetV1`; do not add Screen 01 or split reads.
3. Render the durable status exactly (`READY` is not a client-inferred
   `COMPLETED`). Render every unavailable fact through its own availability.
4. For a missing optional field during mixed deployment, retain the existing
   rich shell and omit only that factual chip/selector; do not invent an error
   code or replace the route with an unavailable envelope.
5. Bind fold controls to `observed_folds` only. If unavailable, keep controls
   disabled with the returned typed reason; if available, default/select only
   a published member and disable edges at the first/last published member.
6. Preserve the existing `revision`-to-series mismatch discard/re-read rule.
   The Hub weak ETag is a cache validator, not a chart revision.
7. Add generated-client, unit and browser receipts at 1280px and 660px. Test
   present, seed-null, requested-spec unavailable, fold-unavailable, folded
   selector edge, hard refresh/304 and no cross-screen request.

## Backend evidence

- Control API contracts/service/controller units: 12 passing.
- Contract generation and contract suite: 173 passing; generated output
  verified current.
- Fresh disposable PostgreSQL P11/P13 proof: 4 passing. The harness was
  repaired to pass the P18 report sidecar now required by
  `ResearchProgressService`; it no longer silently shifts config into that
  parameter. The proof asserts the new header, typed route-contract absence,
  seed-null truth and absent fold set against real joins.
- Control API TypeScript build: passing.

No runtime feature was activated and no existing evidence/progress row was
rewritten.
