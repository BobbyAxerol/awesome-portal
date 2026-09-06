use serde_json::Value;

use crate::{validate_embedded_qualification, validate_qualification, QualificationError};

fn embedded() -> (Value, Value) {
    let qualification: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../contracts/eds12-release-qualification-v1/qualification.v1.json"
    )))
    .unwrap();
    let failure_matrix: Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../contracts/eds12-release-qualification-v1/failure-matrix.v1.json"
    )))
    .unwrap();
    (qualification, failure_matrix)
}

#[test]
fn embedded_contract_is_static_and_complete() {
    let result = validate_embedded_qualification().unwrap();
    assert_eq!(result.profile_stage_count, 4);
    assert_eq!(result.failure_scenario_count, 10);
    assert_eq!(result.source_extension_count, 2);
    assert!(!result.product_active);
    assert!(!result.operations_qualified);
}

#[test]
fn runtime_authority_and_p01_ttl_fail_closed() {
    let (mut qualification, failure_matrix) = embedded();
    qualification["authority"]["sse_activation_authorized"] = Value::Bool(true);
    assert_eq!(
        validate_qualification(&qualification, &failure_matrix),
        Err(QualificationError::AuthorityWidened)
    );

    let (mut qualification, failure_matrix) = embedded();
    qualification["baseline"]["p01_r4_r5_source_integration"]["lease_ttl_seconds"] =
        Value::from(60);
    assert_eq!(
        validate_qualification(&qualification, &failure_matrix),
        Err(QualificationError::AuthorityWidened)
    );
}

#[test]
fn missing_failure_or_source_extension_fails_closed() {
    let (qualification, mut failure_matrix) = embedded();
    failure_matrix["scenarios"].as_array_mut().unwrap().pop();
    assert_eq!(
        validate_qualification(&qualification, &failure_matrix),
        Err(QualificationError::FailureMatrixDrift)
    );

    let (mut qualification, failure_matrix) = embedded();
    qualification["source_extensions"]
        .as_array_mut()
        .unwrap()
        .pop();
    assert_eq!(
        validate_qualification(&qualification, &failure_matrix),
        Err(QualificationError::SourceExtensionDrift)
    );
}
