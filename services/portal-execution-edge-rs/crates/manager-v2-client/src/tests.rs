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

fn market_data_layer_headers() -> &'static str {
    "content-type: application/json\r\nx-portal-source-adapter: portal.execution.market-context-data-layer.v1\r\n"
}

/// Two owner-issued pages, one fixed origin; no cursor rewriting or hidden
/// retry. Every listener belongs to the current Tokio test runtime.
async fn page_sequence_server(captured: Arc<Mutex<Vec<String>>>, bodies: Vec<String>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        for body in bodies {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0_u8; 16 * 1024];
            let size = socket.read(&mut buffer).await.unwrap();
            captured
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&buffer[..size]).to_string());
            let response = format!(
                "HTTP/1.1 200 OK\r\n{}content-length: {}\r\nconnection: close\r\n\r\n{body}",
                qualified_headers(),
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    format!("http://{address}")
}

const DEPLOYMENT_PROFILES: [&str; 3] = [
    "PAPER_BINANCE_USDM",
    "SANDBOX_BINANCE_USDM",
    "LIVE_BINANCE_USDM",
];

#[tokio::test]
async fn all_mode_pages_preserve_owner_cursor_quality_and_terminal_boundary() {
    for profile in DEPLOYMENT_PROFILES {
        let catalogue_wire = catalogue_body().replace(PROFILE_ID, profile);
        let ManagerPayload::Catalogue(catalogue) = decode_success_for_profile(
            &ManagerV2Request::catalogue(),
            catalogue_wire.as_bytes(),
            profile,
        )
        .unwrap() else {
            panic!("expected catalogue");
        };
        let relation = catalogue.data().relation("public", "orders").unwrap();
        let first_body = relation_page_body()
            .replace(PROFILE_ID, profile)
            .replace(
                "\"completeness\":\"COMPLETE\"",
                "\"completeness\":\"PARTIAL\"",
            )
            .replace("\"freshness\":\"FRESH\"", "\"freshness\":\"STALE\"")
            .replace("\"next_cursor\":null", "\"next_cursor\":\"opaque_page-2\"");
        let last_body = relation_page_body().replace(PROFILE_ID, profile);
        let captured = Arc::new(Mutex::new(Vec::new()));
        let origin = page_sequence_server(Arc::clone(&captured), vec![first_body, last_body]).await;
        let client = ManagerV2Client::new_for_test_with_profile(
            &origin,
            profile,
            ManagerV2ClientLimits::default(),
        )
        .unwrap();
        let first_request =
            ManagerV2Request::relation_records(relation, None, PageLimit::new(1).unwrap()).unwrap();
        let ManagerRead::Available(ManagerPayload::RelationRecords(first)) =
            client.execute(&first_request).await.unwrap()
        else {
            panic!("expected first page");
        };
        assert_eq!(first.meta().profile_id(), profile);
        assert_eq!(
            first.meta().completeness(),
            manager_v2_contract::Completeness::Partial
        );
        assert_eq!(
            first.meta().freshness(),
            manager_v2_contract::Freshness::Stale
        );
        assert_eq!(first.data().items().len(), 1);
        let cursor = first.data().next_cursor().expect("owner has more rows");
        assert_eq!(cursor.as_str(), "opaque_page-2");
        let next_request =
            ManagerV2Request::relation_records(relation, Some(cursor), PageLimit::new(1).unwrap())
                .unwrap();
        let ManagerRead::Available(ManagerPayload::RelationRecords(last)) =
            client.execute(&next_request).await.unwrap()
        else {
            panic!("expected terminal page");
        };
        // Terminal metadata is this page's source declaration, not a locally
        // synthesized whole-history completeness or freshness statement.
        assert_eq!(last.meta().profile_id(), profile);
        assert!(last.data().next_cursor().is_none());
        assert_eq!(last.data().items().len(), 1);
        let requests = captured.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].starts_with(
            "GET /portal/execution/v2/manager/records/public/orders?limit=1 HTTP/1.1"
        ));
        assert!(requests[1].starts_with(
            "GET /portal/execution/v2/manager/records/public/orders?limit=1&cursor=opaque_page-2 HTTP/1.1"
        ));
        for request in requests.iter() {
            let lower = request.to_ascii_lowercase();
            assert!(!lower.contains("authorization:"));
            assert!(!lower.contains("profile="));
            assert!(!lower.contains("x-api-key:"));
        }
    }
}

