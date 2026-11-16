//! Source-owned M0 snapshot extension. Never an event sequence or deletion proof.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::ContractError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceSnapshot {
    pub version: String,
    pub mechanism: String,
    pub source_id: String,
    pub relation: String,
    pub scope: Option<SnapshotScope>,
    pub generation: SnapshotGeneration,
    pub total_in_scope: u64,
    pub status: String,
    pub reason: Option<String>,
    pub absence_authority: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotScope {
    pub mode: String,
    pub venue: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotGeneration {
    pub at: DateTime<Utc>,
    pub snapshot: String,
}

impl SourceSnapshot {
    pub(crate) fn validate(&self, as_of: DateTime<Utc>) -> Result<(), ContractError> {
        let digest = self.source_id.strip_prefix("sha256:").unwrap_or_default();
        let scope_valid = match (self.relation.as_str(), &self.scope) {
            ("public.account_balances", Some(scope)) => {
                matches!(
                    scope.mode.as_str(),
                    "paper" | "sandbox" | "live" | "replay" | "backtest"
                ) && !scope.venue.is_empty()
                    && scope.venue.len() <= 64
                    && scope.venue.trim() == scope.venue
                    && !scope.venue.contains('\0')
            }
            ("public.portfolios", None) => true,
            _ => false,
        };
        let result_valid = match (self.status.as_str(), self.reason.as_deref()) {
            ("COMPLETE", None) => self.total_in_scope <= 200,
            ("PARTIAL", Some(reason)) => matches!(
                reason,
                "SCOPE_EXCEEDS_ONE_PAGE"
                    | "PAGE_BYTES_TOO_SMALL_FOR_ONE_ROW"
                    | "SCOPE_EXCEEDS_PAGE_BYTES"
            ),
            _ => false,
        };
        if self.version != "edge-s1.v1"
            || self.mechanism != "M0"
            || digest.len() != 64
            || !digest
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            || self.generation.at != as_of
            || snapshot_bounds(&self.generation.snapshot).is_none()
            || !scope_valid
            || !result_valid
            || self.absence_authority
        {
            return Err(ContractError::EnvelopeIdentityMismatch);
        }
        Ok(())
    }

    /// Strict snapshot fence within one configured source identity. Repoint or
    /// reset requires a new reviewed identity, not a clock-based comparison.
    #[must_use]
    pub fn follows(&self, previous: &Self) -> bool {
        if self.source_id != previous.source_id
            || self.relation != previous.relation
            || self.scope != previous.scope
        {
            return false;
        }
        match (
            snapshot_bounds(&previous.generation.snapshot),
            snapshot_bounds(&self.generation.snapshot),
        ) {
            (Some((a_min, a_max)), Some((b_min, b_max))) => b_min >= a_min && b_max >= a_max,
            _ => false,
        }
    }
}

fn snapshot_bounds(value: &str) -> Option<(u64, u64)> {
    if value.len() > 8192 {
        return None;
    }
    let mut parts = value.split(':');
    let parse = |s: &str| {
        (!s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
            .then(|| s.parse::<u64>().ok())
            .flatten()
    };
    let xmin = parse(parts.next()?)?;
    let xmax = parse(parts.next()?)?;
    let active = parts.next()?;
    if parts.next().is_some() || xmin > xmax {
        return None;
    }
    if !active.is_empty() {
        let mut previous = None;
        for part in active.split(',') {
            let xid = parse(part)?;
            if xid < xmin || xid >= xmax || previous.is_some_and(|previous| xid <= previous) {
                return None;
            }
            previous = Some(xid);
        }
    }
    Some((xmin, xmax))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn proof() -> SourceSnapshot {
        serde_json::from_value(json!({"version":"edge-s1.v1","mechanism":"M0",
            "source_id":format!("sha256:{}","a".repeat(64)),"relation":"public.account_balances",
            "scope":{"mode":"paper","venue":"OKX"},
            "generation":{"at":"2026-11-12T00:00:00Z","snapshot":"10:20:11,12"},
            "total_in_scope":0,"status":"COMPLETE","reason":null,"absence_authority":false}))
        .unwrap()
    }

    #[test]
    fn scoped_and_shared_m0_are_valid_not_absence_authority() {
        let mut p = proof();
        for mode in ["paper", "sandbox", "live", "replay", "backtest"] {
            p.scope.as_mut().unwrap().mode = mode.into();
            p.validate(p.generation.at).unwrap();
        }
        p.relation = "public.portfolios".into();
        assert!(p.validate(p.generation.at).is_err());
        p.scope = None;
        p.validate(p.generation.at).unwrap();
    }

    #[test]
    fn malformed_proofs_never_become_complete() {
        let original = proof();
        for (key, value) in [
            ("mechanism", json!("M1")),
            ("absence_authority", json!(true)),
            ("source_id", json!("sha256:short")),
            ("total_in_scope", json!(201)),
            ("status", json!("UNKNOWN")),
            ("reason", json!("DATABASE_ERROR")),
            ("relation", json!("public.orders")),
            ("scope", json!(null)),
        ] {
            let mut wire = serde_json::to_value(&original).unwrap();
            wire[key] = value;
            let invalid: SourceSnapshot = serde_json::from_value(wire).unwrap();
            assert!(invalid.validate(invalid.generation.at).is_err(), "{key}");
        }
        let mut p = original;
        p.status = "PARTIAL".into();
        p.reason = Some("SCOPE_EXCEEDS_ONE_PAGE".into());
        p.validate(p.generation.at).unwrap();
        assert!(p
            .validate(p.generation.at + chrono::Duration::seconds(1))
            .is_err());
    }

    #[test]
    fn generation_fence_rejects_rewind_unordered_and_wrong_source() {
        let p = proof();
        assert!(p.follows(&p));
        let mut next = p.clone();
        next.generation.snapshot = "20:30:".into();
        assert!(next.follows(&p));
        assert!(!p.follows(&next));
        next.generation.snapshot = "9:30:".into();
        assert!(!next.follows(&p));
        next = p.clone();
        next.source_id = format!("sha256:{}", "b".repeat(64));
        assert!(!next.follows(&p));
        next = p.clone();
        next.scope.as_mut().unwrap().venue = "okx".into();
        assert!(!next.follows(&p));
    }

    #[test]
    fn snapshot_parser_is_strict_and_bounded() {
        for bad in [
            "", "1:2:3", "2:1:", "1:3:2,1", "1:3:1,1", "+1:2:", "1:2::", "1:2:,", "1:2:01,",
        ] {
            assert!(snapshot_bounds(bad).is_none(), "{bad}");
        }
        assert!(snapshot_bounds(&"1".repeat(8193)).is_none());
        assert_eq!(snapshot_bounds("10:20:11,12"), Some((10, 20)));
    }
}
