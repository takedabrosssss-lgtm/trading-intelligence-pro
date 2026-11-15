"""Paper Trading lifecycle: legacy Spot positions + isolated USDT-M Futures.

No authenticated exchange calls and no real orders are performed here.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_

from app.config import settings
from app.database import PaperAccount, Position, SessionLocal, Signal, Trade, User
from app.futures_engine import (
    MARKET_TYPE, DEFAULT_TAKER_FEE_RATE, DEFAULT_SLIPPAGE_RATE,
    DEFAULT_LIQUIDATION_FEE_RATE, DEFAULT_MAINTENANCE_MARGIN_RATE,
    apply_entry_slippage, apply_slippage, funding_cashflow, funding_timestamp_is_due,
    linear_pnl, resolve_mark_candle_exit, resolve_liquidation_exit,
    size_isolated_position,
)
from app.market_data import market_data
from app.signals import is_quality_signal_values

logger = logging.getLogger("paper-trading")
LEGACY_SPOT_MARKET = "spot"
MAX_OPEN_POSITIONS_PER_ACCOUNT = 3


def _cfg(name: str, default):
    return getattr(settings, name, default)


def _as_utc(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _epoch_ms(value) -> int:
    value = _as_utc(value)
    return int(value.timestamp() * 1000) if value else 0


def _signal_max_age(timeframe):
    return {"15m": timedelta(minutes=30), "1h": timedelta(hours=2), "4h": timedelta(hours=8), "1d": timedelta(days=3)}.get(timeframe, timedelta(hours=1))


def _account_equity(db, account):
    positions = db.query(Position).filter(Position.account_id == account.id, Position.status == "open").all()
    return float(account.balance or 0) + sum(float(p.unrealized_pnl or 0) for p in positions)


def _fee_rate_spot() -> float:
    return 0.001


def _fee_rate_futures() -> float:
    return float(_cfg("futures_taker_fee_rate", DEFAULT_TAKER_FEE_RATE))


def _slippage_rate() -> float:
    return float(_cfg("futures_slippage_rate", DEFAULT_SLIPPAGE_RATE))


def _close_spot_position(db, position, exit_price, reason):
    account = db.query(PaperAccount).filter(PaperAccount.id == position.account_id).first()
    if account is None:
        raise RuntimeError(f"Paper account missing for position {position.id}")
    entry, qty, exit_price = float(position.entry_price), float(position.quantity), float(exit_price)
    gross = (exit_price - entry) * qty if position.direction == "BUY" else (entry - exit_price) * qty
    fees = (entry * qty + exit_price * qty) * _fee_rate_spot()
    net = gross - fees
    db.add(Trade(
        account_id=account.id, position_id=position.id, symbol=position.symbol,
        direction=position.direction, strategy=account.strategy, entry_price=entry,
        exit_price=exit_price, quantity=qty, gross_pnl=gross, fees=fees,
        net_pnl=net, exit_reason=reason, closed_at=datetime.now(timezone.utc),
        market_type=LEGACY_SPOT_MARKET, leverage=1.0, funding_pnl=0.0,
    ))
    account.balance = float(account.balance or 0) + net
    position.current_price = exit_price
    position.unrealized_pnl = 0.0
    position.realized_pnl = net
    position.status = "closed"
    position.closed_at = datetime.now(timezone.utc)
    logger.info("Legacy Spot position closed id=%s symbol=%s reason=%s net=%.4f", position.id, position.symbol, reason, net)


def _close_futures_position(db, position, exit_price, reason):
    account = db.query(PaperAccount).filter(PaperAccount.id == position.account_id).first()
    if account is None:
        raise RuntimeError(f"Paper account missing for position {position.id}")
    entry, qty, exit_price = float(position.entry_price), float(position.quantity), float(exit_price)
    gross = linear_pnl(entry, exit_price, qty, position.direction)
    entry_fee = max(0.0, float(position.entry_fee or 0.0))
    exit_fee = exit_price * qty * _fee_rate_futures()
    liquidation_fee = exit_price * qty * float(_cfg("futures_liquidation_fee_rate", DEFAULT_LIQUIDATION_FEE_RATE)) if reason == "liquidation" else 0.0
    funding = float(position.funding_pnl or 0.0)
    fees = entry_fee + exit_fee + liquidation_fee
    net = gross - fees + funding

    # Entry fee and each funding event were already booked to account.balance.
    # At close, add only gross PnL and exit/liquidation costs to avoid double count.
    account.balance = float(account.balance or 0) + gross - exit_fee - liquidation_fee
    db.add(Trade(
        account_id=account.id, position_id=position.id, symbol=position.symbol,
        direction=position.direction, strategy=account.strategy, entry_price=entry,
        exit_price=exit_price, quantity=qty, gross_pnl=gross, fees=fees,
        net_pnl=net, exit_reason=reason, closed_at=datetime.now(timezone.utc),
        market_type=MARKET_TYPE, leverage=float(position.leverage or 1.0),
        funding_pnl=funding,
    ))
    position.current_price = exit_price
    position.unrealized_pnl = 0.0
    position.realized_pnl = net
    position.status = "closed"
    position.closed_at = datetime.now(timezone.utc)
    position.margin_used = 0.0
    logger.info("Futures position closed id=%s symbol=%s reason=%s leverage=%sx net=%.4f", position.id, position.symbol, reason, position.leverage, net)


def _close_position(db, position, exit_price, reason):
    """Compatibility entry point used by the manual-close API."""
    if getattr(position, "market_type", LEGACY_SPOT_MARKET) == MARKET_TYPE:
        fill = apply_slippage(float(exit_price), position.direction, _slippage_rate())
        _close_futures_position(db, position, fill, reason)
    else:
        _close_spot_position(db, position, exit_price, reason)


async def _apply_funding(db, position, account, now_ms: int) -> int:
    opened_ms = _epoch_ms(position.opened_at)
    last_dt = _as_utc(position.last_funding_time)
    start_ms = max(opened_ms, _epoch_ms(last_dt) + 1 if last_dt else opened_ms)
    if start_ms > now_ms:
        return 0
    rates = await market_data.get_funding_rates(position.symbol, start_ms, now_ms, 1000)
    applied = 0
    for event in rates:
        event_ms = int(event["funding_time"])
        if event_ms < opened_ms or not funding_timestamp_is_due(event_ms, _epoch_ms(last_dt) if last_dt else None):
            continue
        mark = float(event.get("mark_price") or position.current_price or position.entry_price)
        cashflow = funding_cashflow(float(position.quantity) * mark, float(event["funding_rate"]), position.direction)
        account.balance = float(account.balance or 0.0) + cashflow
        position.funding_pnl = float(position.funding_pnl or 0.0) + cashflow
        dt = datetime.fromtimestamp(event_ms / 1000, tz=timezone.utc)
        position.last_funding_time = dt
        last_dt = dt
        applied += 1
    return applied


def _check_candle_for_position(position, candle):
    direction = position.direction
    stop, target = float(position.stop_loss), float(position.take_profit)
    liq = float(position.liquidation_price or 0.0)
    high, low = float(candle["high"]), float(candle["low"])
    # Liquidation is evaluated first if the mark-price candle crossed its level.
    if liq > 0 and ((direction == "BUY" and low <= liq) or (direction == "SELL" and high >= liq)):
        worst_mark = low if direction == "BUY" else high
        return resolve_liquidation_exit(
            direction=direction, mark_price=worst_mark, liquidation_price=liq,
            slippage_rate=_slippage_rate(),
        )
    return resolve_mark_candle_exit(
        direction=direction, stop=stop, target=target, candle=candle,
        slippage_rate=_slippage_rate(),
    )


async def _update_spot_position(position):
    quote = await market_data.get_spot_price(position.symbol)
    price = float(quote["price"])
    if price <= 0:
        raise RuntimeError("Invalid legacy Spot quote")
    entry, qty = float(position.entry_price), float(position.quantity)
    gross = (price - entry) * qty if position.direction == "BUY" else (entry - price) * qty
    if position.direction == "BUY":
        stop_hit = position.stop_loss is not None and price <= float(position.stop_loss)
        target_hit = position.take_profit is not None and price >= float(position.take_profit)
    else:
        stop_hit = position.stop_loss is not None and price >= float(position.stop_loss)
        target_hit = position.take_profit is not None and price <= float(position.take_profit)
    position.current_price = price
    position.unrealized_pnl = gross - (entry * qty + price * qty) * _fee_rate_spot()
    if stop_hit:
        gap = (position.direction == "BUY" and price < float(position.stop_loss)) or (position.direction == "SELL" and price > float(position.stop_loss))
        return price, "stop_loss_gap" if gap else "stop_loss"
    if target_hit:
        return float(position.take_profit), "take_profit"
    return None, None


async def update_open_positions():
    """Update both legacy Spot and new Futures positions; fail closed per row."""
    db = SessionLocal()
    updated = 0
    try:
        open_rows = db.query(Position).filter(Position.status == "open").all()
        position_ids = [row.id for row in open_rows]
        now = datetime.now(timezone.utc)
        now_ms = int(now.timestamp() * 1000)
        futures_cache: dict[str, dict] = {}
        # A single per-symbol backfill must cover the oldest unchecked position
        # in that symbol, including positions affected by an earlier API outage.
        futures_start_by_symbol: dict[str, int] = {}
        for row in open_rows:
            if getattr(row, "market_type", LEGACY_SPOT_MARKET) != MARKET_TYPE:
                continue
            checkpoint_ms = _epoch_ms(row.last_mark_check_at) or _epoch_ms(row.opened_at)
            start_ms = max(0, (checkpoint_ms // 60_000) * 60_000 - 60_000)
            futures_start_by_symbol[row.symbol] = min(
                start_ms, futures_start_by_symbol.get(row.symbol, start_ms)
            )
        for position_id in position_ids:
            try:
                position = db.query(Position).filter(Position.id == position_id, Position.status == "open").with_for_update().first()
                if position is None:
                    continue
                if getattr(position, "market_type", LEGACY_SPOT_MARKET) != MARKET_TYPE:
                    exit_price, reason = await _update_spot_position(position)
                    if reason:
                        _close_spot_position(db, position, exit_price, reason)
                    position.last_mark_check_at = now
                    db.commit()
                    updated += 1
                    continue

                symbol = position.symbol
                if symbol not in futures_cache:
                    mark = await market_data.get_mark_price(symbol)
                    # Reload from the last committed check so a short service/API
                    # interruption does not silently skip intervening 1m mark bars.
                    fetch_from_ms = futures_start_by_symbol.get(
                        symbol, max(0, (_epoch_ms(position.opened_at) // 60_000) * 60_000 - 60_000)
                    )
                    bars_ok = False
                    data_gap = False
                    try:
                        bars = await market_data.get_mark_price_klines(
                            symbol, "1m", 1500, start_time=fetch_from_ms, end_time=now_ms
                        )
                        current_minute_ms = (now_ms // 60_000) * 60_000
                        bars_ok = bool(bars) and (
                            int(bars[0]["timestamp"]) <= fetch_from_ms + 60_000
                            and int(bars[-1]["timestamp"]) >= current_minute_ms - 60_000
                        )
                        data_gap = bool(bars) and not bars_ok
                    except Exception:
                        logger.warning("Mark-price candle backfill unavailable for %s; live mark checks continue and backfill will retry", symbol)
                        bars = []
                    futures_cache[symbol] = {
                        "mark": mark, "bars": bars, "bars_ok": bars_ok, "data_gap": data_gap
                    }
                snapshot = futures_cache[symbol]
                mark_price = float(snapshot["mark"]["mark_price"])
                if mark_price <= 0:
                    raise RuntimeError("Invalid Futures mark price")

                account = db.query(PaperAccount).filter(PaperAccount.id == position.account_id).first()
                if account is None:
                    raise RuntimeError("Paper account not found")
                try:
                    funding_count = await _apply_funding(db, position, account, now_ms)
                except Exception:
                    # A funding-history outage must never suspend protective
                    # stop/TP/liquidation checks for an already-open position.
                    funding_count = 0
                    logger.exception("Funding history sync failed for %s; position protection continues", symbol)

                entry, qty = float(position.entry_price), float(position.quantity)
                gross = linear_pnl(entry, mark_price, qty, position.direction)
                estimated_exit_fee = mark_price * qty * _fee_rate_futures()
                position.current_price = mark_price
                position.unrealized_pnl = gross - estimated_exit_fee
                # Mark OHLC includes the entry minute. This can conservatively
                # treat a pre-entry wick as touched, but avoids ignoring a true
                # post-entry stop wick that later retraced inside that same minute.
                opened_ms = _epoch_ms(position.opened_at)
                eligible_bars = [
                    bar for bar in snapshot["bars"]
                    if int(bar["timestamp"]) >= (opened_ms // 60_000) * 60_000
                ]
                exit_decision = None
                for bar in eligible_bars:
                    exit_decision = _check_candle_for_position(position, bar)
                    if exit_decision.should_close:
                        break

                if exit_decision is None or not exit_decision.should_close:
                    # If Binance returns a truncated history window after a long
                    # outage, do not keep an unobserved position open indefinitely.
                    if snapshot.get("data_gap"):
                        fill = apply_slippage(mark_price, position.direction, _slippage_rate())
                        exit_decision = type("Decision", (), {
                            "should_close": True, "exit_price": fill,
                            "reason": "mark_data_gap_close"
                        })()

                if exit_decision is None or not exit_decision.should_close:
                    # Immediate live check every configured polling cycle.
                    exit_decision = resolve_liquidation_exit(
                        direction=position.direction, mark_price=mark_price,
                        liquidation_price=float(position.liquidation_price or 0.0),
                        slippage_rate=_slippage_rate(),
                    ) if position.liquidation_price else None
                    if exit_decision is None or not exit_decision.should_close:
                        stop = float(position.stop_loss)
                        target = float(position.take_profit)
                        stop_hit = mark_price <= stop if position.direction == "BUY" else mark_price >= stop
                        target_hit = mark_price >= target if position.direction == "BUY" else mark_price <= target
                        if stop_hit:
                            fill = apply_slippage(mark_price, position.direction, _slippage_rate())
                            reason = "stop_loss_gap" if ((position.direction == "BUY" and mark_price < stop) or (position.direction == "SELL" and mark_price > stop)) else "stop_loss"
                            exit_decision = type("Decision", (), {"should_close": True, "exit_price": fill, "reason": reason})()
                        elif target_hit:
                            fill = apply_slippage(target, position.direction, _slippage_rate())
                            exit_decision = type("Decision", (), {"should_close": True, "exit_price": fill, "reason": "take_profit"})()

                if exit_decision is not None and exit_decision.should_close:
                    _close_futures_position(db, position, float(exit_decision.exit_price), str(exit_decision.reason))
                elif snapshot.get("bars_ok"):
                    position.last_mark_check_at = now
                # When bar backfill fails or has a gap, retain the old checkpoint
                # so the full missed range is retried on the next 5-second cycle.
                db.commit()
                updated += 1
                if funding_count:
                    logger.info("Funding events applied symbol=%s count=%s", symbol, funding_count)
            except Exception:
                db.rollback()
                logger.exception("Could not update Paper position id=%s", position_id)
    except Exception:
        db.rollback()
        logger.exception("Paper position update failed")
    finally:
        db.close()
    return updated


async def open_paper_positions():
    """Open new USDT-M Futures Paper positions only; legacy signals are ignored."""
    db = SessionLocal()
    opened = 0
    try:
        fresh_ids = [row[0] for row in db.query(Signal.id).filter(
            Signal.market == MARKET_TYPE, Signal.status.in_(["new", "sent"])
        ).order_by(Signal.id.asc()).limit(100).all()]
        retry_ids = [row[0] for row in db.query(Signal.id)
            .join(PaperAccount, PaperAccount.strategy == Signal.strategy)
            .join(User, User.telegram_id == PaperAccount.owner_telegram_id)
            .outerjoin(Position, and_(Position.signal_id == Signal.id, Position.account_id == PaperAccount.id))
            .filter(
                Signal.market == MARKET_TYPE, Signal.status == "paper_opened",
                PaperAccount.is_active.is_(True), User.is_active.is_(True),
                User.phantom_locked.is_(False), Position.id.is_(None),
            ).distinct().order_by(Signal.id.asc()).limit(100).all()]
        signal_ids = sorted(set(fresh_ids + retry_ids))[:100]
        for signal_id in signal_ids:
            try:
                signal = db.query(Signal).filter(Signal.id == signal_id).first()
                if signal is None or signal.market != MARKET_TYPE or signal.status not in {"new", "sent", "paper_opened"}:
                    continue
                if not is_quality_signal_values(signal.direction, signal.score, signal.grade):
                    signal.status = "paper_skipped"
                    db.commit()
                    continue
                created = _as_utc(signal.created_at)
                if created and datetime.now(timezone.utc) - created > _signal_max_age(signal.timeframe):
                    signal.status = "paper_skipped"
                    db.commit()
                    continue

                strategy = (signal.strategy or "").lower()
                accounts = db.query(PaperAccount).join(User, User.telegram_id == PaperAccount.owner_telegram_id).filter(
                    PaperAccount.strategy == strategy, PaperAccount.is_active.is_(True),
                    PaperAccount.owner_telegram_id != "", User.is_active.is_(True),
                    User.phantom_locked.is_(False),
                ).order_by(PaperAccount.id.asc()).all()
                if not accounts:
                    continue

                signal_entry = float(signal.entry_price or 0)
                stop, target = float(signal.stop_loss or 0), float(signal.take_profit or 0)
                valid = (stop < signal_entry < target) if signal.direction == "BUY" else (target < signal_entry < stop) if signal.direction == "SELL" else False
                if not valid:
                    signal.status = "paper_skipped"
                    db.commit()
                    continue

                mark_quote = await market_data.get_mark_price(signal.symbol)
                current_mark = float(mark_quote["mark_price"])
                if current_mark <= 0 or abs(current_mark - signal_entry) > abs(signal_entry - stop) * 0.5:
                    signal.status = "paper_skipped"
                    db.commit()
                    continue
                if (signal.direction == "BUY" and not stop < current_mark < target) or (signal.direction == "SELL" and not target < current_mark < stop):
                    signal.status = "paper_skipped"
                    db.commit()
                    continue

                # A simulated market entry pays the adverse side of the spread.
                last_quote = await market_data.get_price(signal.symbol)
                live_entry = apply_entry_slippage(
                    float(last_quote["price"]), signal.direction, _slippage_rate()
                )
                if live_entry <= 0 or abs(live_entry - signal_entry) > abs(signal_entry - stop) * 0.5:
                    signal.status = "paper_skipped"
                    db.commit()
                    continue
                if (signal.direction == "BUY" and not stop < live_entry < target) or (signal.direction == "SELL" and not target < live_entry < stop):
                    signal.status = "paper_skipped"
                    db.commit()
                    continue

                ticker = await market_data.get_24h_ticker(signal.symbol)
                quote_volume = float(ticker.get("quoteVolume") or 0)
                indicators = signal.indicators or {}
                atr = float(indicators.get("atr") or 0)
                atr_pct = atr / live_entry * 100 if atr > 0 else 0.0
                confidence = float(signal.confidence if signal.confidence is not None else 0.0)
                if confidence <= 0:
                    from app.signals import signal_strength
                    confidence = signal_strength(signal.direction, float(signal.score or 0))

                opened_for_signal = 0
                for account in accounts:
                    existing = db.query(Position).filter(Position.signal_id == signal.id, Position.account_id == account.id).first()
                    if existing is not None:
                        continue
                    open_positions = db.query(Position).filter(Position.account_id == account.id, Position.status == "open").all()
                    if len(open_positions) >= MAX_OPEN_POSITIONS_PER_ACCOUNT or any(p.symbol == signal.symbol for p in open_positions):
                        continue
                    equity = _account_equity(db, account)
                    max_dd = float(account.max_drawdown or _cfg("max_drawdown", 0.10))
                    if equity <= float(account.initial_balance or 0) * (1 - max_dd) or equity <= 0:
                        continue

                    sizing = size_isolated_position(
                        equity=equity, balance=float(account.balance or 0),
                        entry=live_entry, stop=stop, direction=signal.direction,
                        confidence=confidence, grade=signal.grade, atr_pct=atr_pct,
                        quote_volume_24h=quote_volume, open_positions=open_positions,
                        max_risk_fraction=float(_cfg("max_risk_per_trade", 0.015)),
                        max_total_risk_fraction=0.04,
                        max_exposure_fraction=float(_cfg("futures_max_exposure_fraction", 0.75)),
                        max_margin_fraction=float(_cfg("futures_max_margin_fraction", 0.50)),
                        max_positions=MAX_OPEN_POSITIONS_PER_ACCOUNT,
                        max_leverage=int(_cfg("futures_max_leverage", 8)),
                        maintenance_margin_rate=float(_cfg("futures_maintenance_margin_rate", DEFAULT_MAINTENANCE_MARGIN_RATE)),
                        taker_fee_rate=_fee_rate_futures(),
                        slippage_rate=_slippage_rate(),
                    )
                    if not sizing.allowed:
                        logger.info("Futures Paper signal blocked signal=%s account=%s reason=%s", signal.id, account.id, sizing.reason)
                        continue

                    entry_fee = live_entry * sizing.quantity * _fee_rate_futures()
                    if float(account.balance or 0) - entry_fee <= 0:
                        continue
                    account.balance = float(account.balance or 0) - entry_fee
                    exit_fee_estimate = live_entry * sizing.quantity * _fee_rate_futures()
                    position = Position(
                        account_id=account.id, signal_id=signal.id, symbol=signal.symbol,
                        direction=signal.direction, entry_price=live_entry, current_price=live_entry,
                        stop_loss=stop, take_profit=target, quantity=sizing.quantity,
                        unrealized_pnl=-exit_fee_estimate, status="open",
                        market_type=MARKET_TYPE, leverage=float(sizing.leverage),
                        margin_used=sizing.margin_used, liquidation_price=sizing.liquidation_price,
                        entry_fee=entry_fee, funding_pnl=0.0,
                        last_funding_time=None, last_mark_check_at=datetime.now(timezone.utc),
                    )
                    db.add(position)
                    db.flush()
                    opened_for_signal += 1
                    opened += 1
                    logger.info(
                        "Futures Paper position opened signal=%s account=%s symbol=%s direction=%s qty=%.8f leverage=%sx isolated_margin=%.2f risk_budget=%.2f source=Binance_USDM",
                        signal.id, account.id, signal.symbol, signal.direction,
                        sizing.quantity, sizing.leverage, sizing.margin_used, sizing.risk_budget,
                    )
                if opened_for_signal:
                    signal.status = "paper_opened"
                    db.commit()
            except Exception:
                db.rollback()
                logger.exception("Could not process Futures Paper signal id=%s", signal_id)
    except Exception:
        db.rollback()
        logger.exception("Futures Paper position opening failed")
    finally:
        db.close()
    return opened


async def run_paper_trading_cycle():
    updated = await update_open_positions()
    opened = await open_paper_positions()
    logger.info("Paper trading cycle complete: futures_opened=%s positions_updated=%s", opened, updated)
    return opened, updated
