import asyncio
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from html import escape

from aiogram import Bot
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, Signal, SignalDelivery, User, init_db, engine
from app.instance_lock import (
    acquire_advisory_lock,
    release_advisory_lock,
)
from app.market_data import market_data
from app.signals import (
    generate_signal,
    is_quality_signal_values,
    signal_strength,
)
from app.paper_trading import run_paper_trading_cycle


logger = logging.getLogger("trading-worker")

SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "LTCUSDT",
]

TIMEFRAMES = ["15m", "1h", "4h", "1d"]

STRATEGIES = {
    "15m": "scalping",
    "1h": "intraday",
    "4h": "swing",
    "1d": "position",
}

# Duplicate protection:
# Keep a signal blocked for at least four candles of its timeframe.
# The minimum cooldown is 60 minutes.
TIMEFRAME_MINUTES = {
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}

DUPLICATE_COOLDOWN_CANDLES = 4
MIN_DUPLICATE_WINDOW_MINUTES = 60

SCANNER_LOCK_ID = 81420311


def duplicate_cooldown_minutes(timeframe):
    candle_minutes = TIMEFRAME_MINUTES.get(
        timeframe,
        MIN_DUPLICATE_WINDOW_MINUTES,
    )

    return max(
        MIN_DUPLICATE_WINDOW_MINUTES,
        candle_minutes * DUPLICATE_COOLDOWN_CANDLES,
    )


def ensure_database_schema():
    if engine.dialect.name != "postgresql":
        logger.info(
            "Skipping PostgreSQL legacy schema migration "
            "on non-PostgreSQL database"
        )
        return

    statements = [
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS market VARCHAR(30) DEFAULT 'crypto'",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS grade VARCHAR(5)",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS entry_price DOUBLE PRECISION",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS stop_loss DOUBLE PRECISION",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS take_profit DOUBLE PRECISION",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS strategy VARCHAR(50)",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS reasoning TEXT",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS indicators JSON",
        "ALTER TABLE signals ALTER COLUMN entry DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN sl DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN tp1 DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN tp2 DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN historical_winrate DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN sample_size DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN notes DROP NOT NULL",
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

    logger.info("Signal schema checked")


def already_exists(db, signal):
    cooldown = duplicate_cooldown_minutes(
        signal.get("timeframe")
    )

    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=cooldown
    )

    # Keep cooldown active after a signal has entered or completed
    # Paper Trading. This prevents persistent market setups from
    # being re-announced as fresh signals.
    statuses = [
        "new",
        "eligible",
        "sent",
        "paper_opened",
        "paper_closed",
        "paper_skipped",
    ]

    query = db.query(Signal).filter(
        Signal.symbol == signal["symbol"],
        Signal.timeframe == signal["timeframe"],
        Signal.direction == signal["direction"],
        Signal.grade == signal["grade"],
        Signal.created_at >= cutoff,
        Signal.status.in_(statuses),
    )

    return db.query(query.exists()).scalar()


def format_signal_message(signal):
    direction = (
        "ПОКУПКА"
        if signal.direction == "BUY"
        else "ПРОДАЖА"
    )

    emoji = (
        "🟢"
        if signal.direction == "BUY"
        else "🔴"
    )

    names = {
        "scalping": "Scalping",
        "intraday": "Intraday",
        "swing": "Swing",
        "position": "Position",
    }

    entry = float(signal.entry_price or 0)
    stop = float(signal.stop_loss or 0)
    target = float(signal.take_profit or 0)

    digits = (
        2
        if entry >= 1000
        else 4
        if entry >= 1
        else 8
    )

    reasoning = (signal.reasoning or "").strip()[:700]

    lines = [
        f"{emoji} <b>КАЧЕСТВЕННЫЙ ТОРГОВЫЙ СИГНАЛ</b>",
        "",
        f"<b>{escape(signal.symbol)}</b> · {escape(signal.timeframe)}",
        f"Направление: <b>{direction}</b>",
        (
            f"Сила: <b>"
            f"{signal_strength(signal.direction, float(signal.score or 0)):.0f}/100"
            f"</b> · Grade <b>{escape(signal.grade or '—')}</b>"
        ),
        (
            f"Стратегия: "
            f"{escape(names.get(signal.strategy, signal.strategy or '—'))}"
        ),
        "",
        f"Вход: <code>{entry:,.{digits}f}</code>",
        f"Stop Loss: <code>{stop:,.{digits}f}</code>",
        f"Take Profit: <code>{target:,.{digits}f}</code>",
        "",
    ]

    if reasoning:
        lines += [
            "<b>Основание:</b>",
            escape(reasoning),
            "",
        ]

    lines += [
        "Режим: <b>Paper Trading</b>",
        "Результат не гарантирован.",
    ]

    return "\n".join(lines)


