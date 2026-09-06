use super::*;

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
