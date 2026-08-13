import numpy as np
import pandas as pd
from numba import njit

# Các mã hàm tính toán ocssillator
@njit(fastmath=True)
def n_sma(src, length):
    n = len(src)
    out = np.zeros_like(src)
    if n < length:
        return out
    current_sum = 0.0
    for i in range(length):
        current_sum += src[i]
    out[length - 1] = current_sum / length
    for i in range(length, n):
        current_sum = current_sum - src[i - length] + src[i]
        out[i] = current_sum / length
    return out

@njit(fastmath=True)
def n_ema(src, length):
    alpha = 2.0 / (length + 1)
    out = np.zeros_like(src)
    out[0] = src[0]
    for i in range(1, len(src)):
        out[i] = alpha * src[i] + (1.0 - alpha) * out[i-1]
    return out

@njit(fastmath=True)
def n_atr(h, l, c, length):
    tr = np.zeros_like(c)
    tr[0] = h[0] - l[0]
    for i in range(1, len(c)):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i-1]), abs(l[i] - c[i-1]))
    return n_ema(tr, length)

@njit(fastmath=True)
def n_rsi(src, length):
    n = len(src)
    out = np.zeros_like(src)
    if n <= length:
        return out
    gains = np.zeros_like(src)
    losses = np.zeros_like(src)
    for i in range(1, n):
        diff = src[i] - src[i-1]
        gains[i] = max(diff, 0.0)
        losses[i] = max(-diff, 0.0)
    
    sum_gain = 0.0
    sum_loss = 0.0
    for i in range(1, length + 1):
        sum_gain += gains[i]
        sum_loss += losses[i]
    avg_gain = sum_gain / length
    avg_loss = sum_loss / length
    
    if avg_loss == 0.0:
        out[length] = 100.0 if avg_gain > 0.0 else 50.0
    else:
        out[length] = 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
        
    alpha = 1.0 / length 
    for i in range(length + 1, n):
        avg_gain = alpha * gains[i] + (1.0 - alpha) * avg_gain
        avg_loss = alpha * losses[i] + (1.0 - alpha) * avg_loss
        if avg_loss == 0.0:
            out[i] = 100.0
        else:
            out[i] = 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
    return out

# LÕI MÁY TRẠNG THÁI KIỂM ĐỊNH DELTA-RSI ĐA FILTER, gradient-RSI, Savitzky-Golay, EMA, ATR, Volume Filter, SL/TP/Trailing Stop
@njit(fastmath=True)
def core_delta_rsi_signals(
    close, high, low, volume, sg_weights,
    rsi_l, window, signal_len,
    len_atr1, len_atr2, rvol, len_vol, sl_pct,
):
    # This kernel is intentionally specialized to the established hyhy strategy:
    # quadratic Delta-RSI, signal-line long entry, direction-change short/exit,
    # ATR and relative-volume filters, and hard SL without trailing or TP.
    n = len(close)
    pos_weight = np.zeros(n)
    exit_type = np.zeros(n)   # 1: hard SL, 3: indicator exit
    exit_price = np.zeros(n)

    rsi_src = n_rsi(close, rsi_l)
    atr_m1 = n_atr(high, low, close, len_atr1)
    atr_m2 = n_atr(high, low, close, len_atr2)
    vol_sma = n_sma(volume, len_vol)

    drsi = np.zeros(n)
    for t in range(n):
        if t >= window - 1:
            value = 0.0
            for i in range(window):
                value += sg_weights[i] * rsi_src[t - window + 1 + i]
            drsi[t] = value

    signalline = n_ema(drsi, signal_len)

    target_w = 0.0
    stop_loss = 0.0
    start_idx = max(rsi_l, max(window, max(len_vol, len_atr2))) + 10

    for t in range(2, n):
        # The current bar starts with the previous bar's target position.
        pos_weight[t] = target_w

        exited_this_bar = False
        if target_w == 1.0:
            if low[t] <= stop_loss:
                exit_type[t] = 1.0
                exit_price[t] = stop_loss
                target_w = 0.0
                exited_this_bar = True
        elif target_w == -1.0:
            if high[t] >= stop_loss:
                exit_type[t] = 1.0
                exit_price[t] = stop_loss
                target_w = 0.0
                exited_this_bar = True

        dirchangeup = (
            (drsi[t] > drsi[t - 1])
            and (drsi[t - 1] < drsi[t - 2])
            and (drsi[t - 1] < 0.0)
        )
        dirchangedw = (
            (drsi[t] < drsi[t - 1])
            and (drsi[t - 1] > drsi[t - 2])
            and (drsi[t - 1] > 0.0)
        )
        crosssignalup = (
            (drsi[t] > signalline[t])
            and (drsi[t - 1] <= signalline[t - 1])
        )

        totalfilter = (
            (atr_m1[t] > atr_m2[t])
            and (volume[t] > rvol * vol_sma[t])
        )

        if target_w == 1.0 and not exited_this_bar:
            if dirchangedw and totalfilter:
                exit_type[t] = 3.0
                exit_price[t] = close[t]
                target_w = 0.0
                exited_this_bar = True
        elif target_w == -1.0 and not exited_this_bar:
            if dirchangeup and totalfilter:
                exit_type[t] = 3.0
                exit_price[t] = close[t]
                target_w = 0.0
                exited_this_bar = True

        if target_w == 0.0 and not exited_this_bar and t >= start_idx:
            if crosssignalup and totalfilter:
                target_w = 1.0
                stop_loss = close[t] * (1.0 - sl_pct)
            elif dirchangedw and totalfilter:
                target_w = -1.0
                stop_loss = close[t] * (1.0 + sl_pct)

    return pos_weight, exit_type, exit_price


