#![forbid(unsafe_code)]

//! Locked, typed contract boundary for the private Trading System Manager-v2
//! profile-bound read facade.
//!
//! This crate deliberately models only the five owner-published `GET`
//! operations. It cannot construct a database query, a caller-selected
//! profile, or an arbitrary source URL. Relation pages, record keys and
//! cursors are accepted only after they originate from a validated catalogue
//! or a prior Manager response with the same deployment-bound profile and
//! catalogue.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use chrono::{DateTime, Utc};
use execution_contracts::DecimalString;
use serde::{de::DeserializeOwned, ser::SerializeMap, Deserialize, Serialize, Serializer};
use serde_json::Value;
use thiserror::Error;

include!(concat!(env!("OUT_DIR"), "/contract_identity.rs"));

pub const DEFAULT_PAGE_LIMIT: u16 = 100;
pub const MAXIMUM_OPAQUE_TOKEN_BYTES: usize = 4_096;
const MAXIMUM_IDENTIFIER_BYTES: usize = 63;
const MAXIMUM_TRACE_BYTES: usize = 256;
const MAXIMUM_TEXT_BYTES: usize = MAXIMUM_RESPONSE_BYTES;
const MAXIMUM_STRUCTURED_DEPTH: usize = 16;
const MAXIMUM_OBJECT_MEMBERS: usize = 1_600;
const MAXIMUM_RELATIONS: usize = 10_000;

const MANAGER_PREFIX: &str = "/portal/execution/v2/manager";
const EXPECTED_CAPABILITIES: [(&str, &str); 5] = [
    ("managerCatalog", "/portal/execution/v2/manager/catalog"),
    (
        "managerRelationRecords",
        "/portal/execution/v2/manager/records/{schema}/{relation}",
    ),
    (
        "managerRelationRecord",
        "/portal/execution/v2/manager/records/{schema}/{relation}/{key}",
    ),
    (
        "managerProjection",
        "/portal/execution/v2/manager/projections/{kind}",
    ),
    (
        "managerCapabilities",
        "/portal/execution/v2/manager/capabilities",
    ),
];

/// One bounded page size within the owner-qualified Manager-v2 envelope.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PageLimit(u16);

impl PageLimit {
    /// Builds a page size after enforcing the fixed owner bound.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::InvalidPageLimit`] outside `1..=200`.
    pub const fn new(value: u16) -> Result<Self, ContractError> {
        if value == 0 || value > MAXIMUM_PAGE_ROWS {
            return Err(ContractError::InvalidPageLimit);
        }
        Ok(Self(value))
    }

    #[must_use]
    pub const fn get(self) -> u16 {
        self.0
    }
}

impl Default for PageLimit {
    fn default() -> Self {
        // This constant is checked at compile time by `PageLimit::new` above.
        Self(DEFAULT_PAGE_LIMIT)
    }
}

/// The only named projections published by the owner runtime overlay.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectionKind {
    Portfolio,
    Account,
    Order,
    Fill,
    Position,
    Reconciliation,
    CommandJournal,
}

impl ProjectionKind {
    #[must_use]
    pub fn from_path_segment(value: &str) -> Option<Self> {
        match value {
            "portfolio" => Some(Self::Portfolio),
            "account" => Some(Self::Account),
            "order" => Some(Self::Order),
            "fill" => Some(Self::Fill),
            "position" => Some(Self::Position),
            "reconciliation" => Some(Self::Reconciliation),
            "command_journal" => Some(Self::CommandJournal),
            _ => None,
        }
    }

    #[must_use]
    pub const fn path_segment(self) -> &'static str {
        match self {
            Self::Portfolio => "portfolio",
            Self::Account => "account",
            Self::Order => "order",
            Self::Fill => "fill",
            Self::Position => "position",
            Self::Reconciliation => "reconciliation",
            Self::CommandJournal => "command_journal",
        }
    }
}

/// SHA-256 identity of one owner-published relation catalogue.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CatalogueDigest(String);

impl Serialize for CatalogueDigest {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl CatalogueDigest {
    fn parse(raw: String) -> Result<Self, ContractError> {
        let Some(hex) = raw.strip_prefix("sha256:") else {
            return Err(ContractError::InvalidCatalogueDigest);
        };
        if hex.len() != 64
            || !hex.bytes().all(|byte| {
                byte.is_ascii_digit() || (byte.is_ascii_lowercase() && byte.is_ascii_hexdigit())
            })
        {
            return Err(ContractError::InvalidCatalogueDigest);
        }
        Ok(Self(raw))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A source-issued opaque page cursor. Its value is intentionally redacted
/// from debug output and can only be reused through a bound request builder.
#[derive(Clone, PartialEq, Eq)]
pub struct OpaqueCursor {
    value: String,
    binding: CursorBinding,
}

impl OpaqueCursor {
    fn parse(value: String, binding: CursorBinding) -> Result<Self, ContractError> {
        validate_opaque_token(&value)?;
        Ok(Self { value, binding })
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.value
    }

    /// Reconstructs a source-issued cursor after an authenticated Portal HTTP
    /// round trip. The caller supplies the exact catalogue relation it is
    /// resuming; the owner facade remains authoritative for the opaque token.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::InvalidOpaqueToken`] when the returned token is
    /// not within the owner-published opaque-token syntax and size bound.
    pub fn from_relation_round_trip(
        value: String,
        relation: &CataloguedRelation,
    ) -> Result<Self, ContractError> {
        Self::parse(
            value,
            CursorBinding::Relation {
                relation: relation.id.clone(),
                catalogue_digest: relation.catalogue_digest.clone(),
            },
        )
    }

    /// Reconstructs a source-issued projection cursor after an authenticated
    /// Portal HTTP round trip, retaining its catalogue and projection binding.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::InvalidOpaqueToken`] when the returned token is
    /// not within the owner-published opaque-token syntax and size bound.
    pub fn from_projection_round_trip(
        value: String,
        catalogue: &ManagerCatalogue,
        kind: ProjectionKind,
    ) -> Result<Self, ContractError> {
        Self::parse(
            value,
            CursorBinding::Projection {
                kind,
                catalogue_digest: catalogue.catalogue_revision.clone(),
            },
        )
    }
}

impl Serialize for OpaqueCursor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.value)
    }
}

