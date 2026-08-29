use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use manager_v2_contract::{
    decode_success, ManagerPayload, ManagerRead, ManagerV2Request, PageLimit,
};
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _},
    net::TcpListener,
};

use super::*;

const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn catalogue_body() -> String {
    format!(
        concat!(
            r#"{{"contract_version":"{}","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":"{}","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","trace_id":"manager-client-test","as_of":"2026-08-28T00:00:00Z","data":{{"catalogue_revision":"{}","relation_count":1,"relations":[{{"id":{{"schema":"public","relation":"orders"}},"kind":"TABLE","safe_columns":[{{"name":"id","ordinal":1,"data_type":"bigint","nullable":false}}],"secret_cell_excluded_column_count":0,"key":{{"status":"PRIMARY_KEY","name":null,"columns":["id"]}},"profile_classification":"FIXED_PROFILE_CONTEXT","profile_columns":[],"query_status":"QUALIFIED_TS_OC_03D1"}}]}}}}"#
        ),
        RUNTIME_CONTRACT_REVISION, DIGEST, DIGEST
    )
}

fn relation_page_body() -> String {
    format!(
        concat!(
            r#"{{"contract_version":"{}","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":"{}","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","trace_id":"manager-client-records","as_of":"2026-08-28T00:00:00Z","data":{{"relation":{{"schema":"public","relation":"orders"}},"items":[{{"relation":{{"schema":"public","relation":"orders"}},"record_key":"record-key","fields":{{"id":{{"kind":"INTEGER","value":1}}}}}}],"next_cursor":null}}}}"#
        ),
        RUNTIME_CONTRACT_REVISION, DIGEST
    )
}

async fn one_response_server(
    captured: Arc<Mutex<Vec<String>>>,
    status: &str,
    headers: &str,
    body: String,
    response_delay: Duration,
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
        tokio::time::sleep(response_delay).await;
        let response = format!(
            "HTTP/1.1 {status}\r\n{headers}content-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
        socket.write_all(response.as_bytes()).await.unwrap();
    });
    format!("http://{address}")
}

fn qualified_headers() -> &'static str {
    "content-type: application/json\r\nx-manager-contract: trading-system.portal-execution.manager-v2.runtime.v1\r\n"
}

#[tokio::test]
async fn sends_only_fixed_manager_get_without_jwt_or_v1_api_key() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        Arc::clone(&captured),
        "200 OK",
        qualified_headers(),
        catalogue_body(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    let result = client
        .execute(&ManagerV2Request::catalogue())
        .await
        .unwrap();
    assert!(matches!(
        result,
        ManagerRead::Available(ManagerPayload::Catalogue(_))
    ));
    let request = captured.lock().unwrap().join("\n");
    assert!(
        request.contains("GET /portal/execution/v2/manager/catalog HTTP/1.1"),
        "unexpected Manager request line: {request}"
    );
    let lower = request.to_ascii_lowercase();
    assert!(lower.contains("accept: application/json"));
    assert!(lower.contains("x-request-id:"));
    for forbidden in [
        "authorization:",
        "x-api-key",
        "x-portal-paper-read-key",
        "x-portal-read-contract",
        "bearer ",
        " /v1/",
    ] {
        assert!(
            !lower.contains(forbidden),
            "unexpected header or V1 path: {forbidden}"
        );
    }
}

#[tokio::test]
async fn deployment_profile_is_exact_for_each_manager_response() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let sandbox_body = catalogue_body().replace("PAPER_BINANCE_USDM", "SANDBOX_BINANCE_USDM");
    let origin = one_response_server(
        Arc::clone(&captured),
        "200 OK",
        qualified_headers(),
        sandbox_body,
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test_with_profile(
        &origin,
        "SANDBOX_BINANCE_USDM",
        ManagerV2ClientLimits::default(),
    )
    .unwrap();
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Ok(ManagerRead::Available(ManagerPayload::Catalogue(_)))
    ));

    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        captured,
        "200 OK",
        qualified_headers(),
        catalogue_body(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test_with_profile(
        &origin,
        "SANDBOX_BINANCE_USDM",
        ManagerV2ClientLimits::default(),
    )
    .unwrap();
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Err(ManagerV2ClientError::Contract(
            manager_v2_contract::ContractError::EnvelopeIdentityMismatch
        ))
    ));
}

