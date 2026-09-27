# E14 — Retained integrity and report closeout

Date: 2026-09-27  
Scope: backend/contracts only; no frontend, runtime, deployment or source-system mutation.

## Outcome

- A newly retained Advanced-WFO seal records `research.current-source-integrity.v1`.
- `stitch_digest` is SHA-256 over the canonical exact observation rows that are sealed, not over a browser sample.
- `gap_scan` checks declared cadence only inside each outer-OOS fold. Intentional time between fold windows is never reported as missing market data.
- The Split BFF publishes the digest and bounded per-fold counts. A seal created before E14 returns explicit `NOT_RETAINED_LEGACY` / `NOT_PUBLISHED` facts.
- The retained P18 report labels initial/final equity, net return and drawdown as OOS facts because the retained path is the stitched outer-test path. Its six-value headline now includes exact `OOS_RETURN`.
- Existing E5 source-backed facts remain authoritative: `top_is_k`, feasible-state and selected-candidate max drawdown. No metric was sampled or invented.

## Contract surface

- `ResearchCurrentSourceSplitResponse.integrity`
- generated `components.schemas.SplitE14`
- report headline key `OOS_RETURN` (additive enum; `FUNDING` remains valid for the fixed P04 lane)

## Compatibility

- Old retained seals remain readable and receive typed legacy absence.
- No seal is rewritten.
- No frontend fallback was changed.
- The runtime schema and OpenAPI response both require the same integrity block on Split responses.

## Verification

- Current-source + report focused Vitest: 36/36 pass.
- Additional report/contract suite: 22 pass; the migration suite required an intentionally absent local PostgreSQL and is covered by the repository disposable-Postgres gate.
- Control API build and typecheck: pass.
- Python exporter test adds both the real-WFO no-gap assertion and a synthetic single-hole assertion; it is executed by the standard Portal backend gate/pre-commit environment.

## Frontend handoff

Claude may render `Split.integrity` as a compact digest/gap proof and consume `OOS_RETURN` in S09. It must retain typed legacy absence and must not recompute gaps, hashes or OOS return in the browser.
