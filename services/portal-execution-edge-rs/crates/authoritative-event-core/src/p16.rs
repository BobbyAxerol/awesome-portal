//! Source-only adapter for the actual P16 `ConsumerJournalReadSource.read` wire.
//!
//! This is not a listener, permit issuer, publisher or production admission.
//! A decoded page is still untrusted. Its complete visible groups and scanned
//! interval can be authenticated through the existing bootstrap proof boundary;
//! only a durable store may subsequently commit and ACK that interval. Hidden
//! groups create sparse published positions, not missing visible events.
//!
//! P16 currently publishes only the capture-certified Paper view. Declaring a
//! Sandbox/Live profile elsewhere does not widen that view. Raw semantic facts
//! remain semantic facts: this adapter never invents an UPSERT, event timestamp,
//! predecessor, opaque cursor or whole-source-transaction completeness.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{self, Write as _};
use std::ops::Range;

use chrono::DateTime;
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::bootstrap::{Binding, ProtocolError, SourceProofVerifier, Verified};

const MAX_PAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_PAYLOAD_BYTES: usize = 1024 * 1024;
const MAX_EVENTS: usize = 10_000;
const MAX_GROUP_EVENTS: u64 = 1_024;
const MAX_ORDINAL: u64 = 9_223_372_036_854_775_807;

/// Actual source scope; neither journal row ID nor a cross-database sequence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceScope {
    pub source_cell_id: String,
    pub source_database_id: String,
    pub continuity_epoch: String,
}

impl SourceScope {
    fn validate(&self) -> Result<(), ProtocolError> {
        for value in [
            &self.source_cell_id,
            &self.source_database_id,
            &self.continuity_epoch,
        ] {
            text(value)?;
        }
        Ok(())
    }
}

/// Owner-selected immutable coverage binding, not a table-name guess.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CoverageBinding {
    pub writer_id: String,
    pub complete_from: String,
}

/// Inputs pinned by the admitted caller before reading the actual source.
/// Retention comes from the source's authenticated epoch/permit contract; the
/// P16 response itself does not contain a retention floor or a signed cursor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadBinding {
    pub scope: SourceScope,
    pub consumer_id: String,
    pub manifest_digest: String,
    pub catalogue_digest: String,
    pub filter_digest: String,
    pub access_revision: u64,
    pub after_sequence: u64,
    pub through_sequence: u64,
    pub retention_floor: u64,
    pub max_events: usize,
    pub coverage: BTreeMap<String, CoverageBinding>,
}

impl ReadBinding {
    fn validate(&self) -> Result<(), ProtocolError> {
        self.scope.validate()?;
        text(&self.consumer_id)?;
        for digest in [
            &self.manifest_digest,
            &self.catalogue_digest,
            &self.filter_digest,
        ] {
            raw_digest(digest)?;
        }
        if self.access_revision == 0
            || self.access_revision > MAX_ORDINAL
            || self.retention_floor == 0
            || self.retention_floor > MAX_ORDINAL
            || self.after_sequence > self.through_sequence
            || self.through_sequence > MAX_ORDINAL
            || !(1..=MAX_EVENTS).contains(&self.max_events)
            || self.through_sequence - self.after_sequence
                > u64::try_from(self.max_events).map_err(|_| ProtocolError::Bounds)?
            || self.coverage.is_empty()
            || self.coverage.len() > MAX_EVENTS
        {
            return Err(ProtocolError::Bounds);
        }
        if self.after_sequence < self.retention_floor - 1 {
            return Err(ProtocolError::Expired);
        }
        for (profile, binding) in &self.coverage {
            text(profile)?;
            text(&binding.writer_id)?;
            text(&binding.complete_from)?;
        }
        Ok(())
    }
}

/// Operations are deliberately not the Edge current-state operation enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Operation {
    Upsert,
    Correction,
    Tombstone,
    SemanticFact,
}

/// Exact39-column P13/P16 Paper-view row. Preserve the original source metadata
/// and payload; no integer is passed through a floating-point conversion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub source_event_id: String,
    pub source_cell_id: String,
    pub source_database_id: String,
    pub continuity_epoch: String,
    pub source_commit_lsn: String,
    pub source_commit_group_index: u64,
    pub published_source_sequence: u64,
    pub transaction_group_id: String,
    pub transaction_event_index: u64,
    pub transaction_event_count: u64,
    pub business_event_id: String,
    pub event_revision: u64,
    pub event_type: String,
    pub schema_version: String,
    pub schema_digest: String,
    pub operation: Operation,
    pub entity_type: String,
    pub entity_key: String,
    pub entity_version: u64,
    pub mode: String,
    pub venue: String,
    pub product: String,
    pub physical_account_ref: String,
    pub logical_account_ref: String,
    #[serde(deserialize_with = "required_nullable")]
    pub command_id: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub correlation_id: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub occurred_at: Option<String>,
    pub received_at: String,
    pub recorded_at: String,
    pub instrument_version: String,
    pub policy_version: String,
    pub reducer_version: String,
    #[serde(deserialize_with = "required_nullable")]
    pub correction_of: Option<String>,
    pub payload: Value,
    pub payload_hash: String,
    #[serde(deserialize_with = "required_nullable")]
    pub evidence_ref: Option<String>,
    pub coverage_profile_id: String,
    pub writer_id: String,
    pub complete_from: String,
}

