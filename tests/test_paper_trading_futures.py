import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest

# In the full MIRAGE repository use the real signal-quality gate. The local
# verification bundle omits that unrelated module, so provide a narrow stub only
# when the app.signals module itself is absent (never shadow a real import).
try:
    import app.signals  # noqa: F401
except ModuleNotFoundError as exc:
    if exc.name != "app.signals":
        raise
    signals_stub = types.ModuleType("app.signals")
    signals_stub.is_quality_signal_values = lambda *args, **kwargs: True
    signals_stub.signal_strength = lambda direction, score: float(score or 0)
    sys.modules["app.signals"] = signals_stub

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, User, PaperAccount, Signal, Position
from app import paper_trading
from app.futures_engine import MARKET_TYPE


def build_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'paper.sqlite'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def test_new_signal_opens_isolated_futures_and_debits_entry_fee(monkeypatch, tmp_path):
    engine, factory = build_db(tmp_path)
    db = factory()
    user = User(telegram_id="10001", is_active=True, phantom_locked=False)
    db.add(user); db.flush()
    account = PaperAccount(name="Scalping", owner_telegram_id="10001", strategy="scalping", balance=2500, initial_balance=2500, is_active=True)
    db.add(account)
    signal = Signal(symbol="BTCUSDT", market=MARKET_TYPE, timeframe="15m", direction="BUY", grade="A", score=90, confidence=90, entry_price=100, stop_loss=95, take_profit=110, strategy="scalping", status="new", indicators={"atr": 0.5})
    db.add(signal); db.commit(); signal_id = signal.id
    db.close()

    monkeypatch.setattr(paper_trading, "SessionLocal", factory)
    monkeypatch.setattr(paper_trading, "market_data", SimpleNamespace(
        get_mark_price=AsyncMock(return_value={"mark_price": 100.0}),
        get_price=AsyncMock(return_value={"price": 100.0}),
        get_24h_ticker=AsyncMock(return_value={"quoteVolume": 100_000_000}),
    ))
    monkeypatch.setattr(paper_trading, "settings", SimpleNamespace(
        max_drawdown=0.10, max_risk_per_trade=0.015,
        futures_taker_fee_rate=0.0005, futures_max_leverage=8,
        futures_maintenance_margin_rate=0.01,
        futures_max_exposure_fraction=0.75,
        futures_max_margin_fraction=0.5,
    ))
    opened = asyncio.run(paper_trading.open_paper_positions())
    assert opened == 1
    db = factory()
    position = db.query(Position).filter(Position.signal_id == signal_id).one()
    account = db.query(PaperAccount).filter(PaperAccount.id == position.account_id).one()
    assert position.market_type == MARKET_TYPE
    assert 1 <= position.leverage <= 8
    assert position.margin_used > 0
    assert position.liquidation_price is not None
    assert position.entry_fee > 0
    assert account.balance < 2500  # entry commission debited once at open
    db.close(); engine.dispose()


def test_mark_candle_stop_touch_closes_with_stop_first(monkeypatch, tmp_path):
    engine, factory = build_db(tmp_path)
    db = factory()
    user = User(telegram_id="10002", is_active=True, phantom_locked=False)
    db.add(user); db.flush()
    account = PaperAccount(name="Intraday", owner_telegram_id="10002", strategy="intraday", balance=2500, initial_balance=2500, is_active=True)
    db.add(account); db.flush()
    opened = datetime.now(timezone.utc) - timedelta(minutes=3)
    position = Position(
        account_id=account.id, symbol="BTCUSDT", direction="BUY", entry_price=100,
        current_price=100, stop_loss=95, take_profit=110, quantity=1,
        status="open", opened_at=opened, market_type=MARKET_TYPE, leverage=4,
        margin_used=25, liquidation_price=74, entry_fee=0.05, funding_pnl=0,
    )
    db.add(position); db.commit(); position_id = position.id; db.close()

    mark_time = int((opened + timedelta(minutes=1)).timestamp() * 1000)
    monkeypatch.setattr(paper_trading, "SessionLocal", factory)
    monkeypatch.setattr(paper_trading, "market_data", SimpleNamespace(
        get_mark_price=AsyncMock(return_value={"mark_price": 100.0}),
        get_mark_price_klines=AsyncMock(return_value=[{
            "timestamp": mark_time, "open": 100.0, "high": 111.0, "low": 94.0, "close": 100.0,
        }]),
        get_funding_rates=AsyncMock(return_value=[]),
    ))
    monkeypatch.setattr(paper_trading, "settings", SimpleNamespace(
        futures_taker_fee_rate=0.0005, futures_slippage_rate=0.0,
        futures_liquidation_fee_rate=0.01,
    ))
    updated = asyncio.run(paper_trading.update_open_positions())
    assert updated == 1
    db = factory()
    position = db.query(Position).filter(Position.id == position_id).one()
    from app.database import Trade
    trade = db.query(Trade).filter(Trade.position_id == position_id).one()
    assert position.status == "closed"
    assert trade.exit_reason == "stop_loss_both_touched"
    assert trade.market_type == MARKET_TYPE
    db.close(); engine.dispose()


