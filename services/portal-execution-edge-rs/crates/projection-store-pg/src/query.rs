use chrono::{DateTime, Utc};
use execution_contracts::{DecimalString, SourceAuthority};
use projection_core::{ProjectionEntityKind, ProjectionScope};
use query_api::{
    select_series_interval, CurrencyAggregate, CursorBoundary, CursorCodec, CursorContext,
    CursorDirection, CursorScalar, EntityQueryRequest, ExactSeries, ExactSeriesPoint, FilterField,
    FilterOperator, ProjectionPageRetention, ProjectionQueryPage, ProjectionQueryRow,
    QueryAllowlist, QueryFilter, QuerySort, RetentionAvailability, RetentionDecision,
    RetentionPolicy, SeriesIntent, SortDirection, SortField, QUERY_SCHEMA_VERSION,
};
use sqlx::{Postgres, QueryBuilder, Row as _};
use uuid::Uuid;

use super::{authority_str, parse_authority, required_u64, PgProjectionStore, StoreError};

const EXACT_DECIMAL_PATTERN: &str = "^[+-]?[0-9]+([.][0-9]+)?$";

#[derive(Debug, Clone)]
pub struct RetentionPolicySnapshot {
    pub retention_policy_id: Uuid,
    pub series_key: String,
    pub metric: String,
    pub policy: RetentionPolicy,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct SeriesPointWrite {
    pub series_key: String,
    pub metric: String,
    pub interval_seconds: u32,
    pub bucket_at: DateTime<Utc>,
    pub currency: Option<String>,
    pub value: DecimalString,
    pub minimum: DecimalString,
    pub maximum: DecimalString,
    pub sample_count: u64,
    pub source_authority: SourceAuthority,
    pub as_of: DateTime<Utc>,
    pub projection_sequence: u64,
    pub adapter_version: String,
    pub capability_snapshot_id: String,
}

impl PgProjectionStore {
    /// Executes a stable, bidirectional, projection-epoch-bound keyset query.
    /// Counts and currency aggregates are computed over the full filtered set
    /// in the same repeatable-read transaction as the page.
    ///
    /// # Errors
    ///
    /// Rejects non-allowlisted queries before dynamic SQL construction and
    /// returns typed cursor/database/precision failures.
    #[allow(clippy::too_many_lines)] // query snapshot intentionally owns count, aggregate and page
    pub async fn query_entities(
        &self,
        scope: &ProjectionScope,
        kind: ProjectionEntityKind,
        request: &EntityQueryRequest,
        cursor_codec: &CursorCodec,
        now: DateTime<Utc>,
    ) -> Result<ProjectionQueryPage, StoreError> {
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
        let resource = format!("projection:{}", kind.as_str());
        let unbound_context = CursorContext {
            workspace_id: scope.workspace_id.as_str(),
            environment: &scope.environment,
            epoch_id,
            resource: &resource,
            query_fingerprint: "",
        };
        let validated = request.validate(
            &QueryAllowlist::projection_entities(),
            cursor_codec,
            &unbound_context,
            now,
        )?;

        let total_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM portal_projection.entities
             WHERE epoch_id = $1 AND entity_kind = $2",
        )
        .bind(epoch_id)
        .bind(kind.as_str())
        .fetch_one(&mut *transaction)
        .await?;

        let mut count_query = QueryBuilder::<Postgres>::new(
            "SELECT COUNT(*) FROM portal_projection.entities WHERE epoch_id = ",
        );
        count_query
            .push_bind(epoch_id)
            .push(" AND entity_kind = ")
            .push_bind(kind.as_str());
        push_filters(&mut count_query, &validated.filters)?;
        let filtered_count: i64 = count_query
            .build_query_scalar()
            .fetch_one(&mut *transaction)
            .await?;

        let aggregates =
            query_aggregates(&mut transaction, epoch_id, kind, &validated.filters).await?;

