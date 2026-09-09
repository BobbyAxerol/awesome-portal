//! Runtime worker for the fixed EDS-11R5 event-ledger contract.
//!
//! This module is deliberately a small consumer, rather than a second event
//! system.  It can call only the two sealed Manager extension operations.  A
//! source cursor is held in a mode-0600 local state file and is advanced only
//! after the Portal-owned append store returns a durable receipt.  Neither the
//! browser nor Control API can select a source, relation, cursor or lease.

use std::{
    fs::{self, File, OpenOptions},
    io::Write as _,
    os::unix::fs::{OpenOptionsExt as _, PermissionsExt as _},
    path::Path,
};

use authoritative_event_core::{
    AuthoritativeEvent, DurableCheckpoint, EventOperation, EventSourceAdmission, FrameLane,
    IngestBounds, IngestEffect, SnapshotBoundary, SnapshotCompleteness, SnapshotSemantics,
    SnapshotTailCoordinator, SourceFrame, SourcePosition,
};
use chrono::Utc;
use execution_contracts::CanonicalId;
use manager_extension_contract::{
    EventAnchor, EventTail, LedgerEvent, LedgerOperation, ManagerExtensionRead,
    ManagerExtensionRequest, EVENT_LEDGER_CONTRACT_REVISION,
};
use manager_v2_client::{
    ManagerV2Client, ManagerV2ClientConfig, ManagerV2ClientError, ManagerV2ClientLimits,
};
use projection_core::canonical_value_digest;
use projection_store_pg::{
    AuthoritativeAnchorOutcome, AuthoritativeAppendOutcome, AuthoritativeResumeState,
    PgProjectionStore, SourceAdmissionDenyReason, SourceAdmissionOutcome, SourceAdmissionRequest,
    StoreError,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::time::{self, MissedTickBehavior};
use tracing::{info, warn};
use uuid::Uuid;

use super::EdgeConfig;

const RUNTIME_MANIFEST_SCHEMA_VERSION: &str =
    "portal.execution.eds11r.event-ledger-runtime-manifest.v1";
const STATE_SCHEMA_VERSION: &str = "portal.execution.eds11r.event-ledger-session.v1";
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_STATE_BYTES: u64 = 32 * 1024;

/// Sanitized receipt emitted by the one-shot worker.  It deliberately omits
/// lease/cursor values, source payloads and database identities.
#[derive(Debug, Serialize)]
pub struct ManagerEventLedgerRunReport {
    schema_version: &'static str,
    environment: String,
    profile_id: String,
    source_epoch: String,
    state: &'static str,
    source_event_count: usize,
    committed_revision: u64,
    committed_source_sequence: String,
    completed_at_ms: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EventLedgerRuntimeManifest {
    schema_version: String,
    admission: EventSourceAdmission,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum SessionPhase {
    AnchorPending,
    TailReady,
}

/// This file is private runtime state.  It intentionally does not implement
/// `Debug`: a lease token and cursor must never end up in a log/error report.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct EventLedgerSession {
    schema_version: String,
    phase: SessionPhase,
    binding_digest: String,
    source_epoch: String,
    lease_epoch: String,
    lease_token: String,
    cursor: String,
    snapshot_id: String,
    snapshot_as_of_ms: i64,
    high_watermark_sequence: String,
    retention_floor_sequence: String,
}

impl EventLedgerSession {
    fn from_anchor(
        anchor: &EventAnchor,
        binding_digest: String,
    ) -> Result<Self, ManagerEventLedgerCommandError> {
        let snapshot_id = format!(
            "event-anchor-{}-{}",
            anchor.source_epoch, anchor.lease_epoch
        );
        // `SourcePosition` also validates the exact decimal form before a
        // source value is persisted to the local state file.
        let _ = SourcePosition::new(
            anchor.source_epoch.clone(),
            anchor.high_watermark.to_string(),
        )?;
        let _ = SourcePosition::new(
            anchor.source_epoch.clone(),
            anchor.retention_floor.to_string(),
        )?;
        Ok(Self {
            schema_version: STATE_SCHEMA_VERSION.to_owned(),
            phase: SessionPhase::AnchorPending,
            binding_digest,
            source_epoch: anchor.source_epoch.clone(),
            lease_epoch: anchor.lease_epoch.clone(),
            lease_token: anchor.lease_token.clone(),
            cursor: anchor.cursor.clone(),
            snapshot_id,
            snapshot_as_of_ms: anchor.snapshot_as_of_ms,
            high_watermark_sequence: anchor.high_watermark.to_string(),
            retention_floor_sequence: anchor.retention_floor.to_string(),
        })
    }

    fn snapshot(
        &self,
        admission: &EventSourceAdmission,
    ) -> Result<SnapshotBoundary, ManagerEventLedgerCommandError> {
        Ok(SnapshotBoundary {
            binding: admission.binding.clone(),
            snapshot_id: self.snapshot_id.clone(),
            snapshot_as_of_ms: self.snapshot_as_of_ms,
            high_watermark: SourcePosition::new(
                self.source_epoch.clone(),
                self.high_watermark_sequence.clone(),
            )?,
            retention_floor: SourcePosition::new(
                self.source_epoch.clone(),
                self.retention_floor_sequence.clone(),
            )?,
            semantics: SnapshotSemantics::EventLogAnchor,
            completeness: SnapshotCompleteness::Complete,
        })
    }

    fn validate_against(
        &self,
        admission: &EventSourceAdmission,
    ) -> Result<(), ManagerEventLedgerCommandError> {
        if self.schema_version != STATE_SCHEMA_VERSION
            || self.binding_digest != admission.binding.binding_digest()?
            || self.source_epoch != admission.retention_floor.source_epoch
            || self.retention_floor_sequence != admission.retention_floor.source_sequence
        {
            return Err(ManagerEventLedgerCommandError::StateBindingMismatch);
        }
        self.snapshot(admission)?.validate_against(admission)?;
        Ok(())
    }
}

/// Executes a single bounded event-ledger pass.  It is safe to invoke from a
/// service timer because it never retries inside one pass and will never
/// silently re-anchor a poisoned/expired stream.
pub async fn run_once(
    config: &EdgeConfig,
) -> Result<ManagerEventLedgerRunReport, ManagerEventLedgerCommandError> {
    run_once_mode(config, false).await
}

/// Emits exactly the sanitized receipt to stdout.
pub async fn run_once_cli(config: &EdgeConfig) -> Result<(), ManagerEventLedgerCommandError> {
    let report = run_once(config).await?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}

/// Runs an explicit, operator-authorized re-anchor.  The normal polling loop
/// never enters this path; it is the only way to recover an epoch/floor/gap
/// fence after an owner has inspected the source condition.
pub async fn run_reanchor_cli(config: &EdgeConfig) -> Result<(), ManagerEventLedgerCommandError> {
    if !config.manager_event_ledger_reanchor_authorized.is_enabled() {
        return Err(ManagerEventLedgerCommandError::ReanchorNotAuthorized);
    }
    let report = run_once_mode(config, true).await?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}

/// Runs forever at the bounded configured interval.  A failure is logged as a
/// sanitized error and waits for the next tick; there is no immediate retry
/// storm and no implicit re-anchor.
pub async fn run_forever(config: &EdgeConfig) -> Result<(), ManagerEventLedgerCommandError> {
    if !config.manager_event_ledger_enabled.is_enabled() {
        return Err(ManagerEventLedgerCommandError::LedgerDisabled);
    }
    let mut interval = time::interval(config.manager_event_ledger_poll_interval);
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        match run_once(config).await {
            Ok(report) => info!(
                environment = report.environment,
                profile_id = report.profile_id,
                source_epoch = report.source_epoch,
                state = report.state,
                source_event_count = report.source_event_count,
                committed_revision = report.committed_revision,
                "EDS-11R5 Manager event-ledger pass committed"
            ),
            Err(error) => warn!(
                error = %error,
                "EDS-11R5 Manager event-ledger pass failed closed"
            ),
        }
    }
}

#[allow(clippy::too_many_lines)]
async fn run_once_mode(
    config: &EdgeConfig,
    explicit_reanchor: bool,
) -> Result<ManagerEventLedgerRunReport, ManagerEventLedgerCommandError> {
    if !config.manager_event_ledger_enabled.is_enabled() {
        return Err(ManagerEventLedgerCommandError::LedgerDisabled);
    }
    let profile_id = config
        .manager_v2_profile_id
        .as_deref()
        .ok_or(ManagerEventLedgerCommandError::MissingProfile)?;
    let admission_path = config
        .manager_event_ledger_admission_file
        .as_deref()
        .ok_or(ManagerEventLedgerCommandError::MissingAdmissionManifest)?;
    let state_path = config
        .manager_event_ledger_state_file
        .as_deref()
        .ok_or(ManagerEventLedgerCommandError::MissingStateFile)?;
    let admission = load_admission(admission_path, &config.environment, profile_id)?;
    let binding_digest = admission.binding.binding_digest()?;
    let database_url_path = config
        .projection_database_url_file
        .as_deref()
        .ok_or(ManagerEventLedgerCommandError::MissingDatabaseUrl)?;
    let store = PgProjectionStore::connect(read_nonempty(database_url_path)?.trim()).await?;
    store.ping().await?;
    let client = manager_client(config, profile_id)?;

    let resume = store
        .load_authoritative_event_resume_state(&admission.binding)
        .await?;
    let session = load_session(state_path)?;

    if explicit_reanchor {
        match resume {
            AuthoritativeResumeState::ResnapshotRequired { .. } => {}
            AuthoritativeResumeState::Absent | AuthoritativeResumeState::Checkpoint(_) => {
                return Err(ManagerEventLedgerCommandError::ReanchorNotRequired);
            }
        }
        return establish_anchor(
            config,
            profile_id,
            &store,
            &client,
            &admission,
            binding_digest,
            state_path,
            true,
        )
        .await;
    }

    match resume {
        AuthoritativeResumeState::Absent => {
            if session.is_some() {
                return Err(ManagerEventLedgerCommandError::StateWithoutDurableAnchor);
            }
            establish_anchor(
                config,
                profile_id,
                &store,
                &client,
                &admission,
                binding_digest,
                state_path,
                false,
            )
            .await
        }
        AuthoritativeResumeState::ResnapshotRequired { .. } => {
            Err(ManagerEventLedgerCommandError::ResnapshotRequired)
        }
        AuthoritativeResumeState::Checkpoint(generation) => {
            let session =
                session.ok_or(ManagerEventLedgerCommandError::DurableAnchorWithoutState)?;
            session.validate_against(&admission)?;
            if generation.checkpoint.snapshot != session.snapshot(&admission)? {
                return Err(ManagerEventLedgerCommandError::StateCheckpointMismatch);
            }
            match session.phase {
                SessionPhase::AnchorPending => {
                    finish_pending_anchor(
                        &store,
                        &admission,
                        state_path,
                        session,
                        Some(&generation.checkpoint),
                        &config.environment,
                        profile_id,
                    )
                    .await
                }
                SessionPhase::TailReady => {
                    if !generation.checkpoint.tail_ready {
                        return Err(ManagerEventLedgerCommandError::StateCheckpointMismatch);
                    }
                    tail_once(
                        config,
                        profile_id,
                        &store,
                        &client,
                        &admission,
                        state_path,
                        session,
                        &generation.checkpoint,
                    )
                    .await
                }
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn establish_anchor(
    config: &EdgeConfig,
    profile_id: &str,
    store: &PgProjectionStore,
    client: &ManagerV2Client,
    admission: &EventSourceAdmission,
    binding_digest: String,
    state_path: &Path,
    resync: bool,
) -> Result<ManagerEventLedgerRunReport, ManagerEventLedgerCommandError> {
    let read = admitted_extension_execute(
        config,
        profile_id,
        store,
        client,
        &ManagerExtensionRequest::event_anchor(resync),
    )
    .await?;
    let ManagerExtensionRead::EventAnchor(anchor) = read else {
        return Err(unexpected_extension_read(&read));
    };
    validate_anchor(&anchor, admission)?;
    let session = EventLedgerSession::from_anchor(&anchor, binding_digest)?;
    // The state is written before the store transaction, so a crash cannot
    // lose the only source lease/cursor.  On restart the same pending anchor
    // is either committed idempotently or remains fail-closed.
    save_session(state_path, &session)?;
    let report = finish_pending_anchor(
        store,
        admission,
        state_path,
        session,
        None,
        &config.environment,
        profile_id,
    )
    .await?;
    Ok(report)
}

#[allow(clippy::too_many_arguments)]
async fn finish_pending_anchor(
    store: &PgProjectionStore,
    admission: &EventSourceAdmission,
    state_path: &Path,
    mut session: EventLedgerSession,
    checkpoint: Option<&DurableCheckpoint>,
    environment: &str,
    profile_id: &str,
) -> Result<ManagerEventLedgerRunReport, ManagerEventLedgerCommandError> {
    if session.phase != SessionPhase::AnchorPending {
        return Err(ManagerEventLedgerCommandError::StateCheckpointMismatch);
    }
    let snapshot = session.snapshot(admission)?;
    let mut coordinator = SnapshotTailCoordinator::new(admission.clone(), IngestBounds::default())?;
    let IngestEffect::AnchorCommitRequired { .. } = coordinator.begin_snapshot(snapshot)? else {
        return Err(ManagerEventLedgerCommandError::CoordinatorInvariant);
    };
    let pending = coordinator
        .pending_anchor()
        .ok_or(ManagerEventLedgerCommandError::CoordinatorInvariant)?;
    let receipt = match store
        .commit_authoritative_event_anchor(pending, Utc::now().timestamp_millis())
        .await?
    {
        AuthoritativeAnchorOutcome::Written(receipt)
        | AuthoritativeAnchorOutcome::AlreadyDurable(receipt) => receipt,
    };
    let IngestEffect::DurableCheckpointAdvanced {
        committed_revision, ..
    } = coordinator.acknowledge_durable_anchor(receipt)?
    else {
        return Err(ManagerEventLedgerCommandError::CoordinatorInvariant);
    };
    // An existing checkpoint may be supplied after a crash.  It must be the
    // exact anchor now committed; do not paper over state/storage drift.
    if let Some(checkpoint) = checkpoint {
        let durable = coordinator
            .durable_checkpoint()
            .ok_or(ManagerEventLedgerCommandError::CoordinatorInvariant)?;
        if *checkpoint != durable {
            return Err(ManagerEventLedgerCommandError::StateCheckpointMismatch);
        }
    }
    session.phase = SessionPhase::TailReady;
    save_session(state_path, &session)?;
    Ok(ManagerEventLedgerRunReport {
        schema_version: "portal.execution.eds11r.event-ledger-run.v1",
        environment: environment.to_owned(),
        profile_id: profile_id.to_owned(),
        source_epoch: session.source_epoch,
        state: "ANCHOR_COMMITTED",
        source_event_count: 0,
        committed_revision,
        committed_source_sequence: session.high_watermark_sequence,
        completed_at_ms: Utc::now().timestamp_millis(),
    })
}

#[allow(clippy::too_many_arguments)]
async fn tail_once(
    config: &EdgeConfig,
    profile_id: &str,
    store: &PgProjectionStore,
    client: &ManagerV2Client,
    admission: &EventSourceAdmission,
    state_path: &Path,
    mut session: EventLedgerSession,
    checkpoint: &DurableCheckpoint,
) -> Result<ManagerEventLedgerRunReport, ManagerEventLedgerCommandError> {
    let mut coordinator = SnapshotTailCoordinator::resume(
        admission.clone(),
        IngestBounds::default(),
        checkpoint.clone(),
    )?;
    let request = ManagerExtensionRequest::event_tail(
        session.lease_token.clone(),
        session.cursor.clone(),
        config.manager_event_ledger_page_rows,
    )?;
    let read = admitted_extension_execute(config, profile_id, store, client, &request).await?;
    let ManagerExtensionRead::EventTail(tail) = read else {
        return Err(unexpected_extension_read(&read));
    };
    validate_tail(&tail, &session, admission)?;
    if tail.events.is_empty() {
        // The source received only the previously durable cursor.  Persisting
        // its renewed opaque cursor cannot acknowledge a non-durable event.
        session.cursor = tail.next_cursor;
        save_session(state_path, &session)?;
        return Ok(ManagerEventLedgerRunReport {
            schema_version: "portal.execution.eds11r.event-ledger-run.v1",
            environment: config.environment.clone(),
            profile_id: profile_id.to_owned(),
            source_epoch: session.source_epoch,
            state: "TAIL_EMPTY",
            source_event_count: 0,
            committed_revision: checkpoint.committed_revision,
            committed_source_sequence: checkpoint
                .committed_position
                .as_ref()
                .ok_or(ManagerEventLedgerCommandError::StateCheckpointMismatch)?
                .source_sequence
                .clone(),
            completed_at_ms: Utc::now().timestamp_millis(),
        });
    }
    let events = tail
        .events
        .iter()
        .map(|event| ledger_event_to_authoritative(event, &session.source_epoch))
        .collect::<Result<Vec<_>, _>>()?;
    let snapshot = checkpoint.snapshot.clone();
    let frame = SourceFrame::seal(
        admission.binding.clone(),
        FrameLane::LiveTail,
        snapshot.high_watermark.clone(),
        checkpoint.committed_position.clone(),
        events,
        false,
        tail.as_of_ms,
    )?;
    let IngestEffect::CommitRequired { record_count, .. } = coordinator.prepare_append(frame)?
    else {
        return Err(ManagerEventLedgerCommandError::CoordinatorInvariant);
    };
    let pending = coordinator
        .pending_append()
        .ok_or(ManagerEventLedgerCommandError::CoordinatorInvariant)?;
    let receipt = match store
        .commit_authoritative_event_append(pending, Utc::now().timestamp_millis())
        .await?
    {
        AuthoritativeAppendOutcome::Written(receipt)
        | AuthoritativeAppendOutcome::AlreadyDurable(receipt) => receipt,
        AuthoritativeAppendOutcome::Quarantined(_) => {
            return Err(ManagerEventLedgerCommandError::Quarantined);
        }
    };
    let IngestEffect::DurableCheckpointAdvanced {
        committed_revision, ..
    } = coordinator.acknowledge_durable_append(receipt)?
    else {
        return Err(ManagerEventLedgerCommandError::CoordinatorInvariant);
    };
    // This write is the actual ACK barrier: `next_cursor` becomes eligible
    // only after the append transaction has returned its exact receipt.
    session.cursor = tail.next_cursor;
    save_session(state_path, &session)?;
    let durable = coordinator
        .durable_checkpoint()
        .ok_or(ManagerEventLedgerCommandError::CoordinatorInvariant)?;
    Ok(ManagerEventLedgerRunReport {
        schema_version: "portal.execution.eds11r.event-ledger-run.v1",
        environment: config.environment.clone(),
        profile_id: profile_id.to_owned(),
        source_epoch: session.source_epoch,
        state: "TAIL_COMMITTED",
        source_event_count: record_count,
        committed_revision,
        committed_source_sequence: durable
            .committed_position
            .ok_or(ManagerEventLedgerCommandError::CoordinatorInvariant)?
            .source_sequence,
        completed_at_ms: Utc::now().timestamp_millis(),
    })
}

fn validate_anchor(
    anchor: &EventAnchor,
    admission: &EventSourceAdmission,
) -> Result<(), ManagerEventLedgerCommandError> {
    if anchor.source_epoch != admission.retention_floor.source_epoch
        || anchor.retention_floor.to_string() != admission.retention_floor.source_sequence
        || anchor.retention_floor > anchor.high_watermark.saturating_add(1)
    {
        return Err(ManagerEventLedgerCommandError::SourceBoundaryMismatch);
    }
    Ok(())
}

fn validate_tail(
    tail: &EventTail,
    session: &EventLedgerSession,
    admission: &EventSourceAdmission,
) -> Result<(), ManagerEventLedgerCommandError> {
    if tail.source_epoch != session.source_epoch
        || tail.lease_epoch != session.lease_epoch
        || tail.retention_floor.to_string() != admission.retention_floor.source_sequence
    {
        return Err(ManagerEventLedgerCommandError::SourceBoundaryMismatch);
    }
    Ok(())
}

fn ledger_event_to_authoritative(
    event: &LedgerEvent,
    expected_epoch: &str,
) -> Result<AuthoritativeEvent, ManagerEventLedgerCommandError> {
    let (operation, correction_of_event_id, tombstone_of_event_id) = match event.operation {
        LedgerOperation::Upsert => (EventOperation::Upsert, None, None),
        LedgerOperation::Delete => (
            EventOperation::Tombstone,
            None,
            Some(CanonicalId::parse(
                event
                    .supersedes_event_id
                    .as_deref()
                    .ok_or(ManagerEventLedgerCommandError::EventSemanticsInvalid)?,
            )?),
        ),
    };
    Ok(AuthoritativeEvent {
        event_id: CanonicalId::parse(&event.event_id)?,
        source_position: SourcePosition::new(expected_epoch, event.source_sequence.to_string())?,
        entity_kind: event.entity.clone(),
        entity_id: CanonicalId::parse(&event.entity_id)?,
        entity_version: event.entity_version.clone(),
        payload_schema_revision: EVENT_LEDGER_CONTRACT_REVISION.to_owned(),
        operation,
        event_time_ms: event.occurred_at_ms,
        source_published_at_ms: event.observed_at_ms,
        correction_of_event_id,
        tombstone_of_event_id,
        causation_id: None,
        correlation_id: None,
        payload: event.record.clone(),
        payload_digest: canonical_value_digest(&event.record),
    })
}

fn load_admission(
    path: &Path,
    environment: &str,
    profile_id: &str,
) -> Result<EventSourceAdmission, ManagerEventLedgerCommandError> {
    let bytes = read_bounded(path, MAX_MANIFEST_BYTES)?;
    let manifest: EventLedgerRuntimeManifest = serde_json::from_slice(&bytes)
        .map_err(|_| ManagerEventLedgerCommandError::AdmissionManifestInvalid)?;
    if manifest.schema_version != RUNTIME_MANIFEST_SCHEMA_VERSION
        || manifest.admission.binding.contract_revision != EVENT_LEDGER_CONTRACT_REVISION
        || manifest.admission.binding.environment != environment
        || manifest.admission.binding.profile_id != profile_id
    {
        return Err(ManagerEventLedgerCommandError::AdmissionManifestInvalid);
    }
    manifest.admission.validate()?;
    Ok(manifest.admission)
}

fn load_session(path: &Path) -> Result<Option<EventLedgerSession>, ManagerEventLedgerCommandError> {
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(path)?;
    if !metadata.is_file()
        || metadata.len() > MAX_STATE_BYTES
        || metadata.permissions().mode() & 0o777 != 0o600
    {
        return Err(ManagerEventLedgerCommandError::StateFileUnsafe);
    }
    serde_json::from_slice(&fs::read(path)?)
        .map(Some)
        .map_err(|_| ManagerEventLedgerCommandError::StateFileUnsafe)
}

fn save_session(
    path: &Path,
    session: &EventLedgerSession,
) -> Result<(), ManagerEventLedgerCommandError> {
    let parent = path
        .parent()
        .ok_or(ManagerEventLedgerCommandError::StateFileUnsafe)?;
    let parent_metadata = fs::metadata(parent)?;
    if !parent_metadata.is_dir() {
        return Err(ManagerEventLedgerCommandError::StateFileUnsafe);
    }
    let encoded = serde_json::to_vec(session)?;
    if encoded.len() as u64 > MAX_STATE_BYTES {
        return Err(ManagerEventLedgerCommandError::StateFileUnsafe);
    }
    let temporary = parent.join(format!(".event-ledger-state-{}.tmp", Uuid::now_v7()));
    let result = (|| -> Result<(), ManagerEventLedgerCommandError> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)?;
        file.write_all(&encoded)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn manager_client(
    config: &EdgeConfig,
    profile_id: &str,
) -> Result<ManagerV2Client, ManagerEventLedgerCommandError> {
    let identity_path = config
        .source_client_identity_file
        .as_deref()
        .ok_or(ManagerEventLedgerCommandError::MissingClientIdentity)?;
    let ca = read_bounded(&config.source_ca_file, MAX_MANIFEST_BYTES)?;
    let identity = read_bounded(identity_path, MAX_MANIFEST_BYTES)?;
    Ok(ManagerV2Client::new(ManagerV2ClientConfig {
        source_proxy_origin: &config.source_origin,
        profile_id,
        root_ca_pem: &ca,
        client_identity_pem: &identity,
        limits: ManagerV2ClientLimits::default(),
    })?)
}

async fn admitted_extension_execute(
    config: &EdgeConfig,
    profile_id: &str,
    store: &PgProjectionStore,
    client: &ManagerV2Client,
    request: &ManagerExtensionRequest,
) -> Result<ManagerExtensionRead, ManagerEventLedgerCommandError> {
    let outcome = store
        .acquire_source_admission(&SourceAdmissionRequest {
            source_id: "manager-v2".to_owned(),
            profile_id: profile_id.to_owned(),
            owner_id: format!("edge-event-ledger:{}", Uuid::now_v7()),
            maximum_requests_per_second: config.manager_shared_admission_maximum_rps,
            maximum_concurrency: config.manager_shared_admission_maximum_concurrency,
            maximum_wait: config.manager_shared_admission_maximum_wait,
            lease_ttl: config.manager_shared_admission_lease_ttl,
        })
        .await?;
    let lease = match outcome {
        SourceAdmissionOutcome::Accepted(lease) => lease,
        SourceAdmissionOutcome::Denied(SourceAdmissionDenyReason::ConcurrencyExhausted) => {
            return Err(ManagerEventLedgerCommandError::AdmissionConcurrencyDenied);
        }
        SourceAdmissionOutcome::Denied(SourceAdmissionDenyReason::RateBudgetExhausted) => {
            return Err(ManagerEventLedgerCommandError::AdmissionRateDenied);
        }
    };
    if !lease.wait.is_zero() {
        time::sleep(lease.wait).await;
    }
    let result = client.execute_extension(request).await;
    let release = store.release_source_admission(&lease).await;
    if release.is_err() {
        return Err(ManagerEventLedgerCommandError::AdmissionReleaseFailed);
    }
    Ok(result?)
}

fn unexpected_extension_read(read: &ManagerExtensionRead) -> ManagerEventLedgerCommandError {
    match read {
        ManagerExtensionRead::Unavailable(_) => ManagerEventLedgerCommandError::SourceUnavailable,
        ManagerExtensionRead::Market(_)
        | ManagerExtensionRead::EventAnchor(_)
        | ManagerExtensionRead::EventTail(_) => {
            ManagerEventLedgerCommandError::UnexpectedExtensionPayload
        }
    }
}

fn read_nonempty(path: &Path) -> Result<String, ManagerEventLedgerCommandError> {
    let value = String::from_utf8(read_bounded(path, MAX_MANIFEST_BYTES)?)
        .map_err(|_| ManagerEventLedgerCommandError::PrivateInputInvalid)?;
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(ManagerEventLedgerCommandError::PrivateInputInvalid);
    }
    Ok(value)
}

fn read_bounded(path: &Path, maximum: u64) -> Result<Vec<u8>, ManagerEventLedgerCommandError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > maximum {
        return Err(ManagerEventLedgerCommandError::PrivateInputInvalid);
    }
    Ok(fs::read(path)?)
}

#[derive(Debug, Error)]
pub enum ManagerEventLedgerCommandError {
    #[error("the Manager event-ledger worker is disabled")]
    LedgerDisabled,
    #[error("the Manager profile binding is missing")]
    MissingProfile,
    #[error("the event-ledger admission manifest is missing")]
    MissingAdmissionManifest,
    #[error("the event-ledger cursor state file is missing")]
    MissingStateFile,
    #[error("the Portal projection database input is missing")]
    MissingDatabaseUrl,
    #[error("the Edge mTLS client identity is missing")]
    MissingClientIdentity,
    #[error("the event-ledger admission manifest is invalid or does not match this deployment")]
    AdmissionManifestInvalid,
    #[error("the event-ledger session file is unsafe")]
    StateFileUnsafe,
    #[error("the event-ledger session does not match its admitted source binding")]
    StateBindingMismatch,
    #[error("a session exists without a durable anchor")]
    StateWithoutDurableAnchor,
    #[error("a durable anchor exists without its private session state")]
    DurableAnchorWithoutState,
    #[error("the durable event checkpoint differs from local session state")]
    StateCheckpointMismatch,
    #[error("the source anchor or tail differs from its exact admitted boundary")]
    SourceBoundaryMismatch,
    #[error("the source event correction/tombstone semantics are invalid")]
    EventSemanticsInvalid,
    #[error("the source event ledger requires explicit re-anchor")]
    ResnapshotRequired,
    #[error("explicit re-anchor is not authorized")]
    ReanchorNotAuthorized,
    #[error("explicit re-anchor is not currently required")]
    ReanchorNotRequired,
    #[error("the source event page was quarantined before acknowledgement")]
    Quarantined,
    #[error("the source returned a typed unavailable response")]
    SourceUnavailable,
    #[error("the Manager extension response does not match the fixed ledger operation")]
    UnexpectedExtensionPayload,
    #[error("the Edge-wide Manager concurrency budget denied this source request")]
    AdmissionConcurrencyDenied,
    #[error("the Edge-wide Manager rate budget denied this source request")]
    AdmissionRateDenied,
    #[error("the Edge-wide Manager admission lease could not be released")]
    AdmissionReleaseFailed,
    #[error("the event-ledger state machine violated an internal invariant")]
    CoordinatorInvariant,
    #[error("a private runtime input is invalid")]
    PrivateInputInvalid,
    #[error(transparent)]
    Core(#[from] authoritative_event_core::CoreError),
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Client(#[from] ManagerV2ClientError),
    #[error(transparent)]
    CanonicalId(#[from] execution_contracts::ContractError),
    #[error(transparent)]
    Extension(#[from] manager_extension_contract::ExtensionContractError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn delete_event_maps_only_to_a_tombstone() {
        let event = LedgerEvent {
            source_sequence: 7,
            event_id: "evt_7".to_owned(),
            entity: "FILL".to_owned(),
            entity_id: "fill_7".to_owned(),
            operation: LedgerOperation::Delete,
            entity_version: "v1".to_owned(),
            observed_at_ms: 100,
            occurred_at_ms: 99,
            supersedes_event_id: Some("evt_6".to_owned()),
            record: json!({"occurred_at":"1970-01-01T00:00:00.099Z"}),
        };
        let mapped = ledger_event_to_authoritative(&event, "epoch_1").expect("maps");
        assert_eq!(mapped.operation, EventOperation::Tombstone);
        assert!(mapped.correction_of_event_id.is_none());
        assert_eq!(mapped.tombstone_of_event_id.unwrap().as_str(), "evt_6");
    }

    #[test]
    fn session_anchor_preserves_exact_sequence_strings() {
        let anchor = EventAnchor {
            source_epoch: "epoch_1".to_owned(),
            lease_epoch: "lease_1".to_owned(),
            lease_token: "lease-token".to_owned(),
            cursor: "cursor-token".to_owned(),
            snapshot_as_of_ms: 1,
            high_watermark: 0,
            retention_floor: 1,
        };
        let session = EventLedgerSession::from_anchor(
            &anchor,
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
        )
        .expect("session");
        assert_eq!(session.high_watermark_sequence, "0");
        assert_eq!(session.retention_floor_sequence, "1");
        assert_eq!(session.phase, SessionPhase::AnchorPending);
    }
}
