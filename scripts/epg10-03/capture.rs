// TEST_ONLY qualification extension. The runner appends this to an exact copy
// of TS's p13_logical_replication.rs, preserving its helpers and native imports.
// No replacement journal/decoder/publisher is implemented here.

async fn epg_session(
    dsn: &str,
    config: &LogicalReplicationConfig,
    slot: &str,
) -> LogicalReplicationSession {
    let mut session = LogicalReplicationSession::connect_trust(config)
        .await
        .unwrap();
    let exported = session
        .create_temporary_exported_snapshot(slot)
        .await
        .unwrap();
    let reader = connect(dsn).await;
    reader
        .batch_execute(&format!(
            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '{}'",
            exported.snapshot_name
        ))
        .await
        .unwrap();
    reader
        .query_one("SELECT count(*) FROM source_change_journal", &[])
        .await
        .unwrap();
    reader.batch_execute("COMMIT").await.unwrap();
    session
        .start_pgoutput(
            &exported.attest_import(&exported.snapshot_name).unwrap(),
            "p13_native_journal",
        )
        .await
        .unwrap();
    session
}

async fn epg_receive(
    session: &mut LogicalReplicationSession,
    sink: &mut impl DurableCommitSink,
) -> trading_runtime::logical_replication::DecodedJournalCommit {
    tokio::time::timeout(Duration::from_secs(8), session.receive_and_persist(sink))
        .await
        .unwrap()
        .unwrap()
}

fn epg_ids(commit: &trading_runtime::logical_replication::DecodedJournalCommit) -> Vec<String> {
    commit
        .frames
        .iter()
        .flat_map(|frame| {
            frame
                .changes
                .iter()
                .map(|change| change.source_event_id.clone())
        })
        .collect()
}

async fn epg_head(client: &Client, scope: (&str, &str, &str)) -> i64 {
    client.query_one("SELECT COALESCE((SELECT last_published_sequence FROM source_change_publication_heads WHERE source_cell_id=$1 AND source_database_id=$2 AND continuity_epoch=$3),0)", &[&scope.0,&scope.1,&scope.2]).await.unwrap().get(0)
}

