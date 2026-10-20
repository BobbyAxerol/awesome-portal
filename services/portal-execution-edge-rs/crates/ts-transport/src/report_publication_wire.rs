//! Pure preparation/decoding of the PM selected-report publication wire.
//!
//! Every output is UNTRUSTED. Structural validity, hashes and an opaque cursor
//! do not authenticate source bytes, current HISTORY/EXPORT authority, retained
//! coverage or a native publisher fence. This module performs no HTTP, issues
//! no token, constructs no `Verified<T>` and never applies/ACKs a projection.
//! Reports retain `AS_PUBLISHED` semantics; they are not current financial facts.

use std::{collections::BTreeSet, fmt};

use authoritative_event_core::{
    bootstrap::{
        events_digest, validate_events, Binding, DeltaChunk, DeltaGroup, Limits, Manifest,
        ProtocolError, SnapshotPage,
    },
    EventOperation,
};
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

pub const DATASET: &str = "pma.reports.current-original-publication";
pub const PAYLOAD_SCHEMA: &str = "pma.report-publication-history-item.v1";
pub const MAX_WIRE_BYTES: usize = 1024 * 1024;
pub const SNAPSHOT_PATH: &str = "/internal/pma11-candidate/publication/snapshot";
pub const PAGE_PATH: &str = "/internal/pma11-candidate/publication/page";
pub const DELTA_PATH: &str = "/internal/pma11-candidate/publication/delta";
const MAX_TIME_MS: i64 = 9_007_199_254_740_991;
const MAX_SOURCE_PREFIX: u64 = 4096;

/// Bounded, record-free errors; never include source payloads or private refs.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum WireError {
    #[error("REPORT_PUBLICATION_WIRE_SHAPE")]
    Shape,
    #[error("REPORT_PUBLICATION_WIRE_BOUNDS")]
    Bounds,
    #[error("REPORT_PUBLICATION_WIRE_BINDING")]
    Binding,
    #[error("REPORT_PUBLICATION_WIRE_INTEGRITY")]
    Integrity,
    #[error("REPORT_PUBLICATION_PROTOCOL: {0}")]
    Protocol(#[from] ProtocolError),
}

/// Exact POST path/body only, NOT an authenticated request or arbitrary URL.
pub struct PreparedRequest {
    path: &'static str,
    body: Vec<u8>,
}

impl PreparedRequest {
    #[must_use]
    pub fn path(&self) -> &'static str {
        self.path
    }

    /// Bind any independently issued assertion to THESE delivered bytes.
    #[must_use]
    pub fn body(&self) -> &[u8] {
        &self.body
    }
}

/// Hash/shape-checked input, never source authentication or completeness proof.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UntrustedSnapshot {
    manifest: Manifest,
    pages: Vec<SnapshotPage>,
}

impl UntrustedSnapshot {
    #[must_use]
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    #[must_use]
    pub fn pages(&self) -> &[SnapshotPage] {
        &self.pages
    }
}

/// A structurally checked page, not an input accepted by the projection store.
pub struct UntrustedPage(SnapshotPage);

impl UntrustedPage {
    #[must_use]
    pub fn page(&self) -> &SnapshotPage {
        &self.0
    }
}

/// Empty/hidden-only tails are untrusted, NOT authenticated scan coverage.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UntrustedDelta {
    group: Option<DeltaGroup>,
    chunks: Vec<DeltaChunk>,
}

impl UntrustedDelta {
    #[must_use]
    pub fn group(&self) -> Option<&DeltaGroup> {
        self.group.as_ref()
    }

    #[must_use]
    pub fn chunks(&self) -> &[DeltaChunk] {
        &self.chunks
    }
}

/// One explicit server-selected report binding and isolated safety ceilings.
pub struct ReportPublicationWire {
    binding: Binding,
    limits: Limits,
}

impl ReportPublicationWire {
    /// No default source, identity, scope or production capacity is inferred.
    ///
    /// # Errors
    /// Rejects malformed bindings, any other dataset/schema or oversized bounds.
    pub fn new(binding: Binding, limits: Limits) -> Result<Self, WireError> {
        binding.validate()?;
        limits.validate()?;
        if binding.datasets.len() != 1
            || binding.datasets.get(DATASET).map(String::as_str) != Some(PAYLOAD_SCHEMA)
        {
            return Err(WireError::Binding);
        }
        // The HTTP source has a stricter complete-response cap than the generic
        // eight-MiB bootstrap group ceiling. Never silently raise that cap.
        if limits.group_bytes > MAX_WIRE_BYTES {
            return Err(WireError::Bounds);
        }
        Ok(Self { binding, limits })
    }

    #[must_use]
    pub fn snapshot_request() -> PreparedRequest {
        PreparedRequest {
            path: SNAPSHOT_PATH,
            body: b"{}".to_vec(),
        }
    }

