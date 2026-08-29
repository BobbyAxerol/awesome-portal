#![forbid(unsafe_code)]

use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{DecimalString, SourceAuthority, SourceCompleteness};
use hmac::{Hmac, Mac as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use uuid::Uuid;

pub const QUERY_SCHEMA_VERSION: &str = "execution.query.v1";
pub const DEFAULT_PAGE_SIZE: u16 = 100;
pub const MAX_PAGE_SIZE: u16 = 250;
pub const MAX_FILTERS: usize = 12;
pub const MAX_SORTS: usize = 4;
pub const MAX_SERIES_POINTS: u32 = 5_000;
pub const SERIES_INTERVAL_LADDER_SECONDS: [u32; 6] = [60, 300, 900, 3_600, 14_400, 86_400];

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CursorDirection {
    After,
    Before,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum CursorScalar {
    Timestamp(DateTime<Utc>),
    Integer(i64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CursorBoundary {
    pub sort_values: Vec<CursorScalar>,
    pub entity_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct CursorClaims {
    version: u8,
    key_id: String,
    workspace_id: String,
    environment: String,
    epoch_id: Uuid,
    resource: String,
    query_fingerprint: String,
    direction: CursorDirection,
    boundary: CursorBoundary,
    issued_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct CursorCodec {
    active_key_id: String,
    keys: BTreeMap<String, Vec<u8>>,
    ttl: Duration,
}

impl CursorCodec {
    /// Builds a rotating HMAC keyring. Keys shorter than 32 bytes are rejected.
    ///
    /// # Errors
    ///
    /// Returns a typed configuration error for an absent active key or weak key.
    pub fn new(
        active_key_id: impl Into<String>,
        keys: BTreeMap<String, Vec<u8>>,
        ttl: Duration,
    ) -> Result<Self, QueryError> {
        let active_key_id = active_key_id.into();
        if active_key_id.trim().is_empty() || !keys.contains_key(&active_key_id) {
            return Err(QueryError::InvalidCursorKeyring);
        }
        if ttl.is_zero() || keys.values().any(|key| key.len() < 32) {
            return Err(QueryError::InvalidCursorKeyring);
        }
        Ok(Self {
            active_key_id,
            keys,
            ttl,
        })
    }

    /// Signs one query-bound keyset cursor.
    ///
    /// # Errors
    ///
    /// Fails only if a validated keyring becomes internally inconsistent or
    /// claims serialization fails.
    pub fn encode(
        &self,
        context: &CursorContext<'_>,
        direction: CursorDirection,
        boundary: CursorBoundary,
        now: DateTime<Utc>,
    ) -> Result<String, QueryError> {
        let ttl = TimeDelta::from_std(self.ttl).map_err(|_| QueryError::InvalidCursorKeyring)?;
        let claims = CursorClaims {
            version: 1,
            key_id: self.active_key_id.clone(),
            workspace_id: context.workspace_id.to_owned(),
            environment: context.environment.to_owned(),
            epoch_id: context.epoch_id,
            resource: context.resource.to_owned(),
            query_fingerprint: context.query_fingerprint.to_owned(),
            direction,
            boundary,
            issued_at: now,
            expires_at: now + ttl,
        };
        let payload = serde_json::to_vec(&claims).map_err(|_| QueryError::InvalidCursor)?;
        let key = self
            .keys
            .get(&self.active_key_id)
            .ok_or(QueryError::InvalidCursorKeyring)?;
        let mut mac =
            HmacSha256::new_from_slice(key).map_err(|_| QueryError::InvalidCursorKeyring)?;
        mac.update(&payload);
        let signature = mac.finalize().into_bytes();
        Ok(format!(
            "kc1.{}.{}",
            URL_SAFE_NO_PAD.encode(payload),
            URL_SAFE_NO_PAD.encode(signature)
        ))
    }

    /// Verifies signature, expiry, direction and every query/scope binding.
    ///
    /// # Errors
    ///
    /// Rejects malformed, tampered, expired or replayed-across-scope cursors.
    pub fn decode(
        &self,
        token: &str,
        context: &CursorContext<'_>,
        expected_direction: CursorDirection,
        now: DateTime<Utc>,
    ) -> Result<CursorBoundary, QueryError> {
        let mut parts = token.split('.');
        if parts.next() != Some("kc1") {
            return Err(QueryError::InvalidCursor);
        }
        let payload = URL_SAFE_NO_PAD
            .decode(parts.next().ok_or(QueryError::InvalidCursor)?)
            .map_err(|_| QueryError::InvalidCursor)?;
        let signature = URL_SAFE_NO_PAD
            .decode(parts.next().ok_or(QueryError::InvalidCursor)?)
            .map_err(|_| QueryError::InvalidCursor)?;
        if parts.next().is_some() {
            return Err(QueryError::InvalidCursor);
        }
        let claims: CursorClaims =
            serde_json::from_slice(&payload).map_err(|_| QueryError::InvalidCursor)?;
        let key = self
            .keys
            .get(&claims.key_id)
            .ok_or(QueryError::InvalidCursor)?;
        let mut mac = HmacSha256::new_from_slice(key).map_err(|_| QueryError::InvalidCursor)?;
        mac.update(&payload);
        mac.verify_slice(&signature)
            .map_err(|_| QueryError::InvalidCursor)?;
        if claims.version != 1
            || claims.workspace_id != context.workspace_id
            || claims.environment != context.environment
            || claims.epoch_id != context.epoch_id
            || claims.resource != context.resource
            || claims.query_fingerprint != context.query_fingerprint
            || claims.direction != expected_direction
        {
            return Err(QueryError::CursorContextMismatch);
        }
        if claims.issued_at > now + TimeDelta::minutes(1) || claims.expires_at <= now {
            return Err(QueryError::CursorExpired);
        }
        Ok(claims.boundary)
    }
}

pub struct CursorContext<'a> {
    pub workspace_id: &'a str,
    pub environment: &'a str,
    pub epoch_id: Uuid,
    pub resource: &'a str,
    pub query_fingerprint: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterField {
    Status,
    Currency,
    InstrumentId,
    AccountId,
    PortfolioId,
    StrategyId,
    DeploymentId,
    SourceAuthority,
    AsOf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    In,
    Contains,
    Gte,
    Lte,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueryFilter {
    pub field: FilterField,
    pub operator: FilterOperator,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortField {
    AsOf,
    ProjectionSequence,
    Status,
    Currency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortDirection {
    Asc,
    Desc,
}

impl SortDirection {
    #[must_use]
    pub const fn reversed(self) -> Self {
        match self {
            Self::Asc => Self::Desc,
            Self::Desc => Self::Asc,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuerySort {
    pub field: SortField,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntityQueryRequest {
    #[serde(default = "default_page_size")]
    pub limit: u16,
    #[serde(default)]
    pub filters: Vec<QueryFilter>,
    #[serde(default = "default_sorts")]
    pub sorts: Vec<QuerySort>,
    pub after: Option<String>,
    pub before: Option<String>,
}

const fn default_page_size() -> u16 {
    DEFAULT_PAGE_SIZE
}

fn default_sorts() -> Vec<QuerySort> {
    vec![QuerySort {
        field: SortField::AsOf,
        direction: SortDirection::Desc,
    }]
}

impl Default for EntityQueryRequest {
    fn default() -> Self {
        Self {
            limit: DEFAULT_PAGE_SIZE,
            filters: Vec::new(),
            sorts: default_sorts(),
            after: None,
            before: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct QueryAllowlist {
    pub filters: BTreeMap<FilterField, BTreeSet<FilterOperator>>,
    pub sorts: BTreeSet<SortField>,
}

impl QueryAllowlist {
    #[must_use]
    pub fn projection_entities() -> Self {
        use FilterField::{
            AccountId, AsOf, Currency, DeploymentId, InstrumentId, PortfolioId, SourceAuthority,
            Status, StrategyId,
        };
        use FilterOperator::{Contains, Eq, Gte, In, Lte};
        Self {
            filters: BTreeMap::from([
                (Status, BTreeSet::from([Eq, In])),
                (Currency, BTreeSet::from([Eq, In])),
                (InstrumentId, BTreeSet::from([Eq, In, Contains])),
                (AccountId, BTreeSet::from([Eq, In])),
                (PortfolioId, BTreeSet::from([Eq, In])),
                (StrategyId, BTreeSet::from([Eq, In])),
                (DeploymentId, BTreeSet::from([Eq])),
                (SourceAuthority, BTreeSet::from([Eq, In])),
                (AsOf, BTreeSet::from([Gte, Lte])),
            ]),
            sorts: BTreeSet::from([
                SortField::AsOf,
                SortField::ProjectionSequence,
                SortField::Status,
                SortField::Currency,
            ]),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ValidatedEntityQuery {
    pub limit: u16,
    pub filters: Vec<QueryFilter>,
    pub sorts: Vec<QuerySort>,
    pub direction: CursorDirection,
    pub boundary: Option<CursorBoundary>,
    pub fingerprint: String,
}

impl EntityQueryRequest {
    /// Validates a client query before any SQL is constructed or executed.
    ///
    /// # Errors
    ///
    /// Rejects page-limit abuse, non-allowlisted fields/operators/sorts,
    /// malformed values, and cursor misuse.
    pub fn validate(
        &self,
        allowlist: &QueryAllowlist,
        codec: &CursorCodec,
        cursor_context: &CursorContext<'_>,
        now: DateTime<Utc>,
    ) -> Result<ValidatedEntityQuery, QueryError> {
        if self.limit == 0 || self.limit > MAX_PAGE_SIZE {
            return Err(QueryError::InvalidPageLimit);
        }
        if self.filters.len() > MAX_FILTERS || self.sorts.is_empty() || self.sorts.len() > MAX_SORTS
        {
            return Err(QueryError::QueryTooComplex);
        }
        if self.after.is_some() && self.before.is_some() {
            return Err(QueryError::AmbiguousCursor);
        }
        let mut seen_sort = BTreeSet::new();
        for sort in &self.sorts {
            if !allowlist.sorts.contains(&sort.field) || !seen_sort.insert(sort.field) {
                return Err(QueryError::SortNotAllowed);
            }
        }
        for filter in &self.filters {
            let Some(operators) = allowlist.filters.get(&filter.field) else {
                return Err(QueryError::FilterNotAllowed);
            };
            if !operators.contains(&filter.operator) {
                return Err(QueryError::FilterNotAllowed);
            }
            if filter.values.is_empty()
                || filter.values.len() > 50
                || filter
                    .values
                    .iter()
                    .any(|value| value.trim() != value || value.len() > 256)
                || (!matches!(filter.operator, FilterOperator::In) && filter.values.len() != 1)
            {
                return Err(QueryError::InvalidFilter);
            }
            if filter.field == FilterField::AsOf {
                DateTime::parse_from_rfc3339(&filter.values[0])
                    .map_err(|_| QueryError::InvalidFilter)?;
            }
            if filter.field == FilterField::SourceAuthority
                && filter.values.iter().any(|value| {
                    !matches!(
                        value.as_str(),
                        "RESEARCH" | "EXECUTION" | "BROKER" | "DERIVED"
                    )
                })
            {
                return Err(QueryError::InvalidFilter);
            }
        }
        let fingerprint = query_fingerprint(self.limit, &self.filters, &self.sorts)?;
        let bound_context = CursorContext {
            workspace_id: cursor_context.workspace_id,
            environment: cursor_context.environment,
            epoch_id: cursor_context.epoch_id,
            resource: cursor_context.resource,
            query_fingerprint: &fingerprint,
        };
        let (direction, boundary) = if let Some(token) = &self.after {
            (
                CursorDirection::After,
                Some(codec.decode(token, &bound_context, CursorDirection::After, now)?),
            )
        } else if let Some(token) = &self.before {
            (
                CursorDirection::Before,
                Some(codec.decode(token, &bound_context, CursorDirection::Before, now)?),
            )
        } else {
            (CursorDirection::After, None)
        };
        if boundary
            .as_ref()
            .is_some_and(|value| value.sort_values.len() != self.sorts.len())
        {
            return Err(QueryError::CursorContextMismatch);
        }
        Ok(ValidatedEntityQuery {
            limit: self.limit,
            filters: self.filters.clone(),
            sorts: self.sorts.clone(),
            direction,
            boundary,
            fingerprint,
        })
    }
}

/// Produces the stable query identity used to prevent cursor replay after a
/// filter/sort/page-size change.
///
/// # Errors
///
/// Returns a serialization error only for an internal schema defect.
pub fn query_fingerprint(
    limit: u16,
    filters: &[QueryFilter],
    sorts: &[QuerySort],
) -> Result<String, QueryError> {
    let bytes =
        serde_json::to_vec(&(limit, filters, sorts)).map_err(|_| QueryError::InvalidQuery)?;
    Ok(format!("sha256:{}", hex::encode(Sha256::digest(bytes))))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionQueryRow {
    pub entity_id: String,
    pub projection_sequence: u64,
    pub source_authority: SourceAuthority,
    pub source_completeness: SourceCompleteness,
    pub poll_interval_ms: Option<i64>,
    pub as_of: DateTime<Utc>,
    pub source_read_at: DateTime<Utc>,
    pub projected_at: DateTime<Utc>,
    pub adapter_version: String,
    pub capability_snapshot_id: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurrencyAggregate {
    pub currency: Option<String>,
    pub row_count: u64,
    pub quantity_count: u64,
    pub quantity: DecimalString,
    pub notional_count: u64,
    pub notional: DecimalString,
    pub invalid_numeric_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionQueryPage {
    pub schema_version: String,
    pub epoch_id: Uuid,
    pub total_count: u64,
    pub filtered_count: u64,
    pub rows: Vec<ProjectionQueryRow>,
    pub next_cursor: Option<String>,
    pub prev_cursor: Option<String>,
    pub has_more: bool,
    pub has_previous: bool,
    pub applied_filters: Vec<QueryFilter>,
    pub applied_sort: Vec<QuerySort>,
    pub aggregates_by_currency: Vec<CurrencyAggregate>,
    pub retention: ProjectionPageRetention,
}

/// Page-level retention metadata. Entity pages do not carry a requested time
/// range, so callers can distinguish an unclassified empty page from a known
/// hot/cold/purged classification without manufacturing range boundaries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionPageRetention {
    pub availability: RetentionAvailability,
    pub policy_version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SeriesIntent {
    Overview,
    Inspect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeriesSelection {
    pub interval_seconds: u32,
    pub inclusive_bucket_count: u32,
    pub max_points: u32,
    pub intent: SeriesIntent,
}

/// Selects the finest canonical interval whose inclusive bucket count is at
/// most 5,000. No stride or implicit lossy downsampling is permitted.
///
/// # Errors
///
/// Rejects empty/reversed ranges and ranges too wide even at the daily rung.
pub fn select_series_interval(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    intent: SeriesIntent,
) -> Result<SeriesSelection, QueryError> {
    if end < start {
        return Err(QueryError::InvalidTimeRange);
    }
    let span =
        u64::try_from((end - start).num_seconds()).map_err(|_| QueryError::InvalidTimeRange)?;
    for interval_seconds in SERIES_INTERVAL_LADDER_SECONDS {
        let buckets = span / u64::from(interval_seconds) + 1;
        if buckets <= u64::from(MAX_SERIES_POINTS) {
            return Ok(SeriesSelection {
                interval_seconds,
                inclusive_bucket_count: u32::try_from(buckets)
                    .map_err(|_| QueryError::SeriesRangeTooWide)?,
                max_points: MAX_SERIES_POINTS,
                intent,
            });
        }
    }
    Err(QueryError::SeriesRangeTooWide)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RetentionAvailability {
    Hot,
    PartialHot,
    ColdRequestable,
    Purged,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetentionPolicy {
    pub policy_version: String,
    pub hot_from: DateTime<Utc>,
    pub cold_requestable_from: Option<DateTime<Utc>>,
    pub purged_before: Option<DateTime<Utc>>,
    pub access_request_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetentionDecision {
    pub availability: RetentionAvailability,
    pub requested_from: DateTime<Utc>,
    pub requested_to: DateTime<Utc>,
    pub hot_from: DateTime<Utc>,
    pub policy_version: String,
    pub access_request_path: Option<String>,
}

impl RetentionPolicy {
    /// Classifies time coverage without representing unavailable history as an
    /// ordinary empty result.
    ///
    /// # Errors
    ///
    /// Rejects invalid policy boundaries and reversed request ranges.
    pub fn evaluate(
        &self,
        requested_from: DateTime<Utc>,
        requested_to: DateTime<Utc>,
    ) -> Result<RetentionDecision, QueryError> {
        if self.policy_version.trim().is_empty()
            || requested_to < requested_from
            || self
                .cold_requestable_from
                .is_some_and(|cold| cold > self.hot_from)
            || self
                .purged_before
                .is_some_and(|purged| purged > self.hot_from)
        {
            return Err(QueryError::InvalidRetentionPolicy);
        }
        let availability = if requested_from >= self.hot_from {
            RetentionAvailability::Hot
        } else if requested_to >= self.hot_from {
            RetentionAvailability::PartialHot
        } else if self
            .purged_before
            .is_some_and(|purged_before| requested_to <= purged_before)
        {
            RetentionAvailability::Purged
        } else if self
            .cold_requestable_from
            .is_some_and(|cold_from| requested_to >= cold_from)
        {
            RetentionAvailability::ColdRequestable
        } else {
            RetentionAvailability::Unknown
        };
        Ok(RetentionDecision {
            availability,
            requested_from,
            requested_to,
            hot_from: self.hot_from,
            policy_version: self.policy_version.clone(),
            access_request_path: (availability == RetentionAvailability::ColdRequestable)
                .then(|| self.access_request_path.clone())
                .flatten(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExactSeriesPoint {
    pub bucket_at: DateTime<Utc>,
    pub value: DecimalString,
    pub minimum: DecimalString,
    pub maximum: DecimalString,
    pub sample_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExactSeries {
    pub schema_version: String,
    pub epoch_id: Uuid,
    pub series_key: String,
    pub metric: String,
    pub currency: Option<String>,
    pub interval_seconds: u32,
    pub source_rows: u64,
    pub returned_rows: u64,
    pub downsample_method: String,
    pub authority: Option<SourceAuthority>,
    pub as_of: Option<DateTime<Utc>>,
    pub retention: RetentionDecision,
    pub points: Vec<ExactSeriesPoint>,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum QueryError {
    #[error("cursor keyring is missing, weak or internally inconsistent")]
    InvalidCursorKeyring,
    #[error("cursor is malformed or its signature is invalid")]
    InvalidCursor,
    #[error("cursor is expired or issued unreasonably far in the future")]
    CursorExpired,
    #[error("cursor does not belong to this query, epoch or scope")]
    CursorContextMismatch,
    #[error("after and before cursors are mutually exclusive")]
    AmbiguousCursor,
    #[error("page limit must be between 1 and 250")]
    InvalidPageLimit,
    #[error("query exceeds filter or sort complexity limits")]
    QueryTooComplex,
    #[error("filter field or operator is not allowlisted")]
    FilterNotAllowed,
    #[error("filter value is malformed")]
    InvalidFilter,
    #[error("sort field is not allowlisted or is duplicated")]
    SortNotAllowed,
    #[error("query could not be normalized")]
    InvalidQuery,
    #[error("time range is empty, reversed or invalid")]
    InvalidTimeRange,
    #[error("time range exceeds the canonical 5,000-point ladder")]
    SeriesRangeTooWide,
    #[error("retention policy or requested range is invalid")]
    InvalidRetentionPolicy,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_780_000_000 + seconds, 0).unwrap()
    }

    fn codec() -> CursorCodec {
        CursorCodec::new(
            "k2",
            BTreeMap::from([
                ("k1".to_owned(), vec![1; 32]),
                ("k2".to_owned(), vec![2; 32]),
            ]),
            Duration::from_secs(900),
        )
        .unwrap()
    }

    fn context(fingerprint: &str) -> CursorContext<'_> {
        CursorContext {
            workspace_id: "workspace_1",
            environment: "paper",
            epoch_id: Uuid::nil(),
            resource: "orders",
            query_fingerprint: fingerprint,
        }
    }

    #[test]
    fn cursor_is_signed_rotatable_directional_and_query_bound() {
        let codec = codec();
        let boundary = CursorBoundary {
            sort_values: vec![CursorScalar::Timestamp(at(1))],
            entity_id: "order_1".to_owned(),
        };
        let token = codec
            .encode(
                &context("sha256:q1"),
                CursorDirection::After,
                boundary.clone(),
                at(2),
            )
            .unwrap();
        assert_eq!(
            codec
                .decode(&token, &context("sha256:q1"), CursorDirection::After, at(3))
                .unwrap(),
            boundary
        );
        assert_eq!(
            codec.decode(&token, &context("sha256:q2"), CursorDirection::After, at(3)),
            Err(QueryError::CursorContextMismatch)
        );
        assert_eq!(
            codec.decode(
                &token,
                &context("sha256:q1"),
                CursorDirection::Before,
                at(3)
            ),
            Err(QueryError::CursorContextMismatch)
        );
        let mut tampered = token.into_bytes();
        let last = tampered.len() - 1;
        tampered[last] = if tampered[last] == b'A' { b'B' } else { b'A' };
        assert_eq!(
            codec.decode(
                std::str::from_utf8(&tampered).unwrap(),
                &context("sha256:q1"),
                CursorDirection::After,
                at(3)
            ),
            Err(QueryError::InvalidCursor)
        );

        let old_codec = CursorCodec::new(
            "k1",
            BTreeMap::from([("k1".to_owned(), vec![1; 32])]),
            Duration::from_secs(900),
        )
        .unwrap();
        let old_token = old_codec
            .encode(
                &context("sha256:q1"),
                CursorDirection::After,
                boundary,
                at(2),
            )
            .unwrap();
        assert!(codec
            .decode(
                &old_token,
                &context("sha256:q1"),
                CursorDirection::After,
                at(3)
            )
            .is_ok());
        assert_eq!(
            codec.decode(
                &old_token,
                &context("sha256:q1"),
                CursorDirection::After,
                at(903)
            ),
            Err(QueryError::CursorExpired)
        );
    }

    #[test]
    fn allowlist_and_cursor_exclusivity_fail_before_repository_use() {
        let codec = codec();
        let mut request = EntityQueryRequest::default();
        request.filters.push(QueryFilter {
            field: FilterField::Status,
            operator: FilterOperator::Contains,
            values: vec!["DROP TABLE".to_owned()],
        });
        let ctx = context("");
        assert!(matches!(
            request.validate(&QueryAllowlist::projection_entities(), &codec, &ctx, at(0)),
            Err(QueryError::FilterNotAllowed)
        ));
        request.filters.clear();
        request.after = Some("a".to_owned());
        request.before = Some("b".to_owned());
        assert!(matches!(
            request.validate(&QueryAllowlist::projection_entities(), &codec, &ctx, at(0)),
            Err(QueryError::AmbiguousCursor)
        ));
    }

    #[test]
    fn adaptive_ladder_is_inclusive_bounded_and_zoom_selects_finer_rung() {
        let end = at(0) + TimeDelta::days(10);
        let selection = select_series_interval(at(0), end, SeriesIntent::Overview).unwrap();
        assert_eq!(selection.interval_seconds, 300);
        assert!(selection.inclusive_bucket_count <= MAX_SERIES_POINTS);
        let zoom = select_series_interval(at(0), at(0) + TimeDelta::days(2), SeriesIntent::Inspect)
            .unwrap();
        assert_eq!(zoom.interval_seconds, 60);
        assert_eq!(zoom.intent, SeriesIntent::Inspect);
    }

    #[test]
    fn retention_never_turns_cold_or_purged_history_into_empty() {
        let policy = RetentionPolicy {
            policy_version: "retention-v3".to_owned(),
            hot_from: at(100),
            cold_requestable_from: Some(at(10)),
            purged_before: Some(at(10)),
            access_request_path: Some("/admin/data-access-requests".to_owned()),
        };
        assert_eq!(
            policy.evaluate(at(110), at(120)).unwrap().availability,
            RetentionAvailability::Hot
        );
        assert_eq!(
            policy.evaluate(at(50), at(110)).unwrap().availability,
            RetentionAvailability::PartialHot
        );
        assert_eq!(
            policy.evaluate(at(20), at(90)).unwrap().availability,
            RetentionAvailability::ColdRequestable
        );
        assert_eq!(
            policy.evaluate(at(0), at(10)).unwrap().availability,
            RetentionAvailability::Purged
        );
    }

    #[test]
    fn canonical_retention_fixture_exposes_all_five_non_empty_states() {
        let decisions: Vec<RetentionDecision> = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/retention-availability.v1.json"
        )))
        .unwrap();
        assert_eq!(
            decisions
                .iter()
                .map(|decision| decision.availability)
                .collect::<Vec<_>>(),
            vec![
                RetentionAvailability::Hot,
                RetentionAvailability::PartialHot,
                RetentionAvailability::ColdRequestable,
                RetentionAvailability::Purged,
                RetentionAvailability::Unknown,
            ]
        );
        assert!(decisions[2].access_request_path.is_some());
        assert!(decisions
            .iter()
            .enumerate()
            .all(|(index, decision)| index == 2 || decision.access_request_path.is_none()));
    }

    #[test]
    fn projection_query_page_serializes_canonical_keyset_field_names() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../../packages/contracts/fixtures/keyset-page.valid.json"
        )))
        .unwrap();
        let next_cursor = fixture["next_cursor"].as_str().unwrap().to_owned();

        let page = ProjectionQueryPage {
            schema_version: QUERY_SCHEMA_VERSION.to_owned(),
            epoch_id: Uuid::nil(),
            total_count: 182_000,
            filtered_count: 45_500,
            rows: Vec::new(),
            next_cursor: Some(next_cursor.clone()),
            prev_cursor: None,
            has_more: true,
            has_previous: false,
            applied_filters: Vec::new(),
            applied_sort: vec![QuerySort {
                field: SortField::AsOf,
                direction: SortDirection::Desc,
            }],
            aggregates_by_currency: Vec::new(),
            retention: ProjectionPageRetention {
                availability: RetentionAvailability::Unknown,
                policy_version: "UNCONFIGURED".to_owned(),
            },
        };
        let serialized = serde_json::to_value(page).unwrap();

        for canonical_name in ["next_cursor", "prev_cursor", "applied_sort"] {
            assert!(fixture.get(canonical_name).is_some());
            assert!(serialized.get(canonical_name).is_some());
        }
        assert_eq!(serialized["next_cursor"], fixture["next_cursor"]);
        assert_eq!(serialized["prev_cursor"], fixture["prev_cursor"]);
        assert!(serialized["applied_sort"].is_array());
        assert!(fixture["applied_sort"].is_array());
        assert_eq!(
            serialized["applied_sort"][0]
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            fixture["applied_sort"][0]
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
        );
        for legacy_name in ["next", "previous", "applied_sorts"] {
            assert!(serialized.get(legacy_name).is_none());
        }
        assert_eq!(serialized["retention"]["availability"], "UNKNOWN");
        assert_eq!(serialized["retention"]["policy_version"], "UNCONFIGURED");
    }
}
