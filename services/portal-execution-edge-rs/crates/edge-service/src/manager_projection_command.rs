use std::{collections::BTreeSet, fs, time::Duration};

use chrono::{DateTime, Utc};
use manager_compat_authority::{
    AuthorityError, BoundManagerAuthority, DeploymentEnvironment, ManagerCompatibilityAuthority,
    ManagerRequestContext, DELEGATED_RESOURCE,
};
use manager_projection::{
    BuiltProjectionCycle, ManagerFeedSnapshot, ManagerProjectionCycle, ManagerProjectionFact,
    ManagerProjectionFeed, ManagerProjectionProfile, ManagerProjectionSource, ProjectionMapError,
    DEFAULT_POLL_INTERVAL_MS, FEEDS, MANAGER_PROJECTION_ADAPTER_VERSION, MAXIMUM_CYCLE_RECORDS,
    MAXIMUM_FEED_PAGES, MAXIMUM_FEED_RECORDS,
};
use manager_v2_client::{ManagerV2Client, ManagerV2ClientConfig, ManagerV2ClientError};
use manager_v2_contract::{
    Completeness, ManagerCatalogue, ManagerMeta, ManagerPayload, ManagerRead, ManagerRecord,
    OpaqueCursor, PageLimit, RUNTIME_CONTRACT_REVISION,
};
use projection_core::ProjectionEpochStatus;
use projection_store_pg::{
    EpochMetadata, ManagerCycleCommitInput, ManagerProjectionLeaseAcquireOutcome,
    ManagerSnapshotCommitInput, PgProjectionStore, StoreError,
};
use serde::Serialize;
use thiserror::Error;
use tracing::{info, warn};
use uuid::Uuid;

use super::EdgeConfig;

const PAGE_LIMIT: u16 = 200;
const LEASE_TTL: Duration = Duration::from_secs(60);
const ROLLBACK_OVERLAP: Duration = Duration::from_secs(900);

