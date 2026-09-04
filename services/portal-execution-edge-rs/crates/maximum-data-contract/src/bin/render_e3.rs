#![forbid(unsafe_code)]

use std::process::ExitCode;

use maximum_data_contract::MaximumDataContract;

fn main() -> ExitCode {
    match render() {
        Ok(output) => {
            print!("{output}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("maximum-data E3 renderer failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn render() -> Result<String, String> {
    let selection = std::env::args().nth(1).ok_or_else(|| {
        "usage: render_e3 <screen-field|action|derived-metric|work-order>".to_owned()
    })?;
    let contract = MaximumDataContract::canonical().map_err(|error| error.to_string())?;
    match selection.as_str() {
        "screen-field" => contract
            .render_screen_field_csv()
            .map_err(|error| error.to_string()),
        "action" => contract
            .render_action_csv()
            .map_err(|error| error.to_string()),
        "derived-metric" => contract
            .render_derived_metric_csv()
            .map_err(|error| error.to_string()),
        "work-order" => contract
            .render_downstream_work_orders_csv()
            .map_err(|error| error.to_string()),
        _ => Err("usage: render_e3 <screen-field|action|derived-metric|work-order>".to_owned()),
    }
}
