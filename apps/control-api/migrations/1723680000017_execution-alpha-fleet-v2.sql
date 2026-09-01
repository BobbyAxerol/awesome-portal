-- Alpha Fleet v2: current-source manager projection used by the reviewed
-- product composition.  Every JSON column contains bounded, non-secret facts
-- reduced by Control API; Trading System remains source authority.

ALTER TABLE execution_manager_projection_snapshots
  ADD COLUMN summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE execution_manager_projection_snapshots
  DROP CONSTRAINT execution_manager_projection_snapshots_environment_check,
  ADD CONSTRAINT execution_manager_projection_snapshots_environment_check
    CHECK (environment IN ('all', 'paper', 'sandbox', 'live'));

ALTER TABLE execution_alpha_fleet_projection
  ADD COLUMN owner text,
  ADD COLUMN stages jsonb NOT NULL DEFAULT '["RESEARCH"]'::jsonb,
  ADD COLUMN stage_filter text NOT NULL DEFAULT '|RESEARCH|',
  ADD COLUMN stage_rank smallint NOT NULL DEFAULT 0,
  ADD COLUMN portfolios jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN balances jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN position_pnl jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN exposure jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN health text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN attention_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN metrics_availability jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE execution_alpha_fleet_projection
  DROP CONSTRAINT execution_alpha_fleet_projection_environment_check,
  ADD CONSTRAINT execution_alpha_fleet_projection_environment_check
    CHECK (environment IN ('all', 'paper', 'sandbox', 'live')),
  ADD CONSTRAINT execution_alpha_fleet_stages_array
    CHECK (jsonb_typeof(stages) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_stage_rank_range
    CHECK (stage_rank BETWEEN -1 AND 4),
  ADD CONSTRAINT execution_alpha_fleet_portfolios_array
    CHECK (jsonb_typeof(portfolios) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_allocations_array
    CHECK (jsonb_typeof(allocations) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_balances_array
    CHECK (jsonb_typeof(balances) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_position_pnl_array
    CHECK (jsonb_typeof(position_pnl) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_exposure_array
    CHECK (jsonb_typeof(exposure) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_attention_array
    CHECK (jsonb_typeof(attention_reasons) = 'array'),
  ADD CONSTRAINT execution_alpha_fleet_metrics_object
    CHECK (jsonb_typeof(metrics_availability) = 'object');

CREATE INDEX execution_alpha_fleet_projection_health_idx
  ON execution_alpha_fleet_projection (scope_id, health, updated_at DESC, alpha_id DESC);

-- v1 rows are derived state and cannot satisfy the stricter v2 response.
-- Invalidate them atomically during migration so the first v2 read waits for
-- one bounded source refresh instead of serving an old-shape JSON snapshot.
DELETE FROM execution_alpha_fleet_projection;
DELETE FROM execution_manager_projection_snapshots
 WHERE projection_kind = 'ALPHA_FLEET';
