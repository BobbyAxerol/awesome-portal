//! `TEST_ONLY` original pins/outcomes; real disposable `PostgreSQL`, no PM authority.
use std::{sync::Arc, time::Duration};

use chrono::Utc;
use command_relay::{
    durable::{AuthorityReceipt, BusinessState, CommandIntent, CommandScope},
    pm_source::PmOutcome,
};
use projection_core::{
    canonical_digest,
    resources::{EnvelopeLimits, ResourceEnvelope, StorageLimits, StorageObservation},
};
use projection_store_pg::{
    command::CommandStoreError, command_pm::OriginalPmBinding, PgProjectionStore,
};
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

const SOURCE_DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TARGET: &str = "TEST_ONLY-resolved-portfolio";
const REFERENCE: &str = "TEST_ONLY-original-alias";

fn url() -> String {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable PG required");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    url
}

async fn store() -> PgProjectionStore {
    let resources = Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 8,
            foreground_reserved: 1,
            max_entries: 8192,
            foreground_reserved_entries: 1024,
            max_bytes: 128 * 1024 * 1024,
            foreground_reserved_bytes: 16 * 1024 * 1024,
            storage_max_age: Duration::from_secs(600),
        })
        .unwrap(),
    );
    resources
        .observe_storage(
            StorageObservation {
                observed_at: Utc::now(),
                used_bytes: 0,
                free_bytes: 1_000_000,
                backlog_bytes: 0,
            },
            StorageLimits {
                soft_used_bytes: 100,
                high_used_bytes: 200,
                hard_used_bytes: 300,
                min_free_bytes: 100,
                max_backlog_bytes: 1000,
            },
        )
        .unwrap();
    let store = PgProjectionStore::connect_with_resources(&url(), resources, 8)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store
}

async fn pool() -> PgPool {
    PgPoolOptions::new()
        .max_connections(1)
        .connect(&url())
        .await
        .unwrap()
}
fn ledger() -> String {
    format!("TEST_ONLY.pm-custody.{}", Uuid::now_v7())
}

fn intent(key: &str, actor: &str, workspace: &str) -> CommandIntent {
    let payload = json!({"schema_version":"pma.capital-command.v1.1","operation":"RECALL_PARTIAL",
        "idempotency_key":key,"recipient_kind":"PORTFOLIO","currency":"USDT","amount":"5.000",
        "reason":"TEST_ONLY","expected_versions":{"budget":"1","source":"1","parent":"1","book":"1"}});
    let digest = canonical_digest(&payload).unwrap();
    CommandIntent::new(
        CommandScope::new(
            workspace,
            "paper",
            "TEST_ONLY-profile",
            "TEST_ONLY-authority",
            actor,
            "TEST_ONLY-workload",
        )
        .unwrap(),
        key,
        "RECALL_PARTIAL",
        payload,
        &digest,
    )
    .unwrap()
}

fn original(intent: &CommandIntent) -> OriginalPmBinding {
    OriginalPmBinding::new(intent, REFERENCE, SOURCE_DIGEST, TARGET).unwrap()
}

fn outcome(intent: &CommandIntent, revision: i64, applied: &str, pending: &str) -> PmOutcome {
    let state = if pending == "0" {
        BusinessState::Applied
    } else if applied == "0" {
        BusinessState::WaitingEncumbrance
    } else {
        BusinessState::PartiallyApplied
    };
    let source_ref = format!("pma:source-event:TEST_ONLY-{revision}");
    let presentation = json!({"command_id":"TEST_ONLY-command","state":state.as_str(),
        "amounts":{"requested":"5.000","applied":applied,"pending":pending,"cancelled":"0","rejected":"0"},
        "currency":"USDT","parent_receipt":"TEST_ONLY-parent","blockers":[],
        "before_ref":format!("TEST_ONLY-before-{revision}"),"after_ref":format!("TEST_ONLY-after-{revision}"),"source_ref":source_ref,
        "policy_ref":"TEST_ONLY-policy","binding_ref":"TEST_ONLY-binding","current_versions":{"budget":revision},
        "physical_transfer_performed":false,"cli_exit_code":if pending == "0" {0} else {3},
        "next_action":if pending == "0" {"REVIEW_RECEIPT"} else {"QUERY_SAME_INTENT"}});
    PmOutcome {
        authority_receipt: format!("TEST_ONLY-owning-receipt-{revision}"),
        source_intent_digest: SOURCE_DIGEST.to_owned(),
        target_ref: TARGET.to_owned(),
        receipt: AuthorityReceipt::new(intent, &source_ref, revision, state, presentation).unwrap(),
    }
}

