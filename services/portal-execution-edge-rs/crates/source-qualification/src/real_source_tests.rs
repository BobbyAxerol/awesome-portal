use chrono::{TimeDelta, Utc};

use super::real_source::{
    qualify_real_source, EvidenceOrigin, QualificationMode, QualificationPrerequisites,
    QualificationProfile, RealSourceDecision, RealSourceQualificationError,
    RealSourceQualificationEvidence,
};

const TEMPLATE: &[u8] = include_bytes!("../fixtures/n06-real-source-qualification.template.json");

fn template() -> RealSourceQualificationEvidence {
    serde_json::from_slice(TEMPLATE).unwrap()
}

fn real_candidate() -> RealSourceQualificationEvidence {
    let mut evidence = template();
    evidence.evidence_origin = EvidenceOrigin::RealSource;
    evidence
}

fn accepted() -> RealSourceQualificationEvidence {
    let mut evidence = real_candidate();
    evidence.owner_review.accepted = true;
    evidence.owner_review.reviewed_at = Some(evidence.ended_at + TimeDelta::seconds(1));
    evidence
}

fn expected_prerequisites(
    evidence: &RealSourceQualificationEvidence,
) -> QualificationPrerequisites<'_> {
    QualificationPrerequisites {
        n02_owner_manifest_sha256: &evidence.identity.n02_owner_manifest_sha256,
        n03_owner_manifest_sha256: &evidence.identity.n03_owner_manifest_sha256,
        owner_window_evidence_sha256: &evidence.identity.owner_window_evidence_sha256,
    }
}

#[test]
fn template_proves_the_full_harness_without_claiming_activation() {
    let evidence = template();
    let first = qualify_real_source(&evidence, QualificationMode::Template, None).unwrap();
    let second = qualify_real_source(&evidence, QualificationMode::Template, None).unwrap();

    assert_eq!(first, second);
    assert_eq!(first.decision, RealSourceDecision::TemplateValid);
    assert_eq!(first.soak_seconds, 86_400);
    assert_eq!(
        first.qualification_profile,
        QualificationProfile::Extended24h
    );
    assert_eq!(first.source_mutations, 0);
    assert_eq!(first.divergence_count, 0);
    assert!(!first.activation_authorized);
    assert!(!first.registry_profile_changed);
    assert!(first.evidence_digest.starts_with("sha256:"));
    assert!(serde_json::to_vec(&first).unwrap().len() < 1_024);
}

#[test]
fn candidate_and_acceptance_require_real_evidence_and_exact_owner_bytes() {
    let candidate = real_candidate();
    let prerequisites = expected_prerequisites(&candidate);
    let report = qualify_real_source(
        &candidate,
        QualificationMode::Candidate,
        Some(prerequisites),
    )
    .unwrap();
    assert_eq!(report.decision, RealSourceDecision::ReadyForOwnerReview);

    let evidence = accepted();
    let prerequisites = expected_prerequisites(&evidence);
    let report = qualify_real_source(
        &evidence,
        QualificationMode::Acceptance,
        Some(prerequisites),
    )
    .unwrap();
    assert_eq!(report.decision, RealSourceDecision::EvidenceAccepted);
    assert!(!report.activation_authorized);

    let mut wrong = expected_prerequisites(&evidence);
    wrong.n02_owner_manifest_sha256 =
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    let error =
        qualify_real_source(&evidence, QualificationMode::Acceptance, Some(wrong)).unwrap_err();
    assert_eq!(error.reason_code(), "N06_PREREQUISITE_DIGEST_MISMATCH");
}

#[test]
fn synthetic_or_unreviewed_evidence_never_passes_acceptance() {
    let synthetic = template();
    let prerequisites = expected_prerequisites(&synthetic);
    assert_eq!(
        qualify_real_source(
            &synthetic,
            QualificationMode::Acceptance,
            Some(prerequisites),
        )
        .unwrap_err()
        .reason_code(),
        "N06_EVIDENCE_MODE_MISMATCH"
    );

    let candidate = real_candidate();
    let prerequisites = expected_prerequisites(&candidate);
    assert_eq!(
        qualify_real_source(
            &candidate,
            QualificationMode::Acceptance,
            Some(prerequisites),
        )
        .unwrap_err()
        .reason_code(),
        "N06_OWNER_REVIEW_REQUIRED"
    );
}

