from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI, Header
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import (
    Base, User, PaperAccount, Position, Signal, Trade,
    ExchangeConnection, ExchangeAuditEvent,
)


def make_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return engine, factory


def seed_user(factory, telegram_id: str, role: str = "user"):
    db = factory()
    try:
        db.add(User(telegram_id=telegram_id, role=role, is_active=True, ui_mode="stealth", trading_mode="paper"))
        for name, strategy in (("Scalping", "scalping"), ("Intraday", "intraday"), ("Swing", "swing"), ("Position", "position")):
            db.add(PaperAccount(
                owner_telegram_id=telegram_id,
                name=f"{name} · {telegram_id}",
                strategy=strategy,
                balance=2500.0,
                initial_balance=2500.0,
            ))
        db.commit()
    finally:
        db.close()


def build_platform_test_app(monkeypatch, factory):
    from app import platform_api

    monkeypatch.setattr(platform_api, "SessionLocal", factory)

    def fake_user(x_test_telegram_id: str = Header(alias="X-Test-Telegram-ID")):
        return {"id": x_test_telegram_id}

    app = FastAPI()
    app.include_router(platform_api.build_platform_router(fake_user))
    return app


def test_fernet_exchange_secrets_are_encrypted_and_reversible(monkeypatch):
    from app import security

    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setattr(security, "settings", SimpleNamespace(exchange_encryption_key=key))
    plain = "example-secret-that-must-not-be-stored"
    encrypted = security.encrypt_secret(plain)
    assert encrypted != plain
    assert plain not in encrypted
    assert security.decrypt_secret(encrypted) == plain


def test_fernet_fails_closed_without_key(monkeypatch):
    from app import security

    monkeypatch.setattr(security, "settings", SimpleNamespace(exchange_encryption_key=""))
    with pytest.raises(security.CredentialEncryptionUnavailable):
        security.encrypt_secret("anything")


def test_user_provisioning_creates_isolated_four_account_paper_worlds(monkeypatch):
    from app import access

    _, factory = make_db()
    settings = SimpleNamespace(
        owner_telegram_id="11111",
        allowed_user_ids={"11111"},
        max_users=4,
    )
    monkeypatch.setattr(access, "SessionLocal", factory)
    monkeypatch.setattr(access, "settings", settings)

    access.ensure_user_records({"id": 11111, "username": "owner"})
    with pytest.raises(PermissionError):
        access.ensure_user_records({"id": 22222, "username": "not-invited"})

    db = factory()
    try:
        db.add(User(telegram_id="22222", role="user", invited_by="11111", is_active=True))
        db.commit()
    finally:
        db.close()

    access.ensure_user_records({"id": 22222, "username": "guest"})
    db = factory()
    try:
        owner_accounts = db.query(PaperAccount).filter(PaperAccount.owner_telegram_id == "11111").all()
        guest_accounts = db.query(PaperAccount).filter(PaperAccount.owner_telegram_id == "22222").all()
        assert len(owner_accounts) == 4
        assert len(guest_accounts) == 4
        assert sum(a.initial_balance for a in owner_accounts) == pytest.approx(10000)
        assert sum(a.initial_balance for a in guest_accounts) == pytest.approx(10000)
        assert {a.strategy for a in owner_accounts} == {a.strategy for a in guest_accounts}
        assert {a.id for a in owner_accounts}.isdisjoint({a.id for a in guest_accounts})
    finally:
        db.close()