async fn prepared(store: &PgProjectionStore, ledger: &str) -> CommandIntent {
    store.configure_command_ledger(ledger, 4).await.unwrap();
    let intent = intent("TEST_ONLY-key", "TEST_ONLY-actor", "TEST_ONLY-workspace");
    store
        .prepare_pm_command(ledger, &intent, &original(&intent))
        .await
        .unwrap();
    intent
}

#[tokio::test]
async fn migration_reapply_and_unbound_legacy_claim_cannot_be_backfilled() {
    let store = store().await;
    store.migrate().await.unwrap();
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY-key", "TEST_ONLY-actor", "TEST_ONLY-workspace");
    store.prepare_command(&ledger, &intent).await.unwrap();
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        store.pm_original_binding(&ledger, &intent).await,
        Err(CommandStoreError::NotFound)
    ));
    assert!(matches!(
        store
            .prepare_pm_command(&ledger, &intent, &original(&intent))
            .await,
        Err(CommandStoreError::Fence)
    ));
    assert!(matches!(
        store.read_pm_outcome(&ledger, &intent).await,
        Err(CommandStoreError::NotFound)
    ));
}

#[tokio::test]
async fn atomic_original_prepare_replay_uses_existing_quota_once() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY-key", "TEST_ONLY-actor", "TEST_ONLY-workspace");
    let binding = original(&intent);
    let first = store
        .prepare_pm_command(&ledger, &intent, &binding)
        .await
        .unwrap();
    let second = store
        .prepare_pm_command(&ledger, &intent, &binding)
        .await
        .unwrap();
    assert_eq!(first.command_id, second.command_id);
    assert_eq!(
        store.pm_original_binding(&ledger, &intent).await.unwrap(),
        binding
    );
    let other = self::intent("TEST_ONLY-other", "TEST_ONLY-actor", "TEST_ONLY-workspace");
    assert!(matches!(
        store
            .prepare_pm_command(&ledger, &other, &original(&other))
            .await,
        Err(CommandStoreError::Capacity)
    ));
    let pool = pool().await;
    let count: i64 = sqlx::query_scalar(
        "SELECT command_count FROM portal_projection.command_relay_limits WHERE ledger_id=$1",
    )
    .bind(&ledger)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    pool.close().await;
}

#[tokio::test]
async fn changed_original_reference_digest_target_and_actor_never_replace_history() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    for (reference, digest, target) in [
        ("TEST_ONLY-different-alias", SOURCE_DIGEST, TARGET),
        (
            REFERENCE,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            TARGET,
        ),
        (REFERENCE, SOURCE_DIGEST, "TEST_ONLY-different-target"),
    ] {
        let changed = OriginalPmBinding::new(&intent, reference, digest, target).unwrap();
        assert!(matches!(
            store.prepare_pm_command(&ledger, &intent, &changed).await,
            Err(CommandStoreError::Conflict)
        ));
    }
    let other = self::intent(
        "TEST_ONLY-key",
        "TEST_ONLY-other-actor",
        "TEST_ONLY-workspace",
    );
    assert!(matches!(
        store
            .prepare_pm_command(&ledger, &other, &original(&other))
            .await,
        Err(CommandStoreError::Conflict)
    ));
    assert!(matches!(
        store
            .prepare_pm_command(&ledger, &other, &original(&intent))
            .await,
        Err(CommandStoreError::Conflict)
    ));
    assert_eq!(
        store.pm_original_binding(&ledger, &intent).await.unwrap(),
        original(&intent)
    );
}

#[tokio::test]
async fn claimed_original_replay_is_immutable_without_second_send_claim() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let replay = store
        .prepare_pm_command(&ledger, &intent, &original(&intent))
        .await
        .unwrap();
    assert_eq!(replay.delivery, "SENDING");
    assert!(store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
    let changed =
        OriginalPmBinding::new(&intent, "TEST_ONLY-new-alias", SOURCE_DIGEST, TARGET).unwrap();
    assert!(store
        .prepare_pm_command(&ledger, &intent, &changed)
        .await
        .is_err());
}

#[tokio::test]
async fn ledger_and_workspace_bindings_do_not_leak_or_cross_attach() {
    let store = store().await;
    let first_ledger = ledger();
    let intent = prepared(&store, &first_ledger).await;
    assert!(matches!(
        store.pm_original_binding(&ledger(), &intent).await,
        Err(CommandStoreError::NotFound)
    ));
    let other = self::intent(
        "TEST_ONLY-key",
        "TEST_ONLY-actor",
        "TEST_ONLY-other-workspace",
    );
    assert!(matches!(
        store.pm_original_binding(&first_ledger, &other).await,
        Err(CommandStoreError::NotFound)
    ));
    let second_ledger = ledger();
    store
        .configure_command_ledger(&second_ledger, 1)
        .await
        .unwrap();
    let second = store
        .prepare_pm_command(&second_ledger, &intent, &original(&intent))
        .await
        .unwrap();
    let first = store.command_status(&first_ledger, &intent).await.unwrap();
    assert_ne!(first.command_id, second.command_id);
}

