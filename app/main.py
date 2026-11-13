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
    AppSetting, PaperAccount, Position, Trade, User, SessionLocal, init_db,
)
from app.instance_lock import acquire_advisory_lock, release_advisory_lock
from app.market_data import market_data
from app.analyzer import analyze_market
from app.worker import run_worker
from app.intelligence_api import build_router
from app.robustness_api import build_robustness_router
from app.mirage4_api import build_mirage4_router
from app.signal_intelligence_api import build_signal_intelligence_router
from app.news_api import build_news_router
from app.platform_api import build_platform_router
from app.migrations import prepare_legacy_schema
from app.access import ensure_user_records, user_id_from_claims, user_account_ids

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trading-intelligence")
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
TELEGRAM_POLLING_LOCK_ID = 81420312
APP_STARTED_AT = time.time()


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
            b"WebAppData", settings.telegram_token.encode(), hashlib.sha256,
        ).digest()
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(calculated_hash, received_hash):
            raise ValueError("Invalid signature")
        user_data = json.loads(parsed.get("user", "{}"))
        user_id = str(user_data.get("id", ""))
        if not user_id:
            raise HTTPException(403, "Access denied")
        try:
            ensure_user_records(user_data)
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc
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
        lock_connection = None
        try:
            lock_connection = acquire_advisory_lock(TELEGRAM_POLLING_LOCK_ID)
            if lock_connection is None:
                logger.info("Another Render instance owns Telegram polling; waiting")
                await asyncio.sleep(10)
                continue
            logger.info("Telegram polling advisory lock acquired")
            await run_bot()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Telegram bot stopped; retrying in 15 seconds")
            await asyncio.sleep(15)
        finally:
            if lock_connection is not None:
                try:
                    release_advisory_lock(lock_connection, TELEGRAM_POLLING_LOCK_ID)
                except Exception:
                    logger.exception("Could not release Telegram polling advisory lock")


@asynccontextmanager
async def lifespan(app: FastAPI):
    prepare_legacy_schema()
    init_db()

    worker_task = asyncio.create_task(run_worker(), name="market-signal-scanner")
    bot_task = asyncio.create_task(run_bot_supervisor(), name="telegram-bot-polling")
    app.state.worker_task = worker_task
    app.state.bot_task = bot_task
    logger.info("MIRAGE 4.3 staging release started")
    logger.info("Background scanner and Telegram bot tasks scheduled")
    try:
        yield
    finally:
        for task in (worker_task, bot_task):
            task.cancel()
        await asyncio.gather(worker_task, bot_task, return_exceptions=True)
        logger.info("MIRAGE stopped")


app = FastAPI(title="MIRAGE", version="4.3.0", lifespan=lifespan)
app.include_router(build_router(require_user))
app.include_router(build_robustness_router(require_user))
app.include_router(build_mirage4_router(require_user, app, APP_STARTED_AT))
app.include_router(build_signal_intelligence_router(require_user))
app.include_router(build_news_router(require_user))
app.include_router(build_platform_router(require_user))


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    worker = getattr(app.state, "worker_task", None)
    worker_running = bool(worker and not worker.done())
    return {
        "status": "ok" if worker_running else "degraded",
        "service": "MIRAGE",
        "paper_trading_only": True,
        "live_execution": False,
        "scanner_task": "running" if worker_running else "not_running",
    }


@app.get("/api/status")
async def api_status(user: dict = Header(default=None)):
    return {
        "status": "online", "service": "MIRAGE",
        "market_data": "Binance Spot with Kraken Spot fallback",
        "mode": "paper_trading",
    }


