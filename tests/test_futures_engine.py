from types import SimpleNamespace
import pytest

from app.futures_engine import (
    MAX_LEVERAGE,
    choose_leverage,
    estimate_liquidation_price,
    liquidation_is_beyond_stop,
    size_isolated_position,
    linear_pnl,
    funding_cashflow,
    resolve_mark_candle_exit,
    resolve_liquidation_exit,
    funding_timestamp_is_due,
    apply_entry_slippage,
)


def test_leverage_is_quality_driven_and_bounded():
    assert choose_leverage(80, "A", 0.3, 100_000_000) == 1
    assert choose_leverage(88, "A", 0.3, 100_000_000) == 4
    assert choose_leverage(99, "S", 0.3, 100_000_000) == MAX_LEVERAGE
    assert choose_leverage(99, "S", 0.3, 100_000_000, max_leverage=3) == 3
    assert choose_leverage(99, "S", 2.5, 1_000_000) < 8


def test_liquidation_estimate_is_directional_and_stop_buffered():
    long_liq = estimate_liquidation_price(100, "BUY", 5, 0.01)
    short_liq = estimate_liquidation_price(100, "SELL", 5, 0.01)
    assert long_liq < 100 < short_liq
    assert liquidation_is_beyond_stop(100, 95, "BUY", 5, 0.01)
    assert liquidation_is_beyond_stop(100, 105, "SELL", 5, 0.01)
    assert not liquidation_is_beyond_stop(100, 90, "BUY", 8, 0.01)


def test_position_sizing_keeps_risk_constant_and_leverage_only_changes_margin():
    args = dict(
        equity=10_000, balance=10_000, entry=100, stop=95,
        direction="BUY", grade="A", atr_pct=0.3,
        quote_volume_24h=100_000_000,
        max_risk_fraction=0.015, max_total_risk_fraction=0.04,
    )
    low = size_isolated_position(confidence=80, **args)
    high = size_isolated_position(confidence=99, **args)
    assert low.allowed and high.allowed
    assert low.quantity == pytest.approx(high.quantity)
    assert low.leverage == 1
    assert high.leverage == 8
    assert low.margin_used > high.margin_used
    assert low.quantity * abs(100 - 95) <= 150.000001


def test_size_is_blocked_if_liquidation_not_safely_past_stop():
    decision = size_isolated_position(
        equity=10_000, balance=10_000, entry=100, stop=5,
        direction="BUY", confidence=99, grade="S", atr_pct=0.2,
        quote_volume_24h=100_000_000,
    )
    assert decision.allowed is False


def test_linear_pnl_does_not_multiply_by_leverage():
    assert linear_pnl(100, 110, 2, "BUY") == pytest.approx(20)
    assert linear_pnl(100, 90, 2, "SELL") == pytest.approx(20)


def test_funding_sign_for_long_and_short():
    assert funding_cashflow(10_000, 0.001, "BUY") == pytest.approx(-10)
    assert funding_cashflow(10_000, 0.001, "SELL") == pytest.approx(10)
    assert funding_cashflow(10_000, -0.001, "BUY") == pytest.approx(10)


def test_stop_wins_same_candle_collision_for_long_and_short():
    long = resolve_mark_candle_exit(
        direction="BUY", stop=95, target=110,
        candle={"open": 100, "high": 111, "low": 94}, slippage_rate=0,
    )
    short = resolve_mark_candle_exit(
        direction="SELL", stop=105, target=90,
        candle={"open": 100, "high": 106, "low": 89}, slippage_rate=0,
    )
    assert long.should_close and long.reason == "stop_loss_both_touched" and long.ambiguous
    assert long.exit_price == 95
    assert short.should_close and short.reason == "stop_loss_both_touched" and short.ambiguous
    assert short.exit_price == 105


def test_stop_gap_fills_at_worse_open_and_targets_apply_adverse_slippage():
    gap = resolve_mark_candle_exit(
        direction="BUY", stop=95, target=110,
        candle={"open": 92, "high": 96, "low": 91}, slippage_rate=0,
    )
    target = resolve_mark_candle_exit(
        direction="BUY", stop=95, target=110,
        candle={"open": 100, "high": 112, "low": 99}, slippage_rate=0.01,
    )
    assert gap.exit_price == 92
    assert target.exit_price == pytest.approx(108.9)


def test_liquidation_trigger_and_funding_idempotency():
    hit = resolve_liquidation_exit(direction="BUY", mark_price=80, liquidation_price=85)
    miss = resolve_liquidation_exit(direction="SELL", mark_price=104, liquidation_price=110)
    assert hit.should_close and hit.reason == "liquidation"
    assert not miss.should_close
    assert funding_timestamp_is_due(10, None)
    assert funding_timestamp_is_due(11, 10)
    assert not funding_timestamp_is_due(10, 10)


def test_risk_sizing_includes_entry_exit_fees_and_adverse_slippage():
    decision = size_isolated_position(
        equity=10_000, balance=10_000, entry=100, stop=95,
        direction="BUY", confidence=90, grade="A", atr_pct=0.2,
        quote_volume_24h=100_000_000, taker_fee_rate=0.0005,
        slippage_rate=0.001,
    )
    assert decision.allowed
    adverse_stop_fill = 95 * (1 - 0.001)
    unit_net_stop_risk = abs(100 - adverse_stop_fill) + (100 + adverse_stop_fill) * 0.0005
    assert decision.quantity * unit_net_stop_risk <= decision.risk_budget + 1e-8


def test_entry_slippage_is_adverse_for_both_directions():
    assert apply_entry_slippage(100, "BUY", 0.01) == pytest.approx(101)
    assert apply_entry_slippage(100, "SELL", 0.01) == pytest.approx(99)
