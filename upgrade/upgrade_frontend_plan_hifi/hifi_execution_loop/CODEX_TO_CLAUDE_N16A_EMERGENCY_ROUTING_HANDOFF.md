# Codex → Claude: N16A source-dark emergency routing

Backend status: `N16A_COMPLETE_SOURCE_DARK / PRODUCTION_INACTIVE`  
Frontend authority change: typed component/failure contracts only  
Public route, origin or Execution command change: none

## What Claude may consume now

- Generated types:
  `packages/contracts/generated/execution-emergency-routing.d.ts`.
- Canonical profile and UI/failure corpus:
  `packages/contracts/fixtures/execution-emergency-routing.*.valid.json`.
- The only browser-visible origin is `https://portal.primusspark.com`; the
  future path is `/ops/emergency/*`. Do not add an internal host, cross-origin
  client, token input or Cloudflare/AWS configuration to the browser.
- `SOURCE_DARK`, `DEGRADED`, `UNAVAILABLE` and `ROLLBACK` are distinct states.
  Command-independent health may remain visible even when every command is
  unavailable.

## Required UI truth

- Do **not** render a break-glass control in a product route yet. The canonical
  profile has `n12_r3_catalogue_published=false`,
  `dedicated_command_identity_bound=false` and PLAN/APPLY/VERIFY false.
- Research loss may show `execution_ops` as a future candidate/profile fact,
  but never as an active route. Effective `route_target` remains `NONE`.
- Cloudflare loss is unavailable, not a cue to reveal or navigate directly to
  an internal origin.
- Keep the emergency surface minimal: dependency state, authoritative reason,
  freshness/health and audit disclosure. Do not enlarge sparse content or
  repeat policy prose/hashes in the masthead, KPI strip or right rail.
- Use the same Carbon Execution visual grammar, type scale and density as the
  rest of Execution Loop. This is one Portal, not a dark-theme sub-product.
- Full record hashes belong only in diagnostics/audit details.
- Unknown reason/state fails closed and hides actions; it does not fall back to
  READY.

## Future ceremony shape, not current authority

The types lock a future R3 ceremony: short Portal session, phishing-resistant
step-up, exact actor/incident/resource, reason, expiry, typed confirmation, two
distinct approvals and immutable audit. This may be represented only in the
fixture gallery for now.

The emergency path is protective R3 only: halt, reduce and emergency close.
Resume and scale are R4 risk-increasing and must never appear in the emergency
surface or inherit its session/approval path.

## Claude's parallel lane

Claude can integrate the four typed failure states into the V2 diagnostics and
minimal unavailable/degraded anatomy while continuing the ten-phase visual/
interaction refactor. No frontend task needs to wait for N16B, but no smoke
fixture may be relabelled real/live.

N16B later replaces evidence, not UI architecture. It requires accepted N12 R3
owner bytes, dedicated command identity, N15B and an owner window; only then can
the real same-domain R3 path be acceptance-tested. Backend proceeds next with
N17A source-dark SLO/DR/game-day preparation.