impl fmt::Debug for OpaqueCursor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("OpaqueCursor([REDACTED])")
    }
}

/// A source-issued opaque record key. It cannot be synthesized by callers.
#[derive(Clone, PartialEq, Eq)]
pub struct OpaqueRecordKey(String);

impl OpaqueRecordKey {
    fn parse(value: String) -> Result<Self, ContractError> {
        validate_opaque_token(&value)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Serialize for OpaqueRecordKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl fmt::Debug for OpaqueRecordKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("OpaqueRecordKey([REDACTED])")
    }
}

/// One allowlisted application relation from the owner catalogue.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub struct RelationId {
    schema: String,
    relation: String,
}

impl RelationId {
    fn new(schema: String, relation: String) -> Result<Self, ContractError> {
        validate_identifier(&schema)?;
        validate_identifier(&relation)?;
        Ok(Self { schema, relation })
    }

    #[must_use]
    pub fn schema(&self) -> &str {
        &self.schema
    }

    #[must_use]
    pub fn relation(&self) -> &str {
        &self.relation
    }
}

/// A returnable column the owner has explicitly included in its catalogue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SafeColumn {
    name: String,
    ordinal: u32,
    data_type: String,
    nullable: bool,
}

impl SafeColumn {
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    #[must_use]
    pub const fn ordinal(&self) -> u32 {
        self.ordinal
    }

    #[must_use]
    pub fn data_type(&self) -> &str {
        &self.data_type
    }

    #[must_use]
    pub const fn nullable(&self) -> bool {
        self.nullable
    }
}

/// Runtime-qualified key proof for a catalogue relation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KeyStatus {
    PrimaryKey,
    UniqueIndex,
    ExpressionUniqueIndex,
    ViewSourceComposite,
}

/// An owner-selected key descriptor. It is informational; callers never turn
/// it into a query or choose its columns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KeyDescriptor {
    status: KeyStatus,
    name: Option<String>,
    columns: Vec<String>,
}

impl KeyDescriptor {
    #[must_use]
    pub const fn status(&self) -> KeyStatus {
        self.status
    }

    #[must_use]
    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    #[must_use]
    pub fn columns(&self) -> &[String] {
        &self.columns
    }
}

/// Owner-recognized relation kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelationKind {
    Table,
    PartitionedTable,
    View,
    MaterializedView,
    ForeignTable,
}

/// Fixed Paper profile classification published by the owner catalogue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProfileClassification {
    RelationProfileMarkersPresent,
    FixedProfileContext,
}

/// A relation reference tied to exactly one validated catalogue digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CataloguedRelation {
    id: RelationId,
    kind: RelationKind,
    safe_columns: Vec<SafeColumn>,
    #[serde(skip_serializing)]
    safe_column_names: BTreeSet<String>,
    secret_cell_excluded_column_count: u32,
    key: KeyDescriptor,
    profile_classification: ProfileClassification,
    profile_columns: Vec<String>,
    query_status: String,
    #[serde(skip_serializing)]
    catalogue_digest: CatalogueDigest,
}

impl CataloguedRelation {
    #[must_use]
    pub fn id(&self) -> &RelationId {
        &self.id
    }

    #[must_use]
    pub const fn kind(&self) -> RelationKind {
        self.kind
    }

    #[must_use]
    pub fn safe_columns(&self) -> &[SafeColumn] {
        &self.safe_columns
    }

    #[must_use]
    pub const fn secret_cell_excluded_column_count(&self) -> u32 {
        self.secret_cell_excluded_column_count
    }

    #[must_use]
    pub fn key(&self) -> &KeyDescriptor {
        &self.key
    }

    #[must_use]
    pub const fn profile_classification(&self) -> ProfileClassification {
        self.profile_classification
    }

    #[must_use]
    pub fn profile_columns(&self) -> &[String] {
        &self.profile_columns
    }

    #[must_use]
    pub fn catalogue_digest(&self) -> &CatalogueDigest {
        &self.catalogue_digest
    }

    fn has_exact_safe_columns(&self, fields: &BTreeMap<String, ManagerValue>) -> bool {
        fields.keys().eq(self.safe_column_names.iter())
    }
}

/// The validated owner catalogue. It is the only source of relation references
/// accepted by the relation-page request builder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerCatalogue {
    catalogue_revision: CatalogueDigest,
    relation_count: usize,
    relations: Vec<CataloguedRelation>,
}

impl ManagerCatalogue {
    #[must_use]
    pub fn catalogue_revision(&self) -> &CatalogueDigest {
        &self.catalogue_revision
    }

    #[must_use]
    pub fn relations(&self) -> &[CataloguedRelation] {
        &self.relations
    }

    #[must_use]
    pub fn relation(&self, schema: &str, relation: &str) -> Option<&CataloguedRelation> {
        self.relations
            .iter()
            .find(|candidate| candidate.id.schema == schema && candidate.id.relation == relation)
    }

    fn relation_by_id(&self, relation: &RelationId) -> Option<&CataloguedRelation> {
        self.relations
            .iter()
            .find(|candidate| candidate.id == *relation)
    }
}

/// Availability state returned by the owner facade.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Availability {
    Available,
    PendingTsOc03D,
    Unavailable,
    Stale,
    Partial,
}

/// Freshness supplied by the owner facade; it is never inferred locally.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Freshness {
    Fresh,
    Degraded,
    Stale,
    Unavailable,
    Unknown,
}

/// Completeness supplied by the owner facade; it is never inferred locally.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Completeness {
    Complete,
    Partial,
    Unknown,
}

/// Shared metadata for an available owner response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerMeta {
    contract_version: &'static str,
    authority: &'static str,
    profile_id: String,
    catalogue_sha256: CatalogueDigest,
    availability: Availability,
    freshness: Freshness,
    completeness: Completeness,
    trace_id: String,
    as_of: DateTime<Utc>,
}

impl ManagerMeta {
    #[must_use]
    pub const fn contract_version(&self) -> &'static str {
        self.contract_version
    }

    #[must_use]
    pub const fn authority(&self) -> &'static str {
        self.authority
    }

    #[must_use]
    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }

    #[must_use]
    pub fn catalogue_sha256(&self) -> &CatalogueDigest {
        &self.catalogue_sha256
    }

    #[must_use]
    pub const fn freshness(&self) -> Freshness {
        self.freshness
    }

    #[must_use]
    pub const fn completeness(&self) -> Completeness {
        self.completeness
    }

    #[must_use]
    pub fn trace_id(&self) -> &str {
        &self.trace_id
    }

    #[must_use]
    pub const fn as_of(&self) -> DateTime<Utc> {
        self.as_of
    }
}

