/**
 * Command Center wire documents for the fixtures page.
 *
 * GENERATED from `packages/contracts/fixtures/execution-command-center.*.valid.json`.
 * The browser bundle cannot read those files, so they are inlined here — and
 * because an inlined copy is exactly the kind of thing that drifts,
 * `commandCenter.test.tsx` asserts this module still equals them.
 *
 * If that test goes red, regenerate rather than editing by hand.
 */

export const CC_BUSY = {
  "schema_version": "execution.command-center-snapshot.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "workspace_id": "ws_fixture",
  "read_at": "2026-08-22T12:00:00.000Z",
  "actor": {
    "user_id": "user_bobby",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "mode": "BUSY",
  "snapshot": {
    "projection_epoch": null,
    "projection_sequence": null,
    "cursor": null,
    "stream_available": false,
    "resnapshot_not_before": null
  },
  "panels": {
    "needs_you": {
      "panel_state": "ready",
      "authority": "DERIVED",
      "as_of": "2026-08-22T11:59:58.000Z",
      "freshness_state": "OK",
      "formula_version": "command-center.triage-rank.v1",
      "exact_total": true,
      "total_count": 214,
      "observed_total_count": 214,
      "returned_count": 3,
      "limit": 10,
      "truncated": true,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:59.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 1,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_INCIDENTS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:58.000Z",
          "source_cursor": "cursor-inc-44",
          "source_sequence": 440,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 8040,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 2,
          "lag_ms": 40,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:59.000Z",
          "source_cursor": "cursor-op-1251",
          "source_sequence": 1251,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 8041,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 1,
          "lag_ms": 20,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        }
      ],
      "items": [
        {
          "id": "inc_44",
          "kind": "INCIDENT",
          "title": "Broker sync diverged",
          "summary": "Paper Binance USDM",
          "severity": "CRITICAL",
          "sla_state": "OVERDUE",
          "sla_due_at": "2026-08-22T11:58:00.000Z",
          "created_at": "2026-08-22T11:50:00.000Z",
          "updated_at": "2026-08-22T11:59:58.000Z",
          "authority": "EXECUTION",
          "as_of": "2026-08-22T11:59:58.000Z",
          "href": "/execution/operations/incidents/inc_44",
          "action_label": "Investigate",
          "rank": 1,
          "age_seconds": 600
        },
        {
          "id": "op_1251",
          "kind": "OPERATION",
          "title": "Protective action partial",
          "summary": "dep_88 · 2/3 verified",
          "severity": "HIGH",
          "sla_state": "DUE_SOON",
          "sla_due_at": "2026-08-22T12:04:00.000Z",
          "created_at": "2026-08-22T11:54:00.000Z",
          "updated_at": "2026-08-22T11:59:59.000Z",
          "authority": "EXECUTION",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/execution/operations/op_1251",
          "action_label": "Verify",
          "rank": 2,
          "age_seconds": 360
        },
        {
          "id": "AP-352",
          "kind": "APPROVAL",
          "title": "Carry v3.2",
          "summary": "R2 · capital review",
          "severity": "MEDIUM",
          "sla_state": "DUE_SOON",
          "sla_due_at": "2026-08-22T13:00:00.000Z",
          "created_at": "2026-08-21T12:00:00.000Z",
          "updated_at": "2026-08-22T11:59:59.000Z",
          "authority": "PORTAL",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/governance/approvals/AP-352/r2",
          "action_label": "Review",
          "rank": 3,
          "age_seconds": 86400
        }
      ]
    },
    "fleet_health": {
      "panel_state": "ready",
      "authority": "EXECUTION",
      "as_of": "2026-08-22T11:59:59.000Z",
      "freshness_state": "OK",
      "exact_total": true,
      "total_deployments": 182,
      "source": {
        "source": "EXECUTION_FLEET",
        "authority": "EXECUTION",
        "availability": "AVAILABLE",
        "reason": null,
        "as_of": "2026-08-22T11:59:59.000Z",
        "source_cursor": "cursor-fleet",
        "source_sequence": 992,
        "projection_epoch": "epoch_fixture",
        "projection_sequence": 8042,
        "source_completeness": "POLL_BOUNDED",
        "poll_interval_ms": 5000,
        "freshness_state": "OK",
        "age_seconds": 1,
        "lag_ms": 25,
        "capability_snapshot_id": "cap_fixture",
        "delivery_profile": "fixture"
      },
      "cells": [
        {
          "code": "LIVE_FULL",
          "label": "Live",
          "value": 42,
          "href": "/deployments/live"
        },
        {
          "code": "LIVE_CANARY",
          "label": "Canary",
          "value": 8,
          "href": "/deployments/live?stage=canary"
        },
        {
          "code": "SANDBOX",
          "label": "Sandbox",
          "value": 24,
          "href": "/deployments/sandbox"
        },
        {
          "code": "PAPER",
          "label": "Paper",
          "value": 108,
          "href": "/deployments/paper"
        },
        {
          "code": "BROKER_SYNC_ISSUES",
          "label": "Broker sync",
          "value": 1,
          "href": "/execution/operations?filter=broker_sync"
        },
        {
          "code": "OPEN_FINDINGS",
          "label": "Findings",
          "value": 3,
          "href": "/execution/operations?filter=findings"
        }
      ]
    },
    "pinned_watchlist": {
      "panel_state": "ready",
      "authority": "PORTAL",
      "as_of": "2026-08-22T11:00:00.000Z",
      "freshness_state": "OK",
      "exact_total": true,
      "total_count": 2,
      "limit": 5,
      "items": [
        {
          "slot": 1,
          "entity_type": "DEPLOYMENT",
          "entity_id": "dep_88",
          "label": "Carry v3.2",
          "href": "/deployments/paper/dep_88",
          "pinned_at": "2026-08-22T10:00:00.000Z",
          "target_label": "Carry v3.2",
          "target_state": "available",
          "target_authority": "EXECUTION",
          "target_as_of": "2026-08-22T11:59:59.000Z",
          "target_freshness_state": "OK"
        },
        {
          "slot": 2,
          "entity_type": "DEPLOYMENT",
          "entity_id": "dep_74",
          "label": "Basis v2.1",
          "href": "/deployments/sandbox/dep_74",
          "pinned_at": "2026-08-22T11:00:00.000Z",
          "target_label": "Basis v2.1",
          "target_state": "available",
          "target_authority": "EXECUTION",
          "target_as_of": "2026-08-22T11:59:59.000Z",
          "target_freshness_state": "OK"
        }
      ]
    },
    "today": {
      "panel_state": "ready",
      "authority": "DERIVED",
      "as_of": "2026-08-22T11:59:59.000Z",
      "freshness_state": "OK",
      "exact_total": true,
      "total_count": 3,
      "observed_total_count": 3,
      "returned_count": 3,
      "limit": 12,
      "truncated": false,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:59.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 1,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:59.000Z",
          "source_cursor": "cursor-op-1251",
          "source_sequence": 1251,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 8041,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 1,
          "lag_ms": 20,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        }
      ],
      "items": [
        {
          "id": "review:AP-201",
          "kind": "REVIEW_DUE",
          "label": "R1 review · Momentum v4",
          "scheduled_at": "2026-08-22T13:00:00.000Z",
          "authority": "PORTAL",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/governance/approvals/AP-201/r1"
        },
        {
          "id": "condition:COND-9",
          "kind": "CONDITION_EXPIRY",
          "label": "Capital condition expires",
          "scheduled_at": "2026-08-22T15:00:00.000Z",
          "authority": "PORTAL",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/governance/approvals/AP-152/r2"
        },
        {
          "id": "verified:op_1249",
          "kind": "VERIFIED_OPERATION",
          "label": "Last verified protective action",
          "scheduled_at": "2026-08-22T16:00:00.000Z",
          "authority": "EXECUTION",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/execution/operations/op_1249"
        }
      ]
    }
  },
  "warnings": []
} as const;

