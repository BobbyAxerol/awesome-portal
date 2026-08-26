use std::{
    env, fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use source_qualification::realtime_activation::{
    evaluate_realtime_activation, RealtimeActivationEvidence, RealtimeActivationMode,
};

const MAXIMUM_EVIDENCE_BYTES: u64 = 2 * 1024 * 1024;

fn parse_arguments() -> Result<(RealtimeActivationMode, PathBuf), &'static str> {
    let mut mode = None;
    let mut evidence = None;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        let value = arguments.next().ok_or("N08_ARGUMENT_MISSING_VALUE")?;
        match argument.as_str() {
            "--mode" if mode.is_none() => {
                mode = Some(match value.as_str() {
                    "candidate" => RealtimeActivationMode::Candidate,
                    "acceptance" => RealtimeActivationMode::Acceptance,
                    _ => return Err("N08_ARGUMENT_MODE_INVALID"),
                });
            }
            "--evidence" if evidence.is_none() => evidence = Some(PathBuf::from(value)),
            _ => return Err("N08_ARGUMENT_UNKNOWN_OR_DUPLICATE"),
        }
    }
    let mode = mode.ok_or("N08_ARGUMENT_MODE_REQUIRED")?;
    let evidence = evidence.ok_or("N08_ARGUMENT_EVIDENCE_REQUIRED")?;
    if mode == RealtimeActivationMode::Acceptance && !evidence.is_absolute() {
        return Err("N08_ACCEPTANCE_REQUIRES_ABSOLUTE_EVIDENCE_PATH");
    }
    Ok((mode, evidence))
}

fn read_evidence(path: &Path) -> Result<RealtimeActivationEvidence, &'static str> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "N08_EVIDENCE_UNREADABLE")?;
    if !metadata.file_type().is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAXIMUM_EVIDENCE_BYTES
    {
        return Err("N08_EVIDENCE_FILE_BOUNDARY_INVALID");
    }
    let bytes = fs::read(path).map_err(|_| "N08_EVIDENCE_UNREADABLE")?;
    serde_json::from_slice(&bytes).map_err(|_| "N08_EVIDENCE_JSON_INVALID")
}

fn run() -> Result<String, String> {
    let (mode, path) = parse_arguments().map_err(str::to_owned)?;
    let evidence = read_evidence(&path).map_err(str::to_owned)?;
    let report = evaluate_realtime_activation(&evidence, mode)
        .map_err(|error| error.reason_code().to_owned())?;
    serde_json::to_string(&report).map_err(|_| "N08_REPORT_SERIALIZATION_FAILED".to_owned())
}

fn main() -> ExitCode {
    match run() {
        Ok(report) => {
            println!("{report}");
            ExitCode::SUCCESS
        }
        Err(reason_code) => {
            eprintln!("N08 activation: REJECTED ({reason_code})");
            ExitCode::FAILURE
        }
    }
}
