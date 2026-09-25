"""P07 single-file Research Alpha parser and restricted-definition analyser.

This module intentionally does *not* import, instantiate, or call an uploaded
strategy.  A browser supplies one bounded Python source string to the Control
API; the Control API holds the bytes and calls this private adapter only for
AST/literal analysis.  The only ``exec`` below receives a rebuilt AST that
contains a literal ``ALPHA_CONTRACT`` assignment and an undecorated function
definition with no defaults or annotations.  Defining that function does not
run its body.  It is therefore a structural entrypoint check, not a runtime
security certificate, a dependency installer, or a causality proof.

P10 owns any future worker-side execution adapter.  Keeping this distinction
explicit prevents P07 from turning a convenient import wizard into an arbitrary
code-execution path.
"""

from __future__ import annotations

import ast
import hashlib
import json
import math
import re
import time
from dataclasses import dataclass
from typing import Any, Literal

SOURCE_SCHEMA_VERSION = "research.alpha-source.v1"
ANALYSIS_SCHEMA_VERSION = "research.alpha-analysis.v1"
MAX_SOURCE_BYTES = 256 * 1024
MAX_AST_NODES = 20_000
MAX_AST_DEPTH = 96
MAX_PARAMETERS = 12
SUPPORTED_CANDLE_COLUMNS = frozenset({"open", "high", "low", "close", "volume"})

_FILENAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}[.]py$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,127}$")
_SEMVER_RE = re.compile(r"^[0-9]+[.][0-9]+[.][0-9]+$")
_TIMEFRAME_RE = re.compile(r"^[1-9][0-9]*(?:m|h|d|w)$")
_PARAMETER_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


@dataclass(frozen=True, slots=True)
class GateFacts:
    contract_complete: bool
    contract_message: str
    entrypoint_restricted_definition_load: bool
    entrypoint_message: str
    parameter_space_sane: bool
    parameter_message: str
    determinism_declared: bool
    determinism_message: str
    data_contract_known: bool
    data_contract_message: str
    no_lookahead_static_scan: bool
    no_lookahead_message: str

    def as_dict(self) -> dict[str, object]:
        return {
            "contract_complete": self.contract_complete,
            "contract_message": self.contract_message,
            "entrypoint_restricted_definition_load": self.entrypoint_restricted_definition_load,
            "entrypoint_message": self.entrypoint_message,
            "parameter_space_sane": self.parameter_space_sane,
            "parameter_message": self.parameter_message,
            "determinism_declared": self.determinism_declared,
            "determinism_message": self.determinism_message,
            "data_contract_known": self.data_contract_known,
            "data_contract_message": self.data_contract_message,
            "no_lookahead_static_scan": self.no_lookahead_static_scan,
            "no_lookahead_message": self.no_lookahead_message,
        }


@dataclass(frozen=True, slots=True)
class AlphaSourceAnalysis:
    source_digest: str
    analysis_digest: str
    parse_ok: bool
    declared_contract: dict[str, object]
    mirror: tuple[dict[str, object], ...]
    gate_facts: GateFacts
    # CG-P07-04: wall time of each analyser check in microseconds. Measured,
    # therefore nondeterministic, therefore excluded from analysis_digest.
    gate_timings_us: dict[str, int] | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "schema_version": ANALYSIS_SCHEMA_VERSION,
            "source_digest": self.source_digest,
            "analysis_digest": self.analysis_digest,
            "parse_ok": self.parse_ok,
            "declared_contract": self.declared_contract,
            "mirror": list(self.mirror),
            "gate_facts": self.gate_facts.as_dict(),
            "gate_timings_us": dict(self.gate_timings_us or {}),
        }


