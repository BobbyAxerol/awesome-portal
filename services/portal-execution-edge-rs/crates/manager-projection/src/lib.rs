#![forbid(unsafe_code)]

//! N24 durable projection contract for the current Manager-v2 source.
//!
//! The crate owns only deterministic conversion of already authenticated,
//! catalogue-bound Manager records into Portal projection snapshots. It never
//! opens a connection, selects a profile, reads Trading System storage or
//! promotes an epoch. Poll-derived changes are explicitly Portal-owned deltas;
//! no owner event sequence is invented.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use manager_v2_contract::{
    CataloguedRelation, Completeness, ManagerMeta, ManagerRecord, ProjectionKind,
};
use projection_core::{
    canonical_digest, ProjectionEntityKey, ProjectionEntityKind, ProjectionObservation,
    ProjectionSnapshot, SnapshotCompleteness, SourceSequenceSemantics,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const MANAGER_PROJECTION_SCHEMA_VERSION: &str = "portal.execution.manager-projection.v2";
pub const MANAGER_PROJECTION_ADAPTER_VERSION: &str =
    "portal.execution.manager-projection.manager-v2.runtime.v5";
pub const PORTAL_PROJECTION_DELTA: &str = "PORTAL_PROJECTION_DELTA";
pub const DEFAULT_POLL_INTERVAL_MS: i64 = 2_000;
pub const MAXIMUM_FEED_RECORDS: usize = 20_000;
pub const MAXIMUM_CYCLE_RECORDS: usize = 80_000;
pub const MAXIMUM_FEED_PAGES: usize = 100;

/// Exact Manager profile bound by deployment configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ManagerProjectionProfile {
    Paper,
    Sandbox,
    Live,
}

impl ManagerProjectionProfile {
    #[must_use]
    pub const fn environment(self) -> &'static str {
        match self {
            Self::Paper => "paper",
            Self::Sandbox => "sandbox",
            Self::Live => "live",
        }
    }

    #[must_use]
    pub const fn profile_id(self) -> &'static str {
        match self {
            Self::Paper => "PAPER_BINANCE_USDM",
            Self::Sandbox => "SANDBOX_BINANCE_USDM",
            Self::Live => "LIVE_BINANCE_USDM",
        }
    }

    /// Resolves only the three deployment-bound Manager profiles.
    ///
    /// # Errors
    ///
    /// Rejects cross-environment or caller-selected profile aliases.
    pub fn from_binding(environment: &str, profile_id: &str) -> Result<Self, ProjectionMapError> {
        match (environment, profile_id) {
            ("paper", "PAPER_BINANCE_USDM") => Ok(Self::Paper),
            ("sandbox", "SANDBOX_BINANCE_USDM") => Ok(Self::Sandbox),
            ("live", "LIVE_BINANCE_USDM") => Ok(Self::Live),
            _ => Err(ProjectionMapError::ProfileBindingMismatch),
        }
    }
}

