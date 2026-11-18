//! `TEST_ONLY` restored synthetic schema plus migration-state application probe.
use projection_store_pg::PgProjectionStore;
use sqlx::{postgres::PgPoolOptions, Row};

#[tokio::test]
async fn t11_restored_database_reopens_with_idempotent_embedded_migrations() {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url =
        std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable restore DB required");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_restore_epg10_11")
    );
    let store = PgProjectionStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .unwrap();
    let row = sqlx::query("SELECT (SELECT count(*) FROM portal_projection.bootstrap_generations) AS generations, (SELECT count(*) FROM portal_projection.bootstrap_facts) AS facts, (SELECT count(*) FROM portal_projection.bootstrap_datasets) AS datasets, (SELECT count(*) FROM public._sqlx_migrations WHERE success) AS migrations")
        .fetch_one(&pool).await.unwrap();
    assert!(row.get::<i64, _>("generations") > 0);
    assert!(row.get::<i64, _>("facts") > 0);
    assert!(row.get::<i64, _>("datasets") > 0);
    assert!(row.get::<i64, _>("migrations") >= 22);
    pool.close().await;
}
