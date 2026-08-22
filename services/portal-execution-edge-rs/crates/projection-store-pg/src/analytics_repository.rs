use analytics::{
    BindingExposureInput, CapitalBucketInput, CapitalLedgerFact, CapitalLedgerInput,
    CorrelationCluster, CorrelationInput, CorrelationLabel, CorrelationPair, CurrencyCode,
    FactQuality, FunnelEvent, FunnelInput, InsightObservation, PopulationCompleteness,
    VirtualAccountExposure,
};
use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, DeliveryProfile, FreshnessState, SourceAuthority};
use projection_core::{
    canonical_value_digest, evaluate_freshness, FreshnessInput, FreshnessPolicy, ProjectionScope,
    VenueSessionState,
};
use serde::{de::DeserializeOwned, Serialize};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{parse_authority, query::active_epoch, required_u64, PgProjectionStore, StoreError};

const MAX_SOURCE_FACTS: u64 = 20_000;
const MAX_SOURCE_PAYLOAD_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct AnalyticsReadRequirement<'a> {
    pub expected_profile: DeliveryProfile,
    pub capability_snapshot_id: &'a str,
    pub read_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct AnalyticsSourceRead<T> {
    pub epoch_id: Uuid,
    pub source_snapshot_id: Uuid,
    pub capability_snapshot_id: String,
    pub source_profile: DeliveryProfile,
    pub projection_sequence: u64,
    pub freshness_policy_version: String,
    pub read_at: DateTime<Utc>,
    pub input: T,
}

/// Canonical, ordered fact material covered by an analytics snapshot digest.
#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsFactDigestInput {
    pub fact_id: String,
    pub fact_kind: String,
    pub ordinal: u64,
    pub source_authority: SourceAuthority,
    pub as_of: Option<DateTime<Utc>>,
    pub payload: serde_json::Value,
}

/// Computes the content digest used to seal and verify an ordered fact set.
///
/// # Errors
///
/// Returns [`StoreError::Serialization`] if canonical JSON material cannot be built.
pub fn analytics_facts_digest(facts: &[AnalyticsFactDigestInput]) -> Result<String, StoreError> {
    let value = serde_json::to_value(facts).map_err(|_| StoreError::Serialization)?;
    Ok(canonical_value_digest(&value))
}

#[derive(Debug, Clone, Copy)]
enum AnalyticsKind {
    CapitalPreview,
    OrderFunnel,
    InsightPreview,
    PortfolioCorrelation,
    CapitalLedger,
    BindingExposure,
}

impl AnalyticsKind {
    const fn as_str(self) -> &'static str {
        match self {
            Self::CapitalPreview => "CAPITAL_PREVIEW",
            Self::OrderFunnel => "ORDER_FUNNEL",
            Self::InsightPreview => "INSIGHT_PREVIEW",
            Self::PortfolioCorrelation => "PORTFOLIO_CORRELATION",
            Self::CapitalLedger => "CAPITAL_LEDGER",
            Self::BindingExposure => "BINDING_EXPOSURE",
        }
    }
}

struct SnapshotHeader {
    epoch_id: Uuid,
    snapshot_id: Uuid,
    source_profile: DeliveryProfile,
    population: PopulationCompleteness,
    expected_fact_count: u64,
    expected_population_count: Option<u64>,
    source_read_at: DateTime<Utc>,
    projected_at: DateTime<Utc>,
    policy: FreshnessPolicy,
    projection_sequence: u64,
    capability_snapshot_id: String,
    payload_digest: String,
    venue_session: VenueSessionState,
}

struct SourceFact {
    fact_id: String,
    fact_kind: String,
    ordinal: u64,
    authority: SourceAuthority,
    as_of: Option<DateTime<Utc>>,
    payload: serde_json::Value,
}

struct LoadedSource {
    header: SnapshotHeader,
    facts: Vec<SourceFact>,
}