/// One successful, typed owner response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerEnvelope<T> {
    #[serde(flatten)]
    meta: ManagerMeta,
    data: T,
}

impl<T> ManagerEnvelope<T> {
    #[must_use]
    pub fn meta(&self) -> &ManagerMeta {
        &self.meta
    }

    #[must_use]
    pub fn data(&self) -> &T {
        &self.data
    }

    #[must_use]
    pub fn into_data(self) -> T {
        self.data
    }
}

/// A typed owner unavailability result. It is not an empty success and carries
/// no retry instruction for this client to apply automatically.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerUnavailable {
    contract_version: &'static str,
    authority: &'static str,
    profile_id: String,
    catalogue_sha256: CatalogueDigest,
    availability: Availability,
    reason_code: String,
    trace_id: String,
}

impl ManagerUnavailable {
    #[must_use]
    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }

    #[must_use]
    pub fn catalogue_sha256(&self) -> &CatalogueDigest {
        &self.catalogue_sha256
    }

    #[must_use]
    pub const fn availability(&self) -> Availability {
        self.availability
    }

    #[must_use]
    pub fn reason_code(&self) -> &str {
        &self.reason_code
    }

    #[must_use]
    pub fn trace_id(&self) -> &str {
        &self.trace_id
    }
}

/// Recursively redacted, exact tagged value from a manager record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagerValue {
    Null,
    Boolean(bool),
    Integer(i64),
    Decimal(DecimalString),
    Text(String),
    Timestamp(DateTime<Utc>),
    Array(Vec<Self>),
    Object(BTreeMap<String, Self>),
}

impl Serialize for ManagerValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(2))?;
        match self {
            Self::Null => {
                map.serialize_entry("kind", "NULL")?;
                map.serialize_entry("value", &Option::<()>::None)?;
            }
            Self::Boolean(value) => {
                map.serialize_entry("kind", "BOOLEAN")?;
                map.serialize_entry("value", value)?;
            }
            Self::Integer(value) => {
                map.serialize_entry("kind", "INTEGER")?;
                map.serialize_entry("value", value)?;
            }
            Self::Decimal(value) => {
                map.serialize_entry("kind", "DECIMAL")?;
                map.serialize_entry("value", value)?;
            }
            Self::Text(value) => {
                map.serialize_entry("kind", "TEXT")?;
                map.serialize_entry("value", value)?;
            }
            Self::Timestamp(value) => {
                map.serialize_entry("kind", "TIMESTAMP")?;
                map.serialize_entry("value", value)?;
            }
            Self::Array(value) => {
                map.serialize_entry("kind", "ARRAY")?;
                map.serialize_entry("value", value)?;
            }
            Self::Object(value) => {
                map.serialize_entry("kind", "OBJECT")?;
                map.serialize_entry("value", value)?;
            }
        }
        map.end()
    }
}

/// A safe, catalogue-validated record. Its opaque key can only be used to
/// retrieve this exact record relation through [`ManagerV2Request::record`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerRecord {
    relation: RelationId,
    record_key: OpaqueRecordKey,
    fields: BTreeMap<String, ManagerValue>,
    #[serde(skip_serializing)]
    catalogue_digest: CatalogueDigest,
}

impl ManagerRecord {
    #[must_use]
    pub fn relation(&self) -> &RelationId {
        &self.relation
    }

    #[must_use]
    pub fn record_key(&self) -> &OpaqueRecordKey {
        &self.record_key
    }

    #[must_use]
    pub fn fields(&self) -> &BTreeMap<String, ManagerValue> {
        &self.fields
    }
}

/// One owner-bounded relation page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RelationRecords {
    relation: RelationId,
    items: Vec<ManagerRecord>,
    next_cursor: Option<OpaqueCursor>,
}

impl RelationRecords {
    #[must_use]
    pub fn relation(&self) -> &RelationId {
        &self.relation
    }

    #[must_use]
    pub fn items(&self) -> &[ManagerRecord] {
        &self.items
    }

    #[must_use]
    pub fn next_cursor(&self) -> Option<&OpaqueCursor> {
        self.next_cursor.as_ref()
    }
}

/// One owner-defined projection page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NamedProjection {
    kind: ProjectionKind,
    items: Vec<ManagerRecord>,
    next_cursor: Option<OpaqueCursor>,
}

impl NamedProjection {
    #[must_use]
    pub const fn kind(&self) -> ProjectionKind {
        self.kind
    }

    #[must_use]
    pub fn items(&self) -> &[ManagerRecord] {
        &self.items
    }

    #[must_use]
    pub fn next_cursor(&self) -> Option<&OpaqueCursor> {
        self.next_cursor.as_ref()
    }
}

/// One owner-declared runtime capability. This describes the facade's own
/// qualification state, not the Portal Source Proxy reachability result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerCapability {
    operation_id: String,
    path_template: String,
    registered: bool,
    portal_reachable: bool,
    source_binding: bool,
    qualification_status: String,
}

impl ManagerCapability {
    #[must_use]
    pub fn operation_id(&self) -> &str {
        &self.operation_id
    }

    #[must_use]
    pub fn path_template(&self) -> &str {
        &self.path_template
    }

    #[must_use]
    pub const fn registered(&self) -> bool {
        self.registered
    }

    #[must_use]
    pub const fn portal_reachable(&self) -> bool {
        self.portal_reachable
    }

    #[must_use]
    pub const fn source_binding(&self) -> bool {
        self.source_binding
    }

    #[must_use]
    pub fn qualification_status(&self) -> &str {
        &self.qualification_status
    }
}

/// The exact five facade capability descriptors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ManagerCapabilities {
    capabilities: Vec<ManagerCapability>,
}

impl ManagerCapabilities {
    #[must_use]
    pub fn capabilities(&self) -> &[ManagerCapability] {
        &self.capabilities
    }
}