/// The only current-source feeds allowed to populate N24 projection state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct ManagerProjectionFeed {
    pub feed_id: &'static str,
    pub entity_kind: ProjectionEntityKind,
    pub source: ManagerProjectionSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ManagerProjectionSource {
    Named(ProjectionKind),
    Relation(&'static str),
}

/// Current, source-as-is feed set. Named projections provide the cross-profile
/// backbone. The additional relations are bounded operational/current-state
/// sources that the owner already publishes for every admitted profile.
///
/// Historical snapshot/session tables are deliberately absent: Manager-v2
/// serves them oldest-first without a snapshot token, latest-window selector
/// or incremental watermark. Periodically full-scanning those relations would
/// be both incorrect at page boundaries and unbounded as history grows.
pub const FEEDS: [ManagerProjectionFeed; 13] = [
    ManagerProjectionFeed {
        feed_id: "manager.order",
        entity_kind: ProjectionEntityKind::Order,
        source: ManagerProjectionSource::Named(ProjectionKind::Order),
    },
    ManagerProjectionFeed {
        feed_id: "manager.fill",
        entity_kind: ProjectionEntityKind::Fill,
        source: ManagerProjectionSource::Named(ProjectionKind::Fill),
    },
    ManagerProjectionFeed {
        feed_id: "manager.position",
        entity_kind: ProjectionEntityKind::Position,
        source: ManagerProjectionSource::Named(ProjectionKind::Position),
    },
    ManagerProjectionFeed {
        feed_id: "manager.account",
        entity_kind: ProjectionEntityKind::Account,
        source: ManagerProjectionSource::Named(ProjectionKind::Account),
    },
    ManagerProjectionFeed {
        feed_id: "manager.reconciliation",
        entity_kind: ProjectionEntityKind::Reconciliation,
        source: ManagerProjectionSource::Named(ProjectionKind::Reconciliation),
    },
    ManagerProjectionFeed {
        feed_id: "manager.portfolio",
        entity_kind: ProjectionEntityKind::Performance,
        source: ManagerProjectionSource::Named(ProjectionKind::Portfolio),
    },
    ManagerProjectionFeed {
        feed_id: "relation.strategy_deployments",
        entity_kind: ProjectionEntityKind::Runtime,
        source: ManagerProjectionSource::Relation("public.strategy_deployments"),
    },
    ManagerProjectionFeed {
        feed_id: "relation.account_balances",
        entity_kind: ProjectionEntityKind::Account,
        source: ManagerProjectionSource::Relation("public.account_balances"),
    },
    ManagerProjectionFeed {
        feed_id: "relation.account_policies",
        entity_kind: ProjectionEntityKind::Account,
        source: ManagerProjectionSource::Relation("public.account_policies"),
    },
    ManagerProjectionFeed {
        feed_id: "relation.account_reservations",
        entity_kind: ProjectionEntityKind::Account,
        source: ManagerProjectionSource::Relation("public.account_reservations"),
    },
    ManagerProjectionFeed {
        feed_id: "relation.portfolio_allocations",
        entity_kind: ProjectionEntityKind::Performance,
        source: ManagerProjectionSource::Relation("public.portfolio_allocations"),
    },
    ManagerProjectionFeed {
        feed_id: "relation.risk_profiles",
        entity_kind: ProjectionEntityKind::Runtime,
        source: ManagerProjectionSource::Relation("public.risk_profiles"),
    },
    ManagerProjectionFeed {
        feed_id: "relation.domain_events",
        entity_kind: ProjectionEntityKind::Event,
        source: ManagerProjectionSource::Relation("public.domain_events"),
    },
];

/// Redacted, stable projection fact derived from one Manager record. The
/// source opaque record token is deliberately ignored: Manager-v2 publishes
/// it as a five-minute retrieval cursor, not a durable entity identifier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerProjectionFact {
    source_key_digest: String,
    relation_id: String,
    fields: Value,
}

impl ManagerProjectionFact {
    /// Converts one contract-validated Manager record using the exact key
    /// columns published by its catalogue relation. No opaque retrieval token
    /// is persisted or used as identity.
    ///
    /// # Errors
    ///
    /// Rejects serialization drift or an invalid relation identifier.
    pub fn from_record(
        record: &ManagerRecord,
        relation: &CataloguedRelation,
    ) -> Result<Self, ProjectionMapError> {
        let relation_id = format!(
            "{}.{}",
            record.relation().schema(),
            record.relation().relation()
        );
        if relation.id() != record.relation() || relation.key().columns().is_empty() {
            return Err(ProjectionMapError::RelationBindingMismatch);
        }
        let fields =
            serde_json::to_value(record.fields()).map_err(|_| ProjectionMapError::Serialization)?;
        let field_object = fields
            .as_object()
            .ok_or(ProjectionMapError::FieldsMustBeObject)?;
        let stable_key = relation
            .key()
            .columns()
            .iter()
            .map(|column| {
                field_object
                    .get(column)
                    .map(|value| json!({"column": column, "value": value}))
                    .ok_or(ProjectionMapError::RelationBindingMismatch)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            source_key_digest: canonical_digest(&(relation_id.as_str(), stable_key))?,
            relation_id,
            fields,
        })
    }

