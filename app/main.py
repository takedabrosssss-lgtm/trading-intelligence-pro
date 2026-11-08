
import hashlib
import hmac
import json
import logging
import time

from pathlib import Path
from urllib.parse import parse_qsl

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.config import settings
from app.database import (
    PaperAccount,
    Position,
    Trade,
    get_db,
    init_db,
)
from app.market_data import market_data, MarketDataError
from app.signals import generate_signal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url=None if settings.ENVIRONMENT == "production" else "/docs",
    redoc_url=None,
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

STRATEGIES = [
    "scalping",
    "intraday",
    "swing",
    "position",
]


def validate_telegram_init_data(init_data: str) -> dict:
    """Validate Telegram Mini App initData."""

    token = settings.telegram_token

    if not token:
        raise HTTPException(
            status_code=503,
            detail="Telegram bot token is not configured.",
        )

    if not init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram authorization required.",
        )

    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash", None)

        if not received_hash:
            raise ValueError("Missing hash")

        auth_date = int(parsed.get("auth_date", "0"))

        if auth_date <= 0 or time.time() - auth_date > 86400:
            raise ValueError("Expired authorization")

        data_check_string = "\n".join(
            f"{key}={value}"
            for key, value in sorted(parsed.items())
        )

        secret_key = hmac.new(
            b"WebAppData",
            token.encode(),
            hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(
            calculated_hash,
            received_hash,
        ):
            raise ValueError("Invalid signature")

        user = json.loads(parsed.get("user", "{}"))

        telegram_id = str(user.get("id", ""))

        if not telegram_id:
            raise ValueError("Missing Telegram user")

        allowed_ids = settings.allowed_user_ids

        if not allowed_ids or telegram_id not in allowed_ids:
            raise HTTPException(
                status_code=403,
                detail="This account is not authorized.",
            )

        return user

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Telegram authorization failed: %s", exc)
        raise HTTPException(
            status_code=401,
            detail="Invalid Telegram authorization.",
        ) from exc


async def require_telegram_user(
    x_telegram_init_data: str = Header(
        default="",
        alias="X-Telegram-Init-Data",
    ),
):
    return validate_telegram_init_data(x_telegram_init_data)


@app.on_event("startup")
def startup():
    init_db()

    db = next(get_db())

    try:
        existing = db.query(PaperAccount).count()

        if existing == 0:
            for strategy in STRATEGIES:
                db.add(
                    PaperAccount(
                        name=f"{strategy.capitalize()} Account",
                        strategy=strategy,
                        initial_balance=settings.STRATEGY_CAPITAL,
                        balance=settings.STRATEGY_CAPITAL,
                        equity=settings.STRATEGY_CAPITAL,
                        max_drawdown=settings.MAX_DRAWDOWN,
                    )
                )

            db.commit()

        logger.info("Trading Intelligence PRO initialized.")

    except Exception:
        db.rollback()
        logger.exception("Database initialization failed.")
        raise
    finally:
        db.close()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "application": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/api/status")
async def api_status(user: dict = Depends(require_telegram_user)):
    return {
        "status": "ok",
        "user": user.get("username"),
        "version": settings.APP_VERSION,
        "mode": "paper_trading",
    }


@app.get("/api/market/price/{symbol}")
async def market_price(
    symbol: str,
    user: dict = Depends(require_telegram_user),
):
    try:
        return await market_data.get_24h_ticker(symbol)
    except MarketDataError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/market/klines/{symbol}")
async def market_klines(
    symbol: str,
    interval: str = Query(default="1h"),
    limit: int = Query(default=200, ge=1, le=1000),
    user: dict = Depends(require_telegram_user),
):
    try:
        candles = await market_data.get_klines(
            symbol=symbol,
            interval=interval,
            limit=limit,
        )

        return {
            "symbol": symbol.upper(),
            "interval": interval,
            "source": "Binance Spot",
            "candles": candles,
        }

    except (MarketDataError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/analysis/{symbol}")
async def market_analysis(
    symbol: str,
    interval: str = Query(default="1h"),
    user: dict = Depends(require_telegram_user),
):
    try:
        candles = await market_data.get_klines(
            symbol=symbol,
            interval=interval,
            limit=200,
        )

        return generate_signal(
            symbol=symbol,
            candles=candles,
            market="crypto",
            timeframe=interval,
            strategy="intraday",
        )

    except (MarketDataError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/portfolio")
async def portfolio(
    db: Session = Depends(get_db),
    user: dict = Depends(require_telegram_user),
):
    accounts = db.query(PaperAccount).all()

    account_data = []

    total_initial = 0.0
    total_balance = 0.0
    total_equity = 0.0

    for account in accounts:
        positions = (
            db.query(Position)
            .filter(
                Position.account_id == account.id,
                Position.status == "open",
            )
            .all()
        )

        unrealized = sum(
            position.unrealized_pnl or 0
            for position in positions
        )

        equity = account.balance + unrealized

        total_initial += account.initial_balance
        total_balance += account.balance
        total_equity += equity

        account_data.append({
            "id": account.id,
            "name": account.name,
            "strategy": account.strategy,
            "initial_balance": account.initial_balance,
            "balance": round(account.balance, 2),
            "equity": round(equity, 2),
            "unrealized_pnl": round(unrealized, 2),
            "open_positions": len(positions),
            "active": account.is_active,
        })

    return {
        "mode": "paper_trading",
        "currency": "USD",
        "initial_capital": round(total_initial, 2),
        "balance": round(total_balance, 2),
        "equity": round(total_equity, 2),
        "total_pnl": round(total_equity - total_initial, 2),
        "accounts": account_data,
    }


@app.get("/api/history")
async def trade_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(require_telegram_user),
):
    trades = (
        db.query(Trade)
        .order_by(Trade.closed_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(trades),
        "trades": [
            {
                "id": trade.id,
                "symbol": trade.symbol,
                "direction": trade.direction,
                "quantity": trade.quantity,
                "entry_price": trade.entry_price,
                "exit_price": trade.exit_price,
                "net_pnl": trade.net_pnl,
                "strategy": trade.strategy,
                "exit_reason": trade.exit_reason,
                "closed_at": (
                    trade.closed_at.isoformat()
                    if trade.closed_at else None
                ),
            }
            for trade in trades
        ],
    }


@app.get("/api/market/health")
async def market_health(
    user: dict = Depends(require_telegram_user),
):
    available = await market_data.health_check()

    return {
        "provider": "Binance Spot",
        "available": available,
    }


if FRONTEND_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="frontend",
    )
else:
    logger.warning("Frontend directory not found: %s", FRONTEND_DIR)
    