/// Typed successful payloads for the fixed request surface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum ManagerPayload {
    Catalogue(ManagerEnvelope<ManagerCatalogue>),
    Capabilities(ManagerEnvelope<ManagerCapabilities>),
    RelationRecords(ManagerEnvelope<RelationRecords>),
    Record(ManagerEnvelope<ManagerRecord>),
    Projection(ManagerEnvelope<NamedProjection>),
}

/// A complete typed outcome for one Manager-v2 request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagerRead {
    Available(ManagerPayload),
    Unavailable(ManagerUnavailable),
}

/// A sealed Manager-v2 request. It never contains an arbitrary method, URL,
/// relation, key, field, sort, profile or credential.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagerV2Request {
    Catalogue,
    Capabilities,
    RelationRecords {
        relation: CataloguedRelation,
        cursor: Option<OpaqueCursor>,
        limit: PageLimit,
    },
    Record {
        relation: CataloguedRelation,
        record_key: OpaqueRecordKey,
    },
    Projection {
        catalogue: ManagerCatalogue,
        kind: ProjectionKind,
        cursor: Option<OpaqueCursor>,
        limit: PageLimit,
    },
}

impl ManagerV2Request {
    #[must_use]
    pub const fn catalogue() -> Self {
        Self::Catalogue
    }

    #[must_use]
    pub const fn capabilities() -> Self {
        Self::Capabilities
    }

    /// Builds a page request from an owner-catalogued relation and, if present,
    /// a cursor returned for that same relation/catalogue/profile.
    ///
    /// # Errors
    ///
    /// Rejects a cursor that did not originate from this relation binding.
    pub fn relation_records(
        relation: &CataloguedRelation,
        cursor: Option<&OpaqueCursor>,
        limit: PageLimit,
    ) -> Result<Self, ContractError> {
        if let Some(cursor) = cursor {
            cursor.require_relation(relation)?;
        }
        Ok(Self::RelationRecords {
            relation: relation.clone(),
            cursor: cursor.cloned(),
            limit,
        })
    }

    /// Builds a record request only from a record returned by the owner.
    ///
    /// # Errors
    ///
    /// Rejects a record whose relation/catalogue binding differs from the
    /// supplied catalogue relation.
    pub fn record(
        record: &ManagerRecord,
        relation: &CataloguedRelation,
    ) -> Result<Self, ContractError> {
        if record.relation != relation.id || record.catalogue_digest != relation.catalogue_digest {
            return Err(ContractError::RecordBindingDenied);
        }
        Ok(Self::Record {
            relation: relation.clone(),
            record_key: record.record_key.clone(),
        })
    }

    /// Builds a projection request bound to a validated catalogue and optional
    /// prior projection cursor.
    ///
    /// # Errors
    ///
    /// Rejects a cursor from another kind, catalogue or profile.
    pub fn projection(
        catalogue: &ManagerCatalogue,
        kind: ProjectionKind,
        cursor: Option<&OpaqueCursor>,
        limit: PageLimit,
    ) -> Result<Self, ContractError> {
        if let Some(cursor) = cursor {
            cursor.require_projection(catalogue, kind)?;
        }
        Ok(Self::Projection {
            catalogue: catalogue.clone(),
            kind,
            cursor: cursor.cloned(),
            limit,
        })
    }

    #[must_use]
    pub fn blueprint(&self) -> RequestBlueprint {
        match self {
            Self::Catalogue => {
                RequestBlueprint::new("/portal/execution/v2/manager/catalog", Vec::new())
            }
            Self::Capabilities => {
                RequestBlueprint::new("/portal/execution/v2/manager/capabilities", Vec::new())
            }
            Self::RelationRecords {
                relation,
                cursor,
                limit,
            } => {
                let mut query = vec![("limit", limit.get().to_string())];
                if let Some(cursor) = cursor {
                    query.push(("cursor", cursor.value.clone()));
                }
                RequestBlueprint::new(
                    format!(
                        "{MANAGER_PREFIX}/records/{}/{}",
                        relation.id.schema, relation.id.relation
                    ),
                    query,
                )
            }
            Self::Record {
                relation,
                record_key,
            } => RequestBlueprint::new(
                format!(
                    "{MANAGER_PREFIX}/records/{}/{}/{}",
                    relation.id.schema, relation.id.relation, record_key.0
                ),
                Vec::new(),
            ),
            Self::Projection {
                kind,
                cursor,
                limit,
                ..
            } => {
                let mut query = vec![("limit", limit.get().to_string())];
                if let Some(cursor) = cursor {
                    query.push(("cursor", cursor.value.clone()));
                }
                RequestBlueprint::new(
                    format!("{MANAGER_PREFIX}/projections/{}", kind.path_segment()),
                    query,
                )
            }
        }
    }
}

/// A read-only HTTP blueprint generated only from [`ManagerV2Request`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlueprint {
    path: String,
    query: Vec<(&'static str, String)>,
}

