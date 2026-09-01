//! N26 activation authority for Manager-v2 backed Portal projection streams.
//!
//! This is deliberately separate from the immutable N08 Paper-shadow
//! contract.  It accepts one bounded release manifest for the three deployment
//! profiles, while the running Edge may select only its configured
//! environment/profile pair.  Epoch identity is checked against the durable
//! store at request time so a rehearsed rebuild or rollback does not require a
//! new release manifest.

use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use projection_core::canonical_digest;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MANAGER_REALTIME_ACTIVATION_SCHEMA_VERSION: &str =
    "execution.manager-realtime-activation.v2";
pub const MANAGER_REALTIME_RESOURCE: &str = "execution:manager-realtime";
const MAX_IDENTIFIER_BYTES: usize = 160;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagerRealtimeProfile {
    pub environment: String,
    pub profile_id: String,
    pub audience: String,
    pub catalogue_digest: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagerRealtimeCompatibility {
    pub projection_schema_version: String,
    pub projection_adapter_version: String,
    pub realtime_contract_revision: String,
    pub edge_image_digest: String,
    pub control_api_image_digest: String,
    pub snapshot_contract_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagerRealtimeGateEvidence {
    pub h2_mtls_sha256: String,
    pub auth_expiry_sha256: String,
    pub resume_gap_epoch_sha256: String,
    pub multi_replica_fanout_sha256: String,
    pub slow_consumer_sha256: String,
    pub source_loss_recovery_sha256: String,
    pub terminal_client_sha256: String,
    pub load_sha256: String,
    pub rollback_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagerRealtimeOwnerApproval {
    pub owner_id: String,
    pub approved: bool,
    pub approved_at: Option<DateTime<Utc>>,
    pub evidence_sha256: String,
}

/// Closed authority bundle: a reviewed realtime release cannot widen command
/// authority by flipping one independent runtime boolean.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ManagerRealtimeAuthoritySet {
    #[serde(rename = "PROJECTION_QUERY_REALTIME_COMMANDS_DISABLED")]
    ProjectionQueryRealtimeCommandsDisabled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagerRealtimeActivationEvidence {
    pub schema_version: String,
    pub delivery_profile: String,
    pub resource: String,
    pub profiles: Vec<ManagerRealtimeProfile>,
    pub compatibility: ManagerRealtimeCompatibility,
    pub gate_evidence: ManagerRealtimeGateEvidence,
    pub authority_set: ManagerRealtimeAuthoritySet,
    pub owner_approval: ManagerRealtimeOwnerApproval,
}

#[derive(Debug, Clone)]
pub struct AcceptedManagerRealtimeActivation {
    evidence: ManagerRealtimeActivationEvidence,
    manifest_digest: String,
}

impl AcceptedManagerRealtimeActivation {
    #[must_use]
    pub const fn evidence(&self) -> &ManagerRealtimeActivationEvidence {
        &self.evidence
    }

    #[must_use]
    pub fn manifest_digest(&self) -> &str {
        &self.manifest_digest
    }

    /// Selects the one profile owned by this Edge process.
    ///
    /// # Errors
    ///
    /// Rejects unknown, disabled and cross-environment profile bindings.
    pub fn profile(
        &self,
        environment: &str,
        profile_id: &str,
    ) -> Result<&ManagerRealtimeProfile, ManagerRealtimeActivationError> {
        self.evidence
            .profiles
            .iter()
            .find(|profile| profile.environment == environment && profile.profile_id == profile_id)
            .filter(|profile| profile.enabled)
            .ok_or(ManagerRealtimeActivationError::ProfileBindingDenied)
    }
}

/// Converts owner-approved N26 evidence into runtime authority.
///
/// # Errors
///
/// Rejects incomplete profiles, mutable/non-digest bindings, command coupling
/// and missing owner approval.
pub fn accept_manager_realtime_activation(
    evidence: ManagerRealtimeActivationEvidence,
) -> Result<AcceptedManagerRealtimeActivation, ManagerRealtimeActivationError> {
    validate(&evidence)?;
    let manifest_digest =
        canonical_digest(&evidence).map_err(|_| ManagerRealtimeActivationError::Serialization)?;
    Ok(AcceptedManagerRealtimeActivation {
        evidence,
        manifest_digest,
    })
}

fn validate(
    evidence: &ManagerRealtimeActivationEvidence,
) -> Result<(), ManagerRealtimeActivationError> {
    if evidence.schema_version != MANAGER_REALTIME_ACTIVATION_SCHEMA_VERSION
        || evidence.delivery_profile != "current_projection"
        || evidence.resource != MANAGER_REALTIME_RESOURCE
        || evidence.authority_set
            != ManagerRealtimeAuthoritySet::ProjectionQueryRealtimeCommandsDisabled
        || !evidence.owner_approval.approved
        || evidence.owner_approval.approved_at.is_none()
    {
        return Err(ManagerRealtimeActivationError::InvalidIntent);
    }
    let expected = [
        ("paper", "PAPER_BINANCE_USDM", "portal-execution-edge-paper"),
        (
            "sandbox",
            "SANDBOX_BINANCE_USDM",
            "portal-execution-edge-sandbox",
        ),
        ("live", "LIVE_BINANCE_USDM", "portal-execution-edge-live"),
    ];
    if evidence.profiles.len() != expected.len() {
        return Err(ManagerRealtimeActivationError::ProfileSetInvalid);
    }
    let actual = evidence
        .profiles
        .iter()
        .map(|profile| {
            (
                profile.environment.as_str(),
                profile.profile_id.as_str(),
                profile.audience.as_str(),
            )
        })
        .collect::<BTreeSet<_>>();
    if actual != expected.into_iter().collect() || evidence.profiles.iter().any(|p| !p.enabled) {
        return Err(ManagerRealtimeActivationError::ProfileSetInvalid);
    }
    for value in evidence
        .profiles
        .iter()
        .map(|profile| profile.catalogue_digest.as_str())
        .chain([
            evidence.compatibility.edge_image_digest.as_str(),
            evidence.compatibility.control_api_image_digest.as_str(),
            evidence.compatibility.snapshot_contract_digest.as_str(),
            evidence.gate_evidence.h2_mtls_sha256.as_str(),
            evidence.gate_evidence.auth_expiry_sha256.as_str(),
            evidence.gate_evidence.resume_gap_epoch_sha256.as_str(),
            evidence.gate_evidence.multi_replica_fanout_sha256.as_str(),
            evidence.gate_evidence.slow_consumer_sha256.as_str(),
            evidence.gate_evidence.source_loss_recovery_sha256.as_str(),
            evidence.gate_evidence.terminal_client_sha256.as_str(),
            evidence.gate_evidence.load_sha256.as_str(),
            evidence.gate_evidence.rollback_sha256.as_str(),
            evidence.owner_approval.evidence_sha256.as_str(),
        ])
    {
        valid_sha256(value)?;
    }
    for value in [
        evidence.compatibility.projection_schema_version.as_str(),
        evidence.compatibility.projection_adapter_version.as_str(),
        evidence.compatibility.realtime_contract_revision.as_str(),
        evidence.owner_approval.owner_id.as_str(),
    ] {
        if value.is_empty() || value.len() > MAX_IDENTIFIER_BYTES {
            return Err(ManagerRealtimeActivationError::IdentifierInvalid);
        }
    }
    Ok(())
}

fn valid_sha256(value: &str) -> Result<(), ManagerRealtimeActivationError> {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return Err(ManagerRealtimeActivationError::DigestInvalid);
    };
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ManagerRealtimeActivationError::DigestInvalid);
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, Error, PartialEq, Eq)]
pub enum ManagerRealtimeActivationError {
    #[error("N26 realtime activation intent is invalid")]
    InvalidIntent,
    #[error("N26 realtime profile set is incomplete or drifted")]
    ProfileSetInvalid,
    #[error("N26 realtime profile binding is denied")]
    ProfileBindingDenied,
    #[error("N26 realtime digest is invalid")]
    DigestInvalid,
    #[error("N26 realtime identifier is invalid")]
    IdentifierInvalid,
    #[error("N26 realtime activation could not be serialized")]
    Serialization,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest(byte: char) -> String {
        format!("sha256:{}", byte.to_string().repeat(64))
    }

