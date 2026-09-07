use super::*;
use chrono::{TimeZone as _, Utc};

fn market_body() -> Vec<u8> {
    br#"{"schema_version":"trading-system.portal-execution.market-context-envelope.v1","contract_revision":"trading-system.portal-execution.market-context.v1","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","as_of_ms":1788500000000,"data":{"operation_id":"managerMarketContextLatestV1","items":[{"venue":"BINANCE","instrument":"BTCUSDT","value":"1.0","observation_kind":"TRADE","observed_at_ms":1788500000000,"quote_currency":"USDT","provider":"data-layer-v1-compatible"}]}}"#.to_vec()
}

#[test]
fn latest_is_fixed_and_profile_bound() {
    let request = ManagerExtensionRequest::market_latest("BINANCE", "BTCUSDT").unwrap();
    let blueprint = request.blueprint();
    assert_eq!(
        blueprint.path(),
        "/portal/execution/v2/manager/market/latest"
    );
    assert!(matches!(
        decode_extension_success_for_profile(&request, &market_body(), "PAPER_BINANCE_USDM"),
        Ok(ManagerExtensionRead::Market(_))
    ));
    assert!(
        decode_extension_success_for_profile(&request, &market_body(), "LIVE_BINANCE_USDM")
            .is_err()
    );
}

#[test]
fn event_tail_requires_safe_contiguous_records() {
    let request = ManagerExtensionRequest::event_tail("pel2.abc", "pec2.abc", 2).unwrap();
    let body = br#"{"schema_version":"trading-system.portal-execution.event-ledger-envelope.v1","contract_revision":"trading-system.portal-execution.event-ledger.v1","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","availability":"AVAILABLE","freshness":"FRESH","completeness":"PARTIAL","as_of_ms":1788500000000,"data":{"operation_id":"managerEventLedgerTailV1","epoch":"abc","source_epoch":"00000000-0000-0000-0000-000000000001","snapshot_semantics":"EVENT_LOG_ANCHOR","cursor":"pec2.next","retention_floor":1,"as_of":"2026-09-06T00:00:00Z","events":[{"source_sequence":1,"event_id":"00000000-0000-0000-0000-000000000001","entity":"domain_event","entity_id":"00000000-0000-0000-0000-000000000001","operation":"UPSERT","entity_version":"1","observed_at":"2026-09-06T00:00:00Z","record":{"schema_version":"v1","occurred_at":"2026-09-06T00:00:00Z","payload_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}]}}"#;
    let ManagerExtensionRead::EventTail(tail) =
        decode_extension_success_for_profile(&request, body, "PAPER_BINANCE_USDM").unwrap()
    else {
        panic!("expected tail");
    };
    assert_eq!(tail.events.len(), 1);
    assert_eq!(tail.events[0].source_sequence, 1);
}

#[test]
fn market_cannot_smuggle_raw_payload() {
    let request = ManagerExtensionRequest::market_latest("BINANCE", "BTCUSDT").unwrap();
    let mut body = String::from_utf8(market_body()).unwrap();
    body = body.replace("\"items\":[", "\"raw\":{},\"items\":[");
    assert!(matches!(
        decode_extension_success_for_profile(&request, body.as_bytes(), "PAPER_BINANCE_USDM"),
        Err(ExtensionContractError::InvalidMarketData)
    ));
}

#[test]
fn data_layer_latest_is_normalized_without_exposing_raw_source_shape() {
    let request = ManagerExtensionRequest::market_latest("BINANCE", "BTCUSDT").unwrap();
    let raw = br#"{"symbol":"BTCUSDT","market":"usdm","is_live":true,"snapshot":{"symbol":"BTCUSDT","market":"usdm","price":"105123.000000000000000001","event_time":1788500000000,"provider":"data-layer"}}"#;
    let ManagerExtensionRead::Market(envelope) = adapt_data_layer_market_response_for_profile(
        &request,
        raw,
        "PAPER_BINANCE_USDM",
        Utc.timestamp_millis_opt(1_788_500_005_000)
            .single()
            .unwrap(),
    )
    .unwrap() else {
        panic!("expected market envelope");
    };
    let wire = envelope.into_wire();
    assert_eq!(
        wire["data"]["items"][0]["value"],
        "105123.000000000000000001"
    );
    assert_eq!(wire["data"]["items"][0]["quote_currency"], "USDT");
    assert_eq!(wire["completeness"], "POLL_BOUNDED");
    assert!(wire.get("snapshot").is_none());
}

#[test]
fn data_layer_candles_use_provider_bound_and_unknown_coverage() {
    let request =
        ManagerExtensionRequest::market_candles("BINANCE", "BTCUSDT", "1m", 1_000, 3_000, 2_000)
            .unwrap();
    let blueprint = request.data_layer_blueprint();
    assert!(blueprint
        .query()
        .contains(&("point_limit", "1500".to_owned())));
    let raw = br#"{"symbol":"BTCUSDT","market":"usdm","params":{"symbol":"BTCUSDT","interval":"1m","limit":1500},"data":[[1000,"100","110","90","105","12.500",1999,"0",0,"0","0","0"],[2000,"105","115","95","110","3",2999,"0",0,"0","0","0"]]}"#;
    let ManagerExtensionRead::Market(envelope) = adapt_data_layer_market_response_for_profile(
        &request,
        raw,
        "LIVE_BINANCE_USDM",
        Utc.timestamp_millis_opt(3_000).single().unwrap(),
    )
    .unwrap() else {
        panic!("expected market envelope");
    };
    let wire = envelope.into_wire();
    assert_eq!(wire["data"]["coverage"], "UNKNOWN");
    assert_eq!(wire["data"]["sampling"], "SOURCE_BOUNDED");
    assert_eq!(wire["data"]["items"].as_array().unwrap().len(), 2);
}

#[test]
fn data_layer_adapter_rejects_profile_venue_and_decimal_drift() {
    let request = ManagerExtensionRequest::market_latest("BINANCE", "BTCUSDT").unwrap();
    let raw = br#"{"symbol":"BTCUSDT","market":"usdm","snapshot":{"symbol":"BTCUSDT","market":"usdm","price":1,"event_time":1788500000000}}"#;
    assert!(adapt_data_layer_market_response_for_profile(
        &request,
        raw,
        "PAPER_BINANCE_USDM",
        Utc::now(),
    )
    .is_err());
    assert!(adapt_data_layer_market_response_for_profile(
        &request,
        br#"{"symbol":"BTCUSDT","market":"usdm","snapshot":{"symbol":"BTCUSDT","market":"usdm","price":"1","event_time":1788500000000}}"#,
        "PAPER_DNSE_VNM",
        Utc::now(),
    )
    .is_err());
}