#[derive(Debug, Serialize)]
pub struct ManagerProjectionRunReport {
    schema_version: &'static str,
    environment: String,
    profile_id: String,
    epoch_id: Uuid,
    cycle_id: String,
    catalogue_digest: String,
    feed_count: usize,
    snapshot_count: usize,
    record_count: usize,
    state_digest: String,
    activated: bool,
    retained_previous_epoch_id: Option<Uuid>,
    source_read_at: DateTime<Utc>,
    completed_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct ManagerProjectionRollbackReport {
    schema_version: &'static str,
    environment: String,
    restored_epoch_id: Uuid,
    failed_epoch_id: Uuid,
    restored_state_digest: String,
    completed_at: DateTime<Utc>,
}

/// Runs one complete, bounded Manager-v2 projection cycle.
///
/// # Errors
///
/// Fails closed on configuration, source, contract, paging, lease, persistence
/// or parity drift. It never retries a source request inside the cycle.
#[allow(clippy::too_many_lines)] // One bounded cycle keeps source-to-cutover ordering auditable.
pub async fn run_once(
    config: &EdgeConfig,
) -> Result<ManagerProjectionRunReport, ManagerProjectionCommandError> {
    run_once_mode(config, false).await
}

#[allow(clippy::too_many_lines)] // One bounded cycle keeps source-to-cutover ordering auditable.
async fn run_once_mode(
    config: &EdgeConfig,
    force_rebuild: bool,
) -> Result<ManagerProjectionRunReport, ManagerProjectionCommandError> {
    if !config.manager_projection_enabled.is_enabled() {
        return Err(ManagerProjectionCommandError::ProjectionDisabled);
    }
    let profile_id = config
        .manager_v2_profile_id
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingProfile)?;
    let profile = ManagerProjectionProfile::from_binding(&config.environment, profile_id)?;
    let deployment_environment = DeploymentEnvironment::from_config(&config.environment)
        .ok_or(ManagerProjectionCommandError::MissingProfile)?;
    let owner_digest = config
        .manager_projection_owner_digest
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingOwnerDigest)?;
    let database_path = config
        .projection_database_url_file
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingDatabaseUrl)?;
    let database_url = read_nonempty(database_path)?;
    let source_ca = read_nonempty_bytes(&config.source_ca_file)?;
    let identity_path = config
        .source_client_identity_file
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingClientIdentity)?;
    let source_identity = read_nonempty_bytes(identity_path)?;
    let client = ManagerV2Client::new(ManagerV2ClientConfig {
        source_proxy_origin: &config.source_origin,
        profile_id,
        root_ca_pem: &source_ca,
        client_identity_pem: &source_identity,
        limits: manager_v2_client::ManagerV2ClientLimits::default(),
    })?;
    let authority = ManagerCompatibilityAuthority::canonical()?;
    let bound = authority.bind(ManagerRequestContext {
        environment: deployment_environment,
        profile_id,
        delegated_resource: DELEGATED_RESOURCE,
        owner_contract_revision: RUNTIME_CONTRACT_REVISION,
    })?;
    let (catalogue, catalogue_digest) = load_catalogue(&client, bound).await?;
    load_and_validate_capabilities(&client, bound, &catalogue_digest).await?;
    let cycle = load_cycle(
        &client,
        bound,
        &catalogue,
        profile,
        i64::try_from(config.manager_projection_poll_interval.as_millis())
            .map_err(|_| ManagerProjectionCommandError::InvalidPollInterval)?,
    )
    .await?
    .build()?;

    let store = PgProjectionStore::connect(database_url.trim()).await?;
    store.ping().await?;
    let scope = projection_core::ProjectionScope::new(
        execution_contracts::CanonicalId::parse("workspace_execution_manager")?,
        profile.environment(),
    )?;
    let metadata = EpochMetadata {
        adapter_version: MANAGER_PROJECTION_ADAPTER_VERSION.to_owned(),
        source_gateway_digest: config.source_gateway_digest.clone(),
        capability_snapshot_id: catalogue_digest.clone(),
    };
    let epoch = if force_rebuild {
        store
            .prepare_manager_projection_rebuild_epoch(&scope, &metadata, Utc::now())
            .await?
    } else {
        store
            .ensure_manager_projection_epoch(&scope, &metadata, Utc::now())
            .await?
    };
    let lease = match store
        .acquire_manager_projection_lease(
            &scope,
            epoch.epoch_id,
            Uuid::now_v7(),
            owner_digest,
            LEASE_TTL,
        )
        .await?
    {
        ManagerProjectionLeaseAcquireOutcome::Acquired(grant)
        | ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(grant) => grant,
    };
    commit_cycle(&store, &scope, epoch.epoch_id, lease.proof(), &cycle).await?;
    let cycle_receipt = store
        .commit_manager_projection_cycle(
            &scope,
            epoch.epoch_id,
            lease.proof(),
            &ManagerCycleCommitInput {
                cycle_id: cycle.cycle_id.clone(),
                profile_id: profile.profile_id().to_owned(),
                catalogue_digest: cycle.catalogue_digest.clone(),
                source_input_digest: cycle.state_input_digest.clone(),
                feed_count: cycle.feed_count,
                record_count: cycle.record_count,
                source_read_at: cycle.source_read_at,
                poll_interval_ms: cycle.poll_interval_ms,
            },
            Utc::now(),
        )
        .await?;
    let (activated, retained_previous_epoch_id) = if epoch.status == ProjectionEpochStatus::Building
    {
        let result = store
            .activate_manager_projection_epoch(
                &scope,
                epoch.epoch_id,
                &cycle_receipt.state_digest,
                Utc::now(),
                ROLLBACK_OVERLAP,
            )
            .await?;
        (true, result.retained_previous_epoch_id)
    } else {
        (false, None)
    };
    store
        .release_manager_projection_lease(&scope, epoch.epoch_id, lease.proof())
        .await?;
    Ok(ManagerProjectionRunReport {
        schema_version: "portal.execution.manager-projection.run.v1",
        environment: profile.environment().to_owned(),
        profile_id: profile.profile_id().to_owned(),
        epoch_id: epoch.epoch_id,
        cycle_id: cycle.cycle_id.as_str().to_owned(),
        catalogue_digest,
        feed_count: cycle.feed_count,
        snapshot_count: cycle.snapshots.len(),
        record_count: cycle.record_count,
        state_digest: cycle_receipt.state_digest,
        activated,
        retained_previous_epoch_id,
        source_read_at: cycle.source_read_at,
        completed_at: Utc::now(),
    })
}

