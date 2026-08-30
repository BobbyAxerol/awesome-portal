use std::time::Duration;

use chrono::{DateTime, Utc};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use sqlx::Row as _;
use uuid::Uuid;

use crate::{PgProjectionStore, StoreError};

#[derive(Debug, Clone)]
pub struct SourceAdmissionRequest {
    pub source_id: String,
    pub profile_id: String,
    pub owner_id: String,
    pub maximum_requests_per_second: u16,
    pub maximum_concurrency: u16,
    pub maximum_wait: Duration,
    pub lease_ttl: Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceAdmissionDenyReason {
    ConcurrencyExhausted,
    RateBudgetExhausted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceAdmissionLease {
    pub lease_id: Uuid,
    pub owner_id: String,
    pub wait: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceAdmissionOutcome {
    Accepted(SourceAdmissionLease),
    Denied(SourceAdmissionDenyReason),
}

#[derive(Debug, Clone)]
pub struct SourceReadCacheWrite {
    pub source_id: String,
    pub profile_id: String,
    pub adapter_revision: String,
    pub operation_id: String,
    pub authority: String,
    pub freshness: String,
    pub completeness: String,
    pub as_of: DateTime<Utc>,
    pub response_body: Value,
    pub ttl: Duration,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SourceReadCacheEntry {
    pub etag: String,
    pub authority: String,
    pub freshness: String,
    pub completeness: String,
    pub as_of: DateTime<Utc>,
    pub response_body: Value,
    pub stored_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl PgProjectionStore {
    /// Atomically admits one source request against both the cell-wide source
    /// budget and its profile budget. `PostgreSQL` time and row locks are the
    /// authority across all Edge replicas.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the scope or bounds are invalid, or when
    /// the shared admission transaction cannot be completed atomically.
    #[allow(clippy::too_many_lines)] // One transaction is intentionally visible end-to-end.
    pub async fn acquire_source_admission(
        &self,
        request: &SourceAdmissionRequest,
    ) -> Result<SourceAdmissionOutcome, StoreError> {
        validate(request)?;
        let profile_scope = format!("{}:{}", request.source_id, request.profile_id);
        let mut transaction = self.pool.begin().await?;
        for (kind, key) in [
            ("SOURCE", request.source_id.as_str()),
            ("PROFILE", &profile_scope),
        ] {
            sqlx::query(
                "INSERT INTO portal_projection.source_admission_state
                   (scope_kind,scope_key,maximum_rps,maximum_concurrency,next_permit_at,updated_at)
                 VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp())
                 ON CONFLICT (scope_kind,scope_key) DO UPDATE SET
                   maximum_rps=EXCLUDED.maximum_rps,
                   maximum_concurrency=EXCLUDED.maximum_concurrency,
                   updated_at=clock_timestamp()",
            )
            .bind(kind)
            .bind(key)
            .bind(i32::from(request.maximum_requests_per_second))
            .bind(i32::from(request.maximum_concurrency))
            .execute(&mut *transaction)
            .await?;
        }
        let rows = sqlx::query(
            "SELECT scope_kind,scope_key,next_permit_at,clock_timestamp() AS database_now
             FROM portal_projection.source_admission_state
             WHERE (scope_kind='SOURCE' AND scope_key=$1)
                OR (scope_kind='PROFILE' AND scope_key=$2)
             ORDER BY scope_kind,scope_key FOR UPDATE",
        )
        .bind(&request.source_id)
        .bind(&profile_scope)
        .fetch_all(&mut *transaction)
        .await?;
        if rows.len() != 2 {
            return Err(StoreError::InvalidSourceAdmission);
        }
        sqlx::query(
            "DELETE FROM portal_projection.source_admission_leases
             WHERE expires_at <= clock_timestamp()",
        )
        .execute(&mut *transaction)
        .await?;
        let counts = sqlx::query(
            "SELECT
               count(*) FILTER (WHERE source_id=$1)::bigint AS source_count,
               count(*) FILTER (WHERE source_id=$1 AND profile_id=$2)::bigint AS profile_count
             FROM portal_projection.source_admission_leases",
        )
        .bind(&request.source_id)
        .bind(&request.profile_id)
        .fetch_one(&mut *transaction)
        .await?;
        let maximum_concurrency = i64::from(request.maximum_concurrency);
        if counts.try_get::<i64, _>("source_count")? >= maximum_concurrency
            || counts.try_get::<i64, _>("profile_count")? >= maximum_concurrency
        {
            transaction.commit().await?;
            return Ok(SourceAdmissionOutcome::Denied(
                SourceAdmissionDenyReason::ConcurrencyExhausted,
            ));
        }
        let database_now = rows[0].try_get::<DateTime<Utc>, _>("database_now")?;
        let scheduled_at = rows
            .iter()
            .map(|row| row.try_get::<DateTime<Utc>, _>("next_permit_at"))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .fold(database_now, std::cmp::max);
        let wait_ms = u64::try_from((scheduled_at - database_now).num_milliseconds().max(0))
            .map_err(|_| StoreError::InvalidSourceAdmission)?;
        let maximum_wait_ms = u64::try_from(request.maximum_wait.as_millis())
            .map_err(|_| StoreError::InvalidSourceAdmission)?;
        if wait_ms > maximum_wait_ms {
            transaction.commit().await?;
            return Ok(SourceAdmissionOutcome::Denied(
                SourceAdmissionDenyReason::RateBudgetExhausted,
            ));
        }
        let interval_ms = 1_000_u64.div_ceil(u64::from(request.maximum_requests_per_second));
        sqlx::query(
            "UPDATE portal_projection.source_admission_state
             SET next_permit_at=$3::timestamptz + ($4::bigint * interval '1 millisecond'),
                 updated_at=clock_timestamp()
             WHERE (scope_kind='SOURCE' AND scope_key=$1)
                OR (scope_kind='PROFILE' AND scope_key=$2)",
        )
        .bind(&request.source_id)
        .bind(&profile_scope)
        .bind(scheduled_at)
        .bind(i64::try_from(interval_ms).map_err(|_| StoreError::InvalidSourceAdmission)?)
        .execute(&mut *transaction)
        .await?;
        let lease_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.source_admission_leases
               (lease_id,source_id,profile_id,owner_id,acquired_at,expires_at)
             VALUES ($1,$2,$3,$4,clock_timestamp(),
                     clock_timestamp() + ($5::bigint * interval '1 millisecond'))",
        )
        .bind(lease_id)
        .bind(&request.source_id)
        .bind(&request.profile_id)
        .bind(&request.owner_id)
        .bind(
            i64::try_from(request.lease_ttl.as_millis())
                .map_err(|_| StoreError::InvalidSourceAdmission)?,
        )
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(SourceAdmissionOutcome::Accepted(SourceAdmissionLease {
            lease_id,
            owner_id: request.owner_id.clone(),
            wait: Duration::from_millis(wait_ms),
        }))
    }

    /// Releases one exact permit. A missing/expired permit is idempotent.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the shared lease cannot be released.
    pub async fn release_source_admission(
        &self,
        lease: &SourceAdmissionLease,
    ) -> Result<(), StoreError> {
        sqlx::query(
            "DELETE FROM portal_projection.source_admission_leases
             WHERE lease_id=$1 AND owner_id=$2",
        )
        .bind(lease.lease_id)
        .bind(&lease.owner_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Loads an unexpired cache value for one exact source/profile/revision/operation scope.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when the shared cache cannot be queried.
    pub async fn load_source_read_cache(
        &self,
        source_id: &str,
        profile_id: &str,
        adapter_revision: &str,
        operation_id: &str,
    ) -> Result<Option<SourceReadCacheEntry>, StoreError> {
        let row = sqlx::query(
            "SELECT etag,authority,freshness,completeness,as_of,response_body,stored_at,expires_at
             FROM portal_projection.source_read_cache
             WHERE source_id=$1 AND profile_id=$2 AND adapter_revision=$3 AND operation_id=$4
               AND expires_at > clock_timestamp()",
        )
        .bind(source_id)
        .bind(profile_id)
        .bind(adapter_revision)
        .bind(operation_id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            Ok(SourceReadCacheEntry {
                etag: row.try_get("etag")?,
                authority: row.try_get("authority")?,
                freshness: row.try_get("freshness")?,
                completeness: row.try_get("completeness")?,
                as_of: row.try_get("as_of")?,
                response_body: row.try_get("response_body")?,
                stored_at: row.try_get("stored_at")?,
                expires_at: row.try_get("expires_at")?,
            })
        })
        .transpose()
    }

    /// Stores one bounded response and its exact source provenance.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] for invalid bounds/provenance or when the cache
    /// write cannot be completed.
    pub async fn store_source_read_cache(
        &self,
        write: &SourceReadCacheWrite,
    ) -> Result<SourceReadCacheEntry, StoreError> {
        validate_cache_write(write)?;
        let serialized = serde_json::to_vec(&write.response_body)
            .map_err(|_| StoreError::InvalidSourceAdmission)?;
        if !(2..=1_048_576).contains(&serialized.len()) {
            return Err(StoreError::InvalidSourceAdmission);
        }
        let etag = format!("\"sha256-{}\"", hex::encode(Sha256::digest(&serialized)));
        let row = sqlx::query(
            "INSERT INTO portal_projection.source_read_cache
               (source_id,profile_id,adapter_revision,operation_id,etag,authority,
                freshness,completeness,as_of,response_body,response_bytes,stored_at,expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp(),
                     clock_timestamp() + ($12::bigint * interval '1 millisecond'))
             ON CONFLICT (source_id,profile_id,adapter_revision,operation_id) DO UPDATE SET
               etag=EXCLUDED.etag,authority=EXCLUDED.authority,
               freshness=EXCLUDED.freshness,completeness=EXCLUDED.completeness,
               as_of=EXCLUDED.as_of,response_body=EXCLUDED.response_body,
               response_bytes=EXCLUDED.response_bytes,stored_at=EXCLUDED.stored_at,
               expires_at=EXCLUDED.expires_at
             RETURNING etag,authority,freshness,completeness,as_of,response_body,stored_at,expires_at",
        )
        .bind(&write.source_id)
        .bind(&write.profile_id)
        .bind(&write.adapter_revision)
        .bind(&write.operation_id)
        .bind(&etag)
        .bind(&write.authority)
        .bind(&write.freshness)
        .bind(&write.completeness)
        .bind(write.as_of)
        .bind(&write.response_body)
        .bind(i32::try_from(serialized.len()).map_err(|_| StoreError::InvalidSourceAdmission)?)
        .bind(i64::try_from(write.ttl.as_millis()).map_err(|_| StoreError::InvalidSourceAdmission)?)
        .fetch_one(&self.pool)
        .await?;
        Ok(SourceReadCacheEntry {
            etag: row.try_get("etag")?,
            authority: row.try_get("authority")?,
            freshness: row.try_get("freshness")?,
            completeness: row.try_get("completeness")?,
            as_of: row.try_get("as_of")?,
            response_body: row.try_get("response_body")?,
            stored_at: row.try_get("stored_at")?,
            expires_at: row.try_get("expires_at")?,
        })
    }
}

fn validate(request: &SourceAdmissionRequest) -> Result<(), StoreError> {
    let source_valid = (2..=128).contains(&request.source_id.len())
        && request
            .source_id
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_lowercase())
        && request.source_id.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'-')
        });
    let profile_valid = (3..=128).contains(&request.profile_id.len())
        && request
            .profile_id
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_');
    let owner_valid = (1..=191).contains(&request.owner_id.len())
        && request
            .owner_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'));
    if !source_valid
        || !profile_valid
        || !owner_valid
        || !(1..=15).contains(&request.maximum_requests_per_second)
        || !(1..=64).contains(&request.maximum_concurrency)
        || request.maximum_wait > Duration::from_secs(5)
        || !(Duration::from_millis(500)..=Duration::from_secs(35)).contains(&request.lease_ttl)
    {
        return Err(StoreError::InvalidSourceAdmission);
    }
    Ok(())
}

