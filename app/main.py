import asyncio
import hashlib
import hmac
import json
import logging
import time
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import (
    AppSetting,
    PaperAccount,
    Position,
    Trade,
    User,
    SessionLocal,
    init_db,
)
from app.market_data import market_data
from app.analyzer import analyze_market
from app.worker import run_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trading-intelligence")

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"


def validate_telegram_init_data(init_data: str) -> dict:
    if not init_data or not settings.telegram_token:
        raise HTTPException(401, "Telegram authorization required")

    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash", None)

        if not received_hash:
            raise ValueError("Missing hash")

        auth_date = int(parsed.get("auth_date", "0"))

        if time.time() - auth_date > 86400 or auth_date > time.time() + 60:
            raise ValueError("Expired authentication")

        data_check_string = "\n".join(
            f"{key}={value}" for key, value in sorted(parsed.items())
        )

        secret_key = hmac.new(
            b"WebAppData",
            settings.telegram_token.encode(),
            hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            raise ValueError("Invalid signature")

        user_data = json.loads(parsed.get("user", "{}"))
        user_id = str(user_data.get("id", ""))

        if not user_id or user_id not in settings.allowed_user_ids:
            raise HTTPException(403, "Access denied")

        return user_data

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Telegram authorization failed: %s", exc)
        raise HTTPException(401, "Invalid Telegram authorization")


def require_user(x_telegram_init_data: str = Header(default="")):
    return validate_telegram_init_data(x_telegram_init_data)


async def run_bot_supervisor():
    if not settings.bot_token:
        logger.warning("BOT_TOKEN is missing; Telegram bot polling is disabled")
        return

    from app.bot import run_bot

    while True:
        try:
            await run_bot()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Telegram bot stopped; retrying in 15 seconds")
            await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    db = SessionLocal()
    try:
        for name in ("Scalping", "Intraday", "Swing", "Position"):
            account = db.query(PaperAccount).filter(
                PaperAccount.name == name
            ).first()

            if not account:
                account = PaperAccount(
                    name=name,
                    strategy=name.lower(),
                    balance=2500.0,
                    initial_balance=2500.0,
                )
                db.add(account)

        db.commit()
    finally:
        db.close()

    background_tasks = [
        asyncio.create_task(run_worker(), name="market-signal-scanner"),
        asyncio.create_task(run_bot_supervisor(), name="telegram-bot-polling"),
    ]

    logger.info("Trading Intelligence PRO started")
    logger.info("Background scanner and Telegram bot tasks scheduled")

    try:
        yield
    finally:
        for task in background_tasks:
            task.cancel()
        await asyncio.gather(*background_tasks, return_exceptions=True)
        logger.info("Trading Intelligence PRO stopped")


app = FastAPI(
    title="Trading Intelligence PRO",
    version="2.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Trading Intelligence PRO"}


@app.get("/api/status")
async def api_status(user: dict = Header(default=None)):
    return {
        "status": "online",
        "service": "Trading Intelligence PRO",
        "market_data": "Binance public API",
        "mode": "paper_trading",
    }


@app.get("/api/market/price/{symbol}")
async def market_price(
    symbol: str,
    user=__import__("fastapi").Depends(require_user),
):
    symbol = symbol.upper()

    if not symbol.endswith("USDT") or not symbol[:-4].isalnum():
        raise HTTPException(400, "Invalid symbol")

    try:
        return await market_data.get_24h_ticker(symbol)
    except Exception as exc:
        logger.warning("Market price error: %s", exc)
        raise HTTPException(502, "Market data temporarily unavailable")


@app.get("/api/market/klines/{symbol}")
async def market_klines(
    symbol: str,
    interval: str = Query(default="1h"),
    limit: int = Query(default=200, ge=50, le=500),
    user=__import__("fastapi").Depends(require_user),
):
    allowed = {"1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"}

    if interval not in allowed:
        raise HTTPException(400, "Unsupported interval")

    try:
        return await market_data.get_klines(symbol.upper(), interval, limit)
    except Exception as exc:
        logger.warning("Klines error: %s", exc)
        raise HTTPException(502, "Candles unavailable")


@app.get("/api/analysis/{symbol}")
async def analysis(
    symbol: str,
    interval: str = Query(default="1h"),
    user=__import__("fastapi").Depends(require_user),
):
    try:
        candles = await market_data.get_klines(symbol.upper(), interval, 200)
        result = analyze_market(candles)
        result["symbol"] = symbol.upper()
        result["interval"] = interval
        return result
    except Exception as exc:
        logger.warning("Analysis error: %s", exc)
        raise HTTPException(502, "Analysis unavailable")


@app.get("/api/portfolio")
async def portfolio(user=__import__("fastapi").Depends(require_user)):
    db = SessionLocal()

    try:
        accounts = db.query(PaperAccount).all()
        account_data = []
        total_balance = 0.0
        total_initial = 0.0
        total_equity = 0.0

        for account in accounts:
            positions = db.query(Position).filter(
                Position.account_id == account.id,
                Position.status == "open",
            ).all()

            balance = float(account.balance or 0)
            equity = balance

            account_data.append({
                "name": account.name,
                "strategy": account.strategy,
                "balance": balance,
                "equity": equity,
                "open_positions": len(positions),
            })

            total_balance += balance
            total_initial += float(account.initial_balance or 0)
            total_equity += equity

        return {
            "initial_capital": total_initial,
            "balance": total_balance,
            "equity": total_equity,
            "total_pnl": total_equity - total_initial,
            "accounts": account_data,
        }
    finally:
        db.close()


@app.get("/api/history")
async def history(
    limit: int = Query(default=50, ge=1, le=200),
    user=__import__("fastapi").Depends(require_user),
):
    db = SessionLocal()

    try:
        trades = (
            db.query(Trade)
            .order_by(Trade.id.desc())
            .limit(limit)
            .all()
        )

        return {
            "trades": [
                {
                    "symbol": trade.symbol,
                    "direction": trade.direction,
                    "strategy": trade.strategy,
                    "net_pnl": trade.net_pnl,
                    "exit_reason": trade.exit_reason,
                }
                for trade in trades
            ]
        }
    finally:
        db.close()


@app.get("/")
async def index():
    file = FRONTEND_DIR / "index.html"

    if not file.exists():
        raise HTTPException(404, "Frontend not found")

    return FileResponse(file)


app.mount(
    "/",
    StaticFiles(directory=str(FRONTEND_DIR), html=True),
    name="frontend",
)