def test_platform_manual_paper_close_is_tenant_scoped_and_marks_manual_close(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")

    db = factory()
    try:
        owner_account = db.query(PaperAccount).filter(
            PaperAccount.owner_telegram_id == "11111", PaperAccount.strategy == "scalping"
        ).one()
        position = Position(
            account_id=owner_account.id, symbol="BTCUSDT", direction="BUY",
            entry_price=100.0, current_price=105.0, stop_loss=95.0,
            take_profit=110.0, quantity=1.0, unrealized_pnl=5.0, status="open",
        )
        db.add(position)
        db.commit()
        position_id = position.id
    finally:
        db.close()

    monkeypatch.setattr(platform_api, "market_data", SimpleNamespace(get_price=AsyncMock(return_value={"price": 108.0})))
    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)

    denied = client.post(
        f"/api/platform/paper/positions/{position_id}/close",
        headers={"X-Test-Telegram-ID": "22222"},
    )
    assert denied.status_code == 404

    closed = client.post(
        f"/api/platform/paper/positions/{position_id}/close",
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["exit_reason"] == "MANUAL_CLOSE"
    assert body["included_in_win_rate"] is False

    db = factory()
    try:
        saved = db.query(Position).filter(Position.id == position_id).one()
        trade = db.query(Trade).filter(Trade.position_id == position_id).one()
        assert saved.status == "closed"
        assert trade.exit_reason == "MANUAL_CLOSE"
        assert trade.net_pnl == pytest.approx(7.792)
    finally:
        db.close()


def test_exchange_connections_and_phantom_lock_are_private_to_owner(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        connection = ExchangeConnection(
            owner_telegram_id="11111", exchange="binance", environment="testnet",
            api_key_encrypted="encrypted-key", api_secret_encrypted="encrypted-secret",
            connection_status="connected", emergency_lock=False,
        )
        db.add(connection)
        db.commit()
        connection_id = connection.id
    finally:
        db.close()

    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)
    guest_list = client.get("/api/platform/exchanges", headers={"X-Test-Telegram-ID": "22222"})
    assert guest_list.status_code == 200
    assert guest_list.json()["connections"] == []

    guest_phantom = client.post("/api/platform/phantom/lock", headers={"X-Test-Telegram-ID": "22222"})
    assert guest_phantom.status_code == 200
    db = factory()
    try:
        connection = db.query(ExchangeConnection).filter(ExchangeConnection.id == connection_id).one()
        assert connection.emergency_lock is False
    finally:
        db.close()

    owner_phantom = client.post("/api/platform/phantom/lock", headers={"X-Test-Telegram-ID": "11111"})
    assert owner_phantom.status_code == 200
    assert owner_phantom.json()["positions_closed"] == 0
    assert owner_phantom.json()["keys_revoked"] is False
    db = factory()
    try:
        connection = db.query(ExchangeConnection).filter(ExchangeConnection.id == connection_id).one()
        assert connection.emergency_lock is True
        assert connection.api_secret_encrypted == "encrypted-secret"
    finally:
        db.close()


def test_live_mode_is_refused_even_when_ui_preference_is_changed(monkeypatch):
    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)
    response = client.put(
        "/api/platform/preferences",
        json={"ui_mode": "spectre", "trading_mode": "live"},
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert response.status_code == 409
    db = factory()
    try:
        row = db.query(User).filter(User.telegram_id == "11111").one()
        assert row.ui_mode == "stealth"  # request transaction rolled back atomically
        assert row.trading_mode == "paper"
    finally:
        db.close()


def test_owner_can_invite_user_and_new_accounts_are_distinct(monkeypatch):
    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)
    response = client.post(
        "/api/platform/users",
        json={"telegram_id": "33333"},
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert response.status_code == 201, response.text
    db = factory()
    try:
        invited = db.query(User).filter(User.telegram_id == "33333").one()
        accounts = db.query(PaperAccount).filter(PaperAccount.owner_telegram_id == "33333").all()
        assert invited.role == "user" and invited.is_active
        assert len(accounts) == 4
        assert sum(row.initial_balance for row in accounts) == pytest.approx(10000)
        assert all("33333" in row.name for row in accounts)
    finally:
        db.close()


def test_read_only_exchange_verification_refuses_binance_withdrawal_permission(monkeypatch):
    from app import exchange_clients

    class MockResponse:
        def raise_for_status(self):
            return None
        def json(self):
            return {"canTrade": True, "canWithdraw": True}

    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None
        async def get(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr(exchange_clients.httpx, "AsyncClient", lambda **kwargs: MockClient())
    with pytest.raises(PermissionError, match="withdrawal"):
        asyncio.run(exchange_clients.verify_credentials("binance", "mainnet", "12345678", "abcdefgh"))


def test_signal_delivery_unique_constraint_prevents_duplicate_recipient_rows():
    _, factory = make_db()
    db = factory()
    try:
        signal = Signal(
            symbol="BTCUSDT", timeframe="1h", direction="BUY", grade="A",
            score=90.0, entry_price=100, stop_loss=95, take_profit=110,
            strategy="intraday", status="new",
        )
        db.add(signal)
        db.commit()
        from app.database import SignalDelivery
        db.add(SignalDelivery(signal_id=signal.id, telegram_id="11111", status="delivered"))
        db.commit()
        db.add(SignalDelivery(signal_id=signal.id, telegram_id="11111", status="pending"))
        with pytest.raises(Exception):
            db.commit()
    finally:
        db.close()


def test_legacy_sqlite_migration_keeps_paper_balances_and_allows_new_invitees(monkeypatch):
    from app import migrations, access

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                telegram_id VARCHAR(32) NOT NULL UNIQUE,
                username VARCHAR(100),
                first_name VARCHAR(100),
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME
            )
        """))
        connection.execute(text("""
            CREATE TABLE paper_accounts (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                strategy VARCHAR(50) NOT NULL,
                balance FLOAT NOT NULL DEFAULT 2500,
                initial_balance FLOAT NOT NULL DEFAULT 2500,
                max_drawdown FLOAT NOT NULL DEFAULT 0.10,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME
            )
        """))
        connection.execute(text("INSERT INTO users (id, telegram_id, username, is_active) VALUES (1, '11111', 'owner', 1)"))
        for idx, name, strategy in (
            (1, "Scalping", "scalping"), (2, "Intraday", "intraday"),
            (3, "Swing", "swing"), (4, "Position", "position"),
        ):
            connection.execute(text(
                "INSERT INTO paper_accounts (id, name, strategy, balance, initial_balance, max_drawdown, is_active) "
                "VALUES (:id, :name, :strategy, 2500, 2500, 0.1, 1)"
            ), {"id": idx, "name": name, "strategy": strategy})

    monkeypatch.setattr(migrations, "engine", engine)
    monkeypatch.setattr(migrations, "settings", SimpleNamespace(owner_telegram_id="11111"))
    migrations.prepare_legacy_schema()
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    monkeypatch.setattr(access, "SessionLocal", factory)
    monkeypatch.setattr(access, "settings", SimpleNamespace(
        owner_telegram_id="11111", allowed_user_ids={"11111"}, max_users=4
    ))
    access.ensure_user_records({"id": 11111, "username": "owner"})

    db = factory()
    try:
        migrated_user = db.query(User).filter(User.telegram_id == "11111").one()
        assert migrated_user.phantom_locked is False
        owner_rows = db.query(PaperAccount).filter(PaperAccount.owner_telegram_id == "11111").all()
        assert len(owner_rows) == 4
        assert sum(row.balance for row in owner_rows) == pytest.approx(10000)
        db.add(User(telegram_id="22222", role="user", is_active=True, invited_by="11111"))
        db.commit()
    finally:
        db.close()

    access.ensure_user_records({"id": 22222, "username": "guest"})
    db = factory()
    try:
        guest_rows = db.query(PaperAccount).filter(PaperAccount.owner_telegram_id == "22222").all()
        assert len(guest_rows) == 4
        assert all("22222" in row.name for row in guest_rows)
        # Legacy global UNIQUE(name) remained in SQLite, but the new tenant labels do not collide.
        assert db.execute(text("SELECT COUNT(*) FROM paper_accounts")).scalar_one() == 8
    finally:
        db.close()


def test_paper_worker_opens_one_separate_simulated_position_per_user(monkeypatch):
    from app import paper_trading

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        signal = Signal(
            symbol="BTCUSDT", timeframe="15m", direction="BUY", grade="A",
            score=90.0, confidence=90.0, entry_price=100.0, stop_loss=95.0,
            take_profit=110.0, strategy="scalping", status="new",
            created_at=datetime.now(timezone.utc),
        )
        db.add(signal)
        db.commit()
        signal_id = signal.id
    finally:
        db.close()

    monkeypatch.setattr(paper_trading, "SessionLocal", factory)
    monkeypatch.setattr(paper_trading, "market_data", SimpleNamespace(get_price=AsyncMock(return_value={"price": 100.0})))
    opened = asyncio.run(paper_trading.open_paper_positions())
    assert opened == 2
    db = factory()
    try:
        positions = db.query(Position).filter(Position.signal_id == signal_id).all()
        owners = {db.query(PaperAccount).filter(PaperAccount.id == p.account_id).one().owner_telegram_id for p in positions}
        assert len(positions) == 2
        assert owners == {"11111", "22222"}
        assert all(p.status == "open" for p in positions)
    finally:
        db.close()


def test_command_center_scopes_stats_and_excludes_manual_close_only_from_win_rate(monkeypatch):
    from app import mirage4_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        owner_account = db.query(PaperAccount).filter(
            PaperAccount.owner_telegram_id == "11111", PaperAccount.strategy == "scalping"
        ).one()
        guest_account = db.query(PaperAccount).filter(
            PaperAccount.owner_telegram_id == "22222", PaperAccount.strategy == "scalping"
        ).one()
        now = datetime.now(timezone.utc)
        db.add_all([
            Trade(account_id=owner_account.id, symbol="BTCUSDT", direction="BUY", strategy="scalping", net_pnl=10, gross_pnl=10, fees=0, exit_reason="MANUAL_CLOSE", closed_at=now),
            Trade(account_id=owner_account.id, symbol="ETHUSDT", direction="BUY", strategy="scalping", net_pnl=-5, gross_pnl=-5, fees=0, exit_reason="stop_loss", closed_at=now),
            Trade(account_id=guest_account.id, symbol="SOLUSDT", direction="BUY", strategy="scalping", net_pnl=5, gross_pnl=5, fees=0, exit_reason="take_profit", closed_at=now),
        ])
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(mirage4_api, "SessionLocal", factory)
    def fake_user(x_test_telegram_id: str = Header(alias="X-Test-Telegram-ID")):
        return {"id": x_test_telegram_id}
    app = FastAPI()
    app.include_router(mirage4_api.build_mirage4_router(fake_user, app, 0))
    client = TestClient(app)

    response = client.get("/api/mirage/command-center", headers={"X-Test-Telegram-ID": "11111"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["trading"]["closed_trades"] == 2
    assert data["trading"]["win_rate_pct"] == 0.0
    assert data["trading"]["win_rate_sample_count"] == 1
    assert data["trading"]["manual_closes_excluded_from_win_rate"] == 1
    assert data["portfolio"]["net_realized_pnl"] == 5.0

    guest_response = client.get("/api/mirage/command-center", headers={"X-Test-Telegram-ID": "22222"})
    assert guest_response.status_code == 200
    guest_data = guest_response.json()
    assert guest_data["trading"]["closed_trades"] == 1
    assert guest_data["portfolio"]["net_realized_pnl"] == 5.0


def test_owner_deactivation_erases_local_exchange_secrets_and_audits(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        connection = ExchangeConnection(
            owner_telegram_id="22222", exchange="bybit", environment="testnet",
            api_key_encrypted="cipher-key", api_secret_encrypted="cipher-secret",
            connection_status="connected", emergency_lock=False,
        )
        db.add(connection)
        db.commit()
        connection_id = connection.id
    finally:
        db.close()

    app = build_platform_test_app(monkeypatch, factory)
    response = TestClient(app).delete(
        "/api/platform/users/22222",
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert response.status_code == 200, response.text

    db = factory()
    try:
        user = db.query(User).filter(User.telegram_id == "22222").one()
        saved = db.query(ExchangeConnection).filter(ExchangeConnection.id == connection_id).one()
        audit = db.query(ExchangeAuditEvent).filter(
            ExchangeAuditEvent.connection_id == connection_id,
            ExchangeAuditEvent.event_type == "USER_DEACTIVATED",
        ).one()
        assert user.is_active is False
        assert saved.connection_status == "disabled"
        assert saved.emergency_lock is True
        assert saved.api_key_encrypted == ""
        assert saved.api_secret_encrypted == ""
        assert audit.outcome == "LOCAL_CREDENTIALS_REMOVED"
    finally:
        db.close()


def test_exchange_connect_requires_explicit_no_withdrawals_confirmation(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    verify = AsyncMock()
    monkeypatch.setattr(platform_api, "verify_credentials", verify)
    app = build_platform_test_app(monkeypatch, factory)
    response = TestClient(app).post(
        "/api/platform/exchanges/connect",
        json={
            "exchange": "bybit", "environment": "testnet",
            "api_key": "12345678", "api_secret": "abcdefgh",
        },
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert response.status_code == 400
    assert "withdrawal permissions" in response.json()["detail"].lower()
    verify.assert_not_awaited()


def test_paper_worker_does_not_open_new_positions_for_deactivated_users(monkeypatch):
    from app import paper_trading

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        guest = db.query(User).filter(User.telegram_id == "22222").one()
        guest.is_active = False
        signal = Signal(
            symbol="BTCUSDT", timeframe="1h", direction="BUY", grade="A",
            score=90.0, confidence=90.0, entry_price=100.0, stop_loss=95.0,
            take_profit=110.0, strategy="intraday", status="new",
            created_at=datetime.now(timezone.utc),
        )
        db.add(signal)
        db.commit()
        signal_id = signal.id
    finally:
        db.close()

    monkeypatch.setattr(paper_trading, "SessionLocal", factory)
    monkeypatch.setattr(
        paper_trading, "market_data",
        SimpleNamespace(get_price=AsyncMock(return_value={"price": 100.0})),
    )
    monkeypatch.setattr(
        paper_trading, "settings",
        SimpleNamespace(max_drawdown=0.10, max_risk_per_trade=0.015),
    )
    monkeypatch.setattr(
        paper_trading, "assess_position",
        lambda **kwargs: SimpleNamespace(allowed=True, quantity=1.0, reserved_risk=5.0),
    )
    opened = asyncio.run(paper_trading.open_paper_positions())
    assert opened == 1

    db = factory()
    try:
        positions = db.query(Position).filter(Position.signal_id == signal_id).all()
        owners = {
            db.query(PaperAccount).filter(PaperAccount.id == p.account_id).one().owner_telegram_id
            for p in positions
        }
        assert len(positions) == 1
        assert owners == {"11111"}
    finally:
        db.close()


def test_bybit_read_only_verification_does_not_claim_withdrawals_are_disabled(monkeypatch):
    from app import exchange_clients

    class MockResponse:
        def raise_for_status(self):
            return None
        def json(self):
            return {"retCode": 0, "retMsg": "OK", "result": {"list": []}}

    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None
        async def get(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr(exchange_clients.httpx, "AsyncClient", lambda **kwargs: MockClient())
    result = asyncio.run(exchange_clients.verify_credentials("bybit", "testnet", "12345678", "abcdefgh"))
    assert result["withdrawal_check"] == "manual_required"
    assert result["withdrawal_access_detected"] is None


def test_parallel_first_login_provisions_one_user_and_four_accounts(monkeypatch, tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from app import access

    engine = create_engine(
        f"sqlite:///{tmp_path / 'parallel-login.sqlite'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    monkeypatch.setattr(access, "SessionLocal", factory)
    monkeypatch.setattr(access, "settings", SimpleNamespace(
        owner_telegram_id="11111", allowed_user_ids={"11111"}, max_users=4
    ))

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(
            lambda _: access.ensure_user_records({"id": "11111", "username": "owner"}).telegram_id,
            range(16),
        ))
    assert set(results) == {"11111"}
    db = factory()
    try:
        assert db.query(User).filter(User.telegram_id == "11111").count() == 1
        assert db.query(PaperAccount).filter(PaperAccount.owner_telegram_id == "11111").count() == 4
    finally:
        db.close()
        engine.dispose()


def test_phantom_lock_is_persistent_and_blocks_exchange_reconnect(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        db.add(ExchangeConnection(
            owner_telegram_id="11111", exchange="binance", environment="testnet",
            api_key_encrypted="cipher-key", api_secret_encrypted="cipher-secret",
            connection_status="connected", emergency_lock=False,
        ))
        db.commit()
    finally:
        db.close()

    verify = AsyncMock(return_value={"can_trade": False, "withdrawal_check": "verified_disabled"})
    monkeypatch.setattr(platform_api, "verify_credentials", verify)
    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)
    headers = {"X-Test-Telegram-ID": "11111"}

    locked = client.post("/api/platform/phantom/lock", headers=headers)
    assert locked.status_code == 200
    assert locked.json()["phantom_locked"] is True

    db = factory()
    try:
        user = db.query(User).filter(User.telegram_id == "11111").one()
        connection = db.query(ExchangeConnection).filter(ExchangeConnection.owner_telegram_id == "11111").one()
        assert user.phantom_locked is True
        assert user.trading_mode == "paper"
        assert connection.emergency_lock is True
        assert connection.connection_status == "locked"
    finally:
        db.close()

    reconnect = client.post(
        "/api/platform/exchanges/connect",
        headers=headers,
        json={
            "exchange": "binance", "environment": "testnet",
            "api_key": "12345678", "api_secret": "abcdefgh",
            "confirm_withdrawals_disabled": True,
        },
    )
    assert reconnect.status_code == 423
    verify.assert_not_awaited()


def test_phantom_unlock_requires_exact_confirmation_and_keeps_exchange_locked(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        user = db.query(User).filter(User.telegram_id == "11111").one()
        user.phantom_locked = True
        connection = ExchangeConnection(
            owner_telegram_id="11111", exchange="bybit", environment="testnet",
            api_key_encrypted="cipher-key", api_secret_encrypted="cipher-secret",
            connection_status="locked", emergency_lock=True,
        )
        db.add(connection)
        db.commit()
    finally:
        db.close()

    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)
    headers = {"X-Test-Telegram-ID": "11111"}
    denied = client.post("/api/platform/phantom/unlock", headers=headers, json={"confirmation": "wrong phrase"})
    assert denied.status_code == 400
    unlocked = client.post("/api/platform/phantom/unlock", headers=headers, json={"confirmation": "UNLOCK MIRAGE"})
    assert unlocked.status_code == 200
    db = factory()
    try:
        user = db.query(User).filter(User.telegram_id == "11111").one()
        connection = db.query(ExchangeConnection).filter(ExchangeConnection.owner_telegram_id == "11111").one()
        assert user.phantom_locked is False
        assert connection.emergency_lock is True
        assert connection.connection_status == "locked"
    finally:
        db.close()


def test_exchange_account_snapshot_is_owner_scoped_and_never_returns_credentials(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        connection = ExchangeConnection(
            owner_telegram_id="11111", exchange="bybit", environment="testnet",
            api_key_encrypted="cipher-key", api_secret_encrypted="cipher-secret",
            connection_status="connected", emergency_lock=False,
        )
        db.add(connection)
        db.commit()
        connection_id = connection.id
    finally:
        db.close()

    monkeypatch.setattr(platform_api, "decrypt_secret", lambda value: {
        "cipher-key": "private-api-key", "cipher-secret": "private-api-secret"
    }[value])
    fetch = AsyncMock(return_value={
        "exchange": "bybit", "environment": "testnet", "total_equity_usd": 1234.5,
        "assets": [{"asset": "USDT", "free": 1200.0, "locked": 34.5, "total": 1234.5, "usd_value": 1234.5}],
    })
    monkeypatch.setattr(platform_api, "fetch_account_snapshot", fetch)
    app = build_platform_test_app(monkeypatch, factory)
    client = TestClient(app)

    denied = client.get(f"/api/platform/exchanges/{connection_id}/account", headers={"X-Test-Telegram-ID": "22222"})
    assert denied.status_code == 404
    response = client.get(f"/api/platform/exchanges/{connection_id}/account", headers={"X-Test-Telegram-ID": "11111"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["snapshot"]["total_equity_usd"] == 1234.5
    assert "private-api-key" not in response.text
    assert "private-api-secret" not in response.text
    fetch.assert_awaited_once_with("bybit", "testnet", "private-api-key", "private-api-secret")


def test_locked_exchange_account_snapshot_is_refused_without_decrypting(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        connection = ExchangeConnection(
            owner_telegram_id="11111", exchange="binance", environment="testnet",
            api_key_encrypted="cipher-key", api_secret_encrypted="cipher-secret",
            connection_status="locked", emergency_lock=True,
        )
        db.add(connection)
        db.commit()
        connection_id = connection.id
    finally:
        db.close()

    decrypt = lambda value: (_ for _ in ()).throw(AssertionError("must not decrypt locked credentials"))
    fetch = AsyncMock()
    monkeypatch.setattr(platform_api, "decrypt_secret", decrypt)
    monkeypatch.setattr(platform_api, "fetch_account_snapshot", fetch)
    app = build_platform_test_app(monkeypatch, factory)
    response = TestClient(app).get(
        f"/api/platform/exchanges/{connection_id}/account",
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert response.status_code == 423
    fetch.assert_not_awaited()


def test_exchange_connect_encrypts_credentials_and_does_not_store_plaintext(monkeypatch):
    from app import platform_api
    from cryptography.fernet import Fernet

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setattr(platform_api, "encrypt_secret", lambda value: Fernet(key.encode()).encrypt(value.encode()).decode())
    monkeypatch.setattr(platform_api, "verify_credentials", AsyncMock(return_value={
        "can_trade": False,
        "withdrawal_access_detected": False,
        "withdrawal_check": "verified_disabled",
    }))
    app = build_platform_test_app(monkeypatch, factory)
    response = TestClient(app).post(
        "/api/platform/exchanges/connect",
        headers={"X-Test-Telegram-ID": "11111"},
        json={
            "exchange": "binance", "environment": "testnet",
            "api_key": "plaintext-api-key", "api_secret": "plaintext-api-secret",
            "confirm_read_only": True,
            "confirm_withdrawals_disabled": True,
        },
    )
    assert response.status_code == 201, response.text
    assert "plaintext-api-key" not in response.text
    assert "plaintext-api-secret" not in response.text
    db = factory()
    try:
        row = db.query(ExchangeConnection).filter(ExchangeConnection.owner_telegram_id == "11111").one()
        assert row.api_key_encrypted != "plaintext-api-key"
        assert row.api_secret_encrypted != "plaintext-api-secret"
        assert Fernet(key.encode()).decrypt(row.api_key_encrypted.encode()).decode() == "plaintext-api-key"
        assert Fernet(key.encode()).decrypt(row.api_secret_encrypted.encode()).decode() == "plaintext-api-secret"
        assert row.connection_status == "connected"
        assert row.emergency_lock is False
    finally:
        db.close()


def test_binance_account_snapshot_returns_only_nonzero_native_balances(monkeypatch):
    from app import exchange_clients

    class MockResponse:
        def raise_for_status(self):
            return None
        def json(self):
            return {
                "accountType": "SPOT",
                "canTrade": False,
                "balances": [
                    {"asset": "USDT", "free": "100.5", "locked": "2.5"},
                    {"asset": "BTC", "free": "0.01", "locked": "0"},
                    {"asset": "ZERO", "free": "0", "locked": "0"},
                ],
            }

    class MockClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, *args, **kwargs): return MockResponse()

    monkeypatch.setattr(exchange_clients.httpx, "AsyncClient", lambda **kwargs: MockClient())
    snapshot = asyncio.run(exchange_clients.fetch_account_snapshot(
        "binance", "testnet", "example-api-key", "example-api-secret"
    ))
    assert snapshot["exchange"] == "binance"
    assert snapshot["valuation_available"] is False
    assert [row["asset"] for row in snapshot["assets"]] == ["USDT", "BTC"]
    assert snapshot["assets"][0]["total"] == pytest.approx(103.0)


def test_frontend_entrypoint_references_only_existing_local_assets():
    from html.parser import HTMLParser
    from pathlib import Path

    frontend = Path(__file__).resolve().parents[1] / "frontend"
    class AssetParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.refs = []
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            for key in ("src", "href"):
                value = attrs.get(key)
                if value and not value.startswith(("https://", "http://", "data:", "#")):
                    self.refs.append(value.split("?", 1)[0].lstrip("/"))

    parser = AssetParser()
    parser.feed((frontend / "index.html").read_text(encoding="utf-8"))
    missing = [ref for ref in parser.refs if not (frontend / ref).is_file()]
    assert not missing, f"Missing local frontend assets: {missing}"
    html = (frontend / "index.html").read_text(encoding="utf-8")
    assert 'src="mirage-release.js?' in html
    assert 'src="mirage-luxe.js?' in html
    assert (frontend / "mirage-ui-repair.css").is_file()
    assert (frontend / "mirage-avatar-512.png").is_file()
    assert 'src="mirage-brand-nav.js' not in html
    assert 'src="premium-dashboard.js' not in html


def test_exchange_connect_requires_read_only_confirmation(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    verify = AsyncMock()
    monkeypatch.setattr(platform_api, "verify_credentials", verify)
    app = build_platform_test_app(monkeypatch, factory)
    response = TestClient(app).post(
        "/api/platform/exchanges/connect",
        headers={"X-Test-Telegram-ID": "11111"},
        json={
            "exchange": "bybit", "environment": "testnet",
            "api_key": "12345678", "api_secret": "abcdefgh",
            "confirm_withdrawals_disabled": True,
        },
    )
    assert response.status_code == 400
    assert "read-only" in response.json()["detail"].lower()
    verify.assert_not_awaited()


def test_bybit_account_snapshot_uses_exchange_provided_equity(monkeypatch):
    from app import exchange_clients

    class MockResponse:
        def raise_for_status(self): return None
        def json(self):
            return {
                "retCode": 0,
                "result": {"list": [{
                    "totalEquity": "2500.25",
                    "totalWalletBalance": "2490.00",
                    "coin": [
                        {"coin": "USDT", "walletBalance": "2000", "locked": "10", "usdValue": "2000"},
                        {"coin": "BTC", "walletBalance": "0.01", "locked": "0", "usdValue": "490.25"},
                    ],
                }]},
            }

    class MockClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, *args, **kwargs): return MockResponse()

    monkeypatch.setattr(exchange_clients.httpx, "AsyncClient", lambda **kwargs: MockClient())
    snapshot = asyncio.run(exchange_clients.fetch_account_snapshot(
        "bybit", "testnet", "example-api-key", "example-api-secret"
    ))
    assert snapshot["total_equity_usd"] == pytest.approx(2500.25)
    assert snapshot["valuation_available"] is True
    assert len(snapshot["assets"]) == 2
    assert snapshot["assets"][0]["asset"] == "USDT"


def test_paper_worker_retries_signal_for_users_who_missed_first_open(monkeypatch):
    from app import paper_trading
    from types import SimpleNamespace

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        guest_account = db.query(PaperAccount).filter(
            PaperAccount.owner_telegram_id == "22222", PaperAccount.strategy == "scalping"
        ).one()
        guest_account.balance = 2400.0
        signal = Signal(
            symbol="BTCUSDT", timeframe="15m", direction="BUY", grade="A",
            score=90.0, confidence=90.0, entry_price=100.0, stop_loss=95.0,
            take_profit=110.0, strategy="scalping", status="new",
            created_at=datetime.now(timezone.utc),
        )
        db.add(signal)
        db.commit()
        signal_id = signal.id
    finally:
        db.close()

    monkeypatch.setattr(paper_trading, "SessionLocal", factory)
    monkeypatch.setattr(paper_trading, "market_data", SimpleNamespace(get_price=AsyncMock(return_value={"price": 100.0})))
    monkeypatch.setattr(paper_trading, "assess_position", lambda **kwargs: SimpleNamespace(
        allowed=kwargs["equity"] > 2450,
        quantity=0.1,
        reserved_risk=0.5,
        reason="temporary risk block",
    ))
    first_open = asyncio.run(paper_trading.open_paper_positions())
    assert first_open == 1

    db = factory()
    try:
        signal = db.query(Signal).filter(Signal.id == signal_id).one()
        assert signal.status == "paper_opened"
        assert db.query(Position).filter(Position.signal_id == signal_id).count() == 1
    finally:
        db.close()

    monkeypatch.setattr(paper_trading, "assess_position", lambda **kwargs: SimpleNamespace(
        allowed=True, quantity=0.1, reserved_risk=0.5, reason=None,
    ))
    second_open = asyncio.run(paper_trading.open_paper_positions())
    assert second_open == 1

    db = factory()
    try:
        positions = db.query(Position).filter(Position.signal_id == signal_id).all()
        owners = {db.query(PaperAccount).filter(PaperAccount.id == row.account_id).one().owner_telegram_id for row in positions}
        assert len(positions) == 2
        assert owners == {"11111", "22222"}
    finally:
        db.close()


def test_binance_verification_fails_closed_when_withdrawal_permission_is_missing(monkeypatch):
    from app import exchange_clients

    class MockResponse:
        def raise_for_status(self): return None
        def json(self): return {"canTrade": False}

    class MockClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, *args, **kwargs): return MockResponse()

    monkeypatch.setattr(exchange_clients.httpx, "AsyncClient", lambda **kwargs: MockClient())
    with pytest.raises(PermissionError, match="did not explicitly confirm"):
        asyncio.run(exchange_clients.verify_credentials(
            "binance", "testnet", "example-api-key", "example-api-secret"
        ))


def test_signal_delivery_retries_pending_recipients_after_paper_open_without_state_regression(monkeypatch):
    import sys
    import types
    monkeypatch.setitem(sys.modules, "aiogram", types.SimpleNamespace(Bot=object))
    from app import worker
    from app.database import SignalDelivery

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    seed_user(factory, "22222", "user")
    db = factory()
    try:
        signal = Signal(
            symbol="BTCUSDT", timeframe="1h", direction="BUY", grade="A",
            score=90, entry_price=100, stop_loss=95, take_profit=110,
            strategy="intraday", status="paper_opened",
        )
        db.add(signal); db.flush()
        db.add_all([
            SignalDelivery(signal_id=signal.id, telegram_id="11111", status="delivered", attempts=1),
            SignalDelivery(signal_id=signal.id, telegram_id="22222", status="pending", attempts=0),
        ])
        db.commit(); signal_id=signal.id
    finally:
        db.close()

    class FakeBot:
        def __init__(self, token): self.token=token; self.sent=[]
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def send_message(self, **kwargs): self.sent.append(kwargs)

    fake_bot=FakeBot("test-token")
    monkeypatch.setattr(worker, "SessionLocal", factory)
    from datetime import timedelta
    monkeypatch.setattr(worker, "settings", SimpleNamespace(
        bot_token="test-token",
        signal_notifications_enabled=True,
        signal_notifications_start_after=datetime.now(timezone.utc) - timedelta(days=1),
        signal_notifications_max_signals_per_cycle=1,
        signal_notifications_delay_seconds=1.0,
    ))
    monkeypatch.setattr(worker, "Bot", lambda token: fake_bot)
    monkeypatch.setattr(worker, "is_quality_signal_values", lambda *args: True)
    delivered=asyncio.run(worker.deliver_pending_signals())
    assert delivered == 1
    assert len(fake_bot.sent) == 1 and fake_bot.sent[0]["chat_id"] == "22222"
    db=factory()
    try:
        signal=db.query(Signal).filter(Signal.id==signal_id).one()
        rows=db.query(SignalDelivery).filter(SignalDelivery.signal_id==signal_id).all()
        assert signal.status == "paper_opened"
        assert {row.telegram_id: row.status for row in rows} == {"11111":"delivered", "22222":"delivered"}
    finally:
        db.close()


def test_bybit_read_only_verification_does_not_claim_to_know_trading_permissions(monkeypatch):
    from app import exchange_clients

    class MockResponse:
        def raise_for_status(self): return None
        def json(self): return {"retCode": 0, "retMsg": "OK", "result": {"list": []}}

    class MockClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, *args, **kwargs): return MockResponse()

    monkeypatch.setattr(exchange_clients.httpx, "AsyncClient", lambda **kwargs: MockClient())
    result = asyncio.run(exchange_clients.verify_credentials(
        "bybit", "testnet", "example-api-key", "example-api-secret"
    ))
    assert result["can_trade"] is None
    assert result["withdrawal_access_detected"] is None
    assert result["withdrawal_check"] == "manual_required"


def test_phantom_user_lock_blocks_even_read_only_exchange_account_snapshot(monkeypatch):
    from app import platform_api

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        user = db.query(User).filter(User.telegram_id == "11111").one()
        user.phantom_locked = True
        connection = ExchangeConnection(
            owner_telegram_id="11111", exchange="binance", environment="testnet",
            api_key_encrypted="cipher-key", api_secret_encrypted="cipher-secret",
            connection_status="connected", emergency_lock=False,
        )
        db.add(connection); db.commit(); connection_id=connection.id
    finally:
        db.close()
    decrypt = lambda value: (_ for _ in ()).throw(AssertionError("must not decrypt under Phantom"))
    fetch = AsyncMock()
    monkeypatch.setattr(platform_api, "decrypt_secret", decrypt)
    monkeypatch.setattr(platform_api, "fetch_account_snapshot", fetch)
    app = build_platform_test_app(monkeypatch, factory)
    response = TestClient(app).get(
        f"/api/platform/exchanges/{connection_id}/account",
        headers={"X-Test-Telegram-ID": "11111"},
    )
    assert response.status_code == 423
    fetch.assert_not_awaited()


def test_signal_delivery_skips_fully_delivered_and_exhausted_signals(monkeypatch):
    import sys
    import types
    monkeypatch.setitem(sys.modules, "aiogram", types.SimpleNamespace(Bot=object))
    from app import worker
    from app.database import SignalDelivery

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        done = Signal(symbol="BTCUSDT", timeframe="1h", direction="BUY", grade="A", score=90, strategy="intraday", status="sent")
        failed = Signal(symbol="ETHUSDT", timeframe="1h", direction="BUY", grade="A", score=90, strategy="intraday", status="new")
        db.add_all([done, failed]); db.flush()
        db.add_all([
            SignalDelivery(signal_id=done.id, telegram_id="11111", status="delivered", attempts=1),
            SignalDelivery(signal_id=failed.id, telegram_id="11111", status="failed", attempts=5),
        ])
        db.commit()
    finally:
        db.close()

    class FakeBot:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def send_message(self, **kwargs): raise AssertionError("no completed delivery should be sent again")

    monkeypatch.setattr(worker, "SessionLocal", factory)
    monkeypatch.setattr(worker, "settings", SimpleNamespace(bot_token="test-token"))
    monkeypatch.setattr(worker, "Bot", lambda token: FakeBot())
    monkeypatch.setattr(worker, "is_quality_signal_values", lambda *args: True)
    assert asyncio.run(worker.deliver_pending_signals()) == 0


def test_telegram_signal_delivery_fails_closed_when_notifications_disabled(monkeypatch):
    from app import worker

    monkeypatch.setattr(worker, "settings", SimpleNamespace(
        bot_token="test-token",
        signal_notifications_enabled=False,
        signal_notifications_start_after=None,
    ))
    monkeypatch.setattr(worker, "SessionLocal", lambda: pytest.fail("DB must not be queried when notifications are off"))
    assert asyncio.run(worker.deliver_pending_signals()) == 0


def test_telegram_queue_only_accepts_new_signals_after_explicit_cutoff(monkeypatch):
    from datetime import timedelta
    from app import worker
    from app.database import SignalDelivery

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        db.add(User(telegram_id="22222", role="user", is_active=False, ui_mode="stealth", trading_mode="paper"))
        db.commit()
        cutoff = datetime(2026, 11, 13, 19, 0, tzinfo=timezone.utc)
        monkeypatch.setattr(worker, "settings", SimpleNamespace(
            bot_token="test-token",
            signal_notifications_enabled=True,
            signal_notifications_start_after=cutoff,
        ))

        old_signal = Signal(
            symbol="BTCUSDT", timeframe="15m", direction="BUY", grade="A",
            score=90, status="new", created_at=cutoff - timedelta(minutes=5),
        )
        db.add(old_signal)
        db.flush()
        assert worker.enqueue_signal_deliveries(db, old_signal) == 0

        new_signal = Signal(
            symbol="ETHUSDT", timeframe="1h", direction="BUY", grade="A",
            score=90, status="new", created_at=cutoff + timedelta(seconds=1),
        )
        db.add(new_signal)
        db.flush()
        assert worker.enqueue_signal_deliveries(db, new_signal) == 1
        db.commit()

        queued = db.query(SignalDelivery).filter(SignalDelivery.signal_id == new_signal.id).all()
        assert len(queued) == 1
        assert queued[0].telegram_id == "11111"
        assert queued[0].status == "pending"
        assert db.query(SignalDelivery).filter(SignalDelivery.signal_id == old_signal.id).count() == 0
    finally:
        db.close()


def test_telegram_notifications_require_both_enable_flag_and_cutoff(monkeypatch):
    from app import worker

    monkeypatch.setattr(worker, "settings", SimpleNamespace(
        bot_token="test-token",
        signal_notifications_enabled=True,
        signal_notifications_start_after=None,
    ))
    assert worker.notifications_are_armed() is False


def test_portfolio_api_returns_aggregate_equity_pnl_and_open_positions(monkeypatch):
    from app import main

    _, factory = make_db()
    seed_user(factory, "11111", "owner")
    db = factory()
    try:
        account = db.query(PaperAccount).filter(
            PaperAccount.owner_telegram_id == "11111",
            PaperAccount.strategy == "scalping",
        ).one()
        account.balance = 2510.0
        db.add(Position(
            account_id=account.id, symbol="BTCUSDT", direction="BUY",
            entry_price=100.0, current_price=105.0, stop_loss=95.0,
            take_profit=110.0, quantity=1.0, unrealized_pnl=5.0, status="open",
        ))
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(main, "SessionLocal", factory)
    main.app.dependency_overrides[main.require_user] = lambda: {"id": "11111"}
    try:
        response = TestClient(main.app).get("/api/portfolio")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["initial_capital"] == pytest.approx(10000.0)
        assert body["equity"] == pytest.approx(10015.0)
        assert body["total_pnl"] == pytest.approx(15.0)
        assert len(body["accounts"]) == 4
        assert len(body["positions"]) == 1
    finally:
        main.app.dependency_overrides.pop(main.require_user, None)