@app.get("/api/market/price/{symbol}")
async def market_price(symbol: str, user=__import__("fastapi").Depends(require_user)):
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
    symbol: str, interval: str = Query(default="1h"),
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
    symbol: str, interval: str = Query(default="1h"),
    user=__import__("fastapi").Depends(require_user),
):
    allowed = {"1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"}
    if interval not in allowed:
        raise HTTPException(400, "Unsupported interval")
    symbol = symbol.upper()
    if not symbol.endswith("USDT") or not symbol[:-4].isalnum():
        raise HTTPException(400, "Invalid symbol")
    try:
        candles = await market_data.get_klines(symbol, interval, 200)
        result = analyze_market(candles)
        result["symbol"] = symbol
        result["interval"] = interval
        return result
    except Exception as exc:
        logger.warning("Analysis error: %s", exc)
        raise HTTPException(502, "Analysis unavailable")


@app.get("/api/portfolio")
async def portfolio(user=__import__("fastapi").Depends(require_user)):
    owner_id = user_id_from_claims(user)
    db = SessionLocal()
    try:
        accounts = db.query(PaperAccount).filter(
            PaperAccount.owner_telegram_id == owner_id
        ).order_by(PaperAccount.id.asc()).all()
        account_ids = [a.id for a in accounts]
        account_data, all_positions = [], []
        total_balance = total_initial = total_equity = 0.0
        for account in accounts:
            positions = (
                db.query(Position)
                .filter(Position.account_id == account.id, Position.status == "open")
                .order_by(Position.opened_at.desc())
                .all()
            )
            balance = float(account.balance or 0)
            unrealized = sum(float(position.unrealized_pnl or 0) for position in positions)
            equity = balance + unrealized
            account_pnl = equity - float(account.initial_balance or 0)
            account_data.append({
                "name": {
                    "scalping": "Scalping", "intraday": "Intraday",
                    "swing": "Swing", "position": "Position",
                }.get(account.strategy, account.strategy.title()),
                "strategy": account.strategy,
                "balance": round(balance, 2), "equity": round(equity, 2),
                "unrealized_pnl": round(unrealized, 2),
                "total_pnl": round(account_pnl, 2),
                "open_positions": len(positions),
            })
            for position in positions:
                all_positions.append({
                    "id": position.id, "account": {
                        "scalping": "Scalping", "intraday": "Intraday",
                        "swing": "Swing", "position": "Position",
                    }.get(account.strategy, account.strategy.title()),
                    "strategy": account.strategy, "symbol": position.symbol,
                    "direction": position.direction,
                    "entry_price": float(position.entry_price or 0),
                    "current_price": float(position.current_price or position.entry_price or 0),
                    "stop_loss": float(position.stop_loss or 0),
                    "take_profit": float(position.take_profit or 0),
                    "quantity": float(position.quantity or 0),
                    "unrealized_pnl": float(position.unrealized_pnl or 0),
                    "opened_at": position.opened_at.isoformat() if position.opened_at else None,
                })
            total_balance += balance
            total_initial += float(account.initial_balance or 0)
            total_equity += equity
        total_unrealized = total_equity - total_balance
        return {
            "initial_capital": round(total_initial, 2),
            "balance": round(total_balance, 2),
            "equity": round(total_equity, 2),
            "unrealized_pnl": round(total_unrealized, 2),
            "total_pnl": round(total_equity - total_initial, 2),
            "accounts": account_data, "positions": all_positions,
        }
    finally:
        db.close()


@app.get("/api/history")
async def history(
    limit: int = Query(default=50, ge=1, le=200),
    user=__import__("fastapi").Depends(require_user),
):
    owner_id = user_id_from_claims(user)
    db = SessionLocal()
    try:
        account_ids = user_account_ids(db, owner_id)
        trades = (db.query(Trade).filter(Trade.account_id.in_(account_ids))
                  .order_by(Trade.id.desc()).limit(limit).all()) if account_ids else []
        return {"trades": [{
            "symbol": trade.symbol, "direction": trade.direction,
            "strategy": trade.strategy, "net_pnl": trade.net_pnl,
            "exit_reason": trade.exit_reason,
            "closed_at": trade.closed_at.isoformat() if trade.closed_at else None,
        } for trade in trades]}
    finally:
        db.close()


@app.get("/")
async def index():
    file = FRONTEND_DIR / "index.html"
    if not file.exists():
        raise HTTPException(404, "Frontend not found")
    return FileResponse(file)


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
