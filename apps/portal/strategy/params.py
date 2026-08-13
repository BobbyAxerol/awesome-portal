param_ranges = {
    "window": (20, 60, 2),
    "rsi_l": (12, 30, 1),
    "signalLength": (3, 20, 1),

    # Fast ATR vs slow ATR; khoảng không chồng nhau để luôn fast < slow.
    "len_atr1": (5, 20, 1),
    "len_atr2": (25, 60, 1),

    # Volume phải lớn hơn rvol x SMA(volume).
    "rvol": (1.0, 2.5, 0.1),
    "len_vol": (8, 40, 2),

    # Hard SL đang active.
    "slpercent": (0.7, 2.5, 0.1),
}

strategy_name = 'delta-rsi-polynomial-alpha'