        let mut page_query = QueryBuilder::<Postgres>::new(
            "SELECT entity_id, projection_sequence, source_authority, \
             COALESCE(as_of, source_read_at) AS effective_as_of, source_read_at, projected_at, \
             adapter_version, capability_snapshot_id, payload \
             FROM portal_projection.entities WHERE epoch_id = ",
        );
        page_query
            .push_bind(epoch_id)
            .push(" AND entity_kind = ")
            .push_bind(kind.as_str());
        push_filters(&mut page_query, &validated.filters)?;
        if let Some(boundary) = &validated.boundary {
            page_query.push(" AND (");
            push_boundary(
                &mut page_query,
                &validated.sorts,
                boundary,
                validated.direction,
            )?;
            page_query.push(")");
        }
        push_order(&mut page_query, &validated.sorts, validated.direction);
        page_query
            .push(" LIMIT ")
            .push_bind(i64::from(validated.limit) + 1);
        let page_rows = page_query.build().fetch_all(&mut *transaction).await?;
        transaction.commit().await?;

        let mut rows = page_rows
            .iter()
            .map(row_from_pg)
            .collect::<Result<Vec<_>, _>>()?;
        let had_extra = rows.len() > usize::from(validated.limit);
        if had_extra {
            rows.pop();
        }
        if validated.direction == CursorDirection::Before {
            rows.reverse();
        }
        let (has_more, has_previous) = match validated.direction {
            CursorDirection::After => (had_extra, validated.boundary.is_some()),
            CursorDirection::Before => (validated.boundary.is_some(), had_extra),
        };
        let bound_context = CursorContext {
            query_fingerprint: &validated.fingerprint,
            ..unbound_context
        };
        let next_cursor = if has_more {
            if let Some(row) = rows.last() {
                Some(cursor_codec.encode(
                    &bound_context,
                    CursorDirection::After,
                    boundary_from_row(row, &validated.sorts)?,
                    now,
                )?)
            } else {
                None
            }
        } else {
            None
        };
        let prev_cursor = if has_previous {
            if let Some(row) = rows.first() {
                Some(cursor_codec.encode(
                    &bound_context,
                    CursorDirection::Before,
                    boundary_from_row(row, &validated.sorts)?,
                    now,
                )?)
            } else {
                None
            }
        } else {
            None
        };
        Ok(ProjectionQueryPage {
            schema_version: QUERY_SCHEMA_VERSION.to_owned(),
            epoch_id,
            total_count: required_u64(total_count)?,
            filtered_count: required_u64(filtered_count)?,
            rows,
            next_cursor,
            prev_cursor,
            has_more,
            has_previous,
            applied_filters: validated.filters,
            applied_sort: validated.sorts,
            aggregates_by_currency: aggregates,
            // Order/fill/entity retention has no source policy plus requested
            // range yet. Do not let an empty page masquerade as an empty hot
            // result until that authority is published.
            retention: ProjectionPageRetention {
                availability: RetentionAvailability::Unknown,
                policy_version: "UNCONFIGURED".to_owned(),
            },
        })
    }

