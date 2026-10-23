//! Bounded owning composition for PM's selected original financial reports.
//!
//! HTTPS delivery and typed financial validation are not source authority. The
//! owner supplies an independently authenticated `Verified<T>` for the EXACT
//! decoded candidate before any durable operation. No verifier, grant, accounting
//! formula, worker loop, route or source ACK is invented here.

use std::collections::BTreeMap;

use authoritative_event_core::bootstrap::{
    Binding, DeltaChunk, DeltaGroup, Limits, Manifest, ProtocolError, Revision, SnapshotPage,
    Verified,
};
use maximum_data_adapter::financial_report::{
    FinancialBinding, FinancialError, PublishedFinancialReport,
};
use projection_core::resources::ResourceError;
use projection_store_pg::{
    bootstrap::{BootstrapError, BootstrapHandle, BootstrapReceipt},
    scoped_read::{ReadClock, ReadError, ReadPage, ReadRow, ScopedReadService},
    PgProjectionStore,
};
use query_api::scoped::{AuthorizedRead, ReadQuery, ScopedError};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use ts_transport::{
    report_publication_http::{ReportHttpError, ReportPublicationHttpClient},
    report_publication_wire::{
        PreparedRequest, ReportPublicationWire, UntrustedDelta, UntrustedSnapshot, WireError,
        DATASET, PAYLOAD_SCHEMA,
    },
};

