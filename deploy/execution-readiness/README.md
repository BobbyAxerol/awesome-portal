# N17A source-dark production/DR preparation

Status: `SOURCE_DARK / UNMOUNTED / PRODUCTION_INACTIVE`

This directory is a non-secret, offline blueprint for Portal-owned production
readiness. Nothing here is included by Compose, Nginx, Cloudflare, Prometheus or
Grafana. It creates no route, datasource, credential, backup schedule, alert or
runtime process.

The files deliberately separate provisional qualification from production
evidence:

- `slo-alerts.source-dark.yml` defines future recording/alert expressions and
  an authority-violation alarm. It is not a production availability claim.
- `grafana-dashboard.source-dark.json` provides the future operator panel
  layout with no bound datasource.
- `capacity-retention-cost.source-dark.json` freezes corpus/cardinality and
  backup-retention minimums while leaving the monthly cost ceiling owner-gated.
- `rotation-inventory.source-dark.json` defines five distinct identity families,
  overlap/revoke order and compromise containment without secret material.
- `owner-matrix.source-dark.json` assigns Portal/Trading System responsibilities
  and preserves Bobby's final release authority.
- `game-day-plan.source-dark.json` orders the eight isolated N17A scenarios and
  makes any network/source/command attempt an abort.

Use `scripts/execution-n17a-production-dr-test.sh` for the isolated rehearsal.
It creates only exact test-owned Docker resources and a temporary evidence
directory, then removes both. It must not point at stable/dev databases or any
AWS-HK/Trading System address.

N17B may derive a separate owner-approved runtime configuration only after
N13B–N16B are accepted for one exact profile and change window. Do not promote
these templates by flipping booleans.