#  SECTION 3: WRAPPER PYTHON TÍNH TOÁN MA TRẬN VÀ KẾT NỐI PANDAS ───

def compute_savitzky_golay_weights(window, degree):
    """
    Tính toán chính xác hệ số Pseudoinverse ma trận Vandermonde tại Python tầng cao.
    Cho ra kết quả trùng khớp sai số hình học tuyệt đối của đa thức giải tích gốc.
    """
    # Khởi tạo ma trận Vandermonde J: kích thước (window x degree + 1)
    J = np.zeros((window, degree + 1))
    for i in range(window):
        for j in range(degree + 1):
            J[i, j] = float(i) ** j

    # Tính toán ma trận nghịch đảo giả Moore-Penrose (OLS solution)
    C = np.linalg.pinv(J)  # kích thước (degree + 1 x window)

    # Thiết lập Vector trọng số W để tính đạo hàm bậc 1 tại điểm hiện hành z = window - 1
    W = np.zeros(degree + 1)
    for j in range(1, degree + 1):
        W[j] = j * (float(window) - 1.0) ** (j - 1)

    # Chập vector tạo mảng lọc tích chập phẳng: g = W^T * C
    sg_weights = W @ C
    return sg_weights

def generate_delta_rsi_signals(df, p):
    """Generate Delta-RSI signals from the active scalar calibration surface.

    p must contain: window, rsi_l, signalLength, len_atr1, len_atr2, rvol,
    len_vol, and slpercent. The established hyhy strategy family is encoded
    directly in the causal signal and kernel flow below.
    """
    df = df.copy()


    window = int(p["window"])
    rsi_l = int(p["rsi_l"])
    signal_len = int(p["signalLength"])
    len_atr1 = int(p["len_atr1"])
    len_atr2 = int(p["len_atr2"])
    rvol = float(p["rvol"])
    len_vol = int(p["len_vol"])
    sl_pct = float(p["slpercent"]) * 0.01

    # Fixed quadratic causal derivative. Maintain the original window safeguard.
    if window <= 2:
        window = 3
    sg_weights = compute_savitzky_golay_weights(window, 2)

    c = df["close"].values.astype(np.float64)
    h = df["high"].values.astype(np.float64)
    l = df["low"].values.astype(np.float64)
    v = df["volume"].values.astype(np.float64)

    pos, e_type, e_price = core_delta_rsi_signals(
        c, h, l, v, sg_weights,
        rsi_l, window, signal_len,
        len_atr1, len_atr2, rvol, len_vol, sl_pct,
    )

    df["pos_weight"] = pos
    df["exit_type"] = e_type
    df["exit_price"] = e_price
    return df