export const CC_EMPTY = {
  "schema_version": "execution.command-center-snapshot.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "workspace_id": "ws_fixture",
  "read_at": "2026-08-22T12:00:00.000Z",
  "actor": {
    "user_id": "user_bobby",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "mode": "QUIET",
  "snapshot": {
    "projection_epoch": null,
    "projection_sequence": null,
    "cursor": null,
    "stream_available": false,
    "resnapshot_not_before": null
  },
  "panels": {
    "needs_you": {
      "panel_state": "empty",
      "authority": "DERIVED",
      "as_of": "2026-08-22T12:00:00.000Z",
      "freshness_state": "OK",
      "formula_version": "command-center.triage-rank.v1",
      "exact_total": true,
      "total_count": 0,
      "observed_total_count": 0,
      "returned_count": 0,
      "limit": 10,
      "truncated": false,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_INCIDENTS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": "cursor-inc-empty",
          "source_sequence": 1,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 1,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": "cursor-op-empty",
          "source_sequence": 1,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 1,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        }
      ],
      "items": []
    },
    "fleet_health": {
      "panel_state": "empty",
      "authority": "EXECUTION",
      "as_of": "2026-08-22T12:00:00.000Z",
      "freshness_state": "OK",
      "exact_total": true,
      "total_deployments": 0,
      "source": {
        "source": "EXECUTION_FLEET",
        "authority": "EXECUTION",
        "availability": "AVAILABLE",
        "reason": null,
        "as_of": "2026-08-22T12:00:00.000Z",
        "source_cursor": "cursor-fleet-empty",
        "source_sequence": 1,
        "projection_epoch": "epoch_fixture",
        "projection_sequence": 1,
        "source_completeness": "POLL_BOUNDED",
        "poll_interval_ms": 5000,
        "freshness_state": "OK",
        "age_seconds": 0,
        "lag_ms": 0,
        "capability_snapshot_id": "cap_fixture",
        "delivery_profile": "fixture"
      },
      "cells": [
        {
          "code": "LIVE_FULL",
          "label": "Live",
          "value": 0,
          "href": "/deployments/live"
        },
        {
          "code": "LIVE_CANARY",
          "label": "Canary",
          "value": 0,
          "href": "/deployments/live?stage=canary"
        },
        {
          "code": "SANDBOX",
          "label": "Sandbox",
          "value": 0,
          "href": "/deployments/sandbox"
        },
        {
          "code": "PAPER",
          "label": "Paper",
          "value": 0,
          "href": "/deployments/paper"
        },
        {
          "code": "BROKER_SYNC_ISSUES",
          "label": "Broker sync",
          "value": 0,
          "href": "/execution/operations?filter=broker_sync"
        },
        {
          "code": "OPEN_FINDINGS",
          "label": "Findings",
          "value": 0,
          "href": "/execution/operations?filter=findings"
        }
      ]
    },
    "pinned_watchlist": {
      "panel_state": "empty",
      "authority": "PORTAL",
      "as_of": null,
      "freshness_state": "OK",
      "exact_total": true,
      "total_count": 0,
      "limit": 5,
      "items": []
    },
    "today": {
      "panel_state": "empty",
      "authority": "DERIVED",
      "as_of": "2026-08-22T12:00:00.000Z",
      "freshness_state": "OK",
      "exact_total": true,
      "total_count": 0,
      "observed_total_count": 0,
      "returned_count": 0,
      "limit": 12,
      "truncated": false,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": "cursor-op-empty",
          "source_sequence": 1,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 1,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        }
      ],
      "items": []
    }
  },
  "warnings": []
} as const;