#[tokio::test]
async fn epg03_continuous_pgoutput_late_low_id_abort_and_multigroup() {
    let (dsn, config) =
        required_environment().expect("real isolated PostgreSQL REQUIRED, never skip");
    let writer = connect(&dsn).await;
    writer.batch_execute("DROP PUBLICATION IF EXISTS p13_native_journal; CREATE PUBLICATION p13_native_journal FOR TABLE source_change_journal; CREATE TABLE IF NOT EXISTS epg03_test_domain(id bigint PRIMARY KEY, revision bigint NOT NULL)").await.unwrap();
    let mut session = epg_session(&dsn, &config, "epg03_continuous").await;
    let scope = ("epg03-continuous", "test-only-db", "test-only-epoch");
    let late = connect(&dsn).await;
    late.batch_execute("BEGIN; INSERT INTO epg03_test_domain VALUES(100,1)")
        .await
        .unwrap();
    let (_, low_id) = append_one(&late, scope, 1_000_000, 100).await;
    let (_, sibling) = append_one(&late, scope, 1_000_000, 101).await;
    writer
        .batch_execute("BEGIN; INSERT INTO epg03_test_domain VALUES(200,1)")
        .await
        .unwrap();
    let (_, high_id) = append_one(&writer, scope, 1_000_000, 200).await;
    writer.batch_execute("COMMIT").await.unwrap();
    let aborted = connect(&dsn).await;
    aborted
        .batch_execute("BEGIN; INSERT INTO epg03_test_domain VALUES(300,1)")
        .await
        .unwrap();
    let (_, abort_id) = append_one(&aborted, scope, 1_000_000, 300).await;
    aborted.batch_execute("ROLLBACK").await.unwrap();
    let mut sink = PostgresPublicationSink::new(connect(&dsn).await);
    let early = epg_receive(&mut session, &mut sink).await;
    assert_eq!(epg_ids(&early), vec![high_id.clone()]);
    assert_eq!(epg_head(&writer, scope).await, 1);
    // T2 has already been decoded, published and ACKed. T1's IDs were allocated
    // first but it commits NOW through the SAME slot, no resnapshot/high-water.
    late.batch_execute("COMMIT").await.unwrap();
    let later = epg_receive(&mut session, &mut sink).await;
    assert_eq!(epg_ids(&later), vec![low_id.clone(), sibling.clone()]);
    assert!(
        CommitLsn::parse(&later.commit_lsn).unwrap() > CommitLsn::parse(&early.commit_lsn).unwrap()
    );
    assert_eq!(later.frames.len(), 2);
    for (index, frame) in later.frames.iter().enumerate() {
        assert_eq!(frame.source_commit_group_count, 2);
        assert_eq!(frame.source_commit_group_index as usize, index);
    }
    for (commit, ordinals) in [(&early, vec![200_u64]), (&later, vec![100, 101])] {
        for (change, ordinal) in commit.frames.iter().flat_map(|f| &f.changes).zip(ordinals) {
            let expected =
                json!({"counted_unit":"FILL","counted_value":1,"ordinal":ordinal.to_string()});
            assert_eq!(change.payload, expected);
            let hash:String=writer.query_one("SELECT payload_hash FROM source_change_journal WHERE source_event_id=$1::text::uuid",&[&change.source_event_id]).await.unwrap().get(0);
            assert_eq!(hash, decision_digest(&expected).unwrap());
        }
    }
    let rows = writer.query("SELECT source_event_id::text FROM source_change_publication WHERE source_cell_id=$1 ORDER BY published_source_sequence", &[&scope.0]).await.unwrap();
    assert_eq!(
        rows.iter()
            .map(|r| r.get::<_, String>(0))
            .collect::<Vec<_>>(),
        vec![high_id, low_id, sibling]
    );
    let absent: i64 = writer
        .query_one(
            "SELECT count(*) FROM source_change_journal WHERE source_event_id=$1::text::uuid",
            &[&abort_id],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(absent, 0);
    let domain: i64 = writer
        .query_one("SELECT count(*) FROM epg03_test_domain", &[])
        .await
        .unwrap()
        .get(0);
    assert_eq!(domain, 2);
    assert_eq!(epg_head(&writer, scope).await, 3);
    println!(
        "EPG10_RESULT={}",
        json!({"case":"continuous_late_commit","result":"PASS","published_events":3,"late_commit_groups":2,"aborted_events":0,"same_slot":true,"exact_ids_and_payload_digests":true})
    );
}

struct EpgLostAck {
    sink: PostgresPublicationSink,
    durable: Option<trading_runtime::logical_replication::DecodedJournalCommit>,
}

impl DurableCommitSink for EpgLostAck {
    fn persist<'a>(
        &'a mut self,
        commit: &'a trading_runtime::logical_replication::DecodedJournalCommit,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        trading_runtime::logical_replication::DurableCommitReceipt,
                        CoreError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(async move {
            self.sink.persist(commit).await?;
            self.durable = Some(commit.clone());
            Err(CoreError::EngineSemantic(
                "EPG03_TEST_ONLY_LOST_ACK_AFTER_REAL_COMMIT".into(),
            ))
        })
    }
}

struct EpgCorruptDigest(PostgresPublicationSink);

impl DurableCommitSink for EpgCorruptDigest {
    fn persist<'a>(
        &'a mut self,
        commit: &'a trading_runtime::logical_replication::DecodedJournalCommit,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        trading_runtime::logical_replication::DurableCommitReceipt,
                        CoreError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(async move {
            let mut changed = commit.clone();
            changed.frames[0].changes[0].payload["ordinal"] =
                json!("CORRUPTED_IN_TRANSIT_SAME_EVENT_ID");
            self.0.persist(&changed).await
        })
    }
}

struct EpgKilledSink {
    sink: PostgresPublicationSink,
    admin: Client,
    backend_pid: i32,
    captured: Option<trading_runtime::logical_replication::DecodedJournalCommit>,
}

impl DurableCommitSink for EpgKilledSink {
    fn persist<'a>(
        &'a mut self,
        commit: &'a trading_runtime::logical_replication::DecodedJournalCommit,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<
                        trading_runtime::logical_replication::DurableCommitReceipt,
                        CoreError,
                    >,
                > + Send
                + 'a,
        >,
    > {
        Box::pin(async move {
            self.captured = Some(commit.clone());
            let terminated: bool = self
                .admin
                .query_one("SELECT pg_terminate_backend($1)", &[&self.backend_pid])
                .await
                .unwrap()
                .get(0);
            assert!(terminated);
            self.sink.persist(commit).await
        })
    }
}