/// Executes one cycle and emits only its sanitized JSON receipt to stdout.
///
/// # Errors
///
/// Propagates cycle or report serialization failures.
pub async fn run_once_cli(config: &EdgeConfig) -> Result<(), ManagerProjectionCommandError> {
    let report = run_once(config).await?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}

/// Runs one explicitly authorized same-identity rebuild cycle. The normal
/// worker cannot enter this path, so rebuild never happens by environment or
/// source accident.
///
/// # Errors
///
/// Rejects the default-disabled rebuild gate and all regular cycle failures.
pub async fn run_rebuild_once_cli(
    config: &EdgeConfig,
) -> Result<(), ManagerProjectionCommandError> {
    if !config.manager_projection_rebuild_authorized.is_enabled() {
        return Err(ManagerProjectionCommandError::RebuildNotAuthorized);
    }
    let report = run_once_mode(config, true).await?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}

/// Atomically restores the explicitly selected retained predecessor. This is
/// an operator-only one-shot command; the long-running worker cannot invoke it.
///
/// # Errors
///
/// Rejects a disabled gate, missing epoch pair, live writer or expired overlap.
pub async fn run_rollback_once_cli(
    config: &EdgeConfig,
) -> Result<(), ManagerProjectionCommandError> {
    if !config.manager_projection_rollback_authorized.is_enabled() {
        return Err(ManagerProjectionCommandError::RollbackNotAuthorized);
    }
    let failed_epoch_id = config
        .manager_projection_failed_epoch_id
        .ok_or(ManagerProjectionCommandError::MissingRollbackEpochs)?;
    let retained_epoch_id = config
        .manager_projection_retained_epoch_id
        .ok_or(ManagerProjectionCommandError::MissingRollbackEpochs)?;
    let database_path = config
        .projection_database_url_file
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingDatabaseUrl)?;
    let database_url = read_nonempty(database_path)?;
    let profile_id = config
        .manager_v2_profile_id
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingProfile)?;
    let profile = ManagerProjectionProfile::from_binding(&config.environment, profile_id)?;
    let scope = projection_core::ProjectionScope::new(
        execution_contracts::CanonicalId::parse("workspace_execution_manager")?,
        profile.environment(),
    )?;
    let store = PgProjectionStore::connect(database_url.trim()).await?;
    store.ping().await?;
    let rollback = store
        .rollback_manager_projection_epoch(&scope, failed_epoch_id, retained_epoch_id)
        .await?;
    let report = ManagerProjectionRollbackReport {
        schema_version: "portal.execution.manager-projection.rollback.v1",
        environment: profile.environment().to_owned(),
        restored_epoch_id: rollback.restored_epoch_id,
        failed_epoch_id: rollback.failed_epoch_id,
        restored_state_digest: rollback.restored_state_digest,
        completed_at: Utc::now(),
    };
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}