export const CC_PARTIAL = {
  "schema_version": "execution.command-center-snapshot.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "workspace_id": "ws_fixture",
  "read_at": "2026-08-22T12:00:00.000Z",
  "actor": {
    "user_id": "user_bobby",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "mode": "DEGRADED",
  "snapshot": {
    "projection_epoch": null,
    "projection_sequence": null,
    "cursor": null,
    "stream_available": false,
    "resnapshot_not_before": null
  },
  "panels": {
    "needs_you": {
      "panel_state": "partial",
      "authority": "DERIVED",
      "as_of": "2026-08-22T11:59:59.000Z",
      "freshness_state": "UNKNOWN",
      "formula_version": "command-center.triage-rank.v1",
      "exact_total": false,
      "total_count": null,
      "observed_total_count": 1,
      "returned_count": 1,
      "limit": 10,
      "truncated": null,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:59.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 1,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_INCIDENTS",
          "authority": "EXECUTION",
          "availability": "UNAVAILABLE",
          "reason": "INCIDENT_SOURCE_NOT_COMMISSIONED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "ERROR",
          "reason": "OPERATION_SOURCE_READ_FAILED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        }
      ],
      "items": [
        {
          "id": "AP-352",
          "kind": "APPROVAL",
          "title": "Carry v3.2",
          "summary": "R2 · capital review",
          "severity": "HIGH",
          "sla_state": "OVERDUE",
          "sla_due_at": "2026-08-22T11:30:00.000Z",
          "created_at": "2026-08-21T12:00:00.000Z",
          "updated_at": "2026-08-22T11:59:59.000Z",
          "authority": "PORTAL",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/governance/approvals/AP-352/r2",
          "action_label": "Review",
          "rank": 1,
          "age_seconds": 86400
        }
      ]
    },
    "fleet_health": {
      "panel_state": "unavailable",
      "authority": "EXECUTION",
      "as_of": null,
      "freshness_state": "UNKNOWN",
      "exact_total": false,
      "total_deployments": null,
      "source": {
        "source": "EXECUTION_FLEET",
        "authority": "EXECUTION",
        "availability": "UNAVAILABLE",
        "reason": "FLEET_SOURCE_NOT_COMMISSIONED",
        "as_of": null,
        "source_cursor": null,
        "source_sequence": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "source_completeness": "UNKNOWN",
        "poll_interval_ms": null,
        "freshness_state": "UNKNOWN",
        "age_seconds": null,
        "lag_ms": null,
        "capability_snapshot_id": null,
        "delivery_profile": "fixture"
      },
      "cells": [
        {
          "code": "LIVE_FULL",
          "label": "Live",
          "value": null,
          "href": "/deployments/live"
        },
        {
          "code": "LIVE_CANARY",
          "label": "Canary",
          "value": null,
          "href": "/deployments/live?stage=canary"
        },
        {
          "code": "SANDBOX",
          "label": "Sandbox",
          "value": null,
          "href": "/deployments/sandbox"
        },
        {
          "code": "PAPER",
          "label": "Paper",
          "value": null,
          "href": "/deployments/paper"
        },
        {
          "code": "BROKER_SYNC_ISSUES",
          "label": "Broker sync",
          "value": null,
          "href": "/execution/operations?filter=broker_sync"
        },
        {
          "code": "OPEN_FINDINGS",
          "label": "Findings",
          "value": null,
          "href": "/execution/operations?filter=findings"
        }
      ]
    },
    "pinned_watchlist": {
      "panel_state": "partial",
      "authority": "PORTAL",
      "as_of": "2026-08-22T10:00:00.000Z",
      "freshness_state": "UNKNOWN",
      "exact_total": true,
      "total_count": 1,
      "limit": 5,
      "items": [
        {
          "slot": 1,
          "entity_type": "DEPLOYMENT",
          "entity_id": "dep_88",
          "label": "Carry v3.2",
          "href": "/deployments/paper/dep_88",
          "pinned_at": "2026-08-22T10:00:00.000Z",
          "target_label": null,
          "target_state": "unavailable",
          "target_authority": "EXECUTION",
          "target_as_of": null,
          "target_freshness_state": "UNKNOWN"
        }
      ]
    },
    "today": {
      "panel_state": "partial",
      "authority": "DERIVED",
      "as_of": "2026-08-22T11:59:59.000Z",
      "freshness_state": "UNKNOWN",
      "exact_total": false,
      "total_count": null,
      "observed_total_count": 1,
      "returned_count": 1,
      "limit": 12,
      "truncated": null,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:59.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 1,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "UNAVAILABLE",
          "reason": "OPERATION_SOURCE_NOT_COMMISSIONED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        }
      ],
      "items": [
        {
          "id": "review:AP-352",
          "kind": "REVIEW_DUE",
          "label": "R2 review · Carry v3.2",
          "scheduled_at": "2026-08-22T12:30:00.000Z",
          "authority": "PORTAL",
          "as_of": "2026-08-22T11:59:59.000Z",
          "href": "/governance/approvals/AP-352/r2"
        }
      ]
    }
  },
  "warnings": [
    {
      "code": "COMMAND_CENTER_SOURCE_GAP",
      "message": "One or more Command Center sources are unavailable; missing totals are not reported as zero."
    }
  ]
} as const;