impl Event {
    fn validate(&self, binding: &ReadBinding) -> Result<u64, ProtocolError> {
        if self.source_cell_id != binding.scope.source_cell_id
            || self.source_database_id != binding.scope.source_database_id
            || self.continuity_epoch != binding.scope.continuity_epoch
            || self.mode != "paper"
        {
            return Err(ProtocolError::Scope);
        }
        let coverage = binding
            .coverage
            .get(&self.coverage_profile_id)
            .ok_or(ProtocolError::Scope)?;
        if self.writer_id != coverage.writer_id || self.complete_from != coverage.complete_from {
            return Err(ProtocolError::Scope);
        }
        for value in [
            &self.event_type,
            &self.schema_version,
            &self.entity_type,
            &self.entity_key,
            &self.venue,
            &self.product,
            &self.physical_account_ref,
            &self.logical_account_ref,
            &self.instrument_version,
            &self.policy_version,
            &self.reducer_version,
        ] {
            text(value)?;
        }
        for value in [
            &self.source_event_id,
            &self.business_event_id,
            &self.transaction_group_id,
        ] {
            uuid(value)?;
        }
        for value in [&self.command_id, &self.correction_of]
            .into_iter()
            .flatten()
        {
            uuid(value)?;
        }
        for value in [&self.correlation_id, &self.evidence_ref]
            .into_iter()
            .flatten()
        {
            text(value)?;
        }
        for value in [&self.received_at, &self.recorded_at]
            .into_iter()
            .chain(self.occurred_at.as_ref())
        {
            DateTime::parse_from_rfc3339(value).map_err(|_| ProtocolError::Invalid)?;
        }
        raw_digest(&self.schema_digest)?;
        raw_digest(&self.payload_hash)?;
        if self.event_revision == 0
            || self.event_revision > MAX_ORDINAL
            || self.entity_version > MAX_ORDINAL
            || self.source_commit_group_index > u64::from(u32::MAX)
            || self.published_source_sequence <= binding.after_sequence
            || self.published_source_sequence > binding.through_sequence
            || self.transaction_event_count == 0
            || self.transaction_event_count > MAX_GROUP_EVENTS
            || self.transaction_event_index >= self.transaction_event_count
        {
            return Err(ProtocolError::Bounds);
        }
        if source_payload_hash(&self.payload)? != self.payload_hash {
            return Err(ProtocolError::Integrity);
        }
        commit_lsn(&self.source_commit_lsn)
    }
}

/// Actual JSON result of the read-only P16 source, not a new producer protocol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadPage {
    pub consumer_id: String,
    pub manifest_digest: String,
    pub catalogue_digest: String,
    pub filter_digest: String,
    pub scope: SourceScope,
    pub after_sequence: u64,
    pub scanned_through_sequence: u64,
    pub published_head_sequence: u64,
    pub access_revision: u64,
    pub source_lane: String,
    pub read_role: String,
    pub command_authority: String,
    pub events: Vec<Event>,
}

/// Checked but unauthenticated source facts. Fields cannot be assigned or
/// deserialized to bypass validation. No durable ACK or mutation method exists.
#[derive(Debug, Clone, Serialize)]
pub struct ValidatedPage {
    binding: ReadBinding,
    page: ReadPage,
    group_ranges: Vec<Range<usize>>,
}

impl ValidatedPage {
    /// Decodes bounded actual producer bytes and validates the selected scan.
    ///
    /// # Errors
    /// Rejects schema/scope/counter/hash/coverage drift, stale retention,
    /// partial or misordered groups and an oversized page before parsing it.
    pub fn decode(bytes: &[u8], binding: &ReadBinding) -> Result<Self, ProtocolError> {
        binding.validate()?;
        if bytes.len() > MAX_PAGE_BYTES {
            return Err(ProtocolError::Bounds);
        }
        let raw =
            serde_json::from_slice::<UniqueJson>(bytes).map_err(|_| ProtocolError::Invalid)?;
        let page: ReadPage = serde_json::from_value(raw.0).map_err(|_| ProtocolError::Invalid)?;
        validate_page(&page, binding)?;
        let group_ranges = group_ranges(&page, binding)?;
        Ok(Self {
            binding: binding.clone(),
            page,
            group_ranges,
        })
    }