#[test]
fn each_profile_requires_its_exact_contiguous_sample_envelope() {
    let mut evidence = template();
    evidence.ended_at -= TimeDelta::seconds(1);
    evidence.soak.duration_seconds -= 1;
    assert_eq!(
        qualify_real_source(&evidence, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_SOAK_COVERAGE_INSUFFICIENT"
    );

    let mut missing_sample = template();
    missing_sample.soak.sample_count = 287;
    assert_eq!(
        qualify_real_source(&missing_sample, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_SOAK_COVERAGE_INSUFFICIENT"
    );

    let mut fast = template();
    fast.qualification_profile = QualificationProfile::PaperFastAcceptance;
    fast.ended_at = fast.started_at + TimeDelta::seconds(1_800);
    fast.soak.duration_seconds = 1_800;
    fast.soak.sample_interval_seconds = 30;
    fast.soak.sample_count = 60;
    fast.soak.full_reconciliation_count = 6;
    // Keep route/request totals inside the shorter window's rate ceiling.
    fast.route_metrics[1].request_count = 2_995;
    fast.soak.source_request_count = 3_000;
    assert_eq!(
        qualify_real_source(&fast, QualificationMode::Template, None)
            .unwrap()
            .qualification_profile,
        QualificationProfile::PaperFastAcceptance
    );

    let mut under = fast.clone();
    under.ended_at -= TimeDelta::seconds(1);
    under.soak.duration_seconds -= 1;
    assert_eq!(
        qualify_real_source(&under, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_SOAK_COVERAGE_INSUFFICIENT"
    );

    let mut sparse = fast;
    sparse.soak.sample_interval_seconds = 31;
    assert_eq!(
        qualify_real_source(&sparse, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_SOAK_COVERAGE_INSUFFICIENT"
    );
}

#[test]
fn parity_and_every_named_fault_drill_are_mandatory() {
    let mut mismatch = template();
    mismatch.semantic_parity.delta_actual_digest =
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".to_owned();
    assert_eq!(
        qualify_real_source(&mismatch, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_SEMANTIC_PARITY_MISMATCH"
    );

    let mut missing = template();
    missing.drills.pop();
    assert_eq!(
        qualify_real_source(&missing, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_DRILL_EVIDENCE_INCOMPLETE"
    );

    let mut failed = template();
    failed.drills[0].passed = false;
    assert_eq!(
        qualify_real_source(&failed, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_DRILL_EVIDENCE_INCOMPLETE"
    );
}

#[test]
fn source_mutation_hidden_scans_and_unbounded_resources_fail_closed() {
    let mut mutation = template();
    mutation.soak.source_mutation_count = 1;
    assert_eq!(
        qualify_real_source(&mutation, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_SOAK_BOUNDS_EXCEEDED"
    );

    let mut scan = template();
    scan.soak.ordinary_delta_full_scan_count = 1;
    assert!(matches!(
        qualify_real_source(&scan, QualificationMode::Template, None),
        Err(RealSourceQualificationError::SoakBoundsExceeded)
    ));

    let mut rss = template();
    rss.soak.peak_rust_rss_bytes = rss.bounds.maximum_rust_rss_bytes + 1;
    assert!(matches!(
        qualify_real_source(&rss, QualificationMode::Template, None),
        Err(RealSourceQualificationError::SoakBoundsExceeded)
    ));

    let mut amplification = template();
    amplification.route_metrics[0].rows_scanned = amplification.route_metrics[0].rows_returned * 5;
    assert_eq!(
        qualify_real_source(&amplification, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_ROUTE_METRICS_INCOMPLETE"
    );

    let mut unreconciled = template();
    unreconciled.soak.source_bytes += 1;
    assert_eq!(
        qualify_real_source(&unreconciled, QualificationMode::Template, None)
            .unwrap_err()
            .reason_code(),
        "N06_ROUTE_TOTALS_MISMATCH"
    );
}

#[test]
fn secret_business_payload_and_authority_widening_are_unrepresentable() {
    let mut secret: serde_json::Value = serde_json::from_slice(TEMPLATE).unwrap();
    secret["evidence_data_class"] = serde_json::json!("CONTAINS_SECRET");
    assert!(serde_json::from_value::<RealSourceQualificationEvidence>(secret).is_err());

    let mut commands: serde_json::Value = serde_json::from_slice(TEMPLATE).unwrap();
    commands["authority"] = serde_json::json!("COMMAND_AND_READ");
    assert!(serde_json::from_value::<RealSourceQualificationEvidence>(commands).is_err());
}

#[test]
fn owner_review_must_follow_the_finished_soak() {
    let mut evidence = accepted();
    evidence.owner_review.reviewed_at = Some(evidence.ended_at - TimeDelta::seconds(1));
    let prerequisites = expected_prerequisites(&evidence);
    assert_eq!(
        qualify_real_source(
            &evidence,
            QualificationMode::Acceptance,
            Some(prerequisites),
        )
        .unwrap_err()
        .reason_code(),
        "N06_OWNER_REVIEW_REQUIRED"
    );
}

#[test]
fn unknown_json_fields_are_rejected_before_qualification() {
    let mut value: serde_json::Value = serde_json::from_slice(TEMPLATE).unwrap();
    value["browser_token"] = serde_json::json!("must-not-exist");
    assert!(serde_json::from_value::<RealSourceQualificationEvidence>(value).is_err());
}

#[test]
fn timestamps_remain_utc_and_canonical_digest_changes_on_any_measurement() {
    let evidence = template();
    assert_eq!(evidence.started_at.timezone(), Utc);
    let first = qualify_real_source(&evidence, QualificationMode::Template, None)
        .unwrap()
        .evidence_digest;
    let mut changed = evidence;
    changed.soak.peak_rust_rss_bytes += 1;
    let second = qualify_real_source(&changed, QualificationMode::Template, None)
        .unwrap()
        .evidence_digest;
    assert_ne!(first, second);
}