    /// Test/adapter constructor that still hashes the supplied source key.
    ///
    /// # Errors
    ///
    /// Rejects non-object fields, empty keys and unsafe relation identifiers.
    pub fn new(
        relation_id: &str,
        source_key: &[u8],
        fields: Value,
    ) -> Result<Self, ProjectionMapError> {
        if source_key.is_empty() || !valid_relation_id(relation_id) {
            return Err(ProjectionMapError::InvalidFact);
        }
        if !fields.is_object() {
            return Err(ProjectionMapError::FieldsMustBeObject);
        }
        Ok(Self {
            source_key_digest: sha256(source_key),
            relation_id: relation_id.to_owned(),
            fields,
        })
    }
}

/// One fully collected, bounded Manager feed. Pagination is completed by the
/// transport adapter before this value can be admitted to a cycle.
#[derive(Debug, Clone)]
pub struct ManagerFeedSnapshot {
    pub feed: ManagerProjectionFeed,
    pub profile: ManagerProjectionProfile,
    pub catalogue_digest: String,
    pub as_of: DateTime<Utc>,
    pub source_read_at: DateTime<Utc>,
    pub completeness: Completeness,
    pub page_count: usize,
    pub facts: Vec<ManagerProjectionFact>,
}

impl ManagerFeedSnapshot {
    /// Builds metadata directly from an authenticated Manager response.
    ///
    /// # Errors
    ///
    /// Rejects profile/catalogue mismatch before any fact is projected.
    pub fn from_manager_meta(
        feed: ManagerProjectionFeed,
        expected_profile: ManagerProjectionProfile,
        meta: &ManagerMeta,
        source_read_at: DateTime<Utc>,
        page_count: usize,
        facts: Vec<ManagerProjectionFact>,
    ) -> Result<Self, ProjectionMapError> {
        if meta.profile_id() != expected_profile.profile_id() {
            return Err(ProjectionMapError::ProfileBindingMismatch);
        }
        Ok(Self {
            feed,
            profile: expected_profile,
            catalogue_digest: meta.catalogue_sha256().as_str().to_owned(),
            as_of: meta.as_of(),
            source_read_at,
            completeness: meta.completeness(),
            page_count,
            facts,
        })
    }
}

/// Complete immutable input for one profile polling cycle.
#[derive(Debug, Clone)]
pub struct ManagerProjectionCycle {
    pub profile: ManagerProjectionProfile,
    pub catalogue_digest: String,
    pub poll_interval_ms: i64,
    pub feeds: Vec<ManagerFeedSnapshot>,
}

#[derive(Debug, Clone)]
pub struct BuiltProjectionCycle {
    pub cycle_id: CanonicalId,
    pub profile: ManagerProjectionProfile,
    pub catalogue_digest: String,
    pub snapshots: Vec<ProjectionSnapshot>,
    pub feed_count: usize,
    pub record_count: usize,
    pub source_read_at: DateTime<Utc>,
    pub poll_interval_ms: i64,
    pub state_input_digest: String,
}

