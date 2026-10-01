"""P11 durable, bounded progress journal for one Research worker attempt.

The journal is deliberately separate from the legacy ``RunManager`` console
files.  A console is an operational aid and must never be parsed into a
Research state.  Instead, the worker writes small, structured lifecycle
events, atomically materialises a snapshot, and keeps a bounded segment ring.

The Control API may receive the events eagerly through the private callback,
but this local journal is still the recovery authority when that callback or a
Control API replica is unavailable.  It contains no credential, source path,
raw market row or broker detail.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_PREVIEW_LONG_CPU_SECONDS,
    delta_wfo_preview_long_enabled,
)
from portal_api.serialization import canonicalize


_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
_STAGES = ("S1", "S2", "S3", "S4", "S5")
_TERMINAL = {"COMPLETED", "FAILED"}
_FOLD_SEGMENT_KINDS = ("search", "oos", "freeze_tick")
_FOLD_SEGMENT_STATES = {"RUNNING", "DONE", "FAILED"}
_METHODOLOGY_CERTIFICATE_GRADES = {"A", "B", "C", "D"}
_MAX_EVENT_BYTES = 2_048
_P04_CPU_SECONDS = 45
_MAX_PROFILE_CPU_SECONDS = 120


def _max_profile_cpu_seconds() -> int:
    """120, or the research-preview long WFO cap while that flag is on."""

    return DELTA_WFO_PREVIEW_LONG_CPU_SECONDS if delta_wfo_preview_long_enabled() else _MAX_PROFILE_CPU_SECONDS
_MAX_EVIDENCE_BYTES = 28 * 1024
# P14's chronology receipt contains only named time-role facts.  It is much
# smaller than a P13 chart/evidence passport and may never become a market
# data, holdout value, worker custody or artifact-path channel.
_MAX_SPLIT_BYTES = 16 * 1024
# The control-plane compact projection must remain cheap to page and fan out.
# This is deliberately larger than a single event (it carries up to 256 fold
# summaries and 128 artifact cards) but substantially below Fastify's default
# request limit and the PostgreSQL materialisation cap. A later detailed
# artifact/log reader owns history beyond this compact progress surface.
_MAX_SNAPSHOT_BYTES = 256 * 1_024
_SEGMENT_EVENTS = 128
_MAX_SEGMENTS = 80  # 10,240 structured events; browser only ever receives 500.
_SIGNED_DECIMAL_RE = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?")
_DIGEST_RE = re.compile(r"[0-9a-f]{64}")
_FOLD_SELECTION_SCOPES = {"GLOBAL_STUDY", "FIXED_PROFILE", "IMPORTED_FIXED_PROFILE"}
_USAGE_MAXIMA = {
    "peak_rss_bytes": 4 * 1024 * 1024 * 1024,
    # Largest admitted child CPU cap (W1 Delta WFO profile). Each journal
    # additionally enforces its own profile cap (P04: 45) in ``emit``.
    "cpu_seconds": _MAX_PROFILE_CPU_SECONDS,
    "scratch_bytes": 4 * 1024 * 1024 * 1024,
    "fd_peak": 65_536,
}
# Profile-specific wording for the two source-built claim sentences and the
# claim line. The P04 sentences are unchanged byte-for-byte.
_PROFILE_COPY = {
    "P04_FIXED": {
        "forecast": "The fixed qualification has not sealed a publishable claim.",
        "not_issued": "The fixed P10 qualification sealed its artifacts but did not issue a release claim.",
        "claimed": "worker claimed durable P10 qualification",
    },
    "DELTA_WFO": {
        "forecast": "The walk-forward study has not sealed a publishable claim.",
        "not_issued": "The Delta walk-forward study sealed its artifacts but did not issue a release claim.",
        "claimed": "worker claimed durable P10 walk-forward study",
    },
    # W5a A10c: a diagnostic evaluates a grid for its parent; it never
    # selects, freezes or claims anything of its own.
    "DELTA_WHATIF": {
        "forecast": "The what-if diagnostic does not issue a claim; it seals one evaluation grid for its parent run.",
        "not_issued": "The what-if diagnostic sealed its evaluation grid; a diagnostic never issues a release claim.",
        "claimed": "worker claimed durable P16 what-if diagnostic",
    },
    "IMPORTED_ALPHA": {
        "forecast": "The restricted imported Alpha qualification has not sealed a publishable claim.",
        "not_issued": "The restricted imported Alpha qualification sealed its artifacts but did not issue a release claim.",
        "claimed": "worker claimed durable E17 imported Alpha qualification",
    },
}


class ResearchProgressError(RuntimeError):
    """A malformed or impossible worker progress transition."""


def _now_ms() -> int:
    return int(time.time() * 1_000)


def _identifier(value: str, label: str) -> str:
    if not _ID_RE.fullmatch(value):
        raise ResearchProgressError(f"P11 {label} is invalid")
    return value


def _bounded_json(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ResearchProgressError(f"P11 {label} must be an object")
    try:
        encoded = json.dumps(canonicalize(value), sort_keys=True, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ResearchProgressError(f"P11 {label} is not JSON serializable") from exc
    if len(encoded) > _MAX_EVENT_BYTES:
        raise ResearchProgressError(f"P11 {label} exceeds the bounded event budget")
    return canonicalize(value)


def _positive_integer(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise ResearchProgressError(f"P11 {label} is invalid")
    return value


def _utc_milliseconds(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 9_007_199_254_740_991:
        raise ResearchProgressError(f"P11 {label} is invalid")
    return value


def _not_published_fold_timeline() -> dict[str, Any]:
    """Return the only truthful P04 default for S03's detailed Gantt.

    The fixed P04 adapter reports a whole-fold start/completion today.  It
    does *not* report real per-fold search/OOS/freeze timestamps.  Keeping
    this explicit avoids a browser splitting one duration into a methodology
    that the worker never observed.
    """

    return {
        "state": "NOT_PUBLISHED",
        "reason_code": "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
        "segments": [],
    }


def _not_published_fold_selection() -> dict[str, Any]:
    """The only truthful default until the source's ``fold_completed`` says."""

    return {
        "state": "NOT_PUBLISHED",
        "scope": None,
        "trial": None,
        "objective": None,
        "params_digest": None,
        "reason_code": "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION",
    }


def _signed_decimal_or_none(value: object, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, str) or len(value) > 96 or not _SIGNED_DECIMAL_RE.fullmatch(value):
        raise ResearchProgressError(f"P11 {label} is invalid")


def _validate_fold_selection(value: object) -> None:
    if not isinstance(value, dict):
        raise ResearchProgressError("P11 fold selection is invalid")
    _exact_payload(value, event_type="fold selection", required={"scope", "trial", "objective", "params_digest"})
    if value.get("scope") not in _FOLD_SELECTION_SCOPES:
        raise ResearchProgressError("P11 fold selection scope is invalid")
    _positive_integer(value.get("trial"), "fold selection trial")
    _signed_decimal_or_none(value.get("objective"), "fold selection objective")
    if value.get("scope") == "FIXED_PROFILE" and value.get("objective") is not None:
        raise ResearchProgressError("P11 a fixed profile publishes no search objective")
    digest = value.get("params_digest")
    if not isinstance(digest, str) or not _DIGEST_RE.fullmatch(digest):
        raise ResearchProgressError("P11 fold selection digest is invalid")


