//! Offline metadata transformer. Reads an explicit input JSON on stdin;
//! writes a non-installed candidate to stdout. Never accesses DB or runtime.
use std::io::{self, Read};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin()
        .take(4 * 1024 * 1024)
        .read_to_string(&mut input)?;
    let value: serde_json::Value = serde_json::from_str(&input)?;
    if let Some(wire) = value.get("wire_catalogue") {
        let decoded = manager_v2_contract::decode_success(
            &manager_v2_contract::ManagerV2Request::Catalogue,
            &serde_json::to_vec(wire)?,
        )?;
        if let manager_v2_contract::ManagerPayload::Catalogue(envelope) = decoded {
            manager_projection::validate_catalogue_for_complete_cycle(envelope.data())?;
            println!(
                "{}",
                serde_json::json!({"status":"WORKER_FEED_METADATA_VALIDATED_NOT_INSTALLED",
                "relation_count":envelope.data().relations().len(),"feed_count":manager_projection::FEEDS.len()})
            );
            return Ok(());
        }
        return Err("catalogue envelope required".into());
    }
    let catalogue = value.get("catalogue").ok_or("missing catalogue")?;
    let policy = value.get("policy").ok_or("missing policy")?;
    let candidate = if value.get("s1_m0") == Some(&serde_json::Value::Bool(true)) {
        manager_projection::target_catalogue::prepare_m0_target(catalogue, policy)?
    } else {
        manager_projection::target_catalogue::prepare_partial_target(catalogue, policy)?
    };
    println!("{}", serde_json::to_string(&candidate)?);
    Ok(())
}