    /// # Errors
    /// Rejects foreign/expired manifests or a page outside their declared plan.
    pub fn page_request(
        &self,
        manifest: &Manifest,
        index: u64,
        now_ms: i64,
    ) -> Result<PreparedRequest, WireError> {
        self.manifest(manifest, now_ms, false)?;
        // The source expires page staging at the snapshot deadline, not at the
        // independent rollback deadline. Keep the original snapshot bound.
        if manifest.expires_at_ms <= now_ms
            || manifest.expires_at_ms - now_ms > self.limits.snapshot_ttl_ms
        {
            return Err(WireError::Protocol(ProtocolError::Expired));
        }
        if index >= manifest.pages[DATASET].count {
            return Err(WireError::Bounds);
        }
        // Request index is an integer; the existing RESPONSE page index is a
        // canonical decimal string. Do not serialize the request as a page.
        Self::request(
            PAGE_PATH,
            &serde_json::json!({"index": index, "manifest": manifest}),
        )
    }

    /// # Errors
    /// Rejects foreign metadata/cursors; snapshot expiry does not expire a tail.
    pub fn delta_request(
        &self,
        manifest: &Manifest,
        cursor: &str,
        now_ms: i64,
    ) -> Result<PreparedRequest, WireError> {
        self.manifest(manifest, now_ms, false)?;
        cursor_shape(cursor)?;
        Self::request(
            DELTA_PATH,
            &serde_json::json!({"cursor": cursor, "manifest": manifest}),
        )
    }

    /// # Errors
    /// Rejects malformed/oversized/foreign/expired input or incomplete pages.
    pub fn decode_snapshot(
        &self,
        bytes: &[u8],
        now_ms: i64,
    ) -> Result<UntrustedSnapshot, WireError> {
        let raw = read_json(bytes)?;
        closed(&raw, &["manifest", "pages"])?;
        manifest_shape(&raw["manifest"])?;
        let output: UntrustedSnapshot =
            serde_json::from_value(raw).map_err(|_| WireError::Shape)?;
        self.manifest(&output.manifest, now_ms, true)?;
        let plan = &output.manifest.pages[DATASET];
        if u64::try_from(output.pages.len()).map_err(|_| WireError::Bounds)? != plan.count {
            return Err(WireError::Integrity);
        }
        let mut previous =
            authoritative_event_core::bootstrap::page_seed(&output.manifest, DATASET)?;
        let mut entities = BTreeSet::new();
        for (index, page) in output.pages.iter().enumerate() {
            page.validate(&output.manifest, &self.limits, now_ms)?;
            if page.dataset != DATASET
                || page.index != u64::try_from(index).map_err(|_| WireError::Bounds)?
                || page.previous_digest != previous
                || page.rows.iter().any(|row| !entities.insert(&row.entity_id))
            {
                return Err(WireError::Integrity);
            }
            if u64::try_from(entities.len()).map_err(|_| WireError::Bounds)? > MAX_SOURCE_PREFIX {
                return Err(WireError::Bounds);
            }
            previous = page.chain_digest()?;
        }
        if previous != plan.final_digest {
            return Err(WireError::Integrity);
        }
        Ok(output)
    }

    /// # Errors
    /// Rejects malformed/foreign/expired pages or a different requested index.
    pub fn decode_page(
        &self,
        bytes: &[u8],
        manifest: &Manifest,
        index: u64,
        now_ms: i64,
    ) -> Result<UntrustedPage, WireError> {
        self.page_request(manifest, index, now_ms)?;
        let page: SnapshotPage =
            serde_json::from_value(read_json(bytes)?).map_err(|_| WireError::Shape)?;
        page.validate(manifest, &self.limits, now_ms)?;
        if page.dataset != DATASET || page.index != index {
            return Err(WireError::Binding);
        }
        Ok(UntrustedPage(page))
    }