#[tokio::test]
async fn full_outcome_survives_reopen_and_never_advances_generic_delivery() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let expected = outcome(&intent, 1, "0", "5.000");
    store
        .retain_pm_outcome(&ledger, &intent, &expected)
        .await
        .unwrap();
    let generic = store.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(generic.delivery, "DELIVERY_UNKNOWN");
    assert!(generic.receipt.is_none());
    drop(store);
    let reopened = self::store().await;
    assert_eq!(
        reopened
            .pm_original_binding(&ledger, &intent)
            .await
            .unwrap(),
        original(&intent)
    );
    assert_eq!(
        reopened
            .read_pm_outcome(&ledger, &intent)
            .await
            .unwrap()
            .unwrap(),
        expected
    );
}

#[tokio::test]
async fn prepared_command_cannot_accept_outcome_before_own_dispatch_claim() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    assert!(matches!(
        store
            .retain_pm_outcome(&ledger, &intent, &outcome(&intent, 1, "0", "5.000"))
            .await,
        Err(CommandStoreError::Fence)
    ));
    assert!(store
        .read_pm_outcome(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn committed_custody_still_allows_lost_callback_ack_to_retire_claim_unknown() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    let claim = store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let expected = outcome(&intent, 1, "0", "5.000");
    store
        .retain_pm_outcome(&ledger, &intent, &expected)
        .await
        .unwrap();
    // TEST_ONLY drop of callback ACK AFTER actual custody COMMIT, not a real
    // source transport fault or a fabricated negative financial receipt.
    store.command_delivery(&claim, false).await.unwrap();
    let record = store.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(record.delivery, "DELIVERY_UNKNOWN");
    assert!(record.receipt.is_none());
    assert_eq!(
        store
            .read_pm_outcome(&ledger, &intent)
            .await
            .unwrap()
            .unwrap(),
        expected
    );
    assert!(store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
    store
        .record_command_receipt(&ledger, &intent, &expected.receipt)
        .await
        .unwrap();
    assert!(store
        .command_status(&ledger, &intent)
        .await
        .unwrap()
        .receipt
        .is_some());
}

#[tokio::test]
async fn full_same_revision_replay_is_idempotent_but_new_authority_receipt_conflicts() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let mut expected = outcome(&intent, 1, "0", "5.000");
    store
        .retain_pm_outcome(&ledger, &intent, &expected)
        .await
        .unwrap();
    store
        .retain_pm_outcome(&ledger, &intent, &expected)
        .await
        .unwrap();
    expected.authority_receipt = "TEST_ONLY-conflicting-owning-receipt".to_owned();
    assert!(matches!(
        store.retain_pm_outcome(&ledger, &intent, &expected).await,
        Err(CommandStoreError::Conflict)
    ));
    assert_eq!(
        store
            .read_pm_outcome(&ledger, &intent)
            .await
            .unwrap()
            .unwrap()
            .authority_receipt,
        "TEST_ONLY-owning-receipt-1"
    );
}

#[tokio::test]
async fn source_event_progress_advances_owning_receipt_without_losing_original_pins() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let first = outcome(&intent, 1, "0", "5.000");
    let second = outcome(&intent, 2, "3.000", "2.000");
    store
        .retain_pm_outcome(&ledger, &intent, &first)
        .await
        .unwrap();
    store
        .record_command_receipt(&ledger, &intent, &first.receipt)
        .await
        .unwrap();
    store
        .retain_pm_outcome(&ledger, &intent, &second)
        .await
        .unwrap();
    store
        .record_command_receipt(&ledger, &intent, &second.receipt)
        .await
        .unwrap();
    assert_eq!(
        store
            .read_pm_outcome(&ledger, &intent)
            .await
            .unwrap()
            .unwrap(),
        second
    );
    assert!(store
        .retain_pm_outcome(&ledger, &intent, &first)
        .await
        .is_err());
    assert_eq!(
        store.pm_original_binding(&ledger, &intent).await.unwrap(),
        original(&intent)
    );
    let replay = store
        .prepare_pm_command(&ledger, &intent, &original(&intent))
        .await
        .unwrap();
    assert_eq!(replay.receipt.unwrap().revision(), 2);
}

