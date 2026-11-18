//! `TEST_ONLY` mounted-route and budget checks, not commissioned Core authority.

use axum::{
    body::{to_bytes, Body},
    http::Request,
};
use serde_json::{json, Value};
use tower::ServiceExt as _;

use super::*;

#[cfg(feature = "pm-custody-pg-test")]
mod pg;

fn limits() -> BackendLimits {
    BackendLimits {
        read: ReadLimits {
            cursor_ttl_ms: 60_000,
            max_scope_cursors: 32,
            max_total_cursors: 128,
        },
        cache: CacheLimits {
            max_entries: 8,
            max_bytes: 1024 * 1024,
            max_flights: 2,
            ttl_ms: 30_000,
            load_timeout_ms: 5_000,
        },
        realtime: ScopedRealtimeConfig {
            maximum_clients: 4,
            client_queue_entries: 4,
            client_queue_bytes: 65_536,
            total_queue_bytes: 262_144,
            notices_per_poll: 8,
            maximum_notice_bytes: 16_384,
            poll_interval_ms: 20,
            poll_timeout_ms: 1_000,
        },
        maximum_requests: 8,
        maximum_streams: 3,
        maximum_cohorts: 4,
        policy_timeout: Duration::from_secs(1),
        stream_check_interval: Duration::from_millis(10),
        maximum_stream_lifetime: Duration::from_secs(5),
        storage_refresh_interval: Duration::from_secs(1),
    }
}

async fn response_json(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), 1024 * 1024).await.unwrap()).unwrap()
}

#[test]
fn explicit_limits_reject_zero_unbounded_and_inconsistent_values() {
    let valid = limits();
    valid.validate().unwrap();
    let mut invalids = Vec::new();
    let mut invalid = valid;
    invalid.maximum_requests = 0;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.maximum_cohorts = 257;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.maximum_streams = 0;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.maximum_streams = invalid.maximum_requests;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.policy_timeout = Duration::from_secs(6);
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.stream_check_interval = Duration::ZERO;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.maximum_stream_lifetime = Duration::from_millis(1);
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.storage_refresh_interval = Duration::from_secs(61);
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.cache.max_flights = 0;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.read.max_total_cursors = 0;
    invalids.push(invalid);
    let mut invalid = valid;
    invalid.realtime.maximum_clients = 0;
    invalids.push(invalid);
    for invalid in invalids {
        assert_eq!(invalid.validate(), Err(ScopedError::Bounds));
    }
}

#[test]
fn logical_resource_rejects_sql_paths_urls_whitespace_and_unbounded_ids() {
    for good in ["orders", "financial.reports-v1", "TEST_ONLY_profile"] {
        assert_eq!(valid_resource(good), Ok(()));
    }
    for bad in [
        "",
        "orders/other",
        "https://source.invalid",
        "SELECT * FROM orders",
        " orders",
        "é",
    ] {
        assert_eq!(valid_resource(bad), Err(ScopedError::AccessDenied));
    }
    assert!(valid_resource(&"a".repeat(129)).is_err());
}

#[test]
fn bearer_requires_exactly_one_bounded_unambiguous_credential() {
    let mut headers = HeaderMap::new();
    assert_eq!(credential(&headers), Err(ScopedError::AccessDenied));
    for bad in [
        "Basic abc",
        "Bearer ",
        "Bearer one two",
        "bearer abc",
        "Bearer\tabc",
    ] {
        headers.insert(header::AUTHORIZATION, bad.parse().unwrap());
        assert_eq!(credential(&headers), Err(ScopedError::AccessDenied));
    }
    headers.insert(
        header::AUTHORIZATION,
        "Bearer TEST_ONLY-token".parse().unwrap(),
    );
    assert_eq!(credential(&headers), Ok("TEST_ONLY-token"));
    headers.append(header::AUTHORIZATION, "Bearer another".parse().unwrap());
    assert_eq!(credential(&headers), Err(ScopedError::AccessDenied));
    headers.clear();
    headers.insert(
        header::AUTHORIZATION,
        format!("Bearer {}", "x".repeat(16 * 1024 + 1))
            .parse()
            .unwrap(),
    );
    assert_eq!(credential(&headers), Err(ScopedError::AccessDenied));
}

#[test]
fn query_dto_requires_explicit_bounds_and_cannot_deserialize_authority() {
    assert!(serde_json::from_value::<PageRequest>(json!({"limit":2,"max_bytes":65536})).is_ok());
    for bad in [
        json!({"limit":2}),
        json!({"max_bytes":65536}),
        json!({"limit":2,"max_bytes":65536,"scope":{"entity_ids":null}}),
        json!({"limit":2,"max_bytes":65536,"principal_digest":"fake"}),
        json!({"limit":2,"max_bytes":65536,"operation":"EXPORT"}),
    ] {
        assert!(serde_json::from_value::<PageRequest>(bad).is_err());
    }
}

#[tokio::test]
async fn mounted_uncommissioned_routes_are_explicitly_unavailable_without_db() {
    for suffix in ["query", "history", "export", "stream"] {
        let response = uncommissioned_router()
            .oneshot(
                Request::builder()
                    .uri(format!("{ROUTE_PREFIX}/orders/{suffix}"))
                    .header(header::AUTHORIZATION, "Bearer TEST_ONLY-not-authority")
                    .body(Body::from("{\"scope\":\"all\"}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(
            response_json(response).await,
            json!({
                "schema_version":"execution.scoped-error.v1",
                "code":"CURRENT_POLICY_PROVIDER_NOT_COMMISSIONED"
            })
        );
    }
}
