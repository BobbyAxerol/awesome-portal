//! Additive, source-dark scoped bootstrap protocol.
//!
//! These types do not establish source completeness, current authorization or
//! publication readiness themselves. A trusted source adapter must authenticate
//! every manifest/page/group/chunk and the store must atomically validate and
//! commit its complete group. No production verifier or source is installed here.

use std::collections::{BTreeMap, BTreeSet};
use std::io;

use projection_core::canonical_digest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::{validate_identifier, validate_sha256, AuthoritativeEvent, EventStreamBinding};

const MAX_PAGE_ROWS: usize = 200;
const MAX_PAGE_BYTES: usize = 1024 * 1024;
const MAX_GROUP_EVENTS: usize = 1_000;
const MAX_GROUP_BYTES: usize = 8 * 1024 * 1024;
const MAX_GROUP_CHUNKS: usize = 64;
const MAX_LIFETIME_MS: i64 = 300_000;
const MAX_PROOF_AGE_MS: i64 = 30_000;
const MAX_OPAQUE_BYTES: usize = 4_096;
const MAX_ORDINAL: u64 = 9_223_372_036_854_775_807;
const MAX_TIMESTAMP_MS: i64 = 9_007_199_254_740_991;

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolError {
    #[error("invalid scoped bootstrap contract")]
    Invalid,
    #[error("scoped bootstrap safety bound exceeded")]
    Bounds,
    #[error("scoped bootstrap integrity conflict")]
    Integrity,
    #[error("scoped bootstrap binding mismatch")]
    Scope,
    #[error("scoped bootstrap lifetime expired")]
    Expired,
    #[error("source proof was not independently authenticated")]
    Untrusted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub source: EventStreamBinding,
    pub source_epoch: String,
    pub consumer_id: String,
    pub principal_digest: String,
    pub policy_revision: String,
    pub query_digest: String,
    pub consistency_group: String,
    /// Exact dataset -> payload-schema mapping; not an inferred table census.
    pub datasets: BTreeMap<String, String>,
}

impl Binding {
    /// Validates the exact source, identity, policy and dataset binding.
    ///
    /// # Errors
    /// Rejects missing/malformed binding metadata or an empty dataset set.
    pub fn validate(&self) -> Result<(), ProtocolError> {
        bounded_bytes(self, MAX_PAGE_BYTES)?;
        self.source.validate().map_err(|_| ProtocolError::Invalid)?;
        for value in [
            &self.source_epoch,
            &self.consumer_id,
            &self.policy_revision,
            &self.consistency_group,
        ] {
            identifier(value)?;
        }
        digest_shape(&self.principal_digest)?;
        digest_shape(&self.query_digest)?;
        if self.datasets.is_empty() {
            return Err(ProtocolError::Invalid);
        }
        for (dataset, schema) in &self.datasets {
            identifier(dataset)?;
            identifier(schema)?;
        }
        Ok(())
    }

    /// Returns the canonical digest of the full binding.
    ///
    /// # Errors
    /// Rejects malformed bindings or serialization failure.
    pub fn digest(&self) -> Result<String, ProtocolError> {
        self.validate()?;
        hash(self)
    }

