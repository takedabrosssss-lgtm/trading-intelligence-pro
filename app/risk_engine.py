"""Deterministic risk controls for MIRAGE Paper Trading. No live-order functionality."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class RiskDecision:
    allowed: bool
    quantity: float
    risk_budget: float
    reserved_risk: float
    reason: str


def assess_position(*, equity: float, entry: float, stop: float,
                    open_positions: Iterable[object], max_risk_fraction: float = 0.015,
                    max_total_risk_fraction: float = 0.04,
                    max_exposure_fraction: float = 0.90,
                    max_positions: int = 3) -> RiskDecision:
    """Size a new position against existing stop-risk and notional exposure.

    Existing positions are objects exposing entry_price, stop_loss, quantity,
    current_price and direction. Missing/invalid stops reserve full notional as
    a conservative fallback, preventing an unprotected position from being ignored.
    """
    if equity <= 0 or entry <= 0 or stop <= 0 or entry == stop:
        return RiskDecision(False, 0.0, 0.0, 0.0, "invalid_equity_or_levels")
    positions = list(open_positions)
    if len(positions) >= max_positions:
        return RiskDecision(False, 0.0, 0.0, 0.0, "position_limit")

    reserved = 0.0
    exposure = 0.0
    for p in positions:
        qty = max(0.0, float(getattr(p, "quantity", 0.0) or 0.0))
        px = float(getattr(p, "current_price", 0.0) or getattr(p, "entry_price", 0.0) or 0.0)
        exposure += qty * px
        p_entry = float(getattr(p, "entry_price", 0.0) or 0.0)
        p_stop = getattr(p, "stop_loss", None)
        if p_stop is None or p_entry <= 0:
            reserved += qty * max(px, p_entry)
        else:
            reserved += qty * abs(p_entry - float(p_stop))

    total_budget = equity * max_total_risk_fraction
    per_trade_budget = equity * max_risk_fraction
    remaining = max(0.0, total_budget - reserved)
    risk_budget = min(per_trade_budget, remaining)
    stop_distance = abs(entry - stop)
    qty_risk = risk_budget / stop_distance if stop_distance else 0.0
    remaining_exposure = max(0.0, equity * max_exposure_fraction - exposure)
    qty_exposure = remaining_exposure / entry
    qty = min(qty_risk, qty_exposure)
    if qty <= 0:
        return RiskDecision(False, 0.0, risk_budget, reserved, "aggregate_risk_or_exposure_limit")
    return RiskDecision(True, qty, risk_budget, reserved, "approved")