fn validate_cache_write(write: &SourceReadCacheWrite) -> Result<(), StoreError> {
    let base = SourceAdmissionRequest {
        source_id: write.source_id.clone(),
        profile_id: write.profile_id.clone(),
        owner_id: "cache:validation".to_owned(),
        maximum_requests_per_second: 1,
        maximum_concurrency: 1,
        maximum_wait: Duration::ZERO,
        lease_ttl: Duration::from_millis(500),
    };
    validate(&base)?;
    let safe_id = |value: &str| {
        (1..=191).contains(&value.len())
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-')
            })
    };
    if !safe_id(&write.adapter_revision)
        || !safe_id(&write.operation_id)
        || write.authority.is_empty()
        || write.authority.len() > 128
        || !matches!(
            write.freshness.as_str(),
            "FRESH" | "DEGRADED" | "STALE" | "UNAVAILABLE" | "UNKNOWN"
        )
        || !matches!(
            write.completeness.as_str(),
            "COMPLETE" | "PARTIAL" | "UNKNOWN"
        )
        || !(Duration::from_millis(50)..=Duration::from_secs(5)).contains(&write.ttl)
        || !write.response_body.is_object()
    {
        return Err(StoreError::InvalidSourceAdmission);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(owner: &str) -> SourceAdmissionRequest {
        SourceAdmissionRequest {
            source_id: "n21-manager".to_owned(),
            profile_id: "PAPER_N21".to_owned(),
            owner_id: owner.to_owned(),
            maximum_requests_per_second: 15,
            maximum_concurrency: 1,
            maximum_wait: Duration::from_secs(1),
            lease_ttl: Duration::from_millis(500),
        }
    }

    async fn cleanup(store: &PgProjectionStore) {
        sqlx::query(
            "DELETE FROM portal_projection.source_admission_leases WHERE source_id='n21-manager'",
        )
        .execute(&store.pool)
        .await
        .unwrap();
        sqlx::query(
            "DELETE FROM portal_projection.source_admission_state
             WHERE scope_key='n21-manager' OR scope_key LIKE 'n21-manager:%'",
        )
        .execute(&store.pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn replicas_share_concurrency_rate_and_expiring_leases() {
        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let first_replica = PgProjectionStore::connect(&database_url).await.unwrap();
        first_replica.migrate().await.unwrap();
        cleanup(&first_replica).await;
        let second_replica = PgProjectionStore::connect(&database_url).await.unwrap();

        let SourceAdmissionOutcome::Accepted(first) = first_replica
            .acquire_source_admission(&request("edge:first"))
            .await
            .unwrap()
        else {
            panic!("first replica must receive the shared permit");
        };
        assert_eq!(
            second_replica
                .acquire_source_admission(&request("edge:second"))
                .await
                .unwrap(),
            SourceAdmissionOutcome::Denied(SourceAdmissionDenyReason::ConcurrencyExhausted)
        );
        first_replica
            .release_source_admission(&first)
            .await
            .unwrap();

        let SourceAdmissionOutcome::Accepted(second) = second_replica
            .acquire_source_admission(&request("edge:second"))
            .await
            .unwrap()
        else {
            panic!("released permit must be reusable");
        };
        assert!(second.wait <= Duration::from_secs(1));
        second_replica
            .release_source_admission(&second)
            .await
            .unwrap();

        let abandoned = first_replica
            .acquire_source_admission(&request("edge:abandoned"))
            .await
            .unwrap();
        assert!(matches!(abandoned, SourceAdmissionOutcome::Accepted(_)));
        tokio::time::sleep(Duration::from_millis(550)).await;
        let recovered = second_replica
            .acquire_source_admission(&request("edge:recovered"))
            .await
            .unwrap();
        let SourceAdmissionOutcome::Accepted(recovered) = recovered else {
            panic!("expired permit must recover without a source retry");
        };
        second_replica
            .release_source_admission(&recovered)
            .await
            .unwrap();
        cleanup(&first_replica).await;
    }

    #[test]
    fn invalid_scope_and_unsafe_budget_fail_before_postgres() {
        let mut invalid = request("edge:valid");
        invalid.source_id = "../source".to_owned();
        assert!(validate(&invalid).is_err());
        let mut unsafe_rate = request("edge:valid");
        unsafe_rate.maximum_requests_per_second = 16;
        assert!(validate(&unsafe_rate).is_err());
    }

    #[tokio::test]
    async fn source_cache_is_profile_revision_operation_bound_and_short_lived() {
        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let store = PgProjectionStore::connect(&database_url).await.unwrap();
        store.migrate().await.unwrap();
        sqlx::query("DELETE FROM portal_projection.source_read_cache WHERE source_id='n21-cache'")
            .execute(&store.pool)
            .await
            .unwrap();
        let write = SourceReadCacheWrite {
            source_id: "n21-cache".to_owned(),
            profile_id: "PAPER_N21".to_owned(),
            adapter_revision: "manager.runtime-v1".to_owned(),
            operation_id: "managerCatalog".to_owned(),
            authority: "EXECUTION_CELL".to_owned(),
            freshness: "FRESH".to_owned(),
            completeness: "COMPLETE".to_owned(),
            as_of: Utc::now(),
            response_body: serde_json::json!({"authority":"EXECUTION_CELL","data":{}}),
            ttl: Duration::from_millis(50),
        };
        let stored = store.store_source_read_cache(&write).await.unwrap();
        assert!(stored.etag.starts_with("\"sha256-"));
        assert_eq!(
            store
                .load_source_read_cache(
                    "n21-cache",
                    "PAPER_N21",
                    "manager.runtime-v1",
                    "managerCatalog",
                )
                .await
                .unwrap()
                .unwrap()
                .response_body,
            write.response_body,
        );
        assert!(store
            .load_source_read_cache(
                "n21-cache",
                "PAPER_OTHER",
                "manager.runtime-v1",
                "managerCatalog",
            )
            .await
            .unwrap()
            .is_none());
        tokio::time::sleep(Duration::from_millis(70)).await;
        assert!(store
            .load_source_read_cache(
                "n21-cache",
                "PAPER_N21",
                "manager.runtime-v1",
                "managerCatalog",
            )
            .await
            .unwrap()
            .is_none());
        sqlx::query("DELETE FROM portal_projection.source_read_cache WHERE source_id='n21-cache'")
            .execute(&store.pool)
            .await
            .unwrap();
    }
}
