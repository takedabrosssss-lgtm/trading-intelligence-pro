from types import SimpleNamespace
from sqlalchemy import create_engine, text

from app import migrations


def test_futures_migration_preserves_spot_history_and_balance(monkeypatch, tmp_path):
    db_path = tmp_path / "legacy.sqlite"
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, telegram_id VARCHAR(32), is_active BOOLEAN)"))
        conn.execute(text("CREATE TABLE paper_accounts (id INTEGER PRIMARY KEY, name VARCHAR(100), strategy VARCHAR(50), balance FLOAT, initial_balance FLOAT, max_drawdown FLOAT, is_active BOOLEAN, UNIQUE(name))"))
        conn.execute(text("CREATE TABLE positions (id INTEGER PRIMARY KEY, account_id INTEGER, symbol VARCHAR(30), direction VARCHAR(10), entry_price FLOAT, quantity FLOAT, status VARCHAR(20))"))
        conn.execute(text("CREATE TABLE trades (id INTEGER PRIMARY KEY, account_id INTEGER, position_id INTEGER, symbol VARCHAR(30), direction VARCHAR(10), net_pnl FLOAT)"))
        conn.execute(text("INSERT INTO users (id, telegram_id, is_active) VALUES (1, '12345', 1)"))
        conn.execute(text("INSERT INTO paper_accounts (id, name, strategy, balance, initial_balance, max_drawdown, is_active) VALUES (1, 'Scalping', 'scalping', 2711.25, 2500, 0.1, 1)"))
        conn.execute(text("INSERT INTO positions (id, account_id, symbol, direction, entry_price, quantity, status) VALUES (1, 1, 'BTCUSDT', 'BUY', 100, 1, 'open')"))
        conn.execute(text("INSERT INTO trades (id, account_id, position_id, symbol, direction, net_pnl) VALUES (1, 1, 1, 'BTCUSDT', 'BUY', 211.25)"))

    monkeypatch.setattr(migrations, "engine", engine)
    monkeypatch.setattr(migrations, "settings", SimpleNamespace(owner_telegram_id="12345"))
    migrations.prepare_legacy_schema()

    with engine.connect() as conn:
        account = conn.execute(text("SELECT balance FROM paper_accounts WHERE id=1")).scalar_one()
        position = conn.execute(text("SELECT market_type, leverage FROM positions WHERE id=1")).one()
        trade = conn.execute(text("SELECT market_type, leverage FROM trades WHERE id=1")).one()
        owner = conn.execute(text("SELECT owner_telegram_id FROM paper_accounts WHERE id=1")).scalar_one()
    assert account == 2711.25
    assert owner == "12345"
    assert tuple(position) == ("spot", 1.0)
    assert tuple(trade) == ("spot", 1.0)
    engine.dispose()
