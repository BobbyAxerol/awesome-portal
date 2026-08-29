#![forbid(unsafe_code)]

//! Validated N13B compatibility mapping from current bounded sources to
//! Portal-facing Execution screens.

use std::collections::{BTreeMap, BTreeSet};

use manager_v2_contract::ManagerCatalogue;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const CONTRACT_VERSION: &str = "portal.execution.current-source-map.v1";
pub const PHASE: &str = "N13B";
pub const CANONICAL_MAP_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/current-source-v1/capability-source-map.json"
));

const REQUIRED_SCREENS: [&str; 20] = [
    "PAPER_TRADING_SCREEN",
    "SANDBOX_TRADING_SCREEN",
    "LIVE_OPERATIONS_SCREEN",
    "EXECUTION_COMMAND_CENTER_SCREEN",
    "EXECUTION_OPERATIONS_QUEUE_SCREEN",
    "EXECUTION_INCIDENT_DETAIL_SCREEN",
    "EXECUTION_APPROVAL_INBOX_SCREEN",
    "EXECUTION_GATE_R1_REVIEW_SCREEN",
    "EXECUTION_GATE_R2_REVIEW_SCREEN",
    "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
    "EXECUTION_PAPER_WORKBENCH_SCREEN",
    "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
    "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
    "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
    "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
    "EXECUTION_FULL_BLOTTER_SCREEN",
    "EXECUTION_ALPHA_360_SCREEN",
    "EXECUTION_PORTFOLIO_360_SCREEN",
    "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExecutionProfile {
    Paper,
    Sandbox,
    Live,
    Canary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FactClassification {
    Connected,
    DerivedFromExistingSource,
    SupportedButNotActivated,
    SourceDoesNotCurrentlyExist,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AdapterKind {
    ManagerV2,
    GatewayCurrent,
    MarketDataCurrent,
    PortalControl,
    PortalDerived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CapabilityKind {
    Read,
    Action,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourcePins {
    pub trading_system_commit: String,
    pub portal_adapter_base_commit: String,
    pub manager_runtime_contract: String,
    pub manager_source_dark_contract: String,
    pub manager_catalogue_sha256: String,
    pub manager_source_proxy_image_sha256: String,
    pub manager_paper_image_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileBinding {
    pub profile: ExecutionProfile,
    pub manager_profile_id: String,
    pub source_profile: ExecutionProfile,
    pub baseline: FactClassification,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceBinding {
    pub id: String,
    pub adapter: AdapterKind,
    pub operation: String,
    pub relations: Vec<String>,
    pub profiles: Vec<ExecutionProfile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityBinding {
    pub id: String,
    pub kind: CapabilityKind,
    pub source_bindings: Vec<String>,
    pub portal_contract: String,
    pub classification: FactClassification,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenBinding {
    pub screen_id: String,
    pub views: Vec<String>,
    pub contract_refs: Vec<String>,
    pub read_capabilities: Vec<String>,
    pub action_capabilities: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentSourceMap {
    pub contract_version: String,
    pub phase: String,
    pub pins: SourcePins,
    pub profiles: Vec<ProfileBinding>,
    pub source_bindings: Vec<SourceBinding>,
    pub capabilities: Vec<CapabilityBinding>,
    pub screens: Vec<ScreenBinding>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MappingError {
    #[error("current-source map is not valid JSON")]
    InvalidJson,
    #[error("current-source map identity or immutable pin is invalid")]
    InvalidIdentity,
    #[error("current-source map contains a duplicate or missing identifier")]
    InvalidInventory,
    #[error("current-source map references an unknown source or capability")]
    UnknownReference,
    #[error("current-source map contains an unsafe source binding")]
    UnsafeSourceBinding,
    #[error("Canary must be Portal-derived from the Live source profile")]
    InvalidCanaryBinding,
    #[error("N13B command capability must remain non-connected")]
    CommandActivated,
    #[error("Manager relation is absent from the authenticated runtime catalogue: {0}")]
    ManagerRelationMissing(String),
    #[error("requested screen is not in the current-source contract")]
    UnknownScreen,
}

impl CurrentSourceMap {
    /// Parses and validates the repository-pinned canonical map.
    ///
    /// # Errors
    /// Returns [`MappingError`] on identity, inventory, reference or policy drift.
    pub fn canonical() -> Result<Self, MappingError> {
        let map: Self =
            serde_json::from_str(CANONICAL_MAP_JSON).map_err(|_| MappingError::InvalidJson)?;
        map.validate()?;
        Ok(map)
    }

    /// Validates the static, fail-closed compatibility rules.
    ///
    /// # Errors
    /// Returns [`MappingError`] for any incomplete, unsafe or ambiguous map.
    pub fn validate(&self) -> Result<(), MappingError> {
        if self.contract_version != CONTRACT_VERSION
            || self.phase != PHASE
            || !is_git_sha(&self.pins.trading_system_commit)
            || !is_git_sha(&self.pins.portal_adapter_base_commit)
            || !is_sha256(&self.pins.manager_catalogue_sha256)
            || !is_sha256(&self.pins.manager_source_proxy_image_sha256)
            || !is_sha256(&self.pins.manager_paper_image_sha256)
            || self.pins.manager_runtime_contract != manager_v2_contract::RUNTIME_CONTRACT_REVISION
            || self.pins.manager_source_dark_contract
                != manager_v2_contract::SOURCE_DARK_CONTRACT_REVISION
        {
            return Err(MappingError::InvalidIdentity);
        }

        let profiles = unique_by(&self.profiles, |item| item.profile)?;
        let expected_profiles = BTreeSet::from([
            ExecutionProfile::Paper,
            ExecutionProfile::Sandbox,
            ExecutionProfile::Live,
            ExecutionProfile::Canary,
        ]);
        if profiles != expected_profiles {
            return Err(MappingError::InvalidInventory);
        }
        let canary = self
            .profiles
            .iter()
            .find(|item| item.profile == ExecutionProfile::Canary)
            .ok_or(MappingError::InvalidCanaryBinding)?;
        if canary.source_profile != ExecutionProfile::Live
            || canary.manager_profile_id != "LIVE_BINANCE_USDM"
            || canary.baseline != FactClassification::DerivedFromExistingSource
        {
            return Err(MappingError::InvalidCanaryBinding);
        }

        let sources = unique_strings(self.source_bindings.iter().map(|item| &item.id))?;
        for binding in &self.source_bindings {
            validate_source(binding)?;
        }

        let capability_ids = unique_strings(self.capabilities.iter().map(|item| &item.id))?;
        for capability in &self.capabilities {
            if capability.source_bindings.is_empty()
                || capability.portal_contract.is_empty()
                || capability
                    .source_bindings
                    .iter()
                    .any(|source| !sources.contains(source))
            {
                return Err(MappingError::UnknownReference);
            }
            if capability.kind == CapabilityKind::Action
                && capability.classification == FactClassification::Connected
            {
                return Err(MappingError::CommandActivated);
            }
        }

        let screen_ids = unique_strings(self.screens.iter().map(|item| &item.screen_id))?;
        let required = REQUIRED_SCREENS
            .iter()
            .map(|value| (*value).to_owned())
            .collect::<BTreeSet<_>>();
        if screen_ids != required {
            return Err(MappingError::InvalidInventory);
        }
        for screen in &self.screens {
            if screen.views.is_empty()
                || screen.contract_refs.is_empty()
                || screen.read_capabilities.is_empty()
                || screen
                    .read_capabilities
                    .iter()
                    .chain(screen.action_capabilities.iter())
                    .any(|capability| !capability_ids.contains(capability))
            {
                return Err(MappingError::UnknownReference);
            }
        }
        Ok(())
    }

    /// Proves that every fixed Manager relation in this map exists in the
    /// authenticated catalogue returned for the deployment-bound profile.
    ///
    /// # Errors
    /// Returns [`MappingError::ManagerRelationMissing`] on catalogue drift.
    pub fn validate_manager_catalogue(
        &self,
        catalogue: &ManagerCatalogue,
    ) -> Result<(), MappingError> {
        for binding in self
            .source_bindings
            .iter()
            .filter(|binding| binding.adapter == AdapterKind::ManagerV2)
        {
            for relation in &binding.relations {
                let (schema, name) = split_relation(relation)?;
                if catalogue.relation(schema, name).is_none() {
                    return Err(MappingError::ManagerRelationMissing(relation.clone()));
                }
            }
        }
        Ok(())
    }

    /// Resolves one fixed screen binding. Callers cannot provide a relation,
    /// source URL, SQL fragment or profile through this method.
    ///
    /// # Errors
    /// Returns [`MappingError::UnknownScreen`] for an uncontracted screen.
    pub fn screen(&self, screen_id: &str) -> Result<&ScreenBinding, MappingError> {
        self.screens
            .iter()
            .find(|screen| screen.screen_id == screen_id)
            .ok_or(MappingError::UnknownScreen)
    }

    #[must_use]
    pub fn capabilities_by_id(&self) -> BTreeMap<&str, &CapabilityBinding> {
        self.capabilities
            .iter()
            .map(|capability| (capability.id.as_str(), capability))
            .collect()
    }
}

fn validate_source(binding: &SourceBinding) -> Result<(), MappingError> {
    if binding.id.is_empty()
        || binding.operation.is_empty()
        || binding.profiles.is_empty()
        || binding.profiles.contains(&ExecutionProfile::Canary)
        || binding
            .profiles
            .iter()
            .copied()
            .collect::<BTreeSet<_>>()
            .len()
            != binding.profiles.len()
    {
        return Err(MappingError::UnsafeSourceBinding);
    }
    match binding.adapter {
        AdapterKind::ManagerV2 => {
            if binding.operation != "RELATION_PAGE" || binding.relations.is_empty() {
                return Err(MappingError::UnsafeSourceBinding);
            }
            for relation in &binding.relations {
                split_relation(relation)?;
            }
        }
        AdapterKind::GatewayCurrent
        | AdapterKind::MarketDataCurrent
        | AdapterKind::PortalControl
        | AdapterKind::PortalDerived => {
            if !binding.relations.is_empty() {
                return Err(MappingError::UnsafeSourceBinding);
            }
        }
    }
    Ok(())
}

fn split_relation(relation: &str) -> Result<(&str, &str), MappingError> {
    let Some((schema, name)) = relation.split_once('.') else {
        return Err(MappingError::UnsafeSourceBinding);
    };
    if schema != "public"
        || name.is_empty()
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(MappingError::UnsafeSourceBinding);
    }
    Ok((schema, name))
}

fn is_git_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn unique_by<T, K: Ord + Copy>(
    values: &[T],
    key: impl Fn(&T) -> K,
) -> Result<BTreeSet<K>, MappingError> {
    let result = values.iter().map(key).collect::<BTreeSet<_>>();
    if result.len() != values.len() {
        return Err(MappingError::InvalidInventory);
    }
    Ok(result)
}

fn unique_strings<'a>(
    values: impl Iterator<Item = &'a String>,
) -> Result<BTreeSet<String>, MappingError> {
    let values = values.cloned().collect::<Vec<_>>();
    let result = values.iter().cloned().collect::<BTreeSet<_>>();
    if result.len() != values.len() || result.iter().any(String::is_empty) {
        return Err(MappingError::InvalidInventory);
    }
    Ok(result)
}

#[cfg(test)]
mod tests;