#[tokio::test]
async fn generic_newer_receipt_fences_stale_custody_progress() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let first = outcome(&intent, 1, "0", "5.000");
    store
        .record_command_receipt(
            &ledger,
            &intent,
            &outcome(&intent, 2, "3.000", "2.000").receipt,
        )
        .await
        .unwrap();
    assert!(store
        .retain_pm_outcome(&ledger, &intent, &first)
        .await
        .is_err());
    assert!(store
        .read_pm_outcome(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn corrupted_original_or_full_envelope_fails_closed_on_reopen() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    let claim_record = store.command_status(&ledger, &intent).await.unwrap();
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    store
        .retain_pm_outcome(&ledger, &intent, &outcome(&intent, 1, "0", "5.000"))
        .await
        .unwrap();
    let pool = pool().await;
    sqlx::query(
        "UPDATE portal_projection.command_pm_custody SET outcome_digest=$2 WHERE command_id=$1",
    )
    .bind(claim_record.command_id)
    .bind(format!("sha256:{}", "0".repeat(64)))
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store.read_pm_outcome(&ledger, &intent).await,
        Err(CommandStoreError::Invalid)
    ));
    sqlx::query("UPDATE portal_projection.command_pm_custody SET target_ref='TEST_ONLY-tampered-target' WHERE command_id=$1").bind(claim_record.command_id).execute(&pool).await.unwrap();
    assert!(matches!(
        store.pm_original_binding(&ledger, &intent).await,
        Err(CommandStoreError::Invalid)
    ));
    pool.close().await;
}

