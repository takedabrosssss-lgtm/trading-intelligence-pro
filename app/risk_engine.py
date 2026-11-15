"""Deterministic risk controls for legacy Spot and isolated Futures Paper Trading."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable

from app.futures_engine import size_isolated_position, PositionSizing


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
    """Legacy Spot-compatible risk sizing retained for old database positions."""
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
        reserved += qty * max(px, p_entry) if p_stop is None or p_entry <= 0 else qty * abs(p_entry - float(p_stop))
    budget = min(equity * max_risk_fraction, max(0.0, equity * max_total_risk_fraction - reserved))
    qty_risk = budget / abs(entry - stop) if entry != stop else 0.0
    qty_exposure = max(0.0, equity * max_exposure_fraction - exposure) / entry
    qty = min(qty_risk, qty_exposure)
    if qty <= 0:
        return RiskDecision(False, 0.0, budget, reserved, "aggregate_risk_or_exposure_limit")
    return RiskDecision(True, qty, budget, reserved, "approved")


def assess_futures_position(**kwargs) -> PositionSizing:
    """Isolated Futures sizing: stop-risk budget is independent of leverage."""
    return size_isolated_position(**kwargs)
