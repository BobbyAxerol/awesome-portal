//! Operational `TEST_ONLY` recovery; no source authority or analytics service.
use super::*;
use chrono::Utc;
use projection_core::resources::{
    EnvelopeLimits, ResourceEnvelope, ResourceError, StorageLimits, StorageObservation, WorkClass,
};
use std::{sync::Arc, time::Duration};

#[tokio::test]
async fn t11_02_retained_history_resync_repairs_corruption_with_full_coverage() {
    let (store, pool) = db().await;
    let b = binding();
    let rows = vec![
        account("account_1"),
        order("order_1", 1),
        order("order_2", 1),
    ];
    let old = ready(&store, b.clone(), &rows).await;
    let original = event(&old, 1, "orders", "order_1", 2, rows[1].payload.clone());
    let mut correction = event(
        &old,
        2,
        "orders",
        "order_1",
        3,
        json!({"account_id":"account_1","amount":"9007199254740993.000000000001","nullable":null}),
    );
    correction.event.operation = EventOperation::Correction;
    correction.event.correction_of_event_id = Some(original.event.event_id.clone());
    let second = event(&old, 3, "orders", "order_2", 2, rows[2].payload.clone());
    let mut tombstone = event(&old, 4, "orders", "order_2", 3, rows[2].payload.clone());
    tombstone.event.operation = EventOperation::Tombstone;
    tombstone.event.tombstone_of_event_id = Some(second.event.event_id.clone());
    // Retained immutable producer bytes, not a snapshot read from corrupt PG.
    let archive = vec![original, correction.clone(), second, tombstone];
    let (g, chunks) = group(
        &old,
        "before_corruption",
        "opaque_overlap",
        "old_tail",
        vec![archive.clone()],
        false,
    );
    stage_chunks(&store, &old, &chunks).await;
    commit(&store, &old, &g).await;
    let expected = vec![
        rows[0].clone(),
        row("orders", "order_1", 3, correction.event.payload.clone()),
    ];
    assert_eq!(read_all(&store, &b).await, expected);
    // Deliberate corruption of exactly one TEST_ONLY generation, no shared DB.
    sqlx::query("UPDATE portal_projection.bootstrap_rows SET payload='{}'::jsonb WHERE generation=$1 AND entity_id='order_1'")
        .bind(old.manifest().generation).execute(&pool).await.unwrap();
    assert_ne!(digest(&read_all(&store, &b).await), digest(&expected));
    store
        .bootstrap_require_resync(&old, &seal(&b, &b, "CONTROL"), NOW)
        .await
        .unwrap();
    assert!(store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
        .await
        .is_err());
    let (manifest, pages) = fixture(b.clone(), &rows, false);
    let rebuilt = start(&store, &manifest).await;
    stage_pages(&store, &rebuilt, &pages).await;
    assert!(finish(&store, &rebuilt).await.is_none());
    let (g, chunks) = group(
        &rebuilt,
        "archive_resync",
        &manifest.delta_start,
        &manifest.catchup_cursor,
        vec![archive.clone()],
        true,
    );
    stage_chunks(&store, &rebuilt, &chunks).await;
    commit(&store, &rebuilt, &g).await;
    assert_eq!(digest(&read_all(&store, &b).await), digest(&expected));
    assert_eq!(checkpoint(&store, &rebuilt).await, manifest.catchup_cursor);
    let facts: Vec<Value> = sqlx::query_scalar("SELECT event FROM portal_projection.bootstrap_facts WHERE generation=$1 ORDER BY source_sequence")
        .bind(manifest.generation).fetch_all(&pool).await.unwrap();
    assert_eq!(
        facts,
        archive
            .iter()
            .map(|e| serde_json::to_value(e).unwrap())
            .collect::<Vec<_>>()
    );
    let coverage: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.bootstrap_datasets WHERE generation=$1 AND checkpoint_cursor=$2")
        .bind(manifest.generation).bind(&manifest.catchup_cursor).fetch_one(&pool).await.unwrap();
    assert_eq!(coverage, i64::try_from(b.datasets.len()).unwrap());
    let tombstones: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_rows WHERE generation=$1 AND tombstoned",
    )
    .bind(manifest.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(tombstones, 1);
    assert!(store
        .bootstrap_checkpoint(&old, &seal(&b, &b, "CONTROL"), NOW)
        .await
        .is_err());
}

#[tokio::test]
async fn t11_05_pause_resume_keeps_policy_correction_and_raw_history_traceable() {
    let (store, pool) = db().await;
    let b = binding();
    let rows = vec![account("account_1"), order("order_1", 1)];
    let h = ready(&store, b.clone(), &rows).await;
    let original = event(&h, 1, "orders", "order_1", 2, rows[1].payload.clone());
    let mut correction = event(
        &h,
        2,
        "orders",
        "order_1",
        3,
        json!({"account_id":"account_1","amount":"79.999999999999","nullable":null}),
    );
    correction.event.operation = EventOperation::Correction;
    correction.event.correction_of_event_id = Some(original.event.event_id.clone());
    let (g, chunks) = group(
        &h,
        "correction_pending",
        "opaque_overlap",
        "correction_tail",
        vec![vec![original, correction.clone()]],
        false,
    );
    let resources = Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 2,
            foreground_reserved: 1,
            max_entries: 100,
            foreground_reserved_entries: 10,
            max_bytes: 1024 * 1024,
            foreground_reserved_bytes: 1024,
            storage_max_age: Duration::from_secs(60),
        })
        .unwrap(),
    );
    let observe = |backlog_bytes| {
        resources
            .observe_storage(
                StorageObservation {
                    observed_at: Utc::now(),
                    used_bytes: 10,
                    free_bytes: 1000,
                    backlog_bytes,
                },
                StorageLimits {
                    soft_used_bytes: 100,
                    high_used_bytes: 200,
                    hard_used_bytes: 300,
                    min_free_bytes: 100,
                    max_backlog_bytes: 100,
                },
            )
            .unwrap();
    };
    observe(100);
    assert!(matches!(
        resources.try_acquire(WorkClass::BackgroundWrite, 1, 1, Utc::now()),
        Err(ResourceError::StorageHard)
    ));
    let policy_before = h.manifest().binding.policy_revision.clone();
    let watermark_before = checkpoint(&store, &h).await;
    assert_eq!(read_all(&store, &b).await, rows);
    assert_eq!(fact_count(&pool, &h).await, 0);
    observe(0);
    let permit = resources
        .try_acquire(WorkClass::BackgroundWrite, 1, 1, Utc::now())
        .unwrap();
    stage_chunks(&store, &h, &chunks).await;
    commit(&store, &h, &g).await;
    drop(permit);
    assert_ne!(checkpoint(&store, &h).await, watermark_before);
    assert_eq!(h.manifest().binding.policy_revision, policy_before);
    assert_eq!(fact_count(&pool, &h).await, 2);
    assert_eq!(
        read_all(&store, &b).await[1].payload,
        correction.event.payload
    );
    assert_eq!(resources.stats().unwrap().active, 0);
    let before = digest(&read_all(&store, &b).await);
    let mut changed = b.clone();
    changed.policy_revision = "unreviewed_new_policy".into();
    assert!(store
        .bootstrap_checkpoint(&h, &seal(&changed, &changed, "CONTROL"), NOW)
        .await
        .is_err());
    assert_eq!(digest(&read_all(&store, &b).await), before);
    // This exercises consumer admission/history, not score math or a TS job.
}
