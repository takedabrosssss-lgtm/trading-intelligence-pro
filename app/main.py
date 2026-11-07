from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select
from app.config import get_settings
from app.database import init_db, SessionLocal, Signal
from app.bot import dp, bot
from app.market_data import WATCHLIST
from pathlib import Path
import hmac, hashlib, urllib.parse, time

settings = get_settings()
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


def verify_telegram_init_data(init_data: str, bot_token: str, max_age=86400):
    if not init_data or not bot_token:
        return False
    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received = parsed.pop("hash", None)
    if not received:
        return False
    auth_date = int(parsed.get("auth_date", "0"))
    if auth_date <= 0 or time.time() - auth_date > max_age:
        return False
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(calculated, received)


@asynccontextmanager
async def lifespan(app):
    await init_db()
    if bot and settings.webhook_url:
        await bot.set_webhook(
            settings.webhook_url,
            secret_token=settings.webhook_secret
        )
    yield
    if bot:
        await bot.session.close()


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "paper_trading": settings.paper_trading
    }


@app.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    if not bot:
        raise HTTPException(503, "Bot token not configured")

    secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token", ""
    )
    if not hmac.compare_digest(secret, settings.webhook_secret):
        raise HTTPException(403, "Invalid webhook secret")

    from aiogram.types import Update
    update = Update.model_validate(
        await request.json(),
        context={"bot": bot}
    )
    await dp.feed_update(bot, update)
    return {"ok": True}


@app.get("/api/assets")
async def assets():
    return {"assets": WATCHLIST}


@app.get("/api/signals")
async def api_signals(limit: int = 50):
    async with SessionLocal() as db:
        rows = list((
            await db.execute(
                select(Signal)
                .order_by(Signal.created_at.desc())
                .limit(min(limit, 200))
            )
        ).scalars())

    return [
        {
            "id": x.id,
            "symbol": x.symbol,
            "direction": x.direction,
            "timeframe": x.timeframe,
            "entry": x.entry,
            "sl": x.sl,
            "tp1": x.tp1,
            "tp2": x.tp2,
            "historical_winrate": x.historical_winrate,
            "sample_size": x.sample_size,
            "score": x.score,
            "status": x.status,
            "result": x.result,
            "created_at": x.created_at.isoformat() if x.created_at else None
        }
        for x in rows
    ]


@app.get("/api/stats")
async def stats():
    async with SessionLocal() as db:
        rows = list((await db.execute(select(Signal))).scalars())

    closed = [x for x in rows if x.status == "CLOSED"]
    wins = sum(1 for x in closed if x.result in ("TP1", "TP2"))

    return {
        "total": len(rows),
        "active": sum(
            x.status in ("ACTIVE", "TP1", "PUBLISHED") for x in rows
        ),
        "closed": len(closed),
        "wins": wins,
        "losses": sum(x.result == "SL" for x in closed),
        "realized_winrate": round(100 * wins / len(closed), 1) if closed else None
    }


@app.get("/")
async def index():
    return FileResponse(FRONTEND / "index.html")


app.mount(
    "/static",
    StaticFiles(directory=FRONTEND),
    name="static"
)
