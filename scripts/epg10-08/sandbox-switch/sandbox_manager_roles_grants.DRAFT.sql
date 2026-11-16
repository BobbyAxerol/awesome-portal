-- DRAFT, NOT EXECUTED, NO DSN, NO PASSWORD. Sandbox Manager read path: roles, grants and read indexes for database trading_system_sandbox.
-- For the owner-socket route (a human or an approved operator runs it, as ts_sbx_provisioner or a superuser). Written 2026-11-16 from the checked facts in
-- sandbox-offline/SANDBOX_READ_PATH_PLAN.md and the item 0 note; the 67 relation list is the committed release file of this package.
-- Part A (cluster level, once). Part B (connected to trading_system_sandbox): CONNECT + SELECT. Part C: read indexes. Part D: read-only verification.
-- A role/login name and every password are owner decisions (see docs/SANDBOX_SWITCH_PLAN_20261116.md section 6).

-- ===== Part A: cluster level =====
-- A1 (choose one):
--   (a) a separate login, so the Sandbox pool does not share connlimit 12 of ts_portal_manager_read_facade (proposed)
CREATE ROLE ts_portal_manager_read_sandbox_facade LOGIN NOINHERIT CONNECTION LIMIT 4 PASSWORD '<host step: secret file, never in this file>';
GRANT ts_portal_manager_read TO ts_portal_manager_read_sandbox_facade;
ALTER ROLE ts_portal_manager_read_sandbox_facade SET default_transaction_read_only = on;
ALTER ROLE ts_portal_manager_read_sandbox_facade SET statement_timeout = '5000ms';
ALTER ROLE ts_portal_manager_read_sandbox_facade SET lock_timeout = '1000ms';
ALTER ROLE ts_portal_manager_read_sandbox_facade SET idle_in_transaction_session_timeout = '10000ms';
--   (b) reuse ts_portal_manager_read_facade (already exists, connlimit 12 shared with the Paper pools): skip A1(a) and use that login in the new DSN.
-- A2: the group role ts_portal_manager_read already exists (NOLOGIN, NOINHERIT, connlimit 4).
-- pg_hba (host step, not SQL): one hostssl line for the login + database trading_system_sandbox from the Manager container address, same method as the Paper
-- line. The Paper line itself was not readable from here (not checked); copy its method (TLS verify, scram) and restrict database and address.

-- ===== Part B: connected to trading_system_sandbox =====
GRANT CONNECT ON DATABASE trading_system_sandbox TO ts_portal_manager_read, ts_portal_manager_read_sandbox_facade;
GRANT USAGE ON SCHEMA public TO ts_portal_manager_read;                       -- confirm it is already granted; harmless if so
-- the schema migration ledger, read by the Manager for the identity member (ledger row count)
GRANT SELECT ON TABLE public.schema_migration_ledger TO ts_portal_manager_read;
-- SELECT only, the 67 catalogue relations (47 tables + 2 views of the base 49, the five shared references, the 13 T1 tables)

GRANT SELECT ON TABLE public.account_balances TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.account_equity_snapshots TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.account_policies TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.account_reservations TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.account_sync_current_state TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.account_sync_effective TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.account_sync_snapshots TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.accounts TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.alpha_deadman_heartbeats TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.alpha_positions TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.alphas TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.arb_order_packages TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.audit_log TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.binance_fills TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_account_sync_current_state TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_account_sync_effective TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_account_sync_snapshots TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_sync_raw_hot TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_sync_state_history TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_sync_valuation_current_state TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.broker_sync_valuation_history TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.cash_ledger TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_journal TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.command_transport_bindings TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.conditional_order_group_native_parents TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.conditional_order_groups TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.copy_event_outbox TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.copy_publish_policies TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.domain_events TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_account_cash_balances TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_account_fact_census TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_account_scope_heads TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_facts TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_performance_projections_v2 TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_reconciliation_cases TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.economic_tie_out_reports TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.engine_authority_scopes TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.engine_shadow_comparisons TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.execution_algorithm_parents TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.execution_sessions TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.fills TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.funding_accruals TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.instruments TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.margin_ledger TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.operator_operations TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.order_brackets TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.order_pending_exposure TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.orders TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.performance_events TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.performance_snapshots TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.portfolio_allocations TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.portfolio_audit_current_state TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.portfolio_capital_ledger TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.portfolio_equity_snapshots TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.portfolios TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.positions_v2 TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.reconciliation_findings TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.risk_grants TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.risk_pool_state_projections TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.risk_profiles TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.settlements TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.sizing_decisions TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.source_change_journal TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.strategies TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.strategy_deployments TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.traders TO ts_portal_manager_read;
GRANT SELECT ON TABLE public.venues TO ts_portal_manager_read;