def analyze_alpha_source(source_text: str, original_filename: str) -> AlphaSourceAnalysis:
    """Return a bounded, deterministic mirror and server gate facts.

    The source is never written here and never executed as submitted.  The
    caller owns source custody and exact-byte TOCTOU checks.
    """

    _require_source_input(source_text, original_filename)
    source_bytes = source_text.encode("utf-8")
    source_digest = hashlib.sha256(source_bytes).hexdigest()
    timings: dict[str, int] = {}

    def timed(name: str, check):
        started = time.perf_counter_ns()
        try:
            return check()
        finally:
            timings[name] = max(0, (time.perf_counter_ns() - started) // 1_000)

    try:
        tree = timed("parse", lambda: ast.parse(source_text, filename=original_filename, mode="exec"))
    except SyntaxError:
        failed = _analysis_from_failure(
            source_digest,
            "Source syntax is invalid; gates cannot run until the file parses.",
        )
        return _with_timings(failed, timings)

    shape_error = _bounded_tree_error(tree)
    if shape_error is not None:
        return _with_timings(_analysis_from_failure(source_digest, shape_error), timings)

    def contract_check():
        extracted = _extract_module_contract(tree)
        return extracted, _validate_contract(extracted[0], extracted[1])

    (contract, contract_error, entrypoint_node, entrypoint_error), (contract_ok, normalized_contract, contract_message) = timed(
        "contract_complete", contract_check
    )
    entrypoint_ok, entrypoint_message = timed("entrypoint_restricted_definition_load", lambda: _restricted_definition_check(
        tree,
        normalized_contract.get("entrypoint"),
        entrypoint_node,
        entrypoint_error,
    ))
    parameter_ok, parameter_message = timed("parameter_space_sane", lambda: _validate_parameter_space(
        normalized_contract.get("parameter_space")
    ))
    determinism_ok, determinism_message = timed("determinism_declared", lambda: _validate_determinism(
        normalized_contract.get("determinism")
    ))
    data_ok, data_message = timed("data_contract_known", lambda: _validate_data_contract(
        normalized_contract.get("required_columns"), normalized_contract.get("timeframes")
    ))
    lookahead_ok, lookahead_message = timed("no_lookahead_static_scan", lambda: _static_lookahead_scan(tree))
    facts = GateFacts(
        contract_complete=contract_ok,
        contract_message=contract_message,
        entrypoint_restricted_definition_load=entrypoint_ok,
        entrypoint_message=entrypoint_message,
        parameter_space_sane=parameter_ok,
        parameter_message=parameter_message,
        determinism_declared=determinism_ok,
        determinism_message=determinism_message,
        data_contract_known=data_ok,
        data_contract_message=data_message,
        no_lookahead_static_scan=lookahead_ok,
        no_lookahead_message=lookahead_message,
    )
    mirror = _mirror(normalized_contract, facts, source_digest)
    analysis_digest = _analysis_digest(
        source_digest=source_digest,
        parse_ok=True,
        declared_contract=normalized_contract,
        mirror=mirror,
        facts=facts,
    )
    return AlphaSourceAnalysis(
        source_digest=source_digest,
        analysis_digest=analysis_digest,
        parse_ok=True,
        declared_contract=normalized_contract,
        mirror=mirror,
        gate_facts=facts,
        gate_timings_us=timings,
    )


def _with_timings(analysis: AlphaSourceAnalysis, timings: dict[str, int]) -> AlphaSourceAnalysis:
    return AlphaSourceAnalysis(
        source_digest=analysis.source_digest,
        analysis_digest=analysis.analysis_digest,
        parse_ok=analysis.parse_ok,
        declared_contract=analysis.declared_contract,
        mirror=analysis.mirror,
        gate_facts=analysis.gate_facts,
        gate_timings_us=timings,
    )


def _require_source_input(source_text: str, original_filename: str) -> None:
    if not isinstance(source_text, str):
        raise ValueError("source_text must be a UTF-8 string")
    if not _FILENAME_RE.fullmatch(original_filename):
        raise ValueError("single-file contract requires one bounded .py filename")
    encoded = source_text.encode("utf-8")
    if not encoded or len(encoded) > MAX_SOURCE_BYTES:
        raise ValueError("source_text is outside the bounded single-file contract")


def _bounded_tree_error(tree: ast.AST) -> str | None:
    count = 0
    stack: list[tuple[ast.AST, int]] = [(tree, 1)]
    while stack:
        node, depth = stack.pop()
        count += 1
        if count > MAX_AST_NODES:
            return "Source AST exceeds the bounded import contract."
        if depth > MAX_AST_DEPTH:
            return "Source AST nesting exceeds the bounded import contract."
        stack.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
    return None


def _extract_module_contract(
    tree: ast.Module,
) -> tuple[dict[str, object], str | None, ast.FunctionDef | None, str | None]:
    """Extract only literal contract data and one side-effect-free definition."""

    contract: dict[str, object] | None = None
    entrypoint: ast.FunctionDef | None = None
    contract_error: str | None = None
    entrypoint_error: str | None = None

    for index, statement in enumerate(tree.body):
        if index == 0 and _is_docstring(statement):
            continue
        if isinstance(statement, ast.Assign) and _is_contract_assignment(statement):
            if contract is not None:
                contract_error = "ALPHA_CONTRACT may be assigned exactly once."
                continue
            try:
                value = ast.literal_eval(statement.value)
            except (ValueError, TypeError, MemoryError, RecursionError):
                contract_error = "ALPHA_CONTRACT must be a literal object."
                continue
            if not isinstance(value, dict):
                contract_error = "ALPHA_CONTRACT must be a literal object."
                continue
            contract = value
            continue
        if isinstance(statement, ast.FunctionDef):
            if entrypoint is not None:
                entrypoint_error = "The single-file v1 contract permits one entrypoint definition."
                continue
            entrypoint = statement
            continue
        if isinstance(statement, (ast.Import, ast.ImportFrom)):
            entrypoint_error = "Top-level imports are not permitted in the single-file v1 contract."
            continue
        entrypoint_error = "Only a literal ALPHA_CONTRACT and one entrypoint definition are permitted at module scope."

    if contract is None and contract_error is None:
        contract_error = "ALPHA_CONTRACT is required."
    if entrypoint is None and entrypoint_error is None:
        entrypoint_error = "One entrypoint function is required."
    return contract or {}, contract_error, entrypoint, entrypoint_error


def _is_docstring(statement: ast.stmt) -> bool:
    return isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant) and isinstance(statement.value.value, str)