def _validate_handoff_cursor(value: object) -> None:
    if not isinstance(value, dict):
        raise ResearchProgressError("P11 hand-off cursor is invalid")
    _exact_payload(value, event_type="hand-off cursor", required={"fold", "trial", "params_digest"})
    _positive_integer(value.get("fold"), "hand-off fold")
    _positive_integer(value.get("trial"), "hand-off trial")
    digest = value.get("params_digest")
    if not isinstance(digest, str) or not _DIGEST_RE.fullmatch(digest):
        raise ResearchProgressError("P11 hand-off digest is invalid")


def _derived_overall_pct(snapshot: dict[str, Any]) -> int:
    """Stage-weighted, monotonic progress from source facts only (CG-P10-04).

    S1 5, S2 8, S3 10; the trial study spans 10..80 in proportion to
    ``trials_done / trials_declared``; S4 closed 85; sealing 90; S5 closed 95;
    100 only at ``run_completed``. The OpenAPI publishes the same table.
    """

    if snapshot["status"] == "COMPLETED":
        return 100
    stages = {item["key"]: item["state"] for item in snapshot["stages"]}
    overall = snapshot["overall"]
    pct = 0
    if stages.get("S1") == "DONE":
        pct = 5
    if stages.get("S2") == "DONE":
        pct = 8
    if stages.get("S3") == "DONE":
        pct = 10
    done = int(overall.get("trials_done", 0))
    declared = max(1, int(overall.get("trials_declared", 1)))
    if done > 0 or stages.get("S4") in {"RUNNING", "DONE"}:
        pct = max(pct, 10 + (70 * min(done, declared)) // declared)
    if stages.get("S4") == "DONE":
        pct = max(pct, 85)
    if snapshot["readiness"].get("mandatory") in {"SEALING", "SEALED"} or stages.get("S5") == "RUNNING":
        pct = max(pct, 90)
    if stages.get("S5") == "DONE":
        pct = max(pct, 95)
    return min(pct, 99)


def _not_published_methodology_certificate() -> dict[str, Any]:
    """Return a typed absence, never a grade parsed from claim prose.

    A methodology A–D certificate is distinct from the engine's L0–L4
    capability ceiling.  The P04 receipt does not currently issue either a
    run certificate fact or a certificate chain, so a completed claim cannot
    manufacture one at the Portal boundary.
    """

    return {
        "state": "NOT_PUBLISHED",
        "grade": None,
        "issued_at_utc_ms": None,
        "reason_code": "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
    }


def _validate_fold_segment(payload: dict[str, Any]) -> None:
    _exact_payload(
        payload,
        event_type="fold segment",
        required={"fold", "kind", "state", "started_at_utc_ms", "completed_at_utc_ms"},
    )
    _positive_integer(payload.get("fold"), "fold segment number")
    if payload.get("kind") not in _FOLD_SEGMENT_KINDS:
        raise ResearchProgressError("P11 fold segment kind is invalid")
    state = payload.get("state")
    if state not in _FOLD_SEGMENT_STATES:
        raise ResearchProgressError("P11 fold segment state is invalid")
    started_at = _utc_milliseconds(payload.get("started_at_utc_ms"), "fold segment start")
    completed_at = payload.get("completed_at_utc_ms")
    if state == "RUNNING":
        if completed_at is not None:
            raise ResearchProgressError("P11 running fold segment cannot have a completion timestamp")
        return
    completed_at = _utc_milliseconds(completed_at, "fold segment completion")
    if completed_at < started_at:
        raise ResearchProgressError("P11 fold segment completion precedes its start")


def _validate_methodology_certificate(value: object, *, label: str) -> None:
    if not isinstance(value, dict):
        raise ResearchProgressError(f"P11 {label} is invalid")
    _exact_payload(
        value,
        event_type=label,
        required={"state", "grade", "issued_at_utc_ms", "reason_code"},
    )
    state = value.get("state")
    grade = value.get("grade")
    issued_at = value.get("issued_at_utc_ms")
    reason_code = value.get("reason_code")
    if state == "NOT_PUBLISHED":
        if (
            grade is not None
            or issued_at is not None
            or reason_code != "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE"
        ):
            raise ResearchProgressError(f"P11 {label} not-published shape is invalid")
        return
    if state == "NOT_ISSUED":
        if (
            grade is not None
            or issued_at is not None
            or reason_code != "SOURCE_DECLARED_METHODOLOGY_CERTIFICATE_NOT_ISSUED"
        ):
            raise ResearchProgressError(f"P11 {label} not-issued shape is invalid")
        return
    if state == "ISSUED":
        if grade not in _METHODOLOGY_CERTIFICATE_GRADES or reason_code is not None:
            raise ResearchProgressError(f"P11 {label} issued shape is invalid")
        _utc_milliseconds(issued_at, f"{label} issued timestamp")
        return
    raise ResearchProgressError(f"P11 {label} state is invalid")


def _exact_payload(
    payload: dict[str, Any],
    *,
    event_type: str,
    required: set[str] | None = None,
    optional: set[str] | None = None,
) -> None:
    required = required or set()
    optional = optional or set()
    keys = set(payload)
    if not required.issubset(keys) or keys - required - optional:
        raise ResearchProgressError(f"P11 {event_type} payload shape is invalid")


def _validate_payload(event_type: str, payload: dict[str, Any]) -> None:
    """Reject malformed source facts before they enter the durable journal.

    Control API repeats this validation at the private ingress boundary.  The
    local copy prevents a bad in-process hook from creating a permanently
    unreplayable journal that a recovery loop would keep attempting to relay.
    It is intentionally a small P11 vocabulary, not a generic console/event
    transport.
    """

    if event_type in {"run_started", "heartbeat", "seal_started"}:
        _exact_payload(payload, event_type=event_type)
        return
    if event_type in {"stage_started", "stage_completed"}:
        _exact_payload(payload, event_type=event_type, required={"stage"})
        if payload.get("stage") not in _STAGES:
            raise ResearchProgressError("P11 stage event has an invalid stage")
        return
    if event_type == "trial_completed":
        _exact_payload(
            payload,
            event_type=event_type,
            required={"trial"},
            optional={
                "fold", "study", "state", "objective", "best_objective", "eta_s",
                "rate_trials_per_s",
                "overall_pct", "tqdm_line", "console",
            },
        )
        # A fold-bound trial names its fold; a trial of one global study that
        # scores every fold at once names none. Exactly one of the two.
        if ("study" in payload) == ("fold" in payload):
            raise ResearchProgressError("P11 trial must name exactly one of fold or a global study")
        if "study" in payload and payload.get("study") != "GLOBAL":
            raise ResearchProgressError("P11 trial study scope is invalid")
        if "fold" in payload:
            _positive_integer(payload.get("fold"), "trial fold")
        _positive_integer(payload.get("trial"), "trial number")
        _signed_decimal_or_none(payload.get("objective"), "trial objective")
        _signed_decimal_or_none(payload.get("best_objective"), "trial best objective")
        eta = payload.get("eta_s")
        if eta is not None and (
            not isinstance(eta, int) or isinstance(eta, bool) or not 0 <= eta <= 9_007_199_254_740_991
        ):
            raise ResearchProgressError("P11 trial ETA is invalid")
        rate = payload.get("rate_trials_per_s")
        if rate is not None and (
            not isinstance(rate, str) or len(rate) > 24
            or re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?", rate) is None
        ):
            raise ResearchProgressError("P11 trial rate is invalid")
        state = payload.get("state")
        if state is not None and state not in {"COMPLETE", "PRUNED", "INFEASIBLE", "FAILED"}:
            raise ResearchProgressError("P11 trial state is invalid")
        pct = payload.get("overall_pct")
        if pct is not None and (not isinstance(pct, int) or isinstance(pct, bool) or not 0 <= pct <= 100):
            raise ResearchProgressError("P11 trial percentage is invalid")
        line = payload.get("tqdm_line")
        if line is not None and (not isinstance(line, str) or not 1 <= len(line) <= 512):
            raise ResearchProgressError("P11 trial line is invalid")
        console = payload.get("console")
        if console is not None:
            if not isinstance(console, dict):
                raise ResearchProgressError("P11 trial console is invalid")
            _exact_payload(
                console,
                event_type="trial console",
                required={"tone", "text"},
                optional={"fold", "trial"},
            )
            if console.get("tone") not in {"INFO", "COMPLETE", "WARN", "ERROR"}:
                raise ResearchProgressError("P11 trial console tone is invalid")
            text = console.get("text")
            if not isinstance(text, str) or not 1 <= len(text) <= 1_024:
                raise ResearchProgressError("P11 trial console text is invalid")
            for key in ("fold", "trial"):
                if key in console and console[key] is not None:
                    _positive_integer(console[key], f"trial console {key}")
        return
    if event_type == "fold_completed":
        _exact_payload(payload, event_type=event_type, required={"fold"}, optional={"selection"})
        _positive_integer(payload.get("fold"), "fold number")
        if "selection" in payload:
            _validate_fold_selection(payload.get("selection"))
        return
    if event_type == "fold_segment_observed":
        _validate_fold_segment(payload)
        return
    if event_type == "artifact_writing":
        _exact_payload(payload, event_type=event_type, required={"name"})
        _valid_artifact_name(payload.get("name"))
        return
    if event_type == "artifact_sealed":
        _exact_payload(
            payload,
            event_type=event_type,
            required={"name", "size", "digest", "reader_href"},
        )
        _valid_artifact_name(payload.get("name"))
        if not isinstance(payload.get("size"), str) or not re.fullmatch(r"[0-9]+", payload["size"]):
            raise ResearchProgressError("P11 sealed artifact size is invalid")
        if not isinstance(payload.get("digest"), str) or not re.fullmatch(r"[0-9a-f]{64}", payload["digest"]):
            raise ResearchProgressError("P11 sealed artifact digest is invalid")
        # P11 proves that a bundle component sealed; it does not yet own an
        # artifact-read authorization route. A source-supplied path/URL would
        # otherwise cross the private worker boundary into a browser DTO.
        if payload.get("reader_href") is not None:
            raise ResearchProgressError("P11 sealed artifact reader link is unavailable in this contract version")
        return
    if event_type == "budget_tick":
        _exact_payload(payload, event_type=event_type, required={"used", "cap", "pct"})
        for key in ("used", "cap"):
            value = payload.get(key)
            if value is None and key == "cap":
                continue
            if not isinstance(value, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
                raise ResearchProgressError(f"P11 budget {key} value is invalid")
        pct = payload.get("pct")
        if not isinstance(pct, int) or isinstance(pct, bool) or not 0 <= pct <= 100:
            raise ResearchProgressError("P11 budget percentage is invalid")
        return
    if event_type == "run_completed":
        _exact_payload(
            payload,
            event_type=event_type,
            required={"usage"},
            optional={"claim", "evidence_digest", "split_digest", "handoff_cursor"},
        )
        _valid_usage(payload.get("usage"))
        if "handoff_cursor" in payload:
            _validate_handoff_cursor(payload.get("handoff_cursor"))
        evidence_digest = payload.get("evidence_digest")
        if evidence_digest is not None and (
            not isinstance(evidence_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", evidence_digest)
        ):
            raise ResearchProgressError("P13 completion evidence digest is invalid")
        split_digest = payload.get("split_digest")
        if split_digest is not None and (
            not isinstance(split_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", split_digest)
        ):
            raise ResearchProgressError("P14 completion split digest is invalid")
        claim = payload.get("claim")
        if claim is not None:
            if not isinstance(claim, dict):
                raise ResearchProgressError("P11 completion claim is invalid")
            _exact_payload(
                claim,
                event_type="completion claim",
                required={"state", "text", "cursor"},
                optional={"methodology_certificate"},
            )
            if claim.get("state") != "ISSUED" or not isinstance(claim.get("text"), str) or not 1 <= len(claim["text"]) <= 1_024:
                raise ResearchProgressError("P11 completion claim is invalid")
            cursor = claim.get("cursor")
            if cursor is not None and (not isinstance(cursor, str) or len(cursor) > 512):
                raise ResearchProgressError("P11 completion claim cursor is invalid")
            certificate = claim.get("methodology_certificate")
            if certificate is not None:
                _validate_methodology_certificate(certificate, label="completion methodology certificate")
        return
    if event_type == "run_failed":
        _exact_payload(payload, event_type=event_type, required={"code", "message", "usage"})
        if not isinstance(payload.get("code"), str) or not 1 <= len(payload["code"]) <= 160:
            raise ResearchProgressError("P11 failure code is invalid")
        if not isinstance(payload.get("message"), str) or len(payload["message"]) > 1_024:
            raise ResearchProgressError("P11 failure message is invalid")
        _valid_usage(payload.get("usage"))
        return
    raise ResearchProgressError("P11 event type is unsupported")


def _valid_artifact_name(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 256 or value.startswith("/") or ".." in value.split("/"):
        raise ResearchProgressError("P11 artifact event has an invalid name")
    return value


def _valid_usage(value: object) -> None:
    """Every key is present; ``None`` means unmeasured (CG-P11-09), never 0."""

    if not isinstance(value, dict) or set(value) != set(_USAGE_MAXIMA):
        raise ResearchProgressError("P11 terminal usage is invalid")
    for key, maximum in _USAGE_MAXIMA.items():
        if key == "cpu_seconds":
            maximum = _max_profile_cpu_seconds()
        item = value.get(key)
        if item is None:
            continue
        if not isinstance(item, int) or isinstance(item, bool) or not 0 <= item <= maximum:
            raise ResearchProgressError("P11 terminal usage is invalid")


class ResearchProgressJournal:
    """A filesystem-durable sequence/snapshot pair for one worker attempt.

    Segment rotation means a long-running worker never loads a full console or
    event stream in memory.  The oldest segment is deleted only after a later
    segment is safely fsync'd and the returned snapshot states the retention
    floor explicitly, so a consumer cannot silently assume replay continuity.
    """

    def __init__(
        self,
        root: Path,
        *,
        run_id: str,
        attempt_id: str,
        lease_epoch: int,
        planned_trials: int = 1,
        cpu_cap_seconds: int = _P04_CPU_SECONDS,
        profile: str = "P04_FIXED",
    ) -> None:
        self.run_id = _identifier(run_id, "run id")
        self.attempt_id = _identifier(attempt_id, "attempt id")
        if not isinstance(lease_epoch, int) or isinstance(lease_epoch, bool) or lease_epoch < 1:
            raise ResearchProgressError("P11 lease epoch is invalid")
        if not isinstance(planned_trials, int) or isinstance(planned_trials, bool) or not 1 <= planned_trials <= 2_147_483_647:
            raise ResearchProgressError("P11 planned trial count is invalid")
        if (
            not isinstance(cpu_cap_seconds, int) or isinstance(cpu_cap_seconds, bool)
            or not 1 <= cpu_cap_seconds <= _max_profile_cpu_seconds()
        ):
            raise ResearchProgressError("P11 CPU cap is invalid")
        if profile not in _PROFILE_COPY:
            raise ResearchProgressError("P11 journal profile is invalid")
        self.lease_epoch = lease_epoch
        self.profile = profile
        self._copy = _PROFILE_COPY[profile]
        self.planned_trials = planned_trials
        self.cpu_cap_seconds = cpu_cap_seconds
        self.root = (root.resolve() / self.run_id / "progress" / self.attempt_id).resolve()
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)
        self._segments = self.root / "segments"
        self._segments.mkdir(mode=0o700, exist_ok=True)
        self._lock_path = self.root / "journal.lock"
        self._snapshot_path = self.root / "snapshot.json"
        self._evidence_path = self.root / "evidence-source.json"
        self._split_path = self.root / "split-source.json"
        self._ensure_snapshot()

    def snapshot(self) -> dict[str, Any]:
        """Return the compact projection without reading any segment."""

        with self._locked():
            return self._read_snapshot()

    def store_evidence_source(self, source: dict[str, Any]) -> str:
        """Durably persist one bounded P13 source receipt before completion.

        This is source-side recovery data, analogous to the P11 journal, not
        a user-download endpoint.  The relay reads it only when it sees the
        terminal journal event that carries the returned digest.
        """

        if not isinstance(source, dict) or source.get("schema_version") != "research.p13.evidence-source.v1":
            raise ResearchProgressError("P13 evidence source receipt is invalid")
        try:
            encoded = json.dumps(canonicalize(source), sort_keys=True, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise ResearchProgressError("P13 evidence source receipt is not serializable") from exc
        if len(encoded) == 0 or len(encoded) > _MAX_EVIDENCE_BYTES:
            raise ResearchProgressError("P13 evidence source receipt exceeds its bounded budget")
        digest = hashlib.sha256(encoded).hexdigest()
        with self._locked():
            if self._evidence_path.exists():
                existing = self._evidence_path.read_bytes()
                if hashlib.sha256(existing).hexdigest() != digest:
                    raise ResearchProgressError("P13 source evidence cannot replace an immutable receipt")
                return digest
            temporary = self._evidence_path.with_suffix(".partial")
            # A power loss may leave only the private staging file.  It has
            # never become a source fact, so retrying this exact receipt may
            # replace that staging byte without touching the immutable file.
            temporary.unlink(missing_ok=True)
            with temporary.open("wb") as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._evidence_path)
            os.chmod(self._evidence_path, 0o600)
        return digest

    def read_evidence_source(self, expected_digest: str) -> dict[str, Any]:
        """Return the exact terminal evidence document after digest binding."""

        if not re.fullmatch(r"[0-9a-f]{64}", expected_digest):
            raise ResearchProgressError("P13 evidence digest is invalid")
        with self._locked():
            try:
                encoded = self._evidence_path.read_bytes()
            except OSError as exc:
                raise ResearchProgressError("P13 terminal evidence source receipt is unavailable") from exc
        if hashlib.sha256(encoded).hexdigest() != expected_digest:
            raise ResearchProgressError("P13 terminal evidence source digest is inconsistent")
        try:
            value = json.loads(encoded.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchProgressError("P13 terminal evidence source receipt is corrupt") from exc
        if not isinstance(value, dict) or value.get("schema_version") != "research.p13.evidence-source.v1":
            raise ResearchProgressError("P13 terminal evidence source receipt is invalid")
        return value

    def export_evidence_source_to(self, destination: Path, expected_digest: str) -> dict[str, Any]:
        """Copy the verified, bounded receipt into the sealed P10 bundle."""

        value = self.read_evidence_source(expected_digest)
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".partial")
        encoded = json.dumps(canonicalize(value), sort_keys=True, separators=(",", ":")).encode("utf-8")
        temporary.unlink(missing_ok=True)
        with temporary.open("wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
        os.chmod(destination, 0o600)
        return value

    def store_split_source(self, source: dict[str, Any]) -> str:
        """Durably persist P14's terminal-only immutable chronology receipt.

        Split truth is a sidecar of the P11 journal, not a holdout reader or
        a mutable seal authority.  A retry can only replay identical canonical
        bytes; it cannot replace a previously accepted receipt.
        """

        if not isinstance(source, dict) or source.get("schema_version") != "research.p14.split-source.v1":
            raise ResearchProgressError("P14 split source receipt is invalid")
        try:
            encoded = json.dumps(canonicalize(source), sort_keys=True, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise ResearchProgressError("P14 split source receipt is not serializable") from exc
        if len(encoded) == 0 or len(encoded) > _MAX_SPLIT_BYTES:
            raise ResearchProgressError("P14 split source receipt exceeds its bounded budget")
        digest = hashlib.sha256(encoded).hexdigest()
        with self._locked():
            if self._split_path.exists():
                existing = self._split_path.read_bytes()
                if hashlib.sha256(existing).hexdigest() != digest:
                    raise ResearchProgressError("P14 split source cannot replace an immutable receipt")
                return digest
            temporary = self._split_path.with_suffix(".partial")
            temporary.unlink(missing_ok=True)
            with temporary.open("wb") as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._split_path)
            os.chmod(self._split_path, 0o600)
        return digest

    def read_split_source(self, expected_digest: str) -> dict[str, Any]:
        """Read only the exact digest-bound P14 terminal receipt."""

        if not re.fullmatch(r"[0-9a-f]{64}", expected_digest):
            raise ResearchProgressError("P14 split digest is invalid")
        with self._locked():
            try:
                encoded = self._split_path.read_bytes()
            except OSError as exc:
                raise ResearchProgressError("P14 terminal split source receipt is unavailable") from exc
        if hashlib.sha256(encoded).hexdigest() != expected_digest:
            raise ResearchProgressError("P14 terminal split source digest is inconsistent")
        try:
            value = json.loads(encoded.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchProgressError("P14 terminal split source receipt is corrupt") from exc
        if not isinstance(value, dict) or value.get("schema_version") != "research.p14.split-source.v1":
            raise ResearchProgressError("P14 terminal split source receipt is invalid")
        return value

    def export_split_source_to(self, destination: Path, expected_digest: str) -> dict[str, Any]:
        """Copy the verified P14 receipt into the sealed P10 bundle."""

        value = self.read_split_source(expected_digest)
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".partial")
        encoded = json.dumps(canonicalize(value), sort_keys=True, separators=(",", ":")).encode("utf-8")
        temporary.unlink(missing_ok=True)
        with temporary.open("wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
        os.chmod(destination, 0o600)
        return value

    def emit(self, event_type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """Append one source event and atomically publish its projection."""

        if event_type not in {
            "run_started", "stage_started", "stage_completed", "trial_completed",
            "fold_completed", "fold_segment_observed", "artifact_writing", "artifact_sealed", "budget_tick",
            "heartbeat", "seal_started", "run_completed", "run_failed",
        }:
            raise ResearchProgressError("P11 event type is unsupported")
        safe_payload = _bounded_json(payload or {}, "event payload")
        _validate_payload(event_type, safe_payload)
        if event_type in {"run_completed", "run_failed"}:
            cpu = safe_payload["usage"]["cpu_seconds"]
            if cpu is not None and cpu > self.cpu_cap_seconds:
                raise ResearchProgressError("P11 terminal usage is invalid")
        with self._locked():
            snapshot = self._read_snapshot()
            if snapshot["status"] in _TERMINAL:
                raise ResearchProgressError("P11 terminal attempt cannot accept a later event")
            sequence = int(snapshot["latest_sequence"]) + 1
            now_ms = _now_ms()
            event = {
                "schema_version": "research.progress-event.v1",
                "run_id": self.run_id,
                "attempt_id": self.attempt_id,
                "lease_epoch": self.lease_epoch,
                "sequence": sequence,
                "event_type": event_type,
                "occurred_at_utc_ms": now_ms,
                "payload": safe_payload,
            }
            self._apply(snapshot, event)
            # The overall percentage is derived here from source facts, never
            # taken from a producer literal. A trial event carries the value it
            # produced so a stream consumer can patch without a snapshot.
            snapshot["overall"]["pct"] = max(int(snapshot["overall"]["pct"]), _derived_overall_pct(snapshot))
            if event_type == "trial_completed":
                safe_payload["overall_pct"] = snapshot["overall"]["pct"]
                self._assert_event_bound(event)
            snapshot["latest_sequence"] = sequence
            snapshot["updated_at_utc_ms"] = now_ms
            self._assert_snapshot_bound(snapshot)
            self._append(event)
            self._prune(snapshot)
            self._write_snapshot(snapshot)
            return {"event": event, "snapshot": snapshot}

    def events_after(self, after_sequence: int, limit: int = 500) -> dict[str, Any]:
        """Stream at most one browser-sized page without materialising history."""

        if not isinstance(after_sequence, int) or isinstance(after_sequence, bool) or after_sequence < 0:
            raise ResearchProgressError("P11 after sequence is invalid")
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 500:
            raise ResearchProgressError("P11 event page limit is invalid")
        with self._locked():
            snapshot = self._read_snapshot()
            floor = int(snapshot["retention_floor_sequence"])
            rows: list[dict[str, Any]] = []
            for path in self._segment_paths():
                start = int(path.stem)
                if start + _SEGMENT_EVENTS - 1 <= after_sequence:
                    continue
                with path.open("r", encoding="utf-8") as handle:
                    for line in handle:
                        if len(rows) >= limit:
                            break
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError as exc:
                            raise ResearchProgressError("P11 journal segment is corrupt") from exc
                        if isinstance(event, dict) and int(event.get("sequence", -1)) > after_sequence:
                            rows.append(event)
                if len(rows) >= limit:
                    break
            return {
                "events": rows,
                "retention_floor_sequence": floor,
                "latest_sequence": int(snapshot["latest_sequence"]),
                "snapshot": snapshot,
            }

    def export_to(self, destination: Path) -> dict[str, Any]:
        """Write a sealed-friendly NDJSON export without loading the journal.

        It gives later artifact readers more than the 500-line UI ring while
        remaining bounded by the rotated segment policy above.
        """

        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".partial")
        with self._locked():
            snapshot = self._read_snapshot()
            with temporary.open("w", encoding="utf-8") as output:
                output.write(json.dumps({"snapshot": snapshot}, sort_keys=True) + "\n")
                for path in self._segment_paths():
                    with path.open("r", encoding="utf-8") as source:
                        shutil.copyfileobj(source, output, length=64 * 1024)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination)
            os.chmod(destination, 0o600)
            return snapshot

    def _ensure_snapshot(self) -> None:
        with self._locked():
            if self._snapshot_path.is_file():
                snapshot = self._read_snapshot()
                if snapshot.get("run_id") != self.run_id or snapshot.get("attempt_id") != self.attempt_id:
                    raise ResearchProgressError("P11 journal identity mismatch")
                if snapshot.get("lease_epoch") != self.lease_epoch:
                    raise ResearchProgressError("P11 journal belongs to a stale lease epoch")
                return
            now_ms = _now_ms()
            snapshot = {
                "schema_version": "research.progress-snapshot.v1",
                "run_id": self.run_id,
                "attempt_id": self.attempt_id,
                "lease_epoch": self.lease_epoch,
                "status": "QUEUED",
                "created_at_utc_ms": now_ms,
                "updated_at_utc_ms": now_ms,
                "latest_sequence": 0,
                "retention_floor_sequence": 0,
                "stages": [{"key": key, "state": "PENDING", "started_at_utc_ms": None, "completed_at_utc_ms": None} for key in _STAGES],
                "overall": {
                    "pct": 0,
                    "elapsed_s": 0,
                    "eta_s": None,
                    "rate_trials_per_s": None,
                    "trials_done": 0,
                    "trials_declared": self.planned_trials,
                    "tqdm_line": "queued — waiting for a worker…",
                },
                "budget": {"used": "0", "cap": None, "unit": "core-min", "pct": 0},
                "folds": [],
                "artifacts": [],
                "claim": {
                    "state": "FORECAST",
                    "text": self._copy["forecast"],
                    "cursor": None,
                    "methodology_certificate": _not_published_methodology_certificate(),
                    "handoff_cursor": None,
                },
                "readiness": {"mandatory": "PENDING", "optional": "NOT_APPLICABLE"},
                "failure": None,
                "source": {"kind": "DURABLE_P10", "coverage": "ACTUAL_HOOKS", "partial": False},
            }
            self._write_snapshot(snapshot)

    def _apply(self, snapshot: dict[str, Any], event: dict[str, Any]) -> None:
        event_type = event["event_type"]
        payload = event["payload"]
        now_ms = event["occurred_at_utc_ms"]
        # ``elapsed_s`` is a display-only observation derived from the durable
        # journal timestamps.  It is never used for accounting, admission or
        # a worker lease, and is monotonic even when a caller retries an event.
        snapshot["overall"]["elapsed_s"] = max(
            int(snapshot["overall"].get("elapsed_s", 0)),
            max(0, (now_ms - int(snapshot["created_at_utc_ms"])) // 1_000),
        )
        if event_type == "run_started":
            if snapshot["status"] != "QUEUED":
                raise ResearchProgressError("P11 run may start only from the queued state")
            snapshot["status"] = "RUNNING"
            snapshot["overall"]["tqdm_line"] = self._copy["claimed"]
        elif event_type in {"stage_started", "stage_completed"}:
            stage = payload.get("stage")
            if stage not in _STAGES:
                raise ResearchProgressError("P11 stage event has an invalid stage")
            item = next(item for item in snapshot["stages"] if item["key"] == stage)
            if event_type == "stage_started":
                if item["state"] == "PENDING":
                    item["state"] = "RUNNING"
                    item["started_at_utc_ms"] = now_ms
            else:
                if item["state"] not in {"RUNNING", "DONE"}:
                    raise ResearchProgressError("P11 stage completed before it started")
                item["state"] = "DONE"
                item["completed_at_utc_ms"] = now_ms
                if stage == "S4":
                    # The search is over: a remaining-time estimate for it
                    # no longer describes anything.
                    snapshot["overall"]["eta_s"] = None
        elif event_type == "trial_completed":
            trial = payload.get("trial")
            fold = payload.get("fold")
            if not isinstance(trial, int) or isinstance(trial, bool) or trial < 1:
                raise ResearchProgressError("P11 trial completion has an invalid trial")
            if fold is not None and (not isinstance(fold, int) or isinstance(fold, bool) or fold < 1):
                raise ResearchProgressError("P11 trial completion has an invalid fold")
            overall = snapshot["overall"]
            if trial > int(overall["trials_declared"]):
                raise ResearchProgressError("P11 trial exceeds the declared trial count")
            overall["trials_done"] = max(int(overall["trials_done"]), trial)
            pct = payload.get("overall_pct")
            if isinstance(pct, int) and not isinstance(pct, bool) and 0 <= pct <= 100:
                overall["pct"] = max(int(overall["pct"]), pct)
            line = payload.get("tqdm_line")
            if isinstance(line, str) and 0 < len(line) <= 512:
                overall["tqdm_line"] = line
            if "eta_s" in payload:
                overall["eta_s"] = payload["eta_s"]
            if "rate_trials_per_s" in payload:
                overall["rate_trials_per_s"] = payload["rate_trials_per_s"]
            # A global-study trial scores every fold at once; it opens no fold
            # row, so no fold is drawn running before its OOS is evaluated.
            if fold is not None and not any(item.get("fold") == fold for item in snapshot["folds"]):
                if len(snapshot["folds"]) >= 256:
                    raise ResearchProgressError("P11 fold observation cap is exceeded")
                snapshot["folds"].append({
                    "fold": fold,
                    "state": "RUNNING",
                    "started_at_utc_ms": now_ms,
                    "completed_at_utc_ms": None,
                    "fold_timeline": _not_published_fold_timeline(),
                    "selection": _not_published_fold_selection(),
                })
        elif event_type == "fold_segment_observed":
            _validate_fold_segment(payload)
            fold = int(payload["fold"])
            item = next((item for item in snapshot["folds"] if item.get("fold") == fold), None)
            if item is None:
                if len(snapshot["folds"]) >= 256:
                    raise ResearchProgressError("P11 fold observation cap is exceeded")
                item = {
                    "fold": fold,
                    "state": "RUNNING",
                    "started_at_utc_ms": payload["started_at_utc_ms"],
                    "completed_at_utc_ms": None,
                    "fold_timeline": _not_published_fold_timeline(),
                    "selection": _not_published_fold_selection(),
                }
                snapshot["folds"].append(item)
            if item["state"] == "DONE":
                raise ResearchProgressError("P11 completed fold cannot receive a later segment fact")

            timeline = item.get("fold_timeline")
            if not isinstance(timeline, dict):
                raise ResearchProgressError("P11 fold timeline is invalid")
            if timeline.get("state") == "NOT_PUBLISHED":
                timeline = {"state": "PARTIAL", "reason_code": "SOURCE_PARTIALLY_PUBLISHED_PER_FOLD_SEGMENT_FACTS", "segments": []}
                item["fold_timeline"] = timeline
            segments = timeline.get("segments")
            if not isinstance(segments, list):
                raise ResearchProgressError("P11 fold segment collection is invalid")
            kind = payload["kind"]
            existing = next((segment for segment in segments if segment.get("kind") == kind), None)
            if existing is None:
                if len(segments) >= len(_FOLD_SEGMENT_KINDS):
                    raise ResearchProgressError("P11 fold segment cap is exceeded")
                existing = {
                    "kind": kind,
                    "state": payload["state"],
                    "started_at_utc_ms": payload["started_at_utc_ms"],
                    "completed_at_utc_ms": payload["completed_at_utc_ms"],
                }
                segments.append(existing)
            else:
                if existing.get("started_at_utc_ms") != payload["started_at_utc_ms"]:
                    raise ResearchProgressError("P11 fold segment start cannot be corrected in v1")
                if existing.get("state") in {"DONE", "FAILED"} and payload["state"] == "RUNNING":
                    raise ResearchProgressError("P11 terminal fold segment cannot regress")
                existing.update({
                    "state": payload["state"],
                    "completed_at_utc_ms": payload["completed_at_utc_ms"],
                })

            started_at = payload["started_at_utc_ms"]
            if item["started_at_utc_ms"] is None or started_at < item["started_at_utc_ms"]:
                item["started_at_utc_ms"] = started_at
            if payload["state"] == "FAILED":
                item["state"] = "FAILED"
                item["completed_at_utc_ms"] = payload["completed_at_utc_ms"]

            complete_kinds = {segment.get("kind") for segment in segments if segment.get("state") == "DONE"}
            if set(_FOLD_SEGMENT_KINDS).issubset(complete_kinds):
                timeline["state"] = "COMPLETE"
                timeline["reason_code"] = None
            else:
                timeline["state"] = "PARTIAL"
                timeline["reason_code"] = "SOURCE_PARTIALLY_PUBLISHED_PER_FOLD_SEGMENT_FACTS"
        elif event_type == "fold_completed":
            fold = payload.get("fold")
            if not isinstance(fold, int) or isinstance(fold, bool) or fold < 1:
                raise ResearchProgressError("P11 fold completion has an invalid fold")
            item = next((item for item in snapshot["folds"] if item.get("fold") == fold), None)
            if item is None:
                if len(snapshot["folds"]) >= 256:
                    raise ResearchProgressError("P11 fold observation cap is exceeded")
                item = {
                    "fold": fold,
                    "state": "DONE",
                    "started_at_utc_ms": now_ms,
                    "completed_at_utc_ms": now_ms,
                    "fold_timeline": _not_published_fold_timeline(),
                    "selection": _not_published_fold_selection(),
                }
                snapshot["folds"].append(item)
            else:
                if item["state"] == "FAILED":
                    raise ResearchProgressError("P11 failed fold cannot complete")
                item["state"] = "DONE"
                item["completed_at_utc_ms"] = now_ms
            selection = payload.get("selection")
            if isinstance(selection, dict):
                item["selection"] = {"state": "AVAILABLE", **selection, "reason_code": None}
        elif event_type in {"artifact_writing", "artifact_sealed"}:
            name = payload.get("name")
            if not isinstance(name, str) or not name or len(name) > 256 or name.startswith("/") or ".." in name.split("/"):
                raise ResearchProgressError("P11 artifact event has an invalid name")
            item = next((item for item in snapshot["artifacts"] if item["name"] == name), None)
            if item is None:
                if len(snapshot["artifacts"]) >= 128:
                    raise ResearchProgressError("P11 artifact observation cap is exceeded")
                item = {"name": name, "state": "PENDING", "size": None, "digest": None, "reader_href": None}
                snapshot["artifacts"].append(item)
            if event_type == "artifact_writing":
                item["state"] = "WRITING"
            else:
                digest = payload.get("digest")
                size = payload.get("size")
                if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
                    raise ResearchProgressError("P11 sealed artifact digest is invalid")
                if not isinstance(size, str) or not re.fullmatch(r"[0-9]+", size):
                    raise ResearchProgressError("P11 sealed artifact size is invalid")
                item.update({"state": "SEALED", "size": size, "digest": digest, "reader_href": payload.get("reader_href")})
        elif event_type == "budget_tick":
            used, cap, pct = payload.get("used"), payload.get("cap"), payload.get("pct")
            if not isinstance(used, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", used):
                raise ResearchProgressError("P11 budget used value is invalid")
            if cap is not None and (not isinstance(cap, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", cap)):
                raise ResearchProgressError("P11 budget cap value is invalid")
            if not isinstance(pct, int) or isinstance(pct, bool) or not 0 <= pct <= 100:
                raise ResearchProgressError("P11 budget percentage is invalid")
            snapshot["budget"] = {"used": used, "cap": cap, "unit": "core-min", "pct": pct}
        elif event_type == "seal_started":
            snapshot["status"] = "FINISHING"
            snapshot["readiness"]["mandatory"] = "SEALING"
        elif event_type == "run_completed":
            if snapshot["readiness"]["mandatory"] != "SEALED":
                raise ResearchProgressError("P11 completion is forbidden before mandatory seal")
            snapshot["status"] = "COMPLETED"
            snapshot["overall"]["pct"] = 100
            snapshot["overall"]["eta_s"] = None
            claim = payload.get("claim")
            handoff = payload.get("handoff_cursor")
            if isinstance(claim, dict) and claim.get("state") == "ISSUED":
                snapshot["claim"] = {
                    "state": claim["state"],
                    "text": claim["text"],
                    "cursor": claim["cursor"],
                    "methodology_certificate": claim.get("methodology_certificate") or _not_published_methodology_certificate(),
                    "handoff_cursor": handoff if isinstance(handoff, dict) else None,
                }
            else:
                snapshot["claim"] = {
                    "state": "NOT_ISSUED",
                    "text": self._copy["not_issued"],
                    "cursor": None,
                    "methodology_certificate": _not_published_methodology_certificate(),
                    "handoff_cursor": handoff if isinstance(handoff, dict) else None,
                }
        elif event_type == "run_failed":
            code = payload.get("code")
            message = payload.get("message")
            if not isinstance(code, str) or not code or len(code) > 160:
                raise ResearchProgressError("P11 failure code is invalid")
            if not isinstance(message, str) or len(message) > 1_024:
                raise ResearchProgressError("P11 failure message is invalid")
            snapshot["status"] = "FAILED"
            snapshot["failure"] = {"code": code, "message": message}
            snapshot["overall"]["eta_s"] = None
            snapshot["claim"] = {
                "state": "NOT_ISSUED",
                "text": "The run failed before Stage 5 issued a claim.",
                "cursor": None,
                "methodology_certificate": _not_published_methodology_certificate(),
                "handoff_cursor": None,
            }
            for item in snapshot["artifacts"]:
                if item["state"] == "WRITING":
                    item["state"] = "ABORTED"
            if snapshot["readiness"]["mandatory"] != "SEALED":
                snapshot["readiness"]["mandatory"] = "FAILED"
        # heartbeat intentionally changes only the durable sequence/as-of.

    def mark_mandatory_sealed(self, *, bundle_digest: str, bundle_bytes: int) -> dict[str, Any]:
        if not re.fullmatch(r"[0-9a-f]{64}", bundle_digest):
            raise ResearchProgressError("P11 bundle digest is invalid")
        if not isinstance(bundle_bytes, int) or isinstance(bundle_bytes, bool) or bundle_bytes < 0:
            raise ResearchProgressError("P11 bundle byte count is invalid")
        with self._locked():
            snapshot = self._read_snapshot()
            if snapshot["status"] in _TERMINAL:
                raise ResearchProgressError("P11 terminal attempt cannot be sealed")
            snapshot["readiness"]["mandatory"] = "SEALED"
            snapshot["mandatory_bundle"] = {"digest": bundle_digest, "size": str(bundle_bytes)}
            snapshot["updated_at_utc_ms"] = _now_ms()
            self._assert_snapshot_bound(snapshot)
            self._write_snapshot(snapshot)
            return snapshot

    def _append(self, event: dict[str, Any]) -> None:
        sequence = int(event["sequence"])
        start = ((sequence - 1) // _SEGMENT_EVENTS) * _SEGMENT_EVENTS + 1
        path = self._segments / f"{start:020d}.ndjson"
        payload = json.dumps(canonicalize(event), sort_keys=True, separators=(",", ":")) + "\n"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(path, 0o600)

    def _prune(self, snapshot: dict[str, Any]) -> None:
        paths = self._segment_paths()
        while len(paths) > _MAX_SEGMENTS:
            expired = paths.pop(0)
            expired.unlink(missing_ok=True)
        if paths:
            snapshot["retention_floor_sequence"] = int(paths[0].stem) - 1

    def _segment_paths(self) -> list[Path]:
        return sorted(self._segments.glob("*.ndjson"), key=lambda item: item.name)

    def _read_snapshot(self) -> dict[str, Any]:
        try:
            value = json.loads(self._snapshot_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ResearchProgressError("P11 snapshot is unreadable") from exc
        if not isinstance(value, dict) or value.get("schema_version") != "research.progress-snapshot.v1":
            raise ResearchProgressError("P11 snapshot has an incompatible schema")
        self._validate_snapshot_shape(value)
        return value

    @staticmethod
    def _validate_snapshot_shape(value: dict[str, Any]) -> None:
        """Reject a syntactically valid but incomplete local snapshot.

        Atomic replace prevents torn writes, but the recovery loop must still
        fail closed if an operator/storage fault leaves a JSON object with the
        right schema label and the wrong contents.  This intentionally checks
        only the compact source invariants needed before a journal can be
        resumed/relayed; Control API repeats the public DTO validation at its
        own ingress boundary.
        """

        required = {
            "schema_version", "run_id", "attempt_id", "lease_epoch", "status",
            "created_at_utc_ms", "updated_at_utc_ms", "latest_sequence",
            "retention_floor_sequence", "stages", "overall", "budget", "folds",
            "artifacts", "claim", "readiness", "failure", "source",
        }
        allowed = required | {"mandatory_bundle"}
        if set(value) - allowed or not required.issubset(value):
            raise ResearchProgressError("P11 snapshot has an invalid shape")
        latest = value["latest_sequence"]
        floor = value["retention_floor_sequence"]
        if (
            not isinstance(latest, int) or isinstance(latest, bool) or latest < 0
            or not isinstance(floor, int) or isinstance(floor, bool) or floor < 0
            or floor > latest
        ):
            raise ResearchProgressError("P11 snapshot has invalid sequence bounds")
        if value["status"] not in {"QUEUED", "RUNNING", "FINISHING", "COMPLETED", "FAILED"}:
            raise ResearchProgressError("P11 snapshot has an invalid status")
        if not isinstance(value["lease_epoch"], int) or isinstance(value["lease_epoch"], bool) or value["lease_epoch"] < 1:
            raise ResearchProgressError("P11 snapshot has an invalid lease epoch")
        for key in ("created_at_utc_ms", "updated_at_utc_ms"):
            if not isinstance(value[key], int) or isinstance(value[key], bool) or value[key] < 0:
                raise ResearchProgressError("P11 snapshot has invalid timestamps")
        overall = value["overall"]
        rate = overall.get("rate_trials_per_s") if isinstance(overall, dict) else None
        if rate is not None and (
            not isinstance(rate, str) or len(rate) > 24
            or re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?", rate) is None
        ):
            raise ResearchProgressError("P11 snapshot trial rate is invalid")

        readiness = value["readiness"]
        if (
            not isinstance(overall, dict)
            or not isinstance(overall.get("trials_declared"), int)
            or isinstance(overall.get("trials_declared"), bool)
            or overall["trials_declared"] < 1
            or not isinstance(readiness, dict)
            or readiness.get("mandatory") not in {"PENDING", "SEALING", "SEALED", "FAILED"}
            or readiness.get("optional") not in {"NOT_APPLICABLE", "PENDING", "READY", "FAILED"}
            or not isinstance(value["stages"], list)
            or len(value["stages"]) != len(_STAGES)
            or not isinstance(value["folds"], list)
            or len(value["folds"]) > 256
            or not isinstance(value["artifacts"], list)
            or len(value["artifacts"]) > 128
        ):
            raise ResearchProgressError("P11 snapshot has an invalid compact projection")
        fold_keys = {"fold", "state", "started_at_utc_ms", "completed_at_utc_ms", "fold_timeline"}
        for fold in value["folds"]:
            # ``selection`` is W2-additive: a journal written before it still
            # reopens, and its absence reads as NOT_PUBLISHED downstream.
            if not isinstance(fold, dict) or not fold_keys.issubset(fold) or set(fold) - fold_keys - {"selection"}:
                raise ResearchProgressError("P11 snapshot fold shape is invalid")
            if "selection" in fold:
                selection = fold["selection"]
                if not isinstance(selection, dict) or set(selection) != {
                    "state", "scope", "trial", "objective", "params_digest", "reason_code",
                }:
                    raise ResearchProgressError("P11 snapshot fold selection is invalid")
                if selection["state"] == "AVAILABLE":
                    _validate_fold_selection({
                        key: selection[key] for key in ("scope", "trial", "objective", "params_digest")
                    })
                    if selection["reason_code"] is not None:
                        raise ResearchProgressError("P11 snapshot fold selection is invalid")
                elif selection != _not_published_fold_selection():
                    raise ResearchProgressError("P11 snapshot fold selection is invalid")
            _positive_integer(fold.get("fold"), "snapshot fold number")
            if fold.get("state") not in {"RUNNING", "DONE", "FAILED"}:
                raise ResearchProgressError("P11 snapshot fold state is invalid")
            for key in ("started_at_utc_ms", "completed_at_utc_ms"):
                item = fold.get(key)
                if item is not None:
                    _utc_milliseconds(item, f"snapshot fold {key}")
            timeline = fold.get("fold_timeline")
            if not isinstance(timeline, dict) or set(timeline) != {"state", "reason_code", "segments"}:
                raise ResearchProgressError("P11 snapshot fold timeline is invalid")
            segments = timeline.get("segments")
            if not isinstance(segments, list) or len(segments) > len(_FOLD_SEGMENT_KINDS):
                raise ResearchProgressError("P11 snapshot fold segment collection is invalid")
            seen_kinds: set[str] = set()
            for segment in segments:
                if not isinstance(segment, dict) or set(segment) != {
                    "kind", "state", "started_at_utc_ms", "completed_at_utc_ms",
                }:
                    raise ResearchProgressError("P11 snapshot fold segment is invalid")
                kind = segment.get("kind")
                if kind not in _FOLD_SEGMENT_KINDS or kind in seen_kinds:
                    raise ResearchProgressError("P11 snapshot fold segment kind is invalid")
                seen_kinds.add(kind)
                _validate_fold_segment({"fold": fold["fold"], **segment})
            if timeline.get("state") == "NOT_PUBLISHED":
                if segments or timeline.get("reason_code") != "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS":
                    raise ResearchProgressError("P11 snapshot not-published fold timeline is invalid")
            elif timeline.get("state") == "PARTIAL":
                if not segments or timeline.get("reason_code") != "SOURCE_PARTIALLY_PUBLISHED_PER_FOLD_SEGMENT_FACTS":
                    raise ResearchProgressError("P11 snapshot partial fold timeline is invalid")
            elif timeline.get("state") == "COMPLETE":
                if (
                    set(_FOLD_SEGMENT_KINDS) != seen_kinds
                    or any(segment.get("state") != "DONE" for segment in segments)
                    or timeline.get("reason_code") is not None
                ):
                    raise ResearchProgressError("P11 snapshot complete fold timeline is invalid")
            else:
                raise ResearchProgressError("P11 snapshot fold timeline state is invalid")
        claim = value.get("claim")
        claim_keys = {"state", "text", "cursor", "methodology_certificate"}
        if (
            not isinstance(claim, dict)
            or not claim_keys.issubset(claim)
            or set(claim) - claim_keys - {"handoff_cursor"}
            or claim.get("state") not in {"FORECAST", "NOT_ISSUED", "ISSUED"}
            or not isinstance(claim.get("text"), str)
            or len(claim["text"]) > 1_024
            or (claim.get("cursor") is not None and (not isinstance(claim["cursor"], str) or len(claim["cursor"]) > 512))
        ):
            raise ResearchProgressError("P11 snapshot claim is invalid")
        _validate_methodology_certificate(claim.get("methodology_certificate"), label="snapshot methodology certificate")
        if claim.get("handoff_cursor") is not None:
            _validate_handoff_cursor(claim["handoff_cursor"])
        bundle = value.get("mandatory_bundle")
        if bundle is not None:
            if (
                not isinstance(bundle, dict)
                or set(bundle) != {"digest", "size"}
                or not isinstance(bundle.get("digest"), str)
                or not re.fullmatch(r"[0-9a-f]{64}", bundle["digest"])
                or not isinstance(bundle.get("size"), str)
                or not re.fullmatch(r"[0-9]+", bundle["size"])
            ):
                raise ResearchProgressError("P11 snapshot has an invalid mandatory bundle")
        if value["status"] == "COMPLETED" and readiness["mandatory"] != "SEALED":
            raise ResearchProgressError("P11 completed snapshot is missing mandatory seal")

    def _write_snapshot(self, snapshot: dict[str, Any]) -> None:
        temporary = self._snapshot_path.with_suffix(".partial")
        payload = json.dumps(canonicalize(snapshot), sort_keys=True, indent=2) + "\n"
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self._snapshot_path)
        os.chmod(self._snapshot_path, 0o600)

    @staticmethod
    def _assert_event_bound(event: dict[str, Any]) -> None:
        encoded = json.dumps(canonicalize(event["payload"]), sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(encoded) > _MAX_EVENT_BYTES:
            raise ResearchProgressError("P11 event payload exceeds the bounded event budget")

    @staticmethod
    def _assert_snapshot_bound(snapshot: dict[str, Any]) -> None:
        encoded = json.dumps(canonicalize(snapshot), sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(encoded) > _MAX_SNAPSHOT_BYTES:
            raise ResearchProgressError("P11 compact progress snapshot exceeds its bounded transport budget")

    def _locked(self):
        return _JournalLock(self._lock_path)


class _JournalLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.handle: Any = None

    def __enter__(self) -> "_JournalLock":
        self.handle = self.path.open("a+", encoding="utf-8")
        fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        assert self.handle is not None
        fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        self.handle.close()


__all__ = ["ResearchProgressError", "ResearchProgressJournal"]
