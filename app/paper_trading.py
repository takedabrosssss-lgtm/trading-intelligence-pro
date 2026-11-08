import logging
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import PaperAccount, Position, SessionLocal, Signal, Trade
from app.market_data import market_data

logger = logging.getLogger("paper-trading")

# Simulation assumptions only. No exchange orders are ever submitted.
FEE_RATE = 0.001  # 0.10% per side
MAX_OPEN_POSITIONS_PER_ACCOUNT = 3


def _as_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _signal_max_age(timeframe):
    return {
        "15m": timedelta(minutes=30),
        "1h": timedelta(hours=2),
        "4h": timedelta(hours=8),
    }.get(timeframe, timedelta(hours=1))


def _account_equity(db, account):
    positions = db.query(Position).filter(
        Position.account_id == account.id,
        Position.status == "open",
    ).all()
    return float(account.balance or 0) + sum(
        float(position.unrealized_pnl or 0) for position in positions
    )


def _close_position(db, position, exit_price, reason):
    account = db.query(PaperAccount).filter(
        PaperAccount.id == position.account_id
    ).first()
    if account is None:
        logger.error("Paper account missing for position %s", position.id)
        return

    entry = float(position.entry_price)
    quantity = float(position.quantity)
    exit_price = float(exit_price)

    if position.direction == "BUY":
        gross = (exit_price - entry) * quantity
    else:
        gross = (entry - exit_price) * quantity

    fees = (entry * quantity + exit_price * quantity) * FEE_RATE
    net = gross - fees

    db.add(Trade(
        account_id=account.id,
        position_id=position.id,
        symbol=position.symbol,
        direction=position.direction,
        strategy=account.strategy,
        entry_price=entry,
        exit_price=exit_price,
        quantity=quantity,
        gross_pnl=gross,
        fees=fees,
        net_pnl=net,
        exit_reason=reason,
        closed_at=datetime.now(timezone.utc),
    ))

    account.balance = float(account.balance or 0) + net
    position.current_price = exit_price
    position.unrealized_pnl = 0.0
    position.realized_pnl = net
    position.status = "closed"
    position.closed_at = datetime.now(timezone.utc)

    logger.info(
        "Paper position closed: id=%s %s reason=%s net_pnl=%.4f",
        position.id, position.symbol, reason, net,
    )


async def update_open_positions():
    db = SessionLocal()
    updated = 0
    try:
        positions = db.query(Position).filter(Position.status == "open").all()

        for position in positions:
            try:
                quote = await market_data.get_price(position.symbol)
                price = float(quote["price"])
                if price <= 0:
                    continue

                entry = float(position.entry_price)
                quantity = float(position.quantity)
                position.current_price = price

                if position.direction == "BUY":
                    gross = (price - entry) * quantity
                    stop_hit = (
                        position.stop_loss is not None
                        and price <= float(position.stop_loss)
                    )
                    target_hit = (
                        position.take_profit is not None
                        and price >= float(position.take_profit)
                    )
                else:
                    gross = (entry - price) * quantity
                    stop_hit = (
                        position.stop_loss is not None
                        and price >= float(position.stop_loss)
                    )
                    target_hit = (
                        position.take_profit is not None
                        and price <= float(position.take_profit)
                    )

                estimated_fees = (entry * quantity + price * quantity) * FEE_RATE
                position.unrealized_pnl = gross - estimated_fees

                # If a quote is already beyond an exit level, simulate execution
                # at the configured stop/target level, not at a better price.
                if stop_hit:
                    _close_position(
                        db, position, float(position.stop_loss), "stop_loss"
                    )
                elif target_hit:
                    _close_position(
                        db, position, float(position.take_profit), "take_profit"
                    )

                updated += 1
            except Exception:
                logger.exception(
                    "Could not update paper position %s", position.id
                )

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Paper position update failed")
    finally:
        db.close()

    return updated