#[tokio::test]
async fn explicit_cursor_continuation_after_rate_limit_does_not_retry_in_client() {
    let ManagerPayload::Catalogue(catalogue) =
        decode_success(&ManagerV2Request::catalogue(), catalogue_body().as_bytes()).unwrap()
    else {
        panic!("expected catalogue");
    };
    let relation = catalogue.data().relation("public", "orders").unwrap();
    let first_body = relation_page_body()
        .replace(
            "\"completeness\":\"COMPLETE\"",
            "\"completeness\":\"PARTIAL\"",
        )
        .replace("\"freshness\":\"FRESH\"", "\"freshness\":\"STALE\"")
        .replace("\"next_cursor\":null", "\"next_cursor\":\"opaque_page-2\"");
    let final_body = relation_page_body()
        .replace("record-key", "record-key-2")
        .replace("\"value\":1", "\"value\":2");
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let captured = Arc::new(Mutex::new(Vec::new()));
    let captured_server = Arc::clone(&captured);
    let server = tokio::spawn(async move {
        for (status, headers, body) in [
            ("200 OK", qualified_headers(), first_body),
            ("429 Too Many Requests", "retry-after: 2\r\n", String::new()),
            ("200 OK", qualified_headers(), final_body),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0_u8; 16 * 1024];
            let size = socket.read(&mut buffer).await.unwrap();
            captured_server
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&buffer[..size]).to_string());
            let response = format!(
                "HTTP/1.1 {status}\r\n{headers}content-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    let client = ManagerV2Client::new_for_test(
        &format!("http://{address}"),
        ManagerV2ClientLimits::default(),
    )
    .unwrap();
    let first_request =
        ManagerV2Request::relation_records(relation, None, PageLimit::new(1).unwrap()).unwrap();
    let ManagerRead::Available(ManagerPayload::RelationRecords(first)) =
        client.execute(&first_request).await.unwrap()
    else {
        panic!("expected first page");
    };
    assert_eq!(
        first.meta().completeness(),
        manager_v2_contract::Completeness::Partial
    );
    assert_eq!(
        first.meta().freshness(),
        manager_v2_contract::Freshness::Stale
    );
    let cursor = first.data().next_cursor().unwrap();
    let next =
        ManagerV2Request::relation_records(relation, Some(cursor), PageLimit::new(1).unwrap())
            .unwrap();
    assert!(matches!(
        client.execute(&next).await,
        Err(ManagerV2ClientError::RateLimited { retry_after: Some(delay) })
            if delay == Duration::from_secs(2)
    ));
    assert_eq!(captured.lock().unwrap().len(), 2);
    // TEST_ONLY manual continuation: the caller, not this client, enforces
    // the delay in production. This checks the identical cursor is retained.
    let ManagerRead::Available(ManagerPayload::RelationRecords(last)) =
        client.execute(&next).await.unwrap()
    else {
        panic!("expected terminal page");
    };
    assert!(last.data().next_cursor().is_none());
    assert_eq!(last.data().items().len(), 1);
    server.await.unwrap();
    let requests = captured.lock().unwrap();
    assert_eq!(requests.len(), 3);
    let expected = "GET /portal/execution/v2/manager/records/public/orders?limit=1&cursor=opaque_page-2 HTTP/1.1";
    assert!(requests[1].starts_with(expected));
    assert!(requests[2].starts_with(expected));
}

