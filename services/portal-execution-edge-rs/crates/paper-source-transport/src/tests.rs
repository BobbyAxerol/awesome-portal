use std::sync::{Arc, Mutex};

use paper_source_contract::{
    OpaqueToken, PaperReadPayload, PaperReadRequest, ReadOutcome, SourceFailureKind,
};
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _},
    net::TcpListener,
};

use super::*;

const SNAPSHOT_BODY: &str = r#"{
  "contract_revision":"d4.paper-read.v1",
  "status":"SNAPSHOT_CREATED",
  "scope_id":"PAPER_BINANCE_USDM",
  "snapshot":"snapshot-token",
  "created_at":"2026-08-25T00:00:00Z",
  "expires_at":"2026-08-25T00:05:00Z",
  "resource_counts":{"orders":1,"fills":1,"positions":1},
  "event_cursor":"event-cursor",
  "completeness":"COMPLETE_WITHIN_FIXED_SCOPE",
  "resync":"FULL_BUILDING_EPOCH_ON_SNAPSHOT_OR_CURSOR_EXPIRY"
}"#;

async fn one_response_server(
    captured: Arc<Mutex<Vec<String>>>,
    status: &str,
    headers: &str,
    body: String,
) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let status = status.to_owned();
    let headers = headers.to_owned();
    tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buffer = vec![0_u8; 16 * 1024];
        let size = socket.read(&mut buffer).await.unwrap();
        captured
            .lock()
            .unwrap()
            .push(String::from_utf8_lossy(&buffer[..size]).to_string());
        let response = format!(
            "HTTP/1.1 {status}\r\n{headers}content-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
        socket.write_all(response.as_bytes()).await.unwrap();
    });
    format!("http://{address}")
}

#[tokio::test]
async fn sends_only_enum_derived_get_without_trading_system_secret() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        Arc::clone(&captured),
        "200 OK",
        "content-type: application/json\r\n",
        SNAPSHOT_BODY.to_owned(),
    )
    .await;
    let client = PaperSourceClient::new_for_test(&origin, PaperTransportLimits::default()).unwrap();
    let outcome = client
        .execute(&PaperReadRequest::BeginSnapshot)
        .await
        .unwrap();
    assert!(matches!(
        outcome,
        ReadOutcome::Success(PaperReadPayload::SnapshotCreated(_))
    ));
    let request = captured.lock().unwrap().join("\n");
    assert!(request.starts_with("GET /v1/events?snapshot=begin HTTP/1.1"));
    let lower = request.to_ascii_lowercase();
    assert!(!lower.contains("x-api-key"));
    assert!(!lower.contains("x-portal-paper-read-key"));
    assert!(!lower.contains("x-portal-read-contract"));
}

#[tokio::test]
async fn opaque_query_values_are_percent_encoded_and_route_is_exact() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let body = r#"{"status":"DENIED","reason":"CURSOR_INVALID"}"#.to_owned();
    let origin = one_response_server(
        Arc::clone(&captured),
        "400 Bad Request",
        "content-type: application/json\r\n",
        body,
    )
    .await;
    let client = PaperSourceClient::new_for_test(&origin, PaperTransportLimits::default()).unwrap();
    let request = PaperReadRequest::EventsPage {
        cursor: OpaqueToken::parse("signed cursor/+==").unwrap(),
        page_size: 250,
    };
    let outcome = client.execute(&request).await.unwrap();
    assert!(matches!(
        outcome,
        ReadOutcome::Failure(ref failure)
            if failure.kind == SourceFailureKind::InvalidRequest
    ));
    let request = captured.lock().unwrap().join("\n");
    assert!(request
        .starts_with("GET /v1/events?cursor=signed+cursor%2F%2B%3D%3D&page_size=250 HTTP/1.1"));
}

#[tokio::test]
async fn response_size_and_redirects_fail_closed() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        captured,
        "200 OK",
        "content-type: application/json\r\n",
        "x".repeat(2_048),
    )
    .await;
    let limits = PaperTransportLimits {
        maximum_response_bytes: 1_024,
        ..PaperTransportLimits::default()
    };
    let client = PaperSourceClient::new_for_test(&origin, limits).unwrap();
    assert!(matches!(
        client.execute(&PaperReadRequest::BeginSnapshot).await,
        Err(PaperTransportError::ResponseTooLarge)
    ));

    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        captured,
        "302 Found",
        "location: http://127.0.0.1:1/escape\r\n",
        String::new(),
    )
    .await;
    let client = PaperSourceClient::new_for_test(&origin, PaperTransportLimits::default()).unwrap();
    assert!(matches!(
        client.execute(&PaperReadRequest::BeginSnapshot).await,
        Err(PaperTransportError::RedirectDenied)
    ));
}

#[tokio::test]
async fn retry_after_is_bounded_and_preserved_for_source_unavailable() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let body = r#"{"status":"ERROR","reason":"SOURCE_READ_UNAVAILABLE"}"#.to_owned();
    let origin = one_response_server(
        captured,
        "503 Service Unavailable",
        "content-type: application/json\r\nretry-after: 2\r\n",
        body,
    )
    .await;
    let client = PaperSourceClient::new_for_test(&origin, PaperTransportLimits::default()).unwrap();
    let outcome = client
        .execute(&PaperReadRequest::BeginSnapshot)
        .await
        .unwrap();
    assert!(matches!(
        outcome,
        ReadOutcome::Failure(ref failure)
            if failure.kind == SourceFailureKind::SourceUnavailable
                && failure.retry_after_seconds == Some(2)
    ));

    let captured = Arc::new(Mutex::new(Vec::new()));
    let body = r#"{"status":"ERROR","reason":"SOURCE_READ_UNAVAILABLE"}"#.to_owned();
    let origin = one_response_server(
        captured,
        "503 Service Unavailable",
        "content-type: application/json\r\nretry-after: 301\r\n",
        body,
    )
    .await;
    let client = PaperSourceClient::new_for_test(&origin, PaperTransportLimits::default()).unwrap();
    assert!(matches!(
        client.execute(&PaperReadRequest::BeginSnapshot).await,
        Err(PaperTransportError::InvalidRetryAfter)
    ));
}

#[test]
fn production_constructor_requires_https_mtls_and_bounded_limits() {
    let missing = PaperSourceClient::new(PaperSourceTransportConfig {
        source_proxy_origin: "https://10.88.0.1:8443",
        root_ca_pem: &[],
        client_identity_pem: &[],
        limits: PaperTransportLimits::default(),
    });
    assert!(matches!(
        missing,
        Err(PaperTransportError::MissingTrustAnchor)
    ));

    let unsafe_origin = PaperSourceClient::new(PaperSourceTransportConfig {
        source_proxy_origin: "http://10.88.0.1:8443",
        root_ca_pem: b"ca",
        client_identity_pem: b"identity",
        limits: PaperTransportLimits::default(),
    });
    assert!(matches!(
        unsafe_origin,
        Err(PaperTransportError::InvalidSourceProxyOrigin)
    ));

    let unsafe_limits = PaperSourceClient::new_for_test(
        "http://127.0.0.1:1",
        PaperTransportLimits {
            maximum_concurrency: 5,
            ..PaperTransportLimits::default()
        },
    );
    assert!(matches!(
        unsafe_limits,
        Err(PaperTransportError::UnsafeLimits)
    ));
}
