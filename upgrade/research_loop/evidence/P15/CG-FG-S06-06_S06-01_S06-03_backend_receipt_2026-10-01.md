# B3 S06 digest, selector and grid — backend receipt

Status: BACKEND_CANDIDATE; exact-HEAD preview receipt required before acceptance.

- CG-FG-S06-06: `Trial.params_digest` uses `sha256ResearchJson(trial.parameters)`, same canonical rule as selected θ*. `search_contract.requested_seed` comes only from the immutable P08 admitted request joined by run, preflight token, actor and digest. It is labeled `ADMITTED_RUN_REQUEST_BASE_SEED`, never a per-trial sampler seed. Missing P08 request is typed `P08_REQUESTED_SPEC_NOT_RETAINED`.
- CG-FG-S06-01: `search_contract.selector_confidence` is CONFIRMED only when `candidate_selection_metric` exists in the sealed QuantBT source fact; otherwise NOT_PUBLISHED with `QUANTBT_SELECTOR_METRIC_NOT_IN_SEALED_SEARCH_FACT`. No inferred/default selector is manufactured.
- CG-FG-S06-03: `surface.grid` is a bounded 6×6 mean-IS-objective grid from every retained COMPLETE trial, independent of ledger pagination. It names its derivation rule, axes, covered count and each cell's n/mean. Zero-count cells have null mean; non-IS or single-axis sources have typed absence.
- Generated contract: `packages/contracts/generated/research-current-source.d.ts` (`Trial`, `Search.search_contract`, `SearchSurface.grid`); canonical example: `packages/contracts/fixtures/research-current-source.search-surface.valid.json`. Additive fields preserve old-client omission.
- Focused tests: S06 E5/X2 34/34; contracts 204/204; Control API TypeScript build green. Full hook and exact-HEAD preview pending.
- Claude FE handoff: bind exact digest, request-scoped seed, confirmed/absent selector and named grid; keep the approved S06 layout and typed absences. Do not display the request seed as a per-trial seed or relabel `rvol` as `entry_z` without an explicit mapping.