export const CC_STALE = {
  "schema_version": "execution.command-center-snapshot.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "workspace_id": "ws_fixture",
  "read_at": "2026-08-22T12:00:00.000Z",
  "actor": {
    "user_id": "user_bobby",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "mode": "BUSY",
  "snapshot": {
    "projection_epoch": null,
    "projection_sequence": null,
    "cursor": null,
    "stream_available": false,
    "resnapshot_not_before": null
  },
  "panels": {
    "needs_you": {
      "panel_state": "stale",
      "authority": "DERIVED",
      "as_of": "2026-08-22T11:45:00.000Z",
      "freshness_state": "STALE",
      "formula_version": "command-center.triage-rank.v1",
      "exact_total": true,
      "total_count": 1,
      "observed_total_count": 1,
      "returned_count": 1,
      "limit": 10,
      "truncated": false,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_INCIDENTS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:45:00.000Z",
          "source_cursor": "cursor-inc-stale",
          "source_sequence": 40,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 80,
          "source_completeness": "POLL_BOUNDED",
          "poll_interval_ms": 5000,
          "freshness_state": "STALE",
          "age_seconds": 900,
          "lag_ms": 900000,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:59:58.000Z",
          "source_cursor": "cursor-op-ok",
          "source_sequence": 41,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 81,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 2,
          "lag_ms": 20,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        }
      ],
      "items": [
        {
          "id": "inc_44",
          "kind": "INCIDENT",
          "title": "Broker sync diverged",
          "summary": "Source is stale",
          "severity": "CRITICAL",
          "sla_state": "OVERDUE",
          "sla_due_at": "2026-08-22T11:50:00.000Z",
          "created_at": "2026-08-22T11:40:00.000Z",
          "updated_at": "2026-08-22T11:45:00.000Z",
          "authority": "EXECUTION",
          "as_of": "2026-08-22T11:45:00.000Z",
          "href": "/execution/operations/incidents/inc_44",
          "action_label": "Investigate",
          "rank": 1,
          "age_seconds": 1200
        }
      ]
    },
    "fleet_health": {
      "panel_state": "stale",
      "authority": "EXECUTION",
      "as_of": "2026-08-22T11:45:00.000Z",
      "freshness_state": "STALE",
      "exact_total": true,
      "total_deployments": 4,
      "source": {
        "source": "EXECUTION_FLEET",
        "authority": "EXECUTION",
        "availability": "AVAILABLE",
        "reason": null,
        "as_of": "2026-08-22T11:45:00.000Z",
        "source_cursor": "cursor-fleet-stale",
        "source_sequence": 9,
        "projection_epoch": "epoch_fixture",
        "projection_sequence": 82,
        "source_completeness": "POLL_BOUNDED",
        "poll_interval_ms": 5000,
        "freshness_state": "STALE",
        "age_seconds": 900,
        "lag_ms": 900000,
        "capability_snapshot_id": "cap_fixture",
        "delivery_profile": "fixture"
      },
      "cells": [
        {
          "code": "LIVE_FULL",
          "label": "Live",
          "value": 1,
          "href": "/deployments/live"
        },
        {
          "code": "LIVE_CANARY",
          "label": "Canary",
          "value": 1,
          "href": "/deployments/live?stage=canary"
        },
        {
          "code": "SANDBOX",
          "label": "Sandbox",
          "value": 1,
          "href": "/deployments/sandbox"
        },
        {
          "code": "PAPER",
          "label": "Paper",
          "value": 1,
          "href": "/deployments/paper"
        },
        {
          "code": "BROKER_SYNC_ISSUES",
          "label": "Broker sync",
          "value": 1,
          "href": "/execution/operations?filter=broker_sync"
        },
        {
          "code": "OPEN_FINDINGS",
          "label": "Findings",
          "value": 1,
          "href": "/execution/operations?filter=findings"
        }
      ]
    },
    "pinned_watchlist": {
      "panel_state": "stale",
      "authority": "PORTAL",
      "as_of": "2026-08-22T10:00:00.000Z",
      "freshness_state": "STALE",
      "exact_total": true,
      "total_count": 1,
      "limit": 5,
      "items": [
        {
          "slot": 1,
          "entity_type": "DEPLOYMENT",
          "entity_id": "dep_88",
          "label": "Carry v3.2",
          "href": "/deployments/paper/dep_88",
          "pinned_at": "2026-08-22T10:00:00.000Z",
          "target_label": "Carry v3.2",
          "target_state": "available",
          "target_authority": "EXECUTION",
          "target_as_of": "2026-08-22T11:45:00.000Z",
          "target_freshness_state": "STALE"
        }
      ]
    },
    "today": {
      "panel_state": "stale",
      "authority": "DERIVED",
      "as_of": "2026-08-22T11:45:00.000Z",
      "freshness_state": "STALE",
      "exact_total": true,
      "total_count": 1,
      "observed_total_count": 1,
      "returned_count": 1,
      "limit": 12,
      "truncated": false,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T12:00:00.000Z",
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "EVENT_SOURCED",
          "poll_interval_ms": null,
          "freshness_state": "OK",
          "age_seconds": 0,
          "lag_ms": 0,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "AVAILABLE",
          "reason": null,
          "as_of": "2026-08-22T11:45:00.000Z",
          "source_cursor": "cursor-op-stale",
          "source_sequence": 40,
          "projection_epoch": "epoch_fixture",
          "projection_sequence": 80,
          "source_completeness": "POLL_BOUNDED",
          "poll_interval_ms": 5000,
          "freshness_state": "STALE",
          "age_seconds": 900,
          "lag_ms": 900000,
          "capability_snapshot_id": "cap_fixture",
          "delivery_profile": "fixture"
        }
      ],
      "items": [
        {
          "id": "verified:op_1249",
          "kind": "VERIFIED_OPERATION",
          "label": "Last verified protective action",
          "scheduled_at": "2026-08-22T12:30:00.000Z",
          "authority": "EXECUTION",
          "as_of": "2026-08-22T11:45:00.000Z",
          "href": "/execution/operations/op_1249"
        }
      ]
    }
  },
  "warnings": []
} as const;