    /// Appends an immutable, versioned retention-policy snapshot.
    ///
    /// # Errors
    ///
    /// Rejects malformed policies and version reuse through repository and
    /// database constraints.
    pub async fn record_retention_policy(
        &self,
        scope: &ProjectionScope,
        snapshot: &RetentionPolicySnapshot,
    ) -> Result<(), StoreError> {
        snapshot
            .policy
            .evaluate(snapshot.policy.hot_from, snapshot.policy.hot_from)?;
        validate_name(&snapshot.series_key)?;
        validate_name(&snapshot.metric)?;
        sqlx::query(
            "INSERT INTO portal_projection.retention_policy_snapshots
             (retention_policy_id, workspace_id, environment, series_key, metric,
              policy_version, hot_from, cold_requestable_from, purged_before,
              access_request_path, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(snapshot.retention_policy_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(&snapshot.series_key)
        .bind(&snapshot.metric)
        .bind(&snapshot.policy.policy_version)
        .bind(snapshot.policy.hot_from)
        .bind(snapshot.policy.cold_requestable_from)
        .bind(snapshot.policy.purged_before)
        .bind(&snapshot.policy.access_request_path)
        .bind(snapshot.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Upserts one canonical, exact-decimal pre-aggregated series bucket into a
    /// BUILDING or ACTIVE projection epoch.
    ///
    /// # Errors
    ///
    /// Rejects invalid scope, vocabulary, interval or precision constraints.
    pub async fn write_series_point(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        point: &SeriesPointWrite,
    ) -> Result<(), StoreError> {
        validate_name(&point.series_key)?;
        validate_name(&point.metric)?;
        let sample_count =
            i64::try_from(point.sample_count).map_err(|_| StoreError::NumericOverflow)?;
        let projection_sequence =
            i64::try_from(point.projection_sequence).map_err(|_| StoreError::NumericOverflow)?;
        let result = sqlx::query(
            "INSERT INTO portal_projection.series_points
             (epoch_id, series_key, metric, interval_seconds, bucket_at, currency,
              value, minimum, maximum, sample_count, source_authority, as_of,
              projection_sequence, adapter_version, capability_snapshot_id)
             SELECT e.epoch_id,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11::numeric,
                    $12,$13,$14,$15,$16,$17
             FROM portal_projection.epochs e
             WHERE e.epoch_id=$1 AND e.workspace_id=$2 AND e.environment=$3
               AND e.status IN ('BUILDING','ACTIVE')
             ON CONFLICT (epoch_id, series_key, metric, interval_seconds, bucket_at, currency)
             DO UPDATE SET value=EXCLUDED.value, minimum=EXCLUDED.minimum,
                maximum=EXCLUDED.maximum, sample_count=EXCLUDED.sample_count,
                source_authority=EXCLUDED.source_authority, as_of=EXCLUDED.as_of,
                projection_sequence=EXCLUDED.projection_sequence,
                adapter_version=EXCLUDED.adapter_version,
                capability_snapshot_id=EXCLUDED.capability_snapshot_id
             WHERE portal_projection.series_points.projection_sequence
                   <= EXCLUDED.projection_sequence",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(&point.series_key)
        .bind(&point.metric)
        .bind(i32::try_from(point.interval_seconds).map_err(|_| StoreError::NumericOverflow)?)
        .bind(point.bucket_at)
        .bind(&point.currency)
        .bind(point.value.to_string())
        .bind(point.minimum.to_string())
        .bind(point.maximum.to_string())
        .bind(sample_count)
        .bind(authority_str(point.source_authority))
        .bind(point.as_of)
        .bind(projection_sequence)
        .bind(&point.adapter_version)
        .bind(&point.capability_snapshot_id)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            let epoch_matches: bool = sqlx::query_scalar(
                "SELECT EXISTS(
                   SELECT 1 FROM portal_projection.epochs
                   WHERE epoch_id=$1 AND workspace_id=$2 AND environment=$3
                     AND status IN ('BUILDING','ACTIVE'))",
            )
            .bind(epoch_id)
            .bind(scope.workspace_id.as_str())
            .bind(&scope.environment)
            .fetch_one(&self.pool)
            .await?;
            if !epoch_matches {
                return Err(StoreError::ScopeMismatch);
            }
        }
        Ok(())
    }

    /// Queries an adaptive canonical-rung series and returns typed hot/cold
    /// coverage. Cold, purged and unknown history never masquerades as an
    /// ordinary empty hot result.
    ///
    /// # Errors
    ///
    /// Returns typed range, retention, precision, vocabulary and database
    /// failures.
    #[allow(clippy::too_many_arguments, clippy::too_many_lines)] // one snapshot owns retention and rows
    pub async fn query_series(
        &self,
        scope: &ProjectionScope,
        series_key: &str,
        metric: &str,
        currency: Option<&str>,
        requested_from: DateTime<Utc>,
        requested_to: DateTime<Utc>,
        intent: SeriesIntent,
    ) -> Result<ExactSeries, StoreError> {
        validate_name(series_key)?;
        validate_name(metric)?;
        let selection = select_series_interval(requested_from, requested_to, intent)?;
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
        let policy_row = sqlx::query(
            "SELECT policy_version, hot_from, cold_requestable_from, purged_before,
                    access_request_path
             FROM portal_projection.retention_policy_snapshots
             WHERE workspace_id=$1 AND environment=$2 AND series_key=$3 AND metric=$4
             ORDER BY created_at DESC, retention_policy_id DESC LIMIT 1",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(series_key)
        .bind(metric)
        .fetch_optional(&mut *transaction)
        .await?;
        let retention = if let Some(row) = policy_row {
            RetentionPolicy {
                policy_version: row.try_get("policy_version")?,
                hot_from: row.try_get("hot_from")?,
                cold_requestable_from: row.try_get("cold_requestable_from")?,
                purged_before: row.try_get("purged_before")?,
                access_request_path: row.try_get("access_request_path")?,
            }
            .evaluate(requested_from, requested_to)?
        } else {
            RetentionDecision {
                availability: RetentionAvailability::Unknown,
                requested_from,
                requested_to,
                hot_from: requested_to,
                policy_version: "UNCONFIGURED".to_owned(),
                access_request_path: None,
            }
        };
        if matches!(
            retention.availability,
            RetentionAvailability::ColdRequestable
                | RetentionAvailability::Purged
                | RetentionAvailability::Unknown
        ) {
            transaction.commit().await?;
            return Ok(empty_series(
                epoch_id,
                series_key,
                metric,
                currency,
                selection.interval_seconds,
                retention,
            ));
        }
        let hot_from = requested_from.max(retention.hot_from);
        let rows = sqlx::query(
            "SELECT bucket_at, value::text AS value, minimum::text AS minimum,
                    maximum::text AS maximum, sample_count, source_authority, as_of
             FROM portal_projection.series_points
             WHERE epoch_id=$1 AND series_key=$2 AND metric=$3 AND interval_seconds=$4
               AND currency IS NOT DISTINCT FROM $5 AND bucket_at >= $6 AND bucket_at <= $7
             ORDER BY bucket_at ASC
             LIMIT 5001",
        )
        .bind(epoch_id)
        .bind(series_key)
        .bind(metric)
        .bind(i32::try_from(selection.interval_seconds).map_err(|_| StoreError::NumericOverflow)?)
        .bind(currency)
        .bind(hot_from)
        .bind(requested_to)
        .fetch_all(&mut *transaction)
        .await?;
        transaction.commit().await?;
        if rows.len() > usize::try_from(selection.max_points).unwrap_or(usize::MAX) {
            return Err(query_api::QueryError::SeriesRangeTooWide.into());
        }
        let mut authority = None;
        let mut as_of = None;
        let mut source_rows = 0_u64;
        let mut points = Vec::with_capacity(rows.len());
        for row in rows {
            let row_authority = parse_authority(&row.try_get::<String, _>("source_authority")?)?;
            if authority.is_some_and(|existing| existing != row_authority) {
                return Err(StoreError::PersistedVocabulary);
            }
            authority = Some(row_authority);
            let row_as_of: DateTime<Utc> = row.try_get("as_of")?;
            as_of =
                Some(as_of.map_or(row_as_of, |existing: DateTime<Utc>| existing.max(row_as_of)));
            let sample_count = required_u64(row.try_get("sample_count")?)?;
            source_rows = source_rows
                .checked_add(sample_count)
                .ok_or(StoreError::NumericOverflow)?;
            points.push(ExactSeriesPoint {
                bucket_at: row.try_get("bucket_at")?,
                value: DecimalString::parse(&row.try_get::<String, _>("value")?)?,
                minimum: DecimalString::parse(&row.try_get::<String, _>("minimum")?)?,
                maximum: DecimalString::parse(&row.try_get::<String, _>("maximum")?)?,
                sample_count,
            });
        }
        Ok(ExactSeries {
            schema_version: QUERY_SCHEMA_VERSION.to_owned(),
            epoch_id,
            series_key: series_key.to_owned(),
            metric: metric.to_owned(),
            currency: currency.map(str::to_owned),
            interval_seconds: selection.interval_seconds,
            source_rows,
            returned_rows: u64::try_from(points.len()).map_err(|_| StoreError::NumericOverflow)?,
            downsample_method: if selection.interval_seconds == 60 {
                "none"
            } else {
                "canonical_preaggregated"
            }
            .to_owned(),
            authority,
            as_of,
            retention,
            points,
        })
    }
}

pub(super) async fn active_epoch(
    transaction: &mut sqlx::Transaction<'_, Postgres>,
    workspace_id: &str,
    environment: &str,
) -> Result<Uuid, StoreError> {
    sqlx::query_scalar(
        "SELECT epoch_id FROM portal_projection.epochs
         WHERE workspace_id=$1 AND environment=$2 AND status='ACTIVE'",
    )
    .bind(workspace_id)
    .bind(environment)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(StoreError::EpochNotFound)
}

fn validate_name(value: &str) -> Result<(), StoreError> {
    if value.is_empty() || value.trim() != value || value.len() > 160 {
        return Err(query_api::QueryError::InvalidQuery.into());
    }
    Ok(())
}

fn filter_expression(field: FilterField) -> &'static str {
    match field {
        FilterField::Status => "COALESCE(payload->>'status','')",
        FilterField::Currency => "COALESCE(payload->>'currency','')",
        FilterField::InstrumentId => "COALESCE(payload->>'instrument_id','')",
        FilterField::AccountId => "COALESCE(payload->>'account_id','')",
        FilterField::PortfolioId => "COALESCE(payload->>'portfolio_id','')",
        FilterField::StrategyId => "COALESCE(payload->>'strategy_id','')",
        FilterField::SourceAuthority => "source_authority",
        FilterField::AsOf => "COALESCE(as_of, source_read_at)",
    }
}

fn push_filters<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    filters: &'args [QueryFilter],
) -> Result<(), StoreError> {
    for filter in filters {
        query.push(" AND ").push(filter_expression(filter.field));
        match (filter.field, filter.operator) {
            (FilterField::AsOf, FilterOperator::Gte | FilterOperator::Lte) => {
                let value = DateTime::parse_from_rfc3339(&filter.values[0])
                    .map_err(|_| query_api::QueryError::InvalidFilter)?
                    .with_timezone(&Utc);
                query
                    .push(if filter.operator == FilterOperator::Gte {
                        " >= "
                    } else {
                        " <= "
                    })
                    .push_bind(value);
            }
            (_, FilterOperator::Eq) => {
                query.push(" = ").push_bind(filter.values[0].clone());
            }
            (_, FilterOperator::In) => {
                query
                    .push(" = ANY(")
                    .push_bind(filter.values.clone())
                    .push(")");
            }
            (_, FilterOperator::Contains) => {
                let escaped = filter.values[0]
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_");
                query
                    .push(" ILIKE ")
                    .push_bind(format!("%{escaped}%"))
                    .push(" ESCAPE '\\'");
            }
            _ => return Err(query_api::QueryError::FilterNotAllowed.into()),
        }
    }
    Ok(())
}

const fn sort_expression(field: SortField) -> &'static str {
    match field {
        SortField::AsOf => "COALESCE(as_of, source_read_at)",
        SortField::ProjectionSequence => "projection_sequence",
        SortField::Status => "COALESCE(payload->>'status','')",
        SortField::Currency => "COALESCE(payload->>'currency','')",
    }
}

fn push_boundary<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    sorts: &[QuerySort],
    boundary: &'args CursorBoundary,
    cursor_direction: CursorDirection,
) -> Result<(), StoreError> {
    for component in 0..=sorts.len() {
        if component > 0 {
            query.push(" OR ");
        }
        query.push("(");
        for previous in 0..component {
            if previous > 0 {
                query.push(" AND ");
            }
            push_sort_equality(query, sorts, boundary, previous)?;
        }
        if component > 0 {
            query.push(" AND ");
        }
        if component == sorts.len() {
            query.push("entity_id");
            push_comparator(query, SortDirection::Asc, cursor_direction);
            query.push_bind(boundary.entity_id.clone());
        } else {
            query.push(sort_expression(sorts[component].field));
            push_comparator(query, sorts[component].direction, cursor_direction);
            push_scalar(
                query,
                sorts[component].field,
                &boundary.sort_values[component],
            )?;
        }
        query.push(")");
    }
    Ok(())
}

fn push_sort_equality<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    sorts: &[QuerySort],
    boundary: &'args CursorBoundary,
    index: usize,
) -> Result<(), StoreError> {
    query.push(sort_expression(sorts[index].field)).push(" = ");
    push_scalar(query, sorts[index].field, &boundary.sort_values[index])
}

