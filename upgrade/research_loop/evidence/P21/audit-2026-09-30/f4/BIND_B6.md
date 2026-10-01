# BIND_B6 — bind Codex's B6 `enrich_analysis` (d16058ee)

Base: worktree checked out at `d16058ee` (the brief's fallback `999be160` predates B6 and lacks the receipt/types; deviation).

## Items
1. Types + guard — DONE. `enrichedAnalysis.ts` types are the generated `EnrichedAnalysis`; guard keeps basis/rolling/schema refusals, adds lane, scope.coverage, monthly sampling/counts/basis, episodes open flags, `library_summary`; integer bucket counts enforced (string count refused). Tests: `enrichedAnalysis.b6.test.tsx` (guard block), `evidenceFlow.ea.test.tsx`.
2. Wire paths — DONE. WFO `enriched_analysis` (existing); Hub top-level (`enrichedOf(retained ?? hub)`, guarded once in `evidenceApi.hub`; `core.` never read); Report top-level via new `enrichedOfReport` + new `ReportAllTime.tsx` (supplement after Warnings, before Promotion; frozen core unchanged); Library `analytics_all_time` aligned (coverage, source count, digest, sampling).
3. Coverage honesty — DONE. "sampled" chip (tooltip + aria-label) on S04 panels, S09 header, S01 card caption. Block-served NOT_PUBLISHED/NOT_APPLICABLE monthly/histogram now answer with the block's own reason and ask no series (previously fell back). Episodes show `top n / total` + `all recovered` / `open` / `open · longest`; Behavior "open" mark follows `longest_open`.
4. Proposed fixture removed from tests — DONE (guard test asserts it).
5. Absent behaviour kept — DONE (old-seal tests; series/v2 fallbacks untouched when no block).
6. Tests + browser — DONE (see counts). Browser: real preview login failed (claude-preview credential INVALID_CREDENTIALS after 17:45 redeploy), so Playwright used the repo's `stubPortalApi` + canonical fixtures injected into stubbed WFO Evidence, Hub, Report, Library at 1440/660: no overflow, no app console errors (only stub-gap 404/501). Not verified against real runs.
7. Typographic minus, no prose > 8 words — DONE.

## Proposed vs canonical differences
- Added: `lane`, `scope.coverage`, `scope.source_observation_count`, `scope.window` const "OOS", `library_summary` inside block.
- monthly: `sampling` (FULL/TAIL_WINDOW_V1), `total_period_count`, `omitted_transport_period_count`, `definition_id`, `includes_partial_months` const true, values add `base_at_utc_ms`/`close_at_utc_ms`, basis enum.
- episodes: `open_episode_present`, `longest_open` (replaces inferred recovered).
- curves.sampling.method = EXTREMA_BUCKET_V1 (proposed V2); distribution `sampling` UTC_DAY, bucket_basis 12-bin, integer counts; windows IS/Holdout NOT_PUBLISHED (proposed had NOT_APPLICABLE holdout).
- origin of heads is const PORTAL_DERIVED.

## Words (screens)
S09 +1 block (~45 words incl. labels); S04/S01 +1 chip word "sampled"; episodes header +2–3 words.

## Backend requests
- Endpoint/field: serve the absence reason on Report/Evidence for old seals (`SEALED_ENRICHMENT_NOT_COMPUTED` exists only in a guard fixture, no wire field). UI now shows "not published" without a code. Proposal: `enriched_analysis_availability {state, reason_code}` beside the null block.
- Preview credential for claude-preview is invalid after redeploy; needs re-provisioning for real-run browser checks.

## Screenshots
`/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/b6/shots/{before,after}-*.png`