#[tokio::test]
async fn epg03_durable_commit_lost_ack_digest_conflict_and_retention() {
    let (dsn, config) = required_environment().expect("real isolated PostgreSQL REQUIRED");
    let writer = connect(&dsn).await;
    let scope = ("epg03-fault", "test-only-db", "test-only-epoch");
    let mut session = epg_session(&dsn, &config, "epg03_lost_ack").await;
    writer.batch_execute("BEGIN").await.unwrap();
    append_one(&writer, scope, 2_000_000, 1).await;
    writer.batch_execute("COMMIT").await.unwrap();
    let mut fault = EpgLostAck {
        sink: PostgresPublicationSink::new(connect(&dsn).await),
        durable: None,
    };
    let result = tokio::time::timeout(
        Duration::from_secs(8),
        session.receive_and_persist(&mut fault),
    )
    .await
    .unwrap();
    assert!(result.is_err());
    assert_eq!(session.last_acknowledged_lsn(), None);
    assert_eq!(epg_head(&writer, scope).await, 1);
    let commit = fault.durable.unwrap();
    let mut retry = PostgresPublicationSink::new(connect(&dsn).await);
    retry.persist(&commit).await.unwrap();
    retry.persist(&commit).await.unwrap();
    assert_eq!(epg_head(&writer, scope).await, 1);
    let mut changed = commit.clone();
    changed.frames[0].changes[0].payload["ordinal"] = json!("DIFFERENT_BYTES_SAME_ID");
    assert!(retry.persist(&changed).await.is_err());
    assert_eq!(epg_head(&writer, scope).await, 1);
    let source_hash: String = writer
        .query_one(
            "SELECT payload_hash FROM source_change_journal WHERE source_event_id=$1::text::uuid",
            &[&commit.frames[0].changes[0].source_event_id],
        )
        .await
        .unwrap()
        .get(0);
    // Native sink's canonical digest must still match original fact, not attack.
    assert_eq!(
        source_hash,
        decision_digest(&commit.frames[0].changes[0].payload).unwrap()
    );
    let mut corrupt_session = epg_session(&dsn, &config, "epg03_digest_conflict").await;
    writer.batch_execute("BEGIN").await.unwrap();
    append_one(&writer, scope, 2_000_000, 2).await;
    writer.batch_execute("COMMIT").await.unwrap();
    let mut corrupt = EpgCorruptDigest(PostgresPublicationSink::new(connect(&dsn).await));
    let conflict = tokio::time::timeout(
        Duration::from_secs(8),
        corrupt_session.receive_and_persist(&mut corrupt),
    )
    .await
    .unwrap();
    assert!(conflict.is_err());
    assert_eq!(corrupt_session.last_acknowledged_lsn(), None);
    assert_eq!(epg_head(&writer, scope).await, 1);
    assert!(corrupt_session
        .receive_and_persist(&mut corrupt)
        .await
        .is_err());
    let deny_delete = writer
        .execute(
            "DELETE FROM source_change_journal WHERE source_cell_id=$1",
            &[&scope.0],
        )
        .await;
    assert!(deny_delete.is_err());
    // Floor cannot skip a committed but unexported event. Advancing the floor
    // through an already-published group IS allowed and requires resnapshot,
    // not consumer ACK. Actual mapping purge additionally needs a baseline.
    assert!(writer
        .query_one(
            "SELECT source_change_set_publication_retention_floor($1,$2,$3,3)",
            &[&scope.0, &scope.1, &scope.2]
        )
        .await
        .is_err());
    writer
        .query_one(
            "SELECT source_change_set_publication_retention_floor($1,$2,$3,2)",
            &[&scope.0, &scope.1, &scope.2],
        )
        .await
        .unwrap();
    assert!(writer
        .query(
            "SELECT * FROM source_change_purge_publication_mappings($1,$2,$3,1,$4::text::uuid)",
            &[&scope.0, &scope.1, &scope.2, &uuid(9_000_000)]
        )
        .await
        .is_err());
    assert_eq!(epg_head(&writer, scope).await, 1);
    let mappings: i64 = writer
        .query_one(
            "SELECT count(*) FROM source_change_publication WHERE source_cell_id=$1",
            &[&scope.0],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(mappings, 1);
    let facts: i64 = writer
        .query_one(
            "SELECT count(*) FROM source_change_journal WHERE source_cell_id=$1",
            &[&scope.0],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(facts, 2);
    let floor:i64 = writer.query_one("SELECT retention_floor_sequence FROM source_change_publication_epochs WHERE source_cell_id=$1", &[&scope.0]).await.unwrap().get(0);
    assert_eq!(floor, 2);
    let mut killed_session = epg_session(&dsn, &config, "epg03_backend_crash").await;
    let killed_scope = ("epg03-backend-crash", "test-only-db", "test-only-epoch");
    writer.batch_execute("BEGIN").await.unwrap();
    append_one(&writer, killed_scope, 5_000_000, 1).await;
    writer.batch_execute("COMMIT").await.unwrap();
    let sink_client = connect(&dsn).await;
    let backend_pid: i32 = sink_client
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .unwrap()
        .get(0);
    let mut killed = EpgKilledSink {
        sink: PostgresPublicationSink::new(sink_client),
        admin: connect(&dsn).await,
        backend_pid,
        captured: None,
    };
    let failure = tokio::time::timeout(
        Duration::from_secs(8),
        killed_session.receive_and_persist(&mut killed),
    )
    .await
    .unwrap();
    assert!(failure.is_err());
    assert_eq!(killed_session.last_acknowledged_lsn(), None);
    assert_eq!(epg_head(&writer, killed_scope).await, 0);
    let saved = killed.captured.unwrap();
    let mut restarted = PostgresPublicationSink::new(connect(&dsn).await);
    restarted.persist(&saved).await.unwrap();
    restarted.persist(&saved).await.unwrap();
    assert_eq!(epg_head(&writer, killed_scope).await, 1);
    println!(
        "EPG10_RESULT={}",
        json!({"case":"commit_ack_conflict_retention","result":"PASS","durable_effects":1,"replay_attempts":2,"ack_before_commit":false,"conflicting_digest_rejected":true,"conflict_stream_poisoned_without_ack":true,"original_hash":source_hash,"retention_floor":floor,"backend_kill_before_append_recovered_once":true,"fault_kind":"actual PG sink backend kill; TEST_ONLY response loss after real SQL commit; saved-decoded-commit replay, NOT reconnect/WAL resume; inherited test covers deferred COMMIT rollback plus resnapshot"})
    );
}

#[tokio::test]
async fn epg03_two_native_publishers_expose_missing_generation_fence() {
    let (dsn, config) = required_environment().expect("real isolated PostgreSQL REQUIRED");
    let writer = connect(&dsn).await;
    // Two different temporary slots are allowed: slot exclusivity alone is not
    // an epoch-wide producer lease. This is an expected counterexample, NOT a
    // PASS for EPG10-T03-04 or an operational failover implementation.
    let mut old = epg_session(&dsn, &config, "epg03_old_writer").await;
    let mut replacement = epg_session(&dsn, &config, "epg03_new_writer").await;
    let scope = ("epg03-fence", "test-only-db", "same-source-epoch");
    writer.batch_execute("BEGIN").await.unwrap();
    append_one(&writer, scope, 3_000_000, 1).await;
    writer.batch_execute("COMMIT").await.unwrap();
    let new_client = connect(&dsn).await;
    new_client
        .batch_execute("SET ROLE source_journal_publisher")
        .await
        .unwrap();
    let mut new_sink = PostgresPublicationSink::new(new_client);
    let accepted = epg_receive(&mut replacement, &mut new_sink).await;
    let old_client = connect(&dsn).await;
    old_client
        .batch_execute("SET ROLE source_journal_publisher")
        .await
        .unwrap();
    let mut old_sink = PostgresPublicationSink::new(old_client);
    let stale = epg_receive(&mut old, &mut old_sink).await;
    assert_eq!(epg_ids(&accepted), epg_ids(&stale));
    assert_eq!(epg_head(&writer, scope).await, 1);
    // New event is also accepted through old process after replacement ACK.
    writer.batch_execute("BEGIN").await.unwrap();
    append_one(&writer, scope, 3_000_000, 2).await;
    writer.batch_execute("COMMIT").await.unwrap();
    epg_receive(&mut old, &mut old_sink).await;
    assert_eq!(epg_head(&writer, scope).await, 2);
    println!(
        "EPG10_RESULT={}",
        json!({"case":"producer_generation_fence","result":"COUNTEREXAMPLE_REPRODUCED","formal_status":"BLOCKED_SOURCE_FENCE_ABSENT","independent_slots":2,"sink_role":"source_journal_publisher","old_writer_new_commit_accepted":true,"duplicate_effects":0,"owner":"TS native publication","required":"durable commit-time generation/owner fence for each source scope"})
    );
}

#[tokio::test]
async fn epg03_write_cost_and_bounded_backlog() {
    let (dsn, config) = required_environment().expect("real isolated PostgreSQL REQUIRED");
    let writer = connect(&dsn).await;
    writer.batch_execute("CREATE TABLE IF NOT EXISTS epg03_cost_domain(id bigint PRIMARY KEY, revision bigint NOT NULL)").await.unwrap();
    let mut session = epg_session(&dsn, &config, "epg03_cost").await;
    let wal = || async {
        writer
            .query_one("SELECT pg_current_wal_insert_lsn()::text", &[])
            .await
            .unwrap()
            .get::<_, String>(0)
    };
    let before = wal().await;
    let start = std::time::Instant::now();
    for i in 0..32_i64 {
        writer.batch_execute("BEGIN").await.unwrap();
        writer
            .execute("INSERT INTO epg03_cost_domain VALUES($1,1)", &[&i])
            .await
            .unwrap();
        writer.batch_execute("COMMIT").await.unwrap();
    }
    let baseline_us = start.elapsed().as_micros();
    let middle = wal().await;
    let scope = ("epg03-cost", "test-only-db", "test-only-epoch");
    let start = std::time::Instant::now();
    for i in 0..32_i64 {
        writer.batch_execute("BEGIN").await.unwrap();
        writer
            .execute("INSERT INTO epg03_cost_domain VALUES($1,1)", &[&(100 + i)])
            .await
            .unwrap();
        append_one(&writer, scope, 4_000_000, i as u64).await;
        writer.batch_execute("COMMIT").await.unwrap();
    }
    let captured_us = start.elapsed().as_micros();
    let captured = wal().await;
    let backlog: i64 = writer
        .query_one(
            "SELECT count(*) FROM source_change_journal WHERE source_cell_id=$1",
            &[&scope.0],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(backlog, 32);
    assert_eq!(epg_head(&writer, scope).await, 0);
    let mut sink = PostgresPublicationSink::new(connect(&dsn).await);
    let start = std::time::Instant::now();
    for _ in 0..32 {
        epg_receive(&mut session, &mut sink).await;
    }
    let drain_us = start.elapsed().as_micros();
    let after = wal().await;
    assert_eq!(epg_head(&writer, scope).await, 32);
    let mut deltas = vec![];
    for (end, begin) in [
        (&middle, &before),
        (&captured, &middle),
        (&after, &captured),
    ] {
        let bytes: i64 = writer
            .query_one(
                "SELECT pg_wal_lsn_diff($1::text::pg_lsn,$2::text::pg_lsn)::bigint",
                &[&end, &begin],
            )
            .await
            .unwrap()
            .get(0);
        deltas.push(bytes);
    }
    let lock_waiters:i64=writer.query_one("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",&[]).await.unwrap().get(0);
    assert_eq!(lock_waiters, 0);
    println!(
        "EPG10_RESULT={}",
        json!({"case":"bounded_write_cost","result":"PASS_DIAGNOSTIC_ONLY","transactions_each":32,"domain_only_elapsed_us":baseline_us.to_string(),"domain_plus_journal_elapsed_us":captured_us.to_string(),"native_publication_elapsed_us":drain_us.to_string(),"wal_bytes_domain_only":deltas[0],"wal_bytes_domain_plus_journal":deltas[1],"wal_bytes_publication":deltas[2],"backlog_before":backlog,"backlog_after":0,"sampled_lock_waiters_after":lock_waiters,"limits":"single synthetic serial run; sampled no-contention, NOT concurrent writer lock-cost/capacity certification"})
    );
}
