//! Owner-windowed, one-shot D4 Paper-read qualification commands.
//!
//! These commands are deliberately separate from the long-running Edge HTTP
//! server. They can prepare or write only one caller-declared `BUILDING`
//! epoch; no query, analytics, SSE, command or activation authority exists in
//! this module.

use std::{
    env, fs,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::CanonicalId;
use paper_source_ingestor::D4_MAPPER_VERSION;
use paper_source_runner::{D4QualificationRunConfig, D4QualificationRunner, RunnerError};
use paper_source_transport::{
    PaperSourceClient, PaperSourceTransportConfig, PaperTransportError, PaperTransportLimits,
};
use projection_core::ProjectionScope;
use projection_store_pg::{D4CommitOutcome, EpochMetadata, PgProjectionStore, StoreError};
use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;

const PREPARE_REPORT_SCHEMA: &str = "portal.execution.d4.prepare-building.v1";
const INPUT_VERSION: &str = "portal.execution-d4.owner-input.v2";
const SOURCE_SCOPE: &str = "PAPER_BINANCE_USDM";
const SOURCE_CONTRACT: &str = "d4.paper-read.v1";
const MAXIMUM_FILE_BYTES: u64 = 1024 * 1024;
const WINDOW_SHUTDOWN_MARGIN: Duration = Duration::from_secs(10);

const REQUIRED_TRUE: &[&str] = &[
    "D4_AUTHORIZED",
    "SOURCE_IDENTITY_DEDICATED",
    "SOURCE_IDENTITY_READ_ONLY",
    "SOURCE_MISSING_CREDENTIAL_REJECTED",
    "SOURCE_WRONG_CREDENTIAL_REJECTED",
    "SOURCE_REVOKED_CREDENTIAL_REJECTED",
    "SOURCE_MUTATION_METHODS_DENIED",
    "SOURCE_RUNTIME_LOOPBACK_ONLY",
    "SOURCE_PROXY_SECRET_DELIVERED",
    "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
    "PROJECTION_STORAGE_ENCRYPTED",
    "PROJECTION_STORAGE_APPROVED",
];

const REQUIRED_FALSE: &[&str] = &[
    "D4_EVIDENCE_ACCEPTED",
    "ACTIVATION_AUTHORIZED",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_TRADING_SYSTEM_CHANGES",
];

const REQUIRED_DIGESTS: &[&str] = &[
    "DEDICATED_PAPER_READ_IDENTITY_ID_SHA256",
    "SOURCE_EXACT_GET_ROUTES_SHA256",
    "SOURCE_OPENAPI_SHA256",
    "SOURCE_FACADE_IMAGE_DIGEST",
    "SOURCE_GUIDE_SHA256",
    "SOURCE_TEST_EVIDENCE_SHA256",
    "SOURCE_RUNTIME_ACCEPTANCE_SHA256",
    "CAPABILITY_SNAPSHOT_SHA256",
    "EVENT_CURSOR_CONTRACT_SHA256",
    "EVENT_COMPLETENESS_CONTRACT_SHA256",
    "RESYNC_CONTRACT_SHA256",
    "MAPPER_ARTIFACT_SHA256",
    "SEALED_CORPUS_SHA256",
    "PROJECTION_STORAGE_EVIDENCE_SHA256",
    "PROJECTION_BACKUP_RESTORE_EVIDENCE_SHA256",
    "EDGE_D4_AUTHORIZATION_EVIDENCE_SHA256",
];

struct D4RuntimeConfig {
    scope: ProjectionScope,
    epoch_id: Uuid,
    epoch_created_at: DateTime<Utc>,
    epoch_metadata: EpochMetadata,
    database_url_file: PathBuf,
    source_origin: String,
    source_ca_file: PathBuf,
    source_client_identity_file: PathBuf,
    runner: D4QualificationRunConfig,
}

impl D4RuntimeConfig {
    fn from_environment(now: DateTime<Utc>) -> Result<Self, D4ConfigError> {
        Self::from_lookup(now, &|name| env::var(name).ok())
    }

    #[allow(clippy::too_many_lines)]
    fn from_lookup<F>(now: DateTime<Utc>, lookup: &F) -> Result<Self, D4ConfigError>
    where
        F: Fn(&str) -> Option<String>,
    {
        require_equal(lookup, "INPUT_VERSION", INPUT_VERSION)?;
        require_equal(lookup, "D2_STATUS", "D2_DARK_ACCEPTED")?;
        require_equal(lookup, "D3_STATUS", "D3_TRANSPORT_ACCEPTED")?;
        require_equal(lookup, "SOURCE_AUTH_CONTRACT_REVISION", SOURCE_CONTRACT)?;
        require_equal(lookup, "SOURCE_SCOPE", SOURCE_SCOPE)?;
        require_equal(lookup, "SOURCE_ENVIRONMENT", "paper")?;
        require_equal(lookup, "SOURCE_VENUE", "BINANCE")?;
        require_equal(lookup, "SOURCE_PAGE_SIZE", "250")?;
        require_equal(lookup, "SOURCE_RESPONSE_MAX_BYTES", "1048576")?;
        require_equal(lookup, "SOURCE_RATE_LIMIT_RPM", "120")?;
        require_equal(lookup, "SOURCE_SNAPSHOT_TTL_SECONDS", "300")?;
        require_equal(lookup, "SOURCE_SNAPSHOT_MAX_ROWS", "10000")?;
        require_equal(lookup, "SOURCE_RETAINED_EVENTS", "10000")?;
        require_equal(lookup, "BUILDING_EPOCH_STATUS", "BUILDING")?;
        require_equal(lookup, "REGISTRY_DELIVERY_PROFILE", "fixture")?;
        for name in REQUIRED_TRUE {
            require_equal(lookup, name, "true")?;
        }
        for name in REQUIRED_FALSE {
            require_equal(lookup, name, "false")?;
        }
        for name in REQUIRED_DIGESTS {
            require_digest(lookup, name)?;
        }
        for name in [
            "OWNER",
            "SOURCE_OWNER",
            "ROLLBACK_OWNER",
            "BACKUP_OWNER",
            "OBSERVABILITY_OWNER",
        ] {
            let _ = required(lookup, name)?;
        }

        let deployment_commit = required(lookup, "DEPLOYMENT_COMMIT")?;
        if !is_commit(&deployment_commit) {
            return Err(D4ConfigError::Invalid("DEPLOYMENT_COMMIT"));
        }
        require_equal(lookup, "MAPPER_SOURCE_COMMIT", &deployment_commit)?;
        for name in [
            "SOURCE_IMPLEMENTATION_COMMIT",
            "SOURCE_RUNTIME_ACCEPTANCE_COMMIT",
        ] {
            if !is_commit(&required(lookup, name)?) {
                return Err(D4ConfigError::Invalid(name));
            }
        }

        let window_id = required(lookup, "D4_CHANGE_WINDOW_ID")?;
        if !is_window_id(&window_id) {
            return Err(D4ConfigError::Invalid("D4_CHANGE_WINDOW_ID"));
        }
        let owner_confirmed = timestamp(lookup, "OWNER_CONFIRMED_AT_UTC")?;
        let window_start = timestamp(lookup, "D4_CHANGE_WINDOW_START_UTC")?;
        let window_end = timestamp(lookup, "D4_CHANGE_WINDOW_END_UTC")?;
        let window_length = window_end.signed_duration_since(window_start);
        if owner_confirmed > now
            || now < window_start
            || now > window_end
            || window_length <= TimeDelta::zero()
            || window_length > TimeDelta::hours(2)
        {
            return Err(D4ConfigError::ClosedWindow);
        }
        let remaining = window_end
            .signed_duration_since(now)
            .to_std()
            .map_err(|_| D4ConfigError::ClosedWindow)?;
        let usable_remaining = remaining
            .checked_sub(WINDOW_SHUTDOWN_MARGIN)
            .ok_or(D4ConfigError::ClosedWindow)?;
        if usable_remaining.is_zero() {
            return Err(D4ConfigError::ClosedWindow);
        }

        let workspace_id = CanonicalId::parse(&required(lookup, "EDGE_D4_WORKSPACE_ID")?)
            .map_err(|_| D4ConfigError::Invalid("EDGE_D4_WORKSPACE_ID"))?;
        let scope = ProjectionScope::new(workspace_id, "paper")
            .map_err(|_| D4ConfigError::Invalid("EDGE_D4_WORKSPACE_ID"))?;
        let epoch_id = required(lookup, "BUILDING_EPOCH_ID")?
            .parse()
            .map_err(|_| D4ConfigError::Invalid("BUILDING_EPOCH_ID"))?;
        let capability_snapshot_id = required(lookup, "CAPABILITY_SNAPSHOT_SHA256")?;
        let source_gateway_digest = required(lookup, "SOURCE_FACADE_IMAGE_DIGEST")?;

        let requested_elapsed = Duration::from_secs(
            u64::try_from(bounded_usize(
                lookup,
                "EDGE_D4_MAXIMUM_ELAPSED_SECONDS",
                1_800,
                1,
                7_200,
            )?)
            .map_err(|_| D4ConfigError::Invalid("EDGE_D4_MAXIMUM_ELAPSED_SECONDS"))?,
        );
        let maximum_elapsed = requested_elapsed.min(usable_remaining);
        let page_size = required(lookup, "SOURCE_PAGE_SIZE")?
            .parse::<u16>()
            .map_err(|_| D4ConfigError::Invalid("SOURCE_PAGE_SIZE"))?;
        let poll_interval_ms = i64::try_from(bounded_usize(
            lookup,
            "EDGE_D4_POLL_INTERVAL_MS",
            1_000,
            250,
            300_000,
        )?)
        .map_err(|_| D4ConfigError::Invalid("EDGE_D4_POLL_INTERVAL_MS"))?;

        Ok(Self {
            scope: scope.clone(),
            epoch_id,
            epoch_created_at: window_start,
            epoch_metadata: EpochMetadata {
                adapter_version: D4_MAPPER_VERSION.to_owned(),
                source_gateway_digest,
                capability_snapshot_id: capability_snapshot_id.clone(),
            },
            database_url_file: PathBuf::from(required(
                lookup,
                "EDGE_D4_PROJECTION_DATABASE_URL_FILE",
            )?),
            source_origin: required(lookup, "EDGE_D4_SOURCE_ORIGIN")?,
            source_ca_file: PathBuf::from(required(lookup, "EDGE_D4_SOURCE_CA_FILE")?),
            source_client_identity_file: PathBuf::from(required(
                lookup,
                "EDGE_D4_SOURCE_CLIENT_IDENTITY_FILE",
            )?),
            runner: D4QualificationRunConfig {
                scope,
                epoch_id,
                page_size,
                poll_interval_ms,
                capability_snapshot_id,
                maximum_requests: bounded_usize(
                    lookup,
                    "EDGE_D4_MAXIMUM_REQUESTS",
                    10_000,
                    1,
                    10_000,
                )?,
                maximum_elapsed,
                maximum_transient_retries: 3,
                maximum_retry_delay: Duration::from_secs(30),
                maximum_freshness_age: Duration::from_secs(300),
            },
        })
    }
}

#[derive(Serialize)]
struct PrepareReport {
    schema_version: &'static str,
    epoch_id: Uuid,
    epoch_status: &'static str,
    outcome: &'static str,
    source_scope: &'static str,
    query_authority: &'static str,
    analytics_authority: &'static str,
    sse_authority: &'static str,
    command_authority: &'static str,
    activation_authority: &'static str,
}

/// Idempotently prepares the exact owner-declared BUILDING epoch.
///
/// # Errors
///
/// Fails before mutation when the owner window, evidence, scope or permanent
/// authority gates are invalid, or when the database identity collides.
pub(crate) async fn prepare_building() -> Result<(), D4CommandError> {
    let config = D4RuntimeConfig::from_environment(Utc::now())?;
    let store = projection_store(&config).await?;
    let outcome = store
        .prepare_d4_building_epoch(
            &config.scope,
            config.epoch_id,
            &config.epoch_metadata,
            config.epoch_created_at,
        )
        .await?;
    let outcome = match outcome {
        D4CommitOutcome::Written => "WRITTEN",
        D4CommitOutcome::AlreadyDurable => "ALREADY_DURABLE",
        D4CommitOutcome::RebuildRequired => return Err(D4CommandError::UnsafeStoreOutcome),
    };
    emit(&PrepareReport {
        schema_version: PREPARE_REPORT_SCHEMA,
        epoch_id: config.epoch_id,
        epoch_status: "BUILDING",
        outcome,
        source_scope: SOURCE_SCOPE,
        query_authority: "DISABLED",
        analytics_authority: "DISABLED",
        sse_authority: "DISABLED",
        command_authority: "DISABLED",
        activation_authority: "DISABLED",
    })
}

/// Runs one finite, resumable D4 qualification against an existing BUILDING
/// epoch and emits only the runner's sanitized report.
///
/// # Errors
///
/// Fails closed on unsafe authorization, transport, persistence, replay,
/// cursor, freshness or BUILDING-authority state.
pub(crate) async fn qualify() -> Result<(), D4CommandError> {
    let now = Utc::now();
    let config = D4RuntimeConfig::from_environment(now)?;
    let store = projection_store(&config).await?;
    let root_ca_pem = read_bounded_file(&config.source_ca_file)?;
    let client_identity_pem = read_bounded_file(&config.source_client_identity_file)?;
    let source = PaperSourceClient::new(PaperSourceTransportConfig {
        source_proxy_origin: &config.source_origin,
        root_ca_pem: &root_ca_pem,
        client_identity_pem: &client_identity_pem,
        limits: PaperTransportLimits {
            connect_timeout: Duration::from_secs(2),
            request_timeout: Duration::from_secs(5),
            queue_timeout: Duration::from_millis(250),
            maximum_concurrency: 2,
            maximum_response_bytes: 1024 * 1024,
        },
    })?;
    let mut runner = D4QualificationRunner::load(source, store, config.runner, now).await?;
    emit(&runner.run_until_caught_up().await?)
}

async fn projection_store(config: &D4RuntimeConfig) -> Result<PgProjectionStore, D4CommandError> {
    let database_url = read_bounded_text(&config.database_url_file)?;
    PgProjectionStore::connect(database_url.trim())
        .await
        .map_err(Into::into)
}

fn emit<T: Serialize>(value: &T) -> Result<(), D4CommandError> {
    println!("{}", serde_json::to_string(value)?);
    Ok(())
}

fn read_bounded_file(path: &Path) -> Result<Vec<u8>, D4CommandError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > MAXIMUM_FILE_BYTES
    {
        return Err(D4CommandError::UnsafeRuntimeFile);
    }
    fs::read(path).map_err(Into::into)
}

