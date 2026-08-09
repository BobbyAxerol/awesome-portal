from __future__ import annotations

import importlib
from typing import Any, Mapping

import pandas as pd


class QuantBTGateway:
    """Lazy public-API boundary; no QuantBT import occurs at module import time."""

    @staticmethod
    def _module():
        module = importlib.import_module("quantbt")
        if not hasattr(module, "QuantBTEndpoint"):
            raise RuntimeError(
                "QuantBT public package is unavailable. Install quantbt-engine or set "
                "PYTHONPATH to the repository src directory."
            )
        return module

    def walkforward_capabilities(self) -> list[dict[str, Any]]:
        matrix = self._module().walkforward_support_matrix()
        if isinstance(matrix, pd.DataFrame):
            return matrix.where(pd.notna(matrix), None).to_dict(orient="records")
        if isinstance(matrix, list):
            return [dict(item) if isinstance(item, Mapping) else {"value": item} for item in matrix]
        raise TypeError("unsupported QuantBT capability response")

    def validate_param_ranges(self, ranges: Mapping[str, object]) -> None:
        self._module().validate_param_ranges(dict(ranges))

    def train_test_split_endpoint(self, **kwargs):
        return self._module().QuantBTEndpoint.train_test_split(**kwargs)

    def pct_equity_endpoint(self, **kwargs):
        return self._module().QuantBTEndpoint.pct_equity(**kwargs)
