from app.analyzer import ema, atr, build_setup


def test_ema_length():
    assert len(ema(list(range(1, 60)), 20)) == 59


def test_atr_positive():
    candles = [
        {"high": 10 + i, "low": 8 + i, "close": 9 + i}
        for i in range(20)
    ]
    assert atr(candles, 14) > 0


def test_no_setup_short_history():
    candles = [
        {"open": 1, "high": 2, "low": 0, "close": 1, "volume": 1}
    ] * 20

    assert build_setup(candles, "BTCUSDT") is None