-- ===== Part C: read indexes the policy needs (ADDITIVE_MIGRATION origin) =====
-- The 9 T1 relations with index_origin ADDITIVE_MIGRATION and portfolio_equity_snapshots (ts, id). Names are drafts (TS owns the final naming and the migration
-- file, and the ledger row it adds). Use CONCURRENTLY outside a transaction on busy tables: source_change_journal has about 40,690 rows in the sandbox database.
-- Whether any of these already exist in trading_system_sandbox was NOT checked (Part D lists them).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_alpha_deadman_heartbeats_fe54de3619 ON public.alpha_deadman_heartbeats USING btree (mode, venue, alpha_id, account_id, symbol);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_conditional_order_group_native_parents_e2a51b4648 ON public.conditional_order_group_native_parents USING btree (mode, venue, group_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_economic_facts_b191353bdb ON public.economic_facts USING btree (mode, venue, economic_fact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_economic_performance_projections_v2_1a5e84b600 ON public.economic_performance_projections_v2 USING btree (mode, venue, source_cell_id, source_database_id, continuity_epoch, product, physical_account_ref, reporting_currency);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_economic_reconciliation_cases_9cfd5d29bf ON public.economic_reconciliation_cases USING btree (mode, venue, case_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_economic_tie_out_reports_10e93f2dda ON public.economic_tie_out_reports USING btree (mode, venue, report_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_execution_algorithm_parents_9c17f2a75b ON public.execution_algorithm_parents USING btree (mode, venue, parent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_risk_pool_state_projections_b8c0ae198b ON public.risk_pool_state_projections USING btree (mode, venue, risk_pool_key);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_source_change_journal_e129b5d6f9 ON public.source_change_journal USING btree (mode, venue, source_event_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mgrread_portfolio_equity_ts_id ON public.portfolio_equity_snapshots USING btree (ts, id);   -- column order assumed from the policy key terms (ts, id); TS to confirm the Paper definition

-- ===== Part D: read-only verification (run after A-C, before any switch) =====
-- D1 privileges: every catalogue relation readable, nothing writable (the Manager rejects any write privilege, catalogue.py checks it)
SELECT c.relname, has_table_privilege('ts_portal_manager_read_sandbox_facade', c.oid, 'SELECT') AS can_select,
       has_table_privilege('ts_portal_manager_read_sandbox_facade', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v') AND c.relname IN ('account_balances', 'account_equity_snapshots', 'account_policies', 'account_reservations', 'account_sync_current_state', 'account_sync_effective', 'account_sync_snapshots', 'accounts', 'alpha_deadman_heartbeats', 'alpha_positions', 'alphas', 'arb_order_packages', 'audit_log', 'binance_fills', 'broker_account_sync_current_state', 'broker_account_sync_effective', 'broker_account_sync_snapshots', 'broker_sync_raw_hot', 'broker_sync_state_history', 'broker_sync_valuation_current_state', 'broker_sync_valuation_history', 'cash_ledger', 'command_journal', 'command_transport_bindings', 'conditional_order_group_native_parents', 'conditional_order_groups', 'copy_event_outbox', 'copy_publish_policies', 'domain_events', 'economic_account_cash_balances', 'economic_account_fact_census', 'economic_account_scope_heads', 'economic_facts', 'economic_performance_projections_v2', 'economic_reconciliation_cases', 'economic_tie_out_reports', 'engine_authority_scopes', 'engine_shadow_comparisons', 'execution_algorithm_parents', 'execution_sessions', 'fills', 'funding_accruals', 'instruments', 'margin_ledger', 'operator_operations', 'order_brackets', 'order_pending_exposure', 'orders', 'performance_events', 'performance_snapshots', 'portfolio_allocations', 'portfolio_audit_current_state', 'portfolio_capital_ledger', 'portfolio_equity_snapshots', 'portfolios', 'positions_v2', 'reconciliation_findings', 'risk_grants', 'risk_pool_state_projections', 'risk_profiles', 'settlements', 'sizing_decisions', 'source_change_journal', 'strategies', 'strategy_deployments', 'traders', 'venues')
ORDER BY 1;                                 -- expected: 67 rows, can_select true, can_write false
-- D2 identity inputs the Manager will report (name, OID, ledger rows)
SELECT current_database(), (SELECT oid FROM pg_database WHERE datname = current_database()) AS database_oid, (SELECT count(*) FROM public.schema_migration_ledger) AS ledger_rows;
-- D3 the 10 read indexes
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_mgrread_%' ORDER BY 1;
-- D4 role settings and connection limit
SELECT rolname, rolconnlimit, rolcanlogin FROM pg_roles WHERE rolname IN ('ts_portal_manager_read','ts_portal_manager_read_sandbox_facade','ts_portal_manager_read_facade');
-- ===== Rollback (only after the Manager no longer uses the login) =====
-- REVOKE SELECT ON ... FROM ts_portal_manager_read;  (one statement per relation above) ; REVOKE CONNECT ON DATABASE trading_system_sandbox FROM ts_portal_manager_read, ts_portal_manager_read_sandbox_facade;
-- DROP ROLE ts_portal_manager_read_sandbox_facade;   -- indexes may stay (additive, harmless)