    #[must_use]
    pub fn page(&self) -> &ReadPage {
        &self.page
    }

    /// Complete visible journal groups, not a claim about every group of the
    /// enclosing source transaction. No copy of the payload is made here.
    pub fn groups(&self) -> impl Iterator<Item = &[Event]> {
        self.group_ranges
            .iter()
            .map(|range| &self.page.events[range.clone()])
    }

    /// Authenticates the exact selected facts through the existing bootstrap
    /// verifier. The verifier must establish current source/permit/retention
    /// authority, not accept a locally generated checksum as an owner proof.
    /// This still does not fabricate a bootstrap manifest, cursor or ACK.
    ///
    /// # Errors
    /// Rejects dataset/epoch/profile drift or an unaccepted/currently invalid
    /// proof. The caller must retain the proof and commit scan+facts atomically.
    pub fn authenticate(
        self,
        binding: &Binding,
        proof: &str,
        verifier: &dyn SourceProofVerifier,
        now_ms: i64,
    ) -> Result<Verified<Self>, ProtocolError> {
        binding.validate()?;
        if binding.source.environment != "paper"
            || binding.source_epoch != self.binding.scope.continuity_epoch
            || binding.consumer_id != self.binding.consumer_id
            || binding.source.filter_digest != format!("sha256:{}", self.binding.filter_digest)
        {
            return Err(ProtocolError::Scope);
        }
        for event in &self.page.events {
            if binding.datasets.get(&event.entity_type) != Some(&event.schema_version) {
                return Err(ProtocolError::Scope);
            }
        }
        Verified::authenticate(self, binding, "P16_READ_PAGE", proof, verifier, now_ms)
    }
}

fn validate_page(page: &ReadPage, binding: &ReadBinding) -> Result<(), ProtocolError> {
    if page.consumer_id != binding.consumer_id
        || page.manifest_digest != binding.manifest_digest
        || page.catalogue_digest != binding.catalogue_digest
        || page.filter_digest != binding.filter_digest
        || page.scope != binding.scope
        || page.after_sequence != binding.after_sequence
        || page.scanned_through_sequence != binding.through_sequence
        || page.access_revision != binding.access_revision
        || page.source_lane != "SOURCE_JOURNAL"
        || page.read_role != "source_journal_paper_reader"
        || page.command_authority != "NONE"
    {
        return Err(ProtocolError::Scope);
    }
    if page.published_head_sequence > MAX_ORDINAL
        || page.published_head_sequence < page.scanned_through_sequence
        || page.events.len() > binding.max_events
    {
        return Err(ProtocolError::Bounds);
    }
    Ok(())
}

fn group_ranges(
    page: &ReadPage,
    binding: &ReadBinding,
) -> Result<Vec<Range<usize>>, ProtocolError> {
    let mut ranges = Vec::new();
    let mut group_ids = BTreeSet::new();
    let mut event_ids = BTreeSet::new();
    let mut business_ids = BTreeSet::new();
    let mut prior_sequence = binding.after_sequence;
    let mut prior_commit = None;
    let mut start = 0;
    while start < page.events.len() {
        let first = &page.events[start];
        let commit = (
            commit_lsn(&first.source_commit_lsn)?,
            first.source_commit_group_index,
        );
        if prior_commit.is_some_and(|previous| commit <= previous)
            || !group_ids.insert(first.transaction_group_id.as_str())
        {
            return Err(ProtocolError::Integrity);
        }
        let count =
            usize::try_from(first.transaction_event_count).map_err(|_| ProtocolError::Bounds)?;
        let end = start.checked_add(count).ok_or(ProtocolError::Bounds)?;
        if count == 0 || end > page.events.len() {
            return Err(ProtocolError::Integrity);
        }
        for (index, event) in page.events[start..end].iter().enumerate() {
            let lsn = event.validate(binding)?;
            if event.transaction_group_id != first.transaction_group_id
                || event.transaction_event_count != first.transaction_event_count
                || event.transaction_event_index
                    != u64::try_from(index).map_err(|_| ProtocolError::Bounds)?
                || lsn != commit.0
                || event.source_commit_group_index != commit.1
                || event.coverage_profile_id != first.coverage_profile_id
                || event.schema_digest != first.schema_digest
                || event.published_source_sequence <= prior_sequence
                || (index > 0 && event.published_source_sequence != prior_sequence + 1)
                || !event_ids.insert(event.source_event_id.as_str())
                || !business_ids.insert((event.business_event_id.as_str(), event.event_revision))
            {
                return Err(ProtocolError::Integrity);
            }
            prior_sequence = event.published_source_sequence;
        }
        ranges.push(start..end);
        start = end;
        prior_commit = Some(commit);
    }
    Ok(ranges)
}

