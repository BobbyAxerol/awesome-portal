"""Protected Delta-RSI strategy package used by the portal adapter.

Importing this package never compiles Numba: ``strategy.main`` (the protected
kernel) is imported lazily inside ``delta_rsi.generate_signals`` only.
"""

from .params import param_ranges, strategy_name
from .specification import DELTA_RSI_SPECIFICATION, StrategySpecification
from .registry import (
    StrategyGenerators,
    get_generators,
    get_specification,
    list_specifications,
)

__all__ = [
    "param_ranges",
    "strategy_name",
    "DELTA_RSI_SPECIFICATION",
    "StrategySpecification",
    "StrategyGenerators",
    "get_generators",
    "get_specification",
    "list_specifications",
]