async def deliver_pending_signals():
    if not settings.bot_token:
        return 0

    db = SessionLocal()
    delivered = 0
    try:
        recipients = db.query(User).filter(User.is_active.is_(True)).order_by(User.created_at.asc()).all()
        if not recipients:
            return 0
        pending = (db.query(Signal).filter(Signal.status.in_(["new", "sent"]))
                   .order_by(Signal.id.asc()).limit(100).all())
        if not pending:
            return 0
        async with Bot(token=settings.bot_token) as bot:
            for signal in pending:
                if not is_quality_signal_values(signal.direction, signal.score, signal.grade):
                    signal.status = "filtered"
                    db.commit()
                    continue
                any_delivered = False
                for recipient in recipients:
                    row = db.query(SignalDelivery).filter(
                        SignalDelivery.signal_id == signal.id,
                        SignalDelivery.telegram_id == recipient.telegram_id,
                    ).first()
                    if row and row.status == "delivered":
                        continue
                    if row is None:
                        row = SignalDelivery(signal_id=signal.id, telegram_id=recipient.telegram_id, status="pending", attempts=0)
                        db.add(row)
                        db.flush()
                    if row.attempts >= 5:
                        row.status = "failed"
                        continue
                    try:
                        await bot.send_message(
                            chat_id=recipient.telegram_id,
                            text=format_signal_message(signal),
                            parse_mode="HTML",
                            disable_web_page_preview=True,
                        )
                        row.status = "delivered"
                        row.delivered_at = datetime.now(timezone.utc)
                        row.last_error = None
                        row.attempts += 1
                        any_delivered = True
                        delivered += 1
                    except Exception as exc:
                        row.attempts += 1
                        row.status = "pending" if row.attempts < 5 else "failed"
                        row.last_error = type(exc).__name__[:240]
                        logger.warning("Signal delivery failed signal=%s recipient=%s error=%s",signal.id,recipient.telegram_id,type(exc).__name__)
                    db.commit()
                if any_delivered:
                    signal.status = "sent"
                    db.commit()
    except Exception:
        db.rollback()
        logger.exception("Pending signal delivery failed")
    finally:
        db.close()
    return delivered

async def scan_market():
    db = SessionLocal()
    saved = 0
    stats = Counter()

    try:
        for symbol in SYMBOLS:
            for timeframe in TIMEFRAMES:
                stats["combinations"] += 1

                try:
                    # 1. Получение рыночных данных
                    try:
                        candles = await market_data.get_klines(
                            symbol,
                            timeframe,
                            200,
                        )

                        stats["data_ok"] += 1
                        stats["candles_total"] += len(candles)

                    except Exception:
                        stats["data_errors"] += 1

                        logger.exception(
                            "Market data failed for %s %s",
                            symbol,
                            timeframe,
                        )
                        continue

                    # 2. Анализ стратегии
                    diagnostics = {}

                    signal = generate_signal(
                        candles,
                        symbol,
                        timeframe,
                        STRATEGIES[timeframe],
                        diagnostics=diagnostics,
                    )

                    if not signal:
                        reason = diagnostics.get(
                            "reason",
                            "unknown",
                        )

                        stats[f"rejected_{reason}"] += 1
                        continue

                    stats["analysis_candidates"] += 1

                    # 3. Проверка Grade и силы сигнала
                    if not signal["base_quality"]:
                        stats["rejected_grade_or_strength"] += 1

                    # 4. Проверка независимых фильтров
                    gate = signal["quality_gate"]
                    checks = gate["checks"]

                    if not checks["directional_movement"]:
                        stats["rejected_di"] += 1

                    if not checks["ema_slope"]:
                        stats["rejected_ema"] += 1

                    if not checks["volume_participation"]:
                        stats["rejected_volume"] += 1

                    if not signal["eligible"]:
                        stats["rejected_quality_total"] += 1
                        continue

                    # 5. Защита от повторных сигналов
                    if already_exists(db, signal):
                        stats["duplicate_cooldown"] += 1
                        continue

                    # 6. Сохранение сигнала
                    db.add(
                        Signal(
                            symbol=signal["symbol"],
                            market="crypto",
                            timeframe=signal["timeframe"],
                            direction=signal["direction"],
                            grade=signal["grade"],
                            score=signal["score"],
                            confidence=signal.get("confidence"),
                            entry_price=signal["entry_price"],
                            stop_loss=signal["stop_loss"],
                            take_profit=signal["take_profit"],
                            strategy=signal["strategy"],
                            reasoning="; ".join(
                                signal.get("reasoning") or []
                            ),
                            indicators=signal.get("indicators"),
                            status="new",
                        )
                    )

                    db.commit()

                    saved += 1
                    stats["eligible_saved"] += 1

                    logger.info(
                        "Signal saved %s %s %s strength=%.0f grade=%s",
                        symbol,
                        timeframe,
                        signal["direction"],
                        signal_strength(
                            signal["direction"],
                            signal["score"],
                        ),
                        signal["grade"],
                    )

                except Exception:
                    db.rollback()
                    stats["scan_errors"] += 1

                    logger.exception(
                        "Scan failed for %s %s",
                        symbol,
                        timeframe,
                    )

        
        # Итоговая диагностика всего цикла
        summary = " | ".join(
            f"{key}={value}"
            for key, value in sorted(stats.items())
        )

        logger.info(
            "SCAN DIAGNOSTICS | %s",
            summary,
        )
        

        logger.info(
            "Scan completed. New quality signals: %s",
            saved,
        )

    finally:
        db.close()

    return saved


    


async def run_worker():
    while True:
        lock_connection = None

        try:
            lock_connection = acquire_advisory_lock(
                SCANNER_LOCK_ID
            )

            if lock_connection is None:
                await asyncio.sleep(10)
                continue

            init_db()
            ensure_database_schema()

            while True:
                try:
                    await scan_market()
                    await deliver_pending_signals()
                    await run_paper_trading_cycle()

                except asyncio.CancelledError:
                    raise

                except Exception:
                    logger.exception("Scanner cycle failed")

                await asyncio.sleep(
                    max(60, settings.scan_interval_seconds)
                )

        except asyncio.CancelledError:
            raise

        except Exception:
            logger.exception("Scanner supervisor failed")
            await asyncio.sleep(15)

        finally:
            if lock_connection is not None:
                try:
                    release_advisory_lock(
                        lock_connection,
                        SCANNER_LOCK_ID,
                    )

                except Exception:
                    logger.exception(
                        "Could not release scanner advisory lock"
                    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
