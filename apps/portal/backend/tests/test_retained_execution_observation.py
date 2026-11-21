from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter


def observation(manifest=None, used=True, folds=None):
    return CurrentSourceArtifactAdapter._execution_observation(
        manifest or {"timeframe": "1h", "started_at": "2026-10-01T00:00:00Z", "completed_at": "2026-10-01T00:00:01Z"},
        folds or [{"test_start_utc_ms": 1_700_000_000_000, "test_end_utc_ms": 1_700_003_600_000}],
        {"oos_used_for_selection": used},
    )


def test_completion_is_adapter_observed_and_range_is_half_open():
    fact = observation()
    assert fact["basis"] == "PORTAL_ADAPTER_ENGINE_CALL_COMPLETED"
    assert fact["evaluation_role"] == "SELECTION_INPUT"
    assert fact["range_end_exclusive_utc_ms"] == 1_700_007_200_000
    assert fact["completed_at_utc_ms"] == 1_790_812_801_000
    assert observation(used=False)["evaluation_role"] == "OUTER_OOS"


def test_no_invented_clock_or_selection_or_fold_bounds():
    assert observation(manifest={"timeframe": "1h"}) is None
    assert observation(used=None) is None
    assert observation(manifest={"timeframe": "1h", "started_at": "2026-10-01", "completed_at": "2026-10-02"}) is None
    assert observation(folds=[{"test_start_utc_ms": None, "test_end_utc_ms": None}]) is None