impl PgProjectionStore {
    /// Loads the exact capital bucket for an active-epoch portfolio/currency source.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the active source is absent, stale in contract
    /// identity, incomplete, malformed, over its bound, or unavailable in `PostgreSQL`.
    pub async fn load_capital_preview_source(
        &self,
        scope: &ProjectionScope,
        portfolio_id: &CanonicalId,
        currency: &CurrencyCode,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<AnalyticsSourceRead<CapitalBucketInput>, StoreError> {
        let loaded = self
            .load_analytics_source(
                scope,
                AnalyticsKind::CapitalPreview,
                portfolio_id.as_str(),
                currency.as_str(),
                requirement,
            )
            .await?;
        if loaded.facts.len() != 1 {
            return Err(StoreError::AnalyticsPopulationMismatch);
        }
        let fact = &loaded.facts[0];
        ensure_fact_kind(fact, "CAPITAL_BUCKET")?;
        let mut input: CapitalBucketInput = decode(fact)?;
        input.portfolio_id = portfolio_id.clone();
        input.currency = currency.clone();
        input.quality = quality(fact, &loaded.header, requirement.read_at)?;
        Ok(source_read(loaded.header, requirement.read_at, input))
    }

    /// Loads the ordered active-epoch source events for one order funnel.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the active source is absent, stale in contract
    /// identity, incomplete, malformed, over its bound, or unavailable in `PostgreSQL`.
    pub async fn load_order_funnel_source(
        &self,
        scope: &ProjectionScope,
        order_id: &CanonicalId,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<AnalyticsSourceRead<FunnelInput>, StoreError> {
        let loaded = self
            .load_analytics_source(
                scope,
                AnalyticsKind::OrderFunnel,
                order_id.as_str(),
                "",
                requirement,
            )
            .await?;
        let events = loaded
            .facts
            .iter()
            .map(|fact| {
                ensure_fact_kind(fact, "FUNNEL_EVENT")?;
                let mut event: FunnelEvent = decode(fact)?;
                event.quality = quality(fact, &loaded.header, requirement.read_at)?;
                Ok(event)
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        let input = FunnelInput {
            order_id: order_id.clone(),
            source_population: loaded.header.population,
            events,
        };
        Ok(source_read(loaded.header, requirement.read_at, input))
    }

    /// Loads the active-epoch insight observations for one portfolio.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the active source is absent, stale in contract
    /// identity, incomplete, malformed, over its bound, or unavailable in `PostgreSQL`.
    pub async fn load_insight_preview_source(
        &self,
        scope: &ProjectionScope,
        portfolio_id: &CanonicalId,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<AnalyticsSourceRead<Vec<InsightObservation>>, StoreError> {
        let loaded = self
            .load_analytics_source(
                scope,
                AnalyticsKind::InsightPreview,
                portfolio_id.as_str(),
                "",
                requirement,
            )
            .await?;
        let observations = loaded
            .facts
            .iter()
            .map(|fact| {
                ensure_fact_kind(fact, "INSIGHT_OBSERVATION")?;
                let mut observation: InsightObservation = decode(fact)?;
                observation.portfolio_id = portfolio_id.clone();
                observation.quality = quality(fact, &loaded.header, requirement.read_at)?;
                Ok(observation)
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        Ok(source_read(
            loaded.header,
            requirement.read_at,
            observations,
        ))
    }

    /// Loads the active-epoch correlation labels, pairs, and clusters for a portfolio.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the active source is absent, stale in contract
    /// identity, incomplete, malformed, over its bound, or unavailable in `PostgreSQL`.
    pub async fn load_correlation_source(
        &self,
        scope: &ProjectionScope,
        portfolio_id: &CanonicalId,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<AnalyticsSourceRead<CorrelationInput>, StoreError> {
        let loaded = self
            .load_analytics_source(
                scope,
                AnalyticsKind::PortfolioCorrelation,
                portfolio_id.as_str(),
                "",
                requirement,
            )
            .await?;
        let mut labels = Vec::new();
        let mut pairs = Vec::new();
        let mut clusters = Vec::new();
        for fact in &loaded.facts {
            match fact.fact_kind.as_str() {
                "CORRELATION_LABEL" => labels.push(decode::<CorrelationLabel>(fact)?),
                "CORRELATION_PAIR" => pairs.push(decode::<CorrelationPair>(fact)?),
                "CORRELATION_CLUSTER" => clusters.push(decode::<CorrelationCluster>(fact)?),
                _ => return Err(StoreError::InvalidAnalyticsSourcePayload),
            }
        }
        let input = CorrelationInput {
            portfolio_id: portfolio_id.clone(),
            labels,
            pairs,
            clusters,
            quality: combined_quality(&loaded.facts, &loaded.header, requirement.read_at)?,
        };
        Ok(source_read(loaded.header, requirement.read_at, input))
    }

    /// Loads the ordered active-epoch capital-ledger facts for one portfolio.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the active source is absent, stale in contract
    /// identity, incomplete, malformed, over its bound, or unavailable in `PostgreSQL`.
    pub async fn load_capital_ledger_source(
        &self,
        scope: &ProjectionScope,
        portfolio_id: &CanonicalId,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<AnalyticsSourceRead<CapitalLedgerInput>, StoreError> {
        let loaded = self
            .load_analytics_source(
                scope,
                AnalyticsKind::CapitalLedger,
                portfolio_id.as_str(),
                "",
                requirement,
            )
            .await?;
        let entries = loaded
            .facts
            .iter()
            .map(|fact| {
                ensure_fact_kind(fact, "CAPITAL_LEDGER_ENTRY")?;
                let mut entry: CapitalLedgerFact = decode(fact)?;
                entry.portfolio_id = portfolio_id.clone();
                entry.quality = quality(fact, &loaded.header, requirement.read_at)?;
                Ok(entry)
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        let input = CapitalLedgerInput {
            portfolio_id: portfolio_id.clone(),
            source_population: loaded.header.population,
            entries,
        };
        Ok(source_read(loaded.header, requirement.read_at, input))
    }

    /// Loads the complete active-epoch virtual-account population for one binding.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the active source is absent, stale in contract
    /// identity, incomplete, malformed, over its bound, or unavailable in `PostgreSQL`.
    pub async fn load_binding_exposure_source(
        &self,
        scope: &ProjectionScope,
        binding_id: &CanonicalId,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<AnalyticsSourceRead<BindingExposureInput>, StoreError> {
        let loaded = self
            .load_analytics_source(
                scope,
                AnalyticsKind::BindingExposure,
                binding_id.as_str(),
                "",
                requirement,
            )
            .await?;
        let accounts = loaded
            .facts
            .iter()
            .map(|fact| {
                ensure_fact_kind(fact, "VIRTUAL_ACCOUNT_EXPOSURE")?;
                let mut account: VirtualAccountExposure = decode(fact)?;
                account.quality = quality(fact, &loaded.header, requirement.read_at)?;
                Ok(account)
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        let expected_account_count = loaded
            .header
            .expected_population_count
            .map(u32::try_from)
            .transpose()
            .map_err(|_| StoreError::NumericOverflow)?;
        let input = BindingExposureInput {
            binding_id: binding_id.clone(),
            expected_account_count,
            source_population: loaded.header.population,
            accounts,
        };
        Ok(source_read(loaded.header, requirement.read_at, input))
    }

    async fn load_analytics_source(
        &self,
        scope: &ProjectionScope,
        kind: AnalyticsKind,
        resource_id: &str,
        context_key: &str,
        requirement: &AnalyticsReadRequirement<'_>,
    ) -> Result<LoadedSource, StoreError> {
        if requirement.capability_snapshot_id.trim().is_empty() {
            return Err(StoreError::AnalyticsCapabilityMismatch);
        }
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *transaction)
            .await?;
        let epoch_id = active_epoch(
            &mut transaction,
            scope.workspace_id.as_str(),
            &scope.environment,
        )
        .await?;
        let header = load_header(
            &mut transaction,
            epoch_id,
            kind,
            resource_id,
            context_key,
            requirement,
        )
        .await?;
        if header.expected_fact_count > MAX_SOURCE_FACTS {
            return Err(StoreError::AnalyticsSourceLimitExceeded);
        }
        let population = sqlx::query(
            "SELECT COUNT(*)::BIGINT AS fact_count,
                    COALESCE(SUM(octet_length(payload::text)),0)::BIGINT AS payload_bytes
             FROM portal_projection.analytics_source_facts WHERE snapshot_id=$1",
        )
        .bind(header.snapshot_id)
        .fetch_one(&mut *transaction)
        .await?;
        let fact_count = required_u64(population.try_get("fact_count")?)?;
        let payload_bytes = required_u64(population.try_get("payload_bytes")?)?;
        if fact_count != header.expected_fact_count {
            return Err(StoreError::AnalyticsPopulationMismatch);
        }
        if payload_bytes > MAX_SOURCE_PAYLOAD_BYTES {
            return Err(StoreError::AnalyticsSourcePayloadLimitExceeded);
        }
        let rows = sqlx::query(
            "SELECT fact_id, fact_kind, ordinal, source_authority, as_of, payload
             FROM portal_projection.analytics_source_facts
             WHERE snapshot_id=$1 ORDER BY ordinal ASC LIMIT $2",
        )
        .bind(header.snapshot_id)
        .bind(i64::try_from(MAX_SOURCE_FACTS + 1).map_err(|_| StoreError::NumericOverflow)?)
        .fetch_all(&mut *transaction)
        .await?;
        transaction.commit().await?;
        let facts = rows
            .into_iter()
            .map(|row| {
                Ok(SourceFact {
                    fact_id: row.try_get("fact_id")?,
                    fact_kind: row.try_get("fact_kind")?,
                    ordinal: required_u64(row.try_get("ordinal")?)?,
                    authority: parse_authority(&row.try_get::<String, _>("source_authority")?)?,
                    as_of: row.try_get("as_of")?,
                    payload: row.try_get("payload")?,
                })
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        let digest_input = facts
            .iter()
            .map(|fact| AnalyticsFactDigestInput {
                fact_id: fact.fact_id.clone(),
                fact_kind: fact.fact_kind.clone(),
                ordinal: fact.ordinal,
                source_authority: fact.authority,
                as_of: fact.as_of,
                payload: fact.payload.clone(),
            })
            .collect::<Vec<_>>();
        if analytics_facts_digest(&digest_input)? != header.payload_digest {
            return Err(StoreError::AnalyticsSourceIntegrityMismatch);
        }
        Ok(LoadedSource { header, facts })
    }
}

async fn load_header(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    kind: AnalyticsKind,
    resource_id: &str,
    context_key: &str,
    requirement: &AnalyticsReadRequirement<'_>,
) -> Result<SnapshotHeader, StoreError> {
    let row = sqlx::query(
        "SELECT s.snapshot_id, s.source_profile, s.population_completeness,
                s.expected_fact_count, s.expected_population_count, s.source_read_at,
                s.projected_at, s.freshness_policy_version,
                s.freshness_warning_after_ms, s.freshness_stale_after_ms,
                s.maximum_future_skew_ms, s.projection_sequence,
                s.capability_snapshot_id, e.capability_snapshot_id AS epoch_capability_snapshot_id,
                s.adapter_version, e.adapter_version AS epoch_adapter_version,
                s.payload_digest, s.venue_session_state
         FROM portal_projection.analytics_source_snapshots s
         JOIN portal_projection.epochs e ON e.epoch_id=s.epoch_id
         WHERE s.epoch_id=$1 AND s.analytics_kind=$2 AND s.resource_id=$3 AND s.context_key=$4",
    )
    .bind(epoch_id)
    .bind(kind.as_str())
    .bind(resource_id)
    .bind(context_key)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(StoreError::AnalyticsSourceNotFound)?;
    let profile = parse_profile(&row.try_get::<String, _>("source_profile")?)?;
    if profile != requirement.expected_profile {
        return Err(StoreError::AnalyticsSourceProfileMismatch);
    }
    let capability_snapshot_id: String = row.try_get("capability_snapshot_id")?;
    let epoch_capability_snapshot_id: String = row.try_get("epoch_capability_snapshot_id")?;
    if capability_snapshot_id != requirement.capability_snapshot_id
        || capability_snapshot_id != epoch_capability_snapshot_id
        || row.try_get::<String, _>("adapter_version")?
            != row.try_get::<String, _>("epoch_adapter_version")?
    {
        return Err(StoreError::AnalyticsCapabilityMismatch);
    }
    Ok(SnapshotHeader {
        epoch_id,
        snapshot_id: row.try_get("snapshot_id")?,
        source_profile: profile,
        population: parse_population(&row.try_get::<String, _>("population_completeness")?)?,
        expected_fact_count: required_u64(row.try_get("expected_fact_count")?)?,
        expected_population_count: row
            .try_get::<Option<i64>, _>("expected_population_count")?
            .map(required_u64)
            .transpose()?,
        source_read_at: row.try_get("source_read_at")?,
        projected_at: row.try_get("projected_at")?,
        policy: FreshnessPolicy {
            policy_version: row.try_get("freshness_policy_version")?,
            warning_after_ms: row.try_get("freshness_warning_after_ms")?,
            stale_after_ms: row.try_get("freshness_stale_after_ms")?,
            maximum_future_skew_ms: row.try_get("maximum_future_skew_ms")?,
        },
        projection_sequence: required_u64(row.try_get("projection_sequence")?)?,
        capability_snapshot_id,
        payload_digest: row.try_get("payload_digest")?,
        venue_session: parse_venue_session(&row.try_get::<String, _>("venue_session_state")?)?,
    })
}

fn quality(
    fact: &SourceFact,
    header: &SnapshotHeader,
    read_at: DateTime<Utc>,
) -> Result<FactQuality, StoreError> {
    let evaluation = evaluate_freshness(
        &header.policy,
        &FreshnessInput {
            as_of: fact.as_of,
            read_at,
            source_received_at: Some(header.source_read_at),
            projected_at: Some(header.projected_at),
            venue_session: header.venue_session,
        },
    )?;
    Ok(FactQuality {
        source_authority: fact.authority,
        freshness_state: evaluation.state,
        completeness: header.population,
        as_of: fact.as_of,
    })
}

fn combined_quality(
    facts: &[SourceFact],
    header: &SnapshotHeader,
    read_at: DateTime<Utc>,
) -> Result<FactQuality, StoreError> {
    let mut qualities = facts
        .iter()
        .map(|fact| quality(fact, header, read_at))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter();
    let mut combined = qualities
        .next()
        .ok_or(StoreError::AnalyticsPopulationMismatch)?;
    for current in qualities {
        if combined.source_authority != current.source_authority {
            combined.source_authority = SourceAuthority::Derived;
        }
        combined.freshness_state =
            worse_freshness(combined.freshness_state, current.freshness_state);
        combined.completeness = worse_population(combined.completeness, current.completeness);
        combined.as_of = match (combined.as_of, current.as_of) {
            (Some(left), Some(right)) => Some(left.min(right)),
            _ => None,
        };
    }
    Ok(combined)
}

const fn freshness_rank(value: FreshnessState) -> u8 {
    match value {
        FreshnessState::Ok => 0,
        FreshnessState::Aging => 1,
        FreshnessState::Paused => 2,
        FreshnessState::Stale => 3,
        FreshnessState::Unknown => 4,
    }
}

const fn worse_freshness(left: FreshnessState, right: FreshnessState) -> FreshnessState {
    if freshness_rank(left) >= freshness_rank(right) {
        left
    } else {
        right
    }
}

const fn worse_population(
    left: PopulationCompleteness,
    right: PopulationCompleteness,
) -> PopulationCompleteness {
    match (left, right) {
        (PopulationCompleteness::Unknown, _) | (_, PopulationCompleteness::Unknown) => {
            PopulationCompleteness::Unknown
        }
        (PopulationCompleteness::Partial, _) | (_, PopulationCompleteness::Partial) => {
            PopulationCompleteness::Partial
        }
        _ => PopulationCompleteness::Complete,
    }
}

fn decode<T: DeserializeOwned>(fact: &SourceFact) -> Result<T, StoreError> {
    serde_json::from_value(fact.payload.clone())
        .map_err(|_| StoreError::InvalidAnalyticsSourcePayload)
}

fn ensure_fact_kind(fact: &SourceFact, expected: &str) -> Result<(), StoreError> {
    if fact.fact_kind == expected {
        Ok(())
    } else {
        Err(StoreError::InvalidAnalyticsSourcePayload)
    }
}

fn source_read<T>(
    header: SnapshotHeader,
    read_at: DateTime<Utc>,
    input: T,
) -> AnalyticsSourceRead<T> {
    AnalyticsSourceRead {
        epoch_id: header.epoch_id,
        source_snapshot_id: header.snapshot_id,
        capability_snapshot_id: header.capability_snapshot_id,
        source_profile: header.source_profile,
        projection_sequence: header.projection_sequence,
        freshness_policy_version: header.policy.policy_version,
        read_at,
        input,
    }
}

fn parse_population(value: &str) -> Result<PopulationCompleteness, StoreError> {
    match value {
        "COMPLETE" => Ok(PopulationCompleteness::Complete),
        "PARTIAL" => Ok(PopulationCompleteness::Partial),
        "UNKNOWN" => Ok(PopulationCompleteness::Unknown),
        _ => Err(StoreError::PersistedVocabulary),
    }
}

fn parse_profile(value: &str) -> Result<DeliveryProfile, StoreError> {
    match value {
        "fixture" => Ok(DeliveryProfile::Fixture),
        "shadow" => Ok(DeliveryProfile::Shadow),
        "paper" => Ok(DeliveryProfile::Paper),
        "sandbox" => Ok(DeliveryProfile::Sandbox),
        "live_canary" => Ok(DeliveryProfile::LiveCanary),
        "live_full" => Ok(DeliveryProfile::LiveFull),
        _ => Err(StoreError::PersistedVocabulary),
    }
}

fn parse_venue_session(value: &str) -> Result<VenueSessionState, StoreError> {
    match value {
        "OPEN" => Ok(VenueSessionState::Open),
        "PAUSED" => Ok(VenueSessionState::Paused),
        "UNKNOWN" => Ok(VenueSessionState::Unknown),
        _ => Err(StoreError::PersistedVocabulary),
    }
}
