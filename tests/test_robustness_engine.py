import math
import pytest
from app.robustness_engine import run_robustness


def candles(n=1200):
    rows = []
    price = 100.0
    for i in range(n):
        price *= 1 + 0.001 * math.sin(i / 9) + 0.00015 * math.sin(i / 2.7)
        rows.append({"open": price * .999, "high": price * 1.006,
                     "low": price * .994, "close": price,
                     "volume": 100 + i % 17, "timestamp": i})
    return rows


def test_insufficient_data_is_safe():
    result = run_robustness(candles(100))
    assert result["status"] == "insufficient_data"
    assert result["families"] == []


def test_returns_four_families_and_three_folds():
    result = run_robustness(candles())
    assert result["status"] == "ok"
    assert len(result["families"]) == 4
    assert all(len(x["folds"]) == 3 for x in result["families"])


def test_stress_costs_are_higher_than_baseline():
    result = run_robustness(candles())
    assumptions = result["stress_assumptions"]
    assert assumptions["fee_per_side_pct"] >= 0.15
    assert assumptions["slippage_per_side_pct"] >= 0.1


def test_invalid_costs_rejected():
    with pytest.raises(ValueError):
        run_robustness(candles(), fee_rate=float("nan"))


def test_stress_never_reduces_extreme_baseline_costs():
    result = run_robustness(candles(), fee_rate=0.0995, slippage_rate=0.0995)
    assumptions = result["stress_assumptions"]
    assert assumptions["fee_per_side_pct"] >= 9.95
    assert assumptions["slippage_per_side_pct"] >= 9.95