/// Polls forever at the configured bounded interval. Each cycle is a single
/// attempt; failures wait for the next interval and never create an immediate
/// retry storm against the Trading System.
///
/// # Errors
///
/// Rejects disabled or unsafe startup configuration before entering the loop.
pub async fn run_forever(config: &EdgeConfig) -> Result<(), ManagerProjectionCommandError> {
    if !config.manager_projection_enabled.is_enabled() {
        return Err(ManagerProjectionCommandError::ProjectionDisabled);
    }
    let mut interval = tokio::time::interval(config.manager_projection_poll_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        match run_once(config).await {
            Ok(report) => info!(
                environment = report.environment,
                epoch_id = %report.epoch_id,
                cycle_id = report.cycle_id,
                record_count = report.record_count,
                activated = report.activated,
                "N24 Manager projection cycle committed"
            ),
            Err(error) => warn!(error = %error, "N24 Manager projection cycle failed closed"),
        }
    }
}

async fn load_catalogue(
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
) -> Result<(ManagerCatalogue, String), ManagerProjectionCommandError> {
    match client.execute(&authority.catalogue_request()).await? {
        ManagerRead::Available(ManagerPayload::Catalogue(envelope)) => {
            authority.validate_catalogue(envelope.data())?;
            let digest = envelope.meta().catalogue_sha256().as_str().to_owned();
            let catalogue = envelope.into_data();
            if catalogue.catalogue_revision().as_str() != digest {
                return Err(ManagerProjectionCommandError::CycleMetadataDrift);
            }
            Ok((catalogue, digest))
        }
        ManagerRead::Available(_) => Err(ManagerProjectionCommandError::UnexpectedPayload),
        ManagerRead::Unavailable(_) => Err(ManagerProjectionCommandError::SourceUnavailable),
    }
}

async fn load_and_validate_capabilities(
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
    catalogue_digest: &str,
) -> Result<(), ManagerProjectionCommandError> {
    match client.execute(&authority.capabilities_request()).await? {
        ManagerRead::Available(ManagerPayload::Capabilities(envelope)) => {
            if envelope.meta().catalogue_sha256().as_str() != catalogue_digest {
                return Err(ManagerProjectionCommandError::CycleMetadataDrift);
            }
            authority.validate_capabilities(envelope.data())?;
            Ok(())
        }
        ManagerRead::Available(_) => Err(ManagerProjectionCommandError::UnexpectedPayload),
        ManagerRead::Unavailable(_) => Err(ManagerProjectionCommandError::SourceUnavailable),
    }
}

async fn load_cycle(
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
    catalogue: &ManagerCatalogue,
    profile: ManagerProjectionProfile,
    poll_interval_ms: i64,
) -> Result<ManagerProjectionCycle, ManagerProjectionCommandError> {
    if !(DEFAULT_POLL_INTERVAL_MS / 8..=60_000).contains(&poll_interval_ms) {
        return Err(ManagerProjectionCommandError::InvalidPollInterval);
    }
    let catalogue_digest = catalogue.catalogue_revision().as_str().to_owned();
    let mut feeds = Vec::with_capacity(FEEDS.len());
    let mut record_count = 0_usize;
    for feed in FEEDS {
        let remaining = MAXIMUM_CYCLE_RECORDS
            .checked_sub(record_count)
            .ok_or(ManagerProjectionCommandError::CycleBoundExceeded)?;
        let snapshot = load_feed(client, authority, catalogue, profile, feed, remaining).await?;
        record_count = record_count
            .checked_add(snapshot.facts.len())
            .filter(|count| *count <= MAXIMUM_CYCLE_RECORDS)
            .ok_or(ManagerProjectionCommandError::CycleBoundExceeded)?;
        feeds.push(snapshot);
    }
    Ok(ManagerProjectionCycle {
        profile,
        catalogue_digest,
        poll_interval_ms,
        feeds,
    })
}

