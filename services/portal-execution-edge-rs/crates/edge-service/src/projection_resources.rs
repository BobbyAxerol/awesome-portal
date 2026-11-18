//! Explicit opt-in factory for versioned04/05 financial/P16/scoped workloads.
//! Legacy Manager APIs do not participate in that admission contract and must
//! never share its governed pool. No production budget or storage sample is
//! inferred, and no sampling task, migration, policy or listener is installed.

use std::{
    ffi::OsStr,
    fs::File,
    io::Read as _,
    path::{Path, PathBuf},
    sync::{Arc, Once},
    time::Duration,
};

use chrono::{DateTime, Utc};
use projection_core::resources::{
    EnvelopeLimits, ResourceEnvelope, ResourceError, StorageLimits, StorageObservation,
};
use projection_store_pg::PgProjectionStore;
use serde::{de::DeserializeOwned, Deserialize};

const CONFIG_ENV: &str = "EDGE_PROJECTION_RESOURCE_CONFIG_FILE";
const MAX_INPUT_BYTES: u64 = 65_536;

#[derive(Debug, thiserror::Error)]
pub enum ProjectionResourceError {
    #[error("PROJECTION_RESOURCE_CONFIG_REQUIRED")]
    Required,
    #[error("PROJECTION_RESOURCE_INPUT_INVALID")]
    Input,
    #[error("PROJECTION_RESOURCE_CONFIG_INVALID")]
    Invalid,
    #[error("PROJECTION_RESOURCE_LEGACY_WORKLOAD_MIX_DENIED")]
    LegacyWorkloadMix,
    #[error(transparent)]
    Resource(#[from] ResourceError),
    #[error(transparent)]
    Store(#[from] projection_store_pg::StoreError),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    schema_version: String,
    workload_scope: String,
    pool_max_connections: u32,
    max_active: usize,
    foreground_reserved: usize,
    foreground_reserved_entries: usize,
    foreground_reserved_bytes: usize,
    max_entries: usize,
    max_bytes: usize,
    storage_max_age_ms: u64,
    storage: StorageBudget,
    storage_observation_file: PathBuf,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StorageBudget {
    #[serde(rename = "soft_used_bytes")]
    soft_used: u64,
    #[serde(rename = "high_used_bytes")]
    high_used: u64,
    #[serde(rename = "hard_used_bytes")]
    hard_used: u64,
    #[serde(rename = "min_free_bytes")]
    min_free: u64,
    #[serde(rename = "max_backlog_bytes")]
    max_backlog: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation {
    schema_version: String,
    observed_at_ms: i64,
    used_bytes: u64,
    free_bytes: u64,
    backlog_bytes: u64,
}

/// Retain this handle beside the store/cache/hub to share one logical budget.
/// The owner must explicitly refresh its genuine storage observations; expiry
/// continues to fail writes closed. This handle is not a production monitor.
pub struct ProjectionResources {
    resources: Arc<ResourceEnvelope>,
    pool_max_connections: u32,
    storage: StorageLimits,
    observation_file: PathBuf,
}

impl ProjectionResources {
    /// # Errors
    /// Requires an explicit versioned resource configuration, never defaults.
    pub fn load_from_env() -> Result<Self, ProjectionResourceError> {
        let path = configured_path(std::env::var_os(CONFIG_ENV).as_deref())?
            .ok_or(ProjectionResourceError::Required)?;
        Self::load(&path)
    }

    /// # Errors
    /// Rejects unsafe/mixed bounds and missing, stale or fabricated defaults
    /// before any DB connection. File custody remains the commissioning owner's.
    pub fn load(path: &Path) -> Result<Self, ProjectionResourceError> {
        let config: Config = read_bounded(path)?;
        Self::from_config(config, Utc::now())
    }

    fn from_config(config: Config, now: DateTime<Utc>) -> Result<Self, ProjectionResourceError> {
        if config.schema_version != "execution.projection-resources.v1"
            || config.workload_scope != "VERSIONED_04_05_ONLY"
            || config.pool_max_connections == 0
            || config.pool_max_connections > 64
            || usize::try_from(config.pool_max_connections)
                .map_err(|_| ProjectionResourceError::Invalid)?
                < config.max_active
        {
            return Err(ProjectionResourceError::Invalid);
        }
        let resources = Arc::new(ResourceEnvelope::new(EnvelopeLimits {
            max_active: config.max_active,
            foreground_reserved: config.foreground_reserved,
            foreground_reserved_entries: config.foreground_reserved_entries,
            foreground_reserved_bytes: config.foreground_reserved_bytes,
            max_entries: config.max_entries,
            max_bytes: config.max_bytes,
            storage_max_age: Duration::from_millis(config.storage_max_age_ms),
        })?);
        let factory = Self {
            resources,
            pool_max_connections: config.pool_max_connections,
            storage: StorageLimits {
                soft_used_bytes: config.storage.soft_used,
                high_used_bytes: config.storage.high_used,
                hard_used_bytes: config.storage.hard_used,
                min_free_bytes: config.storage.min_free,
                max_backlog_bytes: config.storage.max_backlog,
            },
            observation_file: config.storage_observation_file,
        };
        factory.refresh_at(now)?;
        Ok(factory)
    }

    /// # Errors
    /// Storage observations and DB connectivity must remain available. Call
    /// only for participating versioned APIs, never legacy/domain-only traffic.
    pub async fn connect(
        &self,
        database_url: &str,
    ) -> Result<PgProjectionStore, ProjectionResourceError> {
        self.refresh_storage()?;
        Ok(PgProjectionStore::connect_with_resources(
            database_url,
            Arc::clone(&self.resources),
            self.pool_max_connections,
        )
        .await?)
    }

    #[must_use]
    pub fn resources(&self) -> &Arc<ResourceEnvelope> {
        &self.resources
    }

    /// # Errors
    /// A trusted owner drives refresh. Stale/future/regressing/conflicting
    /// samples fail closed; this never synthesizes a clock or disk observation.
    pub fn refresh_storage(&self) -> Result<(), ProjectionResourceError> {
        self.refresh_at(Utc::now())
    }

    fn refresh_at(&self, now: DateTime<Utc>) -> Result<(), ProjectionResourceError> {
        let sample: Observation = read_bounded(&self.observation_file)?;
        if sample.schema_version != "execution.projection-storage-observation.v1" {
            return Err(ProjectionResourceError::Invalid);
        }
        let observed_at = DateTime::from_timestamp_millis(sample.observed_at_ms)
            .ok_or(ProjectionResourceError::Invalid)?;
        let age = now
            .signed_duration_since(observed_at)
            .to_std()
            .map_err(|_| ResourceError::StorageStale)?;
        if age > self.resources.limits().storage_max_age {
            return Err(ResourceError::StorageStale.into());
        }
        self.resources.observe_storage(
            StorageObservation {
                observed_at,
                used_bytes: sample.used_bytes,
                free_bytes: sample.free_bytes,
                backlog_bytes: sample.backlog_bytes,
            },
            self.storage,
        )?;
        Ok(())
    }
}

/// Existing executable compatibility path. A governed config must never be
/// silently ignored or mixed with legacy APIs lacking per-method admission.
/// # Errors
/// Rejects any opt-in config BEFORE connecting; absent config keeps the old pool.
pub async fn connect_legacy(
    database_url: &str,
) -> Result<PgProjectionStore, ProjectionResourceError> {
    static REPORTED: Once = Once::new();
    validate_legacy_configuration()?;
    REPORTED.call_once(|| {
        tracing::warn!(
            projection_pool_mode = "LEGACY_UNGOVERNED",
            "legacy projection pool does not claim versioned04/05 resource governance"
        );
    });
    Ok(PgProjectionStore::connect(database_url).await?)
}

/// # Errors
/// Rejects a governed opt-in even when a legacy executable would otherwise
/// skip creating its projection pool, rather than silently ignoring the input.
pub fn validate_legacy_configuration() -> Result<(), ProjectionResourceError> {
    require_legacy(std::env::var_os(CONFIG_ENV).as_deref())
}

fn require_legacy(value: Option<&OsStr>) -> Result<(), ProjectionResourceError> {
    if configured_path(value)?.is_some() {
        return Err(ProjectionResourceError::LegacyWorkloadMix);
    }
    Ok(())
}

fn configured_path(value: Option<&OsStr>) -> Result<Option<PathBuf>, ProjectionResourceError> {
    value
        .map(|value| {
            let text = value.to_str().ok_or(ProjectionResourceError::Input)?;
            if text.is_empty() || text.trim() != text || !Path::new(text).is_absolute() {
                return Err(ProjectionResourceError::Input);
            }
            Ok(PathBuf::from(text))
        })
        .transpose()
}

fn read_bounded<T: DeserializeOwned>(path: &Path) -> Result<T, ProjectionResourceError> {
    if !path.is_absolute() {
        return Err(ProjectionResourceError::Input);
    }
    let metadata = std::fs::symlink_metadata(path).map_err(|_| ProjectionResourceError::Input)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_INPUT_BYTES {
        return Err(ProjectionResourceError::Input);
    }
    let file = File::open(path).map_err(|_| ProjectionResourceError::Input)?;
    if !file
        .metadata()
        .map_err(|_| ProjectionResourceError::Input)?
        .is_file()
    {
        return Err(ProjectionResourceError::Input);
    }
    let mut bytes = Vec::new();
    file.take(MAX_INPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ProjectionResourceError::Input)?;
    if bytes.is_empty()
        || bytes.len() > usize::try_from(MAX_INPUT_BYTES).expect("fixed input bound")
    {
        return Err(ProjectionResourceError::Input);
    }
    serde_json::from_slice(&bytes).map_err(|_| ProjectionResourceError::Invalid)
}

#[cfg(test)]
mod tests;
