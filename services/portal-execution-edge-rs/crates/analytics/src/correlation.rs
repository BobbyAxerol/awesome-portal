use std::collections::{BTreeMap, BTreeSet};

use execution_contracts::{CanonicalId, DecimalString, PanelState};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::types::{
    warning, AnalyticsError, DerivedAnalytics, FactQuality, QualitySummary,
    MAX_CORRELATION_DIMENSION, MAX_CORRELATION_ENTITIES, MAX_RANKED_CORRELATION_PAIRS,
};

const FORMULA_VERSION: &str = "portfolio-correlation.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorrelationLabel {
    pub entity_id: CanonicalId,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorrelationPair {
    pub left_id: CanonicalId,
    pub right_id: CanonicalId,
    pub coefficient: DecimalString,
    pub sample_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorrelationCluster {
    pub cluster_id: CanonicalId,
    pub label: String,
    pub members: Vec<CanonicalId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorrelationInput {
    pub portfolio_id: CanonicalId,
    pub labels: Vec<CorrelationLabel>,
    pub pairs: Vec<CorrelationPair>,
    pub clusters: Vec<CorrelationCluster>,
    pub quality: FactQuality,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrianglePacking {
    LowerIncludingDiagonalRowMajor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackedTriangle {
    pub dimension: usize,
    pub packing: TrianglePacking,
    pub values: Vec<DecimalString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CorrelationRepresentation {
    PackedMatrix { matrix: PackedTriangle },
    RankedPairs { pairs: Vec<CorrelationPair> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorrelationResult {
    pub portfolio_id: CanonicalId,
    pub labels: Vec<CorrelationLabel>,
    pub clusters: Vec<CorrelationCluster>,
    pub representation: CorrelationRepresentation,
}

/// Selects a bounded correlation representation and validates every pair exactly.
///
/// Up to 150 entities use a packed lower triangle including the diagonal. Larger
/// sets use at most 500 ranked pairs and never produce a square JSON matrix.
///
/// # Errors
///
/// Rejects unbounded entity/pair counts, duplicate or unknown IDs, incomplete small
/// matrices, self-pairs, invalid coefficients, and malformed clusters.
pub fn build_correlation(
    input: &CorrelationInput,
) -> Result<DerivedAnalytics<CorrelationResult>, AnalyticsError> {
    if input.labels.len() > MAX_CORRELATION_ENTITIES {
        return Err(AnalyticsError::CorrelationEntityLimit {
            actual: input.labels.len(),
            maximum: MAX_CORRELATION_ENTITIES,
        });
    }
    let indexes = label_indexes(&input.labels)?;
    validate_clusters(&input.clusters, &indexes)?;
    let representation = if input.labels.len() <= MAX_CORRELATION_DIMENSION {
        packed_representation(input, &indexes)?
    } else {
        ranked_representation(input, &indexes)?
    };

    let quality = QualitySummary::one(&input.quality);
    let insufficient = input.labels.len() < 2 || input.pairs.is_empty();
    let warnings = insufficient
        .then(|| {
            warning(
                "CORRELATION_INSUFFICIENT_DATA",
                "At least two entities and one observed pair are required",
            )
        })
        .into_iter()
        .collect();
    Ok(DerivedAnalytics::new(
        FORMULA_VERSION,
        &quality,
        if insufficient {
            PanelState::InsufficientData
        } else {
            PanelState::Ok
        },
        warnings,
        CorrelationResult {
            portfolio_id: input.portfolio_id.clone(),
            labels: input.labels.clone(),
            clusters: input.clusters.clone(),
            representation,
        },
    ))
}

fn label_indexes(labels: &[CorrelationLabel]) -> Result<BTreeMap<&str, usize>, AnalyticsError> {
    let mut indexes = BTreeMap::new();
    for (index, label) in labels.iter().enumerate() {
        if indexes.insert(label.entity_id.as_str(), index).is_some() {
            return Err(AnalyticsError::DuplicateIdentifier(
                label.entity_id.as_str().to_owned(),
            ));
        }
    }
    Ok(indexes)
}

fn validate_clusters(
    clusters: &[CorrelationCluster],
    indexes: &BTreeMap<&str, usize>,
) -> Result<(), AnalyticsError> {
    if clusters.len() > MAX_CORRELATION_ENTITIES {
        return Err(AnalyticsError::BatchLimit {
            actual: clusters.len(),
            maximum: MAX_CORRELATION_ENTITIES,
        });
    }
    let mut cluster_ids = BTreeSet::new();
    for cluster in clusters {
        if !cluster_ids.insert(cluster.cluster_id.as_str()) {
            return Err(AnalyticsError::DuplicateIdentifier(
                cluster.cluster_id.as_str().to_owned(),
            ));
        }
        let mut members = BTreeSet::new();
        for member in &cluster.members {
            if !indexes.contains_key(member.as_str()) {
                return Err(AnalyticsError::UnknownCorrelationEntity(
                    member.as_str().to_owned(),
                ));
            }
            if !members.insert(member.as_str()) {
                return Err(AnalyticsError::DuplicateIdentifier(
                    member.as_str().to_owned(),
                ));
            }
        }
    }
    Ok(())
}

fn packed_representation(
    input: &CorrelationInput,
    indexes: &BTreeMap<&str, usize>,
) -> Result<CorrelationRepresentation, AnalyticsError> {
    let dimension = input.labels.len();
    let expected = dimension.saturating_mul(dimension.saturating_sub(1)) / 2;
    if input.pairs.len() != expected {
        return Err(AnalyticsError::CorrelationPairCount {
            actual: input.pairs.len(),
            expected,
        });
    }
    let mut pairs = BTreeMap::new();
    for pair in &input.pairs {
        let key = validate_pair(pair, indexes)?;
        if pairs.insert(key, pair.coefficient).is_some() {
            return Err(AnalyticsError::DuplicateIdentifier(format!(
                "correlation:{}:{}",
                pair.left_id.as_str(),
                pair.right_id.as_str()
            )));
        }
    }

    let mut values = Vec::with_capacity(dimension * (dimension + 1) / 2);
    for row in 0..dimension {
        for column in 0..=row {
            if row == column {
                values.push(DecimalString::from_decimal(Decimal::ONE));
            } else {
                values.push(*pairs.get(&(column, row)).ok_or(
                    AnalyticsError::CorrelationPairCount {
                        actual: pairs.len(),
                        expected,
                    },
                )?);
            }
        }
    }
    Ok(CorrelationRepresentation::PackedMatrix {
        matrix: PackedTriangle {
            dimension,
            packing: TrianglePacking::LowerIncludingDiagonalRowMajor,
            values,
        },
    })
}

fn ranked_representation(
    input: &CorrelationInput,
    indexes: &BTreeMap<&str, usize>,
) -> Result<CorrelationRepresentation, AnalyticsError> {
    if input.pairs.len() > MAX_RANKED_CORRELATION_PAIRS {
        return Err(AnalyticsError::RankedPairLimit {
            actual: input.pairs.len(),
            maximum: MAX_RANKED_CORRELATION_PAIRS,
        });
    }
    let mut seen = BTreeSet::new();
    let mut pairs = input.pairs.clone();
    for pair in &pairs {
        let key = validate_pair(pair, indexes)?;
        if !seen.insert(key) {
            return Err(AnalyticsError::DuplicateIdentifier(format!(
                "correlation:{}:{}",
                pair.left_id.as_str(),
                pair.right_id.as_str()
            )));
        }
    }
    pairs.sort_by(|left, right| {
        right
            .coefficient
            .value()
            .abs()
            .cmp(&left.coefficient.value().abs())
            .then_with(|| left.left_id.as_str().cmp(right.left_id.as_str()))
            .then_with(|| left.right_id.as_str().cmp(right.right_id.as_str()))
    });
    Ok(CorrelationRepresentation::RankedPairs { pairs })
}

fn validate_pair(
    pair: &CorrelationPair,
    indexes: &BTreeMap<&str, usize>,
) -> Result<(usize, usize), AnalyticsError> {
    let left = *indexes.get(pair.left_id.as_str()).ok_or_else(|| {
        AnalyticsError::UnknownCorrelationEntity(pair.left_id.as_str().to_owned())
    })?;
    let right = *indexes.get(pair.right_id.as_str()).ok_or_else(|| {
        AnalyticsError::UnknownCorrelationEntity(pair.right_id.as_str().to_owned())
    })?;
    if left == right {
        return Err(AnalyticsError::SuppliedSelfCorrelation);
    }
    if pair.coefficient.value().abs() > Decimal::ONE {
        return Err(AnalyticsError::InvalidCorrelationCoefficient);
    }
    Ok(if left < right {
        (left, right)
    } else {
        (right, left)
    })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use execution_contracts::{FreshnessState, SourceAuthority};

    use super::*;
    use crate::PopulationCompleteness;

    fn quality() -> FactQuality {
        FactQuality {
            source_authority: SourceAuthority::Derived,
            freshness_state: FreshnessState::Ok,
            completeness: PopulationCompleteness::Complete,
            as_of: Some(Utc::now()),
        }
    }

    fn label(index: usize) -> CorrelationLabel {
        CorrelationLabel {
            entity_id: CanonicalId::parse(format!("alpha-{index:03}")).unwrap(),
            display_name: format!("Alpha {index}"),
        }
    }

    fn pair(left: usize, right: usize, value: &str) -> CorrelationPair {
        CorrelationPair {
            left_id: label(left).entity_id,
            right_id: label(right).entity_id,
            coefficient: DecimalString::parse(value).unwrap(),
            sample_count: 30,
        }
    }

    #[test]
    fn packs_complete_matrix_including_diagonal_at_the_150_cap() {
        let labels: Vec<_> = (0..MAX_CORRELATION_DIMENSION).map(label).collect();
        let pairs: Vec<_> = (0..MAX_CORRELATION_DIMENSION)
            .flat_map(|right| (0..right).map(move |left| pair(left, right, "0.125")))
            .collect();
        let output = build_correlation(&CorrelationInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            labels,
            pairs,
            clusters: Vec::new(),
            quality: quality(),
        })
        .unwrap();
        let CorrelationRepresentation::PackedMatrix { matrix } = output.data.representation else {
            panic!("expected packed matrix");
        };
        assert_eq!(matrix.dimension, 150);
        assert_eq!(matrix.values.len(), 150 * 151 / 2);
        assert_eq!(matrix.values[0].to_string(), "1");
    }

    #[test]
    fn switches_to_bounded_ranked_pairs_above_150() {
        let output = build_correlation(&CorrelationInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            labels: (0..151).map(label).collect(),
            pairs: vec![pair(0, 1, "-0.95"), pair(1, 2, "0.20")],
            clusters: Vec::new(),
            quality: quality(),
        })
        .unwrap();
        let CorrelationRepresentation::RankedPairs { pairs } = output.data.representation else {
            panic!("expected ranked fallback");
        };
        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0].coefficient.to_string(), "-0.95");
    }

    #[test]
    fn rejects_incomplete_small_matrix_instead_of_inventing_zeroes() {
        assert_eq!(
            build_correlation(&CorrelationInput {
                portfolio_id: CanonicalId::parse("PF-1").unwrap(),
                labels: (0..3).map(label).collect(),
                pairs: vec![pair(0, 1, "0.5")],
                clusters: Vec::new(),
                quality: quality(),
            }),
            Err(AnalyticsError::CorrelationPairCount {
                actual: 1,
                expected: 3
            })
        );
    }

    #[test]
    fn rejects_unbounded_cluster_payload() {
        let input = CorrelationInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            labels: vec![label(0)],
            pairs: Vec::new(),
            clusters: (0..=MAX_CORRELATION_ENTITIES)
                .map(|index| CorrelationCluster {
                    cluster_id: CanonicalId::parse(format!("cluster-{index}")).unwrap(),
                    label: format!("Cluster {index}"),
                    members: Vec::new(),
                })
                .collect(),
            quality: quality(),
        };
        assert!(matches!(
            build_correlation(&input),
            Err(AnalyticsError::BatchLimit { .. })
        ));
    }
}