async fn load_feed(
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
    catalogue: &ManagerCatalogue,
    profile: ManagerProjectionProfile,
    feed: ManagerProjectionFeed,
    remaining_cycle_records: usize,
) -> Result<ManagerFeedSnapshot, ManagerProjectionCommandError> {
    let mut cursor: Option<OpaqueCursor> = None;
    let mut seen_cursors = BTreeSet::new();
    let mut page_count = 0_usize;
    let mut facts = Vec::new();
    let mut first_meta: Option<ManagerMeta> = None;
    loop {
        page_count += 1;
        if page_count > MAXIMUM_FEED_PAGES {
            return Err(ManagerProjectionCommandError::PageBoundExceeded);
        }
        let request = match feed.source {
            ManagerProjectionSource::Named(kind) => authority.projection_request(
                catalogue,
                kind,
                cursor.as_ref(),
                PageLimit::new(PAGE_LIMIT)?,
            )?,
            ManagerProjectionSource::Relation(relation) => authority.relation_page_request(
                catalogue,
                relation,
                cursor.as_ref(),
                PageLimit::new(PAGE_LIMIT)?,
            )?,
        };
        let (meta, records, next) = page_result(client.execute(&request).await?, feed)?;
        // Capture the read boundary after the response so a complete current
        // snapshot never claims to have been observed before its source as_of.
        let source_read_at = Utc::now();
        validate_page_meta(first_meta.as_ref(), &meta, profile, catalogue)?;
        if first_meta.is_none() {
            first_meta = Some(meta.clone());
        }
        let next_count = facts
            .len()
            .checked_add(records.len())
            .ok_or(ManagerProjectionCommandError::FeedBoundExceeded)?;
        if next_count > MAXIMUM_FEED_RECORDS {
            return Err(ManagerProjectionCommandError::FeedBoundExceeded);
        }
        if next_count > remaining_cycle_records {
            return Err(ManagerProjectionCommandError::CycleBoundExceeded);
        }
        for record in &records {
            facts.push(ManagerProjectionFact::from_record(record)?);
        }
        let Some(next) = next else {
            return ManagerFeedSnapshot::from_manager_meta(
                feed,
                profile,
                first_meta
                    .as_ref()
                    .ok_or(ManagerProjectionCommandError::CycleMetadataDrift)?,
                source_read_at,
                page_count,
                facts,
            )
            .map_err(Into::into);
        };
        if !seen_cursors.insert(next.as_str().to_owned()) {
            return Err(ManagerProjectionCommandError::CursorCycle);
        }
        cursor = Some(next);
    }
}

fn page_result(
    read: ManagerRead,
    feed: ManagerProjectionFeed,
) -> Result<(ManagerMeta, Vec<ManagerRecord>, Option<OpaqueCursor>), ManagerProjectionCommandError>
{
    match (feed.source, read) {
        (
            ManagerProjectionSource::Named(expected),
            ManagerRead::Available(ManagerPayload::Projection(envelope)),
        ) => {
            if envelope.data().kind() != expected {
                return Err(ManagerProjectionCommandError::UnexpectedPayload);
            }
            let meta = envelope.meta().clone();
            let page = envelope.into_data();
            Ok((meta, page.items().to_vec(), page.next_cursor().cloned()))
        }
        (
            ManagerProjectionSource::Relation(expected),
            ManagerRead::Available(ManagerPayload::RelationRecords(envelope)),
        ) => {
            let actual = format!(
                "{}.{}",
                envelope.data().relation().schema(),
                envelope.data().relation().relation()
            );
            if actual != expected {
                return Err(ManagerProjectionCommandError::UnexpectedPayload);
            }
            let meta = envelope.meta().clone();
            let page = envelope.into_data();
            Ok((meta, page.items().to_vec(), page.next_cursor().cloned()))
        }
        (_, ManagerRead::Unavailable(_)) => Err(ManagerProjectionCommandError::SourceUnavailable),
        _ => Err(ManagerProjectionCommandError::UnexpectedPayload),
    }
}

fn validate_page_meta(
    first: Option<&ManagerMeta>,
    current: &ManagerMeta,
    profile: ManagerProjectionProfile,
    catalogue: &ManagerCatalogue,
) -> Result<(), ManagerProjectionCommandError> {
    if current.profile_id() != profile.profile_id()
        || current.catalogue_sha256() != catalogue.catalogue_revision()
        || current.completeness() != Completeness::Complete
        || first.is_some_and(|first| {
            first.profile_id() != current.profile_id()
                || first.catalogue_sha256() != current.catalogue_sha256()
                || first.as_of() != current.as_of()
                || first.completeness() != current.completeness()
        })
    {
        return Err(ManagerProjectionCommandError::CycleMetadataDrift);
    }
    Ok(())
}

