/**
 * Phase 10 and 11 wire documents, inlined for the fixture port.
 *
 * GENERATED from `packages/contracts/fixtures/`. `certification.test.tsx`
 * compares these against the published files on every run.
 */

export const SANDBOX_CERTIFICATION_FIXTURE = {
  "schema_version": "governance.sandbox-certification.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "source_side_effect_requested": false,
  "runtime_activation_requested": false,
  "promotion_execution_requested": false,
  "replayed": false,
  "read_at": "2026-08-23T18:00:00.000Z",
  "actor": {
    "user_id": "usr_fixture_admin",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "certification": {
    "certification_id": "scert_fixture_77",
    "deployment_id": "dep_77",
    "portfolio_id": "pf_crypto",
    "venue": "OKX",
    "environment": "SANDBOX",
    "workflow_state": "DRAFT",
    "workflow_version": 1,
    "runtime_state": null,
    "account_binding": {
      "account_id": "acct_sandbox_77",
      "external_account_ref": "okx_testnet_main",
      "source_authority": "PORTAL"
    },
    "policy_version": "sandbox-certification.v1",
    "formula_version": "sandbox-certification.v1",
    "submitted_at": null,
    "submitted_by_user_id": null,
    "submitted_evidence_set_hash": null,
    "decided_at": null,
    "decided_by_user_id": null,
    "decided_evidence_set_hash": null,
    "decision_reason": null,
    "created_by_user_id": "usr_fixture_admin",
    "created_at": "2026-08-23T17:59:00.000Z",
    "updated_at": "2026-08-23T17:59:00.000Z"
  },
  "lineage": [
    {
      "kind": "ARTIFACT",
      "value": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "href": null,
      "source_authority": "RESEARCH"
    },
    {
      "kind": "R1_APPROVAL",
      "value": "AP-101",
      "href": "/governance/approvals/AP-101/r1",
      "source_authority": "PORTAL"
    },
    {
      "kind": "R2_APPROVAL",
      "value": "AP-207",
      "href": "/governance/approvals/AP-207/r2",
      "source_authority": "PORTAL"
    },
    {
      "kind": "PAPER_EXIT",
      "value": "PX-29",
      "href": "/deployments/paper/exit/PX-29",
      "source_authority": "PORTAL"
    },
    {
      "kind": "PROMOTION_GRANT",
      "value": "grant_sandbox_77",
      "href": null,
      "source_authority": "PORTAL"
    }
  ],
  "progress": {
    "passed_count": 0,
    "total_count": 7,
    "eligible": false,
    "evidence_set_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "blocker_codes": [
      "SANDBOX_STEP_CONNECT_UNAVAILABLE",
      "SANDBOX_STEP_SYNC_UNAVAILABLE",
      "SANDBOX_STEP_ORDER_TYPES_UNAVAILABLE",
      "SANDBOX_STEP_RECONCILIATION_UNAVAILABLE",
      "SANDBOX_STEP_TIMEBOXED_RUN_UNAVAILABLE",
      "SANDBOX_STEP_CLEANUP_UNAVAILABLE",
      "SANDBOX_STEP_EXIT_REVIEW_UNAVAILABLE"
    ]
  },
  "steps": [
    {
      "step_key": "CONNECT",
      "ordinal": 0,
      "label": "Connect",
      "strip_state": "CURRENT",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "BROKER",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_CONNECT_UNAVAILABLE"
    },
    {
      "step_key": "SYNC",
      "ordinal": 1,
      "label": "Sync",
      "strip_state": "PENDING",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "BROKER",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_SYNC_UNAVAILABLE"
    },
    {
      "step_key": "ORDER_TYPES",
      "ordinal": 2,
      "label": "Order types",
      "strip_state": "PENDING",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "BROKER",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_ORDER_TYPES_UNAVAILABLE"
    },
    {
      "step_key": "RECONCILIATION",
      "ordinal": 3,
      "label": "Reconciliation clean",
      "strip_state": "PENDING",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "DERIVED",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_RECONCILIATION_UNAVAILABLE"
    },
    {
      "step_key": "TIMEBOXED_RUN",
      "ordinal": 4,
      "label": "Timeboxed run",
      "strip_state": "PENDING",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "EXECUTION",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_TIMEBOXED_RUN_UNAVAILABLE"
    },
    {
      "step_key": "CLEANUP",
      "ordinal": 5,
      "label": "Cleanup",
      "strip_state": "PENDING",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "DERIVED",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_CLEANUP_UNAVAILABLE"
    },
    {
      "step_key": "EXIT_REVIEW",
      "ordinal": 6,
      "label": "Exit review",
      "strip_state": "PENDING",
      "evaluation_state": "UNAVAILABLE",
      "source_authority": "PORTAL",
      "evidence_hash": null,
      "evidence_schema_version": null,
      "source_verification_state": "UNAVAILABLE",
      "summary": "Source evidence is not available in the current delivery profile.",
      "as_of": null,
      "expires_at": null,
      "blocker_code": "SANDBOX_STEP_EXIT_REVIEW_UNAVAILABLE"
    }
  ],
  "source_panels": [
    {
      "panel_id": "internal",
      "source_authority": "EXECUTION",
      "as_of": null,
      "read_at": "2026-08-23T18:00:00.000Z",
      "source_cursor": null,
      "source_sequence": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "source_completeness": "UNKNOWN",
      "poll_interval_ms": null,
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "age_seconds": null,
      "lag_ms": null,
      "formula_version": null,
      "capability_snapshot_id": null,
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "data": null,
      "warnings": [
        {
          "code": "SANDBOX_INTERNAL_UNAVAILABLE"
        }
      ]
    },
    {
      "panel_id": "broker",
      "source_authority": "BROKER",
      "as_of": null,
      "read_at": "2026-08-23T18:00:00.000Z",
      "source_cursor": null,
      "source_sequence": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "source_completeness": "UNKNOWN",
      "poll_interval_ms": null,
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "age_seconds": null,
      "lag_ms": null,
      "formula_version": null,
      "capability_snapshot_id": null,
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "data": null,
      "warnings": [
        {
          "code": "SANDBOX_BROKER_UNAVAILABLE"
        }
      ]
    },
    {
      "panel_id": "difference",
      "source_authority": "DERIVED",
      "as_of": null,
      "read_at": "2026-08-23T18:00:00.000Z",
      "source_cursor": null,
      "source_sequence": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "source_completeness": "UNKNOWN",
      "poll_interval_ms": null,
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "age_seconds": null,
      "lag_ms": null,
      "formula_version": "sandbox-certification.v1",
      "capability_snapshot_id": null,
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "data": null,
      "warnings": [
        {
          "code": "SANDBOX_DIFFERENCE_UNAVAILABLE"
        }
      ]
    }
  ],
  "timeboxed_run_policy": null,
  "smoke_plan": {
    "plan_id": "smoke_fixture_1",
    "qty": "0.010000000000000000",
    "cap": "100.000000000000000000",
    "currency": "USDT",
    "timebox_minutes": 30,
    "operator": {
      "user_id": "usr_fixture_admin",
      "username": "bobby"
    },
    "status": "PLANNED",
    "approved_by": null,
    "approved_at": null,
    "source_side_effect_requested": false
  },
  "findings": {
    "total_count": 0,
    "returned_count": 0,
    "truncated": false,
    "rows": []
  },
  "timeline": {
    "total_count": 1,
    "returned_count": 1,
    "truncated": false,
    "rows": [
      {
        "event_id": "scevt_fixture_create",
        "actor_user_id": "usr_fixture_admin",
        "action": "CREATE",
        "workflow_version_before": 0,
        "workflow_version_after": 1,
        "created_at": "2026-08-23T17:59:00.000Z"
      }
    ]
  },
  "promotion_plans": []
} as const;

