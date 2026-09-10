use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    time::Duration,
};

use chrono::{DateTime, Utc};
use manager_compat_authority::{
    AuthorityError, BoundManagerAuthority, DeploymentEnvironment, ManagerCompatibilityAuthority,
    ManagerRequestContext, DELEGATED_RESOURCE,
};
use manager_projection::{
    BuiltProjectionCycle, FeedClass, ManagerFeedSnapshot, ManagerProjectionCycle,
    ManagerProjectionFact, ManagerProjectionFeed, ManagerProjectionProfile,
    ManagerProjectionSource, ProjectionMapError, FEEDS, MANAGER_PROJECTION_ADAPTER_VERSION,
    MAXIMUM_CYCLE_RECORDS, MAXIMUM_FEED_PAGES, MAXIMUM_FEED_RECORDS,
};
use manager_v2_client::{ManagerV2Client, ManagerV2ClientConfig, ManagerV2ClientError};
use manager_v2_contract::{
    Completeness, ManagerCatalogue, ManagerMeta, ManagerPayload, ManagerRead, ManagerRecord,
    ManagerV2Request, OpaqueCursor, PageLimit, RUNTIME_CONTRACT_REVISION,
};
use projection_core::ProjectionEpochStatus;
use projection_store_pg::{
    manager_snapshot_semantic_digest, EpochMetadata, ManagerCycleCommitInput,
    ManagerProjectionLeaseAcquireOutcome, ManagerSnapshotCommitInput, PgProjectionStore,
    SourceAdmissionOutcome, SourceAdmissionRequest, StoreError,
};
use serde::Serialize;
use thiserror::Error;
use tracing::{info, warn};
use uuid::Uuid;

use super::EdgeConfig;

const PAGE_LIMIT: u16 = 200;
const BASE_LEASE_TTL_SECONDS: u64 = 60;
const LEASE_TTL_STEP_SECONDS: u64 = 30;
const LEASE_TTL_RECORD_STEP: usize = 2_000;
const MAXIMUM_LEASE_TTL_SECONDS: u64 = 900;
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

/// Outcome used only by the long-running scheduler. The JSON/CLI receipt is
/// deliberately unchanged; this carries the refresh selection needed to set
/// the independent cadence timers truthfully after a successful commit.
#[derive(Debug)]
struct ProjectionCycleAttempt {
    report: ManagerProjectionRunReport,
    refreshed_classes: Vec<FeedClass>,
}

/// In-memory, complete-feed cache for the P4-E cadence ladder. It is never an
/// authority on its own: cold start or catalogue revision drift forces one
/// complete source read before any partial-class refresh can commit.
#[derive(Debug, Clone, Default)]
struct ManagerProjectionFeedCache {
    feeds: BTreeMap<&'static str, ManagerFeedSnapshot>,
}

impl ManagerProjectionFeedCache {
    fn matches_catalogue(&self, profile: ManagerProjectionProfile, catalogue_digest: &str) -> bool {
        self.feeds.len() == FEEDS.len()
            && FEEDS.iter().all(|expected| {
                self.feeds.get(expected.feed_id).is_some_and(|snapshot| {
                    snapshot.feed == *expected
                        && snapshot.profile == profile
                        && snapshot.catalogue_digest == catalogue_digest
                })
            })
    }

    fn with_refreshed(
        &self,
        profile: ManagerProjectionProfile,
        catalogue_digest: &str,
        refreshed: Vec<ManagerFeedSnapshot>,
    ) -> Result<Self, ManagerProjectionCommandError> {
        let mut next = self.clone();
        for snapshot in refreshed {
            if !FEEDS.contains(&snapshot.feed)
                || snapshot.profile != profile
                || snapshot.catalogue_digest != catalogue_digest
            {
                return Err(ManagerProjectionCommandError::CycleMetadataDrift);
            }
            next.feeds.insert(snapshot.feed.feed_id, snapshot);
        }
        Ok(next)
    }