async fn commit_cycle(
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    epoch_id: Uuid,
    proof: projection_store_pg::ManagerProjectionLeaseProof,
    cycle: &BuiltProjectionCycle,
) -> Result<(), ManagerProjectionCommandError> {
    let poll_interval_ms = cycle.poll_interval_ms;
    for snapshot in &cycle.snapshots {
        store
            .commit_manager_projection_snapshot(
                scope,
                epoch_id,
                proof,
                &ManagerSnapshotCommitInput {
                    cycle_id: cycle.cycle_id.clone(),
                    profile_id: cycle.profile.profile_id().to_owned(),
                    catalogue_digest: cycle.catalogue_digest.clone(),
                    source_input_digest: projection_core::canonical_digest(&snapshot.observations)?,
                    source_read_at: cycle.source_read_at,
                    poll_interval_ms,
                    snapshot: snapshot.clone(),
                },
                Utc::now(),
            )
            .await?;
    }
    Ok(())
}

fn read_nonempty(path: &std::path::Path) -> Result<String, ManagerProjectionCommandError> {
    String::from_utf8(read_nonempty_bytes(path)?)
        .map_err(|_| ManagerProjectionCommandError::InvalidFile)
}

fn read_nonempty_bytes(path: &std::path::Path) -> Result<Vec<u8>, ManagerProjectionCommandError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 1024 * 1024 {
        return Err(ManagerProjectionCommandError::InvalidFile);
    }
    Ok(fs::read(path)?)
}

#[derive(Debug, Error)]
pub enum ManagerProjectionCommandError {
    #[error("N24 Manager projection worker is disabled")]
    ProjectionDisabled,
    #[error("N24 Manager projection profile is missing")]
    MissingProfile,
    #[error("N24 Manager projection owner digest is missing")]
    MissingOwnerDigest,
    #[error("N24 projection database URL is missing")]
    MissingDatabaseUrl,
    #[error("N24 Manager projection mTLS identity is missing")]
    MissingClientIdentity,
    #[error("N24 Manager projection poll interval is invalid")]
    InvalidPollInterval,
    #[error("N24 Manager source returned typed unavailability")]
    SourceUnavailable,
    #[error("N24 Manager source returned an unexpected payload")]
    UnexpectedPayload,
    #[error("N24 Manager page metadata drifted within a cycle")]
    CycleMetadataDrift,
    #[error("N24 Manager pagination exceeded the bounded page limit")]
    PageBoundExceeded,
    #[error("N24 Manager feed exceeded the bounded record limit")]
    FeedBoundExceeded,
    #[error("N24 Manager cycle exceeded the bounded record limit")]
    CycleBoundExceeded,
    #[error("N24 Manager pagination cursor formed a cycle")]
    CursorCycle,
    #[error("N24 Manager same-identity rebuild was not explicitly authorized")]
    RebuildNotAuthorized,
    #[error("N24 Manager rollback was not explicitly authorized")]
    RollbackNotAuthorized,
    #[error("N24 Manager rollback epoch pair is missing")]
    MissingRollbackEpochs,
    #[error("N24 Manager projection input file is invalid")]
    InvalidFile,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Contract(#[from] execution_contracts::ContractError),
    #[error(transparent)]
    ManagerContract(#[from] manager_v2_contract::ContractError),
    #[error(transparent)]
    Client(#[from] ManagerV2ClientError),
    #[error(transparent)]
    Authority(#[from] AuthorityError),
    #[error(transparent)]
    Mapping(#[from] ProjectionMapError),
    #[error(transparent)]
    Projection(#[from] projection_core::ProjectionError),
    #[error(transparent)]
    Store(#[from] StoreError),
}
