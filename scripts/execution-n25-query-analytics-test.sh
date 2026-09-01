#!/usr/bin/env bash
# N25 static contract, bounds, source-honesty and rollback gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m json.tool \
  "${ROOT_DIR}/deploy/manifests/query-analytics-release-profile.v1.json" \
  >/dev/null

python3 - "${ROOT_DIR}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "deploy/manifests/query-analytics-release-profile.v1.json").read_text())
assert manifest["phase"] == "N25"
assert manifest["projection_schema"] == "portal.execution.manager-projection.v2"
assert manifest["projection_adapter"] == "portal.execution.manager-projection.manager-v2.runtime.v4"
assert manifest["required_new_feed_count"] == 13
assert manifest["historical_receipt_feed_counts"] == [12, 13]
assert len(manifest["required_relations"]) == 13
assert len(set(manifest["required_relations"])) == 13
assert set(manifest["required_relations"]) == {
    "public.strategy_deployments", "public.orders", "public.fills",
    "public.positions_v2", "public.accounts", "public.reconciliation_findings",
    "public.portfolios", "public.account_balances", "public.account_policies",
    "public.account_reservations", "public.portfolio_allocations",
    "public.risk_profiles", "public.domain_events",
}
assert set(manifest["subject_routes"]) == {"DEPLOYMENT", "ALPHA", "PORTFOLIO", "LIVE_GATE"}
bounds = manifest["bounds"]
assert bounds == {
    "maximum_source_facts": 20000,
    "repository_queries_per_request": 1,
    "maximum_currency_partitions": 64,
    "maximum_chart_series": 20,
    "maximum_input_points_per_series": 20000,
    "maximum_output_points_per_series": 5000,
    "maximum_correlation_alphas": 20,
    "maximum_correlation_pairs": 190,
    "maximum_replay_rows": 200,
    "maximum_positions": 500,
    "maximum_response_bytes": 2097152,
}
assert set(manifest["typed_external_gaps"].values()) == {
    "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED",
    "N28_BENCHMARK_SERIES_SOURCE_NOT_ACTIVATED",
    "N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED",
    "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
}
assert manifest["typed_current_source_gaps"] == {
    "historical_time_series": "N25_CURRENT_SOURCE_HISTORY_NOT_INCREMENTAL",
    "execution_session_quality": "N25_CURRENT_SOURCE_SESSIONS_NOT_INCREMENTAL",
}
flags = manifest["candidate_flags"]
assert flags["edge_analytics_query"] is True
assert flags["control_api_execution_analytics_query"] is True
assert flags["edge_realtime_sse"] is False
assert flags["edge_command_relay"] is False
assert manifest["rollback"]["disable_analytics_only"] is True
assert manifest["rollback"]["source_or_trading_system_mutation"] is False

analytics = (root / "services/portal-execution-edge-rs/crates/analytics/src/manager_plane.rs").read_text()
repository = (root / "services/portal-execution-edge-rs/crates/projection-store-pg/src/manager_query_analytics.rs").read_text()
chart = (root / "services/portal-execution-edge-rs/crates/analytics/src/chart.rs").read_text()
mapper = (root / "services/portal-execution-edge-rs/crates/manager-projection/src/lib.rs").read_text()
migration = (root / "services/portal-execution-edge-rs/crates/projection-store-pg/migrations/0013_manager_query_analytics.sql").read_text()
controller = (root / "apps/control-api/src/execution/analytics.controller.ts").read_text()
proxy = (root / "apps/control-api/src/execution/analytics.proxy.ts").read_text()
edge_overlay = (root / "deploy/execution-manager-v2/compose.analytics.yaml").read_text()
bff_overlay = (root / "deploy/compose.execution-manager-analytics.yaml").read_text()

for token in ("MAX_MANAGER_ANALYTICS_FACTS", "exact_partitions", "equity_and_contribution_series", "manager_correlation", "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED", "N25_CURRENT_SOURCE_HISTORY_NOT_INCREMENTAL", "N25_CURRENT_SOURCE_SESSIONS_NOT_INCREMENTAL"):
    assert token in analytics
for token in ("N25_MANAGER_ANALYTICS_MAX_FACTS", "N25_MANAGER_ANALYTICS_REPOSITORY_QUERIES", "LIMIT 20001", "public.strategy_deployments"):
    assert token in repository
for token in ("chart-series.rules.v1", "MAX_SERIES_POINTS", "ExtremaStrideV1"):
    assert token in chart
assert "pub const FEEDS: [ManagerProjectionFeed; 13]" in mapper
assert "feed_count IN (12, 13)" in migration
for token in ("/deployments/:deploymentId/query-analytics", "/alphas/:alphaId/query-analytics", "/portfolios/:portfolioId/query-analytics", "/live-gates/:approvalId/query-analytics"):
    assert token in controller
for token in ("managerQueryAnalyticsTarget", "FEATURE_EXECUTION_ANALYTICS_QUERY"):
    assert token in proxy
edge_service = (root / "services/portal-execution-edge-rs/crates/edge-service/src/main.rs").read_text()
assert "manager_projection_authorize(&state, &headers, subject_kind.source_screen_id())" in edge_service
assert "current_source_authorize(&state, &headers, subject_kind.source_screen_id())" not in edge_service
for overlay in (edge_overlay, bff_overlay):
    assert 'ANALYTICS_QUERY' in overlay
    assert 'REALTIME_SSE' in overlay
    assert 'COMMAND_RELAY' in overlay
    assert 'ANALYTICS_QUERY_ENABLED: "true"' in overlay or 'FEATURE_EXECUTION_ANALYTICS_QUERY: "true"' in overlay
    assert 'REALTIME_SSE_ENABLED: "false"' in overlay or 'FEATURE_EXECUTION_REALTIME_SSE: "false"' in overlay
    assert 'COMMAND_RELAY_ENABLED: "false"' in overlay or 'FEATURE_EXECUTION_COMMAND_RELAY: "false"' in overlay

serialized = json.dumps(manifest, sort_keys=True).lower()
for forbidden in ("-----begin", "authorization: bearer", "private_key", "client_secret", "api_key", "password", "postgres://", "redis://"):
    assert forbidden not in serialized
PY

bash -n "${ROOT_DIR}/scripts/execution-n25-query-analytics-test.sh"
printf '%s\n' 'N25 query/analytics contract, bounds, source-honesty and rollback gates passed.'