def _is_contract_assignment(statement: ast.Assign) -> bool:
    return len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name) and statement.targets[0].id == "ALPHA_CONTRACT"


def _validate_contract(
    contract: dict[str, object], extraction_error: str | None
) -> tuple[bool, dict[str, object], str]:
    normalized = _json_compatible_contract(contract)
    required = {
        "schema_version",
        "version",
        "entrypoint",
        "timeframes",
        "required_columns",
        "warmup_bars",
        "determinism",
        "parameter_space",
    }
    if extraction_error is not None:
        return False, normalized, extraction_error
    missing = sorted(key for key in required if key not in normalized)
    if missing:
        return False, normalized, f"ALPHA_CONTRACT is missing required fields: {', '.join(missing)}."
    if normalized.get("schema_version") != SOURCE_SCHEMA_VERSION:
        return False, normalized, f"schema_version must be {SOURCE_SCHEMA_VERSION}."
    version = normalized.get("version")
    if not isinstance(version, str) or not _SEMVER_RE.fullmatch(version):
        return False, normalized, "version must be a semantic version such as 0.3.0."
    entrypoint = normalized.get("entrypoint")
    if not isinstance(entrypoint, str) or not _IDENTIFIER_RE.fullmatch(entrypoint):
        return False, normalized, "entrypoint must be one bounded Python identifier."
    warmup = normalized.get("warmup_bars")
    if not isinstance(warmup, int) or isinstance(warmup, bool) or warmup < 0 or warmup > 100_000:
        return False, normalized, "warmup_bars must be a bounded non-negative integer."
    return True, normalized, "Contract fields are complete."