fn push_scalar<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    field: SortField,
    scalar: &'args CursorScalar,
) -> Result<(), StoreError> {
    match (field, scalar) {
        (SortField::AsOf, CursorScalar::Timestamp(value)) => {
            query.push_bind(*value);
        }
        (SortField::ProjectionSequence, CursorScalar::Integer(value)) => {
            query.push_bind(*value);
        }
        (SortField::Status | SortField::Currency, CursorScalar::Text(value)) => {
            query.push_bind(value.clone());
        }
        _ => return Err(query_api::QueryError::CursorContextMismatch.into()),
    }
    Ok(())
}

fn push_comparator(
    query: &mut QueryBuilder<'_, Postgres>,
    sort_direction: SortDirection,
    cursor_direction: CursorDirection,
) {
    let greater = matches!(
        (sort_direction, cursor_direction),
        (SortDirection::Asc, CursorDirection::After)
            | (SortDirection::Desc, CursorDirection::Before)
    );
    query.push(if greater { " > " } else { " < " });
}

fn push_order(
    query: &mut QueryBuilder<'_, Postgres>,
    sorts: &[QuerySort],
    cursor_direction: CursorDirection,
) {
    query.push(" ORDER BY ");
    for (index, sort) in sorts.iter().enumerate() {
        if index > 0 {
            query.push(", ");
        }
        let direction = if cursor_direction == CursorDirection::Before {
            sort.direction.reversed()
        } else {
            sort.direction
        };
        query
            .push(sort_expression(sort.field))
            .push(if direction == SortDirection::Asc {
                " ASC"
            } else {
                " DESC"
            });
    }
    let entity_direction = if cursor_direction == CursorDirection::Before {
        " DESC"
    } else {
        " ASC"
    };
    query.push(", entity_id").push(entity_direction);
}

