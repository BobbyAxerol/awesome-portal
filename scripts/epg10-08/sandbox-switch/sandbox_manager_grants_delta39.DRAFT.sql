-- DRAFT, NOT EXECUTED, NO DSN, NO PASSWORD. Sandbox Manager read path, grant DELTA for the 106-relation release (artifacts/binance-union106).
-- The executed DB step (db-step/sandbox_db_step.sh, SQL file sandbox_manager_roles_grants.DRAFT.sql, hash pinned there) granted SELECT on the 67 relations. The 106 set adds
-- 39 relations carried from the CURRENT Sandbox catalogue; schema_migration_ledger of them was already granted (identity member), so 38 grants are new.
-- Facts read from trading_system_sandbox with read-only catalogue queries (2026-11-18): all 39 exist as ordinary tables; has_table_privilege('ts_portal_manager_read', ..., 'SELECT') was
-- true only for schema_migration_ledger; no write privilege on any of the 106 relations for that role; no new index is needed (see section C).
-- Run connected to trading_system_sandbox as the owner-socket route (same route and role as the executed Part B). Do NOT edit the executed file: its sha256 is pinned in db-step.

-- ===== Part B-delta: connected to trading_system_sandbox, SELECT only (38 statements) =====
BEGIN;
GRANT SELECT ON TABLE public.alpha_ledger TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.alpha_risk_config TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_ack_evidence TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_broker_attempts TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_delivery_attempts TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_dispatch_outbox TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_stream_trim_audit TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.compatibility_surface_registry TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.compatibility_usage_daily TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.conditional_order_group_legs TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.copy_event_dead_letters TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.dead_letters TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.engine_authority_transitions TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.event_idempotency TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.execution_command_outbox TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.execution_replay_jobs TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.funding_rates TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.instrument_aliases TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.instrument_metadata_history TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.maintenance_policy_registry TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.margin_balances TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.order_bracket_legs TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.order_group_event_inbox TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.paper_account_seed TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.paper_matcher_config TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.paper_open_orders TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.performance_projection_current_state TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.portfolio_audit_log TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.projection_storage_policies TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.reconciliation_observation_buckets TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.redis_transport_epochs TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.schema_object_ownership TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.service_heartbeats TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.settlement_buckets TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.settlement_calendars TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.storage_archive_manifests TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.venue_accounts TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.venue_rate_limits TO ts_portal_manager_read;
COMMIT;

-- ===== Part C-delta: read indexes =====
-- None to create. Of the 39 added relations the serving policy marks 38 index_origin EXISTING (primary key or unique index already present; checked in pg_indexes) and
-- paper_open_orders ADDITIVE_MIGRATION: its read index idx_mgrread_paper_open_orders_32c265f172 USING btree (venue, account_id, client_order_id) is already present in the Sandbox database.
-- Consequently no new ledger row and no change of the identity-pin row count follows from this delta.

-- ===== Part D-delta: read-only verification (run after Part B-delta, before the switch) =====
SELECT count(*) FILTER (WHERE has_table_privilege('ts_portal_manager_read_sandbox_facade', c.oid, 'SELECT')) AS can_select,
       count(*) FILTER (WHERE has_table_privilege('ts_portal_manager_read_sandbox_facade', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS can_write,
       count(*) AS relations
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v') AND c.relname IN ('account_balances', 'account_equity_snapshots', 'account_policies', 'account_reservations', 'account_sync_current_state', 'account_sync_effective', 'account_sync_snapshots', 'accounts', 'alpha_deadman_heartbeats', 'alpha_ledger', 'alpha_positions', 'alpha_risk_config', 'alphas', 'arb_order_packages', 'audit_log', 'binance_fills', 'broker_account_sync_current_state', 'broker_account_sync_effective', 'broker_account_sync_snapshots', 'broker_sync_raw_hot', 'broker_sync_state_history', 'broker_sync_valuation_current_state', 'broker_sync_valuation_history', 'cash_ledger', 'command_ack_evidence', 'command_broker_attempts', 'command_delivery_attempts', 'command_dispatch_outbox', 'command_journal', 'command_stream_trim_audit', 'command_transport_bindings', 'compatibility_surface_registry', 'compatibility_usage_daily', 'conditional_order_group_legs', 'conditional_order_group_native_parents', 'conditional_order_groups', 'copy_event_dead_letters', 'copy_event_outbox', 'copy_publish_policies', 'dead_letters', 'domain_events', 'economic_account_cash_balances', 'economic_account_fact_census', 'economic_account_scope_heads', 'economic_facts', 'economic_performance_projections_v2', 'economic_reconciliation_cases', 'economic_tie_out_reports', 'engine_authority_scopes', 'engine_authority_transitions', 'engine_shadow_comparisons', 'event_idempotency', 'execution_algorithm_parents', 'execution_command_outbox', 'execution_replay_jobs', 'execution_sessions', 'fills', 'funding_accruals', 'funding_rates', 'instrument_aliases', 'instrument_metadata_history', 'instruments', 'maintenance_policy_registry', 'margin_balances', 'margin_ledger', 'operator_operations', 'order_bracket_legs', 'order_brackets', 'order_group_event_inbox', 'order_pending_exposure', 'orders', 'paper_account_seed', 'paper_matcher_config', 'paper_open_orders', 'performance_events', 'performance_projection_current_state', 'performance_snapshots', 'portfolio_allocations', 'portfolio_audit_current_state', 'portfolio_audit_log', 'portfolio_capital_ledger', 'portfolio_equity_snapshots', 'portfolios', 'positions_v2', 'projection_storage_policies', 'reconciliation_findings', 'reconciliation_observation_buckets', 'redis_transport_epochs', 'risk_grants', 'risk_pool_state_projections', 'risk_profiles', 'schema_migration_ledger', 'schema_object_ownership', 'service_heartbeats', 'settlement_buckets', 'settlement_calendars', 'settlements', 'sizing_decisions', 'source_change_journal', 'storage_archive_manifests', 'strategies', 'strategy_deployments', 'traders', 'venue_accounts', 'venue_rate_limits', 'venues');
-- expected: can_select 106, can_write 0, relations 106