#[tokio::test]
async fn all_mode_catalogue_responses_cannot_fall_back_across_profiles() {
    for deployment in DEPLOYMENT_PROFILES {
        for response_profile in DEPLOYMENT_PROFILES {
            if response_profile == deployment {
                continue;
            }
            let captured = Arc::new(Mutex::new(Vec::new()));
            let origin = one_response_server(
                Arc::clone(&captured),
                "200 OK",
                qualified_headers(),
                catalogue_body().replace(PROFILE_ID, response_profile),
                Duration::ZERO,
            )
            .await;
            let client = ManagerV2Client::new_for_test_with_profile(
                &origin,
                deployment,
                ManagerV2ClientLimits::default(),
            )
            .unwrap();
            assert!(matches!(
                client.execute(&ManagerV2Request::catalogue()).await,
                Err(ManagerV2ClientError::Contract(
                    manager_v2_contract::ContractError::EnvelopeIdentityMismatch
                ))
            ));
            assert_eq!(captured.lock().unwrap().len(), 1);
        }
    }
}

#[tokio::test]
async fn all_mode_unavailability_is_profile_bound_and_never_retried() {
    for deployment in DEPLOYMENT_PROFILES {
        for response_profile in DEPLOYMENT_PROFILES {
            let body = format!(
                r#"{{"contract_version":"{RUNTIME_CONTRACT_REVISION}","authority":"EXECUTION_CELL","profile_id":"{response_profile}","catalogue_sha256":"{DIGEST}","availability":"UNAVAILABLE","reason_code":"SOURCE_UNAVAILABLE","trace_id":"test-only-profile-unavailable"}}"#
            );
            let captured = Arc::new(Mutex::new(Vec::new()));
            let origin = one_response_server(
                Arc::clone(&captured),
                "503 Service Unavailable",
                qualified_headers(),
                body,
                Duration::ZERO,
            )
            .await;
            let client = ManagerV2Client::new_for_test_with_profile(
                &origin,
                deployment,
                ManagerV2ClientLimits::default(),
            )
            .unwrap();
            let outcome = client.execute(&ManagerV2Request::catalogue()).await;
            if response_profile == deployment {
                assert!(matches!(outcome, Ok(ManagerRead::Unavailable(_))));
            } else {
                assert!(matches!(outcome, Err(ManagerV2ClientError::Contract(_))));
            }
            assert_eq!(captured.lock().unwrap().len(), 1);
        }
    }
}

#[tokio::test]
async fn all_mode_single_page_row_bound_is_enforced_before_exposing_records() {
    for profile in DEPLOYMENT_PROFILES {
        let catalogue_wire = catalogue_body().replace(PROFILE_ID, profile);
        let ManagerPayload::Catalogue(catalogue) = decode_success_for_profile(
            &ManagerV2Request::catalogue(),
            catalogue_wire.as_bytes(),
            profile,
        )
        .unwrap() else {
            panic!("expected catalogue");
        };
        let request = ManagerV2Request::relation_records(
            catalogue.data().relation("public", "orders").unwrap(),
            None,
            PageLimit::new(1).unwrap(),
        )
        .unwrap();
        let extra_record = r#"{"relation":{"schema":"public","relation":"orders"},"record_key":"record-key-2","fields":{"id":{"kind":"INTEGER","value":2}}}"#;
        let body = relation_page_body()
            .replace(PROFILE_ID, profile)
            .replace("\"items\":[", &format!("\"items\":[{extra_record},"));
        let captured = Arc::new(Mutex::new(Vec::new()));
        let origin = one_response_server(
            Arc::clone(&captured),
            "200 OK",
            qualified_headers(),
            body,
            Duration::ZERO,
        )
        .await;
        let client = ManagerV2Client::new_for_test_with_profile(
            &origin,
            profile,
            ManagerV2ClientLimits::default(),
        )
        .unwrap();
        assert!(matches!(
            client.execute(&request).await,
            Err(ManagerV2ClientError::Contract(
                manager_v2_contract::ContractError::RelationBindingDenied
            ))
        ));
        assert_eq!(captured.lock().unwrap().len(), 1);
    }
}

