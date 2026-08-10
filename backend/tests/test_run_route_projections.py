from portal_api.api.routes_runs import _normalize_stage_events, _trial_stage, _unique_trial_rows


def test_stage_projection_drops_old_backward_and_duplicate_callbacks():
    events = [
        {"state": "QUEUED", "at": 1.0},
        {"state": "VALIDATING_DATA", "at": 2.0},
        {"state": "WARMING_KERNEL", "at": 3.0},
        {"state": "OPTIMIZING_IS", "at": 4.0},
        {"state": "VALIDATING_DATA", "at": 5.0},
        {"state": "OPTIMIZING_IS", "at": 6.0},
        {"state": "SELECTING_PARAMS", "at": 7.0},
        {"state": "COMPLETED", "at": 8.0},
    ]

    projected = _normalize_stage_events(events)

    assert [item["state"] for item in projected] == [
        "QUEUED",
        "VALIDATING_DATA",
        "WARMING_KERNEL",
        "OPTIMIZING_IS",
        "SELECTING_PARAMS",
        "COMPLETED",
    ]
    assert projected[3]["at"] == 4.0


def test_stage_projection_preserves_unknown_and_single_terminal_event():
    events = [
        {"state": "QUEUED", "at": 1.0},
        {"state": "CUSTOM_AUDIT", "at": 2.0},
        {"state": "FAILED", "at": 3.0},
        {"state": "FAILED", "at": 4.0},
    ]

    projected = _normalize_stage_events(events)

    assert [item["state"] for item in projected] == [
        "QUEUED",
        "CUSTOM_AUDIT",
        "FAILED",
    ]


def test_trial_projection_separates_candidate_replays_from_search_trials():
    rows = [
        {"trial_id": 1, "objective": 1.2, "mean_oos_sharpe": 0.0},
        {"trial_id": 2, "objective": 0.9, "mean_oos_sharpe": 0.0},
        {"trial_id": 1, "objective": 0.4, "mean_oos_sharpe": 0.8},
    ]

    assert _unique_trial_rows(rows) == rows[:2]


def test_trial_projection_keeps_same_trial_id_from_distinct_studies():
    rows = [
        {"study_id": 0, "trial_id": 1, "objective": 1.2},
        {"study_id": 1, "trial_id": 1, "objective": 1.1},
    ]

    assert _unique_trial_rows(rows) == rows


def test_trial_stage_reads_canonical_json_metadata():
    row = {"selection_metadata_json": '{"stage":"is_search"}'}

    assert _trial_stage(row) == "is_search"
    assert _trial_stage({"selection_metadata_json": "not-json"}) is None