impl ManagerProjectionCycle {
    /// Validates a full source cycle and emits one combined snapshot per entity
    /// kind. Combining feed namespaces prevents complete-snapshot tombstones
    /// from deleting sibling feeds mapped to the same entity kind.
    ///
    /// # Errors
    ///
    /// Rejects missing/duplicate feeds, partial pages, mixed metadata, unsafe
    /// bounds, duplicate entities or clock regression.
    #[allow(clippy::too_many_lines)] // One auditable pass validates and seals the complete cycle.
    pub fn build(self) -> Result<BuiltProjectionCycle, ProjectionMapError> {
        if !(250..=60_000).contains(&self.poll_interval_ms)
            || !valid_digest(&self.catalogue_digest)
            || self.feeds.len() != FEEDS.len()
        {
            return Err(ProjectionMapError::InvalidCycle);
        }
        let mut seen_feeds = BTreeSet::new();
        let mut total_records = 0_usize;
        let mut source_read_at: Option<DateTime<Utc>> = None;
        // A complete source cycle must always emit all entity-kind snapshots,
        // including empty ones. Empty is a truthful source state (notably for
        // Live before its first row) and is also how removed rows become
        // durable tombstones during the reducer transaction.
        let mut observations: BTreeMap<ProjectionEntityKind, Vec<ProjectionObservation>> = FEEDS
            .iter()
            .map(|feed| (feed.entity_kind, Vec::new()))
            .collect();
        let mut input_facts = Vec::new();
        for feed in self.feeds {
            validate_feed(&feed, self.profile, &self.catalogue_digest)?;
            if !seen_feeds.insert(feed.feed.feed_id) {
                return Err(ProjectionMapError::DuplicateFeed);
            }
            total_records = total_records
                .checked_add(feed.facts.len())
                .ok_or(ProjectionMapError::UnsafeBound)?;
            if total_records > MAXIMUM_CYCLE_RECORDS {
                return Err(ProjectionMapError::UnsafeBound);
            }
            source_read_at = Some(source_read_at.map_or(feed.source_read_at, |current| {
                current.max(feed.source_read_at)
            }));
            for fact in feed.facts {
                let entity_id = CanonicalId::parse(format!(
                    "{}:{}",
                    feed.feed.feed_id, fact.source_key_digest
                ))?;
                let payload = json!({
                    "change_label": PORTAL_PROJECTION_DELTA,
                    "source_feed": feed.feed.feed_id,
                    "source_relation": fact.relation_id,
                    "fields": fact.fields,
                });
                input_facts.push(json!({
                    "feed": feed.feed.feed_id,
                    "entity_id": entity_id,
                    "payload": payload,
                }));
                observations.entry(feed.feed.entity_kind).or_default().push(
                    ProjectionObservation {
                        ingestion_id: CanonicalId::parse("pending")?,
                        entity: ProjectionEntityKey {
                            kind: feed.feed.entity_kind,
                            entity_id,
                        },
                        source_authority: SourceAuthority::Execution,
                        as_of: Some(feed.as_of),
                        source_read_at: feed.source_read_at,
                        source_cursor: None,
                        source_sequence: None,
                        source_sequence_semantics: SourceSequenceSemantics::PerEntityContiguous,
                        operation: projection_core::ProjectionOperation::Upsert,
                        source_completeness: SourceCompleteness::PollBounded,
                        poll_interval_ms: Some(self.poll_interval_ms),
                        adapter_version: MANAGER_PROJECTION_ADAPTER_VERSION.to_owned(),
                        capability_snapshot_id: self.catalogue_digest.clone(),
                        payload,
                    },
                );
            }
        }
        if seen_feeds != FEEDS.iter().map(|feed| feed.feed_id).collect() {
            return Err(ProjectionMapError::MissingFeed);
        }
        input_facts.sort_by_key(Value::to_string);
        let state_input_digest = canonical_digest(&input_facts)?;
        let source_read_at = source_read_at.ok_or(ProjectionMapError::MissingFeed)?;
        let cycle_id = CanonicalId::parse(format!(
            "n24-cycle-{}",
            state_input_digest.trim_start_matches("sha256:")
        ))?;
        let cursor = SourceCursor {
            event_ts: source_read_at,
            created_at: source_read_at,
            event_id: cycle_id.clone(),
        };
        let mut snapshots = Vec::new();
        for (kind, mut kind_observations) in observations {
            kind_observations.sort_by(|left, right| left.entity.cmp(&right.entity));
            let kind_input_digest = canonical_digest(
                &kind_observations
                    .iter()
                    .map(|observation| {
                        json!({
                            "entity": &observation.entity,
                            "operation": observation.operation,
                            "source_authority": observation.source_authority,
                            "source_completeness": observation.source_completeness,
                            "poll_interval_ms": observation.poll_interval_ms,
                            "adapter_version": &observation.adapter_version,
                            "capability_snapshot_id": &observation.capability_snapshot_id,
                            "payload": &observation.payload,
                        })
                    })
                    .collect::<Vec<_>>(),
            )?;
            for observation in &mut kind_observations {
                let observation_digest = canonical_digest(&json!({
                    "entity": &observation.entity,
                    "operation": observation.operation,
                    "source_authority": observation.source_authority,
                    "source_completeness": observation.source_completeness,
                    "poll_interval_ms": observation.poll_interval_ms,
                    "adapter_version": &observation.adapter_version,
                    "capability_snapshot_id": &observation.capability_snapshot_id,
                    "payload": &observation.payload,
                }))?;
                observation.ingestion_id = CanonicalId::parse(format!(
                    "n24-ingest-{}",
                    observation_digest.trim_start_matches("sha256:")
                ))?;
                observation.source_cursor = Some(cursor.clone());
            }
            let snapshot_id = CanonicalId::parse(format!(
                "n24-snapshot-{}-{}",
                kind.as_str().to_ascii_lowercase(),
                kind_input_digest.trim_start_matches("sha256:")
            ))?;
            snapshots.push(ProjectionSnapshot::new(
                snapshot_id,
                kind,
                SnapshotCompleteness::Complete,
                kind_observations.len(),
                kind_observations,
            )?);
        }
        Ok(BuiltProjectionCycle {
            cycle_id,
            profile: self.profile,
            catalogue_digest: self.catalogue_digest,
            snapshots,
            feed_count: FEEDS.len(),
            record_count: total_records,
            source_read_at,
            poll_interval_ms: self.poll_interval_ms,
            state_input_digest,
        })
    }
}