export const CC_UNAVAILABLE = {
  "schema_version": "execution.command-center-snapshot.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "workspace_id": "ws_fixture",
  "read_at": "2026-08-22T12:00:00.000Z",
  "actor": {
    "user_id": "user_bobby",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "mode": "DEGRADED",
  "snapshot": {
    "projection_epoch": null,
    "projection_sequence": null,
    "cursor": null,
    "stream_available": false,
    "resnapshot_not_before": null
  },
  "panels": {
    "needs_you": {
      "panel_state": "unavailable",
      "authority": "DERIVED",
      "as_of": null,
      "freshness_state": "UNKNOWN",
      "formula_version": "command-center.triage-rank.v1",
      "exact_total": false,
      "total_count": null,
      "observed_total_count": 0,
      "returned_count": 0,
      "limit": 10,
      "truncated": null,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "ERROR",
          "reason": "GOVERNANCE_READ_FAILED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_INCIDENTS",
          "authority": "EXECUTION",
          "availability": "UNAVAILABLE",
          "reason": "INCIDENT_SOURCE_NOT_COMMISSIONED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "UNAVAILABLE",
          "reason": "OPERATION_SOURCE_NOT_COMMISSIONED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        }
      ],
      "items": []
    },
    "fleet_health": {
      "panel_state": "unavailable",
      "authority": "EXECUTION",
      "as_of": null,
      "freshness_state": "UNKNOWN",
      "exact_total": false,
      "total_deployments": null,
      "source": {
        "source": "EXECUTION_FLEET",
        "authority": "EXECUTION",
        "availability": "UNAVAILABLE",
        "reason": "FLEET_SOURCE_NOT_COMMISSIONED",
        "as_of": null,
        "source_cursor": null,
        "source_sequence": null,
        "projection_epoch": null,
        "projection_sequence": null,
        "source_completeness": "UNKNOWN",
        "poll_interval_ms": null,
        "freshness_state": "UNKNOWN",
        "age_seconds": null,
        "lag_ms": null,
        "capability_snapshot_id": null,
        "delivery_profile": "fixture"
      },
      "cells": [
        {
          "code": "LIVE_FULL",
          "label": "Live",
          "value": null,
          "href": "/deployments/live"
        },
        {
          "code": "LIVE_CANARY",
          "label": "Canary",
          "value": null,
          "href": "/deployments/live?stage=canary"
        },
        {
          "code": "SANDBOX",
          "label": "Sandbox",
          "value": null,
          "href": "/deployments/sandbox"
        },
        {
          "code": "PAPER",
          "label": "Paper",
          "value": null,
          "href": "/deployments/paper"
        },
        {
          "code": "BROKER_SYNC_ISSUES",
          "label": "Broker sync",
          "value": null,
          "href": "/execution/operations?filter=broker_sync"
        },
        {
          "code": "OPEN_FINDINGS",
          "label": "Findings",
          "value": null,
          "href": "/execution/operations?filter=findings"
        }
      ]
    },
    "pinned_watchlist": {
      "panel_state": "empty",
      "authority": "PORTAL",
      "as_of": null,
      "freshness_state": "UNKNOWN",
      "exact_total": true,
      "total_count": 0,
      "limit": 5,
      "items": []
    },
    "today": {
      "panel_state": "unavailable",
      "authority": "DERIVED",
      "as_of": null,
      "freshness_state": "UNKNOWN",
      "exact_total": false,
      "total_count": null,
      "observed_total_count": 0,
      "returned_count": 0,
      "limit": 12,
      "truncated": null,
      "sources": [
        {
          "source": "PORTAL_GOVERNANCE",
          "authority": "PORTAL",
          "availability": "ERROR",
          "reason": "GOVERNANCE_READ_FAILED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        },
        {
          "source": "EXECUTION_OPERATIONS",
          "authority": "EXECUTION",
          "availability": "UNAVAILABLE",
          "reason": "OPERATION_SOURCE_NOT_COMMISSIONED",
          "as_of": null,
          "source_cursor": null,
          "source_sequence": null,
          "projection_epoch": null,
          "projection_sequence": null,
          "source_completeness": "UNKNOWN",
          "poll_interval_ms": null,
          "freshness_state": "UNKNOWN",
          "age_seconds": null,
          "lag_ms": null,
          "capability_snapshot_id": null,
          "delivery_profile": "fixture"
        }
      ],
      "items": []
    }
  },
  "warnings": [
    {
      "code": "COMMAND_CENTER_SOURCE_GAP",
      "message": "One or more Command Center sources are unavailable; missing totals are not reported as zero."
    }
  ]
} as const;

export const CC_FIXTURES = {
  busy: CC_BUSY,
  empty: CC_EMPTY,
  partial: CC_PARTIAL,
  stale: CC_STALE,
  unavailable: CC_UNAVAILABLE,
} as const;