fn text(value: &str) -> Result<(), ProtocolError> {
    if value.is_empty()
        || value.len() > 4_096
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(ProtocolError::Invalid);
    }
    Ok(())
}

fn uuid(value: &str) -> Result<(), ProtocolError> {
    let parsed = Uuid::parse_str(value).map_err(|_| ProtocolError::Invalid)?;
    if parsed.to_string() != value {
        return Err(ProtocolError::Invalid);
    }
    Ok(())
}

fn raw_digest(value: &str) -> Result<(), ProtocolError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ProtocolError::Invalid);
    }
    Ok(())
}

// PostgreSQL's to_jsonb emits every catalogue column, including SQL NULL.
// Unlike Serde's normal Option fallback, a missing column is schema drift.
fn required_nullable<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

// Mechanically reused from ts-transport::report_publication_wire. That crate
// depends on this core, so importing its private visitor would create a cycle.
// Reject duplicate keys recursively BEFORE Value can discard source payload
// evidence. The bounded input and serde's default recursion limit still apply.
struct UniqueJson(Value);

impl<'de> Deserialize<'de> for UniqueJson {
    fn deserialize<D: Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        struct Unique;
        impl<'de> de::Visitor<'de> for Unique {
            type Value = UniqueJson;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("unique-key JSON")
            }

            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }

            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }

            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }

            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Self::Value, E> {
                serde_json::Number::from_f64(v)
                    .map(|n| UniqueJson(Value::Number(n)))
                    .ok_or_else(|| E::custom("invalid JSON number"))
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }

            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueJson(Value::Null))
            }

            fn visit_seq<A: de::SeqAccess<'de>>(
                self,
                mut input: A,
            ) -> Result<Self::Value, A::Error> {
                let mut out = Vec::new();
                while let Some(value) = input.next_element::<UniqueJson>()? {
                    out.push(value.0);
                }
                Ok(UniqueJson(Value::Array(out)))
            }

            fn visit_map<A: de::MapAccess<'de>>(
                self,
                mut input: A,
            ) -> Result<Self::Value, A::Error> {
                let mut out = Map::new();
                while let Some((key, value)) = input.next_entry::<String, UniqueJson>()? {
                    if out.insert(key, value.0).is_some() {
                        return Err(de::Error::custom("duplicate JSON key"));
                    }
                }
                Ok(UniqueJson(Value::Object(out)))
            }
        }
        input.deserialize_any(Unique)
    }
}

fn commit_lsn(value: &str) -> Result<u64, ProtocolError> {
    let (high, low) = value.split_once('/').ok_or(ProtocolError::Invalid)?;
    if high.is_empty() || low.is_empty() || high.len() > 8 || low.len() > 8 {
        return Err(ProtocolError::Invalid);
    }
    let high = u32::from_str_radix(high, 16).map_err(|_| ProtocolError::Invalid)?;
    let low = u32::from_str_radix(low, 16).map_err(|_| ProtocolError::Invalid)?;
    if value != format!("{high:X}/{low:X}") {
        return Err(ProtocolError::Invalid);
    }
    Ok((u64::from(high) << 32) | u64::from(low))
}

// Mechanically follows pinned TS publication.rs canonical_json/payload_digest:
// preserve decimal strings and exact scalar values, including UTF16 surrogate
// pairs. This is NOT Edge's different UTF8 projection-payload digest.
fn source_payload_hash(value: &Value) -> Result<String, ProtocolError> {
    if !value.is_object() {
        return Err(ProtocolError::Invalid);
    }
    let encoded = serde_json::to_string(value).map_err(|_| ProtocolError::Invalid)?;
    if encoded.len() > MAX_PAYLOAD_BYTES {
        return Err(ProtocolError::Bounds);
    }
    let mut ascii = String::with_capacity(encoded.len());
    for character in encoded.chars() {
        if character.is_ascii() {
            ascii.push(character);
        } else {
            for unit in character.encode_utf16(&mut [0; 2]) {
                write!(&mut ascii, "\\u{unit:04x}").map_err(|_| ProtocolError::Invalid)?;
            }
        }
        if ascii.len() > MAX_PAYLOAD_BYTES {
            return Err(ProtocolError::Bounds);
        }
    }
    Ok(format!("{:x}", Sha256::digest(ascii.as_bytes())))
}

#[cfg(test)]
mod tests;