fn read_bounded_text(path: &Path) -> Result<String, D4CommandError> {
    let raw = read_bounded_file(path)?;
    let value = String::from_utf8(raw).map_err(|_| D4CommandError::UnsafeRuntimeFile)?;
    if value.trim().is_empty() || value.contains('\0') {
        return Err(D4CommandError::UnsafeRuntimeFile);
    }
    Ok(value)
}

fn required<F>(lookup: &F, name: &'static str) -> Result<String, D4ConfigError>
where
    F: Fn(&str) -> Option<String>,
{
    lookup(name)
        .filter(|value| !value.trim().is_empty() && value.trim() == value)
        .ok_or(D4ConfigError::Missing(name))
}

fn require_equal<F>(lookup: &F, name: &'static str, expected: &str) -> Result<(), D4ConfigError>
where
    F: Fn(&str) -> Option<String>,
{
    if required(lookup, name)? == expected {
        Ok(())
    } else {
        Err(D4ConfigError::Invalid(name))
    }
}

fn require_digest<F>(lookup: &F, name: &'static str) -> Result<(), D4ConfigError>
where
    F: Fn(&str) -> Option<String>,
{
    if is_digest(&required(lookup, name)?) {
        Ok(())
    } else {
        Err(D4ConfigError::Invalid(name))
    }
}

fn timestamp<F>(lookup: &F, name: &'static str) -> Result<DateTime<Utc>, D4ConfigError>
where
    F: Fn(&str) -> Option<String>,
{
    let raw = required(lookup, name)?;
    if !raw.ends_with('Z') {
        return Err(D4ConfigError::Invalid(name));
    }
    DateTime::parse_from_rfc3339(&raw)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| D4ConfigError::Invalid(name))
}

fn bounded_usize<F>(
    lookup: &F,
    name: &'static str,
    default: usize,
    minimum: usize,
    maximum: usize,
) -> Result<usize, D4ConfigError>
where
    F: Fn(&str) -> Option<String>,
{
    let value = lookup(name).map_or(Ok(default), |raw| {
        raw.parse().map_err(|_| D4ConfigError::Invalid(name))
    })?;
    if (minimum..=maximum).contains(&value) {
        Ok(value)
    } else {
        Err(D4ConfigError::Invalid(name))
    }
}

fn is_digest(value: &str) -> bool {
    let hex = value.strip_prefix("sha256:").unwrap_or(value);
    hex.len() == 64
        && hex
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_commit(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_window_id(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("d4-") else {
        return false;
    };
    (3..=64).contains(&rest.len())
        && rest
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        && rest.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
        })
}

#[derive(Debug, Error)]
pub(crate) enum D4ConfigError {
    #[error("required D4 configuration {0} is missing")]
    Missing(&'static str),
    #[error("D4 configuration {0} is invalid")]
    Invalid(&'static str),
    #[error("D4 qualification is outside its owner-approved window")]
    ClosedWindow,
}

#[derive(Debug, Error)]
pub(crate) enum D4CommandError {
    #[error(transparent)]
    Config(#[from] D4ConfigError),
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Transport(#[from] PaperTransportError),
    #[error(transparent)]
    Runner(#[from] RunnerError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("D4 runtime file violates bounded regular-file constraints")]
    UnsafeRuntimeFile,
    #[error("D4 BUILDING preparation returned an impossible store outcome")]
    UnsafeStoreOutcome,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn at(raw: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(raw)
            .unwrap()
            .with_timezone(&Utc)
    }

    fn values() -> BTreeMap<String, String> {
        let mut values = BTreeMap::new();
        let insert = |values: &mut BTreeMap<String, String>, name: &str, value: &str| {
            values.insert(name.to_owned(), value.to_owned());
        };
        for (name, value) in [
            ("INPUT_VERSION", INPUT_VERSION),
            ("D2_STATUS", "D2_DARK_ACCEPTED"),
            ("D3_STATUS", "D3_TRANSPORT_ACCEPTED"),
            ("SOURCE_AUTH_CONTRACT_REVISION", SOURCE_CONTRACT),
            ("SOURCE_SCOPE", SOURCE_SCOPE),
            ("SOURCE_ENVIRONMENT", "paper"),
            ("SOURCE_VENUE", "BINANCE"),
            ("SOURCE_PAGE_SIZE", "250"),
            ("SOURCE_RESPONSE_MAX_BYTES", "1048576"),
            ("SOURCE_RATE_LIMIT_RPM", "120"),
            ("SOURCE_SNAPSHOT_TTL_SECONDS", "300"),
            ("SOURCE_SNAPSHOT_MAX_ROWS", "10000"),
            ("SOURCE_RETAINED_EVENTS", "10000"),
            ("BUILDING_EPOCH_STATUS", "BUILDING"),
            ("REGISTRY_DELIVERY_PROFILE", "fixture"),
            ("D4_EVIDENCE_ACCEPTED", "false"),
            ("ACTIVATION_AUTHORIZED", "false"),
            ("ALLOW_QUERY", "false"),
            ("ALLOW_ANALYTICS", "false"),
            ("ALLOW_SSE", "false"),
            ("ALLOW_COMMANDS", "false"),
            ("ALLOW_TRADING_SYSTEM_CHANGES", "false"),
            ("D4_CHANGE_WINDOW_ID", "d4-test-window"),
            ("OWNER_CONFIRMED_AT_UTC", "2026-08-25T10:00:00Z"),
            ("D4_CHANGE_WINDOW_START_UTC", "2026-08-25T10:00:00Z"),
            ("D4_CHANGE_WINDOW_END_UTC", "2026-08-25T12:00:00Z"),
            ("EDGE_D4_WORKSPACE_ID", "workspace_d4_test"),
            ("BUILDING_EPOCH_ID", "018f5e5b-2ec2-7c56-9d87-6d5b8b8af001"),
            ("EDGE_D4_PROJECTION_DATABASE_URL_FILE", "/run/secrets/db"),
            ("EDGE_D4_SOURCE_ORIGIN", "https://172.23.0.1:8444"),
            ("EDGE_D4_SOURCE_CA_FILE", "/run/secrets/source-ca.crt"),
            (
                "EDGE_D4_SOURCE_CLIENT_IDENTITY_FILE",
                "/run/secrets/source-client.pem",
            ),
        ] {
            insert(&mut values, name, value);
        }
        insert(&mut values, "DEPLOYMENT_COMMIT", &"a".repeat(40));
        insert(&mut values, "MAPPER_SOURCE_COMMIT", &"a".repeat(40));
        insert(&mut values, "SOURCE_IMPLEMENTATION_COMMIT", &"b".repeat(40));
        insert(
            &mut values,
            "SOURCE_RUNTIME_ACCEPTANCE_COMMIT",
            &"c".repeat(40),
        );
        for name in [
            "OWNER",
            "SOURCE_OWNER",
            "ROLLBACK_OWNER",
            "BACKUP_OWNER",
            "OBSERVABILITY_OWNER",
        ] {
            insert(&mut values, name, "bobby");
        }
        for name in REQUIRED_TRUE {
            insert(&mut values, name, "true");
        }
        for name in REQUIRED_DIGESTS {
            insert(&mut values, name, &format!("sha256:{}", "d".repeat(64)));
        }
        values
    }

    fn parse(
        values: &BTreeMap<String, String>,
        now: DateTime<Utc>,
    ) -> Result<D4RuntimeConfig, D4ConfigError> {
        D4RuntimeConfig::from_lookup(now, &|name| values.get(name).cloned())
    }

    #[test]
    fn safe_owner_window_creates_building_only_runner_configuration() {
        let config = parse(&values(), at("2026-08-25T10:30:00Z")).unwrap();
        assert_eq!(config.scope.environment, "paper");
        assert_eq!(config.runner.page_size, 250);
        assert_eq!(config.runner.maximum_elapsed, Duration::from_secs(1_800));
        assert_eq!(config.epoch_metadata.adapter_version, D4_MAPPER_VERSION);
    }

    #[test]
    fn elapsed_budget_is_capped_before_owner_window_closes() {
        let mut values = values();
        values.insert(
            "EDGE_D4_MAXIMUM_ELAPSED_SECONDS".to_owned(),
            "7200".to_owned(),
        );
        let config = parse(&values, at("2026-08-25T11:59:00Z")).unwrap();
        assert_eq!(config.runner.maximum_elapsed, Duration::from_secs(50));
    }

    #[test]
    fn unsafe_authority_window_and_identity_drift_fail_closed() {
        let mut unsafe_authority = values();
        unsafe_authority.insert("ALLOW_QUERY".to_owned(), "true".to_owned());
        assert!(matches!(
            parse(&unsafe_authority, at("2026-08-25T10:30:00Z")),
            Err(D4ConfigError::Invalid("ALLOW_QUERY"))
        ));

        assert!(matches!(
            parse(&values(), at("2026-08-25T12:00:00Z")),
            Err(D4ConfigError::ClosedWindow)
        ));

        let mut drifted = values();
        drifted.insert("MAPPER_SOURCE_COMMIT".to_owned(), "e".repeat(40));
        assert!(matches!(
            parse(&drifted, at("2026-08-25T10:30:00Z")),
            Err(D4ConfigError::Invalid("MAPPER_SOURCE_COMMIT"))
        ));
    }

    #[test]
    fn digest_and_source_contract_must_be_exact() {
        let mut bad_digest = values();
        bad_digest.insert(
            "CAPABILITY_SNAPSHOT_SHA256".to_owned(),
            "sha256:NOT-HEX".to_owned(),
        );
        assert!(matches!(
            parse(&bad_digest, at("2026-08-25T10:30:00Z")),
            Err(D4ConfigError::Invalid("CAPABILITY_SNAPSHOT_SHA256"))
        ));

        let mut bad_scope = values();
        bad_scope.insert("SOURCE_SCOPE".to_owned(), "ALL".to_owned());
        assert!(matches!(
            parse(&bad_scope, at("2026-08-25T10:30:00Z")),
            Err(D4ConfigError::Invalid("SOURCE_SCOPE"))
        ));
    }

    #[test]
    fn window_identifier_must_match_the_owner_validator_vocabulary() {
        assert!(is_window_id("d4-paper-shadow-20260825"));
        assert!(!is_window_id("d4---"));
        assert!(!is_window_id("D4-paper-shadow"));
    }
}
