/**
 * Phase 7 and 8 wire documents, inlined for the fixture port.
 *
 * GENERATED from `packages/contracts/fixtures/`. The browser bundle cannot read
 * those files; `operations.test.tsx` compares these against them on every run,
 * so a drift fails rather than drifts.
 */

export const OPERATIONS_QUEUE_FIXTURE = {
  "schema_version": "execution.operations-queue.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "read_at": "2026-08-23T09:00:00.000Z",
  "actor": {
    "user_id": "usr_fixture_admin",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "page": {
    "rows": [
      {
        "operation_id": "op_fixture_queue_1",
        "operation_kind": "EXECUTION_COMMAND",
        "command_key": "account/sync",
        "environment": "PAPER",
        "target": {
          "type": "ACCOUNT",
          "id": "paper-account-1"
        },
        "risk_tier": "BLOCKED",
        "severity": "WARNING",
        "source_authority": "PORTAL",
        "source_status": "BLOCKED",
        "verification_result": "NOT_STARTED",
        "triage_state": "UNACKNOWLEDGED",
        "workflow_version": 1,
        "assigned_to": null,
        "assigned_at": null,
        "incident_id": null,
        "acknowledged_at": null,
        "acknowledged_by_user_id": null,
        "resolved_at": null,
        "resolved_by_user_id": null,
        "resolution_reason": null,
        "resolution_evidence_hash": null,
        "created_at": "2026-08-23T08:59:00.000Z",
        "updated_at": "2026-08-23T08:59:00.000Z"
      }
    ],
    "total_count": 1,
    "filtered_count": 1,
    "next_cursor": null,
    "prev_cursor": null,
    "has_more": false,
    "has_previous": false,
    "applied_filters": [],
    "applied_sort": [
      {
        "field": "created_at",
        "direction": "desc"
      },
      {
        "field": "operation_id",
        "direction": "desc"
      }
    ]
  }
} as const;

export const OPERATION_WORKFLOW_FIXTURE = {
  "schema_version": "execution.operation-workflow.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "source_status_unchanged": true,
  "source_side_effect_requested": false,
  "replayed": false,
  "operation": {
    "operation_id": "op_fixture_queue_1",
    "operation_kind": "EXECUTION_COMMAND",
    "command_key": "account/sync",
    "environment": "PAPER",
    "target": {
      "type": "ACCOUNT",
      "id": "paper-account-1"
    },
    "risk_tier": "BLOCKED",
    "severity": "WARNING",
    "source_authority": "PORTAL",
    "source_status": "BLOCKED",
    "verification_result": "NOT_STARTED",
    "triage_state": "RESOLVED",
    "workflow_version": 3,
    "assigned_to": {
      "user_id": "usr_fixture_admin",
      "username": "bobby"
    },
    "assigned_at": "2026-08-23T09:01:00.000Z",
    "incident_id": null,
    "acknowledged_at": "2026-08-23T09:01:00.000Z",
    "acknowledged_by_user_id": "usr_fixture_admin",
    "resolved_at": "2026-08-23T09:02:00.000Z",
    "resolved_by_user_id": "usr_fixture_admin",
    "resolution_reason": "Reviewed and closed with immutable evidence.",
    "resolution_evidence_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "created_at": "2026-08-23T08:59:00.000Z",
    "updated_at": "2026-08-23T09:02:00.000Z"
  }
} as const;

export const INCIDENT_OPEN_FIXTURE = {
  "schema_version": "execution.incident-detail.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "read_at": "2026-08-23T12:00:00.000Z",
  "actor": {
    "user_id": "usr_fixture_admin",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "incident": {
    "incident_id": "inc_fixture_44",
    "title": "Position mismatch requires investigation",
    "summary": "Portal operator opened this record while source panels remain unavailable.",
    "severity": "CRITICAL",
    "environment": "PAPER",
    "target": {
      "type": "ACCOUNT",
      "id": "acct_paper_grid_v21"
    },
    "workflow_state": "OPEN",
    "workflow_version": 2,
    "assigned_to_user_id": null,
    "acknowledged_at": null,
    "acknowledged_by_user_id": null,
    "mitigated_at": null,
    "mitigated_by_user_id": null,
    "mitigation_evidence_hash": null,
    "resolved_at": null,
    "resolved_by_user_id": null,
    "resolution_reason": null,
    "clean_dry_run_evidence_hash": null,
    "opened_by_user_id": "usr_fixture_admin",
    "source_side_effect_requested": false,
    "deployment_resume_requested": false,
    "created_at": "2026-08-23T11:55:00.000Z",
    "updated_at": "2026-08-23T11:56:00.000Z"
  },
  "source_panels": [
    {
      "panel_id": "findings",
      "source_authority": "EXECUTION",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
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
          "code": "TRADING_SYSTEM_FINDINGS_ROUTE_UNPUBLISHED"
        }
      ]
    },
    {
      "panel_id": "alerts",
      "source_authority": "EXECUTION",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
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
          "code": "TRADING_SYSTEM_ALERTS_ROUTE_UNPUBLISHED"
        }
      ]
    },
    {
      "panel_id": "dead_letters",
      "source_authority": "EXECUTION",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
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
          "code": "TRADING_SYSTEM_DEAD_LETTERS_ROUTE_UNPUBLISHED"
        }
      ]
    },
    {
      "panel_id": "trace_order",
      "source_authority": "EXECUTION",
      "as_of": null,
      "read_at": "2026-08-23T12:00:00.000Z",
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
          "code": "TRADING_SYSTEM_TRACE_ORDER_ROUTE_UNPUBLISHED"
        }
      ]
    }
  ],
  "correlated_operations": {
    "total_count": 1,
    "returned_count": 1,
    "truncated": false,
    "rows": [
      {
        "operation_id": "op_fixture_1253",
        "relationship": "TRIGGERED_BY",
        "linked_by_user_id": "usr_fixture_admin",
        "linked_at": "2026-08-23T11:55:00.000Z",
        "command_key": "account/sync",
        "severity": "WARNING",
        "triage_state": "ACKNOWLEDGED",
        "source_status": "BLOCKED",
        "verification_result": "NOT_STARTED",
        "workflow_version": 2
      }
    ]
  },
  "evidence": {
    "total_count": 0,
    "returned_count": 0,
    "truncated": false,
    "rows": []
  },
  "annotations": {
    "total_count": 1,
    "returned_count": 1,
    "truncated": false,
    "rows": [
      {
        "annotation_id": "iann_fixture_1",
        "author_user_id": "usr_fixture_admin",
        "body": "Investigating through the bounded Portal workflow.",
        "redaction_state": "CLEAR",
        "created_at": "2026-08-23T11:56:00.000Z"
      }
    ]
  },
  "timeline": {
    "total_count": 2,
    "returned_count": 2,
    "truncated": false,
    "rows": [
      {
        "event_id": "ievt_fixture_1",
        "actor_user_id": "usr_fixture_admin",
        "action": "CREATE",
        "workflow_version_before": 0,
        "workflow_version_after": 1,
        "metadata": {
          "correlated_operation_count": 1
        },
        "created_at": "2026-08-23T11:55:00.000Z"
      },
      {
        "event_id": "ievt_fixture_2",
        "actor_user_id": "usr_fixture_admin",
        "action": "ANNOTATE",
        "workflow_version_before": 1,
        "workflow_version_after": 2,
        "metadata": {
          "annotation_id": "iann_fixture_1"
        },
        "created_at": "2026-08-23T11:56:00.000Z"
      }
    ]
  },
  "resolution_gate": {
    "eligible": false,
    "blocker_codes": [
      "INCIDENT_ACKNOWLEDGEMENT_REQUIRED",
      "INCIDENT_ASSIGNEE_REQUIRED",
      "INCIDENT_NOT_MITIGATED",
      "CLEAN_DRY_RUN_EVIDENCE_REQUIRED"
    ],
    "clean_dry_run_evidence_present": false,
    "reason_required": true,
    "deployment_resume_requested": false
  }
} as const;