fn row_from_pg(row: &sqlx::postgres::PgRow) -> Result<ProjectionQueryRow, StoreError> {
    Ok(ProjectionQueryRow {
        entity_id: row.try_get("entity_id")?,
        projection_sequence: required_u64(row.try_get("projection_sequence")?)?,
        source_authority: parse_authority(&row.try_get::<String, _>("source_authority")?)?,
        as_of: row.try_get("effective_as_of")?,
        source_read_at: row.try_get("source_read_at")?,
        projected_at: row.try_get("projected_at")?,
        adapter_version: row.try_get("adapter_version")?,
        capability_snapshot_id: row.try_get("capability_snapshot_id")?,
        payload: row.try_get("payload")?,
    })
}

fn boundary_from_row(
    row: &ProjectionQueryRow,
    sorts: &[QuerySort],
) -> Result<CursorBoundary, StoreError> {
    let sort_values = sorts
        .iter()
        .map(|sort| match sort.field {
            SortField::AsOf => Ok(CursorScalar::Timestamp(row.as_of)),
            SortField::ProjectionSequence => i64::try_from(row.projection_sequence)
                .map(CursorScalar::Integer)
                .map_err(|_| StoreError::NumericOverflow),
            SortField::Status => Ok(CursorScalar::Text(
                row.payload
                    .get("status")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
            )),
            SortField::Currency => Ok(CursorScalar::Text(
                row.payload
                    .get("currency")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
            )),
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(CursorBoundary {
        sort_values,
        entity_id: row.entity_id.clone(),
    })
}

async fn query_aggregates(
    transaction: &mut sqlx::Transaction<'_, Postgres>,
    epoch_id: Uuid,
    kind: ProjectionEntityKind,
    filters: &[QueryFilter],
) -> Result<Vec<CurrencyAggregate>, StoreError> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT NULLIF(payload->>'currency','') AS currency, COUNT(*) AS row_count, \
         COUNT(*) FILTER (WHERE COALESCE(payload->>'quantity','') ~ ",
    );
    query
        .push_bind(EXACT_DECIMAL_PATTERN)
        .push(") AS quantity_count, COALESCE(SUM(CASE WHEN COALESCE(payload->>'quantity','') ~ ")
        .push_bind(EXACT_DECIMAL_PATTERN)
        .push(
            " THEN (payload->>'quantity')::numeric ELSE 0 END),0)::text AS quantity, \
               COUNT(*) FILTER (WHERE COALESCE(payload->>'notional','') ~ ",
        )
        .push_bind(EXACT_DECIMAL_PATTERN)
        .push(") AS notional_count, COALESCE(SUM(CASE WHEN COALESCE(payload->>'notional','') ~ ")
        .push_bind(EXACT_DECIMAL_PATTERN)
        .push(
            " THEN (payload->>'notional')::numeric ELSE 0 END),0)::text AS notional, \
               COUNT(*) FILTER (WHERE \
                 (payload ? 'quantity' AND NOT COALESCE(payload->>'quantity','') ~ ",
        )
        .push_bind(EXACT_DECIMAL_PATTERN)
        .push(") OR (payload ? 'notional' AND NOT COALESCE(payload->>'notional','') ~ ")
        .push_bind(EXACT_DECIMAL_PATTERN)
        .push(
            ") ) AS invalid_numeric_count \
               FROM portal_projection.entities WHERE epoch_id = ",
        )
        .push_bind(epoch_id)
        .push(" AND entity_kind = ")
        .push_bind(kind.as_str());
    push_filters(&mut query, filters)?;
    query.push(" GROUP BY NULLIF(payload->>'currency','') ORDER BY currency NULLS FIRST");
    query
        .build()
        .fetch_all(&mut **transaction)
        .await?
        .into_iter()
        .map(|row| {
            Ok(CurrencyAggregate {
                currency: row.try_get("currency")?,
                row_count: required_u64(row.try_get("row_count")?)?,
                quantity_count: required_u64(row.try_get("quantity_count")?)?,
                quantity: DecimalString::parse(&row.try_get::<String, _>("quantity")?)?,
                notional_count: required_u64(row.try_get("notional_count")?)?,
                notional: DecimalString::parse(&row.try_get::<String, _>("notional")?)?,
                invalid_numeric_count: required_u64(row.try_get("invalid_numeric_count")?)?,
            })
        })
        .collect()
}

fn empty_series(
    epoch_id: Uuid,
    series_key: &str,
    metric: &str,
    currency: Option<&str>,
    interval_seconds: u32,
    retention: RetentionDecision,
) -> ExactSeries {
    ExactSeries {
        schema_version: QUERY_SCHEMA_VERSION.to_owned(),
        epoch_id,
        series_key: series_key.to_owned(),
        metric: metric.to_owned(),
        currency: currency.map(str::to_owned),
        interval_seconds,
        source_rows: 0,
        returned_rows: 0,
        downsample_method: "not_applicable".to_owned(),
        authority: None,
        as_of: None,
        retention,
        points: Vec::new(),
    }
}
