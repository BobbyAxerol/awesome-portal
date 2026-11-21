# QuantBT Backtest Transparency — Release v1.0 (spec pack)

Frozen: 2026-09-15 · 14 hi-fi screens (.dc.html) + 4 spec docs. Engine: quantbt v1.1.1 (`er_quantbt_1_1_1`). Theme: Research Light, portal tokens verbatim.

## Contents
- `01_IA_AND_WIRING.md` — screen map, flow order, cursor/hash contract, invariants, scale readiness
- `02_SCREEN_SPECS.md` — per-screen spec: purpose, data, states, interactions, links, acceptance
- `03_ALPHA_RC_BINDING.md` — alpha → av_ → run → rc_ chain, change taxonomy, publish payload, approval mirror
- `04_ENGINE_ROUTE_MATRIX.md` — 14 execution routes, contract→cert axes, J₁…J₅ formulas (LaTeX), mode×schedule claims, sweep/pin params, fold-plan formula
- `ALPHA_LIFECYCLE_ENGINE_EXPLOITATION_PLAN.md` — decision record (P-1…P-8, all implemented)

## Running
Static hosting (Netlify drag-drop): deploy the folder as-is; `index.html` redirects to `QuantBT 00 Journey Map`. All screens link both ways; `uploads/portal-hifi/` carries the shipped-portal references the Journey Map cites.

## Version freeze
- Sizes: title 22px/300, subtitle 13.5px, content 16/24px gutter, card radius 8px, max-width 1240–1440 (06: 1560 by design)
- Console-clean standard: 0 errors, 0 unresolved-hole warnings
- Canonical demo identifiers: run R-WFO-118 · att_04 · alpha_7f2 (alpha_momentum_btc) · av_0_9_3 (sha256:3fe4a1) · θ* prm_7c1a9e · config sha256:88ae02 · engine image sha256:90d1c2 · fold digests prm_9d44f2 · 3b81c7 · 7c1a9e · c25a1d · 66e09b