#[tokio::test]
async fn oversized_full_envelope_or_wrong_original_correlation_never_enters_custody() {
    let store = store().await;
    let ledger = ledger();
    let intent = prepared(&store, &ledger).await;
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let mut wrong = outcome(&intent, 1, "0", "5.000");
    wrong.target_ref = "TEST_ONLY-wrong-target".to_owned();
    assert!(store
        .retain_pm_outcome(&ledger, &intent, &wrong)
        .await
        .is_err());
    let mut huge = outcome(&intent, 1, "0", "5.000");
    let mut payload = huge.receipt.payload().clone();
    payload["blockers"] = json!(vec!["x".repeat(512); 70]);
    huge.receipt = AuthorityReceipt::new(
        &intent,
        huge.receipt.source_ref(),
        1,
        BusinessState::WaitingEncumbrance,
        payload,
    )
    .unwrap();
    assert!(store
        .retain_pm_outcome(&ledger, &intent, &huge)
        .await
        .is_err());
    assert!(store
        .read_pm_outcome(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn concurrent_replicas_share_one_original_row_quota_and_monotonic_outcome() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY-key", "TEST_ONLY-actor", "TEST_ONLY-workspace");
    let binding = original(&intent);
    let replica = self::store().await;
    let (a, b) = tokio::join!(
        store.prepare_pm_command(&ledger, &intent, &binding),
        replica.prepare_pm_command(&ledger, &intent, &binding)
    );
    assert_eq!(a.unwrap().command_id, b.unwrap().command_id);
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let first = outcome(&intent, 1, "0", "5.000");
    let second = outcome(&intent, 2, "3.000", "2.000");
    let (a, b) = tokio::join!(
        store.retain_pm_outcome(&ledger, &intent, &first),
        replica.retain_pm_outcome(&ledger, &intent, &second)
    );
    assert!(b.is_ok());
    assert!(a.is_ok() || matches!(a, Err(CommandStoreError::Invalid)));
    assert_eq!(
        store
            .read_pm_outcome(&ledger, &intent)
            .await
            .unwrap()
            .unwrap()
            .receipt
            .revision(),
        2
    );
    let pool = pool().await;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.command_pm_custody p JOIN portal_projection.command_relay c USING(command_id) WHERE c.ledger_id=$1").bind(&ledger).fetch_one(&pool).await.unwrap();
    assert_eq!(count, 1);
    pool.close().await;
}

async fn observe_cancel_gate(pool: &PgPool, class: i32, key: i32, blocker_pid: i32) -> bool {
    let observed = tokio::time::timeout(Duration::from_millis(750), async {
        loop {
            let pid: Option<i32> = sqlx::query_scalar(
                "SELECT w.pid FROM pg_locks w JOIN pg_locks h
                 ON h.locktype=w.locktype AND h.database=w.database
                 AND h.classid=w.classid AND h.objid=w.objid AND h.objsubid=w.objsubid
                 WHERE w.locktype='advisory' AND w.classid=$1::integer::oid
                 AND w.objid=$2::integer::oid AND w.objsubid=2
                 AND NOT w.granted AND h.granted AND h.pid=$3 AND w.pid<>$3",
            )
            .bind(class)
            .bind(key)
            .bind(blocker_pid)
            .fetch_optional(pool)
            .await?;
            if pid.is_some() {
                return Ok::<_, sqlx::Error>(());
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await;
    matches!(observed, Ok(Ok(())))
}

#[tokio::test]
async fn cancelled_preparation_keeps_original_and_quota_transaction_atomic() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let pool = pool().await;
    let observer = self::pool().await;
    let hook = format!("epg10_07_cancel_{}", Uuid::now_v7().simple());
    let class = 90707_i32;
    let key = i32::from_be_bytes(Uuid::now_v7().as_bytes()[12..16].try_into().unwrap()) & i32::MAX;
    // TEST_ONLY, exact ledger on disposable PG: the hook executes AFTER both
    // command INSERT and quota UPDATE, BEFORE custody INSERT/transaction COMMIT.
    let install = format!(
        "CREATE FUNCTION portal_projection.{hook}() RETURNS trigger LANGUAGE plpgsql AS $TEST_ONLY$
         BEGIN
           IF EXISTS (SELECT 1 FROM portal_projection.command_relay
                      WHERE command_id=NEW.command_id AND ledger_id=TG_ARGV[0]) THEN
             IF (SELECT command_count FROM portal_projection.command_relay_limits
                 WHERE ledger_id=TG_ARGV[0]) IS DISTINCT FROM 1 THEN
               RAISE EXCEPTION 'TEST_ONLY_CANCEL_NOT_AFTER_QUOTA';
             END IF;
             PERFORM set_config('lock_timeout','1000ms',true);
             PERFORM pg_advisory_xact_lock({class},TG_ARGV[1]::integer);
           END IF;
           RETURN NEW;
         END $TEST_ONLY$;
         CREATE TRIGGER {hook} BEFORE INSERT ON portal_projection.command_pm_custody
         FOR EACH ROW EXECUTE FUNCTION portal_projection.{hook}('{ledger}','{key}');"
    );
    sqlx::raw_sql(&install).execute(&pool).await.unwrap();
    let mut blocker = pool.begin().await.unwrap();
    let blocker_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *blocker)
        .await
        .unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock($1,$2)")
        .bind(class)
        .bind(key)
        .execute(&mut *blocker)
        .await
        .unwrap();
    let worker = store.clone();
    let worker_ledger = ledger.clone();
    let intent = intent(
        "TEST_ONLY-cancelled",
        "TEST_ONLY-actor",
        "TEST_ONLY-workspace",
    );
    let replay = intent.clone();
    let job = tokio::spawn(async move {
        worker
            .prepare_pm_command(&worker_ledger, &replay, &original(&replay))
            .await
    });
    let reached_gate = observe_cancel_gate(&observer, class, key, blocker_pid).await;
    // Exact hook cleanup precedes assertions even on observation failure.
    job.abort();
    let cancelled = tokio::time::timeout(Duration::from_secs(2), job).await;
    let released = tokio::time::timeout(Duration::from_secs(2), blocker.rollback()).await;
    let uninstall = format!("DROP TRIGGER {hook} ON portal_projection.command_pm_custody; DROP FUNCTION portal_projection.{hook}();");
    let removed = tokio::time::timeout(
        Duration::from_secs(2),
        sqlx::raw_sql(&uninstall).execute(&pool),
    )
    .await;
    observer.close().await;
    released.unwrap().unwrap();
    removed.unwrap().unwrap();
    assert!(reached_gate, "writer never reached mid-write gate");
    assert!(matches!(cancelled, Ok(Err(error)) if error.is_cancelled()));
    let count: i64 = sqlx::query_scalar(
        "SELECT command_count FROM portal_projection.command_relay_limits WHERE ledger_id=$1",
    )
    .bind(&ledger)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    assert!(store
        .existing_command(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
    let custody_rows: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.command_pm_custody p JOIN portal_projection.command_relay c USING(command_id) WHERE c.ledger_id=$1")
        .bind(&ledger).fetch_one(&pool).await.unwrap();
    assert_eq!(custody_rows, 0);
    store
        .prepare_pm_command(&ledger, &intent, &original(&intent))
        .await
        .unwrap();
    assert_eq!(
        store.pm_original_binding(&ledger, &intent).await.unwrap(),
        original(&intent)
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT command_count FROM portal_projection.command_relay_limits WHERE ledger_id=$1",
    )
    .bind(&ledger)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    pool.close().await;
}
