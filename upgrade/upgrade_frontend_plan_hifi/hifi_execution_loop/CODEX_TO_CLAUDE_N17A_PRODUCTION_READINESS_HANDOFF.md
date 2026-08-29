# Codex → Claude: N17A source-dark production-readiness handoff

Backend status: `N17A_COMPLETE_SOURCE_DARK /
N17B_JOINT_PRODUCTION_ACCEPTANCE_PENDING / PRODUCTION_INACTIVE`

## What is now safe to consume

- Generated types:
  `packages/contracts/generated/execution-production-readiness.d.ts`
- Canonical source-dark profile:
  `packages/contracts/fixtures/execution-production-readiness.source-dark.valid.json`
- Eight-state game-day corpus:
  `packages/contracts/fixtures/execution-production-readiness.game-day-corpus.valid.json`
- Component contract:
  `packages/contracts/openapi/execution-production-readiness.openapi.json`

The contract has no paths or servers. It is a typed view-model boundary for the
future hardening/operations screen, not a callable production API.

## UI semantics

Claude may implement the Phase 18 diagnostic/readiness presentation now:

1. show a compact `Source-dark preparation` state, not `Production ready`;
2. label every latency number `Provisional budget`, never measured SLO;
3. render error budget, production RPO/RTO and monthly cost as `Not measured /
   owner decision pending`, not zero;
4. show recovery/rotation/game-day rows as local rehearsal coverage with the
   exact scenario/status vocabulary;
5. keep availability, source, command and production controls absent/disabled;
6. use one Carbon visual grammar and the established compact operator scale;
7. put hashes/digests only inside an optional Evidence disclosure, never the
   masthead, KPI row, primary table or right rail.

The main screen should prioritize: overall authority state → recovery/rotation
coverage → current blockers → scenario evidence. Long explanations belong in a
Drawer/Details disclosure. Do not turn sparse data into oversized typography.

## Required typed states

- `PROVISIONAL_QUALIFICATION_ONLY`
- `NOT_MEASURED`
- `SOURCE_DARK`
- `OFFLINE_ISOLATED_QUALIFICATION`
- `N17B_JOINT_PRODUCTION_ACCEPTANCE_PENDING`

Missing data remains null/typed unavailable. Do not invent uptime, burn rate,
RPO, RTO, cost or datasource values.

## Prohibited frontend behavior

- no production-ready badge;
- no Start/Promote/Activate/Rotate/Restore/Failover button;
- no hidden call to AWS-HK, Trading System or a future metrics origin;
- no browser-visible internal host, token, certificate, key, DSN or secret;
- no claim that fixture/local-PITR evidence is a real production measurement;
- no automatic escalation from an N17A PASS to a delivery-profile change.

## What N17B will add later

After N13B–N16B and an exact owner window, backend will bind the accepted real
metrics/evidence source and publish a separate production acceptance contract.
Claude must continue showing source-dark/unavailable semantics until that
contract and registry profile are explicitly delivered; do not infer N17B from
this handoff.
