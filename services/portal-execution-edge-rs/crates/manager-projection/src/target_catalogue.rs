//! Offline, explicitly partial Manager catalogue preparation for the TS DB.
//! This is not an authority decision, installation or complete feed set.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TargetCatalogueError {
    #[error("invalid or incompatible source catalogue/policy")]
    InvalidSource,
    #[error("target contains no safely scoped relations")]
    EmptyCandidate,
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, TargetCatalogueError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or(TargetCatalogueError::InvalidSource)
}

fn id(value: &Value) -> Result<(String, String), TargetCatalogueError> {
    let schema = text(value, "schema")?;
    let relation = text(value, "relation")?;
    let valid = |s: &str| {
        !s.is_empty()
            && s.len() <= 63
            && s.bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
    };
    if !valid(schema) || !valid(relation) {
        return Err(TargetCatalogueError::InvalidSource);
    }
    Ok((schema.to_owned(), relation.to_owned()))
}

fn canonical_digest(value: &Value) -> Result<String, TargetCatalogueError> {
    let bytes = serde_json::to_vec(value).map_err(|_| TargetCatalogueError::InvalidSource)?;
    // TS hashes ASCII-escaped JSON. For non-ASCII input this deliberately fails
    // closed instead of assuming serde and Python have identical escaping.
    if !bytes.is_ascii() {
        return Err(TargetCatalogueError::InvalidSource);
    }
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

/// Construct a partial candidate using existing SQL mode+venue markers or
/// TS-confirmed shared reference relations. A shared portfolio is not proof
/// of portfolio membership in any mode or venue.
/// Caller must separately qualify source identity, ACL, key plans, policy,
/// signed profile and runtime. The output is never an installed authority.
///
/// # Errors
/// Returns an error on digest mismatch, duplicate/uncorrelated metadata,
/// malformed relations, unsupported input or an empty partial candidate.
#[allow(clippy::too_many_lines)] // One auditable pass binds both catalogue and policy.
pub fn prepare_partial_target(
    catalogue: &Value,
    policy: &Value,
) -> Result<Value, TargetCatalogueError> {
    prepare_target(catalogue, policy, false)
}

/// Offline M0 candidate. Activating this catalogue requires the matching S1
/// source image and worker source-ID pin; it is never safe on the old facade.
///
/// # Errors
/// Rejects malformed metadata and source mismatches.
pub fn prepare_m0_target(catalogue: &Value, policy: &Value) -> Result<Value, TargetCatalogueError> {
    prepare_target(catalogue, policy, true)
}

#[allow(clippy::too_many_lines)]
fn prepare_target(
    catalogue: &Value,
    policy: &Value,
    m0: bool,
) -> Result<Value, TargetCatalogueError> {
    let source_digest = text(catalogue, "catalogue_sha256")?;
    let mut original_core = catalogue.clone();
    original_core
        .as_object_mut()
        .ok_or(TargetCatalogueError::InvalidSource)?
        .remove("catalogue_sha256");
    if canonical_digest(&original_core)? != source_digest
        || text(policy, "catalogue_sha256")? != source_digest
    {
        return Err(TargetCatalogueError::InvalidSource);
    }
    let relations = catalogue
        .get("relations")
        .and_then(Value::as_array)
        .ok_or(TargetCatalogueError::InvalidSource)?;
    let policies = policy
        .get("relations")
        .and_then(Value::as_array)
        .ok_or(TargetCatalogueError::InvalidSource)?;
    if policy.get("relation_count").and_then(Value::as_u64) != Some(policies.len() as u64) {
        return Err(TargetCatalogueError::InvalidSource);
    }
    let mut by_id = BTreeMap::new();
    for item in policies {
        if by_id.insert(id(item)?, item).is_some() {
            return Err(TargetCatalogueError::InvalidSource);
        }
    }
    let mut seen = BTreeSet::new();
    let mut selected = Vec::new();
    let mut selected_policies = Vec::new();
    let mut selected_scopes = Vec::new();
    let mut omitted = Vec::new();
    let mut kinds = BTreeMap::<String, usize>::new();
    let mut primary = 0_usize;
    let mut unique = 0_usize;
    let mut pending = 0_usize;
    let mut returnable = 0_usize;
    let mut secrets = 0_usize;
    let mut marker_relations = 0_usize;
    for relation in relations {
        let relation_id = id(relation)?;
        if !seen.insert(relation_id.clone()) {
            return Err(TargetCatalogueError::InvalidSource);
        }
        let policy_item = by_id
            .get(&relation_id)
            .ok_or(TargetCatalogueError::InvalidSource)?;
        let profile = relation
            .get("profile_columns")
            .and_then(Value::as_array)
            .ok_or(TargetCatalogueError::InvalidSource)?;
        if policy_item.get("profile_columns") != relation.get("profile_columns") {
            return Err(TargetCatalogueError::InvalidSource);
        }
        let columns: BTreeSet<_> = profile
            .iter()
            .map(|v| v.as_str().ok_or(TargetCatalogueError::InvalidSource))
            .collect::<Result<_, _>>()?;
        // Never treat duplicate predicates or a fixed-profile assertion as
        // proof of mode/venue isolation on the shared official database.
        if columns.len() != profile.len() {
            return Err(TargetCatalogueError::InvalidSource);
        }
        let name = relation_id.1.as_str();
        let excluded = relation_id.0 == "public"
            && ["venue_credentials", "dnse_trading_tokens"].contains(&name);
        let scope = if relation_id.0 == "public"
            && !excluded
            && columns == BTreeSet::from(["mode", "venue"])
        {
            Some("MODE_AND_VENUE")
        } else if relation_id.0 == "public"
            && ["instruments", "venues"].contains(&name)
            && columns == BTreeSet::from(["venue"])
        {
            Some("VENUE_REFERENCE_SHARED_ACROSS_MODES")
        } else if m0
            && relation_id.0 == "public"
            && name == "account_balances"
            && columns.is_empty()
        {
            let key = policy_item
                .get("key_terms")
                .and_then(Value::as_array)
                .ok_or(TargetCatalogueError::InvalidSource)?;
            if key
                != &vec![
                    json!({"column":"account_id","kind":"COLUMN"}),
                    json!({"column":"currency","kind":"COLUMN"}),
                ]
            {
                return Err(TargetCatalogueError::InvalidSource);
            }
            Some("PARENT_ACCOUNTS_M0_REQUIRED")
        } else if relation_id.0 == "public" && name == "portfolios" && columns.is_empty() {
            Some("DATABASE_SHARED_REFERENCE_NOT_MEMBERSHIP")
        } else {
            None
        };
        if scope.is_none() {
            let parent = if relation_id.0 == "public" {
                parent_scope(name)
            } else {
                None
            };
            let reason = if excluded {
                "OWNER_EXCLUDED"
            } else if parent.is_some() {
                "PARENT_SCOPE_REQUIRES_BINDING"
            } else {
                "SCOPE_NOT_YET_QUALIFIED"
            };
            // Hints explain the TS draft only; they cannot add a predicate or
            // make an omitted relation available to any runtime consumer.
            let hint = if relation_id.0 == "public" && !excluded && parent.is_none() {
                fixed_context_hint(name).or_else(|| {
                    (columns == BTreeSet::from(["venue"]))
                        .then_some("VENUE_ONLY_MODE_SEMANTICS_NOT_CONFIRMED")
                })
            } else {
                None
            };
            omitted.push(json!({"schema": relation_id.0, "relation": name,
                "reason": reason, "parent": parent, "ts_r2_draft_scope_hint": hint}));
            continue;
        }
        let expected_classification = if columns.is_empty() {
            "FIXED_PROFILE_CONTEXT"
        } else {
            marker_relations += 1;
            "RELATION_PROFILE_MARKERS_PRESENT"
        };
        if text(relation, "profile_classification")? != expected_classification {
            return Err(TargetCatalogueError::InvalidSource);
        }
        let raw_columns = relation
            .get("columns")
            .and_then(Value::as_array)
            .ok_or(TargetCatalogueError::InvalidSource)?;
        for column in raw_columns {
            match text(column, "classification")? {
                "RETURNABLE" => returnable += 1,
                "SECRET_CELL_EXCLUDED" => secrets += 1,
                _ => return Err(TargetCatalogueError::InvalidSource),
            }
        }
        match relation
            .get("key")
            .and_then(|v| v.get("selected"))
            .and_then(|v| v.get("status"))
            .and_then(Value::as_str)
        {
            Some("PRIMARY_KEY") => primary += 1,
            Some("UNIQUE_INDEX") => unique += 1,
            Some("PENDING_QUERY_KEY") => pending += 1,
            _ => return Err(TargetCatalogueError::InvalidSource),
        }
        *kinds.entry(text(relation, "kind")?.to_owned()).or_default() += 1;
        selected_scopes.push(json!({"schema":relation_id.0,"relation":name,"scope":scope}));
        selected.push(relation.clone());
        selected_policies.push((*policy_item).clone());
    }
    if seen.len() != by_id.len() {
        return Err(TargetCatalogueError::InvalidSource);
    }
    if selected.is_empty() {
        return Err(TargetCatalogueError::EmptyCandidate);
    }
    let mut candidate = catalogue.clone();
    let document = candidate
        .as_object_mut()
        .ok_or(TargetCatalogueError::InvalidSource)?;
    document.remove("catalogue_sha256");
    let authority = document
        .get_mut("authority")
        .and_then(Value::as_object_mut)
        .ok_or(TargetCatalogueError::InvalidSource)?;
    if authority.get("database").and_then(Value::as_str) != Some("live_data_executor") {
        return Err(TargetCatalogueError::InvalidSource);
    }
    authority.insert("database".into(), json!("trading_system"));
    document.insert("relations".into(), json!(selected));
    document.insert("summary".into(), json!({
        "relation_count": selected.len(), "relation_kind_counts": kinds,
        "primary_key_relation_count": primary, "unique_key_relation_count": unique,
        "pending_query_key_relation_count": pending, "profile_marker_relation_count": marker_relations,
        "returnable_column_count": returnable, "secret_cell_excluded_column_count": secrets,
        "pending_ts_oc_03d_relation_count": selected.len(), "source_binding": "DISABLED"
    }));
    let digest = canonical_digest(&candidate)?;
    candidate
        .as_object_mut()
        .ok_or(TargetCatalogueError::InvalidSource)?
        .insert("catalogue_sha256".into(), json!(digest));
    let mut candidate_policy = policy.clone();
    let policy_object = candidate_policy
        .as_object_mut()
        .ok_or(TargetCatalogueError::InvalidSource)?;
    policy_object.insert("catalogue_sha256".into(), json!(digest));
    policy_object.insert("relation_count".into(), json!(selected_policies.len()));
    policy_object.insert("relations".into(), json!(selected_policies));
    Ok(
        json!({"status":"PARTIAL_CANDIDATE_NOT_INSTALLED", "catalogue":candidate, "policy":candidate_policy,
        "selected_scopes":selected_scopes,"omitted":omitted,
        "omitted_relation_count":relations.len() - selected.len(), "requires_s1_m0_adapter":m0}),
    )
}

// TS R2 §2.3 is a mapping inventory, not permission to query a child without
// an authenticated, source-side parent predicate and completeness proof.
fn parent_scope(relation: &str) -> Option<&'static str> {
    match relation {
        "account_balances" | "margin_balances" | "paper_account_seed" | "settlement_buckets" => {
            Some("accounts")
        }
        "command_ack_evidence"
        | "command_broker_attempts"
        | "command_delivery_attempts"
        | "command_dispatch_outbox" => Some("command_journal"),
        "conditional_order_group_legs" | "execution_command_outbox" | "order_group_event_inbox" => {
            Some("conditional_order_groups")
        }
        "engine_authority_decisions" | "engine_authority_transitions" => {
            Some("engine_authority_scopes")
        }
        "order_bracket_legs" => Some("order_brackets"),
        _ => None,
    }
}