    /// # Errors
    /// Rejects malformed/foreign/incomplete groups; no coverage is authenticated.
    pub fn decode_delta(
        &self,
        bytes: &[u8],
        manifest: &Manifest,
        after: &str,
        now_ms: i64,
    ) -> Result<UntrustedDelta, WireError> {
        self.delta_request(manifest, after, now_ms)?;
        let raw = read_json(bytes)?;
        closed(&raw, &["group", "chunks"])?;
        // PM bounds the complete canonical envelope, not just each chunk or
        // the flattened events. Raw whitespace remains subject to the wire cap.
        if serde_json::to_vec(&raw)
            .map_err(|_| WireError::Shape)?
            .len()
            > self.limits.group_bytes
        {
            return Err(WireError::Bounds);
        }
        for chunk in raw["chunks"].as_array().ok_or(WireError::Shape)? {
            for input in chunk["events"].as_array().ok_or(WireError::Shape)? {
                event_shape(&input["event"])?;
            }
        }
        let output: UntrustedDelta = serde_json::from_value(raw).map_err(|_| WireError::Shape)?;
        let Some(group) = &output.group else {
            return if output.chunks.is_empty() {
                Ok(output)
            } else {
                Err(WireError::Integrity)
            };
        };
        group.validate(manifest, &self.limits, now_ms)?;
        cursor_shape(&group.from_cursor)?;
        cursor_shape(&group.to_cursor)?;
        if group.from_cursor != after
            || group.to_cursor == group.from_cursor
            || group.reached_catchup
            || output.chunks.len() != group.chunk_digests.len()
        {
            return Err(WireError::Integrity);
        }
        let mut events = Vec::new();
        for (index, chunk) in output.chunks.iter().enumerate() {
            chunk.validate(manifest, &self.limits, now_ms)?;
            if chunk.group_id != group.group_id
                || chunk.index != u64::try_from(index).map_err(|_| WireError::Bounds)?
                || chunk.digest()? != group.chunk_digests[index]
            {
                return Err(WireError::Integrity);
            }
            events.extend(chunk.events.iter().cloned());
        }
        validate_events(&events, manifest, &self.limits)?;
        if events_digest(&events)? != group.events_digest
            || events.iter().any(|v| {
                v.event.operation != EventOperation::Upsert
                    || !v
                        .event
                        .source_position
                        .sequence_u64()
                        .is_ok_and(|n| n <= MAX_SOURCE_PREFIX)
            })
        {
            return Err(WireError::Integrity);
        }
        Ok(output)
    }

    fn request(path: &'static str, value: &impl Serialize) -> Result<PreparedRequest, WireError> {
        let body = serde_json::to_vec(value).map_err(|_| WireError::Shape)?;
        if body.len() > MAX_WIRE_BYTES {
            return Err(WireError::Bounds);
        }
        Ok(PreparedRequest { path, body })
    }

    fn manifest(&self, manifest: &Manifest, now_ms: i64, fresh: bool) -> Result<(), WireError> {
        if !(0..=MAX_TIME_MS).contains(&now_ms) {
            return Err(WireError::Bounds);
        }
        manifest.validate_structure()?;
        if manifest.binding != self.binding
            || !manifest.references.is_empty()
            || manifest.barrier != manifest.delta_start
            || manifest.barrier != manifest.catchup_cursor
        {
            return Err(WireError::Binding);
        }
        cursor_shape(&manifest.barrier)?;
        if manifest.pages[DATASET].count > MAX_SOURCE_PREFIX {
            return Err(WireError::Bounds);
        }
        if fresh {
            manifest.validate(&self.limits, now_ms)?;
        }
        Ok(())
    }
}

fn cursor_shape(value: &str) -> Result<(), WireError> {
    let mark = value.strip_prefix("pmrb1.").ok_or(WireError::Shape)?;
    if mark.len() != 43
        || !mark
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(WireError::Shape);
    }
    Ok(())
}

fn closed(value: &Value, keys: &[&str]) -> Result<(), WireError> {
    let object = value.as_object().ok_or(WireError::Shape)?;
    if object.len() != keys.len() || !keys.iter().all(|key| object.contains_key(*key)) {
        return Err(WireError::Shape);
    }
    Ok(())
}

fn manifest_shape(value: &Value) -> Result<(), WireError> {
    // EventStreamBinding predates deny_unknown_fields. Close its wire here,
    // without changing the pinned shared protocol or accepting extra authority.
    closed(
        &value["binding"]["source"],
        &[
            "stream_id",
            "contract_revision",
            "workspace_id",
            "environment",
            "profile_id",
            "venue_id",
            "resource_kind",
            "resource_id",
            "filter_digest",
        ],
    )
}

fn event_shape(value: &Value) -> Result<(), WireError> {
    closed(
        value,
        &[
            "event_id",
            "source_position",
            "entity_kind",
            "entity_id",
            "entity_version",
            "payload_schema_revision",
            "operation",
            "event_time_ms",
            "source_published_at_ms",
            "correction_of_event_id",
            "tombstone_of_event_id",
            "causation_id",
            "correlation_id",
            "payload",
            "payload_digest",
        ],
    )?;
    closed(
        &value["source_position"],
        &["source_epoch", "source_sequence"],
    )?;
    // This published report source has no correction/deletion/causal mapping.
    // Required nulls must not disappear or gain inferred financial semantics.
    if [
        "correction_of_event_id",
        "tombstone_of_event_id",
        "causation_id",
        "correlation_id",
    ]
    .iter()
    .any(|key| !value[*key].is_null())
    {
        return Err(WireError::Shape);
    }
    Ok(())
}

fn read_json(bytes: &[u8]) -> Result<Value, WireError> {
    if bytes.is_empty() || bytes.len() > MAX_WIRE_BYTES {
        return Err(WireError::Bounds);
    }
    serde_json::from_slice::<UniqueJson>(bytes)
        .map(|v| v.0)
        .map_err(|_| WireError::Shape)
}

// Reject duplicate keys recursively, including payloads, BEFORE typed serde can
// discard them. The one-MiB input and serde's existing recursion limit apply.
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

#[cfg(test)]
mod tests;