    fn evidence() -> ManagerRealtimeActivationEvidence {
        ManagerRealtimeActivationEvidence {
            schema_version: MANAGER_REALTIME_ACTIVATION_SCHEMA_VERSION.to_owned(),
            delivery_profile: "current_projection".to_owned(),
            resource: MANAGER_REALTIME_RESOURCE.to_owned(),
            profiles: [
                ("paper", "PAPER_BINANCE_USDM", "portal-execution-edge-paper"),
                (
                    "sandbox",
                    "SANDBOX_BINANCE_USDM",
                    "portal-execution-edge-sandbox",
                ),
                ("live", "LIVE_BINANCE_USDM", "portal-execution-edge-live"),
            ]
            .into_iter()
            .map(
                |(environment, profile_id, audience)| ManagerRealtimeProfile {
                    environment: environment.to_owned(),
                    profile_id: profile_id.to_owned(),
                    audience: audience.to_owned(),
                    catalogue_digest: digest('a'),
                    enabled: true,
                },
            )
            .collect(),
            compatibility: ManagerRealtimeCompatibility {
                projection_schema_version: "portal.execution.manager-projection.v2".to_owned(),
                projection_adapter_version:
                    "portal.execution.manager-projection.manager-v2.runtime.v5".to_owned(),
                realtime_contract_revision: "execution.realtime.v2".to_owned(),
                edge_image_digest: digest('b'),
                control_api_image_digest: digest('c'),
                snapshot_contract_digest: digest('d'),
            },
            gate_evidence: ManagerRealtimeGateEvidence {
                h2_mtls_sha256: digest('e'),
                auth_expiry_sha256: digest('f'),
                resume_gap_epoch_sha256: digest('1'),
                multi_replica_fanout_sha256: digest('2'),
                slow_consumer_sha256: digest('3'),
                source_loss_recovery_sha256: digest('4'),
                terminal_client_sha256: digest('5'),
                load_sha256: digest('6'),
                rollback_sha256: digest('7'),
            },
            authority_set: ManagerRealtimeAuthoritySet::ProjectionQueryRealtimeCommandsDisabled,
            owner_approval: ManagerRealtimeOwnerApproval {
                owner_id: "bobby".to_owned(),
                approved: true,
                approved_at: Some(Utc::now()),
                evidence_sha256: digest('8'),
            },
        }
    }