impl RequestBlueprint {
    fn new(path: impl Into<String>, query: Vec<(&'static str, String)>) -> Self {
        Self {
            path: path.into(),
            query,
        }
    }

    #[must_use]
    pub fn path(&self) -> &str {
        &self.path
    }

    #[must_use]
    pub fn query(&self) -> &[(&'static str, String)] {
        &self.query
    }
}

impl OpaqueCursor {
    fn require_relation(&self, relation: &CataloguedRelation) -> Result<(), ContractError> {
        let CursorBinding::Relation {
            relation: cursor_relation,
            catalogue_digest,
        } = &self.binding
        else {
            return Err(ContractError::CursorBindingDenied);
        };
        if cursor_relation != &relation.id || catalogue_digest != &relation.catalogue_digest {
            return Err(ContractError::CursorBindingDenied);
        }
        Ok(())
    }

    fn require_projection(
        &self,
        catalogue: &ManagerCatalogue,
        kind: ProjectionKind,
    ) -> Result<(), ContractError> {
        let CursorBinding::Projection {
            kind: cursor_kind,
            catalogue_digest,
        } = &self.binding
        else {
            return Err(ContractError::CursorBindingDenied);
        };
        if *cursor_kind != kind || catalogue_digest != &catalogue.catalogue_revision {
            return Err(ContractError::CursorBindingDenied);
        }
        Ok(())
    }
}

#[derive(Clone, PartialEq, Eq)]
enum CursorBinding {
    Relation {
        relation: RelationId,
        catalogue_digest: CatalogueDigest,
    },
    Projection {
        kind: ProjectionKind,
        catalogue_digest: CatalogueDigest,
    },
}

/// Decodes a `200` body after transport has independently confirmed the
/// runtime contract header.
///
/// # Errors
///
/// Fails closed on runtime revision/profile/catalogue drift, unapproved record
/// fields, opaque-token misuse, unknown schema fields or invalid values.
pub fn decode_success(
    request: &ManagerV2Request,
    body: &[u8],
) -> Result<ManagerPayload, ContractError> {
    decode_success_for_profile(request, body, PROFILE_ID)
}

/// Decodes a `200` body for one exact deployment-bound Manager profile.
///
/// The caller supplies this value from sealed deployment configuration, never
/// from an HTTP request. The historical Paper helper above remains for the
/// imported Paper contract and its fixtures.
///
/// # Errors
///
/// Fails closed when the owner response does not carry the exact configured
/// profile, in addition to the normal contract/cursor/catalogue checks.
pub fn decode_success_for_profile(
    request: &ManagerV2Request,
    body: &[u8],
    expected_profile_id: &str,
) -> Result<ManagerPayload, ContractError> {
    validate_expected_profile_id(expected_profile_id)?;
    match request {
        ManagerV2Request::Catalogue => {
            let (meta, wire) = parse_envelope::<ManagerCatalogueWire>(body, expected_profile_id)?;
            let catalogue = decode_catalogue(wire, &meta.catalogue_sha256)?;
            Ok(ManagerPayload::Catalogue(ManagerEnvelope {
                meta,
                data: catalogue,
            }))
        }
        ManagerV2Request::Capabilities => {
            let (meta, wire) =
                parse_envelope::<ManagerCapabilitiesWire>(body, expected_profile_id)?;
            let capabilities = decode_capabilities(wire, expected_profile_id)?;
            Ok(ManagerPayload::Capabilities(ManagerEnvelope {
                meta,
                data: capabilities,
            }))
        }
        ManagerV2Request::RelationRecords {
            relation, limit, ..
        } => {
            let (meta, wire) = parse_envelope::<RelationRecordsWire>(body, expected_profile_id)?;
            require_catalogue_digest(&meta, &relation.catalogue_digest)?;
            let records = decode_relation_records(wire, relation, *limit)?;
            Ok(ManagerPayload::RelationRecords(ManagerEnvelope {
                meta,
                data: records,
            }))
        }
        ManagerV2Request::Record { relation, .. } => {
            let (meta, wire) = parse_envelope::<ManagerRecordWire>(body, expected_profile_id)?;
            require_catalogue_digest(&meta, &relation.catalogue_digest)?;
            let record = decode_record(wire, relation)?;
            Ok(ManagerPayload::Record(ManagerEnvelope {
                meta,
                data: record,
            }))
        }
        ManagerV2Request::Projection {
            catalogue,
            kind,
            limit,
            ..
        } => {
            let (meta, wire) = parse_envelope::<NamedProjectionWire>(body, expected_profile_id)?;
            require_catalogue_digest(&meta, &catalogue.catalogue_revision)?;
            let projection = decode_projection(wire, catalogue, *kind, *limit)?;
            Ok(ManagerPayload::Projection(ManagerEnvelope {
                meta,
                data: projection,
            }))
        }
    }
}

/// Decodes a `503` owner result. It must be returned to the caller as typed
/// unavailability rather than silently transformed into an empty success.
///
/// # Errors
///
/// Rejects success-shaped or unbounded/unknown failure bodies.
pub fn decode_unavailable(body: &[u8]) -> Result<ManagerUnavailable, ContractError> {
    decode_unavailable_for_profile(body, PROFILE_ID)
}

/// Decodes a `503` owner result for one exact deployment-bound Manager
/// profile. See [`decode_success_for_profile`] for the configuration boundary.
///
/// # Errors
///
/// Fails closed when the owner result does not carry the exact configured
/// profile or violates the bounded unavailable-result contract.
pub fn decode_unavailable_for_profile(
    body: &[u8],
    expected_profile_id: &str,
) -> Result<ManagerUnavailable, ContractError> {
    validate_expected_profile_id(expected_profile_id)?;
    let wire: ManagerUnavailableWire = parse_json(body)?;
    if wire.contract_version != RUNTIME_CONTRACT_REVISION
        || wire.authority != "EXECUTION_CELL"
        || wire.profile_id != expected_profile_id
        || wire.availability == Availability::Available
    {
        return Err(ContractError::EnvelopeIdentityMismatch);
    }
    validate_reason_code(&wire.reason_code)?;
    validate_trace_id(&wire.trace_id)?;
    Ok(ManagerUnavailable {
        contract_version: RUNTIME_CONTRACT_REVISION,
        authority: "EXECUTION_CELL",
        profile_id: expected_profile_id.to_owned(),
        catalogue_sha256: CatalogueDigest::parse(wire.catalogue_sha256)?,
        availability: wire.availability,
        reason_code: wire.reason_code,
        trace_id: wire.trace_id,
    })
}

fn parse_envelope<T: DeserializeOwned>(
    body: &[u8],
    expected_profile_id: &str,
) -> Result<(ManagerMeta, T), ContractError> {
    let wire: ManagerEnvelopeWire<T> = parse_json(body)?;
    if wire.contract_version != RUNTIME_CONTRACT_REVISION
        || wire.authority != "EXECUTION_CELL"
        || wire.profile_id != expected_profile_id
        || wire.availability != Availability::Available
    {
        return Err(ContractError::EnvelopeIdentityMismatch);
    }
    validate_trace_id(&wire.trace_id)?;
    let as_of = parse_utc_timestamp(&wire.as_of)?;
    Ok((
        ManagerMeta {
            contract_version: RUNTIME_CONTRACT_REVISION,
            authority: "EXECUTION_CELL",
            profile_id: expected_profile_id.to_owned(),
            catalogue_sha256: CatalogueDigest::parse(wire.catalogue_sha256)?,
            availability: Availability::Available,
            freshness: wire.freshness,
            completeness: wire.completeness,
            trace_id: wire.trace_id,
            as_of,
        },
        wire.data,
    ))
}

fn decode_catalogue(
    wire: ManagerCatalogueWire,
    expected_digest: &CatalogueDigest,
) -> Result<ManagerCatalogue, ContractError> {
    let revision = CatalogueDigest::parse(wire.catalogue_revision)?;
    if &revision != expected_digest
        || wire.relation_count != wire.relations.len()
        || wire.relations.len() > MAXIMUM_RELATIONS
    {
        return Err(ContractError::InvalidCatalogue);
    }
    let mut relation_ids = BTreeSet::new();
    let mut relations = Vec::with_capacity(wire.relations.len());
    for relation in wire.relations {
        let id = RelationId::new(relation.id.schema, relation.id.relation)?;
        if !relation_ids.insert(id.clone()) {
            return Err(ContractError::InvalidCatalogue);
        }
        let kind = relation.kind;
        let profile_classification = relation.profile_classification;
        let mut ordinals = BTreeSet::new();
        let mut safe_column_names = BTreeSet::new();
        let mut safe_columns = Vec::with_capacity(relation.safe_columns.len());
        for column in relation.safe_columns {
            validate_identifier(&column.name)?;
            validate_bounded_text(&column.data_type, 512)?;
            if column.ordinal == 0
                || !ordinals.insert(column.ordinal)
                || !safe_column_names.insert(column.name.clone())
            {
                return Err(ContractError::InvalidCatalogue);
            }
            safe_columns.push(SafeColumn {
                name: column.name,
                ordinal: column.ordinal,
                data_type: column.data_type,
                nullable: column.nullable,
            });
        }
        if safe_columns.is_empty() || safe_columns.len() > MAXIMUM_OBJECT_MEMBERS {
            return Err(ContractError::InvalidCatalogue);
        }
        safe_columns.sort_by_key(SafeColumn::ordinal);
        let key = decode_key_descriptor(relation.key)?;
        let profile_columns = decode_profile_columns(relation.profile_columns)?;
        if relation.query_status != "QUALIFIED_TS_OC_03D1" {
            return Err(ContractError::InvalidCatalogue);
        }
        relations.push(CataloguedRelation {
            id,
            kind,
            safe_columns,
            safe_column_names,
            secret_cell_excluded_column_count: relation.secret_cell_excluded_column_count,
            key,
            profile_classification,
            profile_columns,
            query_status: relation.query_status,
            catalogue_digest: revision.clone(),
        });
    }
    relations.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(ManagerCatalogue {
        catalogue_revision: revision,
        relation_count: wire.relation_count,
        relations,
    })
}

fn decode_key_descriptor(wire: KeyDescriptorWire) -> Result<KeyDescriptor, ContractError> {
    if wire.columns.is_empty() || wire.columns.len() > 16 {
        return Err(ContractError::InvalidCatalogue);
    }
    if let Some(name) = &wire.name {
        validate_identifier(name)?;
    }
    let mut unique_columns = BTreeSet::new();
    for column in &wire.columns {
        validate_identifier(column)?;
        if !unique_columns.insert(column) {
            return Err(ContractError::InvalidCatalogue);
        }
    }
    Ok(KeyDescriptor {
        status: wire.status,
        name: wire.name,
        columns: wire.columns,
    })
}

fn decode_profile_columns(columns: Vec<String>) -> Result<Vec<String>, ContractError> {
    if columns.len() > 4 {
        return Err(ContractError::InvalidCatalogue);
    }
    let permitted = ["profile_id", "mode", "environment", "venue"];
    let mut seen = BTreeSet::new();
    for column in &columns {
        if !permitted.contains(&column.as_str()) || !seen.insert(column) {
            return Err(ContractError::InvalidCatalogue);
        }
    }
    Ok(columns)
}

fn decode_relation_records(
    wire: RelationRecordsWire,
    relation: &CataloguedRelation,
    limit: PageLimit,
) -> Result<RelationRecords, ContractError> {
    let response_relation = RelationId::new(wire.relation.schema, wire.relation.relation)?;
    if response_relation != relation.id || wire.items.len() > usize::from(limit.get()) {
        return Err(ContractError::RelationBindingDenied);
    }
    let items = wire
        .items
        .into_iter()
        .map(|item| decode_record(item, relation))
        .collect::<Result<Vec<_>, _>>()?;
    let next_cursor = wire
        .next_cursor
        .map(|value| {
            OpaqueCursor::parse(
                value,
                CursorBinding::Relation {
                    relation: relation.id.clone(),
                    catalogue_digest: relation.catalogue_digest.clone(),
                },
            )
        })
        .transpose()?;
    Ok(RelationRecords {
        relation: response_relation,
        items,
        next_cursor,
    })
}

fn decode_record(
    wire: ManagerRecordWire,
    relation: &CataloguedRelation,
) -> Result<ManagerRecord, ContractError> {
    let response_relation = RelationId::new(wire.relation.schema, wire.relation.relation)?;
    if response_relation != relation.id {
        return Err(ContractError::RelationBindingDenied);
    }
    let mut fields = BTreeMap::new();
    if wire.fields.len() > MAXIMUM_OBJECT_MEMBERS {
        return Err(ContractError::UnsafeRecordFields);
    }
    for (name, value) in wire.fields {
        validate_identifier(&name)?;
        let value = decode_manager_value(&value, 0)?;
        if fields.insert(name, value).is_some() {
            return Err(ContractError::UnsafeRecordFields);
        }
    }
    if !relation.has_exact_safe_columns(&fields) {
        return Err(ContractError::UnsafeRecordFields);
    }
    Ok(ManagerRecord {
        relation: response_relation,
        record_key: OpaqueRecordKey::parse(wire.record_key)?,
        fields,
        catalogue_digest: relation.catalogue_digest.clone(),
    })
}

fn decode_projection(
    wire: NamedProjectionWire,
    catalogue: &ManagerCatalogue,
    kind: ProjectionKind,
    limit: PageLimit,
) -> Result<NamedProjection, ContractError> {
    if wire.kind != kind || wire.items.len() > usize::from(limit.get()) {
        return Err(ContractError::ProjectionBindingDenied);
    }
    let mut items = Vec::with_capacity(wire.items.len());
    for item in wire.items {
        let id = RelationId::new(item.relation.schema.clone(), item.relation.relation.clone())?;
        let relation = catalogue
            .relation_by_id(&id)
            .ok_or(ContractError::RelationBindingDenied)?;
        items.push(decode_record(item, relation)?);
    }
    let next_cursor = wire
        .next_cursor
        .map(|value| {
            OpaqueCursor::parse(
                value,
                CursorBinding::Projection {
                    kind,
                    catalogue_digest: catalogue.catalogue_revision.clone(),
                },
            )
        })
        .transpose()?;
    Ok(NamedProjection {
        kind,
        items,
        next_cursor,
    })
}

fn decode_capabilities(
    wire: ManagerCapabilitiesWire,
    expected_profile_id: &str,
) -> Result<ManagerCapabilities, ContractError> {
    if wire.contract_revision != RUNTIME_CONTRACT_REVISION
        || wire.active_profile_id != expected_profile_id
    {
        return Err(ContractError::EnvelopeIdentityMismatch);
    }
    if wire.capabilities.len() != EXPECTED_CAPABILITIES.len() {
        return Err(ContractError::InvalidCapabilities);
    }
    let mut capabilities = Vec::with_capacity(wire.capabilities.len());
    let mut seen = BTreeSet::new();
    for capability in wire.capabilities {
        validate_bounded_text(&capability.operation_id, 128)?;
        validate_bounded_text(&capability.path_template, 512)?;
        validate_bounded_text(&capability.qualification_status, 128)?;
        if !capability.path_template.starts_with(MANAGER_PREFIX)
            || !capability.registered
            || capability.portal_reachable
            || !capability.source_binding
            || capability.qualification_status != "OWNER_LOOPBACK_QUALIFIED"
            || !EXPECTED_CAPABILITIES.iter().any(|(operation, path)| {
                *operation == capability.operation_id && *path == capability.path_template
            })
            || !seen.insert((
                capability.operation_id.clone(),
                capability.path_template.clone(),
            ))
        {
            return Err(ContractError::InvalidCapabilities);
        }
        capabilities.push(ManagerCapability {
            operation_id: capability.operation_id,
            path_template: capability.path_template,
            registered: capability.registered,
            portal_reachable: capability.portal_reachable,
            source_binding: capability.source_binding,
            qualification_status: capability.qualification_status,
        });
    }
    Ok(ManagerCapabilities { capabilities })
}

fn validate_expected_profile_id(profile_id: &str) -> Result<(), ContractError> {
    if !(3..=128).contains(&profile_id.len())
        || !profile_id
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(ContractError::EnvelopeIdentityMismatch);
    }
    Ok(())
}

fn decode_manager_value(
    wire: &ManagerValueWire,
    depth: usize,
) -> Result<ManagerValue, ContractError> {
    if depth > MAXIMUM_STRUCTURED_DEPTH {
        return Err(ContractError::InvalidManagerValue);
    }
    match wire.kind {
        ManagerValueKind::Null if wire.value.is_null() => Ok(ManagerValue::Null),
        ManagerValueKind::Boolean => wire
            .value
            .as_bool()
            .map(ManagerValue::Boolean)
            .ok_or(ContractError::InvalidManagerValue),
        ManagerValueKind::Integer => wire
            .value
            .as_i64()
            .map(ManagerValue::Integer)
            .ok_or(ContractError::InvalidManagerValue),
        ManagerValueKind::Decimal => {
            let value = wire
                .value
                .as_str()
                .ok_or(ContractError::InvalidManagerValue)?;
            if !is_exact_decimal(value) || value.len() > 256 {
                return Err(ContractError::InvalidManagerValue);
            }
            DecimalString::parse(value)
                .map(ManagerValue::Decimal)
                .map_err(|_| ContractError::InvalidManagerValue)
        }
        ManagerValueKind::Text => {
            let value = wire
                .value
                .as_str()
                .ok_or(ContractError::InvalidManagerValue)?;
            validate_bounded_text(value, MAXIMUM_TEXT_BYTES)?;
            Ok(ManagerValue::Text(value.to_owned()))
        }
        ManagerValueKind::Timestamp => {
            let value = wire
                .value
                .as_str()
                .ok_or(ContractError::InvalidManagerValue)?;
            Ok(ManagerValue::Timestamp(parse_utc_timestamp(value)?))
        }
        ManagerValueKind::Array => {
            let values = wire
                .value
                .as_array()
                .ok_or(ContractError::InvalidManagerValue)?;
            if values.len() > MAXIMUM_OBJECT_MEMBERS {
                return Err(ContractError::InvalidManagerValue);
            }
            values
                .iter()
                .cloned()
                .map(|value| {
                    serde_json::from_value::<ManagerValueWire>(value)
                        .map_err(|_| ContractError::InvalidManagerValue)
                        .and_then(|value| decode_manager_value(&value, depth + 1))
                })
                .collect::<Result<Vec<_>, _>>()
                .map(ManagerValue::Array)
        }
        ManagerValueKind::Object => {
            let values = wire
                .value
                .as_object()
                .ok_or(ContractError::InvalidManagerValue)?;
            if values.len() > MAXIMUM_OBJECT_MEMBERS {
                return Err(ContractError::InvalidManagerValue);
            }
            let mut object = BTreeMap::new();
            for (key, value) in values {
                validate_structured_key(key)?;
                let child: ManagerValueWire = serde_json::from_value(value.clone())
                    .map_err(|_| ContractError::InvalidManagerValue)?;
                object.insert(key.clone(), decode_manager_value(&child, depth + 1)?);
            }
            Ok(ManagerValue::Object(object))
        }
        ManagerValueKind::Null => Err(ContractError::InvalidManagerValue),
    }
}

fn require_catalogue_digest(
    meta: &ManagerMeta,
    expected: &CatalogueDigest,
) -> Result<(), ContractError> {
    if &meta.catalogue_sha256 != expected {
        return Err(ContractError::CatalogueBindingDenied);
    }
    Ok(())
}

fn validate_opaque_token(value: &str) -> Result<(), ContractError> {
    if value.is_empty()
        || value.len() > MAXIMUM_OPAQUE_TOKEN_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err(ContractError::InvalidOpaqueToken);
    }
    Ok(())
}

