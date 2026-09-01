use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, SourceCompleteness};
use projection_core::{canonical_digest, ProjectionEntityKind, ProjectionScope};
use serde::{Deserialize, Serialize};
use sqlx::Row as _;
use uuid::Uuid;

use crate::{query::normalize_projection_payload, PgProjectionStore, StoreError};

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
               SELECT epoch_id FROM portal_projection.epochs
               WHERE workspace_id=$1 AND environment=$2 AND status='ACTIVE'
             ), cycle AS (
               SELECT c.epoch_id,c.profile_id,c.catalogue_digest,c.state_digest,
                      COALESCE(h.source_read_at,c.source_read_at) AS source_read_at
               FROM portal_projection.manager_projection_cycles c JOIN active a USING(epoch_id)
               LEFT JOIN portal_projection.manager_projection_heartbeats h USING(epoch_id)
               ORDER BY c.committed_at DESC,c.cycle_id DESC LIMIT 1
             ), binding AS (
               SELECT
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
             SELECT e.entity_id,e.entity_kind,e.as_of,e.source_read_at,e.source_completeness,e.payload,
                    c.epoch_id,c.profile_id,c.catalogue_digest,c.state_digest,
                    c.source_read_at AS cycle_source_read_at
             FROM cycle c
             LEFT JOIN binding b ON true
             LEFT JOIN LATERAL (
               SELECT candidate.entity_id,candidate.entity_kind,candidate.as_of,
                      candidate.source_read_at,candidate.source_completeness,candidate.payload
               FROM portal_projection.entities candidate
               WHERE candidate.epoch_id=c.epoch_id
                 AND COALESCE(candidate.payload->>'source_relation','') = ANY($5::text[])
                 AND CASE $3
                   WHEN 'DEPLOYMENT' THEN
                     COALESCE(candidate.payload#>>'{fields,deployment_id,value}',candidate.payload->>'deployment_id','')=$4
                     OR COALESCE(candidate.payload#>>'{fields,strategy_id,value}',candidate.payload->>'strategy_id','')=ANY(b.strategy_ids)
                     OR COALESCE(candidate.payload#>>'{fields,account_id,value}',candidate.payload->>'account_id','')=ANY(b.account_ids)
                   WHEN 'ALPHA' THEN COALESCE(candidate.payload#>>'{fields,strategy_id,value}',candidate.payload->>'strategy_id','')=$4
                   WHEN 'PORTFOLIO' THEN
                     COALESCE(candidate.payload#>>'{fields,portfolio_id,value}',candidate.payload->>'portfolio_id','')=$4
                     OR COALESCE(candidate.payload#>>'{fields,strategy_id,value}',candidate.payload->>'strategy_id','')=ANY(b.strategy_ids)
                     OR COALESCE(candidate.payload#>>'{fields,account_id,value}',candidate.payload->>'account_id','')=ANY(b.account_ids)
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
        let epoch_id: Uuid = first.try_get("epoch_id")?;
        let profile_id: String = first.try_get("profile_id")?;
        let catalogue_digest: String = first.try_get("catalogue_digest")?;
        let projection_state_digest: String = first.try_get("state_digest")?;
        let source_read_at: DateTime<Utc> = first.try_get("cycle_source_read_at")?;
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
            let payload = normalize_projection_payload(row.try_get("payload")?)?;
            let source_relation = payload
                .get("source_relation")
                .and_then(serde_json::Value::as_str)
                .filter(|relation| n25_relations().contains(relation))
                .ok_or(StoreError::InvalidAnalyticsSourcePayload)?
                .to_owned();
            let fact_as_of: DateTime<Utc> =
                match row.try_get::<Option<DateTime<Utc>>, _>("as_of")? {
                    Some(value) => value,
                    None => row.try_get("source_read_at")?,
                };
            as_of =
                Some(as_of.map_or(fact_as_of, |current: DateTime<Utc>| current.min(fact_as_of)));
            facts.push(ManagerAnalyticsFact {
                entity_id,
                entity_kind: parse_kind(&row.try_get::<String, _>("entity_kind")?)?,
                source_relation,
                as_of: fact_as_of,
                source_read_at: row.try_get("source_read_at")?,
                source_completeness: super::parse_completeness(
                    &row.try_get::<String, _>("source_completeness")?,
                )?,
                fields: payload,
            });
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
            fact_digest,
            fact_count: facts.len(),
            repository_query_count: N25_MANAGER_ANALYTICS_REPOSITORY_QUERIES,
            facts,
        })
    }
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
