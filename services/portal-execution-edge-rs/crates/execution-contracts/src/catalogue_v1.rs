//! Additive EPG10-02 contract primitives; no listener, source reader or authority.
//!
//! Shared strict DTOs mirror the pinned Research foundation, not the older V1
//! read envelope. The JSON Schema is normative for metric/score/PM DTOs.
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};

pub const SHARED_SCHEMA: &str = include_str!(
    "../../../contracts/execution-catalogue-v1/shared/execution-v2-foundation.v1.schema.json"
);
pub const REGISTRY: &str = include_str!("../../../contracts/execution-catalogue-v1/registry.json");
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum Error {
    #[error("INVALID_WIRE_VALUE")]
    InvalidWireValue,
    #[error("RESYNC_REQUIRED")]
    ResyncRequired,
    #[error("INVALID_PAGE_BOUNDS")]
    InvalidPageBounds,
    #[error("UNSTABLE_OR_DUPLICATE_KEY")]
    UnstableKey,
    #[error("RECORD_TOO_LARGE: use separately authorized bounded retrieval")]
    RecordTooLarge,
    #[error("SOURCE_COVERAGE_PROOF_MISMATCH")]
    CoverageProofMismatch,
    #[error("PROJECTION_LINEAGE_REQUIRED_OR_MISMATCH")]
    ProjectionMismatch,
    #[error("UNSUPPORTED_SCHEMA_OR_REQUIRED_FEATURE")]
    UnsupportedSchema,
}

/// Shared opaque text, deliberately never parsed as a numeric ID/sequence.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct Opaque(String);

impl Opaque {
    /// # Errors
    /// Rejects empty text or more than 256 Unicode characters.
    pub fn parse(value: impl Into<String>) -> Result<Self, Error> {
        let value = value.into();
        if value.is_empty() || value.chars().count() > 256 {
            return Err(Error::InvalidWireValue);
        }
        Ok(Self(value))
    }
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl<'de> Deserialize<'de> for Opaque {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Self::parse(String::deserialize(d)?).map_err(de::Error::custom)
    }
}

/// Plain exact decimal lexeme. No floating-point or fixed-precision conversion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct ExactDecimal(String);
impl ExactDecimal {
    /// # Errors
    /// Rejects non-canonical syntax or more than the shared 128 ASCII bytes.
    pub fn parse(value: impl Into<String>) -> Result<Self, Error> {
        let value = value.into();
        let unsigned = value.strip_prefix('-').unwrap_or(&value);
        let mut pieces = unsigned.split('.');
        let whole = pieces.next().unwrap_or("");
        let fraction = pieces.next();
        if value.len() > 128
            || whole.is_empty()
            || !whole.bytes().all(|b| b.is_ascii_digit())
            || (whole.len() > 1 && whole.starts_with('0'))
            || fraction.is_some_and(|s| s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()))
            || pieces.next().is_some()
        {
            return Err(Error::InvalidWireValue);
        }
        Ok(Self(value))
    }
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl<'de> Deserialize<'de> for ExactDecimal {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Self::parse(String::deserialize(d)?).map_err(de::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct SafeInteger(u64);
impl SafeInteger {
    /// # Errors
    /// Rejects numbers outside the exact browser integer range.
    pub fn new(value: u64) -> Result<Self, Error> {
        if value > MAX_SAFE_INTEGER {
            return Err(Error::InvalidWireValue);
        }
        Ok(Self(value))
    }
    #[must_use]
    pub fn get(self) -> u64 {
        self.0
    }
}
impl<'de> Deserialize<'de> for SafeInteger {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Self::new(u64::deserialize(d)?).map_err(de::Error::custom)
    }
}

/// Exact source clock retained beside the browser's millisecond observation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LegacyClock {
    pub utc_ms: SafeInteger,
    pub source_timestamp: Opaque,
    pub sub_ms_nanoseconds: u32,
}
/// This converts a clock only, never a journal order or continuity generation.
/// # Errors
/// Rejects malformed, pre-epoch or out-of-browser-range clocks.
pub fn legacy_clock(source: &str) -> Result<LegacyClock, Error> {
    let parsed =
        chrono::DateTime::parse_from_rfc3339(source).map_err(|_| Error::InvalidWireValue)?;
    let ms = u64::try_from(parsed.timestamp_millis()).map_err(|_| Error::InvalidWireValue)?;
    Ok(LegacyClock {
        utc_ms: SafeInteger::new(ms)?,
        source_timestamp: Opaque::parse(source)?,
        sub_ms_nanoseconds: parsed.timestamp_subsec_nanos() % 1_000_000,
    })
}