export const CANARY_ROOM_FIXTURE = {
  "schema_version": "execution.canary-control-room.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "source_side_effect_requested": false,
  "runtime_activation_requested": false,
  "promotion_execution_requested": false,
  "production_command_active": false,
  "replayed": false,
  "read_at": "2026-08-23T11:00:00.000Z",
  "actor": {
    "user_id": "usr_fixture_admin",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "deployment": {
    "deployment_id": "dep_88",
    "portfolio_id": "pf_crypto",
    "account_id": "acct_canary_grid",
    "external_account_ref": "acct-canary-grid",
    "venue": "BINANCE",
    "declared_environment": "LIVE_CANARY",
    "runtime_state": null
  },
  "lineage": [
    {
      "kind": "ARTIFACT",
      "value": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "href": null
    },
    {
      "kind": "R1_APPROVAL",
      "value": "AP-118",
      "href": "/governance/approvals/AP-118/r1"
    },
    {
      "kind": "R2_APPROVAL",
      "value": "AP-152",
      "href": "/governance/approvals/AP-152/r2"
    },
    {
      "kind": "SANDBOX_EXIT",
      "value": "SX-14",
      "href": "/deployments/sandbox/dep_88"
    },
    {
      "kind": "CANARY_PROMOTION_PLAN",
      "value": "AP-311",
      "href": null
    }
  ],
  "envelope": {
    "envelope_id": "cenv_01K3D8R64WYH5M8MQM5H96J7BF",
    "revision": 1,
    "previous_envelope_id": null,
    "status": "DRAFT",
    "base_risk_profile_revision": "risk-profile-rev-12",
    "currency": "USDT",
    "limits": {
      "capital_cap": "5000",
      "gross_notional_cap": "10000",
      "daily_loss_cap": "250",
      "max_open_orders": 20,
      "duration_days": 14
    },
    "evidence_set_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "blocker_codes": [
      "PRODUCTION_COMMAND_INACTIVE",
      "CANARY_OWNER_GATE_REQUIRED",
      "LIVE_SOURCE_UNAVAILABLE",
      "BASE_RISK_PROFILE_UNVERIFIED"
    ],
    "created_by_user_id": "usr_fixture_admin",
    "reason": "Draft canary envelope for source-dark interface qualification.",
    "created_at": "2026-08-23T10:59:00.000Z"
  },
  "lifecycle": {
    "declared_stage": "LIVE_CANARY",
    "runtime_state": null,
    "day_index": null,
    "duration_days": 14,
    "blocker_codes": [
      "PRODUCTION_COMMAND_INACTIVE",
      "CANARY_OWNER_GATE_REQUIRED",
      "LIVE_SOURCE_UNAVAILABLE",
      "BASE_RISK_PROFILE_UNVERIFIED"
    ]
  },
  "kpis": [
    {
      "key": "capital_consumed",
      "label": "Capital consumed",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-capital_consumed",
        "source_authority": "EXECUTION",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T11:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "CANARY_KPI-CAPITAL_CONSUMED_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "gross_notional",
      "label": "Gross notional",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-gross_notional",
        "source_authority": "EXECUTION",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T11:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "CANARY_KPI-GROSS_NOTIONAL_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "daily_pnl",
      "label": "Daily P&L",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-daily_pnl",
        "source_authority": "DERIVED",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T11:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "CANARY_KPI-DAILY_PNL_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "open_orders",
      "label": "Open orders",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-open_orders",
        "source_authority": "EXECUTION",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T11:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "CANARY_KPI-OPEN_ORDERS_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "broker_equity",
      "label": "Broker equity",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-broker_equity",
        "source_authority": "BROKER",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T11:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "CANARY_KPI-BROKER_EQUITY_UNAVAILABLE"
          }
        ]
      }
    }
  ],
  "envelope_compliance": {
    "envelope": {
      "panel_id": "envelope-compliance",
      "source_authority": "DERIVED",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_ENVELOPE-COMPLIANCE_UNAVAILABLE"
        }
      ]
    },
    "limits": {
      "capital_cap": "5000",
      "gross_notional_cap": "10000",
      "daily_loss_cap": "250",
      "max_open_orders": 20
    },
    "consumed": null,
    "headroom": null,
    "base_risk_profile_verified": false
  },
  "source_panels": [
    {
      "panel_id": "internal",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_INTERNAL_UNAVAILABLE"
        }
      ]
    },
    {
      "panel_id": "broker",
      "source_authority": "BROKER",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_BROKER_UNAVAILABLE"
        }
      ]
    },
    {
      "panel_id": "difference",
      "source_authority": "DERIVED",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_DIFFERENCE_UNAVAILABLE"
        }
      ]
    }
  ],
  "positions": {
    "envelope": {
      "panel_id": "positions",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_POSITIONS_UNAVAILABLE"
        }
      ]
    },
    "exact_total": null,
    "returned_count": 0,
    "rows": []
  },
  "blotter": {
    "envelope": {
      "panel_id": "blotter",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_BLOTTER_UNAVAILABLE"
        }
      ]
    },
    "exact_total": null,
    "returned_count": 0,
    "rows": []
  },
  "series": {
    "envelope": {
      "panel_id": "series",
      "source_authority": "DERIVED",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_SERIES_UNAVAILABLE"
        }
      ]
    },
    "resolution": null,
    "points": []
  },
  "rollback_readiness": {
    "envelope": {
      "panel_id": "rollback-readiness",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T11:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "CANARY_ROLLBACK-READINESS_UNAVAILABLE"
        }
      ]
    },
    "ready": false,
    "evidence_hash": null,
    "blocker_codes": [
      "ROLLBACK_EVIDENCE_UNAVAILABLE"
    ]
  },
  "command_policy": {
    "production_command_active": false,
    "guard_semantics": "BROKER_STALE_BLOCKS_SCALE_ONLY",
    "protective": {
      "risk_tier": "R3_LIVE_PROTECTIVE",
      "visible": false,
      "enabled": false,
      "broker_sync_blocks": false,
      "blocker_codes": [
        "PRODUCTION_COMMAND_INACTIVE",
        "PROTECTIVE_CAPABILITY_UNAVAILABLE"
      ]
    },
    "scale_up": {
      "risk_tier": "R4_LIVE_RISK_INCREASING",
      "visible": false,
      "enabled": false,
      "broker_sync_blocks": true,
      "blocker_codes": [
        "PRODUCTION_COMMAND_INACTIVE",
        "CANARY_OWNER_GATE_REQUIRED",
        "BROKER_SYNC_UNAVAILABLE",
        "LIVE_SOURCE_UNAVAILABLE"
      ]
    }
  }
} as const;