fn validate_identifier(value: &str) -> Result<(), ContractError> {
    if value.is_empty()
        || value.len() > MAXIMUM_IDENTIFIER_BYTES
        || !value.is_ascii()
        || !matches!(value.as_bytes().first(), Some(byte) if byte.is_ascii_alphabetic() || *byte == b'_')
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(ContractError::InvalidIdentifier);
    }
    Ok(())
}

fn validate_trace_id(value: &str) -> Result<(), ContractError> {
    validate_bounded_text(value, MAXIMUM_TRACE_BYTES).map_err(|_| ContractError::InvalidTraceId)
}

fn validate_reason_code(value: &str) -> Result<(), ContractError> {
    if value.is_empty()
        || value.len() > 128
        || !matches!(value.as_bytes().first(), Some(byte) if byte.is_ascii_uppercase())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(ContractError::InvalidUnavailableResult);
    }
    Ok(())
}

fn validate_structured_key(value: &str) -> Result<(), ContractError> {
    validate_bounded_text(value, 512)
}

fn validate_bounded_text(value: &str, maximum: usize) -> Result<(), ContractError> {
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        return Err(ContractError::InvalidManagerValue);
    }
    Ok(())
}

fn parse_utc_timestamp(value: &str) -> Result<DateTime<Utc>, ContractError> {
    if !value.ends_with('Z') || value.len() > 64 {
        return Err(ContractError::InvalidTimestamp);
    }
    DateTime::parse_from_rfc3339(value)
        .map(|parsed| parsed.with_timezone(&Utc))
        .map_err(|_| ContractError::InvalidTimestamp)
}

