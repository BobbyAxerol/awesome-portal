use rust_decimal::Decimal;

use super::*;

const BINANCE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/fixtures/binance-candles.valid.json"
));
const VNM: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/fixtures/vnm-candles.valid.json"
));
const PENDING_OWNER: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/owner-response.pending.example.json"
));
const TICK: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/fixtures/gateway-tick.valid.json"
));
const CALENDAR: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/fixtures/session-calendar.valid.json"
));
const EVENTS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/fixtures/gateway-events.valid.json"
));

#[test]
fn embedded_inventory_is_exact_and_dark() {
    let summary = validate_embedded_authority().expect("valid N28 authority");
    assert_eq!(summary.alternative_adapters, 13);
    assert_eq!(summary.owner_contract_entries, 9);
    assert_eq!(summary.intentional_exclusions, 3);
    assert_eq!(summary.runtime_effect, "NONE");
    assert_eq!(embedded_contract_sha256().len(), 64);
}

#[test]
fn request_builders_are_bounded_and_not_dispatchable() {
    let tick = market_tick_request("BINANCE", "BTCUSDT", Some("USDM")).expect("tick");
    assert_eq!(
        tick.relative_path_and_query,
        "/v1/market/latest/BINANCE/BTCUSDT?product=USDM"
    );
    assert!(tick.source_dark);
    assert!(!tick.mutation_candidate);

    let crypto = crypto_candles_request("BTCUSDT", "1m", 1500, "um").expect("crypto");
    assert_eq!(crypto.maximum_rows, 1500);
    assert!(crypto.relative_path_and_query.ends_with("market=um"));

    let vnm = vnm_candles_request("VN30F1M", "1m", 2000).expect("vnm");
    assert!(vnm.relative_path_and_query.ends_with("fresh=false"));
    assert_eq!(venue_calendar_request().maximum_rows, 8);

    assert_eq!(
        crypto_candles_request("BTCUSDT", "1m", 1501, "um"),
        Err(N28Error::InvalidParameter)
    );
    assert_eq!(
        market_tick_request("../../etc", "BTCUSDT", None),
        Err(N28Error::InvalidParameter)
    );
}

#[test]
fn current_event_source_never_claims_full_completeness() {
    let events = order_events_request("live", "BINANCE", 5000).expect("events");
    assert_eq!(events.completeness, "ORDER_LIFECYCLE_ONLY_POLL_BOUNDED");
    assert_ne!(events.completeness, "FULL_INCREMENTAL");
    assert!(events.source_dark);
    let normalized = normalize_order_lifecycle_events(EVENTS, 2).expect("event page");
    assert_eq!(normalized.count, 2);
    assert_eq!(normalized.completeness, events.completeness);
}

#[test]
fn tick_and_calendar_adapters_preserve_source_semantics() {
    let tick = normalize_market_tick(TICK, "BINANCE", "BTCUSDT").expect("tick");
    assert_eq!(tick.price, Decimal::new(123_456_789, 4));
    assert_eq!(tick.completeness, "LATEST_OBSERVATION_ONLY");
    assert_eq!(
        normalize_market_tick(TICK, "OTHER", "BTCUSDT"),
        Err(N28Error::InvalidSourceResponse)
    );

    let vn = normalize_venue_calendar(CALENDAR, "vn_stock").expect("VN calendar");
    assert_eq!(vn.timezone, "Asia/Ho_Chi_Minh");
    assert_eq!(vn.sessions.len(), 2);
    let crypto = normalize_venue_calendar(CALENDAR, "crypto").expect("crypto calendar");
    assert!(crypto.is_open);
}

#[test]
fn n27_candidates_are_plans_and_mutations_stay_dark() {
    for id in ["inspect", "performance", "broker-read"] {
        let plan = n27_candidate_request(id, "resource-1").expect("read candidate");
        assert_eq!(plan.method, HttpMethod::Get);
        assert!(!plan.mutation_candidate);
        assert!(plan.source_dark);
    }
    for id in ["portfolio-create", "risk-profile"] {
        let plan = n27_candidate_request(id, "resource-1").expect("mutation candidate");
        assert!(plan.mutation_candidate);
        assert!(plan.source_dark);
    }
    for id in ["redis-inspect", "testnet-hard-reset", "lab-reset"] {
        assert_eq!(
            n27_candidate_request(id, "resource-1"),
            Err(N28Error::UnknownAdapter)
        );
    }
}

#[test]
fn candle_adapters_preserve_exact_decimals_and_reject_disorder() {
    let binance = normalize_candles("portal.execution.data-layer-binance-candles.v1", BINANCE, 2)
        .expect("binance candles");
    assert_eq!(binance.len(), 2);
    assert_eq!(binance[0].open, Decimal::new(100_125, 3));

    let vnm = normalize_candles("portal.execution.data-layer-vn-preload-candles.v1", VNM, 2)
        .expect("vnm candles");
    assert_eq!(vnm[1].close, Decimal::new(126_035, 1));

    let disorder = br#"{"data":[[2,"1","2","0","1","1"],[1,"1","2","0","1","1"]]}"#;
    assert_eq!(
        normalize_candles(
            "portal.execution.data-layer-binance-candles.v1",
            disorder,
            2
        ),
        Err(N28Error::InvalidSourceResponse)
    );
}

#[test]
fn drift_uses_exact_timestamp_intersection_and_decimal_math() {
    let paper = [
        (1, Decimal::new(100, 0)),
        (2, Decimal::ZERO),
        (3, Decimal::new(200, 0)),
    ];
    let live = [
        (1, Decimal::new(105, 0)),
        (2, Decimal::new(10, 0)),
        (4, Decimal::new(999, 0)),
    ];
    let result = cross_profile_drift(&paper, &live).expect("drift");
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].relative_delta, Decimal::new(5, 2));
}

#[test]
fn pending_owner_template_cannot_activate() {
    assert_eq!(
        verify_owner_publication(PENDING_OWNER),
        Err(N28Error::OwnerPublicationPending)
    );
}
