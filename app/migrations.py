"""Idempotent schema preparation. Existing balances/history are not reset."""
from __future__ import annotations

import logging
from sqlalchemy import inspect, text
from app.config import settings
from app.database import engine

logger = logging.getLogger("mirage.migrations")


def _add_missing_columns(connection, table: str, definitions: dict[str, str]) -> None:
    inspector = inspect(connection)
    if table not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns(table)}
    for name, definition in definitions.items():
        if name not in existing:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))


def prepare_legacy_schema() -> None:
    inspector = inspect(engine)
    if not inspector.get_table_names():
        logger.info("Empty database: create_all will create current schema")
        return

    dialect = engine.dialect.name
    with engine.begin() as connection:
        _add_missing_columns(connection, "users", {
            "role": "VARCHAR(20) NOT NULL DEFAULT 'user'",
            "invited_by": "VARCHAR(32)",
            "ui_mode": "VARCHAR(20) NOT NULL DEFAULT 'stealth'",
            "trading_mode": "VARCHAR(20) NOT NULL DEFAULT 'paper'",
            "phantom_locked": "BOOLEAN NOT NULL DEFAULT FALSE",
        })
        _add_missing_columns(connection, "paper_accounts", {
            "owner_telegram_id": "VARCHAR(32) NOT NULL DEFAULT ''",
        })

        current = set(inspect(connection).get_table_names())
        if "paper_accounts" in current:
            owner_id = (settings.owner_telegram_id or "").strip()
            if owner_id:
                connection.execute(text(
                    "UPDATE paper_accounts SET owner_telegram_id = :owner "
                    "WHERE owner_telegram_id = '' OR owner_telegram_id IS NULL"
                ), {"owner": owner_id})
            else:
                unassigned = connection.execute(text(
                    "SELECT COUNT(*) FROM paper_accounts WHERE owner_telegram_id = '' OR owner_telegram_id IS NULL"
                )).scalar_one()
                if unassigned:
                    raise RuntimeError(
                        "Set OWNER_TELEGRAM_ID before startup: legacy Paper accounts need an owner."
                    )

        # All existing rows are explicitly classified as Spot; they are never
        # converted to Futures and their balances/PnL/history are untouched.
        _add_missing_columns(connection, "positions", {
            "market_type": "VARCHAR(30) NOT NULL DEFAULT 'spot'",
            "leverage": "DOUBLE PRECISION NOT NULL DEFAULT 1.0" if dialect == "postgresql" else "FLOAT NOT NULL DEFAULT 1.0",
            "margin_used": "DOUBLE PRECISION NOT NULL DEFAULT 0.0" if dialect == "postgresql" else "FLOAT NOT NULL DEFAULT 0.0",
            "liquidation_price": "DOUBLE PRECISION" if dialect == "postgresql" else "FLOAT",
            "entry_fee": "DOUBLE PRECISION NOT NULL DEFAULT 0.0" if dialect == "postgresql" else "FLOAT NOT NULL DEFAULT 0.0",
            "funding_pnl": "DOUBLE PRECISION NOT NULL DEFAULT 0.0" if dialect == "postgresql" else "FLOAT NOT NULL DEFAULT 0.0",
            "last_funding_time": "TIMESTAMP WITH TIME ZONE" if dialect == "postgresql" else "DATETIME",
            "last_mark_check_at": "TIMESTAMP WITH TIME ZONE" if dialect == "postgresql" else "DATETIME",
        })
        _add_missing_columns(connection, "trades", {
            "market_type": "VARCHAR(30) NOT NULL DEFAULT 'spot'",
            "leverage": "DOUBLE PRECISION NOT NULL DEFAULT 1.0" if dialect == "postgresql" else "FLOAT NOT NULL DEFAULT 1.0",
            "funding_pnl": "DOUBLE PRECISION NOT NULL DEFAULT 0.0" if dialect == "postgresql" else "FLOAT NOT NULL DEFAULT 0.0",
        })

        if "paper_accounts" in current:
            if dialect == "postgresql":
                for constraint in inspect(connection).get_unique_constraints("paper_accounts"):
                    if constraint.get("column_names") == ["name"] and constraint.get("name"):
                        name = constraint["name"].replace('"', '""')
                        connection.execute(text(f'ALTER TABLE paper_accounts DROP CONSTRAINT IF EXISTS "{name}"'))
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_accounts_owner_strategy "
                    "ON paper_accounts (owner_telegram_id, strategy)"
                ))
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_paper_accounts_owner ON paper_accounts (owner_telegram_id)"
                ))
            elif dialect == "sqlite":
                connection.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_paper_accounts_owner ON paper_accounts (owner_telegram_id)"
                ))
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_accounts_owner_strategy "
                    "ON paper_accounts (owner_telegram_id, strategy)"
                ))

    logger.info("MIRAGE Futures-compatible schema preparation complete (%s)", dialect)