fn is_exact_decimal(value: &str) -> bool {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    let mut current = first;
    if current == b'-' {
        let Some(next) = bytes.next() else {
            return false;
        };
        current = next;
    }
    if !current.is_ascii_digit() {
        return false;
    }
    let mut decimal_seen = false;
    let mut fraction_digits = 0_usize;
    for byte in bytes {
        if byte == b'.' && !decimal_seen {
            decimal_seen = true;
        } else if byte.is_ascii_digit() {
            if decimal_seen {
                fraction_digits += 1;
            }
        } else {
            return false;
        }
    }
    !decimal_seen || fraction_digits > 0
}

fn parse_json<T: DeserializeOwned>(body: &[u8]) -> Result<T, ContractError> {
    serde_json::from_slice(body).map_err(|_| ContractError::InvalidJsonSchema)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerEnvelopeWire<T> {
    contract_version: String,
    authority: String,
    profile_id: String,
    catalogue_sha256: String,
    availability: Availability,
    freshness: Freshness,
    completeness: Completeness,
    trace_id: String,
    as_of: String,
    data: T,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerUnavailableWire {
    contract_version: String,
    authority: String,
    profile_id: String,
    catalogue_sha256: String,
    availability: Availability,
    reason_code: String,
    trace_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerCatalogueWire {
    catalogue_revision: String,
    relation_count: usize,
    relations: Vec<RelationSchemaWire>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RelationSchemaWire {
    id: RelationIdWire,
    kind: RelationKind,
    safe_columns: Vec<SafeColumnWire>,
    secret_cell_excluded_column_count: u32,
    key: KeyDescriptorWire,
    profile_classification: ProfileClassification,
    profile_columns: Vec<String>,
    query_status: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RelationIdWire {
    schema: String,
    relation: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SafeColumnWire {
    name: String,
    ordinal: u32,
    data_type: String,
    nullable: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct KeyDescriptorWire {
    status: KeyStatus,
    name: Option<String>,
    columns: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerRecordWire {
    relation: RelationIdWire,
    record_key: String,
    fields: BTreeMap<String, ManagerValueWire>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RelationRecordsWire {
    relation: RelationIdWire,
    items: Vec<ManagerRecordWire>,
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NamedProjectionWire {
    kind: ProjectionKind,
    items: Vec<ManagerRecordWire>,
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerCapabilitiesWire {
    contract_revision: String,
    active_profile_id: String,
    capabilities: Vec<ManagerCapabilityWire>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerCapabilityWire {
    operation_id: String,
    path_template: String,
    registered: bool,
    portal_reachable: bool,
    source_binding: bool,
    qualification_status: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerValueWire {
    kind: ManagerValueKind,
    value: Value,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum ManagerValueKind {
    Null,
    Boolean,
    Integer,
    Decimal,
    Text,
    Timestamp,
    Array,
    Object,
}

/// Manager-v2 contract parsing/building errors. They intentionally contain no
/// raw response content, token or credential value.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ContractError {
    #[error("Manager-v2 page limit is outside the owner-qualified bound")]
    InvalidPageLimit,
    #[error("Manager-v2 catalogue digest is invalid")]
    InvalidCatalogueDigest,
    #[error("Manager-v2 opaque cursor or record key is invalid")]
    InvalidOpaqueToken,
    #[error("Manager-v2 relation or column identifier is invalid")]
    InvalidIdentifier,
    #[error("Manager-v2 response is not the locked JSON schema")]
    InvalidJsonSchema,
    #[error("Manager-v2 response revision, authority, profile or availability drifted")]
    EnvelopeIdentityMismatch,
    #[error("Manager-v2 trace identifier is invalid")]
    InvalidTraceId,
    #[error("Manager-v2 timestamp is not bounded RFC 3339 UTC")]
    InvalidTimestamp,
    #[error("Manager-v2 catalogue is invalid or no longer runtime-qualified")]
    InvalidCatalogue,
    #[error("Manager-v2 catalogue digest does not match the request binding")]
    CatalogueBindingDenied,
    #[error("Manager-v2 relation does not match the request binding")]
    RelationBindingDenied,
    #[error("Manager-v2 cursor does not match its original relation/projection binding")]
    CursorBindingDenied,
    #[error("Manager-v2 record key does not match its original relation binding")]
    RecordBindingDenied,
    #[error("Manager-v2 projection does not match the request binding")]
    ProjectionBindingDenied,
    #[error("Manager-v2 record contains an unapproved or incomplete field set")]
    UnsafeRecordFields,
    #[error("Manager-v2 tagged value is invalid or contains a prohibited structured field")]
    InvalidManagerValue,
    #[error("Manager-v2 capabilities differ from the exact five runtime descriptors")]
    InvalidCapabilities,
    #[error("Manager-v2 unavailable result is invalid")]
    InvalidUnavailableResult,
}

#[cfg(test)]
mod tests;