    #[test]
    fn accepts_exact_three_profile_release_and_selects_one_cell() {
        let accepted = accept_manager_realtime_activation(evidence()).unwrap();
        assert_eq!(
            accepted
                .profile("sandbox", "SANDBOX_BINANCE_USDM")
                .unwrap()
                .audience,
            "portal-execution-edge-sandbox"
        );
        assert_eq!(
            accepted.profile("paper", "LIVE_BINANCE_USDM"),
            Err(ManagerRealtimeActivationError::ProfileBindingDenied)
        );
        assert!(accepted.manifest_digest().starts_with("sha256:"));
    }

    #[test]
    fn rejects_command_coupling_missing_profiles_and_digest_drift() {
        let mut value = serde_json::to_value(evidence()).unwrap();
        value["authority_set"] = serde_json::json!("COMMANDS_ENABLED");
        assert!(serde_json::from_value::<ManagerRealtimeActivationEvidence>(value).is_err());

        let mut value = evidence();
        value.profiles.pop();
        assert!(matches!(
            accept_manager_realtime_activation(value),
            Err(ManagerRealtimeActivationError::ProfileSetInvalid)
        ));

        let mut value = evidence();
        value.gate_evidence.load_sha256 = "not-a-digest".to_owned();
        assert!(matches!(
            accept_manager_realtime_activation(value),
            Err(ManagerRealtimeActivationError::DigestInvalid)
        ));
    }
}
