# P23-T13 — current-catalogue route refusal, not an upgrade PASS

2026-09-28 · Codex · `docs/research-loop-plan` · **scoped negative PASS / T07,T13 OPEN**.

On the existing isolated `portal-research-p23-ol12` cell, the pinned Control
API source was `19a8e81362e0e6aa3e09ad1a1c224db226c37455`; the Atlas
published `er_quantbt_111`, verified installed `quantbt-engine==1.1.1`.
`options` was listed as `DEFERRED` and `default_for_new_runs=false`. One
authenticated owner POST to the actual named preflight operation, based on the
already bound fixed-profile request with only `execution_route=options`,
returned HTTP **409** / `RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED`. The isolated
database had **53 jobs and 50 preflight manifests both before and after**.
No run, worker attempt, activation or source call was created by the negative
probe; no catalogue/default, quota or runtime flag was changed.

Private 0600 receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/t13-options-current-route-20260928.json`
SHA-256 `d22a889a77f286590fcaed532c115f6ae0f0e75696caf73cf36033ebc0ce1470`.
The receipt contains only route/release identifiers, status/code and aggregate
counts, not credentials, request body, business rows or server prose.

An exploratory `intrabar_bracket` request with the fixed profile's empty
`route_params` got HTTP 400 / `RESEARCH_PREFLIGHT_INVALID`; its shape is not a
valid admission test and is **not** counted as a route-refusal proof. It was
not used to widen an allowlist or infer that the engine cannot run that route.

This is a current-catalogue fail-closed check only. P23-T07/T13 still require
a separately validated newer Research-only build/additive field or route,
current and archived run pin checks, in-flight identity preservation, default
rollback and historical read/reproduction parity under the same 5-GB cell.
No newer QuantBT build was installed in this checkpoint; it cannot be called
upgrade qualification or a Production release receipt.
