use std::{env, fs, path::PathBuf};

use serde_json::Value;

const RELATIVE_VOCABULARIES: &str = concat!(
    "../../../../upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/",
    "trading_system_portal_contract_pack/extract/vocabularies.json"
);

fn count(document: &Value, path: &[&str]) -> usize {
    let mut value = document;
    for segment in path {
        value = &value[*segment];
    }
    value.as_array().map_or_else(
        || value.as_object().map_or(0, serde_json::Map::len),
        Vec::len,
    )
}

fn summary_value(document: &Value, key: &str) -> u64 {
    document["summary"][key]
        .as_u64()
        .unwrap_or_else(|| panic!("missing numeric vocabulary summary field: {key}"))
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let source = manifest_dir.join(RELATIVE_VOCABULARIES);
    println!("cargo:rerun-if-changed={}", source.display());

    let raw = fs::read_to_string(&source).expect("read immutable vocabulary evidence");
    let document: Value = serde_json::from_str(&raw).expect("parse vocabulary evidence");

    let expected = [
        ("python_enums", 22),
        ("db_check_constraints", 91),
        ("db_check_distinct_fields", 33),
        ("db_fields_conflated_across_tables", 7),
        ("venue_product_profiles", 6),
        ("crosschecked_concepts", 6),
        ("crosscheck_divergences", 3),
    ];
    for (key, value) in expected {
        assert_eq!(summary_value(&document, key), value, "{key} drifted");
    }
    assert_eq!(count(&document, &["python_enums"]), 22);
    assert_eq!(
        count(&document, &["db_check_vocabularies", "by_table_column"]),
        91
    );
    assert_eq!(count(&document, &["db_check_vocabularies", "by_field"]), 33);

    let generated = format!("pub const VOCABULARIES_JSON: &str = {raw:?};\n");
    let output = PathBuf::from(env::var("OUT_DIR").expect("out dir")).join("vocabularies.rs");
    fs::write(output, generated).expect("write generated vocabulary snapshot");
}