    /// Returns the stable consumer/group fencing slot, not a cursor identity.
    ///
    /// Policy, principal, epoch and dataset changes deliberately keep this slot
    /// so a replacement generation fences the previous binding. They still
    /// change the full binding digest used by every proof and persisted row.
    ///
    /// # Errors
    /// Rejects malformed bindings or serialization failure.
    pub fn slot_key(&self) -> Result<String, ProtocolError> {
        self.validate()?;
        hash(&(
            &self.source.workspace_id,
            &self.source.environment,
            &self.source.profile_id,
            &self.consumer_id,
            &self.consistency_group,
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Revision {
    /// Source-declared entity ordering, never derived from an opaque version.
    #[serde(with = "decimal_u64")]
    pub ordinal: u64,
    pub opaque: String,
}

impl Revision {
    /// Validates a positive database-safe source-declared revision.
    ///
    /// # Errors
    /// Rejects zero/overflow ordinal or malformed opaque version.
    pub fn validate(&self) -> Result<(), ProtocolError> {
        if self.ordinal == 0 || self.ordinal > MAX_ORDINAL {
            return Err(ProtocolError::Bounds);
        }
        identifier(&self.opaque)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotRow {
    pub dataset: String,
    pub entity_id: String,
    pub revision: Revision,
    pub payload: Value,
}

#[derive(Serialize)]
struct ProjectedRow<'a> {
    dataset: &'a str,
    entity_id: &'a str,
    revision: &'a Revision,
    payload: &'a Value,
}

impl SnapshotRow {
    /// Validates a current-state row without interpreting business fields.
    ///
    /// # Errors
    /// Rejects an undeclared dataset, invalid identity/revision or non-object.
    pub fn validate(&self, manifest: &Manifest) -> Result<(), ProtocolError> {
        if !manifest.binding.datasets.contains_key(&self.dataset) {
            return Err(ProtocolError::Scope);
        }
        identifier(&self.entity_id)?;
        self.revision.validate()?;
        if !self.payload.is_object() {
            return Err(ProtocolError::Invalid);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reference {
    pub from_dataset: String,
    /// Exact top-level payload field containing the referenced entity ID.
    pub field: String,
    pub to_dataset: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PagePlan {
    /// Number of pages, not an event count or a hidden-scope count.
    #[serde(with = "decimal_u64")]
    pub count: u64,
    pub final_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub binding: Binding,
    pub generation: Uuid,
    pub snapshot_id: String,
    pub barrier: String,
    pub delta_start: String,
    pub catchup_cursor: String,
    pub expires_at_ms: i64,
    pub rollback_until_ms: i64,
    pub pages: BTreeMap<String, PagePlan>,
    pub references: Vec<Reference>,
}

impl Manifest {
    /// Validates a new finite snapshot and its exact page/schema manifest.
    ///
    /// # Errors
    /// Rejects expired/overlong lifetimes, scope or manifest integrity drift.
    pub fn validate(&self, limits: &Limits, now: i64) -> Result<(), ProtocolError> {
        limits.validate()?;
        self.validate_structure()?;
        bounded_bytes(self, limits.page_bytes)?;
        future_bound(self.expires_at_ms, now, limits.snapshot_ttl_ms)?;
        future_bound(self.rollback_until_ms, now, limits.rollback_ttl_ms)
    }

    /// Validates immutable manifest identity without renewing snapshot lifetime.
    ///
    /// A store may use this only to resume an already durably completed snapshot
    /// under fresh authentication and its persisted limits. New bootstrap and
    /// page staging must additionally enforce the original snapshot expiry.
    ///
    /// # Errors
    /// Rejects malformed scope, page/schema coverage, references or digests.
    pub fn validate_structure(&self) -> Result<(), ProtocolError> {
        bounded_bytes(self, MAX_PAGE_BYTES)?;
        self.binding.validate()?;
        generation(self.generation)?;
        identifier(&self.snapshot_id)?;
        for cursor in [&self.barrier, &self.delta_start, &self.catchup_cursor] {
            opaque(cursor)?;
        }
        timestamp(self.expires_at_ms)?;
        timestamp(self.rollback_until_ms)?;
        if self.pages.keys().ne(self.binding.datasets.keys()) {
            return Err(ProtocolError::Scope);
        }
        for (dataset, plan) in &self.pages {
            if plan.count > MAX_ORDINAL {
                return Err(ProtocolError::Bounds);
            }
            digest_shape(&plan.final_digest)?;
            if plan.count == 0 && plan.final_digest != page_seed(self, dataset)? {
                return Err(ProtocolError::Integrity);
            }
        }
        let mut references = BTreeSet::new();
        for reference in &self.references {
            identifier(&reference.field)?;
            if !self.binding.datasets.contains_key(&reference.from_dataset)
                || !self.binding.datasets.contains_key(&reference.to_dataset)
            {
                return Err(ProtocolError::Scope);
            }
            if !references.insert((
                &reference.from_dataset,
                &reference.field,
                &reference.to_dataset,
            )) {
                return Err(ProtocolError::Integrity);
            }
        }
        Ok(())
    }
}

/// Initial hash-chain anchor for one dataset at one authenticated snapshot cut.
///
/// # Errors
/// Rejects malformed bindings, undeclared datasets or serialization failure.
pub fn page_seed(manifest: &Manifest, dataset: &str) -> Result<String, ProtocolError> {
    if !manifest.binding.datasets.contains_key(dataset) {
        return Err(ProtocolError::Scope);
    }
    hash(&(
        &manifest.snapshot_id,
        manifest.binding.digest()?,
        dataset,
        manifest.generation,
        &manifest.barrier,
    ))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotPage {
    pub generation: Uuid,
    pub dataset: String,
    /// Zero-based stable page position within the declared dataset plan.
    #[serde(with = "decimal_u64")]
    pub index: u64,
    pub previous_digest: String,
    pub rows: Vec<SnapshotRow>,
}

impl SnapshotPage {
    /// Computes the full ordered page hash without normalizing payload fields.
    ///
    /// # Errors
    /// Returns an error on canonical serialization failure.
    pub fn chain_digest(&self) -> Result<String, ProtocolError> {
        hash(self)
    }

    /// Validates one page; durable storage separately checks its predecessor.
    ///
    /// # Errors
    /// Rejects expiry, bounds, undeclared/mismatched rows or invalid chain ends.
    pub fn validate(
        &self,
        manifest: &Manifest,
        limits: &Limits,
        now: i64,
    ) -> Result<(), ProtocolError> {
        limits.validate()?;
        manifest.validate_structure()?;
        future_bound(manifest.expires_at_ms, now, limits.snapshot_ttl_ms)?;
        if self.generation != manifest.generation {
            return Err(ProtocolError::Scope);
        }
        let plan = manifest
            .pages
            .get(&self.dataset)
            .ok_or(ProtocolError::Scope)?;
        if self.index >= plan.count {
            return Err(ProtocolError::Integrity);
        }
        if self.rows.len() > limits.page_rows {
            return Err(ProtocolError::Bounds);
        }
        bounded_bytes(self, limits.page_bytes)?;
        digest_shape(&self.previous_digest)?;
        if self.index == 0 && self.previous_digest != page_seed(manifest, &self.dataset)? {
            return Err(ProtocolError::Integrity);
        }
        let mut keys = BTreeSet::new();
        for row in &self.rows {
            if row.dataset != self.dataset {
                return Err(ProtocolError::Scope);
            }
            row.validate(manifest)?;
            if !keys.insert(&row.entity_id) {
                return Err(ProtocolError::Integrity);
            }
        }
        if self.index + 1 == plan.count && self.chain_digest()? != plan.final_digest {
            return Err(ProtocolError::Integrity);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeltaEvent {
    /// `entity_kind` is the declared dataset; payload schema must match binding.
    pub event: AuthoritativeEvent,
    pub revision: Revision,
}

impl DeltaEvent {
    /// Validates the exact existing immutable event plus declared revision.
    ///
    /// # Errors
    /// Rejects event/epoch/schema/version drift; does not compare opaque cursors.
    pub fn validate(&self, manifest: &Manifest) -> Result<(), ProtocolError> {
        self.event.validate().map_err(|_| ProtocolError::Invalid)?;
        self.revision.validate()?;
        identifier(self.event.event_id.as_str())?;
        identifier(self.event.entity_id.as_str())?;
        for reference in [
            &self.event.correction_of_event_id,
            &self.event.tombstone_of_event_id,
            &self.event.causation_id,
            &self.event.correlation_id,
        ]
        .into_iter()
        .flatten()
        {
            identifier(reference.as_str())?;
        }
        let schema = manifest
            .binding
            .datasets
            .get(&self.event.entity_kind)
            .ok_or(ProtocolError::Scope)?;
        if self.event.source_position.source_epoch != manifest.binding.source_epoch
            || &self.event.payload_schema_revision != schema
            || self.event.entity_version != self.revision.opaque
        {
            return Err(ProtocolError::Scope);
        }
        if self
            .event
            .source_position
            .sequence_u64()
            .map_err(|_| ProtocolError::Invalid)?
            > MAX_ORDINAL
        {
            return Err(ProtocolError::Bounds);
        }
        timestamp(self.event.event_time_ms)?;
        timestamp(self.event.source_published_at_ms)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeltaGroup {
    pub generation: Uuid,
    pub group_id: String,
    pub from_cursor: String,
    pub to_cursor: String,
    pub chunk_digests: Vec<String>,
    pub events_digest: String,
    pub reached_catchup: bool,
}

impl DeltaGroup {
    /// Validates a complete-group manifest, including hidden-only scan groups.
    ///
    /// Old snapshot expiry does not expire a READY stream. Trusted transport
    /// proves current policy, retained scan coverage and cursor transitions.
    ///
    /// # Errors
    /// Rejects malformed group metadata, hashes, bounds or generation mismatch.
    pub fn validate(
        &self,
        manifest: &Manifest,
        limits: &Limits,
        now: i64,
    ) -> Result<(), ProtocolError> {
        limits.validate()?;
        timestamp(now)?;
        manifest.validate_structure()?;
        if self.generation != manifest.generation {
            return Err(ProtocolError::Scope);
        }
        identifier(&self.group_id)?;
        opaque(&self.from_cursor)?;
        opaque(&self.to_cursor)?;
        digest_shape(&self.events_digest)?;
        if self.chunk_digests.len() > limits.group_chunks {
            return Err(ProtocolError::Bounds);
        }
        bounded_bytes(self, limits.group_bytes)?;
        let mut digests = BTreeSet::new();
        for digest in &self.chunk_digests {
            digest_shape(digest)?;
            if !digests.insert(digest) {
                return Err(ProtocolError::Integrity);
            }
        }
        if self.chunk_digests.is_empty() && self.events_digest != events_digest(&[])? {
            return Err(ProtocolError::Integrity);
        }
        if self.reached_catchup && self.to_cursor != manifest.catchup_cursor {
            return Err(ProtocolError::Integrity);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeltaChunk {
    pub generation: Uuid,
    pub group_id: String,
    #[serde(with = "decimal_u64")]
    pub index: u64,
    pub events: Vec<DeltaEvent>,
}

impl DeltaChunk {
    /// Computes the complete ordered chunk digest, including its identity.
    ///
    /// # Errors
    /// Returns an error on canonical serialization failure.
    pub fn digest(&self) -> Result<String, ProtocolError> {
        hash(self)
    }

    /// Validates one bounded chunk, not its group's complete publication.
    ///
    /// # Errors
    /// Rejects malformed events, bounds or generation mismatch. The store must
    /// additionally verify all chunks and enforce aggregate group row/byte caps.
    pub fn validate(
        &self,
        manifest: &Manifest,
        limits: &Limits,
        now: i64,
    ) -> Result<(), ProtocolError> {
        limits.validate()?;
        timestamp(now)?;
        manifest.validate_structure()?;
        if self.generation != manifest.generation {
            return Err(ProtocolError::Scope);
        }
        identifier(&self.group_id)?;
        if self.index >= u64::try_from(limits.group_chunks).map_err(|_| ProtocolError::Bounds)?
            || self.events.len() > limits.group_events
        {
            return Err(ProtocolError::Bounds);
        }
        bounded_bytes(self, limits.group_bytes)?;
        validate_events(&self.events, manifest, limits)
    }
}

/// Validates all events of a chunk or a complete, ordered consistency group.
///
/// Exact transport duplicates are harmless; conflicting immutable event/source
/// identities are not. Sparse positions are valid and are not a loss detector.
/// The store must repeat this check across the assembled chunks and enforce
/// immutable identities against already committed facts in its transaction.
///
/// # Errors
/// Rejects row/group bounds, conflicting identities or malformed event bindings.
pub fn validate_events(
    events: &[DeltaEvent],
    manifest: &Manifest,
    limits: &Limits,
) -> Result<(), ProtocolError> {
    limits.validate()?;
    manifest.validate_structure()?;
    if events.len() > limits.group_events {
        return Err(ProtocolError::Bounds);
    }
    bounded_bytes(&events, limits.group_bytes)?;
    let mut identities = BTreeMap::new();
    let mut positions = BTreeMap::new();
    let mut previous_sequence = 0;
    for input in events {
        input.validate(manifest)?;
        let event = &input.event;
        let sequence = event
            .source_position
            .sequence_u64()
            .map_err(|_| ProtocolError::Invalid)?;
        if sequence < previous_sequence {
            return Err(ProtocolError::Integrity);
        }
        previous_sequence = sequence;
        bounded_bytes(
            &ProjectedRow {
                dataset: &event.entity_kind,
                entity_id: event.entity_id.as_str(),
                revision: &input.revision,
                payload: &event.payload,
            },
            limits.page_bytes,
        )?;
        let event_id = event.event_id.as_str();
        let event_digest = hash(input)?;
        if identities
            .insert(event_id, event_digest.clone())
            .is_some_and(|previous| previous != event_digest)
        {
            return Err(ProtocolError::Integrity);
        }
        let identity = (event_id, event_digest);
        if positions
            .insert(
                event.source_position.source_sequence.as_str(),
                identity.clone(),
            )
            .is_some_and(|previous| previous != identity)
        {
            return Err(ProtocolError::Integrity);
        }
    }
    Ok(())
}

/// Canonical digest of the entire ordered event list, not chunk count metadata.
///
/// # Errors
/// Returns an error on canonical serialization failure.
pub fn events_digest(events: &[DeltaEvent]) -> Result<String, ProtocolError> {
    hash(events)
}

/// Explicit isolated safety limits, deliberately without a production Default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    pub page_rows: usize,
    pub page_bytes: usize,
    pub group_events: usize,
    pub group_bytes: usize,
    pub group_chunks: usize,
    pub snapshot_ttl_ms: i64,
    pub rollback_ttl_ms: i64,
}

impl Limits {
    /// Checks explicit positive values against hard isolated safety ceilings.
    ///
    /// # Errors
    /// Rejects zero, negative, overflow or larger-than-approved bounds.
    pub fn validate(&self) -> Result<(), ProtocolError> {
        for (value, maximum) in [
            (self.page_rows, MAX_PAGE_ROWS),
            (self.page_bytes, MAX_PAGE_BYTES),
            (self.group_events, MAX_GROUP_EVENTS),
            (self.group_bytes, MAX_GROUP_BYTES),
            (self.group_chunks, MAX_GROUP_CHUNKS),
        ] {
            if value == 0 || value > maximum {
                return Err(ProtocolError::Bounds);
            }
        }
        for ttl in [self.snapshot_ttl_ms, self.rollback_ttl_ms] {
            if !(1..=MAX_LIFETIME_MS).contains(&ttl) {
                return Err(ProtocolError::Bounds);
            }
        }
        Ok(())
    }
}

/// Trusted adapter boundary: implementations must authenticate source bytes,
/// current workload/policy scope, proof kind, expiry and the exact input digest.
/// No accepting runtime implementation is supplied by this module.
pub trait SourceProofVerifier {
    fn verify(
        &self,
        binding: &Binding,
        kind: &str,
        input_digest: &str,
        proof: &str,
        now_ms: i64,
    ) -> bool;
}

/// Authenticated immutable input. It cannot be deserialized or constructed by
/// assigning fields; a bare contract value is not authenticated source evidence.
#[derive(Debug, Clone)]
pub struct Verified<T> {
    value: T,
    binding_digest: String,
    kind: String,
    verified_at: i64,
}

impl<T: Serialize> Verified<T> {
    /// Authenticates exact input bytes using an independent trusted verifier.
    ///
    /// # Errors
    /// Rejects malformed metadata or any proof not accepted by the verifier.
    pub fn authenticate(
        value: T,
        binding: &Binding,
        kind: &str,
        proof: &str,
        verifier: &dyn SourceProofVerifier,
        now: i64,
    ) -> Result<Self, ProtocolError> {
        let binding_digest = binding.digest()?;
        identifier(kind)?;
        opaque(proof)?;
        timestamp(now)?;
        // Type-specific page/metadata bounds remain mandatory at validation.
        // This generic ceiling prevents hashing an unbounded raw input first.
        bounded_bytes(&value, MAX_GROUP_BYTES)?;
        let input_digest = hash(&value)?;
        if !verifier.verify(binding, kind, &input_digest, proof, now) {
            return Err(ProtocolError::Untrusted);
        }
        Ok(Self {
            value,
            binding_digest,
            kind: kind.to_owned(),
            verified_at: now,
        })
    }

    #[must_use]
    pub fn value(&self) -> &T {
        &self.value
    }

    /// Checks exact proof binding/kind and a maximum 30-second handoff age.
    ///
    /// This is not a replacement for source-side current-policy verification;
    /// the source adapter must authenticate afresh for each bounded operation.
    ///
    /// # Errors
    /// Rejects mismatched scope/kind, future verification or an aged proof.
    pub fn check(&self, binding: &Binding, kind: &str, now: i64) -> Result<(), ProtocolError> {
        timestamp(now)?;
        if self.binding_digest != binding.digest()? || self.kind != kind {
            return Err(ProtocolError::Scope);
        }
        let age = now
            .checked_sub(self.verified_at)
            .ok_or(ProtocolError::Expired)?;
        if !(0..=MAX_PROOF_AGE_MS).contains(&age) {
            return Err(ProtocolError::Expired);
        }
        Ok(())
    }
}

fn hash<T: Serialize + ?Sized>(value: &T) -> Result<String, ProtocolError> {
    canonical_digest(&value).map_err(|_| ProtocolError::Integrity)
}

fn identifier(value: &str) -> Result<(), ProtocolError> {
    validate_identifier(value).map_err(|_| ProtocolError::Invalid)
}

fn digest_shape(value: &str) -> Result<(), ProtocolError> {
    validate_sha256(value).map_err(|_| ProtocolError::Invalid)
}

fn opaque(value: &str) -> Result<(), ProtocolError> {
    if value.is_empty() || value.len() > MAX_OPAQUE_BYTES || value.chars().any(char::is_control) {
        return Err(ProtocolError::Invalid);
    }
    Ok(())
}

fn generation(value: Uuid) -> Result<(), ProtocolError> {
    if value.is_nil() {
        return Err(ProtocolError::Invalid);
    }
    Ok(())
}

fn timestamp(value: i64) -> Result<(), ProtocolError> {
    if !(0..=MAX_TIMESTAMP_MS).contains(&value) {
        return Err(ProtocolError::Bounds);
    }
    Ok(())
}

fn future_bound(expiry: i64, now: i64, maximum: i64) -> Result<(), ProtocolError> {
    timestamp(now)?;
    let remaining = expiry.checked_sub(now).ok_or(ProtocolError::Expired)?;
    if remaining <= 0 {
        return Err(ProtocolError::Expired);
    }
    if remaining > maximum {
        return Err(ProtocolError::Bounds);
    }
    Ok(())
}

fn bounded_bytes<T: Serialize>(value: &T, maximum: usize) -> Result<(), ProtocolError> {
    let mut writer = ByteBound {
        written: 0,
        maximum,
        exceeded: false,
    };
    let result = serde_json::to_writer(&mut writer, value);
    if writer.exceeded {
        return Err(ProtocolError::Bounds);
    }
    result.map_err(|_| ProtocolError::Invalid)
}

// No filesystem I/O and no allocation proportional to an oversized input.
struct ByteBound {
    written: usize,
    maximum: usize,
    exceeded: bool,
}

impl io::Write for ByteBound {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.maximum.saturating_sub(self.written) {
            self.exceeded = true;
            return Err(io::Error::other("scoped bootstrap byte bound"));
        }
        self.written += bytes.len();
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

// Shared-wire counters are canonical decimal strings, even though the private
// Rust/store API uses a checked u64. Reject numeric JSON and silent coercions.
mod decimal_u64 {
    use serde::{de, ser, Deserialize, Deserializer, Serializer};

    use super::MAX_ORDINAL;

    // Serde's `with` callback requires a reference, including for scalar fields.
    #[allow(clippy::trivially_copy_pass_by_ref)]
    pub fn serialize<S: Serializer>(value: &u64, serializer: S) -> Result<S::Ok, S::Error> {
        if *value > MAX_ORDINAL {
            return Err(ser::Error::custom("invalid decimal counter"));
        }
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
        let raw = String::deserialize(deserializer)?;
        if raw.is_empty()
            || raw.len() > 19
            || (raw.len() > 1 && raw.starts_with('0'))
            || !raw.bytes().all(|byte| byte.is_ascii_digit())
        {
            return Err(de::Error::custom("invalid decimal counter"));
        }
        let value = raw
            .parse::<u64>()
            .map_err(|_| de::Error::custom("invalid decimal counter"))?;
        if value > MAX_ORDINAL {
            return Err(de::Error::custom("invalid decimal counter"));
        }
        Ok(value)
    }
}

#[cfg(test)]
mod tests;
