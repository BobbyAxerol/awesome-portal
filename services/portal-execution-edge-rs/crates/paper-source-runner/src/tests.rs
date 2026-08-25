use std::sync::atomic::{AtomicUsize, Ordering};

use execution_contracts::CanonicalId;
use paper_source_contract::{parse_response, SnapshotResource};
use paper_source_ingestor::D4_MAPPER_VERSION;
use projection_store_pg::EpochMetadata;
use serde_json::json;

use super::*;

struct EmptyPaperSource {
    calls: AtomicUsize,
}

impl EmptyPaperSource {
    const fn new() -> Self {
        Self {
            calls: AtomicUsize::new(0),
        }
    }
}

impl PaperSourceReader for EmptyPaperSource {
    fn execute<'a>(&'a self, request: &'a PaperReadRequest) -> SourceReadFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::Relaxed);
            let now = Utc::now();
            let body = match request {
                PaperReadRequest::BeginSnapshot => json!({
                    "contract_revision": "d4.paper-read.v1",
                    "status": "SNAPSHOT_CREATED",
                    "scope_id": "PAPER_BINANCE_USDM",
                    "snapshot": "opaque-runner-snapshot",
                    "created_at": now.to_rfc3339(),
                    "expires_at": (now + chrono::TimeDelta::minutes(5)).to_rfc3339(),
                    "resource_counts": {"orders": 0, "fills": 0, "positions": 0},
                    "event_cursor": "opaque-runner-event-0",
                    "completeness": "COMPLETE_WITHIN_FIXED_SCOPE",
                    "resync": "FULL_BUILDING_EPOCH_ON_SNAPSHOT_OR_CURSOR_EXPIRY"
                }),
                PaperReadRequest::SnapshotPage {
                    resource, snapshot, ..
                } => {
                    let field = match resource {
                        SnapshotResource::Orders => "orders",
                        SnapshotResource::Fills => "fills",
                        SnapshotResource::Positions => "positions",
                    };
                    let mut value = json!({
                        "contract_revision": "d4.paper-read.v1",
                        "status": "OK",
                        "scope_id": "PAPER_BINANCE_USDM",
                        "count": 0,
                        "snapshot": snapshot.as_str(),
                        "next_cursor": null,
                        "complete": true,
                        "completeness": "COMPLETE_WITHIN_FIXED_SCOPE"
                    });
                    value
                        .as_object_mut()
                        .unwrap()
                        .insert(field.to_owned(), json!([]));
                    value
                }
                PaperReadRequest::EventsPage { .. } => json!({
                    "contract_revision": "d4.paper-read.v1",
                    "status": "OK",
                    "scope_id": "PAPER_BINANCE_USDM",
                    "events": [],
                    "count": 0,
                    "next_cursor": "opaque-runner-event-1",
                    "complete": true,
                    "head_sequence": 0,
                    "delivery": "IDEMPOTENT_STATE_DELTAS",
                    "resync": "FULL_BUILDING_EPOCH_ON_CURSOR_EPOCH_OR_RETENTION_EXPIRY"
                }),
            };
            Ok(parse_response(request, 200, None, &serde_json::to_vec(&body).unwrap()).unwrap())
        })
    }
}

fn scope() -> ProjectionScope {
    ProjectionScope::new(
        CanonicalId::parse(format!("workspace-runner-{}", Uuid::now_v7())).unwrap(),
        "paper",
    )
    .unwrap()
}

fn config(
    scope: ProjectionScope,
    epoch_id: Uuid,
    maximum_requests: usize,
) -> D4QualificationRunConfig {
    D4QualificationRunConfig {
        scope,
        epoch_id,
        page_size: 250,
        poll_interval_ms: 1_000,
        capability_snapshot_id: "cap_d4_contract_accepted".to_owned(),
        maximum_requests,
        maximum_elapsed: Duration::from_secs(30),
        maximum_transient_retries: 1,
        maximum_retry_delay: Duration::from_secs(2),
        maximum_freshness_age: Duration::from_secs(10),
    }
}

#[tokio::test]
async fn one_shot_runner_resumes_a_durable_lease_and_never_activates() {
    let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
        return;
    };
    let store = PgProjectionStore::connect(&database_url).await.unwrap();
    store.migrate().await.unwrap();
    let scope = scope();
    let epoch_id = store
        .create_building_epoch(
            &scope,
            &EpochMetadata {
                adapter_version: D4_MAPPER_VERSION.to_owned(),
                source_gateway_digest:
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_owned(),
                capability_snapshot_id: "cap_d4_contract_accepted".to_owned(),
            },
            Utc::now(),
        )
        .await
        .unwrap();

    let mut interrupted = D4QualificationRunner::load(
        EmptyPaperSource::new(),
        store.clone(),
        config(scope.clone(), epoch_id, 1),
        Utc::now(),
    )
    .await
    .unwrap();
    assert!(matches!(
        interrupted.run_until_caught_up().await,
        Err(RunnerError::RequestBudgetExceeded)
    ));
    assert_eq!(
        store
            .load_d4_resume_state(&scope, epoch_id)
            .await
            .unwrap()
            .phase,
        D4ResumePhase::SnapshotLeased
    );

    let mut resumed = D4QualificationRunner::load(
        EmptyPaperSource::new(),
        store.clone(),
        config(scope.clone(), epoch_id, 10),
        Utc::now(),
    )
    .await
    .unwrap();
    let report = resumed.run_until_caught_up().await.unwrap();
    assert_eq!(report.epoch_status, ProjectionEpochStatus::Building);
    assert_eq!(report.requests_total, 4);
    assert!(report.source_read_complete);
    assert!(report.snapshot.replay_parity);
    assert_eq!(report.authority, D4QualificationAuthority::default());
    let serialized = serde_json::to_string(&report).unwrap();
    assert!(!serialized.contains("opaque-runner"));
}

#[test]
fn unsafe_runner_budgets_fail_before_runtime_construction() {
    let scope = scope();
    let mut candidate = config(scope, Uuid::now_v7(), 10);
    candidate.maximum_elapsed = Duration::from_secs(7_201);
    assert!(matches!(
        candidate.validate(),
        Err(RunnerError::UnsafeConfiguration)
    ));

    candidate.maximum_elapsed = Duration::from_secs(30);
    candidate.page_size = 251;
    assert!(matches!(
        candidate.validate(),
        Err(RunnerError::UnsafeConfiguration)
    ));
}