macro_rules! wire_enum {
    ($name:ident { $($variant:ident => $wire:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name { $(#[serde(rename=$wire)] $variant),+ }
    };
}
wire_enum!(Completeness { Complete=>"COMPLETE", Partial=>"PARTIAL", Unresolved=>"UNRESOLVED" });
wire_enum!(Freshness { Fresh=>"FRESH", Stale=>"STALE", Unknown=>"UNKNOWN" });
wire_enum!(Coverage { AuthorizedOnly=>"AUTHORIZED_ONLY", CurrentPageOnly=>"CURRENT_PAGE_ONLY", RetainedObservations=>"RETAINED_OBSERVATIONS" });
wire_enum!(Confidence { Verified=>"VERIFIED", Provisional=>"PROVISIONAL", Unknown=>"UNKNOWN" });
wire_enum!(EventKind { Snapshot=>"SNAPSHOT", Upsert=>"UPSERT", Correction=>"CORRECTION", Tombstone=>"TOMBSTONE", ResyncRequired=>"RESYNC_REQUIRED" });
wire_enum!(Environment { Paper=>"paper", Sandbox=>"sandbox", Live=>"live" });
wire_enum!(Stage { Paper=>"PAPER", Sandbox=>"SANDBOX", Canary=>"CANARY", Live=>"LIVE" });
wire_enum!(Lifecycle { Active=>"ACTIVE", ArchiveRequested=>"ARCHIVE_REQUESTED", Archived=>"ARCHIVED" });
wire_enum!(TradeState { Active=>"ACTIVE", Reducing=>"REDUCING", Halted=>"HALTED" });

fn required_nullable<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d)
}

fn bounded_reasons<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<Opaque>, D::Error> {
    let reasons = Vec::<Opaque>::deserialize(d)?;
    if reasons.len() > 32 {
        return Err(de::Error::custom("QUALITY_REASON_LIMIT"));
    }
    Ok(reasons)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Quality {
    pub completeness: Completeness,
    pub freshness: Freshness,
    pub coverage: Coverage,
    #[serde(deserialize_with = "required_nullable")]
    pub source_as_of_ms: Option<SafeInteger>,
    pub portal_observed_at_ms: SafeInteger,
    pub source_set_ref: Opaque,
    pub confidence: Confidence,
    #[serde(deserialize_with = "bounded_reasons")]
    pub reasons: Vec<Opaque>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Metadata {
    contract_version: EdgeVersion,
    pub source_continuity_epoch: Opaque,
    pub projection_generation: Opaque,
    pub event_id: Opaque,
    pub event_kind: EventKind,
    pub continuation: Opaque,
    pub emitted_at_ms: SafeInteger,
    pub as_of_ms: SafeInteger,
    #[serde(deserialize_with = "required_nullable")]
    pub source_observed_at_ms: Option<SafeInteger>,
    #[serde(deserialize_with = "required_nullable")]
    pub coverage_watermark: Option<Opaque>,
    pub policy_revision: Opaque,
    pub quality: Quality,
    #[serde(deserialize_with = "required_nullable")]
    pub entity_key: Option<Opaque>,
    #[serde(deserialize_with = "required_nullable")]
    pub entity_revision: Option<Opaque>,
    #[serde(deserialize_with = "required_nullable")]
    pub replacement_ref: Option<Opaque>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
enum EdgeVersion {
    #[serde(rename = "edge.v1")]
    V1,
}

#[derive(Debug, Clone)]
pub struct CoverageProof {
    pub source_set_ref: Opaque,
    pub as_of_ms: SafeInteger,
    pub facts_through_ms: SafeInteger,
    pub recorded_through_ms: SafeInteger,
}
#[derive(Debug, Clone)]
pub enum Projection {
    ReusedEdge,
    PortalDerived {
        generation: Opaque,
        lineage_ref: Opaque,
    },
}
pub struct BrowserContext {
    pub snapshot_id: Opaque,
    pub dataset: Opaque,
    pub produced_at_ms: SafeInteger,
    pub received_at_ms: SafeInteger,
    pub projection: Projection,
    pub coverage_proof: Option<CoverageProof>,
}

impl Metadata {
    /// Explicit `edge-to-portal-metadata.v1` mapping. Validation is not auth.
    /// # Errors
    /// Rejects malformed reason bounds or mismatched source coverage proof.
    pub fn to_browser(&self, context: &BrowserContext) -> Result<Value, Error> {
        if self.quality.reasons.len() > 32 {
            return Err(Error::InvalidWireValue);
        }
        let mut quality = self.quality.clone();
        let (facts, recorded) = if let Some(proof) = &context.coverage_proof {
            if proof.source_set_ref != self.quality.source_set_ref
                || proof.as_of_ms != self.as_of_ms
            {
                return Err(Error::CoverageProofMismatch);
            }
            (
                Some(proof.facts_through_ms),
                Some(proof.recorded_through_ms),
            )
        } else {
            quality.completeness = Completeness::Unresolved;
            let mut unique = Vec::new();
            for reason in &quality.reasons {
                if !unique.contains(reason) {
                    unique.push(reason.clone());
                }
            }
            quality.reasons = unique;
            let reason = Opaque::parse("COVERAGE_PROOF_NOT_PUBLISHED")?;
            if !quality.reasons.contains(&reason) {
                quality.reasons.push(reason);
            }
            if quality.reasons.len() > 32 {
                return Err(Error::InvalidWireValue);
            }
            (None, None)
        };
        let (generation, lineage) = match &context.projection {
            Projection::ReusedEdge => (&self.projection_generation, None),
            Projection::PortalDerived {
                generation,
                lineage_ref,
            } => (generation, Some(lineage_ref)),
        };
        Ok(
            json!({"schema_version":"portal.snapshot.v1","snapshot_id":context.snapshot_id,
            "dataset":context.dataset,"as_of_ms":self.as_of_ms,"recorded_through_ms":recorded,
            "facts_through_ms":facts,"produced_at_ms":context.produced_at_ms,"received_at_ms":context.received_at_ms,
            "source_observed_at_ms":self.source_observed_at_ms,"emitted_at_ms":self.emitted_at_ms,
            "quality":quality,"resume_cursor":self.continuation,"coverage_watermark":self.coverage_watermark,
            "versions":{"source_continuity_epoch":self.source_continuity_epoch,
                "projection_generation":generation,"app_policy":self.policy_revision},
            "projection_lineage_ref":lineage,"adapter_revision":"edge-to-portal-metadata.v1"}),
        )
    }

    /// Separate scope adapter BEFORE the unchanged shared metadata mapper.
    /// The caller authenticates/persists the source↔BFF cursor relation. This
    /// contract function neither signs tokens nor grants access.
    /// # Errors
    /// Propagates shared mapping validation errors.
    pub fn to_scoped_browser(
        &self,
        context: &BrowserContext,
        bff_cursor: Opaque,
    ) -> Result<Value, Error> {
        let mut scoped = self.clone();
        scoped.continuation = bff_cursor;
        Ok(
            json!({"mapping_revision":"execution.scoped-continuation.v1",
            "snapshot":scoped.to_browser(context)?}),
        )
    }
}

wire_enum!(HistoryCapability { CurrentOnly=>"CURRENT_ONLY", HistoryAvailable=>"HISTORY_AVAILABLE", Unknown=>"UNKNOWN" });
wire_enum!(Implementation { Planned=>"PLANNED", SourceVerified=>"SOURCE_VERIFIED", RuntimePending=>"RUNTIME_PENDING", RuntimeVerified=>"RUNTIME_VERIFIED" });
wire_enum!(GuideAvailability { Available=>"AVAILABLE", Partial=>"PARTIAL", Unavailable=>"UNAVAILABLE", OutOfScope=>"OUT_OF_SCOPE" });
wire_enum!(LegacyDisposition { CurrentOnly=>"CURRENT_ONLY", HistoryAvailable=>"HISTORY_AVAILABLE", Planned=>"PLANNED", SourceVerified=>"SOURCE_VERIFIED", RuntimePending=>"RUNTIME_PENDING", Restricted=>"RESTRICTED" });
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MappedDisposition {
    pub availability: GuideAvailability,
    pub history_capability: HistoryCapability,
    pub implementation_status: Implementation,
    pub reason_code: Option<&'static str>,
}
/// Explicit legacy truth mapping. Qualification inputs must be producer proof,
/// never inferred from a successful current-page response or caller claims.
#[must_use]
pub fn map_legacy(
    status: LegacyDisposition,
    history_requested: bool,
    qualified_current: bool,
    qualified_history: bool,
) -> MappedDisposition {
    let (history, implementation, served, reason) = match status {
        LegacyDisposition::CurrentOnly => (
            HistoryCapability::CurrentOnly,
            if qualified_current {
                Implementation::RuntimeVerified
            } else {
                Implementation::RuntimePending
            },
            qualified_current && !history_requested,
            "HISTORY_OR_CURRENT_PROOF_UNAVAILABLE",
        ),
        LegacyDisposition::HistoryAvailable => (
            HistoryCapability::HistoryAvailable,
            if qualified_current || qualified_history {
                Implementation::RuntimeVerified
            } else {
                Implementation::RuntimePending
            },
            if history_requested {
                qualified_history
            } else {
                qualified_current
            },
            "COVERAGE_PROOF_UNAVAILABLE",
        ),
        LegacyDisposition::Planned => (
            HistoryCapability::Unknown,
            Implementation::Planned,
            false,
            "NOT_IMPLEMENTED",
        ),
        LegacyDisposition::SourceVerified => (
            HistoryCapability::Unknown,
            Implementation::SourceVerified,
            false,
            "EXPORT_NOT_QUALIFIED",
        ),
        LegacyDisposition::RuntimePending => (
            HistoryCapability::Unknown,
            Implementation::RuntimePending,
            false,
            "EXPORT_NOT_QUALIFIED",
        ),
        LegacyDisposition::Restricted => {
            return MappedDisposition {
                availability: GuideAvailability::OutOfScope,
                history_capability: HistoryCapability::Unknown,
                implementation_status: Implementation::Planned,
                reason_code: Some("RESOURCE_NOT_AVAILABLE"),
            }
        }
    };
    MappedDisposition {
        availability: if served {
            GuideAvailability::Available
        } else {
            GuideAvailability::Unavailable
        },
        history_capability: history,
        implementation_status: implementation,
        reason_code: if served { None } else { Some(reason) },
    }
}
/// Versioned guide-to-foundation-status.v1 mapping; no resource identifiers or
/// private reason are emitted for restricted/hidden resources.
#[must_use]
pub fn shared_availability(value: GuideAvailability) -> Value {
    match value {
        GuideAvailability::Available => json!({"state":"AVAILABLE","reason_code":null}),
        GuideAvailability::Partial => {
            json!({"state":"PARTIAL","reason_code":"PARTIAL_SOURCE_COVERAGE"})
        }
        GuideAvailability::Unavailable => {
            json!({"state":"UNAVAILABLE","reason_code":"SOURCE_NOT_AVAILABLE"})
        }
        GuideAvailability::OutOfScope => {
            json!({"state":"DENIED","reason_code":"RESOURCE_NOT_AVAILABLE"})
        }
    }
}

/// Server-held/authenticated context, not an authorizing or signed token codec.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CursorBinding {
    pub dataset: Opaque,
    pub principal: Opaque,
    pub scope_digest: Opaque,
    pub filter_digest: Opaque,
    pub authorization_revision: Opaque,
    pub source_continuity_epoch: Opaque,
    pub projection_generation: Opaque,
    pub snapshot_id: Opaque,
    pub schema: Opaque,
    pub expires_at_ms: SafeInteger,
}
impl CursorBinding {
    /// Call only after authenticating the cursor and authorizing current scope.
    /// # Errors
    /// Changed bindings or expiration require resync, never a widened query.
    pub fn check(&self, current: &Self, now: SafeInteger) -> Result<(), Error> {
        if self != current || now >= self.expires_at_ms {
            return Err(Error::ResyncRequired);
        }
        Ok(())
    }
}

pub struct Record {
    /// Full ordered tuple ending in an immutable unique ID, within one snapshot.
    pub key: Vec<Opaque>,
    pub value: Value,
}
pub struct PageLimits {
    pub rows: usize,
    pub bytes: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    pub schema_version: String,
    pub snapshot_id: Opaque,
    pub rows: Vec<Value>,
    #[serde(deserialize_with = "required_nullable")]
    pub continuation: Option<Opaque>,
}
/// Pure contract/reference paginator, not a DB reader. Input is already authorized
/// and pinned to one snapshot. Runtime adapters must use indexed bounded queries.
/// # Errors
/// Rejects unstable keys, bad bounds, invalid after-key or an oversized record.
pub fn bounded_page<F>(
    records: &[Record],
    after: Option<&[Opaque]>,
    snapshot: Opaque,
    limits: &PageLimits,
    mut issue_cursor: F,
) -> Result<Page, Error>
where
    F: FnMut(&[Opaque]) -> Result<Opaque, Error>,
{
    if limits.rows == 0 || limits.bytes == 0 {
        return Err(Error::InvalidPageBounds);
    }
    if records.iter().any(|r| r.key.is_empty()) || records.windows(2).any(|p| p[0].key >= p[1].key)
    {
        return Err(Error::UnstableKey);
    }
    let start = match after {
        None => 0,
        Some(key) => {
            records
                .iter()
                .position(|r| r.key == key)
                .ok_or(Error::ResyncRequired)?
                + 1
        }
    };
    let mut page = Page {
        schema_version: "execution.catalogue-page.v1".into(),
        snapshot_id: snapshot,
        rows: vec![],
        continuation: None,
    };
    if serde_json::to_vec(&page)
        .map_err(|_| Error::InvalidWireValue)?
        .len()
        > limits.bytes
    {
        return Err(Error::InvalidPageBounds);
    }
    for (offset, record) in records[start..].iter().take(limits.rows).enumerate() {
        let previous_cursor = page.continuation.clone();
        page.rows.push(record.value.clone());
        page.continuation = if start + offset + 1 < records.len() {
            Some(issue_cursor(&record.key)?)
        } else {
            None
        };
        if serde_json::to_vec(&page)
            .map_err(|_| Error::InvalidWireValue)?
            .len()
            > limits.bytes
        {
            page.rows.pop();
            page.continuation = previous_cursor;
            if page.rows.is_empty() {
                return Err(Error::RecordTooLarge);
            }
            break;
        }
    }
    Ok(page)
}

/// Negotiated outer registry extensions are additive. Shared strict DTOs do not
/// accept extra fields under an unchanged schema ID: negotiate a version first.
/// # Errors
/// Rejects incompatible majors or unknown required semantics.
pub fn compatible(major: u32, required: &[Opaque], supported: &[Opaque]) -> Result<(), Error> {
    if major != 1 || required.iter().any(|r| !supported.contains(r)) {
        return Err(Error::UnsupportedSchema);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