#[test]
fn json_media_type_requires_an_exact_single_value_on_every_source_boundary() {
    for content_type in [
        "application/json",
        "Application/JSON",
        "application/json; charset=utf-8",
    ] {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_str(content_type).unwrap());
        assert!(validate_json_content_type(&headers).is_ok());
    }
    for content_type in [
        "application/jsonp",
        "application/json-seq",
        "application/json, text/html",
        "text/html",
        "",
    ] {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("content-type", HeaderValue::from_str(content_type).unwrap());
        headers.insert(
            "x-manager-contract",
            HeaderValue::from_static(RUNTIME_CONTRACT_REVISION),
        );
        headers.insert(
            "x-portal-source-adapter",
            HeaderValue::from_static(MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION),
        );
        assert!(matches!(
            validate_response_headers(&headers),
            Err(ManagerV2ClientError::InvalidContentType)
        ));
        assert!(matches!(
            validate_extension_response_headers(&headers, RUNTIME_CONTRACT_REVISION),
            Err(ManagerV2ClientError::InvalidContentType)
        ));
        assert!(matches!(
            validate_market_context_adapter_headers(&headers),
            Err(ManagerV2ClientError::InvalidContentType)
        ));
    }
}

#[test]
fn duplicate_revision_and_media_type_fields_are_rejected_even_if_first_is_valid() {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("content-type", HeaderValue::from_static("application/json"));
    headers.insert(
        "x-manager-contract",
        HeaderValue::from_static(RUNTIME_CONTRACT_REVISION),
    );
    headers.insert(
        "x-portal-source-adapter",
        HeaderValue::from_static(MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION),
    );
    for second in [RUNTIME_CONTRACT_REVISION, "wrong-revision"] {
        let mut duplicate = headers.clone();
        duplicate.append("x-manager-contract", HeaderValue::from_static(second));
        assert!(matches!(
            validate_response_headers(&duplicate),
            Err(ManagerV2ClientError::ContractHeaderMismatch)
        ));
        assert!(matches!(
            validate_extension_response_headers(&duplicate, RUNTIME_CONTRACT_REVISION),
            Err(ManagerV2ClientError::ExtensionContractHeaderMismatch)
        ));
    }
    for second in [MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION, "wrong-adapter"] {
        let mut duplicate = headers.clone();
        duplicate.append("x-portal-source-adapter", HeaderValue::from_static(second));
        assert!(matches!(
            validate_market_context_adapter_headers(&duplicate),
            Err(ManagerV2ClientError::MarketContextAdapterHeaderMismatch)
        ));
    }
    for second in ["application/json", "text/html"] {
        let mut duplicate = headers.clone();
        duplicate.append("content-type", HeaderValue::from_static(second));
        assert!(matches!(
            validate_response_headers(&duplicate),
            Err(ManagerV2ClientError::InvalidContentType)
        ));
        assert!(matches!(
            validate_extension_response_headers(&duplicate, RUNTIME_CONTRACT_REVISION),
            Err(ManagerV2ClientError::InvalidContentType)
        ));
        assert!(matches!(
            validate_market_context_adapter_headers(&duplicate),
            Err(ManagerV2ClientError::InvalidContentType)
        ));
    }
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
async fn record_probe_errors_never_become_authoritative_absence_in_any_profile() {
    // TEST_ONLY: neither a route-level 404 nor the current owner's structured
    // RECORD_NOT_FOUND carries a source snapshot/generation or observation
    // timestamp. The existing client must not turn either into a tombstone.
    for profile in [
        "PAPER_BINANCE_USDM",
        "SANDBOX_BINANCE_USDM",
        "CANARY_BINANCE_USDM",
        "LIVE_BINANCE_USDM",
    ] {
        let catalogue_wire = catalogue_body().replace(PROFILE_ID, profile);
        let ManagerPayload::Catalogue(catalogue) = decode_success_for_profile(
            &ManagerV2Request::catalogue(),
            catalogue_wire.as_bytes(),
            profile,
        )
        .unwrap() else {
            panic!("expected catalogue");
        };
        let relation = catalogue.data().relation("public", "orders").unwrap();
        let page_request =
            ManagerV2Request::relation_records(relation, None, PageLimit::new(2).unwrap())
                .unwrap();
        let page_wire = relation_page_body().replace(PROFILE_ID, profile);
        let ManagerPayload::RelationRecords(page) =
            decode_success_for_profile(&page_request, page_wire.as_bytes(), profile).unwrap()
        else {
            panic!("expected records");
        };
        let record_request = ManagerV2Request::record(&page.data().items()[0], relation).unwrap();
        for (status, reason, expected_status) in [
            ("404 Not Found", "RECORD_NOT_FOUND", 404),
            ("404 Not Found", "ROUTE_NOT_FOUND", 404),
            ("400 Bad Request", "CURSOR_EXPIRED", 400),
            ("401 Unauthorized", "UNAUTHORIZED", 401),
            ("429 Too Many Requests", "RATE_LIMITED", 429),
            ("503 Service Unavailable", "SOURCE_UNAVAILABLE", 503),
        ] {
            let body = format!(
                r#"{{"contract_version":"{RUNTIME_CONTRACT_REVISION}","authority":"EXECUTION_CELL","profile_id":"{profile}","catalogue_sha256":"{DIGEST}","availability":"UNAVAILABLE","reason_code":"{reason}","trace_id":"test-record-probe"}}"#
            );
            let captured = Arc::new(Mutex::new(Vec::new()));
            let origin = one_response_server(
                Arc::clone(&captured),
                status,
                qualified_headers(),
                body,
                Duration::ZERO,
            )
            .await;
            let client = ManagerV2Client::new_for_test_with_profile(
                &origin,
                profile,
                ManagerV2ClientLimits::default(),
            )
            .unwrap();
            match (expected_status, client.execute(&record_request).await) {
                (429, Err(ManagerV2ClientError::RateLimited { .. })) => {}
                (503, Ok(ManagerRead::Unavailable(unavailable))) => {
                    assert_eq!(unavailable.reason_code(), "SOURCE_UNAVAILABLE");
                    assert_eq!(unavailable.profile_id(), profile);
                }
                (expected, Err(ManagerV2ClientError::UnexpectedHttpStatus(actual)))
                    if expected != 429 && expected != 503 =>
                {
                    assert_eq!(actual, expected);
                }
                (expected, result) => panic!("unexpected status {expected}: {result:?}"),
            }
            let requests = captured.lock().unwrap();
            assert_eq!(requests.len(), 1, "client must not retry implicitly");
            assert!(requests[0].starts_with(
                "GET /portal/execution/v2/manager/records/public/orders/record-key HTTP/1.1"
            ));
        }
    }
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
        "429 Too Many Requests",
        "content-type: text/html\r\n",
        String::new(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    assert!(matches!(
        client.execute(&ManagerV2Request::catalogue()).await,
        Err(ManagerV2ClientError::RateLimited { retry_after: None })
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
async fn rate_limit_preserves_server_delay_without_hidden_retry() {
    for (header, expected) in [
        ("retry-after: 17\r\n", Some(Duration::from_secs(17))),
        ("retry-after: 0\r\n", Some(Duration::ZERO)),
        (
            "retry-after: Wed, 21 Oct 2015 07:28:00 GMT\r\n",
            Some(Duration::ZERO),
        ),
        ("", None),
    ] {
        let captured = Arc::new(Mutex::new(Vec::new()));
        let origin = one_response_server(
            Arc::clone(&captured),
            "429 Too Many Requests",
            header,
            String::new(),
            Duration::ZERO,
        )
        .await;
        let client =
            ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
        assert!(matches!(
            client.execute(&ManagerV2Request::catalogue()).await,
            Err(ManagerV2ClientError::RateLimited { retry_after }) if retry_after == expected
        ));
        assert_eq!(captured.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn rate_limit_preserves_future_http_date() {
    let date = (chrono::Utc::now() + chrono::Duration::seconds(300))
        .format("%a, %d %b %Y %H:%M:%S GMT")
        .to_string();
    let header = format!("retry-after: {date}\r\n");
    let captured = Arc::new(Mutex::new(Vec::new()));
    let origin = one_response_server(
        Arc::clone(&captured),
        "429 Too Many Requests",
        &header,
        String::new(),
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    let Err(ManagerV2ClientError::RateLimited {
        retry_after: Some(delay),
    }) = client.execute(&ManagerV2Request::catalogue()).await
    else {
        panic!("future HTTP-date must yield a delay");
    };
    assert!(delay > Duration::from_secs(250) && delay <= Duration::from_secs(300));
    assert_eq!(captured.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn malformed_or_ambiguous_retry_after_fails_closed() {
    for header in [
        "retry-after: later\r\n",
        "retry-after: 18446744073709551616\r\n",
        "retry-after: 1\r\nretry-after: 2\r\n",
    ] {
        let captured = Arc::new(Mutex::new(Vec::new()));
        let origin = one_response_server(
            Arc::clone(&captured),
            "429 Too Many Requests",
            header,
            String::new(),
            Duration::ZERO,
        )
        .await;
        let client =
            ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
        assert!(matches!(
            client.execute(&ManagerV2Request::catalogue()).await,
            Err(ManagerV2ClientError::InvalidRetryAfter)
        ));
        assert_eq!(captured.lock().unwrap().len(), 1);
    }
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

#[tokio::test]
async fn market_context_uses_the_sealed_data_layer_adapter_and_normalizes_the_body() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let raw = r#"{"symbol":"BTCUSDT","market":"usdm","is_live":true,"snapshot":{"symbol":"BTCUSDT","market":"usdm","price":"1.25","event_time":1788500000000,"provider":"data-layer"}}"#.to_owned();
    let origin = one_response_server(
        Arc::clone(&captured),
        "200 OK",
        market_data_layer_headers(),
        raw,
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    let result = client
        .execute_extension(&ManagerExtensionRequest::market_latest("BINANCE", "BTCUSDT").unwrap())
        .await
        .unwrap();
    let ManagerExtensionRead::Market(envelope) = result else {
        panic!("expected normalized market envelope");
    };
    assert_eq!(envelope.wire()["data"]["items"][0]["value"], "1.25");
    let request = captured.lock().unwrap().join("\n");
    assert!(request.contains(
        "GET /portal/execution/v2/manager/market/latest?venue=BINANCE&instrument=BTCUSDT HTTP/1.1"
    ));
    let lower = request.to_ascii_lowercase();
    assert!(!lower.contains("authorization:"));
    assert!(!lower.contains(" /v1/"));
}

#[tokio::test]
async fn market_context_fails_closed_when_the_adapter_header_is_missing() {
    let captured = Arc::new(Mutex::new(Vec::new()));
    let raw = r#"{"symbol":"BTCUSDT","market":"usdm","snapshot":{"symbol":"BTCUSDT","market":"usdm","price":"1","event_time":1788500000000}}"#.to_owned();
    let origin = one_response_server(
        captured,
        "200 OK",
        "content-type: application/json\r\n",
        raw,
        Duration::ZERO,
    )
    .await;
    let client = ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
    assert!(matches!(
        client
            .execute_extension(
                &ManagerExtensionRequest::market_latest("BINANCE", "BTCUSDT").unwrap()
            )
            .await,
        Err(ManagerV2ClientError::MarketContextAdapterHeaderMismatch)
    ));
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

fn s1_catalogue_body() -> String {
    let relation = |name: &str| {
        format!(
            r#"{{"id":{{"schema":"public","relation":"{name}"}},"kind":"TABLE","safe_columns":[{{"name":"id","ordinal":1,"data_type":"bigint","nullable":false}}],"secret_cell_excluded_column_count":0,"key":{{"status":"PRIMARY_KEY","name":null,"columns":["id"]}},"profile_classification":"FIXED_PROFILE_CONTEXT","profile_columns":[],"query_status":"QUALIFIED_TS_OC_03D1"}}"#
        )
    };
    format!(
        r#"{{"contract_version":"{}","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":"{}","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","trace_id":"manager-client-s1","as_of":"2026-08-28T00:00:00Z","data":{{"catalogue_revision":"{}","relation_count":2,"relations":[{},{}]}}}}"#,
        RUNTIME_CONTRACT_REVISION,
        DIGEST,
        DIGEST,
        relation("account_balances"),
        relation("portfolios")
    )
}

/// A relation page as the S1 Manager (`manager_s1.py`) answers for `account_balances` and `portfolios`:
/// the usual envelope plus a `source_snapshot` member.
fn s1_page_body(relation: &str, scope: &str) -> String {
    format!(
        r#"{{"contract_version":"{}","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":"{}","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","trace_id":"manager-client-s1-page","as_of":"2026-08-28T00:00:00Z","source_snapshot":{{"version":"edge-s1.v1","mechanism":"M0","source_id":"sha256:{}","relation":"public.{relation}","scope":{scope},"generation":{{"at":"2026-08-28T00:00:00Z","snapshot":"10:20:11,12"}},"total_in_scope":1,"status":"COMPLETE","reason":null,"absence_authority":false}},"data":{{"relation":{{"schema":"public","relation":"{relation}"}},"items":[{{"relation":{{"schema":"public","relation":"{relation}"}},"record_key":"record-key","fields":{{"id":{{"kind":"INTEGER","value":1}}}}}}],"next_cursor":null}}}}"#,
        RUNTIME_CONTRACT_REVISION,
        DIGEST,
        "a".repeat(64)
    )
}

#[tokio::test]
async fn s1_pages_of_portfolios_and_account_balances_pass_the_whole_client_and_decoder_path() {
    // Regression for the integrated Edge that answered 502 MANAGER_V2_SOURCE_CONTRACT_REJECTED for exactly
    // these two relations: the response goes through the real HTTP client, header checks and the decoder.
    let ManagerPayload::Catalogue(catalogue_response) = decode_success(
        &ManagerV2Request::catalogue(),
        s1_catalogue_body().as_bytes(),
    )
    .unwrap() else {
        panic!("expected catalogue");
    };
    let catalogue = catalogue_response.into_data();
    for (relation, scope) in [
        ("account_balances", r#"{"mode":"paper","venue":"OKX"}"#),
        ("portfolios", "null"),
    ] {
        let request = ManagerV2Request::relation_records(
            catalogue.relation("public", relation).unwrap(),
            None,
            PageLimit::new(2).unwrap(),
        )
        .unwrap();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let origin = one_response_server(
            Arc::clone(&captured),
            "200 OK",
            qualified_headers(),
            s1_page_body(relation, scope),
            Duration::ZERO,
        )
        .await;
        let client =
            ManagerV2Client::new_for_test(&origin, ManagerV2ClientLimits::default()).unwrap();
        let ManagerRead::Available(ManagerPayload::RelationRecords(page)) =
            client.execute(&request).await.unwrap()
        else {
            panic!("{relation}: expected an available relation page");
        };
        let snapshot = page.meta().source_snapshot().unwrap();
        assert_eq!(snapshot.relation, format!("public.{relation}"));
        assert!(!snapshot.absence_authority);
        assert_eq!(captured.lock().unwrap().len(), 1);
    }
}