#[tokio::test]
async fn typed_503_is_not_empty_success_or_automatic_retry() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let unavailable = format!(
        r#"{{"contract_version":"{RUNTIME_CONTRACT_REVISION}","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":"{DIGEST}","availability":"UNAVAILABLE","reason_code":"SOURCE_UNAVAILABLE","trace_id":"manager-client-unavailable"}}"#
    );
    let origin = one_response_server(
        Arc::clone(&captured),
        "503 Service Unavailable",
        qualified_headers(),
        unavailable,
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    let result = client
        .execute(&ManagerV2Request::capabilities())
        .await
        .unwrap();
    let ManagerRead::Unavailable(result) = result else {
        panic!("expected typed unavailable result");
    };
    assert_eq!(result.reason_code(), "SOURCE_UNAVAILABLE");
    assert_eq!(captured.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn relation_page_uses_only_catalogue_bound_path_and_limit_query() {
    let catalogue_body = catalogue_body();
    let ManagerPayload::Catalogue(catalogue_response) =
        decode_success(&ManagerV2Request::catalogue(), catalogue_body.as_bytes()).unwrap()
    else {
        panic!("expected catalogue");
    };
    let catalogue = catalogue_response.into_data();
    let request = ManagerV2Request::relation_records(
        catalogue.relation("public", "orders").unwrap(),
        None,
        PageLimit::new(2).unwrap(),
    )
    .unwrap();
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        Arc::clone(&captured),
        "200 OK",
        qualified_headers(),
        relation_page_body(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    let result = client.execute(&request).await.unwrap();
    assert!(matches!(
        result,
        ManagerRead::Available(ManagerPayload::RelationRecords(_))
    ));
    assert!(captured.lock().unwrap()[0]
        .starts_with("GET /portal/execution/v2/manager/records/public/orders?limit=2 HTTP/1.1"));
}

#[tokio::test]
async fn contract_header_redirect_and_body_limits_fail_closed() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        captured,
        "200 OK",
        "content-type: application/json\r\n",
        catalogue_body(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Err(ManagerV2ClientError::ContractHeaderMismatch)
    ));

    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        captured,
        "302 Found",
        "location: http://127.0.0.1:1/escape\r\n",
        String::new(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Err(ManagerV2ClientError::RedirectDenied)
    ));

    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        captured,
        "200 OK",
        qualified_headers(),
        "x".repeat(2_048),
        Duration::ZERO,
    )
    .await;
    let limits = ManagerV2ClientLimits {
        maximum_response_bytes: 1_024,
        ..ManagerV2ClientLimits::default()
    };
    let client = ManagerV2Client::new_for_test(&origin, limits).unwrap();
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Err(ManagerV2ClientError::ResponseTooLarge)
    ));
}

#[tokio::test]
async fn queue_is_bounded_before_an_unqualified_second_request_is_sent() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        Arc::clone(&captured),
        "200 OK",
        qualified_headers(),
        catalogue_body(),
        Duration::from_millis(200),
    )
    .await;
    let limits = ManagerV2ClientLimits {
        maximum_concurrency: 1,
        queue_timeout: Duration::from_millis(10),
        ..ManagerV2ClientLimits::default()
    };
    let client = ManagerV2Client::new_for_test(&origin, limits).unwrap();
    let first_client = client.clone();
    let first =
        tokio::spawn(async move { first_client.execute(&ManagerV2Request::catalogue()).await });
    for _ in 0..20 {
        if !captured.lock().unwrap().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert!(!captured.lock().unwrap().is_empty());
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Err(ManagerV2ClientError::QueueSaturated)
    ));
    assert!(first.await.unwrap().is_ok());
}

#[test]
fn production_constructor_requires_https_mtls_and_safe_limits() {
    let missing = ManagerV2Client::new(ManagerV2ClientConfig {
        source_proxy_origin: "https://10.88.0.1:8443",
        profile_id: "PAPER_BINANCE_USDM",
        root_ca_pem: &[],
        client_identity_pem: &[],
        limits: ManagerV2ClientLimits::default(),
    });
    assert!(matches!(
        missing,
        Err(ManagerV2ClientError::MissingTrustAnchor)
    ));

    let unsafe_origin = ManagerV2Client::new(ManagerV2ClientConfig {
        source_proxy_origin: "http://10.88.0.1:8443",
        profile_id: "PAPER_BINANCE_USDM",
        root_ca_pem: b"ca",
        client_identity_pem: b"identity",
        limits: ManagerV2ClientLimits::default(),
    });
    assert!(matches!(
        unsafe_origin,
        Err(ManagerV2ClientError::InvalidSourceProxyOrigin)
    ));

    let unsafe_limits = ManagerV2Client::new_for_test(
        "http://127.0.0.1:1",
        ManagerV2ClientLimits {
            maximum_concurrency: 3,
            ..ManagerV2ClientLimits::default()
        },
    );
    assert!(matches!(
        unsafe_limits,
        Err(ManagerV2ClientError::UnsafeLimits)
    ));

    let invalid_profile = ManagerV2Client::new_for_test_with_profile(
        "http://127.0.0.1:1",
        "paper-binance",
        ManagerV2ClientLimits::default(),
    );
    assert!(matches!(
        invalid_profile,
        Err(ManagerV2ClientError::InvalidProfileId)
    ));
}
