"""W2 (RF-05 P11): the live progress channel and the truthful journal facts.

CG-P06-02 / CG-P10-04: the P06 child writes a bounded NDJSON of Optuna trial
facts beside its receipt; the supervisor tails it; ``LiveStudyProgress`` maps
it onto P11 events with a server-side ETA. CG-P11-03: fold selections and the
structured hand-off cursor. CG-P11-09: unmeasured usage is ``None``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_run_producer import LiveStudyProgress, parameter_bundle_digest
from portal_api.services.research_supervisor import (
    CHILD_PROGRESS_MAX_BYTES,
    CHILD_PROGRESS_SCHEMA,
    _ChildProgressTail,
)
from portal_api.workers import research_child
from portal_api.workers.durable_worker import DurableQuantWorker
from wfo_test_support import wfo_request

_DIGEST = "d" * 64


def _journal(tmp_path: Path, **overrides) -> ResearchProgressJournal:
    return ResearchProgressJournal(
        tmp_path / "durable",
        run_id="run_w2",
        attempt_id="ra_w2",
        lease_epoch=1,
        planned_trials=overrides.pop("planned_trials", 3),
        cpu_cap_seconds=overrides.pop("cpu_cap_seconds", 120),
        **overrides,
    )


def _to_study(journal: ResearchProgressJournal) -> None:
    journal.emit("run_started")
    for stage in ("S1", "S2", "S3"):
        journal.emit("stage_started", {"stage": stage})
        journal.emit("stage_completed", {"stage": stage})
    journal.emit("stage_started", {"stage": "S4"})


# ------------------------------------------------------------------ journal


def test_overall_pct_is_derived_from_source_facts_and_monotonic(tmp_path: Path) -> None:
    journal = _journal(tmp_path, profile="DELTA_WFO")
    journal.emit("run_started")
    assert journal.snapshot()["overall"]["pct"] == 0
    journal.emit("stage_started", {"stage": "S1"})
    journal.emit("stage_completed", {"stage": "S1"})
    assert journal.snapshot()["overall"]["pct"] == 5
    for stage in ("S2", "S3"):
        journal.emit("stage_started", {"stage": stage})
        journal.emit("stage_completed", {"stage": stage})
    journal.emit("stage_started", {"stage": "S4"})
    assert journal.snapshot()["overall"]["pct"] == 10
    # A producer-supplied percentage can never pull the derived value down,
    # and the event records the value the journal actually published.
    event = journal.emit("trial_completed", {"study": "GLOBAL", "trial": 1, "state": "COMPLETE", "overall_pct": 1})
    assert event["event"]["payload"]["overall_pct"] == 33
    assert journal.snapshot()["overall"]["pct"] == 33
    journal.emit("trial_completed", {"study": "GLOBAL", "trial": 3, "state": "PRUNED"})
    assert journal.snapshot()["overall"]["pct"] == 80
    journal.emit("stage_completed", {"stage": "S4"})
    assert journal.snapshot()["overall"]["pct"] == 85
    journal.emit("stage_started", {"stage": "S5"})
    journal.emit("seal_started")
    assert journal.snapshot()["overall"]["pct"] == 90
    journal.emit("stage_completed", {"stage": "S5"})
    assert journal.snapshot()["overall"]["pct"] == 95


def test_global_trial_opens_no_fold_and_eta_is_withdrawn_when_the_search_ends(tmp_path: Path) -> None:
    journal = _journal(tmp_path, profile="DELTA_WFO")
    _to_study(journal)
    journal.emit("trial_completed", {
        "study": "GLOBAL", "trial": 1, "state": "COMPLETE", "objective": "-9.8", "best_objective": "-9.8",
        "eta_s": 12, "rate_trials_per_s": "0.166666667", "tqdm_line": "global study · trial 1/3",
    })
    snapshot = journal.snapshot()
    assert snapshot["folds"] == []
    assert snapshot["overall"]["eta_s"] == 12
    assert snapshot["overall"]["rate_trials_per_s"] == "0.166666667"
    assert _journal(tmp_path, profile="DELTA_WFO").snapshot()["overall"]["rate_trials_per_s"] == "0.166666667"
    assert snapshot["overall"]["tqdm_line"] == "global study · trial 1/3"
    journal.emit("stage_completed", {"stage": "S4"})
    assert journal.snapshot()["overall"]["eta_s"] is None


@pytest.mark.parametrize("payload, message", [
    ({"study": "GLOBAL", "fold": 1, "trial": 1}, "exactly one"),
    ({"trial": 1}, "exactly one"),
    ({"study": "PER_FOLD", "trial": 1}, "study scope"),
    ({"study": "GLOBAL", "trial": 1, "objective": "1e-3"}, "objective"),
    ({"study": "GLOBAL", "trial": 1, "best_objective": 1.5}, "best objective"),
    ({"study": "GLOBAL", "trial": 1, "eta_s": -1}, "ETA"),
    ({"study": "GLOBAL", "trial": 1, "rate_trials_per_s": "1e3"}, "rate"),
    ({"study": "GLOBAL", "trial": 4}, "declared"),
])
def test_trial_facts_are_validated_before_the_journal_accepts_them(tmp_path: Path, payload: dict, message: str) -> None:
    journal = _journal(tmp_path)
    _to_study(journal)
    with pytest.raises(ResearchProgressError, match=message):
        journal.emit("trial_completed", payload)


def test_fold_selection_and_handoff_cursor_are_typed_source_facts(tmp_path: Path) -> None:
    journal = _journal(tmp_path, profile="DELTA_WFO")
    _to_study(journal)
    selection = {"scope": "GLOBAL_STUDY", "trial": 1, "objective": "-9.806075711302508", "params_digest": _DIGEST}
    journal.emit("fold_completed", {"fold": 1, "selection": selection})
    journal.emit("fold_completed", {"fold": 2})
    folds = journal.snapshot()["folds"]
    assert folds[0]["selection"] == {"state": "AVAILABLE", **selection, "reason_code": None}
    assert folds[1]["selection"] == {
        "state": "NOT_PUBLISHED", "scope": None, "trial": None, "objective": None, "params_digest": None,
        "reason_code": "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION",
    }
    with pytest.raises(ResearchProgressError, match="fixed profile"):
        journal.emit("fold_completed", {"fold": 3, "selection": {**selection, "scope": "FIXED_PROFILE"}})
    with pytest.raises(ResearchProgressError, match="digest"):
        journal.emit("fold_completed", {"fold": 3, "selection": {**selection, "params_digest": "short"}})
    journal.emit("stage_completed", {"stage": "S4"})
    journal.emit("seal_started")
    journal.mark_mandatory_sealed(bundle_digest=_DIGEST, bundle_bytes=10)
    journal.emit("run_completed", {
        "usage": {"peak_rss_bytes": 300_000_000, "cpu_seconds": 6, "scratch_bytes": None, "fd_peak": None},
        "handoff_cursor": {"fold": 2, "trial": 1, "params_digest": _DIGEST},
    })
    snapshot = journal.snapshot()
    assert snapshot["claim"]["state"] == "NOT_ISSUED"
    assert snapshot["claim"]["text"] == "The Delta walk-forward study sealed its artifacts but did not issue a release claim."
    assert snapshot["claim"]["handoff_cursor"] == {"fold": 2, "trial": 1, "params_digest": _DIGEST}
    assert snapshot["overall"]["pct"] == 100


def test_p04_copy_is_unchanged_and_a_pre_w2_snapshot_still_reopens(tmp_path: Path) -> None:
    journal = _journal(tmp_path, planned_trials=1, cpu_cap_seconds=45)
    assert journal.snapshot()["claim"]["text"] == "The fixed qualification has not sealed a publishable claim."
    journal.emit("run_started")
    assert journal.snapshot()["overall"]["tqdm_line"] == "worker claimed durable P10 qualification"
    journal.emit("fold_completed", {"fold": 1})
    # Simulate a journal written by the previous source revision.
    snapshot_path = journal.root / "snapshot.json"
    legacy = json.loads(snapshot_path.read_text(encoding="utf-8"))
    for fold in legacy["folds"]:
        del fold["selection"]
    del legacy["claim"]["handoff_cursor"]
    snapshot_path.write_text(json.dumps(legacy), encoding="utf-8")
    reopened = _journal(tmp_path, planned_trials=1, cpu_cap_seconds=45)
    assert "selection" not in reopened.snapshot()["folds"][0]
    reopened.emit("heartbeat")
    with pytest.raises(ResearchProgressError, match="profile"):
        _journal(tmp_path, profile="GENERIC")


def test_unmeasured_usage_is_null_and_a_measured_zero_stays_a_number(tmp_path: Path) -> None:
    journal = _journal(tmp_path, planned_trials=1, cpu_cap_seconds=45)
    journal.emit("run_started")
    with pytest.raises(ResearchProgressError, match="usage"):
        journal.emit("run_failed", {"code": "ENGINE_ERROR", "message": "x", "usage": {"cpu_seconds": None}})
    with pytest.raises(ResearchProgressError, match="usage"):
        journal.emit("run_failed", {
            "code": "ENGINE_ERROR", "message": "x",
            "usage": {"peak_rss_bytes": "1", "cpu_seconds": None, "scratch_bytes": None, "fd_peak": None},
        })
    event = journal.emit("run_failed", {
        "code": "ENGINE_ERROR", "message": "x",
        "usage": {"peak_rss_bytes": None, "cpu_seconds": 0, "scratch_bytes": None, "fd_peak": None},
    })
    assert event["event"]["payload"]["usage"] == {
        "peak_rss_bytes": None, "cpu_seconds": 0, "scratch_bytes": None, "fd_peak": None,
    }


# ------------------------------------------------------ live study mapping


class _Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def test_live_study_progress_emits_observed_trials_eta_and_budget_ticks() -> None:
    emitted: list[tuple[str, dict]] = []
    clock = _Clock()
    live = LiveStudyProgress(lambda kind, payload: emitted.append((kind, payload)), trials_declared=3, cpu_cap_seconds=120, clock=clock)

    clock.now = 106.0
    live({"trial": 1, "state": "COMPLETE", "objective": "-9.806075711302508", "best_objective": "-9.806075711302508", "cpu_seconds": 7.2})
    clock.now = 110.0
    live({"trial": 1, "state": "COMPLETE", "objective": "-1", "best_objective": "-1", "cpu_seconds": 8.0})  # replay: ignored
    live({"trial": 2, "state": "PRUNED", "objective": None, "best_objective": "-9.806075711302508", "cpu_seconds": 7.3})
    live({"trial": 9, "state": "COMPLETE", "objective": "1", "best_objective": "1", "cpu_seconds": 8.0})  # beyond declared
    live({"trial": 3, "state": "BOGUS", "objective": None, "best_objective": None, "cpu_seconds": 8.0})  # unknown state
    clock.now = 112.0
    live({"trial": 3, "state": "COMPLETE", "objective": "-3.5", "best_objective": "-3.5", "cpu_seconds": 13.0})

    trials = [payload for kind, payload in emitted if kind == "trial_completed"]
    assert [trial["trial"] for trial in trials] == [1, 2, 3]
    assert [trial["eta_s"] for trial in trials] == [12, 5, None]  # ceil(6/1*2), ceil(10/2*1), done
    assert [trial["rate_trials_per_s"] for trial in trials] == ["0.166666667", "0.2", "0.25"]
    assert trials[0]["tqdm_line"] == "global study · trial 1/3 · best IS Sharpe -9.806 · pruned 0/1"
    assert trials[1]["tqdm_line"] == "global study · trial 2/3 · best IS Sharpe -9.806 · pruned 1/2"
    assert trials[1]["console"] == {"tone": "INFO", "text": "global trial 2 IS Sharpe=— state=PRUNED", "trial": 2}
    assert all(trial["study"] == "GLOBAL" and "fold" not in trial for trial in trials)
    ticks = [payload for kind, payload in emitted if kind == "budget_tick"]
    # One tick per change of the published percentage (the ignored replay
    # and out-of-range records never reach the budget).
    assert ticks == [
        {"used": "0.120", "cap": "2.000", "pct": 6},
        {"used": "0.122", "cap": "2.000", "pct": 7},
        {"used": "0.217", "cap": "2.000", "pct": 11},
    ]
    assert live.trials_observed == 3


# ------------------------------------------------------- child and parent


def _record(sequence: int, trial: int, **overrides) -> dict:
    return {
        "schema_version": CHILD_PROGRESS_SCHEMA, "sequence": sequence, "kind": "trial", "trial": trial,
        "state": "COMPLETE", "objective": "-1.5", "best_objective": "-1.5", "cpu_seconds": 1.0, **overrides,
    }


def test_parent_tail_reads_complete_lines_incrementally_and_stops_on_a_bad_record(tmp_path: Path) -> None:
    path = tmp_path / "progress.ndjson"
    seen: list[dict] = []
    tail = _ChildProgressTail(path, seen.append)
    tail.drain()  # file not created yet: nothing, no error
    with path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(_record(1, 1)) + "\n" + json.dumps(_record(2, 2))[:20])
    tail.drain()
    assert [record["trial"] for record in seen] == [1]  # the partial line waits
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(_record(2, 2))[20:] + "\n")
        handle.write(json.dumps(_record(4, 3)) + "\n")  # sequence gap: channel closes
        handle.write(json.dumps(_record(4, 4)) + "\n")
    tail.drain()
    tail.drain()
    assert [record["trial"] for record in seen] == [1, 2]


@pytest.mark.parametrize("bad", [
    {"extra": "x"},
    {"objective": "1e-5"},
    {"state": "RUNNING"},
    {"cpu_seconds": True},
    {"schema_version": "other"},
])
def test_parent_tail_refuses_records_outside_the_channel_contract(tmp_path: Path, bad: dict) -> None:
    path = tmp_path / "progress.ndjson"
    record = {**_record(1, 1), **bad}
    path.write_text(json.dumps(record) + "\n" + json.dumps(_record(2, 2)) + "\n", encoding="utf-8")
    seen: list[dict] = []
    tail = _ChildProgressTail(path, seen.append)
    tail.drain()
    assert seen == []


def test_parent_tail_never_follows_a_symlink_and_is_byte_bounded(tmp_path: Path) -> None:
    secret = tmp_path / "secret.txt"
    secret.write_text(json.dumps(_record(1, 1)) + "\n", encoding="utf-8")
    link = tmp_path / "progress.ndjson"
    link.symlink_to(secret)
    seen: list[dict] = []
    _ChildProgressTail(link, seen.append).drain()
    assert seen == []

    big = tmp_path / "big.ndjson"
    line = json.dumps(_record(1, 1)) + "\n"
    with big.open("w", encoding="utf-8") as handle:
        for index in range(1, CHILD_PROGRESS_MAX_BYTES // len(line) + 50):
            handle.write(json.dumps(_record(index, 1 + (index % 1000))) + "\n")
    bounded: list[dict] = []
    tail = _ChildProgressTail(big, bounded.append)
    for _ in range(3):
        tail.drain()
    assert 0 < len(bounded) * len(line) <= CHILD_PROGRESS_MAX_BYTES + len(line)


class _Trial:
    def __init__(self, number: int, state: str, value: float | None) -> None:
        self.number = number
        self.state = SimpleNamespace(name=state)
        self.value = value


class _Exploding:
    number = 1

    @property
    def state(self) -> object:
        raise RuntimeError("observation failure")


class _Study:
    def __init__(self, best: float | None) -> None:
        self._best = best

    @property
    def best_value(self) -> float:
        if self._best is None:
            raise ValueError("no trial completed")
        return self._best


def test_child_writer_publishes_trial_facts_only_and_is_exclusive(tmp_path: Path) -> None:
    path = tmp_path / "progress.ndjson"
    writer = research_child._ChildProgressWriter(path)
    writer.trial(_Study(None), _Trial(0, "PRUNED", float("-inf")))
    writer.trial(_Study(-9.806075711302508), _Trial(1, "COMPLETE", -9.806075711302508))
    writer.trial(_Study(-9.8), _Trial(2, "RUNNING", None))  # not a finished trial: skipped
    writer.close()
    lines = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert [line["sequence"] for line in lines] == [1, 2]
    assert lines[0] == {**lines[0], "trial": 1, "state": "PRUNED", "objective": None, "best_objective": None}
    assert lines[1]["objective"] == "-9.806075711302508" and lines[1]["best_objective"] == "-9.806075711302508"
    assert set(lines[1]) == {"schema_version", "sequence", "kind", "trial", "state", "objective", "best_objective", "cpu_seconds"}
    assert oct(os.stat(path).st_mode & 0o777) == "0o600"
    with pytest.raises(FileExistsError):
        research_child._ChildProgressWriter(path)
    # The parent accepts exactly what the child wrote.
    seen: list[dict] = []
    _ChildProgressTail(path, seen.append).drain()
    assert [record["trial"] for record in seen] == [1, 2]


def test_child_hook_observes_quantbt_trials_without_changing_the_callback_contract(tmp_path: Path) -> None:
    import quantbt.walkforward as walkforward

    original = walkforward.logging_callback
    writer = research_child._ChildProgressWriter(tmp_path / "progress.ndjson")
    restore = research_child._observe_optuna_trials(writer)
    try:
        assert walkforward.logging_callback is not original
        study = SimpleNamespace(user_attrs={}, best_value=-2.0, set_user_attr=lambda key, value: None)
        walkforward.logging_callback(study, _Trial(0, "COMPLETE", -2.0))
        # An observation failure never reaches the engine's study.
        walkforward.logging_callback(study, _Exploding())
    finally:
        restore()
        writer.close()
    assert walkforward.logging_callback is original
    assert len((tmp_path / "progress.ndjson").read_text(encoding="utf-8").splitlines()) == 1


# ---------------------------------------------------------------- worker


def test_parameter_bundle_digest_matches_the_p14_rule() -> None:
    import hashlib

    from portal_api.serialization import canonicalize

    parameters = {"window": 34, "rsi_l": 30, "slpercent": 2.3}
    expected = hashlib.sha256(
        json.dumps(canonicalize(parameters), sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert parameter_bundle_digest(parameters) == expected


def test_e15_identity_artifacts_are_exact_bounded_non_secret_receipts(tmp_path: Path) -> None:
    request = ResearchRunProducerRequest.model_validate(wfo_request())
    research_dir = tmp_path / "research"
    research_dir.mkdir(mode=0o700)

    DurableQuantWorker._write_research_identity_artifacts(research_dir, request)

    requested = json.loads((research_dir / "requested-spec.json").read_text(encoding="utf-8"))
    effective = json.loads((research_dir / "effective-spec-receipt.json").read_text(encoding="utf-8"))
    binding = json.loads((research_dir / "dataset-binding-receipt.json").read_text(encoding="utf-8"))
    assert requested == {
        "schema_version": "research.p11.requested-spec-receipt.v1",
        "run_id": request.run_id,
        "attempt_id": request.worker_attempt_id,
        "requested_spec": request.research.requested_spec,
        "requested_spec_digest": request.research.requested_spec_digest,
    }
    assert effective["effective_spec_digest"] == request.research.effective_spec_digest
    assert effective["execution_profile_id"] == request.research.execution_profile_id
    assert binding == {
        "schema_version": "research.p11.dataset-binding-receipt.v1",
        "run_id": request.run_id,
        "attempt_id": request.worker_attempt_id,
        "snapshot_id": request.research.snapshot_id,
        "snapshot_content_hash": request.research.snapshot_content_hash,
        "dataset_binding_digest": request.research.dataset_binding_digest,
    }
    forbidden = {"credential", "token", "source_path", "lease_token", "market_rows"}
    encoded = json.dumps([requested, effective, binding]).lower()
    assert all(name not in encoded for name in forbidden)
    for path in research_dir.iterdir():
        assert oct(os.stat(path).st_mode & 0o777) == "0o600"


def _retention(trial_states: tuple, *, selection: dict | None, folds: int = 2) -> SimpleNamespace:
    return SimpleNamespace(
        trial_states=trial_states,
        table_rows={"FOLD": folds},
        receipt=SimpleNamespace(summary={"selection": selection} if selection is not None else {}),
    )


def test_retained_wfo_close_fills_only_missed_trials_and_carries_the_selection(tmp_path: Path) -> None:
    journal = _journal(tmp_path, profile="DELTA_WFO")
    _to_study(journal)
    journal.emit("trial_completed", {"study": "GLOBAL", "trial": 1, "state": "COMPLETE", "objective": "-9.8"})
    selection = {"trial_id": "0", "objective": "-9.8", "parameters": {"window": "34", "rsi_l": "30"}}
    handoff = DurableQuantWorker._emit_retained_wfo_progress(
        journal, _retention(("COMPLETE", "PRUNED", "COMPLETE"), selection=selection),
    )
    events = journal.events_after(0)["events"]
    trials = [event["payload"] for event in events if event["event_type"] == "trial_completed"]
    assert [trial["trial"] for trial in trials] == [1, 2, 3]  # trial 1 live, 2 and 3 from the table
    assert trials[1]["state"] == "PRUNED" and "objective" not in trials[1]
    digest = parameter_bundle_digest({"window": "34", "rsi_l": "30"})
    folds = [event["payload"] for event in events if event["event_type"] == "fold_completed"]
    assert folds == [
        {"fold": 1, "selection": {"scope": "GLOBAL_STUDY", "trial": 1, "objective": "-9.8", "params_digest": digest}},
        {"fold": 2, "selection": {"scope": "GLOBAL_STUDY", "trial": 1, "objective": "-9.8", "params_digest": digest}},
    ]
    assert handoff == {"fold": 2, "trial": 1, "params_digest": digest}
    assert events[-1]["event_type"] == "stage_completed"


@pytest.mark.parametrize("states, selection, message", [
    (("COMPLETE",), {"trial_id": "0", "objective": "1", "parameters": {"a": "1"}}, "more live"),
    (("COMPLETE", "COMPLETE"), None, "selection is unavailable"),
    (("COMPLETE", "COMPLETE"), {"trial_id": "x", "objective": "1", "parameters": {"a": "1"}}, "numbered trial"),
    (("COMPLETE", "COMPLETE"), {"trial_id": "7", "objective": "1", "parameters": {"a": "1"}}, "outside"),
])
def test_retained_wfo_close_fails_closed_on_contradictions(tmp_path: Path, states, selection, message) -> None:
    journal = _journal(tmp_path, profile="DELTA_WFO")
    _to_study(journal)
    journal.emit("trial_completed", {"study": "GLOBAL", "trial": 1, "state": "COMPLETE"})
    journal.emit("trial_completed", {"study": "GLOBAL", "trial": 2, "state": "COMPLETE"})
    with pytest.raises(Exception, match=message):
        DurableQuantWorker._emit_retained_wfo_progress(journal, _retention(states, selection=selection))