export const INCIDENT_RESOLVED_FIXTURE = {
  "schema_version": "execution.incident-workflow.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "UNAVAILABLE",
  "source_side_effect_requested": false,
  "deployment_resume_requested": false,
  "replayed": false,
  "detail": {
    "schema_version": "execution.incident-detail.v1",
    "record_authority": "PORTAL",
    "delivery_profile": "fixture",
    "source_integration_state": "UNAVAILABLE",
    "read_at": "2026-08-23T12:10:00.000Z",
    "actor": {
      "user_id": "usr_fixture_admin",
      "username": "bobby",
      "roles": [
        "ADMIN"
      ]
    },
    "incident": {
      "incident_id": "inc_fixture_44",
      "title": "Position mismatch requires investigation",
      "summary": "Portal operator resolved the local workflow with hash-only evidence.",
      "severity": "CRITICAL",
      "environment": "PAPER",
      "target": {
        "type": "ACCOUNT",
        "id": "acct_paper_grid_v21"
      },
      "workflow_state": "RESOLVED",
      "workflow_version": 7,
      "assigned_to_user_id": "usr_fixture_admin",
      "acknowledged_at": "2026-08-23T12:01:00.000Z",
      "acknowledged_by_user_id": "usr_fixture_admin",
      "mitigated_at": "2026-08-23T12:05:00.000Z",
      "mitigated_by_user_id": "usr_fixture_admin",
      "mitigation_evidence_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "resolved_at": "2026-08-23T12:10:00.000Z",
      "resolved_by_user_id": "usr_fixture_admin",
      "resolution_reason": "A clean dry-run confirmed the Portal workflow can close safely.",
      "clean_dry_run_evidence_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "opened_by_user_id": "usr_fixture_admin",
      "source_side_effect_requested": false,
      "deployment_resume_requested": false,
      "created_at": "2026-08-23T12:00:00.000Z",
      "updated_at": "2026-08-23T12:10:00.000Z"
    },
    "source_panels": [
      {
        "panel_id": "findings",
        "source_authority": "EXECUTION",
        "as_of": null,
        "read_at": "2026-08-23T12:10:00.000Z",
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
            "code": "TRADING_SYSTEM_FINDINGS_ROUTE_UNPUBLISHED"
          }
        ]
      },
      {
        "panel_id": "alerts",
        "source_authority": "EXECUTION",
        "as_of": null,
        "read_at": "2026-08-23T12:10:00.000Z",
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
            "code": "TRADING_SYSTEM_ALERTS_ROUTE_UNPUBLISHED"
          }
        ]
      },
      {
        "panel_id": "dead_letters",
        "source_authority": "EXECUTION",
        "as_of": null,
        "read_at": "2026-08-23T12:10:00.000Z",
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
            "code": "TRADING_SYSTEM_DEAD_LETTERS_ROUTE_UNPUBLISHED"
          }
        ]
      },
      {
        "panel_id": "trace_order",
        "source_authority": "EXECUTION",
        "as_of": null,
        "read_at": "2026-08-23T12:10:00.000Z",
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
            "code": "TRADING_SYSTEM_TRACE_ORDER_ROUTE_UNPUBLISHED"
          }
        ]
      }
    ],
    "correlated_operations": {
      "total_count": 0,
      "returned_count": 0,
      "truncated": false,
      "rows": []
    },
    "evidence": {
      "total_count": 2,
      "returned_count": 2,
      "truncated": false,
      "rows": [
        {
          "evidence_id": "iev_fixture_1",
          "evidence_kind": "MITIGATION_ATTESTATION",
          "sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "schema_version": "portal.incident-evidence.v1",
          "declared_source_authority": "PORTAL",
          "source_verification_state": "UNAVAILABLE",
          "summary": "Portal mitigation attestation reference.",
          "captured_at": "2026-08-23T12:04:00.000Z",
          "attached_by_user_id": "usr_fixture_admin",
          "created_at": "2026-08-23T12:04:00.000Z"
        },
        {
          "evidence_id": "iev_fixture_2",
          "evidence_kind": "CLEAN_DRY_RUN",
          "sha256": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "schema_version": "portal.incident-evidence.v1",
          "declared_source_authority": "PORTAL",
          "source_verification_state": "UNAVAILABLE",
          "summary": "Portal clean dry-run evidence reference.",
          "captured_at": "2026-08-23T12:08:00.000Z",
          "attached_by_user_id": "usr_fixture_admin",
          "created_at": "2026-08-23T12:08:00.000Z"
        }
      ]
    },
    "annotations": {
      "total_count": 0,
      "returned_count": 0,
      "truncated": false,
      "rows": []
    },
    "timeline": {
      "total_count": 0,
      "returned_count": 0,
      "truncated": false,
      "rows": []
    },
    "resolution_gate": {
      "eligible": false,
      "blocker_codes": [
        "INCIDENT_ALREADY_RESOLVED"
      ],
      "clean_dry_run_evidence_present": true,
      "reason_required": true,
      "deployment_resume_requested": false
    }
  }
} as const;