fn validate_feed(
    feed: &ManagerFeedSnapshot,
    profile: ManagerProjectionProfile,
    catalogue_digest: &str,
) -> Result<(), ProjectionMapError> {
    if !FEEDS.contains(&feed.feed)
        || feed.profile != profile
        || feed.catalogue_digest != catalogue_digest
        || feed.completeness != Completeness::Complete
        || feed.page_count == 0
        || feed.page_count > MAXIMUM_FEED_PAGES
        || feed.facts.len() > MAXIMUM_FEED_RECORDS
        || feed.source_read_at < feed.as_of
    {
        return Err(ProjectionMapError::InvalidFeed);
    }
    if let ManagerProjectionSource::Relation(expected_relation) = feed.feed.source {
        if feed
            .facts
            .iter()
            .any(|fact| fact.relation_id != expected_relation)
        {
            return Err(ProjectionMapError::RelationBindingMismatch);
        }
    }
    Ok(())
}

fn valid_relation_id(value: &str) -> bool {
    let Some((schema, relation)) = value.split_once('.') else {
        return false;
    };
    let valid_part = |part: &str| {
        !part.is_empty()
            && part
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    };
    value.len() <= 128 && valid_part(schema) && valid_part(relation)
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn sha256(input: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(input))
}

#[derive(Debug, Error)]
pub enum ProjectionMapError {
    #[error("Manager projection deployment profile does not match the environment")]
    ProfileBindingMismatch,
    #[error("Manager projection fact is invalid")]
    InvalidFact,
    #[error("Manager projection fields must be an object")]
    FieldsMustBeObject,
    #[error("Manager projection feed is invalid or incomplete")]
    InvalidFeed,
    #[error("Manager projection relation binding drifted")]
    RelationBindingMismatch,
    #[error("Manager projection cycle is invalid")]
    InvalidCycle,
    #[error("Manager projection feed is duplicated")]
    DuplicateFeed,
    #[error("Manager projection cycle is missing a required feed")]
    MissingFeed,
    #[error("Manager projection bound was exceeded")]
    UnsafeBound,
    #[error("Manager projection serialization failed")]
    Serialization,
    #[error(transparent)]
    Contract(#[from] execution_contracts::ContractError),
    #[error(transparent)]
    Projection(#[from] projection_core::ProjectionError),
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone as _;
    use manager_v2_contract::{
        decode_success_for_profile, ManagerCatalogue, ManagerPayload, ManagerV2Request, PageLimit,
        RUNTIME_CONTRACT_REVISION,
    };

    fn at(seconds: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(seconds, 0).single().unwrap()
    }

    fn cycle(profile: ManagerProjectionProfile) -> ManagerProjectionCycle {
        let catalogue = format!("sha256:{}", "a".repeat(64));
        ManagerProjectionCycle {
            profile,
            catalogue_digest: catalogue.clone(),
            poll_interval_ms: DEFAULT_POLL_INTERVAL_MS,
            feeds: FEEDS
                .iter()
                .map(|feed| {
                    let relation = match feed.source {
                        ManagerProjectionSource::Relation(relation) => relation,
                        ManagerProjectionSource::Named(kind) => match kind {
                            ProjectionKind::Order => "public.orders",
                            ProjectionKind::Fill => "public.binance_fills",
                            ProjectionKind::Position => "public.positions_v2",
                            ProjectionKind::Account => "public.broker_accounts",
                            ProjectionKind::Reconciliation => "public.reconciliation_records",
                            ProjectionKind::Portfolio => "public.portfolios",
                            ProjectionKind::CommandJournal => unreachable!(),
                        },
                    };
                    ManagerFeedSnapshot {
                        feed: *feed,
                        profile,
                        catalogue_digest: catalogue.clone(),
                        as_of: at(10),
                        source_read_at: at(11),
                        completeness: Completeness::Complete,
                        page_count: 1,
                        facts: vec![ManagerProjectionFact::new(
                            relation,
                            feed.feed_id.as_bytes(),
                            json!({"id": {"kind": "TEXT", "value": feed.feed_id}}),
                        )
                        .unwrap()],
                    }
                })
                .collect(),
        }
    }

    fn catalogue_and_order_record(
        record_key: &str,
        status: &str,
    ) -> (ManagerCatalogue, ManagerRecord) {
        let digest = format!("sha256:{}", "a".repeat(64));
        let envelope = |data: Value| {
            json!({
                "contract_version": RUNTIME_CONTRACT_REVISION,
                "authority": "EXECUTION_CELL",
                "profile_id": "PAPER_BINANCE_USDM",
                "catalogue_sha256": digest,
                "availability": "AVAILABLE",
                "freshness": "FRESH",
                "completeness": "COMPLETE",
                "trace_id": "manager-projection-key-test",
                "as_of": "2026-09-01T00:00:00Z",
                "data": data,
            })
        };
        let relation = |name: &str, key_column: &str| {
            json!({
                "id": {"schema": "public", "relation": name},
                "kind": "TABLE",
                "safe_columns": [
                    {"name": key_column, "ordinal": 1, "data_type": "text", "nullable": false},
                    {"name": "status", "ordinal": 2, "data_type": "text", "nullable": false}
                ],
                "secret_cell_excluded_column_count": 0,
                "key": {"status": "PRIMARY_KEY", "name": null, "columns": [key_column]},
                "profile_classification": "FIXED_PROFILE_CONTEXT",
                "profile_columns": [],
                "query_status": "QUALIFIED_TS_OC_03D1"
            })
        };
        let catalogue_body = serde_json::to_vec(&envelope(json!({
            "catalogue_revision": digest,
            "relation_count": 2,
            "relations": [
                relation("orders", "order_id"),
                relation("fills", "fill_id")
            ]
        })))
        .unwrap();
        let ManagerPayload::Catalogue(catalogue_envelope) = decode_success_for_profile(
            &ManagerV2Request::catalogue(),
            &catalogue_body,
            "PAPER_BINANCE_USDM",
        )
        .unwrap() else {
            panic!("expected catalogue");
        };
        let catalogue = catalogue_envelope.into_data();
        let orders = catalogue.relation("public", "orders").unwrap();
        let request =
            ManagerV2Request::relation_records(orders, None, PageLimit::default()).unwrap();
        let page_body = serde_json::to_vec(&envelope(json!({
            "relation": {"schema": "public", "relation": "orders"},
            "items": [{
                "relation": {"schema": "public", "relation": "orders"},
                "record_key": record_key,
                "fields": {
                    "order_id": {"kind": "TEXT", "value": "order-42"},
                    "status": {"kind": "TEXT", "value": status}
                }
            }],
            "next_cursor": null
        })))
        .unwrap();
        let ManagerPayload::RelationRecords(records) =
            decode_success_for_profile(&request, &page_body, "PAPER_BINANCE_USDM").unwrap()
        else {
            panic!("expected relation records");
        };
        let record = records.data().items()[0].clone();
        (catalogue, record)
    }

    #[test]
    fn catalogue_key_identity_ignores_rotating_record_cursor() {
        let (first_catalogue, first_record) =
            catalogue_and_order_record("rotating-token-iat-1-exp-2", "OPEN");
        let (second_catalogue, second_record) =
            catalogue_and_order_record("rotating-token-iat-2-exp-3", "OPEN");
        let first = ManagerProjectionFact::from_record(
            &first_record,
            first_catalogue.relation("public", "orders").unwrap(),
        )
        .unwrap();
        let second = ManagerProjectionFact::from_record(
            &second_record,
            second_catalogue.relation("public", "orders").unwrap(),
        )
        .unwrap();

        assert_eq!(first.source_key_digest, second.source_key_digest);
        assert_eq!(first.fields, second.fields);
        assert!(!format!("{first:?}").contains("rotating-token"));
    }

    #[test]
    fn business_change_preserves_entity_identity_but_changes_fact_state() {
        let (first_catalogue, first_record) = catalogue_and_order_record("token-1", "OPEN");
        let (second_catalogue, second_record) = catalogue_and_order_record("token-2", "FILLED");
        let first = ManagerProjectionFact::from_record(
            &first_record,
            first_catalogue.relation("public", "orders").unwrap(),
        )
        .unwrap();
        let second = ManagerProjectionFact::from_record(
            &second_record,
            second_catalogue.relation("public", "orders").unwrap(),
        )
        .unwrap();

        assert_eq!(first.source_key_digest, second.source_key_digest);
        assert_ne!(first.fields, second.fields);
    }

    #[test]
    fn catalogue_relation_mismatch_fails_closed() {
        let (catalogue, record) = catalogue_and_order_record("token-1", "OPEN");
        let error = ManagerProjectionFact::from_record(
            &record,
            catalogue.relation("public", "fills").unwrap(),
        )
        .unwrap_err();
        assert!(matches!(error, ProjectionMapError::RelationBindingMismatch));
    }

    #[test]
    fn all_profiles_build_deterministic_complete_snapshots() {
        for profile in [
            ManagerProjectionProfile::Paper,
            ManagerProjectionProfile::Sandbox,
            ManagerProjectionProfile::Live,
        ] {
            let first = cycle(profile).build().unwrap();
            let second = cycle(profile).build().unwrap();
            assert_eq!(first.cycle_id, second.cycle_id);
            assert_eq!(first.state_input_digest, second.state_input_digest);
            assert_eq!(first.feed_count, FEEDS.len());
            assert_eq!(first.record_count, FEEDS.len());
            assert_eq!(first.snapshots.len(), 8);
            assert!(first.snapshots.iter().all(|snapshot| {
                snapshot.completeness == SnapshotCompleteness::Complete
                    && snapshot.observations.iter().all(|observation| {
                        observation.source_completeness == SourceCompleteness::PollBounded
                            && observation.source_sequence.is_none()
                            && observation.payload["change_label"] == PORTAL_PROJECTION_DELTA
                    })
            }));
        }
    }

    #[test]
    fn observation_time_drift_does_not_create_a_false_semantic_delta() {
        let first = cycle(ManagerProjectionProfile::Paper).build().unwrap();
        let mut later = cycle(ManagerProjectionProfile::Paper);
        for feed in &mut later.feeds {
            feed.as_of = at(20);
            feed.source_read_at = at(21);
        }
        let later = later.build().unwrap();

        assert_eq!(later.state_input_digest, first.state_input_digest);
        assert_eq!(later.cycle_id, first.cycle_id);
        assert_eq!(
            later
                .snapshots
                .iter()
                .map(|snapshot| snapshot.snapshot_id.as_str())
                .collect::<Vec<_>>(),
            first
                .snapshots
                .iter()
                .map(|snapshot| snapshot.snapshot_id.as_str())
                .collect::<Vec<_>>()
        );
        assert_eq!(
            later
                .snapshots
                .iter()
                .flat_map(|snapshot| snapshot.observations.iter())
                .map(|observation| observation.ingestion_id.as_str())
                .collect::<Vec<_>>(),
            first
                .snapshots
                .iter()
                .flat_map(|snapshot| snapshot.observations.iter())
                .map(|observation| observation.ingestion_id.as_str())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn empty_live_cycle_still_emits_all_complete_snapshots() {
        let mut source = cycle(ManagerProjectionProfile::Live);
        for feed in &mut source.feeds {
            feed.facts.clear();
        }
        let built = source.build().unwrap();
        assert_eq!(built.feed_count, FEEDS.len());
        assert_eq!(built.record_count, 0);
        assert_eq!(built.snapshots.len(), 8);
        assert!(built.snapshots.iter().all(|snapshot| {
            snapshot.completeness == SnapshotCompleteness::Complete
                && snapshot.expected_count == 0
                && snapshot.observations.is_empty()
        }));
    }

    #[test]
    fn partial_missing_duplicate_cross_profile_and_relation_drift_fail_closed() {
        let mut partial = cycle(ManagerProjectionProfile::Paper);
        partial.feeds[0].completeness = Completeness::Partial;
        assert!(matches!(
            partial.build(),
            Err(ProjectionMapError::InvalidFeed)
        ));

        let mut missing = cycle(ManagerProjectionProfile::Paper);
        missing.feeds.pop();
        assert!(matches!(
            missing.build(),
            Err(ProjectionMapError::InvalidCycle)
        ));

        let mut duplicate = cycle(ManagerProjectionProfile::Paper);
        duplicate.feeds[1] = duplicate.feeds[0].clone();
        assert!(matches!(
            duplicate.build(),
            Err(ProjectionMapError::DuplicateFeed)
        ));

        let mut cross_profile = cycle(ManagerProjectionProfile::Sandbox);
        cross_profile.feeds[0].profile = ManagerProjectionProfile::Live;
        assert!(matches!(
            cross_profile.build(),
            Err(ProjectionMapError::InvalidFeed)
        ));

        let mut relation_drift = cycle(ManagerProjectionProfile::Live);
        relation_drift.feeds[6].facts[0].relation_id = "public.orders".to_owned();
        assert!(matches!(
            relation_drift.build(),
            Err(ProjectionMapError::RelationBindingMismatch)
        ));
    }

    #[test]
    fn source_key_is_one_way_and_poll_delta_never_claims_event_authority() {
        let raw_key = b"owner-opaque-key-secret-ish";
        let fact = ManagerProjectionFact::new("public.orders", raw_key, json!({})).unwrap();
        assert!(!format!("{fact:?}").contains("owner-opaque"));
        let built = cycle(ManagerProjectionProfile::Paper).build().unwrap();
        let serialized = serde_json::to_string(
            &built
                .snapshots
                .iter()
                .flat_map(|snapshot| snapshot.observations.iter())
                .collect::<Vec<_>>(),
        )
        .unwrap();
        assert!(serialized.contains(PORTAL_PROJECTION_DELTA));
        assert!(serialized.contains("POLL_BOUNDED"));
        assert!(!serialized.contains("EVENT_SOURCED"));
    }

    #[test]
    fn current_feed_set_excludes_unbounded_oldest_first_history() {
        let feeds = FEEDS
            .iter()
            .map(|feed| feed.feed_id)
            .collect::<BTreeSet<_>>();
        assert_eq!(feeds.len(), 13);
        for forbidden in [
            "relation.execution_sessions",
            "relation.account_equity_snapshots",
            "relation.performance_snapshots",
            "relation.portfolio_equity_snapshots",
            "relation.performance_events",
        ] {
            assert!(!feeds.contains(forbidden));
        }
        for required in [
            "relation.strategy_deployments",
            "relation.account_balances",
            "relation.account_policies",
            "relation.account_reservations",
            "relation.portfolio_allocations",
            "relation.risk_profiles",
            "relation.domain_events",
        ] {
            assert!(feeds.contains(required));
        }
    }
}
