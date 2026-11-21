// Generated from pinned Edge logical contracts. Do not edit; no runtime qualification.
export const EXECUTION_PUBLICATION_CATALOGUE = {
  "schema_version": "portal.execution.publication-catalogue.v1",
  "lane": "SOURCE_CONTRACT_NOT_RUNTIME_ACCEPTANCE",
  "source_catalogue_digest": "sha256:9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67",
  "field_dictionary_digest": "sha256:aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e",
  "metric_dependencies_digest": "sha256:9c945880e821ecec4b5f56f85c5de15d506817cb07984300b824b4f5390c5a31",
  "families": [
    {
      "family_id": "user_identity_mapping",
      "authority_owner": "TS identity/membership",
      "grain": "user_id/issuer/subject",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "portfolio_registry",
      "authority_owner": "TS registry; TS identity/membership",
      "grain": "portfolio_id/root_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "portfolio_membership",
      "authority_owner": "TS identity/membership",
      "grain": "membership_id/portfolio_id/user_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "alpha_registry",
      "authority_owner": "TS registry",
      "grain": "alpha_id/alpha_version_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "alpha_ownership",
      "authority_owner": "TS identity/membership; TS registry",
      "grain": "alpha_id/owner_user_id/effective interval",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "deployment_registry",
      "authority_owner": "TS registry; TS profile/binding",
      "grain": "deployment_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "internal_accounts",
      "authority_owner": "TS registry; TS profile/binding",
      "grain": "account_id/deployment_id/currency",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "venue_physical_account_registry",
      "authority_owner": "TS profile/binding; TS registry",
      "grain": "venue/physical_account_id/profile",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "account_binding",
      "authority_owner": "TS profile/binding",
      "grain": "binding_id/revision/effective interval",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "root_capital_limit",
      "authority_owner": "TS capital/admission",
      "grain": "root_id/currency/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "economic_capital_assignment",
      "authority_owner": "TS capital/admission; TS economics/accounting",
      "grain": "assignment_id/fact_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "budget_entitlement",
      "authority_owner": "TS capital/admission",
      "grain": "budget_id/parent/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "execution_grant_reservation",
      "authority_owner": "TS execution; TS risk/lock/recall",
      "grain": "grant_id/reservation_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "administrative_locks",
      "authority_owner": "TS risk/lock/recall",
      "grain": "lock_id/scope/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "recall_requests",
      "authority_owner": "TS risk/lock/recall",
      "grain": "recall_id/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "trading_state",
      "authority_owner": "TS risk/lock/recall; TS execution",
      "grain": "scope/state_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "order_intents",
      "authority_owner": "TS execution; TS economics/accounting",
      "grain": "intent_id/idempotency scope",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "obligations_unknown_execution_outcomes",
      "authority_owner": "TS execution; TS economics/accounting; TS risk/lock/recall",
      "grain": "obligation_id/recovery_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "orders_execution_status",
      "authority_owner": "TS execution; TS economics/accounting",
      "grain": "order_id/entity_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "fills",
      "authority_owner": "TS execution; TS economics/accounting",
      "grain": "fill_id/source_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "positions_episodes",
      "authority_owner": "TS economics/accounting",
      "grain": "position_id/episode_id/entity_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "balances_collateral",
      "authority_owner": "TS economics/accounting; TS profile/binding",
      "grain": "account_id/currency/observation_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "fees_funding",
      "authority_owner": "TS economics/accounting",
      "grain": "fee_or_funding_id/correction_ref",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "accounting_postings_corrections",
      "authority_owner": "TS economics/accounting",
      "grain": "posting_id/leg_id/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "economic_journal",
      "authority_owner": "TS economics/accounting; TS journal/publication",
      "grain": "transaction_group_id/index/commit_order",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "valuation_prices_used",
      "authority_owner": "TS economics/accounting; DL admission/TS valuation",
      "grain": "valuation_id/instrument/currency/source_cut",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "risk_state_limits",
      "authority_owner": "TS risk/lock/recall; TS execution",
      "grain": "scope/model_revision/limit_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "reconciliation",
      "authority_owner": "TS economics/accounting; TS profile/binding",
      "grain": "run_id/break_id/resolution_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "command_receipts",
      "authority_owner": "TS capital/admission; TS risk/lock/recall; Portal projection owner",
      "grain": "command_id/idempotency_scope",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "operational_audit",
      "authority_owner": "TS identity/membership; TS capital/admission; TS risk/lock/recall; TS economics/accounting; Portal projection owner",
      "grain": "audit_event_id/actor/policy_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "publication_catalogue_manifest",
      "authority_owner": "TS journal/publication",
      "grain": "catalogue_digest/manifest_id/permit_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "sync_health_cursor_retention",
      "authority_owner": "TS journal/publication; Portal projection owner; DL admission/TS valuation",
      "grain": "hop/dataset/partition/epoch/checkpoint",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "recovery_quality_events",
      "authority_owner": "TS economics/accounting; TS journal/publication; Portal projection owner; DL admission/TS valuation",
      "grain": "recovery_id/quality_event_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "report_snapshots",
      "authority_owner": "TS PM report publisher; Research analytics; Portal projection owner",
      "grain": "report_id/hash/source_cut",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "qbts_per_alpha",
      "authority_owner": "Research analytics",
      "grain": "economic_subject_ref/comparable_basis_id/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "manager_alpha_score",
      "authority_owner": "Research analytics; TS capital/admission; TS identity/membership",
      "grain": "manager_book/allocation_snapshot_id/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "portfolio_score",
      "authority_owner": "Research analytics; TS economics/accounting",
      "grain": "portfolio_id/consolidation_manifest_id/revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "regime_fit",
      "authority_owner": "Research analytics",
      "grain": "run_id/exact_binding/reference_snapshot_id",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "archive_paper_watch",
      "authority_owner": "Research analytics; Portal projection owner",
      "grain": "watch_id/origin_deployment_id/clone_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "portal_identity_profile_session",
      "authority_owner": "Portal identity/session owner",
      "grain": "workspace/user/session/policy_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "fund_portfolio_overview",
      "authority_owner": "Portal projection owner; TS capital/admission; TS economics/accounting; TS PM report publisher",
      "grain": "portfolio_id/source_set/currency/window",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    },
    {
      "family_id": "alpha_fleet_overview",
      "authority_owner": "Portal projection owner; TS registry; TS identity/membership",
      "grain": "five-ID tuple/dataset/window/publication_revision",
      "availability": "UNAVAILABLE",
      "reason_code": "NEW_EDGE_V1_EXPORT_NOT_QUALIFIED",
      "history_capability": "UNKNOWN",
      "history_full": false,
      "retention": {
        "from_ms": null,
        "to_ms": null,
        "duration_ms": null,
        "proof_ref": null
      },
      "runtime_enabled": false
    }
  ],
  "fields": [
    {
      "field_id": "new_risk_capacity",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "amount_locked",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "recall_pending",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "alpha_id",
      "scalar_type": "ID",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "alpha_version_id",
      "scalar_type": "ID",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "owner_user_id",
      "scalar_type": "ID",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "portfolio_id",
      "scalar_type": "ID",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "financial_stage",
      "scalar_type": "ENUM",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "lifecycle",
      "scalar_type": "ENUM",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "allocation_weight",
      "scalar_type": "DECIMAL",
      "unit": "RATIO",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "management_budget",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "margin_risk_requirement",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "economic_backing",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "exposure_cap",
      "scalar_type": "DECIMAL",
      "unit": "MODEL_DEFINED",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "pnl",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "unrealized_pnl",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "account_balance",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "equity30d_end",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "return30d_pct",
      "scalar_type": "DECIMAL",
      "unit": "PERCENT",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "health",
      "scalar_type": "ENUM",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "source_status",
      "scalar_type": "ENUM",
      "unit": null,
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "raw_q",
      "scalar_type": "DECIMAL",
      "unit": "POINTS",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "contribution",
      "scalar_type": "DECIMAL",
      "unit": "POINTS",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "alpha_score",
      "scalar_type": "DECIMAL",
      "unit": "POINTS",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "portfolio_score",
      "scalar_type": "DECIMAL",
      "unit": "POINTS",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "regime_distance",
      "scalar_type": "DECIMAL",
      "unit": "DISTANCE",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "initial_funds",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "added_funds",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "returned_funds",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "nav",
      "scalar_type": "DECIMAL",
      "unit": "MONEY",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    },
    {
      "field_id": "as_of_ms",
      "scalar_type": "UTC_MS",
      "unit": "UTC_MS",
      "availability": "UNAVAILABLE",
      "reason_code": "SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED"
    }
  ],
  "current_page_adapter": {
    "status": "EXISTING_SEPARATE_AUTHORITY",
    "history_capability": "CURRENT_ONLY",
    "stable_snapshot": false,
    "authoritative_replay": false,
    "maximum_rows": 200,
    "maximum_response_bytes": 1048576,
    "total_history_cap": null
  }
} as const;
export const EXECUTION_METRIC_DEPENDENCIES = {
  "raw_alpha_score": [
    "canonical_nav",
    "external_flow_grid",
    "cost_coverage",
    "fx_policy",
    "stress_policy",
    "compatible_watermarks",
    "approved_runtime_config"
  ],
  "contribution": [
    "raw_alpha_score",
    "allocation_snapshot"
  ],
  "manager_alpha_score": [
    "raw_alpha_score",
    "allocation_snapshot",
    "full_economic_denominator",
    "allocation_coverage"
  ],
  "portfolio_score": [
    "consolidated_nav",
    "unique_economic_facts",
    "external_flow_grid",
    "cost_coverage",
    "fx_policy",
    "stress_policy",
    "compatible_watermarks",
    "approved_runtime_config",
    "consolidation_manifest"
  ],
  "regime_fit": [
    "exact_research_run_binding",
    "feature_cutoff",
    "reference_snapshot",
    "no_lookahead_policy"
  ],
  "archive_paper_watch": [
    "approved_watch_policy",
    "origin_lineage",
    "source_set",
    "paper_clone_disposition"
  ]
} as const;
