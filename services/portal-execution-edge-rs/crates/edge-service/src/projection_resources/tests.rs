//! `TEST_ONLY` budgets and observations; never production capacity evidence.
use super::*;
use serde_json::{json, Value};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "epg10-projection-resources-{}",
            uuid::Uuid::now_v7()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn write(&self, name: &str, value: &Value) -> PathBuf {
        let path = self.0.join(name);
        std::fs::write(&path, serde_json::to_vec(value).unwrap()).unwrap();
        path
    }
    fn config(&self) -> Value {
        let observed = self.write("observation.json", &observation(1000));
        json!({"schema_version":"execution.projection-resources.v1",
            "workload_scope":"VERSIONED_04_05_ONLY", "pool_max_connections":4,
            "max_active":4,"foreground_reserved":1,"foreground_reserved_entries":1,
            "foreground_reserved_bytes":1,"max_entries":100,"max_bytes":10000,
            "storage_max_age_ms":1000,"storage_observation_file":observed,
            "storage":{"soft_used_bytes":100,"high_used_bytes":200,"hard_used_bytes":300,
                "min_free_bytes":100,"max_backlog_bytes":1000}})
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn observation(at: i64) -> Value {
    json!({"schema_version":"execution.projection-storage-observation.v1",
        "observed_at_ms":at,"used_bytes":1,"free_bytes":10000,"backlog_bytes":0})
}
fn now(at: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(at).unwrap()
}
fn parse(value: &Value) -> Config {
    serde_json::from_value(value.clone()).unwrap()
}

#[test]
fn optional_legacy_is_explicit_and_any_governed_mix_fails_before_connect() {
    assert!(require_legacy(None).is_ok());
    assert!(matches!(
        require_legacy(Some(OsStr::new("/private/resources.json"))),
        Err(ProjectionResourceError::LegacyWorkloadMix)
    ));
    for path in ["", "relative.json", " /private/resources.json"] {
        assert!(require_legacy(Some(OsStr::new(path))).is_err());
    }
    assert!(matches!(configured_path(None), Ok(None)));
}

#[test]
fn exact_config_shares_existing_budget_and_enforces_expiry_without_monitor() {
    use projection_core::resources::WorkClass;
    let f = Fixture::new();
    let config = f.config();
    let factory = ProjectionResources::from_config(parse(&config), now(1000)).unwrap();
    assert_eq!(factory.pool_max_connections, 4);
    assert_eq!(factory.resources().limits().max_active, 4);
    let copy = Arc::clone(factory.resources());
    assert!(Arc::ptr_eq(factory.resources(), &copy));
    assert!(copy
        .try_acquire(WorkClass::BackgroundWrite, 1, 1, now(2000))
        .is_ok());
    assert!(matches!(
        copy.try_acquire(WorkClass::LiveWrite, 1, 1, now(2001)),
        Err(ResourceError::StorageStale)
    ));
}

#[test]
fn pool_scope_cap_and_existing_envelope_validation_reject_unsafe_config() {
    let f = Fixture::new();
    let valid = f.config();
    for (key, bad) in [
        ("schema_version", json!("wrong")),
        ("workload_scope", json!("LEGACY_AND_VERSIONED")),
        ("pool_max_connections", json!(0)),
        ("pool_max_connections", json!(65)),
        ("pool_max_connections", json!(3)),
        ("foreground_reserved", json!(0)),
        ("foreground_reserved", json!(4)),
        ("foreground_reserved_entries", json!(100)),
        ("foreground_reserved_bytes", json!(10000)),
        ("storage_max_age_ms", json!(0)),
    ] {
        let mut invalid = valid.clone();
        invalid[key] = bad;
        assert!(
            ProjectionResources::from_config(parse(&invalid), now(1000)).is_err(),
            "{key}"
        );
    }
}

#[test]
fn storage_budget_is_required_and_must_be_monotonic() {
    let f = Fixture::new();
    let valid = f.config();
    for key in [
        "soft_used_bytes",
        "high_used_bytes",
        "hard_used_bytes",
        "min_free_bytes",
        "max_backlog_bytes",
    ] {
        let mut invalid = valid.clone();
        invalid["storage"][key] = json!(0);
        assert!(ProjectionResources::from_config(parse(&invalid), now(1000)).is_err());
    }
    let mut invalid = valid.clone();
    invalid["storage"]["high_used_bytes"] = json!(300);
    assert!(ProjectionResources::from_config(parse(&invalid), now(1000)).is_err());
    invalid.as_object_mut().unwrap().remove("storage");
    assert!(serde_json::from_value::<Config>(invalid).is_err());
}

#[test]
fn sample_missing_stale_future_or_wrong_schema_never_creates_default_observation() {
    let f = Fixture::new();
    let config = f.config();
    for sample in [
        observation(-1),
        observation(1001),
        json!({"observed_at_ms":1000}),
        json!({"schema_version":"wrong","observed_at_ms":1000,"used_bytes":1,"free_bytes":1000,"backlog_bytes":0}),
    ] {
        f.write("observation.json", &sample);
        assert!(ProjectionResources::from_config(parse(&config), now(1000)).is_err());
    }
    std::fs::remove_file(f.0.join("observation.json")).unwrap();
    assert!(ProjectionResources::from_config(parse(&config), now(1000)).is_err());
}

#[test]
fn fresh_pressure_is_preserved_and_refresh_rejects_regression_or_conflict() {
    use projection_core::resources::WorkClass;
    let f = Fixture::new();
    let config = f.config();
    let factory = ProjectionResources::from_config(parse(&config), now(1000)).unwrap();
    let mut pressure = observation(1001);
    pressure["used_bytes"] = json!(300);
    f.write("observation.json", &pressure);
    factory.refresh_at(now(1001)).unwrap();
    assert!(matches!(
        factory
            .resources()
            .try_acquire(WorkClass::LiveWrite, 1, 1, now(1001)),
        Err(ResourceError::StorageHard)
    ));
    assert!(factory
        .resources()
        .try_acquire(WorkClass::ControlRead, 1, 1, now(1001))
        .is_ok());
    f.write("observation.json", &observation(1000));
    assert!(factory.refresh_at(now(1001)).is_err());
    f.write("observation.json", &observation(1001));
    assert!(factory.refresh_at(now(1001)).is_err());
    f.write("observation.json", &observation(1002));
    factory.refresh_at(now(1002)).unwrap();
    assert!(factory
        .resources()
        .try_acquire(WorkClass::LiveWrite, 1, 1, now(1002))
        .is_ok());
}

#[test]
fn bounded_loader_rejects_duplicates_unknown_fields_and_non_files() {
    let f = Fixture::new();
    let config = f.config();
    let raw = serde_json::to_string(&config).unwrap();
    let duplicate = raw.replacen("\"max_active\":4", "\"max_active\":4,\"max_active\":4", 1);
    assert_ne!(raw, duplicate);
    assert!(serde_json::from_str::<Config>(&duplicate).is_err());
    let duplicate = raw.replacen(
        "\"min_free_bytes\":100",
        "\"min_free_bytes\":100,\"min_free_bytes\":100",
        1,
    );
    assert!(serde_json::from_str::<Config>(&duplicate).is_err());
    let mut unknown = config;
    unknown["trust_any_source"] = json!(true);
    assert!(serde_json::from_value::<Config>(unknown).is_err());
    assert!(read_bounded::<Config>(&f.0).is_err());
    assert!(read_bounded::<Config>(Path::new("relative")).is_err());
    let oversized = f.0.join("oversized");
    std::fs::write(&oversized, vec![b' '; 65_537]).unwrap();
    assert!(read_bounded::<Config>(&oversized).is_err());
}

#[cfg(unix)]
#[test]
fn symlink_and_non_unicode_config_references_are_not_silently_accepted() {
    use std::os::unix::{ffi::OsStrExt as _, fs::symlink};
    let f = Fixture::new();
    let config = f.config();
    let target = f.write("config.json", &config);
    let link = f.0.join("link.json");
    symlink(target, &link).unwrap();
    assert!(read_bounded::<Config>(&link).is_err());
    assert!(configured_path(Some(OsStr::from_bytes(b"/private/\xff"))).is_err());
}

#[cfg(feature = "pm-custody-pg-test")]
#[tokio::test]
async fn explicit_factory_connects_a_real_disposable_pg_governed_pool() {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable PG required");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    let fixture = Fixture::new();
    let config = fixture.config();
    // Explicit TEST_ONLY observation: no production disk-budget claim.
    fixture.write(
        "observation.json",
        &observation(Utc::now().timestamp_millis()),
    );
    let config_path = fixture.write("resources.json", &config);
    let factory = ProjectionResources::load(&config_path).unwrap();
    let store = factory.connect(&url).await.unwrap();
    store.require_resource_governance().unwrap();
    store.ping().await.unwrap();
    assert_eq!(factory.resources().limits().max_active, 4);
}