def test_funding_api_failure_does_not_disable_stop_protection(monkeypatch, tmp_path):
    engine, factory = build_db(tmp_path)
    db = factory()
    user = User(telegram_id="10003", is_active=True, phantom_locked=False)
    db.add(user); db.flush()
    account = PaperAccount(name="Swing", owner_telegram_id="10003", strategy="swing", balance=2500, initial_balance=2500, is_active=True)
    db.add(account); db.flush()
    opened = datetime.now(timezone.utc) - timedelta(minutes=3)
    position = Position(
        account_id=account.id, symbol="BTCUSDT", direction="BUY", entry_price=100,
        current_price=100, stop_loss=95, take_profit=110, quantity=1,
        status="open", opened_at=opened, market_type=MARKET_TYPE, leverage=2,
        margin_used=50, liquidation_price=50, entry_fee=0.05, funding_pnl=0,
    )
    db.add(position); db.commit(); position_id = position.id; db.close()
    mark_time = int((opened + timedelta(minutes=1)).timestamp() * 1000)

    async def funding_failure(*args, **kwargs):
        raise RuntimeError("funding endpoint temporarily unavailable")

    monkeypatch.setattr(paper_trading, "SessionLocal", factory)
    monkeypatch.setattr(paper_trading, "market_data", SimpleNamespace(
        get_mark_price=AsyncMock(return_value={"mark_price": 94.0}),
        get_mark_price_klines=AsyncMock(return_value=[{
            "timestamp": mark_time, "open": 100.0, "high": 101.0, "low": 94.0, "close": 94.0,
        }]),
        get_funding_rates=funding_failure,
    ))
    monkeypatch.setattr(paper_trading, "settings", SimpleNamespace(
        futures_taker_fee_rate=0.0005, futures_slippage_rate=0.0,
        futures_liquidation_fee_rate=0.01,
    ))
    asyncio.run(paper_trading.update_open_positions())
    db = factory()
    from app.database import Trade
    saved_position = db.query(Position).filter(Position.id == position_id).one()
    saved_trade = db.query(Trade).filter(Trade.position_id == position_id).one()
    assert saved_position.status == "closed"
    assert saved_trade.exit_reason == "stop_loss"
    db.close(); engine.dispose()


def test_legacy_spot_position_close_remains_spot_accounting(tmp_path):
    engine, factory = build_db(tmp_path)
    db = factory()
    user = User(telegram_id="10004", is_active=True, phantom_locked=False)
    db.add(user); db.flush()
    account = PaperAccount(name="Position", owner_telegram_id="10004", strategy="position", balance=2500, initial_balance=2500, is_active=True)
    db.add(account); db.flush()
    legacy_position = Position(
        account_id=account.id, symbol="BTCUSDT", direction="BUY", entry_price=100,
        current_price=100, stop_loss=95, take_profit=110, quantity=1, status="open",
    )
    db.add(legacy_position); db.flush()
    assert legacy_position.market_type == "spot"
    paper_trading._close_position(db, legacy_position, 110, "MANUAL_CLOSE")
    db.commit()
    from app.database import Trade
    trade = db.query(Trade).filter(Trade.position_id == legacy_position.id).one()
    saved_account = db.query(PaperAccount).filter(PaperAccount.id == account.id).one()
    assert trade.market_type == "spot"
    assert trade.leverage == 1
    assert trade.funding_pnl == 0
    assert trade.net_pnl == pytest.approx(9.79)
    assert saved_account.balance == pytest.approx(2509.79)
    db.close(); engine.dispose()
