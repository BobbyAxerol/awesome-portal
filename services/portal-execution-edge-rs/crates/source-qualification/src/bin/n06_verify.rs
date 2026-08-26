use std::{
    env, fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use source_qualification::real_source::{
    qualify_real_source, QualificationMode, QualificationPrerequisites,
    RealSourceQualificationEvidence,
};

const MAXIMUM_EVIDENCE_BYTES: u64 = 2 * 1024 * 1024;

struct Arguments {
    mode: QualificationMode,
    evidence: PathBuf,
    expected_n02: Option<String>,
    expected_n03: Option<String>,
    expected_owner_window: Option<String>,
}

fn parse_arguments() -> Result<Arguments, &'static str> {
    let mut mode = None;
    let mut evidence = None;
    let mut expected_n02 = None;
    let mut expected_n03 = None;
    let mut expected_owner_window = None;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        let value = arguments.next().ok_or("N06_ARGUMENT_MISSING_VALUE")?;
        match argument.as_str() {
            "--mode" if mode.is_none() => {
                mode = Some(match value.as_str() {
                    "template" => QualificationMode::Template,
                    "candidate" => QualificationMode::Candidate,
                    "acceptance" => QualificationMode::Acceptance,
                    _ => return Err("N06_ARGUMENT_MODE_INVALID"),
                });
            }
            "--evidence" if evidence.is_none() => evidence = Some(PathBuf::from(value)),
            "--expected-n02-manifest-sha256" if expected_n02.is_none() => {
                expected_n02 = Some(value);
            }
            "--expected-n03-manifest-sha256" if expected_n03.is_none() => {
                expected_n03 = Some(value);
            }
            "--expected-owner-window-evidence-sha256" if expected_owner_window.is_none() => {
                expected_owner_window = Some(value);
            }
            _ => return Err("N06_ARGUMENT_UNKNOWN_OR_DUPLICATE"),
        }
    }
    let mode = mode.ok_or("N06_ARGUMENT_MODE_REQUIRED")?;
    let evidence = evidence.ok_or("N06_ARGUMENT_EVIDENCE_REQUIRED")?;
    if matches!(mode, QualificationMode::Template) {
        if expected_n02.is_some() || expected_n03.is_some() || expected_owner_window.is_some() {
            return Err("N06_TEMPLATE_PREREQUISITES_FORBIDDEN");
        }
    } else if expected_n02.is_none()
        || expected_n03.is_none()
        || expected_owner_window.is_none()
        || !evidence.is_absolute()
    {
        return Err("N06_ACCEPTED_PREREQUISITES_REQUIRED");
    }
    Ok(Arguments {
        mode,
        evidence,
        expected_n02,
        expected_n03,
        expected_owner_window,
    })
}

fn read_evidence(path: &Path) -> Result<RealSourceQualificationEvidence, &'static str> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "N06_EVIDENCE_UNREADABLE")?;
    if !metadata.file_type().is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAXIMUM_EVIDENCE_BYTES
    {
        return Err("N06_EVIDENCE_FILE_BOUNDARY_INVALID");
    }
    let bytes = fs::read(path).map_err(|_| "N06_EVIDENCE_UNREADABLE")?;
    serde_json::from_slice(&bytes).map_err(|_| "N06_EVIDENCE_JSON_INVALID")
}

fn run() -> Result<String, String> {
    let arguments = parse_arguments().map_err(str::to_owned)?;
    let evidence = read_evidence(&arguments.evidence).map_err(str::to_owned)?;
    let prerequisites = match (
        arguments.expected_n02.as_deref(),
        arguments.expected_n03.as_deref(),
        arguments.expected_owner_window.as_deref(),
    ) {
        (Some(n02), Some(n03), Some(owner_window)) => Some(QualificationPrerequisites {
            n02_owner_manifest_sha256: n02,
            n03_owner_manifest_sha256: n03,
            owner_window_evidence_sha256: owner_window,
        }),
        (None, None, None) => None,
        _ => return Err("N06_ACCEPTED_PREREQUISITES_REQUIRED".to_owned()),
    };
    let report = qualify_real_source(&evidence, arguments.mode, prerequisites)
        .map_err(|error| error.reason_code().to_owned())?;
    serde_json::to_string(&report).map_err(|_| "N06_REPORT_SERIALIZATION_FAILED".to_owned())
}

fn main() -> ExitCode {
    match run() {
        Ok(report) => {
            println!("{report}");
            ExitCode::SUCCESS
        }
        Err(reason_code) => {
            eprintln!("N06 qualification: REJECTED ({reason_code})");
            ExitCode::FAILURE
        }
    }
}