#[derive(Debug, Error)]
pub enum FinancialProjectionError {
    #[error(transparent)]
    Resource(#[from] ResourceError),
    #[error(transparent)]
    Http(#[from] ReportHttpError),
    #[error(transparent)]
    Wire(#[from] WireError),
    #[error(transparent)]
    Financial(#[from] FinancialError),
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    #[error(transparent)]
    Store(#[from] BootstrapError),
    #[error(transparent)]
    Read(#[from] ReadError),
    #[error("FINANCIAL_PUBLICATION_BINDING_MISMATCH")]
    Binding,
}

/// Structurally/financially checked only. This is deliberately NOT `Verified`.
pub struct PreparedFinancialSnapshot(UntrustedSnapshot);

impl PreparedFinancialSnapshot {
    #[must_use]
    pub fn manifest(&self) -> &Manifest {
        self.0.manifest()
    }

    #[must_use]
    pub fn pages(&self) -> &[SnapshotPage] {
        self.0.pages()
    }
}

/// An empty response has no scan proof and cannot advance a checkpoint. An
/// authenticated hidden-only group, by contrast, can commit with zero chunks.
pub struct PreparedFinancialDelta {
    manifest: Manifest,
    input: UntrustedDelta,
}

/// Explicit owner selection, not a default or network-triggered promotion.
pub enum SnapshotPlacement {
    /// Existing store semantics: select only after the entire snapshot commits.
    Auto,
    /// Hold read selection for the existing independent comparison/cutover port.
    Shadow,
}

impl PreparedFinancialDelta {
    #[must_use]
    pub fn group(&self) -> Option<&DeltaGroup> {
        self.input.group()
    }

    #[must_use]
    pub fn chunks(&self) -> &[DeltaChunk] {
        self.input.chunks()
    }
}

/// Existing authenticated delivery -> typed validation -> existing atomic PG
/// store. Each method performs at most one bounded network/database operation.
pub struct FinancialProjection<'a> {
    http: &'a ReportPublicationHttpClient,
    wire: ReportPublicationWire,
    store: &'a PgProjectionStore,
    limits: Limits,
    bindings: &'a BTreeMap<String, FinancialBinding>,
    clock: &'a dyn ReadClock,
}

impl<'a> FinancialProjection<'a> {
    /// # Errors
    /// Rejects a mismatched publication allowlist or unsafe source/wire limits.
    pub fn new(
        http: &'a ReportPublicationHttpClient,
        store: &'a PgProjectionStore,
        binding: Binding,
        limits: Limits,
        bindings: &'a BTreeMap<String, FinancialBinding>,
        clock: &'a dyn ReadClock,
    ) -> Result<Self, FinancialProjectionError> {
        store.require_resource_governance()?;
        if bindings.len() > 4096 || bindings.iter().any(|(key, value)| key != &value.reference) {
            return Err(FinancialProjectionError::Binding);
        }
        Ok(Self {
            http,
            wire: ReportPublicationWire::new(binding, limits)?,
            store,
            limits,
            bindings,
            clock,
        })
    }

    /// The issuer must bind its independently issued assertion to these bytes.
    #[must_use]
    pub fn snapshot_request() -> PreparedRequest {
        ReportPublicationWire::snapshot_request()
    }

    /// # Errors
    /// Rejects a foreign manifest, invalid cursor or expired request metadata.
    pub fn delta_request(
        &self,
        handle: &BootstrapHandle,
        after: &str,
    ) -> Result<PreparedRequest, FinancialProjectionError> {
        Ok(self
            .wire
            .delta_request(handle.manifest(), after, self.clock.now_ms())?)
    }

    /// # Errors
    /// Rejects failed authenticated delivery, wire integrity or financial pins.
    pub async fn fetch_snapshot(
        &self,
        assertion: &str,
    ) -> Result<PreparedFinancialSnapshot, FinancialProjectionError> {
        let body = self
            .http
            .execute(&Self::snapshot_request(), assertion)
            .await?;
        prepare_snapshot(&self.wire, self.bindings, body.bytes(), self.clock.now_ms())
    }

    /// Requires an explicit reviewed placement. SHADOW readiness never changes
    /// the read pointer; AUTO uses the existing atomic initial-bootstrap path.
    /// # Errors
    /// Rejects candidate/proof mismatch, stale authority or bounded store errors.
    pub async fn begin_snapshot(
        &self,
        candidate: &PreparedFinancialSnapshot,
        proof: &Verified<Manifest>,
        placement: SnapshotPlacement,
    ) -> Result<BootstrapHandle, FinancialProjectionError> {
        self.check_snapshot(candidate)?;
        exact(proof.value(), candidate.manifest())?;
        Ok(match placement {
            SnapshotPlacement::Auto => {
                self.store
                    .bootstrap_begin(proof, self.limits, self.clock.now_ms())
                    .await?
            }
            SnapshotPlacement::Shadow => {
                self.store
                    .bootstrap_begin_shadow(proof, self.limits, self.clock.now_ms())
                    .await?
            }
        })
    }

    /// # Errors
    /// Rejects cross-candidate pages, invalid proofs or store fence failures.
    pub async fn stage_page(
        &self,
        candidate: &PreparedFinancialSnapshot,
        index: usize,
        handle: &BootstrapHandle,
        proof: &Verified<SnapshotPage>,
    ) -> Result<(), FinancialProjectionError> {
        self.check_snapshot(candidate)?;
        exact(handle.manifest(), candidate.manifest())?;
        let page = candidate
            .pages()
            .get(index)
            .ok_or(FinancialProjectionError::Binding)?;
        exact(proof.value(), page)?;
        Ok(self
            .store
            .bootstrap_stage_page(handle, proof, self.clock.now_ms())
            .await?)
    }

    /// # Errors
    /// Rejects a foreign handle/control or incomplete/expired durable staging.
    pub async fn finish_snapshot(
        &self,
        candidate: &PreparedFinancialSnapshot,
        handle: &BootstrapHandle,
        control: &Verified<Binding>,
    ) -> Result<Option<BootstrapReceipt>, FinancialProjectionError> {
        self.check_snapshot(candidate)?;
        exact(handle.manifest(), candidate.manifest())?;
        Ok(self
            .store
            .bootstrap_finish_snapshot(handle, control, self.clock.now_ms())
            .await?)
    }

    /// # Errors
    /// Rejects delivery/wire errors or any unqualified original report version.
    pub async fn fetch_delta(
        &self,
        handle: &BootstrapHandle,
        after: &str,
        assertion: &str,
    ) -> Result<PreparedFinancialDelta, FinancialProjectionError> {
        let request = self.delta_request(handle, after)?;
        let body = self.http.execute(&request, assertion).await?;
        prepare_delta(
            &self.wire,
            self.bindings,
            handle.manifest(),
            after,
            body.bytes(),
            self.clock.now_ms(),
        )
    }

    /// # Errors
    /// Rejects cross-manifest/chunk proofs or bounded staging failures.
    pub async fn stage_chunk(
        &self,
        candidate: &PreparedFinancialDelta,
        index: usize,
        handle: &BootstrapHandle,
        proof: &Verified<DeltaChunk>,
    ) -> Result<(), FinancialProjectionError> {
        self.check_delta(candidate)?;
        exact(handle.manifest(), &candidate.manifest)?;
        let chunk = candidate
            .chunks()
            .get(index)
            .ok_or(FinancialProjectionError::Binding)?;
        exact(proof.value(), chunk)?;
        Ok(self
            .store
            .bootstrap_stage_delta(handle, proof, self.clock.now_ms())
            .await?)
    }

    /// Returns only the receipt actually produced after the store's SQL COMMIT.
    /// On an ACK loss, use `checkpoint` with the SAME original handle/control.
    /// # Errors
    /// Rejects proof mismatch, absent scan coverage or incomplete/failed commit.
    pub async fn commit_group(
        &self,
        candidate: &PreparedFinancialDelta,
        handle: &BootstrapHandle,
        proof: &Verified<DeltaGroup>,
    ) -> Result<BootstrapReceipt, FinancialProjectionError> {
        self.check_delta(candidate)?;
        exact(handle.manifest(), &candidate.manifest)?;
        let group = candidate.group().ok_or(FinancialProjectionError::Binding)?;
        exact(proof.value(), group)?;
        Ok(self
            .store
            .bootstrap_commit_group(handle, proof, self.clock.now_ms())
            .await?)
    }

    /// # Errors
    /// Rejects a foreign handle/control; failed reads never fabricate an ACK.
    pub async fn checkpoint(
        &self,
        handle: &BootstrapHandle,
        control: &Verified<Binding>,
    ) -> Result<BootstrapReceipt, FinancialProjectionError> {
        // Validate the handle against the fixed wire binding before recovery.
        self.wire.delta_request(
            handle.manifest(),
            &handle.manifest().delta_start,
            self.clock.now_ms(),
        )?;
        Ok(self
            .store
            .bootstrap_checkpoint(handle, control, self.clock.now_ms())
            .await?)
    }

    fn check_snapshot(
        &self,
        candidate: &PreparedFinancialSnapshot,
    ) -> Result<(), FinancialProjectionError> {
        self.wire.delta_request(
            candidate.manifest(),
            &candidate.manifest().delta_start,
            self.clock.now_ms(),
        )?;
        for page in candidate.pages() {
            for row in &page.rows {
                validate_report(&row.payload, &row.entity_id, &row.revision, self.bindings)?;
            }
        }
        Ok(())
    }

    fn check_delta(
        &self,
        candidate: &PreparedFinancialDelta,
    ) -> Result<(), FinancialProjectionError> {
        self.wire.delta_request(
            &candidate.manifest,
            &candidate.manifest.delta_start,
            self.clock.now_ms(),
        )?;
        for chunk in candidate.chunks() {
            for item in &chunk.events {
                validate_report(
                    &item.event.payload,
                    item.event.entity_id.as_str(),
                    &item.revision,
                    self.bindings,
                )?;
            }
        }
        Ok(())
    }
}

fn prepare_snapshot(
    wire: &ReportPublicationWire,
    bindings: &BTreeMap<String, FinancialBinding>,
    bytes: &[u8],
    now: i64,
) -> Result<PreparedFinancialSnapshot, FinancialProjectionError> {
    let snapshot = wire.decode_snapshot(bytes, now)?;
    for page in snapshot.pages() {
        for row in &page.rows {
            validate_report(&row.payload, &row.entity_id, &row.revision, bindings)?;
        }
    }
    Ok(PreparedFinancialSnapshot(snapshot))
}

fn prepare_delta(
    wire: &ReportPublicationWire,
    bindings: &BTreeMap<String, FinancialBinding>,
    manifest: &Manifest,
    after: &str,
    bytes: &[u8],
    now: i64,
) -> Result<PreparedFinancialDelta, FinancialProjectionError> {
    let input = wire.decode_delta(bytes, manifest, after, now)?;
    for chunk in input.chunks() {
        for item in &chunk.events {
            validate_report(
                &item.event.payload,
                item.event.entity_id.as_str(),
                &item.revision,
                bindings,
            )?;
        }
    }
    Ok(PreparedFinancialDelta {
        manifest: manifest.clone(),
        input,
    })
}

fn exact<T: PartialEq>(actual: &T, expected: &T) -> Result<(), FinancialProjectionError> {
    if actual == expected {
        Ok(())
    } else {
        Err(FinancialProjectionError::Binding)
    }
}

fn source_id(prefix: &str, value: &impl Serialize) -> Result<String, FinancialProjectionError> {
    let bytes = serde_json::to_vec(value).map_err(|_| FinancialProjectionError::Binding)?;
    Ok(format!("{prefix}:{:x}", Sha256::digest(bytes)))
}

fn validate_report(
    payload: &Value,
    entity_id: &str,
    revision: &Revision,
    bindings: &BTreeMap<String, FinancialBinding>,
) -> Result<PublishedFinancialReport, FinancialProjectionError> {
    let reference = payload
        .get("reference")
        .and_then(Value::as_str)
        .ok_or(FinancialProjectionError::Binding)?;
    let expected = bindings
        .get(reference)
        .ok_or(FinancialProjectionError::Binding)?;
    let report = PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, payload, expected)?;
    // Exact existing PM `_id('report', key)` / `_revision(item)` semantics;
    // neither an opaque cursor nor a timestamp is an entity revision.
    if entity_id != source_id("report", &expected.report_key)?
        || revision.ordinal.to_string() != expected.publication_version
        || revision.opaque
            != source_id(
                "publication",
                &[
                    &expected.report_key,
                    &expected.publication_version,
                    &expected.publication_payload_hash,
                ],
            )?
    {
        return Err(FinancialProjectionError::Binding);
    }
    Ok(report)
}

/// Internal typed result. Raw source payload/proof/capture IDs are not exposed.
/// The original scoped metadata/cursors remain private and are not re-labelled
/// current authority, full history, fresh financial facts or certified returns.
pub struct FinancialReadPage {
    metadata: ReadPage,
    pub reports: Vec<FinancialReadRow>,
}

pub struct FinancialReadRow {
    pub entity_id: String,
    pub revision: String,
    pub event_id: Option<String>,
    pub operation: Option<String>,
    pub occurred_at_ms: Option<i64>,
    pub correction_of: Option<String>,
    pub report: PublishedFinancialReport,
}

impl FinancialReadPage {
    /// Scope-authenticated freshness/history/coverage metadata, with NO raw rows.
    #[must_use]
    pub fn metadata(&self) -> &ReadPage {
        &self.metadata
    }
}

/// Whole-original manager source only. `rows` is a nested publication array;
/// top-level field projection must never masquerade as per-account authorization.
/// An owning authorizer must grant this exact dataset, entity and full field set.
/// # Errors
/// Rejects current-policy denial, partial original fields, generation/cursor
/// drift, financial pin mismatch or the existing bounded read/store errors.
pub async fn read_financial_page(
    service: &ScopedReadService<'_>,
    read: &AuthorizedRead,
    query: &ReadQuery,
    cursor: Option<&str>,
    bindings: &BTreeMap<String, FinancialBinding>,
) -> Result<FinancialReadPage, FinancialProjectionError> {
    service.store.require_resource_governance()?;
    validate_read_scope(read)?;
    read.recheck(service.authorizer, service.clock.now_ms())
        .map_err(ReadError::from)?;
    let mut page = service.page(read, query, cursor).await?;
    let mut reports = Vec::with_capacity(page.rows.len());
    for row in std::mem::take(&mut page.rows) {
        reports.push(adapt_read_row(row, bindings)?);
    }
    read.recheck(service.authorizer, service.clock.now_ms())
        .map_err(ReadError::from)?;
    Ok(FinancialReadPage {
        metadata: page,
        reports,
    })
}

fn validate_read_scope(read: &AuthorizedRead) -> Result<(), FinancialProjectionError> {
    const FIELDS: &[&str] = &[
        "reference",
        "report_key",
        "version",
        "snapshot_ref",
        "publication_payload_hash",
        "header",
        "rows",
        "statements",
        "native",
        "native_snapshot",
        "publication_valid_until_ms",
        "publication_valid_until_sub_ms_us",
        "source_event_id",
        "source_group_id",
        "capture_recorded_at_ms",
        "capture_recorded_at_sub_ms_us",
    ];
    let scope = read.scope();
    if scope.dataset != DATASET
        || scope.schema_version != PAYLOAD_SCHEMA
        || FIELDS
            .iter()
            .any(|field| !scope.allowed_fields.contains(*field))
    {
        return Err(ReadError::Scope(ScopedError::AccessDenied).into());
    }
    Ok(())
}

fn adapt_read_row(
    row: ReadRow,
    bindings: &BTreeMap<String, FinancialBinding>,
) -> Result<FinancialReadRow, FinancialProjectionError> {
    let ordinal = row
        .payload
        .get("version")
        .and_then(Value::as_str)
        .and_then(|value| value.parse().ok())
        .ok_or(FinancialProjectionError::Binding)?;
    let report = validate_report(
        &row.payload,
        &row.entity_id,
        &Revision {
            ordinal,
            opaque: row.revision.clone(),
        },
        bindings,
    )?;
    Ok(FinancialReadRow {
        entity_id: row.entity_id,
        revision: row.revision,
        event_id: row.event_id,
        operation: row.operation,
        occurred_at_ms: row.occurred_at_ms,
        correction_of: row.correction_of,
        report,
    })
}

#[cfg(test)]
mod tests;