    fn complete_cycle(
        &self,
        profile: ManagerProjectionProfile,
        catalogue_digest: &str,
        fastest_interval: Duration,
    ) -> Result<ManagerProjectionCycle, ManagerProjectionCommandError> {
        if !self.matches_catalogue(profile, catalogue_digest) {
            return Err(ManagerProjectionCommandError::ProjectionCacheIncomplete);
        }
        let feeds = FEEDS
            .iter()
            .map(|feed| {
                self.feeds
                    .get(feed.feed_id)
                    .cloned()
                    .ok_or(ManagerProjectionCommandError::ProjectionCacheIncomplete)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ManagerProjectionCycle {
            profile,
            catalogue_digest: catalogue_digest.to_owned(),
            poll_interval_ms: i64::try_from(fastest_interval.as_millis())
                .map_err(|_| ManagerProjectionCommandError::InvalidPollInterval)?,
            feeds,
        })
    }
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
    let mut cache = ManagerProjectionFeedCache::default();
    Ok(run_once_mode(config, false, &FeedClass::ALL, &mut cache)
        .await?
        .report)
}

#[allow(clippy::too_many_lines)] // One bounded cycle keeps source-to-cutover ordering auditable.
async fn run_once_mode(
    config: &EdgeConfig,
    force_rebuild: bool,
    requested_classes: &[FeedClass],
    feed_cache: &mut ManagerProjectionFeedCache,
) -> Result<ProjectionCycleAttempt, ManagerProjectionCommandError> {
    if !config.manager_projection_enabled.is_enabled() {
        return Err(ManagerProjectionCommandError::ProjectionDisabled);
    }
    let requested_classes = normalized_classes(requested_classes);
    if requested_classes.is_empty() {
        return Err(ManagerProjectionCommandError::NoFeedClassesRequested);
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
    let store = PgProjectionStore::connect(database_url.trim()).await?;
    store.ping().await?;
    let (catalogue, catalogue_digest) =
        load_catalogue(&store, config, owner_digest, &client, bound).await?;
    load_and_validate_capabilities(
        &store,
        config,
        owner_digest,
        &client,
        bound,
        &catalogue_digest,
    )
    .await?;
    // A catalogue revision invalidates the complete cache atomically. The
    // first cycle under a new revision is therefore a full source baseline,
    // not a mixture of old and new contract metadata.
    let refreshed_classes =
        if force_rebuild || !feed_cache.matches_catalogue(profile, &catalogue_digest) {
            FeedClass::ALL.to_vec()
        } else {
            requested_classes
        };
    let refreshed_feeds = load_feeds(
        &store,
        config,
        owner_digest,
        &client,
        bound,
        &catalogue,
        profile,
        &refreshed_classes,
        config.manager_projection_class_intervals,
    )
    .await?;
    // Only install the updated cache after the complete candidate has passed
    // projection persistence/lease validation. A failure leaves the last
    // complete state intact and cannot publish a partial class as truth.
    let candidate_cache = feed_cache.with_refreshed(profile, &catalogue_digest, refreshed_feeds)?;
    let cycle = candidate_cache
        .complete_cycle(
            profile,
            &catalogue_digest,
            config.manager_projection_class_intervals.fastest(),
        )?
        .build()?;

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
    let lease_ttl = manager_projection_lease_ttl(cycle.record_count);
    let lease = match store
        .acquire_manager_projection_lease(
            &scope,
            epoch.epoch_id,
            Uuid::now_v7(),
            owner_digest,
            lease_ttl,
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
    *feed_cache = candidate_cache;
    Ok(ProjectionCycleAttempt {
        report: ManagerProjectionRunReport {
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
        },
        refreshed_classes,
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
    let mut cache = ManagerProjectionFeedCache::default();
    let report = run_once_mode(config, true, &FeedClass::ALL, &mut cache)
        .await?
        .report;
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

/// P4-E cadence configuration. Equal class intervals collapse into one source
/// cycle, preserving the legacy one-cycle behavior when configuration is left
/// unset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagerProjectionClassIntervals {
    pub transactional: Duration,
    pub account_state: Duration,
    pub metadata: Duration,
}

impl ManagerProjectionClassIntervals {
    #[must_use]
    pub fn of(self, class: FeedClass) -> Duration {
        match class {
            FeedClass::Transactional => self.transactional,
            FeedClass::AccountState => self.account_state,
            FeedClass::Metadata => self.metadata,
        }
    }

    /// Classes at the same cadence share one source/persistence attempt.
    #[must_use]
    pub fn groups(self) -> Vec<(Duration, Vec<FeedClass>)> {
        let mut groups: Vec<(Duration, Vec<FeedClass>)> = Vec::new();
        for class in FeedClass::ALL {
            let interval = self.of(class);
            if let Some((_, classes)) = groups
                .iter_mut()
                .find(|(current_interval, _)| *current_interval == interval)
            {
                classes.push(class);
            } else {
                groups.push((interval, vec![class]));
            }
        }
        groups
    }

    #[must_use]
    pub fn fastest(self) -> Duration {
        self.transactional
            .min(self.account_state)
            .min(self.metadata)
    }
}

/// Returns indices whose group interval has elapsed. Kept pure for scheduler
/// tests; an absent last-run is represented by `Duration::MAX` and is due.
#[must_use]
pub fn due_groups(groups: &[(Duration, Vec<FeedClass>)], elapsed: &[Duration]) -> Vec<usize> {
    groups
        .iter()
        .enumerate()
        .filter(|(index, (interval, _))| elapsed.get(*index).is_some_and(|age| *age >= *interval))
        .map(|(index, _)| index)
        .collect()
}

fn normalized_classes(classes: &[FeedClass]) -> Vec<FeedClass> {
    FeedClass::ALL
        .into_iter()
        .filter(|class| classes.contains(class))
        .collect()
}

/// Polls forever with independent bounded cadence classes. Every commit still
/// contains all feeds: fresh class data is joined with an in-memory complete
/// baseline, and a cold start/catalogue change reloads all feeds atomically.
/// Failures retain the last complete projection and wait for their next due
/// tick; no browser or source retry loop is created here.
///
/// # Errors
///
/// Rejects disabled or unsafe startup configuration before entering the loop.
pub async fn run_forever(config: &EdgeConfig) -> Result<(), ManagerProjectionCommandError> {
    if !config.manager_projection_enabled.is_enabled() {
        return Err(ManagerProjectionCommandError::ProjectionDisabled);
    }
    let class_groups = config.manager_projection_class_intervals.groups();
    let mut cache = ManagerProjectionFeedCache::default();
    let mut interval = tokio::time::interval(config.manager_projection_class_intervals.fastest());
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_run: Vec<Option<tokio::time::Instant>> = vec![None; class_groups.len()];
    loop {
        interval.tick().await;
        let now = tokio::time::Instant::now();
        let elapsed = last_run
            .iter()
            .map(|previous| previous.map_or(Duration::MAX, |at| now.duration_since(at)))
            .collect::<Vec<_>>();
        let due = due_groups(&class_groups, &elapsed);
        if due.is_empty() {
            continue;
        }
        let requested_classes = due
            .iter()
            .flat_map(|index| class_groups[*index].1.iter().copied())
            .collect::<Vec<_>>();
        match run_once_mode(config, false, &requested_classes, &mut cache).await {
            Ok(attempt) => {
                let ProjectionCycleAttempt {
                    report,
                    refreshed_classes,
                } = attempt;
                for (index, (_, classes)) in class_groups.iter().enumerate() {
                    if classes
                        .iter()
                        .all(|class| refreshed_classes.contains(class))
                    {
                        last_run[index] = Some(now);
                    }
                }
                info!(
                    environment = report.environment,
                    epoch_id = %report.epoch_id,
                    cycle_id = report.cycle_id,
                    record_count = report.record_count,
                    activated = report.activated,
                    classes = ?refreshed_classes,
                    "N24 Manager projection cadence cycle committed"
                );
            }
            Err(error) => {
                // Only the groups attempted on this tick are deferred. A
                // failed account-state poll cannot slow the transactional
                // class, and each class still has a bounded retry cadence.
                for index in due {
                    last_run[index] = Some(now);
                }
                warn!(error = %error, "N24 Manager projection cadence cycle failed closed");
            }
        }
    }
}

async fn load_catalogue(
    store: &PgProjectionStore,
    config: &EdgeConfig,
    owner_digest: &str,
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
) -> Result<(ManagerCatalogue, String), ManagerProjectionCommandError> {
    match admitted_projection_execute(
        store,
        config,
        owner_digest,
        client,
        &authority.catalogue_request(),
    )
    .await?
    {
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
    store: &PgProjectionStore,
    config: &EdgeConfig,
    owner_digest: &str,
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
    catalogue_digest: &str,
) -> Result<(), ManagerProjectionCommandError> {
    match admitted_projection_execute(
        store,
        config,
        owner_digest,
        client,
        &authority.capabilities_request(),
    )
    .await?
    {
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

#[allow(clippy::too_many_arguments)] // Keep every immutable source/admission binding explicit.
async fn load_feeds(
    store: &PgProjectionStore,
    config: &EdgeConfig,
    owner_digest: &str,
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
    catalogue: &ManagerCatalogue,
    profile: ManagerProjectionProfile,
    classes: &[FeedClass],
    class_intervals: ManagerProjectionClassIntervals,
) -> Result<Vec<ManagerFeedSnapshot>, ManagerProjectionCommandError> {
    if classes.is_empty() {
        return Err(ManagerProjectionCommandError::NoFeedClassesRequested);
    }
    let mut feeds = Vec::with_capacity(FEEDS.len());
    let mut record_count = 0_usize;
    for feed in FEEDS.iter().filter(|feed| classes.contains(&feed.class)) {
        let remaining = MAXIMUM_CYCLE_RECORDS
            .checked_sub(record_count)
            .ok_or(ManagerProjectionCommandError::CycleBoundExceeded)?;
        let snapshot = load_feed(
            store,
            config,
            owner_digest,
            client,
            authority,
            catalogue,
            profile,
            *feed,
            i64::try_from(class_intervals.of(feed.class).as_millis())
                .map_err(|_| ManagerProjectionCommandError::InvalidPollInterval)?,
            remaining,
        )
        .await?;
        record_count = record_count
            .checked_add(snapshot.facts.len())
            .filter(|count| *count <= MAXIMUM_CYCLE_RECORDS)
            .ok_or(ManagerProjectionCommandError::CycleBoundExceeded)?;
        feeds.push(snapshot);
    }
    Ok(feeds)
}

#[allow(clippy::too_many_arguments)] // Feed collection shares the exact cycle bindings above.
async fn load_feed(
    store: &PgProjectionStore,
    config: &EdgeConfig,
    owner_digest: &str,
    client: &ManagerV2Client,
    authority: BoundManagerAuthority<'_>,
    catalogue: &ManagerCatalogue,
    profile: ManagerProjectionProfile,
    feed: ManagerProjectionFeed,
    poll_interval_ms: i64,
    remaining_cycle_records: usize,
) -> Result<ManagerFeedSnapshot, ManagerProjectionCommandError> {
    let mut cursor: Option<OpaqueCursor> = None;
    let mut seen_cursors = BTreeSet::new();
    let mut page_count = 0_usize;
    let mut facts = Vec::new();
    let mut previous_meta: Option<ManagerMeta> = None;
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
        let (meta, records, next) = page_result(
            admitted_projection_execute(store, config, owner_digest, client, &request).await?,
            feed,
        )?;
        // Capture the read boundary after the response so a complete current
        // snapshot never claims to have been observed before its source as_of.
        let source_read_at = Utc::now();
        validate_page_meta(
            previous_meta.as_ref(),
            &meta,
            next.is_some(),
            profile,
            catalogue,
        )?;
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
            let relation = catalogue
                .relation(record.relation().schema(), record.relation().relation())
                .ok_or(ManagerProjectionCommandError::CatalogueDrift)?;
            facts.push(ManagerProjectionFact::from_record(record, relation)?);
        }
        let Some(next) = next else {
            return ManagerFeedSnapshot::from_manager_meta(
                feed,
                profile,
                &meta,
                source_read_at,
                poll_interval_ms,
                page_count,
                facts,
            )
            .map_err(Into::into);
        };
        if !seen_cursors.insert(next.as_str().to_owned()) {
            return Err(ManagerProjectionCommandError::CursorCycle);
        }
        previous_meta = Some(meta);
        cursor = Some(next);
    }
}

/// Routes every projection source call through the same `PostgreSQL` authority
/// used by the serving Edge. This keeps finite and long-running workers inside
/// the profile-wide Source Proxy budget instead of relying on an HTTP 429 as
/// flow control. A denied permit fails the cycle without retrying the source.
async fn admitted_projection_execute(
    store: &PgProjectionStore,
    config: &EdgeConfig,
    owner_digest: &str,
    client: &ManagerV2Client,
    request: &ManagerV2Request,
) -> Result<ManagerRead, ManagerProjectionCommandError> {
    let profile_id = config
        .manager_v2_profile_id
        .as_deref()
        .ok_or(ManagerProjectionCommandError::MissingProfile)?;
    let admission = store
        .acquire_source_admission(&SourceAdmissionRequest {
            source_id: "manager-v2".to_owned(),
            profile_id: profile_id.to_owned(),
            owner_id: format!("projection:{owner_digest}:{}", Uuid::now_v7()),
            maximum_requests_per_second: config.manager_shared_admission_maximum_rps,
            maximum_concurrency: config.manager_shared_admission_maximum_concurrency,
            maximum_wait: config.manager_shared_admission_maximum_wait,
            lease_ttl: config.manager_shared_admission_lease_ttl,
        })
        .await?;
    let lease = match admission {
        SourceAdmissionOutcome::Accepted(lease) => lease,
        SourceAdmissionOutcome::Denied(_) => {
            return Err(ManagerProjectionCommandError::SourceAdmissionDenied);
        }
    };
    if !lease.wait.is_zero() {
        tokio::time::sleep(lease.wait).await;
    }
    let result = client.execute(request).await;
    store.release_source_admission(&lease).await?;
    result.map_err(Into::into)
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
    previous: Option<&ManagerMeta>,
    current: &ManagerMeta,
    has_next: bool,
    profile: ManagerProjectionProfile,
    catalogue: &ManagerCatalogue,
) -> Result<(), ManagerProjectionCommandError> {
    if current.profile_id() != profile.profile_id()
        || current.catalogue_sha256() != catalogue.catalogue_revision()
        || !valid_page_shape(
            previous.map(ManagerMeta::as_of),
            current.as_of(),
            current.completeness(),
            has_next,
        )
        || previous.is_some_and(|previous| {
            previous.profile_id() != current.profile_id()
                || previous.catalogue_sha256() != current.catalogue_sha256()
        })
    {
        return Err(ManagerProjectionCommandError::CycleMetadataDrift);
    }
    Ok(())
}

fn valid_page_shape(
    previous_as_of: Option<DateTime<Utc>>,
    current_as_of: DateTime<Utc>,
    completeness: Completeness,
    has_next: bool,
) -> bool {
    previous_as_of.is_none_or(|previous| current_as_of >= previous)
        && matches!(
            (has_next, completeness),
            (true, Completeness::Partial) | (false, Completeness::Complete)
        )
}

async fn commit_cycle(
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    epoch_id: Uuid,
    proof: projection_store_pg::ManagerProjectionLeaseProof,
    cycle: &BuiltProjectionCycle,
) -> Result<(), ManagerProjectionCommandError> {
    for snapshot in &cycle.snapshots {
        let poll_interval_ms = *cycle
            .snapshot_poll_intervals
            .get(&snapshot.entity_kind)
            .ok_or(ManagerProjectionCommandError::InvalidPollInterval)?;
        let source_read_at = *cycle
            .snapshot_source_read_ats
            .get(&snapshot.entity_kind)
            .ok_or(ManagerProjectionCommandError::ProjectionCacheIncomplete)?;
        store
            .commit_manager_projection_snapshot(
                scope,
                epoch_id,
                proof,
                &ManagerSnapshotCommitInput {
                    cycle_id: cycle.cycle_id.clone(),
                    profile_id: cycle.profile.profile_id().to_owned(),
                    catalogue_digest: cycle.catalogue_digest.clone(),
                    source_input_digest: manager_snapshot_semantic_digest(&snapshot.observations)?,
                    source_read_at,
                    poll_interval_ms,
                    snapshot: snapshot.clone(),
                },
                Utc::now(),
            )
            .await?;
    }
    Ok(())
}

fn manager_projection_lease_ttl(record_count: usize) -> Duration {
    let additional_steps = record_count.saturating_sub(1) / LEASE_TTL_RECORD_STEP;
    let additional_seconds = u64::try_from(additional_steps)
        .unwrap_or(u64::MAX)
        .saturating_mul(LEASE_TTL_STEP_SECONDS);
    Duration::from_secs(
        BASE_LEASE_TTL_SECONDS
            .saturating_add(additional_seconds)
            .min(MAXIMUM_LEASE_TTL_SECONDS),
    )
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
    #[error("N24 Manager projection cadence request selected no feed class")]
    NoFeedClassesRequested,
    #[error("N24 Manager projection cadence cache is not a complete current baseline")]
    ProjectionCacheIncomplete,
    #[error("N24 Manager source returned typed unavailability")]
    SourceUnavailable,
    #[error("N24 Manager source admission budget denied the finite request")]
    SourceAdmissionDenied,
    #[error("N24 Manager source returned an unexpected payload")]
    UnexpectedPayload,
    #[error("N24 Manager page metadata drifted within a cycle")]
    CycleMetadataDrift,
    #[error("N24 Manager catalogue no longer contains a record relation")]
    CatalogueDrift,
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone as _;

    fn at(second: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, second)
            .single()
            .unwrap()
    }

    #[test]
    fn current_source_page_shape_accepts_partial_then_complete() {
        assert!(valid_page_shape(None, at(1), Completeness::Partial, true));
        assert!(valid_page_shape(
            Some(at(1)),
            at(2),
            Completeness::Partial,
            true
        ));
        assert!(valid_page_shape(
            Some(at(2)),
            at(3),
            Completeness::Complete,
            false
        ));
        assert!(valid_page_shape(None, at(1), Completeness::Complete, false));
    }

    #[test]
    fn current_source_page_shape_rejects_drift_and_false_completion() {
        assert!(!valid_page_shape(
            Some(at(2)),
            at(1),
            Completeness::Partial,
            true
        ));
        assert!(!valid_page_shape(None, at(1), Completeness::Complete, true));
        assert!(!valid_page_shape(None, at(1), Completeness::Partial, false));
        assert!(!valid_page_shape(None, at(1), Completeness::Unknown, false));
    }

    #[test]
    fn lease_ttl_scales_with_bounded_snapshot_work() {
        assert_eq!(manager_projection_lease_ttl(0), Duration::from_secs(60));
        assert_eq!(manager_projection_lease_ttl(2_000), Duration::from_secs(60));
        assert_eq!(
            manager_projection_lease_ttl(8_797),
            Duration::from_secs(180)
        );
        assert_eq!(
            manager_projection_lease_ttl(80_000),
            Duration::from_secs(900)
        );
    }

    fn empty_feed_snapshot(
        feed: ManagerProjectionFeed,
        profile: ManagerProjectionProfile,
        catalogue_digest: &str,
        source_read_at: DateTime<Utc>,
        poll_interval_ms: i64,
    ) -> ManagerFeedSnapshot {
        ManagerFeedSnapshot {
            feed,
            profile,
            catalogue_digest: catalogue_digest.to_owned(),
            as_of: at(1),
            source_read_at,
            poll_interval_ms,
            completeness: Completeness::Complete,
            page_count: 1,
            facts: Vec::new(),
        }
    }

    fn complete_cache(
        profile: ManagerProjectionProfile,
        catalogue_digest: &str,
    ) -> ManagerProjectionFeedCache {
        ManagerProjectionFeedCache {
            feeds: FEEDS
                .iter()
                .map(|feed| {
                    (
                        feed.feed_id,
                        empty_feed_snapshot(*feed, profile, catalogue_digest, at(2), 2_000),
                    )
                })
                .collect(),
        }
    }

    #[test]
    fn equal_class_intervals_collapse_to_the_legacy_single_cycle() {
        let intervals = ManagerProjectionClassIntervals {
            transactional: Duration::from_millis(2_000),
            account_state: Duration::from_millis(2_000),
            metadata: Duration::from_millis(2_000),
        };
        let groups = intervals.groups();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].0, Duration::from_millis(2_000));
        assert_eq!(groups[0].1, FeedClass::ALL);
        assert_eq!(intervals.fastest(), Duration::from_millis(2_000));
    }

    #[test]
    fn distinct_class_intervals_only_make_due_groups_eligible() {
        let intervals = ManagerProjectionClassIntervals {
            transactional: Duration::from_millis(1_000),
            account_state: Duration::from_millis(10_000),
            metadata: Duration::from_millis(60_000),
        };
        let groups = intervals.groups();
        assert_eq!(groups.len(), 3);
        assert_eq!(
            due_groups(
                &groups,
                &[
                    Duration::from_millis(10_000),
                    Duration::from_millis(10_000),
                    Duration::from_millis(10_000),
                ],
            ),
            vec![0, 1]
        );
    }

    #[test]
    fn never_run_groups_are_due_for_the_complete_cold_baseline() {
        let intervals = ManagerProjectionClassIntervals {
            transactional: Duration::from_millis(1_000),
            account_state: Duration::from_millis(5_000),
            metadata: Duration::from_millis(30_000),
        };
        let groups = intervals.groups();

        assert_eq!(
            due_groups(&groups, &vec![Duration::MAX; groups.len()]),
            vec![0, 1, 2]
        );
    }

    #[test]
    fn cache_requires_a_full_baseline_and_preserves_sibling_feeds() {
        let profile = ManagerProjectionProfile::Paper;
        let digest = format!("sha256:{}", "a".repeat(64));
        let empty = ManagerProjectionFeedCache::default();
        assert!(matches!(
            empty.complete_cycle(profile, &digest, Duration::from_millis(1_000)),
            Err(ManagerProjectionCommandError::ProjectionCacheIncomplete)
        ));

        let baseline = complete_cache(profile, &digest);
        let changed = empty_feed_snapshot(FEEDS[0], profile, &digest, at(20), 1_000);
        let next = baseline
            .with_refreshed(profile, &digest, vec![changed])
            .expect("valid partial refresh preserves complete cache");
        let cycle = next
            .complete_cycle(profile, &digest, Duration::from_millis(1_000))
            .expect("still a complete candidate cycle");

        assert_eq!(cycle.feeds.len(), FEEDS.len());
        assert_eq!(cycle.feeds[0].source_read_at, at(20));
        assert_eq!(cycle.feeds[1].source_read_at, at(2));
        assert!(next.matches_catalogue(profile, &digest));
        assert!(!next.matches_catalogue(profile, &format!("sha256:{}", "b".repeat(64))));
    }
}
