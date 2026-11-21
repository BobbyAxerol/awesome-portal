#![forbid(unsafe_code)]

//! P05's bounded, read-only artifact reader foundation.
//!
//! This crate is intentionally below the Control API/BFF boundary.  It knows
//! how to validate a sealed on-disk manifest and return bounded Arrow batches;
//! it does not decide visibility, retention, readiness, or JSON encoding.

use std::collections::BTreeSet;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Component, Path, PathBuf};

use arrow_array::RecordBatch;
use base64::Engine;
use hmac::{Hmac, Mac};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::arrow::ProjectionMask;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const MAX_PAGE_ROWS: usize = 200;
pub const MAX_PAGE_LOGICAL_BYTES: usize = 1_048_576;
pub const MAX_MANIFEST_BYTES: usize = 262_144;

#[derive(Debug, Error)]
pub enum ArtifactReadError {
    #[error("artifact reference is invalid")]
    InvalidReference,
    #[error("artifact manifest is missing or invalid")]
    InvalidManifest,
    #[error("artifact manifest digest does not match")]
    ManifestDigestMismatch,
    #[error("artifact part digest does not match")]
    PartDigestMismatch,
    #[error("requested table or column projection is unavailable")]
    ProjectionUnavailable,
    #[error("cursor is not valid for this artifact relation")]
    CursorMismatch,
    #[error("cursor signing material is invalid")]
    CursorSecretInvalid,
    #[error("requested page exceeds the bounded P05 reader contract")]
    PageLimitExceeded,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parquet error: {0}")]
    Parquet(#[from] parquet::errors::ParquetError),
    #[error("Arrow error: {0}")]
    Arrow(#[from] arrow_schema::ArrowError),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactManifest {
    pub schema_version: String,
    pub artifact_id: String,
    pub artifact_revision: u64,
    pub workspace_id: String,
    pub run_id: String,
    pub worker_attempt_id: String,
    pub lease_epoch: u64,
    pub engine: ArtifactEngine,
    pub input: ArtifactInput,
    pub retention: ArtifactRetention,
    pub completed_at: String,
    pub tables: Vec<ArtifactTable>,
    pub documents: Vec<ArtifactDocument>,
    pub totals: ArtifactTotals,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactEngine {
    pub release_id: String,
    pub build_ref: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactInput {
    pub request_spec_digest: String,
    pub effective_spec_digest: String,
    pub dataset_binding_digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactRetention {
    #[serde(rename = "class")]
    pub class_name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactTotals {
    pub rows: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactTable {
    pub table_kind: String,
    pub schema_version: String,
    pub part_schema_version: String,
    pub schema_fingerprint: String,
    pub columns: Vec<ArtifactColumn>,
    pub sequence_column: Option<String>,
    pub id_column: Option<String>,
    pub rows: u64,
    pub bytes: u64,
    pub parts: Vec<ArtifactPart>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactColumn {
    pub name: String,
    pub arrow_type: String,
    pub nullable: bool,
    pub unit: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactPart {
    pub table_kind: String,
    pub part_ordinal: u32,
    pub relative_path: String,
    pub sha256: String,
    pub rows: u64,
    pub bytes: u64,
    pub sequence_min: Value,
    pub sequence_max: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactDocument {
    pub name: String,
    pub relative_path: String,
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct ArtifactCursor {
    pub artifact_id: String,
    pub table_kind: String,
    pub columns: Vec<String>,
    pub part_ordinal: u32,
    pub row_offset: u64,
}

#[derive(Debug)]
pub struct ArtifactPage {
    pub batches: Vec<RecordBatch>,
    pub row_count: usize,
    pub logical_bytes: usize,
    pub next_cursor: Option<ArtifactCursor>,
}

struct PageState {
    batches: Vec<RecordBatch>,
    rows: usize,
    logical_bytes: usize,
}

struct PageReadContext<'a> {
    max_rows: usize,
    max_logical_bytes: usize,
    manifest: &'a ArtifactManifest,
    table_kind: &'a str,
    requested_columns: &'a [String],
    part_ordinal: u32,
}

impl PageState {
    fn finish(self, next_cursor: Option<ArtifactCursor>) -> ArtifactPage {
        ArtifactPage {
            batches: self.batches,
            row_count: self.rows,
            logical_bytes: self.logical_bytes,
            next_cursor,
        }
    }
}

/// Encodes a relation-bound cursor as a URL-safe signed token.  The caller
/// owns the secret in its server-side configuration; the browser never sees
/// a raw artifact path, lease, database ID or unsigned offset.
pub struct CursorCodec {
    secret: Vec<u8>,
}

impl CursorCodec {
    /// Creates a cursor codec from at least 32 bytes of server-side secret.
    ///
    /// # Errors
    ///
    /// Returns an error if the supplied secret is too short to act as a
    /// dedicated cursor-signing key.
    pub fn new(secret: impl AsRef<[u8]>) -> Result<Self, ArtifactReadError> {
        let secret = secret.as_ref();
        if secret.len() < 32 {
            return Err(ArtifactReadError::CursorSecretInvalid);
        }
        Ok(Self {
            secret: secret.to_vec(),
        })
    }

    /// Serializes and signs a cursor without exposing its fields as a trusted
    /// browser input.
    ///
    /// # Errors
    ///
    /// Returns an error only if cursor serialization or HMAC initialization
    /// unexpectedly fails.
    pub fn encode(&self, cursor: &ArtifactCursor) -> Result<String, ArtifactReadError> {
        let payload = serde_json::to_vec(cursor)?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.secret)
            .map_err(|_| ArtifactReadError::CursorSecretInvalid)?;
        mac.update(&payload);
        let signature = mac.finalize().into_bytes();
        Ok(format!(
            "{}.{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload),
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(signature),
        ))
    }

    /// Verifies and decodes a cursor token before relation-bound reader use.
    ///
    /// # Errors
    ///
    /// Returns `CursorMismatch` for malformed, altered or unsigned tokens.
    pub fn decode(&self, token: &str) -> Result<ArtifactCursor, ArtifactReadError> {
        let (payload, signature) = token
            .split_once('.')
            .ok_or(ArtifactReadError::CursorMismatch)?;
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(payload)
            .map_err(|_| ArtifactReadError::CursorMismatch)?;
        let signature = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| ArtifactReadError::CursorMismatch)?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.secret)
            .map_err(|_| ArtifactReadError::CursorSecretInvalid)?;
        mac.update(&payload);
        mac.verify_slice(&signature)
            .map_err(|_| ArtifactReadError::CursorMismatch)?;
        serde_json::from_slice(&payload).map_err(|_| ArtifactReadError::CursorMismatch)
    }
}

pub struct BoundedArtifactReader {
    artifact_dir: PathBuf,
    manifest: ArtifactManifest,
}

impl BoundedArtifactReader {
    /// Opens a sealed artifact only after its bounded manifest has passed the
    /// expected SHA-256 and path/shape checks.
    ///
    /// # Errors
    ///
    /// Returns an error when the manifest is absent, too large, malformed,
    /// digest-mismatched, or contains an unsafe part reference.
    pub fn open(
        artifact_dir: impl AsRef<Path>,
        expected_manifest_digest: &str,
    ) -> Result<Self, ArtifactReadError> {
        let artifact_dir = artifact_dir.as_ref().to_path_buf();
        let manifest_path = artifact_dir.join("manifest.json");
        let manifest_bytes = bounded_read(&manifest_path, MAX_MANIFEST_BYTES)?;
        if sha256_hex(&manifest_bytes) != expected_manifest_digest {
            return Err(ArtifactReadError::ManifestDigestMismatch);
        }
        let manifest: ArtifactManifest = serde_json::from_slice(&manifest_bytes)?;
        validate_manifest(&manifest, &artifact_dir)?;
        Ok(Self {
            artifact_dir,
            manifest,
        })
    }

    #[must_use]
    pub fn artifact_id(&self) -> &str {
        &self.manifest.artifact_id
    }

    /// Reads one relation-bound bounded page without retaining a whole
    /// artifact in memory.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid page budget/cursor/projection, a
    /// malformed or changed part, or a Parquet/Arrow I/O failure.
    pub fn read_page(
        &self,
        table_kind: &str,
        columns: &[String],
        cursor: Option<&ArtifactCursor>,
        max_rows: usize,
        max_logical_bytes: usize,
    ) -> Result<ArtifactPage, ArtifactReadError> {
        if max_rows == 0
            || max_rows > MAX_PAGE_ROWS
            || max_logical_bytes == 0
            || max_logical_bytes > MAX_PAGE_LOGICAL_BYTES
        {
            return Err(ArtifactReadError::PageLimitExceeded);
        }
        let requested_columns = canonical_columns(columns)?;
        let start = match cursor {
            Some(value) => {
                if value.artifact_id != self.manifest.artifact_id
                    || value.table_kind != table_kind
                    || canonical_columns(&value.columns)? != requested_columns
                {
                    return Err(ArtifactReadError::CursorMismatch);
                }
                (value.part_ordinal, value.row_offset)
            }
            None => (0, 0),
        };

        let table = self
            .manifest
            .tables
            .iter()
            .find(|table| table.table_kind == table_kind)
            .ok_or(ArtifactReadError::ProjectionUnavailable)?;
        let declared_columns: BTreeSet<&str> = table
            .columns
            .iter()
            .map(|column| column.name.as_str())
            .collect();
        if requested_columns
            .iter()
            .any(|column| !declared_columns.contains(column.as_str()))
        {
            return Err(ArtifactReadError::ProjectionUnavailable);
        }
        let mut state = PageState {
            batches: Vec::new(),
            rows: 0,
            logical_bytes: 0,
        };
        for part in table
            .parts
            .iter()
            .filter(|part| part.part_ordinal >= start.0)
        {
            let offset = if part.part_ordinal == start.0 {
                start.1
            } else {
                0
            };
            let part_path = self.artifact_dir.join(&part.relative_path);
            let (actual_bytes, actual_digest) = stream_digest(&part_path)?;
            if actual_bytes != part.bytes || actual_digest != part.sha256 {
                return Err(ArtifactReadError::PartDigestMismatch);
            }
            let projection = projection_for(&part_path, &requested_columns)?;
            let file = File::open(&part_path)?;
            let reader = ParquetRecordBatchReaderBuilder::try_new(file)?
                .with_projection(projection)
                .with_batch_size(MAX_PAGE_ROWS)
                .build()?;
            let mut skipped = 0_u64;
            for batch in reader {
                let batch = batch?;
                let batch_rows = batch.num_rows() as u64;
                if skipped.saturating_add(batch_rows) <= offset {
                    skipped = skipped.saturating_add(batch_rows);
                    continue;
                }
                let start_in_batch = usize::try_from(offset.saturating_sub(skipped))
                    .map_err(|_| ArtifactReadError::InvalidManifest)?;
                let cursor_offset = skipped + start_in_batch as u64;
                let context = PageReadContext {
                    max_rows,
                    max_logical_bytes,
                    manifest: &self.manifest,
                    table_kind,
                    requested_columns: &requested_columns,
                    part_ordinal: part.part_ordinal,
                };
                if let Some(next_cursor) = append_batch_to_page(
                    &mut state,
                    &batch,
                    start_in_batch,
                    cursor_offset,
                    &context,
                )? {
                    return Ok(state.finish(Some(next_cursor)));
                }
                skipped = skipped.saturating_add(batch_rows);
            }
        }
        Ok(state.finish(None))
    }
}

fn validate_manifest(
    manifest: &ArtifactManifest,
    artifact_dir: &Path,
) -> Result<(), ArtifactReadError> {
    validate_manifest_header(manifest, artifact_dir)?;
    let (table_rows, table_bytes) = validate_manifest_tables(manifest)?;
    let document_bytes = validate_manifest_documents(manifest)?;
    if manifest.totals.rows != table_rows
        || manifest.totals.bytes != checked_metric_sum(table_bytes, document_bytes)?
    {
        return Err(ArtifactReadError::InvalidManifest);
    }
    Ok(())
}

fn validate_manifest_header(
    manifest: &ArtifactManifest,
    artifact_dir: &Path,
) -> Result<(), ArtifactReadError> {
    if manifest.schema_version != "research.artifact-manifest.v1"
        || manifest.artifact_revision == 0
        || !is_safe_id(&manifest.artifact_id)
        || !is_safe_id(&manifest.workspace_id)
        || !is_safe_id(&manifest.run_id)
        || !is_safe_id(&manifest.worker_attempt_id)
        || manifest.lease_epoch == 0
        || !is_bounded_text(&manifest.engine.release_id, 256)
        || !is_bounded_text(&manifest.engine.build_ref, 512)
        || !is_sha256(&manifest.input.request_spec_digest)
        || !is_sha256(&manifest.input.effective_spec_digest)
        || !is_sha256(&manifest.input.dataset_binding_digest)
        || !is_bounded_text(&manifest.retention.class_name, 128)
        || !is_utc_timestamp(&manifest.completed_at)
        || artifact_dir.file_name().and_then(|part| part.to_str())
            != Some(manifest.artifact_id.as_str())
    {
        return Err(ArtifactReadError::InvalidManifest);
    }
    Ok(())
}

fn validate_manifest_tables(manifest: &ArtifactManifest) -> Result<(u64, u64), ArtifactReadError> {
    if manifest.tables.is_empty() {
        return Err(ArtifactReadError::InvalidManifest);
    }
    let mut table_kinds = BTreeSet::new();
    let mut paths = BTreeSet::new();
    let mut total_rows = 0_u64;
    let mut total_bytes = 0_u64;
    for table in &manifest.tables {
        if !table_kinds.insert(table.table_kind.clone()) {
            return Err(ArtifactReadError::InvalidManifest);
        }
        let (rows, bytes) = validate_manifest_table(table, &mut paths)?;
        total_rows = checked_metric_sum(total_rows, rows)?;
        total_bytes = checked_metric_sum(total_bytes, bytes)?;
    }
    Ok((total_rows, total_bytes))
}

fn validate_manifest_table(
    table: &ArtifactTable,
    paths: &mut BTreeSet<String>,
) -> Result<(u64, u64), ArtifactReadError> {
    if !is_safe_id(&table.table_kind)
        || !is_bounded_text(&table.schema_version, 256)
        || table.part_schema_version != "research.parquet-part.v1"
        || !is_sha256(&table.schema_fingerprint)
        || table.columns.is_empty()
        || table.parts.is_empty()
    {
        return Err(ArtifactReadError::InvalidManifest);
    }
    let mut declared_columns = BTreeSet::new();
    for column in &table.columns {
        if !is_safe_id(&column.name)
            || !is_bounded_text(&column.arrow_type, 256)
            || column
                .unit
                .as_deref()
                .is_some_and(|unit| !is_bounded_text(unit, 128))
            || !declared_columns.insert(column.name.clone())
        {
            return Err(ArtifactReadError::InvalidManifest);
        }
    }
    for selected in [&table.sequence_column, &table.id_column] {
        if selected
            .as_deref()
            .is_some_and(|column| !declared_columns.contains(column))
        {
            return Err(ArtifactReadError::InvalidManifest);
        }
    }
    let mut table_rows = 0_u64;
    let mut table_bytes = 0_u64;
    for (index, part) in table.parts.iter().enumerate() {
        let ordinal = u32::try_from(index + 1).map_err(|_| ArtifactReadError::InvalidManifest)?;
        let required_prefix = format!("tables/{}/", table.table_kind);
        if part.table_kind != table.table_kind
            || part.part_ordinal != ordinal
            || !part.relative_path.starts_with(&required_prefix)
            || !is_safe_relative_path(&part.relative_path)
            || !has_exact_extension(&part.relative_path, "parquet")
            || !is_sha256(&part.sha256)
            || !is_sequence_scalar(&part.sequence_min)
            || !is_sequence_scalar(&part.sequence_max)
            || !paths.insert(part.relative_path.clone())
        {
            return Err(ArtifactReadError::InvalidManifest);
        }
        table_rows = checked_metric_sum(table_rows, part.rows)?;
        table_bytes = checked_metric_sum(table_bytes, part.bytes)?;
    }
    if table.rows != table_rows || table.bytes != table_bytes {
        return Err(ArtifactReadError::InvalidManifest);
    }
    Ok((table_rows, table_bytes))
}

fn validate_manifest_documents(manifest: &ArtifactManifest) -> Result<u64, ArtifactReadError> {
    let mut names = BTreeSet::new();
    let mut paths = BTreeSet::new();
    let mut total_bytes = 0_u64;
    for document in &manifest.documents {
        if !is_safe_id(&document.name)
            || !document.relative_path.starts_with("documents/")
            || !is_safe_relative_path(&document.relative_path)
            || !has_exact_extension(&document.relative_path, "json")
            || !is_sha256(&document.sha256)
            || !names.insert(document.name.clone())
            || !paths.insert(document.relative_path.clone())
        {
            return Err(ArtifactReadError::InvalidManifest);
        }
        total_bytes = checked_metric_sum(total_bytes, document.bytes)?;
    }
    Ok(total_bytes)
}

fn append_batch_to_page(
    state: &mut PageState,
    batch: &RecordBatch,
    start_in_batch: usize,
    cursor_offset: u64,
    context: &PageReadContext<'_>,
) -> Result<Option<ArtifactCursor>, ArtifactReadError> {
    let available_rows = batch.num_rows().saturating_sub(start_in_batch);
    let remaining_rows = context.max_rows.saturating_sub(state.rows);
    let taken_rows = available_rows.min(remaining_rows);
    if taken_rows == 0 {
        return Ok(Some(cursor_for(
            context.manifest,
            context.table_kind,
            context.requested_columns,
            context.part_ordinal,
            cursor_offset,
        )));
    }
    let taken = batch.slice(start_in_batch, taken_rows);
    let taken_bytes = taken.get_array_memory_size();
    if state.logical_bytes.saturating_add(taken_bytes) > context.max_logical_bytes {
        if state.batches.is_empty() {
            return Err(ArtifactReadError::PageLimitExceeded);
        }
        return Ok(Some(cursor_for(
            context.manifest,
            context.table_kind,
            context.requested_columns,
            context.part_ordinal,
            cursor_offset,
        )));
    }
    state.rows += taken_rows;
    state.logical_bytes += taken_bytes;
    let next_offset = cursor_offset + taken_rows as u64;
    let incomplete_batch = start_in_batch + taken_rows < batch.num_rows();
    state.batches.push(taken);
    if state.rows == context.max_rows || incomplete_batch {
        return Ok(Some(cursor_for(
            context.manifest,
            context.table_kind,
            context.requested_columns,
            context.part_ordinal,
            next_offset,
        )));
    }
    Ok(None)
}

fn projection_for(path: &Path, columns: &[String]) -> Result<ProjectionMask, ArtifactReadError> {
    let file = File::open(path)?;
    let builder = ParquetRecordBatchReaderBuilder::try_new(file)?;
    let schema = builder.schema();
    let mut indices = Vec::with_capacity(columns.len());
    for column in columns {
        let index = schema
            .index_of(column)
            .map_err(|_| ArtifactReadError::ProjectionUnavailable)?;
        indices.push(index);
    }
    Ok(ProjectionMask::leaves(builder.parquet_schema(), indices))
}

fn cursor_for(
    manifest: &ArtifactManifest,
    table_kind: &str,
    columns: &[String],
    part_ordinal: u32,
    row_offset: u64,
) -> ArtifactCursor {
    ArtifactCursor {
        artifact_id: manifest.artifact_id.clone(),
        table_kind: table_kind.to_owned(),
        columns: columns.to_vec(),
        part_ordinal,
        row_offset,
    }
}

fn canonical_columns(columns: &[String]) -> Result<Vec<String>, ArtifactReadError> {
    if columns.is_empty() || columns.len() > 64 {
        return Err(ArtifactReadError::ProjectionUnavailable);
    }
    let values: BTreeSet<String> = columns.iter().cloned().collect();
    if values.len() != columns.len() || values.iter().any(|column| !is_safe_id(column)) {
        return Err(ArtifactReadError::ProjectionUnavailable);
    }
    Ok(values.into_iter().collect())
}

fn bounded_read(path: &Path, limit: usize) -> Result<Vec<u8>, ArtifactReadError> {
    let metadata = std::fs::metadata(path)?;
    let length = usize::try_from(metadata.len()).map_err(|_| ArtifactReadError::InvalidManifest)?;
    if length > limit {
        return Err(ArtifactReadError::PageLimitExceeded);
    }
    let mut file = File::open(path)?;
    let mut bytes = Vec::with_capacity(length);
    file.read_to_end(&mut bytes)?;
    if bytes.len() != length {
        return Err(ArtifactReadError::InvalidManifest);
    }
    Ok(bytes)
}

fn stream_digest(path: &Path) -> Result<(u64, String), ArtifactReadError> {
    let mut file = BufReader::new(File::open(path)?);
    let mut hasher = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = vec![0_u8; 65_536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        total = total
            .checked_add(count as u64)
            .ok_or(ArtifactReadError::InvalidManifest)?;
        hasher.update(&buffer[..count]);
    }
    Ok((total, format!("{:x}", hasher.finalize())))
}

fn checked_metric_sum(left: u64, right: u64) -> Result<u64, ArtifactReadError> {
    left.checked_add(right)
        .ok_or(ArtifactReadError::InvalidManifest)
}

fn is_bounded_text(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.len() <= maximum
}

fn is_utc_timestamp(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value)
        .is_ok_and(|timestamp| timestamp.offset().local_minus_utc() == 0)
}

fn is_sequence_scalar(value: &Value) -> bool {
    matches!(value, Value::Null | Value::String(_) | Value::Number(_))
}

fn is_safe_id(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphanumeric())
        && chars.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
        && value.len() <= 160
}

fn is_safe_relative_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 1024
        && !Path::new(value).is_absolute()
        && Path::new(value)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn has_exact_extension(value: &str, expected: &str) -> bool {
    Path::new(value)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension == expected)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::Arc;

    use arrow_array::{ArrayRef, Int64Array, RecordBatch, StringArray};
    use arrow_schema::{DataType, Field, Schema};
    use parquet::arrow::ArrowWriter;

    use super::*;

    fn digest(bytes: &[u8]) -> String {
        sha256_hex(bytes)
    }

    fn write_fixture(root: &Path, rows: usize) -> (PathBuf, String) {
        let artifact_dir = root.join("artifact-rust-p05");
        let part_path = artifact_dir.join("tables/trial_index/part-000001.parquet");
        fs::create_dir_all(part_path.parent().expect("part parent"))
            .expect("create fixture directory");
        let schema = Arc::new(Schema::new(vec![
            Field::new("trial_id", DataType::Utf8, true),
            Field::new("seq", DataType::Int64, false),
        ]));
        let trial_ids: Vec<Option<String>> = (0..rows)
            .map(|index| match index {
                0 => None,
                _ => Some(format!("trial-{}", index + 1)),
            })
            .collect();
        let sequences: Vec<i64> = (0..rows)
            .map(|index| 1 + i64::try_from(index).expect("fixture row fits") * 7)
            .collect();
        let batch = RecordBatch::try_new(
            schema.clone(),
            vec![
                Arc::new(StringArray::from(trial_ids)) as ArrayRef,
                Arc::new(Int64Array::from(sequences)) as ArrayRef,
            ],
        )
        .expect("batch");
        let file = File::create(&part_path).expect("create parquet");
        let mut writer = ArrowWriter::try_new(file, schema, None).expect("writer");
        writer.write(&batch).expect("write parquet");
        writer.close().expect("close parquet");
        let part_bytes = fs::read(&part_path).expect("read parquet");
        let manifest = ArtifactManifest {
            schema_version: "research.artifact-manifest.v1".to_owned(),
            artifact_id: "artifact-rust-p05".to_owned(),
            artifact_revision: 1,
            workspace_id: "ws-rust-p05".to_owned(),
            run_id: "run-rust-p05".to_owned(),
            worker_attempt_id: "worker-rust-p05".to_owned(),
            lease_epoch: 1,
            engine: ArtifactEngine {
                release_id: "quantbt_1_1_1".to_owned(),
                build_ref: "wheel-sha256-pinned".to_owned(),
            },
            input: ArtifactInput {
                request_spec_digest: "a".repeat(64),
                effective_spec_digest: "b".repeat(64),
                dataset_binding_digest: "c".repeat(64),
            },
            retention: ArtifactRetention {
                class_name: "RESEARCH_EVIDENCE".to_owned(),
            },
            completed_at: "2026-09-19T12:00:00+00:00".to_owned(),
            tables: vec![ArtifactTable {
                table_kind: "trial_index".to_owned(),
                schema_version: "research.trial-index.v1".to_owned(),
                part_schema_version: "research.parquet-part.v1".to_owned(),
                schema_fingerprint: "d".repeat(64),
                columns: vec![
                    ArtifactColumn {
                        name: "trial_id".to_owned(),
                        arrow_type: "string".to_owned(),
                        nullable: true,
                        unit: None,
                    },
                    ArtifactColumn {
                        name: "seq".to_owned(),
                        arrow_type: "int64".to_owned(),
                        nullable: false,
                        unit: None,
                    },
                ],
                sequence_column: Some("seq".to_owned()),
                id_column: Some("trial_id".to_owned()),
                rows: rows as u64,
                bytes: part_bytes.len() as u64,
                parts: vec![ArtifactPart {
                    table_kind: "trial_index".to_owned(),
                    part_ordinal: 1,
                    relative_path: "tables/trial_index/part-000001.parquet".to_owned(),
                    sha256: digest(&part_bytes),
                    rows: rows as u64,
                    bytes: part_bytes.len() as u64,
                    sequence_min: Value::from(1),
                    sequence_max: Value::from(
                        1 + i64::try_from(rows - 1).expect("fixture rows fit") * 7,
                    ),
                }],
            }],
            documents: vec![],
            totals: ArtifactTotals {
                rows: rows as u64,
                bytes: part_bytes.len() as u64,
            },
        };
        let manifest_bytes = serde_json::to_vec(&manifest).expect("manifest bytes");
        fs::write(artifact_dir.join("manifest.json"), &manifest_bytes).expect("write manifest");
        (artifact_dir, digest(&manifest_bytes))
    }

    #[test]
    fn p05_rust_reader_projects_and_advances_relation_bound_cursor() {
        let temp = tempfile::tempdir().expect("temp directory");
        let (artifact_dir, manifest_digest) = write_fixture(temp.path(), 3);
        let reader = BoundedArtifactReader::open(&artifact_dir, &manifest_digest).expect("open");
        let columns = vec!["seq".to_owned(), "trial_id".to_owned()];
        let first = reader
            .read_page("trial_index", &columns, None, 1, MAX_PAGE_LOGICAL_BYTES)
            .expect("first page");
        assert_eq!(first.row_count, 1);
        let cursor = first.next_cursor.expect("cursor");
        let codec =
            CursorCodec::new(b"p05-test-cursor-secret-must-have-at-least-32-bytes").expect("codec");
        let token = codec.encode(&cursor).expect("encode cursor");
        assert_eq!(codec.decode(&token).expect("decode cursor"), cursor);
        assert!(matches!(
            codec.decode(&format!("{token}x")),
            Err(ArtifactReadError::CursorMismatch)
        ));
        let second = reader
            .read_page(
                "trial_index",
                &columns,
                Some(&cursor),
                1,
                MAX_PAGE_LOGICAL_BYTES,
            )
            .expect("second page");
        assert_eq!(second.row_count, 1);
        let wrong_columns = vec!["seq".to_owned()];
        assert!(matches!(
            reader.read_page(
                "trial_index",
                &wrong_columns,
                Some(&cursor),
                1,
                MAX_PAGE_LOGICAL_BYTES
            ),
            Err(ArtifactReadError::CursorMismatch)
        ));
    }

    #[test]
    fn p05_rust_reader_rejects_corrupt_part_and_oversized_page() {
        let temp = tempfile::tempdir().expect("temp directory");
        let (artifact_dir, manifest_digest) = write_fixture(temp.path(), 3);
        let reader = BoundedArtifactReader::open(&artifact_dir, &manifest_digest).expect("open");
        assert!(matches!(
            reader.read_page(
                "trial_index",
                &["seq".to_owned()],
                None,
                MAX_PAGE_ROWS + 1,
                MAX_PAGE_LOGICAL_BYTES
            ),
            Err(ArtifactReadError::PageLimitExceeded)
        ));
        fs::write(
            artifact_dir.join("tables/trial_index/part-000001.parquet"),
            b"corrupt",
        )
        .expect("corrupt part");
        assert!(matches!(
            reader.read_page(
                "trial_index",
                &["seq".to_owned()],
                None,
                1,
                MAX_PAGE_LOGICAL_BYTES
            ),
            Err(ArtifactReadError::PartDigestMismatch)
        ));
    }

    #[test]
    fn p05_rust_reader_parses_the_canonical_python_manifest_contract() {
        // This fixture is shared with the Python writer/Control API contract.
        // It prevents a private Rust-only manifest shape from drifting away
        // from the actual P05 wire/storage schema.
        let manifest: ArtifactManifest = serde_json::from_str(include_str!(
            "../../../packages/contracts/fixtures/research-artifact-manifest.valid.json",
        ))
        .expect("canonical manifest parses");
        assert_eq!(manifest.schema_version, "research.artifact-manifest.v1");
        assert_eq!(manifest.tables[0].table_kind, "trial_index");
        assert_eq!(manifest.tables[0].parts[0].sha256.len(), 64);
        assert_eq!(manifest.tables[0].parts[0].rows, 3);
    }

    #[test]
    fn p05_rust_reader_advances_across_multiple_parquet_batches() {
        // `with_batch_size(MAX_PAGE_ROWS)` causes this fixture to span more
        // than one underlying Arrow batch.  This guards the skip accounting
        // used when a signed cursor resumes inside a later batch; otherwise
        // a page could repeat or skip rows after the first 200-row batch.
        let temp = tempfile::tempdir().expect("temp directory");
        let (artifact_dir, manifest_digest) = write_fixture(temp.path(), 401);
        let reader = BoundedArtifactReader::open(&artifact_dir, &manifest_digest).expect("open");
        let columns = vec!["seq".to_owned()];

        let first = reader
            .read_page(
                "trial_index",
                &columns,
                None,
                MAX_PAGE_ROWS,
                MAX_PAGE_LOGICAL_BYTES,
            )
            .expect("first page");
        assert_eq!(first.row_count, MAX_PAGE_ROWS);
        let second = reader
            .read_page(
                "trial_index",
                &columns,
                first.next_cursor.as_ref(),
                MAX_PAGE_ROWS,
                MAX_PAGE_LOGICAL_BYTES,
            )
            .expect("second page");
        assert_eq!(second.row_count, MAX_PAGE_ROWS);
        let third = reader
            .read_page(
                "trial_index",
                &columns,
                second.next_cursor.as_ref(),
                MAX_PAGE_ROWS,
                MAX_PAGE_LOGICAL_BYTES,
            )
            .expect("third page");
        assert_eq!(third.row_count, 1);
        assert!(third.next_cursor.is_none());
    }

    #[test]
    fn p05_rust_reader_rejects_cross_language_manifest_invariant_drift() {
        let temp = tempfile::tempdir().expect("temp directory");
        let (artifact_dir, _) = write_fixture(temp.path(), 3);
        let manifest_path = artifact_dir.join("manifest.json");
        let mut manifest: Value =
            serde_json::from_slice(&fs::read(&manifest_path).expect("read fixture manifest"))
                .expect("parse fixture manifest");
        manifest["tables"][0]["parts"][0]["relative_path"] =
            Value::String("documents/not-a-table-part.parquet".to_owned());
        manifest["totals"]["bytes"] = Value::from(0);
        let bytes = serde_json::to_vec(&manifest).expect("serialize invalid manifest");
        fs::write(&manifest_path, &bytes).expect("rewrite invalid manifest");

        assert!(matches!(
            BoundedArtifactReader::open(&artifact_dir, &digest(&bytes)),
            Err(ArtifactReadError::InvalidManifest)
        ));
    }
}