async def open_paper_positions():
    db = SessionLocal()
    opened = 0
    try:
        signals = (
            db.query(Signal)
            .filter(Signal.status.in_(["new", "sent"]))
            .order_by(Signal.id.asc())
            .limit(100)
            .all()
        )

        for signal in signals:
            try:
                existing = db.query(Position).filter(
                    Position.signal_id == signal.id
                ).first()
                if existing:
                    signal.status = (
                        "paper_opened" if existing.status == "open"
                        else "paper_closed"
                    )
                    continue

                created_at = _as_utc(signal.created_at)
                if (
                    created_at
                    and datetime.now(timezone.utc) - created_at
                    > _signal_max_age(signal.timeframe)
                ):
                    signal.status = "paper_skipped"
                    logger.info("Skipped stale paper signal id=%s", signal.id)
                    continue

                strategy = (signal.strategy or "").lower()
                account = db.query(PaperAccount).filter(
                    PaperAccount.strategy == strategy,
                    PaperAccount.is_active.is_(True),
                ).first()

                if account is None:
                    signal.status = "paper_skipped"
                    logger.warning(
                        "No active paper account for strategy %s", strategy
                    )
                    continue

                signal_entry = float(signal.entry_price or 0)
                stop = float(signal.stop_loss or 0)
                target = float(signal.take_profit or 0)

                if signal_entry <= 0 or stop <= 0 or target <= 0:
                    signal.status = "paper_skipped"
                    continue

                if signal.direction == "BUY":
                    valid_levels = stop < signal_entry < target
                elif signal.direction == "SELL":
                    valid_levels = target < signal_entry < stop
                else:
                    valid_levels = False

                if not valid_levels:
                    signal.status = "paper_skipped"
                    continue

                open_positions = db.query(Position).filter(
                    Position.account_id == account.id,
                    Position.status == "open",
                ).all()

                if len(open_positions) >= MAX_OPEN_POSITIONS_PER_ACCOUNT:
                    continue
                if any(p.symbol == signal.symbol for p in open_positions):
                    continue

                equity = _account_equity(db, account)
                max_drawdown = float(
                    account.max_drawdown or settings.max_drawdown
                )
                drawdown_floor = float(account.initial_balance or 0) * (
                    1 - max_drawdown
                )

                if equity <= drawdown_floor or equity <= 0:
                    logger.warning(
                        "Paper account %s paused by drawdown guard",
                        account.name,
                    )
                    continue

                quote = await market_data.get_price(signal.symbol)
                live_entry = float(quote["price"])
                if live_entry <= 0:
                    continue

                # Do not chase a signal if price has moved too far from its entry.
                if abs(live_entry - signal_entry) > abs(signal_entry - stop) * 0.5:
                    signal.status = "paper_skipped"
                    logger.info(
                        "Skipped paper signal %s due to entry price drift",
                        signal.id,
                    )
                    continue

                if signal.direction == "BUY":
                    if not stop < live_entry < target:
                        signal.status = "paper_skipped"
                        continue
                else:
                    if not target < live_entry < stop:
                        signal.status = "paper_skipped"
                        continue

                risk_budget = equity * settings.max_risk_per_trade
                stop_distance = abs(live_entry - stop)
                if stop_distance <= 0:
                    signal.status = "paper_skipped"
                    continue

                quantity_by_risk = risk_budget / stop_distance
                quantity_by_capital = equity / live_entry
                quantity = min(quantity_by_risk, quantity_by_capital)

                if quantity <= 0:
                    signal.status = "paper_skipped"
                    continue

                position = Position(
                    account_id=account.id,
                    signal_id=signal.id,
                    symbol=signal.symbol,
                    direction=signal.direction,
                    entry_price=live_entry,
                    current_price=live_entry,
                    stop_loss=stop,
                    take_profit=target,
                    quantity=quantity,
                    unrealized_pnl=(
                        -2 * live_entry * quantity * FEE_RATE
                    ),
                    status="open",
                )
                db.add(position)
                signal.status = "paper_opened"
                db.flush()
                opened += 1

                logger.info(
                    "Paper position opened: signal=%s position=%s %s %s "
                    "qty=%.8f entry=%.8f risk_budget=%.2f",
                    signal.id, position.id, signal.symbol, signal.direction,
                    quantity, live_entry, risk_budget,
                )

            except Exception:
                logger.exception(
                    "Could not open paper position for signal %s", signal.id
                )

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Paper position opening failed")
    finally:
        db.close()

    return opened


async def run_paper_trading_cycle():
    updated = await update_open_positions()
    opened = await open_paper_positions()
    logger.info(
        "Paper trading cycle complete: opened=%s updated=%s",
        opened, updated,
    )
    return opened, updated
