"""Deterministic mechanics for MIRAGE USDT-M perpetual Paper Trading.

This module contains no exchange-order code. Liquidation is an estimate using a
conservative maintenance-margin-rate assumption, not Binance's live bracket table.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite
from typing import Iterable, Mapping

MARKET_TYPE = "usdt_perpetual_futures"
MAX_LEVERAGE = 8
DEFAULT_TAKER_FEE_RATE = 0.0005  # conservative 5 bps per taker fill
DEFAULT_SLIPPAGE_RATE = 0.0002  # 2 bps per fill
DEFAULT_MAINTENANCE_MARGIN_RATE = 0.01  # conservative estimate; not exchange tier data
DEFAULT_LIQUIDATION_FEE_RATE = 0.01


@dataclass(frozen=True)
class PositionSizing:
    allowed: bool
    quantity: float
    leverage: int
    margin_used: float
    risk_budget: float
    reserved_risk: float
    liquidation_price: float | None
    reason: str


@dataclass(frozen=True)
class ExitDecision:
    should_close: bool
    exit_price: float | None
    reason: str | None
    ambiguous: bool = False


def _positive(value: float, name: str) -> float:
    value = float(value)
    if not isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a finite positive number")
    return value


def choose_leverage(
    confidence: float,
    grade: str | None,
    atr_pct: float,
    quote_volume_24h: float,
    *,
    max_leverage: int = MAX_LEVERAGE,
) -> int:
    """Choose integer leverage 1..8 from signal quality, volatility and liquidity.

    Confidence is the already direction-normalized score (0..100). Volatility
    and thin liquidity only reduce leverage; neither can increase it.
    """
    confidence = max(0.0, min(100.0, float(confidence)))
    atr_pct = max(0.0, float(atr_pct or 0.0))
    quote_volume_24h = max(0.0, float(quote_volume_24h or 0.0))

    if confidence < 83:
        leverage = 1
    elif confidence < 85:
        leverage = 2
    elif confidence < 88:
        leverage = 3
    elif confidence < 91:
        leverage = 4
    elif confidence < 94:
        leverage = 5
    elif confidence < 97:
        leverage = 6
    elif confidence < 99:
        leverage = 7
    else:
        leverage = 8

    # Grade is a tie-breaker only; the confidence tier still dominates.
    if (grade or "").upper() == "S" and confidence >= 91:
        leverage += 1

    if atr_pct >= 2.0:
        leverage -= 2
    elif atr_pct >= 1.0:
        leverage -= 1

    if quote_volume_24h < 5_000_000:
        leverage -= 2
    elif quote_volume_24h < 20_000_000:
        leverage -= 1

    return max(1, min(MAX_LEVERAGE, max(1, int(max_leverage)), leverage))


def estimate_liquidation_price(
    entry: float,
    direction: str,
    leverage: int,
    maintenance_margin_rate: float = DEFAULT_MAINTENANCE_MARGIN_RATE,
) -> float:
    """Estimate isolated liquidation mark price using a flat MMR assumption.

    Actual Binance liquidation depends on symbol/position notional brackets,
    maintenance amount, fees and funding. Do not treat this as an exchange quote.
    """
    entry = _positive(entry, "entry")
    direction = direction.upper()
    leverage = int(leverage)
    mmr = float(maintenance_margin_rate)
    if direction not in {"BUY", "SELL"}:
        raise ValueError("direction must be BUY or SELL")
    if not 1 <= leverage <= MAX_LEVERAGE:
        raise ValueError("leverage must be between 1 and 8")
    if not isfinite(mmr) or not 0 <= mmr < 0.25:
        raise ValueError("maintenance margin rate is invalid")

    fraction = 1.0 / leverage
    price = entry * (1.0 - fraction + mmr) if direction == "BUY" else entry * (1.0 + fraction - mmr)
    return max(0.0, price)


def liquidation_is_beyond_stop(
    entry: float,
    stop: float,
    direction: str,
    leverage: int,
    maintenance_margin_rate: float = DEFAULT_MAINTENANCE_MARGIN_RATE,
    buffer_fraction: float = 0.20,
) -> bool:
    """Require estimated liquidation to sit beyond the stop plus a safety buffer."""
    entry = _positive(entry, "entry")
    stop = _positive(stop, "stop")
    liq = estimate_liquidation_price(entry, direction, leverage, maintenance_margin_rate)
    distance = abs(entry - stop)
    buffer = distance * max(0.0, float(buffer_fraction))
    if direction.upper() == "BUY":
        return liq < stop - buffer
    if direction.upper() == "SELL":
        return liq > stop + buffer
    raise ValueError("direction must be BUY or SELL")


def _position_risk(
    position: object, *, fee_rate: float, slippage_rate: float
) -> float:
    """Reserve estimated net stop risk, including round-trip costs."""
    qty = max(0.0, float(getattr(position, "quantity", 0.0) or 0.0))
    entry = max(0.0, float(getattr(position, "entry_price", 0.0) or 0.0))
    stop = getattr(position, "stop_loss", None)
    if stop is None or entry <= 0:
        current = max(0.0, float(getattr(position, "current_price", 0.0) or entry))
        return qty * max(entry, current)
    stop = float(stop)
    direction = str(getattr(position, "direction", "BUY")).upper()
    adverse_exit = stop * (1.0 - slippage_rate) if direction == "BUY" else stop * (1.0 + slippage_rate)
    gross_stop_loss = abs(entry - adverse_exit)
    round_trip_fees = (entry + adverse_exit) * fee_rate
    return qty * (gross_stop_loss + round_trip_fees)


def _position_exposure(position: object) -> float:
    qty = max(0.0, float(getattr(position, "quantity", 0.0) or 0.0))
    price = max(
        0.0,
        float(getattr(position, "current_price", 0.0) or getattr(position, "entry_price", 0.0) or 0.0),
    )
    return qty * price


def size_isolated_position(
    *,
    equity: float,
    balance: float,
    entry: float,
    stop: float,
    direction: str,
    confidence: float,
    grade: str | None,
    atr_pct: float,
    quote_volume_24h: float,
    open_positions: Iterable[object] = (),
    max_risk_fraction: float = 0.015,
    max_total_risk_fraction: float = 0.04,
    max_exposure_fraction: float = 0.75,
    max_margin_fraction: float = 0.50,
    max_positions: int = 3,
    max_leverage: int = MAX_LEVERAGE,
    maintenance_margin_rate: float = DEFAULT_MAINTENANCE_MARGIN_RATE,
    liquidation_buffer_fraction: float = 0.20,
    taker_fee_rate: float = DEFAULT_TAKER_FEE_RATE,
    slippage_rate: float = DEFAULT_SLIPPAGE_RATE,
) -> PositionSizing:
    """Size a linear USDT perpetual by stop-risk, then cap exposure and margin.

    Leverage changes initial margin and estimated liquidation distance. It does
    *not* multiply the allowed loss budget or the PnL formula.
    """
    try:
        equity = _positive(equity, "equity")
        balance = _positive(balance, "balance")
        entry = _positive(entry, "entry")
        stop = _positive(stop, "stop")
    except (TypeError, ValueError) as exc:
        return PositionSizing(False, 0.0, 1, 0.0, 0.0, 0.0, None, f"invalid_{str(exc).split()[0]}")

    direction = direction.upper()
    if direction not in {"BUY", "SELL"}:
        return PositionSizing(False, 0.0, 1, 0.0, 0.0, 0.0, None, "invalid_direction")
    if (direction == "BUY" and not stop < entry) or (direction == "SELL" and not stop > entry):
        return PositionSizing(False, 0.0, 1, 0.0, 0.0, 0.0, None, "invalid_stop_side")

    positions = list(open_positions)
    if len(positions) >= max_positions:
        return PositionSizing(False, 0.0, 1, 0.0, 0.0, 0.0, None, "position_limit")

    taker_fee_rate = float(taker_fee_rate)
    slippage_rate = float(slippage_rate)
    if not isfinite(taker_fee_rate) or not 0 <= taker_fee_rate <= 0.05:
        return PositionSizing(False, 0.0, 1, 0.0, 0.0, 0.0, None, "invalid_taker_fee_rate")
    if not isfinite(slippage_rate) or not 0 <= slippage_rate < 0.1:
        return PositionSizing(False, 0.0, 1, 0.0, 0.0, 0.0, None, "invalid_slippage_rate")

    reserved_risk = sum(
        _position_risk(p, fee_rate=taker_fee_rate, slippage_rate=slippage_rate)
        for p in positions
    )
    exposure = sum(_position_exposure(p) for p in positions)
    used_margin = sum(max(0.0, float(getattr(p, "margin_used", 0.0) or 0.0)) for p in positions)
    remaining_risk = max(0.0, equity * max_total_risk_fraction - reserved_risk)
    risk_budget = min(equity * max_risk_fraction, remaining_risk)
    if risk_budget <= 0:
        return PositionSizing(False, 0.0, 1, 0.0, risk_budget, reserved_risk, None, "aggregate_risk_limit")

    # Model loss at the adverse stop fill, plus both taker fills.
    adverse_stop_fill = stop * (1.0 - slippage_rate) if direction == "BUY" else stop * (1.0 + slippage_rate)
    unit_risk = abs(entry - adverse_stop_fill) + (entry + adverse_stop_fill) * taker_fee_rate
    if unit_risk <= 0 or not isfinite(unit_risk):
        return PositionSizing(False, 0.0, 1, 0.0, risk_budget, reserved_risk, None, "invalid_unit_risk")
    qty_by_risk = risk_budget / unit_risk
    remaining_exposure = max(0.0, equity * max_exposure_fraction - exposure)
    qty_by_exposure = remaining_exposure / entry

    leverage = choose_leverage(
        confidence, grade, atr_pct, quote_volume_24h, max_leverage=max_leverage
    )
    while leverage > 1 and not liquidation_is_beyond_stop(
        entry, stop, direction, leverage, maintenance_margin_rate, liquidation_buffer_fraction
    ):
        leverage -= 1
    if not liquidation_is_beyond_stop(
        entry, stop, direction, leverage, maintenance_margin_rate, liquidation_buffer_fraction
    ):
        return PositionSizing(False, 0.0, leverage, 0.0, risk_budget, reserved_risk, None, "liquidation_too_close_to_stop")

    remaining_margin = max(0.0, min(equity * max_margin_fraction, balance) - used_margin)
    qty_by_margin = remaining_margin * leverage / entry
    quantity = min(qty_by_risk, qty_by_exposure, qty_by_margin)
    if not isfinite(quantity) or quantity <= 0:
        return PositionSizing(False, 0.0, leverage, 0.0, risk_budget, reserved_risk, None, "margin_or_exposure_limit")

    margin = quantity * entry / leverage
    liq = estimate_liquidation_price(entry, direction, leverage, maintenance_margin_rate)
    return PositionSizing(True, quantity, leverage, margin, risk_budget, reserved_risk, liq, "approved")


def linear_pnl(entry: float, exit_price: float, quantity: float, direction: str) -> float:
    entry = _positive(entry, "entry")
    exit_price = _positive(exit_price, "exit_price")
    quantity = _positive(quantity, "quantity")
    if direction.upper() == "BUY":
        return (exit_price - entry) * quantity
    if direction.upper() == "SELL":
        return (entry - exit_price) * quantity
    raise ValueError("direction must be BUY or SELL")


def funding_cashflow(notional_at_funding: float, funding_rate: float, direction: str) -> float:
    """Positive rate means longs pay shorts; return signed wallet cashflow."""
    notional_at_funding = max(0.0, float(notional_at_funding))
    rate = float(funding_rate)
    if not isfinite(notional_at_funding) or not isfinite(rate):
        raise ValueError("funding inputs must be finite")
    if direction.upper() == "BUY":
        return -notional_at_funding * rate
    if direction.upper() == "SELL":
        return notional_at_funding * rate
    raise ValueError("direction must be BUY or SELL")


def apply_entry_slippage(price: float, direction: str, slippage_rate: float = DEFAULT_SLIPPAGE_RATE) -> float:
    """Adverse market-entry fill: long buys higher; short sells lower."""
    price = _positive(price, "price")
    slippage = float(slippage_rate)
    if not 0 <= slippage < 0.1:
        raise ValueError("slippage rate must be between 0 and 10%")
    if direction.upper() == "BUY":
        return price * (1.0 + slippage)
    if direction.upper() == "SELL":
        return price * (1.0 - slippage)
    raise ValueError("direction must be BUY or SELL")


def apply_slippage(price: float, direction: str, slippage_rate: float = DEFAULT_SLIPPAGE_RATE) -> float:
    """Adverse exit slippage: closing a long sells lower; closing a short buys higher."""
    price = _positive(price, "price")
    slippage = float(slippage_rate)
    if not 0 <= slippage < 0.1:
        raise ValueError("slippage rate must be between 0 and 10%")
    if direction.upper() == "BUY":
        return price * (1.0 - slippage)
    if direction.upper() == "SELL":
        return price * (1.0 + slippage)
    raise ValueError("direction must be BUY or SELL")


def resolve_mark_candle_exit(
    *,
    direction: str,
    stop: float,
    target: float,
    candle: Mapping[str, float],
    slippage_rate: float = DEFAULT_SLIPPAGE_RATE,
) -> ExitDecision:
    """Resolve a Futures mark-price OHLC candle, choosing SL first on collisions.

    A stop gap fills from the worse of the stop and candle open. A target is
    never filled at a better price than its target; adverse slippage is applied.
    """
    direction = direction.upper()
    stop = _positive(stop, "stop")
    target = _positive(target, "target")
    open_price = _positive(candle.get("open"), "candle.open")
    high = _positive(candle.get("high"), "candle.high")
    low = _positive(candle.get("low"), "candle.low")
    if high < low or not low <= open_price <= high:
        raise ValueError("invalid OHLC candle")

    if direction == "BUY":
        stop_hit, target_hit = low <= stop, high >= target
    elif direction == "SELL":
        stop_hit, target_hit = high >= stop, low <= target
    else:
        raise ValueError("direction must be BUY or SELL")

    if not stop_hit and not target_hit:
        return ExitDecision(False, None, None, False)

    if stop_hit:
        ambiguous = bool(target_hit)
        raw_fill = min(stop, open_price) if direction == "BUY" else max(stop, open_price)
        gap = (direction == "BUY" and open_price < stop) or (direction == "SELL" and open_price > stop)
        reason = "stop_loss_both_touched" if ambiguous else "stop_loss_gap" if gap else "stop_loss"
        return ExitDecision(True, apply_slippage(raw_fill, direction, slippage_rate), reason, ambiguous)

    # Target fill cannot improve beyond the level, then account for adverse costs.
    return ExitDecision(True, apply_slippage(target, direction, slippage_rate), "take_profit", False)


def resolve_liquidation_exit(
    *,
    direction: str,
    mark_price: float,
    liquidation_price: float,
    slippage_rate: float = DEFAULT_SLIPPAGE_RATE,
) -> ExitDecision:
    mark_price = _positive(mark_price, "mark_price")
    liquidation_price = _positive(liquidation_price, "liquidation_price")
    direction = direction.upper()
    hit = mark_price <= liquidation_price if direction == "BUY" else mark_price >= liquidation_price if direction == "SELL" else False
    if direction not in {"BUY", "SELL"}:
        raise ValueError("direction must be BUY or SELL")
    if not hit:
        return ExitDecision(False, None, None, False)
    return ExitDecision(True, apply_slippage(mark_price, direction, slippage_rate), "liquidation", False)


def funding_timestamp_is_due(funding_time_ms: int, last_funding_time_ms: int | None) -> bool:
    """Strict idempotency guard for each exchange funding event."""
    return last_funding_time_ms is None or int(funding_time_ms) > int(last_funding_time_ms)


def iso_to_epoch_ms(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)