export const LIVE_FULL_FIXTURE = {
  "schema_version": "execution.live-full-operations.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "source_side_effect_requested": false,
  "runtime_activation_requested": false,
  "promotion_execution_requested": false,
  "production_command_active": false,
  "realtime_active": false,
  "read_at": "2026-08-23T12:00:00.000Z",
  "actor": {
    "user_id": "usr_fixture_admin",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "deployment": {
    "deployment_id": "dep_88",
    "portfolio_id": "pf_crypto",
    "account_id": "acct_live_grid",
    "external_account_ref": "acct-live-grid-v21",
    "venue": "BINANCE",
    "declared_environment": "LIVE_FULL",
    "runtime_state": null,
    "activated_at": null
  },
  "lineage": [
    {
      "kind": "ARTIFACT",
      "state": "AVAILABLE",
      "value": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "href": null
    },
    {
      "kind": "R1_APPROVAL",
      "state": "AVAILABLE",
      "value": "AP-118",
      "href": "/governance/approvals/AP-118/r1"
    },
    {
      "kind": "R2_APPROVAL",
      "state": "AVAILABLE",
      "value": "AP-152",
      "href": "/governance/approvals/AP-152/r2"
    },
    {
      "kind": "SANDBOX_EXIT",
      "state": "AVAILABLE",
      "value": "scert_fixture",
      "href": "/deployments/sandbox/dep_88"
    },
    {
      "kind": "CANARY_ENVELOPE",
      "state": "AVAILABLE",
      "value": "cenv_01K3D8R64WYH5M8MQM5H96J7BF",
      "href": "/deployments/live/dep_88/canary"
    },
    {
      "kind": "CANARY_EXIT",
      "state": "UNAVAILABLE",
      "value": null,
      "href": null
    },
    {
      "kind": "LIVE_DUAL_APPROVAL",
      "state": "UNAVAILABLE",
      "value": null,
      "href": null
    }
  ],
  "lifecycle": {
    "declared_stage": "LIVE_FULL",
    "runtime_state": null,
    "activated_at": null,
    "blocker_codes": [
      "PRODUCTION_COMMAND_INACTIVE",
      "LIVE_FULL_ACTIVATION_NOT_APPROVED",
      "CANARY_EXIT_EVIDENCE_UNAVAILABLE",
      "LIVE_SOURCE_UNAVAILABLE",
      "SOURCE_CONTINUITY_UNAVAILABLE",
      "BROKER_STATE_UNAVAILABLE",
      "ROLLBACK_EVIDENCE_UNAVAILABLE",
      "EX_BE_08_PENDING"
    ]
  },
  "predecessor_canary_envelope": {
    "envelope_id": "cenv_01K3D8R64WYH5M8MQM5H96J7BF",
    "revision": 1,
    "status": "DRAFT",
    "currency": "USDT",
    "limits": {
      "capital_cap": "5000",
      "gross_notional_cap": "10000",
      "daily_loss_cap": "250",
      "max_open_orders": 20
    },
    "evidence_set_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "active_for_live_full": false
  },
  "kpis": [
    {
      "key": "capital",
      "label": "Capital",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-capital",
        "source_authority": "EXECUTION",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T12:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "LIVE_FULL_KPI_CAPITAL_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "gross_notional",
      "label": "Gross notional",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-gross_notional",
        "source_authority": "EXECUTION",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T12:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "LIVE_FULL_KPI_GROSS_NOTIONAL_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "daily_pnl",
      "label": "Daily P&L",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-daily_pnl",
        "source_authority": "DERIVED",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T12:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "LIVE_FULL_KPI_DAILY_PNL_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "open_orders",
      "label": "Open orders",
      "value": null,
      "unit": "COUNT",
      "envelope": {
        "panel_id": "kpi-open-orders",
        "source_authority": "EXECUTION",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T12:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "LIVE_FULL_KPI_OPEN_ORDERS_UNAVAILABLE"
          }
        ]
      }
    },
    {
      "key": "broker_equity",
      "label": "Broker equity",
      "value": null,
      "unit": "USDT",
      "envelope": {
        "panel_id": "kpi-broker-equity",
        "source_authority": "BROKER",
        "panel_state": "unavailable",
        "freshness_state": "UNKNOWN",
        "delivery_profile": "fixture",
        "source_verification_state": "UNAVAILABLE",
        "as_of": null,
        "read_at": "2026-08-23T12:00:00.000Z",
        "age_seconds": null,
        "lag_ms": null,
        "source_cursor": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "capability_snapshot_id": null,
        "data": null,
        "warnings": [
          {
            "code": "LIVE_FULL_KPI_BROKER_EQUITY_UNAVAILABLE"
          }
        ]
      }
    }
  ],
  "source_panels": {
    "internal": {
      "panel_id": "internal",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_INTERNAL_UNAVAILABLE"
        }
      ]
    },
    "broker": {
      "panel_id": "broker",
      "source_authority": "BROKER",
      "panel_state": "suppressed",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_BROKER_UNAVAILABLE"
        }
      ]
    },
    "difference": {
      "panel_id": "difference",
      "source_authority": "DERIVED",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_DIFFERENCE_UNAVAILABLE"
        }
      ]
    }
  },
  "broker_consistency": {
    "state": "UNAVAILABLE",
    "mismatch_behavior": "SUPPRESS_ALL_BROKER_VALUES",
    "broker_values_visible": false,
    "finding_href": null,
    "dry_run_reconcile_href": null,
    "blocker_codes": [
      "BROKER_STATE_UNAVAILABLE",
      "LIVE_SOURCE_UNAVAILABLE"
    ]
  },
  "projection_continuity": {
    "state": "UNAVAILABLE",
    "epoch": null,
    "cursor": null,
    "sequence": null,
    "gap_detected": null,
    "affected_authorities": [
      "EXECUTION",
      "BROKER",
      "DERIVED"
    ],
    "blocker_codes": [
      "SOURCE_CONTINUITY_UNAVAILABLE",
      "EX_BE_08_PENDING"
    ]
  },
  "positions": {
    "envelope": {
      "panel_id": "positions",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_POSITIONS_UNAVAILABLE"
        }
      ]
    },
    "exact_total": null,
    "returned_count": 0,
    "next_cursor": null,
    "previous_cursor": null,
    "rows": []
  },
  "orders": {
    "envelope": {
      "panel_id": "orders",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_ORDERS_UNAVAILABLE"
        }
      ]
    },
    "exact_total": null,
    "returned_count": 0,
    "next_cursor": null,
    "previous_cursor": null,
    "rows": []
  },
  "open_order_footer": {
    "envelope": {
      "panel_id": "open-order-footer",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_OPEN_ORDER_FOOTER_UNAVAILABLE"
        }
      ]
    },
    "exact_open_order_count": null
  },
  "incidents": {
    "envelope": {
      "panel_id": "incidents",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_INCIDENTS_UNAVAILABLE"
        }
      ]
    },
    "exact_total": null,
    "returned_count": 0,
    "next_cursor": null,
    "previous_cursor": null,
    "rows": []
  },
  "series": {
    "envelope": {
      "panel_id": "series",
      "source_authority": "DERIVED",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_SERIES_UNAVAILABLE"
        }
      ]
    },
    "resolution": null,
    "points": []
  },
  "rollback_readiness": {
    "envelope": {
      "panel_id": "rollback-readiness",
      "source_authority": "EXECUTION",
      "panel_state": "unavailable",
      "freshness_state": "UNKNOWN",
      "delivery_profile": "fixture",
      "source_verification_state": "UNAVAILABLE",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
      "age_seconds": null,
      "lag_ms": null,
      "source_cursor": null,
      "projection_epoch": null,
      "projection_sequence": null,
      "capability_snapshot_id": null,
      "data": null,
      "warnings": [
        {
          "code": "LIVE_FULL_ROLLBACK_READINESS_UNAVAILABLE"
        }
      ]
    },
    "ready": false,
    "evidence_hash": null,
    "blocker_codes": [
      "ROLLBACK_EVIDENCE_UNAVAILABLE",
      "EX_BE_08_PENDING"
    ]
  },
  "realtime": {
    "active": false,
    "stream_url": null,
    "subscription_id": null,
    "blocker_codes": [
      "REALTIME_INACTIVE",
      "SOURCE_CONTINUITY_UNAVAILABLE"
    ]
  },
  "command_policy": {
    "production_command_active": false,
    "guard_semantics": "BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4",
    "protective": {
      "risk_tier": "R3_LIVE_PROTECTIVE",
      "visible": false,
      "enabled": false,
      "source_gap_blocks": false,
      "blocker_codes": [
        "PRODUCTION_COMMAND_INACTIVE",
        "PROTECTIVE_CAPABILITY_UNAVAILABLE"
      ]
    },
    "risk_increasing": {
      "risk_tier": "R4_LIVE_RISK_INCREASING",
      "visible": false,
      "enabled": false,
      "source_gap_blocks": true,
      "blocker_codes": [
        "PRODUCTION_COMMAND_INACTIVE",
        "LIVE_FULL_ACTIVATION_NOT_APPROVED",
        "CANARY_EXIT_EVIDENCE_UNAVAILABLE",
        "LIVE_SOURCE_UNAVAILABLE",
        "SOURCE_CONTINUITY_UNAVAILABLE",
        "BROKER_STATE_UNAVAILABLE",
        "ROLLBACK_EVIDENCE_UNAVAILABLE",
        "EX_BE_08_PENDING"
      ]
    }
  }
} as const;
