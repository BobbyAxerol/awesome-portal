use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, SourceCompleteness};
use manager_projection::{ManagerProjectionSource, FEEDS, MANAGER_PROJECTION_ADAPTER_VERSION};
use projection_core::{canonical_digest, ProjectionEntityKind, ProjectionScope};
use serde::{Deserialize, Serialize};
use sqlx::Row as _;
use uuid::Uuid;

use crate::{
    manager_projection::validate_manager_feed_observations, query::normalize_projection_payload,
    ManagerFeedObservation, ManagerSourceHealth, PgProjectionStore, StoreError,
};

pub const N25_MANAGER_ANALYTICS_MAX_FACTS: usize = 20_000;
const N25_MANAGER_ANALYTICS_REPOSITORY_QUERIES: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ManagerAnalyticsSubjectKind {
    Deployment,
    Alpha,
    Portfolio,
    LiveGate,
}

impl ManagerAnalyticsSubjectKind {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Deployment => "DEPLOYMENT",
            Self::Alpha => "ALPHA",
            Self::Portfolio => "PORTFOLIO",
            Self::LiveGate => "LIVE_GATE",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerAnalyticsSubject {
    pub kind: ManagerAnalyticsSubjectKind,
    pub id: CanonicalId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagerAnalyticsFact {
    pub entity_id: String,
    pub entity_kind: ProjectionEntityKind,
    pub source_relation: String,
    pub as_of: DateTime<Utc>,
    pub source_read_at: DateTime<Utc>,
    pub source_completeness: SourceCompleteness,
    pub fields: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagerAnalyticsSnapshot {
    pub schema_version: String,
    pub epoch_id: Uuid,
    pub subject_kind: ManagerAnalyticsSubjectKind,
    pub subject_id: String,
    pub profile_id: String,
    pub catalogue_digest: String,
    pub projection_state_digest: String,
    pub source_read_at: DateTime<Utc>,
    pub as_of: Option<DateTime<Utc>>,
    /// Oldest successful feed observation in the same sealed SQL snapshot.
    /// This is not evidence that later source attempts succeeded.
    pub feed_as_of: Option<DateTime<Utc>>,
    /// Latest feed time is internal and detects future skew in a mixed set.
    #[serde(skip)]
    pub feed_latest_as_of: Option<DateTime<Utc>>,
    /// Internal, snapshot-bound health; never serialized as a wire field.
    #[serde(skip)]
    pub source_health: ManagerSourceHealth,
    pub fact_digest: String,
    pub fact_count: usize,
    pub repository_query_count: u8,
    pub facts: Vec<ManagerAnalyticsFact>,
}

impl PgProjectionStore {
    /// Loads one repeatable, resource-bound analytics snapshot from the ACTIVE
    /// N24 epoch. Epoch, latest complete cycle, deployment lineage and facts
    /// are selected in one SQL statement; no chart or returned row causes an
    /// additional query.
    ///
    /// # Errors
    ///
    /// Returns typed scope, payload, vocabulary, bound and database failures.
    #[allow(clippy::too_many_lines)] // one statement is the auditable no-N+1 boundary
    pub async fn load_manager_analytics_snapshot(
        &self,
        scope: &ProjectionScope,
        subject: &ManagerAnalyticsSubject,
    ) -> Result<ManagerAnalyticsSnapshot, StoreError> {
        let rows = sqlx::query(
            "WITH active AS (
               SELECT epoch_id,next_projection_sequence FROM portal_projection.epochs
               WHERE workspace_id=$1 AND environment=$2 AND status='ACTIVE'
             ), cycle AS (
               SELECT c.epoch_id,c.profile_id,c.catalogue_digest,c.state_digest,
                      COALESCE(h.source_read_at,c.source_read_at) AS source_read_at,
                      h.feed_observations,h.observed_at,
                      h.sealed_projection_sequence,a.next_projection_sequence,
                      s.last_failure_order,s.cleared_by_attempt,s.sealed_observed_at,s.sealed_sequence,
                      EXISTS (SELECT 1 FROM portal_projection.manager_source_attempts p
                        WHERE p.workspace_id=$1 AND p.environment=$2
                          AND p.deadline <= statement_timestamp())
                      OR EXISTS (SELECT 1 FROM portal_projection.manager_source_attempt_watermarks w
                        WHERE w.workspace_id=$1 AND w.environment=$2) AS attempt_timed_out,
                      COALESCE(h.sealed_projection_sequence = a.next_projection_sequence, false) AS read_consistent
               FROM portal_projection.manager_projection_cycles c JOIN active a USING(epoch_id)
               LEFT JOIN portal_projection.manager_projection_heartbeats h USING(epoch_id)
               LEFT JOIN portal_projection.manager_source_health s USING(epoch_id)
               ORDER BY c.committed_at DESC,c.cycle_id DESC LIMIT 1
             ), binding AS (
               SELECT
                 ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(e.payload#>>'{fields,deployment_id,value}',e.payload->>'deployment_id')),NULL) AS deployment_ids,
                 ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(e.payload#>>'{fields,portfolio_id,value}',e.payload->>'portfolio_id')),NULL) AS portfolio_ids,
                 ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(e.payload#>>'{fields,strategy_id,value}',e.payload->>'strategy_id')),NULL) AS strategy_ids,
                 ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(e.payload#>>'{fields,account_id,value}',e.payload->>'account_id')),NULL) AS account_ids
               FROM portal_projection.entities e JOIN active a USING(epoch_id)
               WHERE COALESCE(e.payload->>'source_relation','')='public.strategy_deployments'
                 AND CASE $3
                   WHEN 'DEPLOYMENT' THEN COALESCE(e.payload#>>'{fields,deployment_id,value}',e.payload->>'deployment_id','')=$4
                   WHEN 'ALPHA' THEN COALESCE(e.payload#>>'{fields,strategy_id,value}',e.payload->>'strategy_id','')=$4
                   WHEN 'PORTFOLIO' THEN COALESCE(e.payload#>>'{fields,portfolio_id,value}',e.payload->>'portfolio_id','')=$4
                   ELSE false
                 END
             )
             SELECT e.entity_id,e.entity_kind,e.as_of,e.source_read_at,e.source_completeness,
                    e.source_authority,e.adapter_version,e.payload,
                    COALESCE(e.attribution_unproven,false) AS attribution_unproven,
                    c.epoch_id,c.profile_id,c.catalogue_digest,c.state_digest,
                    c.source_read_at AS cycle_source_read_at,c.observed_at,c.read_consistent,
                    c.sealed_projection_sequence,c.next_projection_sequence,
                    c.last_failure_order,c.cleared_by_attempt,c.sealed_observed_at,c.sealed_sequence,
                    c.attempt_timed_out,
                    CASE WHEN row_number() OVER (ORDER BY e.entity_kind NULLS FIRST,e.entity_id NULLS FIRST)=1
                         THEN c.feed_observations ELSE NULL END AS feed_observations
             FROM cycle c
             LEFT JOIN binding b ON true
             LEFT JOIN LATERAL (
               SELECT candidate.entity_id,candidate.entity_kind,candidate.as_of,
                      candidate.source_read_at,candidate.source_completeness,
                      candidate.source_authority,candidate.adapter_version,candidate.payload,
                      CASE $3
                        WHEN 'DEPLOYMENT' THEN
                          COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','') = ''
                        WHEN 'PORTFOLIO' THEN
                          COALESCE(candidate.payload#>>'{fields,portfolio_id,value}',candidate.payload->>'portfolio_id','') = ''
                          AND COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','') = ''
                        ELSE false
                      END AS attribution_unproven
               FROM portal_projection.entities candidate
               WHERE c.read_consistent AND candidate.epoch_id=c.epoch_id
                 AND COALESCE(candidate.payload->>'source_relation','') = ANY($5::text[])
                 AND CASE $3
                   WHEN 'DEPLOYMENT' THEN (CASE
                     WHEN COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','') <> ''
                       THEN COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','')=$4
                     ELSE COALESCE(candidate.payload#>>'{fields,strategy_id,value}',candidate.payload->>'strategy_id','')=ANY(b.strategy_ids)
                       OR COALESCE(candidate.payload#>>'{fields,account_id,value}',candidate.payload->>'account_id','')=ANY(b.account_ids)
                     END) AND (COALESCE(candidate.payload#>>'{fields,portfolio_id,value}',candidate.payload->>'portfolio_id','') = ''
                       OR COALESCE(candidate.payload#>>'{fields,portfolio_id,value}',candidate.payload->>'portfolio_id','')=ANY(b.portfolio_ids))
                   WHEN 'ALPHA' THEN COALESCE(candidate.payload#>>'{fields,strategy_id,value}',candidate.payload->>'strategy_id','')=$4
                   WHEN 'PORTFOLIO' THEN CASE
                     WHEN COALESCE(candidate.payload#>>'{fields,portfolio_id,value}',candidate.payload->>'portfolio_id','') <> ''
                       THEN COALESCE(candidate.payload#>>'{fields,portfolio_id,value}',candidate.payload->>'portfolio_id','')=$4
                         AND (COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','') = ''
                           OR COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','')=ANY(b.deployment_ids))
                     WHEN COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','') <> ''
                       THEN COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','')=ANY(b.deployment_ids)
                     ELSE COALESCE(candidate.payload#>>'{fields,strategy_id,value}',candidate.payload->>'strategy_id','')=ANY(b.strategy_ids)
                       OR COALESCE(candidate.payload#>>'{fields,account_id,value}',candidate.payload->>'account_id','')=ANY(b.account_ids)
                     END
                   WHEN 'LIVE_GATE' THEN false
                   ELSE false
                 END
               ORDER BY candidate.entity_kind,candidate.entity_id
               LIMIT 20001
             ) e ON true
             ORDER BY e.entity_kind NULLS FIRST,e.entity_id NULLS FIRST",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(subject.kind.as_str())
        .bind(subject.id.as_str())
        .bind(n25_relations())
        .fetch_all(&self.pool)
        .await?;
        let Some(first) = rows.first() else {
            // No committed Manager cycle exists for this scope.
            return Err(StoreError::AnalyticsSourceNotFound);
        };
        if !first.try_get::<bool, _>("read_consistent")? {
            return Err(StoreError::ManagerProjectionCycleIncomplete);
        }
        let epoch_id: Uuid = first.try_get("epoch_id")?;
        let profile_id: String = first.try_get("profile_id")?;
        let catalogue_digest: String = first.try_get("catalogue_digest")?;
        let projection_state_digest: String = first.try_get("state_digest")?;
        let source_read_at: DateTime<Utc> = first.try_get("cycle_source_read_at")?;
        let source_health = super::manager_source_health::manager_source_health_from_row(first)?;
        let feed_observations = if let Some(value) =
            first.try_get::<Option<serde_json::Value>, _>("feed_observations")?
        {
            let observations: BTreeMap<String, ManagerFeedObservation> =
                serde_json::from_value(value)
                    .map_err(|_| StoreError::InvalidManagerProjectionSnapshot)?;
            let observed_at: DateTime<Utc> = first.try_get("observed_at")?;
            validate_manager_feed_observations(&observations, source_read_at, observed_at)?;
            Some(observations)
        } else {
            None
        };
        let feed_as_of = feed_observations.as_ref().and_then(|observations| {
            observations
                .values()
                .map(|observation| observation.as_of)
                .min()
        });
        let feed_latest_as_of = feed_observations.as_ref().and_then(|observations| {
            observations
                .values()
                .map(|observation| observation.as_of)
                .max()
        });
        let mut facts = Vec::with_capacity(rows.len());
        let mut as_of = None;
        for row in rows {
            if row.try_get::<Uuid, _>("epoch_id")? != epoch_id
                || row.try_get::<String, _>("profile_id")? != profile_id
                || row.try_get::<String, _>("catalogue_digest")? != catalogue_digest
                || row.try_get::<String, _>("state_digest")? != projection_state_digest
                || row.try_get::<DateTime<Utc>, _>("cycle_source_read_at")? != source_read_at
            {
                return Err(StoreError::AnalyticsSourceIntegrityMismatch);
            }
            let Some(entity_id) = row.try_get::<Option<String>, _>("entity_id")? else {
                continue;
            };
            if row.try_get::<bool, _>("attribution_unproven")? {
                return Err(StoreError::AnalyticsAttributionUnproven);
            }
            let payload = normalize_projection_payload(row.try_get("payload")?)?;
            let source_relation = payload
                .get("source_relation")
                .and_then(serde_json::Value::as_str)
                .filter(|relation| n25_relations().contains(relation))
                .ok_or(StoreError::InvalidAnalyticsSourcePayload)?
                .to_owned();
            // A local read clock is not an upstream as-of. An old or damaged
            // row without its source timestamp must not fabricate one.
            let fact_as_of: DateTime<Utc> = row
                .try_get::<Option<DateTime<Utc>>, _>("as_of")?
                .ok_or(StoreError::InvalidAnalyticsSourcePayload)?;
            let fact = ManagerAnalyticsFact {
                entity_id,
                entity_kind: parse_kind(&row.try_get::<String, _>("entity_kind")?)?,
                source_relation,
                as_of: fact_as_of,
                source_read_at: row.try_get("source_read_at")?,
                source_completeness: super::parse_completeness(
                    &row.try_get::<String, _>("source_completeness")?,
                )?,
                fields: payload,
            };
            let fresh_as_of = analytics_fact_observed_as_of(
                &fact,
                &row.try_get::<String, _>("source_authority")?,
                &row.try_get::<String, _>("adapter_version")?,
                feed_observations.as_ref(),
            );
            as_of = Some(as_of.map_or(fresh_as_of, |current: DateTime<Utc>| {
                current.min(fresh_as_of)
            }));
            facts.push(fact);
        }
        if facts.len() > N25_MANAGER_ANALYTICS_MAX_FACTS {
            return Err(StoreError::AnalyticsSourceLimitExceeded);
        }
        let fact_digest = canonical_digest(&facts)?;
        Ok(ManagerAnalyticsSnapshot {
            schema_version: "portal.execution.manager-analytics-snapshot.v1".to_owned(),
            epoch_id,
            subject_kind: subject.kind,
            subject_id: subject.id.as_str().to_owned(),
            profile_id,
            catalogue_digest,
            projection_state_digest,
            source_read_at,
            as_of,
            feed_as_of,
            feed_latest_as_of,
            source_health,
            fact_digest,
            fact_count: facts.len(),
            repository_query_count: N25_MANAGER_ANALYTICS_REPOSITORY_QUERIES,
            facts,
        })
    }
}

// A no-op cycle can prove an existing fact was observed again without
// rewriting its original clock. Use that proof only for the aggregate quality
// bound; `fact.as_of` and timestamp-dependent business calculations stay intact.
fn analytics_fact_observed_as_of(
    fact: &ManagerAnalyticsFact,
    authority: &str,
    adapter_version: &str,
    observations: Option<&BTreeMap<String, ManagerFeedObservation>>,
) -> DateTime<Utc> {
    let Some(feed_id) = fact
        .fields
        .get("source_feed")
        .and_then(serde_json::Value::as_str)
    else {
        return fact.as_of;
    };
    let Some(feed) = FEEDS.iter().find(|feed| feed.feed_id == feed_id) else {
        return fact.as_of;
    };
    let relation_matches = match feed.source {
        ManagerProjectionSource::Relation(relation) => fact.source_relation == relation,
        ManagerProjectionSource::Named(_) => true,
    };
    if authority != "EXECUTION"
        || adapter_version != MANAGER_PROJECTION_ADAPTER_VERSION
        || fact.source_completeness != SourceCompleteness::PollBounded
        || feed.entity_kind != fact.entity_kind
        || !relation_matches
        || !fact
            .entity_id
            .strip_prefix(feed_id)
            .is_some_and(|suffix| suffix.starts_with(':'))
    {
        return fact.as_of;
    }
    observations
        .and_then(|values| values.get(feed_id))
        .filter(|observation| {
            observation.as_of >= fact.as_of && observation.source_read_at >= fact.source_read_at
        })
        .map_or(fact.as_of, |observation| observation.as_of)
}

fn n25_relations() -> &'static [&'static str] {
    &[
        "public.strategy_deployments",
        "public.orders",
        "public.fills",
        "public.positions_v2",
        "public.accounts",
        "public.reconciliation_findings",
        "public.portfolios",
        "public.account_balances",
        "public.account_policies",
        "public.account_reservations",
        "public.portfolio_allocations",
        "public.risk_profiles",
        "public.domain_events",
    ]
}

fn parse_kind(value: &str) -> Result<ProjectionEntityKind, StoreError> {
    match value {
        "ORDER" => Ok(ProjectionEntityKind::Order),
        "FILL" => Ok(ProjectionEntityKind::Fill),
        "POSITION" => Ok(ProjectionEntityKind::Position),
        "EVENT" => Ok(ProjectionEntityKind::Event),
        "RUNTIME" => Ok(ProjectionEntityKind::Runtime),
        "ACCOUNT" => Ok(ProjectionEntityKind::Account),
        "PERFORMANCE" => Ok(ProjectionEntityKind::Performance),
        _ => Err(StoreError::PersistedVocabulary),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeDelta;
    use serde_json::json;

    #[test]
    fn analytics_noop_observation_requires_matching_fact_provenance() {
        let old = DateTime::from_timestamp(1_700_000_000, 0).unwrap();
        let newer = old + TimeDelta::seconds(5);
        let mut fact = ManagerAnalyticsFact {
            entity_id: "manager.order:TEST_ONLY".to_owned(),
            entity_kind: ProjectionEntityKind::Order,
            source_relation: "public.orders".to_owned(),
            as_of: old,
            source_read_at: old,
            source_completeness: SourceCompleteness::PollBounded,
            fields: json!({"source_feed":"manager.order"}),
        };
        let observation = ManagerFeedObservation {
            as_of: newer,
            source_read_at: newer,
            poll_interval_ms: 2_000,
        };
        let observations = BTreeMap::from([("manager.order".to_owned(), observation.clone())]);
        let evaluate = |fact: &ManagerAnalyticsFact, authority, adapter, values| {
            analytics_fact_observed_as_of(fact, authority, adapter, values)
        };
        let adapter = MANAGER_PROJECTION_ADAPTER_VERSION;
        assert_eq!(
            evaluate(&fact, "EXECUTION", adapter, Some(&observations)),
            newer
        );
        assert_eq!(evaluate(&fact, "EXECUTION", adapter, None), old);
        assert_eq!(evaluate(&fact, "BROKER", adapter, Some(&observations)), old);
        assert_eq!(
            evaluate(&fact, "EXECUTION", "other", Some(&observations)),
            old
        );
        fact.entity_id = "manager.position:TEST_ONLY".to_owned();
        assert_eq!(
            evaluate(&fact, "EXECUTION", adapter, Some(&observations)),
            old
        );
        fact.entity_id = "manager.order:TEST_ONLY".to_owned();
        fact.entity_kind = ProjectionEntityKind::Fill;
        assert_eq!(
            evaluate(&fact, "EXECUTION", adapter, Some(&observations)),
            old
        );
        fact.entity_kind = ProjectionEntityKind::Order;
        fact.source_completeness = SourceCompleteness::Unknown;
        assert_eq!(
            evaluate(&fact, "EXECUTION", adapter, Some(&observations)),
            old
        );
        fact.source_completeness = SourceCompleteness::PollBounded;
        fact.source_read_at = newer + TimeDelta::seconds(1);
        assert_eq!(
            evaluate(&fact, "EXECUTION", adapter, Some(&observations)),
            old
        );
        fact.source_read_at = old;
        fact.entity_id = "relation.account_balances:TEST_ONLY".to_owned();
        fact.entity_kind = ProjectionEntityKind::Account;
        fact.fields = json!({"source_feed":"relation.account_balances"});
        fact.source_relation = "public.accounts".to_owned(); // wrong relation for this feed
        let relation_observations =
            BTreeMap::from([("relation.account_balances".to_owned(), observation)]);
        assert_eq!(
            evaluate(&fact, "EXECUTION", adapter, Some(&relation_observations)),
            old
        );
    }
}
