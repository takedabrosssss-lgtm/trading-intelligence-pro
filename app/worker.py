import asyncio
import logging
from datetime import datetime, timedelta, timezone
from html import escape

from aiogram import Bot
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, Signal, init_db, engine
from app.market_data import market_data
from app.signals import generate_signal

logger = logging.getLogger("trading-worker")

SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT",
]
TIMEFRAMES = ["15m", "1h", "4h"]
STRATEGIES = {"15m": "scalping", "1h": "intraday", "4h": "swing"}
DUPLICATE_WINDOW_MINUTES = 60


def ensure_database_schema():
    """Safely extend the legacy signals table to match the current ORM model."""
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
        # These columns belong to the previous schema and are not written by the current ORM.
        # Relaxing NOT NULL preserves their historical values while allowing current inserts.
        "ALTER TABLE signals ALTER COLUMN entry DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN sl DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN tp1 DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN tp2 DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN historical_winrate DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN sample_size DROP NOT NULL",
        "ALTER TABLE signals ALTER COLUMN notes DROP NOT NULL",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
    logger.info("Signal database schema migrated and checked")


def already_exists(db, signal):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DUPLICATE_WINDOW_MINUTES)
    query = db.query(Signal).filter(
        Signal.symbol == signal["symbol"],
        Signal.timeframe == signal["timeframe"],
        Signal.direction == signal["direction"],
        Signal.grade == signal["grade"],
        Signal.created_at >= cutoff,
        Signal.status.in_(["new", "eligible", "sent"]),
    )
    return db.query(query.exists()).scalar()


def format_signal_message(signal):
    direction = "ПОКУПКА" if signal.direction == "BUY" else "ПРОДАЖА"
    emoji = "🟢" if signal.direction == "BUY" else "🔴"
    strategy_names = {"scalping": "Scalping", "intraday": "Intraday", "swing": "Swing"}
    entry = float(signal.entry_price or 0)
    stop = float(signal.stop_loss or 0)
    target = float(signal.take_profit or 0)
    digits = 2 if entry >= 1000 else 4 if entry >= 1 else 8
    reasoning = (signal.reasoning or "").strip()
    if len(reasoning) > 700:
        reasoning = reasoning[:697] + "..."
    lines = [
        f"{emoji} <b>НОВЫЙ ТОРГОВЫЙ СИГНАЛ</b>", "",
        f"<b>{escape(signal.symbol)}</b> · {escape(signal.timeframe)}",
        f"Направление: <b>{direction}</b>",
        f"Оценка: <b>{int(signal.score or 0)}/100</b> · Grade <b>{escape(signal.grade or '—')}</b>",
        f"Стратегия: {escape(strategy_names.get(signal.strategy, signal.strategy or '—'))}", "",
        f"Вход: <code>{entry:,.{digits}f}</code>",
        f"Stop Loss: <code>{stop:,.{digits}f}</code>",
        f"Take Profit: <code>{target:,.{digits}f}</code>", "",
    ]
    if reasoning:
        lines.extend(["<b>Основание:</b>", escape(reasoning), ""])
    lines.extend(["Режим: <b>Paper Trading</b>", "Сигнал аналитический. Результат не гарантирован."])
    return "\n".join(lines)


async def deliver_pending_signals():
    if not settings.bot_token or not settings.owner_telegram_id:
        logger.warning("Telegram delivery skipped: BOT_TOKEN or OWNER_TELEGRAM_ID missing")
        return 0

    db = SessionLocal()
    delivered = 0
    try:
        pending = db.query(Signal).filter(Signal.status == "new").order_by(Signal.id.asc()).limit(20).all()
        if not pending:
            return 0
        async with Bot(token=settings.bot_token) as bot:
            for signal in pending:
                try:
                    await bot.send_message(
                        chat_id=settings.owner_telegram_id,
                        text=format_signal_message(signal),
                        parse_mode="HTML",
                        disable_web_page_preview=True,
                    )
                    signal.status = "sent"
                    db.commit()
                    delivered += 1
                    logger.info("Telegram signal delivered: id=%s %s %s", signal.id, signal.symbol, signal.timeframe)
                except Exception:
                    db.rollback()
                    logger.exception("Telegram delivery failed for signal id=%s", signal.id)
    finally:
        db.close()
    return delivered


async def scan_market():
    db = SessionLocal()
    saved = 0
    try:
        for symbol in SYMBOLS:
            for timeframe in TIMEFRAMES:
                try:
                    candles = await market_data.get_klines(symbol, timeframe, 200)
                    signal = generate_signal(
                        candles=candles,
                        symbol=symbol,
                        timeframe=timeframe,
                        strategy=STRATEGIES[timeframe],
                    )
                    if not signal or not signal.get("eligible"):
                        continue
                    if already_exists(db, signal):
                        continue
                    record = Signal(
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
                        reasoning="; ".join(signal.get("reasoning") or []),
                        indicators=signal.get("indicators"),
                        status="new",
                    )
                    db.add(record)
                    db.commit()
                    saved += 1
                    logger.info("New signal saved: %s %s %s grade=%s", symbol, timeframe, signal["direction"], signal["grade"])
                except Exception:
                    db.rollback()
                    logger.exception("Scan failed for %s %s", symbol, timeframe)
        logger.info("Scan completed. New signals: %s", saved)
    finally:
        db.close()
    return saved


async def run_worker():
    init_db()
    ensure_database_schema()
    logger.info("Trading Intelligence scanner started; interval=%ss", settings.scan_interval_seconds)
    while True:
        try:
            await scan_market()
            await deliver_pending_signals()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scanner cycle failed")
        await asyncio.sleep(max(60, settings.scan_interval_seconds))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
