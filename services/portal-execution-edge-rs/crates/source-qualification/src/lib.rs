#![forbid(unsafe_code)]

pub mod real_source;
pub mod realtime_activation;
pub mod shadow_screen;

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::CanonicalId;
use projection_core::{
    canonical_digest, replay, ApplyDisposition, ProjectionError, ProjectionObservation,
    ProjectionReducer, ProjectionScope, ReplayRecord,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub const CORPUS_SCHEMA_VERSION: &str = "execution.source-qualification.v1";
pub const SUPPORTED_CONTRACT_REVISION: &str = "v1";
pub const SUPPORTED_ADAPTER_VERSION: &str = "ts-adapter-v1";
pub const MAX_CORPUS_OBSERVATIONS: usize = 5_000;
pub const MAX_CORPUS_BYTES: usize = 8 * 1024 * 1024;
const MAX_IDENTIFIER_BYTES: usize = 128;
const MAX_CAPTURE_SKEW_MS: i64 = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceCorpusIdentity {
    pub corpus_id: CanonicalId,
    pub source_contract_revision: String,
    pub source_gateway_digest: String,
    pub adapter_version: String,
    pub capability_snapshot_id: String,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualificationCorpus {
    pub schema_version: String,
    pub identity: SourceCorpusIdentity,
    pub scope: ProjectionScope,
    pub expected_observation_count: usize,
    pub expected_state_digest: String,
    pub observations: Vec<ProjectionObservation>,
    pub corpus_digest: String,
}

#[derive(Serialize)]
struct CorpusDigestMaterial<'a> {
    schema_version: &'a str,
    identity: &'a SourceCorpusIdentity,
    scope: &'a ProjectionScope,
    expected_observation_count: usize,
    expected_state_digest: &'a str,
    observations: &'a [ProjectionObservation],
}

impl QualificationCorpus {
    /// Builds and seals an immutable offline source corpus.
    ///
    /// # Errors
    ///
    /// Rejects unsupported compatibility identity, count/byte overflow, invalid
    /// projection observations, timestamp skew, or a non-canonical digest.
    pub fn new(
        identity: SourceCorpusIdentity,
        scope: ProjectionScope,
        expected_state_digest: String,
        observations: Vec<ProjectionObservation>,
    ) -> Result<Self, QualificationError> {
        let expected_observation_count = observations.len();
        let mut corpus = Self {
            schema_version: CORPUS_SCHEMA_VERSION.to_owned(),
            identity,
            scope,
            expected_observation_count,
            expected_state_digest,
            observations,
            corpus_digest: String::new(),
        };
        corpus.corpus_digest = corpus.compute_digest()?;
        corpus.validate()?;
        Ok(corpus)
    }

    /// Verifies the sealed corpus before any reducer state is created.
    ///
    /// # Errors
    ///
    /// Returns a stable fail-closed qualification error for any drift.
    pub fn validate(&self) -> Result<(), QualificationError> {
        if self.schema_version != CORPUS_SCHEMA_VERSION {
            return Err(QualificationError::UnsupportedCorpusSchema);
        }
        if self.identity.source_contract_revision != SUPPORTED_CONTRACT_REVISION {
            return Err(QualificationError::UnsupportedContractRevision);
        }
        if self.identity.adapter_version != SUPPORTED_ADAPTER_VERSION {
            return Err(QualificationError::UnsupportedAdapterVersion);
        }
        validate_identifier(self.identity.corpus_id.as_str())?;
        validate_identifier(&self.identity.capability_snapshot_id)?;
        validate_sha256(&self.identity.source_gateway_digest)?;
        validate_sha256(&self.expected_state_digest)?;
        if self.expected_observation_count != self.observations.len() {
            return Err(QualificationError::ObservationCountMismatch);
        }
        if self.observations.len() > MAX_CORPUS_OBSERVATIONS {
            return Err(QualificationError::ObservationLimitExceeded);
        }
        ProjectionScope::new(
            self.scope.workspace_id.clone(),
            self.scope.environment.clone(),
        )?;
        for observation in &self.observations {
            observation.validate()?;
            validate_identifier(observation.ingestion_id.as_str())?;
            validate_identifier(observation.entity.entity_id.as_str())?;
            if observation.adapter_version != self.identity.adapter_version
                || observation.capability_snapshot_id != self.identity.capability_snapshot_id
            {
                return Err(QualificationError::ObservationIdentityMismatch);
            }
            if observation.source_read_at
                > self.identity.captured_at + TimeDelta::milliseconds(MAX_CAPTURE_SKEW_MS)
            {
                return Err(QualificationError::CaptureTimeInversion);
            }
        }
        if self.observations_bytes()? > MAX_CORPUS_BYTES {
            return Err(QualificationError::CorpusByteLimitExceeded);
        }
        if self.compute_digest()? != self.corpus_digest {
            return Err(QualificationError::CorpusDigestMismatch);
        }
        Ok(())
    }

    fn compute_digest(&self) -> Result<String, QualificationError> {
        Ok(canonical_digest(&CorpusDigestMaterial {
            schema_version: &self.schema_version,
            identity: &self.identity,
            scope: &self.scope,
            expected_observation_count: self.expected_observation_count,
            expected_state_digest: &self.expected_state_digest,
            observations: &self.observations,
        })?)
    }

    fn observations_bytes(&self) -> Result<usize, QualificationError> {
        Ok(serde_json::to_vec(&self.observations)?.len())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OfflineGateStatus {
    Passed,
    BlockedSourceGap,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QualificationMetrics {
    pub corpus_total: u64,
    pub corpus_bytes: u64,
    pub observations_total: u64,
    pub applied_total: u64,
    pub refreshed_total: u64,
    pub duplicate_total: u64,
    pub out_of_order_total: u64,
    pub source_gap_total: u64,
    pub parity_mismatch_total: u64,
    pub rejected_total: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OfflineQualificationReport {
    pub schema_version: String,
    pub corpus_id: CanonicalId,
    pub corpus_digest: String,
    pub source_contract_revision: String,
    pub source_gateway_digest: String,
    pub adapter_version: String,
    pub capability_snapshot_id: String,
    pub observation_count: usize,
    pub state_digest: String,
    pub replay_state_digest: String,
    pub gate_status: OfflineGateStatus,
    pub activation_authorized: bool,
    pub blocker_codes: Vec<String>,
    pub metrics: QualificationMetrics,
}

/// Runs deterministic live-order reduction and journal replay over a sealed corpus.
///
/// This is an offline evidence harness. A passing report never activates an epoch,
/// source credential, registry profile, or runtime flag.
///
/// # Errors
///
/// Rejects invalid/tampered corpora, reducer ambiguity, replay drift, or golden
/// semantic parity mismatch.
pub fn qualify_offline(
    corpus: &QualificationCorpus,
    epoch_id: Uuid,
    projected_at: DateTime<Utc>,
) -> Result<OfflineQualificationReport, QualificationError> {
    corpus.validate()?;
    if projected_at < corpus.identity.captured_at {
        return Err(QualificationError::ProjectionTimeInversion);
    }
    let corpus_bytes = u64::try_from(corpus.observations_bytes()?)
        .map_err(|_| QualificationError::NumericOverflow)?;
    let mut reducer = ProjectionReducer::new(corpus.scope.clone(), epoch_id);
    let mut applied_total = 0_u64;
    let mut refreshed_total = 0_u64;
    let mut duplicate_total = 0_u64;
    let mut out_of_order_total = 0_u64;
    let mut records = Vec::with_capacity(corpus.observations.len());
    for (index, observation) in corpus.observations.iter().cloned().enumerate() {
        match reducer.apply(observation.clone(), projected_at)? {
            ApplyDisposition::Applied { .. } | ApplyDisposition::GapApplied { .. } => {
                applied_total += 1;
            }
            ApplyDisposition::Refreshed { .. } => refreshed_total += 1,
            ApplyDisposition::Duplicate => duplicate_total += 1,
            ApplyDisposition::OutOfOrder => out_of_order_total += 1,
        }
        records.push(ReplayRecord {
            journal_ordinal: u64::try_from(index)
                .map_err(|_| QualificationError::NumericOverflow)?,
            observation,
            projected_at,
        });
    }
    let state_digest = reducer.state_digest()?;
    let replay = replay(corpus.scope.clone(), epoch_id, records)?;
    if replay.state_digest != state_digest {
        return Err(QualificationError::ReplayParityMismatch);
    }
    if state_digest != corpus.expected_state_digest {
        return Err(QualificationError::GoldenParityMismatch);
    }
    let source_gap_total =
        u64::try_from(reducer.gaps().len()).map_err(|_| QualificationError::NumericOverflow)?;
    let (gate_status, blocker_codes) = if source_gap_total == 0 {
        (OfflineGateStatus::Passed, Vec::new())
    } else {
        (
            OfflineGateStatus::BlockedSourceGap,
            vec!["SOURCE_GAP_PRESENT".to_owned()],
        )
    };
    Ok(OfflineQualificationReport {
        schema_version: CORPUS_SCHEMA_VERSION.to_owned(),
        corpus_id: corpus.identity.corpus_id.clone(),
        corpus_digest: corpus.corpus_digest.clone(),
        source_contract_revision: corpus.identity.source_contract_revision.clone(),
        source_gateway_digest: corpus.identity.source_gateway_digest.clone(),
        adapter_version: corpus.identity.adapter_version.clone(),
        capability_snapshot_id: corpus.identity.capability_snapshot_id.clone(),
        observation_count: corpus.observations.len(),
        state_digest,
        replay_state_digest: replay.state_digest,
        gate_status,
        activation_authorized: false,
        blocker_codes,
        metrics: QualificationMetrics {
            corpus_total: 1,
            corpus_bytes,
            observations_total: u64::try_from(corpus.observations.len())
                .map_err(|_| QualificationError::NumericOverflow)?,
            applied_total,
            refreshed_total,
            duplicate_total,
            out_of_order_total,
            source_gap_total,
            parity_mismatch_total: 0,
            rejected_total: 0,
        },
    })
}

fn validate_identifier(value: &str) -> Result<(), QualificationError> {
    if value.is_empty()
        || value.len() > MAX_IDENTIFIER_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(QualificationError::InvalidIdentifier);
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), QualificationError> {
    let Some(digest) = value.strip_prefix("sha256:") else {
        return Err(QualificationError::InvalidDigest);
    };
    if digest.len() != 64
        || !digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(QualificationError::InvalidDigest);
    }
    Ok(())
}

#[derive(Debug, Error)]
pub enum QualificationError {
    #[error("offline source corpus schema is unsupported")]
    UnsupportedCorpusSchema,
    #[error("source contract revision is unsupported")]
    UnsupportedContractRevision,
    #[error("source adapter version is unsupported")]
    UnsupportedAdapterVersion,
    #[error("source corpus identifier is invalid or unbounded")]
    InvalidIdentifier,
    #[error("source corpus digest is not a canonical SHA-256 value")]
    InvalidDigest,
    #[error("source corpus observation count does not match its declaration")]
    ObservationCountMismatch,
    #[error("source corpus exceeds its observation limit")]
    ObservationLimitExceeded,
    #[error("source corpus exceeds its byte limit")]
    CorpusByteLimitExceeded,
    #[error("source observation compatibility identity differs from its corpus")]
    ObservationIdentityMismatch,
    #[error("source observation receipt time is after the allowed capture skew")]
    CaptureTimeInversion,
    #[error("qualification projection time precedes the sealed corpus capture")]
    ProjectionTimeInversion,
    #[error("sealed source corpus digest does not match its content")]
    CorpusDigestMismatch,
    #[error("live-order reduction and journal replay have different state")]
    ReplayParityMismatch,
    #[error("source corpus state does not match its frozen golden digest")]
    GoldenParityMismatch,
    #[error("source qualification numeric conversion overflowed")]
    NumericOverflow,
    #[error(transparent)]
    Projection(#[from] ProjectionError),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
}

impl QualificationError {
    #[must_use]
    pub const fn reason_code(&self) -> &'static str {
        match self {
            Self::UnsupportedCorpusSchema => "CORPUS_SCHEMA_UNSUPPORTED",
            Self::UnsupportedContractRevision => "SOURCE_CONTRACT_UNSUPPORTED",
            Self::UnsupportedAdapterVersion => "SOURCE_ADAPTER_UNSUPPORTED",
            Self::InvalidIdentifier => "CORPUS_IDENTIFIER_INVALID",
            Self::InvalidDigest => "CORPUS_DIGEST_INVALID",
            Self::ObservationCountMismatch => "CORPUS_COUNT_MISMATCH",
            Self::ObservationLimitExceeded => "CORPUS_COUNT_LIMIT",
            Self::CorpusByteLimitExceeded => "CORPUS_BYTE_LIMIT",
            Self::ObservationIdentityMismatch => "OBSERVATION_IDENTITY_MISMATCH",
            Self::CaptureTimeInversion => "CAPTURE_TIME_INVERSION",
            Self::ProjectionTimeInversion => "PROJECTION_TIME_INVERSION",
            Self::CorpusDigestMismatch => "CORPUS_DIGEST_MISMATCH",
            Self::ReplayParityMismatch => "REPLAY_PARITY_MISMATCH",
            Self::GoldenParityMismatch => "GOLDEN_PARITY_MISMATCH",
            Self::NumericOverflow => "QUALIFICATION_NUMERIC_OVERFLOW",
            Self::Projection(_) => "PROJECTION_REJECTED",
            Self::Serialization(_) => "CORPUS_SERIALIZATION_FAILED",
        }
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod real_source_tests;