// TS R2 §2.3 classifies these 27 fixed-context names as draft only. This does
// not settle current-policy authorization, source snapshot or a safe query.
fn fixed_context_hint(relation: &str) -> Option<&'static str> {
    match relation {
        "alphas" | "traders" | "portfolios" | "instrument_metadata_history" | "strategies" => {
            Some("SHARED_MASTER_NOT_PROFILE_MEMBERSHIP")
        }
        "portfolio_audit_log" | "portfolio_audit_current_state" => {
            Some("SHARED_AUDIT_TARGET_SCOPE_REQUIRED")
        }
        "portfolio_equity_snapshots" => Some("SHARED_AGGREGATE_DO_NOT_SPLIT_OR_DUPLICATE"),
        "alpha_ledger"
        | "alpha_risk_config"
        | "funding_rates"
        | "performance_projection_current_state"
        | "execution_replay_jobs" => Some("SCOPE_UNKNOWN"),
        "compatibility_usage_daily"
        | "command_stream_trim_audit"
        | "compatibility_surface_registry"
        | "copy_event_dead_letters"
        | "dead_letters"
        | "event_idempotency"
        | "maintenance_policy_registry"
        | "projection_storage_policies"
        | "reconciliation_observation_buckets"
        | "redis_transport_epochs"
        | "schema_migration_ledger"
        | "schema_object_ownership"
        | "service_heartbeats"
        | "storage_archive_manifests" => Some("INTERNAL_NOT_BUSINESS_DATASET"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn m0_adds_only_exact_parent_binding_with_source_adapter_requirement() {
        let (source, mut policy) = fixture();
        assert!(prepare_m0_target(&source, &policy).is_err());
        policy["relations"][1]["key_terms"] = json!([
            {"column":"account_id","kind":"COLUMN"}, {"column":"currency","kind":"COLUMN"}]);
        let result = prepare_m0_target(&source, &policy).unwrap();
        assert_eq!(result["requires_s1_m0_adapter"], true);
        assert_eq!(
            result["selected_scopes"][1]["scope"],
            "PARENT_ACCOUNTS_M0_REQUIRED"
        );
        assert_eq!(result["catalogue"]["summary"]["relation_count"], 4);
        assert_eq!(
            prepare_partial_target(&source, &policy).unwrap()["catalogue"]["summary"]
                ["relation_count"],
            3
        );
        policy["relations"][1]["key_terms"][1]["column"] = json!("another_key");
        assert!(prepare_m0_target(&source, &policy).is_err());
    }

    fn relation(name: &str, profile: &Value) -> Value {
        json!({"schema":"public", "relation":name, "kind":"TABLE",
            "profile_columns":profile, "profile_classification":if profile.as_array().unwrap().is_empty() {
                "FIXED_PROFILE_CONTEXT" } else { "RELATION_PROFILE_MARKERS_PRESENT" },
            "columns":[{"name":"id","classification":"RETURNABLE"}],
            "key":{"selected":{"status":"PRIMARY_KEY"}}})
    }

    fn fixture() -> (Value, Value) {
        let relations = vec![
            relation("orders", &json!(["mode", "venue"])),
            relation("account_balances", &json!([])),
            relation("venue_credentials", &json!(["venue", "mode"])),
            relation("instruments", &json!(["venue"])),
            relation("venues", &json!(["venue"])),
            relation("unknown_venue_only", &json!(["venue"])),
        ];
        let mut catalogue =
            json!({"authority":{"database":"live_data_executor"},"relations":relations});
        let digest = canonical_digest(&catalogue).unwrap();
        catalogue["catalogue_sha256"] = json!(digest);
        let policy = json!({"catalogue_sha256":digest, "relation_count":6,"relations":[
            {"schema":"public","relation":"orders","profile_columns":["mode","venue"]},
            {"schema":"public","relation":"account_balances","profile_columns":[]},
            {"schema":"public","relation":"venue_credentials","profile_columns":["venue","mode"]},
            {"schema":"public","relation":"instruments","profile_columns":["venue"]},
            {"schema":"public","relation":"venues","profile_columns":["venue"]},
            {"schema":"public","relation":"unknown_venue_only","profile_columns":["venue"]}
        ]});
        (catalogue, policy)
    }

    #[test]
    fn candidate_is_partial_scoped_and_digest_consistent() {
        let (source, policy) = fixture();
        let result = prepare_partial_target(&source, &policy).unwrap();
        assert_eq!(result["status"], "PARTIAL_CANDIDATE_NOT_INSTALLED");
        assert_eq!(result["omitted_relation_count"], 3);
        assert_eq!(result["catalogue"]["relations"][0]["relation"], "orders");
        assert_eq!(result["catalogue"]["summary"]["relation_count"], 3);
        assert_eq!(
            result["selected_scopes"][1]["scope"],
            "VENUE_REFERENCE_SHARED_ACROSS_MODES"
        );
        assert_eq!(
            result["omitted"][0]["reason"],
            "PARENT_SCOPE_REQUIRES_BINDING"
        );
        assert_eq!(result["omitted"][0]["parent"], "accounts");
        assert_eq!(result["omitted"][1]["reason"], "OWNER_EXCLUDED");
        assert_eq!(result["omitted"][2]["reason"], "SCOPE_NOT_YET_QUALIFIED");
        assert_eq!(
            result["omitted"][2]["ts_r2_draft_scope_hint"],
            "VENUE_ONLY_MODE_SEMANTICS_NOT_CONFIRMED"
        );
        assert_eq!(
            result["catalogue"]["authority"]["database"],
            "trading_system"
        );
        let mut core = result["catalogue"].clone();
        let digest = core
            .as_object_mut()
            .unwrap()
            .remove("catalogue_sha256")
            .unwrap();
        assert_eq!(digest, json!(canonical_digest(&core).unwrap()));
        assert_eq!(result["policy"]["catalogue_sha256"], digest);
    }

    #[test]
    fn rejects_catalogue_digest_and_policy_marker_drift() {
        let (mut source, mut policy) = fixture();
        source["catalogue_sha256"] = json!("wrong");
        assert!(prepare_partial_target(&source, &policy).is_err());
        let (source, _) = fixture();
        policy["relations"][0]["profile_columns"] = json!(["mode"]);
        assert!(prepare_partial_target(&source, &policy).is_err());
    }

    #[test]
    fn rejects_duplicate_and_nonascii_metadata() {
        let (source, mut policy) = fixture();
        policy["relations"][1] = policy["relations"][0].clone();
        assert!(prepare_partial_target(&source, &policy).is_err());
        assert!(canonical_digest(&json!({"name":"Việt"})).is_err());
    }

    #[test]
    fn rejects_duplicate_profile_markers() {
        let (mut source, mut policy) = fixture();
        source["relations"][0]["profile_columns"] = json!(["mode", "mode", "venue"]);
        policy["relations"][0]["profile_columns"] = json!(["mode", "mode", "venue"]);
        source.as_object_mut().unwrap().remove("catalogue_sha256");
        let digest = canonical_digest(&source).unwrap();
        source["catalogue_sha256"] = json!(digest);
        policy["catalogue_sha256"] = json!(digest);
        assert!(prepare_partial_target(&source, &policy).is_err());
    }

    #[test]
    fn accepts_owner_unique_index_status() {
        let (mut source, mut policy) = fixture();
        source["relations"][0]["key"]["selected"]["status"] = json!("UNIQUE_INDEX");
        source.as_object_mut().unwrap().remove("catalogue_sha256");
        let digest = canonical_digest(&source).unwrap();
        source["catalogue_sha256"] = json!(digest);
        policy["catalogue_sha256"] = json!(digest);
        let candidate = prepare_partial_target(&source, &policy).unwrap();
        assert_eq!(
            candidate["catalogue"]["summary"]["unique_key_relation_count"],
            1
        );
    }

    #[test]
    fn reference_without_venue_is_not_selected() {
        let (mut source, mut policy) = fixture();
        source["relations"][3]["profile_columns"] = json!([]);
        policy["relations"][3]["profile_columns"] = json!([]);
        source.as_object_mut().unwrap().remove("catalogue_sha256");
        let digest = canonical_digest(&source).unwrap();
        source["catalogue_sha256"] = json!(digest);
        policy["catalogue_sha256"] = json!(digest);
        let result = prepare_partial_target(&source, &policy).unwrap();
        assert_eq!(result["catalogue"]["summary"]["relation_count"], 2);
        assert!(result["omitted"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["relation"] == "instruments"));
    }

    #[test]
    fn parent_inventory_is_explicit_and_does_not_authorize_neighbours() {
        let groups: &[(&str, &[&str])] = &[
            (
                "accounts",
                &[
                    "account_balances",
                    "margin_balances",
                    "paper_account_seed",
                    "settlement_buckets",
                ],
            ),
            (
                "command_journal",
                &[
                    "command_ack_evidence",
                    "command_broker_attempts",
                    "command_delivery_attempts",
                    "command_dispatch_outbox",
                ],
            ),
            (
                "conditional_order_groups",
                &[
                    "conditional_order_group_legs",
                    "execution_command_outbox",
                    "order_group_event_inbox",
                ],
            ),
            (
                "engine_authority_scopes",
                &["engine_authority_decisions", "engine_authority_transitions"],
            ),
            ("order_brackets", &["order_bracket_legs"]),
        ];
        assert_eq!(
            groups.iter().map(|(_, names)| names.len()).sum::<usize>(),
            14
        );
        for (parent, names) in groups {
            for name in *names {
                assert_eq!(parent_scope(name), Some(*parent));
            }
        }
        assert_eq!(parent_scope("portfolio_equity_snapshots"), None);
        assert_eq!(parent_scope("orders"), None);
    }

    #[test]
    fn ts_draft_hints_cover_all_27_without_authorizing_relations() {
        let groups: &[(&str, &[&str])] = &[
            (
                "SHARED_MASTER_NOT_PROFILE_MEMBERSHIP",
                &[
                    "alphas",
                    "traders",
                    "portfolios",
                    "instrument_metadata_history",
                    "strategies",
                ],
            ),
            (
                "SHARED_AUDIT_TARGET_SCOPE_REQUIRED",
                &["portfolio_audit_log", "portfolio_audit_current_state"],
            ),
            (
                "SHARED_AGGREGATE_DO_NOT_SPLIT_OR_DUPLICATE",
                &["portfolio_equity_snapshots"],
            ),
            (
                "SCOPE_UNKNOWN",
                &[
                    "alpha_ledger",
                    "alpha_risk_config",
                    "funding_rates",
                    "performance_projection_current_state",
                    "execution_replay_jobs",
                ],
            ),
            (
                "INTERNAL_NOT_BUSINESS_DATASET",
                &[
                    "compatibility_usage_daily",
                    "command_stream_trim_audit",
                    "compatibility_surface_registry",
                    "copy_event_dead_letters",
                    "dead_letters",
                    "event_idempotency",
                    "maintenance_policy_registry",
                    "projection_storage_policies",
                    "reconciliation_observation_buckets",
                    "redis_transport_epochs",
                    "schema_migration_ledger",
                    "schema_object_ownership",
                    "service_heartbeats",
                    "storage_archive_manifests",
                ],
            ),
        ];
        assert_eq!(
            groups.iter().map(|(_, names)| names.len()).sum::<usize>(),
            27
        );
        for (hint, names) in groups {
            for name in *names {
                assert_eq!(fixed_context_hint(name), Some(*hint));
                assert_eq!(parent_scope(name), None);
            }
        }
        assert_eq!(fixed_context_hint("account_balances"), None);
        assert_eq!(fixed_context_hint("portfolio_equity_snapshots_extra"), None);
    }

    #[test]
    fn ts_confirmed_portfolio_is_shared_reference_not_profile_membership() {
        let (mut source, mut policy) = fixture();
        source["relations"]
            .as_array_mut()
            .unwrap()
            .push(relation("portfolios", &json!([])));
        policy["relations"]
            .as_array_mut()
            .unwrap()
            .push(json!({"schema":"public","relation":"portfolios","profile_columns":[]}));
        policy["relation_count"] = json!(7);
        source.as_object_mut().unwrap().remove("catalogue_sha256");
        let digest = canonical_digest(&source).unwrap();
        source["catalogue_sha256"] = json!(digest);
        policy["catalogue_sha256"] = json!(digest);
        let result = prepare_partial_target(&source, &policy).unwrap();
        assert_eq!(result["catalogue"]["summary"]["relation_count"], 4);
        assert_eq!(
            result["catalogue"]["summary"]["profile_marker_relation_count"],
            3
        );
        let selected = result["selected_scopes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["relation"] == "portfolios")
            .unwrap();
        assert_eq!(
            selected["scope"],
            "DATABASE_SHARED_REFERENCE_NOT_MEMBERSHIP"
        );
        let shared = result["catalogue"]["relations"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["relation"] == "portfolios")
            .unwrap();
        assert_eq!(shared["profile_columns"], json!([]));
        assert_eq!(shared["profile_classification"], "FIXED_PROFILE_CONTEXT");
        assert_eq!(result["policy"]["relation_count"], 4);
        assert_eq!(
            result["policy"]["catalogue_sha256"],
            result["catalogue"]["catalogue_sha256"]
        );
    }

    #[test]
    fn shared_portfolio_wrong_classification_fails_closed() {
        let (mut source, mut policy) = fixture();
        let mut portfolio = relation("portfolios", &json!([]));
        portfolio["profile_classification"] = json!("RELATION_PROFILE_MARKERS_PRESENT");
        source["relations"].as_array_mut().unwrap().push(portfolio);
        policy["relations"]
            .as_array_mut()
            .unwrap()
            .push(json!({"schema":"public","relation":"portfolios","profile_columns":[]}));
        policy["relation_count"] = json!(7);
        source.as_object_mut().unwrap().remove("catalogue_sha256");
        let digest = canonical_digest(&source).unwrap();
        source["catalogue_sha256"] = json!(digest);
        policy["catalogue_sha256"] = json!(digest);
        assert!(prepare_partial_target(&source, &policy).is_err());
    }
}
