"""Synthetic installed-result private custody units; never real engine proof."""
from __future__ import annotations

import copy
import dataclasses
import hashlib
import inspect
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from quantbt.core.results import BacktestResultV2

from portal_api.services import research_is_qualification as witness
from portal_api.services.research_enrich_analysis import _declared_is_input, _source_windows


def binding():
    return {"run_id": "rrun_synthetic", "job_id": "rjob_synthetic", "worker_attempt_id": "rwa_synthetic", "lease_epoch": 3}


def source(is_rows=72, *, symbol="DEFAULT"):
    warmup, oos = 3, 24
    count = warmup + is_rows + oos
    index = pd.date_range("2026-06-01", periods=count, freq="h", tz="UTC")
    close = pd.Series(100 + np.arange(count) / 10, index=index)
    equity = pd.Series(1000 + np.arange(count) * 2 + np.sin(np.arange(count)) * 20, index=index)
    equity.iloc[:warmup] += 10_000
    result = BacktestResultV2(equity=equity, returns=equity.pct_change().fillna(0),
        positions=pd.DataFrame({"Position_" + symbol: [.25 if i % 2 else -.5 for i in range(count)]}, index=index),
        closes=pd.DataFrame({"Close_" + symbol: close.copy()}, index=index), symbols=[symbol], initial_capital=500)
    ms = lambda at: int(at.value // 1_000_000)
    start, middle, end = ms(index[warmup]), ms(index[warmup + is_rows]), ms(index[-1] + pd.Timedelta(hours=1))
    windows = {kind: {"start_ms": left, "end_ms": right, "source_locator": f"P10.immutable_requested_spec.windows.{kind}"}
        for kind, left, right in [("is", start, middle), ("oos", middle, end), ("holdout", end, end + 48 * 3_600_000)]}
    return result, close, windows


def capture(directory, *, result=None, close=None, windows=None, **kwargs):
    original_result, original_close, original_windows = source()
    return witness.capture_is_qualification(result=original_result if result is None else result,
        market_close=original_close if close is None else close, output_directory=directory,
        source_windows=original_windows if windows is None else windows, binding=binding(),
        benchmark_locator="P08.verified_tape:test:close:OOS", **kwargs)


def read(directory):
    values = [json.loads(line) for line in (directory / witness.FILE_NAME).read_bytes().splitlines()]
    return values[0], values[1:]


def verify(path, metadata, *, expected_binding=None, windows=None):
    witness.verify_is_qualification_file(path, metadata, binding=binding() if expected_binding is None else expected_binding,
        source_windows=source()[2] if windows is None else windows)


def rewrite(directory, metadata, header, rows):
    """Re-sign synthetic untrusted bytes to exercise structural validation independently."""
    encoded = witness._json(header) + b"\n" + b"".join(witness._json(row) + b"\n" for row in rows)
    (directory / witness.FILE_NAME).write_bytes(encoded)
    changed = dict(metadata, file_sha256=hashlib.sha256(encoded).hexdigest(), byte_count=len(encoded),
        normalized_rows_sha256=hashlib.sha256(witness._json(rows)).hexdigest(),
        observation_is_digest=hashlib.sha256(witness._json(header["observation_header"])
            + b"".join(witness._json(row) for row in rows)).hexdigest())
    return changed


def test_exact_raw_is_rows_hash_headers_no_account_reset_and_three_distinct_domains(tmp_path):
    result, close, windows = source()
    before = copy.deepcopy(result)
    metadata = capture(tmp_path, result=result, close=close, windows=windows)
    header, rows = read(tmp_path)
    path = tmp_path / witness.FILE_NAME
    assert metadata["row_count"] == len(rows) == 72
    assert header["binding"] == binding() and header["source_windows"] == windows
    assert header["observation_header"]["bounds"] == {**windows["is"], "bounds_semantics": "START_INCLUSIVE_END_EXCLUSIVE"}
    assert header["observation_header"]["benchmark_locator"] == "P08.verified_tape:test:close:OOS"
    assert header["observation_header"]["symbols"] == ["DEFAULT"]
    assert header["observation_header"]["position_columns"] == ["Position_DEFAULT"]
    selected = result.equity.index[3:75]
    for row, at in zip(rows, selected, strict=True):
        assert row == [int(at.value // 1_000_000), repr(float(result.equity.loc[at])), repr(float(result.returns.loc[at])),
            [repr(float(result.positions.loc[at, "Position_DEFAULT"]))], repr(float(close.loc[at]))]
        assert windows["is"]["start_ms"] <= row[0] < windows["is"]["end_ms"]
    assert rows[0][2] != "0.0"  # carry actual engine return; never reset the IS account.
    assert result.initial_capital == before.initial_capital and result.equity.equals(before.equity)
    assert result.returns.equals(before.returns) and result.positions.equals(before.positions) and result.metadata == before.metadata
    assert metadata["file_sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert metadata["normalized_rows_sha256"] == hashlib.sha256(witness._json(rows)).hexdigest()
    assert metadata["observation_is_digest"] == hashlib.sha256(witness._json(header["observation_header"])
        + b"".join(witness._json(row) for row in rows)).hexdigest()
    assert len({metadata[key] for key in ("file_sha256", "normalized_rows_sha256", "observation_is_digest")}) == 3
    actual = _declared_is_input(result=result, mode="FIXED", sampled=False, window_bounds=_source_windows(windows),
        is_start_utc_ms=windows["is"]["start_ms"], oos_start_utc_ms=windows["oos"]["start_ms"],
        market_close=close, benchmark_locator="P08.verified_tape:test:close:OOS")
    assert metadata["observation_is_digest"] == actual[2]["digest"]
    assert metadata["row_count"] == actual[2]["row_count"]
    assert len(witness._json(metadata)) < 2048 and path.stat().st_mode & 0o777 == 0o600
    verify(path, metadata)


def test_actual_gaps_are_preserved_not_filled_and_non_ns_index_units_work(tmp_path):
    result, close, windows = source()
    removed = result.equity.index[28]
    result = dataclasses.replace(result, **{key: getattr(result, key).drop(removed)
        for key in ("equity", "returns", "positions", "closes")})
    for key in ("equity", "returns", "positions", "closes"):
        getattr(result, key).index = getattr(result, key).index.as_unit("us")
    close = close.drop(removed); close.index = close.index.as_unit("us")
    metadata = capture(tmp_path, result=result, close=close, windows=windows)
    _, rows = read(tmp_path)
    assert metadata["row_count"] == 71 and int(removed.value // 1_000_000) not in [row[0] for row in rows]
    verify(tmp_path / witness.FILE_NAME, metadata, windows=windows)


@pytest.mark.parametrize("kwargs,reason", [
    ({"sampled": True}, "IS_QUALIFICATION_SAMPLED_SOURCE"),
    ({"mode": "WFO"}, "IS_QUALIFICATION_NOT_FIXED"),
])
def test_sample_and_wfo_are_typed_absence_without_output(tmp_path, kwargs, reason):
    metadata = capture(tmp_path, **kwargs)
    assert metadata["state"] == "NOT_PUBLISHED" and metadata["reason_code"] == reason
    witness.validate_is_qualification_metadata(metadata)
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("field,bad", [("equity", float("nan")), ("equity", 0),
    ("returns", float("inf")), ("positions", float("nan"))])
def test_nonfinite_invalid_account_input_is_absent_without_substitution(tmp_path, field, bad):
    result, close, windows = source()
    array = getattr(result, field)
    if isinstance(array, pd.DataFrame):
        array.iloc[20, 0] = bad
    else:
        array.iloc[20] = bad
    metadata = capture(tmp_path, result=result, close=close, windows=windows)
    assert metadata["reason_code"] == "IS_QUALIFICATION_SOURCE_INVALID" and not list(tmp_path.iterdir())


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), 0, -1])
def test_invalid_source_close_is_typed_absent_not_replaced(tmp_path, bad):
    result, close, windows = source(); close.iloc[20] = bad
    metadata = capture(tmp_path, result=result, close=close, windows=windows)
    assert metadata["reason_code"] == "IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE" and not list(tmp_path.iterdir())


def test_missing_result_windows_and_close_remain_absent(tmp_path):
    result, close, windows = source()
    arguments = dict(result=result, market_close=close, output_directory=tmp_path, source_windows=windows,
        binding=binding(), benchmark_locator="P08.verified_tape:test:close:OOS")
    for key, value, reason in [("result", None, "IS_QUALIFICATION_SOURCE_UNAVAILABLE"),
        ("source_windows", None, "IS_QUALIFICATION_DECLARED_WINDOWS_UNAVAILABLE"),
        ("market_close", None, "IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE")]:
        metadata = witness.capture_is_qualification(**{**arguments, key: value})
        assert metadata["reason_code"] == reason
        witness.validate_is_qualification_metadata(metadata)
    assert not list(tmp_path.iterdir())


def test_native_close_prefix_is_pinned_and_same_index_wrong_price_hard_refuses(tmp_path):
    result, close, windows = source()
    result.closes.iloc[20, 0] += 1
    with pytest.raises(ValueError, match="actual consumed engine close"):
        capture(tmp_path, result=result, close=close, windows=windows)
    assert not list(tmp_path.iterdir())
    result.closes.columns = ["DEFAULT"]
    assert capture(tmp_path, result=result, close=close, windows=windows)["reason_code"] == "IS_QUALIFICATION_SOURCE_INVALID"


def test_actual_holdout_source_is_refused_before_filtering(tmp_path):
    result, close, windows = source()
    windows["oos"]["end_ms"] = int(result.equity.index[-1].value // 1_000_000)
    windows["holdout"]["start_ms"] = windows["oos"]["end_ms"]
    with pytest.raises(ValueError, match="contains holdout"):
        capture(tmp_path, result=result, close=close, windows=windows)
    assert not list(tmp_path.iterdir())


def test_holdout_cannot_hide_behind_nonmonotonic_source(tmp_path):
    result, close, windows = source()
    index = result.equity.index[::-1]
    for key in ("equity", "returns", "positions", "closes"):
        getattr(result, key).index = index
    close.index = index
    windows["oos"]["end_ms"] = int(index.max().value // 1_000_000)
    windows["holdout"]["start_ms"] = windows["oos"]["end_ms"]
    with pytest.raises(ValueError, match="contains holdout"):
        capture(tmp_path, result=result, close=close, windows=windows)
    assert not list(tmp_path.iterdir())


def test_non_numeric_close_remains_a_typed_absence(tmp_path):
    result, close, windows = source()
    close = close.astype(object); close.iloc[20] = "not-a-price"
    assert capture(tmp_path, result=result, close=close, windows=windows)["reason_code"] == "IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE"
    assert not list(tmp_path.iterdir())


def test_duplicate_nonmonotonic_and_submillisecond_source_timestamps_are_absent(tmp_path):
    for kind in ("duplicate", "reversed", "submillisecond"):
        result, close, windows = source()
        index = result.equity.index
        if kind == "duplicate":
            index = index.where(np.arange(len(index)) != 20, index[19])
        elif kind == "reversed":
            index = index[::-1]
        else:
            index = index.where(np.arange(len(index)) != 20, index[20] + pd.Timedelta(nanoseconds=1))
        for key in ("equity", "returns", "positions", "closes"):
            getattr(result, key).index = index
        close.index = index
        assert capture(tmp_path, result=result, close=close, windows=windows)["reason_code"] == "IS_QUALIFICATION_SOURCE_INVALID"
    assert not list(tmp_path.iterdir())


def test_row_and_file_caps_are_absent_not_silent_truncation(tmp_path, monkeypatch):
    monkeypatch.setattr(witness, "MAX_ROWS", 71)
    assert capture(tmp_path)["reason_code"] == "IS_QUALIFICATION_ROW_LIMIT_EXCEEDED"
    monkeypatch.setattr(witness, "MAX_ROWS", 20_000)
    monkeypatch.setattr(witness, "MAX_BYTES", 512)
    sentinel = tmp_path / "unrelated"; sentinel.write_bytes(b"keep")
    assert capture(tmp_path)["reason_code"] == "IS_QUALIFICATION_FILE_LIMIT_EXCEEDED"
    assert list(tmp_path.iterdir()) == [sentinel] and sentinel.read_bytes() == b"keep"


@pytest.mark.parametrize("mutate", [
    lambda meta: meta.update(state="AVAILABLE_WITH_SAMPLE"),
    lambda meta: meta.update(extra=True),
    lambda meta: meta.update(file_name="../../other"),
    lambda meta: meta.update(row_count=20_001),
    lambda meta: meta.update(byte_count=2_097_153),
    lambda meta: meta.update(row_count=True),
    lambda meta: meta.update(binding_sha256="not-a-hash"),
    lambda meta: meta.update(first_observed_utc_ms=0),
])
def test_metadata_is_closed_and_bounded(tmp_path, mutate):
    metadata = capture(tmp_path); mutate(metadata)
    with pytest.raises(ValueError):
        witness.validate_is_qualification_metadata(metadata)


def test_external_binding_windows_and_byte_tamper_are_independently_refused(tmp_path):
    metadata = capture(tmp_path); path = tmp_path / witness.FILE_NAME
    wrong = {**binding(), "worker_attempt_id": "rwa_other"}
    with pytest.raises(ValueError, match="expected private attempt"):
        verify(path, metadata, expected_binding=wrong)
    windows = source()[2]; windows["is"]["source_locator"] = "changed-source"
    with pytest.raises(ValueError, match="header binding"):
        verify(path, metadata, windows=windows)
    path.write_bytes(path.read_bytes().replace(b"1006", b"1007", 1))
    with pytest.raises(ValueError):
        verify(path, metadata)


@pytest.mark.parametrize("fault", ["nonfinite", "unquoted", "wrong-repr", "wrong-positions", "oos", "duplicate", "header-bounds"])
def test_resigned_untrusted_rows_still_refuse_source_shape_or_scope(tmp_path, fault):
    metadata = capture(tmp_path); header, rows = read(tmp_path)
    if fault == "nonfinite": rows[0][1] = "nan"
    if fault == "unquoted": rows[0][1] = 1000
    if fault == "wrong-repr": rows[0][1] = "1000"
    if fault == "wrong-positions": rows[0][3].append("1.0")
    if fault == "oos": rows[-1][0] = metadata["is_end_exclusive_utc_ms"]
    if fault == "duplicate": rows[1][0] = rows[0][0]
    if fault == "header-bounds": header["observation_header"]["bounds"].pop("bounds_semantics")
    changed = rewrite(tmp_path, metadata, header, rows)
    with pytest.raises(ValueError):
        verify(tmp_path / witness.FILE_NAME, changed)


def test_noncanonical_or_truncated_lines_are_not_normalized_into_valid_proof(tmp_path):
    metadata = capture(tmp_path); path = tmp_path / witness.FILE_NAME
    original = path.read_bytes()
    for encoded in (original[:-1], original.replace(b'"schema_version":', b'"schema_version": ', 1)):
        path.write_bytes(encoded)
        changed = dict(metadata, byte_count=len(encoded), file_sha256=hashlib.sha256(encoded).hexdigest())
        with pytest.raises(ValueError, match="canonical|truncated"):
            verify(path, changed)


def test_verified_exact_copy_is_private_exclusive_and_preserves_other_files(tmp_path):
    metadata = capture(tmp_path); path = tmp_path / witness.FILE_NAME
    target = tmp_path / "private-copy"; target.mkdir(mode=0o700)
    destination = target / witness.FILE_NAME
    witness.copy_is_qualification_file(path, destination, metadata, binding=binding(), source_windows=source()[2])
    assert destination.read_bytes() == path.read_bytes() and destination.stat().st_mode & 0o777 == 0o600
    verify(destination, metadata)
    with pytest.raises(FileExistsError):
        witness.copy_is_qualification_file(path, destination, metadata, binding=binding(), source_windows=source()[2])
    with pytest.raises(FileExistsError):
        capture(tmp_path)
    assert destination.read_bytes() == path.read_bytes()


def test_file_symlink_parent_symlink_hardlink_and_public_permissions_are_refused(tmp_path):
    metadata = capture(tmp_path); path = tmp_path / witness.FILE_NAME
    symlink = tmp_path / "alias"; symlink.symlink_to(path)
    with pytest.raises((OSError, ValueError)):
        verify(symlink, metadata)
    alias_dir = tmp_path / "alias-dir"; alias_dir.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError, match="parent symlinks"):
        verify(alias_dir / witness.FILE_NAME, metadata)
    link = tmp_path / "hardlink"; link.hardlink_to(path)
    with pytest.raises(ValueError, match="private regular"):
        verify(path, metadata)
    link.unlink(); path.chmod(0o644)
    with pytest.raises(ValueError, match="private regular"):
        verify(path, metadata)
    public = tmp_path / "public"; public.mkdir(mode=0o755)
    with pytest.raises(ValueError, match="private output"):
        capture(public)


def test_interrupted_capture_removes_only_own_incomplete_file(tmp_path, monkeypatch):
    sentinel = tmp_path / "unrelated"; sentinel.write_bytes(b"keep")
    original = witness._write_line; calls = 0
    def interrupted(handle, value, byte_count):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise KeyboardInterrupt("synthetic interruption")
        return original(handle, value, byte_count)
    monkeypatch.setattr(witness, "_write_line", interrupted)
    with pytest.raises(KeyboardInterrupt):
        capture(tmp_path)
    assert list(tmp_path.iterdir()) == [sentinel] and sentinel.read_bytes() == b"keep"


def test_source_mutated_after_verify_cannot_leave_a_copied_false_witness(tmp_path, monkeypatch):
    metadata = capture(tmp_path); path = tmp_path / witness.FILE_NAME
    target = tmp_path / "copy"; target.mkdir(mode=0o700)
    destination = target / witness.FILE_NAME
    original = witness._verify_handle
    def mutate_after(handle, source_metadata, **kwargs):
        original(handle, source_metadata, **kwargs)
        encoded = path.read_bytes().replace(b"DEFAULT", b"DEFAVLT", 1)
        path.write_bytes(encoded)
    monkeypatch.setattr(witness, "_verify_handle", mutate_after)
    with pytest.raises(ValueError, match="changed during exact copy"):
        witness.copy_is_qualification_file(path, destination, metadata, binding=binding(), source_windows=source()[2])
    assert not destination.exists()


def test_helper_has_no_engine_execution_metrics_or_public_wire_mutation():
    code = inspect.getsource(witness)
    assert ".backtest(" not in code and ".full_report(" not in code and "enrich_analysis(" not in code
    assert "os.O_EXCL" in code and "os.O_NOFOLLOW" in code and "0o600" in code
    assert witness.MAX_ROWS == 20_000 and witness.MAX_BYTES == 2 * 1024 * 1024