def _json_compatible_contract(value: object) -> dict[str, object]:
    """Reject non-JSON literal values instead of silently coercing them."""

    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
        parsed = json.loads(encoded)
    except (TypeError, ValueError, OverflowError, RecursionError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _restricted_definition_check(
    tree: ast.Module,
    declared_entrypoint: object,
    entrypoint: ast.FunctionDef | None,
    extraction_error: str | None,
) -> tuple[bool, str]:
    if extraction_error is not None:
        return False, extraction_error
    if not isinstance(declared_entrypoint, str) or entrypoint is None:
        return False, "Declared entrypoint is not available for restricted-definition loading."
    if entrypoint.name != declared_entrypoint:
        return False, "The declared entrypoint does not match the source function name."
    if entrypoint.decorator_list or entrypoint.returns is not None or getattr(entrypoint, "type_params", ()):
        return False, "Entrypoint decorators, return annotations and type parameters are not permitted."
    args = entrypoint.args
    if (
        args.defaults
        or args.kw_defaults
        or args.vararg is not None
        or args.kwarg is not None
        or any(argument.annotation is not None for argument in [*args.posonlyargs, *args.args, *args.kwonlyargs])
    ):
        return False, "Entrypoint defaults, variadics and annotations are not permitted in v1."
    contract_assignment = next(
        (statement for statement in tree.body if isinstance(statement, ast.Assign) and _is_contract_assignment(statement)),
        None,
    )
    if contract_assignment is None:
        return False, "ALPHA_CONTRACT is not available for restricted-definition loading."
    # Compile only the safe declaration pair.  The submitted module is never
    # imported; the function body is defined but never called.
    sandbox_module = ast.fix_missing_locations(ast.Module(body=[contract_assignment, entrypoint], type_ignores=[]))
    namespace: dict[str, object] = {"__builtins__": {}}
    try:
        exec(compile(sandbox_module, "<research-alpha-definition>", "exec"), namespace, namespace)  # noqa: S102
    except (SyntaxError, TypeError, ValueError, MemoryError, RecursionError):
        return False, "Restricted-definition loading rejected the entrypoint."
    loaded = namespace.get(declared_entrypoint)
    if not callable(loaded):
        return False, "Restricted-definition loading did not produce the declared entrypoint."
    return True, "Restricted-definition sandbox loaded the entrypoint without calling strategy code."


def _validate_parameter_space(value: object) -> tuple[bool, str]:
    if not isinstance(value, dict):
        return False, "parameter_space must be a literal object."
    if len(value) > MAX_PARAMETERS:
        return False, f"parameter_space declares {len(value)} parameters; the maximum is {MAX_PARAMETERS}."
    for name, spec in value.items():
        if not isinstance(name, str) or not _PARAMETER_RE.fullmatch(name):
            return False, "parameter_space names must be bounded Python identifiers."
        if not isinstance(spec, dict):
            return False, f"parameter_space.{name} must be an object."
        kind = spec.get("kind")
        if kind == "fixed":
            if set(spec) != {"kind", "value"}:
                return False, f"parameter_space.{name} fixed shape is invalid."
            continue
        if kind in {"int_range", "float_range"}:
            if set(spec) != {"kind", "low", "high", "step"}:
                return False, f"parameter_space.{name} range shape is invalid."
            low, high, step = spec["low"], spec["high"], spec["step"]
            if not _finite_number(low) or not _finite_number(high) or not _finite_number(step):
                return False, f"parameter_space.{name} range values must be finite numbers."
            if kind == "int_range" and any(not isinstance(item, int) or isinstance(item, bool) for item in (low, high, step)):
                return False, f"parameter_space.{name} int_range values must be integers."
            if low > high or step <= 0:
                return False, f"parameter_space.{name} bounds or step are invalid."
            continue
        if kind == "categorical":
            values = spec.get("values")
            if set(spec) != {"kind", "values"} or not isinstance(values, list) or not values or len(values) > 64:
                return False, f"parameter_space.{name} categorical shape is invalid."
            continue
        return False, f"parameter_space.{name} has an unsupported kind."
    return True, f"parameter_space is sane ({len(value)} declared parameters, maximum {MAX_PARAMETERS})."


def _finite_number(value: object) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _validate_determinism(value: object) -> tuple[bool, str]:
    if not isinstance(value, dict) or set(value) != {"seed_required"} or not isinstance(value.get("seed_required"), bool):
        return False, "determinism.seed_required must be declared as true or false."
    return True, "determinism.seed_required is declared."


def _validate_data_contract(columns: object, timeframes: object) -> tuple[bool, str]:
    if not isinstance(columns, list) or not columns or len(columns) > len(SUPPORTED_CANDLE_COLUMNS):
        return False, "required_columns must be a non-empty bounded list."
    if not all(isinstance(column, str) and column in SUPPORTED_CANDLE_COLUMNS for column in columns):
        return False, "required_columns contains a column not published by the P04 candle contract."
    if len(columns) != len(set(columns)):
        return False, "required_columns must not contain duplicates."
    if not isinstance(timeframes, list) or not timeframes or len(timeframes) > 12:
        return False, "timeframes must be a non-empty bounded list."
    if not all(isinstance(timeframe, str) and _TIMEFRAME_RE.fullmatch(timeframe) for timeframe in timeframes):
        return False, "timeframes contains an unsupported interval declaration."
    if len(timeframes) != len(set(timeframes)):
        return False, "timeframes must not contain duplicates."
    return True, "Data contract is within the published P04 candle columns and interval syntax."


def _static_lookahead_scan(tree: ast.AST) -> tuple[bool, str]:
    suspicious: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id.lower() in {"lookahead", "future", "lead"}:
            suspicious.append(node.id)
        elif isinstance(node, ast.Attribute) and node.attr.lower() in {"lookahead", "future", "lead"}:
            suspicious.append(node.attr)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "shift":
            if node.args and isinstance(node.args[0], ast.UnaryOp) and isinstance(node.args[0].op, ast.USub):
                suspicious.append("shift(-n)")
    if suspicious:
        return False, "Static scan found a potential future-data reference; revise the source before import."
    return True, "Static scan found no configured future-data heuristic. This is not a runtime causality certificate."


NOT_IN_V1_NOTE = (
    "Not part of the v1 single-file contract (DQ-05); nothing is inferred for it."
)


def _mirror(
    contract: dict[str, object],
    facts: GateFacts | None = None,
    source_digest: str | None = None,
) -> tuple[dict[str, object], ...]:
    """CG-P07-03: the HiFi's 14-field mirror, within what v1 can prove (DQ-05).

    Each row says where its value came from (``state``), which gate checks it
    (``gate``) and that gate's verdict (``check``). Fields the v1 literal
    contract cannot carry are listed as ``not_in_contract`` — visible, never
    filled with a guess. ``strategy_id``/``display_name`` are assigned at
    registration (DQ-07), so parse reports them as server-assigned.
    """

    def verdict(gate_passed: bool | None, present: bool) -> str:
        if not present:
            return "GATED"
        if gate_passed is None:
            return "VERIFY"
        return "PASS" if gate_passed else "FAIL"

    determinism = contract.get("determinism") if isinstance(contract.get("determinism"), dict) else None
    seed_required = determinism.get("seed_required") if determinism else None
    parsed_rows = (
        ("version", contract.get("version"), "contract-complete", facts.contract_complete if facts else None,
         "Semantic version; a new version is a new immutable AlphaVersion."),
        ("entrypoint", contract.get("entrypoint"), "entrypoint-importable",
         facts.entrypoint_restricted_definition_load if facts else None,
         "One plain function, defined in a restricted namespace and never called."),
        ("timeframes", contract.get("timeframes"), "data-contract-known", facts.data_contract_known if facts else None,
         "Declared bar intervals; New Run offers only these."),
        ("required_columns", contract.get("required_columns"), "data-contract-known",
         facts.data_contract_known if facts else None, "Must be a subset of the published OHLCV candle columns."),
        ("warmup_bars", contract.get("warmup_bars"), "contract-complete", facts.contract_complete if facts else None,
         "Bars before the first window; preflight checks the source has them."),
        ("determinism.seed_required", seed_required, "determinism-declared",
         facts.determinism_declared if facts else None, "Declared true or false; a required seed is enforced at preflight."),
        ("parameter_space", contract.get("parameter_space"), "parameter-space-sane",
         facts.parameter_space_sane if facts else None, "The maximal surface; New Run pins or sweeps within it."),
        ("version_note", contract.get("version_note"), None, None,
         "Optional free text; no gate reads it."),
    )
    rows: list[dict[str, object]] = [
        {
            "field": "strategy_id",
            "state": "server_assigned",
            "check": "NOT_APPLICABLE",
            "gate": None,
            "note": "Assigned at registration as the alpha_id (DQ-07); never read from the file.",
        },
        {
            "field": "display_name",
            "state": "server_assigned",
            "check": "NOT_APPLICABLE",
            "gate": None,
            "note": "Assigned at registration; the v1 file does not declare it.",
        },
    ]
    for name, value, gate, gate_passed, note in parsed_rows:
        present = value is not None
        rows.append({
            "field": name,
            "state": "parsed" if present else "missing",
            **({"value": value} if present else {}),
            "check": verdict(gate_passed, present) if gate is not None else ("VERIFY" if present else "GATED"),
            "gate": gate,
            "note": note if present else "This field is not declared in the submitted source; no value has been inferred.",
        })
    rows.insert(4, {
        "field": "default_timeframe",
        "state": "not_in_contract",
        "check": "NOT_APPLICABLE",
        "gate": None,
        "note": "v1 declares a timeframe list, not a default; New Run makes the reader choose.",
    })
    rows.append({
        "field": "artifact.digest",
        "state": "server_computed" if source_digest else "missing",
        **({"value": f"sha256:{source_digest}"} if source_digest else {}),
        "check": "PASS" if source_digest else "GATED",
        "gate": None,
        "note": "SHA-256 of the exact submitted bytes, computed by the server; gate 3 checks it is not already registered.",
    })
    for name in ("structural_contract", "supported_endpoint_ids", "execution_contracts", "output_contract"):
        rows.append({
            "field": name,
            "state": "not_in_contract",
            "check": "NOT_APPLICABLE",
            "gate": None,
            "note": NOT_IN_V1_NOTE,
        })
    return tuple(rows)


def _analysis_from_failure(source_digest: str, message: str) -> AlphaSourceAnalysis:
    facts = GateFacts(
        contract_complete=False,
        contract_message=message,
        entrypoint_restricted_definition_load=False,
        entrypoint_message="SKIPPED because source parsing failed.",
        parameter_space_sane=False,
        parameter_message="SKIPPED because source parsing failed.",
        determinism_declared=False,
        determinism_message="SKIPPED because source parsing failed.",
        data_contract_known=False,
        data_contract_message="SKIPPED because source parsing failed.",
        no_lookahead_static_scan=False,
        no_lookahead_message="SKIPPED because source parsing failed; no causality claim is made.",
    )
    mirror = _mirror({})
    analysis_digest = _analysis_digest(
        source_digest=source_digest,
        parse_ok=False,
        declared_contract={},
        mirror=mirror,
        facts=facts,
    )
    return AlphaSourceAnalysis(
        source_digest=source_digest,
        analysis_digest=analysis_digest,
        parse_ok=False,
        declared_contract={},
        mirror=mirror,
        gate_facts=facts,
    )


def _analysis_digest(
    *,
    source_digest: str,
    parse_ok: bool,
    declared_contract: dict[str, object],
    mirror: tuple[dict[str, object], ...],
    facts: GateFacts,
) -> str:
    payload = {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "source_digest": source_digest,
        "parse_ok": parse_ok,
        "declared_contract": declared_contract,
        "mirror": list(mirror),
        "gate_facts": facts.as_dict(),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


__all__ = [
    "ANALYSIS_SCHEMA_VERSION",
    "MAX_SOURCE_BYTES",
    "SOURCE_SCHEMA_VERSION",
    "AlphaSourceAnalysis",
    "GateFacts",
    "analyze_alpha_source",
]
